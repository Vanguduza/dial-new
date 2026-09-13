// VEKL Pass 2 — model-specific execution projection (DEC-032 §15-17, §24-25, §57-58).
//
// Pass 1 is model-neutral and resolves engineering truth. Pass 2 runs only
// AFTER a pair is selected, and its output is the single layer permitted to
// vary because a different model was chosen. The invariant it must never
// breach: model optimisation may change behaviour guidance, never engineering
// truth (§51.3). Nothing in this module reads or rewrites acceptance criteria,
// contracts, security constraints or Project Truth.
//
// NONE is a valid and expected output. A profile that adds nothing but tokens
// is a regression, so the token-benefit gate refuses it.
import { DEFAULT_REPO_DIR, estimateTokens, hashObject, loadRoutingRegistries, nowIso } from './adaptive-routing-core.mjs';

const PRECEDENCE = Object.freeze([
  'PROJECT_TRUTH_SECURITY_TASK_SAFETY', 'RISK_PROFILE', 'ROLE_POLICY',
  'MODEL_SPECIFIC_OPTIMIZATION', 'PREFERENCE_LEVEL_GUIDANCE',
]);

const COMPLEXITY_BY_RISK = Object.freeze({ LOW: 'SIMPLE', MEDIUM: 'NORMAL', HIGH: 'COMPLEX', CRITICAL: 'HIGH_RISK' });

function matchesScope(resource, { model, taskArchetype, role, riskClass }) {
  const a = resource.applies_to || {};
  const families = a.model_families || [];
  const familyOk = families.includes('*') || families.includes(model.family);
  if (!familyOk) return false;
  if ((a.model_lineages || []).length && !a.model_lineages.includes(model.lineage)) return false;
  if ((a.task_archetypes || []).length && !a.task_archetypes.includes(taskArchetype)) return false;
  if ((a.roles || []).length && !a.roles.includes(role)) return false;
  if ((a.risk_classes || []).length && !a.risk_classes.includes(riskClass)) return false;
  return true;
}

/**
 * Minimal coalition (§25). Candidates are scoped, then deduplicated by the
 * rule text they contribute, then trimmed to the smallest set that still
 * covers every distinct rule. Overlapping resources collapse rather than
 * stacking, which is where most of the token waste would otherwise come from.
 */
export function deterministicMinimalBehaviorCoalition({ candidates = [] } = {}) {
  const ordered = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  const covered = new Set();
  const chosen = [];
  for (const resource of ordered) {
    const rules = (resource.rules || []).map((r) => r.trim().toLowerCase());
    const novel = rules.filter((r) => !covered.has(r));
    if (!novel.length) continue;
    for (const r of rules) covered.add(r);
    chosen.push(resource);
  }
  return {
    candidates: ordered.map((r) => r.id),
    selected: chosen.map((r) => r.id),
    pruned: ordered.filter((r) => !chosen.includes(r)).map((r) => r.id),
    coalition: chosen,
  };
}

/**
 * Conflict detection and precedence resolution (§57). A lower-precedence
 * optimisation may never weaken a higher-precedence requirement; when two
 * resources conflict, the lower one is dropped rather than merged.
 */
export function resolveBehaviorConflicts({ registries, coalition = [] } = {}) {
  const declared = registries.behaviors.known_conflicts || [];
  const ids = new Set(coalition.map((r) => r.id));
  const dropped = [];
  const unresolved = [];

  for (const conflict of declared) {
    if (!ids.has(conflict.a) || !ids.has(conflict.b)) continue;
    if (conflict.resolution === 'BOTH_COMPATIBLE') continue;
    if (conflict.resolution === 'A_WINS') { dropped.push({ id: conflict.b, lost_to: conflict.a }); ids.delete(conflict.b); continue; }
    if (conflict.resolution === 'B_WINS') { dropped.push({ id: conflict.a, lost_to: conflict.b }); ids.delete(conflict.a); continue; }
    unresolved.push(conflict);
  }

  // An ACTIVATE and a SUPPRESS naming the same behaviour is a real conflict
  // even when undeclared; precedence decides, and a tie is escalated rather
  // than silently picked.
  const remaining = coalition.filter((r) => ids.has(r.id));
  for (const a of remaining) {
    for (const b of remaining) {
      if (a.id >= b.id || a.kind === b.kind) continue;
      const overlap = (a.rules || []).some((ra) => (b.rules || []).some((rb) => ra.trim().toLowerCase() === rb.trim().toLowerCase()));
      if (!overlap) continue;
      const pa = PRECEDENCE.indexOf(a.precedence_class || 'MODEL_SPECIFIC_OPTIMIZATION');
      const pb = PRECEDENCE.indexOf(b.precedence_class || 'MODEL_SPECIFIC_OPTIMIZATION');
      if (pa === pb) { unresolved.push({ a: a.id, b: b.id, resolution: 'UNRESOLVED_EQUAL_PRECEDENCE' }); continue; }
      const loser = pa < pb ? b : a;
      dropped.push({ id: loser.id, lost_to: pa < pb ? a.id : b.id });
      ids.delete(loser.id);
    }
  }

  return { resolved: coalition.filter((r) => ids.has(r.id)), dropped, unresolved };
}

/**
 * Token-benefit gate (§24). A rule is injected only when expected benefit
 * exceeds its context cost. With no evidence, benefit is unproven and the
 * honest answer is to inject nothing.
 */
export function tokenBenefitGate({ resource, riskClass = 'LOW' } = {}) {
  const lifecycle = resource.lifecycle || 'EXPERIMENTAL';
  if (['BLOCKED', 'DEPRECATED'].includes(lifecycle)) return { inject: false, reason: `LIFECYCLE_${lifecycle}` };
  if (lifecycle === 'ACTIVE') return { inject: true, reason: 'LIFECYCLE_ACTIVE' };
  // EXPERIMENTAL / SHADOW_EVAL / LIMITED_TRAFFIC carry no promotion evidence
  // yet, so they ride only where a failure is cheap.
  if (['HIGH', 'CRITICAL'].includes(riskClass)) return { inject: false, reason: 'UNPROVEN_RESOURCE_ON_HIGH_RISK_TASK' };
  return { inject: true, reason: 'EXPLORATION_ON_LOW_RISK_TASK' };
}

/**
 * Compiles the Model Execution Profile. Immutable for the execution attempt.
 */
export function runVeklPass2({
  repoDir = DEFAULT_REPO_DIR,
  registries = null,
  taskId,
  unitRevisionHash = null,
  selection,
  taskRequirements = {},
  role = 'BUILDER',
} = {}) {
  const reg = registries || loadRoutingRegistries(repoDir);
  const model = (reg.models.models || []).find((m) => m.model_id === selection.model_id);
  if (!model) throw new Error(`MODEL_NOT_REGISTERED:${selection.model_id}`);

  const riskClass = taskRequirements.risk_class || 'LOW';
  const taskArchetype = taskRequirements.task_archetype || null;
  const complexity = COMPLEXITY_BY_RISK[riskClass] || 'NORMAL';
  const budget = reg.policy.behavioural_guidance_budgets?.by_complexity?.[complexity] || { max_tokens: 0 };

  const scoped = (reg.behaviors.resources || []).filter((r) => matchesScope(r, { model, taskArchetype, role, riskClass }));
  const gated = [];
  const rejected = [];
  for (const resource of scoped) {
    const gate = tokenBenefitGate({ resource, riskClass });
    (gate.inject ? gated : rejected).push(gate.inject ? resource : { id: resource.id, reason: gate.reason });
  }

  const coalition = deterministicMinimalBehaviorCoalition({ candidates: gated });
  const conflicts = resolveBehaviorConflicts({ registries: reg, coalition: coalition.coalition });

  // Budget enforcement. Resources are added in deterministic order until the
  // next one would breach the cap; the remainder are deferred, not truncated
  // mid-rule, so a half-sentence instruction can never reach a model.
  const activated = [];
  const suppressed = [];
  const deferred = [];
  let tokens = 0;
  for (const resource of conflicts.resolved) {
    const text = (resource.rules || []).join('\n');
    const est = estimateTokens({ repoDir, text, modelFamily: model.family });
    if (tokens + est.enforced_tokens > Number(budget.max_tokens ?? 0)) {
      deferred.push({ id: resource.id, reason: 'PROFILE_BUDGET_EXCEEDED', would_add: est.enforced_tokens });
      continue;
    }
    tokens += est.enforced_tokens;
    (resource.kind === 'SUPPRESS' ? suppressed : activated).push(resource);
  }

  const rules = activated.flatMap((r) => r.rules || []);
  const suppressions = suppressed.flatMap((r) => r.rules || []);

  // NONE is a real answer, not a failure.
  if (!rules.length && !suppressions.length) {
    const none = {
      schema_version: 1,
      profile: 'NONE',
      task_id: taskId,
      unit_revision_hash: unitRevisionHash,
      harness_id: selection.harness_id,
      model_id: selection.model_id,
      role,
      task_archetype: taskArchetype,
      risk_class: riskClass,
      reason: 'NO_MODEL_SPECIFIC_ADAPTATION_EXPECTED_TO_IMPROVE_RESULT',
      candidates_considered: coalition.candidates,
      rejected_by_gate: rejected.sort((a, b) => a.id.localeCompare(b.id)),
      token_budget: { max_behavioral_tokens: budget.max_tokens ?? 0, used: 0 },
      compiled_at: nowIso(),
    };
    return { ...none, profile_hash: hashObject({ ...none, compiled_at: null }) };
  }

  const content = {
    schema_version: 1,
    profile: 'COMPILED',
    task_id: taskId,
    unit_revision_hash: unitRevisionHash,
    harness_id: selection.harness_id,
    model_id: selection.model_id,
    role,
    task_archetype: taskArchetype,
    risk_class: riskClass,
    rules,
    activated_micro_skills: activated.map((r) => `${r.id}@${r.version}`).sort(),
    suppressed_behaviors: suppressions,
    suppressed_micro_skills: suppressed.map((r) => `${r.id}@${r.version}`).sort(),
    evidence_policy: taskRequirements.acceptance || [],
    token_budget: { max_behavioral_tokens: budget.max_tokens ?? 0, used: tokens },
    coalition: { candidates: coalition.candidates, selected: coalition.selected, pruned: coalition.pruned },
    conflicts: { dropped: conflicts.dropped, unresolved: conflicts.unresolved },
    deferred,
    rejected_by_gate: rejected.sort((a, b) => a.id.localeCompare(b.id)),
    compiled_at: nowIso(),
  };
  return { ...content, profile_hash: hashObject({ ...content, compiled_at: null }) };
}
