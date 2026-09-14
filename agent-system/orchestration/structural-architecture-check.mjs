#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from './knowledge-graph-core.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));export const DEFAULT_REPO=path.resolve(here,'../..');
export function checkStructuralArchitecture(repoDir=DEFAULT_REPO){
 const p=loadRegistry(repoDir,'agent-system/registries/STRUCTURAL_REALITY_POLICY.json',{});const read=(r)=>fs.existsSync(path.join(repoDir,r))?fs.readFileSync(path.join(repoDir,r),'utf8'):'';const unit=read('agent-system/orchestration/unit-knowledge-map-builder.mjs'),krt=read('agent-system/orchestration/knowledge-resolution-trace.mjs'),env=read('agent-system/orchestration/task-execution-envelope.mjs'),cap=read('agent-system/orchestration/context-capsule-builder.mjs'),guard=read('agent-system/hooks/pre-tool-guard.mjs'),frontend=read('agent-system/orchestration/frontend-certification.mjs');const w=p.relationship_weights||{};const checks=[
  ['SG-01',w.AUTHORISED_BY===1&&w.BELONGS_TO_UNIT===1&&w.IMPLEMENTS===.95&&w.TESTED_BY===.95&&w.CALLS===.9&&w.USES_SCHEMA===.9&&w.HANDLES_EVENT===.9&&w.IMPORTS===.7&&w.SAME_COMMUNITY===.55&&w.SIMILAR_STRUCTURE===.4&&w.GRAPHIFY_INFERRED_LINK===.35&&w.SEMANTIC_SIMILARITY==='RERANK_ONLY','§16 weights exact, semantic similarity rerank-only'],
  ['SG-02',w.GRAPHIFY_INFERRED_LINK<w.IMPORTS,'inferred links remain below explicit structural edges'],
  ['SG-03',p.providers?.graphify?.provider_version==='0.9.58'&&p.providers.graphify.qualified===false&&p.providers.graphify.execution_enabled===false,'Graphify execution requires exact pin/qualification'],
  ['SG-04',p.providers?.graphify?.profile==='CODE_ONLY','initial provider profile is CODE_ONLY'],
  ['SG-05',(p.structural_contracts||[]).map((x)=>x.contract_id).join(',')==='SC-001,SC-002,SC-003,SC-004,SC-005','five exact §37 contracts preserved in order'],
  ['SG-06',p.normalization?.reject_secret_bearing_payloads===true,'secret/token payload admission denied'],
  ['SG-07',p.rollout?.mode==='SHADOW'&&p.rollout?.material_execution_dependency===false,'shadow rollout does not alter material execution until activation gate'],
  ['SG-08',p.authority?.may_change_engineering_resource_eligibility===false&&p.rollout?.resource_eligibility_dependency===false,'shadow rollout does not alter GraphRAG eligibility'],
  ['SG-09',p.authority?.may_mutate_project_truth===false&&p.authority?.may_redefine_development_units===false,'Graphify remains subordinate to Project Truth and canonical Unit identity'],
  ['SG-10',unit.includes('structural_reality_map')&&unit.includes('frontendProjection:frontend'),'Unit Knowledge Map composes G_PX and G_IMPL without replacement'],
  ['SG-11',unit.includes("'STRUCTURAL_SOURCE'")&&unit.includes("'STRUCTURAL_SNAPSHOT'")&&unit.includes("'FRONTEND_REGISTRY'")&&unit.includes("'FDEP'")&&unit.includes("'VRDE'"),'structural and frontend invalidation boundaries are explicit'],
  ['SG-12',env.includes('unit_structural_fingerprint')&&env.includes('frontend_product_experience_projection_hash'),'Task Execution Envelope binds structural reality and frontend projection'],
  ['SG-13',krt.includes('structural_graph')&&krt.includes('frontend_projection_hash'),'KnowledgeResolutionTrace carries structural traversal and frontend provenance'],
  ['SG-14',cap.includes('structural_reality'),'existing seven-capsule model carries structural evidence without an eighth authority capsule'],
  ['SG-15',guard.includes('classifyShellEffect'),'pre-tool guard uses composition-safe shell effect classification'],
  ['SG-16',p.frontend?.design_code_parity_owner==='frontend-certification.mjs'&&frontend.includes('evaluateDesignCodeParity'),'Graphify feeds existing frontend parity authority instead of duplicating it']
 ].map(([id,ok,detail])=>({id,ok:!!ok,detail}));return{status:checks.every((x)=>x.ok)?'GREEN':'RED',checks};
}
if(import.meta.url===`file://${process.argv[1]}`){const r=checkStructuralArchitecture(process.argv[2]||DEFAULT_REPO);console.log(JSON.stringify(r,null,2));process.exitCode=r.status==='GREEN'?0:1;}
