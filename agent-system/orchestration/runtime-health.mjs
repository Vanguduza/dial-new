export const RUNTIME_STATES = Object.freeze([
  "HEALTHY",
  "DRAINING",
  "RATE_LIMITED",
  "MODEL_LIMITED",
  "ACCOUNT_LIMITED",
  "AUTH_FAILED",
  "PROCESS_FAILED",
  "STALLED",
  "TOOLCHAIN_DEGRADED",
  "UNKNOWN"
]);

export const DEFAULT_MANAGER_HEALTH_MAX_AGE_MS = 5 * 60 * 1000;

const RETRYABLE = new Set(["RATE_LIMITED", "MODEL_LIMITED", "PROCESS_FAILED", "STALLED", "TOOLCHAIN_DEGRADED", "UNKNOWN"]);
const TERMINAL_UNTIL_EXTERNAL_CHANGE = new Set(["ACCOUNT_LIMITED", "AUTH_FAILED"]);

export function isRuntimeState(value) {
  return RUNTIME_STATES.includes(value);
}

export function normalizeRuntimeHealth(input = {}) {
  const state = isRuntimeState(input.state) ? input.state : "UNKNOWN";
  return {
    state,
    runtime: input.runtime ?? null,
    requested_model: input.requested_model ?? null,
    resolved_model: input.resolved_model ?? null,
    reason: input.reason ?? null,
    observed_at: input.observed_at ?? new Date().toISOString(),
    retry_after: input.retry_after ?? null,
    details: input.details ?? null
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

export function healthFresh(health, { maxAgeMs = DEFAULT_MANAGER_HEALTH_MAX_AGE_MS, nowMs = Date.now() } = {}) {
  const observedAt = health?.observed_at;
  if (!observedAt) return false;
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) return false;
  const ageMs = nowMs - observedMs;
  return ageMs >= 0 && ageMs <= maxAgeMs;
}

export function managerEligible(health, { hardPin = true, requireFresh = true, maxAgeMs = DEFAULT_MANAGER_HEALTH_MAX_AGE_MS, nowMs = Date.now() } = {}) {
  const h = normalizeRuntimeHealth(health);
  if (h.state !== "HEALTHY") return false;
  if (hardPin && !modelIdentityMatches(h)) return false;
  if (requireFresh && !healthFresh(health, { maxAgeMs, nowMs })) return false;
  return true;
}
