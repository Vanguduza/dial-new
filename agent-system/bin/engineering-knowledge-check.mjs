#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { validateEngineeringSkillRegistry } from '../orchestration/skill-registry.mjs';
import { EXECUTABLE_RESOURCE_CLASSES, loadEngineeringResourceRegistry, loadEngineeringResourceSources, validateEngineeringResourceRegistries } from '../orchestration/engineering-resource-registry.mjs';

const repoDir=process.env.DIAL_REPO_DIR||process.cwd();const failures=[];
const skills=validateEngineeringSkillRegistry(repoDir);if(!skills.ok)failures.push(...skills.failures.map((x)=>`skill:${x}`));
for(const rel of ['agent-system/engineering-knowledge/schemas/engineering-resource-source.schema.json','agent-system/engineering-knowledge/schemas/engineering-resource.schema.json','agent-system/engineering-knowledge/schemas/engineering-research-forecast.schema.json','agent-system/engineering-knowledge/schemas/skill-activation-manifest.schema.json']){const target=path.join(repoDir,rel);if(!fs.existsSync(target))failures.push(`missing:${rel}`);else{try{JSON.parse(fs.readFileSync(target,'utf8'));}catch(e){failures.push(`invalid-json:${rel}:${e.message}`);}}}
const resources=validateEngineeringResourceRegistries(repoDir);if(!resources.ok)failures.push(...resources.failures.map((x)=>`resource:${x}`));
const rows=loadEngineeringResourceRegistry(repoDir);const sources=new Map(loadEngineeringResourceSources(repoDir).map((s)=>[s.source_id,s]));
for(const row of rows){
  const source=sources.get(row.source_id);
  if(row.authority==='COMMUNITY_SIGNAL_ONLY'&&!['CORROBORATION_ONLY','DISCOVERY_ONLY'].includes(row.activation_mode))failures.push(`${row.resource_id}: community signal cannot use ${row.activation_mode}`);
  if(row.authority==='COMMUNITY_SIGNAL_ONLY'&&EXECUTABLE_RESOURCE_CLASSES.has(row.resource_class))failures.push(`${row.resource_id}: community signal cannot be executable`);
  if(source?.sensitive_data_allowed===true)failures.push(`${row.resource_id}: external research sources may not receive sensitive data`);
  if(row.status==='POLICY_APPROVED_CONDITIONAL'&&!(row.requires_tools||[]).length)failures.push(`${row.resource_id}: conditional tool resource requires declared tool dependency`);
}
const result={status:failures.length?'RED':'GREEN',policy_version:'vekl-2.0',skill_records:skills.skill_count,approved_skills:skills.approved_count,resource_sources:resources.source_count,resource_records:resources.resource_count,reference_or_policy_resources:rows.filter((r)=>['DISCOVERY_APPROVED','REFERENCE_APPROVED','POLICY_APPROVED_CONDITIONAL','APPROVED','ACTIVE'].includes(r.status)).length,failures};
console.log(JSON.stringify(result,null,2));if(failures.length)process.exitCode=1;
