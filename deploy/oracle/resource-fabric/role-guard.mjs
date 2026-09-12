#!/usr/bin/env node
// Host-side task separation. The scheduler already refuses misplaced work in
// placement.mjs Gates A-E, but that only binds work that arrives THROUGH the
// scheduler. Anything dispatched over SSH, Desktop Commander, a cron entry or an
// operator's hands bypasses it entirely, and the host had no opinion of its own.
//
// This is that opinion: a host reads its own entry in hosts.json and refuses work its
// roles do not permit, whatever route the work came by. Separation enforced in one
// place is a convention; enforced at both ends it is a property.
//
// Standalone by design — no imports from agent-system/, same as the rest of this
// directory, so it keeps working when Hermes, VEKL, Claude and Codex are all down.
//
//   dial-role-guard '{"task_id":"t1","project":"dial","authority_class":"SSH_REPAIR"}'
//   dial-role-guard --self                  # describe what this host may run
//   echo '<task json>' | dial-role-guard    # exit 0 = allowed, 3 = refused
//
// Exit codes: 0 allowed, 3 refused by policy, 2 malformed input or unknown host.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const HOSTS = JSON.parse(fs.readFileSync(path.join(here, 'hosts.json'), 'utf8'));
export const POLICY = JSON.parse(fs.readFileSync(path.join(here, 'policy.json'), 'utf8'));

export const DECISION = Object.freeze({ ALLOW: 'ALLOW', REFUSE: 'REFUSE' });

export const REASON = Object.freeze({
  UNKNOWN_HOST: 'UNKNOWN_HOST',
  AUTHORITY_REQUIRES_RECOVERY_ROLE: 'AUTHORITY_REQUIRES_RECOVERY_ROLE',
  AUTHORITY_REQUIRES_CONTROL_ROLE: 'AUTHORITY_REQUIRES_CONTROL_ROLE',
  NO_DEVELOPMENT_POOL_ON_THIS_HOST: 'NO_DEVELOPMENT_POOL_ON_THIS_HOST',
  HEAVY_WORK_NOT_PERMITTED: 'HEAVY_WORK_NOT_PERMITTED',
  ARCHITECTURE_MISMATCH: 'ARCHITECTURE_MISMATCH',
  ALLOWED_BY_ROLE: 'ALLOWED_BY_ROLE',
});

export function hostEntry(hostId = os.hostname()) {
  return HOSTS.hosts.find((h) => h.host_id === hostId) ?? null;
}

const isRecovery = (h) => h.roles.includes('RECOVERY');
const isControl = (h) => h.roles.includes('HERMES_CONTROL');

/** Is this task heavy, by the same thresholds the scheduler uses? */
export function isHeavy(task, policy = POLICY) {
  const h = policy.heavy_classification;
  return (
    Number(task.predicted_memory_mb ?? 0) > h.predicted_memory_mb_gt ||
    h.disk_io_class_in.includes(String(task.disk_io_class ?? '')) ||
    Number(task.cpu_seconds ?? 0) > h.cpu_heavy_duration_seconds_gt
  );
}

/**
 * Decide whether this host may run this task. Fail closed: an unknown host, an
 * unrecognised shape or a missing field refuses rather than assuming permission.
 */
export function evaluate(task, { hostId = os.hostname(), hosts = HOSTS, policy = POLICY } = {}) {
  const self = hosts.hosts.find((h) => h.host_id === hostId);
  if (!self) {
    return { decision: DECISION.REFUSE, reason: REASON.UNKNOWN_HOST, host: hostId };
  }

  const authority = String(task?.authority_class ?? '').toUpperCase();
  const base = { host: hostId, roles: self.roles, authority_class: authority || null };

  // Gate A, locally. Recovery authorities belong on a recovery peer; owner-control
  // authorities belong on the control host. Neither may drift to the other.
  if (policy.authority_routing.recovery_plane_only.includes(authority) && !isRecovery(self)) {
    return { ...base, decision: DECISION.REFUSE, reason: REASON.AUTHORITY_REQUIRES_RECOVERY_ROLE };
  }
  if (policy.authority_routing.control_slice_only.includes(authority) && !isControl(self)) {
    return { ...base, decision: DECISION.REFUSE, reason: REASON.AUTHORITY_REQUIRES_CONTROL_ROLE };
  }

  if (task?.architecture && task.architecture !== self.architecture) {
    return { ...base, decision: DECISION.REFUSE, reason: REASON.ARCHITECTURE_MISMATCH };
  }

  // A host with no development pool is an admin/recovery node. Development work on it
  // is a separation breach regardless of how much memory happens to be free: the E2
  // pair exist to recover the estate, and a recovery node busy building is not one.
  const isRecoveryAuthority = policy.authority_routing.recovery_plane_only.includes(authority);
  if (!isRecoveryAuthority && self.development_pool_mb === 0) {
    return { ...base, decision: DECISION.REFUSE, reason: REASON.NO_DEVELOPMENT_POOL_ON_THIS_HOST };
  }

  if (isHeavy(task ?? {}, policy) && self.max_concurrent_heavy_jobs === 0) {
    return { ...base, decision: DECISION.REFUSE, reason: REASON.HEAVY_WORK_NOT_PERMITTED };
  }

  return { ...base, decision: DECISION.ALLOW, reason: REASON.ALLOWED_BY_ROLE };
}

/** What may this host run at all? Useful in certification and on an operator's screen. */
export function describeSelf(hostId = os.hostname(), hosts = HOSTS, policy = POLICY) {
  const self = hosts.hosts.find((h) => h.host_id === hostId);
  if (!self) return { host: hostId, known: false };
  return {
    host: hostId,
    known: true,
    roles: self.roles,
    recovery_role: self.recovery_role,
    recovers: self.recovers,
    development_permitted: self.development_pool_mb > 0,
    heavy_work_permitted: self.max_concurrent_heavy_jobs > 0,
    authority_classes_permitted: [
      ...(isRecovery(self) ? policy.authority_routing.recovery_plane_only : []),
      ...(isControl(self) ? policy.authority_routing.control_slice_only : []),
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args[0] === '--self') {
    console.log(JSON.stringify(describeSelf(), null, 2));
    process.exit(0);
  }
  let raw = args[0];
  if (!raw) raw = fs.readFileSync(0, 'utf8');
  let task;
  try {
    task = JSON.parse(raw);
  } catch {
    console.error('role-guard: task must be a JSON object');
    process.exit(2);
  }
  const result = evaluate(task);
  console.log(JSON.stringify(result, null, 2));
  if (result.reason === REASON.UNKNOWN_HOST) process.exit(2);
  process.exit(result.decision === DECISION.ALLOW ? 0 : 3);
}
