import { hashObject } from './knowledge-graph-core.mjs';

export const DESIGN_ITERATION_PHASES = Object.freeze(['EXPLORE','CONVERGE','RECONSTRUCT']);

const DEFAULT_PREFERENCE = Object.freeze([
  'LOCKED_BASELINE_REPAIR',
  'DIRECT_DIAL_IMPLEMENTATION',
  'STITCH_CODE_TO_DESIGN_THEN_BUILD',
  'STITCH_NEW_DESIGN_THEN_BUILD',
]);
const STITCH_PREFERENCE = Object.freeze([
  'STITCH_CODE_TO_DESIGN_THEN_BUILD',
  'STITCH_NEW_DESIGN_THEN_BUILD',
  'LOCKED_BASELINE_REPAIR',
  'DIRECT_DIAL_IMPLEMENTATION',
]);

export function selectDesignStrategy({
  designMode,
  stitchEnabled = false,
  stitchEligible = false,
  directWorkerEligible = true,
  providerHealth = 'UNKNOWN',
  preference = 'DEFAULT',
} = {}) {
  const candidates = [];
  if (directWorkerEligible) candidates.push('DIRECT_DIAL_IMPLEMENTATION');
  if (stitchEnabled && stitchEligible && providerHealth === 'HEALTHY') {
    candidates.push(['NEW_DIAL_DESIGN','REFERENCE_INSPIRED_DIAL_NATIVE','DONOR_ADAPT','DONOR_PRESERVE'].includes(designMode) ? 'STITCH_NEW_DESIGN_THEN_BUILD' : 'STITCH_CODE_TO_DESIGN_THEN_BUILD');
  }
  if (!candidates.length) return { ok: false, reason: 'NO_ELIGIBLE_DESIGN_STRATEGY' };
  const ordering = preference === 'STITCH' ? STITCH_PREFERENCE : DEFAULT_PREFERENCE;
  candidates.sort((a, b) => ordering.indexOf(a) - ordering.indexOf(b));
  const selected = candidates[0];
  return {
    ok: true,
    candidates,
    selected,
    preference,
    selection_hash: hashObject({ designMode, candidates, selected, providerHealth, preference }),
  };
}

// Every provider declares the same contract, whatever it is behind the adapter
// (§6.10). A provider that has not declared is not eligible; there is no
// permissive default, because "unknown capability" and "capable" are not the
// same thing.
export function evaluateProviderEligibility({ provider, phase, designProvenanceMode, requiredOutputs = [], requiresVisualReference = false, sensitiveContext = false } = {}) {
  const reasons = [];
  if (!provider?.provider_id) return { eligible: false, reasons: ['PROVIDER_UNDECLARED'] };
  if (provider.authority !== 'NON_AUTHORITATIVE_CANDIDATE') reasons.push('PROVIDER_MUST_BE_NON_AUTHORITATIVE');
  if (provider.qualification_required === true && provider.qualification_evidence_valid !== true) reasons.push('QUALIFICATION_EVIDENCE_MISSING');
  if (provider.health !== 'HEALTHY') reasons.push(`PROVIDER_UNHEALTHY:${provider.health ?? 'UNKNOWN'}`);
  if (!(provider.supported_phases || []).includes(phase)) reasons.push(`PHASE_UNSUPPORTED:${phase}`);
  if (['REFERENCE_INSPIRED_DIAL_NATIVE','DONOR_ADAPT','DONOR_PRESERVE'].includes(designProvenanceMode) && (provider.supported_inputs || []).includes('donor_screen')) {
    reasons.push('RAW_EXTERNAL_REPOSITORY_SCREEN_INPUT_FORBIDDEN');
  }
  if (requiresVisualReference && !(provider.supported_inputs || []).includes('image_reference')) reasons.push('VISUAL_REFERENCE_UNSUPPORTED');
  for (const output of requiredOutputs) {
    if (!(provider.supported_outputs || []).includes(output)) reasons.push(`OUTPUT_UNSUPPORTED:${output}`);
  }
  if (sensitiveContext && provider.sensitive_data_allowed !== true) reasons.push('SENSITIVE_CONTEXT_NOT_PERMITTED');
  if (provider.sensitive_data_allowed === true) reasons.push('PROVIDER_CLAIMS_SENSITIVE_DATA_ACCESS');
  return { eligible: reasons.length === 0, reasons: [...new Set(reasons)].sort() };
}

export function routeGuidedCandidateGeneration({
  designProvenanceMode,
  designIterationPhase,
  providers = [],
  candidateCount = 1,
  requiredOutputs = ['design_artifact'],
  requiresVisualReference = false,
  sensitiveContext = false,
  directWorkerEligible = true,
} = {}) {
  if (!DESIGN_ITERATION_PHASES.includes(designIterationPhase)) {
    return { ok: false, reason: `UNKNOWN_ITERATION_PHASE:${designIterationPhase}`, routes: [], rejected: [] };
  }
  const routes = [];
  const rejected = [];
  for (const provider of providers) {
    const verdict = evaluateProviderEligibility({
      provider, phase: designIterationPhase, designProvenanceMode, requiredOutputs, requiresVisualReference, sensitiveContext,
    });
    if (verdict.eligible) routes.push({ provider_id: provider.provider_id, authority: 'NON_AUTHORITATIVE_CANDIDATE' });
    else rejected.push({ provider_id: provider.provider_id ?? '<undeclared>', reasons: verdict.reasons });
  }

  // Canonical frontend design is provider-authored by Stitch. A provider outage
  // must not silently substitute a direct worker or a second design provider.
  if (!routes.length) {
    return {
      ok: false,
      reason: 'NO_ELIGIBLE_DESIGN_PROVIDER',
      outage_behavior: 'WAIT_RETRY_OR_REPORT_UNAVAILABLE',
      routes: [],
      fallback_strategy: null,
      acceptance_preserved: true,
      rejected: rejected.sort((a, b) => a.provider_id.localeCompare(b.provider_id)),
    };
  }

  const sorted = routes.sort((a, b) => a.provider_id.localeCompare(b.provider_id));
  const base = {
    design_provenance_mode: designProvenanceMode,
    design_iteration_phase: designIterationPhase,
    candidate_count: candidateCount,
    routes: sorted,
    fallback_strategy: null,
    acceptance_preserved: true,
  };
  return {
    ok: true,
    reason: null,
    ...base,
    rejected: rejected.sort((a, b) => a.provider_id.localeCompare(b.provider_id)),
    routing_hash: hashObject(base),
  };
}
