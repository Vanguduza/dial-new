import fs from 'node:fs';
import path from 'node:path';
import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { git, run, fileMode, readJsonSafe } from '../lib/probes.mjs';

export function credentialFileModeOk(file, mode) {
  return String(file || '').endsWith('.pub') ? ['644', '600', '400'].includes(String(mode)) : ['600', '400'].includes(String(mode));
}

// Repository-side certification: canonical lineage, Project Truth guard, VEKL/GraphRAG gates,
// control-plane fingerprint, Oracle mirror freshness, secrets hygiene, supply-chain pins.
export async function certifyRepository({ role, repoDir, controlHome, manifest, fast = false }) {
  const domain = 'Project Truth';
  const checks = [];
  const head = git(repoDir, ['rev-parse', 'HEAD']).output;
  const branch = git(repoDir, ['branch', '--show-current']).output;
  const canonical = readJsonSafe(path.join(repoDir, 'PROJECT_CANONICAL_STATE.json'));
  checks.push(check({ id: 'repo.canonical-state', domain, title: 'PROJECT_CANONICAL_STATE.json identifies repository and canonical integration branch', status: canonical?.repository === manifest.canonical_repository && canonical?.canonical_state?.canonical_integration_branch === manifest.canonical_branch ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { repository: canonical?.repository, canonical_integration_branch: canonical?.canonical_state?.canonical_integration_branch, head, branch } }));
  const ancestors = canonical?.canonical_state?.required_ancestors || [];
  const shallow = git(repoDir, ['rev-parse', '--is-shallow-repository']).output === 'true';
  const missing = ancestors.filter((a) => !git(repoDir, ['merge-base', '--is-ancestor', a, 'HEAD']).ok);
  checks.push(check({ id: 'repo.required-ancestors', domain, title: `HEAD descends from all ${ancestors.length} required canonical ancestors${shallow ? ' (shallow clone: history incomplete)' : ''}`, status: missing.length ? (shallow ? STATUS.UNVERIFIED : STATUS.FAIL) : STATUS.PASS, criticality: CRITICALITY.MANDATORY, evidence: { command: 'git merge-base --is-ancestor <sha> HEAD', missing, shallow }, remediation: shallow ? 'git fetch --unshallow origin, then re-verify' : 'rebase onto canonical master lineage' }));
  const dirty = git(repoDir, ['status', '--porcelain']).output;
  checks.push(check({ id: 'repo.worktree', domain, title: 'worktree state recorded', status: STATUS.PASS, criticality: CRITICALITY.OPTIONAL, evidence: { command: 'git status --porcelain', dirty_files: dirty ? dirty.split('\n').length : 0 } }));
  for (const f of canonical?.canonical_state?.locked_authorities || []) {
    checks.push(check({ id: `repo.locked-authority.${path.basename(f)}`, domain, title: `locked authority present: ${f}`, status: fs.existsSync(path.join(repoDir, f)) ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { file: f } }));
  }
  const pt = run('python3', ['scripts/project_truth_local.py', 'verify'], { cwd: repoDir, timeoutMs: 120000 });
  checks.push(check({ id: 'repo.project-truth-guard', domain, title: 'Project Truth authority guard (scripts/project_truth_local.py verify)', status: pt.ok ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { command: pt.command, exit: pt.status, output: pt.output.slice(0, 300) }, remediation: 'every substantive commit needs an owner authorization record and ledger row' }));
  const hooksPath = git(repoDir, ['config', '--get', 'core.hooksPath']).output;
  checks.push(check({ id: 'repo.git-hooks', domain, title: 'Project Truth git hooks installed (core.hooksPath=.githooks)', status: hooksPath === '.githooks' ? STATUS.PASS : STATUS.FAIL, criticality: role === 'provider-container' ? CRITICALITY.OPTIONAL : CRITICALITY.REQUIRED, evidence: { command: 'git config --get core.hooksPath', output: hooksPath || '(unset)' }, remediation: 'bash scripts/install-project-truth-hooks.sh (bootstrap --apply does this)' }));

  // VEKL / GraphRAG deterministic gates (repository-side, no model).
  const vekl = 'VEKL';
  const gates = fast ? [['agent:vekl:unit-check', 'Development Unit registry deterministic'], ['agent:vekl:graph-check', 'canon graph compiles and rebuilds deterministically']] : [
    ['agent:knowledge:check', 'engineering-knowledge registries valid (provenance, trust tiers, no executable community signal)'],
    ['agent:vekl:unit-check', 'Development Unit registry deterministic (stable lineage + revision)'],
    ['agent:vekl:graph-check', 'canon graph compiles and rebuilds deterministically'],
    ['agent:vekl:orphan-check', 'no orphan graph nodes'],
    ['agent:vekl:architecture-check', 'VEKL 2.2 architecture criteria (35) green'],
    ['agent:vekl:retrieval-eval', 'bounded GraphRAG retrieval golden set'],
    ['agent:routing:architecture-check', 'adaptive routing architecture (AR-01..27) green'],
    ['agent:aef:architecture-check', 'adaptive execution fabric architecture green'],
  ];
  for (const [script, title] of gates) {
    const r = run('npm', ['run', '--silent', script], { cwd: repoDir, timeoutMs: 300000 });
    checks.push(check({ id: `vekl.${script.replace(/^agent:/, '').replace(/:/g, '-')}`, domain: script.includes('routing') || script.includes('aef') ? 'Model routing' : vekl, title, status: r.ok ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { command: `npm run ${script}`, exit: r.status, output_tail: r.output.split('\n').slice(-3).join(' | ').slice(0, 300) } }));
  }
  const structural = readJsonSafe(path.join(repoDir, 'agent-system/registries/STRUCTURAL_REALITY_POLICY.json'));
  const gp = structural?.providers?.graphify || structural?.graphify || {};
  checks.push(check({ id: 'graphrag.graphify-activation', domain: 'GraphRAG', title: `Graphify provider execution_enabled=${gp.execution_enabled === true} qualified=${gp.qualified === true} (fail-closed until host qualification)`, status: gp.execution_enabled === true && gp.qualified !== true ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.MANDATORY, evidence: { registry: 'agent-system/registries/STRUCTURAL_REALITY_POLICY.json', graphify: { qualified: gp.qualified ?? null, activation_ready: gp.activation_ready ?? null, execution_enabled: gp.execution_enabled ?? null } } }));
  const workerInstaller = fs.readFileSync(path.join(repoDir, 'ops/development-bootstrap/workers/install-worker-agent.sh'), 'utf8');
  const producerWired = /dial-structural-snapshot\.timer/.test(workerInstaller) && /--kind\s+STRUCTURAL_SNAPSHOT/.test(workerInstaller);
  checks.push(check({ id: 'graphrag.structural-snapshot-producer', domain: 'GraphRAG', title: 'bounded structural snapshot producer is wired into the vekl-worker timer', status: producerWired ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { installer: 'ops/development-bootstrap/workers/install-worker-agent.sh', scheduled: producerWired, authority: 'SUBORDINATE_STRUCTURAL_EVIDENCE' }, remediation: 'install dial-structural-snapshot.timer on vekl-worker', severity: producerWired ? null : 'P2' }));

  // Control-plane fingerprint and Oracle state.
  const { controlPlaneFingerprint, evaluateDevelopmentUnblock } = await import(path.join(repoDir, 'agent-system/orchestration/development-unblock.mjs'));
  const fp = controlPlaneFingerprint(repoDir);
  const gate = readJsonSafe(path.join(controlHome, 'state/external-orchestration-gate.json'));
  const oracleDomain = 'Hermes';
  checks.push(check({ id: 'hermes.control-plane-fingerprint', domain: oracleDomain, title: 'current control-plane fingerprint computed', status: fp ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { algorithm: fp?.algorithm, value: fp?.value, paths: manifest.control_plane_fingerprint_paths } }));
  if (role === 'dial-hermes-control') {
    const ev = evaluateDevelopmentUnblock({ repoDir, root: controlHome });
    checks.push(check({ id: 'hermes.development-gate', domain: oracleDomain, title: `external orchestration gate: ${gate?.status || 'ABSENT'}; development ${ev.unblocked ? 'UNBLOCKED' : 'BLOCKED'}`, status: ev.unblocked ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { failed_checks: Object.entries(ev.checks || {}).filter(([, v]) => !v).map(([k]) => k), qualified_fingerprint: gate?.control_plane_fingerprint?.value || gate?.qualified_control_plane_fingerprint || null, current_fingerprint: fp?.value }, remediation: 'bash deploy/oracle/hermes-codex/qualify-control-plane.sh; soak; finalize-control-plane.sh (requalification after any orchestration/deploy change)', gate: 'EXTERNAL-GATE-HERMES-REQUALIFICATION-001' }));
  } else {
    checks.push(check({ id: 'hermes.development-gate', domain: oracleDomain, title: 'external orchestration gate is certified by the dial-hermes-control role report', status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { note: 'role-local certification avoids cross-host circularity; whole-system aggregation requires the control report' }, gate: null }));
  }
  const { readOracleOperatorStatus } = await import(path.join(repoDir, 'agent-system/orchestration/operator-status.mjs'));
  const mirror = readOracleOperatorStatus({ repoDir });
  checks.push(check({ id: 'hermes.oracle-status-mirror', domain: oracleDomain, title: `Oracle status mirror available=${mirror.available} fresh=${mirror.fresh} (${mirror.source || 'none'})`, status: mirror.available ? (mirror.fresh ? STATUS.PASS : STATUS.FAIL) : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, evidence: { source: mirror.source, age_minutes: mirror.age_ms ? Math.round(mirror.age_ms / 60000) : null, observed_at: mirror.status?.observed_at, mission_state: mirror.status?.mission?.state, development_state: mirror.status?.development?.state, failed_checks: mirror.status?.development?.failed_checks, oracle_head: mirror.status?.repository?.head, current_head: head }, remediation: 'dial-operator-status-publisher.timer must be active on the control host (publishes every 30 s)' }));
  if (mirror.status?.repository?.head && mirror.status.repository.head !== head) {
    checks.push(check({ id: 'hermes.oracle-head-drift', domain: oracleDomain, title: 'Oracle host checkout is behind the audited commit', status: STATUS.FAIL, criticality: CRITICALITY.REQUIRED, evidence: { oracle_head: mirror.status.repository.head, audited_head: head, commits_between: git(repoDir, ['rev-list', '--count', `${mirror.status.repository.head}..${head}`]).output }, remediation: 'git pull on the control host, reinstall control plane, requalify', severity: 'P1' }));
  }

  // Secrets hygiene.
  const sec = 'Security';
  const grep = run('git', ['grep', '-lE', '(sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY|AKIA[0-9A-Z]{16})', '--', '.', ':!node_modules', ':!tests/orchestration-operations-plane.test.mjs'], { cwd: repoDir, timeoutMs: 60000 });
  checks.push(check({ id: 'security.no-tracked-secrets', domain: sec, title: 'no secret-pattern strings in tracked files', status: grep.output.trim() ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.MANDATORY, evidence: { command: 'git grep -lE <secret patterns>', files: grep.output ? grep.output.split('\n') : [] }, severity: grep.output.trim() ? 'P0' : null, remediation: 'rotate and purge' }));
  const tracked = run('sh', ['-c', "git ls-files | grep -iE '(^|/)\\.env($|\\.)|\\.pem$|\\.key$|id_rsa|creds\\.json$' || true"], { cwd: repoDir, timeoutMs: 20000 });
  checks.push(check({ id: 'security.no-tracked-secret-files', domain: sec, title: 'no .env/.pem/.key/creds files tracked', status: tracked.output.trim() ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.MANDATORY, evidence: { command: tracked.command, files: tracked.output ? tracked.output.split('\n') : [] } }));
  if (fs.existsSync(controlHome)) {
    const secretsDir = path.join(controlHome, 'secrets');
    const bad = [];
    if (fs.existsSync(secretsDir)) for (const f of fs.readdirSync(secretsDir)) {
      const m = fileMode(path.join(secretsDir, f));
      const isPublicKey = f.endsWith('.pub');
      if (!credentialFileModeOk(f, m.mode)) bad.push({ file: f, mode: m.mode, classification: isPublicKey ? 'PUBLIC_KEY' : 'SECRET' });
    }
    const dm = fileMode(controlHome);
    checks.push(check({ id: 'security.control-home-modes', domain: sec, title: 'control home 700; private/token files 600/400; public keys may be 644 (values never read)', status: dm.mode === '700' && !bad.length ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { control_home: controlHome, mode: dm.mode, files_with_bad_mode: bad }, remediation: 'chmod 700 control home; chmod 600 private/token files; public .pub keys may be 644' }));
  } else {
    checks.push(check({ id: 'security.control-home-modes', domain: sec, title: 'control home present', status: role === 'dial-hermes-control' ? STATUS.FAIL : STATUS.NOT_APPLICABLE, criticality: CRITICALITY.MANDATORY, evidence: { control_home: controlHome, exists: false }, remediation: 'bash deploy/oracle/hermes-codex/bootstrap-host.sh' }));
  }
  // Supply chain.
  const sc = 'Supply chain';
  const lock = fs.existsSync(path.join(repoDir, 'package-lock.json'));
  checks.push(check({ id: 'supply.lockfile', domain: sc, title: 'package-lock.json present and npm ci used', status: lock ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { file: 'package-lock.json', exists: lock } }));
  const unpinned = manifest.runtimes.filter((r) => r.install_method === 'VENDOR_INSTALLER_UNPINNED' && r.hosts.includes(role)).map((r) => r.id);
  checks.push(check({ id: 'supply.unpinned-installers', domain: sc, title: 'host runtimes use only supported deterministic install methods', status: unpinned.length ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.REQUIRED, evidence: { unpinned_runtimes: unpinned, source: 'manifest install_method inventory; pin completeness is certified separately by supply.pins-declared' }, remediation: 'replace any forbidden method with a versioned, integrity-verified converger action', severity: unpinned.length ? 'P1' : null }));
  return checks;
}
