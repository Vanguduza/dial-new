import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { route, allowedOnHost } from '../deploy/oracle/control-plane/hybrid-router.mjs';
import { admit, classifyCommand } from '../deploy/oracle/control-plane/guarded-command.mjs';
import { normalizeOwnerInstruction, workloadHint } from '../deploy/oracle/control-plane/owner-channel-adapter.mjs';
import { appendAudit, verifyLedger } from '../deploy/oracle/control-plane/audit-ledger.mjs';
import { planSemanticOperation } from '../deploy/oracle/control-plane/ssh-semantic-executor.mjs';
import { evaluateHybridPlacement } from '../deploy/oracle/resource-fabric/hybrid-placement.mjs';
import hosts from '../deploy/oracle/resource-fabric/hosts.json' with { type: 'json' };
import policy from '../deploy/oracle/resource-fabric/policy.json' with { type: 'json' };

const now = Date.parse('2026-09-13T05:00:00Z');
const green = (host, extra = {}) => ({
  host,
  observed_at: new Date(now - 1000).toISOString(),
  available_memory_mb: 700,
  swap_use_ratio: 0.01,
  load_average: 0.1,
  iowait_ratio: 0.01,
  active_heavy_jobs: 0,
  desktop_commander: 'GREEN',
  recovery_peer_health: 'GREEN',
  recovery_supervisor: 'GREEN',
  hermes_health: 'GREEN',
  development_pool_committed_mb: 0,
  ...extra,
});

const telemetry = {
  'oracle-admin': green('oracle-admin'),
  'oracle-admin-v2': green('oracle-admin-v2'),
  'dial-hermes-control': green('dial-hermes-control', { available_memory_mb: 20000 }),
};

describe('hybrid MCP + SSH control plane', () => {
  it('makes oracle-admin permanently control-only', () => {
    expect(allowedOnHost('oracle-admin', 'CONTROL')).toBe(true);
    expect(allowedOnHost('oracle-admin', 'HEAVY_BUILD')).toBe(false);
    expect(allowedOnHost('oracle-admin', 'TEST')).toBe(false);
    expect(allowedOnHost('oracle-admin', 'VEKL_LIGHT')).toBe(false);
    const host = hosts.hosts.find((h) => h.host_id === 'oracle-admin');
    expect(host.immutable_role).toBe(true);
    expect(host.worker_eligible).toBe(false);
    expect(host.background_worker_eligible).toBe(false);
    expect(host.development_pool_mb).toBe(0);
  });

  it('routes heavy work to Hermes and light VEKL to admin-v2', () => {
    expect(route({ workload_class: 'HEAVY_BUILD', target_host: 'oracle-admin' }, { localHost: 'oracle-admin' })).toMatchObject({ decision: 'ALLOW', target_host: 'dial-hermes-control' });
    expect(route({ workload_class: 'VEKL_LIGHT' }, { localHost: 'oracle-admin' })).toMatchObject({ decision: 'ALLOW', target_host: 'oracle-admin-v2', transport: 'DIRECT_SSH' });
  });

  it('enforces the same placement truth in the resource scheduler layer', () => {
    const dev = evaluateHybridPlacement({ task: { task_id: 'dev', project: 'dial', workload_class: 'INTERACTIVE_DEV', memory_mb: { minimum: 128, maximum: 256 }, disk_io: 'light', toolchain: ['node22'] }, hosts, telemetry, policy, nowMs: now });
    expect(dev.selected).toBe('dial-hermes-control');
    expect(dev.rejected['oracle-admin']).toContain('WORKLOAD_CLASS_NOT_PERMITTED');
    expect(dev.rejected['oracle-admin-v2']).toContain('WORKLOAD_CLASS_NOT_PERMITTED');

    const vekl = evaluateHybridPlacement({ task: { task_id: 'vekl', project: 'dial', workload_class: 'VEKL_LIGHT', memory_mb: { minimum: 64, maximum: 128 }, disk_io: 'light', toolchain: ['node22'] }, hosts, telemetry, policy, nowMs: now });
    expect(vekl.selected).toBe('oracle-admin-v2');
    expect(vekl.rejected['oracle-admin']).toContain('WORKLOAD_CLASS_NOT_PERMITTED');
  });

  it('refuses development commands and ambiguous commands on oracle-admin', () => {
    expect(classifyCommand('npm run verify').workload_class).toBe('TEST');
    expect(admit({ command: 'npm run verify', source: 'COMMANDER', host: 'oracle-admin' }).decision).toBe('REFUSE');
    expect(admit({ command: "bash -lc 'npm run verify'", source: 'COMMANDER', host: 'oracle-admin' }).decision).toBe('REFUSE');
    expect(admit({ command: 'mystery --do-work', source: 'SSH', host: 'oracle-admin' })).toMatchObject({ decision: 'REFUSE', reason: 'AMBIGUOUS_WORKLOAD_FAIL_CLOSED' });
    expect(admit({ command: 'uptime', source: 'COMMANDER', host: 'oracle-admin' }).decision).toBe('ALLOW');
  });

  it('keeps owner authority distinct from host safety authority', () => {
    const owner = normalizeOwnerInstruction({ source: 'WHATSAPP', text: 'Run the full DIAL verification' });
    expect(owner.authority).toBe('OWNER');
    expect(owner.priority).toBe('OWNER_REALTIME');
    expect(workloadHint(owner)).toBe('TEST');
    expect(admit({ command: 'npm run verify', source: 'WHATSAPP', host: 'oracle-admin', declaredWorkload: workloadHint(owner) }).decision).toBe('REFUSE');
  });

  it('exposes bounded semantic SSH operations rather than raw shell', () => {
    expect(planSemanticOperation({ operation: 'HOST_HEALTH', target_host: 'oracle-admin-v2' })).toMatchObject({ decision: 'ALLOW', target_host: 'oracle-admin-v2', transport: 'DIRECT_SSH' });
    expect(planSemanticOperation({ operation: 'RAW_SHELL', target_host: 'dial-hermes-control' })).toMatchObject({ decision: 'REFUSE', reason: 'UNKNOWN_SEMANTIC_OPERATION' });
    expect(planSemanticOperation({ operation: 'SERVICE_STATUS', target_host: 'oracle-admin', args: { service: '../bad' } })).toMatchObject({ decision: 'REFUSE' });
  });

  it('maintains a tamper-evident hash-chained policy ledger', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-ledger-'));
    const file = path.join(dir, 'policy-ledger.jsonl');
    appendAudit({ event: 'WORKLOAD_ADMISSION', decision: 'ALLOW' }, file);
    appendAudit({ event: 'RECOVERY_ROLE_VIOLATION', decision: 'REFUSE' }, file);
    expect(verifyLedger(file)).toMatchObject({ valid: true, records: 2 });
    const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
    rows[0].decision = 'REFUSE';
    fs.writeFileSync(file, rows.map(JSON.stringify).join('\n') + '\n');
    expect(verifyLedger(file).valid).toBe(false);
  });

  it('keeps Commander away from the recovery checkout and guards its complete shell command', () => {
    const installer = fs.readFileSync(new URL('../deploy/oracle/control-plane/install-oracle-admin-control-plane.sh', import.meta.url), 'utf8');
    const shell = fs.readFileSync(new URL('../deploy/oracle/control-plane/dial-guarded-bash', import.meta.url), 'utf8');
    expect(installer).toContain("cfg['defaultShell']=shell");
    expect(installer).not.toContain("'/opt/dial-recovery/dial-new'");
    expect(shell).toContain('guarded-command.mjs');
    expect(shell).toContain('DIAL_COMMAND_SOURCE=COMMANDER');
  });

  it('codifies non-interference with dial-hermes-control', () => {
    const doc = fs.readFileSync(new URL('../docs/orchestration/DIAL_HYBRID_MCP_SSH_MULTI_VM_CONTROL_PLANE_REV1.md', import.meta.url), 'utf8');
    expect(doc).toContain('must not install, restart, reconfigure, write files to, or run certification workloads on `dial-hermes-control`');
  });
});
