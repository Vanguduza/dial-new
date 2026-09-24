import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { STATUS, CRITICALITY, summarize, verdict, check } from '../lib/result.mjs';
import { itemsForRole, loadRoles } from '../lib/manifest.mjs';
import { binaryCheck } from '../providers/common.mjs';
import { certifyClaude } from '../providers/claude.mjs';
import { certifyCodex } from '../providers/codex.mjs';
import { certifyHermes } from '../providers/hermes.mjs';
import { certifyXkiro } from '../providers/xkiro.mjs';
import { certifyGoogle } from '../providers/google.mjs';
import { certifyMcp } from '../mcp/inventory.mjs';
import { certifySystemd } from '../systemd/units.mjs';
import { certifyContainers } from '../containers/docker.mjs';
import { certifyNetwork } from '../network/reachability.mjs';
import { certifyRepository } from './repository.mjs';
import { deriveAuthGates } from '../auth/gates.mjs';
import { runE2ESelfTest } from '../selftest/e2e-selftest.mjs';
import { runDeterminism } from '../selftest/determinism.mjs';
import { runFaultInjection } from '../selftest/fault-injection.mjs';
import { dispatchWorkerJob } from '../workers/dispatch.mjs';
import { git, run, hostFacts, diskFree, versionProbe, readJsonSafe, fileMode, requiredServicePath } from '../lib/probes.mjs';
import { resolveHostRole, workloadDecision, adapterConsistency } from '../roles/role-guard.mjs';
import { loadHosts, hostEntry, liveHostFacts, compareHostInventory, authorityConsistency, HOSTS_REL } from '../lib/topology.mjs';
import { evaluateAllProfiles, requiredItemsForRole, DEFAULT_PROFILE } from '../lib/readiness.mjs';
import { supplyChainStatus } from '../converge/converge.mjs';

// Readiness matrix domains and which check domains feed each row.
const MATRIX = [
  ['Hermes', true, ['Hermes']], ['Claude', true, ['Claude']], ['Codex', true, ['Codex']], ['GitHub', true, ['GitHub']],
  ['VEKL', true, ['VEKL']], ['GraphRAG', true, ['GraphRAG']], ['MCP', true, ['MCP']], ['Model routing', true, ['Model routing']],
  ['Project Truth', true, ['Project Truth']], ['vekl-worker', true, ['vekl-worker']], ['oracle-admin', true, ['oracle-admin']],
  ['Recovery', true, ['Recovery']], ['Owner WhatsApp', false, ['Owner WhatsApp']], ['Desktop Commander', true, ['Desktop Commander']], ['Xkiro', false, ['Xkiro']],
  ['Google tools', false, ['Google tools']], ['Security', true, ['Security']], ['Supply chain', true, ['Supply chain']],
  ['Systemd', true, ['Systemd']], ['Containers', true, ['Containers']], ['Network', true, ['Network']], ['Bootstrap', true, ['Bootstrap']], ['Topology', true, ['Topology']], ['Role guard', true, ['Role guard']], ['Certification', true, ['Certification']],
];

function rowStatus(domainChecks, required) {
  if (!domainChecks.length) return required ? 'NOT CERTIFIED' : 'NOT_APPLICABLE';
  const applicable = domainChecks.filter((c) => c.status !== STATUS.NOT_APPLICABLE);
  if (!applicable.length) return 'NOT_APPLICABLE';
  if (applicable.some((c) => c.status === STATUS.FAIL && c.criticality !== CRITICALITY.OPTIONAL)) return 'RED';
  if (applicable.some((c) => [STATUS.UNVERIFIED, STATUS.OWNER_ACTION_REQUIRED, STATUS.EXTERNAL_GATE].includes(c.status) || (c.status === STATUS.FAIL))) return 'AMBER';
  return 'GREEN';
}
function col(domainChecks, pred) { const hits = domainChecks.filter(pred); if (!hits.length) return '—'; return hits.every((c) => c.status === STATUS.PASS) ? '✓' : hits.some((c) => c.status === STATUS.FAIL) ? '✗' : '?'; }

export function readinessMatrix(checks) {
  return MATRIX.map(([domain, required, sources]) => {
    const dc = checks.filter((c) => sources.includes(c.domain));
    return {
      domain, required,
      installed: col(dc, (c) => /binary|module|installed|present|inventory/.test(c.id)),
      configured: col(dc, (c) => /config|registered|pinned|hook|fingerprint|adapter|role-file/.test(c.id)),
      authenticated: col(dc, (c) => /auth|credential|reach|token/.test(c.id)),
      integrated: col(dc, (c) => /probe|gate|mirror|dispatch|e2e|selftest|activation|producer|qualifier|two-way/.test(c.id)),
      tested: col(dc, (c) => /verify|vekl\.|routing|selftest|fault|determin|test/.test(c.id)),
      deterministic: col(dc, (c) => /determin|fingerprint|unit-check|graph-check|retrieval|protected-master/.test(c.id)),
      secure: col(dc, (c) => /no-ambient|no-tracked|modes|hardening|loopback|secret|lockfile|pinned|pins|environment-file/.test(c.id)),
      status: rowStatus(dc, required),
    };
  });
}

// Protected-master pin (closure item 5): record origin/master and HEAD before any check runs; re-read after
// the last check. Any movement invalidates the run as STALE, which the verdict treats as RED.
export function protectedMasterBaseline(repoDir, branch) {
  const head = git(repoDir, ['rev-parse', 'HEAD']).output;
  const localRef = git(repoDir, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]);
  const remote = git(repoDir, ['ls-remote', '--heads', 'origin', branch], { timeoutMs: 40000 });
  const remoteSha = remote.ok ? (remote.output.split(/\s+/)[0] || null) : null;
  return { head, branch, origin_master_local: localRef.ok ? localRef.output : null, origin_master_remote: remoteSha, remote_reachable: remote.ok, observed_at: new Date().toISOString() };
}
export function protectedMasterStale(before, after) {
  const reasons = [];
  if (before.head !== after.head) reasons.push(`HEAD moved ${before.head} -> ${after.head}`);
  if (before.origin_master_local && after.origin_master_local && before.origin_master_local !== after.origin_master_local) reasons.push(`origin/${before.branch} (local ref) moved`);
  if (before.origin_master_remote && after.origin_master_remote && before.origin_master_remote !== after.origin_master_remote) reasons.push(`origin/${before.branch} (remote) moved ${before.origin_master_remote} -> ${after.origin_master_remote}`);
  return { stale: reasons.length > 0, reasons };
}

export async function certify({ repoDir, controlHome, manifest, role, runId, log, fast = false, skipRepositoryGates = false, gapRegister = [], profile = DEFAULT_PROFILE }) {
  const checks = [];
  const t0 = Date.now();
  const add = (list) => { for (const c of list) { checks.push(c); log?.[c.status === STATUS.PASS ? 'ok' : c.status === STATUS.FAIL ? 'error' : 'warn'](c.id, { status: c.status, message: c.title }); } };
  const baseline = protectedMasterBaseline(repoDir, manifest.canonical_branch);

  // Role guard first: everything else is interpreted relative to the resolved role.
  const roles = loadRoles();
  const hosts = loadHosts();
  const consistency = adapterConsistency({ roles, hosts });
  add([check({ id: 'role.adapter-consistency', domain: 'Role guard', title: `roles.json adapts hosts.json/HOST_ROLES exactly (${consistency.problems.length} problems)`, status: consistency.ok ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { topology_authority: HOSTS_REL, problems: consistency.problems } })]);
  const resolved = resolveHostRole({ roles, hosts });
  add([check({ id: 'role.resolved', domain: 'Role guard', title: `host role resolved: ${resolved.role} (${resolved.host_class || resolved.kind || 'n/a'}) via ${resolved.source}`, status: resolved.role === 'UNKNOWN' ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: resolved, remediation: 'bash deploy/oracle/execution-fabric/install-host-role.sh <CONTROL_AUTHORITY|BACKGROUND_COORDINATOR|RECOVERY_CONTROL_ONLY>' })]);
  if (resolved.role !== 'UNKNOWN' && resolved.role !== 'provider-container') {
    // `--role` sets DIAL_HOST_ROLE, which outranks the role file in resolution. The file must still
    // declare this host on its own, so it is resolved separately and must agree with the effective role.
    const fromFile = resolved.source === 'role_file' ? resolved : resolveHostRole({ env: { ...process.env, DIAL_HOST_ROLE: '' }, roles, hosts });
    const fileOk = fromFile.source === 'role_file' && fromFile.role_file_format === 'CANONICAL' && fromFile.role === resolved.role;
    add([check({ id: 'role.role-file', domain: 'Role guard', title: 'host role declared by the canonical key=value role file (not hostname or env alone)', status: fileOk ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { source: fromFile.source, effective_source: resolved.source, file_role: fromFile.role, effective_role: resolved.role, format: fromFile.role_file_format || null, fabric: fromFile.role_file_fabric || null, revision: fromFile.role_file_revision || null }, remediation: 'bash deploy/oracle/execution-fabric/install-host-role.sh <class>' })]);
  }
  const mismatch = [];
  for (const [r, def] of Object.entries(roles.roles)) for (const w of def.forbidden_workloads || []) if (workloadDecision({ role: r, workload: w, roles, hosts }).allowed) mismatch.push(`${r}:${w}`);
  add([check({ id: 'role.forbidden-workloads-refused', domain: 'Role guard', title: 'every forbidden workload refused for every declared role (mismatched-role probes)', status: mismatch.length ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { probes: Object.values(roles.roles).reduce((n, d) => n + (d.forbidden_workloads || []).length, 0), leaks: mismatch } })]);
  // Every immutable host role must fail closed on the canonical cross-role probes (GAP-023).
  const immutableProbes = { 'oracle-admin': ['REPOSITORY_WRITE', 'HERMES_RUNTIME', 'OWNER_CONTROL', 'DETERMINISTIC_VERIFY'], 'vekl-worker': ['OWNER_CONTROL', 'HERMES_RUNTIME', 'EXTERNAL_QUEUE', 'HEAVY_BUILD', 'REPOSITORY_WRITE'], 'dial-hermes-control': ['WORKER_JOB'] };
  const leaks = [];
  for (const [r, list] of Object.entries(immutableProbes)) for (const w of list) if (workloadDecision({ role: r, workload: w, roles, hosts }).allowed) leaks.push(`${r}:${w}`);
  add([check({ id: 'role.immutable-roles-fail-closed', domain: 'Role guard', title: 'all three immutable roles refuse out-of-role work (project work on oracle-admin, control/heavy work on vekl-worker, worker execution on dial-hermes-control)', status: leaks.length ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { probes: immutableProbes, leaks } })]);
  if (resolved.role !== role) add([check({ id: 'role.requested-vs-resolved', domain: 'Role guard', title: `requested role ${role} differs from resolved ${resolved.role}; certification runs for the requested role's expectations only where they overlap`, status: STATUS.FAIL, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { requested: role, resolved: resolved.role }, remediation: 'run on the intended host or set DIAL_HOST_ROLE explicitly' })]);

  // Topology: live facts vs hosts.json (closure item 6) and authority self-consistency.
  const roleDef = roles.roles[role];
  if (roleDef?.kind === 'HOST') {
    const entry = hostEntry(role, hosts);
    const facts = liveHostFacts();
    const inv = compareHostInventory({ entry, facts });
    add([check({ id: 'topology.host-inventory-drift', domain: 'Topology', title: `live host facts vs ${HOSTS_REL} for ${role}: ${inv.drift.length} drift field(s)`, status: inv.ok ? STATUS.PASS : STATUS.FAIL, criticality: inv.drift.some((d) => d.severity === 'MANDATORY') ? CRITICALITY.MANDATORY : CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { declared: entry ? { host_id: entry.host_id, host_class: entry.host_class, architecture: entry.architecture, cpu_total: entry.cpu_total, memory_total_mb: entry.memory_total_mb, private_ip: entry.private_ip } : null, observed: facts, drift: inv.drift }, remediation: 'owner: reconcile hosts.json with the live shape (topology authority) or correct the host; never edit hosts.json to silence drift without a decision record' })]);
  } else {
    add([check({ id: 'topology.host-inventory-drift', domain: 'Topology', title: `${role} is a provider execution surface; no hosts.json inventory applies`, status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, readiness_class: 'OPTIONAL_CAPABILITY', evidence: { execution_surfaces: roleDef?.execution_surfaces || [] } })]);
  }
  const auth = authorityConsistency({ repoDir, hosts });
  add([check({ id: 'topology.authority-consistency', domain: 'Topology', title: `hosts.json agrees with the fabric qualifier and fabric document (${auth.problems.length} disagreements)`, status: auth.ok ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: auth, remediation: 'owner decision: hosts.json is the topology authority; align qualify-execution-fabric.sh / the fabric document or record the shape change', severity: auth.ok ? null : 'P2' })]);

  // Packages and runtimes (PATH hygiene: fallback-located binaries are reported, never hidden).
  const fallbackFound = [];
  for (const p of itemsForRole(manifest.packages, role)) { const c = binaryCheck({ id: p.id, domain: 'Bootstrap', binary: p.binary, minimum: p.minimum_version, args: p.version_args || ['--version'], criticality: p.criticality, remediation: p.remediation, readiness_class: p.readiness_class }); add([c]); if (c.evidence?.path_source === 'USER_LOCAL_FALLBACK') fallbackFound.push({ id: p.id, location: c.evidence.location }); }
  for (const r of itemsForRole(manifest.runtimes, role)) {
    if (['rt.codex', 'rt.claude-code', 'rt.hermes', 'rt.antigravity'].includes(r.id)) continue; // certified by their provider modules
    const c = binaryCheck({ id: r.id, domain: 'Bootstrap', binary: r.binary, minimum: r.minimum_version, criticality: r.criticality, remediation: r.remediation, readiness_class: r.readiness_class });
    add([c]); if (c.evidence?.path_source === 'USER_LOCAL_FALLBACK') fallbackFound.push({ id: r.id, location: c.evidence.location });
  }
  for (const id of ['claude', 'codex', 'hermes']) { const p = versionProbe(id, ['--version']); if (p.installed && p.path_source === 'USER_LOCAL_FALLBACK') fallbackFound.push({ id: `rt.${id}`, location: p.location }); }
  const requiredPathEntries = requiredServicePath().split(':');
  const currentPathEntries = (process.env.PATH || '').split(':');
  const missingPathEntries = requiredPathEntries.filter((entry) => !currentPathEntries.includes(entry));
  const servicePathFile = path.join(process.env.HOME || '', '.config', 'environment.d', '10-dial-path.conf');
  let persistedPathEntries = [];
  try {
    const line = fs.readFileSync(servicePathFile, 'utf8').split(/\r?\n/).find((row) => row.startsWith('PATH='));
    persistedPathEntries = line ? line.slice(5).split(':').filter(Boolean) : [];
  } catch {}
  const persistedServicePathOk = requiredPathEntries.every((entry) => persistedPathEntries.includes(entry));
  const pathHealthy = fallbackFound.length === 0 && (missingPathEntries.length === 0 || persistedServicePathOk);
  add([check({ id: 'bootstrap.path-hygiene', domain: 'Bootstrap', title: 'service PATH deterministically includes user-local and system binary directories', status: pathHealthy ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { found_only_via_fallback: fallbackFound, required_path: requiredPathEntries, caller_missing_path_entries: missingPathEntries, persisted_service_path_file: servicePathFile, persisted_service_path_ok: persistedServicePathOk, persisted_path: persistedPathEntries, caller_path: currentPathEntries.slice(0, 12) }, remediation: 'bootstrap --apply writes ~/.config/environment.d/10-dial-path.conf; reinstall generated units so each has the explicit safe PATH' })]);
  const host = hostFacts(); const disk = diskFree(repoDir);
  add([check({ id: 'bootstrap.host-facts', domain: 'Bootstrap', title: `host ${host.hostname} ${host.arch} ${host.cpus}cpu ${host.memory_total_mb}MB disk_avail=${disk.avail_mb}MB`, status: STATUS.PASS, criticality: CRITICALITY.OPTIONAL, readiness_class: 'OPTIONAL_CAPABILITY', evidence: { ...host, disk } })]);
  const floor = role === 'dial-hermes-control' ? { cpus: 2, mem: 3500, disk: 5000 } : role === 'provider-container' ? { cpus: 2, mem: 3500, disk: 5000 } : { cpus: 1, mem: 900, disk: 2000 };
  add([check({ id: 'bootstrap.resource-floor', domain: 'Bootstrap', title: `resource floor for ${role}: >= ${floor.cpus} vCPU, >= ${floor.mem} MB RAM, >= ${floor.disk} MB free disk`, status: host.cpus >= floor.cpus && host.memory_total_mb >= floor.mem && disk.avail_mb >= floor.disk ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, readiness_class: role === 'oracle-admin' ? 'RECOVERY_REQUIRED' : 'CORE_DEVELOPMENT_REQUIRED', evidence: { cpus: host.cpus, memory_total_mb: host.memory_total_mb, disk_avail_mb: disk.avail_mb, floor } })]);

  // Supply chain: pinned channels declared for every install item; pin material present (closure item 1).
  const sc = supplyChainStatus({ manifest, role });
  add([check({ id: 'supply.pinned-installers', domain: 'Supply chain', title: 'every package/runtime for this role uses a pinned, verifiable install method (no curl|bash, no @latest)', status: sc.unpinned_methods.length ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { unpinned: sc.unpinned_methods, methods: sc.actions }, severity: sc.unpinned_methods.length ? 'P1' : null })]);
  add([check({ id: 'supply.pins-declared', domain: 'Supply chain', title: `supply-chain/PINS.json carries verification material for every install item (${sc.pins_missing.length} missing)`, status: sc.pins_missing.length ? STATUS.OWNER_ACTION_REQUIRED : STATUS.PASS, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { missing: sc.pins_missing }, gate: sc.pins_missing.length ? 'OWNER-GATE-SUPPLY-CHAIN-PINS-001' : null, remediation: 'owner records exact versions and checksums/integrity in ops/development-bootstrap/supply-chain/PINS.json from vendor-published artefacts' })]);

  // Providers.
  add(certifyClaude({ role, manifest }));
  add(certifyCodex({ role, manifest }));
  add(certifyHermes({ role, manifest }));
  add(certifyXkiro({ role, controlHome }));
  add(certifyGoogle({ role, repoDir, controlHome }));

  // Repository-local plugin wiring. These checks certify concrete configuration/artifacts rather than
  // assuming a plugin is healthy merely because its manifest row exists.
  const declaredPlugins = new Set(itemsForRole(manifest.plugins, role).map((item) => item.id));
  if (declaredPlugins.has('plg.claude-hooks')) {
    const settings = readJsonSafe(path.join(repoDir, '.claude/settings.json'), {});
    const phases = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PreCompact', 'Stop'];
    const missing = phases.filter((phase) => !Array.isArray(settings?.hooks?.[phase]) || settings.hooks[phase].length === 0);
    const guard = fs.existsSync(path.join(repoDir, 'agent-system/hooks/pre-tool-guard.mjs'));
    const audit = fs.existsSync(path.join(repoDir, 'agent-system/hooks/post-tool-audit.mjs'));
    add([check({ id: 'plugin.claude-hooks', domain: 'Claude', title: 'Claude lifecycle hooks are configured and guarded by pre/post tool evidence hooks', status: !missing.length && guard && audit ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { settings: '.claude/settings.json', required_phases: phases, missing_phases: missing, pre_tool_guard: guard, post_tool_audit: audit }, remediation: 'restore .claude/settings.json and agent-system/hooks from canonical master/closure implementation' })]);
  }
  if (declaredPlugins.has('plg.claude-skills')) {
    const skillsDir = path.join(repoDir, '.claude/skills');
    const agentsDir = path.join(repoDir, '.claude/agents');
    const skills = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(skillsDir, e.name, 'SKILL.md'))).map((e) => e.name).sort() : [];
    const agents = fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir).filter((name) => name.endsWith('.md')).sort() : [];
    const pkg = readJsonSafe(path.join(repoDir, 'package.json'), {});
    const checker = typeof pkg?.scripts?.['agent:skills:check'] === 'string';
    add([check({ id: 'plugin.claude-skills', domain: 'Claude', title: 'DIAL Claude skills/subagents are present and have a canonical validator', status: skills.length > 0 && agents.length > 0 && checker ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { skill_count: skills.length, agent_count: agents.length, validator: checker ? 'npm run agent:skills:check' : null }, remediation: 'restore .claude/skills, .claude/agents and agent:skills:check' })]);
  }

  // Non-interactive credential material: certify only existence/mode and a separate functional state;
  // never read or serialize a secret value into the report.
  if (role === 'dial-hermes-control') {
    const chatToken = fileMode(path.join(controlHome, 'secrets/chat-control.token'));
    add([check({ id: 'security.chat-control-token', domain: 'Security', title: 'chat-control token exists mode 600 (value never read)', status: chatToken.exists && chatToken.mode === '600' ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, readiness_class: 'OWNER_CONTROL_REQUIRED', evidence: { file: 'secrets/chat-control.token', exists: chatToken.exists, mode: chatToken.mode, value: 'never read' }, remediation: 'reinstall chat-control bridge and chmod 600 the token' })]);
    const mcpCap = fileMode(path.join(controlHome, 'secrets/remote-mcp-capability'));
    add([check({ id: 'security.private-mcp-capability', domain: 'Security', title: 'private MCP capability exists mode 600 on control (value never read)', status: mcpCap.exists && mcpCap.mode === '600' ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { file: 'secrets/remote-mcp-capability', exists: mcpCap.exists, mode: mcpCap.mode, value: 'never read' }, remediation: 'bash deploy/oracle/execution-fabric/phase3-bind-private-mcp.sh' })]);
  } else if (role === 'vekl-worker') {
    const mcpUrl = fileMode('/var/lib/dial-worker/secrets/private-mcp-url');
    const workerState = readJsonSafe('/var/lib/dial-worker/state/background-coordinator.json');
    add([check({ id: 'security.private-mcp-capability', domain: 'Security', title: 'worker private MCP capability is mode 600 and functionally bound', status: mcpUrl.exists && mcpUrl.mode === '600' && workerState?.mcp?.ok === true ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { file: '/var/lib/dial-worker/secrets/private-mcp-url', exists: mcpUrl.exists, mode: mcpUrl.mode, mcp_ok: workerState?.mcp?.ok === true, value: 'never read' }, remediation: 're-run phase3 private-MCP bind and coordinator installer' })]);
  }
  // GitHub.
  const remote = git(repoDir, ['remote', 'get-url', 'origin']).output;
  add([check({ id: 'github.remote', domain: 'GitHub', title: `origin is ${manifest.canonical_repository}`, status: /Vanguduza\/dial-new/.test(remote) ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { command: 'git remote get-url origin', output: remote.replace(/\/\/[^@]*@/, '//REDACTED@') } })]);
  add([check({ id: 'github.auth-reach', domain: 'GitHub', title: `authenticated reach: git ls-remote origin ${manifest.canonical_branch}`, status: baseline.remote_reachable ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { command: `git ls-remote --heads origin ${manifest.canonical_branch}`, origin_master: baseline.origin_master_remote }, remediation: 'restore GitHub credentials (deploy key / connector)' })]);
  add([branchProtectionCheck({ repoDir })]);
  add([check({ id: 'github.commit-signing', domain: 'GitHub', title: 'signed-commit policy on protected master (docs/project-state/PROTECTED_MASTER_POLICY.md) applied in GitHub', status: readJsonSafe(path.join(repoDir, 'docs/project-state/BRANCH_PROTECTION_EVIDENCE.json'))?.observed?.required_signatures === true ? STATUS.PASS : STATUS.OWNER_ACTION_REQUIRED, criticality: CRITICALITY.REQUIRED, readiness_class: 'OWNER_CONTROL_REQUIRED', evidence: { policy: 'docs/project-state/PROTECTED_MASTER_POLICY.md', evidence_file: 'docs/project-state/BRANCH_PROTECTION_EVIDENCE.json' }, gate: 'OWNER-GATE-BRANCH-PROTECTION-001', remediation: 'owner: enable required signatures in the master ruleset and export the ruleset as evidence' })]);
  // MCP, systemd, containers, network.
  add(certifyMcp({ role, manifest, repoDir }));
  add(certifySystemd({ role, manifest, repoDir }));
  add(certifyContainers({ manifest, role }));
  add(await certifyNetwork({ role, manifest, controlHome }));
  // Fabric qualifier evidence (control host only).
  if (role === 'dial-hermes-control') {
    const q = readJsonSafe(path.join(controlHome, 'state/fabric-rev2-qualifier.json'));
    add([check({ id: 'fabric.qualifier', domain: 'Hermes', title: `provider-first fabric qualifier: ${q?.status || 'ABSENT'}`, status: q?.status === 'GREEN' ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { file: 'state/fabric-rev2-qualifier.json', status: q?.status || null, notes: q?.notes || null, hostname: q?.hostname || null }, remediation: 'bash deploy/oracle/execution-fabric/qualify-execution-fabric.sh' })]);
    const venue = fileMode(path.join(controlHome, 'secrets/venue-ed25519.pem'));
    add([check({ id: 'fabric.venue-signing-key', domain: 'Security', title: 'venue-decision signing key present, mode 600 (value never read)', status: venue.exists && venue.mode === '600' ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { file: 'secrets/venue-ed25519.pem', exists: venue.exists, mode: venue.mode }, remediation: 'bash deploy/oracle/execution-fabric/phase5-install-providers.sh' })]);
  }
  // Repository / VEKL / GraphRAG / Hermes state / secrets / supply chain.
  if (!skipRepositoryGates) add(await certifyRepository({ role, repoDir, controlHome, manifest, fast }));
  // Owner WhatsApp / Desktop Commander / oracle-admin / vekl-worker / recovery rows.
  {
    const paired = role === 'dial-hermes-control' ? run('npm', ['run', '--silent', 'agent:operator:whatsapp-hermes-status'], { cwd: repoDir, timeoutMs: 30000 }) : null;
    let parsed = null; try { parsed = paired?.ok ? JSON.parse(paired.output) : null; } catch {}
    const dedicatedReady = parsed?.state === 'READY' && parsed?.mode === 'bot' && parsed?.paired === true && parsed?.owner_count === 1 && parsed?.bridge === 'connected';
    add([check({ id: 'whatsapp.channel', domain: 'Owner WhatsApp', title: 'Dial Hermes Control WhatsApp channel (owner-activated)', status: role === 'dial-hermes-control' ? (dedicatedReady ? STATUS.PASS : STATUS.NOT_APPLICABLE) : STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, readiness_class: 'OPTIONAL_CAPABILITY', evidence: { command: 'npm run agent:operator:whatsapp-hermes-status', dedicated_ready: dedicatedReady, mode: parsed?.mode || null, paired: parsed?.paired === true, owner_count: parsed?.owner_count ?? null, bridge: parsed?.bridge || null, owner_required_ref: 'DEC-035 / latest owner instruction', deferred_by_owner: !dedicatedReady }, gate: null, remediation: dedicatedReady ? null : 'Optional: when the owner wants WhatsApp control, run configure-hermes-whatsapp-control.sh then pair-hermes-whatsapp.sh --foreground' })]);
  }
  if (role === 'oracle-admin') {
    const proof = readJsonSafe('/var/lib/dial-recovery/commander/proof.json');
    add([check({ id: 'desktop-commander.proof', domain: 'Desktop Commander', title: 'Desktop Commander execution proof recorded through the Commander tool path (PING_RESPONDS + COMMAND_EXECUTES)', status: proof ? STATUS.PASS : STATUS.OWNER_ACTION_REQUIRED, criticality: CRITICALITY.MANDATORY, readiness_class: 'RECOVERY_REQUIRED', evidence: { file: '/var/lib/dial-recovery/commander/proof.json', present: Boolean(proof), recorded_at: proof?.recorded_at || null }, gate: 'AUTH-GATE-DESKTOP-COMMANDER-001', remediation: 'owner: dial-commander-pair, then run dial-commander-record-proof from the authorized client' })]);
  } else {
    add([check({ id: 'desktop-commander.presence', domain: 'Desktop Commander', title: 'Desktop Commander lives on the recovery plane (oracle-admin); certified there', status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.MANDATORY, readiness_class: 'RECOVERY_REQUIRED', evidence: { host: 'oracle-admin', unit: 'dial-commander-remote.service', note: 'certified only by the oracle-admin role report' }, gate: null, remediation: 'run bootstrap --verify --role oracle-admin on oracle-admin' })]);
  }
  add([check({ id: 'oracle-admin.role-separation', domain: 'oracle-admin', title: 'oracle-admin cannot run development workloads (role guard + hosts.json)', status: ['REPOSITORY_WRITE', 'HERMES_RUNTIME', 'OWNER_CONTROL'].some((w) => workloadDecision({ role: 'oracle-admin', workload: w, roles, hosts }).allowed) ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.MANDATORY, readiness_class: 'RECOVERY_REQUIRED', evidence: { probes: ['REPOSITORY_WRITE', 'HERMES_RUNTIME', 'OWNER_CONTROL'] } })]);
  add([check({ id: 'oracle-admin.live', domain: 'oracle-admin', title: 'oracle-admin host live certification (deploy/oracle/provisioning/host-certify.sh)', status: role === 'oracle-admin' ? (readJsonSafe('/var/log/dial-recovery/host-certification.json') ? STATUS.PASS : STATUS.FAIL) : STATUS.NOT_APPLICABLE, criticality: CRITICALITY.MANDATORY, readiness_class: 'RECOVERY_REQUIRED', evidence: { file: '/var/log/dial-recovery/host-certification.json' }, gate: 'EXTERNAL-GATE-ORACLE-ADMIN-001', remediation: 'sudo /opt/dial-recovery/bin/bootstrap.sh; dial-host-certify' })]);
  // Reciprocal recovery (RECOVERY_REQUIRED): evidence only comes from verify-two-way-recovery.sh between live hosts.
  const twoWay = readJsonSafe(path.join(controlHome || '/nonexistent', 'state/two-way-recovery-verdict.json')) || readJsonSafe('/var/lib/dial-recovery/fabric/two-way-recovery-verdict.json');
  add([check({ id: 'recovery.two-way', domain: 'Recovery', title: `reciprocal recovery verdict: ${twoWay?.verdict || 'NOT_RUN'} (verify-two-way-recovery.sh)`, status: ['dial-hermes-control', 'oracle-admin'].includes(role) ? (twoWay?.verdict === 'PROVEN' ? STATUS.PASS : STATUS.OWNER_ACTION_REQUIRED) : STATUS.NOT_APPLICABLE, criticality: CRITICALITY.MANDATORY, readiness_class: 'RECOVERY_REQUIRED', evidence: { verdict: twoWay?.verdict || null, recorded_at: twoWay?.recorded_at || twoWay?.at || null }, gate: 'OWNER-GATE-RECOVERY-TWO-WAY-001', remediation: 'owner: install-bounded-recovery-peer.sh (control) + install-bounded-recovery-identity.sh (each E2) + seed-known-hosts.sh, then verify-two-way-recovery.sh must print PROVEN' })]);
  add([check({ id: 'vekl-worker.role-separation', domain: 'vekl-worker', title: 'vekl-worker cannot become control authority (OWNER_CONTROL/HERMES_RUNTIME/EXTERNAL_QUEUE/WORKER_DISPATCH refused)', status: ['OWNER_CONTROL', 'HERMES_RUNTIME', 'EXTERNAL_QUEUE', 'WORKER_DISPATCH'].some((w) => workloadDecision({ role: 'vekl-worker', workload: w, roles, hosts }).allowed) ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { role_definition: roles.roles['vekl-worker'].host_class } })]);
  try {
    const d = await dispatchWorkerJob({ kind: 'REPO_HEAD', repoDir, transport: 'local', workerEnv: { ...process.env, DIAL_HOST_ROLE: 'vekl-worker' }, workerRoot: path.join(controlHome && fs.existsSync(controlHome) ? controlHome : process.env.TMPDIR || '/tmp', 'bootstrap', 'worker-selftest') });
    add([check({ id: 'vekl-worker.dispatch-local', domain: 'vekl-worker', title: 'worker job contract: dispatch REPO_HEAD -> sealed receipt (local transport)', status: d.ok ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { correlation_id: d.job.correlation_id, receipt_hash: d.receipt.receipt_hash, worker_role: d.receipt.worker.role, result: d.receipt.result } })]);
  } catch (e) { add([check({ id: 'vekl-worker.dispatch-local', domain: 'vekl-worker', title: 'worker job contract (local transport)', status: STATUS.FAIL, criticality: CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { error: e.message } })]); }
  add([check({ id: 'vekl-worker.live', domain: 'vekl-worker', title: 'vekl-worker background coordinator live (dial-background-coordinator.service bound to the private MCP)', status: role === 'vekl-worker' ? (readJsonSafe('/var/lib/dial-worker/state/background-coordinator.json')?.mcp?.ok === true ? STATUS.PASS : STATUS.FAIL) : STATUS.NOT_APPLICABLE, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { file: '/var/lib/dial-worker/state/background-coordinator.json', host: hostEntry('vekl-worker', hosts)?.private_ip || null }, gate: 'EXTERNAL-GATE-VEKL-WORKER-001', remediation: 'run bootstrap --verify --role vekl-worker on vekl-worker' })]);
  // Repository verify + self-tests are mandatory proof objects. Fast mode must report them as
  // explicitly UNVERIFIED rather than creating an ambiguous coverage hole or falsely treating them as N/A.
  if (!fast) {
    const repoVerify = run('npm', ['run', 'verify'], { cwd: repoDir, timeoutMs: 20 * 60 * 1000 });
    add([check({ id: 'gate.repository-verify', domain: 'Bootstrap', title: 'complete repository npm run verify', status: repoVerify.ok ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { command: repoVerify.command, exit: repoVerify.status, output_tail: repoVerify.output.split('\n').slice(-12).join(' | ').slice(0, 1000) }, remediation: 'fix the failing repository verification gate before certification' })]);
    const e2e = await runE2ESelfTest({ repoDir });
    add([check({ id: 'selftest.e2e', domain: 'Bootstrap', title: `end-to-end self-test ${e2e.ok ? 'passed' : 'failed'} (${e2e.stages.length} stages, correlation ${e2e.correlation_id})`, status: e2e.ok ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { correlation_id: e2e.correlation_id, decision_hash: e2e.decision_fingerprint.hash, receipt_hash: e2e.receipt_hash, missing_stages: e2e.missing_stages, error: e2e.error, response: e2e.response } })]);
    const det = await runDeterminism({ repoDir, runs: 3 });
    add([check({ id: 'selftest.determinism', domain: 'Bootstrap', title: `determinism: ${det.runs} runs identical=${det.identical_decisions} forbidden_leaks=${det.forbidden_leaks.length}`, status: det.ok ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { decision_hashes: det.decision_hashes, fields: det.decision_fields, forbidden_leaks: det.forbidden_leaks } })]);
    const fi = await runFaultInjection({ repoDir });
    add([check({ id: 'selftest.fault-injection', domain: 'Bootstrap', title: `fault injection: ${fi.scenarios.filter((s) => s.ok).length}/${fi.scenarios.length} scenarios fail safely`, status: fi.ok ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { scenarios: fi.scenarios.map((s) => ({ id: s.id, ok: s.ok, outcome: s.outcome })) } })]);
  } else {
    const skipped = [
      ['gate.repository-verify', 'complete repository npm run verify', CRITICALITY.MANDATORY],
      ['selftest.e2e', 'end-to-end bootstrap self-test', CRITICALITY.MANDATORY],
      ['selftest.determinism', 'three-run deterministic decision replay', CRITICALITY.MANDATORY],
      ['selftest.fault-injection', 'safe fault-injection matrix', CRITICALITY.REQUIRED],
    ];
    add(skipped.map(([id, title, criticality]) => check({ id, domain: 'Bootstrap', title: `${title} (not executed in --fast mode)`, status: STATUS.UNVERIFIED, criticality, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { fast_mode: true, executed: false }, remediation: 'rerun without --fast for final certification' })));
  }

  // Protected-master pin: re-read after the last check (closure item 5).
  const after = protectedMasterBaseline(repoDir, manifest.canonical_branch);
  const staleness = protectedMasterStale(baseline, after);
  add([check({ id: 'certification.protected-master-pin', domain: 'Certification', title: `certification pinned to origin/${manifest.canonical_branch} ${baseline.origin_master_remote || baseline.origin_master_local || 'UNRESOLVED'} and HEAD ${baseline.head}; ${staleness.stale ? 'STALE' : 'unchanged'} at seal time`, status: !staleness.stale && (baseline.origin_master_remote || baseline.origin_master_local) ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { before: baseline, after, stale: staleness.stale, reasons: staleness.reasons }, remediation: 're-run certification on a stable HEAD/base; a moved base invalidates every check that ran before it moved' })]);

  const gates = deriveAuthGates(checks, manifest);
  const p0 = [...checks.filter((c) => c.severity === 'P0' && c.status === STATUS.FAIL).map((c) => c.id), ...gapRegister.filter((g) => g.severity === 'P0' && g.status !== 'RESOLVED').map((g) => g.id)];
  const v = verdict(checks, { p0Open: p0 });
  const requiredItems = requiredItemsForRole(manifest, role);
  const profiles = evaluateAllProfiles({ checks, requiredItems });
  const selected = profiles[profile];
  // A role report is scoped to its requested readiness profile; otherwise a worker report can never
  // certify because control/recovery owner gates would make it circular. WHOLE_SYSTEM_GREEN retains
  // the strict global verdict law. Aggregate GREEN is issued only by verifyWholeSystemEvidence().
  let overall = profile === 'WHOLE_SYSTEM_GREEN' ? v.verdict : selected.status;
  let reason = profile === 'WHOLE_SYSTEM_GREEN' ? v.reason : `${profile}: ${selected.reason}`;
  if (p0.length) { overall = 'RED'; reason = `unresolved P0 findings: ${p0.join(', ')}`; }
  if (staleness.stale) { overall = 'STALE'; reason = `protected master pin invalidated: ${staleness.reasons.join('; ')}`; }
  const report = {
    schema_version: 2,
    report_id: runId,
    repository: manifest.canonical_repository,
    repository_commit: baseline.head,
    protected_master_sha: baseline.origin_master_remote || baseline.origin_master_local || null,
    protected_master_pin: { before: baseline, after, stale: staleness.stale, reasons: staleness.reasons },
    branch: git(repoDir, ['branch', '--show-current']).output,
    timestamp: new Date().toISOString(),
    host_role: role,
    host_role_resolution: resolved,
    topology_authority: HOSTS_REL,
    readiness_profile: profile,
    readiness_profiles: profiles,
    required_items: requiredItems,
    overall_status: overall,
    verdict_reason: reason,
    summary: summarize(checks),
    readiness_matrix: readinessMatrix(checks),
    project_truth: sect(checks, ['Project Truth']), hermes: sect(checks, ['Hermes']), vekl: sect(checks, ['VEKL', 'GraphRAG']), providers: sect(checks, ['Claude', 'Codex', 'Xkiro', 'Google tools']),
    mcp: sect(checks, ['MCP']), plugins: sect(checks, ['Bootstrap']).filter((c) => /plg\./.test(c.id)), workers: sect(checks, ['vekl-worker', 'oracle-admin', 'Recovery', 'Desktop Commander']), github: sect(checks, ['GitHub']), security: sect(checks, ['Security', 'Supply chain']),
    authentication: checks.filter((c) => /auth|credential|token/.test(c.id)).map(strip), network: sect(checks, ['Network']), bootstrap: sect(checks, ['Bootstrap', 'Role guard', 'Systemd', 'Containers', 'Topology', 'Certification']), tests: checks.filter((c) => /selftest|vekl\.|verify/.test(c.id)).map(strip),
    blocking_gates: dedupeGates([...gates.filter((g) => g.criticality === CRITICALITY.MANDATORY), ...checks.filter((c) => c.status === STATUS.EXTERNAL_GATE && c.criticality !== CRITICALITY.OPTIONAL).map((c) => ({ gate_id: c.gate, status: 'EXTERNAL_GATE', component: c.id, requirement: c.remediation, criticality: c.criticality }))]),
    owner_action_gates: gates,
    p0_open: p0,
    checks: checks.map(strip),
    duration_ms: Date.now() - t0,
  };
  report.report_hash = crypto.createHash('sha256').update(JSON.stringify({ ...report, timestamp: undefined, duration_ms: undefined })).digest('hex');
  return report;
}

// Branch protection (GAP-010): never PASS from repository content alone. PASS requires a fresh owner-exported
// GitHub enforcement API observation (branch protection or ruleset) that matches the committed expectation.
export function branchProtectionCheck({ repoDir, now = Date.now() } = {}) {
  const expectation = readJsonSafe(path.join(repoDir, 'docs/project-state/BRANCH_PROTECTION_EXPECTATION.json'));
  const evidence = readJsonSafe(path.join(repoDir, 'docs/project-state/BRANCH_PROTECTION_EVIDENCE.json'));
  const base = { id: 'github.branch-protection', domain: 'GitHub', criticality: CRITICALITY.REQUIRED, readiness_class: 'OWNER_CONTROL_REQUIRED', gate: 'OWNER-GATE-BRANCH-PROTECTION-001' };
  if (!expectation) return check({ ...base, title: 'branch-protection expectation missing (docs/project-state/BRANCH_PROTECTION_EXPECTATION.json)', status: STATUS.FAIL, evidence: {} });
  if (!evidence) return check({ ...base, title: 'branch protection on master: expectation declared, GitHub evidence not exported (not verifiable from repository content)', status: STATUS.OWNER_ACTION_REQUIRED, evidence: { expectation_file: 'docs/project-state/BRANCH_PROTECTION_EXPECTATION.json', evidence_file: 'docs/project-state/BRANCH_PROTECTION_EVIDENCE.json (absent)' }, remediation: 'owner: export the live master branch-protection or matching ruleset API state into docs/project-state/BRANCH_PROTECTION_EVIDENCE.json following the committed schema' });
  const problems = [];
  const obs = evidence.observed || {};
  const exp = expectation.expected || {};
  if (evidence.repository !== 'Vanguduza/dial-new') problems.push('evidence repository mismatch');
  const sourceOk = ['GITHUB_BRANCH_PROTECTION_API_EXPORT', 'GITHUB_RULESET_API_EXPORT'].includes(evidence.source);
  if (!sourceOk) problems.push('evidence source is not a supported GitHub enforcement API export');
  if (!['BRANCH_PROTECTION', 'RULESET'].includes(evidence.enforcement_type)) problems.push('enforcement_type missing/invalid');
  if (!evidence.enforcement_id) problems.push('enforcement_id missing');
  if (evidence.enforcement_type === 'BRANCH_PROTECTION' && evidence.source !== 'GITHUB_BRANCH_PROTECTION_API_EXPORT') problems.push('branch-protection evidence/source mismatch');
  if (evidence.enforcement_type === 'RULESET' && evidence.source !== 'GITHUB_RULESET_API_EXPORT') problems.push('ruleset evidence/source mismatch');
  if (!/^[0-9a-f]{64}$/.test(evidence.source_payload_sha256 || '')) problems.push('source_payload_sha256 missing/invalid');
  for (const c of exp.required_status_checks || []) if (!(obs.required_status_checks || []).includes(c)) problems.push(`required status check missing: ${c}`);
  for (const k of ['required_pull_request', 'block_force_pushes', 'block_deletions', 'required_signatures', 'require_code_owner_review', 'dismiss_stale_reviews', 'require_branches_up_to_date', 'enforce_on_administrators']) if (exp[k] === true && obs[k] !== true) problems.push(`${k} expected true`);
  if (Number(obs.required_approving_review_count || 0) < Number(exp.required_approving_review_count || 0)) problems.push('required_approving_review_count below expectation');
  if (obs.branch !== exp.branch) problems.push(`evidence branch ${obs.branch} != ${exp.branch}`);
  const observedAt = Date.parse(evidence.observed_at || '');
  const maxAgeMs = Number(expectation.max_evidence_age_days || 30) * 86400000;
  if (!Number.isFinite(observedAt)) problems.push('evidence observed_at missing');
  else if (now - observedAt > maxAgeMs) problems.push(`evidence older than ${expectation.max_evidence_age_days || 30} days`);
  if (!evidence.exported_by) problems.push('evidence exported_by missing');
  return check({ ...base, title: `branch protection on ${exp.branch}: exported GitHub evidence ${problems.length ? 'does not match' : 'matches'} the expectation (${problems.length} problems)`, status: problems.length ? STATUS.FAIL : STATUS.PASS, evidence: { expectation: exp, observed: obs, observed_at: evidence.observed_at || null, exported_by: evidence.exported_by || null, problems }, remediation: 'owner: apply the expected protected-master controls in GitHub and re-export enforcement evidence' });
}

function dedupeGates(list) { const seen = new Map(); for (const g of list) { if (!seen.has(g.gate_id)) seen.set(g.gate_id, { ...g, components: [g.component] }); else seen.get(g.gate_id).components.push(g.component); } return [...seen.values()]; }
function strip(c) { return { id: c.id, domain: c.domain, title: c.title, status: c.status, criticality: c.criticality, readiness_class: c.readiness_class, evidence: c.evidence, remediation: c.remediation, severity: c.severity, gate: c.gate }; }
function sect(checks, domains) { return checks.filter((c) => domains.includes(c.domain)).map(strip); }

export function renderMatrix(matrix) {
  const head = 'Domain| Required| Installed| Configured| Authenticated| Integrated| Tested| Deterministic| Secure| Status';
  return [head, ...matrix.map((r) => [r.domain, r.required ? '✓' : '', r.installed, r.configured, r.authenticated, r.integrated, r.tested, r.deterministic, r.secure, r.status].join('| '))].join('\n');
}
