#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureControlLayout, readJson, writeJsonAtomic } from './state-store.mjs';
import { activateCompiledGraph } from './canon-graph-compiler.mjs';
import { loadRegistry, now } from './knowledge-graph-core.mjs';
import { buildUnitKnowledgeMap } from './unit-knowledge-map-builder.mjs';
import { resolvePacketEngineeringKnowledge } from './engineering-knowledge-broker.mjs';
import { loadKnowledgeResolutionTrace } from './knowledge-resolution-trace.mjs';
import { classifyTask } from './task-triage.mjs';
import { createTaskExecutionEnvelope, checkTaskExecutionEnvelope } from './task-execution-envelope.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO=path.resolve(here,'../..');
const UNIT_REL='agent-system/registries/DEVELOPMENT_UNIT_REGISTRY.json';

function parseArgs(argv){
  const out={repoDir:DEFAULT_REPO,root:process.env.DIAL_CONTROL_HOME||'/var/lib/dial-control'};
  for(let i=0;i<argv.length;i++){if(argv[i]==='--repo')out.repoDir=path.resolve(argv[++i]);else if(argv[i]==='--root')out.root=path.resolve(argv[++i]);}
  return out;
}
function buildReverseIndex(units){
  const reverse={};
  for(const unit of units){
    for(const dep of unit.upstream_dependencies||[]){
      (reverse[dep] ||= []).push(unit.unit_lineage_id);
    }
  }
  for(const key of Object.keys(reverse))reverse[key]=[...new Set(reverse[key])].sort();
  return reverse;
}

function materializeUnits({repoDir,root,graph}){
  const registry=loadRegistry(repoDir,UNIT_REL,{units:[]});
  const entries=[];
  for(const unit of registry.units||[]){
    const featureId=unit.feature_ids?.[0]||null;
    const {map}=buildUnitKnowledgeMap({repoDir,root,unitId:unit.unit_lineage_id,featureId,instruction:`Materialize current knowledge for ${featureId||unit.unit_lineage_id}: ${unit.objective||''}`,affectedPaths:unit.affected_paths||[],graphOverride:graph});
    entries.push({unit_lineage_id:unit.unit_lineage_id,unit_revision_hash:unit.unit_revision_hash,feature_ids:unit.feature_ids||[],knowledge_readiness_state:map.knowledge_readiness_state,map_hash:map.map_hash,graph_revision_hash:map.graph_revision_hash,blocking_reasons:map.knowledge_blocking_reasons||[]});
  }
  const counts=Object.fromEntries([...new Set(entries.map(x=>x.knowledge_readiness_state))].sort().map(state=>[state,entries.filter(x=>x.knowledge_readiness_state===state).length]));
  writeJsonAtomic('knowledge/graph/unit-readiness-index.json',{schema_version:1,graph_generation_id:graph.graph_generation_id,graph_revision_hash:graph.graph_revision_hash,total_units:entries.length,counts,entries,materialized_at:now()},root);
  const reverse=buildReverseIndex(registry.units||[]);
  writeJsonAtomic('knowledge/graph/dependency-reverse-index.json',{schema_version:1,dependency_ref_count:Object.keys(reverse).length,consumer_edge_count:Object.values(reverse).reduce((n,x)=>n+x.length,0),consumers_by_dependency_ref:reverse,materialized_at:now()},root);
  return {entries,counts,reverse};
}
function refreshUnitProjection({repoDir,root,graph}){
  const registry=loadRegistry(repoDir,UNIT_REL,{units:[]});
  const entries=[];
  for(const unit of registry.units||[]){
    const ptr=readJson(`knowledge/graph/units/${unit.unit_lineage_id}/current.json`,null,root);
    const map=ptr?.map_rel?readJson(ptr.map_rel,null,root):null;
    if(!ptr||!map)throw new Error(`current Unit map missing for ${unit.unit_lineage_id}`);
    entries.push({unit_lineage_id:unit.unit_lineage_id,unit_revision_hash:unit.unit_revision_hash,feature_ids:unit.feature_ids||[],knowledge_readiness_state:map.knowledge_readiness_state,map_hash:map.map_hash,graph_revision_hash:map.graph_revision_hash,blocking_reasons:map.knowledge_blocking_reasons||[]});
  }
  const counts=Object.fromEntries([...new Set(entries.map(x=>x.knowledge_readiness_state))].sort().map(state=>[state,entries.filter(x=>x.knowledge_readiness_state===state).length]));
  writeJsonAtomic('knowledge/graph/unit-readiness-index.json',{schema_version:1,graph_generation_id:graph.graph_generation_id,graph_revision_hash:graph.graph_revision_hash,total_units:entries.length,counts,entries,materialized_at:now()},root);
  const reverse=buildReverseIndex(registry.units||[]);
  writeJsonAtomic('knowledge/graph/dependency-reverse-index.json',{schema_version:1,dependency_ref_count:Object.keys(reverse).length,consumer_edge_count:Object.values(reverse).reduce((n,x)=>n+x.length,0),consumers_by_dependency_ref:reverse,materialized_at:now()},root);
  return {entries,counts,reverse};
}

const PILOTS=[
  ['GROC-F013','vekl-n8n-pilot-groc013','For GROC-F013 implement a scheduled delivery exception watch with deduplication, retry and actionable notification.'],
  ['TECH-F008','vekl-n8n-pilot-tech008','For TECH-F008 design a human approval flow with authenticated decision, nonce expiry, denial path and audit.'],
  ['PLAT-F013','vekl-n8n-pilot-plat013','For PLAT-F013 design a scheduled operational health exception monitor: stay quiet when healthy, dedupe, retry and escalate only meaningful exceptions.'],
];

function runPilots({repoDir,root}){
  const evidence=[];
  for(const [featureId,packetId,instruction] of PILOTS){
    const manifest=resolvePacketEngineeringKnowledge({repoDir,root,packetId,instruction,metadata:{feature_id:featureId,max_resources:20}});
    const trace=loadKnowledgeResolutionTrace(packetId,root);
    const lineage=manifest.knowledge_context?.unit_lineage_id;
    const pointer=readJson(`knowledge/graph/units/${lineage}/current.json`,null,root);
    const unitMap=pointer?readJson(pointer.map_rel,null,root):null;
    if(!trace||!unitMap)throw new Error(`pilot evidence incomplete for ${featureId}`);
    const triage=classifyTask({unitMap,instruction,affectedPaths:unitMap.implementation_map?.affected_paths||[]});
    const taskId=`closure-${featureId.toLowerCase()}`;
    const envelope=createTaskExecutionEnvelope({repoDir,root,taskId,packetId,unitMap,activationManifest:manifest,knowledgeResolutionTraceHash:trace.trace_hash||trace.content_addressed_hash,triage,budget:{purpose:'CLOSURE_EVIDENCE',max_worker_attempts:1,max_wall_clock_seconds:300}});
    const admission=checkTaskExecutionEnvelope({repoDir,root,envelope});
    if(!admission.ok)throw new Error(`pilot envelope stale for ${featureId}: ${admission.reasons.join(',')}`);
    const closedEnvelope={...envelope,state:'EVIDENCED_CLOSED',closed_reason:'VEKL_N8N_PILOT_EVIDENCE',closed_at:now()};
    writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`,closedEnvelope,root);
    const corpus=(manifest.resources||[]).filter(x=>String(x.resource_id||'').startsWith('community.zie619.pattern.'));
    evidence.push({feature_id:featureId,packet_id:packetId,task_id:taskId,unit_lineage_id:lineage,unit_revision_hash:unitMap.unit_revision_hash,map_hash:unitMap.map_hash,activation_id:manifest.activation_id,activation_manifest_hash:manifest.manifest_sha256,krt_trace_hash:trace.trace_hash||trace.content_addressed_hash,envelope_hash:envelope.envelope_hash,envelope_state:'EVIDENCED_CLOSED',admission_state:admission.state,corpus_resource_ids:corpus.map(x=>x.resource_id).sort(),worker_delivery_hash:trace.worker_delivery_hash});
  }
  writeJsonAtomic('knowledge/evidence/vekl-n8n-pilots.json',{schema_version:1,status:'GREEN',pilots:evidence,generated_at:now()},root);
  return evidence;
}
export function materializeVeklRuntime(opts={}){
  const repoDir=opts.repoDir||DEFAULT_REPO;
  const root=opts.root||process.env.DIAL_CONTROL_HOME||'/var/lib/dial-control';
  ensureControlLayout(root);
  const graph=activateCompiledGraph({repoDir,root});
  materializeUnits({repoDir,root,graph});
  const pilots=runPilots({repoDir,root});
  // Pilots intentionally re-resolve three Units with task-specific instructions.
  // Refresh the fleet projection after those writes so the readiness index always
  // describes the current Unit-map pointers rather than the pre-pilot snapshots.
  const unitState=refreshUnitProjection({repoDir,root,graph});
  const summary={schema_version:1,status:'GREEN',root,graph_generation_id:graph.graph_generation_id,graph_revision_hash:graph.graph_revision_hash,total_units:unitState.entries.length,readiness_counts:unitState.counts,reverse_dependency_refs:Object.keys(unitState.reverse).length,reverse_dependency_edges:Object.values(unitState.reverse).reduce((n,x)=>n+x.length,0),pilot_count:pilots.length,materialized_at:now()};
  writeJsonAtomic('knowledge/evidence/vekl-runtime-closure.json',summary,root);
  return summary;
}

if(import.meta.url===`file://${process.argv[1]}`){
  try{console.log(JSON.stringify(materializeVeklRuntime(parseArgs(process.argv.slice(2))),null,2));}
  catch(error){console.error(error.stack||error.message);process.exitCode=1;}
}
