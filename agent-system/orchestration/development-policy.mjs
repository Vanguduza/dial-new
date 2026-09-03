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
    schema_version: 1,
    manager_chair: {
      mode: 'QUALITY_FIRST',
      explicit_model_ids: [],
      disabled_model_ids: [],
      use_default_quality_families: true,
    },
    lesser_task_pool: {
      explicit_model_ids: [],
      disabled_model_ids: [],
      use_default_worker_families: true,
    },
    recursive_worker_delegation: false,
    updated_at: now(),
  };
}

export function loadDevelopmentPolicy(root) {
  return readJson('state/development-policy.json', defaultPolicy(), root);
}

export function saveDevelopmentPolicy(policy, root) {
  const next = {
    ...defaultPolicy(),
    ...policy,
    manager_chair: { ...defaultPolicy().manager_chair, ...(policy?.manager_chair ?? {}) },
    lesser_task_pool: { ...defaultPolicy().lesser_task_pool, ...(policy?.lesser_task_pool ?? {}) },
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

export function selectDevelopmentManager({ root, policy = loadDevelopmentPolicy(root), preference = ['fable', 'opus', 'sol'] } = {}) {
  const registry = loadModelRegistry(root);
  const models = Object.values(registry.models ?? {});
  const candidates = models
    .filter((model) => isManagerChairModel(model, policy))
    .map((model) => ({ model, binding: bestAvailableBinding(model) }))
    .filter((candidate) => candidate.binding)
    .sort((a, b) => {
      const ai = preference.indexOf(modelFamily(a.model));
      const bi = preference.indexOf(modelFamily(b.model));
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.model.model_id.localeCompare(b.model.model_id);
    });
  return candidates[0] ?? null;
}

export function evaluateDevelopmentAuthority({ selected_model_id = null, task = {}, root, policy = loadDevelopmentPolicy(root), user_override = false } = {}) {
  const classification = classifyDevelopmentTask(task);
  const registry = loadModelRegistry(root);
  const selected = selected_model_id ? registry.models?.[selected_model_id] ?? null : null;
  if (classification === 'BOUNDED') {
    const allowed = Boolean(selected && (isLesserTaskModel(selected, policy) || isManagerChairModel(selected, policy)) && bestAvailableBinding(selected));
    return {
      classification,
      selected_model_id,
      allowed: allowed || user_override,
      authority: allowed || user_override ? 'WORKER' : 'BLOCKED',
      reason: allowed ? 'selected model is eligible for bounded work' : 'selected model is not an available bounded-work model',
    };
  }

  const selectedIsManager = Boolean(selected && isManagerChairModel(selected, policy) && bestAvailableBinding(selected));
  if (selectedIsManager || user_override) {
    return {
      classification,
      selected_model_id,
      allowed: true,
      authority: user_override && !selectedIsManager ? 'USER_OVERRIDE' : 'MANAGER_CHAIR',
      reason: user_override && !selectedIsManager ? 'explicit user override' : 'selected model has Manager Chair authority',
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
  if (classifyDevelopmentTask({ kind: task_kind }) !== 'BOUNDED') {
    throw new Error(`worker packet task_kind must be bounded: ${task_kind}`);
  }
  return {
    schema_version: 1,
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
