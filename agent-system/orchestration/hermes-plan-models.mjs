import { appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';
import { healthFresh, normalizeRuntimeHealth, runtimeEligible } from './runtime-health.mjs';

export const HERMES_PREFERRED_CODEX_MODEL = 'gpt-5.6-sol';
export const HERMES_PREFERRED_CLAUDE_MODEL = 'claude-sonnet-5';
export const HERMES_PLAN_MODELS_PATH = 'state/hermes-plan-models.json';

export const CLAUDE_HERMES_CLASS = Object.freeze({
  SONNET: 'sonnet',
  FABLE: 'fable',
  OPUS: 'opus',
  HAIKU: 'haiku',
  UNKNOWN: 'unknown',
});

function now() { return new Date().toISOString(); }

export function emptyHermesPlanModels() {
  return {
    schema_version: 1,
    authority: 'HERMES_RUNTIME_ONLY',
    updated_at: null,
    runtimes: {
      codex_app_server: {
        source: 'unavailable',
        preferred_model: HERMES_PREFERRED_CODEX_MODEL,
        models: [],
      },
      claude_code: {
        source: 'unavailable',
        preferred_model: HERMES_PREFERRED_CLAUDE_MODEL,
        models: [],
      },
    },
  };
}

export function normalizeModelId(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '-');
}

export function classifyCodexHermesModel(modelId) {
  const id = String(modelId ?? '').trim();
  if (!id) {
    return { class: 'unknown', hermes_eligible: false, preferred: false, reason: 'MISSING_MODEL_ID' };
  }
  const preferred = id === HERMES_PREFERRED_CODEX_MODEL;
  return {
    class: 'codex_plan',
    hermes_eligible: true,
    preferred,
    reason: preferred ? 'HERMES_PREFERRED_CODEX_MODEL' : 'CODEX_IN_PLAN_FALLBACK',
  };
}

export function classifyClaudeHermesModel(modelId) {
  const id = normalizeModelId(modelId);
  if (!id) {
    return { class: CLAUDE_HERMES_CLASS.UNKNOWN, hermes_eligible: false, preferred: false, reason: 'MISSING_MODEL_ID' };
  }

  // `best` is Claude Code's latest-Fable alias. Exact Fable 5 vs 5.1 is not a Hermes pin.
  if (id === 'best' || id === 'fable' || id === 'fable[1m]' || /(^|[^a-z])fable([^a-z]|$)/.test(id)) {
    return {
      class: CLAUDE_HERMES_CLASS.FABLE,
      hermes_eligible: false,
      preferred: false,
      reason: 'FABLE_EXCLUDED_FROM_HERMES_POWER',
      note: 'Hermes Claude preference is claude-sonnet-5. Fable 5 / Fable 5.1 are not Hermes hard pins.',
    };
  }
  if (id.includes('opus')) {
    return {
      class: CLAUDE_HERMES_CLASS.OPUS,
      hermes_eligible: false,
      preferred: false,
      reason: 'TOP_TIER_EXCLUDED_FROM_HERMES_POWER',
    };
  }
  if (id.includes('haiku')) {
    return {
      class: CLAUDE_HERMES_CLASS.HAIKU,
      hermes_eligible: false,
      preferred: false,
      reason: 'HAIKU_NOT_HERMES_CONTINUITY_CLASS',
    };
  }
  if (id === 'sonnet' || id === 'sonnet[1m]' || id.includes('sonnet')) {
    const preferred = id === HERMES_PREFERRED_CLAUDE_MODEL;
    return {
      class: CLAUDE_HERMES_CLASS.SONNET,
      hermes_eligible: true,
      preferred,
      reason: preferred ? 'HERMES_PREFERRED_CLAUDE_MODEL' : 'SONNET_CLASS_IN_PLAN_FALLBACK',
    };
  }
  return {
    class: CLAUDE_HERMES_CLASS.UNKNOWN,
    hermes_eligible: false,
    preferred: false,
    reason: 'UNKNOWN_CLAUDE_MODEL_NOT_USED_FOR_HERMES',
  };
}

function uniqueModelId(item) {
  if (typeof item === 'string') return item.trim();
  const id = item?.id ?? item?.model ?? item?.name ?? '';
  return String(id).trim();
}

export function parseCodexModelListEvidence(payload) {
  const pages = Array.isArray(payload) ? payload : [payload];
  const models = [];
  const seen = new Set();
  for (const page of pages) {
    const data = page?.result?.data ?? page?.data ?? [];
    if (!Array.isArray(data)) continue;
    for (const item of data) {
      const id = uniqueModelId(item);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      models.push({
        id,
        display_name: item?.displayName ?? item?.display_name ?? null,
        hidden: Boolean(item?.hidden),
        is_default: Boolean(item?.isDefault ?? item?.is_default),
      });
    }
  }
  return models;
}

export function parseClaudeModelListEvidence(payload) {
  if (payload == null) return [];
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return [];
    try {
      return parseClaudeModelListEvidence(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }
  if (Array.isArray(payload)) {
    const models = [];
    const seen = new Set();
    for (const item of payload) {
      const id = uniqueModelId(item);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      models.push({
        id,
        display_name: typeof item === 'object' ? (item.display_name ?? item.displayName ?? item.name ?? null) : null,
      });
    }
    return models;
  }
  if (typeof payload === 'object') {
    return parseClaudeModelListEvidence(payload.data ?? payload.models ?? payload.result ?? payload.used_models);
  }
  return [];
}

function normalizeListedModel(runtime, raw = {}) {
  const id = uniqueModelId(raw);
  const classification = runtime === 'claude_code'
    ? classifyClaudeHermesModel(id)
    : classifyCodexHermesModel(id);
  const details = raw.details && typeof raw.details === 'object' ? { ...raw.details } : {};
  if (raw.toolchain_usable === true || raw.identity_proven === true) {
    details.toolchain_usable = raw.toolchain_usable === true || details.toolchain_usable === true;
    details.identity_proven = raw.identity_proven === true || details.identity_proven === true;
  }
  return {
    id,
    display_name: raw.display_name ?? raw.displayName ?? null,
    hidden: Boolean(raw.hidden),
    is_default: Boolean(raw.is_default ?? raw.isDefault),
    hermes_eligible: classification.hermes_eligible,
    hermes_class: classification.class,
    eligibility_reason: classification.reason,
    preferred: classification.preferred,
    state: raw.state ?? 'UNKNOWN',
    requested_model: raw.requested_model ?? id,
    resolved_model: raw.resolved_model ?? (raw.state === 'HEALTHY' ? id : null),
    observed_at: raw.observed_at ?? null,
    details,
  };
}

function normalizeRuntimePlan(runtime, input = {}) {
  const preferred = runtime === 'claude_code' ? HERMES_PREFERRED_CLAUDE_MODEL : HERMES_PREFERRED_CODEX_MODEL;
  const models = Array.isArray(input.models) ? input.models.map((model) => normalizeListedModel(runtime, model)).filter((model) => model.id) : [];
  return {
    source: input.source ?? 'unavailable',
    source_detail: input.source_detail ?? null,
    preferred_model: preferred,
    models,
  };
}

export function normalizeHermesPlanModels(input = {}) {
  return {
    schema_version: 1,
    authority: 'HERMES_RUNTIME_ONLY',
    updated_at: input.updated_at ?? now(),
    runtimes: {
      codex_app_server: normalizeRuntimePlan('codex_app_server', input.runtimes?.codex_app_server ?? {}),
      claude_code: normalizeRuntimePlan('claude_code', input.runtimes?.claude_code ?? {}),
    },
  };
}

export function loadHermesPlanModels(root) {
  const stored = readJson(HERMES_PLAN_MODELS_PATH, null, root);
  return stored ? normalizeHermesPlanModels(stored) : emptyHermesPlanModels();
}

export function saveHermesPlanModels(plan, root) {
  const normalized = normalizeHermesPlanModels(plan);
  writeJsonAtomic(HERMES_PLAN_MODELS_PATH, normalized, root);
  appendJsonl('events/hermes-plan-models.jsonl', {
    event: 'HERMES_PLAN_MODELS_RECORDED',
    authority: 'HERMES_RUNTIME_ONLY',
    codex_source: normalized.runtimes.codex_app_server.source,
    claude_source: normalized.runtimes.claude_code.source,
    codex_models: normalized.runtimes.codex_app_server.models.map((model) => model.id),
    claude_models: normalized.runtimes.claude_code.models.map((model) => model.id),
    at: normalized.updated_at,
  }, root);
  return normalized;
}

export function injectHermesPlanModels({
  root,
  source = 'injected',
  source_detail = 'deterministic test or operator-injected subscription plan list',
  codex = [],
  claude = [],
} = {}) {
  return saveHermesPlanModels({
    authority: 'HERMES_RUNTIME_ONLY',
    runtimes: {
      codex_app_server: { source, source_detail, models: codex },
      claude_code: { source, source_detail, models: claude },
    },
  }, root);
}

export function planModelAsHealth(runtime, model = {}) {
  return normalizeRuntimeHealth({
    runtime,
    state: model.state ?? 'UNKNOWN',
    requested_model: model.requested_model ?? model.id ?? null,
    resolved_model: model.resolved_model ?? null,
    observed_at: model.observed_at ?? null,
    reason: model.eligibility_reason ?? model.reason ?? null,
    details: {
      ...(model.details ?? {}),
      identity_proven: model.details?.identity_proven === true || (
        Boolean(model.resolved_model)
        && model.resolved_model === (model.requested_model ?? model.id)
      ),
      toolchain_usable: model.details?.toolchain_usable === true,
      plan_source: true,
    },
  });
}

function slotMatchesModel(slot, modelId) {
  return Boolean(slot && (slot.requested_model === modelId || slot.resolved_model === modelId));
}

export function healthForPlanModel(runtime, model, runtimeHealth) {
  const fromPlan = planModelAsHealth(runtime, model);
  const slot = runtimeHealth?.runtimes?.[runtime];
  if (slot && slotMatchesModel(slot, model.id)) return slot;
  if (fromPlan.state === 'HEALTHY' && runtimeEligible(fromPlan, { hardPin: true, requireFresh: true })) {
    return fromPlan;
  }
  return fromPlan;
}

export function planModelSelectable(runtime, model, runtimeHealth) {
  if (!model?.id || model.hermes_eligible !== true) return false;
  return runtimeEligible(healthForPlanModel(runtime, model, runtimeHealth), { hardPin: true, requireFresh: true });
}

export function listedCodexPlanModels(planModels, runtimeHealth) {
  const listed = planModels?.runtimes?.codex_app_server?.models ?? [];
  const ids = new Set(listed.map((model) => model.id));
  const slot = runtimeHealth?.runtimes?.codex_app_server;
  if (slot?.requested_model && !ids.has(slot.requested_model) && slot.requested_model === HERMES_PREFERRED_CODEX_MODEL) {
    return [
      normalizeListedModel('codex_app_server', {
        id: HERMES_PREFERRED_CODEX_MODEL,
        state: slot.state,
        requested_model: slot.requested_model,
        resolved_model: slot.resolved_model,
        observed_at: slot.observed_at,
        details: slot.details,
      }),
      ...listed,
    ];
  }
  return listed;
}

export function nextEligibleCodexPlanModels(planModels, runtimeHealth, { exclude = [HERMES_PREFERRED_CODEX_MODEL] } = {}) {
  const excluded = new Set(exclude.filter(Boolean));
  return listedCodexPlanModels(planModels, runtimeHealth)
    .filter((model) => !excluded.has(model.id))
    .filter((model) => model.hermes_eligible);
}

export function nextEligibleClaudePlanModels(planModels, runtimeHealth, { exclude = [HERMES_PREFERRED_CLAUDE_MODEL] } = {}) {
  const excluded = new Set(exclude.filter(Boolean));
  return (planModels?.runtimes?.claude_code?.models ?? [])
    .filter((model) => !excluded.has(model.id))
    .filter((model) => model.hermes_eligible);
}

export function preferredModelHealthy(slot, preferredModel) {
  if (!slot) return false;
  if (slot.requested_model !== preferredModel) return false;
  if (!runtimeEligible(slot, { hardPin: true, requireFresh: true })) return false;
  return healthFresh(slot);
}
