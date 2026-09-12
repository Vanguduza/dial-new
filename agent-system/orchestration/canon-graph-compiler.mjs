#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONTROL_HOME, ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';
import { AUTHORITY_PATHS, GRAPH_SCHEMA_VERSION, canonical, hashFile, hashObject, loadRegistry, now, projectTruthHash, registryHash, sourceRef } from './knowledge-graph-core.mjs';
import { deriveDevelopmentUnits } from './development-unit-planner.mjs';
import { classifyEngineeringResourcesTask, termMatches } from './engineering-resource-resolver.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)); export const DEFAULT_REPO=path.resolve(here,'../..');
const CONTRACT_REL='docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json';
const FEATURE_REL='agent-system/registries/FEATURE_REGISTRY.json'; const DECISION_REL='agent-system/registries/DECISION_LOG.json';
const RESOURCE_REL='agent-system/engineering-knowledge/registries/ENGINEERING_RESOURCE_REGISTRY.json';
const DONOR_REL='docs/dial/final-audit/11_FEATURE_REALIZATION/DONOR_REGISTRY.json';
const EDGE_REL='agent-system/registries/KNOWLEDGE_EDGE_TYPE_REGISTRY.json'; const NODE_REL='agent-system/registries/KNOWLEDGE_NODE_TYPE_REGISTRY.json';

function key(type,id){return `${type}:${id}`;} function uniq(xs){return [...new Set((xs||[]).filter(Boolean).map(String))].sort();}
function resourceNodeType(row){ if(row.resource_class==='SKILL') return 'SKILL_RESOURCE'; if(row.resource_class==='TOOL') return 'TOOL_RESOURCE'; if(row.resource_class==='MCP_SERVER') return 'MCP_RESOURCE'; if(row.resource_class==='PLUGIN') return 'PLUGIN_RESOURCE'; return 'ENGINEERING_RESOURCE'; }
function addNode(map,node){ const existing=map.get(node.node_ref); if(existing && hashObject(existing)!==hashObject(node)) throw new Error(`graph node collision ${node.node_ref}`); map.set(node.node_ref,node); }
function edgeKey(e){return [e.source_ref,e.relationship,e.target_ref].join('|');}
function sourceHash(repoDir,rel){const p=path.join(repoDir,rel);return fs.existsSync(p)?hashFile(p):hashObject({missing:rel});}
const REPO_PATH_EVIDENCE=new Set(['ACCEPTANCE_CONTRACT','TEST','DOC']);
export function evidenceRecords(feature,repoDir=DEFAULT_REPO){
 const rows=(feature.evidence_refs||[]).map((raw)=>{
  const kind=raw.kind,ref=raw.ref??null,note=raw.note??null;
  if(REPO_PATH_EVIDENCE.has(kind)){
   const abs=path.join(repoDir,ref);
   if(!fs.existsSync(abs)) throw new Error(`evidence ref does not resolve: ${feature.feature_id} ${kind} ${ref}`);
   return {evidence_id:`${kind}:${ref}`,kind,ref,note,verifiable:true,stable_ref:ref,expected_content_hash:hashFile(abs)};
  }
  if(kind==='CI_RUN') return {evidence_id:`CI_RUN:${ref}`,kind,ref,note,verifiable:false,stable_ref:FEATURE_REL,expected_content_hash:hashObject({kind,ref,note})};
  return {evidence_id:`LOCAL_RUN_NOTE:${hashObject({feature:feature.feature_id,note}).slice(0,32)}`,kind,ref:null,note,verifiable:false,stable_ref:FEATURE_REL,expected_content_hash:hashObject({kind,note})};
 });
 return [...new Map(rows.map((r)=>[r.evidence_id,r])).values()].sort((a,b)=>a.evidence_id.localeCompare(b.evidence_id));
}
export function compileGraphContent(repoDir=DEFAULT_REPO){
 const nodeRegistry=loadRegistry(repoDir,NODE_REL,{}); const edgeRegistry=loadRegistry(repoDir,EDGE_REL,{}); const allowedNodes=new Set((nodeRegistry.node_types||[]).map((x)=>x.node_type)); const allowedEdges=new Set((edgeRegistry.edge_types||[]).map((x)=>`${x.source_type}|${x.relationship}|${x.target_type}`));
 const nodes=new Map(), edges=new Map(); const features=loadRegistry(repoDir,FEATURE_REL,[]); const decisions=loadRegistry(repoDir,DECISION_REL,[]); const contracts=loadRegistry(repoDir,CONTRACT_REL,[]); const resources=loadRegistry(repoDir,RESOURCE_REL,[]); const donorRows=new Map(loadRegistry(repoDir,DONOR_REL,[]).map((d)=>[d.donor_id,d])); const unitProjection=deriveDevelopmentUnits(repoDir); const contractByFeature=new Map(contracts.map((x)=>[x.feature_id,x])); const unitByFeature=new Map(unitProjection.units.flatMap((u)=>u.feature_ids.map((f)=>[f,u])));
 const add=(type,id,data,authority_reference)=>{ if(!allowedNodes.has(type)) throw new Error(`undefined graph node type ${type}`); const node_ref=key(type,id); addNode(nodes,{node_ref,node_type:type,canonical_id:String(id),authority_reference:authority_reference||null,data}); return node_ref; };
 const edge=(source_ref,relationship,target_ref,provenance,derivation_class='COMPILED_CANONICAL_REFERENCE')=>{ const s=nodes.get(source_ref),t=nodes.get(target_ref); if(!s||!t) throw new Error(`edge endpoint missing ${source_ref} -> ${target_ref}`); if(!allowedEdges.has(`${s.node_type}|${relationship}|${t.node_type}`)) throw new Error(`undefined edge vocabulary ${s.node_type} ${relationship} ${t.node_type}`); const e={edge_ref:`EDGE:${hashObject({source_ref,relationship,target_ref}).slice(0,32)}`,source_ref,relationship,target_ref,source_content_hash:provenance.source_content_hash,provenance_ref:provenance.stable_ref,graph_schema_version:GRAPH_SCHEMA_VERSION,derivation_class,creation_graph_generation:null,tombstoned:false}; edges.set(edgeKey(e),e); };
 for(const rel of AUTHORITY_PATHS.filter((r)=>fs.existsSync(path.join(repoDir,r))).sort()){ const h=sourceHash(repoDir,rel); add('PROJECT_TRUTH_SLICE',hashObject({rel,h}).slice(0,32),{stable_ref:rel}, {object_type:'PROJECT_TRUTH_SLICE',object_id:rel,stable_ref:rel,expected_content_hash:h}); }
 const truthSliceRefs=new Map(AUTHORITY_PATHS.filter((r)=>fs.existsSync(path.join(repoDir,r))).map((rel)=>[rel,key('PROJECT_TRUTH_SLICE',hashObject({rel,h:sourceHash(repoDir,rel)}).slice(0,32))]));
 for(const d of decisions){ add('DECISION',d.decision_id,{status:d.status,title:d.title,area:d.area}, {object_type:'DECISION',object_id:d.decision_id,stable_ref:DECISION_REL,expected_content_hash:hashObject(d)}); }
 for(const f of features){
   const fref=add('FEATURE',f.feature_id,{module:f.module,outcome:f.outcome,current_gate:f.current_gate}, {object_type:'FEATURE',object_id:f.feature_id,stable_ref:FEATURE_REL,expected_content_hash:hashObject(f)});
   const facetId=f.realization_ref||`FR-${f.feature_id}`; const facet=add('REALIZATION_FACET',facetId,{feature_id:f.feature_id}, {object_type:'REALIZATION_FACET',object_id:facetId,stable_ref:FEATURE_REL,expected_content_hash:hashObject({feature_id:f.feature_id,realization_ref:facetId})});
   const unit=unitByFeature.get(f.feature_id); const uref=add('DEVELOPMENT_UNIT',unit.unit_lineage_id,{unit_revision_hash:unit.unit_revision_hash,feature_ids:unit.feature_ids,knowledge_route_ids:unit.knowledge_route_ids}, {object_type:'DEVELOPMENT_UNIT',object_id:unit.unit_lineage_id,stable_ref:'agent-system/registries/DEVELOPMENT_UNIT_REGISTRY.json',expected_content_hash:hashObject(unit)});
   edge(uref,'realizes',fref,{stable_ref:FEATURE_REL,source_content_hash:hashObject(f)}); edge(uref,'implements',facet,{stable_ref:FEATURE_REL,source_content_hash:hashObject(f)});
   for(const d of decisions.filter((x)=>(x.enforced_by||[]).includes(f.feature_id))){ edge(fref,'governed_by',key('DECISION',d.decision_id),{stable_ref:DECISION_REL,source_content_hash:hashObject(d)}); }
   const c=contractByFeature.get(f.feature_id); if(c){
     const cref=add('CONTRACT',`FRC:${f.feature_id}`,{feature_id:f.feature_id,security_profile:c.security_profile,api_contract:c.api_contract||null}, {object_type:'CONTRACT',object_id:`FRC:${f.feature_id}`,stable_ref:CONTRACT_REL,expected_content_hash:hashObject(c)});
     const owner=c.domain_owner||f.owner||'UNASSIGNED'; const oref=add('DOMAIN_AUTHORITY',owner,{owner}, {object_type:'DOMAIN_AUTHORITY',object_id:owner,stable_ref:CONTRACT_REL,expected_content_hash:hashObject({owner})}); edge(cref,'owned_by',oref,{stable_ref:CONTRACT_REL,source_content_hash:hashObject(c)});
     edge(uref,'produces',cref,{stable_ref:CONTRACT_REL,source_content_hash:hashObject(c)});
     for(const dep of uniq(c.supporting_capability_refs||[])){ const dc=contractByFeature.get(dep); if(dc){ const dref=add('CONTRACT',`FRC:${dep}`,{feature_id:dep,security_profile:dc.security_profile,api_contract:dc.api_contract||null},{object_type:'CONTRACT',object_id:`FRC:${dep}`,stable_ref:CONTRACT_REL,expected_content_hash:hashObject(dc)}); edge(uref,'consumes',dref,{stable_ref:CONTRACT_REL,source_content_hash:hashObject(c)}); const du=unitByFeature.get(dep); if(du){ const duref=key('DEVELOPMENT_UNIT',du.unit_lineage_id); if(nodes.has(duref)) edge(uref,'depends_on',duref,{stable_ref:CONTRACT_REL,source_content_hash:hashObject(c)}); } } }
     for(const cp of uniq(f.code_paths||[])){ const mref=add('CODE_MODULE',cp,{path:cp},{object_type:'CODE_MODULE',object_id:cp,stable_ref:cp,expected_content_hash:fs.existsSync(path.join(repoDir,cp))?(fs.statSync(path.join(repoDir,cp)).isFile()?hashFile(path.join(repoDir,cp)):hashObject({directory:cp})):null}); edge(cref,'implemented_by',mref,{stable_ref:FEATURE_REL,source_content_hash:hashObject(f)}); edge(mref,'implements',cref,{stable_ref:FEATURE_REL,source_content_hash:hashObject(f)}); }
     for(const tp of uniq(f.test_paths||[])){ const tref=add('TEST',tp,{path:tp},{object_type:'TEST',object_id:tp,stable_ref:tp,expected_content_hash:fs.existsSync(path.join(repoDir,tp))?hashFile(path.join(repoDir,tp)):null}); edge(tref,'verifies',cref,{stable_ref:FEATURE_REL,source_content_hash:hashObject(f)}); edge(tref,'verifies',facet,{stable_ref:FEATURE_REL,source_content_hash:hashObject(f)}); }
     for(const ev of uniq(c.eventuality_refs||[])){ const eref=add('EVENTUALITY',ev,{eventuality_id:ev},{object_type:'EVENTUALITY',object_id:ev,stable_ref:CONTRACT_REL,expected_content_hash:hashObject({eventuality_id:ev})}); edge(eref,'applies_to',fref,{stable_ref:CONTRACT_REL,source_content_hash:hashObject(c)}); }
     if(c.security_profile){ add('SECURITY_CONTROL',`PROFILE:${c.security_profile}`,{profile:c.security_profile},{object_type:'SECURITY_PROFILE',object_id:c.security_profile,stable_ref:CONTRACT_REL,expected_content_hash:hashObject({profile:c.security_profile})}); edge(cref,'governed_by',key('SECURITY_CONTROL',`PROFILE:${c.security_profile}`),{stable_ref:CONTRACT_REL,source_content_hash:hashObject(c)}); }
     for(const donor of uniq(c.donor_refs||f.donor_refs||[])){ const row=donorRows.get(donor)||null; const dref=add('DONOR',donor,{donor_id:donor,registered:row!==null},{object_type:'DONOR',object_id:donor,stable_ref:DONOR_REL,expected_content_hash:row?hashObject(row):hashObject({unregistered_donor_ref:donor})}); edge(dref,'transformed_for',fref,{stable_ref:CONTRACT_REL,source_content_hash:hashObject(c)}); }
     for(const evname of uniq(c.events||[])){ const evref=add('EVENT',`${f.feature_id}:${evname}`,{event:evname,feature_id:f.feature_id},{object_type:'EVENT',object_id:evname,stable_ref:CONTRACT_REL,expected_content_hash:hashObject({feature_id:f.feature_id,event:evname})}); edge(cref,'emits',evref,{stable_ref:CONTRACT_REL,source_content_hash:hashObject(c)}); }
     if(c.api_contract){ for(const [kind,url] of Object.entries(c.api_contract).filter(([,v])=>typeof v==='string'&&v.startsWith('/'))){ const aref=add('API',`${f.feature_id}:${kind}`,{feature_id:f.feature_id,kind,url},{object_type:'API',object_id:`${f.feature_id}:${kind}`,stable_ref:CONTRACT_REL,expected_content_hash:hashObject({feature_id:f.feature_id,kind,url})}); edge(cref,'exposes',aref,{stable_ref:CONTRACT_REL,source_content_hash:hashObject(c)}); } }
   }
   // The canon that actually governs this feature: the product truth, the
   // registry declaring it, and its contract registry when it has a contract.
   for(const rel of uniq([ 'agent-system/canon/PROJECT_TRUTH.md', FEATURE_REL, c?CONTRACT_REL:null ])){
     const sref=truthSliceRefs.get(rel); if(sref&&nodes.has(sref)) edge(fref,'governed_by',sref,{stable_ref:rel,source_content_hash:sourceHash(repoDir,rel)});
   }
   const gate=f.current_gate||f.status; if(gate){ const gref=add('VERIFICATION_GATE',gate,{gate},{object_type:'VERIFICATION_GATE',object_id:gate,stable_ref:FEATURE_REL,expected_content_hash:hashObject({gate})}); for(const ev of evidenceRecords(f,repoDir)){ const eref=add('EVIDENCE',ev.evidence_id,{kind:ev.kind,ref:ev.ref,note:ev.note,verifiable:ev.verifiable},{object_type:'EVIDENCE',object_id:ev.evidence_id,stable_ref:ev.stable_ref,expected_content_hash:ev.expected_content_hash}); edge(eref,'proves',gref,{stable_ref:FEATURE_REL,source_content_hash:hashObject(f)}); } }
 }
 for(const r of resources){ const type=resourceNodeType(r); add(type,r.resource_id,{resource_class:r.resource_class,status:r.status,source_id:r.source_id,locator:r.locator}, {object_type:type,object_id:r.resource_id,stable_ref:RESOURCE_REL,expected_content_hash:hashObject(r)}); if(type!=='ENGINEERING_RESOURCE'){ add('ENGINEERING_RESOURCE',r.resource_id,{resource_class:r.resource_class,status:r.status,source_id:r.source_id,locator:r.locator,specialized_node_ref:key(type,r.resource_id)}, {object_type:'ENGINEERING_RESOURCE',object_id:r.resource_id,stable_ref:RESOURCE_REL,expected_content_hash:hashObject(r)}); edge(key('ENGINEERING_RESOURCE',r.resource_id),'specialised_as',key(type,r.resource_id),{stable_ref:RESOURCE_REL,source_content_hash:hashObject(r)}); } }
 // Declared engineering concerns.
 //
 // Before this, the only path from work to a resource was the compile-time
 // `supports` projection over the Feature record below. That projection is
 // identical for every task ever performed on a Feature, so the concrete packet
 // task could not change what was retrievable - and because canon rules that
 // semantic ranking may happen only inside an already eligible graph
 // neighbourhood, unreachable means unretrievable. "Implement Supabase Postgres
 // RLS policies for Grocery Rounds" could not reach ref.supabase.docs, because
 // GROC-F021's record says "Round agreement & consent gateway" and mentions no
 // database.
 //
 // A concern node is the task class literal. The edge is compiled from the
 // resource's OWN declared task_classes, so it is a declared relationship rather
 // than an inference. Concern nodes have no edge to any Feature or Unit on
 // purpose: they are reachable only when the concrete task classifies into them,
 // which is what makes them the runtime half of a graph-first bound.
 for(const r of resources){
  if(r.resource_class==='SKILL') continue;
  const rr=key('ENGINEERING_RESOURCE',r.resource_id); if(!nodes.has(rr)) continue;
  for(const tc of uniq((r.task_classes||[]).filter((x)=>x!=='*'))){
   const cref=add('ENGINEERING_CONCERN',tc,{task_class:tc},{object_type:'ENGINEERING_CONCERN',object_id:tc,stable_ref:RESOURCE_REL,expected_content_hash:hashObject({task_class:tc})});
   edge(rr,'addresses',cref,{stable_ref:RESOURCE_REL,source_content_hash:hashObject(r)},'DECLARED_RESOURCE_TASK_CLASS');
  }
 }
 // Second pass: all unit nodes exist, so dependency and deterministic resource-support edges are order-independent.
 for(const unit of unitProjection.units){
   const uref=key('DEVELOPMENT_UNIT',unit.unit_lineage_id);
   for(const dep of unit.upstream_dependencies||[]){ const dref=String(dep).startsWith('DU-LIN-')?key('DEVELOPMENT_UNIT',dep):null; if(dref&&nodes.has(dref)) edge(uref,'depends_on',dref,{stable_ref:CONTRACT_REL,source_content_hash:hashObject(unit.contracts_consumed||[])}); }
   const f=features.find((x)=>(unit.feature_ids||[]).includes(x.feature_id)); const c=f?contractByFeature.get(f.feature_id):null; // Contract surfaces are exposure declarations, not implementation evidence. Joining them
   // into the prose text bypassed the corroboration requirement and fired WHATSAPP on 145 of
   // 309 Features - past the 40% ceiling the signal policy declares. They reach the classifier
   // through contractRecord, where the structural path governs them.
   const taskClasses=classifyEngineeringResourcesTask({instruction:[f?.outcome,c?.archetype].filter(Boolean).join(' '),affectedPaths:f?.code_paths||[],featureRecord:f,contractRecord:c,repoDir}); const hay=[f?.outcome,f?.module,f?.owner,...(f?.code_paths||[]),...(c?.surfaces||[]),...(c?.commands||[]),...(c?.queries||[])].filter(Boolean).join(' ').toLowerCase();
   for(const r of resources){ if(r.resource_class==='SKILL')continue; const task=(r.task_classes||[]).includes('*')||(r.task_classes||[]).some((x)=>taskClasses.includes(x)); const lexical=[...(r.keywords||[]),...(r.technologies||[])].some((x)=>termMatches(x,hay)); if(!(r.always_bind===true||task||lexical))continue; const rr=key('ENGINEERING_RESOURCE',r.resource_id); if(nodes.has(rr)) edge(rr,'supports',uref,{stable_ref:RESOURCE_REL,source_content_hash:hashObject(r)},'DETERMINISTIC_RESOURCE_RELEVANCE_PROJECTION'); }
 }
 const nodeList=[...nodes.values()].sort((a,b)=>a.node_ref.localeCompare(b.node_ref)); const edgeList=[...edges.values()].sort((a,b)=>edgeKey(a).localeCompare(edgeKey(b)));
 const policy_hashes={node_registry_hash:registryHash(repoDir,NODE_REL),edge_registry_hash:registryHash(repoDir,EDGE_REL),route_registry_hash:registryHash(repoDir,'agent-system/registries/KNOWLEDGE_ROUTE_REGISTRY.json'),boundary_policy_hash:registryHash(repoDir,'agent-system/registries/UNIT_BOUNDARY_POLICY.json'),determinism_policy_hash:registryHash(repoDir,'agent-system/registries/GRAPHRAG_DETERMINISM_POLICY.json')};
 const content={schema_version:1,graph_schema_version:GRAPH_SCHEMA_VERSION,project:'dial',project_truth_hash:projectTruthHash(repoDir),compiler_version:'canon-graph-compiler-v1',policy_hashes,nodes:nodeList,edges:edgeList}; const graph_revision_hash=hashObject(content); const graph_generation_id=`KG-${graph_revision_hash.slice(0,32)}`;
 for(const e of edgeList) e.creation_graph_generation=graph_generation_id;
 // creation id is derived from pre-generation structural content, then final revision includes it consistently.
 const finalContent={...content,graph_generation_id,nodes:nodeList,edges:edgeList}; return {...finalContent,graph_revision_hash:hashObject(finalContent)};
}
export function activateCompiledGraph({repoDir=DEFAULT_REPO,root=DEFAULT_CONTROL_HOME}={}){
 ensureControlLayout(root); const graph=compileGraphContent(repoDir); const rel=`knowledge/graph/generations/${graph.graph_generation_id}.json`; const abs=resolveControlPath(rel,root); if(fs.existsSync(abs)){ const existing=JSON.parse(fs.readFileSync(abs,'utf8')); if(existing.graph_revision_hash!==graph.graph_revision_hash) throw new Error('graph generation collision'); } else writeJsonAtomic(rel,{...graph,compiled_at:now()},root);
 const adjacency={schema_version:1,graph_generation_id:graph.graph_generation_id,graph_revision_hash:graph.graph_revision_hash,out:{},in:{}}; for(const e of graph.edges){(adjacency.out[e.source_ref]??=[]).push(e.edge_ref);(adjacency.in[e.target_ref]??=[]).push(e.edge_ref);} for(const side of ['out','in']) for(const k of Object.keys(adjacency[side])) adjacency[side][k].sort(); writeJsonAtomic(`knowledge/graph/indexes/${graph.graph_generation_id}-adjacency.json`,adjacency,root); writeJsonAtomic('knowledge/graph/current.json',{schema_version:1,graph_generation_id:graph.graph_generation_id,graph_revision_hash:graph.graph_revision_hash,generation_rel:rel,adjacency_rel:`knowledge/graph/indexes/${graph.graph_generation_id}-adjacency.json`,activated_at:now()},root); return graph;
}
export function loadActiveGraph(root=DEFAULT_CONTROL_HOME){ const p=readJson('knowledge/graph/current.json',null,root); return p?.generation_rel?readJson(p.generation_rel,null,root):null; }
export function verifyGraphRebuild(repoDir=DEFAULT_REPO){ const a=compileGraphContent(repoDir),b=compileGraphContent(repoDir); return {ok:a.graph_generation_id===b.graph_generation_id&&a.graph_revision_hash===b.graph_revision_hash,generation_id:a.graph_generation_id,graph_revision_hash:a.graph_revision_hash,nodes:a.nodes.length,edges:a.edges.length}; }
if(import.meta.url===`file://${process.argv[1]}`){ const cmd=process.argv[2]||'verify'; if(cmd==='compile') console.log(JSON.stringify(activateCompiledGraph({}),null,2)); else {const r=verifyGraphRebuild();console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;} }
