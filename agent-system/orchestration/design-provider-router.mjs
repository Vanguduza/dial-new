import { hashObject } from './knowledge-graph-core.mjs';

export const DESIGN_ITERATION_PHASES = Object.freeze(['EXPLORE','CONVERGE','RECONSTRUCT']);

const DEFAULT_PREFERENCE = Object.freeze([
  'LOCKED_BASELINE_REPAIR',
  'DIRECT_DONOR_PORT_AND_TRANSFORM',
  'DIRECT_DIAL_IMPLEMENTATION',
  'STITCH_CODE_TO_DESIGN_THEN_BUILD',
  'STITCH_NEW_DESIGN_THEN_BUILD',
]);
const STITCH_PREFERENCE = Object.freeze([
  'STITCH_CODE_TO_DESIGN_THEN_BUILD',
  'STITCH_NEW_DESIGN_THEN_BUILD',
  'LOCKED_BASELINE_REPAIR',
  'DIRECT_DONOR_PORT_AND_TRANSFORM',
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
  if (['DONOR_ADAPT', 'DONOR_PRESERVE'].includes(designMode) && directWorkerEligible) candidates.push('DIRECT_DONOR_PORT_AND_TRANSFORM');
  if (stitchEnabled && stitchEligible && providerHealth === 'HEALTHY') {
    candidates.push(designMode === 'NEW_DIAL_DESIGN' ? 'STITCH_NEW_DESIGN_THEN_BUILD' : 'STITCH_CODE_TO_DESIGN_THEN_BUILD');
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
  if (['DONOR_ADAPT', 'DONOR_PRESERVE'].includes(designProvenanceMode) && !(provider.supported_inputs || []).includes('donor_screen')) {
    reasons.push('DONOR_INPUT_UNSUPPORTED');
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

  // A provider being unavailable must not block the system when another
  // qualified route preserves the acceptance requirements (§6.10). The direct
  // DIAL implementation route is that fallback, and it is a real route, not a
  // relaxation of acceptance.
  const legacy = selectDesignStrategy({
    designMode: designProvenanceMode,
    directWorkerEligible,
    stitchEnabled: routes.some((r) => r.provider_id === 'google-stitch'),
    stitchEligible: routes.some((r) => r.provider_id === 'google-stitch'),
    providerHealth: routes.some((r) => r.provider_id === 'google-stitch') ? 'HEALTHY' : 'UNKNOWN',
  });
  if (!routes.length && !legacy.ok) {
    return { ok: false, reason: 'NO_ELIGIBLE_DESIGN_STRATEGY', routes: [], rejected: rejected.sort((a, b) => a.provider_id.localeCompare(b.provider_id)) };
  }

  const sorted = routes.sort((a, b) => a.provider_id.localeCompare(b.provider_id));
  const base = {
    design_provenance_mode: designProvenanceMode,
    design_iteration_phase: designIterationPhase,
    candidate_count: candidateCount,
    routes: sorted,
    fallback_strategy: legacy.ok ? legacy.selected : null,
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
