import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { appendJsonl, writeJsonAtomic, resolveControlPath } from '../state-store.mjs';
import { providerGovernance, assertAssembledRequestSafe } from './data-classification.mjs';
import { validatePersistedAuxiliaryTask, submitAuxiliaryTask } from './task-gateway.mjs';
import { claimNextTask, readCachedResult, beginAttempt, persistProviderResponse, completeTask, failTask, recoverExpiredLeases, findTask, readAttempt, persistTaskExecutionPlan, readTaskProgress, persistTaskPacket, checkpointRunningTask } from './task-store.mjs';
import { reserveQuota, settleQuota, quotaOperatingState } from './quota-allocator.mjs';
import { buildEvidencePacket } from './evidence-packet.mjs';
import { compareEvidencePackets, premiumAdjudicationCandidate } from './conflict-engine.mjs';
import { buildXKiroRequest, callXKiroChat } from '../providers/xkiro/xkiro-client.mjs';
import { readSecureXKiroKey, xkiroSecretStatus } from '../providers/xkiro/xkiro-qualification.mjs';
import { fetchXKiroCatalog, persistCatalogSnapshot } from '../providers/xkiro/xkiro-catalog.mjs';
import { fetchXKiroUsage, persistUsageSnapshot } from '../providers/xkiro/xkiro-usage.mjs';
import { selectTaskRoutes } from '../providers/xkiro/xkiro-model-router.mjs';
import { ELITE_FREE_MODEL_POLICY_VERSION } from '../providers/xkiro/elite-model-policy.mjs';
import { archiveEvidenceIfConfigured, r2ConfigStatus } from './r2-evidence-store.mjs';

function now() { return new Date().toISOString(); }
function readProviderJson(providerRoot, rel, fallback = null) {
  try { return JSON.parse(fs.readFileSync(path.join(providerRoot, rel), 'utf8')); } catch (error) { if (error?.code === 'ENOENT') return fallback; throw error; }
}

function readQualification(root, project) {
  try {
    return JSON.parse(fs.readFileSync(resolveControlPath(`operations/auxiliary/qualification/xkiro-${project}-latest.json`, root), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function haifTenantStatus({ project, root, providerRoot, keyFile }) {
  const catalog = readProviderJson(providerRoot, 'xkiro/catalog/latest.json', null);
  const usage = readProviderJson(providerRoot, 'xkiro/usage/latest.json', null);
  const qualification = readQualification(root, project);
  const counts = {};
  for (const state of ['queued', 'running', 'completed', 'failed', 'parked']) {
    try { counts[state] = fs.readdirSync(resolveControlPath(`operations/auxiliary/tasks/${state}`, root)).filter((x) => x.endsWith('.json')).length; }
    catch { counts[state] = 0; }
  }
  return {
    schema_version: 2, authority: 'NON_AUTHORITATIVE_AUXILIARY_OPERATIONS_ONLY', project,
    provider: 'xkiro', budget_policy: 'FREE_ONLY', account_scoped_provider_state: true,
    elite_model_policy_version: ELITE_FREE_MODEL_POLICY_VERSION,
    secret: { ...xkiroSecretStatus(keyFile), material_exposed: false },
    provider_governance: providerGovernance(root),
    qualification: qualification ? { status: qualification.status, observed_at: qualification.observed_at ?? null, completed_at: qualification.completed_at ?? null, authentication_verified: qualification.authentication?.verified === true, canary_completed: qualification.canary?.completed === true } : null,
    r2_archive: r2ConfigStatus(),
    catalog: catalog ? { snapshot_id: catalog.catalog_snapshot_id, observed_at: catalog.observed_at, model_count: catalog.model_count, free_model_count: catalog.free_model_count } : null,
    usage: usage ? { snapshot_id: usage.usage_snapshot_id, observed_at: usage.observed_at, plan: usage.plan, free_tokens: usage.free_tokens, wallet: usage.wallet, quota_state: quotaOperatingState(usage.free_tokens) } : null,
    queue: counts,
    tools_allowed: false, repository_writes_allowed: false,
    premium_manager_credentials_available: false,
    observed_at: now(),
  };
}

export function haifTaskProjection(taskId, root) {
  const found = findTask(taskId, root);
  if (!found) return null;
  const task = found.task;
  const terminalEvidence = found.state === 'completed' ? task.evidence : null;
  return {
    schema_version: 1,
    task_id: task.task_id,
    project: task.project,
    task_archetype: task.task_archetype,
    state: String(task.state ?? found.state).toUpperCase(),
    authority: task.authority,
    evidence: terminalEvidence,
    failure_reason: ['failed', 'parked'].includes(found.state) ? task.failure_reason ?? null : null,
    queued_at: task.queued_at ?? null,
    claimed_at: task.claimed_at ?? null,
    finished_at: task.finished_at ?? null,
  };
}

async function currentProviderState({ apiKey, providerRoot, fetchImpl }) {
  let catalog = readProviderJson(providerRoot, 'xkiro/catalog/latest.json', null);
  const catalogAge = Date.now() - Date.parse(catalog?.observed_at ?? '');
  if (!catalog || !Number.isFinite(catalogAge) || catalogAge > 60 * 60 * 1000) {
    catalog = await fetchXKiroCatalog({ fetchImpl }); persistCatalogSnapshot(catalog, providerRoot);
  }
  let usage = readProviderJson(providerRoot, 'xkiro/usage/latest.json', null);
  const usageAge = Date.now() - Date.parse(usage?.observed_at ?? '');
  if (!usage || !Number.isFinite(usageAge) || usageAge > 2 * 60 * 1000) {
    usage = await fetchXKiroUsage({ apiKey, fetchImpl }); persistUsageSnapshot(usage, providerRoot);
  }
  return { catalog, usage };
}

function persistedAttemptResult(attempt) {
  if (!attempt || attempt.state !== 'RESPONSE_PERSISTED') throw new Error('HAIF persisted response is unavailable for reconciliation');
  if (Number(attempt.provider_status) < 200 || Number(attempt.provider_status) >= 300) throw new Error('HAIF persisted response is not successful');
  const payload = attempt.response_payload ?? {};
  return {
    status: Number(attempt.provider_status),
    provider_request_id: attempt.provider_request_id ?? payload?.id ?? null,
    model: payload?.model ?? attempt.model_id,
    content: payload?.choices?.[0]?.message?.content,
    usage: payload?.usage ?? {},
    latency_ms: null,
    payload,
  };
}

function totalPacketTokens(packets = []) {
  return packets.reduce((sum, packet) => sum + Number(packet.input_tokens ?? 0) + Number(packet.output_tokens ?? 0), 0);
}

async function finalizeAuxiliaryEvidence({ project, task, root, routeSelection, packets, fetchImpl }) {
  const conflict = compareEvidencePackets(packets);
  const adjudication = premiumAdjudicationCandidate({ project, taskId: task.task_id, packets, conflict });
  if (adjudication) {
    writeJsonAtomic(`operations/auxiliary/adjudication/${task.task_id}.json`, adjudication, root);
    appendJsonl('operations/auxiliary/events.jsonl', { event: 'HAIF_PREMIUM_ADJUDICATION_CANDIDATE_CREATED', task_id: task.task_id, at: now() }, root);
  }
  const evidence = {
    schema_version: 1, authority: 'NON_AUTHORITATIVE_AUXILIARY_EVIDENCE', project,
    task_id: task.task_id, strategy: routeSelection.strategy,
    diversity_strength: routeSelection.diversity_strength, packets, conflict,
    premium_adjudication_candidate: adjudication, direct_premium_invocation: false,
    created_at: now(),
  };
  let archive = { state: 'NOT_CONFIGURED', provider: 'cloudflare-r2' };
  try {
    archive = await archiveEvidenceIfConfigured({ project, taskId: task.task_id, evidence, fetchImpl });
  } catch (archiveError) {
    archive = { state: 'DEGRADED', provider: 'cloudflare-r2', reason: archiveError?.category ?? 'R2_ARCHIVE_FAILED' };
    appendJsonl('operations/auxiliary/events.jsonl', { event: 'HAIF_R2_ARCHIVE_DEGRADED', task_id: task.task_id, reason: archive.reason, at: now() }, root);
  }
  return completeTask(task, { root, evidence: { ...evidence, archive }, cacheTtlMs: task.cacheable ? 24 * 60 * 60 * 1000 : null });
}

export async function runOneAuxiliaryTask({ project, root, providerRoot, keyFile, fetchImpl = globalThis.fetch, workerId = `haif-${process.pid}` } = {}) {
  const accountRoot = path.join(providerRoot, 'xkiro', 'quota');
  const recovered = recoverExpiredLeases({ root });
  for (const item of recovered) {
    if (!item.quota_reservation_id || item.action === 'REQUEUE_RECONCILE_PERSISTED_RESPONSE') continue;
    const progress = readTaskProgress(item.task_id, root);
    settleQuota({ reservationId: item.quota_reservation_id, actualTokens: totalPacketTokens(progress.packets), accountRoot });
  }

  let task = claimNextTask({ root, workerId });
  if (!task) return { state: 'IDLE', recovered };
  let reservationId = task.quota_reservation_id ?? null;
  try {
    validatePersistedAuxiliaryTask(task, { root, expectedProject: project });
    const cached = readCachedResult(task, root);
    if (cached) {
      const completed = completeTask(task, { root, evidence: { ...cached.evidence, cache_reused: true } });
      appendJsonl('operations/auxiliary/events.jsonl', { event: 'HAIF_CACHE_REUSED', task_id: task.task_id, cache_key: cached.cache_key, at: now() }, root);
      return { state: 'COMPLETED', cache_reused: true, task: completed, recovered };
    }

    let progress = readTaskProgress(task.task_id, root);
    let packets = [...progress.packets];
    let routeSelection = Array.isArray(task.route_plan) && task.route_plan.length
      ? { strategy: task.route_strategy ?? 'S1', routes: task.route_plan, diversity_strength: task.route_diversity_strength ?? 'SINGLE' }
      : null;

    if (task.reconcile_attempt_id) {
      const attempt = readAttempt(task.reconcile_attempt_id, root);
      const result = persistedAttemptResult(attempt);
      const route = attempt.route ?? routeSelection?.routes?.find((item) => item.model_id === attempt.model_id);
      if (!route) throw new Error('HAIF reconciliation is missing persisted route metadata');
      if (result.model !== route.model_id) throw new Error('xKiro persisted response model identity mismatch');
      const packet = buildEvidencePacket({
        task: { ...task, attempt_id: attempt.attempt_id }, route,
        catalogSnapshotId: attempt.catalog_snapshot_id ?? task.catalog_snapshot_id,
        usageSnapshotId: attempt.usage_snapshot_id ?? task.usage_snapshot_id,
        inputEvidenceRefs: task.evidence_refs, inputHash: task.input_hash,
        content: result.content, usage: result.usage, latencyMs: result.latency_ms,
      });
      progress = persistTaskPacket(task.task_id, packet, root);
      packets = [...progress.packets];
      task = checkpointRunningTask(task.task_id, {
        reconcile_attempt_id: null, attempt_id: null, current_model_id: null,
        current_request_sha256: null, attempt_started_at: null,
      }, root);
      appendJsonl('operations/auxiliary/events.jsonl', {
        event: 'HAIF_PERSISTED_RESPONSE_RECONCILED', task_id: task.task_id,
        attempt_id: attempt.attempt_id, model_id: route.model_id, at: now(),
      }, root);
    }

    if (routeSelection && routeSelection.routes.every((route) => progress.completed_model_ids.includes(route.model_id))) {
      const completed = await finalizeAuxiliaryEvidence({ project, task, root, routeSelection, packets, fetchImpl });
      if (reservationId) settleQuota({ reservationId, actualTokens: totalPacketTokens(packets), accountRoot });
      return { state: 'COMPLETED', task: completed, reconciled: true, recovered };
    }

    const qualification = readQualification(root, project);
    if (qualification?.status !== 'PUBLIC_ONLY_TRANSPORT_QUALIFIED') {
      const parked = failTask(task, { root, reason: 'PROVIDER_QUALIFICATION_REQUIRED', park: true });
      appendJsonl('operations/auxiliary/events.jsonl', { event: 'HAIF_PROVIDER_QUALIFICATION_BLOCKED', task_id: task.task_id, qualification_status: qualification?.status ?? 'MISSING', at: now() }, root);
      return { state: 'PARKED', task: parked, reason: 'PROVIDER_QUALIFICATION_REQUIRED', recovered };
    }
    const apiKey = readSecureXKiroKey(keyFile);
    const { catalog, usage } = await currentProviderState({ apiKey, providerRoot, fetchImpl });
    if (!routeSelection) {
      routeSelection = selectTaskRoutes({ catalog, root, task });
      if (!routeSelection.routes.length) return { state: 'PARKED', task: failTask(task, { root, reason: 'NO_BENCHMARKED_ELITE_FREE_ROUTE', park: true }), recovered };
    }

    const remainingRoutes = routeSelection.routes.filter((route) => !progress.completed_model_ids.includes(route.model_id));
    if (!reservationId) {
      const estimate = Math.min(Number(task.max_input_tokens ?? 120000) + Number(task.max_output_tokens ?? 8000), 200000);
      const reservation = reserveQuota({ project, estimatedTokens: estimate * remainingRoutes.length, usagePayload: usage, accountRoot, taskId: task.task_id, priority: task.priority });
      if (!reservation.admitted) return { state: 'PARKED', task: failTask(task, { root, reason: reservation.reason, park: true }), quota: reservation, recovered };
      reservationId = reservation.reservation_id;
    }

    task = persistTaskExecutionPlan(task, {
      root, routes: routeSelection.routes, strategy: routeSelection.strategy,
      diversityStrength: routeSelection.diversity_strength,
      catalogSnapshotId: catalog.catalog_snapshot_id,
      usageSnapshotId: usage.usage_snapshot_id,
      quotaReservationId: reservationId,
    });

    let actualTokens = totalPacketTokens(packets);
    try {
      for (const route of remainingRoutes) {
        const routeTask = { ...task, attempt_id: crypto.randomUUID() };
        const requestBody = buildXKiroRequest({ task: routeTask, modelId: route.model_id });
        const egress = assertAssembledRequestSafe({ task: routeTask, requestBody, root });
        const attempt = beginAttempt(routeTask, {
          root, requestBody, modelId: route.model_id, route,
          catalogSnapshotId: catalog.catalog_snapshot_id,
          usageSnapshotId: usage.usage_snapshot_id,
          egressSha256: egress.sha256,
        });
        let result;
        try {
          result = await callXKiroChat({
            apiKey, requestBody, fetchImpl,
            maxAttempts: Math.min(3, routeTask.max_attempts ?? 2),
            rateLimit: {
              accountRoot: path.join(providerRoot, 'xkiro', 'rate'),
              estimatedTokens: Number(requestBody.max_tokens ?? 8000) + 2000,
              requestId: routeTask.task_id,
            },
          });
        } catch (error) {
          if (error?.category?.includes('UNCERTAIN_OUTCOME')) {
            failTask(task, { root, reason: error.category, park: true });
            return { state: 'PARKED', reason: error.category, recovered };
          }
          throw error;
        }
        persistProviderResponse(attempt.attempt_id, { root, status: result.status, payload: result.payload, providerRequestId: result.provider_request_id });
        if (result.model !== route.model_id) throw new Error('xKiro returned a different model identity than requested');
        const packet = buildEvidencePacket({
          task: routeTask, route, catalogSnapshotId: catalog.catalog_snapshot_id,
          usageSnapshotId: usage.usage_snapshot_id, inputEvidenceRefs: task.evidence_refs,
          inputHash: task.input_hash, content: result.content, usage: result.usage,
          latencyMs: result.latency_ms,
        });
        progress = persistTaskPacket(task.task_id, packet, root);
        packets = [...progress.packets];
        actualTokens = totalPacketTokens(packets);
        task = checkpointRunningTask(task.task_id, {
          attempt_id: null, current_model_id: null, current_request_sha256: null,
          attempt_started_at: null,
        }, root);
        appendJsonl('operations/auxiliary/events.jsonl', {
          event: 'HAIF_ROUTE_COMPLETED', task_id: task.task_id,
          attempt_id: attempt.attempt_id, model_id: route.model_id,
          request_sha256: egress.sha256, at: now(),
        }, root);
      }
    } finally {
      if (reservationId) {
        settleQuota({ reservationId, actualTokens, accountRoot });
        reservationId = null;
      }
    }

    const completed = await finalizeAuxiliaryEvidence({ project, task, root, routeSelection, packets, fetchImpl });
    return { state: 'COMPLETED', task: completed, recovered };
  } catch (error) {
    if (reservationId) settleQuota({ reservationId, actualTokens: totalPacketTokens(readTaskProgress(task.task_id, root).packets), accountRoot });
    const park = ['RATE_OR_FREE_QUOTA_LIMITED', 'PAID_CAPACITY_REQUIRED', 'ROUTE_INELIGIBLE'].includes(error?.category);
    const failed = failTask(task, { root, reason: error?.category || error?.message || error, park });
    appendJsonl('operations/auxiliary/events.jsonl', { event: 'HAIF_TASK_EXECUTION_ERROR', task_id: task.task_id, category: error?.category ?? null, at: now() }, root);
    return { state: park ? 'PARKED' : 'FAILED', task: failed, recovered };
  }
}

export { submitAuxiliaryTask };
