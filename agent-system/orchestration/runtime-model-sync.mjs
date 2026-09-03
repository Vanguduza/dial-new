import { availabilityFromRuntimeState, loadModelRegistry, upsertModelBinding } from './model-registry.mjs';

export function syncRuntimeBindingsHealth(runtime_id, health, root) {
  const registry = loadModelRegistry(root);
  const updated = [];
  for (const model of Object.values(registry.models ?? {})) {
    for (const binding of model.bindings ?? []) {
      if (binding.runtime_id !== runtime_id) continue;
      updated.push(upsertModelBinding({
        model_id: model.model_id,
        display_name: model.display_name,
        provider: model.provider,
        runtime_id,
        connection_id: binding.connection_id ?? null,
        availability: availabilityFromRuntimeState(health?.state),
        health: health?.state ?? 'UNKNOWN',
        capabilities: binding.capabilities ?? model.capabilities ?? [],
        context_metadata: model.context_metadata ?? null,
        auth_state: health?.state === 'AUTH_FAILED' ? 'AUTH_REQUIRED' : binding.auth_state ?? 'AUTHENTICATED_OR_NOT_REQUIRED',
        last_probe: health?.observed_at ?? new Date().toISOString(),
      }, root));
    }
  }
  return updated;
}
