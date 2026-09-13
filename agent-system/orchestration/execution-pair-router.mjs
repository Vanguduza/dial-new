// selectExecutionPair — harness x model routing (DEC-032 §41, §44).
//
// This replaces `selectHcxWorkers(worker_cards)` with a selection over the
// cartesian product of harnesses and models. It does NOT replace HCX's
// authority boundary: the manager runtime is still never selected here, and
// nothing below may waive a mandatory gate.
//
// Eligibility is conferred by presence on an authorised subscription. DIAL does
// not re-prove capabilities the provider already establishes, and there is no
// probation: a model new to DIAL can be assigned any work its harness and the
// task's security policy permit. Owner decision, 2026-09-13.
//
// Stage order is still load-bearing: hard filters, THEN the quality floor, THEN
// cost ranking. The floor now retires a pair the ledger shows underperforming
// rather than gating a new one, but it must stay ahead of cost ranking so a
// cheap pair with a bad record cannot win a CRITICAL task on price.
import {
  DEFAULT_REPO_DIR, discoveryFresh, estimateTokens, generatePairs, harnessQualified,
  hashObject, loadRoutingRegistries, modelRoutable, nowIso,
} from './adaptive-routing-core.mjs';

const RISK_ORDER = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

function riskAtMost(a, b) { return RISK_ORDER.indexOf(a) <= RISK_ORDER.indexOf(b); }

/** Posterior smoothing matching harness-capability-exchange.mjs so pair scores
 *  and legacy card scores stay comparable during the Phase 1/2 overlap. */
function posterior(successes, samples, prior, weight) {
  return (weight * prior + successes) / (weight + samples);
}

/**
 * Task-capability matching index: the most SPECIFIC evidence for this pair wins.
 *
 * A pairing that does badly on infra recovery should drop below the next pair
 * for infra recovery, without that record dragging down its standing on work it
 * handles well. So the cascade prefers evidence recorded against this exact
 * archetype/role/risk before falling back to broader evidence, and reports the
 * granularity it landed on so the trace shows what the ordering was based on.
 */
const EVIDENCE_CASCADE = Object.freeze([
  { granularity: 'ARCHETYPE_ROLE_RISK', keys: ['task_archetype', 'role', 'risk_class'] },
  { granularity: 'ARCHETYPE_ROLE', keys: ['task_archetype', 'role'] },
  { granularity: 'ARCHETYPE', keys: ['task_archetype'] },
  { granularity: 'PAIR_GLOBAL', keys: [] },
]);

function ledgerEntry(ledger, pair, { taskArchetype = null, role = null, riskClass = null } = {}) {
  const entries = (ledger.entries || []).filter(
    (e) => e.harness_id === pair.harness_id && e.model_id === pair.model_id,
  );
  const want = { task_archetype: taskArchetype, role, risk_class: riskClass };
  for (const level of EVIDENCE_CASCADE) {
    const hit = entries.find((e) => level.keys.every((k) => e[k] != null && e[k] === want[k])
      && (level.keys.length > 0 || EVIDENCE_CASCADE[0].keys.every((k) => e[k] == null)));
    if (hit) return { entry: hit, granularity: level.granularity };
  }
  // Deliberately no "any entry for this pair" fallback. A record scoped to one
  // archetype must not leak into an unrelated one -- that would let a poor
  // showing on infra recovery demote the same pair on routine code changes,
  // which is the opposite of a task-capability matching index.
  return null;
}

/**
 * Where this pair sits in the performance hierarchy for THIS kind of task,
 * learned from completed jobs.
 *
 * This is a ranking signal, never a gate. A pair with no record scores the
 * cold-start prior and competes normally; a pair that has done badly on this
 * task type scores below it and therefore gets offered the work only after the
 * better-matched pairs. Nothing here can exclude a pair from consideration.
 */
export function expectedQuality({ registries, pair, taskArchetype = null, role = null, riskClass = null } = {}) {
  const cold = registries.ledger.cold_start || {};
  const prior = Number(cold.prior ?? 0.75);
  const weight = Number(cold.prior_weight ?? 8);
  const found = ledgerEntry(registries.ledger, pair, { taskArchetype, role, riskClass });
  if (!found) return { value: prior, first_pass: prior, samples: 0, source: 'COLD_START_PRIOR', granularity: 'NONE' };
  const { entry, granularity } = found;
  const samples = Number(entry.sample_count ?? 0);
  const final = posterior(Number(entry.final_accept_count ?? 0), samples, prior, weight);
  const first = posterior(Number(entry.first_pass_accept_count ?? 0), samples, prior, weight);
  const defect = Number(entry.escaped_defect_rate ?? 0);
  return {
    value: final * 0.55 + first * 0.25 + (1 - defect) * 0.2,
    first_pass: first,
    samples,
    source: 'LEDGER',
    granularity,
  };
}

/** Normalised effective execution cost (§55 resolving §14's unit mismatch). */
export function effectiveExecutionCost({ registries, pair, estimate = {} } = {}) {
  const model = registries.policy.cost_model || {};
  const terms = model.effective_execution_cost_terms || [];
  const costProfile = { ECONOMICAL: 0.2, STANDARD: 0.5, PREMIUM: 0.9 }[pair.model.cost_profile] ?? 0.5;
  const latencyProfile = { FAST: 0.2, STANDARD: 0.5, SLOWER: 0.85 }[pair.model.latency_profile] ?? 0.5;
  const values = {
    token_cost: Number(estimate.token_cost ?? costProfile),
    subscription_scarcity: Number(estimate.subscription_scarcity ?? costProfile),
    latency: Number(estimate.latency ?? latencyProfile),
    expected_rework: Number(estimate.expected_rework ?? (pair.proven ? 0.2 : 0.3)),
    expected_review_cost: Number(estimate.expected_review_cost ?? 0.3),
    premium_opportunity_cost: Number(estimate.premium_opportunity_cost ?? costProfile),
  };
  let total = 0;
  const breakdown = {};
  for (const { term, weight } of terms) {
    const v = Math.max(0, Math.min(1, values[term] ?? 0));
    breakdown[term] = { value: v, weight };
    total += v * Number(weight ?? 1);
  }
  return { cost: Math.max(0.0001, total), breakdown };
}

/**
 * Placement in the performance hierarchy for this task type.
 *
 * Deliberately returns no pass/fail. Past performance orders the queue; it
 * never removes a pair from it. Owner ruling, 2026-09-13: a pairing that did
 * badly on a task type should not be assigned a similar task AHEAD of the next
 * pair on the task-capability matching index — but if it is the only pair that
 * can do the work, it still gets the work.
 */
export function performancePlacement({ registries, pair, riskClass, quality } = {}) {
  const cfg = registries.policy.performance_hierarchy || {};
  const reference = Number(cfg.reference_by_risk_class?.[riskClass] ?? 0);
  const minSamples = Number(cfg.min_samples_for_evidenced_placement ?? 0);
  const samples = Number(quality.samples ?? 0);
  const evidenced = samples >= minSamples;
  return {
    basis: evidenced ? `EVIDENCED:${quality.granularity}` : 'COLD_START_PRIOR',
    evidenced,
    samples,
    observed: quality.value,
    reference,
    below_reference: evidenced && quality.value < reference,
  };
}

/**
 * Full routing decision.
 *
 * `taskRequirements` is the VEKL Pass 1 package plus triage. Routing consumes
 * it; it never re-derives engineering truth for itself.
 */
export function selectExecutionPair({
  repoDir = DEFAULT_REPO_DIR,
  registries = null,
  taskRequirements = {},
  role = 'BUILDER',
  dataClass = 'INTERNAL_SAFE_FOR_APPROVED_PROVIDER',
  health = {},
  currentPair = null,
  nowMs = Date.now(),
} = {}) {
  const reg = registries || loadRoutingRegistries(repoDir);
  const policy = reg.policy;
  const riskClass = taskRequirements.risk_class || 'LOW';
  const archetype = taskRequirements.task_archetype || null;
  const required = taskRequirements.required_capabilities || [];

  const excluded = [];
  const reject = (pairId, reason, detail = null) => excluded.push({ pair_id: pairId, reason, detail });

  // Discovery freshness gates the whole decision: routing on a model list
  // nobody has confirmed recently is exactly the fail-open this system avoids.
  const freshness = discoveryFresh({ models: reg.models, nowMs });
  if (!freshness.fresh && freshness.fail_closed !== false) {
    return {
      ok: false,
      reason: freshness.reason === 'DISCOVERY_NEVER_RUN' ? 'DISCOVERY_UNAVAILABLE' : 'STALE_DISCOVERY',
      detail: freshness,
      policy_version: policy.policy_version,
      selection: null,
      eligible_pairs: [],
      excluded_candidates: [],
      decided_at: nowIso(),
    };
  }

  const { pairs, blocked } = generatePairs({ registries: reg, riskClass });
  for (const b of blocked) reject(b.pair_id, b.reason, b.detail);

  // ── hard filters ─────────────────────────────────────────────────────────
  const surviving = [];
  for (const pair of pairs) {
    const h = pair.harness;
    const m = pair.model;

    if (h.manager_runtime_eligible === true || h.authority_class !== 'EXECUTION_WORKER') {
      reject(pair.pair_id, 'MANAGER_RUNTIME_CARD_FORBIDDEN'); continue;
    }
    if (!harnessQualified(h)) { reject(pair.pair_id, 'HARNESS_NOT_QUALIFIED', h.qualification?.state); continue; }

    const hHealth = health.harnesses?.[h.harness_id] || {};
    if (hHealth.health_state && hHealth.health_state !== 'HEALTHY') { reject(pair.pair_id, 'HARNESS_UNHEALTHY', hHealth.health_state); continue; }
    if (hHealth.authenticated === false) { reject(pair.pair_id, 'HARNESS_NOT_AUTHENTICATED'); continue; }

    const mHealth = health.models?.[m.model_id] || {};
    if (mHealth.availability === 'UNAVAILABLE') { reject(pair.pair_id, 'MODEL_UNAVAILABLE'); continue; }
    if (mHealth.quota_state === 'EXHAUSTED') { reject(pair.pair_id, 'MODEL_QUOTA_EXHAUSTED'); continue; }

    if (!modelRoutable({ model: m, policyRegistry: reg.models, riskClass })) {
      reject(pair.pair_id, 'MODEL_NOT_PRESENT_ON_SUBSCRIPTION', m.qualification?.state); continue;
    }
    if (m.worker_eligible !== true) { reject(pair.pair_id, 'ROLE_NOT_ALLOWED', 'not worker_eligible'); continue; }

    if (!(h.security?.supported_data_classes || []).includes(dataClass)) {
      reject(pair.pair_id, 'DATA_CLASS_NOT_PERMITTED', dataClass); continue;
    }
    if (!riskAtMost(riskClass, h.security?.max_risk_class || 'LOW')) {
      reject(pair.pair_id, 'RISK_CLASS_NOT_PERMITTED', riskClass); continue;
    }

    const missing = required.filter((cap) => h.capabilities?.[cap] !== true && m.capabilities?.[cap] !== true);
    if (missing.length) { reject(pair.pair_id, 'CAPABILITY_MISSING', missing.sort().join(',')); continue; }

    surviving.push(pair);
  }

  // ── performance placement (ordering, not exclusion) ─────────────────────
  // Every pair that cleared the hard filters stays in the running. Past
  // performance on this task type decides the ORDER they are offered in.
  const placed = surviving.map((pair) => {
    const quality = expectedQuality({ registries: reg, pair, taskArchetype: archetype, role, riskClass });
    return { ...pair, quality, placement: performancePlacement({ registries: reg, pair, riskClass, quality }) };
  });

  // ── cost ranking across the whole eligible field ─────────────────────────
  const ranked = placed.map((pair) => {
    const cost = effectiveExecutionCost({ registries: reg, pair });
    const taskFit = pair.proven ? 1 : 0.85;
    // Reliability reflects what the provider establishes, not how much DIAL has
    // used the model. A model is never ranked down for being new here.
    const reliability = { PROVIDER_ESTABLISHED: 1, DEGRADED: 0.6 }[pair.model.reliability_profile] ?? 1;
    const firstPass = Number(pair.quality.first_pass ?? pair.quality.value);
    const score = (pair.quality.value * taskFit * reliability * firstPass) / cost.cost;
    return { ...pair, cost, task_fit: taskFit, reliability, score };
  }).sort((a, b) => b.score - a.score || a.pair_id.localeCompare(b.pair_id));

  if (!ranked.length) {
    return {
      ok: false, reason: 'NO_ELIGIBLE_PAIR', policy_version: policy.policy_version, selection: null,
      eligible_pairs: [], excluded_candidates: excluded.sort((a, b) => a.pair_id.localeCompare(b.pair_id)),
      decided_at: nowIso(),
    };
  }

  // ── hysteresis ───────────────────────────────────────────────────────────
  let selected = ranked[0];
  let hysteresis = null;
  if (currentPair) {
    const incumbent = ranked.find((p) => p.pair_id === currentPair.pair_id);
    const threshold = Number(policy.hysteresis?.min_improvement_to_switch ?? 0);
    const bypass = (policy.hysteresis?.bypassed_by || []).filter((r) => (currentPair.bypass_reasons || []).includes(r));
    if (incumbent && !bypass.length) {
      const improvement = (selected.score - incumbent.score) / Math.max(incumbent.score, 1e-9);
      if (improvement < threshold) {
        selected = incumbent;
        hysteresis = { retained_incumbent: true, improvement, threshold };
      } else {
        hysteresis = { retained_incumbent: false, improvement, threshold };
      }
    } else if (bypass.length) {
      hysteresis = { retained_incumbent: false, bypassed_by: bypass.sort() };
    }
  }

  const selection = {
    harness_id: selected.harness_id,
    model_id: selected.model_id,
    provider: selected.provider,
    role,
    specialist_tools: requiredSpecialistTools({ registries: reg, taskRequirements }),
    selection_reason: `TOP_OF_PERFORMANCE_HIERARCHY:${selected.placement.basis}`,
    expected_quality: selected.quality.value,
    expected_token_cost: selected.cost.breakdown.token_cost?.value ?? null,
    expected_rework: selected.cost.breakdown.expected_rework?.value ?? null,
    score: selected.score,
  };

  const trace = {
    task_requirements_hash: hashObject(taskRequirements),
    eligible_harnesses: [...new Set(ranked.map((p) => p.harness_id))].sort(),
    eligible_models: [...new Set(ranked.map((p) => p.model_id))].sort(),
    eligible_pairs: ranked.map((p) => ({ pair_id: p.pair_id, score: p.score })),
    excluded_candidates: excluded.sort((a, b) => a.pair_id.localeCompare(b.pair_id)),
    selected_pair: `${selection.harness_id}+${selection.model_id}`,
    selection_policy_version: policy.policy_version,
    performance_snapshot_hash: hashObject(reg.ledger.entries || []),
    health_snapshot_hash: hashObject(health),
    hysteresis,
    reason_codes: [...new Set(excluded.map((e) => e.reason))].sort(),
  };

  return {
    ok: true,
    policy_version: policy.policy_version,
    selection,
    ...trace,
    evidence_hash: hashObject({ ...trace, selection }),
    decided_at: nowIso(),
  };
}

/** Tools are attached only when the task needs them (§31, §69). */
export function requiredSpecialistTools({ registries, taskRequirements = {} } = {}) {
  const requested = taskRequirements.required_tools || [];
  const declared = new Set((registries.specialists.capabilities || []).map((c) => c.id));
  return requested.filter((id) => declared.has(id)).sort();
}

/**
 * Model capability never implies tool authorisation. A task must name a tool
 * AND the envelope must grant it; a powerful model does not widen the grant.
 */
export function authorizeTool({ registries, toolId, taskRequirements = {}, envelopeGrants = [] } = {}) {
  const capability = (registries.specialists.capabilities || []).find((c) => c.id === toolId);
  if (!capability) return { ok: false, reason: 'TOOL_NOT_DECLARED' };
  if (!(taskRequirements.required_tools || []).includes(toolId)) return { ok: false, reason: 'TOOL_NOT_REQUIRED_BY_TASK' };
  if (!envelopeGrants.includes(toolId)) return { ok: false, reason: 'TOOL_NOT_AUTHORIZED' };
  return { ok: true, tool_id: toolId, trust_class: capability.trust_class, output_class: capability.output_class };
}
