#!/usr/bin/env node
// Controlled failure injection (mission section 35) against test harnesses, never live services.
// Each scenario must fail VISIBLY, BOUNDED, CLASSIFIED and never route into an unsafe substitute.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runE2ESelfTest } from './e2e-selftest.mjs';
import { assertWorkloadAllowed, RoleGuardError } from '../roles/role-guard.mjs';
import { loadRoles } from '../lib/manifest.mjs';

function healthy(runtime, model, nowIso) { return { runtime, state: 'HEALTHY', requested_model: model, resolved_model: model, identity_proven: true, details: { toolchain_usable: true }, observed_at: nowIso, checked_at: nowIso }; }

export async function runFaultInjection({ repoDir } = {}) {
  const nowIso = new Date().toISOString();
  const mod = (rel) => import(pathToFileURL(path.join(repoDir, rel)).href);
  const scenarios = [];
  const record = (id, expectation, outcome, ok) => scenarios.push({ id, expectation, outcome, ok });

  // S1 primary provider unavailable -> exact Sonnet fallback (no third model).
  {
    const health = { runtimes: { codex_app_server: { ...healthy('codex_app_server', 'gpt-5.6-sol', nowIso), state: 'PROCESS_FAILED' }, claude_code: healthy('claude_code', 'claude-sonnet-5', nowIso) } };
    const r = await runE2ESelfTest({ repoDir, runtimeHealth: health });
    const sel = r.stages.find((s) => s.stage === 'PROVIDER_SELECTION');
    record('provider-primary-unavailable', 'exact claude-sonnet-5 fallback selected, classified as HERMES_FALLBACK_RUNTIME', { selected_runtime: sel?.selected_runtime, model: sel?.selected_model, role: sel?.role }, sel?.selected_runtime === 'claude_code' && sel?.selected_model === 'claude-sonnet-5');
  }
  // S2 both providers unavailable -> fail closed NO_HERMES_RUNTIME_AVAILABLE.
  {
    const health = { runtimes: { codex_app_server: { ...healthy('codex_app_server', 'gpt-5.6-sol', nowIso), state: 'AUTH_FAILED' }, claude_code: { ...healthy('claude_code', 'claude-sonnet-5', nowIso), state: 'AUTH_FAILED' } } };
    const r = await runE2ESelfTest({ repoDir, runtimeHealth: health });
    record('provider-total-loss', 'visible NO_HERMES_RUNTIME_AVAILABLE; no substitute', { ok: r.ok, code: r.code, error: r.error }, !r.ok && r.code === 'NO_HERMES_RUNTIME_AVAILABLE');
  }
  // S3 invalid credential / wrong model identity -> alternate Sonnet-class or Opus never executes.
  {
    const health = { runtimes: { codex_app_server: { ...healthy('codex_app_server', 'gpt-5.6-sol', nowIso), state: 'AUTH_FAILED' }, claude_code: healthy('claude_code', 'claude-opus-5', nowIso) } };
    const { selectHermesRuntime } = await mod('agent-system/orchestration/hermes-runtime-router.mjs');
    const c = selectHermesRuntime(health);
    record('alternate-model-identity', 'claude-opus-5 identity rejected as a Hermes slot', { candidate: c }, c === null);
  }
  // S4 stale identity evidence -> not executable.
  {
    const old = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const health = { runtimes: { codex_app_server: healthy('codex_app_server', 'gpt-5.6-sol', old), claude_code: healthy('claude_code', 'claude-sonnet-5', old) } };
    const { selectHermesRuntime } = await mod('agent-system/orchestration/hermes-runtime-router.mjs');
    const c = selectHermesRuntime(health);
    record('stale-runtime-evidence', 'stale (20h) identity evidence is not executable', { candidate: c }, c === null);
  }
  // S5 role mismatch -> refused, classified.
  {
    const roles = loadRoles();
    const outcomes = {};
    for (const [role, w] of [['oracle-admin', 'REPOSITORY_WRITE'], ['vekl-worker', 'OWNER_CONTROL'], ['provider-container', 'HERMES_RUNTIME'], ['oracle-admin', 'HERMES_RUNTIME']]) {
      try { assertWorkloadAllowed({ workload: w, env: { DIAL_HOST_ROLE: role }, roles }); outcomes[`${role}:${w}`] = 'ALLOWED'; }
      catch (e) { outcomes[`${role}:${w}`] = e instanceof RoleGuardError ? e.code : `UNEXPECTED:${e.message}`; }
    }
    record('role-mismatch', 'every mismatched workload refused with WORKLOAD_FORBIDDEN_FOR_ROLE', outcomes, Object.values(outcomes).every((v) => v === 'WORKLOAD_FORBIDDEN_FOR_ROLE'));
  }
  // S6 unknown host role -> fail closed.
  {
    let code = null; try { assertWorkloadAllowed({ workload: 'DIAGNOSTICS', env: {}, roleFile: '/nonexistent/dial-role', hostname: 'unregistered-host' }); code = 'ALLOWED'; } catch (e) { code = e.code; }
    record('unknown-host-role', 'ROLE_UNKNOWN refuses even DIAGNOSTICS', { code }, code === 'ROLE_UNKNOWN');
  }
  // S7 stale knowledge -> admission guard refuses (REFUSED_STALE_KNOWLEDGE).
  {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-fault-'));
    try {
      const r = await runE2ESelfTest({ repoDir, controlRoot: root, keepRoot: true });
      const { checkKnowledgeBinding } = await mod('agent-system/orchestration/knowledge-admission-guard.mjs');
      const fresh = checkKnowledgeBinding({ repoDir, root, packetId: r.correlation_id });
      // Corrupt the persisted binding to simulate Project Truth moving under the packet.
      const bindingFile = path.join(root, 'knowledge/admission/by-packet', `${r.correlation_id}.json`);
      let mutated = 0;
      if (fs.existsSync(bindingFile)) { const j = JSON.parse(fs.readFileSync(bindingFile, 'utf8')); j.project_truth_hash = '0'.repeat(64); fs.writeFileSync(bindingFile, JSON.stringify(j)); mutated = 1; }
      const stale = checkKnowledgeBinding({ repoDir, root, packetId: r.correlation_id });
      record('stale-knowledge-binding', 'fresh binding ok=true; mutated project_truth_hash -> ok=false with PROJECT_TRUTH_HASH_CHANGED', { fresh_ok: fresh.ok, stale_ok: stale.ok, reasons: stale.reasons, mutated }, fresh.ok === true && stale.ok === false && mutated > 0);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // S8 development gate absent -> ordinary work blocked (fail-closed external orchestrator).
  {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-fault-'));
    try {
      const { evaluateDevelopmentUnblock } = await mod('agent-system/orchestration/development-unblock.mjs');
      const ev = evaluateDevelopmentUnblock({ repoDir, root });
      record('development-gate-absent', 'DEVELOPMENT_BLOCKED with gate_present=false', { unblocked: ev.unblocked, gate_present: ev.checks?.gate_present }, ev.unblocked === false && ev.checks?.gate_present === false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
  // S9 GitHub unreachable -> network check fails visibly (simulated via unroutable host).
  {
    const { httpsReach } = await import('../lib/probes.mjs');
    const r = await httpsReach('https://203.0.113.1/', { timeoutMs: 1500 });
    record('github-unreachable', 'unreachable endpoint reports ok=false with a bounded timeout, no hang', { ok: r.ok, error: r.error, duration_ms: r.duration_ms }, r.ok === false && r.duration_ms < 5000);
  }
  return { ok: scenarios.every((s) => s.ok), scenarios };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoDir = process.env.DIAL_REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
  const r = await runFaultInjection({ repoDir }); console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1);
}
