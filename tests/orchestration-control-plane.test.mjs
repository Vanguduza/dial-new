import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCheckpoint, captureGitState, loadCheckpoint, saveCheckpoint } from '../agent-system/orchestration/checkpoint-store.mjs';
import { appendFeatureMemory, readFeatureMemory } from '../agent-system/orchestration/feature-memory.mjs';
import { buildHandoffCapsule, saveHandoffCapsule } from '../agent-system/orchestration/handoff-builder.mjs';
import { healthFresh, runtimeEligible, recordRuntimeHealth } from '../agent-system/orchestration/runtime-health.mjs';
import { reconcileHermesRuntime } from '../agent-system/orchestration/hermes-runtime-router.mjs';
import { ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from '../agent-system/orchestration/state-store.mjs';
import { buildDialHermesContext, resolveFeatureId } from '../agent-system/orchestration/context-broker.mjs';

function temp(name) { return mkdtempSync(path.join(tmpdir(), `${name}-`)); }
function makeRepo() {
  const repo = temp('dial-hermes-repo');
  mkdirSync(path.join(repo, 'agent-system/registries'), { recursive: true });
  mkdirSync(path.join(repo, 'agent-system/bin'), { recursive: true });
  writeFileSync(path.join(repo, 'agent-system/registries/FEATURE_REGISTRY.json'), JSON.stringify([{ feature_id: 'TEST-F001' }]));
  writeFileSync(path.join(repo, 'agent-system/registries/ACTIVE_WORK.json'), JSON.stringify({ feature_id: 'TEST-F001', worktree: null, target_gate: 'DOMAIN_TESTED' }));
  writeFileSync(path.join(repo, 'agent-system/registries/DECISION_LOG.json'), '[]');
  writeFileSync(path.join(repo, 'agent-system/bin/context-get.mjs'), "console.log('CANONICAL FEATURE CONTEXT TEST-F001 GATE DOMAIN_TESTED');\n");
  writeFileSync(path.join(repo, 'package.json'), '{}');
  execFileSync('git', ['init'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'ci@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'CI'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repo });
  return repo;
}
function recordPair(root, {
  sol = 'HEALTHY', sonnet = 'HEALTHY', solResolved = 'gpt-5.6-sol', sonnetResolved = 'claude-sonnet-5',
} = {}) {
  recordRuntimeHealth('codex_app_server', { state: sol, requested_model: 'gpt-5.6-sol', resolved_model: solResolved, details: { toolchain_usable: sol === 'HEALTHY' } }, root);
  recordRuntimeHealth('claude_code', { state: sonnet, requested_model: 'claude-sonnet-5', resolved_model: sonnetResolved, details: { toolchain_usable: sonnet === 'HEALTHY' } }, root);
}

describe('orchestration state store', () => {
  it('creates persistent state and refuses path traversal', () => {
    const root = temp('dial-control'); ensureControlLayout(root);
    const target = writeJsonAtomic('state/test.json', { ok: true }, root);
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual({ ok: true });
    expect(readJson('state/test.json', null, root)).toEqual({ ok: true });
    expect(() => resolveControlPath('../escape.json', root)).toThrow(/escapes control root/);
  });
});

describe('Hermes runtime evidence and routing', () => {
  it('requires fresh exact requested/resolved identity', () => {
    const observed_at = new Date().toISOString();
    expect(runtimeEligible({ state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at })).toBe(true);
    expect(runtimeEligible({ state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-luna', observed_at })).toBe(false);
    expect(runtimeEligible({ state: 'AUTH_FAILED', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at })).toBe(false);
    const stale = { state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at: new Date(Date.now() - 30 * 60 * 1000).toISOString() };
    expect(healthFresh(stale)).toBe(false); expect(runtimeEligible(stale)).toBe(false);
  });
  it('prefers Sol when both runtimes are healthy', () => {
    const root = temp('dial-control'); recordPair(root);
    const result = reconcileHermesRuntime({ root });
    expect(result.selection.runtime).toBe('codex_app_server');
    expect(result.selection.requested_model).toBe('gpt-5.6-sol');
    expect(result.selection.resolved_model).toBe('gpt-5.6-sol');
    expect(result.selection.authority).toBe('HERMES_RUNTIME_ONLY');
  });
  it('falls back to Sonnet when Sol is unavailable', () => {
    const root = temp('dial-control'); recordPair(root, { sol: 'ACCOUNT_LIMITED', sonnet: 'HEALTHY' });
    const result = reconcileHermesRuntime({ root });
    expect(result.selection.runtime).toBe('claude_code');
    expect(result.selection.resolved_model).toBe('claude-sonnet-5');
  });
  it('returns NO_HERMES_RUNTIME_AVAILABLE for total loss', () => {
    const root = temp('dial-control'); recordPair(root, { sol: 'PROCESS_FAILED', sonnet: 'ACCOUNT_LIMITED' });
    const result = reconcileHermesRuntime({ root });
    expect(result.selected).toBe(false); expect(result.reason).toBe('NO_HERMES_RUNTIME_AVAILABLE');
  });
  it('rejects identity mismatch and auth failure', () => {
    const mismatch = temp('dial-control'); recordPair(mismatch, { solResolved: 'gpt-5.6-luna', sonnet: 'PROCESS_FAILED' });
    expect(reconcileHermesRuntime({ root: mismatch }).reason).toBe('NO_HERMES_RUNTIME_AVAILABLE');
    const auth = temp('dial-control'); recordPair(auth, { sol: 'AUTH_FAILED', sonnet: 'AUTH_FAILED' });
    expect(reconcileHermesRuntime({ root: auth }).reason).toBe('NO_HERMES_RUNTIME_AVAILABLE');
  });
});

describe('checkpoint, memory and handoff continuity', () => {
  it('mirrors checkpoint into HOT memory and captures dirty state', () => {
    const repo = makeRepo(), root = temp('dial-control');
    const cp = buildCheckpoint(repo, { runtime_provenance: { runtime: 'codex_app_server', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol' } });
    saveCheckpoint(cp, root);
    const hot = readJson('memory/hot/TEST-F001.json', null, root);
    expect(hot.target_gate).toBe('DOMAIN_TESTED'); expect(hot.authority).toBe('NON_AUTHORITATIVE_CONTEXT');
    writeFileSync(path.join(repo, 'dirty.txt'), 'x'); expect(captureGitState(repo).dirty).toBe(true);
    expect(() => buildCheckpoint(repo, { feature_id: 'TEST-F999' })).toThrow(/unknown Feature ID/);
  });
  it('persists handoff into Feature memory and rejects secrets', () => {
    const repo = makeRepo(), root = temp('dial-control');
    const cp = buildCheckpoint(repo, { runtime_provenance: { runtime: 'claude_code', requested_model: 'claude-sonnet-5', resolved_model: 'claude-sonnet-5' } });
    saveCheckpoint(cp, root);
    const capsule = buildHandoffCapsule(cp, { objective: 'Qualify runtime continuity', completed: ['checkpoint written'], next_action: 'run recovery probe' });
    saveHandoffCapsule(capsule, root);
    const memory = readFeatureMemory('TEST-F001', {}, root);
    expect(memory.records.some((r) => r.type === 'HANDOFF')).toBe(true);
    expect(memory.records.at(-1).runtime_provenance.runtime).toBe('claude_code');
    expect(() => appendFeatureMemory('TEST-F001', { text: 'safe note', refs: ['access_token=super-secret-token-value'] }, root)).toThrow(/possible secret material/);
  });
});

describe('DIAL context and runtime boundary', () => {
  it('resolves repository context above non-authoritative memory', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    process.env.DIAL_DISABLE_HERMES_HISTORY = '1';
    saveCheckpoint(buildCheckpoint(repo), root);
    appendFeatureMemory('TEST-F001', { type: 'NOTE', text: 'Memory claims gate PRODUCTION_GREEN, but this is non-authoritative.' }, root);
    const packet = await buildDialHermesContext({ repoDir: repo, userMessage: 'continue TEST-F001', root });
    expect(packet.context).toContain('CANONICAL FEATURE CONTEXT TEST-F001 GATE DOMAIN_TESTED');
    expect(packet.context).toContain('Memory claims gate PRODUCTION_GREEN');
    expect(packet.context.indexOf('Bounded DIAL Feature context')).toBeLessThan(packet.context.indexOf('Feature-scoped Oracle memory'));
    expect(loadCheckpoint('TEST-F001', root).target_gate).toBe('DOMAIN_TESTED');
    delete process.env.DIAL_DISABLE_HERMES_HISTORY;
  });
  it('runtime selection does not alter DIAL gate or ACTIVE_WORK state', () => {
    const repo = makeRepo(), root = temp('dial-control'); saveCheckpoint(buildCheckpoint(repo), root);
    const active = path.join(repo, 'agent-system/registries/ACTIVE_WORK.json'); const before = readFileSync(active, 'utf8');
    recordPair(root, { sol: 'ACCOUNT_LIMITED', sonnet: 'HEALTHY' });
    expect(reconcileHermesRuntime({ root }).selection.runtime).toBe('claude_code');
    expect(loadCheckpoint('TEST-F001', root).target_gate).toBe('DOMAIN_TESTED');
    expect(readFileSync(active, 'utf8')).toBe(before);
  });
  it('prefers explicit Feature ID in the incoming turn', () => {
    const repo = makeRepo(); expect(resolveFeatureId({ userMessage: 'continue TEST-F001 please', repoDir: repo })).toBe('TEST-F001');
  });
});
