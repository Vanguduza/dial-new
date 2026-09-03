import crypto from 'node:crypto';
import { appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';
import { healthFresh, loadRuntimeHealth, runtimeEligible } from './runtime-health.mjs';

export const HERMES_RUNTIME_POLICY = Object.freeze([
  {
    runtime: 'codex_app_server',
    requested_model: 'gpt-5.6-sol',
    role: 'HERMES_PRIMARY_RUNTIME',
    hard_pin: true,
    rank: 10,
  },
  {
    runtime: 'claude_code',
    requested_model: 'claude-sonnet-5',
    role: 'HERMES_FALLBACK_RUNTIME',
    hard_pin: true,
    rank: 20,
  },
]);

function now() { return new Date().toISOString(); }

export function selectHermesRuntime(runtimeHealth, policy = HERMES_RUNTIME_POLICY) {
  const runtimes = runtimeHealth?.runtimes ?? {};
  for (const candidate of [...policy].sort((a, b) => a.rank - b.rank)) {
    const health = runtimes[candidate.runtime];
    if (!health) continue;
    if (!runtimeEligible(health, { hardPin: candidate.hard_pin, requireFresh: true })) continue;
    if (health.requested_model !== candidate.requested_model) continue;
    if (candidate.hard_pin && health.resolved_model !== candidate.requested_model) continue;
    return { ...candidate, health };
  }
  return null;
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
    schema_version: 2,
    selection_id: crypto.randomUUID(),
    authority: 'HERMES_RUNTIME_ONLY',
    role: candidate.role,
    runtime: candidate.runtime,
    requested_model: candidate.requested_model,
    resolved_model: candidate.health.resolved_model,
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

export function reconcileHermesRuntime({ root, runtimeHealth = loadRuntimeHealth(root) } = {}) {
  const previous = readJson('state/hermes-runtime.json', null, root);
  const candidate = selectHermesRuntime(runtimeHealth);

  if (!candidate) {
    if (previous?.status === 'ACTIVE') expireHermesRuntimeSelection('NO_HERMES_RUNTIME_AVAILABLE', root);
    return { selected: false, reason: 'NO_HERMES_RUNTIME_AVAILABLE', runtime_health: runtimeHealth };
  }

  if (
    previous?.status === 'ACTIVE'
    && previous.runtime === candidate.runtime
    && previous.requested_model === candidate.requested_model
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
