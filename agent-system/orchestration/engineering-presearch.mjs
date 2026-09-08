#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngineeringResourceRegistry, loadEngineeringResourceSources, validateEngineeringResourceRegistries } from './engineering-resource-registry.mjs';
import { runProjectAwareResearchForecast } from './engineering-research-manager.mjs';
import { DEFAULT_CONTROL_HOME, appendJsonl, ensureControlLayout, readJson, writeJsonAtomic } from './state-store.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO=path.resolve(here,'../..');
const TRUTH_FILES=['agent-system/canon/PROJECT_TRUTH.md','docs/dial/final-audit/00_MASTER/DIAL_CONSOLIDATED_DEVELOPMENT_PLAN_v2_2.md','agent-system/registries/FEATURE_REGISTRY.json','agent-system/registries/DECISION_LOG.json'];
function now(){return new Date().toISOString();}
function sha(value){return crypto.createHash('sha256').update(value).digest('hex');}
function bounded(v,n=12000){const s=String(v??'');return s.length>n?`${s.slice(0,n)}\n…[bounded]`:s;}
function fingerprint(repoDir,root){
  const h=crypto.createHash('sha256');
  for(const rel of TRUTH_FILES){const p=path.join(repoDir,rel);h.update(rel);h.update('\0');if(fs.existsSync(p))h.update(fs.readFileSync(p));h.update('\0');}
  const mission=readJson('missions/dial-development-root.json',null,root);
  const missionSignal=mission?{state:mission.state,objective:mission.objective,priority_directive:mission.priority_directive,last_packet_id:mission.last_packet_id,last_packet_state:mission.last_packet_state,turn_number:mission.turn_number}:null;
  const pointer=readJson('state/active-checkpoint.json',null,root);const checkpoint=pointer?.path?readJson(pointer.path,null,root):null;
  const checkpointSignal=checkpoint?{feature_id:checkpoint.feature_id,target_gate:checkpoint.target_gate,repository:checkpoint.repository?{commit:checkpoint.repository.commit,dirty:checkpoint.repository.dirty}:null}:null;
  for(const [rel,value] of [['mission-signal',missionSignal],['checkpoint-signal',checkpointSignal]]){h.update(rel);h.update('\0');if(value)h.update(JSON.stringify(value));h.update('\0');}
  return h.digest('hex');
}
function cleanText(body){return bounded(String(body||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim(),12000);}
function hostAllowed(url,source){try{const h=new URL(url).hostname.toLowerCase().replace(/^www\./,'');return (source.domains||[]).some((d)=>{const x=String(d).toLowerCase().replace(/^www\./,'');return h===x||h.endsWith(`.${x}`);});}catch{return false;}}
async function readBoundedBody(response,maxBytes=250000){
  const declared=Number(response.headers.get('content-length')||0);if(Number.isFinite(declared)&&declared>maxBytes)throw new Error(`response too large: ${declared} bytes`);
  if(!response.body)return '';
  const reader=response.body.getReader();const decoder=new TextDecoder();let bytes=0,out='';
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes)throw new Error(`response exceeded ${maxBytes} bytes`);out+=decoder.decode(value,{stream:true});}out+=decoder.decode();return out;}finally{try{reader.releaseLock();}catch{}}
}
async function safeFetch(url,source,{fetchImpl=fetch,timeoutMs=15000}={}){
  let current=url;if(!hostAllowed(current,source)) throw new Error(`host not allowlisted for ${source.source_id}: ${current}`);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    for(let redirects=0;redirects<=4;redirects++){
      const response=await fetchImpl(current,{method:'GET',redirect:'manual',signal:controller.signal,headers:{'user-agent':'DIAL-VEKL-Research/2.0','accept':'text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.1'}});
      if(response.status>=300&&response.status<400){
        const location=response.headers.get('location');if(!location)throw new Error(`redirect ${response.status} without Location`);
        const next=new URL(location,current).toString();if(!hostAllowed(next,source))throw new Error(`redirect escaped allowlist: ${next}`);current=next;continue;
      }
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const type=response.headers.get('content-type')||'';if(!/(text|json|xml|javascript)/i.test(type))throw new Error(`unsupported content-type ${type}`);
      const text=await readBoundedBody(response,250000);
      return {url:current,status:response.status,content_type:type,content_excerpt:cleanText(text),content_hash:sha(text)};
    }
    throw new Error('too many redirects');
  } finally {clearTimeout(timer);}
}
async function githubSearchIssues(repository,query,source,fetchImpl){
  if(!repository||!query)return[];const q=encodeURIComponent(`${query} repo:${repository}`);const url=`https://api.github.com/search/issues?q=${q}&per_page=5`;
  if(!hostAllowed(url,{...source,domains:[...(source.domains||[]),'api.github.com']}))return[];
  const res=await fetchImpl(url,{headers:{'user-agent':'DIAL-VEKL-Research/2.0','accept':'application/vnd.github+json'}});if(!res.ok)return[];const data=await res.json();return (data.items||[]).slice(0,5).map((x)=>({title:x.title,url:x.html_url,state:x.state,updated_at:x.updated_at,comments:x.comments}));
}
async function stackSearch(query,fetchImpl){
  if(!query)return[];const url=`https://api.stackexchange.com/2.3/search/advanced?site=stackoverflow&pagesize=5&order=desc&sort=relevance&q=${encodeURIComponent(query)}`;const res=await fetchImpl(url,{headers:{'user-agent':'DIAL-VEKL-Research/2.0'}});if(!res.ok)return[];const data=await res.json();return (data.items||[]).slice(0,5).map((x)=>({title:x.title,link:x.link,score:x.score,is_answered:x.is_answered,last_activity_date:x.last_activity_date}));
}
function fresh(cache,source){if(!cache?.fetched_at)return false;const ttl=Number(source?.freshness_ttl_hours||0);if(ttl<=0)return false;return Date.now()-Date.parse(cache.fetched_at)<ttl*3600000;}
function validForecast(value,sourceIds){if(!value||value.schema_version!==1||!Array.isArray(value.items)||value.items.length<3||value.items.length>5)return false;const allowed=new Set(sourceIds);for(const item of value.items){if(item.feature_id!=null&&!/^[A-Z][A-Z0-9_-]*-F\d{3}$/.test(String(item.feature_id)))item.feature_id=null;item.preferred_source_ids=(item.preferred_source_ids||[]).filter((x)=>allowed.has(x));item.task_classes=Array.isArray(item.task_classes)?item.task_classes:[];item.technologies=Array.isArray(item.technologies)?item.technologies:[];item.research_questions=Array.isArray(item.research_questions)?item.research_questions:[];item.search_queries=Array.isArray(item.search_queries)?item.search_queries:[];item.risks=Array.isArray(item.risks)?item.risks:[];}return true;}

async function cacheResource({resource,source,item,root,fetchImpl}){
  const fetchedAt=now();let direct=null,searchResults=[];let state='NO_FETCH_ADAPTER';let error=null;
  try{
    if(resource.seed_urls?.length){direct=await safeFetch(resource.seed_urls[0],source,{fetchImpl});state='FETCHED';}
    if(resource.repository&&item.search_queries?.[0]&&(source.retrieval_adapters||[]).includes('GITHUB_PUBLIC')){searchResults=await githubSearchIssues(resource.repository,item.search_queries[0],source,fetchImpl);state=direct?'FETCHED_AND_SEARCHED':'SEARCHED';}
    if(resource.source_id==='community.stackoverflow'&&item.search_queries?.[0]){searchResults=await stackSearch(item.search_queries[0],fetchImpl);state='SEARCHED';}
    if(resource.source_id==='community.reddit.engineering'){state='SEARCH_PROVIDER_REQUIRED';}
  }catch(e){state='FETCH_FAILED';error=String(e?.message||e).slice(0,2000);}
  const record={schema_version:1,authority:resource.authority,resource_id:resource.resource_id,source_id:resource.source_id,resource_class:resource.resource_class,trust_tier:source.trust_tier,activation_mode:resource.activation_mode,objective:item.objective,feature_id:item.feature_id??null,task_classes:item.task_classes||[],technologies:item.technologies||[],research_questions:item.research_questions||[],search_queries:item.search_queries||[],state,fetched_at:fetchedAt,url:direct?.url||resource.locator,content_type:direct?.content_type||null,content_hash:direct?.content_hash||sha(JSON.stringify(searchResults)),content_excerpt:direct?.content_excerpt||null,search_results:searchResults,error,corroboration_required:resource.authority==='COMMUNITY_SIGNAL_ONLY',executable:false};
  const cacheId=`erc_${sha(`${resource.resource_id}|${record.content_hash}|${fetchedAt}`).slice(0,24)}`;const rel=`knowledge/research/cache/${cacheId}.json`;writeJsonAtomic(rel,record,root);return {...record,cache_ref:rel};
}

export async function refreshAheadOfWorkResearch({repoDir=DEFAULT_REPO,root=DEFAULT_CONTROL_HOME,force=false,planner=runProjectAwareResearchForecast,fetchImpl=fetch,maxResources=18}={}){
  ensureControlLayout(root);const check=validateEngineeringResourceRegistries(repoDir);if(!check.ok)throw new Error(`VEKL resource registry invalid: ${check.failures.join('; ')}`);
  const fp=fingerprint(repoDir,root);const current=readJson('knowledge/research/current-forecast.json',null,root);const maxAge=Number(process.env.DIAL_ENGINEERING_RESEARCH_TTL_HOURS||12)*3600000;
  if(!force&&current?.plan_fingerprint===fp&&current?.created_at){const age=Date.now()-Date.parse(current.created_at);if(current.state==='READY'&&age<maxAge)return {...current,refresh_state:'CURRENT'};const retryMs=Number(process.env.DIAL_ENGINEERING_RESEARCH_RETRY_MINUTES||30)*60000;if(current.state==='MODEL_UNAVAILABLE'&&age<retryMs)return {...current,refresh_state:'RETRY_BACKOFF'};}
  const sources=loadEngineeringResourceSources(repoDir), resources=loadEngineeringResourceRegistry(repoDir), sourceIds=sources.map((s)=>s.source_id);
  const model=await planner({repoDir,root,sourceIds});
  if(!model?.ok||!validForecast(model.forecast,sourceIds)){
    const blocked={schema_version:1,forecast_id:`erf_${crypto.randomUUID().replaceAll('-','')}`,state:'MODEL_UNAVAILABLE',plan_fingerprint:fp,created_at:now(),runtime_provenance:{runtime:model?.runtime||null,requested_model:model?.requested_model||null,resolved_model:model?.resolved_model||null,identity_proven:model?.identity_proven===true},error:bounded(model?.error||'project-aware Sol/Sonnet research forecast unavailable',4000),items:[],exclusions:[]};
    writeJsonAtomic('knowledge/research/current-forecast.json',blocked,root);appendJsonl('events/engineering-research.jsonl',{event:'AHEAD_OF_WORK_RESEARCH_BLOCKED',forecast_id:blocked.forecast_id,reason:blocked.error,at:blocked.created_at},root);return blocked;
  }
  const forecastId=`erf_${crypto.randomUUID().replaceAll('-','')}`;const sourceMap=new Map(sources.map((s)=>[s.source_id,s]));const resourceMap=new Map();for(const r of resources){const arr=resourceMap.get(r.source_id)||[];arr.push(r);resourceMap.set(r.source_id,arr);}
  const cacheIndex=readJson('knowledge/research/cache-index.json',{schema_version:1,resources:{}},root);const materialized=[];let count=0;
  for(const item of model.forecast.items){for(const sourceId of item.preferred_source_ids||[]){for(const resource of resourceMap.get(sourceId)||[]){if(count>=maxResources)break;const source=sourceMap.get(sourceId);if(!source)continue;const previous=cacheIndex.resources?.[resource.resource_id];if(!force&&previous?.cache_ref&&fresh(previous,source)){materialized.push({...previous,reused:true});continue;}const cached=await cacheResource({resource,source,item,root,fetchImpl});const idx={cache_ref:cached.cache_ref,content_hash:cached.content_hash,fetched_at:cached.fetched_at,fresh:fresh(cached,source),state:cached.state,source_id:cached.source_id,trust_tier:cached.trust_tier};cacheIndex.resources[resource.resource_id]=idx;materialized.push(idx);count++;}if(count>=maxResources)break;}if(count>=maxResources)break;}
  cacheIndex.updated_at=now();writeJsonAtomic('knowledge/research/cache-index.json',cacheIndex,root);
  const record={schema_version:1,forecast_id:forecastId,state:'READY',plan_fingerprint:fp,forecast_horizon:model.forecast.forecast_horizon,items:model.forecast.items,exclusions:model.forecast.exclusions||[],runtime_provenance:{runtime:model.runtime,requested_model:model.requested_model,resolved_model:model.resolved_model,identity_proven:model.identity_proven===true},resource_cache_count:materialized.length,resource_cache_states:materialized.reduce((a,x)=>{a[x.state]=(a[x.state]||0)+1;return a;},{}),created_at:now(),authority:'NON_AUTHORITATIVE_AHEAD_OF_WORK_ENGINEERING_RESEARCH'};
  writeJsonAtomic(`knowledge/research/forecasts/${forecastId}.json`,record,root);writeJsonAtomic('knowledge/research/current-forecast.json',record,root);appendJsonl('events/engineering-research.jsonl',{event:'AHEAD_OF_WORK_RESEARCH_READY',forecast_id:forecastId,plan_fingerprint:fp,runtime:model.runtime,resolved_model:model.resolved_model,items:record.items.length,resource_cache_count:record.resource_cache_count,at:record.created_at},root);return record;
}

export function engineeringResearchStatus(root=DEFAULT_CONTROL_HOME){return {forecast:readJson('knowledge/research/current-forecast.json',null,root),cache_index:readJson('knowledge/research/cache-index.json',{schema_version:1,resources:{}},root)};}

async function main(){const command=process.argv[2]||'status';if(command==='refresh'){const result=await refreshAheadOfWorkResearch({force:process.argv.includes('--force')});console.log(JSON.stringify(result,null,2));return;}if(command==='status'){console.log(JSON.stringify(engineeringResearchStatus(),null,2));return;}throw new Error(`unknown command: ${command}`);}
if(import.meta.url===`file://${process.argv[1]}`)main().catch((e)=>{console.error(e.stack||e);process.exitCode=1;});
