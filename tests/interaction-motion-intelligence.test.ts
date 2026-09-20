// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildFrontendProductExperienceProjection } from '../agent-system/orchestration/frontend-product-experience.mjs';
import { freezeVisualAuthorityArtifact, buildStitchVisualProductionPacket, buildInteractionMotionEnrichmentPacket } from '../agent-system/orchestration/frontend-generation-architecture.mjs';
import { compileInteractionDesignPreflight, compileInteractionMotionIntelligence, validateInteractionArtifactAgainstIntelligence } from '../agent-system/orchestration/interaction-motion-intelligence.mjs';
import { extractInteractionContractFromHtml } from '../agent-system/orchestration/stitch-design-orchestration.mjs';

const repoDir=path.resolve(process.cwd());
const features=JSON.parse(fs.readFileSync(path.join(repoDir,'docs/dial/final-audit/11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json'),'utf8'));
const unit=(featureId)=>({unit_lineage_id:`DU-TEST-${featureId}`,unit_revision_hash:'rev1',feature_ids:[featureId],knowledge_route_ids:['PRODUCT_EXPERIENCE']});
function projection(featureId,targetScreenId,instruction){
  const feature=features.find((x)=>x.feature_id===featureId);
  return buildFrontendProductExperienceProjection({repoDir,unit:unit(featureId),featureRecord:feature,targetScreenId,instruction,affectedPaths:['apps/test/Screen.tsx']});
}
function frozen(ctx){
  return freezeVisualAuthorityArtifact({
    generationContext:ctx,candidate:{provider:'google-stitch',project_id:'p',screen_id:'s',response_hash:'a'.repeat(64)},
    critique:{verdict:'PASS'},promotedBy:'test',promotionAuthority:'AUTHORIZED_DESIGN_AUTHORITY'
  }).visual_authority;
}
const ids=(rows)=>new Set((rows||[]).map((x)=>x.pattern_id));
function completeArtifact(intel){
  const patternIds=[...(intel.required_considerations||[]),...(intel.strong_candidates||[])].map((x)=>x.pattern_id);
  return {
    design_acuity_assessment:{status:'PASS'},
    interaction_opportunity_map:[],
    pattern_decision_set:patternIds.map((pattern_id)=>({pattern_id,decision:'REJECT',rationale:'Reviewed and not needed for this synthetic verification artifact.'})),
    interaction_intent_map:[],gesture_map:[],motion_hierarchy_plan:[],motion_spec:[],advanced_component_decisions:[],
    responsive_interaction_plan:[],state_behavior_matrix:[],
    structural_delta_decision:{classification:'WITHIN_BOUNDED_DELTA',action:'CONTINUE'},
    interaction_risk_register:[],interaction_acceptance_matrix:{status:'PASS'},candidate_facts:[],
  };
}

describe('VEKL interaction/motion design acuity',()=>{
  test('Android commerce discovery selects native/responsive/feedback knowledge without professional-desktop pattern soup',()=>{
    const px=projection('SPARE-F001','SCREEN:SPARE:SPARE_HOME_ENTRY','Design the DIAL A SPARE discovery home');
    const pf=compileInteractionDesignPreflight({repoDir,generationContext:px.frontend_generation_context});
    const selected=ids([...(pf.required_considerations||[]),...(pf.strong_candidates||[]),...(pf.additional_candidates||[])]);
    expect(selected).toContain('PATTERN_PREDICTIVE_BACK');
    expect(selected).toContain('PATTERN_EDGE_TO_EDGE_SYSTEM_UI');
    expect(selected).toContain('PATTERN_RESPONSIVE_RECOMPOSITION');
    expect(selected).toContain('PATTERN_HORIZONTAL_CONTENT_RAIL');
    expect(selected).not.toContain('PATTERN_COMMAND_PALETTE');
    expect(selected).not.toContain('PATTERN_MULTI_ZONE_SHELL');
    expect(pf.open_world_discovery_brief.admission_required_before_guidance).toBe(true);
  });

  test('professional web detail surface selects SaaS/workspace patterns without Android-only interaction patterns',()=>{
    const px=projection('CORP-F001','SCREEN:CORPORATE:ORGANISATION_POSITIONS_COST_CENTRES_DETAIL_STATE','Design the corporate organisation detail workspace for staff web');
    const pf=compileInteractionDesignPreflight({repoDir,generationContext:px.frontend_generation_context});
    const selected=ids([...(pf.required_considerations||[]),...(pf.strong_candidates||[]),...(pf.additional_candidates||[])]);
    expect(selected).toContain('PATTERN_COMMAND_PALETTE');
    expect(selected).toContain('PATTERN_PERSISTENT_WORKSPACE_PANEL');
    expect(selected).toContain('PATTERN_MULTI_ZONE_SHELL');
    expect(selected).not.toContain('PATTERN_PREDICTIVE_BACK');
    expect(selected).not.toContain('PATTERN_HAPTIC_FEEDBACK');
  });

  test('interaction preflight is injected into visual generation so motion is not postponed until after visual freeze',()=>{
    const px=projection('SPARE-F001','SCREEN:SPARE:SPARE_HOME_ENTRY','Design the DIAL A SPARE discovery home');
    const ctx=px.frontend_generation_context;
    const pf=compileInteractionDesignPreflight({repoDir,generationContext:ctx});
    const packet=buildStitchVisualProductionPacket({generationContext:ctx,designBrief:{content_hash:'brief'},interactionPreflight:pf});
    expect(packet.interaction_design_preflight.content_hash).toBe(pf.content_hash);
    expect(packet.instructions.join(' ')).toMatch(/Interaction is part of the design/i);
  });

  test('post-freeze intelligence requires expert acuity, rationalized pattern decisions and bounded structural delta',()=>{
    const px=projection('SPARE-F001','SCREEN:SPARE:SPARE_HOME_ENTRY','Design the DIAL A SPARE discovery home');
    const ctx=px.frontend_generation_context;
    const pf=compileInteractionDesignPreflight({repoDir,generationContext:ctx});
    const va=frozen(ctx);
    const intel=compileInteractionMotionIntelligence({repoDir,generationContext:ctx,visualAuthority:va,preflight:pf});
    expect(intel.expert_role).toBe('PRINCIPAL_PRODUCT_DESIGN_ENGINEER_AND_INTERACTION_MOTION_SPECIALIST');
    expect(intel.decision_contract.rationale_required).toBe(true);
    expect(intel.structural_delta_policy.silent_redesign_forbidden).toBe(true);
    expect(intel.required_outputs).toContain('DesignAcuityAssessment');
    expect(intel.required_outputs).toContain('ResponsiveInteractionPlan');
    const packet=buildInteractionMotionEnrichmentPacket({generationContext:ctx,visualAuthority:va,intelligence:intel});
    expect(packet.interaction_intelligence_hash).toBe(intel.content_hash);
  });

  test('expert artifact fails when required pattern decisions are omitted',()=>{
    const px=projection('SPARE-F001','SCREEN:SPARE:SPARE_HOME_ENTRY','Design the DIAL A SPARE discovery home');
    const ctx=px.frontend_generation_context; const pf=compileInteractionDesignPreflight({repoDir,generationContext:ctx}); const va=frozen(ctx);
    const intel=compileInteractionMotionIntelligence({repoDir,generationContext:ctx,visualAuthority:va,preflight:pf});
    const artifact=completeArtifact(intel); artifact.pattern_decision_set=[];
    const result=validateInteractionArtifactAgainstIntelligence({intelligence:intel,interactionArtifact:artifact});
    expect(result.ok).toBe(false);
    expect(result.failures.some((x)=>x.startsWith('PATTERN_DECISION_MISSING:'))).toBe(true);
  });

  test('major hierarchy change cannot hide inside the enrichment pass and must return to visual reconvergence',()=>{
    const px=projection('SPARE-F001','SCREEN:SPARE:SPARE_HOME_ENTRY','Design the DIAL A SPARE discovery home');
    const ctx=px.frontend_generation_context; const pf=compileInteractionDesignPreflight({repoDir,generationContext:ctx}); const va=frozen(ctx);
    const intel=compileInteractionMotionIntelligence({repoDir,generationContext:ctx,visualAuthority:va,preflight:pf});
    const artifact=completeArtifact(intel); artifact.structural_delta_decision={classification:'BEYOND_BOUNDED_DELTA',action:'CONTINUE'};
    expect(validateInteractionArtifactAgainstIntelligence({intelligence:intel,interactionArtifact:artifact}).failures).toContain('UNSAFE_STRUCTURAL_DELTA');
    artifact.structural_delta_decision.action='RETURN_TO_VISUAL_RECONVERGENCE';
    expect(validateInteractionArtifactAgainstIntelligence({intelligence:intel,interactionArtifact:artifact}).ok).toBe(true);
  });

  test('Stitch embedded interaction contract is deterministic and machine-readable',()=>{
    const payload={design_acuity_assessment:{status:'PASS'},pattern_decision_set:[]};
    const html=`<html><body><script id="dial-interaction-contract" type="application/json">${JSON.stringify(payload)}</script></body></html>`;
    const parsed=extractInteractionContractFromHtml(html);
    expect(parsed.found).toBe(true); expect(parsed.status).toBe('PARSED'); expect(parsed.value).toEqual(payload); expect(parsed.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(extractInteractionContractFromHtml('<main>No contract</main>').status).toBe('MISSING');
    expect(extractInteractionContractFromHtml('<script id="dial-interaction-contract" type="application/json">{oops}</script>').status).toBe('INVALID_JSON');
  });

  test('source registry is reference-only and never grants external implementation/design authority',()=>{
    const reg=JSON.parse(fs.readFileSync(path.join(repoDir,'agent-system/registries/INTERACTION_MOTION_SOURCE_REGISTRY.json'),'utf8'));
    expect(reg.sources.length).toBeGreaterThanOrEqual(20);
    for(const row of reg.sources){expect(row.production_import_allowed,row.source_id).toBe(false);expect(row.design_authority_allowed,row.source_id).toBe(false);expect(row.visual_authority_allowed,row.source_id).toBe(false);}
  });
});
