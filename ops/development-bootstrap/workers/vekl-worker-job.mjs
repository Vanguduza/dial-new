#!/usr/bin/env node
// Worker-side job executor for the vekl-worker role (and, for self-test, any role that allows WORKER_JOB).
// Only allowlisted job kinds run; each produces a hash-sealed receipt. There is no generic shell.
//
//   node workers/vekl-worker-job.mjs --job '<json>'            (job on argv)
//   echo '<json>' | node workers/vekl-worker-job.mjs --stdin     (forced-command SSH mode)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertWorkloadAllowed } from '../roles/role-guard.mjs';
import { run, git, hostFacts } from '../lib/probes.mjs';
import { redact } from '../lib/log.mjs';

export const JOB_KINDS = Object.freeze({
  CAPABILITY_ENVELOPE: { workload: 'DIAGNOSTICS', description: 'publish host capability/health envelope', network: false },
  REPO_HEAD: { workload: 'DIAGNOSTICS', description: 'report repository HEAD and cleanliness', network: false },
  DETERMINISTIC_VERIFY: { workload: 'DETERMINISTIC_VERIFY', description: 'npm run verify on the worker checkout', network: false },
  VEKL_RESEARCH_REFRESH: { workload: 'VEKL_RESEARCH', description: 'ahead-of-work presearch refresh (allowlisted sources only)', network: true },
  STRUCTURAL_SNAPSHOT: { workload: 'STRUCTURAL_SNAPSHOT', description: 'TypeScript structural code-graph snapshot (Graphify only when qualified)', network: false },
});

function seal(receipt) { const body = { ...receipt }; delete body.receipt_hash; return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex'); }

export async function executeWorkerJob(job, { repoDir, workerRoot = process.env.DIAL_WORKER_HOME || path.join(os.homedir(), '.dial-worker'), env = process.env } = {}) {
  const started = new Date().toISOString();
  const receipt = { schema_version: 1, job_id: job.job_id || crypto.randomUUID(), correlation_id: job.correlation_id || null, kind: job.kind, worker: { hostname: os.hostname(), role: null }, started_at: started, state: 'FAILED', result: null, error: null };
  try {
    const spec = JOB_KINDS[job.kind];
    if (!spec) throw Object.assign(new Error(`job kind ${job.kind} is not allowlisted`), { code: 'JOB_KIND_NOT_ALLOWED' });
    const guard = assertWorkloadAllowed({ workload: spec.workload, env });
    receipt.worker.role = guard.role;
    if (job.repo_sha) { const head = git(repoDir, ['rev-parse', 'HEAD']).output; if (head !== job.repo_sha) throw Object.assign(new Error(`worker checkout ${head} != requested ${job.repo_sha}`), { code: 'REPO_SHA_MISMATCH' }); }
    switch (job.kind) {
      case 'CAPABILITY_ENVELOPE': receipt.result = { host: hostFacts(), toolchains: Object.fromEntries(['node', 'npm', 'git', 'python3', 'rg'].map((b) => [b, run(b, ['--version'], { timeoutMs: 8000 }).output.split('\n')[0] || null])) }; break;
      case 'REPO_HEAD': receipt.result = { head: git(repoDir, ['rev-parse', 'HEAD']).output, branch: git(repoDir, ['branch', '--show-current']).output, dirty: git(repoDir, ['status', '--porcelain']).output.split('\n').filter(Boolean).length }; break;
      case 'DETERMINISTIC_VERIFY': { const r = run('npm', ['run', '--silent', 'verify'], { cwd: repoDir, timeoutMs: 40 * 60 * 1000 }); receipt.result = { ok: r.ok, exit: r.status, duration_ms: r.duration_ms, tail: r.output.split('\n').slice(-5) }; if (!r.ok) throw Object.assign(new Error('verify failed'), { code: 'VERIFY_FAILED' }); break; }
      case 'VEKL_RESEARCH_REFRESH': { const r = run('node', ['agent-system/orchestration/engineering-presearch.mjs', 'refresh'], { cwd: repoDir, timeoutMs: 20 * 60 * 1000, env: { ...env, DIAL_CONTROL_HOME: workerRoot } }); receipt.result = { ok: r.ok, exit: r.status, tail: r.output.split('\n').slice(-5) }; if (!r.ok) throw Object.assign(new Error('presearch refresh failed'), { code: 'RESEARCH_FAILED' }); break; }
      case 'STRUCTURAL_SNAPSHOT': {
        const mod = await import(pathToFileURL(path.join(repoDir, 'agent-system/orchestration/structural-code-graph-provider.mjs')).href);
        const sr = await import(pathToFileURL(path.join(repoDir, 'agent-system/orchestration/structural-reality.mjs')).href);
        const provider = new mod.TypeScriptStructuralCodeGraphProvider();
        const repoSha = git(repoDir, ['rev-parse', 'HEAD']).output;
        const snapshot = provider.build({ repoDir, repoSha, declarations: job.declarations || ['agent-system/**/*.mjs', 'packages/**/*.ts', 'apps/**/*.ts'] });
        const published = typeof sr.publishStructuralSnapshot === 'function' ? sr.publishStructuralSnapshot({ root: workerRoot, snapshot }) : null;
        receipt.result = { provider: snapshot.provider, provider_version: snapshot.provider_version, repo_sha: repoSha, nodes: snapshot.nodes?.length ?? null, edges: snapshot.edges?.length ?? null, snapshot_hash: snapshot.snapshot_hash || snapshot.identity_hash || null, published: published ? (published.generation_id || published.path || true) : null, authority: 'SUBORDINATE_STRUCTURAL_EVIDENCE' };
        break;
      }
      default: throw new Error('unreachable');
    }
    receipt.state = 'COMPLETED';
  } catch (e) {
    receipt.error = { code: e.code || 'WORKER_JOB_FAILED', message: redact(e.message), detail: e.detail || null };
  }
  receipt.completed_at = new Date().toISOString();
  receipt.receipt_hash = seal(receipt);
  fs.mkdirSync(path.join(workerRoot, 'receipts'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(workerRoot, 'receipts', `${receipt.job_id}.json`), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  return receipt;
}

export function verifyReceipt(receipt) { return Boolean(receipt?.receipt_hash) && seal(receipt) === receipt.receipt_hash; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  let job;
  if (argv.includes('--stdin')) { let s = ''; for await (const c of process.stdin) s += c; job = JSON.parse(s); }
  else { const i = argv.indexOf('--job'); job = JSON.parse(argv[i + 1]); }
  const repoDir = process.env.DIAL_REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
  const r = await executeWorkerJob(job, { repoDir });
  console.log(JSON.stringify(r));
  process.exit(r.state === 'COMPLETED' ? 0 : 1);
}
