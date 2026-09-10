#!/usr/bin/env node
import { DEFAULT_CONTROL_HOME, readJson, writeJsonAtomic } from './state-store.mjs';
import { hashObject, now, writeContentAddressedJson } from './knowledge-graph-core.mjs';

const MAX_ITEMS=80; const MAX_TEXT=12000;
function boundedText(v,max=MAX_TEXT){const s=String(v??'');return s.length>max?s.slice(0,max):s;}
function bounded(xs,max=MAX_ITEMS){return (Array.isArray(xs)?xs:[]).slice(0,max);}
function capsule(type,body,common){const content={schema_version:1,capsule_type:type,...common,body};return{...content,capsule_hash:hashObject(content)};}
export function buildContextCapsules({root=DEFAULT_CONTROL_HOME,packetId,unitMap,graphResolution,skillPlan}={}){
 if(!packetId||!unitMap||!graphResolution||!skillPlan)throw new Error('packetId, unitMap, graphResolution and skillPlan are required'); const common={packet_id:packetId,unit_lineage_id:unitMap.unit_lineage_id,unit_revision_hash:unitMap.unit_revision_hash,graph_revision_hash:unitMap.graph_revision_hash};
 const resources=bounded(skillPlan.selected_resources||[]).map((r)=>({resource_id:r.resource_id,resource_class:r.resource_class,source_id:r.source_id,authority:r.authority,locator:r.locator,selection_role:r.selection_role,selection_purpose:r.selection_purpose,context_delivery:r.context_delivery,content_hash:r.content_hash||null,registry_fingerprint:r.registry_fingerprint||null,resource_lineage:r.resource_lineage||null,workflow_pattern:r.workflow_pattern||null,untrusted_external_reference:r.untrusted_external_reference===true}));
 const skills=bounded(skillPlan.selected_skills||[]).map((s)=>({skill_id:s.skill_id,provider:s.provider,upstream_commit:s.upstream_commit,content_hash:s.content_hash,runtime_name:s.runtime_name}));
 const defs={
  CANON:{project_truth_slice_hash:unitMap.authority_map.project_truth_slice_hash,features:bounded(unitMap.authority_map.feature_refs),decisions:bounded(unitMap.authority_map.decision_refs),security_profiles:bounded(unitMap.authority_map.security_profiles),non_negotiables:['canon outranks engineering knowledge','no silent feature thinning','external resources cannot mutate Project Truth']},
  UNIT:{objective:boundedText(unitMap.implementation_map.objective,3000),scope:{lineage:unitMap.unit_lineage_id,revision:unitMap.unit_revision_hash},entry_gate:'KNOWLEDGE_READY_OR_EXEMPT',exit_gate:'COMPLETE_EVIDENCED_AND_COHERENCE_CHECK',affected_paths:bounded(unitMap.implementation_map.affected_paths),dependencies:unitMap.dependency_map,expected_contract_output:bounded(unitMap.dependency_map.contracts_produced)},
  IMPLEMENTATION:{api_contracts:bounded(unitMap.implementation_map.api_contracts),recommended_sequence:bounded(unitMap.implementation_map.recommended_sequence),selected_resource_descriptors:resources,selected_skill_descriptors:skills},
  PRODUCT_EXPERIENCE:unitMap.product_experience_map,
  INTEGRATION:{contracts_consumed:bounded(unitMap.dependency_map.contracts_consumed),contracts_produced:bounded(unitMap.dependency_map.contracts_produced),upstream:bounded(unitMap.dependency_map.upstream_dependencies),downstream:bounded(unitMap.dependency_map.downstream_consumers),compatibility_constraints:bounded(unitMap.dependency_map.invalidation_boundaries)},
  VERIFICATION:{requirements:unitMap.verification_map,risk_eventualities:unitMap.risk_eventuality_map,promotion_gate:'fresh evidence + downstream coherence'},
  RESOURCE_MANIFEST:{resources,skills,activation_policy_version:skillPlan.policy_version,graph_candidate_ids:bounded(graphResolution.eligible_resource_ids),determinism_envelope_hash:graphResolution.determinism_envelope_hash},
 };
 const refs={};for(const [type,body] of Object.entries(defs)){const c=capsule(type,body,common);const stored=writeContentAddressedJson('knowledge/capsules',c,{root,prefix:`capsule-${type.toLowerCase().replaceAll('_','-')}`});refs[type.toLowerCase()]={capsule_id:stored.id,capsule_hash:stored.hash,rel:stored.rel};}
 const delivery={schema_version:1,packet_id:packetId,unit_lineage_id:unitMap.unit_lineage_id,unit_revision_hash:unitMap.unit_revision_hash,capsules:refs,worker_delivery_hash:hashObject(refs),created_at:now()};writeJsonAtomic(`knowledge/capsules/by-packet/${packetId}.json`,delivery,root);return delivery;
}

export function loadContextCapsuleDelivery(packetId,root=DEFAULT_CONTROL_HOME){ if(!packetId)return null; return readJson(`knowledge/capsules/by-packet/${packetId}.json`,null,root); }
export function renderContextCapsulesForPacket(packetId,root=DEFAULT_CONTROL_HOME){ const delivery=loadContextCapsuleDelivery(packetId,root); if(!delivery)return ''; const order=['canon','unit','implementation','product_experience','integration','verification','resource_manifest']; const sections=['DIAL VEKL 2.2 CONTEXT CAPSULES',`Packet: ${packetId}`,`Unit: ${delivery.unit_lineage_id}@${delivery.unit_revision_hash}`]; for(const key of order){const ref=delivery.capsules?.[key]; if(!ref)continue; const c=readJson(ref.rel,null,root); if(!c)throw new Error(`context capsule missing: ${ref.rel}`); if(hashObject(c)!==ref.capsule_hash)throw new Error(`context capsule content-address mismatch: ${key}`); sections.push('',`--- ${c.capsule_type} CAPSULE ${c.capsule_hash} ---`,JSON.stringify(c.body));} return sections.join('\n'); }
