import { loadDevelopmentPolicy, saveDevelopmentPolicy, isLesserTaskModel, isManagerChairModel } from './development-policy.mjs';
import { chatSelectableModels, loadModelRegistry } from './model-registry.mjs';
import { loadRuntimeHealth } from './runtime-health.mjs';

function policyEntry(model, selected) {
  return {
    model_id: model.model_id,
    display_name: model.display_name,
    provider: model.provider,
    availability: model.availability,
    selected,
    chat_visible: true,
  };
}

export function getModelsSettings(root) {
  const registry = loadModelRegistry(root);
  const policy = loadDevelopmentPolicy(root);
  const runtimeHealth = loadRuntimeHealth(root);
  const models = chatSelectableModels(root);

  return {
    schema_version: 1,
    surface_contract: 'SETTINGS_MODELS',
    connections: Object.values(registry.connections ?? {}).map((connection) => ({
      connection_id: connection.connection_id,
      type: connection.type,
      name: connection.name,
      base_url: connection.base_url,
      project: connection.project,
      organisation: connection.organisation,
      secure_secret_ref: connection.secure_secret_ref,
      auth_state: connection.auth_state,
      discovery_supported: connection.discovery_supported,
    })),
    available_models: models,
    manager_chair: {
      mode: policy.manager_chair?.mode ?? 'QUALITY_FIRST',
      models: models.map((model) => policyEntry(model, isManagerChairModel(model, policy))),
    },
    lesser_task_pool: {
      models: models.map((model) => policyEntry(model, isLesserTaskModel(model, policy))),
    },
    harness_assignments: Object.values(registry.runtimes ?? {}).map((runtime) => ({
      ...runtime,
      model_ids: models
        .filter((model) => (model.bindings ?? []).some((binding) => binding.runtime_id === runtime.runtime_id))
        .map((model) => model.model_id),
    })),
    routing_policy: {
      mode: policy.mode,
      cost_and_throughput_priority: policy.cost_and_throughput_priority,
      recursive_worker_delegation: policy.recursive_worker_delegation,
      independent_review: policy.independent_review,
    },
    health_and_capacity: {
      runtimes: runtimeHealth.runtimes ?? {},
      models: Object.fromEntries(models.map((model) => [model.model_id, {
        availability: model.availability,
        last_probe: model.last_probe,
        bindings: model.bindings,
      }])),
    },
  };
}

function assertRegisteredModels(modelIds, root) {
  const registry = loadModelRegistry(root);
  for (const modelId of modelIds) {
    if (!registry.models?.[modelId]) throw new Error(`cannot configure unregistered model: ${modelId}`);
  }
}

export function configureManagerChairModels(modelIds, root) {
  const unique = [...new Set(modelIds ?? [])];
  assertRegisteredModels(unique, root);
  const current = loadDevelopmentPolicy(root);
  return saveDevelopmentPolicy({
    ...current,
    manager_chair: {
      ...current.manager_chair,
      explicit_model_ids: unique,
      use_default_quality_families: false,
    },
  }, root);
}

export function configureLesserTaskModels(modelIds, root) {
  const unique = [...new Set(modelIds ?? [])];
  assertRegisteredModels(unique, root);
  const current = loadDevelopmentPolicy(root);
  return saveDevelopmentPolicy({
    ...current,
    lesser_task_pool: {
      ...current.lesser_task_pool,
      explicit_model_ids: unique,
      use_default_worker_families: false,
    },
  }, root);
}
