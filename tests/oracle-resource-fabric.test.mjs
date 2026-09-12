import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  loadJson, classifyHeavy, telemetryFresh, hostPressure, evaluatePlacement, REASON, DEFAULT_HOSTS, DEFAULT_POLICY,
} from '../deploy/oracle/resource-fabric/placement.mjs';

const HOSTS = loadJson(DEFAULT_HOSTS);
const POLICY = loadJson(DEFAULT_POLICY);
const NOW = Date.parse('2026-09-12T03:00:00.000Z');
const fresh = (extra = {}) => ({
  observed_at: new Date(NOW - 5_000).toISOString(),
  available_memory_mb: 800, load_average: 0.2, swap_use_ratio: 0, iowait_ratio: 0,
  active_heavy_jobs: 0, desktop_commander: 'GREEN', recovery_peer_health: 'GREEN', ...extra,
});
const a1 = (extra = {}) => fresh({
  available_memory_mb: 20000, hermes_health: 'GREEN', recovery_supervisor: 'GREEN',
  development_pool_committed_mb: 0, ...extra,
});
const healthy = (extra = {}) => ({
  'dial-hermes-control': a1(extra['dial-hermes-control']),
  'oracle-admin-v2': fresh(extra['oracle-admin-v2']),
  'oracle-admin': fresh(extra['oracle-admin']),
});
const task = (o = {}) => ({ task_id: 'T-1', project: 'dial', memory_mb: { minimum: 64, preferred: 64 }, ...o });

describe('resource fabric inventory matches the provisioned Oracle pool', () => {
  it('carries the three Always Free hosts with their real shapes', () => {
    const byId = Object.fromEntries(HOSTS.hosts.map((h) => [h.host_id, h]));
    expect(byId['dial-hermes-control'].oci_shape).toBe('VM.Standard.A1.Flex');
    expect(byId['dial-hermes-control'].cpu_total).toBe(4);
    expect(byId['dial-hermes-control'].memory_total_mb).toBe(24576);
    expect(byId['oracle-admin-v2'].oci_shape).toBe('VM.Standard.E2.1.Micro');
    expect(byId['oracle-admin'].oci_shape).toBe('VM.Standard.E2.1.Micro');
  });

  it('never stores a public IP address in the repository', () => {
    const raw = JSON.stringify(HOSTS);
    for (const h of HOSTS.hosts) expect(h.private_ip).toMatch(/^10\./);
    expect(raw).not.toMatch(/"public_ip"/);
  });

  it('reserves Hermes memory and keeps emergency headroom unschedulable', () => {
    const a1h = HOSTS.hosts.find((h) => h.host_id === 'dial-hermes-control');
    expect(a1h.control_reservation_mb).toBe(8192);
    expect(a1h.development_pool_mb).toBe(14336);
    expect(a1h.emergency_headroom_mb).toBe(2048);
    expect(a1h.control_reservation_mb + a1h.development_pool_mb + a1h.emergency_headroom_mb)
      .toBe(a1h.memory_total_mb);
  });

  it('makes both E2 peers reciprocal recoverers that can also recover A1', () => {
    const v2 = HOSTS.hosts.find((h) => h.host_id === 'oracle-admin-v2');
    const v1 = HOSTS.hosts.find((h) => h.host_id === 'oracle-admin');
    expect(v2.recovers).toContain('oracle-admin');
    expect(v1.recovers).toContain('oracle-admin-v2');
    expect(v2.recovers).toContain('dial-hermes-control');
    expect(v1.recovers).toContain('dial-hermes-control');
  });
});

describe('heavy classification', () => {
  it('classifies on predicted memory, disk I/O class or CPU duration independently', () => {
    expect(classifyHeavy(task({ memory_mb: { preferred: 6144 } }), POLICY).heavy).toBe(true);
    expect(classifyHeavy(task({ disk_io: 'heavy' }), POLICY).heavy).toBe(true);
    expect(classifyHeavy(task({ cpu_heavy_duration_seconds: 300 }), POLICY).heavy).toBe(true);
    expect(classifyHeavy(task(), POLICY).heavy).toBe(false);
  });
});

describe('fail closed on stale telemetry', () => {
  it('refuses a host whose telemetry is older than the policy window', () => {
    const stale = { observed_at: new Date(NOW - 10 * 60_000).toISOString(), available_memory_mb: 900 };
    expect(telemetryFresh(stale, POLICY, NOW)).toBe(false);
    const r = evaluatePlacement({ task: task(), hosts: HOSTS, policy: POLICY, nowMs: NOW,
      telemetry: { ...healthy(), 'oracle-admin-v2': stale } });
    expect(r.rejected['oracle-admin-v2']).toBe(REASON.TELEMETRY_STALE);
    expect(r.selected).not.toBe('oracle-admin-v2');
  });

  it('places nothing at all when no host reports telemetry', () => {
    const r = evaluatePlacement({ task: task(), hosts: HOSTS, policy: POLICY, telemetry: {}, nowMs: NOW });
    expect(r.selected).toBeNull();
    expect(r.reason).toBe(REASON.NO_ELIGIBLE_HOST);
    expect(Object.values(r.rejected)).toEqual([REASON.TELEMETRY_MISSING, REASON.TELEMETRY_MISSING, REASON.TELEMETRY_MISSING]);
  });
});

describe('Gate A — authority routing', () => {
  it('routes host repair to the recovery plane and never to the control node', () => {
    const r = evaluatePlacement({ task: task({ authority_class: 'DESKTOP_COMMANDER_REPAIR' }),
      hosts: HOSTS, policy: POLICY, telemetry: healthy(), nowMs: NOW });
    expect(['oracle-admin', 'oracle-admin-v2']).toContain(r.selected);
    expect(r.rejected['dial-hermes-control']).toBe(REASON.AUTHORITY_REQUIRES_RECOVERY_PLANE);
  });

  it('keeps owner steering in the A1 control slice', () => {
    const r = evaluatePlacement({ task: task({ authority_class: 'OWNER_STEER' }),
      hosts: HOSTS, policy: POLICY, telemetry: healthy(), nowMs: NOW });
    expect(r.selected).toBe('dial-hermes-control');
    expect(r.rejected['oracle-admin-v2']).toBe(REASON.AUTHORITY_REQUIRES_CONTROL_SLICE);
  });
});

describe('Gate B — architecture', () => {
  it('excludes the ARM control node from x86-only work', () => {
    const r = evaluatePlacement({ task: task({ architecture: ['x86_64'] }),
      hosts: HOSTS, policy: POLICY, telemetry: healthy(), nowMs: NOW });
    expect(r.rejected['dial-hermes-control']).toBe(REASON.ARCHITECTURE_INCOMPATIBLE);
    expect(['oracle-admin', 'oracle-admin-v2']).toContain(r.selected);
  });

  it('rejects a host missing a required toolchain', () => {
    const r = evaluatePlacement({ task: task({ toolchain: ['gradle'] }),
      hosts: HOSTS, policy: POLICY, telemetry: healthy(), nowMs: NOW });
    expect(r.selected).toBeNull();
    expect(r.rejected['oracle-admin']).toMatch(/^TOOLCHAIN_MISSING:gradle$/);
  });
});

describe('Gate C — memory and admission', () => {
  it('routes ARM-compatible heavy work to A1 rather than trying an E2 node', () => {
    const r = evaluatePlacement({
      task: task({ task_id: 'DDE-VEKL-GRAPH-COMPILE-142', memory_mb: { minimum: 2048, preferred: 6144, maximum: 8192 }, disk_io: 'heavy' }),
      hosts: HOSTS, policy: POLICY, telemetry: healthy(), nowMs: NOW });
    expect(r.heavy).toBe(true);
    expect(r.selected).toBe('dial-hermes-control');
    expect(r.rejected['oracle-admin-v2']).toBe(REASON.MEMORY_ENVELOPE_EXCEEDED);
  });

  it('refuses heavy work on E2 even when the envelope would physically fit', () => {
    const r = evaluatePlacement({ task: task({ disk_io: 'heavy', memory_mb: { minimum: 64 }, architecture: ['x86_64'] }),
      hosts: HOSTS, policy: POLICY, telemetry: healthy(), nowMs: NOW });
    expect(r.rejected['oracle-admin-v2']).toBe(REASON.HEAVY_WORK_REFUSED_ON_E2);
    expect(r.selected).toBeNull();
  });

  it('blocks development on A1 when Hermes control health is not GREEN', () => {
    const r = evaluatePlacement({ task: task({ memory_mb: { minimum: 4096, maximum: 4096 } }),
      hosts: HOSTS, policy: POLICY, nowMs: NOW,
      telemetry: healthy({ 'dial-hermes-control': { hermes_health: 'DEGRADED' } }) });
    expect(r.rejected['dial-hermes-control']).toBe(REASON.HERMES_NOT_GREEN);
  });

  it('protects the 2 GB emergency headroom from ordinary development', () => {
    const r = evaluatePlacement({ task: task({ memory_mb: { minimum: 3000, maximum: 3000 } }),
      hosts: HOSTS, policy: POLICY, nowMs: NOW,
      telemetry: healthy({ 'dial-hermes-control': { available_memory_mb: 4096 } }) });
    expect(r.rejected['dial-hermes-control']).toBe(REASON.EMERGENCY_HEADROOM_PROTECTED);
  });

  it('refuses a third concurrent heavy job on A1', () => {
    const r = evaluatePlacement({ task: task({ memory_mb: { minimum: 1024, maximum: 1024 } }),
      hosts: HOSTS, policy: POLICY, nowMs: NOW,
      telemetry: healthy({ 'dial-hermes-control': { active_heavy_jobs: 2 } }) });
    expect(r.rejected['dial-hermes-control']).toBe(REASON.HEAVY_JOB_CONCURRENCY_REACHED);
  });

  it('refuses an E2 node under memory, swap, load or Commander pressure', () => {
    for (const [k, v] of [['available_memory_mb', 300], ['swap_use_ratio', 0.9],
      ['load_average', 3], ['iowait_ratio', 0.5], ['desktop_commander', 'RED']]) {
      const r = evaluatePlacement({ task: task({ architecture: ['x86_64'] }), hosts: HOSTS, policy: POLICY, nowMs: NOW,
        telemetry: healthy({ 'oracle-admin-v2': { [k]: v }, 'oracle-admin': { [k]: v } }) });
      expect(r.selected, `pressure signal ${k}`).toBeNull();
    }
  });
});

describe('Gate D — pressure scoring', () => {
  it('prefers the least-pressured eligible peer', () => {
    const r = evaluatePlacement({ task: task({ architecture: ['x86_64'] }), hosts: HOSTS, policy: POLICY, nowMs: NOW,
      telemetry: healthy({ 'oracle-admin-v2': { load_average: 0.9 }, 'oracle-admin': { load_average: 0.1 } }) });
    expect(r.selected).toBe('oracle-admin');
    expect(r.pressure['oracle-admin']).toBeLessThan(r.pressure['oracle-admin-v2']);
  });

  it('scores a busier host higher', () => {
    const host = HOSTS.hosts.find((h) => h.host_id === 'oracle-admin');
    const calm = hostPressure(host, fresh(), POLICY);
    const busy = hostPressure(host, fresh({ available_memory_mb: 200, load_average: 2, active_heavy_jobs: 1 }), POLICY);
    expect(busy.score).toBeGreaterThan(calm.score);
  });
});

describe('Gate E — recovery preservation', () => {
  it('will not spend the last healthy recovery peer on ordinary work', () => {
    const r = evaluatePlacement({ task: task({ architecture: ['x86_64'] }), hosts: HOSTS, policy: POLICY, nowMs: NOW,
      telemetry: healthy({ 'oracle-admin-v2': { desktop_commander: 'RED' } }) });
    expect(r.rejected['oracle-admin']).toBe(REASON.RECOVERY_RESERVE_REQUIRED);
    expect(r.selected).toBeNull();
  });

  it('still allows recovery-authority work to use the surviving peer', () => {
    const r = evaluatePlacement({ task: task({ authority_class: 'SSH_REPAIR', architecture: ['x86_64'] }),
      hosts: HOSTS, policy: POLICY, nowMs: NOW,
      telemetry: healthy({ 'oracle-admin-v2': { desktop_commander: 'RED' } }) });
    expect(r.selected).toBe('oracle-admin');
  });
});

describe('placement evidence', () => {
  it('is deterministic and reproducible for identical inputs', () => {
    const args = { task: task(), hosts: HOSTS, policy: POLICY, telemetry: healthy(), nowMs: NOW };
    const a = evaluatePlacement(args);
    const b = evaluatePlacement({ ...args, nowMs: NOW + 1000 });
    expect(a.evidence_hash).toBe(b.evidence_hash);
    expect(a.evidence_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the decision changes, and records every rejection reason', () => {
    const base = evaluatePlacement({ task: task(), hosts: HOSTS, policy: POLICY, telemetry: healthy(), nowMs: NOW });
    const other = evaluatePlacement({ task: task({ architecture: ['x86_64'] }), hosts: HOSTS, policy: POLICY, telemetry: healthy(), nowMs: NOW });
    expect(other.evidence_hash).not.toBe(base.evidence_hash);
    expect(other.rejected['dial-hermes-control']).toBe(REASON.ARCHITECTURE_INCOMPATIBLE);
    expect(other.policy_version).toBe('dial-resource-fabric-v1');
  });
});
