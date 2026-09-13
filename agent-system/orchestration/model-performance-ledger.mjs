// Model/pair performance ledger (DEC-032 §26, §64, §67, §99).
//
// The integrity rule is the whole point: a worker saying it succeeded is not
// evidence that it did. Every update must name a trusted outcome source, and
// a self-report is rejected rather than down-weighted — down-weighting still
// lets a confident worker move its own score.
import { DEFAULT_CONTROL_HOME, appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';
import { DEFAULT_REPO_DIR, hashObject, loadRoutingRegistries, nowIso } from './adaptive-routing-core.mjs';
import { attributeOutcome, buildVeklImprovementSignal } from './outcome-attribution.mjs';

const REL = 'execution/routing/performance-ledger.json';

function emptyLedger() {
  return { schema_version: 1, entries: {}, updated_at: null };
}

export function loadPerformanceLedger(root = DEFAULT_CONTROL_HOME) {
  return readJson(REL, emptyLedger(), root);
}

function entryKey({ harnessId, modelId, taskArchetype = null, role = null, riskClass = null }) {
  return [harnessId, modelId, taskArchetype ?? '*', role ?? '*', riskClass ?? '*'].join('|');
}

/**
 * Records one outcome.
 *
 * `evidenceSource` must be one of the registry's trusted sources. A worker
 * self-report throws rather than returning a soft failure, because a caller
 * that ignores a soft failure silently corrupts routing.
 */
export function recordExecutionOutcome({
  repoDir = DEFAULT_REPO_DIR,
  root = DEFAULT_CONTROL_HOME,
  registries = null,
  harnessId,
  modelId,
  taskArchetype = null,
  role = null,
  riskClass = null,
  accepted,
  firstPassAccepted = false,
  evidenceSource,
  evidenceHash = null,
  confidence = 'HIGH',
  tokens = 0,
  latencyMs = 0,
  reworkRatio = 0,
  retries = 0,
  escapedDefect = false,
  incidents = {},
  ownerOverride = false,
  signals = [],
  attribution = null,
  taskId = null,
  promptManifestHash = null,
  modelProfileHash = null,
} = {}) {
  const reg = registries || loadRoutingRegistries(repoDir);
  const ledgerPolicy = reg.ledger;

  if (!harnessId || !modelId) throw new Error('LEDGER_PAIR_REQUIRED');
  if ((ledgerPolicy.inadmissible_sources || []).includes(evidenceSource)) {
    throw new Error(`LEDGER_INADMISSIBLE_EVIDENCE_SOURCE:${evidenceSource}`);
  }
  if (!(ledgerPolicy.trusted_evidence_sources || []).includes(evidenceSource)) {
    throw new Error(`LEDGER_UNTRUSTED_EVIDENCE_SOURCE:${evidenceSource ?? 'MISSING'}`);
  }

  const ledger = loadPerformanceLedger(root);
  const key = entryKey({ harnessId, modelId, taskArchetype, role, riskClass });
  const prev = ledger.entries[key] || {
    harness_id: harnessId, model_id: modelId, task_archetype: taskArchetype, role, risk_class: riskClass,
    sample_count: 0, final_accept_count: 0, first_pass_accept_count: 0, escaped_defect_count: 0,
    total_tokens: 0, total_latency_ms: 0, total_rework_ratio: 0, total_retries: 0,
    wrong_target_incidents: 0, speculative_repair_incidents: 0, premature_success_incidents: 0, postcondition_failures: 0,
    excluded_samples: 0, excluded_by_attribution: {},
  };

  // Attribution decides whether this outcome may move the rating at all.
  //
  // A pair that did badly because the resources it was given were inadequate
  // has not underperformed — the resources have. Counting that against the pair
  // would poison the ledger and misroute work away from a model that was never
  // the problem, so the rating is left alone and a VEKL improvement signal is
  // raised instead. Owner ruling, 2026-09-13.
  const attributed = attribution || attributeOutcome({ signals, accepted });

  // §74: overridden runs are recorded for audit but excluded from scores, so
  // an owner forcing a model neither rewards nor punishes it in the ledger.
  const excluded = ownerOverride === true
    || evidenceSource === 'OWNER_OVERRIDE'
    || attributed.rating_bearing !== true;

  const next = { ...prev };
  if (excluded) {
    next.excluded_samples += 1;
    next.excluded_by_attribution = { ...(prev.excluded_by_attribution || {}) };
    const bucket = attributed.attribution;
    next.excluded_by_attribution[bucket] = Number(next.excluded_by_attribution[bucket] || 0) + 1;
  } else {
    next.sample_count += 1;
    if (accepted) next.final_accept_count += 1;
    if (firstPassAccepted) next.first_pass_accept_count += 1;
    if (escapedDefect) next.escaped_defect_count += 1;
    next.total_tokens += Number(tokens || 0);
    next.total_latency_ms += Number(latencyMs || 0);
    next.total_rework_ratio += Number(reworkRatio || 0);
    next.total_retries += Number(retries || 0);
    next.wrong_target_incidents += Number(incidents.wrong_target || 0);
    next.speculative_repair_incidents += Number(incidents.speculative_repair || 0);
    next.premature_success_incidents += Number(incidents.premature_success || 0);
    next.postcondition_failures += Number(incidents.postcondition_failure || 0);
  }

  const n = Math.max(1, next.sample_count);
  next.final_accept_rate = next.final_accept_count / n;
  next.first_pass_accept_rate = next.first_pass_accept_count / n;
  next.escaped_defect_rate = next.escaped_defect_count / n;
  next.median_total_tokens = Math.round(next.total_tokens / n);
  next.p95_latency_ms = Math.round(next.total_latency_ms / n);
  next.median_rework_ratio = next.total_rework_ratio / n;
  next.last_evidence_source = evidenceSource;
  next.last_evidence_hash = evidenceHash;
  next.last_confidence = confidence;
  next.updated_at = nowIso();

  next.last_attribution = attributed.attribution;
  ledger.entries[key] = next;
  ledger.updated_at = nowIso();
  writeJsonAtomic(REL, ledger, root);

  // The other half of the rule: when the resources were at fault, VEKL is what
  // gets updated. The signal names the task shape and the specific deficit, so
  // the knowledge and behaviour layers have something concrete to fix.
  const veklSignal = buildVeklImprovementSignal({
    taskId, harnessId, modelId, taskArchetype, role, riskClass,
    attribution: attributed, promptManifestHash, modelProfileHash,
  });
  if (veklSignal) {
    writeJsonAtomic(`execution/routing/vekl-improvement/${veklSignal.signal_hash}.json`, veklSignal, root);
    appendJsonl('events/vekl-improvement.jsonl', {
      event: 'VEKL_IMPROVEMENT_SIGNAL_RAISED',
      pair: veklSignal.pair,
      task_archetype: taskArchetype,
      deficits: veklSignal.deficits,
      rating_impact: 'NONE',
      at: nowIso(),
    }, root);
  }

  appendJsonl('events/adaptive-routing.jsonl', {
    event: excluded ? 'PERFORMANCE_SAMPLE_EXCLUDED' : 'PERFORMANCE_SAMPLE_RECORDED',
    pair: `${harnessId}+${modelId}`,
    attribution: attributed.attribution,
    evidence_source: evidenceSource,
    accepted: Boolean(accepted),
    first_pass: Boolean(firstPassAccepted),
    at: nowIso(),
  }, root);

  return { key, entry: next, excluded, attribution: attributed, vekl_signal: veklSignal };
}

/**
 * The calibrated prior: what an arbitrary capable pair actually accepts at.
 *
 * This replaces a hand-set constant with a number derived from DIAL's own
 * outcomes, and it is the whole reason the comparison means anything. Ranking a
 * pair "below an unknown" is only informative if the unknown is pegged to
 * reality; against a guess it says nothing.
 *
 * Per-archetype once an archetype has enough of its own evidence, global
 * otherwise, seeded until either has enough. Only rating-bearing samples count,
 * so resource-caused failures cannot drag the population mean down either.
 */
export function calibratedPrior({
  entries = [],
  seed = 0.75,
  minGlobalSamples = 30,
  minArchetypeSamples = 30,
  taskArchetype = null,
} = {}) {
  const pooled = (rows) => {
    const n = rows.reduce((s, e) => s + Number(e.sample_count || 0), 0);
    const a = rows.reduce((s, e) => s + Number(e.final_accept_count || 0), 0);
    return { n, rate: n > 0 ? a / n : null };
  };

  if (taskArchetype) {
    const scoped = pooled(entries.filter((e) => e.task_archetype === taskArchetype));
    if (scoped.n >= minArchetypeSamples && scoped.rate !== null) {
      return { value: scoped.rate, basis: 'ARCHETYPE_CALIBRATED', samples: scoped.n, task_archetype: taskArchetype };
    }
  }
  const global = pooled(entries);
  if (global.n >= minGlobalSamples && global.rate !== null) {
    return { value: global.rate, basis: 'GLOBAL_CALIBRATED', samples: global.n };
  }
  return { value: seed, basis: 'SEED', samples: global.n };
}

/**
 * The smoothing weight, learned rather than set.
 *
 * The weight is the strength of the prior — how many observations it is worth.
 * Empirical Bayes says that is not a taste question: it is readable from how
 * much the pairs actually differ from each other.
 *
 *   pairs perform alike  → differences are mostly noise → shrink hard  → high w
 *   pairs differ a lot   → differences are real         → trust records → low w
 *
 * Method of moments on a Beta prior. For Beta with mean m and concentration w,
 * Var = m(1-m)/(w+1), so w = m(1-m)/Var - 1. The variance observed ACROSS pairs
 * also contains each pair's own binomial sampling noise, so that is subtracted
 * first — otherwise a fleet measured on small samples would look far more
 * varied than it is and the weight would collapse.
 *
 * This is what removes the standing "revisit when you have numbers" caveat:
 * having the numbers is the trigger, and DIAL reads them itself.
 *
 * The bounds are guards against a pathological estimate from thin data, not
 * taste. Read them as "jobs before a pair's own record carries half its score",
 * which is exactly what w means:
 *   min 6  — two bad runs must not halve a pair's standing.
 *   max 30 — past this the ledger would be decorative at DIAL's job volume.
 * A clamped estimate is flagged, so it is visible when the data is too thin to
 * speak for itself.
 */
export function calibratedSmoothingWeight({
  entries = [],
  seed = 12,
  minPairs = 3,
  minSamplesPerPair = 5,
  min = 6,
  max = 30,
} = {}) {
  const usable = entries.filter((e) => Number(e.sample_count || 0) >= minSamplesPerPair);
  if (usable.length < minPairs) {
    return { value: seed, basis: 'SEED', pairs: usable.length };
  }

  const rates = usable.map((e) => Number(e.final_accept_count || 0) / Number(e.sample_count));
  const totalN = usable.reduce((s, e) => s + Number(e.sample_count), 0);
  const totalA = usable.reduce((s, e) => s + Number(e.final_accept_count || 0), 0);
  const m = totalA / totalN;
  if (!(m > 0 && m < 1)) return { value: max, basis: 'DEGENERATE_MEAN', pairs: usable.length };

  const observedVar = rates.reduce((s, r) => s + (r - m) ** 2, 0) / rates.length;
  const samplingVar = usable.reduce(
    (s, e, i) => s + (rates[i] * (1 - rates[i])) / Number(e.sample_count), 0,
  ) / usable.length;
  const betweenVar = observedVar - samplingVar;

  // No detectable spread beyond sampling noise: the pairs look alike, so the
  // prior is strong and individual records should move a score only slowly.
  if (!(betweenVar > 0)) {
    return { value: max, basis: 'NO_DETECTABLE_SPREAD', pairs: usable.length, observed_variance: observedVar };
  }

  const raw = (m * (1 - m)) / betweenVar - 1;
  const clamped = Math.min(max, Math.max(min, raw));
  return {
    value: Number(clamped.toFixed(2)),
    basis: 'EMPIRICAL_BAYES',
    pairs: usable.length,
    pooled_mean: Number(m.toFixed(4)),
    between_pair_variance: Number(betweenVar.toFixed(6)),
    raw: Number(raw.toFixed(2)),
    clamped: raw !== clamped,
  };
}

/** Flattens the control-home ledger into the shape the router reads. */
export function projectLedgerForRouting({ root = DEFAULT_CONTROL_HOME } = {}) {
  const ledger = loadPerformanceLedger(root);
  return Object.values(ledger.entries || {}).map((e) => ({ ...e }));
}

/**
 * Skill pruning (§95). A resource with meaningful activation and negligible
 * benefit should be deprecated. "More selective over time, not only larger."
 */
export function evaluateSkillRetention({
  activationCount = 0, minActivations = 20,
  baseline = {}, withSkill = {},
} = {}) {
  if (activationCount < minActivations) {
    return { decision: 'KEEP_EVALUATING', reason: 'INSUFFICIENT_ACTIVATIONS', activation_count: activationCount };
  }
  const acceptDelta = Number(withSkill.final_accept_rate ?? 0) - Number(baseline.final_accept_rate ?? 0);
  const firstPassDelta = Number(withSkill.first_pass_accept_rate ?? 0) - Number(baseline.first_pass_accept_rate ?? 0);
  const tokenDelta = Number(withSkill.median_total_tokens ?? 0) - Number(baseline.median_total_tokens ?? 0);
  const reworkDelta = Number(withSkill.median_rework_ratio ?? 0) - Number(baseline.median_rework_ratio ?? 0);

  if (acceptDelta < -0.01 || reworkDelta > 0.05) {
    return { decision: 'BLOCK', reason: 'QUALITY_REGRESSION', accept_delta: acceptDelta, rework_delta: reworkDelta };
  }
  if (tokenDelta > 0 && acceptDelta <= 0.005 && firstPassDelta <= 0.005) {
    return { decision: 'DEPRECATE', reason: 'TOKENS_UP_QUALITY_UNCHANGED', token_delta: tokenDelta, accept_delta: acceptDelta };
  }
  if (acceptDelta > 0.01 || firstPassDelta > 0.01 || (tokenDelta < 0 && acceptDelta >= 0)) {
    return { decision: 'PROMOTE', reason: 'MEASURED_IMPROVEMENT', accept_delta: acceptDelta, first_pass_delta: firstPassDelta, token_delta: tokenDelta };
  }
  return { decision: 'KEEP_EVALUATING', reason: 'NO_SIGNIFICANT_SIGNAL' };
}
