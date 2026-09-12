// Model/pair performance ledger (DEC-032 §26, §64, §67, §99).
//
// The integrity rule is the whole point: a worker saying it succeeded is not
// evidence that it did. Every update must name a trusted outcome source, and
// a self-report is rejected rather than down-weighted — down-weighting still
// lets a confident worker move its own score.
import { DEFAULT_CONTROL_HOME, appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';
import { DEFAULT_REPO_DIR, hashObject, loadRoutingRegistries, nowIso } from './adaptive-routing-core.mjs';

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
    excluded_samples: 0,
  };

  // §74: overridden runs are recorded for audit but excluded from scores, so
  // an owner forcing a model neither rewards nor punishes it in the ledger.
  const excluded = ownerOverride === true || evidenceSource === 'OWNER_OVERRIDE';

  const next = { ...prev };
  if (excluded) {
    next.excluded_samples += 1;
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

  ledger.entries[key] = next;
  ledger.updated_at = nowIso();
  writeJsonAtomic(REL, ledger, root);

  appendJsonl('events/adaptive-routing.jsonl', {
    event: excluded ? 'PERFORMANCE_SAMPLE_EXCLUDED' : 'PERFORMANCE_SAMPLE_RECORDED',
    pair: `${harnessId}+${modelId}`,
    evidence_source: evidenceSource,
    accepted: Boolean(accepted),
    first_pass: Boolean(firstPassAccepted),
    at: nowIso(),
  }, root);

  return { key, entry: next, excluded };
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
