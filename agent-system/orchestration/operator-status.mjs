#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateDevelopmentUnblock } from './development-unblock.mjs';
import { externalWorkStatus } from './external-orchestrator.mjs';
import { missionStatus } from './mission-control.mjs';
import { runtimeCapacityStatus } from './runtime-capacity-status.mjs';
import { loadRuntimeHealth } from './runtime-health.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
export const OPERATOR_STATUS_BRANCH = 'oracle-runtime-status';
export const OPERATOR_STATUS_FILE = 'oracle-runtime-status.json';
export const OPERATOR_STATUS_AUTHORITY = 'ORACLE_DIAL_RUNTIME_STATUS';
export const DEFAULT_STATUS_MAX_AGE_MS = 7 * 60 * 1000;

function git(repoDir, args, options = {}) {
  return execFileSync('git', args, {
    cwd: repoDir,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 8000,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never',
      ...(options.env || {}),
    },
    ...(options.input === undefined ? {} : { input: options.input }),
  }).trim();
}

function clean(value, max = 700) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function activePacket(packet) {
  if (!packet) return null;
  return {
    packet_id: packet.packet_id ?? null,
    state: packet.state ?? null,
    mission_turn: packet.mission_turn ?? null,
    queued_at: packet.queued_at ?? null,
    claimed_at: packet.claimed_at ?? null,
    runtime: packet.runtime ?? null,
    resolved_model: packet.resolved_model ?? null,
    fallback_used: packet.fallback_used ?? null,
  };
}
export function operatorStatusSnapshot({ repoDir = DEFAULT_REPO, root, nowMs = Date.now() } = {}) {
  const mission = missionStatus(root);
  const queue = externalWorkStatus(null, root);
  const gate = evaluateDevelopmentUnblock({ repoDir, root, nowMs });
  const capacity = runtimeCapacityStatus({ repoDir, root, nowMs });
  const health = loadRuntimeHealth(root)?.runtimes ?? {};
  const failedGateChecks = gate.unblocked ? [] : String(gate.reason || '')
    .split(':').slice(1).join(':').split(',')
    .map((value) => value.trim()).filter(Boolean);
  return {
    schema_version: 1,
    authority: OPERATOR_STATUS_AUTHORITY,
    project: 'dial',
    observed_at: new Date(nowMs).toISOString(),
    repository: {
      head: git(repoDir, ['rev-parse', 'HEAD']),
      branch: git(repoDir, ['branch', '--show-current']),
    },
    mission: {
      mission_id: mission.mission_id,
      state: mission.state,
      turn_number: mission.turn_number,
      last_packet_id: mission.last_packet_id,
      last_packet_state: mission.last_packet_state,
      packet_counts: mission.packet_counts,
      active_packets: (mission.active_packets || []).map(activePacket),
      owner_blocker: mission.owner_blocker ? {
        type: clean(mission.owner_blocker.type, 120),
        reason: clean(mission.owner_blocker.reason, 700),
        observed_at: mission.owner_blocker.observed_at ?? null,
      } : null,
    },
    orchestration: {
      queue_state: queue?.heartbeat?.queue_state ?? queue?.heartbeat?.service_state ?? null,
      active_job_id: queue?.heartbeat?.active_job_id ?? null,
      queued: queue?.queued ?? 0,
      heartbeat_observed_at: queue?.heartbeat?.observed_at ?? null,
      execution_origin: queue?.heartbeat?.execution_origin ?? null,
    },
    development: {
      unblocked: gate.unblocked,
      state: gate.development_state,
      gate_status: gate.gate?.status ?? null,
      failed_checks: failedGateChecks,
    },
    runtime: {
      policy: 'gpt-5.6-sol -> claude-sonnet-5 -> NO_HERMES_RUNTIME_AVAILABLE',
      primary: {
        state: health.codex_app_server?.state ?? null,
        requested_model: health.codex_app_server?.requested_model ?? 'gpt-5.6-sol',
        resolved_model: health.codex_app_server?.resolved_model ?? null,
        retry_after: health.codex_app_server?.retry_after ?? null,
        attempt_allowed: capacity.primary_attempt?.allowed ?? null,
        attempt_reason: capacity.primary_attempt?.reason ?? null,
      },
      fallback: {
        state: health.claude_code?.state ?? null,
        requested_model: health.claude_code?.requested_model ?? 'claude-sonnet-5',
        resolved_model: health.claude_code?.resolved_model ?? null,
      },
      identity_cache_valid: capacity.identity_cache?.valid ?? false,
    },
    research: capacity.ahead_of_work_forecast ? {
      state: capacity.ahead_of_work_forecast.state ?? null,
      forecast_id: capacity.ahead_of_work_forecast.forecast_id ?? null,
      created_at: capacity.ahead_of_work_forecast.created_at ?? null,
      runtime: capacity.ahead_of_work_forecast.runtime_provenance?.runtime ?? null,
      resolved_model: capacity.ahead_of_work_forecast.runtime_provenance?.resolved_model ?? null,
    } : null,
  };
}

function semanticStatus(status) {
  const copy = structuredClone(status);
  delete copy.observed_at;
  if (copy.orchestration) delete copy.orchestration.heartbeat_observed_at;
  return copy;
}

export function operatorStatusSemanticHash(status) {
  return crypto.createHash('sha256').update(JSON.stringify(semanticStatus(status))).digest('hex');
}

function parseStatus(raw) {
  const parsed = JSON.parse(raw);
  if (parsed?.authority !== OPERATOR_STATUS_AUTHORITY || parsed?.project !== 'dial') {
    throw new Error('remote status has invalid DIAL Oracle authority marker');
  }
  return parsed;
}

function directStatusFile(root) {
  const base = root || process.env.DIAL_CONTROL_HOME || '/var/lib/dial-control';
  return path.join(base, 'missions', 'dial-development-root.json');
}
export function readOracleOperatorStatus({
  repoDir = DEFAULT_REPO,
  root,
  remote = 'origin',
  branch = OPERATOR_STATUS_BRANCH,
  nowMs = Date.now(),
  maxAgeMs = DEFAULT_STATUS_MAX_AGE_MS,
  timeoutMs = 8000,
  statusFile = null,
} = {}) {
  let status = null;
  let source = null;
  let fetchError = null;
  if (statusFile) {
    try { status = parseStatus(fs.readFileSync(statusFile, 'utf8')); source = 'STATUS_FILE'; }
    catch (error) { fetchError = clean(error?.message || error, 1000); }
  } else if (fs.existsSync(directStatusFile(root))) {
    try { status = operatorStatusSnapshot({ repoDir, root, nowMs }); source = 'ORACLE_DIRECT'; }
    catch (error) { fetchError = clean(error?.message || error, 1000); }
  }
  const ref = `refs/remotes/${remote}/${branch}`;
  if (!status) {
    try {
      git(repoDir, ['fetch', '--quiet', '--no-tags', remote, `+refs/heads/${branch}:${ref}`], { timeoutMs });
    } catch (error) {
      fetchError = clean(error?.stderr || error?.message || error, 1000);
    }
    try {
      status = parseStatus(git(repoDir, ['show', `${ref}:${OPERATOR_STATUS_FILE}`], { timeoutMs }));
      source = fetchError ? 'PRIVATE_GIT_STATUS_CACHE' : 'PRIVATE_GIT_STATUS_BRANCH';
    } catch (error) {
      fetchError ||= clean(error?.stderr || error?.message || error, 1000);
    }
  }
  if (!status) {
    return { available: false, fresh: false, source: null, age_ms: null, status: null, error: fetchError || 'Oracle status unavailable' };
  }
  const observedMs = Date.parse(status.observed_at || '');
  const ageMs = Number.isFinite(observedMs) ? nowMs - observedMs : null;
  const fresh = Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeMs;
  return {
    available: true,
    fresh,
    source,
    age_ms: ageMs,
    status,
    error: fetchError,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] || 'read';
  if (command === 'snapshot') {
    process.stdout.write(`${JSON.stringify(operatorStatusSnapshot({}), null, 2)}\n`);
  } else if (command === 'read') {
    const result = readOracleOperatorStatus({});
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.available) process.exitCode = 2;
  } else {
    process.stderr.write('usage: operator-status.mjs [snapshot|read]\n');
    process.exitCode = 2;
  }
}
