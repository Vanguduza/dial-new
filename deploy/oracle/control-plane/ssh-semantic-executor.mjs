#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { route } from './hybrid-router.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(fs.readFileSync(path.join(here, 'CONTROL_PLANE_REGISTRY.json'), 'utf8'));
const rfHosts = JSON.parse(fs.readFileSync(path.join(here, '../resource-fabric/hosts.json'), 'utf8'));

const SAFE_SERVICE = /^[a-zA-Z0-9_.@:-]+$/;
const OPS = Object.freeze({
  HOST_HEALTH: { workload_class: 'DIAGNOSTICS', build: () => "printf 'HOST='; hostname; uptime; free -m; df -h /" },
  SSH_STATUS: { workload_class: 'DIAGNOSTICS', build: () => "systemctl is-active ssh || systemctl is-active sshd" },
  SERVICE_STATUS: { workload_class: 'DIAGNOSTICS', build: (a) => { if (!SAFE_SERVICE.test(a.service || '')) throw new Error('INVALID_SERVICE'); return `systemctl status --no-pager -- ${a.service}`; } },
  GIT_METADATA: { workload_class: 'GIT_METADATA_READ', build: (a) => { const p = String(a.path || ''); if (!/^\/[a-zA-Z0-9_./-]+$/.test(p)) throw new Error('INVALID_PATH'); return `git -C ${JSON.stringify(p)} status --short --branch`; } }
});

function hostRecord(hostId) { return rfHosts.hosts.find((h) => h.host_id === hostId) ?? null; }
function sshHost(hostId) {
  const envKey = `DIAL_FABRIC_${hostId.toUpperCase().replaceAll('-', '_')}_SSH_HOST`;
  return process.env[envKey] || hostRecord(hostId)?.private_ip || null;
}

export function planSemanticOperation({ operation, target_host, args = {} }) {
  const spec = OPS[operation];
  if (!spec) return { decision: 'REFUSE', reason: 'UNKNOWN_SEMANTIC_OPERATION' };
  const routed = route({ workload_class: spec.workload_class, target_host }, { localHost: os.hostname() });
  if (routed.decision !== 'ALLOW') return routed;
  const command = spec.build(args);
  return { ...routed, operation, command };
}

export function executeSemanticOperation(request, { dryRun = false } = {}) {
  const plan = planSemanticOperation(request);
  if (plan.decision !== 'ALLOW' || dryRun) return plan;
  if (plan.transport === 'LOCAL') {
    const p = spawnSync('/bin/bash', ['-lc', plan.command], { encoding: 'utf8', timeout: 15000 });
    return { ...plan, exit_code: p.status, stdout: p.stdout, stderr: p.stderr };
  }
  if (plan.transport !== 'DIRECT_SSH') return { ...plan, decision: 'REFUSE', reason: 'TRANSPORT_EXECUTOR_NOT_ENABLED' };
  const host = sshHost(plan.target_host);
  if (!host) return { ...plan, decision: 'REFUSE', reason: 'SSH_HOST_UNRESOLVED' };
  const user = process.env.DIAL_FABRIC_SSH_USER || 'ubuntu';
  const p = spawnSync('ssh', ['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=5', `${user}@${host}`, plan.command], { encoding: 'utf8', timeout: 20000 });
  return { ...plan, exit_code: p.status, stdout: p.stdout, stderr: p.stderr };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const req = JSON.parse(process.argv[2] || fs.readFileSync(0, 'utf8'));
  const result = executeSemanticOperation(req, { dryRun: process.env.DIAL_DRY_RUN === '1' });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.decision === 'ALLOW' && (result.exit_code === undefined || result.exit_code === 0) ? 0 : 3);
}
