import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCheckpoint, captureGitState } from '../agent-system/orchestration/checkpoint-store.mjs';
import { appendFeatureMemory } from '../agent-system/orchestration/feature-memory.mjs';
import { buildHandoffCapsule } from '../agent-system/orchestration/handoff-builder.mjs';
import { electDevelopmentManager } from '../agent-system/orchestration/manager-router.mjs';
import { healthFresh, runtimeEligible, recordRuntimeHealth } from '../agent-system/orchestration/runtime-health.mjs';
import { reconcileHermesRuntime } from '../agent-system/orchestration/hermes-runtime-router.mjs';
import {
  chatSelectableModels,
  loadModelRegistry,
  registerConnection,
  registerDiscoveredModels,
  registerRuntime,
} from '../agent-system/orchestration/model-registry.mjs';
import {
  buildWorkerPacket,
  classifyDevelopmentTask,
  evaluateDevelopmentAuthority,
  routeAutoDevelopmentTask,
  selectDevelopmentManager,
  validateIndependentReview,
} from '../agent-system/orchestration/development-policy.mjs';
import { executeWorkerPacket, registerDeepSeekHarness } from '../agent-system/orchestration/execution-harnesses.mjs';
import { routeHermesInstruction } from '../agent-system/orchestration/instruction-router.mjs';
import { configureManagerChairModels, getModelsSettings } from '../agent-system/orchestration/settings-models.mjs';
import { ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from '../agent-system/orchestration/state-store.mjs';
import { resolveFeatureId } from '../agent-system/orchestration/context-broker.mjs';

function temp(name) {
  return mkdtempSync(path.join(tmpdir(), `${name}-`));
}

function makeRepo() {
  const repo = temp('dial-orchestration-repo');
  mkdirSync(path.join(repo, 'agent-system/registries'), { recursive: true });
  mkdirSync(path.join(repo, 'agent-system/bin'), { recursive: true });
  writeFileSync(path.join(repo, 'agent-system/registries/FEATURE_REGISTRY.json'), JSON.stringify([{ feature_id: 'GROC-F025' }]));
  writeFileSync(path.join(repo, 'agent-system/registries/ACTIVE_WORK.json'), JSON.stringify({ feature_id: 'GROC-F025', worktree: null, target_gate: 'DOMAIN_TESTED' }));
  writeFileSync(path.join(repo, 'package.json'), '{}');
  execFileSync('git', ['init'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'ci@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'CI'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repo });
  return repo;
}

function registerModel(root, {
  model_id,
  display_name = model_id,
  provider = 'Test',
  runtime_id = `runtime-${model_id}`,
  connection_id = `connection-${model_id}`,
  availability = 'AVAILABLE',
  health = 'HEALTHY',
  connection_type = 'CUSTOM_API',
} = {}) {
  registerConnection({ connection_id, type: connection_type, name: connection_id, discovery_supported: true }, root);
  registerRuntime({ runtime_id, display_name: runtime_id, harness: runtime_id, connection_id, capabilities: ['CHAT', 'WORKER_PACKETS'] }, root);
  registerDiscoveredModels({
    runtime_id,
    connection_id,
    provider,
    models: [{ model_id, display_name, availability, health, capabilities: ['CHAT', 'WORKER_PACKETS'] }],
  }, root);
  return loadModelRegistry(root).models[model_id];
}

function setHermesRuntimeHealth(root, { sol = 'HEALTHY', sonnet = 'HEALTHY' } = {}) {
  recordRuntimeHealth('codex_app_server', {
    state: sol,
    requested_model: 'gpt-5.6-sol',
    resolved_model: 'gpt-5.6-sol',
  }, root);
  recordRuntimeHealth('claude_code', {
    state: sonnet,
    requested_model: 'claude-sonnet-5',
    resolved_model: 'claude-sonnet-5',
  }, root);
}

describe('orchestration state store', () => {
  it('creates the persistent memory layout and writes private JSON atomically', () => {
    const root = temp('dial-control');
    ensureControlLayout(root);
    const target = writeJsonAtomic('state/test.json', { ok: true }, root);
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual({ ok: true });
    expect(readJson('state/test.json', null, root)).toEqual({ ok: true });
  });

  it('refuses path traversal outside the control root', () => {
    const root = temp('dial-control');
    expect(() => resolveControlPath('../escape.json', root)).toThrow(/escapes control root/);
  });
});

describe('runtime evidence', () => {
  it('requires HEALTHY state, fresh evidence and requested/resolved identity for a hard-pinned runtime', () => {
    const observedAt = new Date().toISOString();
    expect(runtimeEligible({ state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at: observedAt })).toBe(true);
    expect(runtimeEligible({ state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-luna', observed_at: observedAt })).toBe(false);
    expect(runtimeEligible({ state: 'MODEL_LIMITED', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at: observedAt })).toBe(false);
    expect(runtimeEligible({ state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol' })).toBe(false);
  });

  it('rejects stale HEALTHY evidence', () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const health = { state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at: stale };
    expect(healthFresh(health)).toBe(false);
    expect(runtimeEligible(health)).toBe(false);
  });

  it('updates registered model availability without deleting the model', () => {
    const root = temp('dial-control');
    registerModel(root, { model_id: 'gpt-5.6-sol', runtime_id: 'codex_app_server' });
    recordRuntimeHealth('codex_app_server', {
      state: 'ACCOUNT_LIMITED',
      requested_model: 'gpt-5.6-sol',
      resolved_model: 'gpt-5.6-sol',
    }, root);
    const model = loadModelRegistry(root).models['gpt-5.6-sol'];
    expect(model.availability).toBe('LIMIT_REACHED');
    expect(chatSelectableModels(root).some((entry) => entry.model_id === 'gpt-5.6-sol')).toBe(true);
  });
});

describe('Hermes availability-first runtime policy', () => {
  it('uses Sol when Sol is healthy', () => {
    const root = temp('dial-control');
    setHermesRuntimeHealth(root);
    const result = reconcileHermesRuntime({ root });
    expect(result.selected).toBe(true);
    expect(result.selection.runtime).toBe('codex_app_server');
    expect(result.selection.requested_model).toBe('gpt-5.6-sol');
    expect(result.selection.authority).toBe('HERMES_RUNTIME_ONLY');
  });

  it('falls back to Sonnet when Sol is unavailable without granting development authority', () => {
    const root = temp('dial-control');
    setHermesRuntimeHealth(root, { sol: 'ACCOUNT_LIMITED', sonnet: 'HEALTHY' });
    const result = reconcileHermesRuntime({ root });
    expect(result.selection.runtime).toBe('claude_code');
    expect(result.selection.requested_model).toBe('claude-sonnet-5');
    expect(result.selection.authority).toBe('HERMES_RUNTIME_ONLY');
    expect(readJson('state/development-manager.json', null, root)).toBeNull();
  });
});

describe('quality-first Development Manager Chair', () => {
  it('selects dynamically discovered Fable for complex development while Hermes is on Sonnet', () => {
    const root = temp('dial-control');
    setHermesRuntimeHealth(root, { sol: 'ACCOUNT_LIMITED', sonnet: 'HEALTHY' });
    reconcileHermesRuntime({ root });
    registerModel(root, { model_id: 'fable-5.2', display_name: 'Fable 5.2' });
    registerModel(root, { model_id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' });

    const routed = routeHermesInstruction({ instruction: 'redesign orchestration architecture', task: { kind: 'architecture' }, root });
    expect(readJson('state/hermes-runtime.json', null, root).requested_model).toBe('claude-sonnet-5');
    expect(routed.route).toBe('FORWARD_TO_MANAGER_CHAIR');
    expect(routed.development_manager.model_id).toBe('fable-5.2');
    expect(readJson('state/development-manager.json', null, root).model_id).toBe('fable-5.2');
  });

  it('selects Opus when Fable and Sol are unavailable', () => {
    const root = temp('dial-control');
    registerModel(root, { model_id: 'fable-5.2', display_name: 'Fable 5.2', availability: 'UNAVAILABLE', health: 'MODEL_LIMITED' });
    registerModel(root, { model_id: 'claude-opus-5.1', display_name: 'Claude Opus 5.1' });
    registerModel(root, { model_id: 'gpt-5.6-sol', display_name: 'GPT-5.6 Sol', availability: 'UNAVAILABLE', health: 'ACCOUNT_LIMITED' });
    expect(selectDevelopmentManager({ root }).model.model_id).toBe('claude-opus-5.1');
    expect(electDevelopmentManager({ root, task: { kind: 'security_architecture' } }).assignment.model_id).toBe('claude-opus-5.1');
  });

  it('pauses complex work when only Sonnet, Terra and DeepSeek are healthy', () => {
    const root = temp('dial-control');
    registerModel(root, { model_id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' });
    registerModel(root, { model_id: 'gpt-5.6-terra', display_name: 'GPT-5.6 Terra' });
    registerModel(root, { model_id: 'deepseek-coder-worker', display_name: 'DeepSeek Coder Worker' });
    const election = electDevelopmentManager({ root, task: { kind: 'architecture' } });
    expect(election.elected).toBe(false);
    expect(election.reason).toBe('NO_QUALIFIED_MANAGER');
    expect(readJson('state/development-manager.json', null, root).state).toBe('COMPLEX_WORK_PAUSED');
  });

  it('does not silently grant a directly selected lesser model complex authority', () => {
    const root = temp('dial-control');
    registerModel(root, { model_id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' });
    registerModel(root, { model_id: 'fable-5.2', display_name: 'Fable 5.2' });
    const decision = evaluateDevelopmentAuthority({ selected_model_id: 'claude-sonnet-5', task: { kind: 'architecture' }, root });
    expect(decision.allowed).toBe(false);
    expect(decision.available_manager.model_id).toBe('fable-5.2');
  });

  it('allows explicit user configuration to place a registered model in the Manager Chair', () => {
    const root = temp('dial-control');
    registerModel(root, { model_id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' });
    configureManagerChairModels(['claude-sonnet-5'], root);
    const decision = evaluateDevelopmentAuthority({ selected_model_id: 'claude-sonnet-5', task: { kind: 'architecture' }, root });
    expect(decision.allowed).toBe(true);
    expect(decision.authority).toBe('MANAGER_CHAIR');
  });

  it('never lets an explicit override make an unavailable or unregistered model executable', () => {
    const root = temp('dial-control');
    registerModel(root, { model_id: 'custom-offline', availability: 'UNAVAILABLE', health: 'PROCESS_FAILED' });
    expect(evaluateDevelopmentAuthority({ selected_model_id: 'custom-offline', task: { kind: 'architecture' }, root, user_override: true }).allowed).toBe(false);
    expect(evaluateDevelopmentAuthority({ selected_model_id: 'missing-model', task: { kind: 'architecture' }, root, user_override: true }).allowed).toBe(false);
  });

  it('classifies unknown or ambiguous work as complex rather than lowering the quality floor', () => {
    expect(classifyDevelopmentTask({ kind: 'architecture' })).toBe('COMPLEX');
    expect(classifyDevelopmentTask({ kind: 'formatting' })).toBe('BOUNDED');
    expect(classifyDevelopmentTask({ kind: 'new-unknown-task' })).toBe('COMPLEX');
  });
});

describe('Auto routing and independent review', () => {
  it('Auto routes complex work only to an available Manager Chair', () => {
    const root = temp('dial-control');
    registerModel(root, { model_id: 'fable-5.2', display_name: 'Fable 5.2' });
    registerModel(root, { model_id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' });
    const route = routeAutoDevelopmentTask({ task: { kind: 'architecture' }, root });
    expect(route.route).toBe('MANAGER_CHAIR');
    expect(route.model_id).toBe('fable-5.2');
    expect(route.review_required).toBe(true);
  });

  it('Auto pauses complex work instead of selecting healthy lesser models', () => {
    const root = temp('dial-control');
    registerModel(root, { model_id: 'claude-sonnet-5' });
    registerModel(root, { model_id: 'gpt-5.6-terra' });
    registerModel(root, { model_id: 'deepseek-coder-v3' });
    const route = routeAutoDevelopmentTask({ task: { kind: 'architecture' }, root });
    expect(route.route).toBe('COMPLEX_WORK_PAUSED');
    expect(route.reason).toBe('NO_QUALIFIED_MANAGER');
  });

  it('Auto prefers a lesser-task model for bounded work before spending Manager Chair capacity', () => {
    const root = temp('dial-control');
    registerModel(root, { model_id: 'fable-5.2', display_name: 'Fable 5.2' });
    registerModel(root, { model_id: 'deepseek-coder-v3', display_name: 'DeepSeek Coder v3' });
    const route = routeAutoDevelopmentTask({ task: { kind: 'test_expansion' }, root });
    expect(route.route).toBe('LESSER_TASK_POOL');
    expect(route.model_id).toBe('deepseek-coder-v3');
    expect(route.manager_capacity_used).toBe(false);
  });

  it('blocks same-model self-certification for high-consequence work and accepts another quality model', () => {
    const root = temp('dial-control');
    registerModel(root, { model_id: 'fable-5.2', display_name: 'Fable 5.2' });
    registerModel(root, { model_id: 'claude-opus-5.1', display_name: 'Claude Opus 5.1' });
    const same = validateIndependentReview({ task: { kind: 'security_architecture' }, manager_model_id: 'fable-5.2', reviewer_model_id: 'fable-5.2', root });
    expect(same.valid).toBe(false);
    const cross = validateIndependentReview({ task: { kind: 'security_architecture' }, manager_model_id: 'fable-5.2', reviewer_model_id: 'claude-opus-5.1', root });
    expect(cross.valid).toBe(true);
  });
});

describe('universal model registry, Settings contract and harness separation', () => {
  it('keeps every registered model visible in chat even when unavailable', () => {
    const root = temp('dial-control');
    registerModel(root, { model_id: 'gpt-5.6-sol', display_name: 'GPT-5.6 Sol' });
    registerModel(root, { model_id: 'custom-offline-model', display_name: 'Custom Offline', availability: 'UNAVAILABLE', health: 'PROCESS_FAILED' });
    const visible = chatSelectableModels(root);
    expect(visible.map((model) => model.model_id)).toEqual(expect.arrayContaining(['gpt-5.6-sol', 'custom-offline-model']));
    expect(visible.every((model) => model.chat_visible === true)).toBe(true);
  });

  it('supports a model through an explicit runtime binding instead of conflating model and harness', () => {
    const root = temp('dial-control');
    const model = registerModel(root, { model_id: 'gpt-5.6-sol', runtime_id: 'codex_app_server' });
    expect(model.model_id).toBe('gpt-5.6-sol');
    expect(model.bindings[0].runtime_id).toBe('codex_app_server');
  });

  it('projects the full Settings → Models contract without hiding models', () => {
    const root = temp('dial-control');
    registerModel(root, { model_id: 'fable-5.2', display_name: 'Fable 5.2' });
    registerModel(root, { model_id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' });
    const settings = getModelsSettings(root);
    expect(settings.surface_contract).toBe('SETTINGS_MODELS');
    expect(settings).toHaveProperty('connections');
    expect(settings).toHaveProperty('available_models');
    expect(settings).toHaveProperty('manager_chair');
    expect(settings).toHaveProperty('lesser_task_pool');
    expect(settings).toHaveProperty('harness_assignments');
    expect(settings).toHaveProperty('routing_policy');
    expect(settings).toHaveProperty('health_and_capacity');
    expect(settings.available_models.every((model) => model.chat_visible === true)).toBe(true);
    expect(settings.manager_chair.models.find((model) => model.model_id === 'claude-sonnet-5').selected).toBe(false);
  });

  it('refuses credential material in connection registry state', () => {
    const root = temp('dial-control');
    expect(() => registerConnection({ connection_id: 'bad', type: 'OPENAI_API', api_key: 'do-not-store' }, root)).toThrow(/may not persist credential material/);
  });
});

describe('DeepSeek Harness worker execution', () => {
  it('registers DeepSeek as first-class, discovers models, keeps them chat-selectable and executes bounded packets under active Manager Chair provenance', async () => {
    const root = temp('dial-control');
    registerModel(root, { model_id: 'fable-5.2', display_name: 'Fable 5.2' });
    registerDeepSeekHarness({ models: ['deepseek-coder-v3'], auth_state: 'AUTHENTICATED_OR_NOT_REQUIRED', local: true }, root);
    const manager = electDevelopmentManager({ root, task: { kind: 'task_decomposition' } }).assignment;
    const packet = buildWorkerPacket({
      objective: 'expand accepted contract tests',
      scope: 'tests only',
      allowed_paths: ['tests/'],
      acceptance_criteria: ['tests pass'],
      expected_evidence: ['test output'],
      manager_provenance: { model_id: manager.model_id, assignment_id: manager.assignment_id },
      task_kind: 'test_expansion',
    });
    const result = await executeWorkerPacket({
      model_id: 'deepseek-coder-v3',
      packet,
      root,
      executor: async ({ model, binding }) => ({ ok: true, model_id: model.model_id, runtime_id: binding.runtime_id }),
    });
    expect(result.result.ok).toBe(true);
    expect(result.result.runtime_id).toBe('deepseek_harness');
    expect(chatSelectableModels(root).some((model) => model.model_id === 'deepseek-coder-v3')).toBe(true);
  });

  it('rejects fabricated or stale Manager Chair provenance', async () => {
    const root = temp('dial-control');
    registerModel(root, { model_id: 'fable-5.2', display_name: 'Fable 5.2' });
    registerDeepSeekHarness({ models: ['deepseek-coder-v3'] }, root);
    electDevelopmentManager({ root, task: { kind: 'task_decomposition' } });
    const packet = buildWorkerPacket({
      objective: 'mechanical change',
      scope: 'one file',
      allowed_paths: ['tests/'],
      acceptance_criteria: ['passes'],
      expected_evidence: ['diff'],
      manager_provenance: { model_id: 'fable-5.2', assignment_id: 'forged-assignment' },
      task_kind: 'mechanical_implementation',
    });
    await expect(executeWorkerPacket({ model_id: 'deepseek-coder-v3', packet, root, executor: async () => ({ ok: true }) })).rejects.toThrow(/does not match the active development assignment/);
  });

  it('blocks complex architecture authority inside a worker packet', () => {
    expect(() => buildWorkerPacket({
      objective: 'redesign architecture',
      scope: 'system',
      allowed_paths: ['agent-system/'],
      acceptance_criteria: ['architecture accepted'],
      expected_evidence: ['design review'],
      manager_provenance: { model_id: 'fable-5.2', assignment_id: 'manager-1' },
      task_kind: 'architecture',
    })).toThrow(/must be bounded/);
  });
});

describe('Hermes/development separation invariant', () => {
  it('changing Hermes runtime identity does not silently change Development Manager Chair identity', () => {
    const root = temp('dial-control');
    registerModel(root, { model_id: 'fable-5.2', display_name: 'Fable 5.2' });
    electDevelopmentManager({ root, task: { kind: 'architecture' } });
    setHermesRuntimeHealth(root, { sol: 'HEALTHY', sonnet: 'HEALTHY' });
    reconcileHermesRuntime({ root });
    expect(readJson('state/development-manager.json', null, root).model_id).toBe('fable-5.2');
    recordRuntimeHealth('codex_app_server', { state: 'ACCOUNT_LIMITED', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol' }, root);
    reconcileHermesRuntime({ root });
    expect(readJson('state/hermes-runtime.json', null, root).requested_model).toBe('claude-sonnet-5');
    expect(readJson('state/development-manager.json', null, root).model_id).toBe('fable-5.2');
  });
});

describe('checkpoint and handoff continuity', () => {
  it('captures real Git state and refuses an unknown Feature ID', () => {
    const repo = makeRepo();
    const checkpoint = buildCheckpoint(repo);
    expect(checkpoint.feature_id).toBe('GROC-F025');
    expect(checkpoint.repository.dirty).toBe(false);
    expect(checkpoint.repository.commit).toMatch(/^[0-9a-f]{40}$/);
    writeFileSync(path.join(repo, 'dirty.txt'), 'x');
    expect(captureGitState(repo).dirty).toBe(true);
    expect(() => buildCheckpoint(repo, { feature_id: 'GROC-F999' })).toThrow(/unknown Feature ID/);
  });

  it('builds a bounded, explicitly non-authoritative handoff capsule with development-manager semantics', () => {
    const repo = makeRepo();
    const checkpoint = buildCheckpoint(repo, {
      atomic_unit: 'projection-tests',
      development_manager: { role: 'DEVELOPMENT_MANAGER_CHAIR', model_id: 'fable-5.2' },
    });
    const capsule = buildHandoffCapsule(checkpoint, {
      objective: 'Finish Round voting projection',
      completed: ['contract', 'state-machine'],
      next_action: 'Run integration tests',
    });
    expect(capsule.feature_id).toBe('GROC-F025');
    expect(capsule.active_unit).toBe('projection-tests');
    expect(capsule.previous_development_manager.model_id).toBe('fable-5.2');
    expect(capsule.authority_warning).toMatch(/Hermes runtime identity is not development authority/);
  });

  it('rejects secret material before it can enter Feature memory or a handoff capsule', () => {
    const root = temp('dial-control');
    expect(() => appendFeatureMemory('GROC-F025', {
      text: 'safe note',
      refs: ['access_token=super-secret-token-value'],
    }, root)).toThrow(/possible secret material/);

    const repo = makeRepo();
    const checkpoint = buildCheckpoint(repo);
    expect(() => buildHandoffCapsule(checkpoint, {
      objective: '-----BEGIN PRIVATE KEY----- do not persist',
    })).toThrow(/possible secret material/);
  });
});

describe('feature resolution', () => {
  it('prefers an explicit Feature ID in the incoming turn', () => {
    const repo = makeRepo();
    expect(resolveFeatureId({ userMessage: 'continue GROC-F025 please', repoDir: repo })).toBe('GROC-F025');
  });
});
