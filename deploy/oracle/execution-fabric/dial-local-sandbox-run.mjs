#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadPublicKey } from '../../../agent-system/orchestration/execution-fabric/venue-decision.mjs';
import { admitVenueDecision } from '../../../agent-system/orchestration/execution-fabric/venue-guard.mjs';
import { loadHostRole } from '../../../agent-system/orchestration/execution-fabric/host-role.mjs';
import { buildSandboxSpec, dockerRunArgv, assertSandboxArgs } from '../../../agent-system/orchestration/execution-fabric/sandbox-policy.mjs';

const root = process.env.DIAL_CONTROL_HOME || '/var/lib/dial-control';
const decision = JSON.parse(fs.readFileSync(process.argv[2] === '-' ? '/dev/stdin' : process.argv[2], 'utf8'));
const extra = process.argv.slice(3);
const denied = assertSandboxArgs(extra);
if (!denied.ok) {
  console.error(JSON.stringify({ ok: false, reason: denied.reason }));
  process.exit(2);
}

const admission = admitVenueDecision({
  decision,
  publicKey: loadPublicKey(fs.readFileSync(`${root}/secrets/venue-ed25519.pub`, 'utf8')),
  hostRole: loadHostRole('/etc/dial/host-role'),
  heartbeatPath: `${root}/state/venue-guard.json`,
});
if (!admission.ok) {
  console.error(JSON.stringify({ ok: false, reason: admission.reason }));
  process.exit(2);
}

const taskId = decision.unit_id || 'unknown';
fs.mkdirSync(`/srv/dial/workspaces/${taskId}`, { recursive: true, mode: 0o700 });
const spec = buildSandboxSpec({
  taskId,
  jobToken: process.env.MCP_JOB_TOKEN || `job-${taskId}`,
});
const args = dockerRunArgv({ ...spec, task_id: taskId });
if (extra.length) args.push(...extra);
const run = spawnSync('docker', args, { stdio: 'inherit' });
process.exit(run.status ?? 1);
