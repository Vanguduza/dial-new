import crypto from 'node:crypto';
import { appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';
import { healthFresh, loadRuntimeHealth, runtimeEligible } from './runtime-health.mjs';
import {
  HERMES_PREFERRED_CLAUDE_MODEL,
  HERMES_PREFERRED_CODEX_MODEL,
  healthForPlanModel,
  listedCodexPlanModels,
  loadHermesPlanModels,
  nextEligibleClaudePlanModels,
  nextEligibleCodexPlanModels,
  planModelSelectable,
  preferredModelHealthy,
} from './hermes-plan-models.mjs';

export const HERMES_RUNTIME_POLICY = Object.freeze([
  {
    runtime: 'codex_app_server',
    requested_model: HERMES_PREFERRED_CODEX_MODEL,
    preferred_model: HERMES_PREFERRED_CODEX_MODEL,
    role: 'HERMES_PRIMARY_RUNTIME',
    hard_pin: true,
    rank: 10,
  },
  {
    runtime: 'claude_code',
    requested_model: HERMES_PREFERRED_CLAUDE_MODEL,
    preferred_model: HERMES_PREFERRED_CLAUDE_MODEL,
    role: 'HERMES_FALLBACK_RUNTIME',
    hard_pin: true,
    rank: 20,
  },
]);

function now() { return new Date().toISOString(); }

function candidateFromSlot({ runtime, role, preferred_model, requested_model, health, in_plan_fallback = false, plan_source = null }) {
  return {
    runtime,
    role,
    preferred_model,
    requested_model,
    selected_model: health.resolved_model,
    hard_pin: true,
    in_plan_fallback,
    plan_source,
    health,
  };
}

export function selectHermesRuntime(runtimeHealth, options = {}) {
  const policy = Array.isArray(options) ? options : (options.policy ?? HERMES_RUNTIME_POLICY);
  const planModels = Array.isArray(options) ? loadHermesPlanModels() : (options.planModels ?? emptyPlanFromHealth());
  const includeRuntimes = new Set(Array.isArray(options) ? ['codex_app_server', 'claude_code'] : (options.includeRuntimes ?? ['codex_app_server', 'claude_code']));
  const runtimes = runtimeHealth?.runtimes ?? {};
  const preferredByRuntime = Object.fromEntries(policy.map((item) => [item.runtime, item]));

  const solPolicy = preferredByRuntime.codex_app_server;
  const solHealth = runtimes.codex_app_server;
  if (includeRuntimes.has('codex_app_server') && solPolicy && preferredModelHealthy(solHealth, solPolicy.preferred_model ?? HERMES_PREFERRED_CODEX_MODEL)) {
    return candidateFromSlot({
      runtime: 'codex_app_server',
      role: 'HERMES_PRIMARY_RUNTIME',
      preferred_model: HERMES_PREFERRED_CODEX_MODEL,
      requested_model: HERMES_PREFERRED_CODEX_MODEL,
      health: solHealth,
      in_plan_fallback: false,
      plan_source: planModels?.runtimes?.codex_app_server?.source ?? null,
    });
  }

  for (const model of includeRuntimes.has('codex_app_server') ? nextEligibleCodexPlanModels(planModels, runtimeHealth) : []) {
    if (!planModelSelectable('codex_app_server', model, runtimeHealth)) continue;
    const health = healthForPlanModel('codex_app_server', model, runtimeHealth);
    return candidateFromSlot({
      runtime: 'codex_app_server',
      role: 'HERMES_PRIMARY_RUNTIME',
      preferred_model: HERMES_PREFERRED_CODEX_MODEL,
      requested_model: model.id,
      health,
      in_plan_fallback: true,
      plan_source: planModels?.runtimes?.codex_app_server?.source ?? null,
    });
  }

  // If the current Codex slot is a listed in-plan model (not Sol) and HEALTHY, keep it.
  if (
    includeRuntimes.has('codex_app_server')
    && solHealth
    && solHealth.requested_model
    && solHealth.requested_model !== HERMES_PREFERRED_CODEX_MODEL
    && listedCodexPlanModels(planModels, runtimeHealth).some((model) => model.id === solHealth.requested_model && model.hermes_eligible)
    && runtimeEligible(solHealth, { hardPin: true, requireFresh: true })
  ) {
    return candidateFromSlot({
      runtime: 'codex_app_server',
      role: 'HERMES_PRIMARY_RUNTIME',
      preferred_model: HERMES_PREFERRED_CODEX_MODEL,
      requested_model: solHealth.requested_model,
      health: solHealth,
      in_plan_fallback: true,
      plan_source: planModels?.runtimes?.codex_app_server?.source ?? null,
    });
  }

  const sonnetPolicy = preferredByRuntime.claude_code;
  const sonnetHealth = runtimes.claude_code;
  if (includeRuntimes.has('claude_code') && sonnetPolicy && preferredModelHealthy(sonnetHealth, sonnetPolicy.preferred_model ?? HERMES_PREFERRED_CLAUDE_MODEL)) {
    return candidateFromSlot({
      runtime: 'claude_code',
      role: 'HERMES_FALLBACK_RUNTIME',
      preferred_model: HERMES_PREFERRED_CLAUDE_MODEL,
      requested_model: HERMES_PREFERRED_CLAUDE_MODEL,
      health: sonnetHealth,
      in_plan_fallback: false,
      plan_source: planModels?.runtimes?.claude_code?.source ?? null,
    });
  }

  for (const model of includeRuntimes.has('claude_code') ? nextEligibleClaudePlanModels(planModels, runtimeHealth) : []) {
    if (!planModelSelectable('claude_code', model, runtimeHealth)) continue;
    const health = healthForPlanModel('claude_code', model, runtimeHealth);
    return candidateFromSlot({
      runtime: 'claude_code',
      role: 'HERMES_FALLBACK_RUNTIME',
      preferred_model: HERMES_PREFERRED_CLAUDE_MODEL,
      requested_model: model.id,
      health,
      in_plan_fallback: true,
      plan_source: planModels?.runtimes?.claude_code?.source ?? null,
    });
  }

  return null;
}

function emptyPlanFromHealth() {
  return {
    runtimes: {
      codex_app_server: { source: 'unavailable', models: [] },
      claude_code: { source: 'unavailable', models: [] },
    },
  };
}

export function issueHermesRuntimeSelection({ candidate, previous_selection_id = null }, root) {
  if (!candidate) throw new Error('Hermes runtime candidate is required');
  if (!runtimeEligible(candidate.health, { hardPin: candidate.hard_pin ?? true, requireFresh: true })) {
    throw new Error('Hermes runtime candidate does not have fresh identity-proven HEALTHY evidence');
  }
  if (
    candidate.health.requested_model !== candidate.requested_model
    || ((candidate.hard_pin ?? true) && candidate.health.resolved_model !== candidate.requested_model)
  ) {
    throw new Error('Hermes runtime policy/model does not match runtime health evidence');
  }

  const selection = {
    schema_version: 3,
    selection_id: crypto.randomUUID(),
    authority: 'HERMES_RUNTIME_ONLY',
    role: candidate.role,
    runtime: candidate.runtime,
    preferred_model: candidate.preferred_model ?? candidate.requested_model,
    requested_model: candidate.requested_model,
    selected_model: candidate.selected_model ?? candidate.health.resolved_model,
    resolved_model: candidate.health.resolved_model,
    in_plan_fallback: Boolean(candidate.in_plan_fallback),
    plan_source: candidate.plan_source ?? null,
    runtime_session: candidate.health.details?.session_id ?? candidate.health.details?.thread_id ?? null,
    runtime_health: candidate.health.state,
    runtime_health_observed_at: candidate.health.observed_at,
    status: 'ACTIVE',
    selected_at: now(),
    previous_selection_id,
  };
  writeJsonAtomic('state/hermes-runtime.json', selection, root);
  appendJsonl('events/hermes-runtime.jsonl', { event: 'HERMES_RUNTIME_SELECTED', ...selection }, root);
  return selection;
}

export function expireHermesRuntimeSelection(reason = 'UNSPECIFIED', root) {
  const existing = readJson('state/hermes-runtime.json', null, root);
  if (!existing || existing.status !== 'ACTIVE') return existing;
  const expired = {
    ...existing,
    status: 'EXPIRED',
    expired_at: now(),
    expiration_reason: reason,
  };
  writeJsonAtomic('state/hermes-runtime.json', expired, root);
  appendJsonl('events/hermes-runtime.jsonl', { event: 'HERMES_RUNTIME_EXPIRED', ...expired }, root);
  return expired;
}

export function reconcileHermesRuntime({
  root,
  runtimeHealth = loadRuntimeHealth(root),
  planModels = loadHermesPlanModels(root),
  includeRuntimes,
} = {}) {
  const previous = readJson('state/hermes-runtime.json', null, root);
  const candidate = selectHermesRuntime(runtimeHealth, { planModels, includeRuntimes });

  if (!candidate) {
    if (previous?.status === 'ACTIVE') expireHermesRuntimeSelection('NO_HERMES_RUNTIME_AVAILABLE', root);
    return { selected: false, reason: 'NO_HERMES_RUNTIME_AVAILABLE', runtime_health: runtimeHealth, plan_models: planModels };
  }

  if (
    previous?.status === 'ACTIVE'
    && previous.runtime === candidate.runtime
    && previous.preferred_model === (candidate.preferred_model ?? previous.preferred_model)
    && previous.requested_model === candidate.requested_model
    && previous.selected_model === (candidate.selected_model ?? candidate.health.resolved_model)
    && previous.resolved_model === candidate.health.resolved_model
    && healthFresh(candidate.health)
  ) {
    return { selected: true, changed: false, selection: previous };
  }

  if (previous?.status === 'ACTIVE') expireHermesRuntimeSelection('HERMES_RUNTIME_RESELECTION', root);
  const selection = issueHermesRuntimeSelection({
    candidate,
    previous_selection_id: previous?.selection_id ?? null,
  }, root);
  return { selected: true, changed: true, selection };
}
