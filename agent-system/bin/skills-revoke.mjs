#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONTROL_HOME, appendJsonl } from '../orchestration/state-store.mjs';
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
const skillId=process.argv[2], reason=arg('--reason'), approvedBy=arg('--approved-by');
if(!skillId||!reason||!approvedBy) throw new Error('usage: skills-revoke.mjs <skill-id> --reason <reason> --approved-by <authority>');
const repoDir=process.env.DIAL_REPO_DIR||process.cwd(); const target=path.join(repoDir,'agent-system/engineering-knowledge/registries/ENGINEERING_SKILL_REGISTRY.json');
const rows=JSON.parse(fs.readFileSync(target,'utf8')); const row=rows.find((r)=>r.skill_id===skillId); if(!row) throw new Error(`unknown skill: ${skillId}`);
const previous=row.approval_state; row.approval_state='REVOKED'; row.revoked_at=new Date().toISOString(); row.revocation_reason=String(reason).slice(0,2000); row.revoked_by=String(approvedBy).slice(0,240);
fs.writeFileSync(target,JSON.stringify(rows,null,2)+'\n');
try{appendJsonl('events/engineering-knowledge.jsonl',{event:'SKILL_VERSION_REVOKED',skill_id:skillId,production_pin:row.production_pin,previous_state:previous,reason:row.revocation_reason,approved_by:row.revoked_by,at:row.revoked_at},process.env.DIAL_CONTROL_HOME||DEFAULT_CONTROL_HOME);}catch{}
console.log(JSON.stringify({skill_id:skillId,previous_state:previous,state:'REVOKED',production_pin:row.production_pin,reason:row.revocation_reason,approved_by:row.revoked_by},null,2));
