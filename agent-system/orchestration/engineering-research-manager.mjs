import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HERMES_PREFERRED_CLAUDE_MODEL, HERMES_PREFERRED_CODEX_MODEL } from './hermes-plan-models.mjs';
import { appendJsonl, readJson } from './state-store.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO=path.resolve(here,'../..');
function now(){return new Date().toISOString();}
function extractJson(text){
  const raw=String(text||'').trim();
  try{return JSON.parse(raw);}catch{}
  const start=raw.indexOf('{'), end=raw.lastIndexOf('}');
  if(start>=0&&end>start){try{return JSON.parse(raw.slice(start,end+1));}catch{}}
  return null;
}
function forecastPrompt(sourceIds,{root,repoDir}={}){
  const mission=readJson('missions/dial-development-root.json',null,root);
  const activePointer=readJson('state/active-checkpoint.json',null,root);
  const checkpoint=activePointer?.path?readJson(activePointer.path,null,root):null;
  let activeWork=null;try{activeWork=JSON.parse(fs.readFileSync(path.join(repoDir,'agent-system/registries/ACTIVE_WORK.json'),'utf8'));}catch{}
  return [
  'DIAL AHEAD-OF-WORK ENGINEERING RESEARCH FORECAST',
  'You are the project-aware DIAL Development Manager research turn. This is READ-ONLY research planning; do not edit files, install packages, change Git, or change DIAL scope.',
  'Read the repository source of truth before answering, especially agent-system/canon/PROJECT_TRUTH.md, docs/dial/final-audit/00_MASTER/DIAL_CONSOLIDATED_DEVELOPMENT_PLAN_v2_2.md, agent-system/registries/ACTIVE_WORK.json if present, agent-system/registries/FEATURE_REGISTRY.json, and the current Decision Log.',
  `Oracle root mission state (continuity only; canon wins): ${JSON.stringify(mission ? {state:mission.state,objective:mission.objective,priority_directive:mission.priority_directive,last_packet_id:mission.last_packet_id,last_packet_state:mission.last_packet_state,turn_number:mission.turn_number} : null)}`,
  `Repository ACTIVE_WORK (if present): ${JSON.stringify(activeWork)}`,
  `Latest DIAL checkpoint pointer/context (continuity only): ${JSON.stringify(checkpoint ? {feature_id:checkpoint.feature_id,target_gate:checkpoint.target_gate,repository:checkpoint.repository} : null)}`,
  'Determine the next 3-5 dependency-safe engineering tasks the canonical programme is likely to execute. Do not invent a new priority, do not skip blockers, and do not let a stale mission/checkpoint override current Project Truth or the Development Plan.',
  'For those tasks, identify technologies, engineering unknowns, likely current-version pitfalls, and external research that would materially improve quality.',
  'VEKL is federated: resources may be official docs, repos, releases, issues/discussions, package registries, security advisories, approved skills, tools/plugins/MCPs, DIAL rules/hooks/loops, and community forums. Prefer official/maintainer sources. Community material is corroboration only.',
  'Never request secrets, customer data, production identifiers, payment data or identifiable Health data. Never recommend a provider/architecture replacement that conflicts with DIAL canon.',
  `Only use preferred_source_ids from this registry: ${sourceIds.join(', ')}`,
  'Return JSON only with exactly: {"schema_version":1,"forecast_horizon":"next_3_to_5_dependency_safe_packets","items":[{"feature_id":string|null,"objective":string,"task_classes":string[],"technologies":string[],"research_questions":string[],"preferred_source_ids":string[],"search_queries":string[],"risks":string[]}],"exclusions":string[]}.',
].join('\n');}

async function runCodex({repoDir,prompt,timeoutMs=180000}){
  const child=spawn('codex',['app-server','--listen','stdio://'],{cwd:repoDir,stdio:['pipe','pipe','pipe'],env:{...process.env}});
  const rl=readline.createInterface({input:child.stdout,crlfDelay:Infinity}); let id=1; const pending=new Map(); let thread=null, reroute=null, final='', terminal=null;
  const send=(m)=>child.stdin.write(`${JSON.stringify(m)}\n`);
  const request=(method,params={})=>new Promise((resolve,reject)=>{const rid=id++; pending.set(rid,{resolve,reject}); send({id:rid,method,params});});
  const done=new Promise((resolve)=>{rl.on('line',(line)=>{let m;try{m=JSON.parse(line)}catch{return;} if(m.id!=null&&pending.has(m.id)){const w=pending.get(m.id);pending.delete(m.id);m.error?w.reject(new Error(m.error.message||'rpc error')):w.resolve(m.result);return;} if(m.method==='model/rerouted')reroute=m.params||m;if(m.method==='error')terminal=m.params?.error||m.params||m;if(m.method==='item/agentMessage/delta')final+=m.params?.delta||'';if(m.method==='item/completed'&&m.params?.item?.type==='agentMessage')final=m.params.item.text||final;if(m.method==='turn/completed')resolve();});child.on('exit',resolve);});
  const timer=setTimeout(()=>{terminal={message:`research timeout after ${timeoutMs}ms`};child.kill('SIGTERM');},timeoutMs);
  try{
    await request('initialize',{clientInfo:{name:'dial_vekl_research_forecaster',title:'DIAL VEKL Research Forecaster',version:'2.0.0'},capabilities:{experimentalApi:true}});send({method:'initialized'});
    const tr=await request('thread/start',{model:HERMES_PREFERRED_CODEX_MODEL,cwd:repoDir,ephemeral:true,approvalPolicy:'never',permissions:':read-only',allowProviderModelFallback:false});thread=tr?.thread||null;
    if(!thread?.id)throw new Error('Codex research thread did not start');
    await request('turn/start',{threadId:thread.id,input:[{type:'text',text:prompt}],model:HERMES_PREFERRED_CODEX_MODEL,effort:'high',approvalPolicy:'never',permissions:':read-only'});await done;
    const resolved=reroute?.toModel||reroute?.to_model||thread?.model||thread?.modelId||null; const identity=resolved===HERMES_PREFERRED_CODEX_MODEL&&!reroute;
    const forecast=extractJson(final); return {ok:identity&&!terminal&&forecast,runtime:'codex_app_server',requested_model:HERMES_PREFERRED_CODEX_MODEL,resolved_model:resolved,identity_proven:identity,forecast,error:terminal,raw:final.slice(-12000)};
  } finally {clearTimeout(timer);if(!child.killed)child.kill('SIGTERM');rl.close();}
}

function runClaude({repoDir,prompt,timeoutMs=180000}){
  const result=spawnSync('claude',['-p',prompt,'--model',HERMES_PREFERRED_CLAUDE_MODEL,'--effort','high','--output-format','json','--permission-mode','plan','--max-turns','12','--allowedTools','Read','Glob','Grep','Bash(git status*)','Bash(git log*)','Bash(git show*)'],{cwd:repoDir,encoding:'utf8',timeout:timeoutMs,maxBuffer:16*1024*1024,env:{...process.env}});
  let parsed=null;try{parsed=JSON.parse(result.stdout||'null')}catch{} const usage=parsed?.modelUsage??parsed?.model_usage??{}; const models=Object.keys(usage); const resolved=models.length===1?models[0]:null; const identity=resolved===HERMES_PREFERRED_CLAUDE_MODEL; const forecast=extractJson(parsed?.result??parsed?.output??'');
  return {ok:result.status===0&&identity&&forecast,runtime:'claude_code',requested_model:HERMES_PREFERRED_CLAUDE_MODEL,resolved_model:resolved,identity_proven:identity,forecast,error:result.status===0?null:(result.stderr||'claude research failed').slice(-4000),raw:String(parsed?.result??result.stdout??'').slice(-12000)};
}

export async function runProjectAwareResearchForecast({repoDir=DEFAULT_REPO,root,sourceIds=[]}={}){
  const prompt=forecastPrompt(sourceIds,{root,repoDir}); let primary;
  try{primary=await runCodex({repoDir,prompt});}catch(error){primary={ok:false,error:String(error?.message||error),runtime:'codex_app_server'};}
  if(primary.ok){appendJsonl('events/engineering-research.jsonl',{event:'ENGINEERING_RESEARCH_FORECAST_MODEL_COMPLETED',runtime:primary.runtime,resolved_model:primary.resolved_model,at:now()},root);return primary;}
  let fallback;try{fallback=runClaude({repoDir,prompt});}catch(error){fallback={ok:false,error:String(error?.message||error),runtime:'claude_code'};}
  appendJsonl('events/engineering-research.jsonl',{event:fallback.ok?'ENGINEERING_RESEARCH_FORECAST_MODEL_COMPLETED':'ENGINEERING_RESEARCH_FORECAST_MODEL_UNAVAILABLE',runtime:fallback.runtime,resolved_model:fallback.resolved_model??null,primary_error:primary.error??null,fallback_error:fallback.error??null,at:now()},root);
  return fallback.ok?fallback:{ok:false,runtime:null,requested_model:null,resolved_model:null,identity_proven:false,forecast:null,error:`Sol unavailable: ${primary.error||'unknown'}; Sonnet unavailable: ${fallback.error||'unknown'}`};
}
