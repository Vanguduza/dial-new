import { appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';
import { buildWorkerPacket, classifyDevelopmentTask, isLesserTaskModel, isManagerChairModel, loadDevelopmentPolicy } from './development-policy.mjs';
import { bestAvailableBinding, loadModelRegistry, registerConnection, registerDiscoveredModels, registerRuntime } from './model-registry.mjs';

export const FIRST_CLASS_HARNESSES = Object.freeze({
  codex_app_server: {
    runtime_id: 'codex_app_server',
    display_name: 'Codex App Server',
    harness: 'Codex App Server / Codex CLI',
    capabilities: ['CHAT', 'TOOLS', 'REPOSITORY_READ', 'REPOSITORY_WRITE', 'SHELL', 'WORKER_PACKETS'],
  },
  claude_code: {
    runtime_id: 'claude_code',
    display_name: 'Claude Code',
    harness: 'Claude Code',
    capabilities: ['CHAT', 'TOOLS', 'REPOSITORY_READ', 'REPOSITORY_WRITE', 'SHELL', 'WORKER_PACKETS'],
  },
  deepseek_harness: {
    runtime_id: 'deepseek_harness',
    display_name: 'DeepSeek Harness',
    harness: 'DeepSeek Harness',
    capabilities: ['CHAT', 'TOOLS', 'REPOSITORY_READ', 'REPOSITORY_WRITE', 'SHELL', 'MODEL_DISCOVERY', 'LOCAL_EXECUTION', 'WORKER_PACKETS'],
  },
  local_runtime: {
    runtime_id: 'local_runtime',
    display_name: 'Local / self-hosted runtime',
    harness: 'Local / self-hosted runtime',
    capabilities: ['CHAT', 'TOOLS', 'REPOSITORY_READ', 'MODEL_DISCOVERY', 'LOCAL_EXECUTION', 'WORKER_PACKETS'],
  },
  custom_api: {
    runtime_id: 'custom_api',
    display_name: 'Custom API runtime',
    harness: 'Custom API runtime',
    capabilities: ['CHAT', 'MODEL_DISCOVERY', 'WORKER_PACKETS'],
  },
});

function now() { return new Date().toISOString(); }

export function ensureFirstClassHarnesses(root) {
  for (const runtime of Object.values(FIRST_CLASS_HARNESSES)) registerRuntime(runtime, root);
  return Object.values(FIRST_CLASS_HARNESSES);
}

export function registerDeepSeekHarness({
  connection_id = 'deepseek-harness-default',
  name = 'DeepSeek Harness',
  models = [],
  auth_state = 'UNKNOWN',
  local = false,
} = {}, root) {
  registerConnection({
    connection_id,
    type: 'DEEPSEEK_HARNESS',
    name,
    auth_state,
    discovery_supported: true,
  }, root);
  registerRuntime({
    ...FIRST_CLASS_HARNESSES.deepseek_harness,
    connection_id,
    health: 'UNKNOWN',
  }, root);
  return registerDiscoveredModels({
    runtime_id: 'deepseek_harness',
    connection_id,
    provider: 'DeepSeek',
    models: models.map((model) => typeof model === 'string' ? {
      model_id: model,
      display_name: model,
      availability: 'AVAILABLE',
      health: 'HEALTHY',
      capabilities: ['CHAT', 'REPOSITORY_READ', 'REPOSITORY_WRITE', 'WORKER_PACKETS', ...(local ? ['LOCAL_EXECUTION'] : [])],
    } : model),
  }, root);
}

export function validateWorkerPacket(packet) {
  if (!packet || packet.packet_type !== 'DEVELOPMENT_WORKER_PACKET') throw new Error('valid DEVELOPMENT_WORKER_PACKET is required');
  if (classifyDevelopmentTask({ kind: packet.task_kind }) !== 'BOUNDED') throw new Error('worker packet may not carry complex development authority');
  if (packet.recursive_delegation_allowed) throw new Error('recursive worker delegation is disabled by default');
  const required = ['objective', 'scope', 'allowed_paths', 'acceptance_criteria', 'expected_evidence', 'authority_limit', 'manager_provenance'];
  for (const field of required) if (packet[field] == null) throw new Error(`worker packet missing ${field}`);
  return true;
}

export async function executeWorkerPacket({ model_id, packet, root, executor } = {}) {
  validateWorkerPacket(packet);
  if (typeof executor !== 'function') throw new Error('worker executor is required');
  const registry = loadModelRegistry(root);
  const model = registry.models?.[model_id];
  if (!model) throw new Error(`model is not registered: ${model_id}`);
  const policy = loadDevelopmentPolicy(root);
  if (!isLesserTaskModel(model, policy) && !isManagerChairModel(model, policy)) {
    throw new Error(`model is not eligible for bounded worker execution: ${model_id}`);
  }
  const binding = bestAvailableBinding(model);
  if (!binding) throw new Error(`model has no AVAILABLE runtime binding: ${model_id}`);
  const started_at = now();
  const result = await executor({ model, binding, packet });
  const event = {
    event: 'WORKER_PACKET_EXECUTED',
    model_id,
    runtime_id: binding.runtime_id,
    manager_provenance: packet.manager_provenance,
    authority_limit: packet.authority_limit,
    started_at,
    finished_at: now(),
  };
  appendJsonl('events/worker-packets.jsonl', event, root);
  writeJsonAtomic('state/worker-assignment-last.json', { ...event, status: 'COMPLETED' }, root);
  return { event, result };
}

export { buildWorkerPacket };
