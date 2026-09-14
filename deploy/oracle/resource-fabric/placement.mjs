#!/usr/bin/env node
// DIAL Oracle task-aware resource fabric: deterministic placement pipeline.
//
// Deliberately standalone. Section 20 of the architecture requires recovery and
// placement logic to work when Hermes, the mission controller, VEKL, Codex and
// Claude are all unavailable, so this module imports nothing from agent-system.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_HOSTS = path.join(here, 'hosts.json');
export const DEFAULT_POLICY = path.join(here, 'policy.json');

export const REASON = Object.freeze({
  TELEMETRY_STALE: 'TELEMETRY_STALE',
  TELEMETRY_MISSING: 'TELEMETRY_MISSING',
  AUTHORITY_REQUIRES_RECOVERY_PLANE: 'AUTHORITY_REQUIRES_RECOVERY_PLANE',
  AUTHORITY_REQUIRES_CONTROL_SLICE: 'AUTHORITY_REQUIRES_CONTROL_SLICE',
  ARCHITECTURE_INCOMPATIBLE: 'ARCHITECTURE_INCOMPATIBLE',
  TOOLCHAIN_MISSING: 'TOOLCHAIN_MISSING',
  MEMORY_ENVELOPE_EXCEEDED: 'MEMORY_ENVELOPE_EXCEEDED',
  HEAVY_WORK_REFUSED_ON_E2: 'HEAVY_WORK_REFUSED_ON_E2',
  E2_ADMISSION_REFUSED: 'E2_ADMISSION_REFUSED',
  HERMES_NOT_GREEN: 'HERMES_NOT_GREEN',
  RECOVERY_SUPERVISOR_NOT_GREEN: 'RECOVERY_SUPERVISOR_NOT_GREEN',
  DEVELOPMENT_POOL_EXHAUSTED: 'DEVELOPMENT_POOL_EXHAUSTED',
  EMERGENCY_HEADROOM_PROTECTED: 'EMERGENCY_HEADROOM_PROTECTED',
  HEAVY_JOB_CONCURRENCY_REACHED: 'HEAVY_JOB_CONCURRENCY_REACHED',
  RECOVERY_RESERVE_REQUIRED: 'RECOVERY_RESERVE_REQUIRED',
  LOWEST_PRESSURE_ELIGIBLE_HOST: 'LOWEST_PRESSURE_ELIGIBLE_HOST',
  NO_ELIGIBLE_HOST: 'NO_ELIGIBLE_HOST',
});

export function loadJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Section 10: a task is heavy when any one of the declared thresholds is crossed. */
export function classifyHeavy(task, policy) {
  const h = policy.heavy_classification;
  const mem = Number(task.memory_mb?.preferred ?? task.memory_mb?.minimum ?? 0);
  const max = Number(task.memory_mb?.maximum ?? mem);
  const reasons = [];
  if (Math.max(mem, max) > h.predicted_memory_mb_gt) reasons.push('PREDICTED_MEMORY');
  if (h.disk_io_class_in.includes(task.disk_io)) reasons.push('DISK_IO_CLASS');
  if (Number(task.cpu_heavy_duration_seconds ?? 0) > h.cpu_heavy_duration_seconds_gt) reasons.push('CPU_DURATION');
  return { heavy: reasons.length > 0, reasons };
}

/** Section 8/30: telemetry older than the policy window makes a host ineligible for normal work. */
export function telemetryFresh(entry, policy, nowMs) {
  if (!entry?.observed_at) return false;
  const observed = Date.parse(entry.observed_at);
  if (!Number.isFinite(observed) || observed > nowMs) return false;
  return nowMs - observed <= policy.telemetry.max_age_ms;
}

/** Section 9 Gate D: normalized pressure. Lower is better. */
export function hostPressure(host, t, policy) {
  const w = policy.pressure_weights;
  const memory = Math.max(0, 1 - Number(t.available_memory_mb ?? 0) / host.memory_total_mb);
  const cpu = Number(t.load_average ?? 0) / Math.max(1, host.cpu_total);
  const swap = Number(t.swap_use_ratio ?? 0);
  const io = Number(t.iowait_ratio ?? 0);
  const heavy = Number(t.active_heavy_jobs ?? 0);
  const score = w.memory * memory + w.cpu * cpu + w.swap * swap + w.io * io + w.heavy_job_penalty * heavy;
  return { score: Number(score.toFixed(6)), memory, cpu, swap, io, heavy_jobs: heavy };
}

function isRecoveryHost(host) { return host.roles.includes('RECOVERY'); }
function isControlHost(host) { return host.roles.includes('HERMES_CONTROL'); }

function e2Admissible(host, t, policy, heavy) {
  const a = policy.e2_admission;
  const fail = [];
  if (Number(t.available_memory_mb ?? 0) < a.min_available_memory_mb) fail.push('AVAILABLE_MEMORY');
  if (Number(t.swap_use_ratio ?? 0) > a.max_swap_use_ratio) fail.push('SWAP');
  if (Number(t.load_average ?? 0) > a.max_load_average) fail.push('LOAD');
  if (Number(t.iowait_ratio ?? 0) > a.max_iowait_ratio) fail.push('IOWAIT');
  if (Number(t.active_heavy_jobs ?? 0) > a.max_active_heavy_jobs) fail.push('ACTIVE_HEAVY_JOB');
  if (a.refuse_when_recovery_peer_degraded && t.recovery_peer_health && t.recovery_peer_health !== 'GREEN') fail.push('RECOVERY_PEER_DEGRADED');
  if (a.refuse_when_desktop_commander_unhealthy && t.desktop_commander !== 'GREEN') fail.push('DESKTOP_COMMANDER');
  if (heavy.heavy) fail.push('HEAVY_CLASS');
  return fail;
}

function a1Admissible(host, t, policy, task) {
  const a = policy.a1_admission;
  const fail = [];
  if (t.hermes_health !== a.require_hermes_health) fail.push(REASON.HERMES_NOT_GREEN);
  if (t.recovery_supervisor !== a.require_recovery_supervisor) fail.push(REASON.RECOVERY_SUPERVISOR_NOT_GREEN);
  const need = Number(task.memory_mb?.maximum ?? task.memory_mb?.preferred ?? task.memory_mb?.minimum ?? 0);
  const committed = Number(t.development_pool_committed_mb ?? 0);
  if (committed + need > a.development_pool_mb) fail.push(REASON.DEVELOPMENT_POOL_EXHAUSTED);
  if (Number(t.available_memory_mb ?? 0) - need < a.emergency_headroom_mb) fail.push(REASON.EMERGENCY_HEADROOM_PROTECTED);
  if (Number(t.active_heavy_jobs ?? 0) >= a.max_concurrent_heavy_jobs) fail.push(REASON.HEAVY_JOB_CONCURRENCY_REACHED);
  return fail;
}

/**
 * Sections 9-12. Gates run in strict order; every rejection carries a reason code.
 * Never throws for an unplaceable task — it returns selected:null with evidence,
 * because the architecture requires fail-closed routing, not an exception.
 */
export function evaluatePlacement({ task, hosts, telemetry = {}, policy, nowMs = Date.now() }) {
  const inventory = Array.isArray(hosts) ? hosts : hosts.hosts;
  const heavy = classifyHeavy(task, policy);
  const rejected = {};
  const considered = [];

  for (const host of [...inventory].sort((a, b) => a.host_id.localeCompare(b.host_id))) {
    const t = telemetry[host.host_id];
    if (!t) { rejected[host.host_id] = REASON.TELEMETRY_MISSING; continue; }
    if (!telemetryFresh(t, policy, nowMs)) { rejected[host.host_id] = REASON.TELEMETRY_STALE; continue; }

    // Gate A — authority.
    const authority = String(task.authority_class || '').toUpperCase();
    if (policy.authority_routing.recovery_plane_only.includes(authority) && !isRecoveryHost(host)) {
      rejected[host.host_id] = REASON.AUTHORITY_REQUIRES_RECOVERY_PLANE; continue;
    }
    if (policy.authority_routing.control_slice_only.includes(authority) && !isControlHost(host)) {
      rejected[host.host_id] = REASON.AUTHORITY_REQUIRES_CONTROL_SLICE; continue;
    }

    // Gate B — architecture and toolchain.
    const archs = task.architecture?.length ? task.architecture : [host.architecture];
    if (!archs.includes(host.architecture)) { rejected[host.host_id] = REASON.ARCHITECTURE_INCOMPATIBLE; continue; }
    const missing = (task.toolchain || []).filter((x) => !host.toolchains.includes(x));
    if (missing.length) { rejected[host.host_id] = `${REASON.TOOLCHAIN_MISSING}:${missing.sort().join(',')}`; continue; }

    // Gate C — memory envelope and per-shape admission.
    if (isControlHost(host)) {
      const fail = a1Admissible(host, t, policy, task);
      if (fail.length) { rejected[host.host_id] = fail[0]; continue; }
    } else {
      const need = Number(task.memory_mb?.minimum ?? 0);
      if (need > Number(t.available_memory_mb ?? 0) - host.emergency_headroom_mb) {
        rejected[host.host_id] = REASON.MEMORY_ENVELOPE_EXCEEDED; continue;
      }
      const fail = e2Admissible(host, t, policy, heavy);
      if (fail.length) {
        rejected[host.host_id] = fail.includes('HEAVY_CLASS') && fail.length === 1
          ? REASON.HEAVY_WORK_REFUSED_ON_E2
          : `${REASON.E2_ADMISSION_REFUSED}:${fail.sort().join(',')}`;
        continue;
      }
    }
    considered.push({ host, telemetry: t, pressure: hostPressure(host, t, policy) });
  }

  // Gate E — recovery preservation. Normal work may not consume the last healthy
  // recovery peer. Recovery-authority work is exempt: that IS the recovery plane.
  const recoveryAuthority = policy.authority_routing.recovery_plane_only.includes(String(task.authority_class || '').toUpperCase());
  let eligible = considered;
  if (!recoveryAuthority) {
    const healthyPeers = inventory.filter((h) => isRecoveryHost(h)
      && telemetryFresh(telemetry[h.host_id], policy, nowMs)
      && telemetry[h.host_id]?.desktop_commander === 'GREEN');
    if (healthyPeers.length <= 1) {
      eligible = considered.filter((c) => {
        if (!isRecoveryHost(c.host)) return true;
        rejected[c.host.host_id] = REASON.RECOVERY_RESERVE_REQUIRED;
        return false;
      });
    }
  }

  eligible = [...eligible].sort((a, b) => a.pressure.score - b.pressure.score || a.host.host_id.localeCompare(b.host.host_id));
  const winner = eligible[0] || null;

  const decision = {
    schema_version: 1,
    policy_version: policy.policy_version,
    task: task.task_id,
    project: task.project ?? null,
    authority_class: task.authority_class ?? null,
    heavy: heavy.heavy,
    heavy_reasons: heavy.reasons,
    eligible_hosts: eligible.map((x) => x.host.host_id),
    rejected,
    selected: winner?.host.host_id ?? null,
    reason: winner ? REASON.LOWEST_PRESSURE_ELIGIBLE_HOST : REASON.NO_ELIGIBLE_HOST,
    pressure: Object.fromEntries(considered.map((x) => [x.host.host_id, x.pressure.score])),
    observed_at: new Date(nowMs).toISOString(),
  };
  return { ...decision, evidence_hash: sha256({ ...decision, observed_at: null }) };
}

export function placeFromFiles({ task, hostsFile = DEFAULT_HOSTS, policyFile = DEFAULT_POLICY, telemetry = {}, nowMs = Date.now() }) {
  return evaluatePlacement({ task, hosts: loadJson(hostsFile), policy: loadJson(policyFile), telemetry, nowMs });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const taskArg = process.argv[2];
  if (!taskArg) { console.error('usage: placement.mjs <task.json> [telemetry.json]'); process.exit(2); }
  const telemetry = process.argv[3] ? loadJson(process.argv[3]) : {};
  const result = placeFromFiles({ task: loadJson(taskArg), telemetry });
  console.log(JSON.stringify(result, null, 2));
  if (!result.selected) process.exitCode = 1;
}
