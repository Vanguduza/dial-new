#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const HOSTS = JSON.parse(fs.readFileSync(path.join(here, 'hosts.json'), 'utf8'));
export const POLICY = JSON.parse(fs.readFileSync(path.join(here, 'policy.json'), 'utf8'));
export const DECISION = Object.freeze({ ALLOW: 'ALLOW', REFUSE: 'REFUSE' });
export const REASON = Object.freeze({
  UNKNOWN_HOST: 'UNKNOWN_HOST', WORKLOAD_CLASS_REQUIRED: 'WORKLOAD_CLASS_REQUIRED',
  WORKLOAD_NOT_PERMITTED: 'WORKLOAD_NOT_PERMITTED', AUTHORITY_REQUIRES_RECOVERY_ROLE: 'AUTHORITY_REQUIRES_RECOVERY_ROLE',
  AUTHORITY_REQUIRES_CONTROL_ROLE: 'AUTHORITY_REQUIRES_CONTROL_ROLE', UNMAPPED_RECOVERY_AUTHORITY: 'UNMAPPED_RECOVERY_AUTHORITY',
  HOST_HAS_NO_RECOVERY_AUTHORITY_MAX: 'HOST_HAS_NO_RECOVERY_AUTHORITY_MAX', AUTHORITY_EXCEEDS_HOST_RECOVERY_MAX: 'AUTHORITY_EXCEEDS_HOST_RECOVERY_MAX',
  OWNER_AUTHORIZATION_REQUIRED: 'OWNER_AUTHORIZATION_REQUIRED', NO_DEVELOPMENT_POOL_ON_THIS_HOST: 'NO_DEVELOPMENT_POOL_ON_THIS_HOST', HEAVY_WORK_NOT_PERMITTED: 'HEAVY_WORK_NOT_PERMITTED',
  ARCHITECTURE_MISMATCH: 'ARCHITECTURE_MISMATCH', ALLOWED_BY_ROLE: 'ALLOWED_BY_ROLE'
});

export function hostEntry(hostId = os.hostname()) { return HOSTS.hosts.find((h) => h.host_id === hostId) ?? null; }
const isRecovery = (h) => h.roles.includes('RECOVERY');
const isControl = (h) => h.roles.includes('HERMES_CONTROL') || h.roles.includes('CONTROL_PLANE');
const isBoundedRecoverer = (h) => h.roles.includes('BOUNDED_RECOVERY');
export function recoveryClassOf(authority, policy = POLICY) { for (const [c,m] of Object.entries(policy.recovery_action_classes?.classes ?? {})) if (m.includes(authority)) return c; return null; }
export function recoveryClassRank(rclass, policy = POLICY) { return (policy.recovery_action_classes?.order ?? []).indexOf(rclass); }
export function isHeavy(task, policy = POLICY) { const h = policy.heavy_classification; return Number(task.predicted_memory_mb ?? 0) > h.predicted_memory_mb_gt || h.disk_io_class_in.includes(String(task.disk_io_class ?? '')) || Number(task.cpu_seconds ?? 0) > h.cpu_heavy_duration_seconds_gt; }

export function evaluate(task, { hostId = os.hostname(), hosts = HOSTS, policy = POLICY } = {}) {
  const self = hosts.hosts.find((h) => h.host_id === hostId);
  if (!self) return { decision: DECISION.REFUSE, reason: REASON.UNKNOWN_HOST, host: hostId };
  const authority = String(task?.authority_class ?? '').toUpperCase();
  const workload = String(task?.workload_class ?? '').toUpperCase();
  const base = { host: hostId, host_class: self.host_class ?? null, roles: self.roles, authority_class: authority || null, workload_class: workload || null };
  const recoveryAuthorities = policy.authority_routing?.recovery_plane_only ?? [];
  const controlAuthorities = policy.authority_routing?.control_slice_only ?? [];
  const isRecoveryPlane = recoveryAuthorities.includes(authority);
  let permittedClass = null;
  if (isRecoveryPlane && !isRecovery(self) && !isBoundedRecoverer(self)) return { ...base, decision: DECISION.REFUSE, reason: REASON.AUTHORITY_REQUIRES_RECOVERY_ROLE };
  if (isRecoveryPlane) {
    const rclass = recoveryClassOf(authority, policy);
    if (rclass === null) return { ...base, decision: DECISION.REFUSE, reason: REASON.UNMAPPED_RECOVERY_AUTHORITY };
    const max = self.recovery_authority_max ?? null; const rank = recoveryClassRank(rclass, policy); const maxRank = recoveryClassRank(max, policy);
    if (max === null || maxRank < 0) return { ...base, decision: DECISION.REFUSE, reason: REASON.HOST_HAS_NO_RECOVERY_AUTHORITY_MAX };
    if (rank < 0 || rank > maxRank) return { ...base, decision: DECISION.REFUSE, reason: REASON.AUTHORITY_EXCEEDS_HOST_RECOVERY_MAX, recovery_class: rclass, recovery_authority_max: max };
    const gateRank = recoveryClassRank(policy.recovery_action_classes?.owner_authorization_required_at_or_above, policy);
    if (gateRank >= 0 && rank >= gateRank && !task?.owner_authorization) return { ...base, decision: DECISION.REFUSE, reason: REASON.OWNER_AUTHORIZATION_REQUIRED, recovery_class: rclass };
    permittedClass = rclass;
  }
  if (controlAuthorities.includes(authority) && !isControl(self)) return { ...base, decision: DECISION.REFUSE, reason: REASON.AUTHORITY_REQUIRES_CONTROL_ROLE };
  if (task?.architecture && task.architecture !== self.architecture) return { ...base, decision: DECISION.REFUSE, reason: REASON.ARCHITECTURE_MISMATCH };

  if (!isRecoveryPlane) {
    // Hybrid callers carry an explicit workload class and are checked against the
    // immutable host allowlist. Legacy recovery-fabric callers predate that field;
    // preserve their established development-pool contract instead of silently
    // changing the role-guard API beneath them.
    if (workload) {
      if (!(self.allowed_workload_classes ?? []).includes(workload)) return { ...base, decision: DECISION.REFUSE, reason: REASON.WORKLOAD_NOT_PERMITTED };
    } else if (self.development_pool_mb === 0) {
      return { ...base, decision: DECISION.REFUSE, reason: REASON.NO_DEVELOPMENT_POOL_ON_THIS_HOST };
    }
  }
  if (isHeavy(task ?? {}, policy) && self.max_concurrent_heavy_jobs === 0) return { ...base, decision: DECISION.REFUSE, reason: REASON.HEAVY_WORK_NOT_PERMITTED };
  return { ...base, decision: DECISION.ALLOW, reason: REASON.ALLOWED_BY_ROLE, ...(permittedClass ? { recovery_class: permittedClass, recovery_authority_max: self.recovery_authority_max } : {}) };
}

export function describeSelf(hostId = os.hostname(), hosts = HOSTS, policy = POLICY) {
  const self = hosts.hosts.find((h) => h.host_id === hostId); if (!self) return { host: hostId, known: false };
  return {
    host: hostId, known: true, host_class: self.host_class ?? null, immutable_role: self.immutable_role === true,
    roles: self.roles, worker_eligible: self.worker_eligible === true, background_worker_eligible: self.background_worker_eligible === true,
    allowed_workload_classes: self.allowed_workload_classes ?? [], recovery_role: self.recovery_role, recovers: self.recovers ?? [],
    recovery_authority_max: self.recovery_authority_max ?? null, recovery_service_allowlist: self.recovery_service_allowlist ?? [],
    development_permitted: self.development_pool_mb > 0, background_permitted: Number(self.background_pool_mb ?? 0) > 0,
    heavy_work_permitted: self.max_concurrent_heavy_jobs > 0,
    authority_classes_permitted: [
      ...(isRecovery(self) || isBoundedRecoverer(self)
        ? (policy.authority_routing?.recovery_plane_only ?? []).filter((a) =>
            evaluate({ authority_class: a, owner_authorization: 'PROBE' }, { hostId, hosts, policy }).decision === DECISION.ALLOW)
        : []),
      ...(isControl(self) ? (policy.authority_routing?.control_slice_only ?? []) : []),
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2); if (args[0] === '--self') { console.log(JSON.stringify(describeSelf(), null, 2)); process.exit(0); }
  let raw = args[0]; if (!raw) raw = fs.readFileSync(0, 'utf8');
  let task; try { task = JSON.parse(raw); } catch { console.error('role-guard: task must be JSON'); process.exit(2); }
  const result = evaluate(task); console.log(JSON.stringify(result, null, 2)); process.exit(result.decision === DECISION.ALLOW ? 0 : result.reason === REASON.UNKNOWN_HOST ? 2 : 3);
}
