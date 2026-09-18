#!/usr/bin/env node
// Executable admission pipeline: the only path from the candidate plane into the
// admitted VEKL registries.
//
// Rev 3.1 §5.9. The pipeline is ordered and every stage is mandatory for
// executable material. The two rules it exists to make unbypassable:
//
//   1. A mutable reference cannot be activated. Admission requires an exact
//      revision/version pin, so "latest on main" is refused even when the trial
//      passed on whatever main was that day.
//   2. Trial success is not authorisation. `trial.result.status === 'PASS'` is a
//      required stage input, never a sufficient one, and it can never raise the
//      trust tier the provenance earned.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashObject, loadRegistry } from './knowledge-graph-core.mjs';
import { assignTrustTier, loadDiscoveryPolicy } from './discovery-lifecycle.mjs';
import { RESOURCE_CLASSES, EXECUTABLE_RESOURCE_CLASSES } from './engineering-resource-registry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO = path.resolve(here, '../..');
const SOURCE_REL = 'agent-system/engineering-knowledge/registries/ENGINEERING_RESOURCE_SOURCE_REGISTRY.json';

export function qualifyCandidate({
  policy = null,
  repoDir = DEFAULT_REPO,
  candidate,
  trial = null,
  licenseReviewed = false,
  staticInspectionPassed = false,
  dependencyReviewPassed = false,
  provenanceVerified = false,
  taskEvaluationPassed = false,
  freshnessState = 'CURRENT',
} = {}) {
  const p = policy || loadDiscoveryPolicy(repoDir);
  if (!candidate?.candidate_id) throw new Error('candidate required');

  const isExecutable = candidate.safety?.executable_content_detected === true
    || (candidate.claimed_resource_classes || []).some((c) => EXECUTABLE_RESOURCE_CLASSES.has(c));

  const stages = [];
  const failures = [];
  const stage = (name, ok, reason) => {
    stages.push({ stage: name, ok: Boolean(ok) });
    if (!ok) failures.push(reason || name);
  };

  stage('DISCOVERY', Boolean(candidate.canonical_locator), 'NO_CANONICAL_LOCATOR');
  stage('IMMUTABLE_IDENTITY_RESOLUTION', Boolean(candidate.identity_key), 'NO_IDENTITY_KEY');

  const pin = candidate.provenance?.exact_revision || candidate.provenance?.package_version || candidate.provenance?.release_tag || null;
  // Non-executable reference material may be admitted without a pin; anything
  // DIAL could run may not.
  stage('EXACT_REVISION_PIN', !isExecutable || Boolean(pin), 'EXACT_VERSION_PIN_REQUIRED_FOR_EXECUTABLE_ADMISSION');
  stage('LICENSE_REVIEW', !isExecutable || licenseReviewed === true, 'LICENSE_NOT_REVIEWED');
  stage('PROVENANCE_VERIFICATION', provenanceVerified === true, 'PROVENANCE_NOT_VERIFIED');
  stage('STATIC_INSPECTION', !isExecutable || staticInspectionPassed === true, 'STATIC_INSPECTION_NOT_PASSED');
  stage('DEPENDENCY_SECURITY_REVIEW', !isExecutable || dependencyReviewPassed === true, 'DEPENDENCY_REVIEW_NOT_PASSED');

  const trialOk = trial?.result?.status === 'PASS';
  stage('ISOLATED_EXECUTION', !isExecutable || trialOk, 'ISOLATED_TRIAL_NOT_PASSED');
  // A trial that ran against a different revision than the one being admitted is
  // evidence about a different artifact.
  if (isExecutable && trial && pin && trial.artifact?.exact_revision && trial.artifact.exact_revision !== pin) {
    failures.push('TRIAL_REVISION_DOES_NOT_MATCH_ADMITTED_PIN');
    stages.push({ stage: 'ISOLATED_EXECUTION_PIN_MATCH', ok: false });
  }
  if (isExecutable && trial && trial.isolation) {
    const iso = trial.isolation;
    const leaks = [
      iso.dial_credentials_present, iso.production_secrets_present, iso.service_role_key_present,
      iso.oracle_control_credential_present, iso.project_truth_write_path,
      iso.production_database_write_path, iso.sensitive_fixtures_used,
    ];
    stage('TRIAL_ISOLATION_INTACT', iso.ephemeral === true && !leaks.some((x) => x === true), 'TRIAL_ISOLATION_COMPROMISED');
  }
  stage('TASK_SPECIFIC_EVALUATION', taskEvaluationPassed === true, 'TASK_EVALUATION_NOT_PASSED');
  stage('DONOR_SECURITY_EVAL_PROVENANCE_RECORD', !isExecutable || Boolean(trial?.manifest_hash), 'NO_TRIAL_PROVENANCE_RECORD');

  // Tier is re-derived from provenance alone. Trial evidence is deliberately not
  // in scope here — that is Principle 2 in code.
  const tier = assignTrustTier({
    policy: p,
    provenance: candidate.provenance || {},
    sourceAdapter: candidate.source_adapter,
  });
  stage('QUALIFICATION', failures.length === 0, 'PIPELINE_INCOMPLETE');

  if (failures.length) {
    return { ok: false, failures: [...new Set(failures)].sort(), stages, manifest: null };
  }

  const base = {
    schema_version: 1,
    qualification_id: `QUAL-${hashObject({ candidate: candidate.candidate_id, stages, tier: tier.trust_tier }).slice(0, 24)}`,
    candidate_id: candidate.candidate_id,
    assigned_trust_tier: tier.trust_tier,
    tier_justification: tier.justification,
    pipeline_stages_completed: stages.filter((s) => s.ok).map((s) => s.stage),
    executable: {
      is_executable: isExecutable,
      exact_revision_pinned: Boolean(pin),
      license_reviewed: licenseReviewed === true,
      static_inspection_passed: staticInspectionPassed === true,
      dependency_review_passed: dependencyReviewPassed === true,
      trial_manifest_hash: trial?.manifest_hash || null,
    },
    freshness_state: freshnessState,
    authority: 'QUALIFICATION_EVIDENCE',
  };
  return { ok: true, failures: [], stages, manifest: { ...base, manifest_hash: hashObject(base) } };
}

// Admission produces the rows that belong in the EXISTING registries. It returns
// them rather than writing, so the caller (and the owner-authority path) decides
// when they land — but it refuses to produce anything that would violate the
// registries' own invariants.
export function projectAdmissionRows({
  policy = null,
  repoDir = DEFAULT_REPO,
  candidate,
  qualification,
  sourceId,
  resourceId,
  resourceClass,
  retrievalAdapters = ['HTTPS_READ_ONLY'],
  freshnessTtlHours = 720,
} = {}) {
  const p = policy || loadDiscoveryPolicy(repoDir);
  const failures = [];
  if (!qualification?.manifest) failures.push('QUALIFICATION_MANIFEST_REQUIRED');
  if (qualification?.manifest?.candidate_id !== candidate?.candidate_id) failures.push('QUALIFICATION_CANDIDATE_MISMATCH');
  if (!RESOURCE_CLASSES.has(resourceClass)) failures.push(`INVALID_RESOURCE_CLASS:${resourceClass}`);

  const tier = qualification?.manifest?.assigned_trust_tier;
  if (tier === 'T0_DIAL_PROJECT') failures.push('OPEN_WORLD_DISCOVERY_CANNOT_MINT_T0');
  if (!(p.trust_tiers || []).includes(tier)) failures.push(`UNKNOWN_TRUST_TIER:${tier}`);

  const existingSources = loadRegistry(repoDir, SOURCE_REL, []);
  const existing = existingSources.find((s) => s.source_id === sourceId) || null;
  // Reuse an existing source family where one already covers this publisher.
  // A second source row for the same publisher is a second trust vocabulary by
  // another name.
  if (existing && existing.trust_tier !== tier) {
    failures.push(`SOURCE_TIER_CONFLICT:${sourceId}:${existing.trust_tier}!=${tier}`);
  }

  const isExecutable = qualification?.manifest?.executable?.is_executable === true;
  if (isExecutable && qualification?.manifest?.executable?.exact_revision_pinned !== true) {
    failures.push('EXECUTABLE_ADMISSION_REQUIRES_EXACT_VERSION_PIN');
  }

  if (failures.length) return { ok: false, failures: [...new Set(failures)].sort(), source_row: null, resource_row: null };

  const pin = candidate.provenance?.exact_revision || candidate.provenance?.package_version || candidate.provenance?.release_tag || null;
  const sourceRow = existing || {
    source_id: sourceId,
    name: candidate.provenance?.publisher_identity || candidate.canonical_locator,
    trust_tier: tier,
    source_kind: tier === 'T1_OFFICIAL' ? 'OFFICIAL_DOCS_REPO' : 'COMMUNITY',
    domains: (() => { try { return [new URL(candidate.canonical_locator).hostname.replace(/^www\./, '')]; } catch { return []; } })(),
    repositories: candidate.provenance?.repository_url ? [candidate.provenance.repository_url.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')] : [],
    retrieval_adapters: [...retrievalAdapters].sort(),
    resource_classes: [resourceClass],
    task_classes: [...(candidate.claimed_task_classes || [])].sort(),
    sensitive_data_allowed: false,
    // Executable content stays disallowed at source level unless the resource
    // itself carries an exact pin and a qualification manifest.
    executable_content_allowed: isExecutable && Boolean(pin),
    freshness_ttl_hours: freshnessTtlHours,
    admitted_from_discovery_candidate: candidate.candidate_id,
    qualification_manifest_hash: qualification.manifest.manifest_hash,
  };

  const resourceRow = {
    resource_id: resourceId,
    name: candidate.provenance?.publisher_identity
      ? `${candidate.provenance.publisher_identity} — ${resourceClass}`
      : candidate.canonical_locator,
    source_id: sourceId,
    resource_class: resourceClass,
    authority: 'ENGINEERING_GUIDANCE_ONLY',
    status: isExecutable ? 'APPROVED' : 'REFERENCE_APPROVED',
    activation_mode: isExecutable ? 'EXECUTABLE_CAPABILITY' : 'CORROBORATION_ONLY',
    locator: candidate.canonical_locator,
    task_classes: [...(candidate.claimed_task_classes || [])].sort(),
    technologies: [],
    keywords: [],
    forbidden_effects: [],
    requires_tools: [],
    production_pin: pin,
    content_hash: qualification.manifest.executable?.trial_manifest_hash || qualification.manifest.manifest_hash,
    discovery_candidate_id: candidate.candidate_id,
    qualification_manifest_hash: qualification.manifest.manifest_hash,
    admitted_at: new Date().toISOString(),
  };

  return { ok: true, failures: [], source_row: sourceRow, resource_row: resourceRow };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const policy = loadDiscoveryPolicy();
  console.log(JSON.stringify({ pipeline: policy.executable_admission_pipeline }, null, 2));
}
