import { DEFAULT_CONTROL_HOME, readJson, writeJsonAtomic } from './state-store.mjs';
import { findUnit, hashObject } from './knowledge-graph-core.mjs';
import { buildDesignBriefBundle, buildFrontendProductExperienceProjection, frontendRegistryHashes } from './frontend-product-experience.mjs';
import { buildCreativeScreenGenerationStrategy, CREATIVE_STRATEGY_VERSION } from './frontend-creative-strategy.mjs';

function now(){return new Date().toISOString();}
function uniq(v){return [...new Set((v||[]).filter(Boolean).map(String))].sort();}

export function compileFrontendDesignExecutionPacket({repoDir,root=DEFAULT_CONTROL_HOME,taskId,unitMap,triage,instruction='',affectedPaths=[],ownerAuthorityRef=null,donorProjection=null,changeBudget=null}={}){
  if(!repoDir||!taskId||!unitMap||!triage) throw new Error('complete FDEP inputs required');
  const unit=findUnit(repoDir,unitMap.unit_lineage_id);
  if(!unit||unit.unit_revision_hash!==unitMap.unit_revision_hash) throw new Error('FDEP refuses stale unit revision');
  const px=unitMap.product_experience_map?.frontend_projection || unitMap.product_experience_map?.frontend || null;
  if(!px?.applicable) return {applicable:false,state:'NOT_APPLICABLE',task_id:taskId,unit_lineage_id:unit.unit_lineage_id};
  if(px.presentation_decision?.renderer_id==='UNRESOLVED') throw new Error('FRONTEND_RENDERER_UNRESOLVED');
  if(px.visual_render_determinism_envelope?.status!=='RESOLVED') throw new Error('FRONTEND_RENDER_DETERMINISM_UNRESOLVED');
  const registryHashes=frontendRegistryHashes(repoDir);
  const budget=changeBudget || {
    schema_version:1,
    artifact_type:'ChangeBudget',
    allowed_structural_delta:'MINIMUM_NECESSARY',
    new_component_ids:[],
    new_token_ids:[],
    new_pattern_ids:[],
    approved_visual_delta_refs:[],
    approved_experience_enhancement_refs:[],
    unapproved_authority_delta_allowed:false,
  };
  budget.content_hash=budget.content_hash||hashObject({...budget,content_hash:null});
  const content={
    schema_version:1,
    fdep_version:'dial-fdep-1.1',
    artifact_type:'FrontendDesignExecutionPacket',
    artifact_id:`fdep:${taskId}`,
    task_id:taskId,
    unit_lineage_id:unit.unit_lineage_id,
    unit_revision_hash:unit.unit_revision_hash,
    unit_map_hash:unitMap.map_hash,
    owner_authority_ref:ownerAuthorityRef,
    instruction_hash:hashObject(String(instruction||'')),
    affected_paths:uniq(affectedPaths),
    generic_task_archetype:triage.archetype,
    triage_result_hash:triage.triage_result_hash,
    product_design_profile:px.product_design_profile,
    surface_manifest:px.surface_manifest,
    screen_feature_projection:px.screen_feature_projection,
    target_screen_resolution:px.target_screen_resolution || null,
    frontend_generation_context:px.frontend_generation_context,
    surface_state_matrix:px.surface_state_matrix,
    visual_reference_spec:px.visual_reference_spec,
    presentation_decision:px.presentation_decision,
    visual_render_determinism_envelope:px.visual_render_determinism_envelope,
    registry_hashes:registryHashes,
    template_ids:px.presentation_decision?.template_ids||[],
    external_reference_inspiration_projection:donorProjection || px.external_reference_inspiration_projections?.[0] || null,
    external_reference_inspiration_projections:px.external_reference_inspiration_projections || (donorProjection?[donorProjection]:[]),
    // Legacy fields are intentionally empty after DEC-039. External repositories never become reuse authority.
    donor_frontend_reuse_projection:null,
    donor_frontend_reuse_projections:[],
    change_budget:budget,
    acceptance:{
      existing_product_experience_hard_gate:true,
      existing_product_experience_qualitative_gate:true,
      visual_gates:['V1_STRUCTURAL','V2_GEOMETRY','V3_TYPOGRAPHY','V4_ASSETS','V5_PERCEPTUAL','V6_DELTA_PROVENANCE','V7_RESPONSIVE_IDENTITY','V8_AUTHORITY_SIGNOFF'],
      accessibility:true,
      performance:true,
      security:true,
      domain_truth:true,
      screen_feature_graph:true,
      frontend_generation_context:true,
      truth_hydration_before_provider_dispatch:true,
      state_matrix_coverage:true,
      interaction_motion_enrichment:true,
      visual_authority_freeze:true,
      experience_authority_freeze:true,
      design_lint:true,
      visual_parity:true,
      interaction_parity:true,
      functional_parity:true,
    },
    authority_constraints:{
      project_truth_superior:true,
      frc_superior:true,
      domain_security_superior:true,
      visual_authority_superior:true,
      provider_output_authoritative:false,
      automatic_design_provider:'google-stitch',
      figma_invocation:'EXPLICIT_OWNER_OR_AUTHORIZED_TASK_ONLY',
      automatic_provider_fallback_forbidden:true,
      productionization_may_redesign:false,
      external_repositories_reference_and_inspiration_only:true,
      external_repository_code_import_forbidden:true,
      external_repository_design_authority_forbidden:true,
      autonomous_canon_mutation:false,
    },
    status:px.frontend_generation_context?.completeness?.provider_dispatch_ready === true ? 'READY_FOR_STITCH_VISUAL_GENERATION' : 'READY_AWAITING_SCREEN_TRUTH_COMPLETENESS',
    provenance:{unit_map_hash:unitMap.map_hash,frontend_projection_hash:px.projection_hash||null,screen_feature_graph_hash:px.frontend_generation_context?.authority_refs?.screen_feature_graph_hash||null,frontend_generation_context_hash:px.frontend_generation_context?.content_hash||null,knowledge_resolution:'VEKL_PRODUCT_EXPERIENCE',authority_flow:'PROJECT_TRUTH_TO_SCREEN_FEATURE_GRAPH_TO_DOMAIN_TRUTH_TO_VEKL_TO_FDEP_TO_STITCH'},
    created_at:now(),
  };
  const brief=buildDesignBriefBundle({projection:px,unit,taskId,ownerAuthorityRef,instruction});
  const creativeSurfaces=Object.fromEntries((content.surface_manifest?.surfaces||[]).map((surface)=>{
    const strategy=buildCreativeScreenGenerationStrategy({fdep:content,brief,surfaceId:surface.surface_id});
    return [surface.surface_id,strategy];
  }));
  content.creative_screen_generation={
    strategy_version:CREATIVE_STRATEGY_VERSION,
    surfaces:creativeSurfaces,
    content_hash:hashObject(Object.fromEntries(Object.entries(creativeSurfaces).map(([id,strategy])=>[id,strategy.content_hash]))),
  };
  const packet={...content,content_hash:hashObject({...content,created_at:null})};
  writeJsonAtomic('execution/tasks/'+taskId+'/frontend-design-execution-packet.json',packet,root);
  if(brief) writeJsonAtomic('execution/tasks/'+taskId+'/design-brief-bundle.json',brief,root);
  writeJsonAtomic('execution/tasks/'+taskId+'/creative-screen-generation.json',content.creative_screen_generation,root);
  return packet;
}

export function checkFrontendDesignExecutionPacket({repoDir,root=DEFAULT_CONTROL_HOME,packet}={}){
  if(!packet||packet.applicable===false) return {ok:packet?.applicable===false,reasons:packet?.applicable===false?[]:['FDEP_MISSING']};
  const reasons=[];
  const unit=findUnit(repoDir,packet.unit_lineage_id);
  if(!unit||unit.unit_revision_hash!==packet.unit_revision_hash) reasons.push('UNIT_REVISION_CHANGED');
  const currentRegistryHashes=frontendRegistryHashes(repoDir);
  for(const [key,cur] of Object.entries(currentRegistryHashes)) if(packet.registry_hashes?.[key]?.hash!==cur.hash) reasons.push(`FRONTEND_REGISTRY_CHANGED:${key}`);
  const stored=readJson(`execution/tasks/${packet.task_id}/frontend-design-execution-packet.json`,null,root);
  if(!stored||stored.content_hash!==packet.content_hash) reasons.push('FDEP_POINTER_CHANGED');
  if(stored?.status==='SUPERSEDED') reasons.push('FDEP_SUPERSEDED');
  if(!packet.screen_feature_projection?.content_hash) reasons.push('SCREEN_FEATURE_PROJECTION_MISSING');
  if(!packet.frontend_generation_context?.content_hash) reasons.push('FRONTEND_GENERATION_CONTEXT_MISSING');
  if(packet.frontend_generation_context?.authority_refs?.screen_feature_graph_hash !== packet.registry_hashes?.screenFeatureGraph?.hash) reasons.push('SCREEN_FEATURE_GRAPH_BINDING_MISMATCH');
  return {ok:reasons.length===0,state:reasons.length?'REFUSED_STALE_FRONTEND_PACKET':'CURRENT',reasons};
}

export function recompileFrontendProjectionForFreshness({repoDir,unitMap,instruction='',affectedPaths=[]}={}){
  const unit=findUnit(repoDir,unitMap.unit_lineage_id);
  if(!unit) return null;
  return buildFrontendProductExperienceProjection({repoDir,unit,instruction,affectedPaths});
}
