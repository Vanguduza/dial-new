import crypto from 'node:crypto';
import { appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';
import {
  classifyDevelopmentTask,
  isManagerChairModel,
  loadDevelopmentPolicy,
  markComplexWorkPaused,
  selectDevelopmentManager,
} from './development-policy.mjs';
import { bestAvailableBinding, loadModelRegistry } from './model-registry.mjs';

function now() { return new Date().toISOString(); }

export function loadDevelopmentManager(root) {
  return readJson('state/development-manager.json', null, root);
}

export function issueDevelopmentManagerAssignment({
  candidate,
  feature_id = null,
  worktree = null,
  atomic_unit = null,
  previous_assignment_id = null,
} = {}, root) {
  if (!candidate?.model) throw new Error('development Manager Chair candidate is required');
  const policy = loadDevelopmentPolicy(root);
  if (!isManagerChairModel(candidate.model, policy)) {
    throw new Error(`model is not configured for Manager Chair authority: ${candidate.model.model_id}`);
  }
  const binding = candidate.binding ?? bestAvailableBinding(candidate.model);
  if (!binding || binding.availability !== 'AVAILABLE') {
    throw new Error('development Manager Chair candidate requires an AVAILABLE runtime binding');
  }

  const assignment = {
    schema_version: 1,
    assignment_id: crypto.randomUUID(),
    role: 'DEVELOPMENT_MANAGER_CHAIR',
    authority: 'COMPLEX_DEVELOPMENT',
    model_id: candidate.model.model_id,
    display_name: candidate.model.display_name,
    provider: candidate.model.provider,
    runtime_id: binding.runtime_id,
    connection_id: binding.connection_id ?? null,
    feature_id,
    worktree,
    atomic_unit,
    status: 'ACTIVE',
    acquired_at: now(),
    previous_assignment_id,
    renewal_boundary: 'ATOMIC_UNIT',
  };
  writeJsonAtomic('state/development-manager.json', assignment, root);
  appendJsonl('events/development-manager.jsonl', { event: 'DEVELOPMENT_MANAGER_ASSIGNED', ...assignment }, root);
  return assignment;
}

export function expireDevelopmentManagerAssignment(reason = 'UNSPECIFIED', root) {
  const existing = loadDevelopmentManager(root);
  if (!existing || existing.status !== 'ACTIVE') return existing;
  const expired = {
    ...existing,
    status: 'EXPIRED',
    expired_at: now(),
    expiration_reason: reason,
  };
  writeJsonAtomic('state/development-manager.json', expired, root);
  appendJsonl('events/development-manager.jsonl', { event: 'DEVELOPMENT_MANAGER_EXPIRED', ...expired }, root);
  return expired;
}

export function electDevelopmentManager({
  root,
  feature_id = null,
  worktree = null,
  atomic_unit = null,
  task = { kind: 'orchestration_decision' },
} = {}) {
  if (classifyDevelopmentTask(task) !== 'COMPLEX') {
    throw new Error('development Manager Chair election is only required for complex work');
  }
  const previous = loadDevelopmentManager(root);
  const candidate = selectDevelopmentManager({ root });
  if (!candidate) {
    if (previous?.status === 'ACTIVE') expireDevelopmentManagerAssignment('NO_QUALIFIED_MANAGER', root);
    const paused = markComplexWorkPaused({ reason: 'NO_QUALIFIED_MANAGER', task }, root);
    return { elected: false, paused: true, reason: 'NO_QUALIFIED_MANAGER', state: paused };
  }
  if (
    previous?.status === 'ACTIVE'
    && previous.model_id === candidate.model.model_id
    && previous.runtime_id === candidate.binding.runtime_id
  ) {
    return { elected: true, changed: false, assignment: previous };
  }
  if (previous?.status === 'ACTIVE') expireDevelopmentManagerAssignment('MANAGER_CHAIR_REELECTION', root);
  const assignment = issueDevelopmentManagerAssignment({
    candidate,
    feature_id,
    worktree,
    atomic_unit,
    previous_assignment_id: previous?.assignment_id ?? null,
  }, root);
  return { elected: true, changed: true, assignment };
}

export function developmentManagerStatus(root) {
  const registry = loadModelRegistry(root);
  const policy = loadDevelopmentPolicy(root);
  const current = loadDevelopmentManager(root);
  const candidate = selectDevelopmentManager({ root, policy });
  return {
    current,
    qualified_manager_available: Boolean(candidate),
    next_candidate: candidate ? {
      model_id: candidate.model.model_id,
      display_name: candidate.model.display_name,
      runtime_id: candidate.binding.runtime_id,
    } : null,
    registered_models: Object.keys(registry.models ?? {}).length,
  };
}
