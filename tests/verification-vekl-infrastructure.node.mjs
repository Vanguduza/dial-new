import test from 'node:test';
import assert from 'node:assert/strict';
import { VeklResearchLoop, immutableDuPacket } from '../agent-system/orchestration/vekl-research-loop.mjs';
import { inferResearchContexts } from '../agent-system/orchestration/vekl-research-seed.mjs';
import { qualifyCandidate } from '../agent-system/orchestration/discovery-admission.mjs';
import { buildDiscoveryCandidate, loadDiscoveryPolicy } from '../agent-system/orchestration/discovery-lifecycle.mjs';
import { COVERAGE_STATUSES } from '../agent-system/orchestration/vekl-research-contracts.mjs';
import { VEKL_RESEARCH_FIXED_SQL } from '../agent-system/orchestration/vekl-research-postgres-store.mjs';

const roles=Array.from({length:18},(_,i)=>'ROLE_'+(i+1));
const basePacket=()=>({
  unit_lineage_id:'DU-LIN-test',unit_revision_hash:'a'.repeat(64),feature_ids:['F-1'],
  research_roles:roles,research_dimensions:['SOURCES'],questions:['q'],
  discovery_workload:{mode:'OPEN_WORLD_BOUNDED'},
  guided_frontend_context:{applicable:false,evidence_required:[]},
  n8n_architecture_context:{applicable:false,evidence_required:[]},
  repository_sha:'b'.repeat(40),project_truth_hash:'c'.repeat(64),project_truth_fingerprint:'d'.repeat(64),
  graph_generation_id:'KG-test',graph_revision_hash:'e'.repeat(64),
  contract_bindings:[{contract_id:'FRC:F-1',fingerprint:'f'.repeat(64)}],
});

class Store {
  constructor(){this.requests=new Map();this.events=[];this.evidence=[];this.lease=null;}
  getRequest(id){return this.requests.get(id)}
  putRequest(v){this.requests.set(v.request_id,v)}
  claimNext(v){
    this.lease={...v,packet_id:'P1',packet_hash:immutableDuPacket(basePacket()).packet_hash,lease_id:'L1',packet:basePacket(),resume:{chatgpt_deep_research:{state:'READY'}}};
    this.events.push({event_kind:'CLAIM',payload:{lease_id:'L1',packet_id:'P1',packet_hash:this.lease.packet_hash,worker_id:v.worker_id}});
    return this.lease;
  }
  getLease(){return this.lease}
  event(k,v){this.events.push({event_kind:k,payload:v});return {state:'RECORDED'}}
  recordSearch(v){return this.event('SEARCH',v)}
  recordRead(v){return this.event('FETCH_READ',v)}
  persistEvidence(v){this.evidence.push({evidence_kind:v.kind,claims:v.claims,sources:v.sources,evidence_hash:v.evidence_hash});this.event(v.kind==='DEEPER_EVIDENCE'?'DEEPER_EVIDENCE_SUBMITTED':'ANALYSIS_SUBMITTED',v);return {state:'VALIDATED_PERSISTED',evidence_hash:v.evidence_hash}}
  completionBundle(){return {packet_id:'P1',packet_hash:this.lease.packet_hash,packet_json:this.lease.packet,resume:{},evidence:this.evidence,events:this.events}}
  complete(){return {state:'COMPLETE'}}
  retry(){return {state:'RETRY'}}
  refuse(){return {state:'REFUSED'}}
}

test('completion gate blocks incomplete deep loop',async()=>{
  const s=new Store();const l=new VeklResearchLoop({store:s,clock:()=>1000});
  const c=await l.invoke('claim',{request_id:'req-claim-0001',worker_id:'chatgpt-deep'});
  await l.invoke('fetch',{request_id:'req-fetch-0001',worker_id:'chatgpt-deep',lease_id:c.lease_id});
  const r=await l.invoke('complete',{request_id:'req-complete-0001',worker_id:'chatgpt-deep',lease_id:c.lease_id});
  assert.equal(r.state,'COMPLETION_GATE_BLOCKED');
  assert(r.missing.includes('DEEPER_EVIDENCE'));
  assert(r.missing.includes('SEARCH'));
});

test('completion gate accepts full same-lease sequence',async()=>{
  const s=new Store();
  const l=new VeklResearchLoop({
    store:s,clock:()=>1000,
    searchAdapter:async()=>({results:[{url:'https://example.com/doc'}]}),
    fetchAdapter:async()=>({url:'https://example.com/doc',sha256:'9'.repeat(64),content_type:'text/plain',excerpt:'evidence'})
  });
  const c=await l.invoke('claim',{request_id:'req-claim-0002',worker_id:'chatgpt-deep'});
  s.evidence.push({evidence_kind:'GROQ_RESEARCH',claims:[],sources:[],evidence_hash:'8'.repeat(64)});
  await l.invoke('fetch',{request_id:'req-fetch-0002',worker_id:'chatgpt-deep',lease_id:c.lease_id});
  await l.invoke('search',{request_id:'req-search-0002',worker_id:'chatgpt-deep',lease_id:c.lease_id,search_query:'test'});
  const rd=await l.invoke('fetch-read',{request_id:'req-read-0002',worker_id:'chatgpt-deep',lease_id:c.lease_id,url:'https://example.com/doc'});
  const claims=[{text:'Fact',classification:'FACTUAL',source_refs:[rd.source.ref]}];
  await l.invoke('submit-analysis',{request_id:'req-analysis-0002',worker_id:'chatgpt-deep',lease_id:c.lease_id,claims,sources:[rd.source]});
  await l.invoke('submit-deeper-evidence',{request_id:'req-deeper-0002',worker_id:'chatgpt-deep',lease_id:c.lease_id,claims,sources:[rd.source]});
  const done=await l.invoke('complete',{request_id:'req-complete-0002',worker_id:'chatgpt-deep',lease_id:c.lease_id});
  assert.equal(done.state,'COMPLETE');
});

test('semantic automation inference catches workflow responsibilities',()=>{
  const c=inferResearchContexts(
    {technology_tags:['TypeScript'],module_class:'BACKEND_DOMAIN_SERVICE',engineering_questions:['webhook retry reconciliation workflow']},
    {objective:'scheduled notification and provider callback reconciliation',contracts_consumed:[],contracts_produced:[]},
    {}
  );
  assert.equal(c.n8n_architecture_context.applicable,true);
  assert(c.n8n_architecture_context.applicability_reasons.length>0);
  const pure=inferResearchContexts({technology_tags:['TypeScript'],module_class:'BACKEND_DOMAIN_SERVICE',engineering_questions:['pure arithmetic']},{objective:'calculate deterministic total'},{});
  assert.equal(pure.n8n_architecture_context.applicable,false);
});

test('reference knowledge gets lightweight qualification while executable remains strict',()=>{
  const policy=loadDiscoveryPolicy(process.cwd());
  const ref=buildDiscoveryCandidate({
    policy,canonicalLocator:'https://www.postgresql.org/docs/current/',sourceAdapter:'OFFICIAL_DOC_INDEX',
    triggerClass:'REACTIVE',discoveredAt:'2026-09-19T00:00:00Z',
    claimedResourceClasses:['OFFICIAL_DOC'],claimedTaskClasses:['ARCHITECTURE_RESEARCH'],
    provenance:{publisher_identity:'PostgreSQL',official_publisher_verified:true,canonical_locator_on_publisher_domain_or_repo:true,content_hash:'7'.repeat(64)},
    executableContentDetected:false
  });
  const q=qualifyCandidate({policy,candidate:ref,freshnessState:'CURRENT'});
  assert.equal(q.ok,true);
  assert.equal(q.manifest.qualification_track,'REFERENCE_LIGHTWEIGHT_V1');

  const exe=buildDiscoveryCandidate({
    policy,canonicalLocator:'https://github.com/example/tool',sourceAdapter:'GITHUB_SEARCH',
    triggerClass:'REACTIVE',discoveredAt:'2026-09-19T00:00:00Z',
    claimedResourceClasses:['MCP_SERVER'],claimedTaskClasses:['AUTOMATION'],
    provenance:{},executableContentDetected:true
  });
  const blocked=qualifyCandidate({policy,candidate:exe,provenanceVerified:true,taskEvaluationPassed:true});
  assert.equal(blocked.ok,false);
  assert(blocked.failures.includes('EXACT_VERSION_PIN_REQUIRED_FOR_EXECUTABLE_ADMISSION'));
});

test('coverage contract exposes staged maturity',()=>{
  for(const s of ['FIRST_PASS_RESEARCHED','ANALYZED','DEEP_EVIDENCE_COMPLETE','QUALIFIED','ADMITTED']) assert(COVERAGE_STATUSES.includes(s));
});


test('discovery evidence upsert is monotonic for lifecycle, trust and evidence refs',()=>{
  const sql=VEKL_RESEARCH_FIXED_SQL.discovery;
  assert(sql.includes("WHEN 'ADMITTED' THEN 60"));
  assert(sql.includes("vekl_research_discovery_links.lifecycle_state"));
  assert(sql.includes("substring(vekl_research_discovery_links.trust_tier"));
  assert(sql.includes("jsonb_agg(DISTINCT ref)"));
  assert(sql.includes("UNION"));
  assert(!sql.includes("DO UPDATE SET lifecycle_state=EXCLUDED.lifecycle_state,trust_tier=EXCLUDED.trust_tier,evidence_refs=EXCLUDED.evidence_refs"));
});


test("completion gate accepts valid evidence across retry leases and ignores stale invalid evidence",async()=>{
  const s=new Store();
  const l=new VeklResearchLoop({
    store:s,clock:()=>1000,
    searchAdapter:async()=>({content:"result",acquisition_method:"EXA_SEARCH"}),
    fetchAdapter:async()=>({url:"https://example.com/current",sha256:"9".repeat(64),content_type:"text/plain",excerpt:"evidence"})
  });
  const c=await l.invoke("claim",{request_id:"req-claim-retry-01",worker_id:"chatgpt-deep"});
  s.evidence.push(
    {lease_id:"OLD-BAD",evidence_kind:"ANALYSIS",claims:[],sources:[{content_hash:"1".repeat(64)}],evidence_hash:"2".repeat(64)},
    {lease_id:"OLD-GOOD",evidence_kind:"ANALYSIS",claims:[],sources:[{content_hash:"3".repeat(64)}],evidence_hash:"4".repeat(64)},
    {lease_id:"L1",evidence_kind:"GROQ_RESEARCH",claims:[],sources:[],evidence_hash:"8".repeat(64)}
  );
  s.events.push({lease_id:"OLD-GOOD",event_kind:"FETCH_READ",payload:{lease_id:"OLD-GOOD",content_hash:"3".repeat(64)}});
  await l.invoke("fetch",{request_id:"req-fetch-retry-01",worker_id:"chatgpt-deep",lease_id:c.lease_id});
  await l.invoke("search",{request_id:"req-search-retry-01",worker_id:"chatgpt-deep",lease_id:c.lease_id,search_query:"test"});
  const rd=await l.invoke("fetch-read",{request_id:"req-read-retry-01",worker_id:"chatgpt-deep",lease_id:c.lease_id,url:"https://example.com/current"});
  const claims=[{text:"Fact",classification:"FACTUAL",source_refs:[rd.source.ref]}];
  await l.invoke("submit-deeper-evidence",{request_id:"req-deeper-retry-01",worker_id:"chatgpt-deep",lease_id:c.lease_id,claims,sources:[rd.source]});
  const done=await l.invoke("complete",{request_id:"req-complete-retry-01",worker_id:"chatgpt-deep",lease_id:c.lease_id});
  assert.equal(done.state,"COMPLETE");
});
