import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCreativeScreenGenerationStrategy,
  evaluateCreativeCandidate,
  selectCreativeCandidate,
} from '../agent-system/orchestration/frontend-creative-strategy.mjs';
import {
  buildFrontendProductExperienceProjection,
  buildDesignBriefBundle,
} from '../agent-system/orchestration/frontend-product-experience.mjs';
import { compileFrontendDesignExecutionPacket } from '../agent-system/orchestration/frontend-design-execution-packet.mjs';
import { buildStitchDesignPrompt } from '../agent-system/orchestration/stitch-design-orchestration.mjs';
import { StitchAdapter } from '../agent-system/orchestration/stitch-adapter.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(here, '..');

function spareFixture() {
  const units = JSON.parse(fs.readFileSync(path.join(repoDir, 'agent-system/registries/DEVELOPMENT_UNIT_REGISTRY.json'), 'utf8')).units;
  const unit = units.find((row) => (row.feature_ids || []).includes('SPARE-F001'));
  if (!unit) throw new Error('SPARE-F001 DU missing');
  const frcDoc = JSON.parse(fs.readFileSync(path.join(repoDir, 'docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json'), 'utf8'));
  const rows = Array.isArray(frcDoc) ? frcDoc : (frcDoc.contracts || frcDoc.features || []);
  const contract = rows.find((row) => row.feature_id === 'SPARE-F001');
  if (!contract) throw new Error('SPARE-F001 FRC missing');
  const feature = { feature_id: contract.feature_id, module: contract.module, outcome: contract.outcome, screens: contract.surfaces };
  return { unit, contract, feature };
}

function criticRow(candidate_id, score) {
  return {
    candidate_id,
    metrics: {
      semantic_fidelity: score,
      brand_identity: score,
      visual_hierarchy: score,
      professional_polish: score,
      distinctiveness: score,
      accessibility: score,
      responsive_viability: score,
      implementation_feasibility: score,
      anti_pattern_compliance: score,
      visual_authority_fidelity: score,
    },
    hard_gates: {
      product_truth: true,
      domain_truth: true,
      accessibility: true,
      no_fabrication: true,
      provider_egress: true,
    },
  };
}

test('Dial a Spare Android FDEP compiles guided creative strategy from the real SPARE-F001 DU', () => {
  const { unit, contract, feature } = spareFixture();
  const instruction = 'Design the Dial a Spare Android home screen as a premium automotive entry experience. Prioritize vehicle selection and garage access, with immediate parts discovery and clear mobile hierarchy.';
  const px = buildFrontendProductExperienceProjection({
    repoDir,
    unit,
    featureRecord: feature,
    contractRecord: contract,
    instruction,
    affectedPaths: ['apps/android/spare/HomeScreen.kt'],
  });
  expect(px.presentation_decision.renderer_id).toBe('JETPACK_COMPOSE');
  expect(px.product_design_profile.artifact_id).toBe('dial.spare');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-creative-fdep-'));
  try {
    const packet = compileFrontendDesignExecutionPacket({
      repoDir,
      root,
      taskId: 'dial-a-spare-home-creative-test',
      unitMap: {
        unit_lineage_id: unit.unit_lineage_id,
        unit_revision_hash: unit.unit_revision_hash,
        map_hash: 'test-unit-map-hash',
        product_experience_map: { frontend_projection: px },
      },
      triage: { archetype: 'NEW_FRONTEND_DESIGN', triage_result_hash: 'test-triage-hash' },
      instruction,
      affectedPaths: ['apps/android/spare/HomeScreen.kt'],
    });
    const strategy = packet.creative_screen_generation?.surfaces?.DIAL_CONSUMER;
    expect(strategy).toBeTruthy();
    expect(strategy.design_freedom_budget.freedom_level).toBe('LOW');
    expect(strategy.design_freedom_budget.provider_creative_range).toBe('REFINE');
    expect(strategy.design_freedom_budget.candidate_count).toBe(2);
    expect(strategy.design_freedom_budget.dimensions.product_semantics).toBe(0);
    expect(strategy.design_freedom_budget.dimensions.layout_structure).toBeLessThanOrEqual(0.25);
    expect(strategy.exploration_plan.candidates.map((row) => row.candidate_id)).toEqual([
      'precision-editorial',
      'immersive-automotive',
    ]);
    expect(fs.existsSync(path.join(root, 'execution/tasks/dial-a-spare-home-creative-test/creative-screen-generation.json'))).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('guided strategy is deterministic and reconstruction tightens creative freedom', () => {
  const fdep = {
    task_id: 'creative-determinism',
    unit_lineage_id: 'DU-X',
    unit_revision_hash: 'rev',
    presentation_decision: { execution_mode: 'SYNTHESIZE', archetype_id: 'CATALOG_EXPLORER', renderer_id: 'JETPACK_COMPOSE' },
    product_design_profile: { profile: { brand_character: ['automotive'], visual_character: ['premium'] } },
    surface_manifest: { surfaces: [{ surface_id: 'DIAL_CONSUMER' }] },
    visual_reference_spec: { references: [] },
    change_budget: { content_hash: 'budget' },
  };
  const brief = { content_hash: 'brief', design_intent: { text: 'Premium parts discovery home.' } };
  const a = buildCreativeScreenGenerationStrategy({ fdep, brief, surfaceId: 'DIAL_CONSUMER' });
  const b = buildCreativeScreenGenerationStrategy({ fdep, brief, surfaceId: 'DIAL_CONSUMER' });
  expect(a.content_hash).toBe(b.content_hash);
  const reconstruct = buildCreativeScreenGenerationStrategy({
    fdep: { ...fdep, presentation_decision: { ...fdep.presentation_decision, execution_mode: 'RECONSTRUCT' } },
    brief,
    surfaceId: 'DIAL_CONSUMER',
  });
  expect(reconstruct.design_freedom_budget.freedom_level).toBe('LOW');
  expect(reconstruct.design_freedom_budget.provider_creative_range).toBe('REFINE');
  expect(reconstruct.design_freedom_budget.candidate_count).toBe(2);
  expect(reconstruct.design_freedom_budget.dimensions.layout_structure).toBeLessThan(a.design_freedom_budget.dimensions.layout_structure);
});

test('critic selection fails closed and converges deterministically on the strongest eligible candidate', () => {
  const weak = evaluateCreativeCandidate(criticRow('precision-editorial', 0.68));
  const strong = evaluateCreativeCandidate(criticRow('immersive-automotive', 0.94));
  const medium = evaluateCreativeCandidate(criticRow('utility-first-premium', 0.84));
  expect(weak.eligible).toBe(false);
  expect(strong.eligible).toBe(true);
  const selection = selectCreativeCandidate({ evaluations: [medium, strong, weak] });
  expect(selection.status).toBe('SELECTED_FOR_CONVERGENCE');
  expect(selection.selected).toBe('immersive-automotive');
  expect(selection.ranked[0].candidate_id).toBe('immersive-automotive');
});

test('Stitch adapter exposes governed variant exploration and refinement without promoting provider authority', async () => {
  const calls = [];
  const transport = {
    health: async () => ({ state: 'HEALTHY' }),
    variants: async (input) => {
      calls.push(['variants', input]);
      return { project_id: 'p1', seed_screen_id: 'seed', variants: [{ project_id: 'p1', screen_id: 'v1', html_url: 'https://example.invalid/a', image_url: 'https://example.invalid/a.png' }] };
    },
    refine: async (input) => {
      calls.push(['refine', input]);
      return { project_id: 'p1', source_screen_id: input.screen_id, screen_id: 'final', html_url: 'https://example.invalid/f', image_url: 'https://example.invalid/f.png' };
    },
  };
  const adapter = new StitchAdapter({ transport, enabled: true });
  const explored = await adapter.variants({
    design_projection_hash: 'projection',
    seed_prompt: 'seed',
    explore_prompt: 'explore',
    variant_options: { aspects: ['LAYOUT'], creativeRange: 'EXPLORE', variantCount: 3 },
  });
  expect(explored.provider_authority).toBe('NON_AUTHORITATIVE_DESIGN_PROVIDER');
  expect(explored.requires_dial_admission).toBe(true);
  const refined = await adapter.refine({
    design_projection_hash: 'projection',
    project_id: 'p1',
    screen_id: 'v1',
    prompt: 'converge',
  });
  expect(refined.screen_id).toBe('final');
  expect(calls.map(([kind]) => kind)).toEqual(['variants', 'refine']);
});

test('Dial a Spare Stitch prompt carries creative freedom and anti-generic constraints inside governed projection', () => {
  const { unit, contract, feature } = spareFixture();
  const instruction = 'Design a premium Dial a Spare Android home screen with clear vehicle-first parts discovery.';
  const projection = buildFrontendProductExperienceProjection({
    repoDir,
    unit,
    featureRecord: feature,
    contractRecord: contract,
    instruction,
    affectedPaths: ['apps/android/spare/HomeScreen.kt'],
  });
  const brief = buildDesignBriefBundle({ projection, unit, taskId: 'spare-prompt-test', instruction });
  const fdep = {
    task_id: 'spare-prompt-test',
    unit_lineage_id: unit.unit_lineage_id,
    unit_revision_hash: unit.unit_revision_hash,
    product_design_profile: projection.product_design_profile,
    surface_manifest: projection.surface_manifest,
    surface_state_matrix: projection.surface_state_matrix,
    visual_reference_spec: projection.visual_reference_spec,
    presentation_decision: projection.presentation_decision,
    change_budget: { content_hash: 'budget' },
    authority_constraints: { project_truth_superior: true, frc_superior: true },
  };
  const strategy = buildCreativeScreenGenerationStrategy({ fdep, brief, surfaceId: 'DIAL_CONSUMER' });
  fdep.creative_screen_generation = { strategy_version: 'dial-guided-creative-screen-generation-1.0', surfaces: { DIAL_CONSUMER: strategy }, content_hash: strategy.content_hash };
  const prompt = buildStitchDesignPrompt({ repoDir, fdep, brief, surfaceId: 'DIAL_CONSUMER', stage: 'EXPLORE' });
  expect(prompt).toMatch(/guided creativity, not template filling/i);
  expect(prompt).toMatch(/Do not collapse the result into a generic safe average/i);
  expect(prompt).toContain('CreativeDirectionProfile');
  expect(prompt).toContain('DesignFreedomBudget');
  expect(prompt).toContain('PREMIUM_AUTOMOTIVE');
});

test('full guided creative Stitch pipeline explores, selects and converges a Dial a Spare mobile candidate', async () => {
  const { unit, contract, feature } = spareFixture();
  const instruction = 'Design the Dial a Spare Android home screen as a premium automotive entry experience focused on vehicle selection and garage access.';
  const projection = buildFrontendProductExperienceProjection({
    repoDir,
    unit,
    featureRecord: feature,
    contractRecord: contract,
    instruction,
    affectedPaths: ['apps/android/spare/HomeScreen.kt'],
  });
  projection.surface_manifest = {
    ...projection.surface_manifest,
    surfaces: projection.surface_manifest.surfaces.filter((row) => row.surface_id === 'DIAL_CONSUMER'),
  };
  projection.surface_state_matrix = {
    ...projection.surface_state_matrix,
    surfaces: projection.surface_state_matrix.surfaces.filter((row) => row.surface_id === 'DIAL_CONSUMER'),
  };

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-stitch-creative-e2e-'));
  try {
    const taskId = 'dial-a-spare-home-stitch-e2e';
    const packet = compileFrontendDesignExecutionPacket({
      repoDir,
      root,
      taskId,
      unitMap: {
        unit_lineage_id: unit.unit_lineage_id,
        unit_revision_hash: unit.unit_revision_hash,
        map_hash: 'stitch-e2e-unit-map',
        product_experience_map: { frontend_projection: projection },
      },
      triage: { archetype: 'NEW_FRONTEND_DESIGN', triage_result_hash: 'stitch-e2e-triage' },
      instruction,
      affectedPaths: ['apps/android/spare/HomeScreen.kt'],
    });
    fs.writeFileSync(path.join(root, 'execution/tasks', taskId, 'envelope.json'), JSON.stringify({ envelope_hash: 'stitch-e2e-envelope' }));

    const variantCalls = [];
    const refineCalls = [];
    const fakeAdapter = {
      health: async () => ({ state: 'HEALTHY' }),
      variants: async (input) => {
        variantCalls.push(input);
        return {
          project_id: 'project-spare-home',
          seed_screen_id: 'seed-spare-home',
          response_hash: 'variant-response',
          variants: [
            { project_id: 'project-spare-home', screen_id: 'variant-precision', html_url: 'https://fake/precision.html', image_url: 'https://fake/precision.png' },
            { project_id: 'project-spare-home', screen_id: 'variant-immersive', html_url: 'https://fake/immersive.html', image_url: 'https://fake/immersive.png' },
          ],
        };
      },
      refine: async (input) => {
        refineCalls.push(input);
        return {
          project_id: input.project_id,
          source_screen_id: input.screen_id,
          screen_id: 'converged-spare-home',
          html_url: 'https://fake/converged.html',
          image_url: 'https://fake/converged.png',
          response_hash: 'refine-response',
        };
      },
    };
    const artifactDownloader = async (url) => {
      if (url.endsWith('.png')) {
        const body = new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4]);
        return { body, content_type: 'image/png', byte_length: body.byteLength, sha256: 'fake-image-hash' };
      }
      const label = url.includes('immersive') ? 'Immersive automotive' : url.includes('precision') ? 'Precision editorial' : 'Converged spare home';
      const body = new TextEncoder().encode('<main><h1>Dial a Spare</h1><p>'+label+'</p><button>Choose vehicle</button></main>');
      return { body, content_type: 'text/html', byte_length: body.byteLength, sha256: 'fake-html-hash' };
    };
    const { executeStitchCreativeExplorationStage, convergeStitchCreativeStage } = await import('../agent-system/orchestration/stitch-design-orchestration.mjs');
    const exploration = await executeStitchCreativeExplorationStage({
      repoDir,
      root,
      taskId,
      adapter: fakeAdapter,
      artifactDownloader,
      envelopeGuard: () => ({ ok: true, reasons: [] }),
      fdepGuard: () => ({ ok: true, reasons: [] }),
    });
    expect(exploration.status).toBe('CREATIVE_EXPLORATION_READY_FOR_CRITIC');
    expect(exploration.surfaces.DIAL_CONSUMER.variants).toHaveLength(2);
    expect(variantCalls[0].variant_options.creativeRange).toBe('REFINE');

    const criticEvidence = {
      DIAL_CONSUMER: [
        criticRow('precision-editorial', 0.82),
        criticRow('immersive-automotive', 0.95),
      ],
    };
    const converged = await convergeStitchCreativeStage({
      repoDir,
      root,
      taskId,
      criticEvidence,
      adapter: fakeAdapter,
      artifactDownloader,
      envelopeGuard: () => ({ ok: true, reasons: [] }),
      fdepGuard: () => ({ ok: true, reasons: [] }),
    });
    expect(converged.status).toBe('QUARANTINED_SAFE_REVIEW_REQUIRED');
    expect(converged.creative_strategy.selections.DIAL_CONSUMER.selection.selected).toBe('immersive-automotive');
    expect(refineCalls).toHaveLength(1);
    expect(refineCalls[0].screen_id).toBe('variant-immersive');
    expect(refineCalls[0].prompt).toMatch(/Refine this selected candidate rather than redesigning from scratch/i);
    expect(converged.candidate.frontend_design_execution_packet_hash).toBe(packet.content_hash);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
