#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { appendJsonl, ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';

export const DIAL_ROOT_MISSION_ID = 'dial-development-root';
export const MISSION_STATES = Object.freeze(['PAUSED', 'RUNNING', 'BLOCKED_OWNER', 'WAITING_RUNTIME', 'COMPLETE']);
const MISSION_REL = (id) => `missions/${safeId(id)}.json`;
const ACTIVE_REL = 'state/active-mission.json';
const APPROVAL_DIR = 'approvals';
const QUEUE_STATES = ['inbox', 'processing', 'completed', 'failed'];

function now() { return new Date().toISOString(); }
function safeId(value) {
  const id = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/i.test(id)) throw new Error('invalid mission id');
  return id;
}
function clean(value, max = 8000) { return String(value ?? '').trim().slice(0, max); }
function hash(value) { return crypto.createHash('sha256').update(String(value ?? '')).digest('hex'); }

export function defaultDialMission({ repoDir, objective } = {}) {
  return {
    schema_version: 1,
    mission_id: DIAL_ROOT_MISSION_ID,
    project: 'dial',
    state: 'PAUSED',
    objective: clean(objective || 'Continue DIAL development according to repository source of truth and active canonical plan until a genuine owner, reviewer, credential, external dependency, or safety boundary is reached.', 12000),
    repo_dir: repoDir ? path.resolve(repoDir) : null,
    priority_directive: null,
    turn_number: 0,
    consecutive_failures: 0,
    max_consecutive_failures: 3,
    last_packet_id: null,
    last_packet_state: null,
    last_progress_at: null,
    owner_blocker: null,
    created_at: now(),
    updated_at: now(),
  };
}

export function ensureDialMission({ root, repoDir, objective } = {}) {
  ensureControlLayout(root);
  const existing = readJson(MISSION_REL(DIAL_ROOT_MISSION_ID), null, root);
  if (existing) return existing;
  const mission = defaultDialMission({ repoDir, objective });
  writeJsonAtomic(MISSION_REL(mission.mission_id), mission, root);
  writeJsonAtomic(ACTIVE_REL, { project: 'dial', mission_id: mission.mission_id, updated_at: now() }, root);
  appendJsonl('events/mission-control.jsonl', { event: 'MISSION_CREATED', mission_id: mission.mission_id, project: 'dial', state: mission.state, at: now() }, root);
  return mission;
}

export function getDialMission(root) {
  return readJson(MISSION_REL(DIAL_ROOT_MISSION_ID), null, root);
}

function saveMission(mission, root, event, extra = {}) {
  const next = { ...mission, updated_at: now() };
  writeJsonAtomic(MISSION_REL(next.mission_id), next, root);
  writeJsonAtomic(ACTIVE_REL, { project: 'dial', mission_id: next.mission_id, updated_at: next.updated_at }, root);
  appendJsonl('events/mission-control.jsonl', { event, mission_id: next.mission_id, project: 'dial', state: next.state, at: next.updated_at, ...extra }, root);
  return next;
}

export function resumeDialMission({ root, reason = 'operator resume' } = {}) {
  const mission = ensureDialMission({ root });
  if (mission.state === 'COMPLETE') throw new Error('completed mission cannot be resumed without a new mission');
  return saveMission({ ...mission, state: 'RUNNING', owner_blocker: null, consecutive_failures: 0 }, root, 'MISSION_RESUMED', { reason: clean(reason, 500) });
}

export function pauseDialMission({ root, reason = 'operator pause' } = {}) {
  const mission = ensureDialMission({ root });
  return saveMission({ ...mission, state: 'PAUSED' }, root, 'MISSION_PAUSED', { reason: clean(reason, 500) });
}

export function setDialMissionPriority({ root, directive } = {}) {
  const mission = ensureDialMission({ root });
  const value = clean(directive, 4000);
  if (!value) throw new Error('priority directive is required');
  return saveMission({ ...mission, priority_directive: value }, root, 'MISSION_PRIORITY_UPDATED', { directive_sha256: hash(value) });
}

export function markDialMissionBlocked({ root, reason, blockerType = 'OWNER_DECISION' } = {}) {
  const mission = ensureDialMission({ root });
  return saveMission({ ...mission, state: 'BLOCKED_OWNER', owner_blocker: { type: clean(blockerType, 120), reason: clean(reason, 4000), observed_at: now() } }, root, 'MISSION_BLOCKED_OWNER', { blocker_type: clean(blockerType, 120) });
}

export function markDialMissionComplete({ root, reason = 'mission complete' } = {}) {
  const mission = ensureDialMission({ root });
  return saveMission({ ...mission, state: 'COMPLETE' }, root, 'MISSION_COMPLETED', { reason: clean(reason, 1000) });
}

export function missionExecutionAllowed(job, root) {
  if (job?.metadata?.qualification_canary === true) return true;
  const missionId = job?.metadata?.mission_id;
  if (!missionId) return true;
  if (missionId !== DIAL_ROOT_MISSION_ID) return false;
  const mission = getDialMission(root);
  return mission?.state === 'RUNNING';
}

function listJson(dir) {
  try { return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort(); }
  catch { return []; }
}

export function listMissionPackets({ root, missionId = DIAL_ROOT_MISSION_ID, limit = 100 } = {}) {
  const packets = [];
  for (const state of QUEUE_STATES) {
    const dir = resolveControlPath(`work-queue/${state}`, root);
    for (const name of listJson(dir)) {
      let job;
      try { job = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); } catch { continue; }
      if (job?.metadata?.mission_id !== missionId) continue;
      packets.push({
        packet_id: job.job_id || name.replace(/\.json$/, ''),
        state: job.state || state.toUpperCase(),
        mission_id: missionId,
        mission_turn: job.metadata?.mission_turn ?? null,
        priority: Number(job.metadata?.priority || 0),
        requested_by: job.requested_by ?? null,
        queued_at: job.queued_at ?? null,
        claimed_at: job.claimed_at ?? null,
        finished_at: job.finished_at ?? null,
        runtime: job.runtime_provenance?.runtime ?? null,
        resolved_model: job.runtime_provenance?.resolved_model ?? null,
        fallback_used: job.runtime_provenance?.fallback_used ?? null,
        instruction_preview: clean(job.instruction, 220),
        result_state: job.result?.failure_state ?? job.result?.event ?? null,
      });
    }
  }
  packets.sort((a, b) => String(b.queued_at || '').localeCompare(String(a.queued_at || '')));
  return packets.slice(0, Math.max(1, Math.min(500, Number(limit) || 100)));
}

export function missionStatus(root) {
  const mission = ensureDialMission({ root });
  const packets = listMissionPackets({ root, missionId: mission.mission_id, limit: 500 });
  const counts = Object.fromEntries(['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'].map((state) => [state.toLowerCase(), packets.filter((p) => p.state === state).length]));
  return { ...mission, packet_counts: counts, active_packets: packets.filter((p) => p.state === 'PROCESSING'), recent_packets: packets.slice(0, 10) };
}

export function recordMissionPacketResult({ root, packetId, state, failure = false } = {}) {
  const mission = ensureDialMission({ root });
  const failures = failure ? Number(mission.consecutive_failures || 0) + 1 : 0;
  let nextState = mission.state;
  if (failure && failures >= Number(mission.max_consecutive_failures || 3)) nextState = 'WAITING_RUNTIME';
  return saveMission({ ...mission, state: nextState, last_packet_id: packetId, last_packet_state: state, last_progress_at: now(), consecutive_failures: failures }, root, 'MISSION_PACKET_RECORDED', { packet_id: packetId, packet_state: state, consecutive_failures: failures });
}

export function recordMissionApproval({ root, gateId, decision, rationale = '', requestedBy = 'claude_chat' } = {}) {
  const mission = ensureDialMission({ root });
  const gate = safeId(gateId);
  const normalized = String(decision || '').toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(normalized)) throw new Error('decision must be APPROVED or REJECTED');
  const record = { schema_version: 1, mission_id: mission.mission_id, gate_id: gate, decision: normalized, rationale: clean(rationale, 4000), requested_by: clean(requestedBy, 120), decided_at: now() };
  writeJsonAtomic(`${APPROVAL_DIR}/${gate}.json`, record, root);
  appendJsonl('events/mission-control.jsonl', { event: `GATE_${normalized}`, mission_id: mission.mission_id, gate_id: gate, requested_by: record.requested_by, at: record.decided_at }, root);
  return record;
}

export function listMissionApprovals(root) {
  const dir = resolveControlPath(APPROVAL_DIR, root);
  return listJson(dir).map((name) => readJson(`${APPROVAL_DIR}/${name}`, null, root)).filter(Boolean).sort((a, b) => String(b.decided_at).localeCompare(String(a.decided_at)));
}
