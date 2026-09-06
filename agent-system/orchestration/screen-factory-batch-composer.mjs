import fs from 'node:fs';
import path from 'node:path';
import { callOpenRouterScreenCompiler } from './screen-factory-openrouter-generator.mjs';
import { readJson, resolveControlPath, writeJsonAtomic, appendJsonl } from './state-store.mjs';
import { contractReadiness } from './screen-factory-design-policy.mjs';
import { PREMIUM_VISUAL_STANDARD_VERSION } from './screen-factory-premium-visual-standard.mjs';
import {
  ALLOWED_REGION_TYPES, REGION_VARIANT_CATALOG, SCREEN_COMPOSITION_DSL_VERSION, compactCompositionContract,
  compositionContractHash, validateComposition, compileCompositionToPacket, lockedCanonicalComposition,
} from './screen-factory-composition-dsl.mjs';

export const SCREEN_COMPOSITION_BATCH_POLICY = 'COMPACT_PLATFORM_FAMILY_BATCH_DSL_V1';
export const DEFAULT_COMPOSITION_BATCH_SIZE = 27;
export const MIN_COMPOSITION_BATCH_SIZE = 10;
export const MAX_COMPOSITION_BATCH_SIZE = 40;
const CACHE_REL = 'screen-factory/model-workspace/composition-cache';
const GOVERNOR_REL = 'screen-factory/composition-batch-governor.json';

const CONSUMER_QUALITY_BRIEF = `Dial Health premium consumer composition rules: calm, warm healthcare; deep navy hierarchy with restrained teal/aqua accents; generous but efficient whitespace; one clear focal point; 2-6 meaningful regions; progressive disclosure instead of long pages; 2-column mobile action grids when useful; no admin-dashboard density; no repetitive wall of cards; no invented health/provider/financial data. The renderer owns typography, colour, radii, spacing, icons and responsive CSS. You ONLY decide hierarchy and approved component composition. Preserve every canonical function through visible regions or progressive disclosure. Different screens should feel related, not cloned. Across a family, vary region order/type/variant where the screen task warrants it; do not reuse one identical composition signature more than four times.`;
const PROFESSIONAL_QUALITY_BRIEF = `Dial Health premium professional-workspace composition rules: build an expert clinical/operational surface, not a consumer landing page and not a generic admin dashboard. Prioritise the working set above the fold: current queue, exceptions, patient or transaction context, and the next safe actions. Use 3-6 purposeful regions, compact desktop/tablet density, clear role/task hierarchy, concise rows, restrained metrics and multi-column composition where useful. Avoid oversized marketing heroes, giant empty cards, decorative charts, repetitive tiles, consumer-style quick-action walls and unbounded tables. Prefer command-centre, workbench, queue, timeline, search, detail and reconciliation patterns that expose provenance/status without inventing patient, clinical, payer or financial truth. The renderer owns typography, colour, radii, spacing, icons and responsive CSS. You ONLY decide hierarchy and approved component composition. Preserve every documented function through visible regions or focused handoffs. Vary compositions when the task warrants it; do not reuse one identical signature more than four times.`;
function qualityBriefFor(tasks){return (tasks||[]).every((task)=>String(task.business_unit||'')==='My Health')?CONSUMER_QUALITY_BRIEF:PROFESSIONAL_QUALITY_BRIEF;}

function now(){return new Date().toISOString();}
function safe(value){return String(value||'family').replace(/[^a-zA-Z0-9_.-]+/g,'_');}
function familyKey(task){return `${safe(task.business_unit)}__${safe(task.platform)}`;}
function cachePath(root,task){return resolveControlPath(`${CACHE_REL}/${familyKey(task)}.json`,root);}
function readCache(root,task){const p=cachePath(root,task);try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return {schema_version:1,dsl_version:SCREEN_COMPOSITION_DSL_VERSION,family_key:familyKey(task),entries:{},updated_at:null};}}
function writeCache(root,task,cache){const p=cachePath(root,task);fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});const tmp=`${p}.partial-${process.pid}`;fs.writeFileSync(tmp,`${JSON.stringify({...cache,updated_at:now()},null,2)}\n`,{mode:0o600});fs.renameSync(tmp,p);}
function governor(root){return readJson(GOVERNOR_REL,{schema_version:1,policy:SCREEN_COMPOSITION_BATCH_POLICY,target_batch_size:DEFAULT_COMPOSITION_BATCH_SIZE,min_batch_size:MIN_COMPOSITION_BATCH_SIZE,max_batch_size:MAX_COMPOSITION_BATCH_SIZE,recent_outcomes:[],updated_at:null},root);}
export function compositionBatchSize(root){const g=governor(root);return Math.max(MIN_COMPOSITION_BATCH_SIZE,Math.min(MAX_COMPOSITION_BATCH_SIZE,Number(g.target_batch_size)||DEFAULT_COMPOSITION_BATCH_SIZE));}

function familyTasks(root,task){
  const m=readJson('screen-factory/manifest.json',{tasks:[]},root); const same=m.tasks.filter((x)=>String(x.platform_policy||'REQUIRED')==='REQUIRED'&&x.business_unit===task.business_unit&&x.platform===task.platform);
  const start=Math.max(0,same.findIndex((x)=>x.task_id===task.task_id));
  return same.slice(start).filter((x)=>!['COMPLETE','EXTERNAL_COMPLETE'].includes(x.status)&&contractReadiness(x).ready).slice(0,compositionBatchSize(root));
}
function parseJson(text){const s=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');try{return JSON.parse(s)}catch{}const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<=a)throw new Error('composition batch returned no JSON');return JSON.parse(s.slice(a,b+1));}
function batchPrompt(tasks){
  const contracts=tasks.map(compactCompositionContract);
  return `Produce compact Dial Health screen compositions for this ONE business-unit/platform family. ${qualityBriefFor(tasks)}\nDSL_VERSION:${SCREEN_COMPOSITION_DSL_VERSION}\nALLOWED_REGION_TYPES:${ALLOWED_REGION_TYPES.join(',')}\nREGION_VARIANTS:${JSON.stringify(REGION_VARIANT_CATALOG)}\nFor every screen return 2-6 regions. Each region has type, feature_refs (zero-based indices into that screen's features), action_refs (zero-based indices into actions), prominence(primary|secondary|quiet), variant(short identifier). Do not write HTML, CSS, user data, copy, state maps, evidence maps or implementation code. Use only indices supplied by each canonical contract. Return JSON only: {"dsl_version":"${SCREEN_COMPOSITION_DSL_VERSION}","screens":[{"screen_id":"...","archetype":"...","regions":[...]}]}. Return exactly one entry for every contract.\nVISUAL_STANDARD:${PREMIUM_VISUAL_STANDARD_VERSION}\nCONTRACTS:${JSON.stringify(contracts)}`;
}
function singleRepairPrompt(task,composition,qa){
  return `Repair one compact Dial Health screen composition. ${qualityBriefFor([task])}\nDSL_VERSION:${SCREEN_COMPOSITION_DSL_VERSION}\nALLOWED_REGION_TYPES:${ALLOWED_REGION_TYPES.join(',')}\nCANONICAL_CONTRACT:${JSON.stringify(compactCompositionContract(task))}\nCURRENT_COMPOSITION:${JSON.stringify(composition)}\nDETERMINISTIC_QA_FAILURE:${String(qa||'').slice(0,900)}\nReturn JSON only: {"screen_id":"${task.screen_id}","archetype":"...","regions":[...]}. Change hierarchy/composition only. Do not output HTML/CSS or invent data.`;
}
function cacheEntryValid(entry,task){return Boolean(entry&&entry.dsl_version===SCREEN_COMPOSITION_DSL_VERSION&&entry.contract_hash===compositionContractHash(task)&&entry.composition);}
function compositionSignature(composition){return (composition?.regions||[]).map((r)=>`${r.type}:${r.prominence}:${r.variant}`).join('|');}
function diversityOverflow(validRows, limit = 4){
  const seen=new Map(), overflow=[];
  for(const row of validRows){const sig=compositionSignature(row.composition);const count=(seen.get(sig)||0)+1;seen.set(sig,count);if(count>limit)overflow.push(row);}
  return overflow;
}

async function generateBatch({root,task,modelCaller=callOpenRouterScreenCompiler}){
  const tasks=familyTasks(root,task); if(!tasks.length) throw new Error(`no contract-ready composition tasks for ${task.task_id}`);
  const key=`${familyKey(task)}::${tasks[0].screen_id}-${tasks.at(-1).screen_id}::${tasks.length}`;
  const turn=await modelCaller({content:batchPrompt(tasks),root,taskKey:key,role:'batch_composer',maxOutputTokens:Math.min(14000,1800+tasks.length*420)});
  const payload=parseJson(turn.response); const screens=Array.isArray(payload?.screens)?payload.screens:[]; const byId=new Map(screens.map((x)=>[String(x.screen_id),x]));
  const cache=readCache(root,task); let valid=0, invalid=0; const invalidTasks=[]; const validRows=[];
  for(const t of tasks){
    try{const composition=validateComposition(byId.get(String(t.screen_id)),t);cache.entries[t.task_id]={dsl_version:SCREEN_COMPOSITION_DSL_VERSION,contract_hash:compositionContractHash(t),composition,model:turn.model,batch_key:key,batch_size:tasks.length,generated_at:now(),repaired:false,usage:turn.usage||null};validRows.push({task:t,composition});valid++;}
    catch(error){invalid++;invalidTasks.push(t);cache.entries[t.task_id]={dsl_version:SCREEN_COMPOSITION_DSL_VERSION,contract_hash:compositionContractHash(t),invalid:true,raw_composition:byId.get(String(t.screen_id))||null,last_error:String(error?.message||error).slice(0,500),model:turn.model,batch_key:key,batch_size:tasks.length,generated_at:now()};}
  }
  if(tasks.length>=10){
    for(const row of diversityOverflow(validRows)){const t=row.task;cache.entries[t.task_id]={...cache.entries[t.task_id],invalid:true,raw_composition:row.composition,composition:null,last_error:'composition family clone limit exceeded; vary hierarchy/type/variant'};invalidTasks.push(t);valid--;invalid++;}
  }
  let retryTurn=null, recovered=0;
  if(invalidTasks.length){
    retryTurn=await modelCaller({content:batchPrompt(invalidTasks),root,taskKey:`${key}::invalid-repair`,role:'batch_composer',excludeModels:[turn.model],maxOutputTokens:Math.min(10000,1600+invalidTasks.length*420)});
    const retryPayload=parseJson(retryTurn.response);const retryScreens=Array.isArray(retryPayload?.screens)?retryPayload.screens:[];const retryById=new Map(retryScreens.map((x)=>[String(x.screen_id),x]));
    const signatureCounts=new Map();
    for(const t of tasks){const e=cache.entries[t.task_id];if(!e?.invalid&&e?.composition){const sig=compositionSignature(e.composition);signatureCounts.set(sig,(signatureCounts.get(sig)||0)+1);}}
    for(const t of invalidTasks){try{const composition=validateComposition(retryById.get(String(t.screen_id)),t);const sig=compositionSignature(composition);if(tasks.length>=10&&(signatureCounts.get(sig)||0)>=4)throw new Error('composition family clone limit exceeded after repair');signatureCounts.set(sig,(signatureCounts.get(sig)||0)+1);cache.entries[t.task_id]={dsl_version:SCREEN_COMPOSITION_DSL_VERSION,contract_hash:compositionContractHash(t),composition,model:retryTurn.model,original_model:turn.model,batch_key:key,batch_size:tasks.length,generated_at:now(),repaired:true,batch_repair:true,usage:retryTurn.usage||null};recovered++;valid++;invalid--;}catch(error){const current=cache.entries[t.task_id];current.raw_composition=retryById.get(String(t.screen_id))||current.raw_composition||null;current.retry_model=retryTurn.model;current.last_error=`${current.last_error}; retry: ${String(error?.message||error).slice(0,300)}`;}}
    appendJsonl('events/screen-factory.jsonl',{event:'SCREEN_FACTORY_COMPOSITION_BATCH_INVALID_REPAIR',family:familyKey(task),batch_key:key,requested:invalidTasks.length,recovered,remaining_invalid:invalid,model:retryTurn.model,usage:retryTurn.usage||null,at:now()},root);
  }
  writeCache(root,task,cache);
  appendJsonl('events/screen-factory.jsonl',{event:'SCREEN_FACTORY_COMPOSITION_BATCH_COMPILED',family:familyKey(task),batch_key:key,requested:tasks.length,valid,invalid,model:turn.model,retry_model:retryTurn?.model||null,usage:turn.usage||null,at:now()},root);
  return {cache,tasks,turn,key,retryTurn};
}

async function repairOne({root,task,entry,feedback,modelCaller=callOpenRouterScreenCompiler}){
  const turn=await modelCaller({content:singleRepairPrompt(task,entry.composition,feedback),root,taskKey:`${task.task_id}::composition-repair`,role:'composition_repair',excludeModels:[entry.model].filter(Boolean),maxOutputTokens:1800});
  const composition=validateComposition(parseJson(turn.response),task); const cache=readCache(root,task);
  cache.entries[task.task_id]={dsl_version:SCREEN_COMPOSITION_DSL_VERSION,contract_hash:compositionContractHash(task),composition,model:turn.model,original_model:entry.model||null,batch_key:entry.batch_key||null,batch_size:entry.batch_size||1,generated_at:now(),repaired:true,repair_feedback:String(feedback||'').slice(0,900),usage:turn.usage||null};
  writeCache(root,task,cache); appendJsonl('events/screen-factory.jsonl',{event:'SCREEN_FACTORY_COMPOSITION_REPAIRED',task_id:task.task_id,model:turn.model,feedback:String(feedback||'').slice(0,300),usage:turn.usage||null,at:now()},root);
  return {entry:cache.entries[task.task_id],turn};
}

export async function compactCompileScreenPacket({task,root,modelCaller=callOpenRouterScreenCompiler}={}){
  if(!task?.task_id)throw new Error('screen task required');
  const locked=lockedCanonicalComposition(task);
  if(locked){
    const {packet,composition}=compileCompositionToPacket(task,locked);
    return {packet,runtime:'dial_locked_canonical_composition',model:'LOCAL_DIAL_DESIGN_SYSTEM',policy:SCREEN_COMPOSITION_BATCH_POLICY,design_policy:'DIAL_HEALTH_SCREEN_FACTORY_UX_REV3',model_selection:{batch_key:'LOCKED_MY_HEALTH_REV3',batch_size:0,composition_dsl:SCREEN_COMPOSITION_DSL_VERSION,provider_requests:0},quality_review:{visual_standard:PREMIUM_VISUAL_STANDARD_VERSION,composition_dsl:SCREEN_COMPOSITION_DSL_VERSION,batch_key:'LOCKED_MY_HEALTH_REV3',batch_size:0,repaired:false,deterministic_quality_gate:true,ai_review_mode:'NOT_REQUIRED_LOCKED_REFERENCE_COMPOSITION',provider_requests:0},composition};
  }
  let cache=readCache(root,task), entry=cache.entries?.[task.task_id];
  // A family request is issued only for an unseen task. If a previous family batch already
  // cached siblings but left this one invalid, repair only this composition and keep the
  // successful sibling work. This is the main request-quota protection invariant.
  if(!entry){await generateBatch({root,task,modelCaller});cache=readCache(root,task);entry=cache.entries?.[task.task_id];}
  if(!cacheEntryValid(entry,task)){
    const targeted=Boolean(entry?.invalid);
    const content=targeted&&entry?.raw_composition?singleRepairPrompt(task,entry.raw_composition,entry.last_error):batchPrompt([task]);
    const turn=await modelCaller({content,root,taskKey:`${task.task_id}::targeted-composition`,role:targeted?'composition_repair':'batch_composer',excludeModels:[entry?.model,entry?.retry_model].filter(Boolean),maxOutputTokens:1800});
    const payload=parseJson(turn.response);const raw=Array.isArray(payload?.screens)?payload.screens[0]:payload;const composition=validateComposition(raw,task);cache=readCache(root,task);const priorModel=entry?.model||null;entry={dsl_version:SCREEN_COMPOSITION_DSL_VERSION,contract_hash:compositionContractHash(task),composition,model:turn.model,original_model:priorModel,batch_key:entry?.batch_key||`${task.task_id}::single`,batch_size:entry?.batch_size||1,generated_at:now(),repaired:targeted,targeted_repair:targeted,usage:turn.usage||null};cache.entries[task.task_id]=entry;writeCache(root,task,cache);
    if(targeted)appendJsonl('events/screen-factory.jsonl',{event:'SCREEN_FACTORY_COMPOSITION_TARGETED_REPAIR',task_id:task.task_id,model:turn.model,prior_model:priorModel,usage:turn.usage||null,at:now()},root);
  }
  const attempt=Number(task.generation_attempts||0); const feedback=String(task.last_error||task.prior_quality_feedback||'').trim();
  if(attempt>1&&feedback){const repaired=await repairOne({root,task,entry,feedback,modelCaller});entry=repaired.entry;}
  const {packet,composition}=compileCompositionToPacket(task,entry.composition);
  return {packet,runtime:'openrouter_compact_composition_dsl',model:entry.model,policy:SCREEN_COMPOSITION_BATCH_POLICY,design_policy:'DIAL_HEALTH_SCREEN_FACTORY_UX_REV3',model_selection:{batch_key:entry.batch_key,batch_size:entry.batch_size,composition_dsl:SCREEN_COMPOSITION_DSL_VERSION},quality_review:{visual_standard:PREMIUM_VISUAL_STANDARD_VERSION,composition_dsl:SCREEN_COMPOSITION_DSL_VERSION,batch_key:entry.batch_key,batch_size:entry.batch_size,repaired:Boolean(entry.repaired),deterministic_quality_gate:true,ai_review_mode:'EXCEPTION_ONLY'},composition};
}

export function recordCompositionOutcome({root,task,pass,repaired=false}={}){
  const g=governor(root);const recent=Array.isArray(g.recent_outcomes)?g.recent_outcomes:[];recent.push({task_id:task?.task_id||null,pass:Boolean(pass),repaired:Boolean(repaired),at:now()});g.recent_outcomes=recent.slice(-100);
  const sample=g.recent_outcomes.slice(-12); if(sample.length>=10){const passRate=sample.filter((x)=>x.pass).length/sample.length;const repairRate=sample.filter((x)=>x.repaired).length/sample.length;let target=Number(g.target_batch_size)||DEFAULT_COMPOSITION_BATCH_SIZE;if(passRate>=.92&&repairRate<=.15)target=Math.min(MAX_COMPOSITION_BATCH_SIZE,target+3);else if(passRate<.80)target=Math.max(MIN_COMPOSITION_BATCH_SIZE,target-3);g.target_batch_size=target;g.last_sample={count:sample.length,pass_rate:Number(passRate.toFixed(3)),repair_rate:Number(repairRate.toFixed(3))};}
  g.updated_at=now();writeJsonAtomic(GOVERNOR_REL,g,root);return g;
}

export function compositionPipelineStatus(root){const g=governor(root);return {policy:SCREEN_COMPOSITION_BATCH_POLICY,dsl_version:SCREEN_COMPOSITION_DSL_VERSION,target_batch_size:compositionBatchSize(root),min_batch_size:MIN_COMPOSITION_BATCH_SIZE,max_batch_size:MAX_COMPOSITION_BATCH_SIZE,locked_reference_fast_path:'MY_HEALTH_27_SCREEN_FAMILY_ZERO_PROVIDER_REQUESTS',last_sample:g.last_sample||null};}
