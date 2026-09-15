import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { STATUS, CRITICALITY, summarize, verdict } from '../lib/result.mjs';
import { itemsForRole } from '../lib/manifest.mjs';
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
import { check } from '../lib/result.mjs';
import { git, hostFacts, diskFree } from '../lib/probes.mjs';
import { resolveHostRole, workloadDecision } from '../roles/role-guard.mjs';
import { loadRoles } from '../lib/manifest.mjs';

// Readiness matrix domains (mission section 43) and which check domains feed each row.
const MATRIX = [
  ['Hermes', true, ['Hermes']], ['Claude', true, ['Claude']], ['Codex', true, ['Codex']], ['GitHub', true, ['GitHub']],
  ['VEKL', true, ['VEKL']], ['GraphRAG', true, ['GraphRAG']], ['MCP', true, ['MCP']], ['Model routing', true, ['Model routing']],
  ['Project Truth', true, ['Project Truth']], ['vekl-worker', true, ['vekl-worker']], ['oracle-admin', false, ['oracle-admin']],
  ['Owner WhatsApp', false, ['Owner WhatsApp']], ['Desktop Commander', false, ['Desktop Commander']], ['Xkiro', false, ['Xkiro']],
  ['Google tools', false, ['Google tools']], ['Security', true, ['Security']], ['Supply chain', true, ['Supply chain']],
  ['Systemd', true, ['Systemd']], ['Containers', false, ['Containers']], ['Network', true, ['Network']], ['Bootstrap', true, ['Bootstrap']], ['Role guard', true, ['Role guard']],
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
      installed: col(dc, (c) => /binary|module|installed|present/.test(c.id)),
      configured: col(dc, (c) => /config|registered|pinned|hook|fingerprint/.test(c.id)),
      authenticated: col(dc, (c) => /auth|credential|reach|token/.test(c.id)),
      integrated: col(dc, (c) => /probe|gate|mirror|dispatch|e2e|selftest|activation|producer/.test(c.id)),
      tested: col(dc, (c) => /verify|vekl\.|routing|selftest|fault|determin|test/.test(c.id)),
      deterministic: col(dc, (c) => /determin|fingerprint|unit-check|graph-check|retrieval/.test(c.id)),
      secure: col(dc, (c) => /no-ambient|no-tracked|modes|hardening|loopback|secret|lockfile|unpinned/.test(c.id)),
      status: rowStatus(dc, required),
    };
  });
}

export async function certify({ repoDir, controlHome, manifest, role, runId, log, fast = false, skipRepositoryGates = false, gapRegister = [] }) {
  const checks = [];
  const t0 = Date.now();
  const add = (list) => { for (const c of list) { checks.push(c); log?.[c.status === STATUS.PASS ? 'ok' : c.status === STATUS.FAIL ? 'error' : 'warn'](c.id, { status: c.status, message: c.title }); } };

  // Role guard first: everything else is interpreted relative to the resolved role.
  const resolved = resolveHostRole();
  add([check({ id: 'role.resolved', domain: 'Role guard', title: `host role resolved: ${resolved.role} via ${resolved.source}`, status: resolved.role === 'UNKNOWN' ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.MANDATORY, evidence: resolved, remediation: 'echo <role> | sudo tee /etc/dial/host-role; chmod 644' })]);
  const roles = loadRoles();
  const mismatch = [];
  for (const [r, def] of Object.entries(roles.roles)) for (const w of def.forbidden_workloads || []) if (workloadDecision({ role: r, workload: w, roles }).allowed) mismatch.push(`${r}:${w}`);
  add([check({ id: 'role.forbidden-workloads-refused', domain: 'Role guard', title: 'every forbidden workload refused for every declared role (mismatched-role probes)', status: mismatch.length ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.MANDATORY, evidence: { probes: Object.values(roles.roles).reduce((n, d) => n + (d.forbidden_workloads || []).length, 0), leaks: mismatch } })]);
  if (resolved.role !== role) add([check({ id: 'role.requested-vs-resolved', domain: 'Role guard', title: `requested role ${role} differs from resolved ${resolved.role}; certification runs for the resolved role's expectations only where they overlap`, status: STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { requested: role, resolved: resolved.role }, remediation: 'run on the intended host or set DIAL_HOST_ROLE explicitly' })]);

  // Packages and runtimes.
  for (const p of itemsForRole(manifest.packages, role)) add([binaryCheck({ id: p.id, domain: 'Bootstrap', binary: p.binary, minimum: p.minimum_version, args: p.version_args || ['--version'], criticality: p.criticality, remediation: p.remediation })]);
  for (const r of itemsForRole(manifest.runtimes, role)) if (!['rt.codex', 'rt.claude-code', 'rt.hermes', 'rt.antigravity'].includes(r.id)) add([binaryCheck({ id: r.id, domain: 'Bootstrap', binary: r.binary, minimum: r.minimum_version, criticality: r.criticality, remediation: r.remediation })]);
  const host = hostFacts(); const disk = diskFree(repoDir);
  const roleDef = roles.roles[role];
  add([check({ id: 'bootstrap.host-facts', domain: 'Bootstrap', title: `host ${host.hostname} ${host.arch} ${host.cpus}cpu ${host.memory_total_mb}MB disk_avail=${disk.avail_mb}MB`, status: roleDef?.expected_arch?.includes(host.arch === 'x64' ? 'x86_64' : host.arch) ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, evidence: { ...host, disk } })]);
  add([check({ id: 'bootstrap.resource-floor', domain: 'Bootstrap', title: 'resource floor: >= 2 vCPU, >= 3.5 GB RAM, >= 5 GB free disk for verification workloads', status: host.cpus >= 2 && host.memory_total_mb >= 3500 && disk.avail_mb >= 5000 ? STATUS.PASS : STATUS.FAIL, criticality: role === 'oracle-admin' ? CRITICALITY.OPTIONAL : CRITICALITY.REQUIRED, evidence: { cpus: host.cpus, memory_total_mb: host.memory_total_mb, disk_avail_mb: disk.avail_mb } })]);

  // Providers.
  add(certifyClaude({ role, manifest }));
  add(certifyCodex({ role, manifest }));
  add(certifyHermes({ role, manifest }));
  add(certifyXkiro({ role, controlHome }));
  add(certifyGoogle({ role, repoDir }));
  // GitHub.
  const remote = git(repoDir, ['remote', 'get-url', 'origin']).output;
  const ls = git(repoDir, ['ls-remote', '--heads', 'origin', manifest.canonical_branch], { timeoutMs: 40000 });
  add([check({ id: 'github.remote', domain: 'GitHub', title: `origin is ${manifest.canonical_repository}`, status: /Vanguduza\/dial-new/.test(remote) ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { command: 'git remote get-url origin', output: remote.replace(/\/\/[^@]*@/, '//REDACTED@') } })]);
  add([check({ id: 'github.auth-reach', domain: 'GitHub', title: `authenticated reach: git ls-remote origin ${manifest.canonical_branch}`, status: ls.ok ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { command: ls.command, output: ls.output.slice(0, 100), exit: ls.status }, remediation: 'restore GitHub credentials (deploy key / connector)' })]);
  add([check({ id: 'github.branch-protection', domain: 'GitHub', title: 'branch protection on master (required checks project-truth + verify) — not verifiable from repository content', status: STATUS.UNVERIFIED, criticality: CRITICALITY.REQUIRED, evidence: { finding: 'no CODEOWNERS, no committed protection ruleset; PROJECT_TRUTH_PROTOCOL asserts a required project-truth check' }, remediation: 'owner: confirm GitHub branch protection settings; export ruleset JSON into docs/project-state as evidence' })]);
  add([check({ id: 'github.commit-signing', domain: 'GitHub', title: 'commit signing policy', status: STATUS.FAIL, criticality: CRITICALITY.OPTIONAL, evidence: { finding: 'no gpg/ssh signing configured or verified anywhere; integrity relies on ledger content hashes' }, remediation: 'adopt SSH commit signing + verified-signature requirement (owner decision)', severity: 'P2' })]);
  // MCP, systemd, containers, network.
  add(certifyMcp({ role, manifest, repoDir }));
  add(certifySystemd({ role, manifest }));
  add(certifyContainers({ manifest }));
  add(await certifyNetwork({ role, manifest }));
  // Repository / VEKL / GraphRAG / Hermes state / secrets / supply chain.
  if (!skipRepositoryGates) add(await certifyRepository({ role, repoDir, controlHome, manifest, fast }));
  // Owner WhatsApp / Desktop Commander / oracle-admin / vekl-worker rows.
  add([check({ id: 'whatsapp.channel', domain: 'Owner WhatsApp', title: 'owner WhatsApp channel (Hermes self-chat pairing or Meta Cloud config)', status: role === 'dial-hermes-control' ? STATUS.OWNER_ACTION_REQUIRED : STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, evidence: { probe: 'npm run agent:operator:whatsapp-hermes-status' }, gate: 'AUTH-GATE-WHATSAPP-001', remediation: 'bash deploy/oracle/hermes-codex/pair-hermes-whatsapp.sh --foreground' })]);
  add([check({ id: 'desktop-commander.presence', domain: 'Desktop Commander', title: 'Desktop Commander (recovery plane only; absent from canonical master)', status: role === 'oracle-admin' ? STATUS.OWNER_ACTION_REQUIRED : STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, evidence: { finding: 'exists only on unmerged PR #24/#27 lineage' }, gate: 'AUTH-GATE-DESKTOP-COMMANDER-001', remediation: 'owner decision on merging the recovery-fabric lineage; then device-code pairing' })]);
  add([check({ id: 'oracle-admin.role-separation', domain: 'oracle-admin', title: 'oracle-admin cannot run development workloads (role guard)', status: workloadDecision({ role: 'oracle-admin', workload: 'REPOSITORY_WRITE', roles }).allowed || workloadDecision({ role: 'oracle-admin', workload: 'HERMES_RUNTIME', roles }).allowed ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.MANDATORY, evidence: { probes: ['REPOSITORY_WRITE', 'HERMES_RUNTIME', 'OWNER_CONTROL'] } })]);
  add([check({ id: 'oracle-admin.live', domain: 'oracle-admin', title: 'oracle-admin host live certification', status: role === 'oracle-admin' ? STATUS.UNVERIFIED : STATUS.EXTERNAL_GATE, criticality: CRITICALITY.OPTIONAL, evidence: { note: 'no canonical provisioning exists on master; recovery path unproven' }, gate: 'EXTERNAL-GATE-ORACLE-ADMIN-001' })]);
  add([check({ id: 'vekl-worker.role-separation', domain: 'vekl-worker', title: 'vekl-worker cannot become control authority (OWNER_CONTROL/HERMES_RUNTIME/EXTERNAL_QUEUE refused)', status: ['OWNER_CONTROL', 'HERMES_RUNTIME', 'EXTERNAL_QUEUE', 'WORKER_DISPATCH'].some((w) => workloadDecision({ role: 'vekl-worker', workload: w, roles }).allowed) ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.MANDATORY, evidence: { role_definition: roles.roles['vekl-worker'].host_class } })]);
  try {
    const d = await dispatchWorkerJob({ kind: 'REPO_HEAD', repoDir, transport: 'local', workerEnv: { ...process.env, DIAL_HOST_ROLE: 'vekl-worker' }, workerRoot: path.join(controlHome && fs.existsSync(controlHome) ? controlHome : process.env.TMPDIR || '/tmp', 'bootstrap', 'worker-selftest') });
    add([check({ id: 'vekl-worker.dispatch-local', domain: 'vekl-worker', title: 'worker job contract: dispatch REPO_HEAD -> sealed receipt (local transport)', status: d.ok ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, evidence: { correlation_id: d.job.correlation_id, receipt_hash: d.receipt.receipt_hash, worker_role: d.receipt.worker.role, result: d.receipt.result } })]);
  } catch (e) { add([check({ id: 'vekl-worker.dispatch-local', domain: 'vekl-worker', title: 'worker job contract (local transport)', status: STATUS.FAIL, criticality: CRITICALITY.REQUIRED, evidence: { error: e.message } })]); }
  add([check({ id: 'vekl-worker.live', domain: 'vekl-worker', title: 'vekl-worker host reachable and executing jobs over SSH', status: process.env.DIAL_WORKER_SSH_HOST ? STATUS.UNVERIFIED : STATUS.EXTERNAL_GATE, criticality: CRITICALITY.REQUIRED, evidence: { note: 'no vekl-worker host is declared in canonical master; hosts inventory exists only on the unmerged PR #24 lineage (as oracle-admin-v2)' }, gate: 'EXTERNAL-GATE-VEKL-WORKER-001', remediation: 'owner: confirm the host name mapping, then run bootstrap --apply --role vekl-worker on it and bootstrap --verify with DIAL_WORKER_SSH_HOST set on the control host' })]);
  // Self-tests.
  if (!fast) {
    const e2e = await runE2ESelfTest({ repoDir });
    add([check({ id: 'selftest.e2e', domain: 'Bootstrap', title: `end-to-end self-test ${e2e.ok ? 'passed' : 'failed'} (${e2e.stages.length} stages, correlation ${e2e.correlation_id})`, status: e2e.ok ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { correlation_id: e2e.correlation_id, decision_hash: e2e.decision_fingerprint.hash, receipt_hash: e2e.receipt_hash, missing_stages: e2e.missing_stages, error: e2e.error, response: e2e.response } })]);
    const det = await runDeterminism({ repoDir, runs: 3 });
    add([check({ id: 'selftest.determinism', domain: 'Bootstrap', title: `determinism: ${det.runs} runs identical=${det.identical_decisions} forbidden_leaks=${det.forbidden_leaks.length}`, status: det.ok ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { decision_hashes: det.decision_hashes, fields: det.decision_fields, forbidden_leaks: det.forbidden_leaks } })]);
    const fi = await runFaultInjection({ repoDir });
    add([check({ id: 'selftest.fault-injection', domain: 'Bootstrap', title: `fault injection: ${fi.scenarios.filter((s) => s.ok).length}/${fi.scenarios.length} scenarios fail safely`, status: fi.ok ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, evidence: { scenarios: fi.scenarios.map((s) => ({ id: s.id, ok: s.ok, outcome: s.outcome })) } })]);
  }
  const gates = deriveAuthGates(checks, manifest);
  const p0 = [...checks.filter((c) => c.severity === 'P0' && c.status === STATUS.FAIL).map((c) => c.id), ...gapRegister.filter((g) => g.severity === 'P0' && g.status !== 'RESOLVED').map((g) => g.id)];
  const v = verdict(checks, { p0Open: p0 });
  const head = git(repoDir, ['rev-parse', 'HEAD']).output;
  const report = {
    schema_version: 1,
    report_id: runId,
    repository: manifest.canonical_repository,
    repository_commit: head,
    branch: git(repoDir, ['branch', '--show-current']).output,
    timestamp: new Date().toISOString(),
    host_role: role,
    host_role_resolution: resolved,
    overall_status: v.verdict,
    verdict_reason: v.reason,
    summary: summarize(checks),
    readiness_matrix: readinessMatrix(checks),
    project_truth: sect(checks, ['Project Truth']), hermes: sect(checks, ['Hermes']), vekl: sect(checks, ['VEKL', 'GraphRAG']), providers: sect(checks, ['Claude', 'Codex', 'Xkiro', 'Google tools']),
    mcp: sect(checks, ['MCP']), plugins: sect(checks, ['Bootstrap']).filter((c) => /plg\./.test(c.id)), workers: sect(checks, ['vekl-worker', 'oracle-admin']), github: sect(checks, ['GitHub']), security: sect(checks, ['Security', 'Supply chain']),
    authentication: checks.filter((c) => /auth|credential|token/.test(c.id)).map(strip), network: sect(checks, ['Network']), bootstrap: sect(checks, ['Bootstrap', 'Role guard', 'Systemd', 'Containers']), tests: checks.filter((c) => /selftest|vekl\.|verify/.test(c.id)).map(strip),
    blocking_gates: dedupeGates([...gates.filter((g) => g.criticality === CRITICALITY.MANDATORY), ...checks.filter((c) => c.status === STATUS.EXTERNAL_GATE && c.criticality !== CRITICALITY.OPTIONAL).map((c) => ({ gate_id: c.gate, status: 'EXTERNAL_GATE', component: c.id, requirement: c.remediation, criticality: c.criticality }))]),
    owner_action_gates: gates,
    p0_open: p0,
    checks: checks.map(strip),
    duration_ms: Date.now() - t0,
  };
  report.report_hash = crypto.createHash('sha256').update(JSON.stringify({ ...report, timestamp: undefined, duration_ms: undefined })).digest('hex');
  return report;
}
function dedupeGates(list) { const seen = new Map(); for (const g of list) { if (!seen.has(g.gate_id)) seen.set(g.gate_id, { ...g, components: [g.component] }); else seen.get(g.gate_id).components.push(g.component); } return [...seen.values()]; }
function strip(c) { return { id: c.id, domain: c.domain, title: c.title, status: c.status, criticality: c.criticality, evidence: c.evidence, remediation: c.remediation, severity: c.severity, gate: c.gate }; }
function sect(checks, domains) { return checks.filter((c) => domains.includes(c.domain)).map(strip); }

export function renderMatrix(matrix) {
  const head = 'Domain| Required| Installed| Configured| Authenticated| Integrated| Tested| Deterministic| Secure| Status';
  return [head, ...matrix.map((r) => [r.domain, r.required ? '✓' : '', r.installed, r.configured, r.authenticated, r.integrated, r.tested, r.deterministic, r.secure, r.status].join('| '))].join('\n');
}
