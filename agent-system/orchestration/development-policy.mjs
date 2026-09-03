import { appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';
import { bestAvailableBinding, defaultLesserTaskEligible, defaultManagerChairEligible, loadModelRegistry, modelFamily } from './model-registry.mjs';

export const DEVELOPMENT_TASK_CLASSES = Object.freeze(['COMPLEX', 'BOUNDED']);
export const DEVELOPMENT_MANAGER_STATES = Object.freeze([
  'MANAGER_AVAILABLE',
  'MANAGER_BUSY',
  'MANAGER_CAPACITY_LIMITED',
  'NO_QUALIFIED_MANAGER',
  'COMPLEX_WORK_PAUSED',
]);

export const COMPLEX_TASK_KINDS = Object.freeze([
  'architecture',
  'requirements_interpretation',
  'source_of_truth_change',
  'financial_logic',
  'security_architecture',
  'data_architecture',
  'cross_system_integration',
  'complex_debugging',
  'large_ambiguous_refactor',
  'orchestration_decision',
  'task_decomposition',
  'conflicting_evidence',
  'high_risk_migration',
  'acceptance_gate_synthesis',
]);

export const HIGH_CONSEQUENCE_TASK_KINDS = Object.freeze([
  'architecture',
  'source_of_truth_change',
  'financial_logic',
  'security_architecture',
  'data_architecture',
  'cross_system_integration',
  'high_risk_migration',
  'acceptance_gate_synthesis',
]);

export const BOUNDED_TASK_KINDS = Object.freeze([
  'boilerplate',
  'mechanical_implementation',
  'defined_interface_implementation',
  'test_expansion',
  'formatting',
  'static_analysis_cleanup',
  'repetitive_migration',
  'batch_catalog_work',
  'data_transformation',
  'bounded_repository_scan',
  'documentation_extraction',
]);

function now() { return new Date().toISOString(); }

export function classifyDevelopmentTask(task = {}) {
  if (task.classification && DEVELOPMENT_TASK_CLASSES.includes(task.classification)) return task.classification;
  const kind = String(task.kind ?? '').toLowerCase();
  if (COMPLEX_TASK_KINDS.includes(kind)) return 'COMPLEX';
  if (BOUNDED_TASK_KINDS.includes(kind) && task.ambiguous !== true && task.high_consequence !== true) return 'BOUNDED';
  // Quality-first fail-safe: unknown, ambiguous or high-consequence work is not
  // silently downgraded into worker authority.
  return 'COMPLEX';
}

function defaultPolicy() {
  return {
    schema_version: 2,
    mode: 'AUTO_QUALITY_FIRST',
    manager_chair: {
      mode: 'QUALITY_FIRST',
      explicit_model_ids: [],
      disabled_model_ids: [],
      use_default_quality_families: true,
      preference_families: ['fable', 'opus', 'sol'],
    },
    lesser_task_pool: {
      explicit_model_ids: [],
      disabled_model_ids: [],
      use_default_worker_families: true,
      preference_families: ['sonnet', 'terra', 'luna', 'deepseek'],
    },
    independent_review: {
      high_consequence_required: true,
      complex_default_required: true,
      allow_same_model_self_certification: false,
      reviewer_must_be_available: true,
    },
    cost_and_throughput_priority: 'AFTER_QUALITY_CONSTRAINTS',
    recursive_worker_delegation: false,
    updated_at: now(),
  };
}

export function loadDevelopmentPolicy(root) {
  return readJson('state/development-policy.json', defaultPolicy(), root);
}

export function saveDevelopmentPolicy(policy, root) {
  const defaults = defaultPolicy();
  const next = {
    ...defaults,
    ...policy,
    manager_chair: { ...defaults.manager_chair, ...(policy?.manager_chair ?? {}) },
    lesser_task_pool: { ...defaults.lesser_task_pool, ...(policy?.lesser_task_pool ?? {}) },
    independent_review: { ...defaults.independent_review, ...(policy?.independent_review ?? {}) },
    updated_at: now(),
  };
  writeJsonAtomic('state/development-policy.json', next, root);
  appendJsonl('events/development-policy.jsonl', { event: 'DEVELOPMENT_POLICY_UPDATED', at: next.updated_at }, root);
  return next;
}

export function isManagerChairModel(model, policy = defaultPolicy()) {
  if (!model?.model_id) return false;
  if (policy.manager_chair?.disabled_model_ids?.includes(model.model_id)) return false;
  if (policy.manager_chair?.explicit_model_ids?.includes(model.model_id)) return true;
  return policy.manager_chair?.use_default_quality_families !== false && defaultManagerChairEligible(model);
}

export function isLesserTaskModel(model, policy = defaultPolicy()) {
  if (!model?.model_id) return false;
  if (policy.lesser_task_pool?.disabled_model_ids?.includes(model.model_id)) return false;
  if (policy.lesser_task_pool?.explicit_model_ids?.includes(model.model_id)) return true;
  return policy.lesser_task_pool?.use_default_worker_families !== false && defaultLesserTaskEligible(model);
}

function preferenceRank(model, preference) {
  const index = preference.indexOf(modelFamily(model));
  return index < 0 ? 999 : index;
}

export function selectDevelopmentManager({ root, policy = loadDevelopmentPolicy(root), preference = policy.manager_chair?.preference_families ?? ['fable', 'opus', 'sol'] } = {}) {
  const registry = loadModelRegistry(root);
  const models = Object.values(registry.models ?? {});
  const candidates = models
    .filter((model) => isManagerChairModel(model, policy))
    .map((model) => ({ model, binding: bestAvailableBinding(model) }))
    .filter((candidate) => candidate.binding)
    .sort((a, b) => preferenceRank(a.model, preference) - preferenceRank(b.model, preference) || a.model.model_id.localeCompare(b.model.model_id));
  return candidates[0] ?? null;
}

export function selectLesserTaskWorker({ root, policy = loadDevelopmentPolicy(root), preference = policy.lesser_task_pool?.preference_families ?? ['sonnet', 'terra', 'luna', 'deepseek'] } = {}) {
  const registry = loadModelRegistry(root);
  const models = Object.values(registry.models ?? {});
  const candidates = models
    .filter((model) => isLesserTaskModel(model, policy) || isManagerChairModel(model, policy))
    .map((model) => ({ model, binding: bestAvailableBinding(model), is_manager_chair: isManagerChairModel(model, policy) }))
    .filter((candidate) => candidate.binding)
    // Prefer lesser-task capacity before spending Manager Chair capacity.
    .sort((a, b) => Number(a.is_manager_chair) - Number(b.is_manager_chair)
      || preferenceRank(a.model, preference) - preferenceRank(b.model, preference)
      || a.model.model_id.localeCompare(b.model.model_id));
  return candidates[0] ?? null;
}

export function evaluateDevelopmentAuthority({ selected_model_id = null, task = {}, root, policy = loadDevelopmentPolicy(root), user_override = false } = {}) {
  const classification = classifyDevelopmentTask(task);
  const registry = loadModelRegistry(root);
  const selected = selected_model_id ? registry.models?.[selected_model_id] ?? null : null;
  const selectedBinding = selected ? bestAvailableBinding(selected) : null;

  if (classification === 'BOUNDED') {
    const allowed = Boolean(selected && selectedBinding && (isLesserTaskModel(selected, policy) || isManagerChairModel(selected, policy)));
    const overrideAllowed = Boolean(user_override && selected && selectedBinding);
    return {
      classification,
      selected_model_id,
      allowed: allowed || overrideAllowed,
      authority: allowed ? 'WORKER' : overrideAllowed ? 'USER_OVERRIDE' : 'BLOCKED',
      reason: allowed
        ? 'selected model is eligible for bounded work'
        : overrideAllowed
          ? 'explicit user override on an available registered model'
          : 'selected model is not an available bounded-work model',
    };
  }

  const selectedIsManager = Boolean(selected && selectedBinding && isManagerChairModel(selected, policy));
  const overrideAllowed = Boolean(user_override && selected && selectedBinding);
  if (selectedIsManager || overrideAllowed) {
    return {
      classification,
      selected_model_id,
      allowed: true,
      authority: overrideAllowed && !selectedIsManager ? 'USER_OVERRIDE' : 'MANAGER_CHAIR',
      reason: overrideAllowed && !selectedIsManager ? 'explicit user override on an available registered model' : 'selected model has Manager Chair authority',
    };
  }

  const availableManager = selectDevelopmentManager({ root, policy });
  return {
    classification,
    selected_model_id,
    allowed: false,
    authority: 'BLOCKED',
    reason: availableManager ? 'complex work requires a configured Manager Chair' : 'NO_QUALIFIED_MANAGER',
    available_manager: availableManager ? {
      model_id: availableManager.model.model_id,
      runtime_id: availableManager.binding.runtime_id,
    } : null,
  };
}

export function routeAutoDevelopmentTask({ task = {}, root, policy = loadDevelopmentPolicy(root) } = {}) {
  const classification = classifyDevelopmentTask(task);
  if (classification === 'COMPLEX') {
    const manager = selectDevelopmentManager({ root, policy });
    if (!manager) {
      return {
        mode: 'AUTO',
        classification,
        route: 'COMPLEX_WORK_PAUSED',
        reason: 'NO_QUALIFIED_MANAGER',
      };
    }
    return {
      mode: 'AUTO',
      classification,
      route: 'MANAGER_CHAIR',
      model_id: manager.model.model_id,
      runtime_id: manager.binding.runtime_id,
      review_required: requiresIndependentReview(task, policy),
    };
  }

  const worker = selectLesserTaskWorker({ root, policy });
  if (!worker) {
    return {
      mode: 'AUTO',
      classification,
      route: 'NO_AVAILABLE_WORKER',
      reason: 'NO_ELIGIBLE_BOUNDED_WORKER',
    };
  }
  return {
    mode: 'AUTO',
    classification,
    route: 'LESSER_TASK_POOL',
    model_id: worker.model.model_id,
    runtime_id: worker.binding.runtime_id,
    manager_capacity_used: worker.is_manager_chair,
  };
}

export function requiresIndependentReview(task = {}, policy = loadDevelopmentPolicy()) {
  const kind = String(task.kind ?? '').toLowerCase();
  if (task.independent_review_required === true) return true;
  if (task.independent_review_required === false) return false;
  if (HIGH_CONSEQUENCE_TASK_KINDS.includes(kind)) return policy.independent_review?.high_consequence_required !== false;
  return classifyDevelopmentTask(task) === 'COMPLEX' && policy.independent_review?.complex_default_required !== false;
}

export function selectIndependentReviewer({ task = {}, manager_model_id, root, policy = loadDevelopmentPolicy(root) } = {}) {
  if (!requiresIndependentReview(task, policy)) return null;
  const registry = loadModelRegistry(root);
  const candidates = Object.values(registry.models ?? {})
    .filter((model) => model.model_id !== manager_model_id)
    .filter((model) => isManagerChairModel(model, policy))
    .map((model) => ({ model, binding: bestAvailableBinding(model) }))
    .filter((candidate) => candidate.binding)
    .sort((a, b) => preferenceRank(a.model, policy.manager_chair?.preference_families ?? ['fable', 'opus', 'sol'])
      - preferenceRank(b.model, policy.manager_chair?.preference_families ?? ['fable', 'opus', 'sol'])
      || a.model.model_id.localeCompare(b.model.model_id));
  return candidates[0] ?? null;
}

export function validateIndependentReview({ task = {}, manager_model_id, reviewer_model_id, root, policy = loadDevelopmentPolicy(root) } = {}) {
  if (!requiresIndependentReview(task, policy)) return { required: false, valid: true, reason: 'review not required by policy' };
  if (!reviewer_model_id) return { required: true, valid: false, reason: 'independent reviewer is required' };
  if (manager_model_id === reviewer_model_id && policy.independent_review?.allow_same_model_self_certification !== true) {
    return { required: true, valid: false, reason: 'same model may not self-certify high-consequence work' };
  }
  const registry = loadModelRegistry(root);
  const reviewer = registry.models?.[reviewer_model_id];
  if (!reviewer || !isManagerChairModel(reviewer, policy)) {
    return { required: true, valid: false, reason: 'reviewer is not a configured Manager Chair quality model' };
  }
  if (policy.independent_review?.reviewer_must_be_available !== false && !bestAvailableBinding(reviewer)) {
    return { required: true, valid: false, reason: 'reviewer has no AVAILABLE runtime binding' };
  }
  return { required: true, valid: true, reason: 'independent cross-model review requirement satisfied' };
}

export function buildWorkerPacket({
  objective,
  scope,
  allowed_paths,
  forbidden_paths = [],
  acceptance_criteria,
  expected_evidence,
  authority_limit = 'BOUNDED_IMPLEMENTATION_ONLY',
  manager_provenance,
  task_kind = 'mechanical_implementation',
} = {}) {
  const required = { objective, scope, allowed_paths, acceptance_criteria, expected_evidence, manager_provenance };
  for (const [key, value] of Object.entries(required)) {
    if (value == null || (Array.isArray(value) && value.length === 0) || value === '') throw new Error(`worker packet requires ${key}`);
  }
  if (!manager_provenance?.model_id) throw new Error('worker packet manager_provenance.model_id is required');
  if (classifyDevelopmentTask({ kind: task_kind }) !== 'BOUNDED') {
    throw new Error(`worker packet task_kind must be bounded: ${task_kind}`);
  }
  return {
    schema_version: 2,
    packet_type: 'DEVELOPMENT_WORKER_PACKET',
    task_kind,
    objective,
    scope,
    allowed_paths,
    forbidden_paths,
    acceptance_criteria,
    expected_evidence,
    authority_limit,
    manager_provenance,
    recursive_delegation_allowed: false,
    created_at: now(),
  };
}

export function markComplexWorkPaused({ reason = 'NO_QUALIFIED_MANAGER', task = null } = {}, root) {
  const state = {
    schema_version: 1,
    state: 'COMPLEX_WORK_PAUSED',
    reason,
    task,
    updated_at: now(),
  };
  writeJsonAtomic('state/development-manager.json', state, root);
  appendJsonl('events/development-manager.jsonl', { event: 'COMPLEX_WORK_PAUSED', ...state }, root);
  return state;
}
