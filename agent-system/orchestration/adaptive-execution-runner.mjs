import { appendJsonl, readJson, writeJsonAtomic, DEFAULT_CONTROL_HOME } from './state-store.mjs';
import { planAdaptiveExecution } from './adaptive-execution-planner.mjs';
import { issueWorktreeLease } from './worker-lease-manager.mjs';
import { executeSelectedHcxWorker } from './hcx-worker-executor.mjs';
import { releaseCompute } from './compute-governor.mjs';

const RETRYABLE_FAILURES = new Set(['CAPACITY_LIMITED', 'TIMEOUT', 'PROVIDER_ERROR']);
function now() { return new Date().toISOString(); }

function selectedWorker(plan) {
  const selected = plan?.routing?.selected_workers || [];
  if (plan?.topology !== 'SOLO' || selected.length !== 1) throw new Error('ADAPTIVE_SOLO_RUNNER_REQUIRES_SINGLE_WORKER_PLAN');
  return selected[0];
}

function annotateReplacement({ root, taskId, previousTaskId, attempt }) {
  if (!previousTaskId) return;
  const plan = readJson(`execution/tasks/${taskId}/plan.json`, null, root);
  const envelope = readJson(`execution/tasks/${taskId}/envelope.json`, null, root);
  if (plan) writeJsonAtomic(`execution/tasks/${taskId}/plan.json`, { ...plan, replacement_for_task_id: previousTaskId, reroute_attempt: attempt }, root);
  if (envelope) writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, { ...envelope, replacement_for_task_id: previousTaskId, reroute_attempt: attempt }, root);
}

export async function executeAdaptiveSoloWithReroute({
  repoDir,
  root = DEFAULT_CONTROL_HOME,
  packetId,
  instruction,
  budgetClass = 'S',
  allowedPaths = [],
  deniedPaths = [],
  toolGrants = ['filesystem', 'git', 'test-runner'],
  networkAllowlist = [],
  dataClass = 'INTERNAL_SAFE_FOR_APPROVED_PROVIDER',
  ownerAuthorityRef = null,
  worktreePath = repoDir,
  maxAttempts = 3,
  planner = planAdaptiveExecution,
  leaseIssuer = issueWorktreeLease,
  executor = executeSelectedHcxWorker,
  computeReleaser = releaseCompute,
  workerExecutionOverrides = {},
} = {}) {
  if (!repoDir || !packetId || !instruction || !worktreePath) throw new Error('ADAPTIVE_REROUTE_INPUTS_REQUIRED');
  const limit = Math.max(1, Math.min(4, Number(maxAttempts) || 1));
  const attempts = [];
  let previousTaskId = null;

  for (let attempt = 1; attempt <= limit; attempt += 1) {
    const plan = planner({ repoDir, root, packetId, instruction, budgetClass, allowedPaths, deniedPaths, toolGrants, networkAllowlist, dataClass, ownerAuthorityRef });
    const worker = selectedWorker(plan);
    annotateReplacement({ root, taskId: plan.task_id, previousTaskId, attempt });
    const envelope = readJson(`execution/tasks/${plan.task_id}/envelope.json`, null, root);
    if (!envelope) throw new Error('ADAPTIVE_REROUTE_ENVELOPE_MISSING');
    const workerId = worker.worker_identity_hash || worker.harness_id;
    const leaseResult = leaseIssuer({
      root,
      repositoryId: 'dial-new',
      taskId: plan.task_id,
      workerId,
      worktreePath,
      baseCommit: null,
      writePaths: envelope.allowed_paths || [],
      deniedPaths: envelope.denied_paths || [],
      ttlMs: 20 * 60 * 1000,
    });
    if (!leaseResult?.ok) {
      const reservationId = plan.compute?.reservation?.reservation_id;
      if (reservationId) { try { computeReleaser({ root, reservationId, reason: `LEASE_ISSUE_FAILED:${leaseResult?.reason || 'UNKNOWN'}` }); } catch {} }
      throw new Error(`ADAPTIVE_REROUTE_LEASE_FAILED:${leaseResult?.reason || 'UNKNOWN'}`);
    }
    const lease = leaseResult.lease;
    appendJsonl('events/adaptive-execution.jsonl', {
      event: 'ADAPTIVE_EXECUTION_ATTEMPT_STARTED', task_id: plan.task_id, packet_id: packetId,
      attempt, worker_id: workerId, harness_id: worker.harness_id, model_id: worker.model?.model_id || null,
      replacement_for_task_id: previousTaskId, at: now(),
    }, root);
    try {
      const result = await executor({
        repoDir, root, taskId: plan.task_id, harnessId: worker.harness_id,
        instruction, worktreePath, leaseId: lease.lease_id, fencingToken: lease.fencing_token,
        ...workerExecutionOverrides,
      });
      const completed = {
        ok: true,
        packet_id: packetId,
        final_task_id: plan.task_id,
        fallback_used: attempt > 1,
        attempts: [...attempts, { attempt, task_id: plan.task_id, worker_id: workerId, harness_id: worker.harness_id, model_id: worker.model?.model_id || null, outcome: 'SUCCESS' }],
        result,
        active_lease: lease,
      };
      appendJsonl('events/adaptive-execution.jsonl', {
        event: attempt > 1 ? 'ADAPTIVE_EXECUTION_REROUTE_COMPLETED' : 'ADAPTIVE_EXECUTION_COMPLETED',
        task_id: plan.task_id, packet_id: packetId, attempt, fallback_used: attempt > 1, at: now(),
      }, root);
      return completed;
    } catch (error) {
      const failureClass = error?.category || null;
      attempts.push({
        attempt, task_id: plan.task_id, worker_id: workerId, harness_id: worker.harness_id,
        model_id: worker.model?.model_id || null, outcome: 'FAILED', failure_class: failureClass,
        reason: String(error?.message || error).slice(0, 1000),
      });
      const retryable = RETRYABLE_FAILURES.has(failureClass);
      appendJsonl('events/adaptive-execution.jsonl', {
        event: retryable && attempt < limit ? 'ADAPTIVE_EXECUTION_REROUTE_SCHEDULED' : 'ADAPTIVE_EXECUTION_REROUTE_STOPPED',
        task_id: plan.task_id, packet_id: packetId, attempt, failure_class: failureClass,
        retryable, attempts_remaining: Math.max(0, limit - attempt), at: now(),
      }, root);
      if (!retryable || attempt >= limit) {
        error.reroute_attempts = attempts;
        throw error;
      }
      previousTaskId = plan.task_id;
    }
  }
  throw new Error('ADAPTIVE_REROUTE_ATTEMPTS_EXHAUSTED');
}
