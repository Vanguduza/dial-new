#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileGraphContent } from './canon-graph-compiler.mjs';
import { loadRegistry } from './knowledge-graph-core.mjs';
import { DEFAULT_CONTROL_HOME, readJson } from './state-store.mjs';
import { loadKnowledgeResolutionTrace } from './knowledge-resolution-trace.mjs';
import { checkTaskExecutionEnvelope } from './task-execution-envelope.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO=path.resolve(here,'../..');
const UNIT_REL='agent-system/registries/DEVELOPMENT_UNIT_REGISTRY.json';

function parseArgs(argv){
 const out={repoDir:DEFAULT_REPO,root:process.env.DIAL_CONTROL_HOME||DEFAULT_CONTROL_HOME};
 for(let i=0;i<argv.length;i++){if(argv[i]==='--repo')out.repoDir=path.resolve(argv[++i]);else if(argv[i]==='--root')out.root=path.resolve(argv[++i]);}
 return out;
}
export function checkVeklRuntime({repoDir=DEFAULT_REPO,root=DEFAULT_CONTROL_HOME}={}){
 const failures=[];
 const graph=compileGraphContent(repoDir);
 const registry=loadRegistry(repoDir,UNIT_REL,{units:[]});
 const index=readJson('knowledge/graph/unit-readiness-index.json',null,root);
 const reverse=readJson('knowledge/graph/dependency-reverse-index.json',null,root);
 const pilots=readJson('knowledge/evidence/vekl-n8n-pilots.json',null,root);
 const closure=readJson('knowledge/evidence/vekl-runtime-closure.json',null,root);
 if(!index)failures.push('UNIT_READINESS_INDEX_MISSING');
 if(index?.graph_revision_hash!==graph.graph_revision_hash)failures.push('UNIT_INDEX_GRAPH_STALE');
 if(index?.total_units!==registry.units?.length)failures.push('UNIT_COUNT_MISMATCH');
 if(index?.counts?.READY!==registry.units?.length)failures.push('NOT_ALL_UNITS_READY');
 if(!reverse||Number(reverse.consumer_edge_count||0)<=0)failures.push('REVERSE_DEPENDENCY_INDEX_EMPTY');
 for(const entry of index?.entries||[]){
   const ptr=readJson(`knowledge/graph/units/${entry.unit_lineage_id}/current.json`,null,root);
   const map=ptr?.map_rel?readJson(ptr.map_rel,null,root):null;
   if(!ptr||!map||ptr.map_hash!==entry.map_hash||map.unit_revision_hash!==entry.unit_revision_hash||map.knowledge_readiness_state!=='READY')failures.push(`UNIT_MAP_INVALID:${entry.unit_lineage_id}`);
 }
 if(pilots?.status!=='GREEN'||pilots?.pilots?.length!==3)failures.push('PILOT_EVIDENCE_INCOMPLETE');
 for(const pilot of pilots?.pilots||[]){
   const tracePtr=readJson(`knowledge/activation/traces/by-packet/${pilot.packet_id}.json`,null,root);
   const trace=loadKnowledgeResolutionTrace(pilot.packet_id,root);
   const envelope=readJson(`execution/tasks/${pilot.task_id}/envelope.json`,null,root);
   if(!tracePtr||!trace||trace.trace_hash!==pilot.krt_trace_hash||tracePtr.trace_rel==null||tracePtr.trace_hash==null)failures.push(`PILOT_KRT_INVALID:${pilot.feature_id}`);
   const admission=envelope?checkTaskExecutionEnvelope({repoDir,root,envelope}):{ok:false};
   if(!envelope||!admission.ok||envelope.envelope_hash!==pilot.envelope_hash)failures.push(`PILOT_ENVELOPE_INVALID:${pilot.feature_id}`);
 }
 if(closure?.status!=='GREEN'||closure?.graph_revision_hash!==graph.graph_revision_hash||closure?.total_units!==registry.units?.length||closure?.pilot_count!==3)failures.push('RUNTIME_CLOSURE_RECORD_STALE');
 return {status:failures.length?'RED':'GREEN',policy_version:'vekl-2.2-rev2',root,graph_revision_hash:graph.graph_revision_hash,total_units:registry.units?.length||0,ready_units:index?.counts?.READY||0,reverse_dependency_edges:reverse?.consumer_edge_count||0,pilot_count:pilots?.pilots?.length||0,failures};
}

if(import.meta.url===`file://${process.argv[1]}`){const result=checkVeklRuntime(parseArgs(process.argv.slice(2)));console.log(JSON.stringify(result,null,2));if(result.status!=='GREEN')process.exitCode=1;}
