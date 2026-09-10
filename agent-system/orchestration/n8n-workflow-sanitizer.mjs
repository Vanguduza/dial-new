import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const AUTO=path.resolve(here,'../engineering-knowledge/automation');
const CAP=JSON.parse(fs.readFileSync(path.join(AUTO,'n8n-node-capability-map.json'),'utf8'));
const SEC=JSON.parse(fs.readFileSync(path.join(AUTO,'n8n-security-rules.json'),'utf8'));

export const N8N_SANITIZER_VERSION='n8n-sanitizer-v1';
const MAX_DEPTH=10, MAX_VALUES=12000, MAX_NODES=600, MAX_STRING=65536;
const secretKeys=SEC.secret_key_patterns.map((x)=>String(x).toLowerCase());
const secretValues=SEC.secret_value_patterns.map((x)=>new RegExp(x.replace(/^\(\?i\)/,''),'i'));
const promptRules=SEC.prompt_injection_patterns.map((x)=>new RegExp(x.replace(/^\(\?i\)/,''),'i'));
const destructiveSql=SEC.destructive_sql_patterns.map((x)=>new RegExp(x.replace(/^\(\?i\)/,''),'i'));
const severityRank=new Map((SEC.severity_order||[]).map((x,i)=>[x,i]));

function sha256(v){return crypto.createHash('sha256').update(v).digest('hex');}
function uniq(xs){return [...new Set(xs.filter(Boolean))].sort();}
function maxSeverity(findings){return findings.reduce((m,f)=>(severityRank.get(f.severity)||0)>(severityRank.get(m)||0)?f.severity:m,'INFO');}
function addFinding(out,code,severity,location,detail=null){out.push({code,severity,location,detail:detail?String(detail).slice(0,240):null});}
function isPrivateIpv4(ip){const p=ip.split('.').map(Number);return p[0]===10||p[0]===127||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127);}
function classifyHost(hostname){
 const h=String(hostname||'').toLowerCase().replace(/^\[|\]$/g,'');
 if((SEC.blocked_hostnames||[]).includes(h))return'BLOCKED_LOCAL_OR_METADATA';
 if((SEC.blocked_ip_literals||[]).includes(h))return'BLOCKED_LOCAL_OR_METADATA';
 const ip=net.isIP(h); if(ip===4&&isPrivateIpv4(h))return'BLOCKED_PRIVATE';
 if(ip===6&&(h==='::1'||h.startsWith('fe80:')||h.startsWith('fc')||h.startsWith('fd')))return'BLOCKED_PRIVATE';
 return'PUBLIC_OR_UNRESOLVED';
}
function urlEvidence(value,location,findings){
 const text=String(value||''); const dynamic=(SEC.dynamic_expression_markers||[]).some((m)=>text.includes(m)); const rows=[];
 const re=/\b([a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+)/ig; for(const m of text.matchAll(re)){
  let raw=m[1]; if(raw.length>2048)raw=raw.slice(0,2048);
  try{
   const u=new URL(raw.replace(/\{\{.*$/,'')); const scheme=u.protocol.toLowerCase(); const host=u.hostname.toLowerCase(); const hostClass=classifyHost(host);
   const blockedScheme=(SEC.blocked_schemes||[]).includes(scheme);
   rows.push({scheme,hostname:host,port:u.port||null,host_class:hostClass,dynamic});
   if(blockedScheme)addFinding(findings,'BLOCKED_URL_SCHEME','HIGH',location,scheme);
   if(hostClass.startsWith('BLOCKED_'))addFinding(findings,'SSRF_PRIVATE_OR_METADATA_TARGET','CRITICAL',location,hostClass);
   if(dynamic)addFinding(findings,'DYNAMIC_NETWORK_TARGET','HIGH',location,host||'dynamic');
  }catch{ if(dynamic)addFinding(findings,'DYNAMIC_OR_UNPARSEABLE_NETWORK_TARGET','HIGH',location); }
 }
 if(dynamic&&!rows.length&&/(url|uri|host|endpoint|request|http)/i.test(location))addFinding(findings,'DYNAMIC_NETWORK_TARGET','HIGH',location);
 return rows;
}
function ruleForType(type){
 const lower=String(type||'').toLowerCase(); const matches=(CAP.rules||[]).filter((r)=>lower.includes(String(r.match).toLowerCase()));
 return {capabilities:uniq(matches.flatMap((r)=>r.capabilities||[])),controls:uniq(matches.flatMap((r)=>r.controls||[])),trigger:matches.map((r)=>r.trigger).find(Boolean)||null,risk:matches.map((r)=>r.risk).filter(Boolean).sort((a,b)=>(severityRank.get(b)||0)-(severityRank.get(a)||0))[0]||null};
}
function officialNode(type){return (CAP.official_prefixes||[]).some((p)=>String(type||'').startsWith(p));}
function scanValue(value,location,findings,endpoints,state,depth=0){
 if(depth>MAX_DEPTH){addFinding(findings,'MAX_SCAN_DEPTH_REACHED','MEDIUM',location);return;}
 if(++state.values>MAX_VALUES){if(!state.limitReported){addFinding(findings,'MAX_SCAN_VALUES_REACHED','MEDIUM',location);state.limitReported=true;}return;}
 if(value==null||typeof value==='boolean'||typeof value==='number')return;
 if(typeof value==='string'){
  if(value.length>MAX_STRING)addFinding(findings,'OVERSIZED_STRING','MEDIUM',location,String(value.length));
  if(secretValues.some((re)=>re.test(value)))addFinding(findings,'SECRET_LIKE_VALUE_REDACTED','CRITICAL',location,`sha256:${sha256(value).slice(0,16)}`);
  if(promptRules.some((re)=>re.test(value)))addFinding(findings,'PROMPT_INJECTION_TEXT_DISCARDED','HIGH',location);
  if(destructiveSql.some((re)=>re.test(value)))addFinding(findings,'DESTRUCTIVE_SQL_TEXT','CRITICAL',location);
  endpoints.push(...urlEvidence(value,location,findings)); return;
 }
 if(Array.isArray(value)){for(let i=0;i<Math.min(value.length,1000);i++)scanValue(value[i],`${location}[${i}]`,findings,endpoints,state,depth+1);return;}
 if(typeof value==='object'){
  for(const [k,v] of Object.entries(value).slice(0,1500)){
   const loc=`${location}.${k}`; const kl=k.toLowerCase();
   if(secretKeys.some((x)=>kl.includes(x))){addFinding(findings,'SECRET_OR_CREDENTIAL_FIELD_REDACTED','HIGH',loc);continue;}
   scanValue(v,loc,findings,endpoints,state,depth+1);
  }
 }
}
function safeBehavior(node){return {retry_on_fail:node?.retryOnFail===true,continue_on_fail:node?.continueOnFail===true,on_error:typeof node?.onError==='string'?node.onError.slice(0,64):null,always_output_data:node?.alwaysOutputData===true};}
function credentialTypes(node){return uniq(Object.keys(node?.credentials&&typeof node.credentials==='object'?node.credentials:{}));}
function parameterKeys(node){return uniq(Object.keys(node?.parameters&&typeof node.parameters==='object'?node.parameters:{})).slice(0,100);}

export function sanitizeN8nWorkflow(workflow,{sourcePath='<memory>',sourceHash=null}={}){
 if(!workflow||typeof workflow!=='object'||Array.isArray(workflow))throw new Error('workflow must be a JSON object');
 const rawNodes=Array.isArray(workflow.nodes)?workflow.nodes:[]; if(rawNodes.length>MAX_NODES)throw new Error(`workflow node limit exceeded: ${rawNodes.length}>${MAX_NODES}`);
 const findings=[],endpoints=[]; const state={values:0,limitReported:false}; const nameToType=new Map();
 const nodes=rawNodes.map((node,i)=>{
  const type=String(node?.type||'UNKNOWN').slice(0,240); const rule=ruleForType(type); const loc=`nodes[${i}]`;
  if(rule.risk)addFinding(findings,`${rule.risk}_NODE_CAPABILITY`,rule.risk,loc,type);
  if(!officialNode(type))addFinding(findings,'COMMUNITY_OR_UNKNOWN_NODE','MEDIUM',loc,type);
  scanValue(node?.parameters||{},`${loc}.parameters`,findings,endpoints,state);
  const creds=credentialTypes(node); if(creds.length)addFinding(findings,'CREDENTIAL_BINDING_PRESENT_REDACTED','MEDIUM',`${loc}.credentials`,creds.join(','));
  const name=String(node?.name||`node-${i}`); nameToType.set(name,type);
  return {node_index:i,type,type_version:node?.typeVersion??null,official_node:officialNode(type),capabilities:rule.capabilities,required_controls:rule.controls,trigger_class:rule.trigger,parameter_keys:parameterKeys(node),credential_types:creds,behavior:safeBehavior(node)};
 });
 const edges=[]; const connections=workflow.connections&&typeof workflow.connections==='object'?workflow.connections:{};
 for(const sourceName of Object.keys(connections).sort()){
  const sourceType=nameToType.get(sourceName)||'UNKNOWN'; const buckets=connections[sourceName]; if(!buckets||typeof buckets!=='object')continue;
  for(const outputName of Object.keys(buckets).sort()){
   const channels=Array.isArray(buckets[outputName])?buckets[outputName]:[];
   for(const channel of channels){for(const target of Array.isArray(channel)?channel:[]){const targetType=nameToType.get(String(target?.node||''))||'UNKNOWN';edges.push({source_type:sourceType,target_type:targetType,output:String(outputName).slice(0,80),target_input:Number.isInteger(target?.index)?target.index:null});}}
  }
 }
 const triggerClasses=uniq(nodes.map((n)=>n.trigger_class)); const capabilities=uniq(nodes.flatMap((n)=>n.capabilities)); const controls=uniq(nodes.flatMap((n)=>n.required_controls));
 if(triggerClasses.includes('WEBHOOK')){
  const webhookNodes=nodes.filter((n)=>n.trigger_class==='WEBHOOK');
  for(const n of webhookNodes){if(!n.credential_types.length&&!n.parameter_keys.some((k)=>/auth/i.test(k)))addFinding(findings,'UNAUTHENTICATED_WEBHOOK_NOT_PROVEN','HIGH',`node:${n.type}`);}
 }
 const compatibility={source_n8n_version:null,state:'UNKNOWN_SOURCE_N8N_VERSION',runtime_compatible:false,node_types:uniq(nodes.map((n)=>n.type)),observed_node_versions:nodes.map((n)=>({type:n.type,type_version:n.type_version})).sort((a,b)=>a.type.localeCompare(b.type)||String(a.type_version).localeCompare(String(b.type_version))),unknown_or_community_node_count:nodes.filter((n)=>!n.official_node).length};
 return {schema_version:1,sanitizer_version:N8N_SANITIZER_VERSION,source_path:String(sourcePath),source_hash:sourceHash||null,node_count:nodes.length,nodes,edges:edges.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),trigger_classes:triggerClasses,capabilities,required_controls:controls,endpoints:uniq(endpoints.map((x)=>JSON.stringify(x))).map((x)=>JSON.parse(x)),findings:findings.sort((a,b)=>a.code.localeCompare(b.code)||a.location.localeCompare(b.location)),max_severity:maxSeverity(findings),compatibility,raw_workflow_persisted:false,untrusted_text_persisted:false,credential_values_persisted:false};
}

export function sanitizerPolicyFingerprint(){return sha256(JSON.stringify({cap:CAP,sec:SEC,version:N8N_SANITIZER_VERSION}));}
