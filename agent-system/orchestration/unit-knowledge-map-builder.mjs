#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONTROL_HOME, readJson, writeJsonAtomic } from './state-store.mjs';
import { findUnit, hashObject, loadRegistry, now } from './knowledge-graph-core.mjs';
import { resolveGraphRag } from './graph-retrieval-router.mjs';
import { productExperienceKnowledge } from './product-experience-knowledge-gate.mjs';
import { buildFrontendProductExperienceProjection } from './frontend-product-experience.mjs';
import { projectFrontendDonorDecision } from './frontend-donor-projection.mjs';
import { compileFrontendGraphProjection } from './frontend-graph-projection.mjs';
import { resolveStructuralReality } from './structural-reality.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)); export const DEFAULT_REPO=path.resolve(here,'../..');
function uniq(v){return [...new Set((v||[]).filter(Boolean).map(String))].sort();}
export function buildUnitKnowledgeMap({repoDir=DEFAULT_REPO,root=DEFAULT_CONTROL_HOME,featureId=null,unitId=null,instruction='',affectedPaths=[],availableTools=[]}={}){
 const unit=findUnit(repoDir,unitId||featureId);if(!unit)throw new Error(`Development Unit not found: ${unitId||featureId}`);
 const graph=resolveGraphRag({repoDir,root,featureId,unitId:unit.unit_lineage_id,instruction,affectedPaths,availableTools});
 const features=loadRegistry(repoDir,'agent-system/registries/FEATURE_REGISTRY.json',[]);
 const contracts=loadRegistry(repoDir,'docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json',[]);
 const decisions=loadRegistry(repoDir,'agent-system/registries/DECISION_LOG.json',[]);
 const featureRows=features.filter((f)=>unit.feature_ids.includes(f.feature_id));
 const contractRows=contracts.filter((c)=>unit.feature_ids.includes(c.feature_id));
 const decisionRows=decisions.filter((d)=>unit.applicable_decision_ids?.includes(d.decision_id));
 const featureRecord=featureRows[0]||null,contractRecord=contractRows[0]||null;
 const donorIds=uniq([...(featureRecord?.donor_refs||[]),...(contractRecord?.donor_refs||[])]);
 const donorProjections=donorIds.map((donorId)=>projectFrontendDonorDecision({repoDir,donorId,unit})).filter((x)=>x.applicable);
 const frontend=buildFrontendProductExperienceProjection({repoDir,unit,featureRecord,contractRecord,instruction,affectedPaths,donorProjection:donorProjections[0]||null});
 if(frontend.applicable){frontend.donor_frontend_reuse_projections=donorProjections;frontend.product_experience_subgraph=compileFrontendGraphProjection({repoDir,unit,projection:frontend,featureRecord,contractRecord});frontend.projection_hash=hashObject({...frontend,projection_hash:null});}
 const px=productExperienceKnowledge({unit,featureRecord,contractRecord,frontendProjection:frontend});
 const structural=resolveStructuralReality({repoDir,root,unit,instruction,frontendProjection:frontend});
 const critical=(readJson('knowledge/research/challenges/index.json',{challenges:[]},root).challenges||[]).filter((c)=>['REVIEW_REQUIRED','CANON_DELTA_AUTHORIZED'].includes(c.status)&&c.severity==='CRITICAL'&&(c.affected_unit_lineages||[]).includes(unit.unit_lineage_id));
 const blocking=[];if(critical.length)for(const c of critical)blocking.push({type:'PROJECT_TRUTH_CHALLENGE',ref:c.challenge_id,severity:'CRITICAL'});if(!featureRows.length)blocking.push({type:'MISSING_AUTHORITY',ref:'FEATURE_REGISTRY'});if(!contractRows.length)blocking.push({type:'MISSING_FRC',ref:unit.feature_ids[0]});if(px.applicable&&!(unit.design_authorities||[]).length)blocking.push({type:'MISSING_PRODUCT_EXPERIENCE_AUTHORITY',ref:unit.unit_lineage_id});
 const warnings=[];if(frontend.applicable&&frontend.surface_manifest?.surfaces?.some((x)=>x.source==='UNIT_DERIVED_PENDING_FRC_SCREEN_DETAIL'))warnings.push({type:'FRONTEND_SURFACE_DETAIL_DERIVED',ref:unit.unit_lineage_id});if(frontend.applicable&&frontend.product_experience_subgraph?.declared_missing?.user_journey)warnings.push({type:'USER_JOURNEY_NOT_DECLARED',ref:unit.unit_lineage_id});if(structural.state==='MISSING_ADVISORY')warnings.push({type:'STRUCTURAL_REALITY_SNAPSHOT_MISSING_ADVISORY',ref:unit.unit_lineage_id});if(structural.state==='STALE_SOURCE')blocking.push({type:'STALE_STRUCTURAL_REALITY',ref:structural.snapshot_hash||unit.unit_lineage_id,severity:'CRITICAL'});
 const state=blocking.length?'BLOCKED':'READY';
 const map={schema_version:1,map_version:'vekl-unit-map-1',unit_lineage_id:unit.unit_lineage_id,unit_revision_hash:unit.unit_revision_hash,graph_generation_id:graph.graph_generation_id,graph_revision_hash:graph.graph_revision_hash,graph_neighbourhood_hash:graph.graph_neighbourhood_hash,authority_map:{project_truth_slice_hash:unit.applicable_project_truth_slice_hash,feature_refs:featureRows.map((x)=>({feature_id:x.feature_id,hash:hashObject(x)})),decision_refs:decisionRows.map((x)=>({decision_id:x.decision_id,hash:hashObject(x)})),security_profiles:contractRows.map((x)=>x.security_profile).filter(Boolean)},dependency_map:{upstream_dependencies:unit.upstream_dependencies,downstream_consumers:unit.downstream_consumers,contracts_consumed:unit.contracts_consumed,contracts_produced:unit.contracts_produced,invalidation_boundaries:['PROJECT_TRUTH','DECISION','CONTRACT','STACK','KNOWLEDGE_ROUTE','GRAPH_GENERATION','DESIGN_AUTHORITY','FRONTEND_REGISTRY','FDEP','VRDE','STRUCTURAL_SOURCE','STRUCTURAL_SNAPSHOT','STRUCTURAL_PROVIDER']},implementation_map:{objective:unit.objective,affected_paths:unit.affected_paths,api_contracts:contractRows.map((x)=>x.api_contract).filter(Boolean),recommended_sequence:['resolve current authority','confirm consumed contracts','resolve Product Experience/FDEP when UI-bearing','resolve current structural reality and impact envelope','implement bounded unit','run unit/integration/security/experience verification','emit Contract Delta and fresh evidence']},resource_map:{knowledge_route_ids:graph.knowledge_route_ids,eligible_resource_ids:graph.eligible_resource_ids,candidates:graph.candidates},product_experience_map:px,structural_reality_map:structural,risk_eventuality_map:{eventualities:unit.eventualities,security_controls:unit.security_controls},verification_map:unit.verification_requirements,knowledge_readiness_state:state,knowledge_blocking_reasons:blocking,knowledge_warnings:warnings,knowledge_exemption:null,determinism_envelope_hash:graph.determinism_envelope_hash,created_at:now()};
 map.map_hash=hashObject({...map,map_hash:null,created_at:null});writeJsonAtomic(`knowledge/graph/units/${unit.unit_lineage_id}/${unit.unit_revision_hash}.json`,map,root);writeJsonAtomic(`knowledge/graph/units/${unit.unit_lineage_id}/current.json`,{unit_lineage_id:unit.unit_lineage_id,unit_revision_hash:unit.unit_revision_hash,map_hash:map.map_hash,map_rel:`knowledge/graph/units/${unit.unit_lineage_id}/${unit.unit_revision_hash}.json`,updated_at:now()},root);return{map,graph};
}
if(import.meta.url===`file://${process.argv[1]}`){console.log(JSON.stringify(buildUnitKnowledgeMap({featureId:process.argv[2],instruction:process.argv.slice(3).join(' ')}).map,null,2));}
