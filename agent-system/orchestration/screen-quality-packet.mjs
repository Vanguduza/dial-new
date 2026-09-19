#!/usr/bin/env node
// Screen Quality Packet — the machine-readable brief a guided generation run
// receives (Rev 3.1 §6.6).
//
// The packet exists to make one thing structural rather than hoped for: Product
// Truth is identical across every candidate, and the only things a design model
// is free to vary are the ones the freedom budget names. `buildScreenQualityPacket`
// therefore refuses to build a packet whose freedom budget grants latitude over
// business semantics, instead of relying on prompt wording to discourage it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashObject } from './knowledge-graph-core.mjs';
import { DESIGN_ITERATION_PHASES, DESIGN_PROVENANCE_MODES, loadDesignAntiPatterns } from './design-authority-projector.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO = path.resolve(here, '../..');

export const FREEDOM_LEVELS = Object.freeze(['none', 'low', 'medium', 'high']);

// Dimensions that carry meaning rather than appearance. No phase, provider or
// packet may grant freedom over these; the ceiling is `none`, always.
export const SEMANTIC_DIMENSIONS = Object.freeze(['navigation_semantics', 'business_logic', 'money_behavior', 'security_behavior', 'donor_semantics']);

// Per-phase ceilings. Creativity decreases EXPLORE → CONVERGE → RECONSTRUCT
// (Principle 7); this table is that principle made enforceable.
export const PHASE_FREEDOM_CEILINGS = Object.freeze({
  EXPLORE: { composition: 'high', spacing: 'high', typography: 'medium', surface_strategy: 'high', illustration: 'high', information_architecture: 'low' },
  CONVERGE: { composition: 'low', spacing: 'medium', typography: 'low', surface_strategy: 'medium', illustration: 'medium', information_architecture: 'none' },
  RECONSTRUCT: { composition: 'none', spacing: 'low', typography: 'none', surface_strategy: 'none', illustration: 'none', information_architecture: 'none' },
});

export const CRITICS = Object.freeze(['product', 'donor', 'ux', 'visual', 'accessibility', 'responsive', 'implementation']);

export const DEFAULT_DIVERSITY_DIMENSIONS = Object.freeze(['section_composition', 'imagery_position', 'surface_strategy', 'primary_action_emphasis']);

const rank = (level) => FREEDOM_LEVELS.indexOf(level);

export function buildDesignFreedomBudget({ phase, requested = {} } = {}) {
  if (!DESIGN_ITERATION_PHASES.includes(phase)) throw new Error(`unknown design iteration phase: ${phase}`);
  const ceilings = PHASE_FREEDOM_CEILINGS[phase];
  const failures = [];
  const budget = {};
  for (const dimension of SEMANTIC_DIMENSIONS) {
    const asked = requested[dimension];
    if (asked !== undefined && asked !== 'none') failures.push(`SEMANTIC_FREEDOM_FORBIDDEN:${dimension}`);
    budget[dimension] = 'none';
  }
  for (const [dimension, ceiling] of Object.entries(ceilings)) {
    const asked = requested[dimension] ?? ceiling;
    if (!FREEDOM_LEVELS.includes(asked)) { failures.push(`UNKNOWN_FREEDOM_LEVEL:${dimension}:${asked}`); continue; }
    if (rank(asked) > rank(ceiling)) { failures.push(`FREEDOM_EXCEEDS_PHASE_CEILING:${dimension}:${asked}>${ceiling}`); continue; }
    budget[dimension] = asked;
  }
  for (const dimension of Object.keys(requested)) {
    if (!(dimension in budget)) failures.push(`UNKNOWN_FREEDOM_DIMENSION:${dimension}`);
  }
  const ordered = Object.fromEntries(Object.keys(budget).sort().map((k) => [k, budget[k]]));
  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)].sort(),
    budget: ordered,
    budget_hash: hashObject({ phase, budget: ordered }),
  };
}

const PRODUCT_TRUTH_FIELDS = Object.freeze([
  'feature_ids', 'unit_lineage_id', 'unit_revision_hash', 'user_goal', 'required_actions', 'required_states',
  'data_semantics', 'navigation_semantics', 'business_rules', 'security_constraints', 'legal_constraints', 'donor_constraints',
]);

export function buildProductTruthPacket(input = {}) {
  const failures = [];
  const packet = { schema_version: 1 };
  for (const field of PRODUCT_TRUTH_FIELDS) {
    const value = input[field];
    if (field === 'unit_lineage_id' || field === 'unit_revision_hash' || field === 'user_goal') {
      if (!value) failures.push(`PRODUCT_TRUTH_FIELD_REQUIRED:${field}`);
      packet[field] = value ?? null;
      continue;
    }
    if (field === 'feature_ids' || field === 'required_actions' || field === 'required_states') {
      if (!Array.isArray(value) || !value.length) failures.push(`PRODUCT_TRUTH_FIELD_REQUIRED:${field}`);
      packet[field] = [...(value || [])].map(String).sort();
      continue;
    }
    packet[field] = Array.isArray(value) ? [...value].map(String).sort() : (value ?? []);
  }
  return {
    ok: failures.length === 0,
    failures: failures.sort(),
    // Product Truth is not editable by the design model: it is frozen and hashed
    // here, and every candidate is checked against this exact hash.
    product_truth: Object.freeze({ ...packet, product_truth_hash: hashObject(packet) }),
  };
}

export function buildScreenQualityPacket({
  repoDir = DEFAULT_REPO,
  productTruth,
  authority = {},
  intent = {},
  designProvenanceMode,
  designIterationPhase,
  designGrammar = {},
  creativeDirection = [],
  requestedFreedom = {},
  references = {},
  candidateCount = 3,
  diversityDimensions = DEFAULT_DIVERSITY_DIMENSIONS,
  critics = CRITICS,
} = {}) {
  const failures = [];
  if (!DESIGN_PROVENANCE_MODES.includes(designProvenanceMode)) failures.push(`UNKNOWN_PROVENANCE_MODE:${designProvenanceMode}`);
  if (!DESIGN_ITERATION_PHASES.includes(designIterationPhase)) failures.push(`UNKNOWN_ITERATION_PHASE:${designIterationPhase}`);
  if (!productTruth?.product_truth_hash) failures.push('PRODUCT_TRUTH_REQUIRED');
  if (!authority.design_authority_projection_hash) failures.push('DESIGN_AUTHORITY_PROJECTION_HASH_REQUIRED');

  // §6.8: EXPLORE must produce 2–4 materially different candidates; the later
  // phases converge on one, so more than one artefact there is a contradiction.
  if (designIterationPhase === 'EXPLORE' && (candidateCount < 2 || candidateCount > 4)) {
    failures.push(`EXPLORE_CANDIDATE_COUNT_OUT_OF_RANGE:${candidateCount}`);
  }
  if (designIterationPhase !== 'EXPLORE' && candidateCount !== 1) {
    failures.push(`${designIterationPhase}_REQUIRES_SINGLE_CANDIDATE`);
  }
  const unknownCritics = critics.filter((c) => !CRITICS.includes(c));
  if (unknownCritics.length) failures.push(`UNKNOWN_CRITICS:${unknownCritics.sort().join(',')}`);
  const missingCritics = ['product', 'visual', 'accessibility', 'implementation'].filter((c) => !critics.includes(c));
  if (missingCritics.length) failures.push(`MANDATORY_CRITIC_MISSING:${missingCritics.join(',')}`);
  if (['DONOR_ADAPT', 'DONOR_PRESERVE'].includes(designProvenanceMode) && !critics.includes('donor')) {
    failures.push('DONOR_CRITIC_REQUIRED_FOR_DONOR_MODE');
  }
  const badDiversity = diversityDimensions.filter((d) => SEMANTIC_DIMENSIONS.includes(d));
  if (badDiversity.length) failures.push(`DIVERSITY_OVER_SEMANTICS_FORBIDDEN:${badDiversity.sort().join(',')}`);

  const freedom = DESIGN_ITERATION_PHASES.includes(designIterationPhase)
    ? buildDesignFreedomBudget({ phase: designIterationPhase, requested: requestedFreedom })
    : { ok: false, failures: ['UNKNOWN_ITERATION_PHASE'], budget: {}, budget_hash: null };
  if (!freedom.ok) failures.push(...freedom.failures);

  if (failures.length) return { ok: false, failures: [...new Set(failures)].sort(), packet: null };

  const antiPatterns = loadDesignAntiPatterns(repoDir);
  const base = {
    schema_version: 1,
    authority: {
      unit_lineage_id: productTruth.unit_lineage_id,
      unit_revision_hash: productTruth.unit_revision_hash,
      product_truth_hash: productTruth.product_truth_hash,
      design_authority_projection_hash: authority.design_authority_projection_hash,
      frontend_design_execution_packet_hash: authority.frontend_design_execution_packet_hash ?? null,
      design_brief_bundle_hash: authority.design_brief_bundle_hash ?? null,
    },
    intent: {
      screen_type: intent.screen_type ?? null,
      user_goal: productTruth.user_goal,
      primary_task: intent.primary_task ?? null,
      hierarchy: {
        primary: [...(intent.hierarchy?.primary || [])],
        secondary: [...(intent.hierarchy?.secondary || [])],
        tertiary: [...(intent.hierarchy?.tertiary || [])],
      },
    },
    design_state: {
      design_provenance_mode: designProvenanceMode,
      design_iteration_phase: designIterationPhase,
    },
    design_grammar: { ...designGrammar },
    creative_direction: { personality: [...creativeDirection].sort() },
    design_freedom: freedom.budget,
    design_freedom_hash: freedom.budget_hash,
    references: {
      golden_screens: [...(references.golden_screens || [])].sort(),
      archetypes: [...(references.archetypes || [])].sort(),
      donor_visual_authority: [...(references.donor_visual_authority || [])].sort(),
      inspirational_refs: [...(references.inspirational_refs || [])].sort(),
    },
    prohibited_patterns: [...antiPatterns.enforced_baseline, ...antiPatterns.guided_additional],
    anti_pattern_registry_version: antiPatterns.registry_version,
    candidate_policy: {
      count: candidateCount,
      diversity_dimensions: [...diversityDimensions].sort(),
    },
    critics: [...critics].sort(),
    acceptance: {
      product_correctness: 'required',
      donor_semantics: ['DONOR_ADAPT', 'DONOR_PRESERVE'].includes(designProvenanceMode) ? 'required' : 'required_when_applicable',
      visual_quality: 'required',
      accessibility: 'required',
      responsive_realism: 'required',
      implementation_feasibility: 'required',
    },
  };
  return { ok: true, failures: [], packet: { ...base, packet_hash: hashObject(base) } };
}

// Every candidate in a run must have been generated against the same Product
// Truth. This is the check that catches a provider quietly re-briefed mid-run.
export function assertProductTruthInvariant(packets = []) {
  const hashes = [...new Set(packets.map((p) => p?.authority?.product_truth_hash))];
  return {
    ok: hashes.length === 1 && Boolean(hashes[0]),
    product_truth_hash: hashes[0] ?? null,
    distinct_hashes: hashes.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify({ phases: DESIGN_ITERATION_PHASES, ceilings: PHASE_FREEDOM_CEILINGS, critics: CRITICS }, null, 2));
}
