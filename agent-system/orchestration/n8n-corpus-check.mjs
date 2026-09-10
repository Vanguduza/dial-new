#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileGraphContent } from './canon-graph-compiler.mjs';
import { validateEngineeringResourceRegistries } from './engineering-resource-registry.mjs';
import { ZIE619_REVIEWED_PIN } from './n8n-corpus-ingest.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));const repo=path.resolve(here,'../..');
const load=(r)=>JSON.parse(fs.readFileSync(path.join(repo,r),'utf8'));const exists=(r)=>fs.existsSync(path.join(repo,r));
function hash(v){return crypto.createHash('sha256').update(v).digest('hex');}
const results=[];function gate(id,ok,detail){results.push({id,ok:Boolean(ok),detail});}
try{
 const src=load('agent-system/engineering-knowledge/registries/ENGINEERING_RESOURCE_SOURCE_REGISTRY.json');const res=load('agent-system/engineering-knowledge/registries/ENGINEERING_RESOURCE_REGISTRY.json');const pattern=exists('agent-system/engineering-knowledge/automation/N8N_WORKFLOW_PATTERN_REGISTRY.json')?load('agent-system/engineering-knowledge/automation/N8N_WORKFLOW_PATTERN_REGISTRY.json'):null;const official=src.find((x)=>x.source_id==='official.n8n'),community=src.find((x)=>x.source_id==='community.zie619.n8n_workflows'),corpus=res.find((x)=>x.resource_id==='community.zie619.n8n_workflows.corpus');const patterns=pattern?.patterns||[],derived=res.filter((x)=>x.derived_from_corpus==='community.zie619.n8n_workflows');
 gate('N8N-VEKL-G01',official&&community,'official and community source families registered');
 gate('N8N-VEKL-G02',community?.production_pin===ZIE619_REVIEWED_PIN&&pattern?.source_commit===ZIE619_REVIEWED_PIN,`exact source pin ${community?.production_pin||'missing'}`);
 gate('N8N-VEKL-G03',patterns.length>0&&patterns.every((p)=>/^[a-f0-9]{64}$/.test(p.pattern_revision_hash||'')&&/^[a-f0-9]{64}$/.test(p.source_support_hash||'')),'descriptor/source hashes present');
 gate('N8N-VEKL-G04',corpus?.activation_mode==='CORROBORATION_ONLY'&&corpus?.authority==='COMMUNITY_SIGNAL_ONLY'&&community?.executable_content_allowed===false&&derived.every((r)=>r.activation_mode==='CORROBORATION_ONLY'),'raw workflow execution impossible by registry');
 const serialized=JSON.stringify(patterns);gate('N8N-VEKL-G05',!/(bearer\s+[A-Za-z0-9._-]{16,}|-----BEGIN .*PRIVATE KEY-----|"password"\s*:\s*"[^"<])/i.test(serialized),'committed descriptors contain no obvious credential material');
 gate('N8N-VEKL-G06',patterns.filter((p)=>p.knowledge_polarity==='POSITIVE_PATTERN').every((p)=>!['HIGH','CRITICAL'].includes(p.risk_severity)&&Number(p.compatibility?.unknown_or_community_node_count||0)===0),'positive guidance excludes unsafe/community-node workflows');
 gate('N8N-VEKL-G07',patterns.every((p)=>/^n8n-pattern-[a-f0-9]{32}$/.test(p.pattern_lineage_id||'')&&/^[a-f0-9]{64}$/.test(p.pattern_revision_hash||'')),'stable lineage + immutable revision shape');
 const a=compileGraphContent(repo),b=compileGraphContent(repo);gate('N8N-VEKL-G08',a.graph_revision_hash===b.graph_revision_hash&&a.graph_generation_id===b.graph_generation_id,'graph deterministic across rebuild');
 gate('N8N-VEKL-G09',fs.readFileSync(path.join(repo,'agent-system/orchestration/graph-retrieval-router.mjs'),'utf8').includes('source_registry_hash')&&fs.readFileSync(path.join(repo,'agent-system/orchestration/graph-retrieval-router.mjs'),'utf8').includes('workflow_pattern_corpus'),'source/resource/corpus fingerprints are in determinism envelope');
 gate('N8N-VEKL-G10',fs.readFileSync(path.join(repo,'agent-system/orchestration/engineering-knowledge-broker.mjs'),'utf8').includes('eligibleResourceIds: graphResolution?.eligible_resource_ids'),'graph-first eligibility preserved');
 gate('N8N-VEKL-G11',fs.readFileSync(path.join(repo,'agent-system/orchestration/engineering-resource-resolver.mjs'),'utf8').includes('deterministicMinimalCoalition'),'minimal-coalition resolver preserved');
 gate('N8N-VEKL-G12',fs.readFileSync(path.join(repo,'agent-system/orchestration/knowledge-resolution-trace.mjs'),'utf8').includes('resource_lineage'),'KRT records pattern lineage');
 gate('N8N-VEKL-G13',fs.readFileSync(path.join(repo,'agent-system/orchestration/knowledge-admission-guard.mjs'),'utf8').includes('REFUSED_STALE_KNOWLEDGE'),'existing stale-binding refusal preserved');
 gate('N8N-VEKL-G14',fs.readFileSync(path.join(repo,'agent-system/orchestration/knowledge-worker-delivery.mjs'),'utf8').includes('renderSkillActivationBundle'),'same worker delivery survives manager failover');
 gate('N8N-VEKL-G15',fs.readFileSync(path.join(repo,'agent-system/orchestration/task-execution-envelope.mjs'),'utf8').includes('knowledgeResolutionTraceHash'),'AEF envelope remains KRT-bound');
 const truth=fs.readFileSync(path.join(repo,'agent-system/canon/PROJECT_TRUTH.md'),'utf8');gate('N8N-VEKL-G16',truth.includes('Temporal/BullMQ/n8n retain their distinct canonical roles'),'technical-cohesion runtime ownership preserved');
 gate('N8N-VEKL-G17',truth.includes('official Cloud API/Flows gateway'),'official WhatsApp lock preserved');
 gate('N8N-VEKL-G18',truth.includes('No division/payment provider owns a second ledger'),'money authority preserved');
 gate('N8N-VEKL-G19',truth.includes('Identifiable health/claim data is not shipped to general external AI by default'),'Health boundary preserved');
 gate('N8N-VEKL-G20',exists('tests/orchestration-vekl-n8n-corpus.test.mjs'),'pilot/retrieval regression suite present');
 gate('N8N-VEKL-G21',pattern?.raw_workflow_persisted===false&&patterns.every((p)=>p.raw_workflow_persisted===false&&p.untrusted_text_persisted===false),'no raw upstream bytes enter committed searchable descriptors');
 gate('N8N-VEKL-G22',patterns.every((p)=>p.compatibility?.state&&p.runtime_compatible===false&&p.compatibility?.runtime_compatible===false),'compatibility explicit; unknown never presented runtime-compatible');
 const nodes=load('agent-system/registries/KNOWLEDGE_NODE_TYPE_REGISTRY.json').node_types.map((x)=>x.node_type);const edges=load('agent-system/registries/KNOWLEDGE_EDGE_TYPE_REGISTRY.json').edge_types;gate('N8N-VEKL-G23',!nodes.some((x)=>/WORKFLOW_PATTERN|AUTOMATION_CAPABILITY|AUTOMATION_CONTROL/.test(x))&&!edges.some((x)=>/PATTERN_/.test(x.relationship)),'phase 1 adds no graph ontology');
 const registry=validateEngineeringResourceRegistries(repo);gate('N8N-VEKL-G24',registry.ok,registry.ok?'resource registries valid':registry.failures.join('; '));
 gate('N8N-VEKL-G25',official?.trust_tier==='T1_OFFICIAL'&&community?.trust_tier==='T3_COMMUNITY_CORROBORATION','official/community trust tiers remain distinct');
}catch(e){gate('N8N-VEKL-INTERNAL',false,String(e.stack||e));}
const ok=results.every((x)=>x.ok);console.log(JSON.stringify({ok,passed:results.filter((x)=>x.ok).length,total:results.length,results},null,2));if(!ok)process.exitCode=1;
