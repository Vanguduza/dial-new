import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANTIGRAVITY_PINNED_VERSION,
  antigravityBinaryStatus,
  antigravityRuntimeEnv,
  antigravityRuntimeHome,
  qualifyAntigravity,
  recordAntigravityDispatchOutcome,
  resolveAntigravityBinary,
} from '../agent-system/orchestration/providers/google/antigravity-adapter.mjs';
import {
  STITCH_ALLOWED_TOOLS,
  STITCH_MCP_URL,
  stitchCredentialStatus,
  stitchHealth,
  validateStitchArtifact,
} from '../agent-system/orchestration/providers/google/stitch-adapter.mjs';
import {
  POMELLI_GMPC_FEATURES,
  buildSanitizedBusinessDna,
  qualifyPomelliWorkstation,
} from '../agent-system/orchestration/providers/google/pomelli-workstation.mjs';
import {
  integrationClaimAllowed,
  loadExternalCapabilityRegistry,
} from '../agent-system/orchestration/providers/google/external-capability-core.mjs';
import {
  executeSelectedHcxWorker,
} from '../agent-system/orchestration/hcx-worker-executor.mjs';
import { readJson, writeJsonAtomic } from '../agent-system/orchestration/state-store.mjs';
import { executeAdaptiveSoloWithReroute } from '../agent-system/orchestration/adaptive-execution-runner.mjs';

const repoDir = process.cwd();
function tempRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'dial-google-cap-')); }

describe('Google external capability boundaries', () => {
  it('classifies Pomelli as GMPC-owned production creative capability', () => {
    const registry = loadExternalCapabilityRegistry(repoDir);
    const pomelli = registry.capabilities.find((row) => row.capability_id === 'CREATIVE-POMELLI');
    expect(pomelli.functional_owner).toBe('GMPC');
    expect(pomelli.provider_admission_only).toBe(true);
    expect(pomelli.role).toBe('GMPC_EXTERNAL_CREATIVE_PROVIDER');
    expect(POMELLI_GMPC_FEATURES).toContain('GMPC-F050');
    expect(POMELLI_GMPC_FEATURES).toContain('GMPC-F209');
  });

  it('never treats lower maturity evidence as integrated', () => {
    expect(integrationClaimAllowed({ status: 'LIVE_QUALIFIED', definition_of_done: { passed: true }, live_qualification: { passed: true }, orchestrated_use: { passed: false } })).toBe(false);
    expect(integrationClaimAllowed({ status: 'INTEGRATED', definition_of_done: { passed: true }, live_qualification: { passed: true }, orchestrated_use: { passed: true } })).toBe(true);
  });

  it('keeps Pomelli browser sessions outside DIAL custody', () => {
    const root = tempRoot();
    const prior = process.env.DIAL_POMELLI_INGEST_ENABLED;
    process.env.DIAL_POMELLI_INGEST_ENABLED = 'true';
    try {
      const status = qualifyPomelliWorkstation({ root });
      expect(status.functional_owner).toBe('GMPC');
      expect(status.authentication.session_material_stored).toBe(false);
      expect(status.status).toBe('AUTH_REQUIRED');
    } finally {
      if (prior === undefined) delete process.env.DIAL_POMELLI_INGEST_ENABLED;
      else process.env.DIAL_POMELLI_INGEST_ENABLED = prior;
    }
  });
  it('rejects private/customer data from Pomelli Business DNA', () => {
    const bad = buildSanitizedBusinessDna({ brand_name: 'DIAL', customer_email: 'x@example.com' });
    expect(bad.ok).toBe(false);
    expect(bad.findings.join(' ')).toMatch(/FORBIDDEN/);
  });

  it('uses a fixed Stitch MCP boundary and explicit credential state', () => {
    expect(STITCH_MCP_URL).toBe('https://stitch.googleapis.com/mcp');
    expect(stitchCredentialStatus({}).configured).toBe(false);
    expect(stitchCredentialStatus({ STITCH_API_KEY: 'x'.repeat(20) }).configured).toBe(true);
  });

  it('quarantines an unexpected live Stitch tool instead of expanding authority', async () => {
    const clientFactory = () => ({
      client: {
        listTools: async () => ({ tools: [...STITCH_ALLOWED_TOOLS.map((name) => ({ name })), { name: 'surprise_admin_tool' }] }),
        close: async () => {},
      },
      sdk: {},
      credentials: { configured: true },
    });
    const health = await stitchHealth({ env: { DIAL_STITCH_ENABLED: 'true', STITCH_API_KEY: 'x'.repeat(20) }, clientFactory });
    expect(health.state).toBe('QUARANTINED');
    expect(health.unexpected_tools).toEqual(['surprise_admin_tool']);
  });
  it('isolates Antigravity from the owner Google credential plane', () => {
    const env = {
      DIAL_CONTROL_HOME: '/tmp/dial-control',
      GOOGLE_API_KEY: 'forbidden',
      GEMINI_API_KEY: 'forbidden',
      GOOGLE_APPLICATION_CREDENTIALS: '/tmp/forbidden.json',
      CLOUDSDK_CONFIG: '/tmp/forbidden-cloudsdk',
      GOOGLE_CLOUD_PROJECT: 'forbidden-project',
      GOOGLE_CLOUD_PROJECT_ID: 'forbidden-project-id',
      PATH: process.env.PATH,
    };
    expect(antigravityRuntimeHome(env)).toBe('/tmp/dial-control/identities/antigravity-worker');
    const isolated = antigravityRuntimeEnv(env);
    expect(isolated.HOME).toBe('/tmp/dial-control/identities/antigravity-worker');
    expect(isolated.XDG_CONFIG_HOME).toBe('/tmp/dial-control/identities/antigravity-worker/.config');
    expect(isolated.AGY_CLI_DISABLE_AUTO_UPDATE).toBe('true');
    for (const key of ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'CLOUDSDK_CONFIG', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT_ID']) expect(isolated[key]).toBeUndefined();
  });

  it('classifies Antigravity binary state without claiming authentication', async () => {
    const runner = async (_command, args) => args.includes('--version')
      ? { ok: true, stdout: `agy ${ANTIGRAVITY_PINNED_VERSION}\n`, stderr: '', error: null }
      : { ok: false, stdout: '', stderr: 'Authentication required. Please login.', error: null };
    const binary = await antigravityBinaryStatus({ runner });
    expect(binary.installed).toBe(true);
    expect(binary.version).toBe(ANTIGRAVITY_PINNED_VERSION);
    expect(binary.exact_pinned_version).toBe(true);
    const root = tempRoot();
    const prior = process.env.DIAL_ANTIGRAVITY_ENABLED;
    process.env.DIAL_ANTIGRAVITY_ENABLED = 'true';
    try {
      const qualified = await qualifyAntigravity({ repoDir, root, runner });
      expect(qualified.status).toBe('AUTH_REQUIRED');
      expect(qualified.authentication.verified).toBe(false);
      expect(qualified.definition_of_done.passed).toBe(false);
    } finally {
      if (prior === undefined) delete process.env.DIAL_ANTIGRAVITY_ENABLED;
      else process.env.DIAL_ANTIGRAVITY_ENABLED = prior;
    }
  });


  it('qualifies every live-discovered Antigravity pairing and preserves per-model capacity state', async () => {
    const root = tempRoot();
    const seen = [];
    const runner = async (_command, args) => {
      if (args.includes('--version')) return { ok: true, stdout: `agy ${ANTIGRAVITY_PINNED_VERSION}\n`, stderr: '', error: null };
      if (args[0] === 'models') return { ok: true, stdout: 'gemini-3.8-flash-low Gemini 3.8 Flash (Low)\nclaude-sonnet-4-6 Claude Sonnet 4.6 (Thinking)\n', stderr: '', error: null };
      const model = args[args.indexOf('--model') + 1];
      seen.push(model);
      if (model === 'gemini-3.8-flash-low') return { ok: true, stdout: JSON.stringify({ status: 'SUCCESS', response: 'DIAL_ANTIGRAVITY_CANARY_OK' }), stderr: '', error: null };
      return { ok: false, stdout: '', stderr: 'RESOURCE_EXHAUSTED individual quota exhausted', error: null };
    };
    const qualified = await qualifyAntigravity({ repoDir, root, runner, env: { ...process.env, DIAL_ANTIGRAVITY_ENABLED: 'true' }, probeAllModels: true, pairingTimeoutMs: 1000 });
    expect(seen.sort()).toEqual(['claude-sonnet-4-6', 'gemini-3.8-flash-low']);
    expect(qualified.status).toBe('LIVE_QUALIFIED');
    expect(qualified.pairing_qualification.checked_all).toBe(true);
    expect(qualified.pairing_qualification.counts).toEqual({ total: 2, healthy: 1, degraded: 1 });
    const availability = readJson('state/model-availability.json', {}, root);
    expect(availability.models['gemini-3.8-flash-low'].health_state).toBe('HEALTHY');
    expect(availability.models['claude-sonnet-4-6'].quota_state).toBe('EXHAUSTED');
    expect(availability.harnesses.antigravity.health_state).toBe('HEALTHY');
    expect(availability.harnesses.antigravity.healthy_model_count).toBe(1);
  });

  it('keeps capacity-limited Antigravity models out of healthy routing state', async () => {
    const root = tempRoot();
    const runner = async (_command, args) => {
      if (args.includes('--version')) return { ok: true, stdout: `agy ${ANTIGRAVITY_PINNED_VERSION}\n`, stderr: '', error: null };
      if (args[0] === 'models') return { ok: true, stdout: 'gemini-3.8-flash-low Gemini 3.8 Flash (Low)\ngemini-3.7-flash-low Gemini 3.7 Flash (Low)\n', stderr: '', error: null };
      return { ok: false, stdout: '', stderr: 'RESOURCE_EXHAUSTED individual quota exhausted', error: null };
    };
    const qualified = await qualifyAntigravity({ repoDir, root, runner, env: { ...process.env, DIAL_ANTIGRAVITY_ENABLED: 'true' } });
    expect(qualified.status).toBe('DEGRADED');
    expect(qualified.authentication.verified).toBe(true);
    expect(qualified.live_qualification.failure_class).toBe('CAPACITY_LIMITED');
    const availability = readJson('state/model-availability.json', {}, root);
    expect(availability.models['gemini-3.8-flash-low'].health_state).toBe('DEGRADED');
    expect(availability.models['gemini-3.8-flash-low'].quota_state).toBe('EXHAUSTED');
    expect(availability.models['gemini-3.7-flash-low'].health_state).toBe('UNKNOWN');
    expect(availability.harnesses.antigravity.health_state).toBe('DEGRADED');
    expect(availability.harnesses.antigravity.healthy_model_count).toBe(0);
  });

  it('reroutes a retryable worker failure through a fresh task and replacement envelope', async () => {
    const root = tempRoot();
    let planned = 0;
    let executed = 0;
    const planner = () => {
      planned += 1;
      const taskId = `task-reroute-${planned}`;
      const modelId = planned === 1 ? 'model-a' : 'model-b';
      const plan = {
        task_id: taskId, topology: 'SOLO', packet_id: 'packet-reroute',
        compute: { reservation: { reservation_id: `cmp-${planned}` } },
        routing: { selected_workers: [{ harness_id: 'antigravity-worker', worker_identity_hash: `antigravity-worker-current:${modelId}`, model: { model_id: modelId } }] },
      };
      writeJsonAtomic(`execution/tasks/${taskId}/plan.json`, plan, root);
      writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, { task_id: taskId, packet_id: 'packet-reroute', envelope_hash: `env-${planned}`, allowed_paths: ['packages/example/**'], denied_paths: [], state: 'READY' }, root);
      return plan;
    };
    const result = await executeAdaptiveSoloWithReroute({
      repoDir, root, packetId: 'packet-reroute', instruction: 'test reroute', allowedPaths: ['packages/example/**'], worktreePath: repoDir, maxAttempts: 2, planner,
      leaseIssuer: ({ taskId, workerId }) => ({ ok: true, lease: { lease_id: `lease-${taskId}`, task_id: taskId, worker_id: workerId, worktree_path: repoDir, write_paths: ['packages/example/**'], denied_paths: [], fencing_token: planned, state: 'ACTIVE' } }),
      executor: async ({ taskId }) => {
        executed += 1;
        if (executed === 1) { const error = new Error('capacity'); error.category = 'CAPACITY_LIMITED'; throw error; }
        return { ok: true, task_id: taskId, state: 'VERIFYING' };
      },
    });
    expect(result.ok).toBe(true);
    expect(result.fallback_used).toBe(true);
    expect(result.attempts.map((row) => row.model_id)).toEqual(['model-a', 'model-b']);
    expect(readJson('execution/tasks/task-reroute-2/envelope.json', null, root)).toMatchObject({ replacement_for_task_id: 'task-reroute-1', reroute_attempt: 2 });
  });

  it('records live Antigravity dispatch capacity state per discovered model', () => {
    const root = tempRoot();
    writeJsonAtomic('state/model-availability.json', {
      models: {
        'gemini-3.8-flash-high': { model_id: 'gemini-3.8-flash-high', harness_id: 'antigravity', subscription_present: true, health_state: 'HEALTHY', quota_state: 'AVAILABLE' },
        'claude-sonnet-4-6': { model_id: 'claude-sonnet-4-6', harness_id: 'antigravity', subscription_present: true, health_state: 'HEALTHY', quota_state: 'AVAILABLE' },
      },
      harnesses: { antigravity: { authenticated: true, health_state: 'HEALTHY', quota_state: 'AVAILABLE' } },
    }, root);
    recordAntigravityDispatchOutcome({ root, modelId: 'gemini-3.8-flash-high', failureClass: 'CAPACITY_LIMITED', observedAt: '2026-09-15T16:00:00.000Z' });
    let availability = readJson('state/model-availability.json', {}, root);
    expect(availability.models['gemini-3.8-flash-high'].health_state).toBe('DEGRADED');
    expect(availability.models['gemini-3.8-flash-high'].quota_state).toBe('EXHAUSTED');
    expect(availability.harnesses.antigravity.health_state).toBe('HEALTHY');
    expect(availability.harnesses.antigravity.healthy_model_count).toBe(1);
    recordAntigravityDispatchOutcome({ root, modelId: 'gemini-3.8-flash-high', passed: true, observedAt: '2026-09-15T16:01:00.000Z' });
    availability = readJson('state/model-availability.json', {}, root);
    expect(availability.models['gemini-3.8-flash-high'].health_state).toBe('HEALTHY');
    expect(availability.models['gemini-3.8-flash-high'].quota_state).toBe('AVAILABLE');
  });

  it('executes Antigravity only through a selected AEF worker with current envelope and lease bindings', async () => {
    const root = tempRoot();
    const taskId = 'task-antigravity-selected';
    const packetId = 'packet-antigravity-selected';
    const worktreePath = repoDir;
    writeJsonAtomic(`execution/tasks/${taskId}/plan.json`, {
      routing: { selected_workers: [{ harness_id: 'antigravity-worker', worker_identity_hash: 'antigravity-worker-current' }] },
    }, root);
    writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, {
      task_id: taskId,
      packet_id: packetId,
      envelope_hash: 'env-hash',
      allowed_paths: ['packages/example/**'],
      denied_paths: ['agent-system/canon/**'],
      state: 'READY',
    }, root);
    let seenEnv = null;
    const result = await executeSelectedHcxWorker({
      repoDir,
      root,
      taskId,
      harnessId: 'antigravity-worker',
      instruction: 'Make the bounded test change.',
      worktreePath,
      leaseId: 'lease-1',
      fencingToken: 9,
      admissionGuard: () => ({ ok: true }),
      envelopeChecker: ({ envelope }) => envelope.state === 'SUPERSEDED'
        ? { ok: false, reasons: ['ENVELOPE_SUPERSEDED'] }
        : { ok: true, reasons: [] },
      leaseGuard: () => ({
        lease_id: 'lease-1', task_id: taskId, worker_id: 'antigravity-worker-current',
        worktree_path: worktreePath, write_paths: ['packages/example/**'],
        denied_paths: ['agent-system/canon/**'], fencing_token: 9,
      }),
      activationLoader: () => ({ activation_id: 'act-1' }),
      deliveryBuilder: () => ({ text: 'bounded VEKL worker delivery' }),
      antigravityRunner: async ({ env }) => {
        seenEnv = env;
        return { provider: 'google-antigravity', result_hash: 'result-hash', response: 'done', usage: null, conversation_id: 'c1' };
      },
      artifactPersister: () => ({ artifact_id: 'ART-1', artifact_hash: 'artifact-hash' }),
    });
    expect(result.ok).toBe(true);
    expect(result.state).toBe('VERIFYING');
    expect(seenEnv.DIAL_TASK_ID).toBe(taskId);
    expect(seenEnv.DIAL_EXECUTION_ENVELOPE_HASH).toBe('env-hash');
    expect(seenEnv.DIAL_WORKTREE_LEASE_ID).toBe('lease-1');
    expect(seenEnv.DIAL_FENCING_TOKEN).toBe('9');
    expect(readJson(`execution/tasks/${taskId}/envelope.json`, null, root).state).toBe('VERIFYING');
  });

  it('feeds Antigravity provider failure into model health and revokes the failed lease', async () => {
    const root = tempRoot();
    const taskId = 'task-antigravity-capacity';
    const packetId = 'packet-antigravity-capacity';
    const worktreePath = repoDir;
    writeJsonAtomic('state/model-availability.json', {
      models: { 'claude-opus-4-6-thinking': { model_id: 'claude-opus-4-6-thinking', harness_id: 'antigravity', subscription_present: true, health_state: 'HEALTHY', quota_state: 'AVAILABLE' } },
      harnesses: { antigravity: { authenticated: true, health_state: 'HEALTHY', quota_state: 'AVAILABLE' } },
    }, root);
    writeJsonAtomic(`execution/tasks/${taskId}/plan.json`, {
      routing: { selected_workers: [{ harness_id: 'antigravity-worker', worker_identity_hash: 'antigravity-worker-current:claude-opus-4-6-thinking', model: { model_id: 'claude-opus-4-6-thinking' } }] },
    }, root);
    writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, { task_id: taskId, packet_id: packetId, envelope_hash: 'env-capacity', allowed_paths: ['packages/example/**'], denied_paths: [], state: 'READY' }, root);
    const closed = [];
    await expect(executeSelectedHcxWorker({
      repoDir, root, taskId, harnessId: 'antigravity-worker', instruction: 'test', worktreePath, leaseId: 'lease-capacity', fencingToken: 11,
      admissionGuard: () => ({ ok: true }), envelopeChecker: () => ({ ok: true, reasons: [] }), modelAvailabilityGuard: () => ({ ok: true }),
      leaseGuard: () => ({ lease_id: 'lease-capacity', task_id: taskId, worker_id: 'antigravity-worker-current:claude-opus-4-6-thinking', worktree_path: worktreePath, write_paths: ['packages/example/**'], denied_paths: [], fencing_token: 11 }),
      leaseCloser: (args) => { closed.push(args); return { state: args.state }; }, activationLoader: () => ({ activation_id: 'act-capacity' }), deliveryBuilder: () => ({ text: 'delivery' }),
      antigravityRunner: async () => { const error = new Error('ANTIGRAVITY_CAPACITY_LIMITED'); error.category = 'CAPACITY_LIMITED'; throw error; },
    })).rejects.toThrow(/ANTIGRAVITY_CAPACITY_LIMITED/);
    const availability = readJson('state/model-availability.json', {}, root);
    expect(availability.models['claude-opus-4-6-thinking'].quota_state).toBe('EXHAUSTED');
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ leaseId: 'lease-capacity', state: 'REVOKED' });
    const envelope = readJson(`execution/tasks/${taskId}/envelope.json`, null, root);
    expect(envelope).toMatchObject({ state: 'SUPERSEDED', superseded_reason: 'WORKER_FAILURE:CAPACITY_LIMITED', worker_failure_class: 'CAPACITY_LIMITED', worker_model_id: 'claude-opus-4-6-thinking' });
  });

  it('rejects a late Antigravity result after owner supersession without overwriting SUPERSEDED', async () => {
    const root = tempRoot();
    const taskId = 'task-antigravity-superseded';
    const packetId = 'packet-antigravity-superseded';
    const worktreePath = repoDir;
    writeJsonAtomic(`execution/tasks/${taskId}/plan.json`, {
      routing: { selected_workers: [{ harness_id: 'antigravity-worker', worker_identity_hash: 'antigravity-worker-current' }] },
    }, root);
    writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, {
      task_id: taskId,
      packet_id: packetId,
      envelope_hash: 'env-hash-2',
      allowed_paths: ['packages/example/**'], denied_paths: [], state: 'READY',
    }, root);
    await expect(executeSelectedHcxWorker({
      repoDir,
      root,
      taskId,
      harnessId: 'antigravity-worker',
      instruction: 'test',
      worktreePath,
      leaseId: 'lease-2',
      fencingToken: 10,
      admissionGuard: () => ({ ok: true }),
      envelopeChecker: ({ envelope }) => envelope.state === 'SUPERSEDED'
        ? { ok: false, reasons: ['ENVELOPE_SUPERSEDED'] }
        : { ok: true, reasons: [] },
      leaseGuard: () => ({
        lease_id: 'lease-2', task_id: taskId, worker_id: 'antigravity-worker-current',
        worktree_path: worktreePath, write_paths: ['packages/example/**'], denied_paths: [], fencing_token: 10,
      }),
      activationLoader: () => ({ activation_id: 'act-2' }),
      deliveryBuilder: () => ({ text: 'delivery' }),
      antigravityRunner: async () => {
        const current = readJson(`execution/tasks/${taskId}/envelope.json`, null, root);
        writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, {
          ...current, state: 'SUPERSEDED', superseded_reason: 'OWNER_STEER:test',
        }, root);
        return { provider: 'google-antigravity', result_hash: 'late-result', response: 'late', usage: null };
      },
      artifactPersister: () => { throw new Error('late result must never be admitted'); },
    })).rejects.toThrow(/HCX_RESULT_ENVELOPE_STALE/);
    const finalEnvelope = readJson(`execution/tasks/${taskId}/envelope.json`, null, root);
    expect(finalEnvelope.state).toBe('SUPERSEDED');
    expect(finalEnvelope.superseded_reason).toBe('OWNER_STEER:test');
  });

  it('quarantines unsafe Stitch HTML before it can become design evidence', () => {
    const result = validateStitchArtifact({ html: '<html><script src="https://evil.example/x.js"></script></html>' });
    expect(result.ok).toBe(false);
    expect(result.manifest).toBe(null);
  });
});
