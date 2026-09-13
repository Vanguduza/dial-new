// Outcome attribution (DEC-032, owner ruling 2026-09-13).
//
// Before a poor outcome is allowed to affect a pair's rating, DIAL must decide
// WHY it went badly. A pair that failed because the resources it was given were
// inadequate — missing information, absent or wrong skills, conflicting rules,
// context deferred that turned out to be needed — has not underperformed. The
// resources have. Counting that against the pair would poison the ledger and
// progressively misroute work away from a model that was never the problem.
//
// So: only PAIR_PERFORMANCE outcomes move a rating. RESOURCE_DEFICIT outcomes
// leave the rating untouched and raise a VEKL improvement signal instead.
import { hashObject, nowIso } from './adaptive-routing-core.mjs';

export const ATTRIBUTIONS = Object.freeze([
  'PAIR_PERFORMANCE',
  'RESOURCE_DEFICIT',
  'EXTERNAL',
  'UNDETERMINED',
]);

/** Only this attribution may move a pair's rating. */
export const RATING_BEARING = Object.freeze(['PAIR_PERFORMANCE']);

/**
 * Signals that point at the resources rather than the worker. Each is a fact
 * about what DIAL supplied, observable from the prompt manifest and the model
 * execution profile — not a judgement about the worker's reasoning.
 */
export const RESOURCE_DEFICIT_SIGNALS = Object.freeze([
  'MUST_INCLUDE_CONTEXT_MISSING',
  'REQUIRED_CONTEXT_DEFERRED',
  'ACCEPTANCE_CRITERIA_ABSENT',
  'REQUIRED_SKILL_UNAVAILABLE',
  'CONFLICTING_RULES_SUPPLIED',
  'STALE_KNOWLEDGE_SUPPLIED',
  'PROFILE_BUDGET_STARVED_GUIDANCE',
  'REQUIRED_TOOL_NOT_AUTHORIZED',
  'TASK_TRUTH_AMBIGUOUS',
]);

/** Signals that point at the environment rather than either. */
export const EXTERNAL_SIGNALS = Object.freeze([
  'HARNESS_UNHEALTHY',
  'PROVIDER_OUTAGE',
  'QUOTA_EXHAUSTED',
  'RATE_LIMITED',
  'INFRASTRUCTURE_FAILURE',
  'RUN_CANCELLED',
]);

/** Signals that genuinely implicate the pair, given adequate resources. */
export const PAIR_PERFORMANCE_SIGNALS = Object.freeze([
  'POSTCONDITION_FAILED_WITH_COMPLETE_CONTEXT',
  'WRONG_TARGET_DESPITE_EXPLICIT_TARGET',
  'PREMATURE_SUCCESS_CLAIM',
  'IGNORED_SUPPLIED_ACCEPTANCE_CRITERIA',
  'SPECULATIVE_REPAIR_WITHOUT_OBSERVATION',
  'REVIEWER_REJECTED_ON_CORRECTNESS',
]);

/**
 * Attributes one failed or partially-accepted outcome.
 *
 * Precedence is deliberate. A resource deficit outranks a pair-performance
 * signal, because a worker that missed an acceptance criterion it was never
 * given has not ignored it. External outranks both — a run killed by a quota
 * limit says nothing about either the pair or the resources.
 *
 * With no signals at all the answer is UNDETERMINED, not PAIR_PERFORMANCE.
 * Silence is not evidence against the worker, and an unattributed outcome is
 * held out of the rating until someone or something resolves it.
 */
export function attributeOutcome({ signals = [], accepted = false } = {}) {
  const seen = [...new Set(signals)].sort();
  const external = seen.filter((s) => EXTERNAL_SIGNALS.includes(s));
  const resource = seen.filter((s) => RESOURCE_DEFICIT_SIGNALS.includes(s));
  const pair = seen.filter((s) => PAIR_PERFORMANCE_SIGNALS.includes(s));
  const unknown = seen.filter((s) => ![...EXTERNAL_SIGNALS, ...RESOURCE_DEFICIT_SIGNALS, ...PAIR_PERFORMANCE_SIGNALS].includes(s));

  if (accepted && !resource.length && !external.length) {
    return { attribution: 'PAIR_PERFORMANCE', rating_bearing: true, signals: seen, reason: 'ACCEPTED' };
  }
  if (external.length) {
    return { attribution: 'EXTERNAL', rating_bearing: false, signals: seen, reason: `EXTERNAL:${external.join(',')}` };
  }
  if (resource.length) {
    return {
      attribution: 'RESOURCE_DEFICIT',
      rating_bearing: false,
      signals: seen,
      resource_signals: resource,
      reason: `RESOURCE_DEFICIT:${resource.join(',')}`,
      requires_vekl_update: true,
    };
  }
  if (pair.length) {
    return { attribution: 'PAIR_PERFORMANCE', rating_bearing: true, signals: seen, reason: `PAIR:${pair.join(',')}` };
  }
  return {
    attribution: 'UNDETERMINED',
    rating_bearing: false,
    signals: seen,
    unknown_signals: unknown,
    reason: 'NO_ATTRIBUTING_SIGNAL',
  };
}

/**
 * The VEKL improvement signal a resource deficit produces.
 *
 * This is the "update VEKL, not the pair's rating" half of the rule. It names
 * the task shape and what was missing, so the knowledge and behaviour layers
 * have something concrete to fix rather than a diffuse sense that a model is
 * unreliable.
 */
export function buildVeklImprovementSignal({
  taskId,
  harnessId,
  modelId,
  taskArchetype = null,
  role = null,
  riskClass = null,
  attribution,
  promptManifestHash = null,
  modelProfileHash = null,
  detail = null,
} = {}) {
  if (attribution?.attribution !== 'RESOURCE_DEFICIT') return null;
  const content = {
    schema_version: 1,
    kind: 'VEKL_IMPROVEMENT_SIGNAL',
    task_id: taskId ?? null,
    pair: `${harnessId}+${modelId}`,
    task_archetype: taskArchetype,
    role,
    risk_class: riskClass,
    deficits: [...(attribution.resource_signals || [])].sort(),
    prompt_manifest_hash: promptManifestHash,
    model_profile_hash: modelProfileHash,
    detail,
    rating_impact: 'NONE',
    remediation_target: 'VEKL_RESOURCES',
    raised_at: nowIso(),
  };
  return { ...content, signal_hash: hashObject({ ...content, raised_at: null }) };
}
