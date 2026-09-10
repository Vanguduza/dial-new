#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRAPH_SCHEMA_VERSION, UNIT_SCHEMA_VERSION, canonical, hashObject, loadRegistry, projectTruthHash, registryHash, technicalStackFingerprint } from './knowledge-graph-core.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO=path.resolve(here,'../..');
const FEATURE_REL='agent-system/registries/FEATURE_REGISTRY.json';
const DECISION_REL='agent-system/registries/DECISION_LOG.json';
const CONTRACT_REL='docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json';
const BOUNDARY_REL='agent-system/registries/UNIT_BOUNDARY_POLICY.json';
const ROUTE_REL='agent-system/registries/KNOWLEDGE_ROUTE_REGISTRY.json';
const OUT_REL='agent-system/registries/DEVELOPMENT_UNIT_REGISTRY.json';

function uniqueSorted(xs){ return [...new Set((xs||[]).filter(Boolean).map(String))].sort(); }
function uiBearing(feature,contract){ return (feature.client_exposure && feature.client_exposure!=='INTERNAL') || (feature.app_families||[]).length>0 || (contract?.surfaces||[]).some((x)=>['DIAL_WEB','DIAL_CONSUMER','MANAGER','POS','DELIVERY'].includes(x)); }
function routeIds(feature,contract){ const out=['AUTHORITY','IMPLEMENTATION','VERIFICATION']; if(uiBearing(feature,contract)) out.push('PRODUCT_EXPERIENCE'); if(contract?.security_profile) out.push('SECURITY'); if((contract?.supporting_capability_refs||[]).length || contract?.api_contract) out.push('DEPENDENCY'); return uniqueSorted(out); }
function decisionsFor(featureId, decisions){ return decisions.filter((d)=>d.status==='LOCKED' && ((d.enforced_by||[]).includes(featureId) || d.decision_id==='DEC-026')); }
function contractId(featureId){ return `FRC:${featureId}`; }
function contractFingerprint(row){ return hashObject(row || {feature_id:null}); }

export function deriveDevelopmentUnits(repoDir=DEFAULT_REPO){
 const features=loadRegistry(repoDir,FEATURE_REL,[]); const decisions=loadRegistry(repoDir,DECISION_REL,[]); const contracts=loadRegistry(repoDir,CONTRACT_REL,[]); const policy=loadRegistry(repoDir,BOUNDARY_REL,{}); const routePolicyHash=registryHash(repoDir,ROUTE_REL); const truth=projectTruthHash(repoDir); const stack=technicalStackFingerprint(repoDir); const byContract=new Map(contracts.map((c)=>[c.feature_id,c]));
 const units=features.map((feature)=>{
   const contract=byContract.get(feature.feature_id)||null; const featureIds=uniqueSorted([feature.feature_id]); const facets=uniqueSorted([feature.realization_ref || `FR-${feature.feature_id}`]);
   const lineage=hashObject({project_identity:policy.project_identity,canonical_feature_membership:featureIds,canonical_realization_facet_membership:facets,canonical_unit_boundary_policy_id:policy.policy_id});
   const applicable=decisionsFor(feature.feature_id,decisions); const decisionHashes=applicable.map(hashObject).sort(); const frcHashes=[hashObject(feature),contractFingerprint(contract)].sort();
   const consumedIds=uniqueSorted(contract?.supporting_capability_refs||[]); const consumedFingerprints=consumedIds.map((id)=>{ const c=byContract.get(id); return {contract_id:contractId(id),fingerprint:c?contractFingerprint(c):hashObject({unresolved_contract_ref:id})}; });
   const produced=[{contract_id:contractId(feature.feature_id),fingerprint:contractFingerprint(contract)}]; const dependencyFingerprints=[...consumedFingerprints,...produced].map((x)=>x.fingerprint).sort();
   const truthSlice=hashObject({project_truth_hash:truth,feature:feature.feature_id,feature_hash:hashObject(feature),contract_hash:contractFingerprint(contract),applicable_decision_hashes:decisionHashes});
   const revision=hashObject({unit_lineage_id:lineage,applicable_project_truth_slice_hash:truthSlice,applicable_locked_decision_hashes:decisionHashes,feature_frc_revision_hashes:frcHashes,technical_stack_fingerprint:stack,dependency_contract_fingerprints:dependencyFingerprints,knowledge_route_policy_version:routePolicyHash,graph_schema_version:GRAPH_SCHEMA_VERSION,unit_schema_version:UNIT_SCHEMA_VERSION});
   return {
     unit_lineage_id:`DU-LIN-${lineage.slice(0,24)}`, unit_revision_hash:revision, unit_schema_version:UNIT_SCHEMA_VERSION,
     feature_ids:featureIds, realization_facets:facets, objective:feature.outcome || feature.feature_id,
     scope:{includes:[`Feature ${feature.feature_id}`, ...facets],excludes:[]}, affected_paths:uniqueSorted(feature.code_paths||[]),
     upstream_dependencies:consumedIds, downstream_consumers:[], shared_authority_nodes:uniqueSorted([feature.owner,contract?.domain_owner]),
     contracts_consumed:consumedFingerprints, contracts_produced:produced, contract_fingerprints:dependencyFingerprints,
     applicable_project_truth_slice_hash:truthSlice, applicable_decision_hashes:decisionHashes, applicable_decision_ids:applicable.map((x)=>x.decision_id).sort(), technical_stack_fingerprint:stack,
     implementation_questions:[], knowledge_route_ids:routeIds(feature,contract), knowledge_route_policy_version:routePolicyHash,
     design_authorities:uiBearing(feature,contract)?['PREMIUM_SOLUTIONS_ENVIRONMENT']:[], eventualities:uniqueSorted(contract?.eventuality_refs||[]), security_controls:contract?.security_profile?[contract.security_profile]:[], donor_refs:uniqueSorted(feature.donor_refs||contract?.donor_refs||[]),
     required_resources:[], verification_requirements:{test_paths:uniqueSorted(feature.test_paths||[]),acceptance_contract:contract?.acceptance_contract||[]},
     knowledge_readiness_state:'UNMAPPED', knowledge_blocking_reasons:[], knowledge_exemption:null, graph_revision_hash:null, knowledge_resolution_trace_id:null,
     source_projection:{feature_ref:FEATURE_REL,feature_id:feature.feature_id,feature_hash:hashObject(feature),contract_ref:CONTRACT_REL,contract_hash:contractFingerprint(contract)},
   };
 }).sort((a,b)=>a.unit_lineage_id.localeCompare(b.unit_lineage_id));
 // Resolve downstream unit lineage references without changing lineage identity.
 const byFeature=new Map(units.flatMap((u)=>u.feature_ids.map((id)=>[id,u.unit_lineage_id])));
 for(const u of units){ u.upstream_dependencies=uniqueSorted(u.upstream_dependencies.map((id)=>byFeature.get(id)||id)); }
 for(const u of units){ for(const upstream of u.upstream_dependencies){ const target=units.find((x)=>x.unit_lineage_id===upstream); if(target) target.downstream_consumers=uniqueSorted([...target.downstream_consumers,u.unit_lineage_id]); } }
 return {schema_version:1,policy_version:'vekl-2.2-rev2',unit_boundary_policy_id:policy.policy_id,membership_order:policy.membership_order,project_truth_hash:truth,technical_stack_fingerprint:stack,knowledge_route_policy_hash:routePolicyHash,units};
}

export function writeDevelopmentUnitRegistry(repoDir=DEFAULT_REPO){ const value=deriveDevelopmentUnits(repoDir); fs.writeFileSync(path.join(repoDir,OUT_REL),JSON.stringify(value,null,2)+'\n'); return value; }
export function checkDevelopmentUnitRegistry(repoDir=DEFAULT_REPO){ const expected=deriveDevelopmentUnits(repoDir); const actual=loadRegistry(repoDir,OUT_REL,null); const ok=actual && JSON.stringify(canonical(actual))===JSON.stringify(canonical(expected)); return {ok,units:expected.units.length,expected_hash:hashObject(expected),actual_hash:actual?hashObject(actual):null}; }

if(import.meta.url===`file://${process.argv[1]}`){ const cmd=process.argv[2]||'check'; if(cmd==='write') console.log(JSON.stringify({status:'WRITTEN',...writeDevelopmentUnitRegistry().units.length&&{units:deriveDevelopmentUnits().units.length}},null,2)); else { const r=checkDevelopmentUnitRegistry(); console.log(JSON.stringify(r,null,2)); if(!r.ok) process.exitCode=1; } }
