#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './state-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const HEARTBEAT_MAX_AGE_MS = 2 * 60 * 1000;
const FINGERPRINT_PATHS = Object.freeze([
  'agent-system/orchestration',
  'deploy/oracle/hermes-codex',
]);

function gitRevParse(repoDir, spec) {
  try { return execFileSync('git', ['rev-parse', spec], { cwd: repoDir, encoding: 'utf8' }).trim(); }
  catch { return null; }
}

export function controlPlaneFingerprint(repoDir = DEFAULT_REPO) {
  const objects = FINGERPRINT_PATHS.map((target) => ({
    path: target,
    object: gitRevParse(repoDir, `HEAD:${target}`),
  }));
  if (objects.some((entry) => !entry.object)) return null;
  const canonical = objects.map((entry) => `${entry.path}:${entry.object}`).join('\n');
  return {
    algorithm: 'sha256-git-tree-v1',
    value: crypto.createHash('sha256').update(canonical).digest('hex'),
    objects,
  };
}

function gitHead(repoDir) {
  return gitRevParse(repoDir, 'HEAD');
}

export function evaluateDevelopmentUnblock({
  repoDir = DEFAULT_REPO,
  root,
  nowMs = Date.now(),
} = {}) {
  const gate = readJson('state/external-orchestration-gate.json', null, root);
  const heartbeat = readJson('state/external-orchestrator-heartbeat.json', null, root);
  const currentHead = gitHead(repoDir);
  const currentFingerprint = controlPlaneFingerprint(repoDir);
  const heartbeatMs = Date.parse(heartbeat?.observed_at ?? '');
  const heartbeatFresh = Number.isFinite(heartbeatMs)
    && nowMs >= heartbeatMs
    && nowMs - heartbeatMs <= HEARTBEAT_MAX_AGE_MS;

  const checks = {
    gate_present: Boolean(gate),
    production_green: gate?.status === 'PRODUCTION_GREEN',
    external_origin: gate?.execution_origin === 'EXTERNAL_ORACLE_ORCHESTRATOR',
    locked_policy: gate?.runtime_policy === 'gpt-5.6-sol -> claude-sonnet-5 -> NO_HERMES_RUNTIME_AVAILABLE',
    control_plane_fingerprint_known: Boolean(currentFingerprint?.value),
    qualified_control_plane_unchanged: Boolean(
      currentFingerprint?.value
      && gate?.control_plane_fingerprint?.algorithm === currentFingerprint.algorithm
      && gate?.control_plane_fingerprint?.value === currentFingerprint.value
    ),
    external_orchestrator_heartbeat_fresh: heartbeatFresh,
    heartbeat_origin_valid: heartbeat?.execution_origin === 'EXTERNAL_ORACLE_ORCHESTRATOR',
  };
  const unblocked = Object.values(checks).every(Boolean);
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);

  return {
    schema_version: 2,
    unblocked,
    development_state: unblocked ? 'DEVELOPMENT_RESUMABLE_THROUGH_EXTERNAL_HERMES' : 'DEVELOPMENT_BLOCKED',
    reason: unblocked ? null : `external Hermes qualification gate not satisfied: ${failed.join(', ')}`,
    repo_head: currentHead,
    control_plane_fingerprint: currentFingerprint,
    gate,
    heartbeat,
    checks,
    observed_at: new Date(nowMs).toISOString(),
  };
}

export function assertDevelopmentUnblocked(options = {}) {
  const result = evaluateDevelopmentUnblock(options);
  if (!result.unblocked) {
    const error = new Error(result.reason || 'DIAL development is blocked until external Hermes orchestration is production-qualified');
    error.gate = result;
    throw error;
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoDir = process.env.DIAL_REPO_DIR || DEFAULT_REPO;
  if (process.argv.includes('--fingerprint')) {
    const fingerprint = controlPlaneFingerprint(repoDir);
    process.stdout.write(`${JSON.stringify(fingerprint, null, 2)}\n`);
    if (!fingerprint?.value) process.exitCode = 2;
  } else {
    const result = evaluateDevelopmentUnblock({ repoDir });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.unblocked) process.exitCode = 2;
  }
}
