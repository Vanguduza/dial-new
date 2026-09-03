import { appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';
import { syncRuntimeBindingsHealth } from './runtime-model-sync.mjs';

export const RUNTIME_STATES = Object.freeze([
  'HEALTHY',
  'DRAINING',
  'RATE_LIMITED',
  'MODEL_LIMITED',
  'ACCOUNT_LIMITED',
  'AUTH_FAILED',
  'PROCESS_FAILED',
  'STALLED',
  'TOOLCHAIN_DEGRADED',
  'UNKNOWN',
]);

export const DEFAULT_RUNTIME_HEALTH_MAX_AGE_MS = 5 * 60 * 1000;
// Compatibility export for older callers. Freshness is a runtime-evidence rule,
// not proof of development-management authority.
export const DEFAULT_MANAGER_HEALTH_MAX_AGE_MS = DEFAULT_RUNTIME_HEALTH_MAX_AGE_MS;

const RETRYABLE = new Set(['RATE_LIMITED', 'MODEL_LIMITED', 'PROCESS_FAILED', 'STALLED', 'TOOLCHAIN_DEGRADED', 'UNKNOWN']);
const TERMINAL_UNTIL_EXTERNAL_CHANGE = new Set(['ACCOUNT_LIMITED', 'AUTH_FAILED']);

export function isRuntimeState(value) {
  return RUNTIME_STATES.includes(value);
}

export function normalizeRuntimeHealth(input = {}) {
  const state = isRuntimeState(input.state) ? input.state : 'UNKNOWN';
  return {
    state,
    runtime: input.runtime ?? null,
    requested_model: input.requested_model ?? null,
    resolved_model: input.resolved_model ?? null,
    reason: input.reason ?? null,
    observed_at: input.observed_at ?? new Date().toISOString(),
    retry_after: input.retry_after ?? null,
    details: input.details ?? null,
  };
}

export function canRetry(health) {
  return RETRYABLE.has(normalizeRuntimeHealth(health).state);
}

export function requiresExternalChange(health) {
  return TERMINAL_UNTIL_EXTERNAL_CHANGE.has(normalizeRuntimeHealth(health).state);
}

export function modelIdentityMatches(health) {
  const h = normalizeRuntimeHealth(health);
  if (!h.requested_model || !h.resolved_model) return false;
  return h.requested_model === h.resolved_model;
}

export function healthFresh(health, { maxAgeMs = DEFAULT_RUNTIME_HEALTH_MAX_AGE_MS, nowMs = Date.now() } = {}) {
  const observedAt = health?.observed_at;
  if (!observedAt) return false;
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) return false;
  const ageMs = nowMs - observedMs;
  return ageMs >= 0 && ageMs <= maxAgeMs;
}

export function runtimeEligible(health, { hardPin = true, requireFresh = true, maxAgeMs = DEFAULT_RUNTIME_HEALTH_MAX_AGE_MS, nowMs = Date.now() } = {}) {
  const h = normalizeRuntimeHealth(health);
  if (h.state !== 'HEALTHY') return false;
  if (hardPin && !modelIdentityMatches(h)) return false;
  if (requireFresh && !healthFresh(health, { maxAgeMs, nowMs })) return false;
  return true;
}

// Deprecated semantic alias retained only to avoid breaking external scripts while
// the branch migrates. This answers runtime eligibility only; callers must use the
// development policy/Manager Chair APIs for development authority.
export function managerEligible(health, options = {}) {
  return runtimeEligible(health, options);
}

export function loadRuntimeHealth(root) {
  const current = readJson('state/runtime-health.json', null, root);
  if (current) return current;
  const legacy = readJson('state/model-availability.json', null, root);
  if (legacy) {
    const migrated = { schema_version: 1, runtimes: legacy.runtimes ?? {}, updated_at: legacy.updated_at ?? new Date().toISOString() };
    writeJsonAtomic('state/runtime-health.json', migrated, root);
    appendJsonl('events/runtime-health.jsonl', { event: 'LEGACY_MODEL_AVAILABILITY_MIGRATED', at: new Date().toISOString() }, root);
    return migrated;
  }
  return { schema_version: 1, runtimes: {}, updated_at: null };
}

export function recordRuntimeHealth(runtime, health, root) {
  const current = loadRuntimeHealth(root);
  current.schema_version = 1;
  current.updated_at = new Date().toISOString();
  current.runtimes[runtime] = normalizeRuntimeHealth({ ...health, runtime });
  writeJsonAtomic('state/runtime-health.json', current, root);
  appendJsonl('events/runtime-health.jsonl', { event: 'RUNTIME_HEALTH_RECORDED', ...current.runtimes[runtime] }, root);
  // If a model is already registered through this runtime, its user-visible
  // availability follows the latest runtime evidence. Unavailable models remain
  // in the registry; only their state changes.
  syncRuntimeBindingsHealth(runtime, current.runtimes[runtime], root);
  return current.runtimes[runtime];
}
