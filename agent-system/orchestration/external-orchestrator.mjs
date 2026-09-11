#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevelopmentUnblocked } from './development-unblock.mjs';
import { missionExecutionAllowed } from './mission-control.mjs';
import { executeHermesInstruction } from './hermes-runtime-executor.mjs';
import { ownerLiveInterruptActive } from './owner-live-control.mjs';
import { ownerSteeringBlocksAutonomous } from './owner-steering-broker.mjs';
import { ensurePacketEngineeringKnowledge, resolvePacketEngineeringKnowledge } from './engineering-knowledge-broker.mjs';
import { activationSummary, loadSkillActivationForPacket } from './skill-activation-store.mjs';
import { recordSkillOutcome } from './skill-outcome-recorder.mjs';
import { assertFreshKnowledgeBinding } from './knowledge-admission-guard.mjs';
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
export const QUALIFICATION_CANARY_INSTRUCTION = 'Reply with exactly DIAL_EXTERNAL_ORCHESTRATOR_OK. Do not modify files and do not use tools.';

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

function validateQualificationCanary({ instruction, requestedBy, metadata }) {
  const requested = metadata?.qualification_canary === true;
  if (!requested) return false;
  if (requestedBy !== 'qualification') {
    throw new Error('qualification canary requires requestedBy=qualification');
  }
  if (instruction !== QUALIFICATION_CANARY_INSTRUCTION) {
    throw new Error('qualification canary instruction is fixed and may not be changed');
  }
  return true;
}

export function submitExternalWork({ instruction, requestedBy = 'operator', metadata = {}, root, repoDir = process.env.DIAL_REPO_DIR || DEFAULT_REPO, engineeringKnowledgeResolver = resolvePacketEngineeringKnowledge } = {}) {
  const text = String(instruction ?? '').trim();
  if (!text) throw new Error('instruction is required');
  const safeMetadata = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  validateQualificationCanary({ instruction: text, requestedBy, metadata: safeMetadata });
  ensureControlLayout(root);
  const id = crypto.randomUUID();
  let skillActivation = null;
  let engineeringKnowledge;
  if (safeMetadata?.qualification_canary === true) {
    engineeringKnowledge = { policy_version: 'vekl-1.0', activation_id: null, resolution_state: 'NOT_APPLICABLE_QUALIFICATION_CANARY', selected_skills: [] };
  } else {
    skillActivation = engineeringKnowledgeResolver({ repoDir, root, packetId: id, instruction: text, metadata: safeMetadata });
    engineeringKnowledge = activationSummary(skillActivation);
  }
  const job = {
    schema_version: 2,
    job_id: id,
    execution_origin: ORIGIN,
    state: 'QUEUED',
    instruction: text,
    requested_by: requestedBy,
    metadata: safeMetadata,
    engineering_knowledge: engineeringKnowledge,
    queued_at: now(),
  };
  writeJsonAtomic(queueRel('inbox', id), job, root);
  appendJsonl('events/external-orchestrator.jsonl', {
    event: 'EXTERNAL_WORK_QUEUED',
    job_id: id,
    execution_origin: ORIGIN,
    requested_by: requestedBy,
    qualification_canary: job.metadata?.qualification_canary === true,
    skill_activation_id: job.engineering_knowledge?.activation_id ?? null,
    skill_resolution_state: job.engineering_knowledge?.resolution_state ?? null,
    selected_skills: job.engineering_knowledge?.selected_skills?.map((entry) => entry.skill_id) ?? [],
    selected_resources: job.engineering_knowledge?.selected_resources?.map((entry) => entry.resource_id) ?? [],
    research_forecast_id: job.engineering_knowledge?.research_forecast_id ?? null,
    at: job.queued_at,
  }, root);
  return job;
}

function listInbox(root) {
  ensureControlLayout(root);
  const dir = resolveControlPath('work-queue/inbox', root);
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      try {
        const job = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
        return { name, job };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => {
      const priority = Number(b.job?.metadata?.priority || 0) - Number(a.job?.metadata?.priority || 0);
      if (priority) return priority;
      return String(a.job?.queued_at || '').localeCompare(String(b.job?.queued_at || '')) || a.name.localeCompare(b.name);
    });
}

function claimNext(root) {
  if (ownerLiveInterruptActive(root) || ownerSteeringBlocksAutonomous(root)) return null;
  for (const entry of listInbox(root)) {
    if (!missionExecutionAllowed(entry.job, root)) continue;
    const name = entry.name;
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
  const latestActivation = loadSkillActivationForPacket(job.job_id, root);
  const record = {
    ...job,
    state: completed ? 'COMPLETED' : 'FAILED',
    execution_origin: ORIGIN,
    engineering_knowledge: activationSummary(latestActivation) ?? job.engineering_knowledge ?? null,
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
    skill_activation_id: record.engineering_knowledge?.activation_id ?? null,
    selected_skills: record.engineering_knowledge?.selected_skills?.map((entry) => entry.skill_id) ?? [],
    selected_resources: record.engineering_knowledge?.selected_resources?.map((entry) => entry.resource_id) ?? [],
    research_forecast_id: record.engineering_knowledge?.research_forecast_id ?? null,
    reason: result?.reason ?? null,
    at: record.finished_at,
  }, root);
  if (latestActivation?.activation_id) {
    try {
      recordSkillOutcome({
        activationId: latestActivation.activation_id,
        packetId: job.job_id,
        outcome: completed ? 'GREEN' : (result?.failure_state === 'DEVELOPMENT_BLOCKED' ? 'BLOCKED' : 'RED'),
        skillMetrics: {
          runtime: record.runtime_provenance.runtime,
          fallback_used: record.runtime_provenance.fallback_used,
          usefulness: 'UNASSESSED',
        },
        root,
      });
    } catch (error) {
      appendJsonl('events/engineering-knowledge.jsonl', { event: 'SKILL_OUTCOME_RECORD_FAILED', packet_id: job.job_id, activation_id: latestActivation.activation_id, reason: String(error?.message || error).slice(0, 2000), at: now() }, root);
    }
  }
  heartbeat(root, { last_job_id: job.job_id, last_job_state: record.state });
  return record;
}

function isQualificationCanary(job) {
  return Boolean(
    job?.requested_by === 'qualification'
    && job?.metadata?.qualification_canary === true
    && job?.instruction === QUALIFICATION_CANARY_INSTRUCTION
  );
}

export async function processNextExternalWork({
  repoDir = DEFAULT_REPO,
  root,
  executor = executeHermesInstruction,
  developmentGate = assertDevelopmentUnblocked,
  heartbeatMs = Number(process.env.DIAL_EXTERNAL_ORCHESTRATOR_HEARTBEAT_MS || 30_000),
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
    qualification_canary: isQualificationCanary(job),
    skill_activation_id: job.engineering_knowledge?.activation_id ?? null,
    selected_resources: job.engineering_knowledge?.selected_resources?.map((entry) => entry.resource_id) ?? [],
    research_forecast_id: job.engineering_knowledge?.research_forecast_id ?? null,
    at: now(),
  }, root);

  if (!isQualificationCanary(job)) {
    try {
      developmentGate({ repoDir, root });
    } catch (error) {
      return finalizeJob(job, {
        event: 'HERMES_OPERATIONAL_TURN_FAILED',
        authority: 'HERMES_RUNTIME_ONLY',
        policy: 'LOCKED_SOL_THEN_SONNET',
        runtime: null,
        requested_model: null,
        resolved_model: null,
        fallback_used: false,
        failure_state: 'DEVELOPMENT_BLOCKED',
        reason: String(error?.message || error).slice(0, 4000),
      }, root);
    }
  } else {
    appendJsonl('events/external-orchestrator.jsonl', {
      event: 'QUALIFICATION_CANARY_GATE_BYPASS',
      job_id: job.job_id,
      reason: 'fixed read-only/no-tools qualification canary proves external execution before PRODUCTION_GREEN can exist',
      at: now(),
    }, root);
  }

  const heartbeatPulse = setInterval(
    () => heartbeat(root, { queue_state: 'BUSY', active_job_id: job.job_id }),
    Math.max(10, heartbeatMs),
  );
  heartbeatPulse.unref?.();

  let result;
  try {
    const skillActivation = isQualificationCanary(job)
      ? null
      : ensurePacketEngineeringKnowledge({ repoDir, root, packetId: job.job_id, instruction: job.instruction, metadata: job.metadata });
    if (skillActivation?.execution_allowed === false) {
      result = {
        event: 'HERMES_OPERATIONAL_TURN_FAILED',
        authority: 'HERMES_RUNTIME_ONLY',
        policy: 'LOCKED_SOL_THEN_SONNET',
        runtime: null,
        requested_model: null,
        resolved_model: null,
        fallback_used: false,
        failure_state: 'ENGINEERING_KNOWLEDGE_BLOCKED',
        reason: `VEKL execution blocked: ${skillActivation.resolution_state}; missing mandatory classes: ${(skillActivation.missing_mandatory_task_classes || []).join(', ') || 'none'}`,
        skill_activation_id: skillActivation.activation_id,
      };
    } else {
      if (skillActivation?.knowledge_context?.unit_lineage_id) {
        assertFreshKnowledgeBinding({ repoDir, root, packetId: job.job_id, boundary: 'DISPATCH_ADMISSION' });
      }
      result = await executor({
        repoDir,
        root,
        instruction: job.instruction,
        packetId: job.job_id,
        skillActivation,
      });
    }
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
  clearInterval(heartbeatPulse);
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

function parseSubmitArgs(args) {
  let requestedBy = process.env.USER || 'operator';
  let qualificationCanary = false;
  const instruction = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--requested-by') {
      if (!args[i + 1]) throw new Error('--requested-by requires a value');
      requestedBy = args[i + 1];
      i += 1;
      continue;
    }
    if (args[i] === '--qualification-canary') {
      qualificationCanary = true;
      continue;
    }
    instruction.push(args[i]);
  }
  return {
    instruction: instruction.join(' ').trim(),
    requestedBy,
    metadata: qualificationCanary ? { qualification_canary: true } : {},
  };
}

async function main() {
  const command = process.argv[2] || 'status';
  const repoDir = process.env.DIAL_REPO_DIR || DEFAULT_REPO;
  if (command === 'submit') {
    return console.log(JSON.stringify(submitExternalWork({ ...parseSubmitArgs(process.argv.slice(3)), repoDir }), null, 2));
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
