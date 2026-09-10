#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { canonical, hashObject } from './knowledge-graph-core.mjs';

const DECISION_REL='agent-system/registries/DECISION_LOG.json';
function git(repoDir,args){return execFileSync('git',args,{cwd:repoDir,encoding:'utf8'}).trim();}
function rowsAt(repoDir,ref){const body=git(repoDir,['show',`${ref}:${DECISION_REL}`]);return JSON.parse(body);}
function currentRows(repoDir){return JSON.parse(fs.readFileSync(path.join(repoDir,DECISION_REL),'utf8'));}
function normalized(row){return canonical(row);}

export function checkLockedDecisionEvolution({baseRows,currentRows:nextRows}={}){
 const failures=[];const next=new Map((nextRows||[]).map((row)=>[row.decision_id,row]));
 for(const prior of baseRows||[]){if(prior.status!=='LOCKED')continue;const cur=next.get(prior.decision_id);
  if(!cur){failures.push({decision_id:prior.decision_id,reason:'LOCKED_DECISION_DELETED'});continue;}
  if(hashObject(normalized(cur))!==hashObject(normalized(prior)))failures.push({decision_id:prior.decision_id,reason:'LOCKED_DECISION_MUTATED'});
 }
 return{ok:failures.length===0,failures,locked_base_count:(baseRows||[]).filter((x)=>x.status==='LOCKED').length,new_decision_ids:(nextRows||[]).filter((x)=>!(baseRows||[]).some((b)=>b.decision_id===x.decision_id)).map((x)=>x.decision_id).sort()};
}

export function verifyLockedDecisionEvolution({repoDir=process.cwd(),baseRef='origin/master'}={}){
 let base=baseRef;try{base=git(repoDir,['merge-base','HEAD',baseRef])||baseRef;}catch{}
 const result=checkLockedDecisionEvolution({baseRows:rowsAt(repoDir,base),currentRows:currentRows(repoDir)});
 return{...result,base_ref:base,decision_registry:DECISION_REL};
}

if(import.meta.url===`file://${process.argv[1]}`){
 const i=process.argv.indexOf('--base');const baseRef=i>=0&&process.argv[i+1]?process.argv[i+1]:'origin/master';
 try{const result=verifyLockedDecisionEvolution({baseRef});console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=42;}
 catch(error){console.error(`locked decision evolution check failed: ${error.message}`);process.exitCode=43;}
}
