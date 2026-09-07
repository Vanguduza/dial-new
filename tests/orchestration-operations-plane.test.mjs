import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clearOperationsApi,
  configureOperationsApi,
  operationsApiStatus,
  sanitizeOperationsEvidence,
  summarizeOperationsEvidence,
} from '../agent-system/orchestration/operations-api.mjs';
import {
  ensureProjectRegistry,
  getProject,
  registerProject,
} from '../agent-system/orchestration/project-registry.mjs';
import {
  ALLOWED_OPERATION_JOBS,
  OPERATIONS_AUTHORITY,
  ensureOperationsSchedules,
  queueHealth,
  runOperationsJob,
  serviceRecovery,
  setOperationsSchedule,
} from '../agent-system/orchestration/operations-plane.mjs';
import { readJson, resolveControlPath, writeJsonAtomic } from '../agent-system/orchestration/state-store.mjs';

function temp(name) { return mkdtempSync(path.join(tmpdir(), `${name}-`)); }
function makeRepo(name = 'ops-repo') {
  const repo = temp(name);
  writeFileSync(path.join(repo, 'package.json'), '{}\n');
  execFileSync('git', ['init'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'ci@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'CI'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repo });
  return repo;
}

describe('auxiliary operations API boundary', () => {
  it('stores key material outside config with 0600 permissions and never returns it', () => {
    const root = temp('ops-control');
    const key = 'sk-test-operations-secret-123456789';
    const status = configureOperationsApi({ baseUrl: 'https://api.example.test/v1/', model: 'cheap-ops-model', apiKey: key }, root);
    expect(status.configured).toBe(true);
    expect(status.enabled).toBe(true);
    expect(status.authority).toBe('NON_AUTHORITATIVE_AUXILIARY_OPERATIONS_ONLY');
    expect(status.key_material_exposed).toBe(false);
    expect(status).not.toHaveProperty('api_key');
    const cfg = readJson('operations/api-config.json', null, root);
    expect(JSON.stringify(cfg)).not.toContain(key);
    const secretPath = resolveControlPath('secrets/operations-api.key', root);
    expect((statSync(secretPath).mode & 0o777).toString(8)).toBe('600');
    expect(readFileSync(secretPath, 'utf8').trim()).toBe(key);
    clearOperationsApi(root);
    expect(operationsApiStatus(root).configured).toBe(false);
  });

  it('redacts common secrets before evidence can leave the host', () => {
    const text = sanitizeOperationsEvidence('OPENAI_API_KEY=abc123456789 Bearer tokenvalue123456 sk-secretsecretsecret');
    expect(text).not.toContain('abc123456789');
    expect(text).not.toContain('tokenvalue123456');
    expect(text).not.toContain('sk-secretsecretsecret');
  });

  it('uses a mock API only for a non-authoritative summary and exposes no secret in the result', async () => {
    const root = temp('ops-control');
    const key = 'sk-test-operations-secret-123456789';
    configureOperationsApi({ baseUrl: 'https://api.example.test/v1', model: 'cheap-ops-model', apiKey: key }, root);
    let request;
    const fetchImpl = async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, async json() { return { choices: [{ message: { content: 'Evidence is green; manager review still required.' } }] }; } };
    };
    const result = await summarizeOperationsEvidence({ purpose: 'test summary', evidence: { ok: true, OPENAI_API_KEY: 'should-redact' }, root, fetchImpl });
    expect(result.state).toBe('COMPLETED');
    expect(result.authority).toBe('NON_AUTHORITATIVE_AUXILIARY_OPERATIONS_ONLY');
    expect(result.summary).toContain('manager review');
    expect(JSON.stringify(result)).not.toContain(key);
    expect(request.url).toBe('https://api.example.test/v1/chat/completions');
    expect(request.options.headers.authorization).toBe(`Bearer ${key}`);
    expect(request.options.body).not.toContain('should-redact');
    expect(request.options.body).toContain('Never authorize development');
  });
});

describe('strict project isolation', () => {
  it('creates DIAL with locked policy and keeps additional repos separately registered', () => {
    const root = temp('ops-control');
    const dialRepo = makeRepo('dial-project');
    const ddeRepo = makeRepo('dde-project');
    ensureProjectRegistry(root, { dialRepoDir: dialRepo });
    registerProject({ slug: 'dde', name: 'DDE', repoDir: ddeRepo, managerPolicy: 'DDE_SEPARATE_POLICY' }, root);
    const dial = getProject('dial', root);
    const dde = getProject('dde', root);
    expect(dial.manager_policy).toBe('GPT-5.6_SOL_THEN_CLAUDE_SONNET_5');
    expect(dial.development_authority).toBe('EXTERNAL_HERMES_PRODUCTION_GREEN_ONLY');
    expect(dde.manager_policy).toBe('DDE_SEPARATE_POLICY');
    expect(dde.repo_dir).not.toBe(dial.repo_dir);
    expect(dde.auxiliary_operations_authority).toBe('NON_AUTHORITATIVE');
  });

  it('rejects duplicate repo registration under another project', () => {
    const root = temp('ops-control');
    const repo = makeRepo('duplicate-project');
    ensureProjectRegistry(root, { dialRepoDir: repo });
    expect(() => registerProject({ slug: 'other', name: 'Other', repoDir: repo }, root)).toThrow(/already registered/);
  });
});

describe('deterministic auxiliary operations', () => {
  it('supports only the fixed read-only job whitelist', async () => {
    expect(ALLOWED_OPERATION_JOBS).toEqual(['service_health', 'service_recovery', 'queue_health', 'repo_integrity', 'deterministic_verify', 'evidence_prepare', 'backup_verify']);
    const root = temp('ops-control');
    const repo = makeRepo('ops-job');
    ensureProjectRegistry(root, { dialRepoDir: repo });
    await expect(runOperationsJob({ job: 'run_arbitrary_shell', root })).rejects.toThrow(/unsupported operations job/);
  });

  it('prepares repository evidence without modifying repository state', async () => {
    const root = temp('ops-control');
    const repo = makeRepo('ops-readonly');
    ensureProjectRegistry(root, { dialRepoDir: repo });
    const beforeHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    const beforeStatus = execFileSync('git', ['status', '--porcelain=v1'], { cwd: repo, encoding: 'utf8' });
    const result = await runOperationsJob({ job: 'repo_integrity', projectSlug: 'dial', root });
    const afterHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    const afterStatus = execFileSync('git', ['status', '--porcelain=v1'], { cwd: repo, encoding: 'utf8' });
    expect(result.authority).toBe(OPERATIONS_AUTHORITY);
    expect(result.development_authority).toBe(false);
    expect(result.evidence.ok).toBe(true);
    expect(afterHead).toBe(beforeHead);
    expect(afterStatus).toBe(beforeStatus);
    const latest = readJson('operations/projects/dial/latest/repo_integrity.json', null, root);
    expect(latest.evidence.head).toBe(beforeHead);
  });

  it('persists schedules with API usage off unless explicitly enabled', () => {
    const root = temp('ops-control');
    const repo = makeRepo('ops-schedules');
    ensureProjectRegistry(root, { dialRepoDir: repo });
    const defaults = ensureOperationsSchedules(root);
    expect(defaults.schedules.every((entry) => entry.use_api === false)).toBe(true);
    const updated = setOperationsSchedule({ project: 'dial', job: 'evidence_prepare', intervalMinutes: 720, enabled: true, useApi: true }, root);
    expect(updated.interval_minutes).toBe(720);
    expect(updated.use_api).toBe(true);
  });

  it('recovers only the fixed DIAL service allowlist and never the operations service itself', async () => {
    const root = temp('ops-control');
    const repo = makeRepo('ops-recovery');
    ensureProjectRegistry(root, { dialRepoDir: repo });
    const active = new Set(['hermes-gateway.service', 'hermes-dial-dashboard.service', 'dial-hermes-orchestrator.service', 'dial-hermes-operations.service', 'dial-mission-controller.service', 'dial-chat-control.service']);
    const restarted = [];
    const runner = (_command, args) => {
      const action = args[1], service = args[2];
      if (action === 'is-active') return { ok: active.has(service), stdout: active.has(service) ? 'active' : 'inactive' };
      if (action === 'is-enabled') return { ok: true, stdout: 'enabled' };
      if (action === 'restart') { restarted.push(service); active.add(service); return { ok: true, stdout: '' }; }
      throw new Error(`unexpected runner call: ${args.join(' ')}`);
    };
    const project = getProject('dial', root);
    const result = serviceRecovery(project, runner);
    expect(result.ok).toBe(true);
    expect(result.action_taken).toBe(true);
    expect(restarted).toEqual(['dial-hermes-runtime.service']);
    expect(restarted).not.toContain('dial-hermes-operations.service');
    expect(result.development_authority).toBe(false);
  });

  it('reports queue health from persistent queue state without exposing job instructions', () => {
    const root = temp('ops-control');
    const repo = makeRepo('ops-queue');
    ensureProjectRegistry(root, { dialRepoDir: repo });
    writeJsonAtomic('state/external-orchestrator-heartbeat.json', {
      execution_origin: 'EXTERNAL_ORACLE_ORCHESTRATOR', observed_at: new Date().toISOString(),
    }, root);
    writeJsonAtomic('work-queue/inbox/job-visible-only-by-id.json', { instruction: 'SECRET JOB CONTENT MUST NOT LEAK' }, root);
    const result = queueHealth(root);
    expect(result.ok).toBe(true);
    expect(result.counts.inbox).toBe(1);
    expect(JSON.stringify(result)).not.toContain('SECRET JOB CONTENT MUST NOT LEAK');
  });

  it('runs only the fixed DIAL deterministic verification command through an injected runner', async () => {
    const root = temp('ops-control');
    const repo = makeRepo('ops-verify');
    ensureProjectRegistry(root, { dialRepoDir: repo });
    const calls = [];
    const runner = (command, args, cwd) => {
      calls.push({ command, args, cwd });
      return { ok: true, stdout: 'verification green', duration_ms: 42 };
    };
    const result = await runOperationsJob({ job: 'deterministic_verify', projectSlug: 'dial', root, runner });
    expect(result.evidence.ok).toBe(true);
    expect(result.evidence.model_runtime_used).toBe(false);
    expect(calls).toEqual([{ command: 'npm', args: ['run', 'verify'], cwd: repo }]);
  });

});
