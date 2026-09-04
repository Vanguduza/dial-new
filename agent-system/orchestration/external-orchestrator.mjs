#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeHermesInstruction } from './hermes-runtime-executor.mjs';
import {
  appendJsonl,
  ensureControlLayout,
  readJson,
  resolveControlPath,
  writeJsonAtomic,
} from './state-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const DEFAULT_POLL_MS = 2000;
const ORIGIN = 'EXTERNAL_ORACLE_ORCHESTRATOR';

function now() { return new Date().toISOString(); }
function queueRel(state, id) { return `work-queue/${state}/${id}.json`; }
function heartbeat(root, extra = {}) {
  return writeJsonAtomic('state/external-orchestrator-heartbeat.json', {
    schema_version: 1,
    service: 'dial-hermes-orchestrator',
    execution_origin: ORIGIN,
    pid: process.pid,
    observed_at: now(),
    ...extra,
  }, root);
}

export function submitExternalWork({ instruction, requestedBy = 'operator', metadata = {}, root } = {}) {
  const text = String(instruction ?? '').trim();
  if (!text) throw new Error('instruction is required');
  ensureControlLayout(root);
  const id = crypto.randomUUID();
  const job = {
    schema_version: 1,
    job_id: id,
    execution_origin: ORIGIN,
    state: 'QUEUED',
    instruction: text,
    requested_by: requestedBy,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    queued_at: now(),
  };
  writeJsonAtomic(queueRel('inbox', id), job, root);
  appendJsonl('events/external-orchestrator.jsonl', {
    event: 'EXTERNAL_WORK_QUEUED',
    job_id: id,
    execution_origin: ORIGIN,
    requested_by: requestedBy,
    at: job.queued_at,
  }, root);
  return job;
}

function listInbox(root) {
  ensureControlLayout(root);
  const dir = resolveControlPath('work-queue/inbox', root);
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

function claimNext(root) {
  for (const name of listInbox(root)) {
    const source = resolveControlPath(`work-queue/inbox/${name}`, root);
    const target = resolveControlPath(`work-queue/processing/${name}`, root);
    try {
      fs.renameSync(source, target);
      const job = JSON.parse(fs.readFileSync(target, 'utf8'));
      const claimed = {
        ...job,
        state: 'PROCESSING',
        claimed_at: now(),
        worker_pid: process.pid,
      };
      fs.writeFileSync(target, `${JSON.stringify(claimed, null, 2)}\n`, { mode: 0o600 });
      return claimed;
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
  }
  return null;
}

function finalizeJob(job, result, root) {
  const completed = result?.event === 'HERMES_OPERATIONAL_TURN_COMPLETED';
  const finalState = completed ? 'completed' : 'failed';
  const record = {
    ...job,
    state: completed ? 'COMPLETED' : 'FAILED',
    execution_origin: ORIGIN,
    finished_at: now(),
    result,
    runtime_provenance: {
      policy: result?.policy ?? 'LOCKED_SOL_THEN_SONNET',
      runtime: result?.runtime ?? null,
      requested_model: result?.requested_model ?? null,
      resolved_model: result?.resolved_model ?? null,
      fallback_used: Boolean(result?.fallback_used),
    },
  };
  writeJsonAtomic(queueRel(finalState, job.job_id), record, root);
  try { fs.unlinkSync(resolveControlPath(queueRel('processing', job.job_id), root)); } catch {}
  appendJsonl('events/external-orchestrator.jsonl', {
    event: completed ? 'EXTERNAL_WORK_COMPLETED' : 'EXTERNAL_WORK_FAILED',
    job_id: job.job_id,
    execution_origin: ORIGIN,
    runtime: record.runtime_provenance.runtime,
    requested_model: record.runtime_provenance.requested_model,
    resolved_model: record.runtime_provenance.resolved_model,
    fallback_used: record.runtime_provenance.fallback_used,
    at: record.finished_at,
  }, root);
  heartbeat(root, { last_job_id: job.job_id, last_job_state: record.state });
  return record;
}

export async function processNextExternalWork({
  repoDir = DEFAULT_REPO,
  root,
  executor = executeHermesInstruction,
} = {}) {
  const job = claimNext(root);
  if (!job) {
    heartbeat(root, { queue_state: 'IDLE' });
    return null;
  }

  heartbeat(root, { queue_state: 'BUSY', active_job_id: job.job_id });
  appendJsonl('events/external-orchestrator.jsonl', {
    event: 'EXTERNAL_WORK_STARTED',
    job_id: job.job_id,
    execution_origin: ORIGIN,
    worker_pid: process.pid,
    at: now(),
  }, root);

  let result;
  try {
    result = await executor({
      repoDir,
      root,
      instruction: job.instruction,
    });
  } catch (error) {
    result = {
      event: 'HERMES_OPERATIONAL_TURN_FAILED',
      authority: 'HERMES_RUNTIME_ONLY',
      policy: 'LOCKED_SOL_THEN_SONNET',
      runtime: null,
      requested_model: null,
      resolved_model: null,
      fallback_used: false,
      failure_state: 'ORCHESTRATOR_EXECUTION_ERROR',
      reason: String(error?.message || error).slice(0, 4000),
    };
  }
  return finalizeJob(job, result, root);
}

export function externalWorkStatus(jobId, root) {
  if (!jobId) {
    return {
      heartbeat: readJson('state/external-orchestrator-heartbeat.json', null, root),
      queued: listInbox(root).length,
    };
  }
  for (const state of ['completed', 'failed', 'processing', 'inbox']) {
    const found = readJson(queueRel(state, jobId), null, root);
    if (found) return found;
  }
  return null;
}

export async function runExternalOrchestratorDaemon({
  repoDir = DEFAULT_REPO,
  root,
  pollMs = Number(process.env.DIAL_EXTERNAL_ORCHESTRATOR_POLL_MS || DEFAULT_POLL_MS),
} = {}) {
  ensureControlLayout(root);
  heartbeat(root, { service_state: 'STARTING' });
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  while (!stopping) {
    const processed = await processNextExternalWork({ repoDir, root });
    if (!processed) await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  heartbeat(root, { service_state: 'STOPPED' });
}

function argValue(name) {
  const args = process.argv.slice(3);
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

async function main() {
  const command = process.argv[2] || 'status';
  const repoDir = process.env.DIAL_REPO_DIR || DEFAULT_REPO;
  if (command === 'submit') {
    const instruction = process.argv.slice(3).filter((value, index, all) => {
      const requestedIndex = all.indexOf('--requested-by');
      return requestedIndex < 0 || (index !== requestedIndex && index !== requestedIndex + 1);
    }).join(' ').trim();
    return console.log(JSON.stringify(submitExternalWork({
      instruction,
      requestedBy: argValue('--requested-by') || process.env.USER || 'operator',
    }), null, 2));
  }
  if (command === 'run-once') {
    return console.log(JSON.stringify(await processNextExternalWork({ repoDir }), null, 2));
  }
  if (command === 'status') {
    const jobId = process.argv[3] || null;
    return console.log(JSON.stringify(externalWorkStatus(jobId), null, 2));
  }
  if (command === 'daemon') return runExternalOrchestratorDaemon({ repoDir });
  throw new Error(`unknown external orchestrator command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
