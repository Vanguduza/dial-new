#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appendJsonl, DEFAULT_CONTROL_HOME, ensureControlLayout, readJson, writeJsonAtomic } from './state-store.mjs';
import { sanitizeN8nWorkflow, sanitizerPolicyFingerprint, N8N_SANITIZER_VERSION } from './n8n-workflow-sanitizer.mjs';
import { analyzeSanitizedN8nWorkflow, N8N_ANALYZER_VERSION } from './n8n-workflow-analyzer.mjs';
import { extractN8nPattern, mergePatternDescriptors, selectDiversePatterns, N8N_PATTERN_EXTRACTOR_VERSION } from './n8n-pattern-extractor.mjs';

export const ZIE619_REPOSITORY='https://github.com/Zie619/n8n-workflows.git';
export const ZIE619_REPOSITORY_ID='Zie619/n8n-workflows';
export const ZIE619_REVIEWED_PIN='94007c1445d9258a7da116646b79473e7c7c3282';
export const N8N_CORPUS_INGEST_VERSION='n8n-corpus-ingest-v2';
const MAX_WORKFLOW_BYTES=2*1024*1024;
function hashBytes(v){return crypto.createHash('sha256').update(v).digest('hex');}
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map((k)=>[k,stable(v[k])]));return v;}
function hashObject(v){return hashBytes(JSON.stringify(stable(v)));}
function run(cmd,args,cwd){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr||r.stdout}`);return String(r.stdout||'').trim();}
function walkJson(dir,out=[]){if(!fs.existsSync(dir))return out;for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,e.name);if(e.isDirectory())walkJson(p,out);else if(e.isFile()&&e.name.endsWith('.json'))out.push(p);}return out;}
function relUnix(root,file){return path.relative(root,file).split(path.sep).join('/');}
function now(){return new Date().toISOString();}
function cacheRel(policyHash,sourceHash){return `knowledge/sources/community.zie619.n8n_workflows/analysis-cache/${policyHash}/${sourceHash}.json`;}
function parseArgs(argv){const out={root:process.env.DIAL_CONTROL_HOME||DEFAULT_CONTROL_HOME,commit:ZIE619_REVIEWED_PIN,sourceDir:null,positiveLimit:48,antiLimit:16,limit:null};for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='--root')out.root=argv[++i];else if(a==='--commit')out.commit=argv[++i];else if(a==='--source-dir')out.sourceDir=argv[++i];else if(a==='--positive-limit')out.positiveLimit=Number(argv[++i]);else if(a==='--anti-limit')out.antiLimit=Number(argv[++i]);else if(a==='--limit')out.limit=Number(argv[++i]);}return out;}
function prepareSource(opts){
 if(opts.sourceDir){const root=path.resolve(opts.sourceDir);const commit=run('git',['rev-parse','HEAD'],root);const tree=run('git',['rev-parse','HEAD^{tree}'],root);if(opts.commit&&opts.commit!==commit)throw new Error(`source-dir commit mismatch: expected ${opts.commit}, observed ${commit}`);return{root,commit,tree,cleanup:false};}
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dial-zie619-quarantine-'));run('git',['init','--quiet'],root);run('git',['remote','add','origin',ZIE619_REPOSITORY],root);run('git',['fetch','--quiet','--depth','1','origin',opts.commit],root);run('git',['checkout','--quiet','--detach','FETCH_HEAD'],root);const commit=run('git',['rev-parse','HEAD'],root),tree=run('git',['rev-parse','HEAD^{tree}'],root);if(commit!==opts.commit)throw new Error(`fetched commit mismatch: expected ${opts.commit}, observed ${commit}`);return{root,commit,tree,cleanup:true};
}
function summaries(rows){const counts={};for(const r of rows)counts[r.risk_severity]=(counts[r.risk_severity]||0)+1;return counts;}
function reusableCachedAnalysis(cached,{sourceHash,policyHash}){
 return Boolean(cached&&cached.source_hash===sourceHash&&cached.policy_hash===policyHash&&cached.sanitized?.raw_workflow_persisted===false&&cached.sanitized?.untrusted_text_persisted===false&&cached.analysis?.raw_workflow_persisted===false);
}

export function ingestN8nCorpus(opts={}){
 ensureControlLayout(opts.root||DEFAULT_CONTROL_HOME);
 const config={root:opts.root||DEFAULT_CONTROL_HOME,commit:opts.commit||ZIE619_REVIEWED_PIN,sourceDir:opts.sourceDir||null,positiveLimit:Number(opts.positiveLimit??48),antiLimit:Number(opts.antiLimit??16),limit:Number.isFinite(Number(opts.limit))?Number(opts.limit):null};
 const policyHash=hashObject({sanitizer_policy_hash:sanitizerPolicyFingerprint(),sanitizer:N8N_SANITIZER_VERSION,analyzer:N8N_ANALYZER_VERSION});
 const previousPtr=readJson('knowledge/sources/community.zie619.n8n_workflows/current-candidate.json',null,config.root);
 const previousManifest=previousPtr?.manifest_rel?readJson(previousPtr.manifest_rel,null,config.root):null;
 const previousIndex=previousManifest?.file_index_rel?readJson(previousManifest.file_index_rel,{files:{}},config.root):{files:{}};
 const src=prepareSource(config);let result;
 try{
  let files=walkJson(path.join(src.root,'workflows'));if(config.limit)files=files.slice(0,config.limit);
  const descriptors=[],fileFindings=[],fileIndex={};let parsed=0,malformed=0,oversized=0,cacheHits=0,cacheMisses=0;
  for(const file of files){
   const rel=relUnix(src.root,file);const stat=fs.statSync(file);
   if(stat.size>MAX_WORKFLOW_BYTES){oversized++;fileFindings.push({path:rel,code:'OVERSIZED_WORKFLOW',severity:'HIGH',bytes:stat.size});continue;}
   const raw=fs.readFileSync(file);const sourceHash=hashBytes(raw);const cRel=cacheRel(policyHash,sourceHash);const cached=readJson(cRel,null,config.root);
   let sanitized,analysis;
   if(reusableCachedAnalysis(cached,{sourceHash,policyHash})){
    cacheHits++;parsed++;sanitized={...cached.sanitized,source_path:rel,source_hash:sourceHash};analysis=cached.analysis;
   }else{
    cacheMisses++;let workflow;try{workflow=JSON.parse(raw.toString('utf8'));}catch{malformed++;fileFindings.push({path:rel,code:'MALFORMED_JSON',severity:'MEDIUM',source_hash:sourceHash});continue;}
    parsed++;try{
     sanitized=sanitizeN8nWorkflow(workflow,{sourcePath:rel,sourceHash});analysis=analyzeSanitizedN8nWorkflow(sanitized);
     writeJsonAtomic(cRel,{schema_version:1,policy_hash:policyHash,source_hash:sourceHash,sanitized:{...sanitized,source_path:null},analysis,raw_workflow_persisted:false,created_at:now()},config.root);
    }catch(error){fileFindings.push({path:rel,code:'ANALYSIS_FAILED',severity:'MEDIUM',source_hash:sourceHash,error:String(error?.message||error).slice(0,300)});continue;}
   }
   const descriptor=extractN8nPattern({sanitized,analysis,sourcePath:rel,sourceHash,sourceCommit:src.commit});descriptors.push(descriptor);
   fileIndex[rel]={source_hash:sourceHash,analysis_cache_rel:cRel,pattern_lineage_id:descriptor.pattern_lineage_id,knowledge_polarity:descriptor.knowledge_polarity};
  }
  const previousFiles=previousIndex?.files||{};const currentPaths=new Set(Object.keys(fileIndex));const previousPaths=new Set(Object.keys(previousFiles));
  const added=[...currentPaths].filter((p)=>!previousPaths.has(p)).sort();const removed=[...previousPaths].filter((p)=>!currentPaths.has(p)).sort();const changed=[...currentPaths].filter((p)=>previousPaths.has(p)&&previousFiles[p]?.source_hash!==fileIndex[p]?.source_hash).sort();const unchanged=[...currentPaths].filter((p)=>previousPaths.has(p)&&previousFiles[p]?.source_hash===fileIndex[p]?.source_hash).sort();
  const merged=mergePatternDescriptors(descriptors);const selected=selectDiversePatterns(merged,{positiveLimit:config.positiveLimit,antiLimit:config.antiLimit});
  const fileIndexHash=hashObject(fileIndex);
  const generationCore={schema_version:1,ingest_version:N8N_CORPUS_INGEST_VERSION,source_id:'community.zie619.n8n_workflows',repository:ZIE619_REPOSITORY_ID,source_commit:src.commit,source_tree_hash:src.tree,workflow_file_count:files.length,parsed_workflow_count:parsed,malformed_workflow_count:malformed,oversized_workflow_count:oversized,candidate_pattern_count:merged.length,selected_pattern_count:selected.length,positive_selected:selected.filter((x)=>x.knowledge_polarity==='POSITIVE_PATTERN').length,anti_selected:selected.filter((x)=>x.knowledge_polarity==='ANTI_PATTERN').length,selection_limits:{positive:config.positiveLimit,anti:config.antiLimit},pattern_set_hash:hashObject(selected),file_index_hash:fileIndexHash,sanitizer_policy_hash:sanitizerPolicyFingerprint(),analysis_policy_hash:policyHash,versions:{sanitizer:N8N_SANITIZER_VERSION,analyzer:N8N_ANALYZER_VERSION,extractor:N8N_PATTERN_EXTRACTOR_VERSION},raw_workflow_persisted:false,raw_workflow_searchable:false,credential_values_persisted:false};
  const generationId=`n8n-corpus-${hashObject(generationCore).slice(0,32)}`;const prefix=`knowledge/sources/community.zie619.n8n_workflows/snapshots/${src.commit}/${generationId}`;const fileIndexRel=`${prefix}/file-index.json`;
  const proposedManifest={...generationCore,corpus_generation_id:generationId,file_index_rel:fileIndexRel,created_at:now(),snapshot_hash:hashObject({generation:generationCore,selected})};
  const existingManifest=readJson(`${prefix}/manifest.json`,null,config.root);
  if(existingManifest){if(existingManifest.snapshot_hash!==proposedManifest.snapshot_hash||existingManifest.file_index_hash!==fileIndexHash)throw new Error(`content-addressed corpus generation collision: ${generationId}`);}else{writeJsonAtomic(fileIndexRel,{schema_version:1,corpus_generation_id:generationId,files:fileIndex},config.root);writeJsonAtomic(`${prefix}/manifest.json`,proposedManifest,config.root);writeJsonAtomic(`${prefix}/descriptors/candidates.json`,{schema_version:1,corpus_generation_id:generationId,patterns:merged},config.root);writeJsonAtomic(`${prefix}/descriptors/selected.json`,{schema_version:1,corpus_generation_id:generationId,patterns:selected},config.root);writeJsonAtomic(`${prefix}/findings/summary.json`,{schema_version:1,risk_counts:summaries(descriptors),file_findings:fileFindings.slice(0,1000),file_finding_count:fileFindings.length},config.root);}
  const manifest=existingManifest||proposedManifest;const sourceDelta={added_count:added.length,changed_count:changed.length,removed_count:removed.length,unchanged_count:unchanged.length,added,changed,removed};
  writeJsonAtomic('knowledge/sources/community.zie619.n8n_workflows/current-candidate.json',{schema_version:1,corpus_generation_id:generationId,source_commit:src.commit,manifest_rel:`${prefix}/manifest.json`,selected_rel:`${prefix}/descriptors/selected.json`,file_index_rel:fileIndexRel,latest_ingest:{previous_corpus_generation_id:previousManifest?.corpus_generation_id||null,analysis_cache_hits:cacheHits,analysis_cache_misses:cacheMisses,source_delta:sourceDelta,at:now()},updated_at:now()},config.root);
  appendJsonl('events/engineering-knowledge.jsonl',{event:'N8N_CORPUS_CANDIDATE_INGESTED',source_commit:src.commit,corpus_generation_id:generationId,workflow_file_count:files.length,selected_pattern_count:selected.length,analysis_cache_hits:cacheHits,analysis_cache_misses:cacheMisses,source_delta:sourceDelta,raw_workflow_persisted:false,at:now()},config.root);
  result={manifest,selected,fileFindings,ingest_run:{analysis_cache_hits:cacheHits,analysis_cache_misses:cacheMisses,source_delta:sourceDelta}};
 }finally{if(src.cleanup)fs.rmSync(src.root,{recursive:true,force:true});}
 return result;
}

if(import.meta.url===`file://${process.argv[1]}`){try{const opts=parseArgs(process.argv.slice(2));const r=ingestN8nCorpus(opts);console.log(JSON.stringify({manifest:r.manifest,selected_patterns:r.selected.map((x)=>({pattern_lineage_id:x.pattern_lineage_id,polarity:x.knowledge_polarity,archetype:x.archetype,support_count:x.support_count,risk:x.risk_severity}))},null,2));}catch(e){console.error(e.stack||e.message);process.exitCode=1;}}
