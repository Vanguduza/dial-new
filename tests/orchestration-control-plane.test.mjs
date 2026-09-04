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
import { classifyPrimaryFailure, executeHermesInstruction } from '../agent-system/orchestration/hermes-runtime-executor.mjs';
import {
  injectHermesPlanModels,
  parseClaudeModelListEvidence,
  parseCodexModelListEvidence,
} from '../agent-system/orchestration/hermes-plan-models.mjs';
import { listClaudePlanModels } from '../agent-system/orchestration/claude-code-probe.mjs';
import { listCodexPlanModels } from '../agent-system/orchestration/codex-app-server-probe.mjs';
import { ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from '../agent-system/orchestration/state-store.mjs';
import { buildDialHermesContext, resolveFeatureId } from '../agent-system/orchestration/context-broker.mjs';
import {
  externalWorkStatus,
  processNextExternalWork,
  submitExternalWork,
} from '../agent-system/orchestration/external-orchestrator.mjs';

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
  sol = 'HEALTHY',
  sonnet = 'HEALTHY',
  solRequested = 'gpt-5.6-sol',
  solResolved = 'gpt-5.6-sol',
  sonnetRequested = 'claude-sonnet-5',
  sonnetResolved = 'claude-sonnet-5',
} = {}) {
  recordRuntimeHealth('codex_app_server', {
    state: sol,
    requested_model: solRequested,
    resolved_model: solResolved,
    details: { toolchain_usable: sol === 'HEALTHY', identity_proven: solRequested === solResolved },
  }, root);
  recordRuntimeHealth('claude_code', {
    state: sonnet,
    requested_model: sonnetRequested,
    resolved_model: sonnetResolved,
    details: { toolchain_usable: sonnet === 'HEALTHY', identity_proven: sonnetRequested === sonnetResolved },
  }, root);
}
function healthyPlanModel(id) {
  return {
    id,
    state: 'HEALTHY',
    requested_model: id,
    resolved_model: id,
    observed_at: new Date().toISOString(),
    details: { toolchain_usable: true, identity_proven: true },
  };
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

describe('locked Hermes runtime policy', () => {
  it('requires fresh exact identity and proven toolchain usability', () => {
    const observed_at = new Date().toISOString();
    const usable = { details: { toolchain_usable: true } };
    expect(runtimeEligible({ state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at, ...usable })).toBe(true);
    expect(runtimeEligible({ state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-luna', observed_at, ...usable })).toBe(false);
    expect(runtimeEligible({ state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at, details: { toolchain_usable: false } })).toBe(false);
    const stale = { state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(), ...usable };
    expect(healthFresh(stale)).toBe(false); expect(runtimeEligible(stale)).toBe(false);
  });

  it('selects exact Sol when both locked runtimes are healthy', () => {
    const root = temp('dial-control'); recordPair(root);
    const result = reconcileHermesRuntime({ root });
    expect(result.selection.runtime).toBe('codex_app_server');
    expect(result.selection.requested_model).toBe('gpt-5.6-sol');
    expect(result.selection.resolved_model).toBe('gpt-5.6-sol');
    expect(result.selection.policy).toBe('LOCKED_SOL_THEN_SONNET');
    expect(result.selection.in_plan_fallback).toBe(false);
  });

  it('falls immediately to exact Sonnet 5 when Sol is unavailable', () => {
    const root = temp('dial-control'); recordPair(root, { sol: 'ACCOUNT_LIMITED' });
    const result = reconcileHermesRuntime({ root });
    expect(result.selection.runtime).toBe('claude_code');
    expect(result.selection.requested_model).toBe('claude-sonnet-5');
    expect(result.selection.resolved_model).toBe('claude-sonnet-5');
  });

  it('never inserts another healthy Codex-plan model between Sol and Sonnet', () => {
    const root = temp('dial-control'); recordPair(root, { sol: 'ACCOUNT_LIMITED' });
    injectHermesPlanModels({ root, codex: [healthyPlanModel('gpt-5.4'), healthyPlanModel('gpt-5.5-codex')] });
    const result = reconcileHermesRuntime({ root });
    expect(result.selection.runtime).toBe('claude_code');
    expect(result.selection.selected_model).toBe('claude-sonnet-5');
    expect(result.selection.in_plan_fallback).toBe(false);
  });

  it('rejects a non-Sol Codex slot even when it is healthy', () => {
    const root = temp('dial-control');
    recordPair(root, { solRequested: 'gpt-5.4', solResolved: 'gpt-5.4', sonnet: 'HEALTHY' });
    const result = reconcileHermesRuntime({ root });
    expect(result.selection.runtime).toBe('claude_code');
    expect(result.selection.requested_model).toBe('claude-sonnet-5');
  });

  it('rejects alternate Sonnet-class models and fails closed', () => {
    const root = temp('dial-control');
    recordPair(root, {
      sol: 'ACCOUNT_LIMITED',
      sonnetRequested: 'claude-sonnet-4-6',
      sonnetResolved: 'claude-sonnet-4-6',
    });
    const result = reconcileHermesRuntime({ root });
    expect(result.selected).toBe(false);
    expect(result.reason).toBe('NO_HERMES_RUNTIME_AVAILABLE');
  });

  it('returns NO_HERMES_RUNTIME_AVAILABLE for total loss', () => {
    const root = temp('dial-control'); recordPair(root, { sol: 'PROCESS_FAILED', sonnet: 'ACCOUNT_LIMITED' });
    const result = reconcileHermesRuntime({ root });
    expect(result.selected).toBe(false); expect(result.reason).toBe('NO_HERMES_RUNTIME_AVAILABLE');
  });

  it('keeps model-list discovery informational rather than executable', async () => {
    const root = temp('dial-control');
    const codex = await listCodexPlanModels({
      root,
      listRunner: async () => ({ data: [{ model: 'gpt-5.6-sol' }, { model: 'gpt-5.4' }] }),
    });
    expect(codex.models.map((model) => model.id)).toEqual(['gpt-5.6-sol', 'gpt-5.4']);
    const claude = listClaudePlanModels({
      root,
      listRunner: () => [{ id: 'claude-sonnet-5' }, { id: 'claude-sonnet-4-6' }],
    });
    expect(claude.models.map((model) => model.id)).toEqual(['claude-sonnet-5', 'claude-sonnet-4-6']);
    expect(parseCodexModelListEvidence({ result: { data: [{ model: 'gpt-5.4' }] } })[0].id).toBe('gpt-5.4');
    expect(parseClaudeModelListEvidence('not-json')).toEqual([]);
  });
});

describe('Hermes operational executor', () => {
  it('classifies capacity and process failures', () => {
    expect(classifyPrimaryFailure({ status: 1, stderr: 'usage limit exceeded for this account' })).toBe('ACCOUNT_LIMITED');
    expect(classifyPrimaryFailure({ status: 1, stderr: '429 too many requests' })).toBe('RATE_LIMITED');
    expect(classifyPrimaryFailure({ status: 1, stderr: 'Codex app-server turn failed: connection closed' })).toBe('PROCESS_FAILED');
    expect(classifyPrimaryFailure({ status: 0, stderr: 'resolved model identity mismatch' })).toBe('TOOLCHAIN_DEGRADED');
  });

  it('completes through exact Sol without invoking fallback', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    let fallbackCalled = false;
    const result = await executeHermesInstruction({
      repoDir: repo,
      root,
      instruction: 'Inspect TEST-F001.',
      primaryRunner: async ({ model }) => ({
        ok: true,
        runtime: 'codex_app_server',
        requested_model: model,
        resolved_model: model,
        state: 'HEALTHY',
        response: 'sol complete',
      }),
      ensureFallback: async () => { fallbackCalled = true; return { eligible: true }; },
    });
    expect(result.runtime).toBe('codex_app_server');
    expect(result.requested_model).toBe('gpt-5.6-sol');
    expect(result.resolved_model).toBe('gpt-5.6-sol');
    expect(result.fallback_used).toBe(false);
    expect(fallbackCalled).toBe(false);
  });

  it('continues the same instruction directly through exact Sonnet 5 after Sol failure', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    const active = path.join(repo, 'agent-system/registries/ACTIVE_WORK.json');
    const before = readFileSync(active, 'utf8');
    const primaryModels = [];
    let fallbackCall = null;

    const result = await executeHermesInstruction({
      repoDir: repo,
      root,
      instruction: 'Continue TEST-F001 and verify current implementation.',
      primaryRunner: async ({ model }) => {
        primaryModels.push(model);
        return { ok: false, runtime: 'codex_app_server', requested_model: model, resolved_model: model, state: 'ACCOUNT_LIMITED' };
      },
      ensureFallback: async () => ({ eligible: true }),
      contextBuilder: async () => ({ context: 'CANONICAL FEATURE CONTEXT TEST-F001 GATE DOMAIN_TESTED' }),
      fallbackRunner: async (input) => {
        fallbackCall = input;
        return {
          event: { requested_model: 'claude-sonnet-5', resolved_model: 'claude-sonnet-5' },
          output: { result: 'continued safely' },
        };
      },
    });

    expect(primaryModels).toEqual(['gpt-5.6-sol']);
    expect(result.runtime).toBe('claude_code');
    expect(result.requested_model).toBe('claude-sonnet-5');
    expect(result.resolved_model).toBe('claude-sonnet-5');
    expect(result.fallback_used).toBe(true);
    expect(result.response).toBe('continued safely');
    expect(fallbackCall.mode).toBe('operational');
    expect(fallbackCall.instruction).toContain('only permitted fallback runtime');
    expect(fallbackCall.instruction).toContain('ORIGINAL INSTRUCTION');
    expect(loadCheckpoint('TEST-F001', root).target_gate).toBe('DOMAIN_TESTED');
    expect(readFileSync(active, 'utf8')).toBe(before);
  });

  it('fails closed when exact Sonnet 5 is unavailable', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    const result = await executeHermesInstruction({
      repoDir: repo,
      root,
      instruction: 'Continue TEST-F001.',
      primaryRunner: async () => ({ ok: false, state: 'PROCESS_FAILED', resolved_model: 'gpt-5.6-sol' }),
      ensureFallback: async () => ({ eligible: false, reason: 'CLAUDE_SONNET_5_NOT_HEALTHY' }),
    });
    expect(result.event).toBe('HERMES_OPERATIONAL_TURN_FAILED');
    expect(result.reason).toBe('NO_HERMES_RUNTIME_AVAILABLE');
    expect(result.fallback_used).toBe(false);
  });

  it('fails closed if fallback provenance resolves to anything except Sonnet 5', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    const result = await executeHermesInstruction({
      repoDir: repo,
      root,
      instruction: 'Continue TEST-F001.',
      primaryRunner: async () => ({ ok: false, state: 'MODEL_LIMITED', resolved_model: 'gpt-5.6-sol' }),
      ensureFallback: async () => ({ eligible: true }),
      contextBuilder: async () => ({ context: 'TEST' }),
      fallbackRunner: async () => ({ event: { resolved_model: 'claude-sonnet-4-6' }, output: { result: 'wrong model' } }),
    });
    expect(result.event).toBe('HERMES_OPERATIONAL_TURN_FAILED');
    expect(result.failure_state).toBe('FALLBACK_FAILED');
  });
});

describe('external Oracle orchestration queue', () => {
  it('submits and executes work from the persistent control plane with provenance', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    const queued = submitExternalWork({
      root,
      instruction: 'Verify TEST-F001 without changing its gate.',
      requestedBy: 'qualification',
    });
    expect(queued.execution_origin).toBe('EXTERNAL_ORACLE_ORCHESTRATOR');
    expect(externalWorkStatus(null, root).queued).toBe(1);

    const processed = await processNextExternalWork({
      repoDir: repo,
      root,
      executor: async ({ instruction }) => ({
        event: 'HERMES_OPERATIONAL_TURN_COMPLETED',
        authority: 'HERMES_RUNTIME_ONLY',
        policy: 'LOCKED_SOL_THEN_SONNET',
        runtime: 'codex_app_server',
        requested_model: 'gpt-5.6-sol',
        resolved_model: 'gpt-5.6-sol',
        fallback_used: false,
        response: instruction,
      }),
    });

    expect(processed.state).toBe('COMPLETED');
    expect(processed.execution_origin).toBe('EXTERNAL_ORACLE_ORCHESTRATOR');
    expect(processed.runtime_provenance.requested_model).toBe('gpt-5.6-sol');
    expect(externalWorkStatus(queued.job_id, root).state).toBe('COMPLETED');
    expect(externalWorkStatus(null, root).queued).toBe(0);
  });

  it('persists failed external work instead of silently advancing', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    const queued = submitExternalWork({ root, instruction: 'Continue TEST-F001.' });
    const processed = await processNextExternalWork({
      repoDir: repo,
      root,
      executor: async () => ({
        event: 'HERMES_OPERATIONAL_TURN_FAILED',
        policy: 'LOCKED_SOL_THEN_SONNET',
        runtime: null,
        requested_model: null,
        resolved_model: null,
        fallback_used: false,
        reason: 'NO_HERMES_RUNTIME_AVAILABLE',
      }),
    });
    expect(processed.state).toBe('FAILED');
    expect(externalWorkStatus(queued.job_id, root).state).toBe('FAILED');
  });
});

describe('checkpoint, memory and DIAL authority boundary', () => {
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

  it('resolves repository context above non-authoritative memory', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    process.env.DIAL_DISABLE_HERMES_HISTORY = '1';
    saveCheckpoint(buildCheckpoint(repo), root);
    appendFeatureMemory('TEST-F001', { type: 'NOTE', text: 'Memory claims gate PRODUCTION_GREEN, but this is non-authoritative.' }, root);
    const packet = await buildDialHermesContext({ repoDir: repo, userMessage: 'continue TEST-F001', root });
    expect(packet.context).toContain('CANONICAL FEATURE CONTEXT TEST-F001 GATE DOMAIN_TESTED');
    expect(packet.context).toContain('Memory claims gate PRODUCTION_GREEN');
    const canonicalSection = packet.context.indexOf('\nBounded DIAL Feature context:\n');
    const memorySection = packet.context.indexOf('\nFeature-scoped Oracle memory (non-authoritative):\n');
    expect(canonicalSection).toBeGreaterThanOrEqual(0);
    expect(memorySection).toBeGreaterThanOrEqual(0);
    expect(canonicalSection).toBeLessThan(memorySection);
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
