#!/usr/bin/env node
// DIAL development-system bootstrap and certification entrypoint.
//
//   node ops/development-bootstrap/bootstrap.mjs --dry-run   [--role <role>]   plan convergence, change nothing
//   node ops/development-bootstrap/bootstrap.mjs --verify    [--role <role>]   certify current state, write report
//   node ops/development-bootstrap/bootstrap.mjs --apply     [--role <role>]   converge (detect-first, backups)
//   node ops/development-bootstrap/bootstrap.mjs --repair    [--role <role>]   verify, then apply only failed items
//   node ops/development-bootstrap/bootstrap.mjs --rollback <run-id>          restore files changed by a run
//   node ops/development-bootstrap/bootstrap.mjs --self-test | --determinism | --fault-injection
//   flags: --json (machine output only) --fast (skip long repository gates) --out <file> --control-home <dir>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadManifest, loadRoles, BOOTSTRAP_DIR } from './lib/manifest.mjs';
import { createLogger } from './lib/log.mjs';
import { resolveHostRole } from './roles/role-guard.mjs';
import { certify, renderMatrix } from './verify/certify.mjs';
import { planActions, executeActions } from './repair/repair.mjs';
import { rollback, listBackups } from './rollback/rollback.mjs';
import { runE2ESelfTest } from './selftest/e2e-selftest.mjs';
import { runDeterminism } from './selftest/determinism.mjs';
import { runFaultInjection } from './selftest/fault-injection.mjs';

const MODES = ['dry-run', 'verify', 'apply', 'repair', 'rollback', 'self-test', 'determinism', 'fault-injection', 'plan'];

export function parseArgs(argv) {
  const out = { mode: null, role: null, json: false, fast: false, out: null, controlHome: null, repo: null, runId: null, rollbackId: null, keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--role') out.role = next();
    else if (a === '--json') out.json = true;
    else if (a === '--fast') out.fast = true;
    else if (a === '--out') out.out = next();
    else if (a === '--control-home') out.controlHome = next();
    else if (a === '--repo') out.repo = next();
    else if (a === '--rollback') { out.mode = 'rollback'; out.rollbackId = next(); }
    else if (a.startsWith('--') && MODES.includes(a.slice(2))) out.mode = a.slice(2);
    else throw new Error(`unknown argument ${a}`);
  }
  if (!out.mode) out.mode = 'dry-run';
  return out;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const repoDir = path.resolve(args.repo || process.env.DIAL_REPO_DIR || path.resolve(BOOTSTRAP_DIR, '../..'));
  const manifest = loadManifest();
  const roles = loadRoles();
  const resolved = resolveHostRole();
  const role = args.role || (resolved.role !== 'UNKNOWN' ? resolved.role : null);
  if (!role) { const msg = `host role UNKNOWN (${resolved.reason}); pass --role <${Object.keys(roles.roles).join('|')}> or declare /etc/dial/host-role`; if (args.json) console.log(JSON.stringify({ ok: false, error: msg })); else console.error(msg); return 4; }
  if (!roles.roles[role]) throw new Error(`undeclared role ${role}`);
  const controlHome = args.controlHome || process.env.DIAL_CONTROL_HOME || roles.roles[role].control_home || path.join(os.tmpdir(), 'dial-bootstrap-control');
  const runId = args.runId || `run-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}-${crypto.randomBytes(3).toString('hex')}`;
  const logDir = fs.existsSync(controlHome) ? path.join(controlHome, 'bootstrap', 'logs') : path.join(os.tmpdir(), 'dial-bootstrap-logs');
  const log = createLogger({ file: path.join(logDir, `${runId}.jsonl`), runId, json: args.json });
  log.info('bootstrap.start', { mode: args.mode, role, resolved_role: resolved.role, repo: repoDir, control_home: controlHome, manifest: manifest.manifest_id });
  const emit = (obj) => { if (args.json) console.log(JSON.stringify(obj, null, 2)); };
  const writeOut = (obj) => { if (args.out) { fs.mkdirSync(path.dirname(args.out), { recursive: true }); fs.writeFileSync(args.out, `${JSON.stringify(obj, null, 2)}\n`); log.info('bootstrap.report-written', { file: args.out }); } };

  if (args.mode === 'rollback') { const r = rollback({ controlHome, runId: args.rollbackId, dryRun: false }); emit(r); writeOut(r); return 0; }
  if (args.mode === 'self-test') { const r = await runE2ESelfTest({ repoDir }); emit(r); writeOut(r); if (!args.json) console.log(r.ok ? `SELF-TEST PASS ${r.correlation_id}\n${r.response}` : `SELF-TEST FAIL ${r.error}`); return r.ok ? 0 : 1; }
  if (args.mode === 'determinism') { const r = await runDeterminism({ repoDir, runs: 3 }); emit(r); writeOut(r); if (!args.json) console.log(r.ok ? `DETERMINISM PASS (${r.runs} runs identical)` : `DETERMINISM FAIL ${JSON.stringify(r.decision_hashes)}`); return r.ok ? 0 : 1; }
  if (args.mode === 'fault-injection') { const r = await runFaultInjection({ repoDir }); emit(r); writeOut(r); if (!args.json) console.log(`${r.ok ? 'FAULT-INJECTION PASS' : 'FAULT-INJECTION FAIL'}\n${r.scenarios.map((s) => `${s.ok ? '✓' : '✗'} ${s.id}`).join('\n')}`); return r.ok ? 0 : 1; }

  if (args.mode === 'dry-run' || args.mode === 'plan' || args.mode === 'apply' || args.mode === 'repair') {
    let checks = [];
    if (args.mode === 'repair') { const pre = await certify({ repoDir, controlHome, manifest, role, runId, log, fast: true, skipRepositoryGates: true }); checks = pre.checks; }
    const actions = planActions({ role, manifest, repoDir, controlHome, checks });
    const results = executeActions({ actions, dryRun: args.mode !== 'apply' && args.mode !== 'repair', controlHome, runId, log });
    const out = { run_id: runId, mode: args.mode, role, control_home: controlHome, actions: results, backups: listBackups(controlHome).slice(-5) };
    emit(out); writeOut(out);
    if (!args.json) console.log(results.map((r) => `${r.state.padEnd(22)} ${r.id}  ${r.title}`).join('\n'));
    if (args.mode === 'apply' || args.mode === 'repair') { const post = await certify({ repoDir, controlHome, manifest, role, runId, log, fast: true, skipRepositoryGates: true }); if (!args.json) console.log(`\npost-apply verdict: ${post.overall_status} — ${post.verdict_reason}`); return post.overall_status === 'GREEN' ? 0 : 1; }
    return 0;
  }
  if (args.mode === 'verify') {
    const report = await certify({ repoDir, controlHome, manifest, role, runId, log, fast: args.fast });
    emit(report); writeOut(report);
    if (!args.json) { console.log(renderMatrix(report.readiness_matrix)); console.log(`\nVERDICT: ${report.overall_status} — ${report.verdict_reason}`); console.log(`checks: ${JSON.stringify(report.summary.counts)}`); if (report.blocking_gates.length) console.log(`blocking gates: ${report.blocking_gates.map((g) => g.gate_id).join(', ')}`); }
    return report.overall_status === 'GREEN' ? 0 : report.overall_status === 'AMBER' ? 2 : 1;
  }
  throw new Error(`unhandled mode ${args.mode}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code)).catch((e) => { console.error(`bootstrap error: ${e.message}`); process.exit(1); });
}
