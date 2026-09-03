#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildCheckpoint, saveCheckpoint } from './checkpoint-store.mjs';
import { buildHandoffCapsule, saveHandoffCapsule } from './handoff-builder.mjs';
import { DEFAULT_MANAGER_POLICY, expireManagerLease, issueManagerLease, loadAvailability, recordRuntimeHealth, selectManager } from './manager-router.mjs';
import { ensureControlLayout, readJson, writeJsonAtomic, appendJsonl } from './state-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');

function now() { return new Date().toISOString(); }

function commandVersion(command, args = ['--version']) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function parseSemver(text) {
  const match = String(text || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function semverAtLeast(value, minimum) {
  const a = parseSemver(value);
  const b = parseSemver(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

export function initializeSupervisor(root) {
  ensureControlLayout(root);
  if (!readJson('state/orchestrator-state.json', null, root)) {
    writeJsonAtomic('state/orchestrator-state.json', {
      schema_version: 1,
      mode: 'QUALIFICATION',
      preferred_manager: DEFAULT_MANAGER_POLICY[0],
      failover_manager: DEFAULT_MANAGER_POLICY[1],
      created_at: now(),
      updated_at: now(),
    }, root);
  }
  if (!readJson('state/model-availability.json', null, root)) {
    writeJsonAtomic('state/model-availability.json', { schema_version: 1, runtimes: {}, updated_at: now() }, root);
  }
  appendJsonl('events/supervisor.jsonl', { event: 'SUPERVISOR_INITIALIZED', at: now() }, root);
  return readJson('state/orchestrator-state.json', null, root);
}

export function doctor({ repoDir = DEFAULT_REPO, root } = {}) {
  ensureControlLayout(root);
  const codexVersion = commandVersion('codex');
  const hermesVersion = commandVersion('hermes');
  const nodeVersion = process.version;
  const gitVersion = commandVersion('git');
  const claudeVersion = commandVersion('claude');
  const checks = {
    control_home_writable: (() => {
      try {
        const target = path.join(root || process.env.DIAL_CONTROL_HOME || '/var/lib/dial-control', '.doctor');
        fs.writeFileSync(target, 'ok', { mode: 0o600 });
        fs.unlinkSync(target);
        return true;
      } catch { return false; }
    })(),
    repo_present: fs.existsSync(path.join(repoDir, 'package.json')),
    project_truth_present: fs.existsSync(path.join(repoDir, 'agent-system/canon/PROJECT_TRUTH.md')),
    feature_registry_present: fs.existsSync(path.join(repoDir, 'agent-system/registries/FEATURE_REGISTRY.json')),
    context_get_present: fs.existsSync(path.join(repoDir, 'agent-system/bin/context-get.mjs')),
    git_present: Boolean(gitVersion),
    node_22_plus: Number(process.versions.node.split('.')[0]) >= 22,
    hermes_present: Boolean(hermesVersion),
    codex_present: Boolean(codexVersion),
    codex_sol_capable_version: semverAtLeast(codexVersion, '0.144.0'),
    claude_present_for_failover: Boolean(claudeVersion),
  };
  return {
    ok_for_codex_qualification: Object.entries(checks).filter(([key]) => key !== 'claude_present_for_failover').every(([, value]) => value),
    ok_for_full_cross_provider_qualification: Object.values(checks).every(Boolean),
    versions: { node: nodeVersion, git: gitVersion, hermes: hermesVersion, codex: codexVersion, claude: claudeVersion },
    checks,
    observed_at: now(),
  };
}

export function capture({ repoDir = DEFAULT_REPO, root, overrides = {} } = {}) {
  const lease = readJson('state/manager-lease.json', null, root);
  const checkpoint = buildCheckpoint(repoDir, { ...overrides, manager: lease });
  saveCheckpoint(checkpoint, root);
  appendJsonl('events/supervisor.jsonl', { event: 'CHECKPOINT_CAPTURED', feature_id: checkpoint.feature_id, commit: checkpoint.repository.commit, dirty: checkpoint.repository.dirty, at: now() }, root);
  return checkpoint;
}

export function elect({ repoDir = DEFAULT_REPO, root } = {}) {
  const availability = loadAvailability(root);
  const candidate = selectManager(availability);
  if (!candidate) return { elected: false, reason: 'NO_ELIGIBLE_MANAGER', availability };
  const previous = readJson('state/manager-lease.json', null, root);
  const checkpoint = readJson('state/active-checkpoint.json', null, root);
  const checkpointValue = checkpoint?.path ? readJson(checkpoint.path, null, root) : null;
  if (previous?.status === 'ACTIVE' && previous.runtime === candidate.runtime && previous.requested_model === candidate.requested_model) {
    return { elected: true, changed: false, lease: previous };
  }
  if (previous?.status === 'ACTIVE') expireManagerLease('MANAGER_REELECTION', root);
  const lease = issueManagerLease({
    candidate,
    feature_id: checkpointValue?.feature_id ?? null,
    worktree: checkpointValue?.worktree ?? repoDir,
    atomic_unit: checkpointValue?.execution?.atomic_unit ?? null,
    previous_lease_id: previous?.lease_id ?? null,
  }, root);
  return { elected: true, changed: true, lease };
}

export function handoff({ repoDir = DEFAULT_REPO, root, input = {} } = {}) {
  const checkpointPointer = readJson('state/active-checkpoint.json', null, root);
  const checkpoint = checkpointPointer?.path ? readJson(checkpointPointer.path, null, root) : capture({ repoDir, root });
  const capsule = buildHandoffCapsule(checkpoint, input);
  saveHandoffCapsule(capsule, root);
  appendJsonl('events/supervisor.jsonl', { event: 'HANDOFF_CAPSULE_WRITTEN', feature_id: capsule.feature_id, at: now() }, root);
  return capsule;
}

export function status(root) {
  return {
    orchestrator: readJson('state/orchestrator-state.json', null, root),
    availability: readJson('state/model-availability.json', null, root),
    lease: readJson('state/manager-lease.json', null, root),
    checkpoint: readJson('state/active-checkpoint.json', null, root),
    capsule: readJson('state/active-capsule.json', null, root),
    heartbeat: readJson('state/heartbeat.json', null, root),
  };
}

export async function daemon({ repoDir = DEFAULT_REPO, root, intervalMs = 60000 } = {}) {
  initializeSupervisor(root);
  const tick = () => {
    const health = doctor({ repoDir, root });
    writeJsonAtomic('state/heartbeat.json', { pid: process.pid, at: now(), health }, root);
    try { capture({ repoDir, root }); } catch (error) {
      appendJsonl('events/supervisor.jsonl', { event: 'CHECKPOINT_CAPTURE_FAILED', error: String(error), at: now() }, root);
    }
    try { elect({ repoDir, root }); } catch (error) {
      appendJsonl('events/supervisor.jsonl', { event: 'MANAGER_ELECTION_FAILED', error: String(error), at: now() }, root);
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  const stop = () => {
    clearInterval(timer);
    writeJsonAtomic('state/heartbeat.json', { pid: process.pid, at: now(), stopped: true }, root);
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

function argValue(name) {
  const args = process.argv.slice(3);
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

async function main() {
  const command = process.argv[2] || 'status';
  const repoDir = process.env.DIAL_REPO_DIR || DEFAULT_REPO;
  if (command === 'init') return console.log(JSON.stringify(initializeSupervisor(), null, 2));
  if (command === 'doctor') return console.log(JSON.stringify(doctor({ repoDir }), null, 2));
  if (command === 'status') return console.log(JSON.stringify(status(), null, 2));
  if (command === 'capture') return console.log(JSON.stringify(capture({ repoDir }), null, 2));
  if (command === 'elect') return console.log(JSON.stringify(elect({ repoDir }), null, 2));
  if (command === 'daemon') return daemon({ repoDir });
  if (command === 'health') {
    const runtime = argValue('--runtime');
    const state = argValue('--state');
    const requested = argValue('--requested-model');
    const resolved = argValue('--resolved-model');
    if (!runtime || !state) throw new Error('health requires --runtime and --state');
    return console.log(JSON.stringify(recordRuntimeHealth(runtime, { state, requested_model: requested, resolved_model: resolved }), null, 2));
  }
  if (command === 'handoff') {
    const input = {
      objective: argValue('--objective'),
      active_unit: argValue('--active-unit'),
      next_action: argValue('--next-action'),
    };
    return console.log(JSON.stringify(handoff({ repoDir, input }), null, 2));
  }
  throw new Error(`unknown supervisor command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
