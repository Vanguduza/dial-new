#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { summarizeOperationsEvidence, operationsApiStatus, OPERATIONS_API_AUTHORITY } from './operations-api.mjs';
import { ensureProjectRegistry, getProject, listProjects } from './project-registry.mjs';
import { appendJsonl, ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';

export const OPERATIONS_AUTHORITY = 'NON_AUTHORITATIVE_CONTROL_PLANE_OPERATIONS';
export const RECOVERY_AUTHORITY = 'BOUNDED_SERVICE_RECOVERY_ONLY';
export const RECOVERABLE_DIAL_SERVICES = Object.freeze([
  'dial-hermes-runtime.service',
  'hermes-gateway.service',
  'hermes-dial-dashboard.service',
  'dial-hermes-orchestrator.service',
  'dial-mission-controller.service',
  'dial-chat-control.service',
  'dial-hermes-whatsapp-operator.service',
  'dial-whatsapp-cloud-operator.service',
]);
export const ALLOWED_OPERATION_JOBS = Object.freeze([
  'service_health', 'service_recovery', 'queue_health', 'repo_integrity',
  'deterministic_verify', 'evidence_prepare', 'backup_verify',
]);
const SCHEDULES_REL = 'operations/schedules.json';
const DEFAULT_POLL_MS = 30000;
const HEARTBEAT_FRESH_MS = 2 * 60 * 1000;
const PROCESSING_STALE_MS = 30 * 60 * 1000;

function now() { return new Date().toISOString(); }
function safeId(value) { return String(value).replace(/[^a-zA-Z0-9_.-]/g, '_'); }
function bounded(value, max = 8000) {
  const text = String(value ?? '').trim();
  return text.length <= max ? text : text.slice(-max);
}
function run(command, args, cwd) {
  const started = Date.now();
  try {
    const stdout = execFileSync(command, args, {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', CI: '1' },
    });
    return { ok: true, stdout: bounded(stdout), duration_ms: Date.now() - started };
  } catch (error) {
    return {
      ok: false, stdout: bounded(error?.stdout), stderr: bounded(error?.stderr || error?.message || error, 4000),
      status: error?.status ?? null, duration_ms: Date.now() - started,
    };
  }
}
function runRel(slug, job, observedAt) { return `operations/projects/${slug}/runs/${safeId(observedAt)}-${job}.json`; }
function latestRel(slug, job) { return `operations/projects/${slug}/latest/${job}.json`; }

function repoIntegrity(project, runner = run) {
  const head = runner('git', ['rev-parse', 'HEAD'], project.repo_dir);
  const branch = runner('git', ['branch', '--show-current'], project.repo_dir);
  const status = runner('git', ['status', '--porcelain=v1'], project.repo_dir);
  const diffCheck = runner('git', ['diff', '--check'], project.repo_dir);
  const inside = runner('git', ['rev-parse', '--is-inside-work-tree'], project.repo_dir);
  return {
    check: 'repo_integrity', ok: head.ok && branch.ok && status.ok && diffCheck.ok && inside.stdout === 'true',
    head: head.stdout || null, branch: branch.stdout || null, dirty: Boolean(status.stdout),
    dirty_paths: status.stdout ? status.stdout.split('\n').filter(Boolean).slice(0, 200) : [],
    diff_check_green: diffCheck.ok, repository_detected: inside.stdout === 'true',
    errors: [head, branch, status, diffCheck, inside].filter((item) => !item.ok).map((item) => item.stderr).filter(Boolean),
  };
}

function serviceHealth(project, runner = run) {
  const services = Array.isArray(project.services) ? project.services : [];
  const results = services.map((service) => {
    const active = runner('systemctl', ['--user', 'is-active', service], project.repo_dir);
    const enabled = runner('systemctl', ['--user', 'is-enabled', service], project.repo_dir);
    return { service, active: active.stdout || 'unknown', enabled: enabled.stdout || 'unknown', healthy: active.ok && active.stdout === 'active' };
  });
  return { check: 'service_health', ok: results.every((item) => item.healthy), services: results };
}

export function serviceRecovery(project, runner = run) {
  if (project.slug !== 'dial') return { check: 'service_recovery', ok: null, reason: 'recovery policy not registered for this project' };
  const before = serviceHealth(project, runner);
  const unhealthy = before.services.filter((item) => !item.healthy && RECOVERABLE_DIAL_SERVICES.includes(item.service));
  const attempts = unhealthy.map((item) => {
    const restart = runner('systemctl', ['--user', 'restart', item.service], project.repo_dir);
    const active = runner('systemctl', ['--user', 'is-active', item.service], project.repo_dir);
    return { service: item.service, restart_requested: true, restart_ok: restart.ok, active_after: active.stdout || 'unknown', recovered: restart.ok && active.ok && active.stdout === 'active' };
  });
  const after = serviceHealth(project, runner);
  return {
    check: 'service_recovery', authority: RECOVERY_AUTHORITY, development_authority: false,
    ok: after.ok, action_taken: attempts.length > 0, attempts, before, after,
    excluded_services: before.services.filter((item) => !RECOVERABLE_DIAL_SERVICES.includes(item.service)).map((item) => item.service),
  };
}

function directoryJobStats(rel, root) {
  const dir = resolveControlPath(rel, root);
  try {
    return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return { id: name.replace(/\.json$/, ''), modified_at: stat.mtime.toISOString(), age_ms: Math.max(0, Date.now() - stat.mtimeMs) };
    });
  } catch { return []; }
}

export function queueHealth(root) {
  const heartbeat = readJson('state/external-orchestrator-heartbeat.json', null, root);
  const heartbeatAge = heartbeat?.observed_at ? Date.now() - Date.parse(heartbeat.observed_at) : null;
  const processing = directoryJobStats('work-queue/processing', root);
  const stale = processing.filter((item) => item.age_ms > PROCESSING_STALE_MS);
  const counts = Object.fromEntries(['inbox', 'processing', 'completed', 'failed'].map((state) => [state, directoryJobStats(`work-queue/${state}`, root).length]));
  const heartbeatFresh = Number.isFinite(heartbeatAge) && heartbeatAge >= 0 && heartbeatAge <= HEARTBEAT_FRESH_MS;
  return {
    check: 'queue_health', ok: heartbeatFresh && stale.length === 0,
    heartbeat_fresh: heartbeatFresh, heartbeat_age_ms: heartbeatAge, execution_origin: heartbeat?.execution_origin ?? null,
    counts, stale_processing_jobs: stale.map((item) => ({ id: item.id, age_ms: item.age_ms })),
  };
}

export function deterministicVerify(project, runner = run) {
  if (project.slug !== 'dial') return { check: 'deterministic_verify', ok: null, reason: 'verification policy not registered for this project' };
  const result = runner('npm', ['run', 'verify'], project.repo_dir);
  return {
    check: 'deterministic_verify', ok: result.ok, command: 'npm run verify', status: result.status ?? (result.ok ? 0 : null),
    duration_ms: result.duration_ms ?? null, stdout_tail: bounded(result.stdout), stderr_tail: bounded(result.stderr, 4000),
    model_runtime_used: false,
  };
}

function backupVerify(root) {
  const pointer = readJson('state/active-checkpoint.json', null, root);
  const checkpointExists = Boolean(pointer?.path && fs.existsSync(resolveControlPath(pointer.path, root)));
  const backupDir = resolveControlPath('sessions/hermes/backups', root);
  let backups = [];
  try {
    backups = fs.readdirSync(backupDir).filter((name) => /^state-.*\.db$/.test(name)).map((name) => {
      const target = path.join(backupDir, name); const stat = fs.statSync(target);
      return { name, size_bytes: stat.size, modified_at: stat.mtime.toISOString(), mode: (stat.mode & 0o777).toString(8).padStart(3, '0') };
    }).sort((a, b) => b.modified_at.localeCompare(a.modified_at));
  } catch {}
  return {
    check: 'backup_verify', ok: checkpointExists && backups.length > 0 && backups[0].size_bytes > 0 && backups[0].mode === '600',
    checkpoint_pointer_present: Boolean(pointer), active_checkpoint_present: checkpointExists,
    hermes_backups: backups.slice(0, 10), latest_backup_present: backups.length > 0,
  };
}

function evidencePrepare(project, root, runner = run) {
  const queue = project.slug === 'dial' ? queueHealth(root) : { check: 'queue_health', ok: null, reason: 'project-specific queue policy not registered' };
  const latestVerify = readJson(latestRel(project.slug, 'deterministic_verify'), null, root);
  return {
    check: 'evidence_prepare', ok: true,
    project: { slug: project.slug, name: project.name, repo_dir: project.repo_dir, manager_policy: project.manager_policy, development_authority: project.development_authority },
    repository: repoIntegrity(project, runner), services: serviceHealth(project, runner), queue,
    deterministic_verification: latestVerify?.evidence ?? { check: 'deterministic_verify', ok: null, reason: 'no scheduled verification evidence yet' },
    backups: project.slug === 'dial' ? backupVerify(root) : { check: 'backup_verify', ok: null, reason: 'project-specific backup policy not registered' },
    control_plane: project.slug === 'dial' ? readJson('state/control-plane.json', null, root) : null,
    development_gate: project.slug === 'dial' ? readJson('state/external-orchestration-gate.json', null, root) : null,
    external_orchestrator_heartbeat: project.slug === 'dial' ? readJson('state/external-orchestrator-heartbeat.json', null, root) : null,
    runtime_health: project.slug === 'dial' ? readJson('state/runtime-health.json', null, root) : null,
  };
}

export async function runOperationsJob({ job, projectSlug = 'dial', root, useApi = false, runner = run } = {}) {
  ensureControlLayout(root); ensureProjectRegistry(root);
  if (!ALLOWED_OPERATION_JOBS.includes(job)) throw new Error(`unsupported operations job: ${job}`);
  const project = getProject(projectSlug, root); const observedAt = now();
  let evidence;
  if (job === 'service_health') evidence = serviceHealth(project, runner);
  if (job === 'service_recovery') evidence = serviceRecovery(project, runner);
  if (job === 'queue_health') evidence = project.slug === 'dial' ? queueHealth(root) : { check: job, ok: null, reason: 'project-specific queue policy not registered' };
  if (job === 'repo_integrity') evidence = repoIntegrity(project, runner);
  if (job === 'deterministic_verify') evidence = deterministicVerify(project, runner);
  if (job === 'backup_verify') evidence = project.slug === 'dial' ? backupVerify(root) : { check: job, ok: null, reason: 'project-specific backup policy not registered' };
  if (job === 'evidence_prepare') evidence = evidencePrepare(project, root, runner);
  const api_summary = useApi ? await summarizeOperationsEvidence({ purpose: `${job} for ${project.slug}`, evidence, root }) : { authority: OPERATIONS_API_AUTHORITY, state: 'NOT_REQUESTED', summary: null };
  const record = { schema_version: 2, authority: OPERATIONS_AUTHORITY, development_authority: false, project: project.slug, job, evidence, api_summary, observed_at: observedAt };
  writeJsonAtomic(runRel(project.slug, job, observedAt), record, root); writeJsonAtomic(latestRel(project.slug, job), record, root);
  appendJsonl('events/operations-plane.jsonl', { event: 'OPERATIONS_JOB_COMPLETED', project: project.slug, job, evidence_ok: evidence?.ok ?? null, api_state: api_summary.state, authority: OPERATIONS_AUTHORITY, at: observedAt }, root);
  return record;
}

function defaultSchedules() {
  const at = now();
  return {
    schema_version: 2, policy: 'DETERMINISTIC_FIRST_API_OPTIONAL_NON_AUTHORITATIVE', schedules: [
      { id: 'dial-service-health', project: 'dial', job: 'service_health', interval_minutes: 5, enabled: true, use_api: false, last_run_at: null, next_run_at: at },
      { id: 'dial-service-recovery', project: 'dial', job: 'service_recovery', interval_minutes: 5, enabled: true, use_api: false, last_run_at: null, next_run_at: at },
      { id: 'dial-queue-health', project: 'dial', job: 'queue_health', interval_minutes: 5, enabled: true, use_api: false, last_run_at: null, next_run_at: at },
      { id: 'dial-repo-integrity', project: 'dial', job: 'repo_integrity', interval_minutes: 30, enabled: true, use_api: false, last_run_at: null, next_run_at: at },
      { id: 'dial-deterministic-verify', project: 'dial', job: 'deterministic_verify', interval_minutes: 360, enabled: true, use_api: false, last_run_at: null, next_run_at: at },
      { id: 'dial-evidence-prepare', project: 'dial', job: 'evidence_prepare', interval_minutes: 360, enabled: true, use_api: false, last_run_at: null, next_run_at: at },
      { id: 'dial-backup-verify', project: 'dial', job: 'backup_verify', interval_minutes: 360, enabled: true, use_api: false, last_run_at: null, next_run_at: at },
    ], updated_at: at,
  };
}

export function ensureOperationsSchedules(root) {
  ensureControlLayout(root); const existing = readJson(SCHEDULES_REL, null, root);
  if (existing?.schema_version === 2 && Array.isArray(existing.schedules)) return existing;
  const defaults = defaultSchedules();
  if (existing?.schedules) {
    const byId = new Map(existing.schedules.map((item) => [item.id, item]));
    defaults.schedules = defaults.schedules.map((item) => ({ ...item, ...(byId.get(item.id) || {}), job: item.job }));
  }
  writeJsonAtomic(SCHEDULES_REL, defaults, root); return defaults;
}

export function setOperationsSchedule({ project = 'dial', job, intervalMinutes, enabled = true, useApi = false } = {}, root) {
  if (!ALLOWED_OPERATION_JOBS.includes(job)) throw new Error(`unsupported operations job: ${job}`);
  getProject(project, root);
  const interval = Math.max(1, Math.min(10080, Number(intervalMinutes) || 60));
  const schedules = ensureOperationsSchedules(root); const id = `${project}-${job.replaceAll('_', '-')}`;
  const previous = schedules.schedules.find((item) => item.id === id);
  const item = { id, project, job, interval_minutes: interval, enabled: Boolean(enabled), use_api: Boolean(useApi), last_run_at: previous?.last_run_at ?? null, next_run_at: previous?.next_run_at ?? now() };
  const next = [...schedules.schedules.filter((entry) => entry.id !== id), item].sort((a, b) => a.id.localeCompare(b.id));
  writeJsonAtomic(SCHEDULES_REL, { ...schedules, schedules: next, updated_at: now() }, root); return item;
}

function due(entry, time = Date.now()) { return entry.enabled && Date.parse(entry.next_run_at || 0) <= time; }
export async function runDueOperations({ root } = {}) {
  const schedules = ensureOperationsSchedules(root); const completed = [];
  for (const entry of schedules.schedules.filter((item) => due(item))) {
    let result;
    try { result = await runOperationsJob({ job: entry.job, projectSlug: entry.project, root, useApi: entry.use_api }); }
    catch (error) { result = { error: String(error?.message || error).slice(0, 4000), authority: OPERATIONS_AUTHORITY }; appendJsonl('events/operations-plane.jsonl', { event: 'OPERATIONS_JOB_FAILED', project: entry.project, job: entry.job, reason: result.error, at: now() }, root); }
    const finished = now(); entry.last_run_at = finished; entry.next_run_at = new Date(Date.now() + entry.interval_minutes * 60000).toISOString(); completed.push({ schedule: entry.id, result });
  }
  if (completed.length) writeJsonAtomic(SCHEDULES_REL, { ...schedules, updated_at: now() }, root); return completed;
}

export function operationsStatus(root) {
  const projects = ensureProjectRegistry(root).projects; const schedules = ensureOperationsSchedules(root);
  return { schema_version: 2, authority: OPERATIONS_AUTHORITY, development_authority: false, api: operationsApiStatus(root), projects, schedules, last_runs: Object.fromEntries(projects.map((p) => [p.slug, Object.fromEntries(ALLOWED_OPERATION_JOBS.map((job) => [job, readJson(latestRel(p.slug, job), null, root)]))])), observed_at: now() };
}

export async function runOperationsDaemon({ root, pollMs = Number(process.env.DIAL_OPERATIONS_POLL_MS || DEFAULT_POLL_MS) } = {}) {
  ensureControlLayout(root); ensureProjectRegistry(root); ensureOperationsSchedules(root);
  let stopping = false; const stop = () => { stopping = true; };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  writeJsonAtomic('operations/heartbeat.json', { pid: process.pid, state: 'STARTING', authority: OPERATIONS_AUTHORITY, at: now() }, root);
  while (!stopping) {
    await runDueOperations({ root });
    writeJsonAtomic('operations/heartbeat.json', { pid: process.pid, state: 'RUNNING', authority: OPERATIONS_AUTHORITY, api_enabled: operationsApiStatus(root).enabled, at: now() }, root);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  writeJsonAtomic('operations/heartbeat.json', { pid: process.pid, state: 'STOPPED', authority: OPERATIONS_AUTHORITY, at: now() }, root);
}

function argValue(args, name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }
function parseBool(value, fallback = false) { if (value == null) return fallback; return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase()); }
async function main() {
  const command = process.argv[2] || 'status'; const args = process.argv.slice(3);
  if (command === 'init') { ensureProjectRegistry(); ensureOperationsSchedules(); return console.log(JSON.stringify(operationsStatus(), null, 2)); }
  if (command === 'status') return console.log(JSON.stringify(operationsStatus(), null, 2));
  if (command === 'run' || command === 'prepare') { const job = command === 'prepare' ? 'evidence_prepare' : args[0]; return console.log(JSON.stringify(await runOperationsJob({ job, projectSlug: argValue(args, '--project') || 'dial', useApi: args.includes('--use-api') }), null, 2)); }
  if (command === 'schedules') return console.log(JSON.stringify(ensureOperationsSchedules(), null, 2));
  if (command === 'schedule-set') return console.log(JSON.stringify(setOperationsSchedule({ project: argValue(args, '--project') || 'dial', job: argValue(args, '--job'), intervalMinutes: argValue(args, '--interval-minutes'), enabled: parseBool(argValue(args, '--enabled'), true), useApi: parseBool(argValue(args, '--use-api'), false) }), null, 2));
  if (command === 'projects') return console.log(JSON.stringify(listProjects(), null, 2));
  if (command === 'run-due') return console.log(JSON.stringify(await runDueOperations(), null, 2));
  if (command === 'daemon') return runOperationsDaemon();
  throw new Error(`unknown operations-plane command: ${command}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
