#!/usr/bin/env node
// Publishes this host's live capability envelope (architecture section 8).
// Standalone by design: no Hermes, no DIAL orchestration imports.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { probeDesktopCommander, serviceHealth } from './doctor.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOSTS = JSON.parse(fs.readFileSync(path.join(here, 'hosts.json'), 'utf8'));
export const STATE_DIR = process.env.DIAL_FABRIC_STATE || '/var/lib/dial-fabric';

function meminfo() {
  const raw = fs.readFileSync('/proc/meminfo', 'utf8');
  const kb = (k) => Number(raw.match(new RegExp(`^${k}:\\s+(\\d+) kB`, 'm'))?.[1] ?? 0);
  const swapTotal = kb('SwapTotal');
  return {
    total_mb: Math.round(kb('MemTotal') / 1024),
    available_mb: Math.round(kb('MemAvailable') / 1024),
    swap_use_ratio: swapTotal ? Number(((swapTotal - kb('SwapFree')) / swapTotal).toFixed(4)) : 0,
  };
}

/** iowait as a share of total jiffies since boot. Cheap, monotonic, no sampling window. */
function iowaitRatio() {
  const cpu = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const total = cpu.reduce((a, b) => a + b, 0);
  return total ? Number((cpu[4] / total).toFixed(4)) : 0;
}

function diskUseRatio(target = '/') {
  try {
    const out = execFileSync('df', ['-P', target], { encoding: 'utf8' }).trim().split('\n')[1];
    return Number((Number(out.split(/\s+/)[4].replace('%', '')) / 100).toFixed(4));
  } catch { return null; }
}

/** Heavy jobs are counted from lease files the scheduler writes; absent dir means zero. */
function activeHeavyJobs() {
  try {
    return fs.readdirSync(path.join(STATE_DIR, 'leases')).filter((f) => f.endsWith('.heavy.json')).length;
  } catch { return 0; }
}

export function buildEnvelope({ hostId = os.hostname(), nowMs = Date.now() } = {}) {
  const record = HOSTS.hosts.find((h) => h.host_id === hostId) || null;
  const mem = meminfo();
  const commander = probeDesktopCommander();
  const envelope = {
    schema_version: 1,
    policy_version: HOSTS.policy_id,
    host: hostId,
    known_host: Boolean(record),
    architecture: os.arch() === 'arm64' ? 'arm64' : 'x86_64',
    cpu_total: os.cpus().length,
    memory_total_mb: mem.total_mb,
    memory_reserved_mb: record ? record.control_reservation_mb + record.emergency_headroom_mb : null,
    memory_schedulable_mb: record ? record.development_pool_mb : null,
    available_memory_mb: mem.available_mb,
    swap_use_ratio: mem.swap_use_ratio,
    load_average: Number(os.loadavg()[0].toFixed(4)),
    load_average_5m: Number(os.loadavg()[1].toFixed(4)),
    iowait_ratio: iowaitRatio(),
    disk_use_ratio: diskUseRatio(),
    active_heavy_jobs: activeHeavyJobs(),
    desktop_commander: commander.state,
    desktop_commander_detail: commander,
    hermes_health: record?.roles.includes('HERMES_CONTROL') ? serviceHealth('dial-hermes-orchestrator.service').state : 'NOT_APPLICABLE',
    recovery_supervisor: serviceHealth('dial-recovery-agent.service').state,
    recovery_role: record?.recovery_role ?? null,
    observed_at: new Date(nowMs).toISOString(),
  };
  return envelope;
}

export function publishEnvelope(envelope = buildEnvelope()) {
  const dir = path.join(STATE_DIR, 'telemetry');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const target = path.join(dir, `${envelope.host}.json`);
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, target);
  return target;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const envelope = buildEnvelope();
  if (process.argv.includes('--publish')) publishEnvelope(envelope);
  console.log(JSON.stringify(envelope, null, 2));
}
