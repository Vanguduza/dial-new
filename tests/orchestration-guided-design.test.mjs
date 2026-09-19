// Workstream B — guided generative frontend evolution.
//
// The certification exercise at the bottom runs a real Dial a Spare Android home
// screen end to end (EXPLORE → CONVERGE → freeze → RECONSTRUCT → parity) against
// the live FEATURE_REGISTRY and FRONTEND_COMPONENT_REGISTRY, because §17.2 asks
// for a real screen rather than a synthetic fixture.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DESIGN_ITERATION_PHASES, DESIGN_PROVENANCE_MODES, ENFORCED_BASELINE_PATTERNS,
  loadDesignAntiPatterns, projectDesignAuthority, renderDesignMarkdown,
} from '../agent-system/orchestration/design-authority-projector.mjs';
import { admitDesignCandidate, buildDesignCandidateManifest, quarantineDesignArtifact } from '../agent-system/orchestration/design-candidate-admission.mjs';
import { evaluateProviderEligibility, routeGuidedCandidateGeneration, selectDesignStrategy } from '../agent-system/orchestration/design-provider-router.mjs';
import {
  PHASE_FREEDOM_CEILINGS, SEMANTIC_DIMENSIONS, assertProductTruthInvariant,
  buildDesignFreedomBudget, buildProductTruthPacket, buildScreenQualityPacket,
} from '../agent-system/orchestration/screen-quality-packet.mjs';
import { mergeCriticReports, runCritics } from '../agent-system/orchestration/design-critics.mjs';
import {
  buildConvergencePacket, buildGoldenScreenDescriptor, buildSynthesisManifest,
  evaluateCandidateDiversity, filterLearnableEvidence, freezeVisualAuthority, verifyReconstructionParity,
} from '../agent-system/orchestration/design-convergence.mjs';

const repoDir = process.cwd();
const load = (rel) => JSON.parse(fs.readFileSync(path.join(repoDir, rel), 'utf8'));
const componentIds = load('agent-system/registries/FRONTEND_COMPONENT_REGISTRY.json').components.map((c) => c.component_id);
const spareFeature = load('agent-system/registries/FEATURE_REGISTRY.json').find((f) => f.feature_id === 'SPARE-F002');

const unitMap = {
  unit_lineage_id: 'U-SPARE-HOME',
  unit_revision_hash: 'rev-spare-home',
  product_experience_map: { applicable: true, knowledge_hash: 'pxk-spare-home', design_authorities: ['SPARE_HOME_AUTHORITY'] },
};

const productTruth = buildProductTruthPacket({
  feature_ids: ['SPARE-F001', 'SPARE-F002'],
  unit_lineage_id: unitMap.unit_lineage_id,
  unit_revision_hash: unitMap.unit_revision_hash,
  user_goal: 'select my vehicle and find a part that fits it',
  required_actions: ['SELECT_VEHICLE', 'SEARCH_PART', 'BROWSE_CATEGORY', 'OPEN_GARAGE'],
  required_states: ['LOADING', 'EMPTY', 'ERROR', 'RESULTS', 'NO_VEHICLE_SELECTED'],
  data_semantics: ['FITMENT_CONFIDENCE_IS_NOT_A_GUARANTEE'],
  navigation_semantics: ['GARAGE_IS_PERSISTENT', 'SEARCH_IS_PRIMARY'],
  business_rules: ['PRICE_COMES_FROM_PRICING_SERVICE'],
  security_constraints: ['NO_RAW_SUPPLIER_IDS_IN_UI'],
  donor_constraints: [],
}).product_truth;

function baseDeclared(overrides = {}) {
  return {
    actions: ['SELECT_VEHICLE', 'SEARCH_PART', 'BROWSE_CATEGORY', 'OPEN_GARAGE'],
    states: ['LOADING', 'EMPTY', 'ERROR', 'RESULTS', 'NO_VEHICLE_SELECTED'],
    displayed_values: [{ label: 'fitment confidence', source: 'FITMENT_SERVICE' }],
    primary_task: 'SEARCH_PART',
    emphasis: [{ level: 'primary', element: 'search' }],
    controls: [
      { label: 'Search parts', action: 'SEARCH_PART' },
      { label: 'My garage', destination: 'GARAGE' },
    ],
    navigation: [{ destination: 'GARAGE' }, { destination: 'CATEGORIES' }],
    contrast_pairs: [{ role: 'body', ratio: 8.2 }, { role: 'display', ratio: 4.1, large_text: true }],
    touch_targets: [{ label: 'Search parts', min_dp: 56 }, { label: 'My garage', min_dp: 48 }],
    focus_order_defined: true,
    state_differentiation: 'COLOR_AND_SHAPE',
    breakpoints: [
      { name: 'compact', overflow: false, hierarchy_preserved: true },
      { name: 'medium', overflow: false, hierarchy_preserved: true },
    ],
    sections_count: 4,
    estimated_height_ratio: 1.8,
    hero: { carries_primary_task: true },
    card_nesting_depth: 2,
    radii_used: ['12dp'],
    radius_scale: ['4dp', '12dp', '24dp'],
    icon_weights: ['regular'],
    components: ['dial.action.primary', 'dial.surface.card', 'dial.navigation.top', 'dial.state.panel'],
    data_bindings: [{ field: 'fitment_confidence', bindable: true }],
    animation_cost: 'LOW',
    fixed: {
      product_truth: productTruth.product_truth_hash,
      required_content: ['SEARCH', 'GARAGE', 'CATEGORIES'],
      navigation_semantics: ['GARAGE_IS_PERSISTENT', 'SEARCH_IS_PRIMARY'],
      external_reference_constraints: [],
      money_behavior: 'PRICING_SERVICE',
      security_behavior: 'NO_RAW_SUPPLIER_IDS_IN_UI',
    },
    ...overrides,
  };
}

function candidate(id, variation, overrides = {}) {
  return {
    candidate_id: id,
    candidate_hash: `${id}-hash`,
    product_truth_hash: productTruth.product_truth_hash,
    declared: baseDeclared({ variation, ...overrides }),
  };
}

const exploreProjection = projectDesignAuthority({ unitMap, designMode: 'NEW_DIAL_DESIGN', designIterationPhase: 'EXPLORE', repoDir });

function explorePacket(overrides = {}) {
  return buildScreenQualityPacket({
    repoDir,
    productTruth,
    authority: { design_authority_projection_hash: exploreProjection.projection_hash },
    designProvenanceMode: 'NEW_DIAL_DESIGN',
    designIterationPhase: 'EXPLORE',
    candidateCount: 3,
    intent: { screen_type: 'HOME', primary_task: 'SEARCH_PART', hierarchy: { primary: ['search'], secondary: ['garage'], tertiary: ['categories'] } },
    creativeDirection: ['premium', 'precise', 'trustworthy', 'modern'],
    ...overrides,
  });
}

describe('provenance mode and iteration phase are separate axes', () => {
  it('lets reference-inspired DIAL-native provenance and EXPLORE both be true', () => {
    const p = projectDesignAuthority({ unitMap, designMode: 'REFERENCE_INSPIRED_DIAL_NATIVE', designIterationPhase: 'EXPLORE', repoDir });
    expect(p.design_provenance_mode).toBe('REFERENCE_INSPIRED_DIAL_NATIVE');
    expect(p.design_iteration_phase).toBe('EXPLORE');
    expect(p.design_mode).toBe('REFERENCE_INSPIRED_DIAL_NATIVE');
  });

  it('keeps the two vocabularies disjoint and refuses a value from the wrong axis', () => {
    for (const mode of DESIGN_PROVENANCE_MODES) expect(DESIGN_ITERATION_PHASES).not.toContain(mode);
    expect(() => projectDesignAuthority({ unitMap, designMode: 'CONVERGE', repoDir })).toThrow(/unknown design provenance mode/);
    expect(() => projectDesignAuthority({ unitMap, designIterationPhase: 'REFERENCE_INSPIRED_DIAL_NATIVE', repoDir })).toThrow(/unknown design iteration phase/);
  });

  it('canonicalizes legacy donor modes into reference-inspired DIAL-native provenance', () => {
    const legacy = projectDesignAuthority({ unitMap, designMode: 'DONOR_PRESERVE', repoDir });
    expect(Object.keys(legacy)).not.toContain('design_iteration_phase');
    expect(legacy.design_mode).toBe('REFERENCE_INSPIRED_DIAL_NATIVE');
    expect(legacy.legacy_design_mode_input).toBe('DONOR_PRESERVE');
    expect(legacy.prohibited_patterns).toEqual([...ENFORCED_BASELINE_PATTERNS]);
    expect(renderDesignMarkdown(legacy)).not.toMatch(/Iteration phase/);
  });
});

describe('existing design authority remains intact', () => {
  it('keeps every existing prohibited pattern enforced', () => {
    const registry = loadDesignAntiPatterns(repoDir);
    for (const pattern of ENFORCED_BASELINE_PATTERNS) expect(registry.enforced_baseline).toContain(pattern);
    expect(registry.guided_additional).toEqual(expect.arrayContaining(['EXCESSIVE_CARD_NESTING', 'ARBITRARY_GRADIENTS', 'INVENTED_METRICS']));
  });

  it('still quarantines hostile provider output', () => {
    const q = quarantineDesignArtifact({ content: '<div onclick="x()"><iframe src="https://evil.example"></iframe></div>' });
    expect(q.ok).toBe(false);
    expect(q.violations).toEqual(expect.arrayContaining(['EVENT_HANDLER', 'IFRAME', 'REMOTE_URL']));
  });

  it('has no direct external-repository port strategy', () => {
    expect(selectDesignStrategy({ designMode: 'NEW_DIAL_DESIGN' }).selected).toBe('DIRECT_DIAL_IMPLEMENTATION');
    const ref = selectDesignStrategy({ designMode: 'REFERENCE_INSPIRED_DIAL_NATIVE' });
    expect(ref.selected).toBe('DIRECT_DIAL_IMPLEMENTATION');
    expect(ref.candidates).not.toContain('DIRECT_DONOR_PORT_AND_TRANSFORM');
    expect(selectDesignStrategy({ designMode: 'NEW_DIAL_DESIGN', directWorkerEligible: false })).toEqual({ ok: false, reason: 'NO_ELIGIBLE_DESIGN_STRATEGY' });
  });
});

describe('design freedom budget', () => {
  it('refuses freedom over any semantic dimension in any phase', () => {
    for (const phase of DESIGN_ITERATION_PHASES) {
      for (const dimension of SEMANTIC_DIMENSIONS) {
        const result = buildDesignFreedomBudget({ phase, requested: { [dimension]: 'low' } });
        expect(result.ok).toBe(false);
        expect(result.failures).toContain(`SEMANTIC_FREEDOM_FORBIDDEN:${dimension}`);
      }
    }
  });

  it('pins semantic dimensions to none even when not requested', () => {
    const budget = buildDesignFreedomBudget({ phase: 'EXPLORE' }).budget;
    for (const dimension of SEMANTIC_DIMENSIONS) expect(budget[dimension]).toBe('none');
  });

  it('decreases strictly from EXPLORE to RECONSTRUCT', () => {
    const levels = ['none', 'low', 'medium', 'high'];
    const score = (phase) => Object.values(PHASE_FREEDOM_CEILINGS[phase]).reduce((s, v) => s + levels.indexOf(v), 0);
    expect(score('EXPLORE')).toBeGreaterThan(score('CONVERGE'));
    expect(score('CONVERGE')).toBeGreaterThan(score('RECONSTRUCT'));
  });

  it('refuses a request above the phase ceiling or over an unknown dimension', () => {
    expect(buildDesignFreedomBudget({ phase: 'CONVERGE', requested: { composition: 'high' } }).failures)
      .toContain('FREEDOM_EXCEEDS_PHASE_CEILING:composition:high>low');
    expect(buildDesignFreedomBudget({ phase: 'EXPLORE', requested: { vibes: 'high' } }).failures)
      .toContain('UNKNOWN_FREEDOM_DIMENSION:vibes');
  });
});

describe('screen quality packet', () => {
  it('builds a packet with frozen Product Truth and the full critic set', () => {
    const packet = explorePacket();
    expect(packet.ok).toBe(true);
    expect(packet.packet.authority.product_truth_hash).toBe(productTruth.product_truth_hash);
    expect(packet.packet.critics).toEqual(['accessibility', 'external_reference', 'implementation', 'product', 'responsive', 'ux', 'visual']);
    expect(packet.packet.prohibited_patterns).toEqual(expect.arrayContaining([...ENFORCED_BASELINE_PATTERNS]));
  });

  it('requires 2-4 candidates in EXPLORE and exactly one afterwards', () => {
    expect(explorePacket({ candidateCount: 1 }).failures).toContain('EXPLORE_CANDIDATE_COUNT_OUT_OF_RANGE:1');
    expect(explorePacket({ candidateCount: 5 }).failures).toContain('EXPLORE_CANDIDATE_COUNT_OUT_OF_RANGE:5');
    expect(explorePacket({ designIterationPhase: 'CONVERGE', candidateCount: 3 }).failures).toContain('CONVERGE_REQUIRES_SINGLE_CANDIDATE');
  });

  it('requires the external-reference critic for reference-inspired provenance', () => {
    const result = explorePacket({ designProvenanceMode: 'REFERENCE_INSPIRED_DIAL_NATIVE', critics: ['product', 'visual', 'accessibility', 'implementation'] });
    expect(result.failures).toContain('EXTERNAL_REFERENCE_CRITIC_REQUIRED');
  });

  it('refuses a packet missing a mandatory critic or Product Truth', () => {
    expect(explorePacket({ critics: ['visual'] }).failures[0]).toMatch(/MANDATORY_CRITIC_MISSING/);
    expect(explorePacket({ productTruth: {} }).failures).toContain('PRODUCT_TRUTH_REQUIRED');
  });

  it('holds Product Truth identical across every candidate in a run', () => {
    const packet = explorePacket().packet;
    expect(assertProductTruthInvariant([packet, packet, packet]).ok).toBe(true);
    const reBriefed = { ...packet, authority: { ...packet.authority, product_truth_hash: 'other' } };
    expect(assertProductTruthInvariant([packet, reBriefed]).ok).toBe(false);
  });
});

describe('critics reject what conformance alone would pass', () => {
  const packet = explorePacket().packet;
  const critique = (c) => runCritics({ candidate: c, productTruth, packet, repoDir, componentRegistryIds: componentIds });

  it('passes a conforming candidate', () => {
    const evidence = critique(candidate('DESIGN-a', { section_composition: 'hero-first' }));
    expect(evidence.verdict, JSON.stringify(evidence.blocking_findings)).toBe('PASS');
  });

  it.each([
    ['an invented capability', { actions: ['SELECT_VEHICLE', 'SEARCH_PART', 'BROWSE_CATEGORY', 'OPEN_GARAGE', 'APPLY_FOR_CREDIT'] }, 'INVENTED_CAPABILITY:APPLY_FOR_CREDIT'],
    ['a missing required action', { actions: ['SEARCH_PART'] }, 'REQUIRED_ACTION_MISSING:SELECT_VEHICLE'],
    ['a missing required state', { states: ['LOADING'] }, 'REQUIRED_STATE_MISSING:ERROR'],
    ['a fabricated metric', { displayed_values: [{ label: 'parts sold today', source: 'INVENTED' }] }, 'INVENTED_METRICS:parts sold today'],
    ['a value with no source', { displayed_values: [{ label: 'rating' }] }, 'FAKE_DATA:rating'],
    ['a dead control', { controls: [{ label: 'Compare' }] }, 'DEAD_CONTROLS:Compare'],
    ['an unbindable field', { data_bindings: [{ field: 'invented_score', bindable: false }] }, 'UNBINDABLE_DATA:invented_score'],
    ['insufficient contrast', { contrast_pairs: [{ role: 'body', ratio: 3.2 }] }, 'CONTRAST_BELOW_MINIMUM:body'],
    ['a small touch target', { touch_targets: [{ label: 'Garage', min_dp: 32 }] }, 'TARGET_TOO_SMALL:Garage'],
    ['no focus order', { focus_order_defined: false }, 'FOCUS_ORDER_UNDEFINED'],
    ['overflow at a breakpoint', { breakpoints: [{ name: 'compact', overflow: true }] }, 'OVERFLOW_AT:compact'],
  ])('rejects %s', (_label, breach, expectedFinding) => {
    const evidence = critique(candidate('DESIGN-bad', { section_composition: 'x' }, breach));
    expect(evidence.verdict).toBe('REJECT');
    expect(evidence.blocking_findings.map((f) => f.finding_id)).toContain(expectedFinding);
  });

  it('flags visual degradation on a functionally correct screen', () => {
    const evidence = critique(candidate('DESIGN-ugly', { section_composition: 'x' }, {
      card_nesting_depth: 5, radii_used: ['3dp', '7dp'], icon_weights: ['regular', 'bold'],
      hero: { carries_primary_task: false }, emphasis: [{ level: 'primary' }, { level: 'primary' }],
      navigation: [{ destination: 'GARAGE' }, { destination: 'GARAGE' }],
      anti_patterns_present: ['ARBITRARY_GRADIENTS'],
    }));
    // Nothing product-incorrect here: it is correct and visually degraded.
    expect(evidence.verdict).toBe('REVISE');
    const ids = evidence.reports.flatMap((r) => r.findings.map((f) => f.finding_id));
    expect(ids).toEqual(expect.arrayContaining([
      'EXCESSIVE_CARD_NESTING', 'INCONSISTENT_RADII', 'INCONSISTENT_ICON_WEIGHT',
      'MEANINGLESS_HERO', 'VISUAL_CLUTTER', 'DUPLICATED_NAVIGATION:GARAGE', 'ARBITRARY_GRADIENTS',
    ]));
  });

  it('rejects a candidate generated against a different Product Truth', () => {
    const drifted = { ...candidate('DESIGN-drift', { section_composition: 'x' }), product_truth_hash: 'someone-elses-truth' };
    expect(critique(drifted).blocking_findings.map((f) => f.finding_id)).toContain('PRODUCT_TRUTH_DRIFT');
  });

  it('rejects a candidate that declares no structure at all', () => {
    const evidence = critique({ candidate_id: 'DESIGN-opaque' });
    expect(evidence.blocking_findings.map((f) => f.finding_id)).toContain('CANDIDATE_STRUCTURE_UNDECLARED');
  });

  it('enforces external repositories as non-authoritative inspiration only', () => {
    const refPacket = buildScreenQualityPacket({
      repoDir, productTruth: buildProductTruthPacket({
        feature_ids: ['SPARE-F002'], unit_lineage_id: 'U', unit_revision_hash: 'r', user_goal: 'g',
        required_actions: ['SEARCH_PART'], required_states: ['RESULTS'], external_reference_constraints: ['NO_EXTERNAL_IMPLEMENTATION_REUSE'],
      }).product_truth,
      authority: { design_authority_projection_hash: exploreProjection.projection_hash },
      designProvenanceMode: 'REFERENCE_INSPIRED_DIAL_NATIVE', designIterationPhase: 'EXPLORE', candidateCount: 2,
    }).packet;
    const truth2 = buildProductTruthPacket({
      feature_ids: ['SPARE-F002'], unit_lineage_id: 'U', unit_revision_hash: 'r', user_goal: 'g',
      required_actions: ['SEARCH_PART'], required_states: ['RESULTS'], external_reference_constraints: ['NO_EXTERNAL_IMPLEMENTATION_REUSE'],
    }).product_truth;
    const violating = {
      candidate_id: 'DESIGN-reference', product_truth_hash: truth2.product_truth_hash,
      declared: { actions: ['SEARCH_PART'], states: ['RESULTS'], external_reference_constraints_satisfied: [], external_reference_branding_present: true, external_reference_code_imported: true, displayed_values: [] },
    };
    const evidence = runCritics({ candidate: violating, productTruth: truth2, packet: refPacket, repoDir });
    const ids = evidence.blocking_findings.map((f) => f.finding_id);
    expect(ids).toEqual(expect.arrayContaining(['EXTERNAL_REFERENCE_CONSTRAINT_UNSATISFIED:NO_EXTERNAL_IMPLEMENTATION_REUSE', 'EXTERNAL_REFERENCE_BRAND_AUTHORITY', 'EXTERNAL_REFERENCE_CODE_IMPORT']));
  });

  it('accepts an external aesthetic critic through the same contract', () => {
    const merged = mergeCriticReports({
      candidateId: 'DESIGN-a',
      reports: [{ schema_version: 1, critic: 'visual-model', candidate_id: 'DESIGN-a', findings: [{ finding_id: 'GENERIC_AI_UI', severity: 'BLOCKING', detail: 'template output' }], verdict: 'REJECT', report_hash: 'h' }],
    });
    expect(merged.verdict).toBe('REJECT');
    expect(merged.blocking_findings[0].critic).toBe('visual-model');
  });
});

describe('candidate diversity is bounded, not random', () => {
  const packet = explorePacket().packet;

  it('requires candidates to differ materially', () => {
    const identical = ['a', 'b', 'c'].map((x) => candidate(`DESIGN-${x}`, { section_composition: 'same', imagery_position: 'same' }));
    expect(evaluateCandidateDiversity({ candidates: identical, packet }).failures).toContain('INSUFFICIENT_DIVERSITY:0<2');
  });

  it('accepts variation on the declared diversity dimensions', () => {
    const varied = [
      candidate('DESIGN-a', { section_composition: 'hero-first', imagery_position: 'top', surface_strategy: 'open', primary_action_emphasis: 'inline' }),
      candidate('DESIGN-b', { section_composition: 'search-first', imagery_position: 'inline', surface_strategy: 'carded', primary_action_emphasis: 'sticky' }),
      candidate('DESIGN-c', { section_composition: 'garage-first', imagery_position: 'none', surface_strategy: 'mixed', primary_action_emphasis: 'fab' }),
    ];
    const result = evaluateCandidateDiversity({ candidates: varied, packet });
    expect(result.ok, JSON.stringify(result.failures)).toBe(true);
    expect(result.varied_dimensions).toEqual(['imagery_position', 'primary_action_emphasis', 'section_composition', 'surface_strategy']);
  });

  it('fails when candidates drift on a fixed dimension', () => {
    const drifting = [
      candidate('DESIGN-a', { section_composition: 'hero-first', imagery_position: 'top' }),
      candidate('DESIGN-b', { section_composition: 'search-first', imagery_position: 'inline' }, {
        fixed: { ...baseDeclared().fixed, navigation_semantics: ['SEARCH_IS_SECONDARY'] },
      }),
    ];
    expect(evaluateCandidateDiversity({ candidates: drifting, packet, minimumDistinctDimensions: 1 }).failures)
      .toContain('SEMANTIC_DRIFT_ACROSS_CANDIDATES:navigation_semantics');
  });
});

describe('convergence, synthesis and promotion', () => {
  const packet = explorePacket().packet;
  const good = candidate('DESIGN-good', { section_composition: 'search-first' });
  const goodEvidence = runCritics({ candidate: good, productTruth, packet, repoDir, componentRegistryIds: componentIds });

  it('refuses to converge from a non-EXPLORE packet', () => {
    const conv = buildScreenQualityPacket({
      repoDir, productTruth, authority: { design_authority_projection_hash: exploreProjection.projection_hash },
      designProvenanceMode: 'NEW_DIAL_DESIGN', designIterationPhase: 'CONVERGE', candidateCount: 1,
    }).packet;
    expect(buildConvergencePacket({ packet: conv, candidates: [good], criticEvidence: [goodEvidence], selectedCandidateId: good.candidate_id, preserve: ['x'] }).failures)
      .toContain('CONVERGENCE_REQUIRES_EXPLORE_PACKET');
  });

  it('refuses to converge on a rejected candidate or with unresolved blocking findings', () => {
    const bad = candidate('DESIGN-bad', { section_composition: 'x' }, { controls: [{ label: 'Nowhere' }] });
    const badEvidence = runCritics({ candidate: bad, productTruth, packet, repoDir });
    expect(buildConvergencePacket({ packet, candidates: [bad], criticEvidence: [badEvidence], selectedCandidateId: bad.candidate_id, preserve: ['x'] }).failures)
      .toContain('REJECTED_CANDIDATE_CANNOT_BE_SELECTED');
  });

  it('requires an explicit preserve list', () => {
    expect(buildConvergencePacket({ packet, candidates: [good], criticEvidence: [goodEvidence], selectedCandidateId: good.candidate_id, preserve: [] }).failures)
      .toContain('CONVERGENCE_MUST_STATE_WHAT_IS_PRESERVED');
  });

  it('produces a convergence packet carrying the same Product Truth', () => {
    const result = buildConvergencePacket({
      packet, candidates: [good], criticEvidence: [goodEvidence], selectedCandidateId: good.candidate_id,
      preserve: ['section order', 'hero strategy'], improve: ['spacing rhythm'], forbid: ['new navigation'],
    });
    expect(result.ok).toBe(true);
    expect(result.packet.design_iteration_phase).toBe('CONVERGE');
    expect(result.packet.product_truth_hash).toBe(productTruth.product_truth_hash);
  });

  it('refuses collage and conflicting contributions in synthesis', () => {
    expect(buildSynthesisManifest({ packet, contributions: [{ candidate_id: 'A', strength: 'hierarchy', artifact_fragment: '<div/>' }] }).failures)
      .toContain('SYNTHESIS_MUST_NOT_CARRY_ARTIFACT_FRAGMENTS');
    expect(buildSynthesisManifest({ packet, contributions: [{ candidate_id: 'A', strength: 'product_truth' }] }).failures)
      .toContain('SYNTHESIS_OVER_FIXED_DIMENSION:product_truth');
    expect(buildSynthesisManifest({ packet, contributions: [{ candidate_id: 'A', strength: 'hierarchy' }, { candidate_id: 'B', strength: 'hierarchy' }] }).failures)
      .toContain('CONFLICTING_CONTRIBUTIONS:hierarchy');
  });

  it('requires regeneration rather than merging', () => {
    const manifest = buildSynthesisManifest({
      packet, targetCandidateId: 'DESIGN-synth',
      contributions: [{ candidate_id: 'DESIGN-a', strength: 'hierarchy' }, { candidate_id: 'DESIGN-b', strength: 'emphasis' }],
    });
    expect(manifest.ok).toBe(true);
    expect(manifest.manifest.regeneration_required).toBe(true);
    expect(manifest.manifest.collage_forbidden).toBe(true);
  });

  it('never lets an agent promote visual authority', () => {
    const convergence = buildConvergencePacket({ packet, candidates: [good], criticEvidence: [goodEvidence], selectedCandidateId: good.candidate_id, preserve: ['x'] }).packet;
    for (const authority of ['AGENT', 'CI', 'MODEL_RECOMMENDATION', undefined]) {
      const result = freezeVisualAuthority({ convergencePacket: convergence, candidate: good, criticEvidence: goodEvidence, promotedBy: 'x', promotionAuthority: authority });
      expect(result.ok).toBe(false);
      expect(result.failures).toContain('PROMOTION_REQUIRES_OWNER_OR_AUTHORIZED_DESIGN_AUTHORITY');
    }
  });
});

describe('guided admission composes with the existing pipeline', () => {
  const packet = explorePacket().packet;
  const artifact = '<main><h1>Find your part</h1></main>';
  const q = quarantineDesignArtifact({ content: artifact });
  const guided = buildDesignCandidateManifest({
    taskId: 'spare-home', providerId: 'google-stitch', unitLineageId: unitMap.unit_lineage_id,
    unitRevisionHash: unitMap.unit_revision_hash, designAuthorityProjectionHash: exploreProjection.projection_hash,
    rawContent: artifact, quarantine: q, screenRefs: ['spare/home'],
    screenQualityPacketHash: packet.packet_hash, designIterationPhase: 'EXPLORE',
    designProvenanceMode: 'NEW_DIAL_DESIGN', productTruthHash: productTruth.product_truth_hash,
  });

  it('marks a guided candidate non-authoritative and review-required', () => {
    expect(guided.authority).toBe('NON_AUTHORITATIVE_DESIGN_CANDIDATE');
    expect(guided.authority_state).toBe('REVIEW_REQUIRED');
    expect(guided.screen_quality_packet_hash).toBe(packet.packet_hash);
  });

  it('will not admit a guided candidate without critic evidence', () => {
    expect(admitDesignCandidate({ candidate: guided, authorityConforms: true, requiredStatesPresent: true }).failures)
      .toContain('CRITIC_EVIDENCE_REQUIRED_FOR_GUIDED_CANDIDATE');
  });

  it('will not admit one whose critics rejected it', () => {
    const rejected = mergeCriticReports({
      candidateId: guided.candidate_id,
      reports: [{ schema_version: 1, critic: 'visual', candidate_id: guided.candidate_id, findings: [{ finding_id: 'GENERIC_AI_UI', severity: 'BLOCKING', detail: 'x' }], verdict: 'REJECT', report_hash: 'h' }],
    });
    expect(admitDesignCandidate({ candidate: guided, authorityConforms: true, requiredStatesPresent: true, criticEvidence: rejected }).failures)
      .toContain('CRITIC_REJECTION_BINDING');
  });

  it('will not admit one whose evidence belongs to a different candidate', () => {
    const wrong = mergeCriticReports({ candidateId: 'DESIGN-someone-else', reports: [] });
    expect(admitDesignCandidate({ candidate: guided, authorityConforms: true, requiredStatesPresent: true, criticEvidence: wrong }).failures)
      .toContain('CRITIC_EVIDENCE_CANDIDATE_MISMATCH');
  });

  it('admits a passing guided candidate and records its evidence', () => {
    const passing = mergeCriticReports({ candidateId: guided.candidate_id, reports: [] });
    const result = admitDesignCandidate({ candidate: guided, authorityConforms: true, requiredStatesPresent: true, criticEvidence: passing });
    expect(result.ok).toBe(true);
    expect(result.manifest.critic_evidence_hash).toBe(passing.evidence_hash);
    expect(result.manifest.design_iteration_phase).toBe('EXPLORE');
  });
});

describe('provider routing stays fail-closed', () => {
  const qualified = {
    provider_id: 'google-stitch', authority: 'NON_AUTHORITATIVE_CANDIDATE', qualification_required: true,
    qualification_evidence_valid: true, health: 'HEALTHY', supported_phases: ['EXPLORE', 'CONVERGE'],
    supported_inputs: ['structured_prompt', 'image_reference', 'donor_screen'], supported_outputs: ['image', 'design_artifact'],
    sensitive_data_allowed: false,
  };

  it.each([
    ['unqualified', { qualification_evidence_valid: false }, 'QUALIFICATION_EVIDENCE_MISSING'],
    ['unhealthy', { health: 'DOWN' }, 'PROVIDER_UNHEALTHY:DOWN'],
    ['phase-incapable', { supported_phases: ['CONVERGE'] }, 'PHASE_UNSUPPORTED:EXPLORE'],
    ['claiming authority', { authority: 'PROMOTED_VISUAL_AUTHORITY' }, 'PROVIDER_MUST_BE_NON_AUTHORITATIVE'],
    ['claiming sensitive-data access', { sensitive_data_allowed: true }, 'PROVIDER_CLAIMS_SENSITIVE_DATA_ACCESS'],
  ])('refuses a %s provider', (_label, breach, expected) => {
    const verdict = evaluateProviderEligibility({ provider: { ...qualified, ...breach }, phase: 'EXPLORE', designProvenanceMode: 'NEW_DIAL_DESIGN', requiredOutputs: ['design_artifact'] });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons).toContain(expected);
  });

  it('refuses raw external-repository screen input in reference-inspired mode', () => {
    const verdict = evaluateProviderEligibility({
      provider: qualified,
      phase: 'EXPLORE', designProvenanceMode: 'REFERENCE_INSPIRED_DIAL_NATIVE', requiredOutputs: ['design_artifact'],
    });
    expect(verdict.reasons).toContain('RAW_EXTERNAL_REPOSITORY_SCREEN_INPUT_FORBIDDEN');
    const abstractOnly = evaluateProviderEligibility({
      provider: { ...qualified, supported_inputs: ['structured_prompt', 'image_reference'] },
      phase: 'EXPLORE', designProvenanceMode: 'REFERENCE_INSPIRED_DIAL_NATIVE', requiredOutputs: ['design_artifact'],
    });
    expect(abstractOnly.eligible).toBe(true);
  });

  it('fails closed on provider outage without silently substituting a direct worker', () => {
    const result = routeGuidedCandidateGeneration({
      designProvenanceMode: 'NEW_DIAL_DESIGN', designIterationPhase: 'EXPLORE',
      providers: [{ ...qualified, health: 'DOWN' }], directWorkerEligible: true,
    });
    expect(result.ok).toBe(false);
    expect(result.routes).toHaveLength(0);
    expect(result.fallback_strategy).toBe(null);
    expect(result.outage_behavior).toBe('WAIT_RETRY_OR_REPORT_UNAVAILABLE');
    expect(result.acceptance_preserved).toBe(true);
  });

  it('fails closed when nothing at all is eligible', () => {
    const result = routeGuidedCandidateGeneration({
      designProvenanceMode: 'NEW_DIAL_DESIGN', designIterationPhase: 'EXPLORE',
      providers: [{ ...qualified, health: 'DOWN' }], directWorkerEligible: false,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('NO_ELIGIBLE_DESIGN_PROVIDER');
  });

  it('routes deterministically', () => {
    const args = { designProvenanceMode: 'NEW_DIAL_DESIGN', designIterationPhase: 'EXPLORE', providers: [qualified], candidateCount: 3 };
    expect(routeGuidedCandidateGeneration(args).routing_hash).toBe(routeGuidedCandidateGeneration(args).routing_hash);
  });
});

describe('Dial a Spare Android home screen — certification exercise', () => {
  it('runs EXPLORE to RECONSTRUCT against the live registries', () => {
    expect(spareFeature, 'SPARE-F002 must exist in the live FEATURE_REGISTRY').toBeTruthy();

    // EXPLORE: three materially different candidates, one Product Truth.
    const packet = explorePacket().packet;
    const candidates = [
      candidate('DESIGN-spare-a', { section_composition: 'hero-first', imagery_position: 'top', surface_strategy: 'open', primary_action_emphasis: 'inline' }),
      candidate('DESIGN-spare-b', { section_composition: 'search-first', imagery_position: 'inline', surface_strategy: 'carded', primary_action_emphasis: 'sticky' }),
      candidate('DESIGN-spare-c', { section_composition: 'garage-first', imagery_position: 'none', surface_strategy: 'mixed', primary_action_emphasis: 'fab' }),
    ];
    const diversity = evaluateCandidateDiversity({ candidates, packet });
    expect(diversity.ok, JSON.stringify(diversity.failures)).toBe(true);
    expect(diversity.drifted_dimensions).toEqual([]);

    const evidence = candidates.map((c) => runCritics({ candidate: c, productTruth, packet, repoDir, componentRegistryIds: componentIds }));
    expect(evidence.every((e) => e.verdict === 'PASS'), JSON.stringify(evidence.flatMap((e) => e.blocking_findings))).toBe(true);

    // CONVERGE on one direction.
    const convergence = buildConvergencePacket({
      packet, candidates, criticEvidence: evidence, selectedCandidateId: 'DESIGN-spare-b',
      preserve: ['search-first section order', 'sticky primary action'],
      improve: ['category card rhythm'], forbid: ['a second navigation surface'],
    });
    expect(convergence.ok, JSON.stringify(convergence.failures)).toBe(true);

    // Freeze under owner authority.
    const frozen = freezeVisualAuthority({
      convergencePacket: convergence.packet,
      candidate: candidates[1],
      criticEvidence: evidence[1],
      promotedBy: 'product owner',
      promotionAuthority: 'OWNER',
      designTokens: { spacing: '8dp', radii: '12dp', typography: 'dial/android/v1', color_roles: 'dial/roles/v1', elevations: 'dial/elevation/v1' },
      componentRelationships: ['dial.navigation.top > dial.surface.card'],
      responsiveRules: ['compact: single column', 'medium: two column categories'],
      stateMatrix: ['LOADING', 'EMPTY', 'ERROR', 'RESULTS', 'NO_VEHICLE_SELECTED'],
    });
    expect(frozen.ok, JSON.stringify(frozen.failures)).toBe(true);

    // RECONSTRUCT: a faithful build passes; an "improved" one does not.
    const faithful = verifyReconstructionParity({
      visualAuthority: frozen.visual_authority,
      implementation: {
        visual_authority_hash: frozen.visual_authority.visual_authority_hash,
        deviations: [],
        design_tokens: frozen.visual_authority.design_tokens,
        state_matrix: ['LOADING', 'EMPTY', 'ERROR', 'RESULTS', 'NO_VEHICLE_SELECTED'],
      },
    });
    expect(faithful.ok, JSON.stringify(faithful.failures)).toBe(true);

    const improved = verifyReconstructionParity({
      visualAuthority: frozen.visual_authority,
      implementation: {
        visual_authority_hash: frozen.visual_authority.visual_authority_hash,
        deviations: ['composition', 'section_order'],
        design_tokens: { ...frozen.visual_authority.design_tokens, spacing: '6dp' },
        // Functionally complete, visually different: this must still fail.
        state_matrix: ['LOADING', 'EMPTY', 'ERROR', 'RESULTS', 'NO_VEHICLE_SELECTED'],
      },
    });
    expect(improved.ok).toBe(false);
    expect(improved.failures).toEqual(expect.arrayContaining([
      'LOCKED_DIMENSION_DEVIATION:composition', 'LOCKED_DIMENSION_DEVIATION:section_order', 'DESIGN_TOKEN_DRIFT:spacing',
    ]));

    // Only accepted, evidenced work teaches.
    const golden = buildGoldenScreenDescriptor({
      visualAuthority: frozen.visual_authority, parity: faithful, validatedBy: 'product owner',
      patterns: ['search-first home', 'persistent garage affordance'],
    });
    expect(golden.ok).toBe(true);
    expect(golden.descriptor.forces_identical_composition).toBe(false);

    const learning = filterLearnableEvidence({ candidates, criticEvidence: evidence, visualAuthority: frozen.visual_authority });
    expect(learning.learnable).toEqual(['DESIGN-spare-b']);
    expect(learning.withheld).toEqual(['DESIGN-spare-a', 'DESIGN-spare-c']);
  });

  it('refuses a golden screen with no parity evidence', () => {
    expect(buildGoldenScreenDescriptor({ visualAuthority: { visual_authority_hash: 'h' }, parity: { ok: false }, validatedBy: 'owner' }).failures)
      .toContain('PARITY_EVIDENCE_REQUIRED');
  });
});
