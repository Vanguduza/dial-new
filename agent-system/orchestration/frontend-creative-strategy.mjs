import { hashObject } from './knowledge-graph-core.mjs';

export const CREATIVE_STRATEGY_VERSION = 'dial-guided-creative-screen-generation-1.0';
export const CREATIVE_PHASES = Object.freeze(['EXPLORE', 'CONVERGE', 'RECONSTRUCT']);

const DEFAULT_LENSES = Object.freeze([
  {
    candidate_id: 'precision-editorial',
    label: 'Precision Editorial',
    intent: 'Create a premium, restrained composition with strong typography, confident whitespace, disciplined alignment and editorial hierarchy.',
    differentiators: ['typographic hierarchy', 'quiet confidence', 'clean grouping', 'precise spacing'],
  },
  {
    candidate_id: 'immersive-automotive',
    label: 'Immersive Automotive',
    intent: 'Create a more immersive automotive composition with strong vehicle/parts context, dimensional surfaces and a refined technical feel without becoming dashboard-like.',
    differentiators: ['automotive character', 'dimensional depth', 'strong focal composition', 'technical refinement'],
  },
  {
    candidate_id: 'utility-first-premium',
    label: 'Utility-first Premium',
    intent: 'Prioritize immediate task clarity, search/discovery speed and thumb-friendly mobile ergonomics while retaining premium visual polish.',
    differentiators: ['task immediacy', 'mobile ergonomics', 'clear actions', 'premium utility'],
  },
]);

function uniq(values) {
  return [...new Set((values || []).filter(Boolean).map(String))].sort();
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function creativeRangeForMode(mode) {
  if (mode === 'RECONSTRUCT') return 'REFINE';
  if (mode === 'ASSIMILATE') return 'EXPLORE'; // legacy serialized mode; DEC-039 treats it as DIAL-native synthesis with reference-only context
  return 'REIMAGINE';
}

function freedomLevel(mode) {
  if (mode === 'RECONSTRUCT') return 'LOW';
  if (mode === 'ASSIMILATE') return 'MEDIUM'; // legacy compatibility only
  return 'MEDIUM_HIGH';
}

export function buildCreativeDirectionProfile({ fdep, brief, surfaceId = null } = {}) {
  if (!fdep) throw new Error('CREATIVE_DIRECTION_FDEP_REQUIRED');
  const mode = fdep.presentation_decision?.execution_mode || 'SYNTHESIZE';
  const profile = fdep.product_design_profile?.profile || {};
  const targetSurface = (fdep.surface_manifest?.surfaces || []).find((row) => row.surface_id === surfaceId)
    || (fdep.surface_manifest?.surfaces || [])[0]
    || null;
  const result = {
    schema_version: 1,
    strategy_version: CREATIVE_STRATEGY_VERSION,
    artifact_type: 'CreativeDirectionProfile',
    status: 'RESOLVED',
    artifact_id: `creative-direction:${fdep.task_id || 'task'}:${targetSurface?.surface_id || surfaceId || 'surface'}`,
    task_id: fdep.task_id || null,
    unit_lineage_id: fdep.unit_lineage_id || null,
    unit_revision_hash: fdep.unit_revision_hash || null,
    surface_id: targetSurface?.surface_id || surfaceId || null,
    execution_mode: mode,
    archetype_id: fdep.presentation_decision?.archetype_id || null,
    renderer_id: fdep.presentation_decision?.renderer_id || null,
    experience_intent: {
      governed_design_intent: brief?.design_intent?.text || null,
      brand_character: uniq([...(profile.brand_character || []), 'convenience-first', 'premium-but-human', 'confident-not-cluttered']),
      visual_character: uniq([...(profile.visual_character || []), 'clean-modern-composition', 'generous-breathing-room', 'restrained-typography', 'sophisticated-neutral-surfaces', 'subtle-depth']),
      interaction_character: uniq([...(profile.interaction_character || []), 'obvious-primary-action', 'thumb-friendly-mobile-targets', 'progressive-disclosure', 'purposeful-motion-only']),
    },
    immutable_anchors: {
      product_truth_superior: true,
      feature_contract_superior: true,
      surface_semantics_locked: true,
      state_matrix_owned_downstream: true,
      accessibility_required: true,
      domain_truth_required: true,
      renderer_locked: fdep.presentation_decision?.renderer_id || null,
      visual_authority_refs: (fdep.visual_reference_spec?.references || []).map((x) => ({
        reference_id: x.reference_id || x.ref || null,
        authority_level: x.authority_level || null,
        required_fidelity: x.required_fidelity || null,
      })),
    },
    creative_degrees_of_freedom: {
      composition_hierarchy: true,
      spatial_rhythm: true,
      typographic_hierarchy_within_governed_tokens: true,
      imagery_and_art_direction: true,
      card_and_container_geometry_within_design_system: true,
      depth_and_surface_treatment: true,
      iconographic_expression_within_semantics: true,
      microinteraction_character: true,
      grouping_and_progressive_disclosure: true,
      semantically_equivalent_action_placement: true,
    },
    prohibited_creativity: [
      'inventing product mechanics or business rules',
      'inventing prices, stock, fitment, vehicle, customer or operational facts',
      'adding controls with no feature-contract action',
      'displaying governance/debug/provider metadata to customers',
      'claiming verification, certification or runtime state without evidence',
      'bypassing registered tokens/components/patterns without an approved change budget',
      'copying an external reference visual identity, layout or pixel treatment into DIAL',
      'sacrificing accessibility or responsive identity for visual novelty',
    ],
    anti_generic_requirements: [
      'avoid generic AI dashboard layouts when the surface is customer commerce',
      'avoid dense interchangeable card grids without a clear focal hierarchy',
      'avoid decorative gradients, glassmorphism or 3D solely for trend imitation',
      'avoid filler helper text and fake example data',
      'avoid uniform visual weight across all sections',
      'make the screen recognizably tailored to its product purpose and DIAL identity',
    ],
    target_surface: targetSurface,
    provenance: {
      fdep_basis_hash: hashObject({
        task_id: fdep.task_id || null,
        unit_lineage_id: fdep.unit_lineage_id || null,
        unit_revision_hash: fdep.unit_revision_hash || null,
        presentation_decision: fdep.presentation_decision || null,
        product_design_profile: fdep.product_design_profile || null,
        visual_reference_spec: fdep.visual_reference_spec || null,
        target_surface: targetSurface,
      }),
      brief_hash: brief?.content_hash || null,
    },
  };
  result.content_hash = hashObject({ ...result, content_hash: null });
  return result;
}

export function buildDesignFreedomBudget({ fdep, creativeDirectionProfile } = {}) {
  if (!fdep || !creativeDirectionProfile) throw new Error('DESIGN_FREEDOM_INPUT_REQUIRED');
  const mode = fdep.presentation_decision?.execution_mode || 'SYNTHESIZE';
  const budget = {
    schema_version: 1,
    strategy_version: CREATIVE_STRATEGY_VERSION,
    artifact_type: 'DesignFreedomBudget',
    status: 'RESOLVED',
    artifact_id: `design-freedom:${creativeDirectionProfile.artifact_id}`,
    task_id: fdep.task_id || null,
    surface_id: creativeDirectionProfile.surface_id,
    execution_mode: mode,
    freedom_level: freedomLevel(mode),
    provider_creative_range: creativeRangeForMode(mode),
    candidate_count: mode === 'RECONSTRUCT' ? 2 : 3,
    dimensions: {
      layout_structure: mode === 'RECONSTRUCT' ? 0.20 : 0.80,
      visual_hierarchy: mode === 'RECONSTRUCT' ? 0.25 : 0.90,
      spacing_rhythm: mode === 'RECONSTRUCT' ? 0.25 : 0.85,
      typography_expression: mode === 'RECONSTRUCT' ? 0.20 : 0.70,
      surface_depth: mode === 'RECONSTRUCT' ? 0.15 : 0.70,
      imagery_art_direction: mode === 'RECONSTRUCT' ? 0.15 : 0.90,
      iconography: mode === 'RECONSTRUCT' ? 0.15 : 0.60,
      motion_concept: mode === 'RECONSTRUCT' ? 0.10 : 0.50,
      product_semantics: 0,
      business_rules: 0,
      data_truth: 0,
      security_constraints: 0,
    },
    hard_limits: {
      new_product_capabilities: 0,
      fabricated_domain_values: 0,
      inaccessible_primary_actions: 0,
      unapproved_authority_override: 0,
      reverse_authority_flow: 0,
    },
    convergence_policy: {
      minimum_distinct_candidates: mode === 'RECONSTRUCT' ? 2 : 3,
      retain_provider_lineage: true,
      require_hard_gate_pass_before_scoring: true,
      require_visual_critic_evidence_for_final_selection: true,
      deterministic_tie_break: 'LEXICAL_CANDIDATE_ID',
    },
    provenance: {
      creative_direction_hash: creativeDirectionProfile.content_hash,
      change_budget_hash: fdep.change_budget?.content_hash || null,
    },
  };
  budget.content_hash = hashObject({ ...budget, content_hash: null });
  return budget;
}

export function buildCreativeExplorationPlan({ creativeDirectionProfile, designFreedomBudget } = {}) {
  if (!creativeDirectionProfile || !designFreedomBudget) throw new Error('CREATIVE_EXPLORATION_INPUT_REQUIRED');
  const count = designFreedomBudget.candidate_count;
  const candidates = DEFAULT_LENSES.slice(0, count).map((lens, index) => ({
    ...lens,
    ordinal: index + 1,
    phase: 'EXPLORE',
    preserve: ['all immutable anchors', 'all product-facing semantics', 'all accessibility and responsive constraints', 'all zero-fabrication rules'],
    vary: lens.differentiators,
  }));
  const result = {
    schema_version: 1,
    strategy_version: CREATIVE_STRATEGY_VERSION,
    artifact_type: 'CreativeExplorationPlan',
    status: 'RESOLVED',
    artifact_id: `creative-exploration:${creativeDirectionProfile.artifact_id}`,
    phases: ['EXPLORE', 'CONVERGE'],
    surface_id: creativeDirectionProfile.surface_id,
    provider_variant_options: {
      aspects: ['LAYOUT', 'COLOR_SCHEME', 'IMAGES', 'TEXT_FONT'],
      creativeRange: designFreedomBudget.provider_creative_range,
      variantCount: count,
    },
    candidates,
    convergence: {
      instruction: 'Select the strongest governed direction using critic evidence, then refine it without averaging away its distinctive strengths.',
      preserve_distinctiveness: true,
      forbid_median_design_regression: true,
    },
    provenance: {
      creative_direction_hash: creativeDirectionProfile.content_hash,
      freedom_budget_hash: designFreedomBudget.content_hash,
    },
  };
  result.content_hash = hashObject({ ...result, content_hash: null });
  return result;
}

export function buildCreativeScreenGenerationStrategy({ fdep, brief, surfaceId = null } = {}) {
  const creative_direction_profile = buildCreativeDirectionProfile({ fdep, brief, surfaceId });
  const design_freedom_budget = buildDesignFreedomBudget({ fdep, creativeDirectionProfile: creative_direction_profile });
  const exploration_plan = buildCreativeExplorationPlan({ creativeDirectionProfile: creative_direction_profile, designFreedomBudget: design_freedom_budget });
  const result = {
    schema_version: 1,
    strategy_version: CREATIVE_STRATEGY_VERSION,
    artifact_type: 'CreativeScreenGenerationStrategy',
    status: 'READY',
    artifact_id: `creative-strategy:${fdep?.task_id || 'task'}:${creative_direction_profile.surface_id || 'surface'}`,
    phase_contract: {
      EXPLORE: 'Generate meaningfully distinct visual directions inside the freedom budget.',
      CONVERGE: 'Use critic evidence and hard gates to select/refine the strongest direction.',
      RECONSTRUCT: 'When canonical visual authority exists, creativity is bounded to fidelity-preserving refinement.',
    },
    creative_direction_profile,
    design_freedom_budget,
    exploration_plan,
    authority_constraints: {
      provider_output_authoritative: false,
      owner_or_authorized_design_authority_required_for_promotion: true,
      project_truth_superior: true,
      feature_contract_superior: true,
    },
    provenance: {
      creative_direction_hash: creative_direction_profile.content_hash,
      freedom_budget_hash: design_freedom_budget.content_hash,
      exploration_plan_hash: exploration_plan.content_hash,
    },
  };
  result.content_hash = hashObject({ ...result, content_hash: null });
  return result;
}

export const CREATIVE_CRITIC_DIMENSIONS = Object.freeze([
  'semantic_fidelity',
  'brand_identity',
  'visual_hierarchy',
  'professional_polish',
  'distinctiveness',
  'accessibility',
  'responsive_viability',
  'implementation_feasibility',
  'anti_pattern_compliance',
  'visual_authority_fidelity',
]);

const CRITIC_WEIGHTS = Object.freeze({
  semantic_fidelity: 0.16,
  brand_identity: 0.12,
  visual_hierarchy: 0.12,
  professional_polish: 0.13,
  distinctiveness: 0.10,
  accessibility: 0.10,
  responsive_viability: 0.08,
  implementation_feasibility: 0.07,
  anti_pattern_compliance: 0.06,
  visual_authority_fidelity: 0.06,
});

export function evaluateCreativeCandidate({ candidate_id, metrics = {}, hard_gates = {} } = {}) {
  if (!candidate_id) throw new Error('CREATIVE_CANDIDATE_ID_REQUIRED');
  const missing = CREATIVE_CRITIC_DIMENSIONS.filter((key) => !Number.isFinite(Number(metrics[key])));
  if (missing.length) return { candidate_id, eligible: false, reason: 'CRITIC_EVIDENCE_INCOMPLETE', missing };
  const failedHardGates = Object.entries(hard_gates).filter(([, value]) => value !== true).map(([key]) => key).sort();
  if (failedHardGates.length) return { candidate_id, eligible: false, reason: 'HARD_GATE_FAILED', failed_hard_gates: failedHardGates };
  const normalized = Object.fromEntries(CREATIVE_CRITIC_DIMENSIONS.map((key) => [key, clamp01(metrics[key])]));
  const weighted_score = Number(CREATIVE_CRITIC_DIMENSIONS.reduce((sum, key) => sum + normalized[key] * CRITIC_WEIGHTS[key], 0).toFixed(8));
  const qualityFloor = Math.min(normalized.semantic_fidelity, normalized.accessibility, normalized.responsive_viability, normalized.anti_pattern_compliance);
  return {
    candidate_id,
    eligible: qualityFloor >= 0.70,
    reason: qualityFloor >= 0.70 ? 'ELIGIBLE' : 'QUALITY_FLOOR_FAILED',
    weighted_score,
    quality_floor: Number(qualityFloor.toFixed(8)),
    metrics: normalized,
  };
}

export function selectCreativeCandidate({ evaluations = [] } = {}) {
  const eligible = evaluations.filter((x) => x?.eligible === true);
  if (!eligible.length) return { selected: null, status: 'NO_ELIGIBLE_CANDIDATE', evaluations };
  eligible.sort((a, b) => b.weighted_score - a.weighted_score || b.quality_floor - a.quality_floor || a.candidate_id.localeCompare(b.candidate_id));
  const selected = eligible[0];
  const result = {
    status: 'SELECTED_FOR_CONVERGENCE',
    selected: selected.candidate_id,
    selected_score: selected.weighted_score,
    selected_quality_floor: selected.quality_floor,
    ranked: eligible.map((x) => ({
      candidate_id: x.candidate_id,
      weighted_score: x.weighted_score,
      quality_floor: x.quality_floor,
    })),
    rejected: evaluations.filter((x) => x?.eligible !== true).map((x) => ({
      candidate_id: x?.candidate_id || null,
      reason: x?.reason || 'UNKNOWN',
    })),
  };
  result.content_hash = hashObject({ ...result, content_hash: null });
  return result;
}
