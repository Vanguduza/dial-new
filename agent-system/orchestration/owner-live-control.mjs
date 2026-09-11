#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { executeHermesInstruction } from './hermes-runtime-executor.mjs';
import { resolvePacketEngineeringKnowledge } from './engineering-knowledge-broker.mjs';
import { activationSummary } from './skill-activation-store.mjs';
import { ensureDialMission, missionStatus, recordDialOwnerAuthorityRoot, setDialMissionPriority } from './mission-control.mjs';
import { supersedeActiveExecutionTasks } from './task-execution-envelope.mjs';
import { appendJsonl, ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';

const OWNER_LIVE_REL = 'state/owner-live-interrupt.json';
const TURN_DIR = 'operator-live/turns';
const MAX_WAIT_MS = 30 * 60 * 1000;
const POLL_MS = 500;

const now = () => new Date().toISOString();
const clean = (v, max = 30000) => String(v ?? '').trim().slice(0, max);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest('hex');

function ownerTurnRel(id) { return `${TURN_DIR}/${id}.json`; }
function questionLike(text) {
  const t = clean(text, 4000).toLowerCase();
  return /\?$/.test(t) || /^(what|why|how|when|where|which|who|is|are|was|were|do|does|did|can|could|should|would|have|has|tell me|show me|explain|summari[sz]e)\b/.test(t);
}

export function classifyOwnerLiveMode(text, explicit = null) {
  if (explicit === 'query' || explicit === 'instruction') return explicit;
  return questionLike(text) ? 'query' : 'instruction';
}
function processAlive(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 1) return false;
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

function claimOwnerInterrupt(turnId, root) {
  ensureControlLayout(root);
  const target = resolveControlPath(OWNER_LIVE_REL, root);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const record = { schema_version: 1, turn_id: turnId, pid: process.pid, state: 'OWNER_LIVE_REQUESTED', requested_at: now() };
  try {
    const fd = fs.openSync(target, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(record, null, 2)}\n`);
    fs.closeSync(fd);
    return record;
  } catch (err) {
    if (err?.code !== 'EEXIST') throw err;
    const existing = readJson(OWNER_LIVE_REL, null, root);
    const stale = !processAlive(existing?.pid) || (Date.now() - Date.parse(existing?.requested_at || 0) > MAX_WAIT_MS);
    if (!stale) throw new Error(`another owner live turn is active: ${existing?.turn_id || 'unknown'}`);
    try { fs.unlinkSync(target); } catch {}
    return claimOwnerInterrupt(turnId, root);
  }
}

function releaseOwnerInterrupt(turnId, root) {
  const target = resolveControlPath(OWNER_LIVE_REL, root);
  const current = readJson(OWNER_LIVE_REL, null, root);
  if (current?.turn_id === turnId) {
    try { fs.unlinkSync(target); } catch {}
  }
}

function activeProcessingJobs(root) {
  const dir = resolveControlPath('work-queue/processing', root);
  try {
    return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).filter((name) => {
      try {
        const job = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
        return job?.worker_pid ? processAlive(job.worker_pid) : true;
      } catch { return true; }
    });
  } catch { return []; }
}
async function waitForSafeBoundary(turnId, root) {
  const started = Date.now();
  let notified = false;
  while (true) {
    const active = activeProcessingJobs(root);
    if (!active.length) return { waited_ms: Date.now() - started, prior_active_jobs: 0 };
    if (!notified) {
      appendJsonl('events/owner-live.jsonl', { event: 'OWNER_LIVE_WAITING_SAFE_BOUNDARY', turn_id: turnId, active_jobs: active.length, at: now() }, root);
      notified = true;
    }
    if (Date.now() - started > MAX_WAIT_MS) throw new Error('owner live turn timed out waiting for the current repository-writing packet to reach a safe boundary');
    await sleep(POLL_MS);
  }
}

function ownerPrompt({ instruction, mode, mission, advisoryContext = '' }) {
  const authority = [
    'DIAL OWNER LIVE TURN',
    'This input is a current explicit instruction from the DIAL product owner and must be treated with the same immediacy as an interactive owner turn in Claude/Codex.',
    'The owner may amend prior DIAL product/architecture decisions. If this instruction conflicts with stale repository plan text, reconcile the repository source of truth to the new owner direction rather than silently following the stale text.',
    'External law, security boundaries, credential boundaries, truthful evidence requirements, and explicit safety constraints are not waived.',
    'Inspect the actual current DIAL repository state before answering or changing anything. Never use unrelated projects as authority.',
  ];
  if (mode === 'query') {
    authority.push('This is a QUESTION/READ turn. Answer from live repository/control-plane evidence. Do not modify files, commit, push, change mission state, or start implementation unless the owner explicitly asks for an action.');
  } else {
    authority.push('This is an ACTION turn. Begin the requested work now. Do not defer it into the autonomous mission queue. Make repository changes directly when required, verify them, and reconcile durable owner decisions into canonical Project Truth.');
    authority.push('Preserve unrelated work. Do not reset, clean, force-push, fabricate evidence, or bypass deterministic verification just to report green.');
  }
  authority.push('', `CURRENT MISSION STATE: ${mission?.state || 'UNKNOWN'}`);
  if (mission?.owner_blocker?.reason) authority.push(`CURRENT OWNER BLOCKER: ${clean(mission.owner_blocker.reason, 2000)}`);
  if (advisoryContext) authority.push('', clean(advisoryContext, 6000));
  authority.push('', 'OWNER INPUT', instruction);
  return authority.join('\n');
}
export function ownerLiveInterruptActive(root) {
  const value = readJson(OWNER_LIVE_REL, null, root);
  if (!value) return null;
  if (!processAlive(value.pid)) {
    try { fs.unlinkSync(resolveControlPath(OWNER_LIVE_REL, root)); } catch {}
    return null;
  }
  return value;
}

export async function executeOwnerLiveTurn({ instruction, mode = null, advisoryContext = '', priorityDirective = null, root, repoDir, requestedBy = 'owner', requestId = null, ownerProvenance = null, executor = executeHermesInstruction, knowledgeResolver = resolvePacketEngineeringKnowledge } = {}) {
  const text = clean(instruction);
  if (!text) throw new Error('owner live instruction is required');
  ensureControlLayout(root);
  const mission = ensureDialMission({ root, repoDir });
  const turnMode = classifyOwnerLiveMode(text, mode);
  const turnId = `owner-${crypto.randomUUID()}`;
  const recordBase = {
    schema_version: 1,
    turn_id: turnId,
    project: 'dial',
    state: 'STARTING',
    mode: turnMode,
    requested_by: clean(requestedBy, 160),
    request_id: clean(requestId, 160) || null,
    instruction: text,
    instruction_sha256: sha(text),
    owner_instruction_provenance: ownerProvenance || null,
    started_at: now(),
  };
  writeJsonAtomic(ownerTurnRel(turnId), recordBase, root);
  appendJsonl('events/owner-live.jsonl', { event: 'OWNER_LIVE_TURN_REQUESTED', turn_id: turnId, mode: turnMode, requested_by: recordBase.requested_by, at: recordBase.started_at }, root);
  const serializesRepositoryWrites = turnMode === 'instruction';
  if (serializesRepositoryWrites) claimOwnerInterrupt(turnId, root);

  try {
    const wait = serializesRepositoryWrites ? await waitForSafeBoundary(turnId, root) : { waited_ms: 0, prior_active_jobs: activeProcessingJobs(root).length };
    const before = missionStatus(root);
    let adaptiveSuperseded = [];
    if (turnMode === 'instruction') {
      if (ownerProvenance?.authority && ownerProvenance.authority !== 'NO_AUTHORITY') {
        adaptiveSuperseded = supersedeActiveExecutionTasks({ root, reason: `OWNER_STEER:${ownerProvenance.instruction_sha256 || sha(text)}` });
        recordDialOwnerAuthorityRoot({ root, provenance: ownerProvenance, sourceJobId: turnId });
      }
      setDialMissionPriority({ root, directive: clean(priorityDirective || text, 4000) });
    }
    const prompt = ownerPrompt({ instruction: text, mode: turnMode, mission: before, advisoryContext });
    let activation = null;
    if (turnMode === 'instruction') {
      activation = knowledgeResolver({ repoDir: repoDir || before.repo_dir, root, packetId: turnId, instruction: prompt, metadata: { owner_live: true, mode: turnMode } });
      if (activation?.execution_allowed === false) throw new Error(`owner live VEKL activation blocked: ${(activation.missing_mandatory_task_classes || []).join(', ')}`);
    }
    const executing = { ...recordBase, state: 'EXECUTING', safe_boundary_wait_ms: wait.waited_ms, engineering_knowledge: activationSummary(activation), executing_at: now() };
    writeJsonAtomic(ownerTurnRel(turnId), executing, root);
    appendJsonl('events/owner-live.jsonl', { event: 'OWNER_LIVE_TURN_STARTED', turn_id: turnId, mode: turnMode, safe_boundary_wait_ms: wait.waited_ms, at: executing.executing_at }, root);

    const result = await executor({
      repoDir: repoDir || before.repo_dir,
      root,
      instruction: prompt,
      packetId: turnId,
      skillActivation: activation,
    });
    const ok = result?.event === 'HERMES_OPERATIONAL_TURN_COMPLETED';
    const completed = {
      ...executing,
      state: ok ? 'COMPLETED' : 'FAILED',
      finished_at: now(),
      runtime: result?.runtime ?? null,
      resolved_model: result?.resolved_model ?? null,
      fallback_used: Boolean(result?.fallback_used),
      response: clean(result?.response || result?.reason || '', 12000),
      failure_state: ok ? null : (result?.failure_state || 'OWNER_LIVE_FAILED'),
      adaptive_execution_superseded_tasks: adaptiveSuperseded.map((item) => item.task_id),
    };
    writeJsonAtomic(ownerTurnRel(turnId), completed, root);
    appendJsonl('events/owner-live.jsonl', { event: ok ? 'OWNER_LIVE_TURN_COMPLETED' : 'OWNER_LIVE_TURN_FAILED', turn_id: turnId, mode: turnMode, runtime: completed.runtime, resolved_model: completed.resolved_model, failure_state: completed.failure_state, at: completed.finished_at }, root);
    return completed;
  } catch (error) {
    const failed = { ...recordBase, state: 'FAILED', failure_state: 'OWNER_LIVE_CONTROL_ERROR', reason: clean(error?.message || error, 4000), finished_at: now() };
    writeJsonAtomic(ownerTurnRel(turnId), failed, root);
    appendJsonl('events/owner-live.jsonl', { event: 'OWNER_LIVE_TURN_FAILED', turn_id: turnId, mode: turnMode, failure_state: failed.failure_state, reason_sha256: sha(failed.reason), at: failed.finished_at }, root);
    return failed;
  } finally {
    if (serializesRepositoryWrites) releaseOwnerInterrupt(turnId, root);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const instruction = process.argv.slice(2).join(' ').trim();
  executeOwnerLiveTurn({ instruction, root: process.env.DIAL_CONTROL_HOME, repoDir: process.env.DIAL_REPO_DIR, requestedBy: process.env.USER || 'owner' })
    .then((value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`))
    .catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
}
