import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveControlPath, writeJsonAtomic, readJson, appendJsonl } from '../state-store.mjs';

const BASE = 'operations/auxiliary';
const STATES = Object.freeze(['queued', 'running', 'completed', 'failed', 'parked']);
function now() { return new Date().toISOString(); }
function rel(state, id) { return `${BASE}/tasks/${state}/${id}.json`; }
function ensureDirs(root) {
  for (const state of STATES) fs.mkdirSync(resolveControlPath(`${BASE}/tasks/${state}`, root), { recursive: true, mode: 0o700 });
  fs.mkdirSync(resolveControlPath(`${BASE}/attempts`, root), { recursive: true, mode: 0o700 });
  fs.mkdirSync(resolveControlPath(`${BASE}/cache`, root), { recursive: true, mode: 0o700 });
  fs.mkdirSync(resolveControlPath(`${BASE}/progress`, root), { recursive: true, mode: 0o700 });
}

export function cacheKeyForTask(task) {
  const canonical = JSON.stringify({
    project: task.project,
    task_archetype: task.task_archetype,
    input_hash: task.input_hash,
    evidence_refs: [...(task.evidence_refs ?? [])].sort(),
    policy_version: task.policy_version ?? 'haif-1.1',
    output_schema_version: task.output_schema_version ?? 1,
    route_class: task.route_class ?? 'free-approved',
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}
export function findTask(taskId, root) {
  ensureDirs(root);
  for (const state of STATES) {
    const value = readJson(rel(state, taskId), null, root);
    if (value) return { state, task: value };
  }
  return null;
}

export function findByIdempotency(idempotencyKey, root) {
  ensureDirs(root);
  for (const state of STATES) {
    const dir = resolveControlPath(`${BASE}/tasks/${state}`, root);
    for (const name of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const value = readJson(`${BASE}/tasks/${state}/${name}`, null, root);
      if (value?.idempotency_key === idempotencyKey) return { state, task: value };
    }
  }
  return null;
}

export function enqueueTask(task, root) {
  ensureDirs(root);
  const existing = findByIdempotency(task.idempotency_key, root);
  if (existing) return { ...existing, reused: true };
  const queued = { ...task, state: 'QUEUED', queued_at: now(), updated_at: now() };
  writeJsonAtomic(rel('queued', task.task_id), queued, root);
  appendJsonl(`${BASE}/events.jsonl`, { event: 'HAIF_TASK_QUEUED', task_id: task.task_id, project: task.project, archetype: task.task_archetype, at: now() }, root);
  return { state: 'queued', task: queued, reused: false };
}

export function readCachedResult(task, root) {
  if (task.cacheable !== true) return null;
  const key = cacheKeyForTask(task);
  const cached = readJson(`${BASE}/cache/${key}.json`, null, root);
  if (!cached) return null;
  if (cached.expires_at && Date.parse(cached.expires_at) <= Date.now()) return null;
  return { ...cached, cache_key: key };
}
export function claimNextTask({ root, workerId = `pid-${process.pid}`, leaseMs = 120_000 } = {}) {
  ensureDirs(root);
  const dir = resolveControlPath(`${BASE}/tasks/queued`, root);
  const files = fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort();
  for (const name of files) {
    const source = path.join(dir, name);
    const target = resolveControlPath(`${BASE}/tasks/running/${name}`, root);
    try { fs.renameSync(source, target); } catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
    const task = JSON.parse(fs.readFileSync(target, 'utf8'));
    const claimed = {
      ...task, state: 'RUNNING', lease_owner: workerId,
      lease_expires_at: new Date(Date.now() + leaseMs).toISOString(),
      claimed_at: now(), updated_at: now(),
    };
    fs.writeFileSync(target, `${JSON.stringify(claimed, null, 2)}\n`, { mode: 0o600 });
    appendJsonl(`${BASE}/events.jsonl`, { event: 'HAIF_TASK_CLAIMED', task_id: task.task_id, worker_id: workerId, at: now() }, root);
    return claimed;
  }
  return null;
}

export function checkpointRunningTask(taskId, patch, root) {
  const current = readJson(rel('running', taskId), null, root);
  if (!current) throw new Error('HAIF running task not found');
  const next = { ...current, ...patch, task_id: current.task_id, updated_at: now() };
  writeJsonAtomic(rel('running', taskId), next, root);
  return next;
}

export function beginAttempt(task, { root, requestBody, modelId, route = null, catalogSnapshotId = null, usageSnapshotId = null, egressSha256 = null }) {
  const attemptId = task.attempt_id || crypto.randomUUID();
  const body = JSON.stringify(requestBody);
  const requestSha256 = crypto.createHash('sha256').update(body).digest('hex');
  const record = {
    schema_version: 2, task_id: task.task_id, attempt_id: attemptId,
    model_id: modelId, route,
    catalog_snapshot_id: catalogSnapshotId, usage_snapshot_id: usageSnapshotId,
    egress_sha256: egressSha256,
    request_sha256: requestSha256,
    request_body: requestBody, state: 'STARTED', started_at: now(), response_persisted_at: null,
  };
  writeJsonAtomic(`${BASE}/attempts/${attemptId}.json`, record, root);
  const running = readJson(rel('running', task.task_id), null, root);
  if (running) {
    writeJsonAtomic(rel('running', task.task_id), {
      ...running, attempt_id: attemptId, current_model_id: modelId,
      current_request_sha256: requestSha256, attempt_started_at: record.started_at, updated_at: now(),
    }, root);
  }
  return record;
}

export function persistProviderResponse(attemptId, { root, status, payload, providerRequestId = null }) {
  const current = readJson(`${BASE}/attempts/${attemptId}.json`, null, root);
  if (!current) throw new Error('HAIF attempt record not found');
  const next = {
    ...current, state: 'RESPONSE_PERSISTED', provider_status: status,
    provider_request_id: providerRequestId,
    response_payload: payload,
    response_persisted_at: now(), updated_at: now(),
  };
  writeJsonAtomic(`${BASE}/attempts/${attemptId}.json`, next, root);
  return next;
}

export function readAttempt(attemptId, root) {
  if (!attemptId) return null;
  return readJson(`${BASE}/attempts/${attemptId}.json`, null, root);
}

export function persistTaskExecutionPlan(task, { root, routes, strategy, diversityStrength, catalogSnapshotId = null, usageSnapshotId = null, quotaReservationId = null }) {
  const running = readJson(rel('running', task.task_id), null, root) ?? task;
  const routePlan = (routes ?? []).map((route) => ({ ...route }));
  const next = {
    ...running,
    route_plan: routePlan,
    route_strategy: strategy,
    route_diversity_strength: diversityStrength,
    catalog_snapshot_id: catalogSnapshotId,
    usage_snapshot_id: usageSnapshotId,
    quota_reservation_id: quotaReservationId,
    updated_at: now(),
  };
  writeJsonAtomic(rel('running', task.task_id), next, root);
  return next;
}

export function readTaskProgress(taskId, root) {
  return readJson(`${BASE}/progress/${taskId}.json`, {
    schema_version: 1, task_id: taskId, packets: [], completed_model_ids: [], updated_at: null,
  }, root);
}

export function persistTaskPacket(taskId, packet, root) {
  const progress = readTaskProgress(taskId, root);
  if (!progress.completed_model_ids.includes(packet.model)) {
    progress.packets.push(packet);
    progress.completed_model_ids.push(packet.model);
  }
  progress.updated_at = now();
  writeJsonAtomic(`${BASE}/progress/${taskId}.json`, progress, root);
  return progress;
}

export function completeTask(task, { root, evidence, cacheTtlMs = null }) {
  const completed = { ...task, state: 'COMPLETED', evidence, lease_owner: null, lease_expires_at: null, finished_at: now(), updated_at: now() };
  writeJsonAtomic(rel('completed', task.task_id), completed, root);
  try { fs.unlinkSync(resolveControlPath(rel('running', task.task_id), root)); } catch {}
  if (task.cacheable === true) {
    const key = cacheKeyForTask(task);
    const expiresAt = Number.isFinite(cacheTtlMs) ? new Date(Date.now() + cacheTtlMs).toISOString() : null;
    writeJsonAtomic(`${BASE}/cache/${key}.json`, { schema_version: 1, cache_key: key, task_id: task.task_id, evidence, expires_at: expiresAt, created_at: now() }, root);
  }
  appendJsonl(`${BASE}/events.jsonl`, { event: 'HAIF_TASK_COMPLETED', task_id: task.task_id, project: task.project, at: now() }, root);
  return completed;
}

export function failTask(task, { root, reason, park = false }) {
  const state = park ? 'parked' : 'failed';
  const final = { ...task, state: park ? 'PARKED' : 'FAILED', failure_reason: String(reason ?? '').slice(0, 4000), lease_owner: null, lease_expires_at: null, finished_at: now(), updated_at: now() };
  writeJsonAtomic(rel(state, task.task_id), final, root);
  try { fs.unlinkSync(resolveControlPath(rel('running', task.task_id), root)); } catch {}
  appendJsonl(`${BASE}/events.jsonl`, { event: park ? 'HAIF_TASK_PARKED' : 'HAIF_TASK_FAILED', task_id: task.task_id, reason: final.failure_reason, at: now() }, root);
  return final;
}
export function recoverExpiredLeases({ root, nowMs = Date.now() } = {}) {
  ensureDirs(root);
  const dir = resolveControlPath(`${BASE}/tasks/running`, root);
  const recovered = [];
  for (const name of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const task = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    const lease = Date.parse(task.lease_expires_at ?? '');
    if (Number.isFinite(lease) && lease > nowMs) continue;
    const attempt = task.attempt_id ? readJson(`${BASE}/attempts/${task.attempt_id}.json`, null, root) : null;
    if (attempt?.state === 'RESPONSE_PERSISTED') {
      const queued = {
        ...task, state: 'QUEUED', lease_owner: null, lease_expires_at: null,
        reconcile_attempt_id: task.attempt_id, updated_at: now(),
      };
      writeJsonAtomic(rel('queued', task.task_id), queued, root);
      try { fs.unlinkSync(path.join(dir, name)); } catch {}
      recovered.push({
        task_id: task.task_id, action: 'REQUEUE_RECONCILE_PERSISTED_RESPONSE',
        attempt_id: task.attempt_id, quota_reservation_id: task.quota_reservation_id ?? null,
      });
      continue;
    }
    if (attempt?.state === 'STARTED') {
      failTask(task, { root, reason: 'UNCERTAIN_PROVIDER_OUTCOME_AFTER_WORKER_LOSS', park: true });
      recovered.push({
        task_id: task.task_id, action: 'PARK_UNCERTAIN_PROVIDER_OUTCOME',
        attempt_id: task.attempt_id, quota_reservation_id: task.quota_reservation_id ?? null,
      });
      continue;
    }
    const queued = {
      ...task, state: 'QUEUED', lease_owner: null, lease_expires_at: null,
      quota_reservation_id: null,
      retry_count: Number(task.retry_count ?? 0) + 1, updated_at: now(),
    };
    if (queued.retry_count >= Number(task.max_attempts ?? 2)) {
      failTask(task, { root, reason: 'HAIF_MAX_ATTEMPTS_REACHED' });
      recovered.push({ task_id: task.task_id, action: 'FAILED_MAX_ATTEMPTS', quota_reservation_id: task.quota_reservation_id ?? null });
      continue;
    }
    writeJsonAtomic(rel('queued', task.task_id), queued, root);
    try { fs.unlinkSync(path.join(dir, name)); } catch {}
    recovered.push({ task_id: task.task_id, action: 'REQUEUE_NO_ATTEMPT', quota_reservation_id: task.quota_reservation_id ?? null });
  }
  return recovered;
}
