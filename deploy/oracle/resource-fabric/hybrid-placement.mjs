#!/usr/bin/env node
import { evaluatePlacement, classifyHeavy } from './placement.mjs';

export const HYBRID_REASON = Object.freeze({
  WORKLOAD_CLASS_NOT_PERMITTED: 'WORKLOAD_CLASS_NOT_PERMITTED',
  WORKLOAD_CLASS_UNKNOWN: 'WORKLOAD_CLASS_UNKNOWN'
});

export function deriveWorkloadClass(task, policy) {
  const declared = String(task?.workload_class ?? '').trim().toUpperCase();
  if (declared) return declared;
  const authority = String(task?.authority_class ?? '').toUpperCase();
  if ((policy.authority_routing?.recovery_plane_only ?? []).includes(authority)) return 'RECOVERY';
  if ((policy.authority_routing?.control_slice_only ?? []).includes(authority)) return 'HERMES_RUNTIME';
  if (classifyHeavy(task ?? {}, policy).heavy) return 'HEAVY_BUILD';
  return 'INTERACTIVE_DEV';
}

export function evaluateHybridPlacement({ task, hosts, telemetry = {}, policy, nowMs = Date.now() }) {
  const inventory = Array.isArray(hosts) ? hosts : hosts.hosts;
  const workloadClass = deriveWorkloadClass(task, policy);
  const roleRejected = {};
  const recoveryAuthority = (policy.authority_routing?.recovery_plane_only ?? []).includes(String(task?.authority_class ?? '').toUpperCase());

  const filtered = inventory.filter((host) => {
    if (recoveryAuthority) return true; // preserve existing R0-R3 bounded recovery semantics.
    const allowed = host.allowed_workload_classes ?? [];
    if (allowed.includes(workloadClass)) return true;
    roleRejected[host.host_id] = `${HYBRID_REASON.WORKLOAD_CLASS_NOT_PERMITTED}:${workloadClass}`;
    return false;
  });

  const result = evaluatePlacement({ task: { ...task, workload_class: workloadClass }, hosts: filtered, telemetry, policy, nowMs });
  return {
    ...result,
    workload_class: workloadClass,
    rejected: { ...roleRejected, ...result.rejected },
    eligible_hosts: result.eligible_hosts.filter((id) => !roleRejected[id])
  };
}
