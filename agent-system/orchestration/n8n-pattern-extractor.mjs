import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { N8N_ANALYZER_VERSION } from './n8n-workflow-analyzer.mjs';
import { N8N_SANITIZER_VERSION } from './n8n-workflow-sanitizer.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const ARCH=JSON.parse(fs.readFileSync(path.resolve(here,'../engineering-knowledge/automation/n8n-pattern-archetypes.json'),'utf8'));
export const N8N_PATTERN_EXTRACTOR_VERSION='n8n-pattern-extractor-v1';
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map((k)=>[k,stable(v[k])]));return v;}
function hash(v){return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
function uniq(xs){return [...new Set(xs.filter(Boolean))].sort();}
function primaryCapability(node){const priority=['HTTP_RECEIVE','SCHEDULE','MANUAL_TRIGGER','HUMAN_INPUT','AI_AGENT','HTTP_CALL','DATABASE','CONDITION','ROUTE','WAIT','NOTIFY','GITHUB_INTEGRATION','HTTP_RESPOND','MERGE','FILESYSTEM','CODE_EXECUTION','SHELL_EXECUTION','SSH','MCP_CLIENT'];return priority.find((x)=>(node.capabilities||[]).includes(x))||(node.capabilities||[])[0]||`NODE:${String(node.type||'UNKNOWN').split('.').pop().toUpperCase()}`;}
function archetype(analysis){const caps=new Set(analysis.capabilities||[]),triggers=new Set(analysis.trigger_classes||[]);for(const a of ARCH.archetypes||[]){if((a.requires_any_triggers||[]).length&&!(a.requires_any_triggers||[]).some((x)=>triggers.has(x)))continue;if((a.requires_all||[]).some((x)=>!caps.has(x)))continue;if((a.requires_any||[]).length&&!(a.requires_any||[]).some((x)=>caps.has(x)))continue;return a.id;}return'GENERAL_AUTOMATION';}
function runtimeCandidates(a,caps){const set=new Set(['N8N','DIAL_SERVICE']);if(caps.includes('SCHEDULE')||caps.includes('HTTP_CALL'))set.add('BULLMQ');if(caps.includes('WAIT')||a==='HUMAN_APPROVAL')set.add('TEMPORAL');if(a==='CI_NOTIFICATION')set.add('GITHUB_ACTIONS');return [...set].sort();}
export function extractN8nPattern({sanitized,analysis,sourcePath,sourceHash,sourceCommit}){
 const byType=new Map((sanitized.nodes||[]).map((n)=>[n.type,primaryCapability(n)])); const flow=uniq((sanitized.edges||[]).map((e)=>`${byType.get(e.source_type)||e.source_type}->${byType.get(e.target_type)||e.target_type}`));
 const caps=uniq(analysis.capabilities||[]),triggers=uniq(analysis.trigger_classes||[]),arch=archetype(analysis); const semanticClass=uniq([...triggers,...caps]);
 const lineageMaterial={archetype:arch,normalized_flow:flow,semantic_capability_class:semanticClass}; const lineage=`n8n-pattern-${hash(lineageMaterial).slice(0,32)}`;
 const support={repository:'Zie619/n8n-workflows',path:String(sourcePath),source_hash:String(sourceHash),source_commit:String(sourceCommit),license_basis:'MIT_REPOSITORY_LEVEL_PER_ARTIFACT_NOT_ASSUMED',reuse_posture:'PATTERN_LEARNING_REFERENCE'};
 const base={schema_version:1,descriptor_version:'vekl-n8n-pattern-1',extractor_version:N8N_PATTERN_EXTRACTOR_VERSION,pattern_lineage_id:lineage,archetype:arch,knowledge_polarity:analysis.knowledge_polarity,authority:'REFERENCE_ONLY',executable:false,runtime_compatible:false,compatibility:{...analysis.compatibility,runtime_compatible:false},trigger_classes:triggers,capabilities:caps,required_controls:uniq(analysis.required_controls||[]),normalized_flow:flow,runtime_candidates:runtimeCandidates(arch,caps),risk_severity:analysis.risk_severity,security_finding_codes:uniq((analysis.security_findings||[]).map((x)=>x.code)),quality:{retry_observed:analysis.retry?.observed===true,idempotency_observed:analysis.idempotency?.observed===true,official_node_only:(analysis.compatibility?.unknown_or_community_node_count||0)===0},source_support:[support],source_support_hash:hash([support]),raw_workflow_persisted:false,untrusted_text_persisted:false};
 const revisionMaterial={...base,pattern_revision_hash:undefined,source_support:[support],versions:{sanitizer:N8N_SANITIZER_VERSION,analyzer:N8N_ANALYZER_VERSION,extractor:N8N_PATTERN_EXTRACTOR_VERSION}};
 return {...base,pattern_revision_hash:hash(revisionMaterial)};
}
export function mergePatternDescriptors(rows){
 const groups=new Map();for(const row of rows||[]){const key=`${row.pattern_lineage_id}|${row.knowledge_polarity}`;const g=groups.get(key)||[];g.push(row);groups.set(key,g);} const out=[];
 for(const key of [...groups.keys()].sort()){
  const g=groups.get(key),first=g[0];const support=[...new Map(g.flatMap((x)=>x.source_support||[]).map((s)=>[`${s.source_hash}|${s.path}`,s])).values()].sort((a,b)=>a.path.localeCompare(b.path)||a.source_hash.localeCompare(b.source_hash));
  const compatibility={source_n8n_version:null,state:'UNKNOWN_SOURCE_N8N_VERSION',runtime_compatible:false,node_types:uniq(g.flatMap((x)=>x.compatibility?.node_types||[])),observed_node_versions:[...new Map(g.flatMap((x)=>x.compatibility?.observed_node_versions||[]).map((row)=>[`${row.type}|${String(row.type_version)}`,row])).values()].sort((a,b)=>a.type.localeCompare(b.type)||String(a.type_version).localeCompare(String(b.type_version))),unknown_or_community_node_count:Math.max(...g.map((x)=>x.compatibility?.unknown_or_community_node_count||0))};
  const merged={...first,compatibility,runtime_compatible:false,capabilities:uniq(g.flatMap((x)=>x.capabilities||[])),required_controls:uniq(g.flatMap((x)=>x.required_controls||[])),normalized_flow:uniq(g.flatMap((x)=>x.normalized_flow||[])),runtime_candidates:uniq(g.flatMap((x)=>x.runtime_candidates||[])),security_finding_codes:uniq(g.flatMap((x)=>x.security_finding_codes||[])),source_support:support,source_support_hash:hash(support),support_count:support.length};
  merged.pattern_revision_hash=hash({...merged,pattern_revision_hash:undefined});out.push(merged);
 }
 return out.sort((a,b)=>b.support_count-a.support_count||a.archetype.localeCompare(b.archetype)||a.pattern_lineage_id.localeCompare(b.pattern_lineage_id)||a.knowledge_polarity.localeCompare(b.knowledge_polarity));
}
export function selectDiversePatterns(rows,{positiveLimit=48,antiLimit=16}={}){
 function select(polarity,limit){const filtered=rows.filter((x)=>x.knowledge_polarity===polarity);const buckets=new Map();for(const x of filtered){const a=buckets.get(x.archetype)||[];a.push(x);buckets.set(x.archetype,a);}for(const a of buckets.values())a.sort((x,y)=>y.support_count-x.support_count||x.pattern_lineage_id.localeCompare(y.pattern_lineage_id));const keys=[...buckets.keys()].sort(),out=[];let progress=true;while(out.length<limit&&progress){progress=false;for(const k of keys){const x=buckets.get(k).shift();if(x){out.push(x);progress=true;if(out.length>=limit)break;}}}return out;}
 return [...select('POSITIVE_PATTERN',positiveLimit),...select('ANTI_PATTERN',antiLimit)].sort((a,b)=>a.knowledge_polarity.localeCompare(b.knowledge_polarity)||a.archetype.localeCompare(b.archetype)||a.pattern_lineage_id.localeCompare(b.pattern_lineage_id));
}
