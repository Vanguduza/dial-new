#!/usr/bin/env node
// Workstream A gate: VEKL open-world discovery.
//
// Each gate states a property the architecture claims and derives it from the
// live artefacts, not from prose. A gate that cannot be induced to fail is not
// evidence, so the negative cases live in tests/orchestration-vekl-discovery.test.mjs
// and this file checks the structural invariants they depend on.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assignTrustTier, buildDiscoveryCandidate, candidateIdFor, loadDiscoveryCandidates,
  loadDiscoveryPolicy, normalizeLocator, transitionCandidate, validateCandidateRegistry,
} from './discovery-lifecycle.mjs';
import { buildDiscoveryQuery } from './discovery-sanitizer.mjs';
import { runExecutableTrial } from './discovery-sandbox.mjs';
import { qualifyCandidate, projectAdmissionRows } from './discovery-admission.mjs';
import { buildTrustProjection, enforceRetrievalBoundary, CANDIDATE_PLANE } from './discovery-graph-projection.mjs';
import { validateEngineeringResourceRegistries } from './engineering-resource-registry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(repo, rel));

const results = [];
const gate = (id, ok, detail) => results.push({ id, ok: Boolean(ok), detail });

try {
  const policy = loadDiscoveryPolicy(repo);
  const candidates = loadDiscoveryCandidates(repo);

  gate('DISC-G01', policy.second_trust_vocabulary_forbidden === true
    && (policy.trust_tiers || []).join(',') === 'T0_DIAL_PROJECT,T1_OFFICIAL,T2_MAINTAINER_COMMUNITY,T3_COMMUNITY_CORROBORATION,T4_COMMUNITY_SIGNAL',
    'discovery reuses the existing VEKL trust vocabulary verbatim');

  gate('DISC-G02', policy.tier_assignment_rules?.T0_DIAL_PROJECT?.open_world_assignable === false,
    'open-world discovery cannot mint T0_DIAL_PROJECT');

  gate('DISC-G03', Object.values(policy.tier_assignment_rules || {}).every((r) => r.trial_success_sufficient !== true),
    'no tier can be earned by trial success alone');

  // Lifecycle and trust are separate axes: neither vocabulary may contain the other's values.
  const lifecycle = new Set(policy.lifecycle_states || []);
  gate('DISC-G04', !(policy.trust_tiers || []).some((t) => lifecycle.has(t)) && ![...lifecycle].some((s) => /^T[0-4]_/.test(s)),
    'discovery state and trust tier are disjoint vocabularies');

  const registryValidation = validateCandidateRegistry({ repoDir: repo, policy, rows: candidates });
  gate('DISC-G05', registryValidation.ok, registryValidation.ok ? `candidate ledger valid (${registryValidation.candidate_count})` : registryValidation.failures.join('; '));

  // Identity normalisation must be stable and view-independent.
  const a = candidateIdFor('https://github.com/Microsoft/Playwright-MCP/tree/main/src');
  const b = candidateIdFor('https://www.github.com/microsoft/playwright-mcp.git');
  gate('DISC-G06', a === b && normalizeLocator('https://github.com/microsoft/playwright-mcp') === 'https://github.com/microsoft/playwright-mcp',
    'locator normalisation collapses views of the same resource');

  // Fail-closed tiering: unverified provenance never reaches T1, verified does.
  const unverified = assignTrustTier({ policy, provenance: { independent_corroboration_count: 99 }, sourceAdapter: 'WEB_SEARCH' });
  const verified = assignTrustTier({
    policy,
    provenance: { publisher_identity: 'vendor', repository_url: 'https://github.com/vendor/x', official_publisher_verified: true },
    sourceAdapter: 'OFFICIAL_DOC_INDEX',
  });
  gate('DISC-G07', unverified.trust_tier === 'T4_COMMUNITY_SIGNAL' && verified.trust_tier === 'T1_OFFICIAL',
    `unverified=${unverified.trust_tier}; verified-official=${verified.trust_tier}`);

  // Adapter cap: a community adapter cannot produce an official tier even with
  // provenance flags set, because the claim is unverifiable at that adapter.
  const capped = assignTrustTier({
    policy,
    provenance: { publisher_identity: 'vendor', repository_url: 'https://github.com/vendor/x', official_publisher_verified: true },
    sourceAdapter: 'COMMUNITY_SIGNAL',
  });
  gate('DISC-G08', capped.trust_tier === 'T4_COMMUNITY_SIGNAL', `community adapter capped at ${capped.trust_tier}`);

  // Illegal transitions are refused by the live transition table.
  const seed = buildDiscoveryCandidate({
    policy, canonicalLocator: 'https://example.invalid/probe', sourceAdapter: 'WEB_SEARCH',
    discoveredAt: '2026-01-01T00:00:00.000Z',
  });
  const jump = transitionCandidate({ policy, candidate: seed, toState: 'ADMITTED', evidence: { qualification_manifest_hash: 'x', owner_or_delegated_authority: 'owner' } });
  gate('DISC-G09', jump.ok === false && jump.failures.some((f) => f.startsWith('ILLEGAL_TRANSITION')),
    'DISCOVERED cannot jump straight to ADMITTED');

  const noEvidence = transitionCandidate({ policy, candidate: seed, toState: 'TRIAGED', evidence: {} });
  gate('DISC-G10', noEvidence.ok === false && noEvidence.failures.includes('MISSING_EVIDENCE:triage_note'),
    'transitions require their declared evidence');

  // Sensitive context cannot leave through a discovery query.
  const leak = buildDiscoveryQuery({ policy, intent: 'router fix for customer a@b.co order #99121' });
  const clean = buildDiscoveryQuery({ policy, intent: 'deterministic browser control for android webview' });
  gate('DISC-G11', leak.ok === false && leak.reason === 'SENSITIVE_CONTEXT_IN_DISCOVERY_PAYLOAD' && clean.ok === true,
    'discovery payloads are refused when they carry sensitive context');

  // Trials are refused unless every isolation property holds.
  const trial = runExecutableTrial({
    policy, candidate: seed, executableTrialsEnabled: true,
    artifact: { exact_revision: 'a'.repeat(40), artifact_hash: 'b'.repeat(64), dependency_inventory_hash: 'c'.repeat(64) },
    request: { ephemeral: true, network: 'DENY', filesystem_root: '/tmp/dial-trial', environment: { GITHUB_TOKEN: 'x' } },
    runner: () => ({ status: 'PASS', log: 'ok' }),
  });
  gate('DISC-G12', trial.result.status === 'REFUSED' && /FORBIDDEN_ENVIRONMENT_KEY:GITHUB_TOKEN/.test(trial.result.refusal_reason || ''),
    'a credential in the sandbox environment refuses the trial');
  gate('DISC-G13', trial.authority === 'TRIAL_EVIDENCE_NOT_AUTHORIZATION', 'trial manifests declare they are not authorization');

  // Executable admission without an exact pin is impossible.
  const mutable = { ...seed, safety: { ...seed.safety, executable_content_detected: true } };
  const unpinned = qualifyCandidate({
    policy, candidate: mutable, trial: { result: { status: 'PASS' }, manifest_hash: 'd'.repeat(64), isolation: { ephemeral: true } },
    licenseReviewed: true, staticInspectionPassed: true, dependencyReviewPassed: true,
    provenanceVerified: true, taskEvaluationPassed: true,
  });
  gate('DISC-G14', unpinned.ok === false && unpinned.failures.includes('EXACT_VERSION_PIN_REQUIRED_FOR_EXECUTABLE_ADMISSION'),
    'mutable executable references cannot be admitted');

  // A passing trial cannot lift the tier the provenance earned.
  const pinned = {
    ...mutable,
    provenance: { ...mutable.provenance, exact_revision: 'e'.repeat(40) },
  };
  const qualified = qualifyCandidate({
    policy, candidate: pinned,
    trial: { result: { status: 'PASS' }, manifest_hash: 'd'.repeat(64), isolation: { ephemeral: true }, artifact: { exact_revision: 'e'.repeat(40) } },
    licenseReviewed: true, staticInspectionPassed: true, dependencyReviewPassed: true,
    provenanceVerified: true, taskEvaluationPassed: true,
  });
  gate('DISC-G15', qualified.ok === true && qualified.manifest.assigned_trust_tier === 'T4_COMMUNITY_SIGNAL',
    `passing trial kept tier at ${qualified.manifest?.assigned_trust_tier}`);

  const t0 = projectAdmissionRows({
    policy, candidate: pinned,
    qualification: { manifest: { ...qualified.manifest, assigned_trust_tier: 'T0_DIAL_PROJECT' } },
    sourceId: 'discovered.probe', resourceId: 'discovered.probe.mcp', resourceClass: 'MCP_SERVER',
  });
  gate('DISC-G16', t0.ok === false && t0.failures.includes('OPEN_WORLD_DISCOVERY_CANNOT_MINT_T0'),
    'admission refuses a T0 claim from the open world');

  // Candidate-plane material cannot be retrieved as authority.
  const projection = buildTrustProjection({ repoDir: repo, policy });
  const boundary = enforceRetrievalBoundary({ projections: [...projection.canonical_plane, ...projection.candidate_plane], requireAuthority: true });
  gate('DISC-G17', boundary.results.every((x) => x.plane !== CANDIDATE_PLANE && x.authority_role === 'AUTHORITY'),
    `authority retrieval yielded ${boundary.results.length} admitted items and withheld ${boundary.withheld.length}`);
  gate('DISC-G18', projection.candidate_plane.every((x) => x.authority_role !== 'AUTHORITY' && x.executable_eligibility === 'INELIGIBLE'),
    'no candidate-plane item carries authority or executable eligibility');

  // The projection must expose every field the retrieval contract names.
  const required = ['resource_id', 'plane', 'lifecycle_state', 'trust_tier', 'authority_role', 'exact_version', 'source_hash', 'admitted_at', 'freshness_state', 'executable_eligibility', 'sensitive_data_eligibility', 'task_classes'];
  gate('DISC-G19', projection.canonical_plane.every((x) => required.every((k) => k in x)),
    'every retrieved item exposes the full graph retrieval contract');

  // Existing registries still validate after the discovery plane is added.
  const registries = validateEngineeringResourceRegistries(repo);
  gate('DISC-G20', registries.ok, registries.ok ? `existing VEKL registries valid (${registries.resource_count} resources)` : registries.failures.join('; '));

  gate('DISC-G21', policy.reassessment?.may_rewrite_project_truth === false && policy.reassessment?.may_change_programme_priority === false,
    'reassessment may recommend but never rewrites canon or priority');

  gate('DISC-G22', (policy.trigger_classes || []).every((t) => t.may_reprioritise_development_plan === false),
    'no discovery trigger may reprioritise the Development Plan');

  gate('DISC-G23', policy.rollback?.discovery_evidence_deletion_forbidden === true
    && policy.feature_flags && Object.prototype.hasOwnProperty.call(policy.feature_flags, 'discovery_adapters_enabled'),
    'rollback disables adapters and preserves evidence');

  gate('DISC-G24', exists('tests/orchestration-vekl-discovery.test.mjs'), 'negative-test suite present');

  for (const rel of [
    'agent-system/engineering-knowledge/schemas/discovery-candidate.schema.json',
    'agent-system/engineering-knowledge/schemas/executable-trial-manifest.schema.json',
    'agent-system/engineering-knowledge/schemas/resource-qualification-manifest.schema.json',
    'agent-system/engineering-knowledge/schemas/graph-trust-projection.schema.json',
  ]) {
    gate(`DISC-SCHEMA:${path.basename(rel)}`, exists(rel) && Boolean(JSON.parse(read(rel)).title), `${rel} present and parses`);
  }
} catch (error) {
  gate('DISC-INTERNAL', false, String(error?.stack || error));
}

const ok = results.every((x) => x.ok);
console.log(JSON.stringify({ ok, passed: results.filter((x) => x.ok).length, total: results.length, results }, null, 2));
if (!ok) process.exitCode = 1;
