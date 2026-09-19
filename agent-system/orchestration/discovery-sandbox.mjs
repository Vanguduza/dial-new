#!/usr/bin/env node
// Isolated evaluation plane for unknown executable resources.
//
// The invariant this module enforces is Rev 3.1 Principle 3: a trial is not an
// activation. It produces an ExecutableTrialManifest — evidence — and nothing in
// it can authorise use. `admitExecutableResource` in discovery-admission.mjs is
// the only thing that can, and it demands an exact revision pin the trial alone
// cannot supply.
//
// The runner refuses before it executes. Every isolation property is checked
// against the live policy first, and a single unsatisfied property produces a
// REFUSED manifest rather than a run with a warning attached, because a sandbox
// that runs "mostly isolated" is not a sandbox.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashObject } from './knowledge-graph-core.mjs';
import { loadDiscoveryPolicy } from './discovery-lifecycle.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO = path.resolve(here, '../..');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

// A sandbox environment is built by allowlist, not by redaction: start from
// nothing and add the few keys a trial legitimately needs. Filtering a copy of
// process.env is how production keys leak — one new variable name and the
// denylist is behind again.
export function buildSandboxEnvironment({ policy = null, repoDir = DEFAULT_REPO, requested = {} } = {}) {
  const p = policy || loadDiscoveryPolicy(repoDir);
  const forbiddenKeys = new Set(p.sandbox_policy?.forbidden_environment_keys || []);
  const forbiddenPatterns = (p.sandbox_policy?.forbidden_environment_key_patterns || []).map((src) => {
    const ci = src.startsWith('(?i)');
    return new RegExp(ci ? src.slice(4) : src, ci ? 'i' : '');
  });
  const env = {};
  const rejected = [];
  for (const [key, value] of Object.entries(requested)) {
    if (forbiddenKeys.has(key) || forbiddenPatterns.some((re) => re.test(key))) {
      rejected.push(key);
      continue;
    }
    env[key] = String(value);
  }
  return { env, rejected: rejected.sort() };
}

export function evaluateSandboxIsolation({ policy = null, repoDir = DEFAULT_REPO, request = {} } = {}) {
  const p = policy || loadDiscoveryPolicy(repoDir);
  const sandbox = p.sandbox_policy || {};
  const limits = sandbox.limits || {};
  const requestedLimits = request.limits || {};
  const failures = [];

  if (request.ephemeral !== true) failures.push('SANDBOX_NOT_EPHEMERAL');

  const network = request.network || sandbox.network_default || 'DENY';
  if (!['DENY', 'ALLOWLIST'].includes(network)) failures.push(`UNKNOWN_NETWORK_MODE:${network}`);
  if (network === 'ALLOWLIST' && !(request.egress_allowlist || []).length) failures.push('EGRESS_ALLOWLIST_REQUIRED');
  if (network === 'DENY' && (request.egress_allowlist || []).length) failures.push('EGRESS_ALLOWLIST_WITH_NETWORK_DENIED');

  const { env, rejected } = buildSandboxEnvironment({ policy: p, requested: request.environment || {} });
  if (rejected.length) failures.push(...rejected.map((k) => `FORBIDDEN_ENVIRONMENT_KEY:${k}`));

  if (request.dial_credentials_present === true) failures.push('DIAL_CREDENTIAL_IN_SANDBOX');
  if (request.production_secrets_present === true) failures.push('PRODUCTION_SECRET_IN_SANDBOX');
  if (request.service_role_key_present === true) failures.push('SERVICE_ROLE_KEY_IN_SANDBOX');
  if (request.oracle_control_credential_present === true) failures.push('ORACLE_CONTROL_CREDENTIAL_IN_SANDBOX');
  if (request.project_truth_write_path === true) failures.push('PROJECT_TRUTH_WRITE_PATH_IN_SANDBOX');
  if (request.production_database_write_path === true) failures.push('PRODUCTION_DB_WRITE_PATH_IN_SANDBOX');
  if (request.sensitive_fixtures_used === true) failures.push('SENSITIVE_FIXTURE_IN_SANDBOX');

  const root = String(request.filesystem_root || '');
  if (!root) failures.push('FILESYSTEM_ROOT_REQUIRED');
  for (const forbidden of sandbox.write_paths_forbidden || []) {
    if ((request.write_paths || []).some((w) => String(w).startsWith(forbidden))) {
      failures.push(`FORBIDDEN_WRITE_PATH:${forbidden}`);
    }
  }
  if (root && path.resolve(root).startsWith(path.resolve(repoDir) + path.sep)) {
    failures.push('SANDBOX_ROOT_INSIDE_REPOSITORY');
  }

  const effectiveLimits = {};
  for (const [key, ceiling] of Object.entries(limits)) {
    const asked = Number(requestedLimits[key] ?? ceiling);
    if (!Number.isFinite(asked) || asked <= 0) { failures.push(`INVALID_LIMIT:${key}`); continue; }
    if (asked > Number(ceiling)) { failures.push(`LIMIT_EXCEEDS_POLICY:${key}`); continue; }
    effectiveLimits[key] = asked;
  }
  for (const key of Object.keys(limits)) {
    if (!(key in effectiveLimits) && !failures.some((f) => f.endsWith(`:${key}`))) failures.push(`MISSING_LIMIT:${key}`);
  }

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)].sort(),
    isolation: {
      ephemeral: request.ephemeral === true,
      network,
      egress_allowlist: [...(request.egress_allowlist || [])].sort(),
      dial_credentials_present: request.dial_credentials_present === true,
      production_secrets_present: request.production_secrets_present === true,
      service_role_key_present: request.service_role_key_present === true,
      project_truth_write_path: request.project_truth_write_path === true,
      production_database_write_path: request.production_database_write_path === true,
      oracle_control_credential_present: request.oracle_control_credential_present === true,
      filesystem_root: root,
      sensitive_fixtures_used: request.sensitive_fixtures_used === true,
    },
    limits: effectiveLimits,
    environment: env,
  };
}

// The trial manifest. `runner` is injected so the contract can be exercised in
// tests without executing unknown code; when absent the trial records REFUSED
// rather than inventing a pass.
export function runExecutableTrial({
  policy = null,
  repoDir = DEFAULT_REPO,
  candidate,
  artifact = {},
  request = {},
  runner = null,
  executableTrialsEnabled = null,
} = {}) {
  const p = policy || loadDiscoveryPolicy(repoDir);
  if (!candidate?.candidate_id) throw new Error('candidate required');

  const enabled = executableTrialsEnabled === null
    ? p.feature_flags?.executable_trials_enabled === true
    : executableTrialsEnabled === true;

  const isolation = evaluateSandboxIsolation({ policy: p, repoDir, request });
  const preflight = [...isolation.failures];
  if (!enabled) preflight.push('EXECUTABLE_TRIALS_DISABLED');
  // An immutable artifact identity must exist before the trial begins, not after:
  // otherwise the thing evaluated and the thing admitted are not provably the same.
  if (!artifact.exact_revision || String(artifact.exact_revision).length < 7) preflight.push('EXACT_REVISION_REQUIRED_BEFORE_TRIAL');
  if (!artifact.artifact_hash || !/^[0-9a-f]{64}$/.test(String(artifact.artifact_hash))) preflight.push('ARTIFACT_HASH_REQUIRED');
  if (!artifact.dependency_inventory_hash || !/^[0-9a-f]{64}$/.test(String(artifact.dependency_inventory_hash))) preflight.push('DEPENDENCY_INVENTORY_REQUIRED');
  if (!runner) preflight.push('NO_SANDBOX_RUNNER_AVAILABLE');

  const refused = preflight.length > 0;
  let outcome = { status: 'REFUSED', log: preflight.join('\n'), observations: [] };
  if (!refused) {
    try {
      const produced = runner({ isolation: isolation.isolation, limits: isolation.limits, environment: isolation.environment, artifact });
      outcome = {
        status: produced?.status === 'PASS' ? 'PASS' : produced?.status === 'TIMEOUT' ? 'TIMEOUT' : 'FAIL',
        log: String(produced?.log ?? ''),
        observations: Array.isArray(produced?.observations) ? produced.observations.map(String) : [],
      };
    } catch (error) {
      outcome = { status: 'FAIL', log: String(error?.stack || error), observations: ['RUNNER_THREW'] };
    }
  }

  const base = {
    schema_version: 1,
    trial_id: `TRIAL-${hashObject({ candidate: candidate.candidate_id, artifact, isolation: isolation.isolation }).slice(0, 24)}`,
    candidate_id: candidate.candidate_id,
    artifact: {
      locator: String(artifact.locator || candidate.canonical_locator),
      exact_revision: String(artifact.exact_revision || ''),
      artifact_hash: String(artifact.artifact_hash || ''),
      dependency_inventory_hash: String(artifact.dependency_inventory_hash || ''),
      dependency_count: Number(artifact.dependency_count || 0),
    },
    isolation: isolation.isolation,
    limits: isolation.limits,
    result: {
      status: outcome.status,
      execution_log_hash: sha256(outcome.log),
      observations: outcome.observations,
      refusal_reason: refused ? [...new Set(preflight)].sort().join(',') : null,
    },
    // Stated on the artifact itself so no downstream reader can mistake it.
    authority: 'TRIAL_EVIDENCE_NOT_AUTHORIZATION',
  };
  return { ...base, manifest_hash: hashObject(base) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const policy = loadDiscoveryPolicy();
  console.log(JSON.stringify({
    executable_trials_enabled: policy.feature_flags?.executable_trials_enabled === true,
    sandbox_policy: policy.sandbox_policy,
  }, null, 2));
}
