#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildCheckpoint, saveCheckpoint } from './checkpoint-store.mjs';
import { buildHandoffCapsule, saveHandoffCapsule } from './handoff-builder.mjs';
import { developmentManagerStatus, electDevelopmentManager, expireDevelopmentManagerAssignment, loadDevelopmentManager } from './manager-router.mjs';
import { classifyDevelopmentTask, loadDevelopmentPolicy, saveDevelopmentPolicy } from './development-policy.mjs';
import { ensureFirstClassHarnesses } from './execution-harnesses.mjs';
import { chatSelectableModels, loadModelRegistry } from './model-registry.mjs';
import { expireHermesRuntimeSelection, reconcileHermesRuntime } from './hermes-runtime-router.mjs';
import { loadRuntimeHealth, recordRuntimeHealth } from './runtime-health.mjs';
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
  ensureFirstClassHarnesses(root);
  if (!readJson('state/development-policy.json', null, root)) saveDevelopmentPolicy({}, root);
  if (!readJson('state/control-plane.json', null, root)) {
    writeJsonAtomic('state/control-plane.json', {
      schema_version: 2,
      mode: 'QUALIFICATION',
      architecture: {
        external_persistent_control: 'HERMES',
        development_orchestration: 'DIAL_QUALITY_FIRST',
        execution_harnesses: ['codex_app_server', 'claude_code', 'deepseek_harness', 'local_runtime', 'custom_api'],
      },
      invariant: 'HERMES_RUNTIME_SELECTION_DOES_NOT_GRANT_DEVELOPMENT_MANAGER_AUTHORITY',
      created_at: now(),
      updated_at: now(),
    }, root);
  }
  // Do not reinterpret a legacy manager lease as a development assignment.
  const legacy = readJson('state/manager-lease.json', null, root);
  if (legacy?.status === 'ACTIVE') {
    writeJsonAtomic('state/manager-lease.json', {
      ...legacy,
      status: 'EXPIRED',
      expired_at: now(),
      expiration_reason: 'SEMANTIC_MIGRATION_RUNTIME_SELECTION_IS_NOT_DEVELOPMENT_MANAGER_AUTHORITY',
    }, root);
    appendJsonl('events/migrations.jsonl', {
      event: 'LEGACY_MANAGER_LEASE_EXPIRED',
      lease_id: legacy.lease_id ?? null,
      at: now(),
    }, root);
  }
  loadRuntimeHealth(root); // performs one-way legacy model-availability migration if needed.
  appendJsonl('events/supervisor.jsonl', { event: 'SUPERVISOR_INITIALIZED', architecture_version: 2, at: now() }, root);
  return readJson('state/control-plane.json', null, root);
}

export function invalidateRuntimeEvidenceAfterSupervisorRestart(root) {
  const runtimeHealth = loadRuntimeHealth(root);
  for (const [runtime, health] of Object.entries(runtimeHealth.runtimes ?? {})) {
    recordRuntimeHealth(runtime, {
      state: 'UNKNOWN',
      requested_model: health?.requested_model ?? null,
      resolved_model: health?.resolved_model ?? null,
      reason: 'supervisor restart requires fresh runtime/model provenance',
      details: { previous_state: health?.state ?? null, previous_observed_at: health?.observed_at ?? null },
    }, root);
  }
  const hermes = readJson('state/hermes-runtime.json', null, root);
  if (hermes?.status === 'ACTIVE') expireHermesRuntimeSelection('SUPERVISOR_RESTART_REQUIRES_REVALIDATION', root);
  const developmentManager = loadDevelopmentManager(root);
  if (developmentManager?.status === 'ACTIVE') expireDevelopmentManagerAssignment('SUPERVISOR_RESTART_REQUIRES_REVALIDATION', root);
  appendJsonl('events/supervisor.jsonl', {
    event: 'RUNTIME_EVIDENCE_INVALIDATED_AFTER_RESTART',
    previous_hermes_selection_id: hermes?.selection_id ?? null,
    previous_development_assignment_id: developmentManager?.assignment_id ?? null,
    at: now(),
  }, root);
}

export async function refreshRuntimeHealth({ repoDir = DEFAULT_REPO, root } = {}) {
  const results = {};
  try {
    const { probeCodexAppServer } = await import('./codex-app-server-probe.mjs');
    results.codex_app_server = await probeCodexAppServer({ repoDir, root });
  } catch (error) {
    results.codex_app_server = recordRuntimeHealth('codex_app_server', {
      state: 'PROCESS_FAILED',
      requested_model: 'gpt-5.6-sol',
      resolved_model: null,
      reason: `supervisor refresh failed: ${String(error?.message || error).slice(0, 1000)}`,
    }, root);
  }

  try {
    const { probeClaudeCode } = await import('./claude-code-probe.mjs');
    results.claude_code = probeClaudeCode({ repoDir, root });
  } catch (error) {
    results.claude_code = recordRuntimeHealth('claude_code', {
      state: 'PROCESS_FAILED',
      requested_model: 'claude-sonnet-5',
      resolved_model: null,
      reason: `supervisor refresh failed: ${String(error?.message || error).slice(0, 1000)}`,
    }, root);
  }

  appendJsonl('events/supervisor.jsonl', {
    event: 'RUNTIME_HEALTH_REFRESHED',
    codex_state: results.codex_app_server?.state ?? null,
    claude_state: results.claude_code?.state ?? null,
    at: now(),
  }, root);
  return results;
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
    claude_present_for_hermes_fallback: Boolean(claudeVersion),
  };
  return {
    ok_for_hermes_runtime_qualification: Object.values(checks).every(Boolean),
    development_manager_policy_qualification: 'REPOSITORY_TESTED_SEPARATELY',
    versions: { node: nodeVersion, git: gitVersion, hermes: hermesVersion, codex: codexVersion, claude: claudeVersion },
    checks,
    observed_at: now(),
  };
}

export function capture({ repoDir = DEFAULT_REPO, root, overrides = {} } = {}) {
  const developmentManager = loadDevelopmentManager(root);
  const checkpoint = buildCheckpoint(repoDir, { ...overrides, development_manager: developmentManager });
  saveCheckpoint(checkpoint, root);
  appendJsonl('events/supervisor.jsonl', { event: 'CHECKPOINT_CAPTURED', feature_id: checkpoint.feature_id, commit: checkpoint.repository.commit, dirty: checkpoint.repository.dirty, at: now() }, root);
  return checkpoint;
}

export function electHermesRuntime({ root } = {}) {
  return reconcileHermesRuntime({ root, runtimeHealth: loadRuntimeHealth(root) });
}

export function electDevelopment({ repoDir = DEFAULT_REPO, root, task = { kind: 'orchestration_decision' } } = {}) {
  const checkpointPointer = readJson('state/active-checkpoint.json', null, root);
  const checkpoint = checkpointPointer?.path ? readJson(checkpointPointer.path, null, root) : null;
  return electDevelopmentManager({
    root,
    feature_id: checkpoint?.feature_id ?? null,
    worktree: checkpoint?.worktree ?? repoDir,
    atomic_unit: checkpoint?.execution?.atomic_unit ?? null,
    task,
  });
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
    control_plane: readJson('state/control-plane.json', null, root),
    hermes_runtime: readJson('state/hermes-runtime.json', null, root),
    development_manager: loadDevelopmentManager(root),
    development_manager_status: developmentManagerStatus(root),
    development_policy: loadDevelopmentPolicy(root),
    runtime_health: loadRuntimeHealth(root),
    model_registry: loadModelRegistry(root),
    checkpoint: readJson('state/active-checkpoint.json', null, root),
    capsule: readJson('state/active-capsule.json', null, root),
    heartbeat: readJson('state/heartbeat.json', null, root),
  };
}

export async function daemon({ repoDir = DEFAULT_REPO, root, intervalMs = 60000 } = {}) {
  initializeSupervisor(root);
  invalidateRuntimeEvidenceAfterSupervisorRestart(root);
  await refreshRuntimeHealth({ repoDir, root });
  reconcileHermesRuntime({ root });

  const tick = () => {
    const health = doctor({ repoDir, root });
    writeJsonAtomic('state/heartbeat.json', { pid: process.pid, at: now(), health }, root);
    try { capture({ repoDir, root }); } catch (error) {
      appendJsonl('events/supervisor.jsonl', { event: 'CHECKPOINT_CAPTURE_FAILED', error: String(error), at: now() }, root);
    }
    // Availability-first runtime continuity is automatic. Complex development
    // authority is intentionally not auto-downgraded or auto-created here.
    try { reconcileHermesRuntime({ root }); } catch (error) {
      appendJsonl('events/supervisor.jsonl', { event: 'HERMES_RUNTIME_RECONCILIATION_FAILED', error: String(error), at: now() }, root);
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
  if (command === 'elect-hermes') return console.log(JSON.stringify(electHermesRuntime(), null, 2));
  if (command === 'elect-development') {
    const kind = argValue('--task-kind') || 'orchestration_decision';
    return console.log(JSON.stringify(electDevelopment({ repoDir, task: { kind } }), null, 2));
  }
  if (command === 'refresh') return console.log(JSON.stringify(await refreshRuntimeHealth({ repoDir }), null, 2));
  if (command === 'models') return console.log(JSON.stringify(chatSelectableModels(), null, 2));
  if (command === 'classify') {
    const kind = argValue('--task-kind');
    return console.log(JSON.stringify({ kind, classification: classifyDevelopmentTask({ kind }) }, null, 2));
  }
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
