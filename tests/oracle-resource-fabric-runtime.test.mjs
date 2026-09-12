import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateTask, scheduleTask } from '../deploy/oracle/resource-fabric/resource-scheduler.mjs';
import { acquireLease, releaseLease, runOnce as recoveryRunOnce } from '../deploy/oracle/resource-fabric/recovery-agent.mjs';

function tempState() { return fs.mkdtempSync(path.join(os.tmpdir(), 'dial-fabric-')); }
const now = Date.parse('2026-09-12T06:00:00Z');
const fresh = (host, extra = {}) => ({
  host,
  observed_at: new Date(now - 1000).toISOString(),
  available_memory_mb: host === 'dial-hermes-control' ? 20000 : 800,
  load_average: 0.1,
  swap_use_ratio: 0,
  iowait_ratio: 0,
  active_heavy_jobs: 0,
  desktop_commander: 'GREEN',
  recovery_peer_health: 'GREEN',
  hermes_health: host === 'dial-hermes-control' ? 'GREEN' : 'NOT_APPLICABLE',
  recovery_supervisor: 'GREEN',
  development_pool_committed_mb: 0,
  ...extra,
});
const telemetry = {
  'dial-hermes-control': fresh('dial-hermes-control'),
  'oracle-admin-v2': fresh('oracle-admin-v2'),
  'oracle-admin': fresh('oracle-admin'),
};

describe('resource scheduler runtime', () => {
  it('rejects arbitrary command payloads', () => {
    expect(() => validateTask({ task_id: 'T-1', project: 'dial', command: 'rm -rf /' })).toThrow(/arbitrary command/);
  });

  it('records a deterministic decision and host dispatch envelope', () => {
    const stateDir = tempState();
    const task = { task_id: 'T-2', project: 'dial', memory_mb: { minimum: 64, preferred: 64 } };
    const result = scheduleTask(task, { stateDir, telemetry, nowMs: now });
    expect(result.selected_host).toBeTruthy();
    expect(result.decision_hash).toMatch(/^[0-9a-f]{64}$/);
    const decisions = fs.readdirSync(path.join(stateDir, 'decisions'));
    expect(decisions).toHaveLength(1);
    const dispatch = fs.readdirSync(path.join(stateDir, 'dispatch', result.selected_host));
    expect(dispatch).toHaveLength(1);
  });

  it('fails closed and emits no dispatch when telemetry is absent', () => {
    const stateDir = tempState();
    const result = scheduleTask({ task_id: 'T-3', project: 'dial', memory_mb: { minimum: 64 } }, { stateDir, telemetry: {}, nowMs: now });
    expect(result.selected_host).toBeNull();
    expect(fs.existsSync(path.join(stateDir, 'dispatch'))).toBe(false);
  });
});

describe('recovery runtime', () => {
  it('allows only one live remediator lease per target', () => {
    const stateDir = tempState();
    const first = acquireLease('oracle-admin', { stateDir, nowMs: now });
    expect(first).toBeTruthy();
    expect(acquireLease('oracle-admin', { stateDir, nowMs: now + 1000 })).toBeNull();
    releaseLease(first, stateDir);
    expect(acquireLease('oracle-admin', { stateDir, nowMs: now + 2000 })).toBeTruthy();
  });

  it('does not activate recovery logic on an unknown/non-recovery host', () => {
    const result = recoveryRunOnce({ stateDir: tempState(), nowMs: now, hostId: 'not-a-fabric-host' });
    expect(result.state).toBe('NOT_RECOVERY_HOST');
    expect(result.targets).toEqual([]);
  });
});
