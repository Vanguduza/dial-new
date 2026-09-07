#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getEngineeringSkill } from '../orchestration/skill-registry.mjs';
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
function git(cwd,...args){return execFileSync('git',args,{cwd,encoding:'utf8'}).trim();}
const skillId=process.argv[2], sourceDir=path.resolve(arg('--source-dir')||'');
if(!skillId||!sourceDir) throw new Error('usage: skills-upstream-diff.mjs <skill-id> --source-dir <checkout> [--to <commit>]');
const record=getEngineeringSkill(skillId,process.env.DIAL_REPO_DIR||process.cwd()); if(!record) throw new Error(`unknown skill: ${skillId}`);
const from=arg('--from')||record.production_pin||record.research_reference_commit; const to=arg('--to')||git(sourceDir,'rev-parse','HEAD');
if(!from||!to||!record.source_path) throw new Error('from/to commit and source_path are required');
const files=git(sourceDir,'diff','--name-status',from,to,'--',record.source_path).split(/\r?\n/).filter(Boolean);
console.log(JSON.stringify({schema_version:1,skill_id:skillId,from_commit:from,to_commit:to,source_path:record.source_path,changed_files:files,recommended_action:files.length?'CANARY_AND_REQUALIFY':'KEEP_PIN'},null,2));
