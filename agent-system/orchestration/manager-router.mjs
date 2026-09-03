import crypto from 'node:crypto';
import { managerEligible, normalizeRuntimeHealth } from './runtime-health.mjs';
import { appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';

export const DEFAULT_MANAGER_POLICY = Object.freeze([
  {
    runtime: 'codex_app_server',
    requested_model: 'gpt-5.6-sol',
    role: 'PRIMARY_MANAGER',
    hard_pin: true,
    rank: 10,
  },
  {
    runtime: 'claude_code',
    requested_model: 'claude-sonnet-5',
    role: 'FAILOVER_MANAGER',
    hard_pin: true,
    rank: 20,
  },
]);

export function loadAvailability(root) {
  return readJson('state/model-availability.json', { schema_version: 1, runtimes: {} }, root);
}

export function recordRuntimeHealth(runtime, health, root) {
  const current = loadAvailability(root);
  current.schema_version = 1;
  current.updated_at = new Date().toISOString();
  current.runtimes[runtime] = normalizeRuntimeHealth({ ...health, runtime });
  writeJsonAtomic('state/model-availability.json', current, root);
  appendJsonl('events/runtime-health.jsonl', current.runtimes[runtime], root);
  return current.runtimes[runtime];
}

export function selectManager(availability, policy = DEFAULT_MANAGER_POLICY) {
  const runtimes = availability?.runtimes ?? {};
  for (const candidate of [...policy].sort((a, b) => a.rank - b.rank)) {
    const health = runtimes[candidate.runtime];
    if (!health) continue;
    if (!managerEligible(health, { hardPin: candidate.hard_pin })) continue;
    if (health.requested_model !== candidate.requested_model) continue;
    return { ...candidate, health };
  }
  return null;
}

export function issueManagerLease({ candidate, feature_id = null, worktree = null, atomic_unit = null, previous_lease_id = null }, root) {
  if (!candidate) throw new Error('manager candidate is required');
  const now = new Date().toISOString();
  const lease = {
    schema_version: 1,
    lease_id: crypto.randomUUID(),
    role: 'DIAL_MANAGER',
    runtime: candidate.runtime,
    requested_model: candidate.requested_model,
    resolved_model: candidate.health?.resolved_model ?? null,
    feature_id,
    worktree,
    atomic_unit,
    status: 'ACTIVE',
    acquired_at: now,
    previous_lease_id,
    renewal_boundary: 'ATOMIC_UNIT',
  };
  writeJsonAtomic('state/manager-lease.json', lease, root);
  appendJsonl('events/manager-leases.jsonl', { event: 'LEASE_ISSUED', ...lease }, root);
  return lease;
}

export function expireManagerLease(reason = 'UNSPECIFIED', root) {
  const existing = readJson('state/manager-lease.json', null, root);
  if (!existing) return null;
  const expired = {
    ...existing,
    status: 'EXPIRED',
    expired_at: new Date().toISOString(),
    expiration_reason: reason,
  };
  writeJsonAtomic('state/manager-lease.json', expired, root);
  appendJsonl('events/manager-leases.jsonl', { event: 'LEASE_EXPIRED', ...expired }, root);
  return expired;
}
