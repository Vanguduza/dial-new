import { appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';

export const MODEL_AVAILABILITY_STATES = Object.freeze([
  'AVAILABLE',
  'LIMIT_REACHED',
  'RATE_LIMITED',
  'AUTH_REQUIRED',
  'UNAVAILABLE',
  'MODEL_DISABLED',
  'UNKNOWN',
]);

export const CONNECTION_TYPES = Object.freeze([
  'CLAUDE_CODE_SUBSCRIPTION',
  'CODEX_CHATGPT_SUBSCRIPTION',
  'OPENAI_API',
  'DEEPSEEK_HARNESS',
  'CUSTOM_API',
  'LOCAL_RUNTIME',
]);

export const RUNTIME_CAPABILITIES = Object.freeze([
  'CHAT',
  'TOOLS',
  'REPOSITORY_READ',
  'REPOSITORY_WRITE',
  'SHELL',
  'MODEL_DISCOVERY',
  'LOCAL_EXECUTION',
  'WORKER_PACKETS',
]);

export const DEFAULT_MANAGER_CHAIR_FAMILIES = Object.freeze(['fable', 'opus', 'sol']);
export const DEFAULT_LESSER_TASK_FAMILIES = Object.freeze(['sonnet', 'terra', 'luna', 'deepseek']);

function now() { return new Date().toISOString(); }

function emptyRegistry() {
  return {
    schema_version: 1,
    runtimes: {},
    connections: {},
    models: {},
    updated_at: now(),
  };
}

export function loadModelRegistry(root) {
  return readJson('state/model-registry.json', emptyRegistry(), root);
}

function saveRegistry(registry, root, event = null) {
  registry.schema_version = 1;
  registry.updated_at = now();
  writeJsonAtomic('state/model-registry.json', registry, root);
  if (event) appendJsonl('events/model-registry.jsonl', { ...event, at: now() }, root);
  return registry;
}

function assertEnum(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} must be one of: ${allowed.join(', ')}`);
}

function assertNoCredentialFields(value, path = 'connection') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(api[_-]?key|token|access[_-]?token|refresh[_-]?token|password|secret|cookie|authorization)$/i.test(key)) {
      throw new Error(`${path}.${key} may not persist credential material; use secure_secret_ref`);
    }
    if (child && typeof child === 'object') assertNoCredentialFields(child, `${path}.${key}`);
  }
}

export function registerConnection(connection, root) {
  if (!connection?.connection_id) throw new Error('connection_id is required');
  assertEnum(connection.type, CONNECTION_TYPES, 'connection type');
  assertNoCredentialFields(connection);
  const registry = loadModelRegistry(root);
  registry.connections[connection.connection_id] = {
    connection_id: connection.connection_id,
    type: connection.type,
    name: connection.name ?? connection.connection_id,
    base_url: connection.base_url ?? null,
    project: connection.project ?? null,
    organisation: connection.organisation ?? null,
    secure_secret_ref: connection.secure_secret_ref ?? null,
    auth_state: connection.auth_state ?? 'UNKNOWN',
    discovery_supported: Boolean(connection.discovery_supported),
    updated_at: now(),
  };
  return saveRegistry(registry, root, { event: 'CONNECTION_REGISTERED', connection_id: connection.connection_id, type: connection.type });
}

export function registerRuntime(runtime, root) {
  if (!runtime?.runtime_id) throw new Error('runtime_id is required');
  const capabilities = [...new Set(runtime.capabilities ?? [])];
  for (const capability of capabilities) assertEnum(capability, RUNTIME_CAPABILITIES, 'runtime capability');
  const registry = loadModelRegistry(root);
  registry.runtimes[runtime.runtime_id] = {
    runtime_id: runtime.runtime_id,
    display_name: runtime.display_name ?? runtime.runtime_id,
    harness: runtime.harness ?? runtime.display_name ?? runtime.runtime_id,
    connection_id: runtime.connection_id ?? null,
    capabilities,
    health: runtime.health ?? 'UNKNOWN',
    last_probe: runtime.last_probe ?? null,
    updated_at: now(),
  };
  return saveRegistry(registry, root, { event: 'RUNTIME_REGISTERED', runtime_id: runtime.runtime_id });
}

export function availabilityFromRuntimeState(state) {
  switch (state) {
    case 'HEALTHY': return 'AVAILABLE';
    case 'ACCOUNT_LIMITED': return 'LIMIT_REACHED';
    case 'RATE_LIMITED': return 'RATE_LIMITED';
    case 'AUTH_FAILED': return 'AUTH_REQUIRED';
    case 'MODEL_LIMITED':
    case 'PROCESS_FAILED':
    case 'STALLED':
    case 'TOOLCHAIN_DEGRADED': return 'UNAVAILABLE';
    case 'DRAINING':
    case 'UNKNOWN':
    default: return 'UNKNOWN';
  }
}

function aggregateAvailability(bindings) {
  if (bindings.some((binding) => binding.availability === 'AVAILABLE')) return 'AVAILABLE';
  const order = ['AUTH_REQUIRED', 'LIMIT_REACHED', 'RATE_LIMITED', 'MODEL_DISABLED', 'UNAVAILABLE', 'UNKNOWN'];
  return order.find((state) => bindings.some((binding) => binding.availability === state)) ?? 'UNKNOWN';
}

export function upsertModelBinding({
  model_id,
  display_name,
  provider,
  runtime_id,
  connection_id = null,
  availability = 'UNKNOWN',
  health = 'UNKNOWN',
  capabilities = [],
  context_metadata = null,
  auth_state = 'UNKNOWN',
  last_probe = null,
}, root) {
  if (!model_id) throw new Error('model_id is required');
  if (!runtime_id) throw new Error('runtime_id is required');
  assertEnum(availability, MODEL_AVAILABILITY_STATES, 'model availability');
  const registry = loadModelRegistry(root);
  if (!registry.runtimes[runtime_id]) {
    throw new Error(`runtime is not registered: ${runtime_id}`);
  }
  const existing = registry.models[model_id] ?? {
    model_id,
    display_name: display_name ?? model_id,
    provider: provider ?? null,
    chat_visible: true,
    bindings: [],
    capabilities: [],
    context_metadata: null,
    availability: 'UNKNOWN',
    last_probe: null,
  };
  const binding = {
    runtime_id,
    connection_id,
    availability,
    health,
    capabilities: [...new Set(capabilities)],
    auth_state,
    last_probe,
  };
  const bindings = existing.bindings.filter((item) => !(item.runtime_id === runtime_id && item.connection_id === connection_id));
  bindings.push(binding);
  existing.display_name = display_name ?? existing.display_name ?? model_id;
  existing.provider = provider ?? existing.provider ?? null;
  existing.chat_visible = true;
  existing.bindings = bindings;
  existing.capabilities = [...new Set(bindings.flatMap((item) => item.capabilities ?? []))];
  existing.context_metadata = context_metadata ?? existing.context_metadata ?? null;
  existing.availability = aggregateAvailability(bindings);
  existing.last_probe = last_probe ?? existing.last_probe ?? null;
  registry.models[model_id] = existing;
  saveRegistry(registry, root, { event: 'MODEL_BINDING_UPSERTED', model_id, runtime_id, availability });
  return existing;
}

export function syncModelBindingFromRuntimeHealth({ model_id, display_name, provider, runtime_id, connection_id = null, health, capabilities = [] }, root) {
  return upsertModelBinding({
    model_id,
    display_name,
    provider,
    runtime_id,
    connection_id,
    availability: availabilityFromRuntimeState(health?.state),
    health: health?.state ?? 'UNKNOWN',
    capabilities,
    auth_state: health?.state === 'AUTH_FAILED' ? 'AUTH_REQUIRED' : 'AUTHENTICATED_OR_NOT_REQUIRED',
    last_probe: health?.observed_at ?? now(),
  }, root);
}

export function registerDiscoveredModels({ runtime_id, connection_id = null, provider, models = [], capabilities = [] }, root) {
  return models.map((model) => upsertModelBinding({
    model_id: typeof model === 'string' ? model : model.model_id,
    display_name: typeof model === 'string' ? model : (model.display_name ?? model.model_id),
    provider: typeof model === 'string' ? provider : (model.provider ?? provider),
    runtime_id,
    connection_id,
    availability: typeof model === 'string' ? 'AVAILABLE' : (model.availability ?? 'AVAILABLE'),
    health: typeof model === 'string' ? 'HEALTHY' : (model.health ?? 'HEALTHY'),
    capabilities: typeof model === 'string' ? capabilities : (model.capabilities ?? capabilities),
    context_metadata: typeof model === 'string' ? null : (model.context_metadata ?? null),
    auth_state: typeof model === 'string' ? 'AUTHENTICATED_OR_NOT_REQUIRED' : (model.auth_state ?? 'AUTHENTICATED_OR_NOT_REQUIRED'),
    last_probe: typeof model === 'string' ? now() : (model.last_probe ?? now()),
  }, root));
}

export function registeredModels(root) {
  return Object.values(loadModelRegistry(root).models ?? {});
}

export function chatSelectableModels(root) {
  return registeredModels(root).map((model) => ({ ...model, chat_visible: true }));
}

export function modelFamily(model) {
  const text = `${model?.model_id ?? ''} ${model?.display_name ?? ''}`.toLowerCase();
  if (text.includes('fable')) return 'fable';
  if (text.includes('opus')) return 'opus';
  if (text.includes('sonnet')) return 'sonnet';
  if (text.includes('terra')) return 'terra';
  if (text.includes('luna')) return 'luna';
  if (text.includes('deepseek')) return 'deepseek';
  if (/\bsol\b/.test(text) || text.includes('-sol')) return 'sol';
  return 'other';
}

export function defaultManagerChairEligible(model) {
  return DEFAULT_MANAGER_CHAIR_FAMILIES.includes(modelFamily(model));
}

export function defaultLesserTaskEligible(model) {
  return DEFAULT_LESSER_TASK_FAMILIES.includes(modelFamily(model));
}

export function bestAvailableBinding(model) {
  const available = (model?.bindings ?? []).filter((binding) => binding.availability === 'AVAILABLE');
  return available[0] ?? null;
}
