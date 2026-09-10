#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deriveDevelopmentUnits } from './development-unit-planner.mjs';
import { compileGraphContent, verifyGraphRebuild } from './canon-graph-compiler.mjs';
import { resolvePacketEngineeringKnowledge } from './engineering-knowledge-broker.mjs';
import { loadKnowledgeResolutionTrace } from './knowledge-resolution-trace.mjs';
import { buildWorkerKnowledgeDelivery } from './knowledge-worker-delivery.mjs';
import { checkKnowledgeBinding } from './knowledge-admission-guard.mjs';
import { detectCanonChallenge } from './canon-challenge-detector.mjs';
import { reviewCanonChallenge } from './canon-challenge-review.mjs';
import { evaluateKnowledgeExemption } from './knowledge-exemption.mjs';
import { verifyLockedDecisionEvolution } from './decision-evolution-guard.mjs';
import { checkUnitDownstreamCoherence, evaluateUnitCompletionGate } from './unit-completion-gate.mjs';
import { hashObject, loadRegistry } from './knowledge-graph-core.mjs';
import { readJson } from './state-store.mjs';

const FEATURE='SPARE-F001';
const CONTRACT_REL='docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json';
function temp(prefix){return fs.mkdtempSync(path.join(os.tmpdir(),prefix));}
function sorted(xs){return [...xs].sort((a,b)=>String(a).localeCompare(String(b)));}
function digest(v){return /^[0-9a-f]{64}$/i.test(String(v||''));}
function readSource(repoDir,rel){return fs.readFileSync(path.join(repoDir,rel),'utf8');}
function officialFinding(unit,resourceId,suffix){return {class:'SECURITY_CHALLENGE',summary:`architecture check ${suffix}`,discovered_by:'architecture-check',provenance_valid:true,sources:[{source_id:'official.arch-check',content_hash:'a'.repeat(64),trust_tier:'T1_OFFICIAL',admitted:true}],minimum_trust_rank:4,fresh_enough_for_claim:true,affected_truth_refs:['agent-system/canon/PROJECT_TRUTH.md'],current_truth:'A',evidence_says:'B',claim:`A conflicts with B ${suffix}`,materiality_threshold_met:true,reproduction:{required:false},corroboration:{required:false},risk_class:'security',critical_risk_credible:true,high_impact:true,feature_ids:[FEATURE],affected_unit_lineages:[unit.unit_lineage_id],affected_unit_revisions:[unit.unit_revision_hash],resource_ids:resourceId?[resourceId]:[],proposed_change_class:'PROJECT_TRUTH_REVISION',proposed_delta:{op:'supersede',path:'agent-system/canon/PROJECT_TRUTH.md',value:`B ${suffix}`},proposed_migration:{steps:['re-resolve']},verification_plan:{checks:['fresh admission']},reopen_conditions:['materially different evidence'],risk_if_accept:[],risk_if_reject:['security drift']};}
function row(id,name,ok,evidence){return {criterion:id,name,status:ok?'PASS':'FAIL',evidence};}
function closedVocabulary(graph,nodeReg,edgeReg){const nodes=new Set(nodeReg.node_types.map((x)=>x.node_type));const edges=new Set(edgeReg.edge_types.map((x)=>`${x.source_type}|${x.relationship}|${x.target_type}`));const byRef=new Map(graph.nodes.map((n)=>[n.node_ref,n]));return graph.nodes.every((n)=>nodes.has(n.node_type))&&graph.edges.every((e)=>edges.has(`${byRef.get(e.source_ref)?.node_type}|${e.relationship}|${byRef.get(e.target_ref)?.node_type}`));}

export function runVeklArchitectureCheck({repoDir=process.cwd()}={}){
 const root=temp('dial-vekl-arch-');const rejectRoot=temp('dial-vekl-reject-');const results=[];
 try{
  const projection=deriveDevelopmentUnits(repoDir),units=projection.units,unit=units.find((u)=>u.feature_ids.includes(FEATURE));
  const boundary=loadRegistry(repoDir,'agent-system/registries/UNIT_BOUNDARY_POLICY.json',{}),routes=loadRegistry(repoDir,'agent-system/registries/KNOWLEDGE_ROUTE_REGISTRY.json',{}),det=loadRegistry(repoDir,'agent-system/registries/GRAPHRAG_DETERMINISM_POLICY.json',{}),nodeReg=loadRegistry(repoDir,'agent-system/registries/KNOWLEDGE_NODE_TYPE_REGISTRY.json',{}),edgeReg=loadRegistry(repoDir,'agent-system/registries/KNOWLEDGE_EDGE_TYPE_REGISTRY.json',{});
  const graph=compileGraphContent(repoDir),rebuild=verifyGraphRebuild(repoDir);
  const instruction='Implement and verify SPARE-F001 vehicle selection and garage UI securely.';
  const manifest=resolvePacketEngineeringKnowledge({repoDir,root,packetId:'vekl-architecture-check',instruction,metadata:{feature_id:FEATURE,affected_paths:['apps/preview-player/app/garage/page.tsx'],max_resources:24}});
  const k=manifest.knowledge_context,trace=loadKnowledgeResolutionTrace('vekl-architecture-check',root),delivery=buildWorkerKnowledgeDelivery({packetId:'vekl-architecture-check',manifest,instruction,root});
  const currentMapPtr=readJson(`knowledge/graph/units/${k.unit_lineage_id}/current.json`,null,root),unitMap=readJson(currentMapPtr.map_rel,null,root);
  const resources=loadRegistry(repoDir,'agent-system/engineering-knowledge/registries/ENGINEERING_RESOURCE_REGISTRY.json',[]),resourceById=new Map(resources.map((x)=>[x.resource_id,x]));
  const visited=new Set(trace.traversal.visited_node_refs),contracts=loadRegistry(repoDir,CONTRACT_REL,[]);
  const coherence=checkUnitDownstreamCoherence({repoDir,unitId:unit.unit_lineage_id});
  const completionBlocked=evaluateUnitCompletionGate({unitMap,downstreamCoherence:coherence});
  const completionGreen=evaluateUnitCompletionGate({unitMap,implementationEvidence:{content_hash:'b'.repeat(64)},verificationEvidence:{content_hash:'c'.repeat(64)},downstreamCoherence:coherence,productExperienceEvidence:{hard_gate_passed:true,qualitative_gate_passed:true,oracle_evidence_hash:'d'.repeat(64)}});
  const exemption=evaluateKnowledgeExemption({repoDir,archetype:'DOC_FORMAT_ONLY'}),uiExemption=evaluateKnowledgeExemption({repoDir,archetype:'DOC_FORMAT_ONLY',featureId:FEATURE});
  const decisionCheck=verifyLockedDecisionEvolution({repoDir,baseRef:'origin/master'});
  const preTool=readSource(repoDir,'agent-system/hooks/pre-tool-guard.mjs'),external=readSource(repoDir,'agent-system/orchestration/external-orchestrator.mjs'),hermes=readSource(repoDir,'agent-system/orchestration/hermes-runtime-executor.mjs');
  const resourceId=trace.candidates.eligible[0]?.resource_id||null;const finding=officialFinding(unit,resourceId,'accept');
  const detected=detectCanonChallenge({repoDir,root,finding});const staleAfterChallenge=checkKnowledgeBinding({repoDir,root,packetId:'vekl-architecture-check'});
  const blockedManifest=resolvePacketEngineeringKnowledge({repoDir,root,packetId:'vekl-architecture-blocked',instruction,metadata:{feature_id:FEATURE}});
  const index=readJson('knowledge/research/challenges/index.json',null,root),challengeRow=index.challenges.find((x)=>x.challenge_id===detected.challenge_id),challenge=readJson(challengeRow.rel,null,root);
  const exactAuth={authority:'OWNER_EXPLICIT',reusable:false,standing:false,batch:false,challenge_id:challenge.challenge_id,proposed_delta_hash:challenge.recommendation.proposed_delta_hash,decision:'ACCEPT',reviewer_class:'PRODUCT_OWNER'};
  let derivedRefused=false;try{reviewCanonChallenge({repoDir,root,challengeId:challenge.challenge_id,decision:'ACCEPT',ownerAuthorization:{...exactAuth,authority:'OWNER_DERIVED'}});}catch{derivedRefused=true;}
  const accepted=reviewCanonChallenge({repoDir,root,challengeId:challenge.challenge_id,decision:'ACCEPT',reason:'architecture check exact approval',ownerAuthorization:exactAuth});
  const pendingMap=resolvePacketEngineeringKnowledge({repoDir,root,packetId:'vekl-architecture-pending',instruction,metadata:{feature_id:FEATURE}});
  const rejectFinding=officialFinding(unit,null,'reject'),rejectDetected=detectCanonChallenge({repoDir,root:rejectRoot,finding:rejectFinding}),rejectIndex=readJson('knowledge/research/challenges/index.json',null,rejectRoot),rejectChallenge=readJson(rejectIndex.challenges.find((x)=>x.challenge_id===rejectDetected.challenge_id).rel,null,rejectRoot);
  const rejectAuth={authority:'OWNER_EXPLICIT',reusable:false,challenge_id:rejectChallenge.challenge_id,proposed_delta_hash:rejectChallenge.recommendation.proposed_delta_hash,decision:'REJECT',reviewer_class:'PRODUCT_OWNER'};
  reviewCanonChallenge({repoDir,root:rejectRoot,challengeId:rejectChallenge.challenge_id,decision:'REJECT',reason:'architecture check rejection rationale',ownerAuthorization:rejectAuth});
  const rejectedIndex=readJson('knowledge/research/challenges/index.json',null,rejectRoot),rejectedRecord=readJson(rejectedIndex.challenges.find((x)=>x.challenge_id===rejectChallenge.challenge_id).rel,null,rejectRoot),duplicate=detectCanonChallenge({repoDir,root:rejectRoot,finding:rejectFinding});
  const graphResourceIds=new Set(trace.traversal.visited_node_refs.filter((x)=>x.startsWith('ENGINEERING_RESOURCE:')).map((x)=>x.slice('ENGINEERING_RESOURCE:'.length)));
  const boundaryText=JSON.stringify(boundary),detText=JSON.stringify(det),capsuleKeys=Object.keys(trace.context_capsules||{});
  const unitMapKeys=Object.keys(unitMap||{});const noAuthorityCopies=!unitMapKeys.includes('feature_records')&&!unitMapKeys.includes('decision_records')&&!unitMapKeys.includes('project_truth_document');
  const requiredPrefilter=['provenance_valid','admitted_source','minimum_source_trust_met','fresh_enough_for_claim','affected_truth_refs_present','contradiction_specific','materiality_threshold_met'];
  results.push(row(1,'stable unit_lineage_id',units.length>0&&units.every((u)=>/^DU-LIN-[0-9a-f]{24}$/.test(u.unit_lineage_id))&&new Set(units.map((u)=>u.unit_lineage_id)).size===units.length,{units:units.length}));
  results.push(row(2,'immutable unit_revision_hash',units.every((u)=>digest(u.unit_revision_hash)),{sample:unit.unit_revision_hash}));
  results.push(row(3,'ordinary truth/stack/contract changes revise lineage instead of churning identity',boundary.lineage_fields?.every((x)=>!/(truth|stack|contract)/i.test(x))&&['applicable_project_truth_slice_hash','technical_stack_fingerprint','dependency_contract_fingerprints'].every((x)=>boundary.revision_fields?.includes(x)),{lineage_fields:boundary.lineage_fields,revision_fields:boundary.revision_fields}));
  results.push(row(4,'canonical Unit membership ordering',projection.membership_order==='STABLE_LEXICAL_CANONICAL_ID'&&units.every((u)=>JSON.stringify(u.feature_ids)===JSON.stringify(sorted(u.feature_ids))&&JSON.stringify(u.realization_facets)===JSON.stringify(sorted(u.realization_facets))),{membership_order:projection.membership_order}));
  results.push(row(5,'stack/cohesion fingerprint is revision identity',boundary.revision_fields?.includes('technical_stack_fingerprint')&&units.every((u)=>digest(u.technical_stack_fingerprint)),{sample_stack:unit.technical_stack_fingerprint}));
  results.push(row(6,'material Unit map or explicit EXEMPT_BY_POLICY',unitMap.knowledge_readiness_state==='READY'&&exemption.state==='EXEMPT_BY_POLICY'&&uiExemption.state==='EXEMPTION_REFUSED',{mapped_unit:unitMap.unit_lineage_id,exemption_state:exemption.state}));
  results.push(row(7,'Unit maps reference authority instead of copying truth',noAuthorityCopies&&unitMap.authority_map.feature_refs.every((x)=>x.feature_id&&digest(x.hash))&&unitMap.authority_map.decision_refs.every((x)=>x.decision_id&&digest(x.hash)),{authority_map_keys:Object.keys(unitMap.authority_map)}));
  results.push(row(8,'closed graph vocabulary',nodeReg.closed_vocabulary===true&&edgeReg.closed_vocabulary===true&&closedVocabulary(graph,nodeReg,edgeReg),{nodes:graph.nodes.length,edges:graph.edges.length}));
  results.push(row(9,'machine-readable Unit dependencies',units.every((u)=>Array.isArray(u.upstream_dependencies)&&Array.isArray(u.downstream_consumers)),{sample_upstream:unit.upstream_dependencies.length,sample_downstream:unit.downstream_consumers.length}));
  results.push(row(10,'consumed/produced contracts fingerprinted',units.every((u)=>[...(u.contracts_consumed||[]),...(u.contracts_produced||[])].every((x)=>x.contract_id&&digest(x.fingerprint))),{contracts:contracts.length}));
  results.push(row(11,'GraphRAG bounded before ranking',trace.candidates.eligible.every((x)=>graphResourceIds.has(x.resource_id)||resourceById.get(x.resource_id)?.always_bind===true),{visited_resources:graphResourceIds.size,eligible:trace.candidates.eligible.length}));
  const env=trace.determinism_envelope;
  results.push(row(12,'pinned GraphRAGDeterminismEnvelope',digest(env.hash)&&env.concern_classifier&&env.route_registry&&env.chunking_profile&&env.embedding_profile&&env.semantic_index&&env.lexical_index&&env.reranker&&env.fusion_profile&&env.tie_break_policy,{envelope_hash:env.hash}));
  results.push(row(13,'versioned controlled indexing primitives',Boolean(det.semantic_index?.index_id&&det.semantic_index?.index_version&&det.lexical_index?.index_id&&det.lexical_index?.index_version&&det.embedding?.model_revision)&&!readSource(repoDir,'agent-system/orchestration/graph-retrieval-router.mjs').includes('CREATE EXTENSION vector'),{semantic_index:det.semantic_index,lexical_index:det.lexical_index}));
  const resolverSource=readSource(repoDir,'agent-system/orchestration/engineering-resource-resolver.mjs');
  results.push(row(14,'VEKL hard eligibility remains intact',resolverSource.includes('evaluateEngineeringResourceHardEligibility')&&resolverSource.includes('eligibleResourceIds')&&manifest.resources.every((x)=>trace.candidates.eligible.some((c)=>c.resource_id===x.resource_id)),{selected_resources:manifest.resources.length}));
  results.push(row(15,'selection role/purpose persisted contextually',manifest.resources.length>0&&manifest.resources.every((x)=>x.selection_role&&x.selection_purpose)&&resolverSource.includes('resourceBindingHints'),{bindings:manifest.resources.map((x)=>[x.resource_id,x.selection_role,x.selection_purpose])}));
  results.push(row(16,'UI Product Experience hard + qualitative gates',unitMap.product_experience_map?.applicable===true&&unitMap.product_experience_map.hard_gate?.obligations?.length>0&&unitMap.product_experience_map.qualitative_gate?.automated_clearance==='PROJECT_SPECIFIC_ORACLE_REQUIRED',{design_authorities:unitMap.product_experience_map?.design_authorities}));
  results.push(row(17,'Project Truth conflicts withheld from execution but reviewable',detected.state==='CHALLENGE_CANDIDATE'&&resourceId&&!(blockedManifest.resources||[]).some((x)=>x.resource_id===resourceId)&&blockedManifest.knowledge_context.knowledge_readiness_state==='BLOCKED',{challenge_id:detected.challenge_id,withheld_resource:resourceId}));
  results.push(row(18,'deterministic challenge promotion policy',detected.prefilter?.passed===true&&requiredPrefilter.every((x)=>detected.prefilter.checks?.[x]===true),{prefilter:detected.prefilter?.checks}));
  results.push(row(19,'exact owner-only canon delta decision',derivedRefused&&accepted.status==='CANON_DELTA_AUTHORIZED'&&accepted.canon_mutated===false&&accepted.normal_truth_writer_required===true,{challenge_id:accepted.challenge_id,status:accepted.status}));
  results.push(row(20,'locked Decisions evolve additively/superseding',decisionCheck.ok===true,{locked_base_count:decisionCheck.locked_base_count,new_decision_ids:decisionCheck.new_decision_ids}));
  const missionSource=readSource(repoDir,'agent-system/orchestration/mission-control.mjs');
  results.push(row(21,'critical blocking reuses knowledge readiness + mission control',blockedManifest.knowledge_context.knowledge_readiness_state==='BLOCKED'&&blockedManifest.execution_allowed===false&&!missionSource.includes("state: 'CANON_CHALLENGE'"),{knowledge_state:blockedManifest.knowledge_context.knowledge_readiness_state}));
  results.push(row(22,'accepted changes invalidate and require re-resolution',accepted.invalidation?.affected_unit_lineages?.includes(unit.unit_lineage_id)===true&&pendingMap.knowledge_context.knowledge_readiness_state==='BLOCKED'&&boundary.revision_fields.includes('applicable_project_truth_slice_hash'),{invalidation_id:accepted.invalidation?.changeset_id,pending_state:pendingMap.knowledge_context.knowledge_readiness_state}));
  results.push(row(23,'rejected challenge rationale + reopen suppression',rejectedRecord.status==='REJECTED'&&Boolean(rejectedRecord.review.decision_reason)&&rejectedRecord.reopen_conditions.length>0&&duplicate.state==='DUPLICATE_SUPPRESSED',{challenge_id:rejectChallenge.challenge_id,duplicate_state:duplicate.state}));
  const admissionBoundaries=['DISPATCH_ADMISSION','HARNESS_PREFLIGHT','WORKER_START','FALLBACK_WORKER_START'];
  results.push(row(24,'transactional stale-context admission at execution boundaries',staleAfterChallenge.ok===false&&staleAfterChallenge.reasons.includes('UNIT_MAP_STALE')&&admissionBoundaries.every((x)=>(external+hermes).includes(x))&&preTool.includes('checkKnowledgeBinding'),{stale_reasons:staleAfterChallenge.reasons,boundaries:admissionBoundaries}));
  results.push(row(25,'graph rebuildable and not a second truth store',rebuild.ok===true&&graph.nodes.every((n)=>n.authority_reference)&&graph.nodes.every((n)=>n.authority_reference?.stable_ref),{graph_generation_id:rebuild.generation_id,graph_revision_hash:rebuild.graph_revision_hash}));
  results.push(row(26,'bounded provenance-bearing worker context',capsuleKeys.length===7&&manifest.resources.length<=24&&trace.worker_delivery_hash===delivery.worker_delivery_hash&&trace.activation.manifest_hash===manifest.manifest_sha256,{capsules:capsuleKeys,worker_delivery_hash:delivery.worker_delivery_hash}));
  results.push(row(27,'completion requires fresh implementation + verification evidence',completionBlocked.ok===false&&completionBlocked.failures.includes('FRESH_IMPLEMENTATION_EVIDENCE_REQUIRED')&&completionBlocked.failures.includes('FRESH_VERIFICATION_EVIDENCE_REQUIRED')&&completionGreen.ok===true,{blocked_failures:completionBlocked.failures,green_state:completionGreen.state}));
  results.push(row(28,'downstream coherence checked before completion',coherence.ok===true&&digest(coherence.coherence_hash)&&completionGreen.evidence.coherence_hash===coherence.coherence_hash,{coherence_checks:coherence.checks.length,coherence_hash:coherence.coherence_hash}));
  const tracePointer=readJson('knowledge/activation/traces/by-packet/vekl-architecture-check.json',null,root);
  results.push(row(29,'immutable content-addressed KnowledgeResolutionTrace',digest(trace.trace_hash)&&digest(tracePointer?.trace_hash)&&String(tracePointer?.trace_rel||'').includes(tracePointer.trace_hash),{trace_hash:trace.trace_hash,content_addressed_hash:tracePointer?.trace_hash}));
  results.push(row(30,'trace reconstructs inclusion/exclusion and exact worker delivery',trace.traversal.start_nodes.length>0&&Array.isArray(trace.traversal.visited_node_refs)&&Array.isArray(trace.candidates.eligible)&&Array.isArray(trace.candidates.excluded)&&trace.candidates.excluded.every((x)=>x.reason_codes?.length>0)&&trace.worker_delivery_hash===delivery.worker_delivery_hash&&digest(trace.instruction_hash),{eligible:trace.candidates.eligible.length,excluded:trace.candidates.excluded.length,worker_delivery_hash:trace.worker_delivery_hash}));
  const failures=results.filter((x)=>x.status!=='PASS');return{status:failures.length?'RED':'GREEN',policy_version:'vekl-2.2-rev2',criteria_passed:results.length-failures.length,criteria_total:results.length,criteria:results,failures};
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(rejectRoot,{recursive:true,force:true});}
}

if(import.meta.url===`file://${process.argv[1]}`){
 const result=runVeklArchitectureCheck({repoDir:process.env.DIAL_REPO_DIR||process.cwd()});
 const writeIndex=process.argv.indexOf('--write-evidence');
 if(writeIndex>=0){const target=process.argv[writeIndex+1]||'docs/project-state/VEKL_2_2_ARCHITECTURE_GREEN.json';fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,`${JSON.stringify({...result,evidence_hash:hashObject({policy_version:result.policy_version,criteria:result.criteria})},null,2)}\n`);}
 console.log(JSON.stringify(result,null,2));if(result.status!=='GREEN'||result.criteria_total!==30)process.exitCode=42;
}
