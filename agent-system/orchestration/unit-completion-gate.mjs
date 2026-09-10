#!/usr/bin/env node
import { findUnit, hashObject, unitRegistryRows } from './knowledge-graph-core.mjs';

function digest(value){return /^[0-9a-f]{64}$/i.test(String(value||''));}
export function checkUnitDownstreamCoherence({repoDir,unitId}={}){
 const unit=findUnit(repoDir,unitId); if(!unit)return{ok:false,failures:['UNIT_NOT_FOUND'],checks:[]};
 const byId=new Map(unitRegistryRows(repoDir).map((u)=>[u.unit_lineage_id,u])); const checks=[],failures=[];
 for(const downstreamId of unit.downstream_consumers||[]){const consumer=byId.get(downstreamId);if(!consumer){failures.push(`DOWNSTREAM_UNIT_MISSING:${downstreamId}`);continue;}
  for(const produced of unit.contracts_produced||[]){const consumed=(consumer.contracts_consumed||[]).find((x)=>x.contract_id===produced.contract_id);if(!consumed)continue;const ok=consumed.fingerprint===produced.fingerprint;checks.push({downstream_unit:downstreamId,contract_id:produced.contract_id,producer_fingerprint:produced.fingerprint,consumer_fingerprint:consumed.fingerprint,ok});if(!ok)failures.push(`DOWNSTREAM_CONTRACT_DRIFT:${downstreamId}:${produced.contract_id}`);}}
 return{ok:failures.length===0,unit_lineage_id:unit.unit_lineage_id,unit_revision_hash:unit.unit_revision_hash,checks,failures,coherence_hash:hashObject({unit:unit.unit_revision_hash,checks})};
}
export function evaluateUnitCompletionGate({unitMap,implementationEvidence,verificationEvidence,downstreamCoherence,productExperienceEvidence=null}={}){
 const failures=[];if(!unitMap||!['READY','EXEMPT_BY_POLICY'].includes(unitMap.knowledge_readiness_state))failures.push('KNOWLEDGE_NOT_CURRENT');
 if(!digest(implementationEvidence?.content_hash))failures.push('FRESH_IMPLEMENTATION_EVIDENCE_REQUIRED');if(!digest(verificationEvidence?.content_hash))failures.push('FRESH_VERIFICATION_EVIDENCE_REQUIRED');if(downstreamCoherence?.ok!==true)failures.push('DOWNSTREAM_COHERENCE_REQUIRED');
 if(unitMap?.product_experience_map?.applicable){if(productExperienceEvidence?.hard_gate_passed!==true)failures.push('PRODUCT_EXPERIENCE_HARD_GATE_REQUIRED');if(productExperienceEvidence?.qualitative_gate_passed!==true||!digest(productExperienceEvidence?.oracle_evidence_hash))failures.push('PRODUCT_EXPERIENCE_QUALITATIVE_GATE_REQUIRED');}
 const evidence={implementation_hash:implementationEvidence?.content_hash||null,verification_hash:verificationEvidence?.content_hash||null,coherence_hash:downstreamCoherence?.coherence_hash||null,product_experience_oracle_hash:productExperienceEvidence?.oracle_evidence_hash||null};return{ok:failures.length===0,state:failures.length?'COMPLETION_BLOCKED':'COMPLETE_EVIDENCED',failures,evidence,completion_hash:hashObject({unit_revision_hash:unitMap?.unit_revision_hash||null,evidence})};
}
