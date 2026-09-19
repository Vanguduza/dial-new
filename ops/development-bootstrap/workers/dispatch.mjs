#!/usr/bin/env node
// Control-host side: dispatch an allowlisted job to a worker and verify the sealed receipt.
// Transports: `local` (self-test; runs the worker executor in-process on this host) and `ssh`
// (forced-command key on the worker; the remote command is fixed by authorized_keys, never by us).
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertWorkloadAllowed } from '../roles/role-guard.mjs';
import { run } from '../lib/probes.mjs';
import { executeWorkerJob, verifyReceipt, JOB_KINDS } from './vekl-worker-job.mjs';

export async function dispatchWorkerJob({ kind, repoDir, transport = 'local', sshHost = process.env.DIAL_WORKER_SSH_HOST, sshUser = process.env.DIAL_WORKER_SSH_USER || 'ubuntu', sshKey = process.env.DIAL_WORKER_SSH_KEY, correlationId = crypto.randomUUID(), repoSha = null, env = process.env, dispatcherEnv = env, workerEnv = env, workerRoot } = {}) {
  if (!JOB_KINDS[kind]) throw new Error(`job kind ${kind} is not allowlisted`);
  const dispatcher = assertWorkloadAllowed({ workload: transport === 'local' ? 'DIAGNOSTICS' : 'WORKER_DISPATCH', env: dispatcherEnv });
  const job = { job_id: crypto.randomUUID(), correlation_id: correlationId, kind, repo_sha: repoSha, dispatched_by: { role: dispatcher.role, at: new Date().toISOString() } };
  let receipt;
  if (transport === 'local') {
    receipt = await executeWorkerJob(job, { repoDir, env: workerEnv, workerRoot });
  } else if (transport === 'ssh') {
    if (!sshHost) throw new Error('DIAL_WORKER_SSH_HOST is not set');
    const args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=yes'];
    if (sshKey) args.push('-i', sshKey);
    const r = run('ssh', [...args, `${sshUser}@${sshHost}`, 'dial-worker-job'], { timeoutMs: 45 * 60 * 1000, input: JSON.stringify(job) });
    if (!r.ok && !r.output) throw new Error(`ssh dispatch failed: ${r.error || r.status}`);
    try { receipt = JSON.parse(r.output.split('\n').filter((l) => l.startsWith('{')).pop()); } catch { throw new Error(`worker returned no receipt: ${r.output.slice(0, 200)}`); }
  } else throw new Error(`unknown transport ${transport}`);
  const sealed = verifyReceipt(receipt);
  return { job, receipt, receipt_verified: sealed, ok: sealed && receipt.state === 'COMPLETED' && receipt.correlation_id === correlationId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const kind = process.argv[2] || 'REPO_HEAD'; const transport = process.argv[3] || 'local';
  const repoDir = process.env.DIAL_REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
  const r = await dispatchWorkerJob({ kind, transport, repoDir });
  console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1);
}
