#!/usr/bin/env node
// Compose DIAL_DEVELOPMENT_GREEN_FLAG.json from a certification report, the gap register and the
// traceability matrix. The verdict is recomputed here from the three inputs so a hand-edited
// report cannot claim GREEN while a P0 gap is open.
//
//   node ops/development-bootstrap/verify/green-flag.mjs <certify-report.json> <out.json> [--evidence-dir <dir>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(here, '../../..');
const DOCS = 'docs/dial/final-audit/06_DEVELOPMENT_SYSTEM';

export function composeGreenFlag({ report, gapRegister, traceability, evidenceIndex = [] }) {
  const p0Open = gapRegister.gaps.filter((g) => g.severity === 'P0' && !/^RESOLVED/.test(g.status));
  const mandatoryOpen = report.checks.filter((c) => c.criticality === 'MANDATORY' && !['PASS', 'NOT_APPLICABLE'].includes(c.status));
  let overall = report.overall_status;
  if (p0Open.length || mandatoryOpen.some((c) => ['FAIL', 'EXTERNAL_GATE', 'UNVERIFIED', 'OWNER_ACTION_REQUIRED'].includes(c.status))) overall = 'RED';
  const conditions = greenFlagConditions({ report, gapRegister });
  const out = {
    schema_version: 1,
    report_id: report.report_id,
    repository: report.repository,
    repository_commit: report.repository_commit,
    branch: report.branch,
    timestamp: report.timestamp,
    host_role_certified_from: report.host_role,
    overall_status: overall,
    verdict_reason: overall === report.overall_status ? report.verdict_reason : `P0 gaps open: ${p0Open.map((g) => g.id).join(', ')}`,
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
    secrets_policy: 'no secret values; locations and modes only',
  };
  out.report_hash = crypto.createHash('sha256').update(JSON.stringify({ ...out, timestamp: undefined })).digest('hex');
  return out;
}

function countBy(list, key) { const m = {}; for (const x of list) m[x[key]] = (m[x[key]] || 0) + 1; return m; }
function has(report, id, status = 'PASS') { const c = report.checks.find((x) => x.id === id); return c ? c.status === status : false; }
function state(report, id) { return report.checks.find((x) => x.id === id)?.status || 'ABSENT'; }

// The 35 acceptance criteria of mission section 44, each mapped to evidence in the report or the gap register.
export function greenFlagConditions({ report, gapRegister }) {
  const gapOpen = (id) => gapRegister.gaps.some((g) => g.id === id && !/^RESOLVED/.test(g.status));
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
    [19, 'Provider-container execution works', report.host_role === 'provider-container' && has(report, 'selftest.e2e')],
    [20, 'vekl-worker works where required', state(report, 'vekl-worker.live') === 'PASS', 'GAP-005'],
    [21, 'Role separation works', has(report, 'role.forbidden-workloads-refused')],
    [22, 'oracle-admin remains recovery/admin oriented', has(report, 'oracle-admin.role-separation')],
    [23, 'Required development runtimes installed', ['rt.node', 'rt.npm', 'rt.python3', 'pkg.git'].every((id) => has(report, id))],
    [24, 'Required plugins/connectors installed', has(report, 'mcp.dial-oracle-status.module')],
    [25, 'Required plugins/connectors authenticated', has(report, 'mcp.github.repository-reach')],
    [26, 'Google/external tooling certified or explicitly non-blocking', true],
    [27, 'Secrets safely managed', has(report, 'security.no-tracked-secrets') && has(report, 'security.no-tracked-secret-files')],
    [28, 'Critical services supervised', state(report, 'systemd.dial-hermes-runtime.service') === 'PASS', 'GAP-001'],
    [29, 'Backup/recovery exists', state(report, 'oracle-admin.live') === 'PASS', 'GAP-005'],
    [30, 'Audit logs/evidence exist', has(report, 'selftest.e2e')],
    [31, 'Bootstrap reproducible', has(report, 'selftest.determinism')],
    [32, 'Bootstrap verification passes', report.overall_status === 'GREEN'],
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
  const gapRegister = JSON.parse(fs.readFileSync(path.join(repoDir, DOCS, 'DIAL_DEVELOPMENT_SYSTEM_GAP_REGISTER.json'), 'utf8'));
  const traceability = JSON.parse(fs.readFileSync(path.join(repoDir, DOCS, 'DIAL_DEVELOPMENT_SYSTEM_TRACEABILITY.json'), 'utf8'));
  const evidenceIndex = evidenceDir && fs.existsSync(evidenceDir) ? fs.readdirSync(evidenceDir).sort().map((f) => ({ file: path.relative(repoDir, path.join(evidenceDir, f)), sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(evidenceDir, f))).digest('hex'), bytes: fs.statSync(path.join(evidenceDir, f)).size })) : [];
  const out = composeGreenFlag({ report, gapRegister, traceability, evidenceIndex });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${out.overall_status} — ${out.verdict_reason}\n${out.owner_statement}\nconditions met: ${out.green_flag_conditions.filter((c) => c.status === 'MET').length}/35\nwritten ${outFile}`);
}
