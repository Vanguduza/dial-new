import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANTIGRAVITY_PINNED_VERSION,
  antigravityBinaryStatus,
  qualifyAntigravity,
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
import { executeSelectedHcxWorker } from '../agent-system/orchestration/hcx-worker-executor.mjs';
import { readJson, writeJsonAtomic } from '../agent-system/orchestration/state-store.mjs';

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
