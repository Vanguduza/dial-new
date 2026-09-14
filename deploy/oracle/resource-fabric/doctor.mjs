#!/usr/bin/env node
// Functional health, not process health (architecture section 16).
//
// A probe that is not configured returns UNVERIFIED, never GREEN. Synthesising a
// green result from an absent probe is how a control plane comes to believe it is
// healthy while being unusable, so every unknown here fails closed.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const POLICY = JSON.parse(fs.readFileSync(path.join(here, 'policy.json'), 'utf8'));

export const STATE = Object.freeze({ GREEN: 'GREEN', DEGRADED: 'DEGRADED', RED: 'RED', UNVERIFIED: 'UNVERIFIED' });

function run(cmd, args, timeout = 10_000) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] }).trim() };
  } catch (error) {
    return { ok: false, out: String(error?.stdout ?? ''), error: error?.shortMessage || error?.message || 'failed' };
  }
}

/** Process-level health of a systemd user unit. */
export function serviceHealth(unit) {
  const active = run('systemctl', ['--user', 'is-active', unit], 5_000);
  const enabled = run('systemctl', ['--user', 'is-enabled', unit], 5_000);
  const state = active.out === 'active' ? STATE.GREEN : active.out === 'activating' ? STATE.DEGRADED : STATE.RED;
  return { unit, state, active: active.out || 'unknown', enabled: enabled.out || 'unknown' };
}

/**
 * Desktop Commander is GREEN only when every criterion in policy.json passes.
 * Each criterion needs a real probe; unconfigured probes make the whole result
 * UNVERIFIED so the scheduler refuses the host rather than trusting it.
 */
export function probeDesktopCommander({ probeCmd = process.env.DIAL_COMMANDER_PROBE } = {}) {
  const required = POLICY.desktop_commander_green_requires;
  const criteria = {};

  // Desktop Commander is an MCP stdio server: the client spawns it per session
  // over stdin/stdout, so there is no persistent host-side process to inspect and
  // `systemctl is-active` is not the health signal. Every criterion, PROCESS_UP
  // included, comes from the configured functional probe.
  if (!probeCmd) {
    for (const c of required) criteria[c] = STATE.UNVERIFIED;
    return {
      state: STATE.UNVERIFIED, criteria,
      reason: 'DIAL_COMMANDER_PROBE is not configured; functional criteria cannot be established',
    };
  }

  // The probe is expected to print one "CRITERION=GREEN|RED" line per criterion.
  const probe = run('bash', ['-lc', probeCmd], 15_000);
  const reported = Object.fromEntries(probe.out.split('\n')
    .map((l) => l.trim().split('='))
    .filter((p) => p.length === 2)
    .map(([k, v]) => [k.toUpperCase(), v.toUpperCase() === 'GREEN' ? STATE.GREEN : STATE.RED]));
  for (const c of required) criteria[c] = reported[c] ?? STATE.UNVERIFIED;

  const values = required.map((c) => criteria[c]);
  const state = values.every((v) => v === STATE.GREEN) ? STATE.GREEN
    : values.includes(STATE.RED) ? STATE.RED : STATE.UNVERIFIED;
  return { state, criteria, probe_ok: probe.ok };
}

export function hostDoctor({ units = [] } = {}) {
  const services = units.map(serviceHealth);
  const commander = probeDesktopCommander();
  const failures = [
    ...services.filter((s) => s.state !== STATE.GREEN).map((s) => `SERVICE_NOT_GREEN:${s.unit}`),
    ...(commander.state === STATE.GREEN ? [] : [`DESKTOP_COMMANDER_${commander.state}`]),
  ];
  return {
    schema_version: 1,
    policy_version: POLICY.policy_version,
    status: failures.length ? STATE.DEGRADED : STATE.GREEN,
    services,
    desktop_commander: commander,
    failures,
    observed_at: new Date().toISOString(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const units = process.argv.slice(2).filter((a) => a.endsWith('.service') || a.endsWith('.timer'));
  const report = hostDoctor({ units });
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== STATE.GREEN) process.exitCode = 1;
}
