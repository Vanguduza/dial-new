#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { route, allowedOnHost } from './hybrid-router.mjs';

const DENY_PATTERNS = [
  [/\bnpm\s+(ci|install|test)\b/i, 'TEST'],
  [/\bnpm\s+run\s+(verify|build|test)\b/i, 'TEST'],
  [/\bpnpm\s+(install|test|build)\b/i, 'TEST'],
  [/\bgradle(w)?\b.*\b(build|assemble|test)\b/i, 'HEAVY_BUILD'],
  [/\bdocker\s+build\b/i, 'HEAVY_BUILD'],
  [/\btsc\b/i, 'HEAVY_BUILD'],
  [/\bvitest\b/i, 'TEST'],
  [/\b(graphify|graphrag)\b.*\b(index|build|rebuild)\b/i, 'INDEXING_LIGHT'],
  [/\bvekl\b.*\b(full|rebuild|refresh)\b/i, 'VEKL_LIGHT'],
];

const ALLOW_PATTERNS = [
  [/^\s*(uptime|free|df|ss|ip|hostname|id|whoami)\b/i, 'DIAGNOSTICS'],
  [/^\s*git\s+(status|log|show|diff|rev-parse|branch)\b/i, 'GIT_METADATA_READ'],
  [/^\s*(systemctl|journalctl)\s+(status|show|is-active|is-enabled)\b/i, 'DIAGNOSTICS'],
  [/^\s*oci\b/i, 'OCI_CONTROL'],
  [/^\s*ssh\b/i, 'SSH_BROKER'],
];

export function classifyCommand(command) {
  const text = String(command ?? '').trim();
  for (const [re, workload] of DENY_PATTERNS) if (re.test(text)) return { workload_class: workload, confidence: 'EXPLICIT_DENY_PATTERN' };
  for (const [re, workload] of ALLOW_PATTERNS) if (re.test(text)) return { workload_class: workload, confidence: 'EXPLICIT_ALLOW_PATTERN' };
  return { workload_class: null, confidence: 'AMBIGUOUS' };
}

export function auditEvent({ source, command, workloadClass, decision, reason, host = os.hostname() }) {
  return {
    schema_version: 1,
    event: decision === 'ALLOW' ? 'WORKLOAD_ADMISSION' : 'RECOVERY_ROLE_VIOLATION',
    host,
    source,
    workload_class: workloadClass,
    decision,
    reason,
    command_sha256: crypto.createHash('sha256').update(command).digest('hex'),
    timestamp: new Date().toISOString(),
  };
}

export function admit({ command, source = 'UNKNOWN', host = os.hostname(), declaredWorkload = null }) {
  const inferred = declaredWorkload ? { workload_class: String(declaredWorkload).toUpperCase(), confidence: 'DECLARED' } : classifyCommand(command);
  if (!inferred.workload_class) {
    return { decision: 'REFUSE', reason: 'AMBIGUOUS_WORKLOAD_FAIL_CLOSED', host, source, classification: inferred };
  }
  if (!allowedOnHost(host, inferred.workload_class)) {
    return { decision: 'REFUSE', reason: 'HOST_ROLE_MISMATCH', host, source, classification: inferred };
  }
  const routed = route({ workload_class: inferred.workload_class, target_host: host }, { localHost: host });
  if (routed.decision !== 'ALLOW') return { ...routed, host, source, classification: inferred };
  return { decision: 'ALLOW', reason: 'HOST_ROLE_MATCH', host, source, classification: inferred };
}

function appendAudit(event) {
  const file = process.env.DIAL_CONTROL_AUDIT_LOG;
  if (!file) return;
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, { encoding: 'utf8' });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const execute = args[0] === '--exec';
  if (execute) args.shift();
  const command = args.join(' ');
  const source = process.env.DIAL_COMMAND_SOURCE || 'CLI';
  const result = admit({ command, source, declaredWorkload: process.env.DIAL_WORKLOAD_CLASS || null });
  appendAudit(auditEvent({ source, command, workloadClass: result.classification?.workload_class ?? null, decision: result.decision, reason: result.reason }));
  if (result.decision !== 'ALLOW') {
    console.error(JSON.stringify(result, null, 2));
    process.exit(3);
  }
  if (!execute) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }
  const child = spawnSync('/bin/bash', ['-lc', command], { stdio: 'inherit' });
  process.exit(child.status ?? 1);
}
