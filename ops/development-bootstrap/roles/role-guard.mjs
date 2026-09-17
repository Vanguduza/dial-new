#!/usr/bin/env node
// Fail-closed host role guard, reconciled to the canonical three-node provider-first fabric.
//
//   node ops/development-bootstrap/roles/role-guard.mjs --workload HERMES_RUNTIME
//   node ops/development-bootstrap/roles/role-guard.mjs --resolve
//   exit 0 = allowed, exit 3 = refused, exit 4 = role unknown (refused)
//
// Authority (GAP-023 / GAP-005 closure):
//   - host identity and permitted workload classes: deploy/oracle/resource-fabric/hosts.json
//   - host class vocabulary and role-file format: agent-system/orchestration/execution-fabric/host-role.mjs
//   - roles/roles.json is only an ADAPTER: it maps bootstrap workloads onto canonical fabric classes and
//     keys every role by the canonical host_id. It never introduces a second host-role vocabulary.
//
// A workload is allowed only when (1) the adapter allows it for the resolved role AND (2) hosts.json permits
// at least one of the workload's fabric classes on that host. provider-container has no hosts.json entry:
// it is the ephemeral provider execution surface, so only the adapter applies and it can never be a host
// authority. Anything unresolved is UNKNOWN and every governed workload is refused.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRoles } from '../lib/manifest.mjs';
import { loadHosts, hostEntry, hostForClass } from '../lib/topology.mjs';
import { HOST_ROLES } from '../../../agent-system/orchestration/execution-fabric/constants.mjs';
import { parseHostRoleText, expectedRoleForHostname } from '../../../agent-system/orchestration/execution-fabric/host-role.mjs';

export const ROLE_FILE = process.env.DIAL_HOST_ROLE_FILE || '/etc/dial/host-role';
export const PROVIDER_SURFACE_ROLE = 'provider-container';

export class RoleGuardError extends Error {
  constructor(code, message, detail = {}) { super(message); this.code = code; this.detail = detail; }
}

const CLASS_VALUES = new Set(Object.values(HOST_ROLES));

// Accepts the canonical key=value file (ROLE=<class> HOSTNAME=<host_id> ...) written by
// deploy/oracle/execution-fabric/install-host-role.sh, and, for backwards compatibility, a bare host_id line.
export function parseRoleFile(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (lines.some((l) => /^(ROLE|role)\s*=/.test(l))) {
    try { const parsed = parseHostRoleText(raw); return { format: 'CANONICAL', role_class: parsed.role, hostname: parsed.hostname, node_id: parsed.node_id, source: parsed.source }; }
    catch (e) { return { format: 'CANONICAL', role_class: null, hostname: null, node_id: null, error: e.message }; }
  }
  const bare = lines.find((l) => !l.includes('='));
  return { format: 'LEGACY_BARE_HOST_ID', host_id: bare || '', role_class: null, hostname: null, node_id: null };
}

export function detectProviderContainer(env = process.env) {
  if (env.CLAUDE_CODE_REMOTE === 'true' || env.CLAUDE_CODE_REMOTE === '1' || env.CLAUDE_CODE_REMOTE_SESSION_ID) return { provider: 'claude-code-remote', surface: 'claude_remote_container', evidence: 'CLAUDE_CODE_REMOTE' };
  if (env.CODEX_SANDBOX || env.CODEX_CLOUD_SESSION || env.CODEX_ENV_ID) return { provider: 'codex-cloud', surface: 'codex_cloud_container', evidence: 'CODEX_* environment' };
  return null;
}

function unknown(source, reason, extra = {}) { return { role: 'UNKNOWN', host_class: null, source, reason, ...extra }; }

function resolved(role, roles, hosts, source, reason, extra = {}) {
  const def = roles.roles[role];
  const entry = def?.kind === 'HOST' ? hostEntry(role, hosts) : null;
  return { role, host_class: def?.host_class ?? null, kind: def?.kind ?? null, source, reason, topology: entry ? { host_id: entry.host_id, host_class: entry.host_class, immutable_role: entry.immutable_role === true, architecture: entry.architecture } : null, ...extra };
}

// Adapter consistency: every HOST role must exist in hosts.json with the same host_class and every class in
// HOST_ROLES must be adapted exactly once. Inconsistency is a refusal, not a warning.
export function adapterConsistency({ roles = loadRoles(), hosts = loadHosts() } = {}) {
  const problems = [];
  const classes = new Map();
  for (const [id, def] of Object.entries(roles.roles || {})) {
    if (def.kind === 'HOST') {
      const entry = hostEntry(id, hosts);
      if (!entry) problems.push(`role ${id} has no hosts.json entry`);
      else if (entry.host_class !== def.host_class) problems.push(`role ${id} declares host_class ${def.host_class} but hosts.json declares ${entry.host_class}`);
      if (!CLASS_VALUES.has(def.host_class)) problems.push(`role ${id} host_class ${def.host_class} is not a canonical HOST_ROLES value`);
      if (classes.has(def.host_class)) problems.push(`host_class ${def.host_class} adapted twice (${classes.get(def.host_class)}, ${id})`);
      classes.set(def.host_class, id);
      for (const w of [...(def.allowed_workloads || []), ...(def.forbidden_workloads || [])]) if (!roles.workloads?.[w]) problems.push(`role ${id} references undeclared workload ${w}`);
      for (const w of def.allowed_workloads || []) if ((def.forbidden_workloads || []).includes(w)) problems.push(`role ${id} both allows and forbids ${w}`);
    } else if (def.kind !== 'PROVIDER_EXECUTION_SURFACE') problems.push(`role ${id} has unknown kind ${def.kind}`);
  }
  for (const cls of CLASS_VALUES) if (!classes.has(cls)) problems.push(`canonical host_class ${cls} has no adapter role`);
  for (const h of hosts.hosts || []) if (!roles.roles?.[h.host_id]) problems.push(`hosts.json host ${h.host_id} has no adapter role`);
  for (const [w, def] of Object.entries(roles.workloads || {})) if (!Array.isArray(def.fabric_classes) || !def.fabric_classes.length) problems.push(`workload ${w} declares no fabric_classes`);
  return { ok: problems.length === 0, problems };
}

export function resolveHostRole({ env = process.env, roleFile = ROLE_FILE, hostname = os.hostname(), roles = loadRoles(), hosts = loadHosts() } = {}) {
  const known = roles.roles;
  const consistency = adapterConsistency({ roles, hosts });
  if (!consistency.ok) return unknown('adapter', `roles.json is inconsistent with hosts.json: ${consistency.problems.join('; ')}`);
  if (env.DIAL_HOST_ROLE) {
    const v = String(env.DIAL_HOST_ROLE).trim();
    if (known[v]) return resolved(v, roles, hosts, 'env', 'DIAL_HOST_ROLE');
    if (CLASS_VALUES.has(v)) { const entry = hostForClass(v, hosts); if (entry && known[entry.host_id]) return resolved(entry.host_id, roles, hosts, 'env', `DIAL_HOST_ROLE class ${v}`); }
    return unknown('env', `DIAL_HOST_ROLE=${v} is neither a canonical host_id nor a canonical host class`);
  }
  try {
    if (fs.existsSync(roleFile)) {
      const st = fs.statSync(roleFile);
      const serviceUid = os.userInfo().uid;
      // Hardened unprivileged systemd user services may map host UID 0 to nobody (65534)
      // inside their mount/user namespace. Accept that mapping only when a known root-owned
      // system file is mapped identically; a host-side nobody-owned role file is still refused.
      let namespacedRootUid = null;
      try {
        const passwdUid = fs.statSync('/etc/passwd').uid;
        if (serviceUid !== 65534 && passwdUid === 65534) namespacedRootUid = 65534;
      } catch {}
      if (![0, serviceUid, namespacedRootUid].filter((v) => v !== null).includes(st.uid)) {
        return unknown('role_file', `${roleFile} is not owned by root, mapped root, or the service user`);
      }
      if ((st.mode & 0o022) !== 0) return unknown('role_file', `${roleFile} is group/world writable`);
      const parsed = parseRoleFile(fs.readFileSync(roleFile, 'utf8'));
      if (parsed.format === 'LEGACY_BARE_HOST_ID') {
        if (!known[parsed.host_id] || known[parsed.host_id].kind !== 'HOST') return unknown('role_file', `${roleFile} names undeclared host ${parsed.host_id || '(empty)'}`);
        return resolved(parsed.host_id, roles, hosts, 'role_file', `${roleFile} (legacy bare host_id; rewrite with deploy/oracle/execution-fabric/install-host-role.sh)`, { role_file_format: 'LEGACY_BARE_HOST_ID' });
      }
      if (!parsed.role_class) return unknown('role_file', `${roleFile}: ${parsed.error || 'ROLE missing'}`);
      const declaredHost = parsed.hostname || hostname;
      const entry = hostEntry(declaredHost, hosts);
      if (!entry) return unknown('role_file', `${roleFile} HOSTNAME ${declaredHost} is not in hosts.json`);
      if (entry.host_class !== parsed.role_class) return unknown('role_file', `${roleFile} ROLE=${parsed.role_class} contradicts hosts.json host_class ${entry.host_class} for ${declaredHost}`);
      const expected = expectedRoleForHostname(declaredHost);
      if (expected && expected !== parsed.role_class) return unknown('role_file', `${roleFile} ROLE=${parsed.role_class} contradicts canonical expectation ${expected} for ${declaredHost}`);
      if (parsed.hostname && parsed.hostname !== hostname) return unknown('role_file', `${roleFile} HOSTNAME=${parsed.hostname} differs from live hostname ${hostname}`);
      if (!known[entry.host_id]) return unknown('role_file', `hosts.json host ${entry.host_id} has no adapter role`);
      return resolved(entry.host_id, roles, hosts, 'role_file', roleFile, { role_file_format: 'CANONICAL', role_file_fabric: parsed.source?.FABRIC || null, role_file_revision: parsed.source?.REVISION || null });
    }
  } catch (e) { return unknown('role_file', e.message); }
  const container = detectProviderContainer(env);
  if (container) return resolved(PROVIDER_SURFACE_ROLE, roles, hosts, 'provider_container', container.evidence, { provider: container.provider, execution_surface: container.surface });
  const byName = hostEntry(hostname, hosts);
  if (byName && known[byName.host_id]) return resolved(byName.host_id, roles, hosts, 'hostname', `hostname ${hostname} matches hosts.json (weak: no role file)`);
  return unknown('none', `no role declaration; hostname ${hostname} matches no hosts.json host`);
}

export function workloadDecision({ role, workload, roles = loadRoles(), hosts = loadHosts() }) {
  const def = roles.roles[role];
  const spec = roles.workloads[workload];
  if (!spec) return { allowed: false, code: 'UNKNOWN_WORKLOAD', reason: `workload ${workload} is not declared` };
  if (!def) return { allowed: false, code: 'ROLE_UNKNOWN', reason: `host role is ${role}; governed workloads are refused until a role is declared` };
  if ((def.forbidden_workloads || []).includes(workload)) return { allowed: false, code: 'WORKLOAD_FORBIDDEN_FOR_ROLE', reason: `${workload} is forbidden on ${role} (${def.host_class || def.kind})` };
  if (!(def.allowed_workloads || []).includes(workload)) return { allowed: false, code: 'WORKLOAD_NOT_ALLOWED_FOR_ROLE', reason: `${workload} is not in the allowlist of ${role}` };
  if (def.kind === 'HOST') {
    const entry = hostEntry(role, hosts);
    if (!entry) return { allowed: false, code: 'HOST_NOT_IN_TOPOLOGY', reason: `${role} is not declared in hosts.json` };
    const permitted = new Set(entry.allowed_workload_classes || []);
    const matched = (spec.fabric_classes || []).filter((c) => permitted.has(c));
    if (!matched.length) return { allowed: false, code: 'WORKLOAD_CLASS_NOT_PERMITTED_BY_FABRIC', reason: `${workload} maps to fabric classes [${(spec.fabric_classes || []).join(', ')}] and hosts.json permits none of them on ${role}` };
    return { allowed: true, code: 'ALLOWED', reason: `${workload} allowed on ${role} via fabric class ${matched[0]}`, fabric_class: matched[0] };
  }
  return { allowed: true, code: 'ALLOWED', reason: `${workload} allowed on ${role} (provider execution surface; no host authority)`, fabric_class: null };
}

export function assertWorkloadAllowed({ workload, env = process.env, roleFile = ROLE_FILE, hostname = os.hostname(), roles = loadRoles(), hosts = loadHosts() } = {}) {
  const r = resolveHostRole({ env, roleFile, hostname, roles, hosts });
  const decision = workloadDecision({ role: r.role, workload, roles, hosts });
  const record = { workload, ...r, ...decision, decided_at: new Date().toISOString() };
  if (!decision.allowed) throw new RoleGuardError(decision.code, `role guard refused ${workload}: ${decision.reason}`, record);
  return record;
}

function cli(argv) {
  const args = Object.fromEntries(argv.map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : [])).filter((x) => x.length));
  if (args.resolve) { console.log(JSON.stringify(resolveHostRole(), null, 2)); return 0; }
  if (args.consistency) { const c = adapterConsistency(); console.log(JSON.stringify(c, null, 2)); return c.ok ? 0 : 3; }
  if (!args.workload) { console.error('usage: role-guard.mjs --workload <WORKLOAD> | --resolve | --consistency'); return 2; }
  try { console.log(JSON.stringify(assertWorkloadAllowed({ workload: args.workload }), null, 2)); return 0; }
  catch (e) { if (e instanceof RoleGuardError) { console.error(JSON.stringify({ refused: true, code: e.code, ...e.detail }, null, 2)); return e.code === 'ROLE_UNKNOWN' ? 4 : 3; } throw e; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) process.exit(cli(process.argv.slice(2)));
