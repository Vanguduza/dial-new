// @ts-nocheck
import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildFrontendProductExperienceProjection,
  buildDesignBriefBundle,
  resolveProductDesignProfile,
} from '../agent-system/orchestration/frontend-product-experience.mjs';
import {
  compileFrontendGenerationContext,
  buildStitchVisualProductionPacket,
  freezeVisualAuthorityArtifact,
  buildInteractionMotionEnrichmentPacket,
  freezeExperienceAuthorityArtifact,
  buildProductionBindingContract,
  lintCandidateFacts,
  resolveTruthSourceProfile,
} from '../agent-system/orchestration/frontend-generation-architecture.mjs';
import {
  selectCanonicalFrontendDesignProvider,
  buildCanonicalStitchVisualPacket,
  renderStitchVisualProductionPrompt,
  buildCanonicalInteractionMotionPacket,
  renderInteractionMotionPrompt,
  buildInteractionAcceptanceMatrix,
} from '../agent-system/orchestration/frontend-design-provider-orchestrator.mjs';
import { executeStitchInteractionMotionStage } from '../agent-system/orchestration/stitch-design-orchestration.mjs';
import { sha256 } from '../agent-system/orchestration/providers/google/external-capability-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(here, '..');
const features = JSON.parse(fs.readFileSync(path.join(repoDir, 'docs/dial/final-audit/11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json'), 'utf8'));
const spare = features.find((x) => x.feature_id === 'SPARE-F001');
const unit = { unit_lineage_id: 'DU-FRONTEND-CANON', unit_revision_hash: 'rev1', feature_ids: ['SPARE-F001'], knowledge_route_ids: ['PRODUCT_EXPERIENCE'] };
const targetScreenId = 'SCREEN:SPARE:SPARE_HOME_ENTRY';

function buildPx({ requestedTruth = [], hydratedTruth = {} } = {}) {
  return buildFrontendProductExperienceProjection({
    repoDir,
    unit,
    featureRecord: spare,
    instruction: 'Create the DIAL A SPARE discovery home for the active vehicle.',
    affectedPaths: ['apps/web/src/spare/Home.tsx'],
    targetScreenId,
    requestedTruth,
    hydratedTruth,
  });
}

test('all canonical screen modules have a canonical frontend truth-source profile', () => {
  const screenRegistry = JSON.parse(fs.readFileSync(path.join(repoDir, 'agent-system/registries/SCREEN_REGISTRY.json'), 'utf8'));
  const modules = [...new Set(screenRegistry.screens.map((x) => x.module))].sort();
  expect(modules).toHaveLength(15);
  for (const module of modules) {
    const profile = resolveTruthSourceProfile({ repoDir, module });
    expect(profile.status).toBe('RESOLVED');
    expect(profile.module_sources.length).toBeGreaterThan(0);
    expect(profile.core_domains.length).toBeGreaterThan(0);
  }
});

test('all DIAL feature modules resolve a product design profile instead of silently falling to unknown', () => {
  const expected = {
    SPARE:'dial.spare', TECH:'dial.tech', GROCERIES:'dial.groceries', LAUNDRY:'dial.laundry',
    VHUB:'dial.vhub', CARE:'dial.care', ASSIST:'dial.assist', PROJECTS:'dial.projects',
    FLEET:'dial.fleet', HEALTH:'dial.health', CORPORATE:'dial.corporate', PLATFORM:'dial.platform',
    GMPC:'dial.gmpc', DKRF:'dial.dkrf',
  };
  for (const [module, profileId] of Object.entries(expected)) {
    const feature = features.find((x) => x.module === module);
    const profile = resolveProductDesignProfile({ repoDir, unit: { ...unit, feature_ids:[feature.feature_id] }, featureRecord: feature });
    expect(profile.artifact_id).toBe(profileId);
  }
});

test('canonical frontend generation context begins with the Screen Registry × Feature Graph', () => {
  const px = buildPx();
  const context = px.frontend_generation_context;
  expect(context.screen_context.target_screen_id).toBe(targetScreenId);
  expect(context.feature_context.feature_ids).toContain('SPARE-F001');
  expect(context.platform_context.target_application_id).toBe('DIAL_CONSUMER_WEB');
  expect(context.platform_context.applications.map((x) => x.application_id)).toEqual(['DIAL_CONSUMER_WEB']);
  expect(context.authority_refs.screen_feature_graph_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(context.design_authority.archetype_refs).toContain('DIAL_COMMERCE_DISCOVERY_EDITORIAL_HERO_V1');
  expect(context.screen_context.screens[0].role_boundary.role).toBe('DISCOVERY_NAVIGATION_CONTEXT_AND_LIGHT_MERCHANDISING');
  expect(context.completeness.provider_dispatch_ready).toBe(true);
});

test('required screen truth fails closed until authoritative hydration arrives', () => {
  const blocked = buildPx({ requestedTruth: ['vehicle.engine_code'] });
  expect(blocked.frontend_generation_context.completeness.provider_dispatch_ready).toBe(false);
  expect(blocked.frontend_generation_context.completeness.failures).toContain('MISSING_REQUIRED_TRUTH');

  const ready = buildPx({
    requestedTruth: ['vehicle.engine_code'],
    hydratedTruth: { facts: [{
      fact_id:'vehicle.engine_code', path:'vehicle.engine_code', value:'1GD-FTV',
      truth_class:'VERIFIED_FACT', source_id:'EPC_VEHICLE_CATALOG', provenance_ref:'epc:toyota:hilux:GUN126R',
    }] },
  });
  expect(ready.frontend_generation_context.completeness.provider_dispatch_ready).toBe(true);
  expect(ready.frontend_generation_context.truth.screen_truth_envelope.facts[0].value).toBe('1GD-FTV');
});

test('Stitch is the sole automatic frontend design provider and Figma is explicit-only', () => {
  expect(selectCanonicalFrontendDesignProvider({ repoDir, providerHealth:{stitch:'HEALTHY'} }).selected).toBe('google-stitch');
  const figmaAuto = selectCanonicalFrontendDesignProvider({ repoDir, requestedProvider:'figma', explicitProviderRequest:false });
  expect(figmaAuto.ok).toBe(false);
  expect(figmaAuto.reason).toBe('FIGMA_EXPLICIT_INVOCATION_REQUIRED');
  const figmaExplicit = selectCanonicalFrontendDesignProvider({ repoDir, requestedProvider:'figma', explicitProviderRequest:true });
  expect(figmaExplicit.ok).toBe(true);
  expect(figmaExplicit.selected).toBe('figma');
  const stitchDown = selectCanonicalFrontendDesignProvider({ repoDir, providerHealth:{stitch:'UNAVAILABLE'} });
  expect(stitchDown.ok).toBe(false);
  expect(stitchDown.automatic_fallback).toBe(false);
});

test('visual packet is compiled from screen, feature, platform, truth, capability and archetype authority', () => {
  const px = buildPx({
    requestedTruth:['vehicle.engine_code'],
    hydratedTruth:{facts:[{fact_id:'vehicle.engine_code',path:'vehicle.engine_code',value:'1GD-FTV',truth_class:'VERIFIED_FACT',source_id:'EPC_VEHICLE_CATALOG',provenance_ref:'epc:toyota:hilux:GUN126R'}]},
  });
  const brief = buildDesignBriefBundle({ projection:px, unit, taskId:'front-gen', instruction:'premium automotive discovery screen' });
  const packet = buildCanonicalStitchVisualPacket({ repoDir, fdep:px, brief, blindReferenceMode:true });
  expect(packet.provider).toBe('google-stitch');
  expect(packet.reference_policy).toBe('REFERENCE_IMAGE_ACCESS_FORBIDDEN');
  expect(packet.target_screen.screen_id).toBe(targetScreenId);
  expect(packet.verified_truth[0].value).toBe('1GD-FTV');
  expect(packet.design_authority.archetype_refs).toContain('DIAL_COMMERCE_DISCOVERY_EDITORIAL_HERO_V1');
  const prompt = renderStitchVisualProductionPrompt({ packet });
  expect(prompt).toMatch(/STITCH VISUAL GENERATION PASS/);
  expect(prompt).toMatch(/1GD-FTV/);
  expect(prompt).toMatch(/Screen role:/);
  expect(prompt).toMatch(/INTERACTION-READINESS PREFLIGHT/);
});

test('approved visual authority flows into a separate Stitch interaction and motion pass', () => {
  const px = buildPx();
  const frozen = freezeVisualAuthorityArtifact({
    generationContext:px.frontend_generation_context,
    candidate:{provider:'google-stitch',project_id:'p1',screen_id:'s1',response_hash:'a'.repeat(64),html_url:'stitch://html',image_url:'stitch://image'},
    critique:{verdict:'PASS'},
    truthLiteralLint:lintCandidateFacts({generationContext:px.frontend_generation_context,candidateFacts:[]}),
    designSynthesisLint:{status:'PASSED',content_hash:'e'.repeat(64)},
    promotedBy:'owner',
    promotionAuthority:'OWNER',
  });
  expect(frozen.ok).toBe(true);
  const packet = buildCanonicalInteractionMotionPacket({ repoDir, fdep:px, visualAuthority:frozen.visual_authority });
  expect(packet.preserve).toContain('approved_composition');
  expect(packet.required_outputs).toContain('MotionSpec');
  expect(renderInteractionMotionPrompt({packet})).toMatch(/approved visual identity is frozen/i);

  const interactionArtifact = {
    content_hash:'b'.repeat(64),
    interaction_intent_map:[{element:'category_rail',trigger:'swipe',behavior:'horizontal_scroll'}],
    gesture_map:[{element:'category_rail',gesture:'horizontal_swipe'}],
    motion_spec:[{element:'category_rail',motion:'snap',reduced_motion:'static'}],
    advanced_component_decisions:[{component:'category_rail',decision:'KEEP_SCROLLABLE_RAIL'}],
  };
  const allChecks = Object.fromEntries(['design_acuity_review_complete','pattern_decisions_complete','no_dead_controls','capability_backed','purposeful_motion','motion_hierarchy_coherent','touch_targets','keyboard_and_focus_where_relevant','accessibility_semantics','reduced_motion','performance_budget','state_restoration','gesture_conflicts_clear','interruptible_transitions','responsive_recomposition','edge_states_covered','platform_native_behavior','optical_polish_reviewed','structural_delta_within_budget','external_reference_non_authority'].map((x)=>[x,true]));
  const acceptance = buildInteractionAcceptanceMatrix({ interactionArtifact, checks:allChecks });
  expect(acceptance.passed).toBe(true);
  const experience = freezeExperienceAuthorityArtifact({
    generationContext:px.frontend_generation_context,
    visualAuthority:frozen.visual_authority,
    interactionArtifact,
    acceptance,
  });
  expect(experience.ok).toBe(true);
  expect(experience.experience_authority.productionization_policy).toBe('PRESERVE_EXPERIENCE_AUTHORITY_NO_REDESIGN');
});

test('candidate truth linter rejects factual invention even when the visual design is otherwise free', () => {
  const px = buildPx({
    requestedTruth:['vehicle.engine_code'],
    hydratedTruth:{facts:[{fact_id:'vehicle.engine_code',path:'vehicle.engine_code',value:'1GD-FTV',truth_class:'VERIFIED_FACT',source_id:'EPC_VEHICLE_CATALOG',provenance_ref:'epc:toyota:hilux:GUN126R'}]},
  });
  const pass = lintCandidateFacts({ generationContext:px.frontend_generation_context, candidateFacts:[{path:'vehicle.engine_code',value:'1GD-FTV'}] });
  expect(pass.status).toBe('PASSED');
  const fail = lintCandidateFacts({ generationContext:px.frontend_generation_context, candidateFacts:[{path:'vehicle.engine_power_kw',value:130}] });
  expect(fail.status).toBe('REJECTED');
  expect(fail.findings[0].finding_id).toMatch(/UNVERIFIED_FACT/);
});

test('productionization emits an explicit binding contract and forbids redesign', () => {
  const px = buildPx();
  const frozen = freezeVisualAuthorityArtifact({
    generationContext:px.frontend_generation_context,
    candidate:{provider:'google-stitch',project_id:'p1',screen_id:'s1',response_hash:'a'.repeat(64)},
    critique:{verdict:'PASS'}, truthLiteralLint:lintCandidateFacts({generationContext:px.frontend_generation_context,candidateFacts:[]}), designSynthesisLint:{status:'PASSED',content_hash:'e'.repeat(64)}, promotedBy:'owner', promotionAuthority:'OWNER',
  }).visual_authority;
  const acceptance = {passed:true,content_hash:'c'.repeat(64)};
  const exp = freezeExperienceAuthorityArtifact({
    generationContext:px.frontend_generation_context, visualAuthority:frozen,
    interactionArtifact:{content_hash:'b'.repeat(64)}, acceptance,
  }).experience_authority;
  const target = px.frontend_generation_context.screen_context.screens[0];
  const bindings = { actions:Object.fromEntries(target.action_refs.map((x)=>[x,`domain.${x}`])) };
  const contract = buildProductionBindingContract({generationContext:px.frontend_generation_context,experienceAuthority:exp,bindings});
  expect(contract.status).toBe('READY_FOR_PRODUCTIONIZATION');
  expect(contract.policy.redesign_forbidden).toBe(true);
  expect(contract.policy.preserve_visual_parity).toBe(true);
  expect(contract.policy.preserve_interaction_parity).toBe(true);
});

test('interaction/motion orchestration sends the frozen Stitch screen through a quarantined second provider pass', async () => {
  const px = buildPx();
  const frozen = freezeVisualAuthorityArtifact({
    generationContext:px.frontend_generation_context,
    candidate:{provider:'google-stitch',project_id:'project-1',screen_id:'screen-1',response_hash:'d'.repeat(64)},
    critique:{verdict:'PASS'}, truthLiteralLint:lintCandidateFacts({generationContext:px.frontend_generation_context,candidateFacts:[]}), designSynthesisLint:{status:'PASSED',content_hash:'e'.repeat(64)}, promotedBy:'owner', promotionAuthority:'OWNER',
  }).visual_authority;
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'dial-interaction-motion-'));
  const taskId='task-interaction-motion';
  const taskDir=path.join(root,'execution/tasks',taskId);
  fs.mkdirSync(taskDir,{recursive:true});
  fs.writeFileSync(path.join(taskDir,'frontend-design-execution-packet.json'),JSON.stringify({frontend_generation_context:px.frontend_generation_context},null,2));
  const proof={...frozen,repository_sha:execFileSync('git',['rev-parse','HEAD'],{cwd:repoDir,encoding:'utf8'}).trim(),task_id:taskId,surface_id:'DIAL_CONSUMER',frozen_at:'2026-09-19T18:30:00Z'};
  proof.evidence_hash=sha256({...proof,evidence_hash:undefined});
  fs.writeFileSync(path.join(taskDir,'visual-authority.json'),JSON.stringify(proof,null,2));
  const adapter={
    async health(){return {state:'HEALTHY'};},
    async refine(){return {project_id:'project-1',screen_id:'screen-2',html_url:'memory://html',image_url:'memory://image',response_hash:'e'.repeat(64)};},
  };
  const downloader=async(url)=>url.endsWith('html')
    ? {body:Buffer.from('<main><button>Add to cart</button></main>'),content_type:'text/html'}
    : {body:Buffer.from([1,2,3]),content_type:'image/png'};
  const record=await executeStitchInteractionMotionStage({repoDir,root,taskId,adapter,artifactDownloader:downloader,fdepGuard:()=>({ok:true,reasons:[]})});
  expect(record.phase).toBe('INTERACTION_AND_MOTION_ENRICHMENT');
  expect(record.visual_authority_hash).toBe(frozen.content_hash);
  expect(record.status).toBe('QUARANTINED_SAFE_REVIEW_REQUIRED');
  expect(record.provider_locator.screen_id).toBe('screen-2');
  expect(record.required_structured_outputs).toContain('MotionSpec');
  fs.rmSync(root,{recursive:true,force:true});
});
