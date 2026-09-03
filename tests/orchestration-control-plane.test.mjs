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
  classifyClaudeHermesModel,
  injectHermesPlanModels,
  parseClaudeModelListEvidence,
  parseCodexModelListEvidence,
} from '../agent-system/orchestration/hermes-plan-models.mjs';
import { listClaudePlanModels } from '../agent-system/orchestration/claude-code-probe.mjs';
import { listCodexPlanModels } from '../agent-system/orchestration/codex-app-server-probe.mjs';
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
function healthyPlanModel(id, extras = {}) {
  return {
    id,
    state: 'HEALTHY',
    requested_model: id,
    resolved_model: id,
    observed_at: new Date().toISOString(),
    details: { toolchain_usable: true, identity_proven: true },
    ...extras,
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

describe('Hermes runtime evidence and routing', () => {
  it('requires fresh exact identity and explicitly proven toolchain usability', () => {
    const observed_at = new Date().toISOString();
    const usable = { details: { toolchain_usable: true } };
    expect(runtimeEligible({ state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at, ...usable })).toBe(true);
    expect(runtimeEligible({ state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-luna', observed_at, ...usable })).toBe(false);
    expect(runtimeEligible({ state: 'AUTH_FAILED', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at, ...usable })).toBe(false);
    expect(runtimeEligible({ state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at, details: { toolchain_usable: false } })).toBe(false);
    expect(runtimeEligible({ state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at })).toBe(false);
    const stale = { state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(), ...usable };
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

describe('Hermes in-plan availability fallback', () => {
  it('prefers Sol when healthy even if other Codex plan models are listed', () => {
    const root = temp('dial-control');
    recordPair(root);
    injectHermesPlanModels({
      root,
      codex: [healthyPlanModel('gpt-5.6-sol'), healthyPlanModel('gpt-5.4')],
      claude: [healthyPlanModel('claude-sonnet-5')],
    });
    const result = reconcileHermesRuntime({ root });
    expect(result.selection.runtime).toBe('codex_app_server');
    expect(result.selection.preferred_model).toBe('gpt-5.6-sol');
    expect(result.selection.requested_model).toBe('gpt-5.6-sol');
    expect(result.selection.selected_model).toBe('gpt-5.6-sol');
    expect(result.selection.resolved_model).toBe('gpt-5.6-sol');
    expect(result.selection.in_plan_fallback).toBe(false);
    expect(result.selection.authority).toBe('HERMES_RUNTIME_ONLY');
  });

  it('selects the next Codex plan model on the same runtime when Sol is limited', () => {
    const root = temp('dial-control');
    recordPair(root, { sol: 'ACCOUNT_LIMITED', sonnet: 'HEALTHY' });
    injectHermesPlanModels({
      root,
      codex: [
        { id: 'gpt-5.6-sol', state: 'ACCOUNT_LIMITED', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol' },
        healthyPlanModel('gpt-5.4'),
      ],
      claude: [healthyPlanModel('claude-sonnet-5')],
    });
    const result = reconcileHermesRuntime({ root });
    expect(result.selection.runtime).toBe('codex_app_server');
    expect(result.selection.preferred_model).toBe('gpt-5.6-sol');
    expect(result.selection.requested_model).toBe('gpt-5.4');
    expect(result.selection.selected_model).toBe('gpt-5.4');
    expect(result.selection.resolved_model).toBe('gpt-5.4');
    expect(result.selection.in_plan_fallback).toBe(true);
    expect(result.selection.authority).toBe('HERMES_RUNTIME_ONLY');
    expect(result.selection.plan_source).toBe('injected');
  });

  it('does not jump to Sonnet while an eligible Codex plan model remains', () => {
    const root = temp('dial-control');
    recordPair(root, { sol: 'MODEL_LIMITED', sonnet: 'HEALTHY' });
    injectHermesPlanModels({
      root,
      codex: [healthyPlanModel('gpt-5.5-codex')],
      claude: [healthyPlanModel('claude-sonnet-5')],
    });
    expect(reconcileHermesRuntime({ root }).selection.runtime).toBe('codex_app_server');
    expect(reconcileHermesRuntime({ root }).selection.selected_model).toBe('gpt-5.5-codex');
  });

  it('falls back to Sonnet 5 when no Codex plan model is eligible', () => {
    const root = temp('dial-control');
    recordPair(root, { sol: 'ACCOUNT_LIMITED', sonnet: 'HEALTHY' });
    injectHermesPlanModels({
      root,
      codex: [{ id: 'gpt-5.4', state: 'ACCOUNT_LIMITED', requested_model: 'gpt-5.4', resolved_model: 'gpt-5.4' }],
      claude: [healthyPlanModel('claude-sonnet-5'), healthyPlanModel('claude-fable-5-1')],
    });
    const result = reconcileHermesRuntime({ root });
    expect(result.selection.runtime).toBe('claude_code');
    expect(result.selection.preferred_model).toBe('claude-sonnet-5');
    expect(result.selection.selected_model).toBe('claude-sonnet-5');
    expect(result.selection.resolved_model).toBe('claude-sonnet-5');
  });

  it('may select a listed Sonnet-class Claude model when Sonnet 5 is unavailable', () => {
    const root = temp('dial-control');
    recordPair(root, { sol: 'ACCOUNT_LIMITED', sonnet: 'ACCOUNT_LIMITED' });
    injectHermesPlanModels({
      root,
      claude: [
        { id: 'claude-sonnet-5', state: 'ACCOUNT_LIMITED' },
        healthyPlanModel('claude-sonnet-4-6'),
        healthyPlanModel('claude-fable-5-1'),
      ],
    });
    const result = reconcileHermesRuntime({ root });
    expect(result.selection.runtime).toBe('claude_code');
    expect(result.selection.preferred_model).toBe('claude-sonnet-5');
    expect(result.selection.selected_model).toBe('claude-sonnet-4-6');
    expect(result.selection.in_plan_fallback).toBe(true);
  });

  it('returns NO_HERMES_RUNTIME_AVAILABLE when Sonnet is limited and no eligible Claude Hermes model remains', () => {
    const root = temp('dial-control');
    recordPair(root, { sol: 'ACCOUNT_LIMITED', sonnet: 'ACCOUNT_LIMITED' });
    injectHermesPlanModels({
      root,
      codex: [{ id: 'gpt-5.4', state: 'RATE_LIMITED' }],
      claude: [
        { id: 'claude-sonnet-5', state: 'ACCOUNT_LIMITED' },
        healthyPlanModel('claude-fable-5'),
        healthyPlanModel('claude-fable-5-1'),
        healthyPlanModel('claude-opus-5'),
      ],
    });
    const result = reconcileHermesRuntime({ root });
    expect(result.selected).toBe(false);
    expect(result.reason).toBe('NO_HERMES_RUNTIME_AVAILABLE');
  });

  it('does not treat Fable 5 vs Fable 5.1 as a Hermes hard pin', () => {
    expect(classifyClaudeHermesModel('fable 5').hermes_eligible).toBe(false);
    expect(classifyClaudeHermesModel('fable 5.1').hermes_eligible).toBe(false);
    expect(classifyClaudeHermesModel('claude-fable-5').class).toBe('fable');
    expect(classifyClaudeHermesModel('claude-fable-5-1').class).toBe('fable');
    expect(classifyClaudeHermesModel('claude-sonnet-5').preferred).toBe(true);
    const root = temp('dial-control');
    recordPair(root, { sol: 'PROCESS_FAILED', sonnet: 'HEALTHY' });
    injectHermesPlanModels({
      root,
      claude: [healthyPlanModel('claude-fable-5'), healthyPlanModel('claude-fable-5-1'), healthyPlanModel('claude-sonnet-5')],
    });
    const result = reconcileHermesRuntime({ root });
    expect(result.selection.selected_model).toBe('claude-sonnet-5');
    expect(result.selection.preferred_model).toBe('claude-sonnet-5');
  });

  it('selecting an in-plan runtime model does not mutate DIAL gate or ACTIVE_WORK', () => {
    const repo = makeRepo();
    const root = temp('dial-control');
    saveCheckpoint(buildCheckpoint(repo), root);
    const active = path.join(repo, 'agent-system/registries/ACTIVE_WORK.json');
    const before = readFileSync(active, 'utf8');
    recordPair(root, { sol: 'ACCOUNT_LIMITED', sonnet: 'HEALTHY' });
    injectHermesPlanModels({ root, codex: [healthyPlanModel('gpt-5.4')] });
    const result = reconcileHermesRuntime({ root });
    expect(result.selection.selected_model).toBe('gpt-5.4');
    expect(result.selection.authority).toBe('HERMES_RUNTIME_ONLY');
    expect(loadCheckpoint('TEST-F001', root).target_gate).toBe('DOMAIN_TESTED');
    expect(readFileSync(active, 'utf8')).toBe(before);
  });

  it('parses Codex App Server model/list evidence without inventing names', () => {
    const listed = parseCodexModelListEvidence({
      result: {
        data: [
          { id: 'gpt-5.6-sol', model: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol' },
          { id: 'gpt-5.4', model: 'gpt-5.4', displayName: 'GPT-5.4' },
        ],
        nextCursor: null,
      },
    });
    expect(listed.map((model) => model.id)).toEqual(['gpt-5.6-sol', 'gpt-5.4']);
    expect(parseCodexModelListEvidence({})).toEqual([]);
  });

  it('records injected Codex plan lists and does not invent Claude plan models', async () => {
    const root = temp('dial-control');
    const listed = await listCodexPlanModels({
      root,
      listRunner: async () => ({ data: [{ model: 'gpt-5.6-sol' }, { model: 'gpt-5.4' }] }),
    });
    expect(listed.source).toBe('injected');
    expect(listed.models.map((model) => model.id)).toEqual(['gpt-5.6-sol', 'gpt-5.4']);
    const claude = listClaudePlanModels({
      root,
      listRunner: () => [{ id: 'claude-sonnet-5' }, { id: 'claude-fable-5-1' }],
    });
    expect(claude.source).toBe('injected');
    expect(claude.models.find((model) => model.id === 'claude-fable-5-1').hermes_eligible).toBe(false);
    expect(parseClaudeModelListEvidence('not-json and not a model catalog')).toEqual([]);
  });

  it('does not invent a Claude plan list when the official CLI has no list command', () => {
    const root = temp('dial-control');
    const listed = listClaudePlanModels({
      root,
      spawn: () => ({ status: 1, stdout: '', stderr: 'unrecognized subcommand' }),
    });
    expect(listed.source).toBe('claude_cli_has_no_noninteractive_plan_list');
    expect(listed.models).toEqual([]);
  });
});

describe('Hermes operational runtime executor', () => {
  it('classifies primary capacity and process failures without confusing them with model provenance', () => {
    expect(classifyPrimaryFailure({ status: 1, stderr: 'usage limit exceeded for this account' })).toBe('ACCOUNT_LIMITED');
    expect(classifyPrimaryFailure({ status: 1, stderr: '429 too many requests' })).toBe('RATE_LIMITED');
    expect(classifyPrimaryFailure({ status: 1, stderr: 'Codex app-server turn failed: connection closed' })).toBe('PROCESS_FAILED');
    expect(classifyPrimaryFailure({ status: 0, stderr: 'resolved model identity mismatch' })).toBe('TOOLCHAIN_DEGRADED');
  });

  it('automatically continues the same instruction through Sonnet from observable repository state', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    const active = path.join(repo, 'agent-system/registries/ACTIVE_WORK.json');
    const before = readFileSync(active, 'utf8');
    let fallbackCall = null;

    const result = await executeHermesInstruction({
      repoDir: repo,
      root,
      instruction: 'Continue TEST-F001 and verify the current implementation.',
      primaryRunner: async () => ({
        ok: false,
        runtime: 'codex_app_server',
        requested_model: 'gpt-5.6-sol',
        resolved_model: 'gpt-5.6-sol',
        state: 'ACCOUNT_LIMITED',
      }),
      ensureFallback: async () => ({ eligible: true }),
      contextBuilder: async () => ({ context: 'CANONICAL FEATURE CONTEXT TEST-F001 GATE DOMAIN_TESTED' }),
      fallbackRunner: async (input) => {
        fallbackCall = input;
        return {
          event: { resolved_model: 'claude-sonnet-5' },
          output: { result: 'continued safely' },
        };
      },
    });

    expect(result.runtime).toBe('claude_code');
    expect(result.fallback_used).toBe(true);
    expect(result.primary_failure_state).toBe('ACCOUNT_LIMITED');
    expect(result.response).toBe('continued safely');
    expect(fallbackCall.mode).toBe('operational');
    expect(fallbackCall.instruction).toContain('ORIGINAL INSTRUCTION');
    expect(fallbackCall.instruction).toContain('Continue TEST-F001 and verify the current implementation.');
    expect(fallbackCall.instruction).toContain('Do not blindly replay the failed attempt');
    expect(fallbackCall.context).toContain('CANONICAL FEATURE CONTEXT TEST-F001 GATE DOMAIN_TESTED');
    expect(loadCheckpoint('TEST-F001', root).target_gate).toBe('DOMAIN_TESTED');
    expect(readFileSync(active, 'utf8')).toBe(before);
  });

  it('continues on the next Codex plan model before leaving the Codex App Server runtime', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    const active = path.join(repo, 'agent-system/registries/ACTIVE_WORK.json');
    const before = readFileSync(active, 'utf8');
    injectHermesPlanModels({ root, codex: [{ id: 'gpt-5.4' }] });
    const requested = [];
    let fallbackCalled = false;

    const result = await executeHermesInstruction({
      repoDir: repo,
      root,
      instruction: 'Continue TEST-F001 after Sol limit.',
      planModels: injectHermesPlanModels({ root, codex: [{ id: 'gpt-5.4' }] }),
      primaryRunner: async ({ model }) => {
        requested.push(model);
        if (model === 'gpt-5.6-sol') {
          return { ok: false, runtime: 'codex_app_server', requested_model: model, resolved_model: model, state: 'ACCOUNT_LIMITED' };
        }
        return {
          ok: true,
          runtime: 'codex_app_server',
          requested_model: model,
          resolved_model: model,
          state: 'HEALTHY',
          response: 'continued on next Codex plan model',
        };
      },
      ensureFallback: async () => {
        fallbackCalled = true;
        return { eligible: true };
      },
    });

    expect(requested).toEqual(['gpt-5.6-sol', 'gpt-5.4']);
    expect(fallbackCalled).toBe(false);
    expect(result.runtime).toBe('codex_app_server');
    expect(result.preferred_model).toBe('gpt-5.6-sol');
    expect(result.selected_model).toBe('gpt-5.4');
    expect(result.in_plan_fallback).toBe(true);
    expect(result.fallback_used).toBe(false);
    expect(result.authority).toBe('HERMES_RUNTIME_ONLY');
    expect(readFileSync(active, 'utf8')).toBe(before);
  });

  it('fails closed when the fallback runtime is not eligible', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    const result = await executeHermesInstruction({
      repoDir: repo,
      root,
      instruction: 'Continue TEST-F001.',
      primaryRunner: async () => ({ ok: false, state: 'PROCESS_FAILED', resolved_model: 'gpt-5.6-sol' }),
      ensureFallback: async () => ({ eligible: false, reason: 'CLAUDE_FALLBACK_NOT_HEALTHY' }),
    });
    expect(result.event).toBe('HERMES_OPERATIONAL_TURN_FAILED');
    expect(result.reason).toBe('NO_HERMES_RUNTIME_AVAILABLE');
    expect(result.fallback_used).toBe(false);
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
    const canonicalSection = packet.context.indexOf('\nBounded DIAL Feature context:\n');
    const memorySection = packet.context.indexOf('\nFeature-scoped Oracle memory (non-authoritative):\n');
    expect(canonicalSection).toBeGreaterThanOrEqual(0);
    expect(memorySection).toBeGreaterThanOrEqual(0);
    expect(canonicalSection).toBeLessThan(memorySection);
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
