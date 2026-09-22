#!/usr/bin/env node
// Workstream B gate: guided generative frontend evolution.
//
// The load-bearing claim is now DEC-039: external repositories are research
// references/inspiration only. Legacy donor modes may be recognized as inputs,
// but must canonicalize into DIAL-native design and can never restore port/preserve authority.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DESIGN_ITERATION_PHASES, DESIGN_PROVENANCE_MODES, ENFORCED_BASELINE_PATTERNS,
  loadDesignAntiPatterns, projectDesignAuthority,
} from './design-authority-projector.mjs';
import { admitDesignCandidate, buildDesignCandidateManifest, quarantineDesignArtifact } from './design-candidate-admission.mjs';
import { routeGuidedCandidateGeneration, selectDesignStrategy } from './design-provider-router.mjs';
import {
  PHASE_FREEDOM_CEILINGS, SEMANTIC_DIMENSIONS, buildDesignFreedomBudget,
  buildProductTruthPacket, buildScreenQualityPacket,
} from './screen-quality-packet.mjs';
import { runCritics } from './design-critics.mjs';
import { buildConvergencePacket, buildSynthesisManifest, freezeVisualAuthority, verifyReconstructionParity } from './design-convergence.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const exists = (rel) => fs.existsSync(path.join(repo, rel));

const results = [];
const gate = (id, ok, detail) => results.push({ id, ok: Boolean(ok), detail });

const unitMap = { unit_lineage_id: 'U-GATE', unit_revision_hash: 'r-gate', product_experience_map: { applicable: true, knowledge_hash: 'k-gate', design_authorities: ['A1'] } };

// Load the committed baseline of a module so "unchanged" can be measured rather
// than asserted. Imports are rewritten to absolute paths because the copy lives
// outside the repository tree.
function baselineModule(rel) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-design-baseline-'));
  const body = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: repo, encoding: 'utf8' })
    .replace(/'\.\/([a-z0-9-]+\.mjs)'/g, `'${path.join(repo, 'agent-system/orchestration')}/$1'`);
  const file = path.join(dir, path.basename(rel));
  fs.writeFileSync(file, body);
  return import(file);
}

const baselineOf = {};
try {
  baselineOf.projector = await baselineModule('agent-system/orchestration/design-authority-projector.mjs');
  baselineOf.router = await baselineModule('agent-system/orchestration/design-provider-router.mjs');
  baselineOf.admission = await baselineModule('agent-system/orchestration/design-candidate-admission.mjs');
} catch (error) {
  gate('GDES-BASELINE', false, `could not load committed baseline: ${error.message}`);
}

try {
  // ── the two axes are separate ──────────────────────────────────────────────
  gate('GDES-G01', DESIGN_PROVENANCE_MODES.every((m) => !DESIGN_ITERATION_PHASES.includes(m))
    && DESIGN_ITERATION_PHASES.every((p) => !DESIGN_PROVENANCE_MODES.includes(p)),
    'provenance mode and iteration phase vocabularies do not overlap');

  const referenceExplore = projectDesignAuthority({ unitMap, designMode: 'REFERENCE_INSPIRED_DIAL_NATIVE', designIterationPhase: 'EXPLORE', repoDir: repo });
  gate('GDES-G02', referenceExplore.design_provenance_mode === 'REFERENCE_INSPIRED_DIAL_NATIVE' && referenceExplore.design_iteration_phase === 'EXPLORE' && referenceExplore.design_mode === 'REFERENCE_INSPIRED_DIAL_NATIVE',
    'reference-inspired DIAL-native provenance and EXPLORE are separate compatible axes');

  let threw = null;
  try { projectDesignAuthority({ unitMap, designMode: 'EXPLORE', repoDir: repo }); } catch (e) { threw = e.message; }
  gate('GDES-G03', /unknown design provenance mode/.test(threw || ''), 'an iteration phase cannot be passed as a provenance mode');

  // ── legacy donor vocabulary is safely canonicalized, not preserved as implementation authority ──
  const legacyAdapt = projectDesignAuthority({ unitMap, designMode: 'DONOR_ADAPT', repoDir: repo });
  const legacyPreserve = projectDesignAuthority({ unitMap, designMode: 'DONOR_PRESERVE', repoDir: repo });
  gate('GDES-G04', legacyAdapt.design_mode === 'REFERENCE_INSPIRED_DIAL_NATIVE' && legacyPreserve.design_mode === 'REFERENCE_INSPIRED_DIAL_NATIVE'
    && legacyAdapt.donor_transformation_hash === null && legacyPreserve.donor_transformation_hash === null,
    'legacy donor modes canonicalize to reference-inspired DIAL-native provenance with no donor transformation authority');

  const noPortRoute = selectDesignStrategy({ designMode: 'REFERENCE_INSPIRED_DIAL_NATIVE', directWorkerEligible: true });
  gate('GDES-G05', noPortRoute.ok && !noPortRoute.candidates.includes('DIRECT_DONOR_PORT_AND_TRANSFORM'),
    'provider routing exposes no direct donor port/transform strategy');

  if (baselineOf.admission) {
    const content = '<main><h1>DIAL</h1></main>';
    const q = quarantineDesignArtifact({ content });
    const args = { taskId: 't', providerId: 'p', unitLineageId: 'U1', unitRevisionHash: 'r1', designAuthorityProjectionHash: 'h1', rawContent: content, quarantine: q, screenRefs: ['home'] };
    const legacySame = JSON.stringify(baselineOf.admission.buildDesignCandidateManifest(args)) === JSON.stringify(buildDesignCandidateManifest(args));
    const quarantineSame = JSON.stringify(baselineOf.admission.quarantineDesignArtifact({ content })) === JSON.stringify(q);
    gate('GDES-G06', legacySame && quarantineSame, 'legacy candidate manifests and quarantine are unchanged');
  }

  const antiPatterns = loadDesignAntiPatterns(repo);
  gate('GDES-G07', ENFORCED_BASELINE_PATTERNS.every((x) => antiPatterns.enforced_baseline.includes(x)),
    `all ${ENFORCED_BASELINE_PATTERNS.length} existing prohibited patterns remain enforced`);
  gate('GDES-G08', antiPatterns.guided_additional.length >= 12 && !antiPatterns.guided_additional.some((x) => ENFORCED_BASELINE_PATTERNS.includes(x)),
    `${antiPatterns.guided_additional.length} guided anti-patterns added without duplicating the baseline`);

  // Quarantine remains fail-closed on provider output.
  const hostile = quarantineDesignArtifact({ content: '<main onload="steal()"><script src="https://evil.example/x.js"></script></main>' });
  gate('GDES-G09', hostile.ok === false && hostile.violations.includes('SCRIPT') && hostile.violations.includes('REMOTE_URL'),
    `hostile provider output quarantined: ${hostile.violations.join(',')}`);

  // ── freedom budget ─────────────────────────────────────────────────────────
  const semantic = buildDesignFreedomBudget({ phase: 'EXPLORE', requested: { navigation_semantics: 'high' } });
  gate('GDES-G10', semantic.ok === false && semantic.failures.includes('SEMANTIC_FREEDOM_FORBIDDEN:navigation_semantics'),
    'no phase may grant freedom over business or navigation semantics');
  gate('GDES-G11', SEMANTIC_DIMENSIONS.every((d) => buildDesignFreedomBudget({ phase: 'EXPLORE' }).budget[d] === 'none'),
    'semantic dimensions are pinned to none in every budget');

  const over = buildDesignFreedomBudget({ phase: 'RECONSTRUCT', requested: { composition: 'high' } });
  gate('GDES-G12', over.ok === false && over.failures.some((f) => f.startsWith('FREEDOM_EXCEEDS_PHASE_CEILING')),
    'RECONSTRUCT cannot be granted compositional freedom');
  const levels = ['none', 'low', 'medium', 'high'];
  const decreasing = ['EXPLORE', 'CONVERGE', 'RECONSTRUCT'].map((p) =>
    Object.values(PHASE_FREEDOM_CEILINGS[p]).reduce((sum, v) => sum + levels.indexOf(v), 0));
  gate('GDES-G13', decreasing[0] > decreasing[1] && decreasing[1] > decreasing[2],
    `creative freedom strictly decreases across phases: ${decreasing.join(' > ')}`);

  // ── screen quality packet ──────────────────────────────────────────────────
  const truth = buildProductTruthPacket({
    feature_ids: ['SPARE-F001'], unit_lineage_id: 'U-GATE', unit_revision_hash: 'r-gate',
    user_goal: 'find and order the right spare part',
    required_actions: ['SEARCH_PART', 'VIEW_PART', 'START_ORDER'],
    required_states: ['LOADING', 'EMPTY', 'ERROR', 'RESULTS'],
    external_reference_constraints: ['NO_EXTERNAL_IMPLEMENTATION_REUSE'],
  });
  gate('GDES-G14', truth.ok && /^[0-9a-f]{64}$/.test(truth.product_truth.product_truth_hash), 'Product Truth packet hashes deterministically');

  const packet = buildScreenQualityPacket({
    repoDir: repo, productTruth: truth.product_truth,
    authority: { design_authority_projection_hash: referenceExplore.projection_hash },
    designProvenanceMode: 'REFERENCE_INSPIRED_DIAL_NATIVE', designIterationPhase: 'EXPLORE', candidateCount: 3,
    intent: { screen_type: 'HOME', primary_task: 'SEARCH_PART' },
  });
  gate('GDES-G15', packet.ok && packet.packet.candidate_policy.count === 3 && packet.packet.critics.includes('external_reference'),
    'an EXPLORE packet requires three candidates and an external-reference critic when reference-informed');

  const tooMany = buildScreenQualityPacket({
    repoDir: repo, productTruth: truth.product_truth,
    authority: { design_authority_projection_hash: referenceExplore.projection_hash },
    designProvenanceMode: 'NEW_DIAL_DESIGN', designIterationPhase: 'RECONSTRUCT', candidateCount: 3,
  });
  gate('GDES-G16', tooMany.ok === false && tooMany.failures.includes('RECONSTRUCT_REQUIRES_SINGLE_CANDIDATE'),
    'RECONSTRUCT cannot run a multi-candidate exploration');

  const semanticDiversity = buildScreenQualityPacket({
    repoDir: repo, productTruth: truth.product_truth,
    authority: { design_authority_projection_hash: referenceExplore.projection_hash },
    designProvenanceMode: 'NEW_DIAL_DESIGN', designIterationPhase: 'EXPLORE', candidateCount: 3,
    diversityDimensions: ['navigation_semantics'],
  });
  gate('GDES-G17', semanticDiversity.ok === false && semanticDiversity.failures.some((f) => f.startsWith('DIVERSITY_OVER_SEMANTICS_FORBIDDEN')),
    'candidates may not be diversified over navigation semantics');

  // ── critics ────────────────────────────────────────────────────────────────
  const inventing = {
    candidate_id: 'DESIGN-invents', product_truth_hash: truth.product_truth.product_truth_hash,
    declared: {
      actions: ['SEARCH_PART', 'VIEW_PART', 'START_ORDER', 'APPLY_FOR_FINANCE'],
      states: ['LOADING', 'EMPTY', 'ERROR', 'RESULTS'],
      external_reference_constraints_satisfied: ['NO_EXTERNAL_IMPLEMENTATION_REUSE'],
      displayed_values: [{ label: 'parts in stock', source: 'INVENTED' }],
    },
  };
  const inventedEvidence = runCritics({ candidate: inventing, productTruth: truth.product_truth, packet: packet.packet, repoDir: repo });
  gate('GDES-G18', inventedEvidence.verdict === 'REJECT'
    && inventedEvidence.blocking_findings.some((f) => f.finding_id === 'INVENTED_CAPABILITY:APPLY_FOR_FINANCE')
    && inventedEvidence.blocking_findings.some((f) => f.finding_id.startsWith('INVENTED_METRICS')),
    'a candidate inventing a product feature or a metric is rejected');

  const violatesReferenceBoundary = { ...inventing, candidate_id: 'DESIGN-reference', declared: { ...inventing.declared, actions: ['SEARCH_PART', 'VIEW_PART', 'START_ORDER'], external_reference_constraints_satisfied: [], external_reference_code_imported: true, displayed_values: [] } };
  const referenceEvidence = runCritics({ candidate: violatesReferenceBoundary, productTruth: truth.product_truth, packet: packet.packet, repoDir: repo });
  gate('GDES-G19', referenceEvidence.blocking_findings.some((f) => f.finding_id === 'EXTERNAL_REFERENCE_CONSTRAINT_UNSATISFIED:NO_EXTERNAL_IMPLEMENTATION_REUSE')
    && referenceEvidence.blocking_findings.some((f) => f.finding_id === 'EXTERNAL_REFERENCE_CODE_IMPORT'),
    'external repositories remain non-authoritative inspiration and implementation reuse is blocked');

  const clean = {
    candidate_id: 'DESIGN-clean', candidate_hash: 'c'.repeat(64), product_truth_hash: truth.product_truth.product_truth_hash,
    declared: {
      actions: ['SEARCH_PART', 'VIEW_PART', 'START_ORDER'], states: ['LOADING', 'EMPTY', 'ERROR', 'RESULTS'],
      external_reference_constraints_satisfied: ['NO_EXTERNAL_IMPLEMENTATION_REUSE'], displayed_values: [{ label: 'price', source: 'PRICING_SERVICE' }],
      primary_task: 'SEARCH_PART', emphasis: [{ level: 'primary' }], controls: [{ label: 'Search', action: 'SEARCH_PART' }],
      navigation: [{ destination: 'HOME' }], contrast_pairs: [{ role: 'body', ratio: 7.1 }],
      touch_targets: [{ label: 'Search', min_dp: 48 }], focus_order_defined: true,
      breakpoints: [{ name: 'compact', overflow: false, hierarchy_preserved: true }],
      hero: { carries_primary_task: true }, data_bindings: [{ field: 'price', bindable: true }],
    },
  };
  const cleanEvidence = runCritics({ candidate: clean, productTruth: truth.product_truth, packet: packet.packet, repoDir: repo });
  gate('GDES-G20', cleanEvidence.verdict === 'PASS' && cleanEvidence.reports.length === packet.packet.critics.length,
    `a conforming candidate passes all ${cleanEvidence.reports.length} critics`);

  const lowContrast = { ...clean, candidate_id: 'DESIGN-contrast', declared: { ...clean.declared, contrast_pairs: [{ role: 'body', ratio: 2.9 }], touch_targets: [{ label: 'Search', min_dp: 32 }] } };
  const a11y = runCritics({ candidate: lowContrast, productTruth: truth.product_truth, packet: packet.packet, repoDir: repo });
  gate('GDES-G21', a11y.verdict === 'REJECT' && a11y.blocking_findings.some((f) => f.finding_id.startsWith('CONTRAST_BELOW_MINIMUM')),
    'accessibility failures reject a functionally correct candidate');

  // ── convergence, promotion, parity ─────────────────────────────────────────
  const rejectedConvergence = buildConvergencePacket({
    packet: packet.packet, candidates: [inventing], criticEvidence: [inventedEvidence],
    selectedCandidateId: 'DESIGN-invents', preserve: ['layout'],
  });
  gate('GDES-G22', rejectedConvergence.ok === false && rejectedConvergence.failures.includes('REJECTED_CANDIDATE_CANNOT_BE_SELECTED'),
    'a rejected candidate cannot be converged on');

  const convergence = buildConvergencePacket({
    packet: packet.packet, candidates: [clean], criticEvidence: [cleanEvidence],
    selectedCandidateId: 'DESIGN-clean', preserve: ['section order', 'hero strategy'], improve: ['spacing rhythm'],
  });
  gate('GDES-G23', convergence.ok && convergence.packet.design_iteration_phase === 'CONVERGE'
    && convergence.packet.product_truth_hash === truth.product_truth.product_truth_hash,
    'convergence preserves the direction and the same Product Truth');

  const collage = buildSynthesisManifest({ packet: packet.packet, contributions: [{ candidate_id: 'A', strength: 'hero_balance', artifact_fragment: '<div/>' }] });
  gate('GDES-G24', collage.ok === false && collage.failures.includes('SYNTHESIS_MUST_NOT_CARRY_ARTIFACT_FRAGMENTS'),
    'synthesis refuses to carry artifact fragments');

  const selfPromotion = freezeVisualAuthority({ convergencePacket: convergence.packet, candidate: clean, criticEvidence: cleanEvidence, promotedBy: 'design-agent', promotionAuthority: 'AGENT' });
  gate('GDES-G25', selfPromotion.ok === false && selfPromotion.failures.includes('PROMOTION_REQUIRES_OWNER_OR_AUTHORIZED_DESIGN_AUTHORITY'),
    'no agent may promote visual authority on its own evidence');

  const frozen = freezeVisualAuthority({
    convergencePacket: convergence.packet, candidate: clean, criticEvidence: cleanEvidence,
    promotedBy: 'product owner', promotionAuthority: 'OWNER',
    designTokens: { spacing: '8dp', radii: '12dp' }, stateMatrix: ['LOADING', 'EMPTY', 'ERROR', 'RESULTS'],
  });
  gate('GDES-G26', frozen.ok && frozen.visual_authority.composition_locked && frozen.visual_authority.section_order_locked,
    'accepted visual authority is frozen on composition, hierarchy and section order');

  const drifted = verifyReconstructionParity({
    visualAuthority: frozen.visual_authority,
    implementation: {
      visual_authority_hash: frozen.visual_authority.visual_authority_hash,
      deviations: ['composition'], design_tokens: { spacing: '4dp' },
      state_matrix: ['LOADING', 'EMPTY', 'ERROR', 'RESULTS'],
    },
  });
  gate('GDES-G27', drifted.ok === false && drifted.failures.includes('LOCKED_DIMENSION_DEVIATION:composition') && drifted.failures.includes('DESIGN_TOKEN_DRIFT:spacing'),
    'an implementation that "improves" the frozen design fails parity');

  const faithful = verifyReconstructionParity({
    visualAuthority: frozen.visual_authority,
    implementation: {
      visual_authority_hash: frozen.visual_authority.visual_authority_hash,
      deviations: [], design_tokens: { spacing: '8dp', radii: '12dp' },
      state_matrix: ['LOADING', 'EMPTY', 'ERROR', 'RESULTS'],
    },
  });
  gate('GDES-G28', faithful.ok, 'a faithful reconstruction passes parity');

  // ── guided admission ───────────────────────────────────────────────────────
  const q = quarantineDesignArtifact({ content: '<main><h1>DIAL</h1></main>' });
  const guidedCandidate = buildDesignCandidateManifest({
    taskId: 'gate', providerId: 'google-stitch', unitLineageId: 'U-GATE', unitRevisionHash: 'r-gate',
    designAuthorityProjectionHash: referenceExplore.projection_hash, rawContent: '<main><h1>DIAL</h1></main>', quarantine: q,
    screenQualityPacketHash: packet.packet.packet_hash, designIterationPhase: 'EXPLORE',
    designProvenanceMode: 'REFERENCE_INSPIRED_DIAL_NATIVE', productTruthHash: truth.product_truth.product_truth_hash,
  });
  const noEvidence = admitDesignCandidate({ candidate: guidedCandidate, authorityConforms: true, requiredStatesPresent: true });
  gate('GDES-G29', noEvidence.ok === false && noEvidence.failures.includes('CRITIC_EVIDENCE_REQUIRED_FOR_GUIDED_CANDIDATE'),
    'a guided candidate cannot be admitted without critic evidence');

  const rejectedAdmission = admitDesignCandidate({
    candidate: guidedCandidate, authorityConforms: true, requiredStatesPresent: true,
    criticEvidence: { ...inventedEvidence, candidate_id: guidedCandidate.candidate_id },
  });
  gate('GDES-G30', rejectedAdmission.ok === false && rejectedAdmission.failures.includes('CRITIC_REJECTION_BINDING'),
    'structural conformance cannot admit a critic-rejected candidate');

  // ── provider contract ──────────────────────────────────────────────────────
  const undeclaredProvider = routeGuidedCandidateGeneration({
    designProvenanceMode: 'NEW_DIAL_DESIGN', designIterationPhase: 'EXPLORE',
    providers: [{ provider_id: 'mystery', health: 'HEALTHY' }], directWorkerEligible: false,
  });
  gate('GDES-G31', undeclaredProvider.ok === false && undeclaredProvider.rejected[0].reasons.includes('PROVIDER_MUST_BE_NON_AUTHORITATIVE'),
    'an undeclared provider is never eligible');

  const outage = routeGuidedCandidateGeneration({
    designProvenanceMode: 'NEW_DIAL_DESIGN', designIterationPhase: 'EXPLORE',
    providers: [{ provider_id: 'google-stitch', authority: 'NON_AUTHORITATIVE_CANDIDATE', qualification_required: true, qualification_evidence_valid: true, health: 'DOWN', supported_phases: ['EXPLORE'], supported_outputs: ['design_artifact'] }],
    directWorkerEligible: true,
  });
  gate('GDES-G32', outage.ok === false && outage.routes.length === 0 && outage.fallback_strategy === null && outage.outage_behavior === 'WAIT_RETRY_OR_REPORT_UNAVAILABLE' && outage.acceptance_preserved === true,
    'a Stitch outage fails closed without silent provider/direct-worker substitution');

  gate('GDES-G33', exists('tests/orchestration-guided-design.test.mjs'), 'negative-test suite present');
  gate('GDES-G34', exists('agent-system/registries/DESIGN_ANTI_PATTERN_REGISTRY.json'), 'versioned anti-pattern registry present');
} catch (error) {
  gate('GDES-INTERNAL', false, String(error?.stack || error));
}

const ok = results.every((x) => x.ok);
console.log(JSON.stringify({ ok, passed: results.filter((x) => x.ok).length, total: results.length, results }, null, 2));
if (!ok) process.exitCode = 1;
