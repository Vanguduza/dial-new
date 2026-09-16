#!/usr/bin/env node
import path from 'node:path';
import {
  DEFAULT_CONTROL_HOME,
  appendJsonl,
  readJson,
  writeJsonAtomic,
} from './state-store.mjs';
import { checkTaskExecutionEnvelope } from './task-execution-envelope.mjs';
import { assertFreshKnowledgeBinding } from './knowledge-admission-guard.mjs';
import { assertWorktreeLease, closeWorktreeLease } from './worker-lease-manager.mjs';
import { loadSkillActivationForPacket } from './skill-activation-store.mjs';
import { buildWorkerKnowledgeDelivery } from './knowledge-worker-delivery.mjs';
import { persistExecutionArtifact } from './execution-blackboard.mjs';
import { antigravityHeadless, recordAntigravityDispatchOutcome } from './providers/google/antigravity-adapter.mjs';
import { runClaudeHcxWorker } from './claude-worker-runner.mjs';
import { assertModelAvailableForDispatch } from './model-availability-discovery.mjs';
import { loadRoutingRegistries } from './adaptive-routing-core.mjs';
import { releaseCompute, settleCompute } from './compute-governor.mjs';
import { loadCurrentStitchAcceptedDesign, recordStitchUnitConsumption } from './stitch-design-orchestration.mjs';

function now() { return new Date().toISOString(); }
function norm(value) { return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/\*\*?$/, '').replace(/\/$/, ''); }
function samePaths(a = [], b = []) {
  return JSON.stringify([...new Set(a.map(norm))].sort()) === JSON.stringify([...new Set(b.map(norm))].sort());
}
function workerId(card) { return card?.worker_identity_hash || card?.harness_id || null; }
export async function executeSelectedHcxWorker({
  repoDir,
  root = DEFAULT_CONTROL_HOME,
  taskId,
  harnessId,
  instruction,
  worktreePath,
  leaseId,
  fencingToken,
  env = process.env,
  admissionGuard = assertFreshKnowledgeBinding,
  envelopeChecker = checkTaskExecutionEnvelope,
  leaseGuard = assertWorktreeLease,
  activationLoader = loadSkillActivationForPacket,
  deliveryBuilder = buildWorkerKnowledgeDelivery,
  antigravityRunner = antigravityHeadless,
  claudeRunner = runClaudeHcxWorker,
  artifactPersister = persistExecutionArtifact,
  modelAvailabilityGuard = assertModelAvailableForDispatch,
  leaseCloser = closeWorktreeLease,
  availabilityRecorder = recordAntigravityDispatchOutcome,
  computeReleaser = releaseCompute,
  computeSettler = settleCompute,
} = {}) {
  if (!repoDir || !taskId || !harnessId || !worktreePath) throw new Error('HCX_EXECUTION_INPUTS_REQUIRED');
  const plan = readJson(`execution/tasks/${taskId}/plan.json`, null, root);
  const envelope = readJson(`execution/tasks/${taskId}/envelope.json`, null, root);
  if (!plan || !envelope) throw new Error('HCX_PLAN_OR_ENVELOPE_MISSING');
  const selected = (plan.routing?.selected_workers || []).find((item) => item.harness_id === harnessId);
  if (!selected) throw new Error('HCX_WORKER_NOT_SELECTED');
  const selectedModelId = selected.model?.model_id === 'provider-managed' && harnessId === 'antigravity-worker' ? 'antigravity-native' : selected.model?.model_id;
  if (selectedModelId) modelAvailabilityGuard({ modelRegistry: loadRoutingRegistries(repoDir).models, modelId: selectedModelId, health: readJson('state/model-availability.json', {}, root) });
  const isAntigravity = harnessId === 'antigravity-worker';
  const isClaude = harnessId === 'claude-sonnet-worker' || harnessId === 'claude-sonnet-worker-secondary';
  if (!isAntigravity && !isClaude) throw new Error(`HCX_WORKER_EXECUTOR_UNSUPPORTED:${harnessId}`);
  admissionGuard({ repoDir, root, packetId: envelope.packet_id, boundary: 'HCX_WORKER_START' });
  const current = envelopeChecker({ repoDir, root, envelope });
  if (!current.ok) throw new Error(`HCX_EXECUTION_ENVELOPE_STALE:${current.reasons.join(',')}`);
  const identity = workerId(selected);
  if (!identity || !leaseId || fencingToken == null) throw new Error('HCX_WRITE_LEASE_REQUIRED');
  const lease = leaseGuard({ root, leaseId, workerId: identity, fencingToken });
  if (lease.task_id !== taskId) throw new Error('HCX_LEASE_TASK_MISMATCH');
  if (path.resolve(lease.worktree_path || '') !== path.resolve(worktreePath)) throw new Error('HCX_LEASE_WORKTREE_MISMATCH');
  if (!samePaths(lease.write_paths, envelope.allowed_paths)) throw new Error('HCX_LEASE_SCOPE_MISMATCH');
  if (!samePaths(lease.denied_paths, envelope.denied_paths)) throw new Error('HCX_LEASE_DENY_SCOPE_MISMATCH');

  const activation = activationLoader(envelope.packet_id, root);
  if (!activation) throw new Error('HCX_ACTIVATION_MISSING');
  const delivery = deliveryBuilder({
    packetId: envelope.packet_id,
    manifest: activation,
    instruction: String(instruction || ''),
    root,
  });
  const runningEnvelope = { ...envelope, state: 'RUNNING', worker_id: identity, started_at: now() };
  writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, runningEnvelope, root);
  const workerEnv = {
    ...env,
    DIAL_REPO_DIR: worktreePath,
    DIAL_CONTROL_HOME: root,
    DIAL_PACKET_ID: envelope.packet_id,
    DIAL_GOVERNED_SESSION: '1',
    DIAL_TASK_ID: taskId,
    DIAL_WORKER_ID: identity,
    DIAL_EXECUTION_ENVELOPE_HASH: envelope.envelope_hash,
    DIAL_WORKTREE_LEASE_ID: lease.lease_id,
    DIAL_FENCING_TOKEN: String(lease.fencing_token),
  };
    const acceptedStitchDesign = loadCurrentStitchAcceptedDesign({ repoDir, root, taskId, envelopeHash: envelope.envelope_hash });
  const stitchDesignContext = acceptedStitchDesign ? [
    'Accepted non-authoritative Stitch design evidence is attached to this governed task.',
    `Stitch candidate hash: ${acceptedStitchDesign.candidate_hash}`,
    `Stitch admission evidence hash: ${acceptedStitchDesign.evidence_hash}`,
    `Frontend design packet hash: ${acceptedStitchDesign.fdep_hash}`,
    'Use it only as derived design input. Project Truth, FRC, Product Experience/FDEP, task envelope and acceptance gates remain superior.',
  ].join('\n') : null;
  const boundedPrompt = [
    isAntigravity ? 'DIAL HCX ANTIGRAVITY WORKER' : 'DIAL HCX CLAUDE WORKER',
    `Task: ${taskId}`,
    `Envelope: ${envelope.envelope_hash}`,
    `Allowed write paths: ${(envelope.allowed_paths || []).join(', ') || 'none'}`,
    `Denied paths: ${(envelope.denied_paths || []).join(', ') || 'none'}`,
    'Remain inside the current Task Execution Envelope. Do not push, merge, deploy, alter Project Truth, or broaden scope.',
    'Return a concise implementation/result summary after tool work.',
    '',
    stitchDesignContext,
    delivery.text,
  ].filter(Boolean).join('\n');

  appendJsonl('events/adaptive-execution.jsonl', {
    event: 'HCX_WORKER_STARTED', task_id: taskId, harness_id: harnessId, worker_id: identity, at: now(),
  }, root);
  try {
    const result = isAntigravity
      ? await antigravityRunner({
          prompt: boundedPrompt,
          repoDir: worktreePath,
          model: selectedModelId || null,
          env: workerEnv,
        })
      : await claudeRunner({
          prompt: boundedPrompt,
          repoDir: worktreePath,
          env: workerEnv,
          profileId: selected.runtime_profile?.profile_id || 'primary',
          runtimeId: selected.runtime_profile?.health_slot || 'claude_code',
          configDir: selected.runtime_profile?.profile_id === 'secondary'
            ? (env[selected.runtime_profile?.config_dir_ref || 'DIAL_CLAUDE_SECONDARY_CONFIG_DIR'] || selected.runtime_profile?.default_config_dir || '/var/lib/dial-control/secrets/claude-worker-secondary')
            : null,
        });
    admissionGuard({ repoDir, root, packetId: envelope.packet_id, boundary: 'HCX_WORKER_RESULT_ADMISSION' });
    const afterEnvelope = readJson(`execution/tasks/${taskId}/envelope.json`, null, root);
    const afterCurrent = envelopeChecker({ repoDir, root, envelope: afterEnvelope });
    if (!afterCurrent.ok) throw new Error(`HCX_RESULT_ENVELOPE_STALE:${afterCurrent.reasons.join(',')}`);
    leaseGuard({ root, leaseId, workerId: identity, fencingToken });
    if (harnessId === 'antigravity-worker' && selectedModelId) {
      try { availabilityRecorder({ root, modelId: selectedModelId, passed: true, failureClass: null, observedAt: now() }); } catch {}
    }
    const reservationId = plan.compute?.reservation?.reservation_id || null;
    let computeSettlement = null;
    if (reservationId) {
      try {
        computeSettlement = computeSettler({
          root, reservationId,
          actualInputTokens: Number(result.usage?.input_tokens || 0),
          actualOutputTokens: Number(result.usage?.output_tokens || 0),
        });
      } catch {}
    }
    const artifact = artifactPersister({
      root, taskId, workerId: identity, role: 'BUILDER', artifactType: 'HCX_WORKER_RESULT',
      envelopeHash: envelope.envelope_hash,
      content: {
        provider: result.provider,
        result_hash: result.result_hash,
        response: result.response,
        usage: result.usage || null,
        conversation_id_present: Boolean(result.conversation_id),
      },
    });
    writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, {
      ...afterEnvelope,
      state: 'VERIFYING',
      worker_artifact_id: artifact.artifact_id,
      worker_finished_at: now(),
    }, root);
    const stitchConsumption = acceptedStitchDesign ? recordStitchUnitConsumption({
      root,
      taskId,
      workerArtifactId: artifact.artifact_id,
      envelopeHash: envelope.envelope_hash,
    }) : null;
    appendJsonl('events/adaptive-execution.jsonl', {
      event: 'HCX_WORKER_COMPLETED', task_id: taskId, harness_id: harnessId,
      worker_id: identity, artifact_id: artifact.artifact_id, at: now(),
    }, root);
    return {
      ok: true,
      task_id: taskId,
      harness_id: harnessId,
      worker_id: identity,
      envelope_hash: envelope.envelope_hash,
      artifact_id: artifact.artifact_id,
      artifact_hash: artifact.artifact_hash,
      result_hash: result.result_hash,
      compute_settlement: computeSettlement ? { reservation_id: computeSettlement.reservation_id, state: computeSettlement.state, actual_input_tokens: computeSettlement.actual_input_tokens, actual_output_tokens: computeSettlement.actual_output_tokens } : null,
      stitch_design_consumption: stitchConsumption ? { evidence_hash: stitchConsumption.evidence_hash, candidate_hash: stitchConsumption.candidate_hash } : null,
      state: 'VERIFYING',
    };
  } catch (error) {
    const failedAt = now();
    const failureClass = error?.category || null;
    let availabilityUpdated = false;
    if (harnessId === 'antigravity-worker' && selectedModelId && failureClass) {
      try {
        availabilityRecorder({ root, modelId: selectedModelId, passed: false, failureClass, observedAt: failedAt });
        availabilityUpdated = true;
      } catch {}
    }
    let leaseClosed = false;
    try {
      leaseCloser({ root, leaseId, state: 'REVOKED', reason: `HCX_WORKER_FAILURE:${failureClass || 'EXECUTION_ERROR'}` });
      leaseClosed = true;
    } catch {}
    const reservationId = plan.compute?.reservation?.reservation_id || null;
    let computeReleased = false;
    if (reservationId) {
      try { computeReleased = Boolean(computeReleaser({ root, reservationId, reason: `HCX_WORKER_FAILURE:${failureClass || 'EXECUTION_ERROR'}` })); } catch {}
    }
    const latest = readJson(`execution/tasks/${taskId}/envelope.json`, null, root) || envelope;
    if (latest.state !== 'SUPERSEDED') {
      writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, {
        ...latest,
        state: 'SUPERSEDED',
        superseded_reason: `WORKER_FAILURE:${failureClass || 'EXECUTION_ERROR'}`,
        superseded_at: failedAt,
        worker_failure: String(error?.message || error).slice(0, 1000),
        worker_failure_class: failureClass,
        worker_model_id: selectedModelId || null,
        worker_failed_at: failedAt,
      }, root);
    }
    appendJsonl('events/adaptive-execution.jsonl', {
      event: 'HCX_WORKER_FAILED', task_id: taskId, harness_id: harnessId,
      worker_id: identity, model_id: selectedModelId || null, failure_class: failureClass,
      availability_updated: availabilityUpdated, lease_closed: leaseClosed, compute_released: computeReleased,
      reason: String(error?.message || error).slice(0, 1000), at: failedAt,
    }, root);
    throw error;
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [taskId, harnessId = 'antigravity-worker', worktreePath, leaseId, fencingToken, ...words] = process.argv.slice(2);
  executeSelectedHcxWorker({
    repoDir: process.env.DIAL_REPO_DIR || process.cwd(),
    root: process.env.DIAL_CONTROL_HOME || DEFAULT_CONTROL_HOME,
    taskId,
    harnessId,
    worktreePath,
    leaseId,
    fencingToken,
    instruction: words.join(' '),
  }).then((value) => {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  }).catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
