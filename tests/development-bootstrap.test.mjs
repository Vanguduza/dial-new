import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadManifest, loadRoles, validateManifest, itemsForRole } from '../ops/development-bootstrap/lib/manifest.mjs';
import { STATUS, check, summarize, verdict } from '../ops/development-bootstrap/lib/result.mjs';
import { redact } from '../ops/development-bootstrap/lib/log.mjs';
import { backupFile, rollback } from '../ops/development-bootstrap/lib/backup.mjs';
import { resolveHostRole, workloadDecision, assertWorkloadAllowed, RoleGuardError } from '../ops/development-bootstrap/roles/role-guard.mjs';
import { deriveAuthGates } from '../ops/development-bootstrap/auth/gates.mjs';
import { clientFragments } from '../ops/development-bootstrap/mcp/inventory.mjs';
import { runE2ESelfTest, decisionFingerprint } from '../ops/development-bootstrap/selftest/e2e-selftest.mjs';
import { runDeterminism } from '../ops/development-bootstrap/selftest/determinism.mjs';
import { runFaultInjection } from '../ops/development-bootstrap/selftest/fault-injection.mjs';
import { executeWorkerJob, verifyReceipt } from '../ops/development-bootstrap/workers/vekl-worker-job.mjs';
import { dispatchWorkerJob } from '../ops/development-bootstrap/workers/dispatch.mjs';
import { parseArgs } from '../ops/development-bootstrap/bootstrap.mjs';
import { readinessMatrix } from '../ops/development-bootstrap/verify/certify.mjs';

const repoDir = process.cwd();
const temp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `${n}-`));

describe('development bootstrap manifest and roles', () => {
  it('loads a valid manifest with every declared host role resolvable', () => {
    const m = loadManifest();
    expect(validateManifest(m)).toEqual([]);
    const roles = loadRoles();
    for (const r of Object.keys(m.roles)) expect(roles.roles[r]).toBeTruthy();
    expect(itemsForRole(m.runtimes, 'oracle-admin').map((x) => x.id)).not.toContain('rt.codex');
    expect(itemsForRole(m.runtimes, 'dial-hermes-control').map((x) => x.id)).toContain('rt.hermes');
  });
  it('rejects a manifest that carries a secret value or an unknown host', () => {
    const m = loadManifest();
    const bad = JSON.parse(JSON.stringify(m));
    bad.credentials[0].secret_value = 'x';
    bad.services[0].hosts = ['not-a-role'];
    const errors = validateManifest(bad);
    expect(errors.some((e) => /secret values/.test(e))).toBe(true);
    expect(errors.some((e) => /unknown host role/.test(e))).toBe(true);
  });
  it('never lets a forbidden workload through for any role and fails closed on UNKNOWN', () => {
    const roles = loadRoles();
    for (const [role, def] of Object.entries(roles.roles)) for (const w of def.forbidden_workloads) expect(workloadDecision({ role, workload: w, roles }).allowed).toBe(false);
    expect(workloadDecision({ role: 'UNKNOWN', workload: 'DIAGNOSTICS', roles }).code).toBe('ROLE_UNKNOWN');
    expect(() => assertWorkloadAllowed({ workload: 'REPOSITORY_WRITE', env: { DIAL_HOST_ROLE: 'oracle-admin' } })).toThrow(RoleGuardError);
    expect(() => assertWorkloadAllowed({ workload: 'OWNER_CONTROL', env: { DIAL_HOST_ROLE: 'vekl-worker' } })).toThrow(/forbidden/);
    expect(assertWorkloadAllowed({ workload: 'WORKER_JOB', env: { DIAL_HOST_ROLE: 'vekl-worker' } }).allowed).toBe(true);
  });
  it('resolves roles in the declared order and refuses a writable or undeclared role file', () => {
    const dir = temp('dial-role');
    const file = path.join(dir, 'host-role');
    fs.writeFileSync(file, 'dial-hermes-control\n', { mode: 0o644 });
    expect(resolveHostRole({ env: {}, roleFile: file, hostname: 'x' }).role).toBe('dial-hermes-control');
    fs.chmodSync(file, 0o666);
    expect(resolveHostRole({ env: {}, roleFile: file, hostname: 'x' }).role).toBe('UNKNOWN');
    fs.writeFileSync(file, 'mystery\n', { mode: 0o644 }); fs.chmodSync(file, 0o644);
    expect(resolveHostRole({ env: {}, roleFile: file, hostname: 'x' }).role).toBe('UNKNOWN');
    expect(resolveHostRole({ env: { DIAL_HOST_ROLE: 'vekl-worker' }, roleFile: file, hostname: 'x' }).source).toBe('env');
    expect(resolveHostRole({ env: {}, roleFile: '/nonexistent', hostname: 'oracle-admin' }).role).toBe('oracle-admin');
    expect(resolveHostRole({ env: { CLAUDE_CODE_REMOTE: 'true' }, roleFile: '/nonexistent', hostname: 'vm' }).role).toBe('provider-container');
    expect(resolveHostRole({ env: {}, roleFile: '/nonexistent', hostname: 'vm' }).role).toBe('UNKNOWN');
  });
});

describe('development bootstrap result law and hygiene', () => {
  it('issues GREEN only when every mandatory and required check passed', () => {
    const pass = check({ id: 'a', domain: 'X', title: 't', status: STATUS.PASS, criticality: 'MANDATORY' });
    expect(verdict([pass]).verdict).toBe('GREEN');
    expect(verdict([pass, check({ id: 'b', domain: 'X', title: 't', status: STATUS.UNVERIFIED, criticality: 'REQUIRED' })]).verdict).toBe('AMBER');
    expect(verdict([pass, check({ id: 'c', domain: 'X', title: 't', status: STATUS.EXTERNAL_GATE, criticality: 'MANDATORY' })]).verdict).toBe('RED');
    expect(verdict([pass], { p0Open: ['GAP-1'] }).verdict).toBe('RED');
    expect(summarize([pass]).counts.PASS).toBe(1);
    expect(() => check({ id: 'd', domain: 'X', title: 't', status: 'LOOKS_FINE' })).toThrow();
  });
  it('redacts secret-shaped values before they reach any log or report', () => {
    // Fixtures are built at runtime so no secret-shaped literal is ever tracked in the repository.
    const bearer = 'abcdefghijklmnopqrstuvwxyz0123'; const sk = ['sk', 'abcdefghijklmnopqrstuvwxyz'].join('-'); const ghp = ['ghp', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].join('_');
    const out = redact({ cmd: `curl -H "Authorization: Bearer ${bearer}" x`, key: `api_key=${sk}`, token: ghp });
    expect(JSON.stringify(out)).not.toMatch(new RegExp(`${bearer}|${ghp.slice(0, 10)}`));
    expect(JSON.stringify(out)).toMatch(/REDACTED/);
  });
  it('backs up before altering and rolls back byte-for-byte', () => {
    const home = temp('dial-ctl'); const file = path.join(home, 'x.json');
    fs.writeFileSync(file, 'original', { mode: 0o600 });
    const b = backupFile({ controlHome: home, runId: 'run-1', file });
    fs.writeFileSync(file, 'changed');
    const created = path.join(home, 'new.txt'); backupFile({ controlHome: home, runId: 'run-1', file: created }); fs.writeFileSync(created, 'new');
    const r = rollback({ controlHome: home, runId: 'run-1' });
    expect(fs.readFileSync(file, 'utf8')).toBe('original');
    expect(fs.existsSync(created)).toBe(false);
    expect(r.actions.map((a) => a.action)).toEqual(['REMOVE_CREATED', 'RESTORE']);
    expect(b.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('derives owner auth gates only from gated non-passing checks and generates client MCP fragments per role', () => {
    const m = loadManifest();
    const gates = deriveAuthGates([check({ id: 'codex.auth', domain: 'Codex', title: 't', status: STATUS.OWNER_ACTION_REQUIRED, gate: 'AUTH-GATE-CODEX-001', remediation: 'codex login', evidence: { command: 'codex login status' } }), check({ id: 'ok', domain: 'X', title: 't', status: STATUS.PASS })], m);
    expect(gates).toHaveLength(1);
    expect(gates[0]).toMatchObject({ gate_id: 'AUTH-GATE-CODEX-001', status: 'OWNER_ACTION_REQUIRED', auth_type: 'PROVIDER_LOGIN' });
    const frag = clientFragments(m, repoDir, 'provider-container');
    expect(Object.keys(frag.claude_mcp_json.mcpServers)).toEqual(['dial-oracle-status']);
    expect(JSON.parse(fs.readFileSync(path.join(repoDir, '.mcp.json'), 'utf8'))).toEqual(frag.claude_mcp_json);
  });
  it('parses CLI modes and refuses unknown arguments', () => {
    expect(parseArgs(['--verify', '--role', 'vekl-worker', '--json']).mode).toBe('verify');
    expect(parseArgs(['--rollback', 'run-1']).rollbackId).toBe('run-1');
    expect(parseArgs([]).mode).toBe('dry-run');
    expect(() => parseArgs(['--explode'])).toThrow(/unknown argument/);
  });
  it('renders a readiness matrix row for every required domain', () => {
    const matrix = readinessMatrix([]);
    expect(matrix.find((r) => r.domain === 'Hermes').status).toBe('NOT CERTIFIED');
    expect(matrix.filter((r) => r.required).length).toBeGreaterThanOrEqual(12);
  });
});

describe('development bootstrap self-tests', () => {
  it('runs the owner-instruction to owner-response chain read-only with one correlation id', async () => {
    const r = await runE2ESelfTest({ repoDir });
    expect(r.ok).toBe(true);
    expect(r.missing_stages).toEqual([]);
    expect(new Set(r.stages.map((s) => s.correlation_id)).size).toBe(1);
    expect(r.stages.find((s) => s.stage === 'PROVIDER_SELECTION').selected_model).toBe('gpt-5.6-sol');
    expect(r.stages.find((s) => s.stage === 'WORKER_INVOCATION').model_turn_spent).toBe(false);
    expect(fs.existsSync(r.control_root)).toBe(false);
  }, 60000);
  it('reproduces identical control-plane decisions across runs', async () => {
    const r = await runDeterminism({ repoDir, runs: 2 });
    expect(r.identical_decisions).toBe(true);
    expect(r.forbidden_leaks).toEqual([]);
    expect(decisionFingerprint([]).hash).toMatch(/^[0-9a-f]{64}$/);
  }, 90000);
  it('fails visibly and safely under injected faults', async () => {
    const r = await runFaultInjection({ repoDir });
    const byId = Object.fromEntries(r.scenarios.map((s) => [s.id, s]));
    expect(byId['provider-total-loss'].ok).toBe(true);
    expect(byId['alternate-model-identity'].ok).toBe(true);
    expect(byId['role-mismatch'].ok).toBe(true);
    expect(byId['stale-knowledge-binding'].ok).toBe(true);
    expect(r.ok).toBe(true);
  }, 120000);
  it('executes only allowlisted worker jobs and seals receipts', async () => {
    const root = temp('dial-worker');
    const bad = await executeWorkerJob({ kind: 'RUN_SHELL', job_id: 'j1' }, { repoDir, workerRoot: root, env: { DIAL_HOST_ROLE: 'vekl-worker' } });
    expect(bad.state).toBe('FAILED'); expect(bad.error.code).toBe('JOB_KIND_NOT_ALLOWED');
    const denied = await executeWorkerJob({ kind: 'STRUCTURAL_SNAPSHOT', job_id: 'j2' }, { repoDir, workerRoot: root, env: { DIAL_HOST_ROLE: 'oracle-admin' } });
    expect(denied.state).toBe('FAILED'); expect(denied.error.code).toBe('WORKLOAD_FORBIDDEN_FOR_ROLE');
    const d = await dispatchWorkerJob({ kind: 'REPO_HEAD', repoDir, transport: 'local', workerEnv: { DIAL_HOST_ROLE: 'vekl-worker' }, workerRoot: root });
    expect(d.ok).toBe(true); expect(verifyReceipt(d.receipt)).toBe(true);
    d.receipt.result.head = 'tampered'; expect(verifyReceipt(d.receipt)).toBe(false);
  }, 30000);
});
