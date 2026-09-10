import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { deriveDevelopmentUnits } from '../agent-system/orchestration/development-unit-planner.mjs';
import { compileGraphContent, verifyGraphRebuild } from '../agent-system/orchestration/canon-graph-compiler.mjs';
import { resolveGraphRag } from '../agent-system/orchestration/graph-retrieval-router.mjs';
import { resolveEngineeringResources } from '../agent-system/orchestration/engineering-resource-resolver.mjs';
import { buildUnitKnowledgeMap } from '../agent-system/orchestration/unit-knowledge-map-builder.mjs';
import { resolvePacketEngineeringKnowledge, ensurePacketEngineeringKnowledge, reResolvePacketEngineeringKnowledge } from '../agent-system/orchestration/engineering-knowledge-broker.mjs';
import { checkKnowledgeBinding } from '../agent-system/orchestration/knowledge-admission-guard.mjs';
import { invalidateKnowledge } from '../agent-system/orchestration/knowledge-invalidation-engine.mjs';
import { loadKnowledgeResolutionTrace } from '../agent-system/orchestration/knowledge-resolution-trace.mjs';
import { buildWorkerKnowledgeDelivery } from '../agent-system/orchestration/knowledge-worker-delivery.mjs';
import { checkUnitDownstreamCoherence, evaluateUnitCompletionGate } from '../agent-system/orchestration/unit-completion-gate.mjs';
import { detectCanonChallenge } from '../agent-system/orchestration/canon-challenge-detector.mjs';
import { reviewCanonChallenge } from '../agent-system/orchestration/canon-challenge-review.mjs';
import { hashObject } from '../agent-system/orchestration/knowledge-graph-core.mjs';
import { readJson } from '../agent-system/orchestration/state-store.mjs';
import { evaluateKnowledgeExemption, checkKnowledgeExemption } from '../agent-system/orchestration/knowledge-exemption.mjs';
import { checkLockedDecisionEvolution, verifyLockedDecisionEvolution } from '../agent-system/orchestration/decision-evolution-guard.mjs';

vi.setConfig({ testTimeout: 90000 });

const REPO=process.cwd();
function tempDir(prefix){return fs.mkdtempSync(path.join(os.tmpdir(),prefix));}
function sorted(xs){return [...xs].sort((a,b)=>String(a).localeCompare(String(b)));}
const UNIT_INPUTS=[
 'PROJECT_CANONICAL_STATE.json','PROJECT_TRUTH_PROTOCOL.md','agent-system/canon/PROJECT_TRUTH.md',
 'agent-system/registries/DECISION_LOG.json','agent-system/registries/FEATURE_REGISTRY.json',
 'agent-system/registries/TECHNICAL_COHESION_AUTHORITY_REGISTRY.json','agent-system/registries/UNIT_BOUNDARY_POLICY.json',
 'agent-system/registries/KNOWLEDGE_ROUTE_REGISTRY.json',
 'docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json',
 'package.json','package-lock.json',
];
function unitRepo(){
 const target=tempDir('dial-unit-repo-');
 for(const rel of UNIT_INPUTS){const src=path.join(REPO,rel),dst=path.join(target,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);}
 return target;
}
function officialFinding({unit,resourceId,suffix=''}){
 return {class:'SECURITY_CHALLENGE',summary:`Pinned finding ${suffix}`,discovered_by:'test',provenance_valid:true,
  sources:[{source_id:'official.test',content_hash:'a'.repeat(64),trust_tier:'T1_OFFICIAL',admitted:true}],minimum_trust_rank:4,
  fresh_enough_for_claim:true,affected_truth_refs:['agent-system/canon/PROJECT_TRUTH.md'],current_truth:'Current canon says A.',evidence_says:'Official evidence requires B.',claim:`A conflicts with B ${suffix}`,
  materiality_threshold_met:true,reproduction:{required:false},corroboration:{required:false},risk_class:'security',critical_risk_credible:true,high_impact:true,
  feature_ids:['SPARE-F001'],affected_unit_lineages:[unit.unit_lineage_id],affected_unit_revisions:[unit.unit_revision_hash],resource_ids:resourceId?[resourceId]:[],
  proposed_change_class:'PROJECT_TRUTH_REVISION',proposed_delta:{op:'supersede',path:'agent-system/canon/PROJECT_TRUTH.md',value:`B ${suffix}`},
  proposed_migration:{steps:['re-resolve affected unit']},verification_plan:{checks:['fresh admission']},reopen_conditions:['materially different evidence'],risk_if_accept:[],risk_if_reject:['security drift']};
}
describe('VEKL 2.2 Development Unit identity',()=>{
 it('keeps lineage stable while truth and stack changes create new revisions',()=>{
  const repo=unitRepo();try{const a=deriveDevelopmentUnits(repo),ua=a.units.find((u)=>u.feature_ids.includes('SPARE-F001'));expect(a.membership_order).toBe('STABLE_LEXICAL_CANONICAL_ID');expect(ua.feature_ids).toEqual(sorted(ua.feature_ids));
   const pkg=JSON.parse(fs.readFileSync(path.join(repo,'package.json'),'utf8'));pkg.vekl_test_marker='stack-revision';fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify(pkg,null,2));const b=deriveDevelopmentUnits(repo),ub=b.units.find((u)=>u.feature_ids.includes('SPARE-F001'));expect(ub.unit_lineage_id).toBe(ua.unit_lineage_id);expect(ub.unit_revision_hash).not.toBe(ua.unit_revision_hash);expect(ub.technical_stack_fingerprint).not.toBe(ua.technical_stack_fingerprint);
   const features=JSON.parse(fs.readFileSync(path.join(repo,'agent-system/registries/FEATURE_REGISTRY.json'),'utf8'));features.find((f)=>f.feature_id==='SPARE-F001').outcome+=' revised';fs.writeFileSync(path.join(repo,'agent-system/registries/FEATURE_REGISTRY.json'),JSON.stringify(features,null,2));const c=deriveDevelopmentUnits(repo),uc=c.units.find((u)=>u.feature_ids.includes('SPARE-F001'));expect(uc.unit_lineage_id).toBe(ua.unit_lineage_id);expect(uc.unit_revision_hash).not.toBe(ub.unit_revision_hash);expect(uc.contract_fingerprints.every((x)=>/^[0-9a-f]{64}$/.test(x))).toBe(true);
  }finally{fs.rmSync(repo,{recursive:true,force:true});}}
 );
});

describe('VEKL 2.2 canonical graph and GraphRAG',()=>{
 it('rebuilds identically and uses only closed graph vocabulary',()=>{const r=verifyGraphRebuild(REPO);expect(r.ok).toBe(true);const g=compileGraphContent(REPO);const nr=JSON.parse(fs.readFileSync('agent-system/registries/KNOWLEDGE_NODE_TYPE_REGISTRY.json','utf8')),er=JSON.parse(fs.readFileSync('agent-system/registries/KNOWLEDGE_EDGE_TYPE_REGISTRY.json','utf8'));const nodes=new Set(nr.node_types.map((x)=>x.node_type)),edges=new Set(er.edge_types.map((x)=>`${x.source_type}|${x.relationship}|${x.target_type}`)),byRef=new Map(g.nodes.map((n)=>[n.node_ref,n]));expect(g.nodes.every((n)=>nodes.has(n.node_type)&&n.authority_reference)).toBe(true);expect(g.edges.every((e)=>edges.has(`${byRef.get(e.source_ref).node_type}|${e.relationship}|${byRef.get(e.target_ref).node_type}`))).toBe(true);});
 it('bounds and hard-filters candidates before deterministic ranking and persists contextual role/purpose',()=>{const root=tempDir('dial-graphrag-');try{const opts={repoDir:REPO,root,featureId:'SPARE-F001',instruction:'Implement and verify the SPARE-F001 customer UI securely',affectedPaths:['apps/preview-player/app/garage/page.tsx']};const a=resolveGraphRag(opts),b=resolveGraphRag(opts);expect(b.graph_neighbourhood_hash).toBe(a.graph_neighbourhood_hash);expect(b.determinism_envelope_hash).toBe(a.determinism_envelope_hash);expect(b.candidates).toEqual(a.candidates);expect(a.determinism_envelope).toMatchObject({concern_classifier:{implementation:'deterministic_rules'},semantic_index:{index_id:'dial-vekl-dev-semantic'},lexical_index:{index_id:'dial-vekl-dev-lexical'},reranker:{algorithm_id:'deterministic-weighted-rerank-v1'},tie_break:{stable_secondary:'canonical_resource_id'}});
  const registry=JSON.parse(fs.readFileSync('agent-system/engineering-knowledge/registries/ENGINEERING_RESOURCE_REGISTRY.json','utf8')),byId=new Map(registry.map((x)=>[x.resource_id,x])),visited=new Set(a.visited_node_refs);for(const c of a.candidates)expect(visited.has(`ENGINEERING_RESOURCE:${c.resource_id}`)||byId.get(c.resource_id)?.always_bind===true).toBe(true);
  const first=a.candidates[0];expect(first).toBeTruthy();const hints={...a.resource_binding_hints,[first.resource_id]:{selection_role:'VERIFIER',selection_purpose:'custom test purpose',context_delivery:'DESCRIPTOR_ONLY'}};const feature=JSON.parse(fs.readFileSync('agent-system/registries/FEATURE_REGISTRY.json','utf8')).find((x)=>x.feature_id==='SPARE-F001');const r=resolveEngineeringResources({repoDir:REPO,root,instruction:opts.instruction,affectedPaths:opts.affectedPaths,featureRecord:feature,maxResources:24,eligibleResourceIds:a.eligible_resource_ids,resourceBindingHints:hints});expect(r.invariants.graph_neighbourhood_before_ranking).toBe(true);expect(r.invariants.hard_eligibility_before_ranking).toBe(true);expect(r.selected_resources.every((x)=>a.eligible_resource_ids.includes(x.resource_id))).toBe(true);const selected=r.selected_resources.find((x)=>x.resource_id===first.resource_id);expect(selected?.selection_role).toBe('VERIFIER');expect(selected?.selection_purpose).toBe('CUSTOM_TEST_PURPOSE');
 }finally{fs.rmSync(root,{recursive:true,force:true});}});
});
describe('VEKL 2.2 packet binding, capsules, trace and stale refusal',()=>{
 it('binds exact worker context with reconstructable capsules and trace',()=>{const root=tempDir('dial-vekl-packet-bind-'),packetId='vekl22-test-packet-bind';try{const instruction='Implement SPARE-F001 vehicle selection and garage using current DIAL contracts.';const manifest=resolvePacketEngineeringKnowledge({repoDir:REPO,root,packetId,instruction,metadata:{feature_id:'SPARE-F001'}});expect(manifest.policy_version).toBe('vekl-2.2-rev2');expect(manifest.execution_allowed).toBe(true);expect(manifest.knowledge_context.knowledge_readiness_state).toBe('READY');expect(checkKnowledgeBinding({repoDir:REPO,root,packetId})).toMatchObject({ok:true,state:'CURRENT'});
  const trace=loadKnowledgeResolutionTrace(packetId,root);const delivery=buildWorkerKnowledgeDelivery({packetId,manifest,instruction,root});expect(trace.worker_delivery_hash).toBe(delivery.worker_delivery_hash);expect(Object.keys(trace.context_capsules)).toHaveLength(7);expect(trace.determinism_envelope.hash).toBe(manifest.knowledge_context.determinism_envelope_hash);expect(trace.candidates.excluded.every((x)=>x.reason_codes.length>0)).toBe(true);
 }finally{fs.rmSync(root,{recursive:true,force:true});}});
 it('refuses invalidated knowledge until audited re-resolution',()=>{const root=tempDir('dial-vekl-packet-stale-'),packetId='vekl22-test-packet-stale';try{const instruction='Implement SPARE-F001 vehicle selection and garage using current DIAL contracts.';const manifest=resolvePacketEngineeringKnowledge({repoDir:REPO,root,packetId,instruction,metadata:{feature_id:'SPARE-F001'}});
  const inv=invalidateKnowledge({root,changeset:{changed_node_refs:['FEATURE:SPARE-F001'],change_class:'TEST_INVALIDATION',reason:'race test'}});expect(inv.affected_unit_lineages).toContain(manifest.knowledge_context.unit_lineage_id);const stale=checkKnowledgeBinding({repoDir:REPO,root,packetId});expect(stale.ok).toBe(false);expect(stale.reasons).toContain('UNIT_MAP_STALE');expect(()=>ensurePacketEngineeringKnowledge({repoDir:REPO,root,packetId,instruction,metadata:{feature_id:'SPARE-F001'}})).toThrow(/stale knowledge binding/i);
  const refreshed=reResolvePacketEngineeringKnowledge({repoDir:REPO,root,packetId,instruction,metadata:{feature_id:'SPARE-F001'},reason:'accepted invalidation requires a fresh Unit map and binding'});expect(refreshed.activation_id).not.toBe(manifest.activation_id);expect(checkKnowledgeBinding({repoDir:REPO,root,packetId}).ok).toBe(true);expect(loadKnowledgeResolutionTrace(packetId,root).activation.manifest_id).toBe(refreshed.activation_id);
 }finally{fs.rmSync(root,{recursive:true,force:true});}});
 it('requires fresh implementation, verification, Product Experience and downstream coherence evidence for completion',()=>{const root=tempDir('dial-vekl-complete-');try{const {map}=buildUnitKnowledgeMap({repoDir:REPO,root,featureId:'SPARE-F001',instruction:'Verify SPARE-F001 UI'});expect(map.product_experience_map.applicable).toBe(true);expect(map.product_experience_map.hard_gate.obligations.length).toBeGreaterThan(5);expect(map.product_experience_map.qualitative_gate.automated_clearance).toBe('PROJECT_SPECIFIC_ORACLE_REQUIRED');const coherence=checkUnitDownstreamCoherence({repoDir:REPO,unitId:map.unit_lineage_id});expect(coherence.ok).toBe(true);expect(evaluateUnitCompletionGate({unitMap:map,downstreamCoherence:coherence}).ok).toBe(false);const h='b'.repeat(64);const done=evaluateUnitCompletionGate({unitMap:map,implementationEvidence:{content_hash:h},verificationEvidence:{content_hash:'c'.repeat(64)},downstreamCoherence:coherence,productExperienceEvidence:{hard_gate_passed:true,qualitative_gate_passed:true,oracle_evidence_hash:'d'.repeat(64)}});expect(done).toMatchObject({ok:true,state:'COMPLETE_EVIDENCED'});
 }finally{fs.rmSync(root,{recursive:true,force:true});}});
});


describe('VEKL 2.2 canon challenge governance',()=>{
 it('withholds critical conflicting evidence, blocks the affected Unit, and requires exact owner authority',()=>{
  const root=tempDir('dial-vekl-challenge-');
  try{
   const base=resolveGraphRag({repoDir:REPO,root,featureId:'SPARE-F001',instruction:'Implement SPARE-F001 securely'});
   const unit=deriveDevelopmentUnits(REPO).units.find((u)=>u.feature_ids.includes('SPARE-F001'));
   const resourceId=base.eligible_resource_ids[0];
   const finding=officialFinding({unit,resourceId,suffix:'critical'});
   const detected=detectCanonChallenge({repoDir:REPO,root,finding});
   expect(detected).toMatchObject({state:'CHALLENGE_CANDIDATE',severity:'CRITICAL'});
   const map=buildUnitKnowledgeMap({repoDir:REPO,root,featureId:'SPARE-F001',instruction:'Implement SPARE-F001 securely'}).map;
   expect(map.knowledge_readiness_state).toBe('BLOCKED');
   expect(map.knowledge_blocking_reasons.some((x)=>x.type==='PROJECT_TRUTH_CHALLENGE')).toBe(true);
   const routed=resolveGraphRag({repoDir:REPO,root,featureId:'SPARE-F001',instruction:'Implement SPARE-F001 securely'});
   expect(routed.excluded).toContainEqual({resource_id:resourceId,reason:'OPEN_PROJECT_TRUTH_CHALLENGE_WITHHELD'});
   const challenge=readJson(`knowledge/research/challenges/index.json`,null,root).challenges.find((x)=>x.challenge_id===detected.challenge_id);
   const record=readJson(challenge.rel,null,root);
   const exact={authority:'OWNER_EXPLICIT',reusable:false,standing:false,batch:false,challenge_id:record.challenge_id,proposed_delta_hash:record.recommendation.proposed_delta_hash,decision:'ACCEPT',reviewer_class:'PRODUCT_OWNER'};
   expect(()=>reviewCanonChallenge({repoDir:REPO,root,challengeId:record.challenge_id,decision:'ACCEPT',ownerAuthorization:{...exact,authority:'OWNER_DERIVED'}})).toThrow(/OWNER_EXPLICIT/);
   expect(()=>reviewCanonChallenge({repoDir:REPO,root,challengeId:record.challenge_id,decision:'ACCEPT',ownerAuthorization:{...exact,proposed_delta_hash:'0'.repeat(64)}})).toThrow(/exact proposed delta/);
   const accepted=reviewCanonChallenge({repoDir:REPO,root,challengeId:record.challenge_id,decision:'ACCEPT',reason:'owner accepts exact tested delta',ownerAuthorization:exact});
   expect(accepted).toMatchObject({status:'CANON_DELTA_AUTHORIZED',canon_mutated:false,normal_truth_writer_required:true});
   expect(accepted.invalidation.affected_unit_lineages).toContain(unit.unit_lineage_id);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });

 it('retains rejected challenge rationale and suppresses equivalent challenges until reopen evidence changes',()=>{
  const root=tempDir('dial-vekl-reject-');
  try{
   const unit=deriveDevelopmentUnits(REPO).units.find((u)=>u.feature_ids.includes('SPARE-F001'));
   const finding=officialFinding({unit,suffix:'reject'});
   const detected=detectCanonChallenge({repoDir:REPO,root,finding});
   const idx=readJson('knowledge/research/challenges/index.json',null,root);const row=idx.challenges.find((x)=>x.challenge_id===detected.challenge_id);const record=readJson(row.rel,null,root);
   const auth={authority:'OWNER_EXPLICIT',reusable:false,challenge_id:record.challenge_id,proposed_delta_hash:record.recommendation.proposed_delta_hash,decision:'REJECT',reviewer_class:'PRODUCT_OWNER'};
   const rejected=reviewCanonChallenge({repoDir:REPO,root,challengeId:record.challenge_id,decision:'REJECT',reason:'insufficient benefit for current canon',ownerAuthorization:auth});
   expect(rejected.status).toBe('REJECTED');
   const updatedIdx=readJson('knowledge/research/challenges/index.json',null,root);const updated=readJson(updatedIdx.challenges.find((x)=>x.challenge_id===record.challenge_id).rel,null,root);
   expect(updated.review.decision_reason).toBe('insufficient benefit for current canon');
   expect(updated.reopen_conditions).toContain('materially different evidence');
   const duplicate=detectCanonChallenge({repoDir:REPO,root,finding});
   expect(duplicate).toMatchObject({state:'DUPLICATE_SUPPRESSED',status:'REJECTED',challenge_id:record.challenge_id});
   const reopened=detectCanonChallenge({repoDir:REPO,root,finding:{...finding,materially_different_evidence:true,claim:`${finding.claim} materially changed`}});
   expect(reopened.state).toBe('CHALLENGE_CANDIDATE');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
});


describe('VEKL 2.2 explicit exemption and Decision evolution',()=>{
 it('reports explicit low-risk exemptions as EXEMPT_BY_POLICY with pinned policy/archetype hashes',()=>{
  const root=tempDir('dial-vekl-exempt-');
  try{
   const result=resolvePacketEngineeringKnowledge({repoDir:REPO,root,packetId:'vekl22-exempt',instruction:'Reflow markdown formatting only.',metadata:{knowledge_exemption_archetype:'DOC_FORMAT_ONLY'}});
   expect(result.resolution_state).toBe('EXEMPT_BY_POLICY');
   expect(result.knowledge_context).toMatchObject({scope:'POLICY_EXEMPTION',knowledge_readiness_state:'EXEMPT_BY_POLICY'});
   expect(result.knowledge_context.knowledge_exemption.policy_hash).toMatch(/^[0-9a-f]{64}$/);
   expect(result.knowledge_context.knowledge_exemption.archetype_hash).toMatch(/^[0-9a-f]{64}$/);
   expect(checkKnowledgeExemption({repoDir:REPO,root,packetId:'vekl22-exempt'}).ok).toBe(true);
   const forbidden=evaluateKnowledgeExemption({repoDir:REPO,archetype:'DOC_FORMAT_ONLY',featureId:'SPARE-F001'});
   expect(forbidden).toMatchObject({allowed:false,state:'EXEMPTION_REFUSED',reason:'FORBIDDEN_SCOPE'});
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
 it('fails closed on destructive mutation/deletion of an already locked Decision while allowing additive decisions',()=>{
  const base=[{decision_id:'DEC-X',status:'LOCKED',decision:'A',consequence:'keep'}];
  expect(checkLockedDecisionEvolution({baseRows:base,currentRows:[...base,{decision_id:'DEC-Y',status:'LOCKED',decision:'B'}]}).ok).toBe(true);
  expect(checkLockedDecisionEvolution({baseRows:base,currentRows:[{...base[0],decision:'mutated'}]}).failures).toContainEqual({decision_id:'DEC-X',reason:'LOCKED_DECISION_MUTATED'});
  expect(checkLockedDecisionEvolution({baseRows:base,currentRows:[]}).failures).toContainEqual({decision_id:'DEC-X',reason:'LOCKED_DECISION_DELETED'});
  const live=verifyLockedDecisionEvolution({repoDir:REPO,baseRef:'origin/master'});
  expect(live.ok).toBe(true);
  expect(live.failures).toEqual([]);
  expect(live.locked_base_count).toBeGreaterThan(0);
 });
});
