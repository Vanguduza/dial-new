#!/usr/bin/env node
// Reciprocal Oracle recovery supervisor. Standalone by design: no Hermes imports.
// Recovery is allowlisted, lease-protected, hysteretic and fail-closed.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOSTS = JSON.parse(fs.readFileSync(path.join(here, 'hosts.json'), 'utf8'));
const POLICY = JSON.parse(fs.readFileSync(path.join(here, 'policy.json'), 'utf8'));
export const STATE_DIR = process.env.DIAL_FABRIC_STATE || '/var/lib/dial-fabric';
const APPROVED_SERVICES = new Set([
  'dial-hermes-runtime.service','dial-hermes-orchestrator.service','dial-hermes-operations.service',
  'dial-chat-control.service','dial-mission-controller.service','dial-hermes-whatsapp-operator.service',
  'dial-resource-scheduler.service','dial-host-agent.timer','dial-recovery-agent.service',
]);

// Rev 3 section 5.2. Two-way recovery is bidirectional in capability and asymmetric in
// privilege. A peer with the RECOVERY role may restart anything in APPROVED_SERVICES on a
// target; a BOUNDED_RECOVERY host (dial-hermes-control) may restart only the units its
// hosts.json entry names - in practice the target's own recovery agent, which is exactly
// what is needed to bring a stuck E2 back and nothing more.
//
// Fail closed in both directions: a host with no allowlist gets none, and a name in the
// allowlist that is not also in APPROVED_SERVICES is dropped rather than honoured.
export function permittedServices(self) {
  if (!self) return new Set();
  const allow = self.recovery_service_allowlist;
  if (!Array.isArray(allow)) return new Set();
  if (allow.includes('*')) {
    return self.roles?.includes('RECOVERY') ? new Set(APPROVED_SERVICES) : new Set();
  }
  return new Set(allow.filter((s) => APPROVED_SERVICES.has(s)));
}

export function isRecoveryCapable(self) {
  return Boolean(self) && (self.roles.includes('RECOVERY') || self.roles.includes('BOUNDED_RECOVERY'));
}

function atomicJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, target);
}
function resolveHost(target) {
  const key = `DIAL_FABRIC_${target.toUpperCase().replace(/-/g, '_')}_SSH_HOST`;
  return process.env[key] || HOSTS.hosts.find((h) => h.host_id === target)?.private_ip || null;
}
function ssh(target, args, timeoutMs = 12000) {
  const host = resolveHost(target);
  if (!host) throw new Error(`no SSH host for ${target}`);
  const user = process.env.DIAL_FABRIC_SSH_USER || 'ubuntu';
  return execFileSync('ssh', ['-o','BatchMode=yes','-o','ConnectTimeout=5','-o','StrictHostKeyChecking=yes', `${user}@${host}`, ...args], { encoding: 'utf8', timeout: timeoutMs }).trim();
}
export function acquireLease(target, { stateDir = STATE_DIR, nowMs = Date.now() } = {}) {
  const dir = path.join(stateDir, 'recovery-leases');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${target}.json`);
  try {
    const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.parse(existing.expires_at) > nowMs) return null;
  } catch {}
  const token = crypto.randomUUID();
  const lease = { target, token, holder: os.hostname(), acquired_at: new Date(nowMs).toISOString(), expires_at: new Date(nowMs + POLICY.recovery_lease.ttl_seconds * 1000).toISOString() };
  atomicJson(file, lease);
  const verify = JSON.parse(fs.readFileSync(file, 'utf8'));
  return verify.token === token ? lease : null;
}
export function releaseLease(lease, stateDir = STATE_DIR) {
  const file = path.join(stateDir, 'recovery-leases', `${lease.target}.json`);
  try { const current = JSON.parse(fs.readFileSync(file, 'utf8')); if (current.token === lease.token) fs.rmSync(file, { force: true }); } catch {}
}
export function probeTarget(target) {
  const checks = { network: false, ssh: false, systemd: false };
  try { ssh(target, ['true']); checks.network = true; checks.ssh = true; } catch { return { state: 'RED', checks }; }
  try { ssh(target, ['systemctl','--user','is-system-running','--wait']); checks.systemd = true; } catch { /* degraded user manager is recoverable */ }
  return { state: checks.ssh ? (checks.systemd ? 'GREEN' : 'DEGRADED') : 'RED', checks };
}
export function restartApprovedService(target, service, { hostId = os.hostname() } = {}) {
  if (!APPROVED_SERVICES.has(service)) throw new Error(`service not allowlisted: ${service}`);
  const self = HOSTS.hosts.find((h) => h.host_id === hostId);
  if (!permittedServices(self).has(service)) {
    throw new Error(`${hostId} may not restart ${service} on ${target}`);
  }
  ssh(target, ['systemctl','--user','restart',service], 20000);
  return probeTarget(target);
}
export function repairTarget(target, { stateDir = STATE_DIR, service = 'dial-recovery-agent.service', nowMs = Date.now(), hostId = os.hostname() } = {}) {
  const self = HOSTS.hosts.find((h) => h.host_id === hostId);
  if (!permittedServices(self).has(service)) {
    return { target, action: 'REFUSED_SERVICE_NOT_PERMITTED_FOR_HOST', service, host: hostId };
  }
  const lease = acquireLease(target, { stateDir, nowMs });
  if (!lease) return { target, action: 'SKIP_LEASE_HELD' };
  try {
    const before = probeTarget(target);
    if (before.state === 'GREEN') return { target, action: 'NONE', before, after: before };
    let after;
    try { after = restartApprovedService(target, service, { hostId }); }
    catch (error) { after = { state: 'RED', error: error.message }; }
    const result = { target, action: 'RESTART_SERVICE', service, before, after, at: new Date(nowMs).toISOString() };
    atomicJson(path.join(stateDir, 'recovery-evidence', `${target}.${nowMs}.json`), result);
    return result;
  } finally { releaseLease(lease, stateDir); }
}
function stateFile(stateDir, target) { return path.join(stateDir, 'recovery-state', `${target}.json`); }
export function superviseTarget(target, { stateDir = STATE_DIR, nowMs = Date.now(), hostId = os.hostname() } = {}) {
  const probe = probeTarget(target);
  let prior = { consecutive_failures: 0, last_restart_at: null };
  try { prior = { ...prior, ...JSON.parse(fs.readFileSync(stateFile(stateDir, target), 'utf8')) }; } catch {}
  const failures = probe.state === 'GREEN' ? 0 : prior.consecutive_failures + 1;
  const next = { target, state: probe.state, consecutive_failures: failures, observed_at: new Date(nowMs).toISOString(), last_restart_at: prior.last_restart_at };
  let recovery = null;
  if (failures >= POLICY.recovery_hysteresis.unhealthy_after_failures) {
    const last = prior.last_restart_at ? Date.parse(prior.last_restart_at) : 0;
    if (nowMs - last >= POLICY.recovery_hysteresis.restart_cooldown_seconds * 1000) {
      recovery = repairTarget(target, { stateDir, nowMs, hostId });
      next.last_restart_at = new Date(nowMs).toISOString();
    }
  }
  atomicJson(stateFile(stateDir, target), next);
  return { ...next, recovery };
}
export function runOnce({ stateDir = STATE_DIR, nowMs = Date.now(), hostId = os.hostname() } = {}) {
  const self = HOSTS.hosts.find((h) => h.host_id === hostId);
  if (!isRecoveryCapable(self)) return { host: hostId, state: 'NOT_RECOVERY_HOST', targets: [] };
  return {
    host: hostId,
    state: 'ACTIVE',
    recovery_authority_max: self.recovery_authority_max ?? null,
    bounded: !self.roles.includes('RECOVERY'),
    targets: self.recovers.map((target) => superviseTarget(target, { stateDir, nowMs, hostId })),
  };
}
export async function daemon({ stateDir = STATE_DIR } = {}) {
  const interval = POLICY.recovery_hysteresis.probe_interval_seconds * 1000;
  while (true) { runOnce({ stateDir }); await new Promise((r) => setTimeout(r, interval)); }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === 'daemon') await daemon(); else console.log(JSON.stringify(runOnce(), null, 2));
}
