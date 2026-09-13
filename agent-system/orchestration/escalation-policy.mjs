// Escalation, stop-loss and similar-failure detection (DEC-032 §60, §92, §93).
//
// Adaptive routing without a stop-loss is a token incinerator: a worker that
// fails the same way three times has not learned anything, and neither has the
// router. The dimension that matters is whether the STRATEGY changed, not
// whether the attempt did — a retry that re-runs the same approach counts
// against the budget even though it is technically a new attempt.
import { DEFAULT_REPO_DIR, hashObject, loadRoutingPolicy, nowIso } from './adaptive-routing-core.mjs';

export const DECISIONS = Object.freeze(['CONTINUE', 'ESCALATE', 'DE_ESCALATE', 'RE_ROUTE', 'BLOCK']);

/**
 * Fingerprints an attempt failure along the §93 dimensions. Two attempts with
 * the same fingerprint are "materially similar" however differently they were
 * phrased.
 */
export function failureFingerprint({
  taskId, failureClass, unresolvedAssumption = null, toolFailure = null,
  rejectedAcceptanceCriterion = null, rootCauseHypothesis = null,
} = {}) {
  return hashObject({
    task_id: taskId,
    failure_class: failureClass ?? null,
    unresolved_assumption: unresolvedAssumption,
    tool_failure: toolFailure,
    rejected_acceptance_criterion: rejectedAcceptanceCriterion,
    root_cause_hypothesis: rootCauseHypothesis,
  });
}

export function similarFailureCount({ attempts = [], fingerprint } = {}) {
  return attempts.filter((a) => a.failure_fingerprint === fingerprint).length;
}

/**
 * Decides what to do after an attempt.
 *
 * Returns ESCALATE with `bypasses_hysteresis` set when the stop-loss fires.
 * That flag resolves a deadlock the source document leaves open: §92 demands
 * escalation after repeated similar failures while §59 blocks a switch whose
 * score improvement is below the hysteresis threshold. Failure-driven
 * escalation outranks hysteresis, so the two rules stop contradicting.
 */
export function decideEscalation({
  repoDir = DEFAULT_REPO_DIR,
  attempts = [],
  lastFailure = null,
  taskRequirements = {},
  premiumEscalationsUsed = 0,
  workerSwitchesUsed = 0,
  accepted = false,
} = {}) {
  const policy = loadRoutingPolicy(repoDir).escalation || {};
  const limits = policy.attempt_policy || {};

  if (accepted) return { decision: 'CONTINUE', reason: 'ACCEPTED', bypasses_hysteresis: false, decided_at: nowIso() };
  if (!lastFailure) return { decision: 'CONTINUE', reason: 'NO_FAILURE', bypasses_hysteresis: false, decided_at: nowIso() };

  const fingerprint = lastFailure.failure_fingerprint || failureFingerprint(lastFailure);
  const similar = similarFailureCount({ attempts, fingerprint });
  const maxSimilar = Number(limits.max_similar_failures ?? 2);
  const maxSwitches = Number(limits.max_total_worker_switches ?? 3);
  const maxPremium = Number(limits.max_premium_escalations ?? 1);

  if (workerSwitchesUsed >= maxSwitches) {
    return { decision: 'BLOCK', reason: 'MAX_WORKER_SWITCHES_EXHAUSTED', similar_failures: similar, bypasses_hysteresis: false, decided_at: nowIso() };
  }

  if (similar >= maxSimilar) {
    if (premiumEscalationsUsed >= maxPremium) {
      return {
        decision: 'BLOCK',
        reason: 'NO_JUSTIFIED_ROUTE_REMAINS',
        detail: 'Similar failures recurred and the premium escalation budget is spent.',
        similar_failures: similar,
        bypasses_hysteresis: false,
        decided_at: nowIso(),
      };
    }
    return {
      decision: 'ESCALATE',
      reason: 'SIMILAR_FAILURE_STOP_LOSS',
      detail: 'Stop retrying the same strategy: re-resolve task evidence, then escalate model or topology.',
      similar_failures: similar,
      required_actions: policy.on_budget_exhausted || ['RE_RESOLVE_TASK_EVIDENCE', 'ESCALATE_MODEL_OR_TOPOLOGY'],
      bypasses_hysteresis: true,
      failure_fingerprint: fingerprint,
      decided_at: nowIso(),
    };
  }

  // A dissimilar failure is new information; re-routing is cheaper than
  // escalating, and escalation stays available if it recurs.
  return {
    decision: 'RE_ROUTE',
    reason: 'NEW_FAILURE_MODE',
    similar_failures: similar,
    bypasses_hysteresis: false,
    failure_fingerprint: fingerprint,
    decided_at: nowIso(),
  };
}

/**
 * De-escalation (§60). Once a premium worker has resolved the ambiguity, the
 * mechanical remainder belongs on a cheaper pair. This is the half of adaptive
 * routing that actually saves money.
 */
export function shouldDeEscalate({ taskRequirements = {}, resolvedAmbiguity = false, remainingWorkClass = null } = {}) {
  if (!resolvedAmbiguity) return { de_escalate: false, reason: 'AMBIGUITY_UNRESOLVED' };
  if (['MECHANICAL', 'IMPLEMENTATION', 'REFACTOR'].includes(remainingWorkClass)) {
    return { de_escalate: true, reason: 'MECHANICAL_REMAINDER_AFTER_ARCHITECTURE_RESOLVED' };
  }
  return { de_escalate: false, reason: 'REMAINING_WORK_NOT_MECHANICAL' };
}

/**
 * Partial-failure handoff (§62). A replacement worker receives compact state
 * rather than replaying the whole history — the point is that a failed worker
 * must not force a full restart when useful work already exists.
 */
export function buildHandoffState({
  completedSteps = [], verifiedEvidence = [], generatedArtifacts = [],
  openFindings = [], invalidatedAssumptions = [], remainingAcceptanceCriteria = [], safeResumePoint = null,
} = {}) {
  const content = {
    schema_version: 1,
    completed_steps: [...completedSteps],
    verified_evidence: [...verifiedEvidence],
    generated_artifacts: [...generatedArtifacts],
    open_findings: [...openFindings],
    invalidated_assumptions: [...invalidatedAssumptions],
    remaining_acceptance_criteria: [...remainingAcceptanceCriteria],
    safe_resume_point: safeResumePoint,
  };
  return { ...content, handoff_hash: hashObject(content) };
}
