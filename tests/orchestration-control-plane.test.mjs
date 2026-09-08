import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCheckpoint, captureGitState, loadCheckpoint, saveCheckpoint } from '../agent-system/orchestration/checkpoint-store.mjs';
import { appendFeatureMemory, readFeatureMemory } from '../agent-system/orchestration/feature-memory.mjs';
import { buildHandoffCapsule, saveHandoffCapsule } from '../agent-system/orchestration/handoff-builder.mjs';
import { healthFresh, runtimeEligible, recordRuntimeHealth, loadRuntimeHealth } from '../agent-system/orchestration/runtime-health.mjs';
import { classifyRuntimeBoundaryText, parseProviderRetryAfter, primaryAttemptDecision } from '../agent-system/orchestration/runtime-capacity-policy.mjs';
import { cachedCodexIdentity, recordCodexIdentityProof, DEFAULT_IDENTITY_CACHE_MAX_AGE_MS } from '../agent-system/orchestration/runtime-identity-cache.mjs';
import { doctor, invalidateRuntimeEvidenceAfterSupervisorRestart, runtimeProbeAnchorMs } from '../agent-system/orchestration/supervisor.mjs';
import { reconcileHermesRuntime } from '../agent-system/orchestration/hermes-runtime-router.mjs';
import {
  HERMES_NATIVE_DOCTOR_EVIDENCE,
  persistNativeHermesDoctorEvidence,
  runNativeHermesDoctor,
  summarizeHermesDoctorOutput,
} from '../agent-system/orchestration/hermes-native-doctor.mjs';
import { classifyPrimaryFailure, executeHermesInstruction, resolvePrimaryTurnIdentity } from '../agent-system/orchestration/hermes-runtime-executor.mjs';
import {
  injectHermesPlanModels,
  parseClaudeModelListEvidence,
  parseCodexModelListEvidence,
} from '../agent-system/orchestration/hermes-plan-models.mjs';
import { listClaudePlanModels } from '../agent-system/orchestration/claude-code-probe.mjs';
import { listCodexPlanModels } from '../agent-system/orchestration/codex-app-server-probe.mjs';
import { ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from '../agent-system/orchestration/state-store.mjs';
import { buildDialHermesContext, resolveFeatureId } from '../agent-system/orchestration/context-broker.mjs';
import { controlPlaneFingerprint, evaluateDevelopmentUnblock } from '../agent-system/orchestration/development-unblock.mjs';
import {
  QUALIFICATION_CANARY_INSTRUCTION,
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
  sol = 'HEALTHY', sonnet = 'HEALTHY',
  solRequested = 'gpt-5.6-sol', solResolved = 'gpt-5.6-sol',
  sonnetRequested = 'claude-sonnet-5', sonnetResolved = 'claude-sonnet-5',
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
    id, state: 'HEALTHY', requested_model: id, resolved_model: id,
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



describe('federated DIAL doctor', () => {
  it('runs native Hermes Doctor only as a non-mutating subordinate diagnostic', () => {
    let observed = null;
    const native = runNativeHermesDoctor({
      runner: (command, args, options) => {
        observed = { command, args, options };
        return {
          status: 0,
          signal: null,
          error: null,
          stderr: '',
          stdout: [
            '◆ Security Advisories',
            '  ✓ No active security advisories',
            '◆ Required Packages',
            '  ✓ OpenAI SDK',
            '  ✓ Version files consistent (0.21.0)',
            '  ⚠ optional package not installed',
            'Found 2 issue(s) to address:',
            '  1. Migrate config',
            '  2. Review a build-tool advisory',
          ].join('\n'),
        };
      },
    });

    expect(observed.command).toBe('hermes');
    expect(observed.args).toEqual(['doctor']);
    expect(observed.args).not.toContain('--fix');
    expect(observed.args).not.toContain('--live');
    expect(observed.options.stdio).toEqual(['ignore', 'pipe', 'pipe']);
    expect(native.kind).toBe('DIAL_SUBORDINATE_HERMES_DOCTOR');
    expect(native.authority).toBe('DIAGNOSTIC_EVIDENCE_ONLY');
    expect(native.status).toBe('DEGRADED');
    expect(native.usable_for_dial_qualification).toBe(true);
    expect(native.issue_count).toBe(2);
    expect(native.issues).toEqual(['Migrate config', 'Review a build-tool advisory']);
    expect(native.security_advisory_state).toBe('CLEAR');
    expect(native.hermes_version).toBe('0.21.0');
    expect(native.raw_report_persisted).toBe(false);
  });

  it('fails closed when the subordinate Hermes Doctor times out', () => {
    const error = Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    const native = runNativeHermesDoctor({
      runner: () => ({ status: null, signal: 'SIGTERM', error, stdout: '', stderr: '' }),
    });
    expect(native.status).toBe('TIMEOUT');
    expect(native.timed_out).toBe(true);
    expect(native.usable_for_dial_qualification).toBe(false);
  });

  it('persists only structured summary/hash evidence and lets DIAL retain authority', () => {
    const root = temp('dial-doctor');
    const native = summarizeHermesDoctorOutput(
      '◆ Security Advisories\n  ✓ No active security advisories\nNo issues found',
      { exitCode: 0, durationMs: 12 },
    );
    const persisted = persistNativeHermesDoctorEvidence(native, { root });
    const stored = readJson(HERMES_NATIVE_DOCTOR_EVIDENCE, null, root);
    expect(stored.report_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.raw_report_persisted).toBe(false);
    expect(stored.evidence_relative_path).toBe(HERMES_NATIVE_DOCTOR_EVIDENCE);
    expect(JSON.stringify(stored)).not.toContain('No active security advisories');

    const report = doctor({
      repoDir: process.cwd(),
      root,
      nativeHermesDoctor: persisted,
      versionResolver: (command) => ({
        codex: 'codex-cli 0.144.0',
        hermes: 'Hermes Agent v0.21.0',
        git: 'git version 2.45.0',
        claude: 'Claude Code 1.0.0',
      })[command] ?? null,
    });
    expect(report.diagnostic_scope).toBe('DIAL_PLUS_SUBORDINATE_HERMES');
    expect(report.native_hermes_doctor.authority).toBe('DIAGNOSTIC_EVIDENCE_ONLY');
    expect(report.checks.hermes_native_doctor_non_mutating).toBe(true);
  });
});

describe('primary Hermes turn identity provenance', () => {
  it('accepts missing Hermes usage model/provider with a matching cached exact identity proof', () => {
    const cachedIdentity = {
      identity_proven: true, requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol',
    };
    const exact = resolvePrimaryTurnIdentity({ usage: { model: null, provider: null }, cachedIdentity });
    expect(exact.identityProven).toBe(true);
    expect(exact.resolvedModel).toBe('gpt-5.6-sol');
    expect(exact.identitySource).toBe('EXPLICIT_HERMES_HARD_PIN_PLUS_CACHED_CODEX_PROVENANCE');
  });

  it('accepts missing Hermes usage model/provider only with fresh exact preflight identity', () => {
    const preflight = {
      state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol',
      observed_at: new Date().toISOString(),
      details: { toolchain_usable: true, identity_proven: true, rerouted: false },
    };
    const exact = resolvePrimaryTurnIdentity({ usage: { model: null, provider: null }, preTurnHealth: preflight });
    expect(exact.identityProven).toBe(true);
    expect(exact.resolvedModel).toBe('gpt-5.6-sol');
    expect(exact.provider).toBe('openai-codex');
    expect(exact.identitySource).toBe('EXPLICIT_HERMES_HARD_PIN_PLUS_FRESH_CODEX_PROVENANCE');

    const wrong = resolvePrimaryTurnIdentity({ usage: { model: null, provider: null }, preTurnHealth: { ...preflight, resolved_model: 'gpt-5.6-mini' } });
    expect(wrong.identityProven).toBe(false);
    expect(wrong.resolvedModel).toBeNull();
  });
});

describe('runtime capacity preservation policy', () => {
  it('parses provider reset hints and suppresses repeated calls until the retry boundary', () => {
    const nowMs = Date.parse('2026-09-08T08:00:00Z');
    expect(parseProviderRetryAfter('try again at 9:16 AM', { nowMs })).toBe('2026-09-08T09:16:00.000Z');
    expect(parseProviderRetryAfter('try again in 45 minutes', { nowMs })).toBe('2026-09-08T08:45:00.000Z');
    expect(parseProviderRetryAfter('try again in 2 days', { nowMs })).toBe('2026-09-10T08:00:00.000Z');
    expect(classifyRuntimeBoundaryText('usageLimitExceeded: weekly quota')).toBe('ACCOUNT_LIMITED');
    expect(classifyRuntimeBoundaryText('HTTP 429 too many requests')).toBe('RATE_LIMITED');
    const health = { state: 'ACCOUNT_LIMITED', observed_at: '2026-09-08T08:00:00Z', retry_after: '2026-09-08T09:16:00Z' };
    expect(primaryAttemptDecision(health, { nowMs }).allowed).toBe(false);
    expect(primaryAttemptDecision(health, { nowMs: Date.parse('2026-09-08T09:17:00Z') }).allowed).toBe(true);
  });

  it('preserves runtime evidence across supervisor restart instead of forcing a new inference probe', () => {
    const root = temp('dial-runtime-restart');
    recordRuntimeHealth('codex_app_server', {
      state: 'ACCOUNT_LIMITED', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol',
      retry_after: new Date(Date.now() + 60_000).toISOString(), details: { identity_proven: true, toolchain_usable: false },
    }, root);
    invalidateRuntimeEvidenceAfterSupervisorRestart(root);
    const preserved = loadRuntimeHealth(root).runtimes.codex_app_server;
    expect(preserved.state).toBe('ACCOUNT_LIMITED');
    expect(preserved.requested_model).toBe('gpt-5.6-sol');
  });

  it('anchors post-restart probing to persisted evidence instead of probing immediately', () => {
    const older = Date.parse('2026-09-08T08:00:00Z');
    const newer = Date.parse('2026-09-08T08:30:00Z');
    expect(runtimeProbeAnchorMs({ runtimes: {
      codex_app_server: { observed_at: new Date(older).toISOString() },
      claude_code: { observed_at: new Date(newer).toISOString() },
    } })).toBe(older);
    expect(runtimeProbeAnchorMs({ runtimes: {} })).toBe(0);
  });

  it('keeps exact identity proof only while its fingerprint and bounded age remain valid', () => {
    const root = temp('dial-identity-cache');
    const observed = new Date().toISOString();
    recordCodexIdentityProof({ repoDir: process.cwd(), root, source: 'TEST_IDENTITY_PROOF', observedAt: observed });
    const current = cachedCodexIdentity({ repoDir: process.cwd(), root, nowMs: Date.parse(observed) + 1_000 });
    expect(current?.identity_proven).toBe(true);
    expect(current?.resolved_model).toBe('gpt-5.6-sol');
    const expired = cachedCodexIdentity({ repoDir: process.cwd(), root, nowMs: Date.parse(observed) + DEFAULT_IDENTITY_CACHE_MAX_AGE_MS + 1 });
    expect(expired).toBeNull();
  });

  it('fails closed on authentication failure without scheduling a model retry', () => {
    const decision = primaryAttemptDecision({ state: 'AUTH_FAILED', observed_at: new Date().toISOString() });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('AUTH_FAILED_REQUIRES_EXTERNAL_CHANGE');
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
    expect(healthFresh(stale)).toBe(false);
    expect(runtimeEligible(stale)).toBe(false);
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

  it('rejects non-Sol Codex and alternate Sonnet-class slots', () => {
    const alternateCodex = temp('dial-control');
    recordPair(alternateCodex, { solRequested: 'gpt-5.4', solResolved: 'gpt-5.4' });
    expect(reconcileHermesRuntime({ root: alternateCodex }).selection.runtime).toBe('claude_code');

    const alternateClaude = temp('dial-control');
    recordPair(alternateClaude, {
      sol: 'ACCOUNT_LIMITED',
      sonnetRequested: 'claude-sonnet-4-6',
      sonnetResolved: 'claude-sonnet-4-6',
    });
    expect(reconcileHermesRuntime({ root: alternateClaude }).reason).toBe('NO_HERMES_RUNTIME_AVAILABLE');
  });

  it('returns NO_HERMES_RUNTIME_AVAILABLE for total loss', () => {
    const root = temp('dial-control'); recordPair(root, { sol: 'PROCESS_FAILED', sonnet: 'ACCOUNT_LIMITED' });
    const result = reconcileHermesRuntime({ root });
    expect(result.selected).toBe(false);
    expect(result.reason).toBe('NO_HERMES_RUNTIME_AVAILABLE');
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
        ok: true, runtime: 'codex_app_server', requested_model: model, resolved_model: model,
        state: 'HEALTHY', response: 'sol complete',
      }),
      ensureFallback: async () => { fallbackCalled = true; return { eligible: true }; },
    });
    expect(result.runtime).toBe('codex_app_server');
    expect(result.requested_model).toBe('gpt-5.6-sol');
    expect(result.resolved_model).toBe('gpt-5.6-sol');
    expect(result.fallback_used).toBe(false);
    expect(fallbackCalled).toBe(false);
  });

  it('does not spend another Sol turn while a known provider cooldown is active', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    recordRuntimeHealth('codex_app_server', {
      state: 'ACCOUNT_LIMITED', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol',
      retry_after: new Date(Date.now() + 60_000).toISOString(), details: { identity_proven: true, toolchain_usable: false },
    }, root);
    let primaryCalls = 0;
    const result = await executeHermesInstruction({
      repoDir: repo, root, instruction: 'Continue TEST-F001.',
      primaryRunner: async () => { primaryCalls += 1; return { ok: true, state: 'HEALTHY' }; },
      ensureFallback: async () => ({ eligible: true }),
      contextBuilder: async () => ({ context: 'TEST' }),
      fallbackRunner: async () => ({ event: { requested_model: 'claude-sonnet-5', resolved_model: 'claude-sonnet-5' }, output: { result: 'fallback without primary retry' } }),
    });
    expect(primaryCalls).toBe(0);
    expect(result.runtime).toBe('claude_code');
    expect(result.primary.skipped).toBe(true);
    expect(result.primary.skip_reason).toBe('KNOWN_PROVIDER_LIMIT_COOLDOWN');
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
        return { event: { requested_model: 'claude-sonnet-5', resolved_model: 'claude-sonnet-5' }, output: { result: 'continued safely' } };
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

  it('fails closed when exact Sonnet 5 is unavailable or provenance is wrong', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    const unavailable = await executeHermesInstruction({
      repoDir: repo,
      root,
      instruction: 'Continue TEST-F001.',
      primaryRunner: async () => ({ ok: false, state: 'PROCESS_FAILED', resolved_model: 'gpt-5.6-sol' }),
      ensureFallback: async () => ({ eligible: false, reason: 'CLAUDE_SONNET_5_NOT_HEALTHY' }),
    });
    expect(unavailable.event).toBe('HERMES_OPERATIONAL_TURN_FAILED');
    expect(unavailable.reason).toBe('NO_HERMES_RUNTIME_AVAILABLE');

    const wrongIdentity = await executeHermesInstruction({
      repoDir: repo,
      root,
      instruction: 'Continue TEST-F001.',
      primaryRunner: async () => ({ ok: false, state: 'MODEL_LIMITED', resolved_model: 'gpt-5.6-sol' }),
      ensureFallback: async () => ({ eligible: true }),
      contextBuilder: async () => ({ context: 'TEST' }),
      fallbackRunner: async () => ({ event: { resolved_model: 'claude-sonnet-4-6' }, output: { result: 'wrong model' } }),
    });
    expect(wrongIdentity.event).toBe('HERMES_OPERATIONAL_TURN_FAILED');
    expect(wrongIdentity.failure_state).toBe('FALLBACK_FAILED');
  });
});

describe('external Oracle orchestration queue', () => {
  const executorSuccess = async ({ instruction }) => ({
    event: 'HERMES_OPERATIONAL_TURN_COMPLETED',
    authority: 'HERMES_RUNTIME_ONLY',
    policy: 'LOCKED_SOL_THEN_SONNET',
    runtime: 'codex_app_server',
    requested_model: 'gpt-5.6-sol',
    resolved_model: 'gpt-5.6-sol',
    fallback_used: false,
    response: instruction,
  });

  it('executes ordinary work only when the development gate is green', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    const queued = submitExternalWork({ root, instruction: 'Verify TEST-F001 without changing its gate.' });
    const processed = await processNextExternalWork({
      repoDir: repo,
      root,
      executor: executorSuccess,
      developmentGate: () => ({ unblocked: true }),
    });
    expect(processed.state).toBe('COMPLETED');
    expect(processed.execution_origin).toBe('EXTERNAL_ORACLE_ORCHESTRATOR');
    expect(processed.runtime_provenance.requested_model).toBe('gpt-5.6-sol');
    expect(externalWorkStatus(queued.job_id, root).state).toBe('COMPLETED');
  });

  it('refreshes the external-orchestrator heartbeat while a long packet is executing', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    submitExternalWork({ root, instruction: 'Verify TEST-F001 during a long packet.' });
    const processed = await processNextExternalWork({
      repoDir: repo,
      root,
      heartbeatMs: 10,
      developmentGate: () => ({ unblocked: true }),
      executor: async ({ instruction }) => {
        const first = readJson('state/external-orchestrator-heartbeat.json', null, root)?.observed_at;
        await new Promise((resolve) => setTimeout(resolve, 45));
        const second = readJson('state/external-orchestrator-heartbeat.json', null, root)?.observed_at;
        expect(Date.parse(second)).toBeGreaterThan(Date.parse(first));
        return executorSuccess({ instruction });
      },
    });
    expect(processed.state).toBe('COMPLETED');
  });

  it('blocks ordinary development before PRODUCTION_GREEN instead of executing it', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    const queued = submitExternalWork({ root, instruction: 'Continue TEST-F001.' });
    let executorCalled = false;
    const processed = await processNextExternalWork({
      repoDir: repo,
      root,
      executor: async () => { executorCalled = true; return executorSuccess({ instruction: 'unexpected' }); },
      developmentGate: () => { throw new Error('external Hermes qualification gate not satisfied'); },
    });
    expect(executorCalled).toBe(false);
    expect(processed.state).toBe('FAILED');
    expect(processed.result.failure_state).toBe('DEVELOPMENT_BLOCKED');
    expect(externalWorkStatus(queued.job_id, root).state).toBe('FAILED');
  });

  it('allows only the fixed safe qualification canary before the gate', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    expect(() => submitExternalWork({
      root,
      instruction: 'Do development work.',
      requestedBy: 'qualification',
      metadata: { qualification_canary: true },
    })).toThrow(/instruction is fixed/);
    expect(() => submitExternalWork({
      root,
      instruction: QUALIFICATION_CANARY_INSTRUCTION,
      requestedBy: 'operator',
      metadata: { qualification_canary: true },
    })).toThrow(/requestedBy=qualification/);

    const queued = submitExternalWork({
      root,
      instruction: QUALIFICATION_CANARY_INSTRUCTION,
      requestedBy: 'qualification',
      metadata: { qualification_canary: true },
    });
    const processed = await processNextExternalWork({
      repoDir: repo,
      root,
      executor: executorSuccess,
      developmentGate: () => { throw new Error('must not be called for safe canary'); },
    });
    expect(processed.state).toBe('COMPLETED');
    expect(processed.instruction).toBe(QUALIFICATION_CANARY_INSTRUCTION);
    expect(externalWorkStatus(queued.job_id, root).state).toBe('COMPLETED');
  });

  it('persists runtime failure instead of silently advancing', async () => {
    const repo = makeRepo(), root = temp('dial-control');
    const queued = submitExternalWork({ root, instruction: 'Continue TEST-F001.' });
    const processed = await processNextExternalWork({
      repoDir: repo,
      root,
      developmentGate: () => ({ unblocked: true }),
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
    expect(hot.target_gate).toBe('DOMAIN_TESTED');
    expect(hot.authority).toBe('NON_AUTHORITATIVE_CONTEXT');
    writeFileSync(path.join(repo, 'dirty.txt'), 'x');
    expect(captureGitState(repo).dirty).toBe(true);
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
    const repo = makeRepo(), root = temp('dial-control');
    saveCheckpoint(buildCheckpoint(repo), root);
    const active = path.join(repo, 'agent-system/registries/ACTIVE_WORK.json');
    const before = readFileSync(active, 'utf8');
    recordPair(root, { sol: 'ACCOUNT_LIMITED', sonnet: 'HEALTHY' });
    expect(reconcileHermesRuntime({ root }).selection.runtime).toBe('claude_code');
    expect(loadCheckpoint('TEST-F001', root).target_gate).toBe('DOMAIN_TESTED');
    expect(readFileSync(active, 'utf8')).toBe(before);
  });

  it('prefers explicit Feature ID in the incoming turn', () => {
    const repo = makeRepo();
    expect(resolveFeatureId({ userMessage: 'continue TEST-F001 please', repoDir: repo })).toBe('TEST-F001');
  });
});


describe('development readiness gates', () => {
  function heartbeat(root) {
    writeJsonAtomic('state/external-orchestrator-heartbeat.json', { execution_origin: 'EXTERNAL_ORACLE_ORCHESTRATOR', observed_at: new Date().toISOString() }, root);
  }
  function fallbackGate(repoDir, overrides = {}) {
    return {
      schema_version: 3,
      status: 'DEVELOPMENT_READY_FALLBACK',
      development_only: true,
      production_certified: false,
      execution_origin: 'EXTERNAL_ORACLE_ORCHESTRATOR',
      runtime_policy: 'gpt-5.6-sol -> claude-sonnet-5 -> NO_HERMES_RUNTIME_AVAILABLE',
      control_plane_fingerprint: controlPlaneFingerprint(repoDir),
      primary: { runtime: 'codex_app_server', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', identity_proven: true, state: 'ACCOUNT_LIMITED' },
      fallback: { runtime: 'claude_code', requested_model: 'claude-sonnet-5', resolved_model: 'claude-sonnet-5', identity_proven: true, state: 'HEALTHY' },
      external_fallback_canary: { completed: true, execution_origin: 'EXTERNAL_ORACLE_ORCHESTRATOR', resolved_model: 'claude-sonnet-5' },
      vekl: { live_fallback_canary: true, ahead_of_work_forecast_ready: true },
      continuity: { green: true },
      ...overrides,
    };
  }

  it('unblocks development through exact Sonnet when Sol identity is proven but temporarily provider-limited', () => {
    const root = temp('dial-fallback-ready'), repoDir = process.cwd(); ensureControlLayout(root); heartbeat(root);
    writeJsonAtomic('state/external-orchestration-gate.json', fallbackGate(repoDir), root);
    const result = evaluateDevelopmentUnblock({ repoDir, root });
    expect(result.unblocked).toBe(true);
    expect(result.development_state).toBe('DEVELOPMENT_RESUMABLE_THROUGH_EXACT_SONNET_FALLBACK');
    expect(result.checks.production_green).toBe(false);
    expect(result.checks.fallback_readiness_valid).toBe(true);
  });

  it('fails closed when the primary failure is authentication rather than a temporary provider limitation', () => {
    const root = temp('dial-fallback-auth-red'), repoDir = process.cwd(); ensureControlLayout(root); heartbeat(root);
    const gate = fallbackGate(repoDir); gate.primary.state = 'AUTH_FAILED';
    writeJsonAtomic('state/external-orchestration-gate.json', gate, root);
    const result = evaluateDevelopmentUnblock({ repoDir, root });
    expect(result.unblocked).toBe(false);
    expect(result.checks.fallback_readiness_valid).toBe(false);
  });
});
