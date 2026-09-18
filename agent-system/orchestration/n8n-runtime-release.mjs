#!/usr/bin/env node
// Workflow release identity and promotion (Rev 3.1 §7.12–§7.13, §7.17–§7.19).
//
// "Editing a production workflow in-place without release evidence is
// forbidden." That is only true if something refuses, so `assertReleaseIntegrity`
// compares the content hash of what is running against the release that
// authorised it, and `promoteWorkflow` will not skip a pipeline stage.
//
// The secret scan reuses the corpus security rules rather than restating them:
// a second copy of the pattern list would drift from the one the corpus check
// already enforces.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashObject } from './knowledge-graph-core.mjs';
import { compileRuntimeNodePolicy, evaluateWorkflowNodes, loadCorpusKnowledge, loadRuntimePolicy } from './n8n-runtime-node-policy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO = path.resolve(here, '../..');

export function workflowContentHash(workflow) {
  // Identity excludes mutable bookkeeping: when a workflow was last opened is
  // not part of what it is (§22).
  const { updatedAt: _a, createdAt: _b, versionId: _c, id: _d, ...rest } = workflow || {};
  return hashObject(rest);
}

export function scanWorkflowForSecrets({ workflow, repoDir = DEFAULT_REPO, corpus = null } = {}) {
  const { security } = corpus || loadCorpusKnowledge(repoDir);
  const serialized = JSON.stringify(workflow ?? {});
  const findings = [];
  for (const pattern of security.secret_value_patterns || []) {
    const ci = pattern.startsWith('(?i)');
    const re = new RegExp(ci ? pattern.slice(4) : pattern, ci ? 'i' : '');
    if (re.test(serialized)) findings.push({ kind: 'SECRET_VALUE', pattern });
  }
  // A key that looks like a credential holder is only a finding when it carries
  // an inline literal: `credential` references by name are how n8n is supposed
  // to work, and flagging those would make the scan noise.
  const walk = (node, trail = []) => {
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const lower = key.toLowerCase();
      const secretish = (security.secret_key_patterns || []).some((p) => lower.includes(p));
      if (secretish && typeof value === 'string' && value && !/^=?\{\{|^\$\{|^\{\{/.test(value)) {
        findings.push({ kind: 'EMBEDDED_SECRET', path: [...trail, key].join('.') });
      }
      walk(value, [...trail, key]);
    }
  };
  walk(workflow?.nodes ?? workflow);
  return { ok: findings.length === 0, findings: findings.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
}

export function evaluateEgressPolicy({ workflow, estate, policy = null, repoDir = DEFAULT_REPO, allowlist = [] } = {}) {
  const p = policy || loadRuntimePolicy(repoDir);
  const mode = p.estates?.[estate]?.outbound_network_default;
  const findings = [];
  const urls = [];
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' && /^https?:\/\//i.test(value)) urls.push({ key, value });
      // An expression-built URL cannot be checked against an allowlist at
      // promotion time, so a privileged workflow may not contain one.
      if (typeof value === 'string' && /^https?:\/\/[^"']*(\{\{|\$json|\$node|\$env)/i.test(value)) {
        findings.push({ reason: 'RUNTIME_URL_INJECTION', detail: value.slice(0, 120) });
      }
      walk(value);
    }
  };
  walk(workflow);
  for (const { value } of urls) {
    let host = null;
    try { host = new URL(value).hostname; } catch { findings.push({ reason: 'UNPARSEABLE_URL', detail: value.slice(0, 120) }); continue; }
    if (mode === 'DENY' && !allowlist.includes(host)) findings.push({ reason: 'HOST_NOT_ON_ALLOWLIST', detail: host });
    if (mode === 'ALLOWLIST' && allowlist.length && !allowlist.includes(host)) findings.push({ reason: 'HOST_NOT_ON_ALLOWLIST', detail: host });
  }
  return { ok: findings.length === 0, mode, hosts: [...new Set(urls.map((u) => { try { return new URL(u.value).hostname; } catch { return u.value; } }))].sort(), findings };
}

export function evaluateDatabaseWrites({ workflow, policy = null, repoDir = DEFAULT_REPO, authoritativeTables = [] } = {}) {
  const p = policy || loadRuntimePolicy(repoDir);
  const findings = [];
  const serialized = JSON.stringify(workflow ?? {});
  if (p.database_policy?.direct_authoritative_table_mutation_forbidden === true) {
    for (const table of authoritativeTables) {
      const re = new RegExp(`\\b(insert\\s+into|update|delete\\s+from)\\s+["\`]?${table}\\b`, 'i');
      if (re.test(serialized)) findings.push({ reason: 'DIRECT_AUTHORITATIVE_TABLE_MUTATION', detail: table });
    }
  }
  // Money, identity and the other singular authorities are never n8n's to write,
  // whatever the table is called.
  for (const authority of p.forbidden_runtime_authorities || []) {
    const re = new RegExp(`\\bdial[._:]?${authority.toLowerCase()}\\b`, 'i');
    if (re.test(serialized)) findings.push({ reason: 'FORBIDDEN_RUNTIME_AUTHORITY', detail: authority });
  }
  return { ok: findings.length === 0, findings: findings.sort((a, b) => a.detail.localeCompare(b.detail)) };
}

export function buildWorkflowRelease({
  repoDir = DEFAULT_REPO, policy = null, workflow, workflowId, semanticVersion, environment,
  approvedBy = null, approvalAuthority = null, promotedFrom = null, testEvidenceHash = null,
  dependencyManifestHash = null, secretsContractHash = null, rollbackVersion = null, allowlist = [],
  authoritativeTables = [],
} = {}) {
  const p = policy || loadRuntimePolicy(repoDir);
  const failures = [];
  if (!workflowId) failures.push('WORKFLOW_ID_REQUIRED');
  if (!/^\d+\.\d+\.\d+$/.test(String(semanticVersion || ''))) failures.push('SEMANTIC_VERSION_REQUIRED');
  if (!p.estates?.[environment]) failures.push(`UNKNOWN_ESTATE:${environment}`);

  const secrets = scanWorkflowForSecrets({ workflow, repoDir });
  if (!secrets.ok) failures.push(...secrets.findings.map((f) => `EMBEDDED_SECRET:${f.path ?? f.pattern}`));

  const nodes = evaluateWorkflowNodes({ repoDir, estate: environment, nodes: workflow?.nodes || [], policy: p });
  if (!nodes.ok) failures.push(...nodes.blocking_findings.map((f) => `NODE_POLICY:${f.reason}`));

  const egress = evaluateEgressPolicy({ workflow, estate: environment, policy: p, repoDir, allowlist });
  if (!egress.ok) failures.push(...egress.findings.map((f) => `EGRESS:${f.reason}:${f.detail}`));

  const db = evaluateDatabaseWrites({ workflow, policy: p, repoDir, authoritativeTables });
  if (!db.ok) failures.push(...db.findings.map((f) => `DB:${f.reason}:${f.detail}`));

  if (environment === 'PROD') {
    if (!testEvidenceHash) failures.push('PROD_RELEASE_REQUIRES_TEST_EVIDENCE');
    if (!promotedFrom) failures.push('PROD_RELEASE_REQUIRES_PROMOTION_SOURCE');
    if (!approvedBy || !['OWNER', 'AUTHORIZED_OPERATOR'].includes(approvalAuthority)) {
      failures.push('PROD_RELEASE_REQUIRES_HUMAN_APPROVAL');
    }
  }

  if (failures.length) return { ok: false, failures: [...new Set(failures)].sort(), release: null };

  const nodePolicy = compileRuntimeNodePolicy({ repoDir, estate: environment, policy: p });
  const base = {
    schema_version: 1,
    workflow_id: workflowId,
    semantic_version: semanticVersion,
    content_hash: workflowContentHash(workflow),
    environment,
    approved_by: approvedBy,
    approval_authority: approvalAuthority,
    promoted_from: promotedFrom,
    test_evidence_hash: testEvidenceHash,
    dependency_manifest_hash: dependencyManifestHash,
    node_policy_hash: nodePolicy.node_policy_hash,
    secrets_contract_hash: secretsContractHash,
    egress_allowlist: [...allowlist].sort(),
    rollback_version: rollbackVersion,
    authority: 'WORKFLOW_RELEASE_IDENTITY',
  };
  return { ok: true, failures: [], release: { ...base, release_hash: hashObject(base) } };
}

export function promoteWorkflow({ policy = null, repoDir = DEFAULT_REPO, stagesCompleted = [], release, targetEnvironment = 'PROD' } = {}) {
  const p = policy || loadRuntimePolicy(repoDir);
  const pipeline = p.promotion_pipeline || [];
  const failures = [];
  const completed = new Set(stagesCompleted);
  // Order matters: a later stage completed without an earlier one means the
  // pipeline was jumped, not merely partially run.
  let reached = 0;
  for (const stage of pipeline) {
    if (stage === 'PRODUCTION_ACTIVE') break;
    if (completed.has(stage)) reached += 1;
    else break;
  }
  const required = pipeline.slice(0, pipeline.indexOf('PRODUCTION_ACTIVE'));
  const missing = required.filter((s) => !completed.has(s));
  if (missing.length) failures.push(...missing.map((s) => `STAGE_NOT_COMPLETED:${s}`));
  const outOfOrder = [...completed].filter((s) => required.includes(s) && required.indexOf(s) >= reached);
  if (outOfOrder.length) failures.push(...outOfOrder.map((s) => `STAGE_OUT_OF_ORDER:${s}`));
  if (!release?.release_hash) failures.push('RELEASE_REQUIRED');
  if (release && release.environment !== targetEnvironment) failures.push(`RELEASE_ENVIRONMENT_MISMATCH:${release.environment}`);
  if (targetEnvironment === 'PROD' && !release?.rollback_version) failures.push('ROLLBACK_VERSION_REQUIRED');

  if (failures.length) return { ok: false, failures: [...new Set(failures)].sort(), evidence: null };
  const base = {
    schema_version: 1,
    workflow_id: release.workflow_id,
    from_version: release.promoted_from,
    to_version: release.semantic_version,
    target_environment: targetEnvironment,
    release_hash: release.release_hash,
    stages_completed: [...required],
    approved_by: release.approved_by,
    approval_authority: release.approval_authority,
    authority: 'WORKFLOW_PROMOTION_EVIDENCE',
  };
  return { ok: true, failures: [], evidence: { ...base, promotion_hash: hashObject(base), promoted_at: new Date().toISOString() } };
}

// What is running must be what was released. An in-place edit changes the
// content hash and is caught here rather than at the next incident.
export function assertReleaseIntegrity({ release, runningWorkflow }) {
  const failures = [];
  const actual = workflowContentHash(runningWorkflow);
  if (actual !== release?.content_hash) failures.push('WORKFLOW_EDITED_WITHOUT_RELEASE');
  return { ok: failures.length === 0, failures, expected: release?.content_hash ?? null, actual };
}

export function assertEstateIsolation({ policy = null, repoDir = DEFAULT_REPO, dev = {}, prod = {} } = {}) {
  const p = policy || loadRuntimePolicy(repoDir);
  const failures = [];
  const compare = {
    separate_database: [dev.database, prod.database],
    separate_encryption_key: [dev.encryption_key_id, prod.encryption_key_id],
    separate_credential_store: [dev.credential_store, prod.credential_store],
    separate_webhook_domain: [dev.webhook_domain, prod.webhook_domain],
    separate_service_account: [dev.service_account, prod.service_account],
    separate_network_policy: [dev.network_policy, prod.network_policy],
    separate_role_bindings: [dev.role_binding, prod.role_binding],
    separate_backups: [dev.backup_target, prod.backup_target],
    separate_audit_stream: [dev.audit_stream, prod.audit_stream],
    separate_promotion_path: [dev.promotion_path, prod.promotion_path],
  };
  for (const requirement of p.isolation_requirements || []) {
    if (requirement === 'separate_execution_retention') {
      if (Number(dev.execution_retention_days) === Number(prod.execution_retention_days)) failures.push(`ISOLATION_VIOLATION:${requirement}`);
      continue;
    }
    const [a, b] = compare[requirement] || [];
    if (a === undefined || b === undefined) { failures.push(`ISOLATION_UNDECLARED:${requirement}`); continue; }
    if (a === b) failures.push(`ISOLATION_VIOLATION:${requirement}`);
  }
  // The rule that matters most, stated on its own so it cannot be lost in a list.
  const devCreds = new Set(dev.credential_ids || []);
  const shared = (prod.credential_ids || []).filter((c) => devCreds.has(c));
  if (shared.length) failures.push(...shared.map((c) => `SHARED_CREDENTIAL:${c}`));
  if (dev.has_production_credentials === true) failures.push('DEV_HOLDS_PRODUCTION_CREDENTIALS');
  return { ok: failures.length === 0, failures: [...new Set(failures)].sort() };
}
