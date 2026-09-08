import crypto from 'node:crypto';
import { HAIF_AUTHORITY, HAIF_BUDGET_POLICY, assertAuxiliaryAuthority } from './authority-gate.mjs';
import { assertDeterministicInputSafe } from './data-classification.mjs';
import { enqueueTask } from './task-store.mjs';

function now() { return new Date().toISOString(); }
function sha(value) { return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }

export function buildAuxiliaryTask({ project, taskArchetype, purpose, evidence, evidenceRefs = [], dataClass = 'PUBLIC', risk = 'LOW', requiredCapabilities = {}, diversity = 'S1', maxInputTokens = 120000, maxOutputTokens = 8000, deadlineClass = 'DEFERRABLE', deadlineAt = null, maxAttempts = 2, cacheable = true, policyVersion = 'haif-1.1', outputSchemaVersion = 1, priority = 'NORMAL' } = {}) {
  const taskId = crypto.randomUUID();
  const inputHash = sha(evidence);
  const idempotencyKey = sha(JSON.stringify({ project, taskArchetype, purpose, inputHash, evidenceRefs: [...evidenceRefs].sort(), dataClass, policyVersion, outputSchemaVersion }));
  return {
    schema_version: 2, task_id: taskId, idempotency_key: idempotencyKey,
    attempt_id: crypto.randomUUID(), project, task_archetype: taskArchetype,
    authority: HAIF_AUTHORITY, data_class: dataClass, risk, purpose: String(purpose ?? '').slice(0, 4000),
    input_hash: inputHash, evidence_refs: [...evidenceRefs], evidence,
    required_capabilities: { vision: false, reasoning: false, tools: false, ...requiredCapabilities, tools: false },
    diversity, budget_policy: HAIF_BUDGET_POLICY,
    max_input_tokens: Math.max(1, Number(maxInputTokens) || 120000),
    max_output_tokens: Math.max(1, Number(maxOutputTokens) || 8000),
    deadline_class: deadlineClass, deadline_at: deadlineAt,
    max_attempts: Math.max(1, Math.min(4, Number(maxAttempts) || 2)), retry_count: 0,
    cacheable: Boolean(cacheable), policy_version: policyVersion,
    output_schema_version: outputSchemaVersion, route_class: 'free-approved', priority,
    created_at: now(),
  };
}
export function submitAuxiliaryTask(options, { root, expectedProject } = {}) {
  const task = buildAuxiliaryTask(options);
  assertAuxiliaryAuthority(task, { expectedProject });
  assertDeterministicInputSafe({ dataClass: task.data_class, evidence: task.evidence, root });
  return enqueueTask(task, root);
}

export function validatePersistedAuxiliaryTask(task, { root, expectedProject } = {}) {
  assertAuxiliaryAuthority(task, { expectedProject });
  assertDeterministicInputSafe({ dataClass: task.data_class, evidence: task.evidence, root });
  if (!task.idempotency_key || !task.input_hash || !task.task_id || !task.attempt_id) {
    throw new Error('persisted HAIF task is missing restart-safe identity fields');
  }
  return task;
}
