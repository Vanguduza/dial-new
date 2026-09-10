#!/usr/bin/env node
import { DEFAULT_CONTROL_HOME, appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';
import { hashObject, loadRegistry, now } from './knowledge-graph-core.mjs';

const POLICY_REL='agent-system/registries/KNOWLEDGE_EXEMPTION_POLICY.json';
const FEATURE_REL='agent-system/registries/FEATURE_REGISTRY.json';
const TRUTH_PATHS=new Set(['PROJECT_CANONICAL_STATE.json','PROJECT_TRUTH_PROTOCOL.md','agent-system/canon/PROJECT_TRUTH.md','agent-system/registries/DECISION_LOG.json','agent-system/registries/FEATURE_REGISTRY.json']);
function uiBearing(feature){return Boolean(feature&&((feature.app_families||[]).length||feature.client_exposure&&feature.client_exposure!=='INTERNAL'));}
function forbiddenClasses({feature,affectedPaths=[],metadata={}}={}){
 const out=new Set();
 if((affectedPaths||[]).some((p)=>TRUTH_PATHS.has(p)))out.add('PROJECT_TRUTH_CHANGE');
 if((affectedPaths||[]).includes('agent-system/registries/DECISION_LOG.json'))out.add('LOCKED_DECISION_CHANGE');
 if(uiBearing(feature))out.add('UI_BEARING_FEATURE');
 for(const id of ['PROJECT_TRUTH_CHANGE','LOCKED_DECISION_CHANGE','SECURITY_AUTHORITY_CHANGE','MONEY_OR_HEALTH_FEATURE','PRODUCTION_EXTERNAL_EFFECT'])if(metadata?.knowledge_risk_classes?.includes?.(id))out.add(id);
 return [...out].sort();
}
export function evaluateKnowledgeExemption({repoDir='.',archetype,featureId=null,affectedPaths=[],metadata={}}={}){
 const id=String(archetype||'').trim().toUpperCase();
 if(!id)return{state:'NOT_REQUESTED',allowed:false};
 const policy=loadRegistry(repoDir,POLICY_REL,{});const row=(policy.allowed_archetypes||[]).find((x)=>x.archetype===id);
 if(!row)return{state:'EXEMPTION_REFUSED',allowed:false,reason:'ARCHETYPE_NOT_ALLOWED',policy_hash:hashObject(policy)};
 const features=loadRegistry(repoDir,FEATURE_REL,[]);const feature=featureId?features.find((x)=>x.feature_id===featureId)||null:null;
 const forbidden=forbiddenClasses({feature,affectedPaths,metadata}).filter((x)=>(policy.forbidden_for||[]).includes(x));
 if(forbidden.length)return{state:'EXEMPTION_REFUSED',allowed:false,reason:'FORBIDDEN_SCOPE',forbidden_classes:forbidden,policy_hash:hashObject(policy),archetype_hash:hashObject(row)};
 return{state:'EXEMPT_BY_POLICY',allowed:true,archetype:id,reason:row.reason,policy_version:policy.policy_version,policy_hash:hashObject(policy),archetype_hash:hashObject(row)};
}

export function persistKnowledgeExemption({repoDir='.',root=DEFAULT_CONTROL_HOME,packetId,archetype,featureId=null,affectedPaths=[],metadata={}}={}){
 if(!packetId)throw new Error('packetId is required for knowledge exemption');const result=evaluateKnowledgeExemption({repoDir,archetype,featureId,affectedPaths,metadata});
 if(!result.allowed)throw new Error(`knowledge exemption refused: ${result.reason}${result.forbidden_classes?.length?`:${result.forbidden_classes.join(',')}`:''}`);
 const record={schema_version:1,packet_id:packetId,feature_id:featureId,state:'EXEMPT_BY_POLICY',knowledge_exemption:{archetype:result.archetype,reason:result.reason,policy_version:result.policy_version,policy_hash:result.policy_hash,archetype_hash:result.archetype_hash},created_at:now()};
 record.exemption_hash=hashObject({...record,created_at:null});writeJsonAtomic(`knowledge/admission/exemptions/by-packet/${packetId}.json`,record,root);appendJsonl('events/engineering-knowledge.jsonl',{event:'KNOWLEDGE_EXEMPTION_BOUND',packet_id:packetId,feature_id:featureId,archetype:result.archetype,exemption_hash:record.exemption_hash,at:record.created_at},root);return record;
}

export function checkKnowledgeExemption({repoDir='.',root=DEFAULT_CONTROL_HOME,packetId}={}){
 const record=readJson(`knowledge/admission/exemptions/by-packet/${packetId}.json`,null,root);
 if(!record)return{ok:false,state:'REFUSED_STALE_KNOWLEDGE',reasons:['EXEMPTION_BINDING_MISSING']};
 const policy=loadRegistry(repoDir,POLICY_REL,{});const row=(policy.allowed_archetypes||[]).find((x)=>x.archetype===record.knowledge_exemption?.archetype);const reasons=[];
 if(record.state!=='EXEMPT_BY_POLICY')reasons.push('EXEMPTION_STATE_CHANGED');
 if(hashObject(policy)!==record.knowledge_exemption?.policy_hash)reasons.push('EXEMPTION_POLICY_CHANGED');
 if(!row||hashObject(row)!==record.knowledge_exemption?.archetype_hash)reasons.push('EXEMPTION_ARCHETYPE_CHANGED');
 return{ok:reasons.length===0,state:reasons.length?'REFUSED_STALE_KNOWLEDGE':'CURRENT',packet_id:packetId,exemption_hash:record.exemption_hash,reasons};
}
