#!/usr/bin/env node
// Fail-closed host role guard.
//
//   node ops/development-bootstrap/roles/role-guard.mjs --workload HERMES_RUNTIME
//   exit 0 = allowed, exit 3 = refused, exit 4 = role unknown (refused)
//
// Resolution order (roles.json#resolution_order): DIAL_HOST_ROLE env -> /etc/dial/host-role ->
// provider-container detection -> hostname alias -> UNKNOWN. UNKNOWN never permits a governed workload.
// The guard is a library (assertWorkloadAllowed) and a CLI so schedulers, installers and direct host
// commands all consult the same decision.
import fs from 'node:fs';
import os from 'node:os';
import { loadRoles } from '../lib/manifest.mjs';

export const ROLE_FILE = '/etc/dial/host-role';

export class RoleGuardError extends Error {
  constructor(code, message, detail = {}) { super(message); this.code = code; this.detail = detail; }
}

// Accepts either a bare role name or key=value lines (ROLE=... HOSTNAME=... NODE_ID=...), the format used by the
// unmerged execution-fabric lineage (agent-system/orchestration/execution-fabric/host-role.mjs), so one file serves both.
export function parseRoleFile(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  for (const line of lines) { const m = line.match(/^(ROLE|role)\s*=\s*(.+)$/); if (m) return m[2].trim(); }
  return lines.find((l) => !l.includes('=')) || '';
}

export function detectProviderContainer(env = process.env) {
  if (env.CLAUDE_CODE_REMOTE === 'true' || env.CLAUDE_CODE_REMOTE === '1' || env.CLAUDE_CODE_REMOTE_SESSION_ID) return { provider: 'claude-code-remote', evidence: 'CLAUDE_CODE_REMOTE' };
  if (env.CODEX_SANDBOX || env.CODEX_CLOUD_SESSION || env.CODEX_ENV_ID) return { provider: 'codex-cloud', evidence: 'CODEX_* environment' };
  return null;
}

export function resolveHostRole({ env = process.env, roleFile = ROLE_FILE, hostname = os.hostname(), roles = loadRoles() } = {}) {
  const known = roles.roles;
  if (env.DIAL_HOST_ROLE) {
    if (!known[env.DIAL_HOST_ROLE]) return { role: 'UNKNOWN', source: 'env', reason: `DIAL_HOST_ROLE=${env.DIAL_HOST_ROLE} is not a declared role` };
    return { role: env.DIAL_HOST_ROLE, source: 'env', reason: 'DIAL_HOST_ROLE' };
  }
  try {
    if (fs.existsSync(roleFile)) {
      const st = fs.statSync(roleFile);
      const value = parseRoleFile(fs.readFileSync(roleFile, 'utf8'));
      if (st.uid !== 0 && os.userInfo().uid !== st.uid) return { role: 'UNKNOWN', source: 'role_file', reason: `${roleFile} is not owned by root or the service user` };
      if ((st.mode & 0o022) !== 0) return { role: 'UNKNOWN', source: 'role_file', reason: `${roleFile} is group/world writable` };
      if (!known[value]) return { role: 'UNKNOWN', source: 'role_file', reason: `${roleFile} names undeclared role ${value}` };
      return { role: value, source: 'role_file', reason: roleFile };
    }
  } catch (e) { return { role: 'UNKNOWN', source: 'role_file', reason: e.message }; }
  const container = detectProviderContainer(env);
  if (container) return { role: 'provider-container', source: 'provider_container', reason: container.evidence, provider: container.provider };
  for (const [name, def] of Object.entries(known)) if ((def.aliases || []).includes(hostname)) return { role: name, source: 'hostname', reason: `hostname ${hostname}` };
  return { role: 'UNKNOWN', source: 'none', reason: `no role declaration; hostname ${hostname} matches no alias` };
}

export function workloadDecision({ role, workload, roles = loadRoles() }) {
  const def = roles.roles[role];
  if (!roles.workloads[workload]) return { allowed: false, code: 'UNKNOWN_WORKLOAD', reason: `workload ${workload} is not declared` };
  if (!def) return { allowed: false, code: 'ROLE_UNKNOWN', reason: `host role is ${role}; governed workloads are refused until a role is declared` };
  if ((def.forbidden_workloads || []).includes(workload)) return { allowed: false, code: 'WORKLOAD_FORBIDDEN_FOR_ROLE', reason: `${workload} is forbidden on ${role} (${def.host_class})` };
  if (!(def.allowed_workloads || []).includes(workload)) return { allowed: false, code: 'WORKLOAD_NOT_ALLOWED_FOR_ROLE', reason: `${workload} is not in the allowlist of ${role}` };
  return { allowed: true, code: 'ALLOWED', reason: `${workload} allowed on ${role}` };
}

export function assertWorkloadAllowed({ workload, env = process.env, roleFile = ROLE_FILE, hostname = os.hostname(), roles = loadRoles() } = {}) {
  const resolved = resolveHostRole({ env, roleFile, hostname, roles });
  const decision = workloadDecision({ role: resolved.role, workload, roles });
  const record = { workload, ...resolved, ...decision, decided_at: new Date().toISOString() };
  if (!decision.allowed) throw new RoleGuardError(decision.code, `role guard refused ${workload}: ${decision.reason}`, record);
  return record;
}

function cli(argv) {
  const args = Object.fromEntries(argv.map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : [])).filter((x) => x.length));
  if (args.resolve) { console.log(JSON.stringify(resolveHostRole(), null, 2)); return 0; }
  if (!args.workload) { console.error('usage: role-guard.mjs --workload <WORKLOAD> | --resolve'); return 2; }
  try { console.log(JSON.stringify(assertWorkloadAllowed({ workload: args.workload }), null, 2)); return 0; }
  catch (e) { if (e instanceof RoleGuardError) { console.error(JSON.stringify({ refused: true, code: e.code, ...e.detail }, null, 2)); return e.code === 'ROLE_UNKNOWN' ? 4 : 3; } throw e; }
}
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) process.exit(cli(process.argv.slice(2)));
