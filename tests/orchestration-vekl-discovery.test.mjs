// Workstream A — VEKL open-world discovery and qualification.
//
// Rev 3.1 §13 requires that gates be proven by inducing their failure, not by
// asserting the happy path. Every `describe` below therefore pairs a permitted
// case with the refusal it must produce.
import { describe, expect, it } from 'vitest';
import {
  assignTrustTier, buildDiscoveryCandidate, candidateIdFor, dedupeCandidates,
  loadDiscoveryPolicy, normalizeLocator, transitionCandidate, validateCandidateRegistry,
  verifyAppendOnly,
} from '../agent-system/orchestration/discovery-lifecycle.mjs';
import { buildDiscoveryQuery, inspectDiscoveryPayload } from '../agent-system/orchestration/discovery-sanitizer.mjs';
import { buildSandboxEnvironment, evaluateSandboxIsolation, runExecutableTrial } from '../agent-system/orchestration/discovery-sandbox.mjs';
import { projectAdmissionRows, qualifyCandidate } from '../agent-system/orchestration/discovery-admission.mjs';
import { buildTrustProjection, enforceRetrievalBoundary } from '../agent-system/orchestration/discovery-graph-projection.mjs';

const repoDir = process.cwd();
const policy = loadDiscoveryPolicy(repoDir);

function candidate(overrides = {}) {
  return buildDiscoveryCandidate({
    policy,
    canonicalLocator: overrides.locator || 'https://github.com/example/thing',
    sourceAdapter: overrides.adapter || 'GITHUB_SEARCH',
    triggerClass: overrides.trigger || 'REACTIVE',
    discoveredAt: '2026-01-01T00:00:00.000Z',
    claimedResourceClasses: overrides.resourceClasses || [],
    claimedTaskClasses: overrides.taskClasses || [],
    provenance: overrides.provenance || {},
    executableContentDetected: overrides.executable === true,
  });
}

function pinnedExecutable() {
  const base = candidate({ resourceClasses: ['MCP_SERVER'], executable: true });
  return { ...base, provenance: { ...base.provenance, exact_revision: 'f'.repeat(40) } };
}

function passingTrial(revision = 'f'.repeat(40)) {
  return {
    manifest_hash: '1'.repeat(64),
    artifact: { exact_revision: revision },
    isolation: {
      ephemeral: true, dial_credentials_present: false, production_secrets_present: false,
      service_role_key_present: false, oracle_control_credential_present: false,
      project_truth_write_path: false, production_database_write_path: false, sensitive_fixtures_used: false,
    },
    result: { status: 'PASS' },
  };
}

function fullyQualified(extra = {}) {
  return qualifyCandidate({
    policy,
    candidate: pinnedExecutable(),
    trial: passingTrial(),
    licenseReviewed: true,
    staticInspectionPassed: true,
    dependencyReviewPassed: true,
    provenanceVerified: true,
    taskEvaluationPassed: true,
    ...extra,
  });
}

describe('discovery identity and ledger', () => {
  it('collapses different views of the same repository onto one candidate', () => {
    expect(normalizeLocator('https://www.github.com/Microsoft/Playwright-MCP.git'))
      .toBe('https://github.com/microsoft/playwright-mcp');
    expect(candidateIdFor('https://github.com/microsoft/playwright-mcp/tree/main'))
      .toBe(candidateIdFor('https://github.com/microsoft/playwright-mcp'));
  });

  it('merges a second independent sighting into corroboration rather than a new row', () => {
    const first = candidate({ provenance: { independent_corroboration_count: 1 } });
    const second = candidate({ locator: 'https://github.com/example/thing/tree/main', provenance: { independent_corroboration_count: 1 } });
    const merged = dedupeCandidates([first, second]);
    expect(merged).toHaveLength(1);
    expect(merged[0].provenance.independent_corroboration_count).toBe(2);
  });

  it('refuses an unknown adapter or trigger class', () => {
    expect(() => candidate({ adapter: 'TELEPATHY' })).toThrow(/unknown discovery adapter/);
    expect(() => candidate({ trigger: 'VIBES' })).toThrow(/unknown discovery trigger/);
  });

  it('keeps the committed candidate ledger valid', () => {
    expect(validateCandidateRegistry({ repoDir }).ok).toBe(true);
  });

  it('rejects a rewritten or truncated history', () => {
    const before = candidate();
    const advanced = transitionCandidate({ policy, candidate: before, toState: 'TRIAGED', evidence: { triage_note: 'looks relevant' } }).candidate;
    expect(verifyAppendOnly([before], [advanced]).ok).toBe(true);
    expect(verifyAppendOnly([advanced], [before]).failures[0].reason).toBe('HISTORY_TRUNCATED');
    const forged = { ...advanced, history: [{ ...advanced.history[0], transition_hash: '0'.repeat(64) }, advanced.history[1]] };
    expect(verifyAppendOnly([advanced], [forged]).failures[0].reason).toBe('HISTORY_REWRITTEN_AT_0');
  });
});

describe('discovery state is not trust tier', () => {
  it('leaves a community source at T4 however far DIAL evaluates it', () => {
    const qualified = fullyQualified();
    expect(qualified.ok).toBe(true);
    // The trial passed and the whole pipeline completed. The tier did not move.
    expect(qualified.manifest.assigned_trust_tier).toBe('T4_COMMUNITY_SIGNAL');
    expect(qualified.manifest.executable.trial_manifest_hash).toBeTruthy();
  });

  it('grants T1 only on verified official provenance', () => {
    const unverified = assignTrustTier({ policy, provenance: { publisher_identity: 'vendor' }, sourceAdapter: 'OFFICIAL_DOC_INDEX' });
    expect(unverified.trust_tier).not.toBe('T1_OFFICIAL');
    const verified = assignTrustTier({
      policy,
      provenance: { publisher_identity: 'vendor', repository_url: 'https://github.com/vendor/x', official_publisher_verified: true },
      sourceAdapter: 'OFFICIAL_DOC_INDEX',
    });
    expect(verified.trust_tier).toBe('T1_OFFICIAL');
  });

  it('caps the tier at what the finding adapter can support', () => {
    const claim = { publisher_identity: 'vendor', repository_url: 'https://github.com/vendor/x', official_publisher_verified: true };
    // The adapter cap removes T1 from consideration entirely. What is left must
    // still be earned: below the cap the candidate falls to whatever tier its
    // provenance actually satisfies, which for an official-only claim is T4.
    expect(assignTrustTier({ policy, provenance: claim, sourceAdapter: 'COMMUNITY_SIGNAL' }).trust_tier).toBe('T4_COMMUNITY_SIGNAL');
    expect(assignTrustTier({ policy, provenance: claim, sourceAdapter: 'PACKAGE_REGISTRY' }).trust_tier).toBe('T4_COMMUNITY_SIGNAL');
    expect(assignTrustTier({
      policy,
      provenance: { ...claim, maintainer_identity_linked: true },
      sourceAdapter: 'PACKAGE_REGISTRY',
    }).trust_tier).toBe('T2_MAINTAINER_COMMUNITY');
  });

  it('never mints T0 from the open world', () => {
    const tiers = (policy.source_adapters || []).map((a) => assignTrustTier({
      policy,
      provenance: { publisher_identity: 'dial', official_publisher_verified: true, maintainer_identity_linked: true, independent_corroboration_count: 9 },
      sourceAdapter: a.adapter_id,
    }).trust_tier);
    expect(tiers).not.toContain('T0_DIAL_PROJECT');
  });
});

describe('lifecycle transitions', () => {
  it('walks the declared path and records every hop', () => {
    let row = candidate();
    const steps = [
      ['TRIAGED', { triage_note: 'relevant to browser automation' }],
      ['INVESTIGATING', { provenance_probe: 'publisher checked' }],
      ['EXPERIMENTAL', { trial_manifest_hash: '2'.repeat(64) }],
      ['QUALIFIED', { qualification_manifest_hash: '3'.repeat(64) }],
      ['ADMITTED', { qualification_manifest_hash: '3'.repeat(64), owner_or_delegated_authority: 'OWNER_DERIVED' }],
    ];
    for (const [to, evidence] of steps) {
      const result = transitionCandidate({ policy, candidate: row, toState: to, evidence });
      expect(result.ok, `${row.lifecycle_state} -> ${to}: ${result.failures.join(',')}`).toBe(true);
      row = result.candidate;
    }
    expect(row.lifecycle_state).toBe('ADMITTED');
    expect(row.history).toHaveLength(6);
    expect(row.history.at(-1).from_state).toBe('QUALIFIED');
  });

  it('refuses a jump that skips investigation', () => {
    const result = transitionCandidate({
      policy, candidate: candidate(), toState: 'QUALIFIED', evidence: { qualification_manifest_hash: '4'.repeat(64) },
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('ILLEGAL_TRANSITION:DISCOVERED->QUALIFIED');
  });

  it('refuses a transition whose declared evidence is missing', () => {
    const result = transitionCandidate({ policy, candidate: candidate(), toState: 'TRIAGED', evidence: {} });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('MISSING_EVIDENCE:triage_note');
  });

  it('has no path out of a terminal state', () => {
    for (const terminal of policy.terminal_states) {
      expect(policy.lifecycle_transitions[terminal]).toEqual([]);
    }
  });
});

describe('sensitive context never leaves through discovery', () => {
  it('builds a query from abstracted engineering intent', () => {
    const built = buildDiscoveryQuery({ policy, intent: 'deterministic browser control', technologies: ['android'], taskClasses: ['BROWSER_AUTOMATION'] });
    expect(built.ok).toBe(true);
    expect(built.query_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['customer email', 'browser tool for jane.doe@customer.co'],
    ['private order', 'why did order #558213 fail'],
    ['service role key', 'supabase service_role connection issue'],
    ['bearer token', 'auth header Bearer ghp_abcdefghijklmnopqrstuvwxyz0123'],
    ['health data', 'patient diagnosis export screen'],
    ['db url', 'postgres://user:pw@prod.db.internal:5432/dial'],
    ['card number', 'charge failed for 4111 1111 1111 1111'],
  ])('refuses a discovery payload carrying %s', (_label, text) => {
    const built = buildDiscoveryQuery({ policy, intent: text });
    expect(built.ok).toBe(false);
    expect(built.reason).toBe('SENSITIVE_CONTEXT_IN_DISCOVERY_PAYLOAD');
    expect(built.query).toBeNull();
    expect(inspectDiscoveryPayload(text, { policy }).findings.length).toBeGreaterThan(0);
  });

  it('marks every candidate as ineligible for sensitive data', () => {
    expect(candidate().safety.sensitive_data_allowed).toBe(false);
  });
});

describe('trial is not activation', () => {
  const artifact = { exact_revision: 'f'.repeat(40), artifact_hash: 'a'.repeat(64), dependency_inventory_hash: 'b'.repeat(64) };
  const cleanRequest = { ephemeral: true, network: 'DENY', filesystem_root: '/tmp/dial-trial-root' };

  it('builds the sandbox environment by allowlist, dropping credential-shaped keys', () => {
    const { env, rejected } = buildSandboxEnvironment({
      policy,
      requested: { NODE_ENV: 'test', GITHUB_TOKEN: 'x', MY_API_KEY: 'y', SUPABASE_SERVICE_ROLE_KEY: 'z', PATH: '/usr/bin' },
    });
    expect(Object.keys(env).sort()).toEqual(['NODE_ENV', 'PATH']);
    expect(rejected).toEqual(['GITHUB_TOKEN', 'MY_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
  });

  it('runs only when every isolation property holds', () => {
    const trial = runExecutableTrial({
      policy, candidate: candidate(), artifact, request: cleanRequest, executableTrialsEnabled: true,
      runner: () => ({ status: 'PASS', log: 'trial ran', observations: ['startup ok'] }),
    });
    expect(trial.result.status).toBe('PASS');
    expect(trial.isolation.dial_credentials_present).toBe(false);
    expect(trial.authority).toBe('TRIAL_EVIDENCE_NOT_AUTHORIZATION');
  });

  it.each([
    ['a DIAL credential', { dial_credentials_present: true }, 'DIAL_CREDENTIAL_IN_SANDBOX'],
    ['a production secret', { production_secrets_present: true }, 'PRODUCTION_SECRET_IN_SANDBOX'],
    ['a service-role key', { service_role_key_present: true }, 'SERVICE_ROLE_KEY_IN_SANDBOX'],
    ['an Oracle control credential', { oracle_control_credential_present: true }, 'ORACLE_CONTROL_CREDENTIAL_IN_SANDBOX'],
    ['a Project Truth write path', { project_truth_write_path: true }, 'PROJECT_TRUTH_WRITE_PATH_IN_SANDBOX'],
    ['a production database write path', { production_database_write_path: true }, 'PRODUCTION_DB_WRITE_PATH_IN_SANDBOX'],
    ['sensitive fixtures', { sensitive_fixtures_used: true }, 'SENSITIVE_FIXTURE_IN_SANDBOX'],
    ['a non-ephemeral sandbox', { ephemeral: false }, 'SANDBOX_NOT_EPHEMERAL'],
  ])('refuses the trial when the sandbox holds %s', (_label, breach, expected) => {
    const isolation = evaluateSandboxIsolation({ policy, request: { ...cleanRequest, ...breach } });
    expect(isolation.ok).toBe(false);
    expect(isolation.failures).toContain(expected);
    const trial = runExecutableTrial({
      policy, candidate: candidate(), artifact, request: { ...cleanRequest, ...breach },
      executableTrialsEnabled: true, runner: () => ({ status: 'PASS', log: 'should never run' }),
    });
    expect(trial.result.status).toBe('REFUSED');
    expect(trial.result.refusal_reason).toContain(expected);
  });

  it('refuses network egress without an allowlist and an allowlist without network', () => {
    expect(evaluateSandboxIsolation({ policy, request: { ...cleanRequest, network: 'ALLOWLIST' } }).failures)
      .toContain('EGRESS_ALLOWLIST_REQUIRED');
    expect(evaluateSandboxIsolation({ policy, request: { ...cleanRequest, egress_allowlist: ['example.com'] } }).failures)
      .toContain('EGRESS_ALLOWLIST_WITH_NETWORK_DENIED');
  });

  it('refuses limits above policy ceilings', () => {
    const result = evaluateSandboxIsolation({ policy, request: { ...cleanRequest, limits: { max_memory_mb: 999999 } } });
    expect(result.failures).toContain('LIMIT_EXCEEDS_POLICY:max_memory_mb');
  });

  it('refuses a sandbox rooted inside the repository', () => {
    const result = evaluateSandboxIsolation({ policy, repoDir, request: { ...cleanRequest, filesystem_root: `${repoDir}/agent-system` } });
    expect(result.failures).toContain('SANDBOX_ROOT_INSIDE_REPOSITORY');
  });

  it('refuses to trial an artifact with no immutable identity', () => {
    const trial = runExecutableTrial({
      policy, candidate: candidate(), artifact: { locator: 'x' }, request: cleanRequest,
      executableTrialsEnabled: true, runner: () => ({ status: 'PASS', log: '' }),
    });
    expect(trial.result.status).toBe('REFUSED');
    expect(trial.result.refusal_reason).toContain('EXACT_REVISION_REQUIRED_BEFORE_TRIAL');
  });

  it('is off until the feature flag is set', () => {
    expect(policy.feature_flags.executable_trials_enabled).toBe(false);
    const trial = runExecutableTrial({
      policy, candidate: candidate(), artifact, request: cleanRequest, runner: () => ({ status: 'PASS', log: '' }),
    });
    expect(trial.result.refusal_reason).toContain('EXECUTABLE_TRIALS_DISABLED');
  });
});

describe('executable admission', () => {
  it('refuses a mutable reference however good the trial was', () => {
    const mutable = candidate({ resourceClasses: ['MCP_SERVER'], executable: true });
    const result = qualifyCandidate({
      policy, candidate: mutable, trial: passingTrial(),
      licenseReviewed: true, staticInspectionPassed: true, dependencyReviewPassed: true,
      provenanceVerified: true, taskEvaluationPassed: true,
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('EXACT_VERSION_PIN_REQUIRED_FOR_EXECUTABLE_ADMISSION');
  });

  it('refuses when the trial ran against a different revision', () => {
    const result = qualifyCandidate({
      policy, candidate: pinnedExecutable(), trial: passingTrial('0'.repeat(40)),
      licenseReviewed: true, staticInspectionPassed: true, dependencyReviewPassed: true,
      provenanceVerified: true, taskEvaluationPassed: true,
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('TRIAL_REVISION_DOES_NOT_MATCH_ADMITTED_PIN');
  });

  it.each([
    ['license review', { licenseReviewed: false }, 'LICENSE_NOT_REVIEWED'],
    ['static inspection', { staticInspectionPassed: false }, 'STATIC_INSPECTION_NOT_PASSED'],
    ['dependency review', { dependencyReviewPassed: false }, 'DEPENDENCY_REVIEW_NOT_PASSED'],
    ['provenance verification', { provenanceVerified: false }, 'PROVENANCE_NOT_VERIFIED'],
    ['task evaluation', { taskEvaluationPassed: false }, 'TASK_EVALUATION_NOT_PASSED'],
  ])('refuses admission with no %s', (_label, omission, expected) => {
    const result = fullyQualified(omission);
    expect(result.ok).toBe(false);
    expect(result.failures).toContain(expected);
  });

  it('refuses admission when the trial isolation was compromised', () => {
    const trial = passingTrial();
    trial.isolation.production_secrets_present = true;
    const result = qualifyCandidate({
      policy, candidate: pinnedExecutable(), trial,
      licenseReviewed: true, staticInspectionPassed: true, dependencyReviewPassed: true,
      provenanceVerified: true, taskEvaluationPassed: true,
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('TRIAL_ISOLATION_COMPROMISED');
  });

  it('admits into the existing registries and refuses a T0 claim', () => {
    const qualification = fullyQualified();
    const rows = projectAdmissionRows({
      policy, candidate: pinnedExecutable(), qualification,
      sourceId: 'discovered.example', resourceId: 'discovered.example.mcp', resourceClass: 'MCP_SERVER',
    });
    expect(rows.ok).toBe(true);
    expect(rows.source_row.trust_tier).toBe('T4_COMMUNITY_SIGNAL');
    expect(rows.resource_row.production_pin).toBe('f'.repeat(40));
    expect(rows.source_row.sensitive_data_allowed).toBe(false);

    const forged = projectAdmissionRows({
      policy, candidate: pinnedExecutable(),
      qualification: { manifest: { ...qualification.manifest, assigned_trust_tier: 'T0_DIAL_PROJECT' } },
      sourceId: 'discovered.example', resourceId: 'discovered.example.mcp', resourceClass: 'MCP_SERVER',
    });
    expect(forged.ok).toBe(false);
    expect(forged.failures).toContain('OPEN_WORLD_DISCOVERY_CANNOT_MINT_T0');
  });

  it('refuses to re-tier a source family that already exists at another tier', () => {
    const rows = projectAdmissionRows({
      policy, candidate: pinnedExecutable(), qualification: fullyQualified(),
      // official.playwright is already registered as T1_OFFICIAL.
      sourceId: 'official.playwright', resourceId: 'discovered.playwright.mcp', resourceClass: 'MCP_SERVER',
      repoDir,
    });
    expect(rows.ok).toBe(false);
    expect(rows.failures.some((f) => f.startsWith('SOURCE_TIER_CONFLICT'))).toBe(true);
  });
});

describe('candidate and admitted planes stay separate', () => {
  const projection = buildTrustProjection({ repoDir, policy });
  const all = [...projection.canonical_plane, ...projection.candidate_plane];

  it('projects the whole admitted corpus with the full retrieval contract', () => {
    expect(projection.canonical_plane.length).toBeGreaterThan(50);
    for (const item of projection.canonical_plane) {
      expect(item.plane).toBe('CANONICAL_ADMITTED');
      expect(item.trust_tier).toMatch(/^T[0-4]_/);
      expect(['AUTHORITY', 'CORROBORATION', 'SIGNAL']).toContain(item.authority_role);
    }
  });

  it('withholds candidate material from an authority retrieval', () => {
    const result = enforceRetrievalBoundary({ projections: all, requireAuthority: true });
    expect(result.results.every((x) => x.plane === 'CANONICAL_ADMITTED')).toBe(true);
    expect(result.results.every((x) => x.authority_role === 'AUTHORITY')).toBe(true);
  });

  it('refuses a candidate that tries to present itself as authority', () => {
    const forged = { ...projection.candidate_plane[0] ?? {
      schema_version: 1, resource_id: 'DISC-forged', plane: 'DISCOVERY_CANDIDATE',
      lifecycle_state: 'DISCOVERED', trust_tier: 'T1_OFFICIAL', freshness_state: 'UNKNOWN',
      executable_eligibility: 'INELIGIBLE', sensitive_data_eligibility: 'INELIGIBLE', task_classes: [],
    }, authority_role: 'AUTHORITY' };
    const result = enforceRetrievalBoundary({ projections: [forged], allowCandidatePlane: true });
    expect(result.results).toHaveLength(0);
    expect(result.withheld[0].reasons).toContain('CANDIDATE_CANNOT_CARRY_AUTHORITY');
  });

  it('surfaces stale admitted knowledge as stale rather than current', () => {
    const stale = {
      schema_version: 1, resource_id: 'stale.thing', plane: 'CANONICAL_ADMITTED', lifecycle_state: 'ADMITTED',
      trust_tier: 'T1_OFFICIAL', authority_role: 'AUTHORITY', freshness_state: 'STALE',
      executable_eligibility: 'INELIGIBLE', sensitive_data_eligibility: 'INELIGIBLE', task_classes: [],
    };
    expect(enforceRetrievalBoundary({ projections: [stale] }).withheld[0].reasons).toContain('FRESHNESS_STALE');
    expect(enforceRetrievalBoundary({ projections: [stale], allowStale: true }).results).toHaveLength(1);
  });

  it('never marks a candidate executable- or sensitive-eligible', () => {
    for (const item of projection.candidate_plane) {
      expect(item.executable_eligibility).toBe('INELIGIBLE');
      expect(item.sensitive_data_eligibility).toBe('INELIGIBLE');
      expect(item.authority_role).not.toBe('AUTHORITY');
    }
  });

  it('is deterministic across repeated projection', () => {
    const again = buildTrustProjection({ repoDir, policy });
    expect(JSON.stringify(again)).toBe(JSON.stringify(projection));
  });
});
