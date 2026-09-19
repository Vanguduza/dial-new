#!/usr/bin/env node
// Convergence, synthesis and visual-authority freeze (Rev 3.1 §6.8, §6.13, §6.14).
//
// The shape of the pipeline is: many candidates, then one direction, then one
// frozen authority, then an implementation compared against it. Each step
// narrows what may still change, and the freeze is what stops a later
// implementation agent "improving" an accepted screen into a different one.
//
// Synthesis deliberately produces a regeneration brief rather than a merged
// artifact: §6.13 forbids pasting fragments of different candidates together,
// and the only way to make that structural is to never emit a merged artifact
// at all.
import { hashObject } from './knowledge-graph-core.mjs';

export const CONVERGENCE_SECTIONS = Object.freeze(['preserve', 'correct', 'improve', 'forbid']);

// Candidate diversity must be bounded, not random (§6.11). These are the axes a
// run may vary; anything else is fixed by Product Truth or the freedom budget.
export const VARIABLE_DIMENSIONS = Object.freeze(['section_composition', 'imagery_position', 'surface_strategy', 'emphasis', 'typography_proportion']);
export const FIXED_DIMENSIONS = Object.freeze(['product_truth', 'required_content', 'navigation_semantics', 'external_reference_constraints', 'money_behavior', 'security_behavior']);

export function evaluateCandidateDiversity({ candidates = [], packet = null, minimumDistinctDimensions = 2 } = {}) {
  const failures = [];
  const required = packet?.candidate_policy?.count ?? candidates.length;
  if (candidates.length !== required) failures.push(`CANDIDATE_COUNT_MISMATCH:${candidates.length}!=${required}`);

  const dimensions = packet?.candidate_policy?.diversity_dimensions || VARIABLE_DIMENSIONS;
  const varied = [];
  for (const dimension of dimensions) {
    const values = candidates.map((c) => JSON.stringify(c?.declared?.variation?.[dimension] ?? null));
    if (new Set(values).size > 1) varied.push(dimension);
  }
  if (candidates.length > 1 && varied.length < minimumDistinctDimensions) {
    failures.push(`INSUFFICIENT_DIVERSITY:${varied.length}<${minimumDistinctDimensions}`);
  }

  // Semantic drift is the opposite failure: candidates that differ where they
  // must not. A run can fail for being too similar or for being too different.
  const drift = [];
  for (const fixed of FIXED_DIMENSIONS) {
    const values = candidates.map((c) => JSON.stringify(c?.declared?.fixed?.[fixed] ?? null));
    if (new Set(values).size > 1) drift.push(fixed);
  }
  if (drift.length) failures.push(`SEMANTIC_DRIFT_ACROSS_CANDIDATES:${drift.sort().join(',')}`);

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)].sort(),
    varied_dimensions: varied.sort(),
    drifted_dimensions: drift.sort(),
  };
}

export function buildConvergencePacket({
  packet,
  candidates = [],
  criticEvidence = [],
  selectedCandidateId,
  preserve = [],
  correct = [],
  improve = [],
  forbid = [],
} = {}) {
  const failures = [];
  if (packet?.design_state?.design_iteration_phase !== 'EXPLORE') failures.push('CONVERGENCE_REQUIRES_EXPLORE_PACKET');
  const selected = candidates.find((c) => c.candidate_id === selectedCandidateId) || null;
  if (!selected) failures.push(`SELECTED_CANDIDATE_NOT_IN_RUN:${selectedCandidateId}`);

  const evidence = criticEvidence.find((e) => e.candidate_id === selectedCandidateId) || null;
  if (!evidence) failures.push('CRITIC_EVIDENCE_REQUIRED_FOR_SELECTED_CANDIDATE');
  // A candidate the critics rejected cannot be the direction the run converges
  // on. Improving it is a new EXPLORE, not a CONVERGE.
  else if (evidence.verdict === 'REJECT') failures.push('REJECTED_CANDIDATE_CANNOT_BE_SELECTED');

  if (!preserve.length) failures.push('CONVERGENCE_MUST_STATE_WHAT_IS_PRESERVED');
  const unresolved = (evidence?.blocking_findings || []).filter((f) => !correct.some((c) => String(c).includes(f.finding_id)));
  if (unresolved.length) failures.push(`UNRESOLVED_BLOCKING_FINDINGS:${unresolved.map((f) => f.finding_id).sort().join(',')}`);

  if (failures.length) return { ok: false, failures: [...new Set(failures)].sort(), packet: null };

  const base = {
    schema_version: 1,
    from_packet_hash: packet.packet_hash,
    product_truth_hash: packet.authority.product_truth_hash,
    design_provenance_mode: packet.design_state.design_provenance_mode,
    design_iteration_phase: 'CONVERGE',
    selected_candidate_id: selectedCandidateId,
    selected_candidate_hash: selected.candidate_hash ?? null,
    critic_evidence_hash: evidence.evidence_hash,
    preserve: [...preserve].sort(),
    correct: [...correct].sort(),
    improve: [...improve].sort(),
    forbid: [...forbid].sort(),
    authority: 'NON_AUTHORITATIVE_CONVERGENCE_DIRECTION',
  };
  return { ok: true, failures: [], packet: { ...base, convergence_hash: hashObject(base) } };
}

// A synthesis brief names which candidate contributes which strength, and then
// requires one coherent regeneration. It never carries artifact fragments.
export function buildSynthesisManifest({ packet, contributions = [], targetCandidateId } = {}) {
  const failures = [];
  if (!contributions.length) failures.push('SYNTHESIS_REQUIRES_CONTRIBUTIONS');
  for (const contribution of contributions) {
    if (!contribution.candidate_id || !contribution.strength) failures.push('CONTRIBUTION_REQUIRES_CANDIDATE_AND_STRENGTH');
    if (FIXED_DIMENSIONS.includes(contribution.strength)) failures.push(`SYNTHESIS_OVER_FIXED_DIMENSION:${contribution.strength}`);
    if (contribution.artifact_fragment !== undefined) failures.push('SYNTHESIS_MUST_NOT_CARRY_ARTIFACT_FRAGMENTS');
  }
  const conflicting = contributions
    .map((c) => c.strength)
    .filter((s, i, xs) => xs.indexOf(s) !== i);
  if (conflicting.length) failures.push(`CONFLICTING_CONTRIBUTIONS:${[...new Set(conflicting)].sort().join(',')}`);

  if (failures.length) return { ok: false, failures: [...new Set(failures)].sort(), manifest: null };

  const base = {
    schema_version: 1,
    from_packet_hash: packet?.packet_hash ?? null,
    product_truth_hash: packet?.authority?.product_truth_hash ?? null,
    target_candidate_id: targetCandidateId ?? null,
    contributions: [...contributions]
      .map((c) => ({ candidate_id: c.candidate_id, strength: c.strength, rationale: c.rationale ?? null }))
      .sort((a, b) => a.candidate_id.localeCompare(b.candidate_id) || a.strength.localeCompare(b.strength)),
    regeneration_required: true,
    collage_forbidden: true,
    authority: 'NON_AUTHORITATIVE_SYNTHESIS_BRIEF',
  };
  return { ok: true, failures: [], manifest: { ...base, synthesis_hash: hashObject(base) } };
}

// The freeze. Everything listed as locked is binding on RECONSTRUCT; parity is
// measured against this object and nothing else.
export function freezeVisualAuthority({
  convergencePacket,
  candidate,
  criticEvidence,
  promotedBy,
  promotionAuthority,
  designTokens = {},
  componentRelationships = [],
  responsiveRules = [],
  stateMatrix = [],
  motionRules = [],
  assetRefs = [],
} = {}) {
  const failures = [];
  if (!convergencePacket?.convergence_hash) failures.push('CONVERGENCE_PACKET_REQUIRED');
  if (!candidate?.candidate_id) failures.push('CANDIDATE_REQUIRED');
  if (criticEvidence?.verdict === 'REJECT') failures.push('REJECTED_CANDIDATE_CANNOT_BE_PROMOTED');
  if (!criticEvidence?.evidence_hash) failures.push('CRITIC_EVIDENCE_REQUIRED');
  // Existing policy: promotion is an owner or authorised design-authority act.
  // Nothing in the guided pipeline may promote on its own evidence.
  if (!['OWNER', 'AUTHORIZED_DESIGN_AUTHORITY'].includes(promotionAuthority)) {
    failures.push('PROMOTION_REQUIRES_OWNER_OR_AUTHORIZED_DESIGN_AUTHORITY');
  }
  if (!promotedBy) failures.push('PROMOTER_IDENTITY_REQUIRED');
  if (failures.length) return { ok: false, failures: [...new Set(failures)].sort(), visual_authority: null };

  const base = {
    schema_version: 1,
    candidate_id: candidate.candidate_id,
    candidate_hash: candidate.candidate_hash ?? null,
    authority_projection_hash: convergencePacket.from_packet_hash,
    convergence_hash: convergencePacket.convergence_hash,
    product_truth_hash: convergencePacket.product_truth_hash,
    critic_evidence_hash: criticEvidence.evidence_hash,
    composition_locked: true,
    hierarchy_locked: true,
    section_order_locked: true,
    design_tokens: {
      spacing: designTokens.spacing ?? null,
      radii: designTokens.radii ?? null,
      typography: designTokens.typography ?? null,
      color_roles: designTokens.color_roles ?? null,
      elevations: designTokens.elevations ?? null,
    },
    component_relationships: [...componentRelationships],
    responsive_rules: [...responsiveRules],
    state_matrix: [...stateMatrix],
    motion_rules: [...motionRules],
    asset_refs: [...assetRefs].sort(),
    promoted_by: promotedBy,
    promotion_authority: promotionAuthority,
    authority: 'PROMOTED_VISUAL_AUTHORITY',
  };
  // The identity hash deliberately excludes the promotion timestamp: when the
  // act happened is audit, not identity (§22).
  return { ok: true, failures: [], visual_authority: { ...base, promoted_at: new Date().toISOString(), visual_authority_hash: hashObject(base) } };
}

// RECONSTRUCT parity. Functional correctness alone must not pass a visually
// degraded screen (§17.2), so a locked-dimension deviation is a failure even
// when every required action and state is present.
export function verifyReconstructionParity({ visualAuthority, implementation = {} } = {}) {
  const failures = [];
  if (!visualAuthority?.visual_authority_hash) return { ok: false, failures: ['VISUAL_AUTHORITY_REQUIRED'], deviations: [] };
  if (implementation.visual_authority_hash !== visualAuthority.visual_authority_hash) {
    failures.push('IMPLEMENTATION_NOT_BOUND_TO_VISUAL_AUTHORITY');
  }
  const deviations = [];
  const locked = [
    ['composition', visualAuthority.composition_locked],
    ['hierarchy', visualAuthority.hierarchy_locked],
    ['section_order', visualAuthority.section_order_locked],
  ];
  for (const [dimension, isLocked] of locked) {
    if (isLocked && implementation.deviations?.includes(dimension)) {
      deviations.push(dimension);
      failures.push(`LOCKED_DIMENSION_DEVIATION:${dimension}`);
    }
  }
  for (const [token, value] of Object.entries(visualAuthority.design_tokens || {})) {
    if (value === null) continue;
    const got = implementation.design_tokens?.[token];
    if (got !== undefined && JSON.stringify(got) !== JSON.stringify(value)) {
      failures.push(`DESIGN_TOKEN_DRIFT:${token}`);
      deviations.push(`token:${token}`);
    }
  }
  const implementedStates = new Set(implementation.state_matrix || []);
  for (const state of visualAuthority.state_matrix || []) {
    if (!implementedStates.has(state)) failures.push(`STATE_MATRIX_INCOMPLETE:${state}`);
  }
  const allowed = new Set(implementation.implementation_required_adaptations || []);
  const unjustified = deviations.filter((d) => !allowed.has(d));
  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)].sort(),
    deviations: [...new Set(deviations)].sort(),
    unjustified_deviations: unjustified.sort(),
    parity_hash: hashObject({ authority: visualAuthority.visual_authority_hash, deviations: deviations.sort(), failures: failures.sort() }),
  };
}

// Only accepted, evidenced work teaches reusable design knowledge (§6.16).
export function buildGoldenScreenDescriptor({ visualAuthority, parity, validatedBy, patterns = [] } = {}) {
  const failures = [];
  if (!visualAuthority?.visual_authority_hash) failures.push('VISUAL_AUTHORITY_REQUIRED');
  if (parity?.ok !== true) failures.push('PARITY_EVIDENCE_REQUIRED');
  if (!validatedBy) failures.push('EXPLICIT_VALIDATION_REQUIRED');
  if (failures.length) return { ok: false, failures: failures.sort(), descriptor: null };
  const base = {
    schema_version: 1,
    visual_authority_hash: visualAuthority.visual_authority_hash,
    parity_hash: parity.parity_hash,
    validated_by: validatedBy,
    patterns: [...patterns].sort(),
    // Golden screens define a quality floor and family resemblance; they do not
    // force identical composition across DIAL products (§6.15).
    defines_quality_floor: true,
    forces_identical_composition: false,
    authority: 'GOLDEN_SCREEN_REFERENCE',
  };
  return { ok: true, failures: [], descriptor: { ...base, descriptor_hash: hashObject(base) } };
}

// Rejected candidate content must not enter reusable design knowledge by default.
export function filterLearnableEvidence({ candidates = [], criticEvidence = [], visualAuthority = null } = {}) {
  const accepted = new Set([visualAuthority?.candidate_id].filter(Boolean));
  const rejected = new Set(criticEvidence.filter((e) => e.verdict === 'REJECT').map((e) => e.candidate_id));
  const learnable = candidates.filter((c) => accepted.has(c.candidate_id) && !rejected.has(c.candidate_id));
  return {
    learnable: learnable.map((c) => c.candidate_id).sort(),
    withheld: candidates.filter((c) => !accepted.has(c.candidate_id)).map((c) => c.candidate_id).sort(),
    // Anti-pattern findings ARE learnable from rejected work: what failed is
    // exactly the knowledge worth keeping. The artifact is not.
    anti_pattern_findings: criticEvidence
      .flatMap((e) => (e.blocking_findings || []).map((f) => f.finding_id))
      .filter((x, i, xs) => xs.indexOf(x) === i)
      .sort(),
  };
}
