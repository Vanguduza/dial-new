#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildCheckpoint, saveCheckpoint } from './checkpoint-store.mjs';
import { evaluateDevelopmentUnblock } from './development-unblock.mjs';
import { buildHandoffCapsule, saveHandoffCapsule } from './handoff-builder.mjs';
import { expireHermesRuntimeSelection, reconcileHermesRuntime } from './hermes-runtime-router.mjs';
import { healthFresh, loadRuntimeHealth, recordRuntimeHealth, runtimeEligible } from './runtime-health.mjs';
import { primaryAttemptDecision } from './runtime-capacity-policy.mjs';
import { appendJsonl, ensureControlLayout, readJson, writeJsonAtomic } from './state-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const DEFAULT_PROBE_INTERVAL_MS = 12 * 60 * 60 * 1000;
const CONTROL_SCHEMA = 5;

function now() { return new Date().toISOString(); }
function commandVersion(command, args = ['--version']) {
  try { return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}
function parseSemver(text) {
  const match = String(text || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}
function semverAtLeast(value, minimum) {
  const a = parseSemver(value), b = parseSemver(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) { if (a[i] > b[i]) return true; if (a[i] < b[i]) return false; }
  return true;
}

function desiredControlPlane(existing = null) {
  const createdAt = existing?.created_at ?? now();
  return {
    schema_version: CONTROL_SCHEMA,
    mode: 'EXTERNAL_ORCHESTRATION_QUALIFICATION',
    architecture: {
      external_persistent_runtime: 'HERMES',
      external_orchestrator: 'dial-hermes-orchestrator.service',
      external_work_queue: 'work-queue',
      primary_runtime: 'codex_app_server/gpt-5.6-sol',
      fallback_runtime: 'claude_code/claude-sonnet-5',
      total_loss: 'NO_HERMES_RUNTIME_AVAILABLE',
      governance_bridge: 'DIAL_CANONICAL_CONTEXT_CHECKPOINT_MEMORY',
      development_entrypoint_after_green: 'dial-hermes-submit',
      development_gate: 'state/external-orchestration-gate.json',
      auxiliary_operations_service: 'dial-hermes-operations.service',
      auxiliary_operations_authority: 'NON_AUTHORITATIVE_CONTROL_PLANE_OPERATIONS',
      auxiliary_api_secret: 'secrets/operations-api.key',
    },
    runtime_policy: 'gpt-5.6-sol -> claude-sonnet-5 -> NO_HERMES_RUNTIME_AVAILABLE',
    invariant: 'DIAL_PRODUCT_DEVELOPMENT_REQUIRES_PRODUCTION_GREEN_EXTERNAL_HERMES_ORCHESTRATION',
    direct_project_session_development_allowed: false,
    created_at: createdAt,
    updated_at: now(),
  };
}

export function initializeSupervisor(root) {
  ensureControlLayout(root);
  const existing = readJson('state/control-plane.json', null, root);
  if (!existing || existing.schema_version !== CONTROL_SCHEMA) {
    writeJsonAtomic('state/control-plane.json', desiredControlPlane(existing), root);
    appendJsonl('events/supervisor.jsonl', {
      event: existing ? 'CONTROL_PLANE_SCHEMA_MIGRATED' : 'CONTROL_PLANE_CREATED',
      from_schema: existing?.schema_version ?? null,
      to_schema: CONTROL_SCHEMA,
      at: now(),
    }, root);
  }
  loadRuntimeHealth(root);
  appendJsonl('events/supervisor.jsonl', { event: 'SUPERVISOR_INITIALIZED', architecture_version: CONTROL_SCHEMA, at: now() }, root);
  return readJson('state/control-plane.json', null, root);
}

export function invalidateRuntimeEvidenceAfterSupervisorRestart(root) {
  // Kept as a compatibility name, but restarts no longer burn model capacity by
  // invalidating still-fresh identity/health evidence. Runtime identity is
  // independently fingerprinted and operational turns refresh health.
  const runtimeHealth = loadRuntimeHealth(root);
  const hermes = readJson('state/hermes-runtime.json', null, root);
  const activeHealth = hermes?.runtime ? runtimeHealth.runtimes?.[hermes.runtime] : null;
  if (hermes?.status === 'ACTIVE' && !healthFresh(activeHealth)) {
    expireHermesRuntimeSelection('SUPERVISOR_RESTART_FOUND_STALE_RUNTIME_HEALTH', root);
  }
  appendJsonl('events/supervisor.jsonl', {
    event: 'RUNTIME_EVIDENCE_PRESERVED_AFTER_RESTART',
    previous_hermes_selection_id: hermes?.selection_id ?? null,
    active_health_fresh: healthFresh(activeHealth),
    at: now(),
  }, root);
  return runtimeHealth;
}

export async function refreshRuntimeHealth({ repoDir = DEFAULT_REPO, root, forceLive = false } = {}) {
  const results = {};
  const current = loadRuntimeHealth(root)?.runtimes ?? {};
  const sol = current.codex_app_server ?? null;
  const solExactHealthy = runtimeEligible(sol, { hardPin: true, requireFresh: true })
    && sol?.requested_model === 'gpt-5.6-sol' && sol?.resolved_model === 'gpt-5.6-sol';
  const solAttempt = primaryAttemptDecision(sol);
  try {
    if (!forceLive && solExactHealthy) {
      results.codex_app_server = { ...sol, reused: true, live_inference: false, skipped_reason: 'FRESH_RUNTIME_HEALTH' };
    } else if (!forceLive && !solAttempt.allowed) {
      results.codex_app_server = { ...sol, reused: true, live_inference: false, skipped_reason: solAttempt.reason, retry_after: solAttempt.retry_after ?? sol?.retry_after ?? null };
    } else {
      const { probeCodexAppServer } = await import('./codex-app-server-probe.mjs');
      results.codex_app_server = await probeCodexAppServer({ repoDir, root, forceLive });
    }
  } catch (error) {
    results.codex_app_server = recordRuntimeHealth('codex_app_server', {
      state: 'PROCESS_FAILED', requested_model: 'gpt-5.6-sol', resolved_model: null,
      reason: `supervisor refresh failed: ${String(error?.message || error).slice(0, 1000)}`,
    }, root);
  }
  try {
    const sonnet = current.claude_code ?? null;
    const sonnetExactHealthy = runtimeEligible(sonnet, { hardPin: true, requireFresh: true })
      && sonnet?.requested_model === 'claude-sonnet-5' && sonnet?.resolved_model === 'claude-sonnet-5';
    if (!forceLive && sonnetExactHealthy) {
      results.claude_code = { ...sonnet, reused: true, live_inference: false, skipped_reason: 'FRESH_RUNTIME_HEALTH' };
    } else {
      const { probeClaudeCode } = await import('./claude-code-probe.mjs');
      results.claude_code = probeClaudeCode({ repoDir, root });
    }
  } catch (error) {
    results.claude_code = recordRuntimeHealth('claude_code', {
      state: 'PROCESS_FAILED', requested_model: 'claude-sonnet-5', resolved_model: null,
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
        fs.writeFileSync(target, 'ok', { mode: 0o600 }); fs.unlinkSync(target); return true;
      } catch { return false; }
    })(),
    repo_present: fs.existsSync(path.join(repoDir, 'package.json')),
    project_truth_present: fs.existsSync(path.join(repoDir, 'agent-system/canon/PROJECT_TRUTH.md')),
    feature_registry_present: fs.existsSync(path.join(repoDir, 'agent-system/registries/FEATURE_REGISTRY.json')),
    context_get_present: fs.existsSync(path.join(repoDir, 'agent-system/bin/context-get.mjs')),
    external_orchestrator_present: fs.existsSync(path.join(repoDir, 'agent-system/orchestration/external-orchestrator.mjs')),
    development_unblock_gate_present: fs.existsSync(path.join(repoDir, 'agent-system/orchestration/development-unblock.mjs')),
    finalizer_present: fs.existsSync(path.join(repoDir, 'deploy/oracle/hermes-codex/finalize-control-plane.sh')),
    operations_plane_present: fs.existsSync(path.join(repoDir, 'agent-system/orchestration/operations-plane.mjs')),
    operations_api_present: fs.existsSync(path.join(repoDir, 'agent-system/orchestration/operations-api.mjs')),
    project_registry_present: fs.existsSync(path.join(repoDir, 'agent-system/orchestration/project-registry.mjs')),
    git_present: Boolean(gitVersion),
    node_22_plus: Number(process.versions.node.split('.')[0]) >= 22,
    hermes_present: Boolean(hermesVersion),
    codex_present: Boolean(codexVersion),
    codex_sol_capable_version: semverAtLeast(codexVersion, '0.144.0'),
    claude_present_for_fallback: Boolean(claudeVersion),
  };
  return {
    ok_for_hermes_runtime_qualification: Object.values(checks).every(Boolean),
    runtime_policy: {
      primary: 'codex_app_server/gpt-5.6-sol',
      fallback: 'claude_code/claude-sonnet-5',
      no_runtime: 'NO_HERMES_RUNTIME_AVAILABLE',
      additional_discovered_models_executable: false,
    },
    external_orchestration: {
      service: 'dial-hermes-orchestrator.service',
      queue: 'work-queue',
      development_entrypoint_after_green: 'dial-hermes-submit',
      direct_project_session_development_allowed: false,
    },
    auxiliary_operations: {
      service: 'dial-hermes-operations.service',
      authority: 'NON_AUTHORITATIVE_CONTROL_PLANE_OPERATIONS',
      api_key_location: 'outside_git_control_home_secret',
      api_can_authorize_development: false,
      api_can_execute_tools: false,
    },
    versions: { node: nodeVersion, git: gitVersion, hermes: hermesVersion, codex: codexVersion, claude: claudeVersion },
    checks,
    observed_at: now(),
  };
}

function activeRuntimeProvenance(root) {
  const selection = readJson('state/hermes-runtime.json', null, root);
  if (!selection) return null;
  return {
    selection_id: selection.selection_id ?? null,
    runtime: selection.runtime ?? null,
    requested_model: selection.requested_model ?? null,
    resolved_model: selection.resolved_model ?? null,
    runtime_session: selection.runtime_session ?? null,
    runtime_health: selection.runtime_health ?? null,
    runtime_health_observed_at: selection.runtime_health_observed_at ?? null,
    status: selection.status ?? null,
    authority: 'HERMES_RUNTIME_ONLY',
  };
}

export function capture({ repoDir = DEFAULT_REPO, root, overrides = {} } = {}) {
  const checkpoint = buildCheckpoint(repoDir, {
    ...overrides,
    runtime_provenance: overrides.runtime_provenance ?? activeRuntimeProvenance(root),
  });
  saveCheckpoint(checkpoint, root);
  appendJsonl('events/supervisor.jsonl', {
    event: 'CHECKPOINT_CAPTURED', feature_id: checkpoint.feature_id,
    commit: checkpoint.repository.commit, dirty: checkpoint.repository.dirty, at: now(),
  }, root);
  return checkpoint;
}

export function selectRuntime({ root } = {}) {
  return reconcileHermesRuntime({ root, runtimeHealth: loadRuntimeHealth(root) });
}

export function handoff({ repoDir = DEFAULT_REPO, root, input = {} } = {}) {
  const pointer = readJson('state/active-checkpoint.json', null, root);
  const checkpoint = pointer?.path ? readJson(pointer.path, null, root) : capture({ repoDir, root });
  const capsule = buildHandoffCapsule(checkpoint, input);
  saveHandoffCapsule(capsule, root);
  appendJsonl('events/supervisor.jsonl', { event: 'HANDOFF_CAPSULE_WRITTEN', feature_id: capsule.feature_id, at: now() }, root);
  return capsule;
}

export function status({ repoDir = DEFAULT_REPO, root } = {}) {
  return {
    control_plane: readJson('state/control-plane.json', null, root),
    hermes_runtime: readJson('state/hermes-runtime.json', null, root),
    runtime_health: loadRuntimeHealth(root),
    external_orchestrator_heartbeat: readJson('state/external-orchestrator-heartbeat.json', null, root),
    external_orchestration_gate: readJson('state/external-orchestration-gate.json', null, root),
    auxiliary_operations_heartbeat: readJson('operations/heartbeat.json', null, root),
    auxiliary_operations_api: readJson('operations/api-config.json', null, root),
    auxiliary_operations_schedules: readJson('operations/schedules.json', null, root),
    development_unblock: evaluateDevelopmentUnblock({ repoDir, root }),
    checkpoint: readJson('state/active-checkpoint.json', null, root),
    capsule: readJson('state/active-capsule.json', null, root),
    heartbeat: readJson('state/heartbeat.json', null, root),
  };
}

export function runtimeProbeAnchorMs(runtimeHealth) {
  const observed = Object.values(runtimeHealth?.runtimes ?? {})
    .map((health) => Date.parse(health?.observed_at ?? ''))
    .filter(Number.isFinite);
  return observed.length ? Math.min(...observed) : 0;
}

export async function daemon({
  repoDir = DEFAULT_REPO, root, intervalMs = 60000,
  probeIntervalMs = Number(process.env.DIAL_RUNTIME_PROBE_INTERVAL_MS || DEFAULT_PROBE_INTERVAL_MS),
} = {}) {
  initializeSupervisor(root);
  invalidateRuntimeEvidenceAfterSupervisorRestart(root);
  // A service restart is not a reason to spend a model turn. Anchor the next
  // scheduled refresh to the oldest persisted runtime observation. Only a true
  // bootstrap with no evidence probes immediately; otherwise the normal probe
  // cadence decides when a live refresh is due.
  let lastProbeAt = runtimeProbeAnchorMs(loadRuntimeHealth(root));
  if (!lastProbeAt) {
    await refreshRuntimeHealth({ repoDir, root });
    lastProbeAt = Date.now();
  }
  reconcileHermesRuntime({ root });

  const tick = async () => {
    if (Date.now() - lastProbeAt >= probeIntervalMs) {
      await refreshRuntimeHealth({ repoDir, root }); lastProbeAt = Date.now();
    }
    writeJsonAtomic('state/heartbeat.json', { pid: process.pid, at: now(), health: doctor({ repoDir, root }) }, root);
    try { capture({ repoDir, root }); }
    catch (error) { appendJsonl('events/supervisor.jsonl', { event: 'CHECKPOINT_CAPTURE_FAILED', error: String(error), at: now() }, root); }
    try { reconcileHermesRuntime({ root }); }
    catch (error) { appendJsonl('events/supervisor.jsonl', { event: 'HERMES_RUNTIME_RECONCILIATION_FAILED', error: String(error), at: now() }, root); }
  };

  await tick();
  const timer = setInterval(() => {
    tick().catch((error) => appendJsonl('events/supervisor.jsonl', { event: 'SUPERVISOR_TICK_FAILED', error: String(error), at: now() }, root));
  }, intervalMs);
  const stop = () => {
    clearInterval(timer);
    writeJsonAtomic('state/heartbeat.json', { pid: process.pid, at: now(), stopped: true }, root);
    process.exit(0);
  };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}

function argValue(name) {
  const args = process.argv.slice(3), idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

async function main() {
  const command = process.argv[2] || 'status';
  const repoDir = process.env.DIAL_REPO_DIR || DEFAULT_REPO;
  if (command === 'init') return console.log(JSON.stringify(initializeSupervisor(), null, 2));
  if (command === 'doctor') return console.log(JSON.stringify(doctor({ repoDir }), null, 2));
  if (command === 'status') return console.log(JSON.stringify(status({ repoDir }), null, 2));
  if (command === 'capture') return console.log(JSON.stringify(capture({ repoDir }), null, 2));
  if (command === 'refresh') return console.log(JSON.stringify(await refreshRuntimeHealth({ repoDir, forceLive: process.argv.includes('--force-live') }), null, 2));
  if (command === 'select-runtime') return console.log(JSON.stringify(selectRuntime(), null, 2));
  if (command === 'daemon') return daemon({ repoDir });
  if (command === 'health') {
    const runtime = argValue('--runtime'), state = argValue('--state');
    const requested = argValue('--requested-model'), resolved = argValue('--resolved-model');
    if (!runtime || !state) throw new Error('health requires --runtime and --state');
    return console.log(JSON.stringify(recordRuntimeHealth(runtime, { state, requested_model: requested, resolved_model: resolved }), null, 2));
  }
  if (command === 'handoff') {
    return console.log(JSON.stringify(handoff({ repoDir, input: {
      objective: argValue('--objective'), active_unit: argValue('--active-unit'), next_action: argValue('--next-action'),
    } }), null, 2));
  }
  throw new Error(`unknown supervisor command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
}
