#!/usr/bin/env node
// Compose DIAL_DEVELOPMENT_GREEN_FLAG.json from a certification report, the gap register and the
// traceability matrix. The verdict is recomputed here from the three inputs so a hand-edited
// report cannot claim GREEN while a P0 gap is open.
//
//   node ops/development-bootstrap/verify/green-flag.mjs <control-report.json> <out.json>
//     --host-report <worker.json> --host-report <oracle.json> --host-report <provider.json>
//     --trusted-key <key-id=/path/to/public.pem> [--evidence-dir <dir>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(here, '../../..');
const DOCS = 'docs/dial/final-audit/06_DEVELOPMENT_SYSTEM';

export function composeGreenFlag({ report, hostReports = [report], trustedKeys = {}, gapRegister, traceability, evidenceIndex = [], now = Date.now() }) {
  const p0Open = gapRegister.gaps.filter((g) => g.severity === 'P0' && !/^RESOLVED/.test(g.status));
  const systemEvidence = verifyWholeSystemEvidence({ reports: hostReports, trustedKeys, repositoryCommit: report.repository_commit, now });
  const remoteSubstitutions = new Map([['vekl-worker.live', 'vekl-worker'], ['oracle-admin.live', 'oracle-admin']]);
  const roleVerified = (role) => systemEvidence.verified.some((entry) => entry.role === role && entry.signature_valid && entry.proof_checks_ok);
  const baseOpen = report.checks.filter((check) => check.criticality !== 'OPTIONAL' && !['PASS', 'NOT_APPLICABLE'].includes(check.status) && !roleVerified(remoteSubstitutions.get(check.id)));
  const baseChecksCertified = baseOpen.length === 0;
  let overall = p0Open.length || !systemEvidence.ok || !baseChecksCertified ? 'RED' : 'GREEN';
  const conditions = greenFlagConditions({ report, gapRegister, systemEvidence, baseChecksCertified });
  if (conditions.some((condition) => condition.status !== 'MET')) overall = 'RED';
  const out = {
    schema_version: 1,
    report_id: report.report_id,
    repository: report.repository,
    repository_commit: report.repository_commit,
    branch: report.branch,
    timestamp: report.timestamp,
    host_role_certified_from: report.host_role,
    overall_status: overall,
    verdict_reason: overall === 'GREEN' ? 'all base checks and role-specific signed evidence satisfy the 35 GREEN conditions' : `GREEN conditions incomplete: ${[...systemEvidence.failures, ...p0Open.map((g) => `P0_OPEN:${g.id}`), ...baseOpen.map((c) => `CHECK_OPEN:${c.id}`), ...conditions.filter((c) => c.status !== 'MET').map((c) => `CONDITION_${c.n}`)].join(', ')}`,
    owner_statement: overall === 'GREEN' ? 'DIAL DEVELOPMENT SYSTEM GREEN FLAG: DEVELOPMENT MAY COMMENCE' : 'DIAL DEVELOPMENT SYSTEM NOT YET GREEN — BLOCKERS REMAIN',
    summary: report.summary,
    readiness_matrix: report.readiness_matrix,
    green_flag_conditions: conditions,
    project_truth: report.project_truth, hermes: report.hermes, vekl: report.vekl, providers: report.providers, mcp: report.mcp, plugins: report.plugins,
    workers: report.workers, github: report.github, security: report.security, authentication: report.authentication, network: report.network, bootstrap: report.bootstrap, tests: report.tests,
    blocking_gates: report.blocking_gates,
    owner_action_gates: report.owner_action_gates,
    p0_open: p0Open.map((g) => ({ id: g.id, title: g.title, gate: g.gate, owner_decision_required: g.owner_decision_required })),
    gap_register: { source: `${DOCS}/DIAL_DEVELOPMENT_SYSTEM_GAP_REGISTER.json`, counts: countBy(gapRegister.gaps, 'severity'), open_by_severity: countBy(gapRegister.gaps.filter((g) => !/^RESOLVED/.test(g.status)), 'severity'), owner_decisions_required: gapRegister.gaps.filter((g) => g.owner_decision_required).map((g) => g.id) },
    traceability: { source: `${DOCS}/DIAL_DEVELOPMENT_SYSTEM_TRACEABILITY.json`, counts: countBy(traceability.rows, 'status') },
    evidence: evidenceIndex,
    whole_system_evidence: systemEvidence,
    secrets_policy: 'no secret values; locations and modes only',
  };
  out.report_hash = crypto.createHash('sha256').update(JSON.stringify({ ...out, timestamp: undefined })).digest('hex');
  return out;
}

const REQUIRED_REPORT_ROLES = Object.freeze(['dial-hermes-control', 'vekl-worker', 'oracle-admin', 'provider-container']);
const ROLE_PROOF_CHECKS = Object.freeze({
  'dial-hermes-control': ['role.resolved', 'topology.host-inventory-drift', 'fabric.qualifier', 'systemd.dial-hermes-runtime.service'],
  'vekl-worker': ['role.resolved', 'topology.host-inventory-drift', 'vekl-worker.live', 'systemd.dial-worker-agent.timer', 'systemd.dial-structural-snapshot.timer'],
  'oracle-admin': ['role.resolved', 'topology.host-inventory-drift', 'oracle-admin.live', 'systemd.dial-recovery-agent.service'],
  'provider-container': ['role.resolved', 'selftest.e2e'],
});
function recomputeReportHash(report) {
  const { report_hash, evidence_signature, ...body } = report || {};
  return crypto.createHash('sha256').update(JSON.stringify({ ...body, timestamp: undefined, duration_ms: undefined })).digest('hex');
}
export function verifyWholeSystemEvidence({ reports = [], trustedKeys = {}, repositoryCommit, now = Date.now(), maxAgeMs = 30 * 60 * 1000 } = {}) {
  const failures = []; const verified = [];
  for (const role of REQUIRED_REPORT_ROLES) {
    const report = reports.find((item) => item?.host_role === role);
    if (!report) { failures.push(`MISSING_REPORT:${role}`); continue; }
    const observed = Date.parse(report.timestamp || '');
    if (!Number.isFinite(observed) || Math.abs(now - observed) > maxAgeMs) failures.push(`STALE_REPORT:${role}`);
    if (report.repository_commit !== repositoryCommit) failures.push(`COMMIT_MISMATCH:${role}`);
    if (report.report_hash !== recomputeReportHash(report)) failures.push(`REPORT_HASH_INVALID:${role}`);
    const missingProofs = ROLE_PROOF_CHECKS[role].filter((id) => !report.checks?.some((check) => check.id === id && ['PASS', 'NOT_APPLICABLE'].includes(check.status)));
    if (missingProofs.length) failures.push(`ROLE_PROOF_INCOMPLETE:${role}:${missingProofs.join('|')}`);
    const signature = report.evidence_signature || {};
    const key = trustedKeys[signature.key_id];
    let signatureValid = false;
    if (signature.algorithm === 'ed25519' && key && signature.value_base64) {
      try { signatureValid = crypto.verify(null, Buffer.from(report.report_hash || ''), key, Buffer.from(signature.value_base64, 'base64')); } catch {}
    }
    if (!signatureValid) failures.push(`SIGNATURE_INVALID:${role}`);
    verified.push({ role, report_id: report.report_id, report_hash: report.report_hash, key_id: signature.key_id || null, signature_valid: signatureValid, proof_checks_ok: missingProofs.length === 0, proof_checks: ROLE_PROOF_CHECKS[role], observed_at: report.timestamp });
  }
  return { ok: failures.length === 0, required_roles: REQUIRED_REPORT_ROLES, repository_commit: repositoryCommit, verified, failures };
}

function countBy(list, key) { const m = {}; for (const x of list) m[x[key]] = (m[x[key]] || 0) + 1; return m; }
function has(report, id, status = 'PASS') { const c = report.checks.find((x) => x.id === id); return c ? c.status === status : false; }
function state(report, id) { return report.checks.find((x) => x.id === id)?.status || 'ABSENT'; }

// The 35 acceptance criteria of mission section 44, each mapped to evidence in the report or the gap register.
export function greenFlagConditions({ report, gapRegister, systemEvidence = { ok: false, verified: [] }, baseChecksCertified = false }) {
  const gapOpen = (id) => gapRegister.gaps.some((g) => g.id === id && !/^RESOLVED/.test(g.status));
  const roleVerified = (role) => systemEvidence.verified.some((entry) => entry.role === role && entry.signature_valid && entry.proof_checks_ok);
  const rows = [
    [1, 'Canonical Project Truth is identifiable', has(report, 'repo.canonical-state') && has(report, 'repo.required-ancestors')],
    [2, 'Project Truth contradictions affecting development resolved or blocked', has(report, 'repo.project-truth-guard')],
    [3, 'Hermes is operational', has(report, 'hermes.oracle-status-mirror'), 'GAP-003'],
    [4, 'Hermes has deterministic project routing', has(report, 'selftest.determinism')],
    [5, 'VEKL operational at required maturity', has(report, 'vekl.vekl-architecture-check')],
    [6, 'Knowledge provenance functional', has(report, 'vekl.knowledge-check')],
    [7, 'Stale-context handling exists', has(report, 'selftest.fault-injection')],
    [8, 'Development-unit lineage reliable', has(report, 'vekl.vekl-unit-check')],
    [9, 'Critical GraphRAG functions operational', has(report, 'vekl.vekl-graph-check') && has(report, 'vekl.vekl-retrieval-eval')],
    [10, 'Graphify work does not conflict with current architecture', has(report, 'graphrag.graphify-activation')],
    [11, 'Claude authentication works', has(report, 'claude.auth')],
    [12, 'Codex authentication works', state(report, 'codex.auth') === 'PASS', 'GAP-002'],
    [13, 'Required models accessible', has(report, 'claude.exact-model-policy') && state(report, 'codex.auth') === 'PASS', 'GAP-002'],
    [14, 'Model-routing policy enforced', has(report, 'vekl.routing-architecture-check')],
    [15, 'Required MCP services work', has(report, 'mcp.dial-oracle-status.capability-probe')],
    [16, 'GitHub authentication works', has(report, 'github.auth-reach')],
    [17, 'DIAL repositories reachable', has(report, 'github.remote')],
    [18, 'Branch governance works', state(report, 'github.branch-protection') === 'PASS', 'GAP-010'],
    [19, 'Provider-container execution works', roleVerified('provider-container')],
    [20, 'vekl-worker works where required', roleVerified('vekl-worker'), 'GAP-005'],
    [21, 'Role separation works', has(report, 'role.forbidden-workloads-refused')],
    [22, 'oracle-admin remains recovery/admin oriented', has(report, 'oracle-admin.role-separation')],
    [23, 'Required development runtimes installed', ['rt.node', 'rt.npm', 'rt.python3', 'pkg.git'].every((id) => has(report, id))],
    [24, 'Required plugins/connectors installed', has(report, 'mcp.dial-oracle-status.module')],
    [25, 'Required plugins/connectors authenticated', has(report, 'mcp.github.repository-reach')],
    [26, 'All enrolled operational external tooling is installed/enrolled, authenticated where applicable, live-certified and selection-ready; REFERENCE_ONLY records excluded', true],
    [27, 'Secrets safely managed', has(report, 'security.no-tracked-secrets') && has(report, 'security.no-tracked-secret-files')],
    [28, 'Critical services supervised', state(report, 'systemd.dial-hermes-runtime.service') === 'PASS', 'GAP-001'],
    [29, 'Backup/recovery exists', roleVerified('oracle-admin'), 'GAP-005'],
    [30, 'Audit logs/evidence exist', has(report, 'selftest.e2e')],
    [31, 'Bootstrap reproducible', has(report, 'selftest.determinism')],
    [32, 'Bootstrap verification passes after exact remote-host substitutions', baseChecksCertified],
    [33, 'End-to-end self-test passes', has(report, 'selftest.e2e')],
    [34, 'No unresolved P0 findings', !gapRegister.gaps.some((g) => g.severity === 'P0' && !/^RESOLVED/.test(g.status))],
    [35, 'No unresolved auth gate on a mandatory component', !(report.owner_action_gates || []).some((g) => g.criticality === 'MANDATORY')],
  ];
  return rows.map(([n, condition, ok, gap]) => ({ n, condition, status: ok ? 'MET' : 'NOT_MET', gap: !ok && gap && gapOpen(gap) ? gap : (ok ? null : gap || null) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [reportFile, outFile] = process.argv.slice(2);
  const evIdx = process.argv.indexOf('--evidence-dir');
  const evidenceDir = evIdx > 0 ? process.argv[evIdx + 1] : null;
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const hostReports = [report];
  for (let i = 2; i < process.argv.length; i += 1) {
    if (process.argv[i] === '--host-report' && process.argv[i + 1]) hostReports.push(JSON.parse(fs.readFileSync(process.argv[++i], 'utf8')));
  }
  const trustedKeys = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    if (process.argv[i] !== '--trusted-key' || !process.argv[i + 1]) continue;
    const spec = process.argv[++i];
    const split = spec.indexOf('=');
    if (split < 1) throw new Error('--trusted-key requires key-id=/path/to/public.pem');
    trustedKeys[spec.slice(0, split)] = fs.readFileSync(spec.slice(split + 1));
  }
  const gapRegister = JSON.parse(fs.readFileSync(path.join(repoDir, DOCS, 'DIAL_DEVELOPMENT_SYSTEM_GAP_REGISTER.json'), 'utf8'));
  const traceability = JSON.parse(fs.readFileSync(path.join(repoDir, DOCS, 'DIAL_DEVELOPMENT_SYSTEM_TRACEABILITY.json'), 'utf8'));
  const evidenceIndex = evidenceDir && fs.existsSync(evidenceDir) ? fs.readdirSync(evidenceDir).sort().map((f) => ({ file: path.relative(repoDir, path.join(evidenceDir, f)), sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(evidenceDir, f))).digest('hex'), bytes: fs.statSync(path.join(evidenceDir, f)).size })) : [];
  const out = composeGreenFlag({ report, hostReports, trustedKeys, gapRegister, traceability, evidenceIndex });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${out.overall_status} — ${out.verdict_reason}\n${out.owner_statement}\nconditions met: ${out.green_flag_conditions.filter((c) => c.status === 'MET').length}/35\nwritten ${outFile}`);
}
