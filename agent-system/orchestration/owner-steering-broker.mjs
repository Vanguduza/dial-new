#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { executeOwnerLiveTurn } from './owner-live-control.mjs';
import { missionStatus } from './mission-control.mjs';
import { appendJsonl, ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';
import { submitAuxiliaryTask, haifTaskProjection } from './auxiliary/tenant-service.mjs';

const BASE = 'operator-steering';
const STATES = Object.freeze(['pending', 'active', 'completed', 'failed', 'superseded']);
const HEARTBEAT_REL = 'state/owner-steering-heartbeat.json';
const SUMMARY_REL = 'state/owner-steering.json';
const INTAKE_REL = 'state/owner-steering-intake.json';
const POLL_MS = Math.max(500, Number(process.env.DIAL_OWNER_STEERING_POLL_MS || 1500));
const ADVISORY_WAIT_MS = Math.max(0, Number(process.env.DIAL_OWNER_STEERING_ADVISORY_WAIT_MS || 20000));
const MAX_ACK = 2200;

const now = () => new Date().toISOString();
const clean = (value, max = 30000) => String(value ?? '').trim().slice(0, max);
const sha = (value) => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function rel(state, id) { return `${BASE}/${state}/${id}.json`; }
function ensureDirs(root) {
  ensureControlLayout(root);
  for (const state of STATES) fs.mkdirSync(resolveControlPath(`${BASE}/${state}`, root), { recursive: true, mode: 0o700 });
}
function intakeActive(root) {
  const intake = readJson(INTAKE_REL, null, root);
  if (!intake) return false;
  const age = Date.now() - Date.parse(intake.started_at || '');
  if (Number.isFinite(age) && age > 60_000) {
    try { fs.unlinkSync(resolveControlPath(INTAKE_REL, root)); } catch {}
    return false;
  }
  return true;
}
function listState(state, root) {
  ensureDirs(root);
  const dir = resolveControlPath(`${BASE}/${state}`, root);
  return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); }
    catch { return null; }
  }).filter(Boolean).sort((a, b) => String(a.submitted_at || '').localeCompare(String(b.submitted_at || '')));
}

function activeProcessingJobs(root) {
  const dir = resolveControlPath('work-queue/processing', root);
  try {
    return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => {
      try {
        const job = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
        return { packet_id: job.job_id || name.replace(/\.json$/, ''), instruction: clean(job.instruction, 12000), claimed_at: job.claimed_at ?? null };
      } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function scopeTags(text) {
  const value = clean(text, 12000).toLowerCase();
  const tags = [];
  const add = (tag, pattern) => { if (pattern.test(value)) tags.push(tag); };
  add('UI_UX', /\b(ui|ux|screen|layout|design|frontend|visual|benchmark)\b/);
  add('POS', /\b(pos|point of sale|checkout|cart|till)\b/);
  add('WHATSAPP', /\b(whatsapp|message|operator|chat)\b/);
  add('PAYMENTS', /\b(payment|psp|settlement|reconciliation|checkout)\b/);
  add('INFRASTRUCTURE', /\b(oracle|cloudflare|r2|deploy|runtime|service|docker|server)\b/);
  add('DATA', /\b(database|supabase|postgres|redis|schema|migration|catalog)\b/);
  add('TESTING', /\b(test|verify|verification|ci|green|audit)\b/);
  add('DOCUMENTATION', /\b(document|docx|pdf|truth|architecture|plan|spec)\b/);
  add('ORCHESTRATION', /\b(hermes|codex|claude|xkiro|orchestrat|agent|queue|mission)\b/);
  add('SECURITY', /\b(security|credential|secret|auth|permission|policy)\b/);
  return [...new Set(tags)].slice(0, 8).length ? [...new Set(tags)].slice(0, 8) : ['GENERAL'];
}

function urgency(text) {
  const value = clean(text, 4000);
  if (/\b(stop now|pause now|urgent stop|abort current|cancel current|emergency)\b/i.test(value)) return 'URGENT_SAFE_STOP';
  if (/\b(urgent|immediately|right now|asap)\b/i.test(value)) return 'HIGH';
  return 'NORMAL';
}
function explicitReplacement(text) {
  return /\b(ignore|cancel|replace|supersede)\s+(my\s+)?(previous|last)\b|\binstead of (my )?(previous|last)\b/i.test(clean(text, 4000));
}
function nextSequence(root) {
  const current = readJson(`${BASE}/sequence.json`, { value: 0 }, root);
  const value = Number(current.value || 0) + 1;
  writeJsonAtomic(`${BASE}/sequence.json`, { value, updated_at: now() }, root);
  return value;
}

function patchSteer(record, state, patch, root) {
  const next = { ...record, ...patch, state: state.toUpperCase(), updated_at: now() };
  writeJsonAtomic(rel(state, record.steer_id), next, root);
  return next;
}

function moveSteer(record, from, to, patch, root) {
  const next = patchSteer(record, to, patch, root);
  try { fs.unlinkSync(resolveControlPath(rel(from, record.steer_id), root)); } catch {}
  return next;
}

function overlap(a = [], b = []) {
  const bb = new Set(b);
  return a.some((tag) => bb.has(tag) && tag !== 'GENERAL');
}

function publicAdvisoryEnvelope({ instruction, activeJobs, mission, attachmentCount = 0 }) {
  const steerTags = scopeTags(instruction);
  const activeTags = [...new Set(activeJobs.flatMap((job) => scopeTags(job.instruction)))].slice(0, 8);
  return {
    source_id: 'owner-steer-metadata',
    message_kind: 'OWNER_STEER', urgency: urgency(instruction),
    mission_state: mission?.state || 'UNKNOWN', active_writer_count: activeJobs.length,
    steer_scope_tags: steerTags, active_scope_tags: activeTags,
    scope_overlap: overlap(steerTags, activeTags), attachment_count: Number(attachmentCount || 0),
  };
}
function submitXKiroAdvisory(record, root) {
  try {
    const result = submitAuxiliaryTask({
      project: 'dial', taskArchetype: 'CLASSIFY',
      purpose: 'Classify the safest execution timing for this owner steer using only the admitted coarse metadata. Produce non-authoritative evidence about whether to execute now, wait for the current writer safe boundary, or flag likely overlap. Do not authorize repository actions.',
      evidence: record.public_advisory_metadata,
      evidenceRefs: ['owner-steer-metadata'], dataClass: 'PUBLIC', risk: 'LOW',
      requiredCapabilities: { reasoning: false, tools: false }, diversity: 'S1',
      maxInputTokens: 4096, maxOutputTokens: 1200, deadlineClass: 'INTERACTIVE',
      maxAttempts: 2, cacheable: false, priority: 'HIGH',
    }, { root, expectedProject: 'dial' });
    return result.task.task_id;
  } catch (error) {
    appendJsonl('events/owner-steering.jsonl', { event: 'OWNER_STEER_XKIRO_ADVISORY_SKIPPED', steer_id: record.steer_id, reason_sha256: sha(clean(error?.message || error, 1000)), at: now() }, root);
    return null;
  }
}

function xkiroAdvisory(record, root) {
  if (!record?.xkiro_advisory_task_id) return { state: 'NOT_REQUESTED', summary: null };
  const projection = haifTaskProjection(record.xkiro_advisory_task_id, root);
  if (!projection) return { state: 'MISSING', summary: null };
  if (projection.state !== 'COMPLETED') return { state: projection.state, summary: null };
  const packets = projection.evidence?.packets || [];
  const claims = packets.flatMap((packet) => packet.claims || []).map((claim) => clean(claim.claim, 600)).filter(Boolean).slice(0, 4);
  return { state: 'COMPLETED', summary: claims.join(' | ') || null, task_id: projection.task_id };
}

async function waitForXKiroAdvisory(record, root, waitMs = ADVISORY_WAIT_MS) {
  let advisory = xkiroAdvisory(record, root);
  const started = Date.now();
  if (!record?.xkiro_advisory_task_id || waitMs <= 0) return { ...advisory, waited_ms: 0, timed_out: false };
  while (['QUEUED', 'RUNNING'].includes(advisory.state) && Date.now() - started < waitMs) {
    await sleep(Math.min(500, Math.max(100, waitMs - (Date.now() - started))));
    advisory = xkiroAdvisory(record, root);
  }
  const waited = Date.now() - started;
  return { ...advisory, waited_ms: waited, timed_out: ['QUEUED', 'RUNNING'].includes(advisory.state) };
}

function writeSummary(root) {
  const pending = listState('pending', root);
  const active = listState('active', root);
  const intake = intakeActive(root);
  const summary = { schema_version: 1, blocking_autonomous: intake || pending.length > 0 || active.length > 0, intake_active: intake, pending_count: pending.length, active_count: active.length, next_steer_id: pending[0]?.steer_id ?? null, active_steer_id: active[0]?.steer_id ?? null, observed_at: now() };
  writeJsonAtomic(SUMMARY_REL, summary, root);
  return summary;
}
export function ownerSteeringStatus(root) {
  ensureDirs(root);
  return { ...writeSummary(root), heartbeat: readJson(HEARTBEAT_REL, null, root) };
}

export function ownerSteeringBlocksAutonomous(root) {
  if (intakeActive(root)) return true;
  const summary = readJson(SUMMARY_REL, null, root);
  if (summary?.blocking_autonomous === true) return true;
  return listState('pending', root).length > 0 || listState('active', root).length > 0;
}

function supersedeLatestPending(reason, root) {
  const pending = listState('pending', root);
  const latest = pending.at(-1);
  if (!latest) return null;
  const moved = moveSteer(latest, 'pending', 'superseded', { superseded_at: now(), superseded_reason: clean(reason, 600) }, root);
  appendJsonl('events/owner-steering.jsonl', { event: 'OWNER_STEER_SUPERSEDED', steer_id: latest.steer_id, sequence: latest.sequence, at: moved.superseded_at }, root);
  return moved;
}

function acknowledgement(record) {
  const active = record.active_writer_count;
  const base = active > 0
    ? `Owner steer ${record.sequence} registered. DIAL currently has ${active} repository-writing packet${active === 1 ? '' : 's'} active. I will let the current work reach its safe boundary, block any new autonomous packet from starting, then apply your steer next.`
    : `Owner steer ${record.sequence} registered. No repository-writing packet is active, so your steer is next for execution before autonomous development continues.`;
  const urgencyText = record.urgency === 'URGENT_SAFE_STOP'
    ? ' You requested an urgent stop; DIAL will hold all subsequent autonomous work and apply the steer at the earliest safe repository boundary rather than killing a writer mid-mutation.'
    : '';
  const xkiroText = record.xkiro_advisory_task_id
    ? ' xKiro is concurrently analysing coarse non-sensitive steering metadata as a non-authoritative advisory; it cannot override your direction or repository truth.'
    : ' xKiro advisory was not admitted, so Hermes will use deterministic steering policy without weakening data-governance boundaries.';
  return clean(`${base}${urgencyText}${xkiroText}`, MAX_ACK);
}
export function submitOwnerSteer({ instruction, requestedBy = 'owner', requestId = null, ownerProvenance = null, root, attachmentCount = 0 } = {}) {
  const text = clean(instruction);
  if (!text) throw new Error('owner steer instruction is required');
  ensureDirs(root);
  const intakeId = `intake-${crypto.randomUUID()}`;
  writeJsonAtomic(INTAKE_REL, { schema_version: 1, intake_id: intakeId, pid: process.pid, started_at: now() }, root);
  try {
    if (explicitReplacement(text)) supersedeLatestPending('explicit owner replacement/correction', root);
    const activeJobs = activeProcessingJobs(root);
    const mission = missionStatus(root);
    const steerId = `steer-${crypto.randomUUID()}`;
    const record = {
      schema_version: 1, steer_id: steerId, sequence: nextSequence(root), project: 'dial',
      state: 'PENDING', phase: 'REGISTERED', instruction: text, instruction_sha256: sha(text),
      requested_by: clean(requestedBy, 160), request_id: clean(requestId, 160) || null,
      owner_instruction_provenance: ownerProvenance || null,
      urgency: urgency(text), submitted_at: now(), updated_at: now(),
      mission_state_at_submit: mission.state, active_writer_count: activeJobs.length,
      active_packet_ids: activeJobs.map((job) => job.packet_id),
      execution_policy: { queue_class: 'OWNER_STEER', block_new_autonomous: true, wait_for_current_writer_safe_boundary: true, kill_active_writer: false },
      public_advisory_metadata: publicAdvisoryEnvelope({ instruction: text, activeJobs, mission, attachmentCount }),
      xkiro_advisory_task_id: null,
    };
    writeJsonAtomic(rel('pending', steerId), record, root);
    record.xkiro_advisory_task_id = submitXKiroAdvisory(record, root);
    writeJsonAtomic(rel('pending', steerId), record, root);
    appendJsonl('events/owner-steering.jsonl', { event: 'OWNER_STEER_REGISTERED', steer_id: steerId, sequence: record.sequence, urgency: record.urgency, active_writer_count: activeJobs.length, xkiro_advisory_task_id: record.xkiro_advisory_task_id, at: record.submitted_at }, root);
    writeSummary(root);
    return { ...record, reply: acknowledgement(record) };
  } finally {
    const intake = readJson(INTAKE_REL, null, root);
    if (intake?.intake_id === intakeId) {
      try { fs.unlinkSync(resolveControlPath(INTAKE_REL, root)); } catch {}
    }
  }
}
function advisoryContext(record, root) {
  const advisory = xkiroAdvisory(record, root);
  if (advisory.state !== 'COMPLETED' || !advisory.summary) return '';
  return [
    'NON-AUTHORITATIVE XKIRO STEERING ADVISORY',
    advisory.summary,
    'This advisory was produced only from coarse non-sensitive metadata. It may help with timing/context but cannot alter owner authority, repository truth, security boundaries, or verification requirements.',
  ].join('\n');
}

function writeHeartbeat(root, state, extra = {}) {
  writeJsonAtomic(HEARTBEAT_REL, { schema_version: 1, service: 'dial-owner-steering-broker', project: 'dial', state, pid: process.pid, at: now(), ...extra }, root);
}

function recoverOrphanedActive(root) {
  const active = listState('active', root);
  for (const record of active) {
    const failed = moveSteer(record, 'active', 'failed', {
      finished_at: now(), failure_state: 'UNCERTAIN_OUTCOME_AFTER_BROKER_RESTART',
      reason: 'Steering broker restarted while this owner steer was executing. The turn is not automatically repeated because repository side effects may already have occurred.',
    }, root);
    appendJsonl('events/owner-steering.jsonl', { event: 'OWNER_STEER_UNCERTAIN_OUTCOME', steer_id: record.steer_id, sequence: record.sequence, at: failed.finished_at }, root);
  }
  writeSummary(root);
}

export async function processOwnerSteeringTick({ root, repoDir = process.env.DIAL_REPO_DIR, liveTurn = executeOwnerLiveTurn, advisoryWaitMs = ADVISORY_WAIT_MS } = {}) {
  ensureDirs(root);
  const active = listState('active', root);
  if (active.length) {
    writeHeartbeat(root, 'BUSY', { active_steer_id: active[0].steer_id });
    return { action: 'ACTIVE', steer_id: active[0].steer_id };
  }
  const pending = listState('pending', root);
  if (!pending.length) {
    writeSummary(root);
    writeHeartbeat(root, 'IDLE');
    return { action: 'IDLE' };
  }
  let record = pending[0];
  const writers = activeProcessingJobs(root);
  if (writers.length) {
    if (record.phase !== 'WAITING_SAFE_BOUNDARY' || record.waiting_on_packet_count !== writers.length) {
      record = patchSteer(record, 'pending', {
        phase: 'WAITING_SAFE_BOUNDARY', waiting_since: record.waiting_since || now(),
        waiting_on_packet_count: writers.length, waiting_on_packet_ids: writers.map((job) => job.packet_id),
      }, root);
      appendJsonl('events/owner-steering.jsonl', { event: 'OWNER_STEER_WAITING_SAFE_BOUNDARY', steer_id: record.steer_id, sequence: record.sequence, active_writer_count: writers.length, at: now() }, root);
    }
    writeSummary(root);
    writeHeartbeat(root, 'WAITING_SAFE_BOUNDARY', { next_steer_id: record.steer_id, active_writer_count: writers.length });
    return { action: 'WAITING_SAFE_BOUNDARY', steer_id: record.steer_id, active_writer_count: writers.length };
  }

  let advisoryState = xkiroAdvisory(record, root);
  if (record.xkiro_advisory_task_id && ['QUEUED', 'RUNNING'].includes(advisoryState.state) && advisoryWaitMs > 0) {
    record = patchSteer(record, 'pending', { phase: 'WAITING_XKIRO_ADVISORY', xkiro_advisory_wait_started_at: now() }, root);
    writeSummary(root);
    writeHeartbeat(root, 'WAITING_XKIRO_ADVISORY', { next_steer_id: record.steer_id, xkiro_advisory_task_id: record.xkiro_advisory_task_id });
    advisoryState = await waitForXKiroAdvisory(record, root, advisoryWaitMs);
    appendJsonl('events/owner-steering.jsonl', {
      event: advisoryState.timed_out ? 'OWNER_STEER_XKIRO_ADVISORY_TIMEOUT' : 'OWNER_STEER_XKIRO_ADVISORY_READY',
      steer_id: record.steer_id, sequence: record.sequence, xkiro_advisory_state: advisoryState.state,
      waited_ms: advisoryState.waited_ms, at: now(),
    }, root);
  }
  const currentPending = readJson(rel('pending', record.steer_id), null, root);
  if (!currentPending) {
    writeSummary(root);
    return { action: 'SUPERSEDED_OR_MOVED', steer_id: record.steer_id };
  }
  record = moveSteer(currentPending, 'pending', 'active', {
    phase: 'EXECUTING', executing_at: now(), waiting_on_packet_count: 0, waiting_on_packet_ids: [],
    xkiro_advisory_state_at_execution: advisoryState.state, xkiro_advisory_wait_ms: advisoryState.waited_ms || 0,
  }, root);
  writeSummary(root);
  appendJsonl('events/owner-steering.jsonl', { event: 'OWNER_STEER_EXECUTION_STARTED', steer_id: record.steer_id, sequence: record.sequence, xkiro_advisory_state: advisoryState.state, at: record.executing_at }, root);
  writeHeartbeat(root, 'EXECUTING', { active_steer_id: record.steer_id });

  const advisory = advisoryContext(record, root);
  const live = await liveTurn({
    instruction: record.instruction,
    advisoryContext: advisory,
    priorityDirective: record.instruction,
    mode: 'instruction', root, repoDir,
    requestedBy: record.requested_by, requestId: record.request_id || record.steer_id,
    ownerProvenance: record.owner_instruction_provenance || null,
  });
  const success = live.state === 'COMPLETED';
  const destination = success ? 'completed' : 'failed';
  const final = moveSteer(record, 'active', destination, {
    phase: success ? 'COMPLETED' : 'FAILED', finished_at: now(),
    runtime: live.runtime ?? null, resolved_model: live.resolved_model ?? null,
    fallback_used: Boolean(live.fallback_used), response: clean(live.response, 12000),
    failure_state: success ? null : (live.failure_state || 'OWNER_STEER_FAILED'),
    xkiro_advisory: xkiroAdvisory(record, root),
  }, root);
  appendJsonl('events/owner-steering.jsonl', {
    event: success ? 'OWNER_STEER_COMPLETED' : 'OWNER_STEER_FAILED',
    steer_id: record.steer_id, sequence: record.sequence,
    runtime: final.runtime, resolved_model: final.resolved_model,
    response_preview: success ? clean(final.response, 900) : null,
    failure_state: final.failure_state, at: final.finished_at,
  }, root);
  writeSummary(root);
  writeHeartbeat(root, success ? 'READY' : 'DEGRADED', { last_steer_id: record.steer_id, last_steer_state: final.state });
  return { action: final.state, steer: final };
}

export async function runOwnerSteeringDaemon({ root, repoDir = process.env.DIAL_REPO_DIR, pollMs = POLL_MS } = {}) {
  ensureDirs(root);
  recoverOrphanedActive(root);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  writeHeartbeat(root, 'STARTING');
  while (!stopping) {
    try { await processOwnerSteeringTick({ root, repoDir }); }
    catch (error) {
      appendJsonl('events/owner-steering.jsonl', { event: 'OWNER_STEERING_BROKER_ERROR', reason_sha256: sha(clean(error?.message || error, 2000)), at: now() }, root);
      writeHeartbeat(root, 'DEGRADED', { reason: clean(error?.message || error, 1200) });
    }
    await sleep(pollMs);
  }
  writeHeartbeat(root, 'STOPPED');
}
async function main() {
  const command = process.argv[2] || 'status';
  const root = process.env.DIAL_CONTROL_HOME;
  if (command === 'status') return console.log(JSON.stringify(ownerSteeringStatus(root), null, 2));
  if (command === 'tick') return console.log(JSON.stringify(await processOwnerSteeringTick({ root, repoDir: process.env.DIAL_REPO_DIR }), null, 2));
  if (command === 'daemon') return runOwnerSteeringDaemon({ root, repoDir: process.env.DIAL_REPO_DIR });
  if (command === 'submit') {
    const instruction = process.argv.slice(3).join(' ').trim();
    return console.log(JSON.stringify(submitOwnerSteer({ instruction, requestedBy: process.env.USER || 'owner', root }), null, 2));
  }
  throw new Error(`unknown owner-steering command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
}
