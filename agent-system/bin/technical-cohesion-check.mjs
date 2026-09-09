#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoDir=process.env.DIAL_REPO_DIR||process.cwd();
const target=path.join(repoDir,'agent-system/registries/TECHNICAL_COHESION_AUTHORITY_REGISTRY.json');
const failures=[];
let registry=null;
try { registry=JSON.parse(fs.readFileSync(target,'utf8')); } catch (error) { failures.push(`registry unreadable: ${error.message}`); }
const requiredInvariants=new Set(['one_authority_per_concern','adapters_never_promote_to_sor','deterministic_core_before_optional_analytics','analytics_failure_never_breaks_core_transaction','vekl_is_development_only']);
const requiredConcerns=new Set(['PRODUCT_REQUIREMENTS','DEVELOPMENT_ENGINEERING_KNOWLEDGE','MONEY_LEDGER','PRICING_MARGIN','BRANCH_ACTIVATION_CERTIFICATION','PRODUCT_EXPERIENCE_ANALYTICS','EXPERIMENT_DEFINITION_AND_RESULT','CUSTOMER_SURVEYS','TECHNICAL_OBSERVABILITY','AI_OBSERVABILITY','AI_EVALUATION_PROMOTION','BUSINESS_BI','OPERATIONAL_ACTIONS']);
if(registry){
  if(registry.authority!=='NOT_AN_INDEPENDENT_SOURCE_OF_TRUTH')failures.push('cohesion projection must not claim independent authority');
  const invariants=new Set(registry.invariants||[]);for(const item of requiredInvariants)if(!invariants.has(item))failures.push(`missing invariant:${item}`);
  const seen=new Set();for(const row of registry.concerns||[]){
    if(!row.concern_id)failures.push('concern_id required');
    else if(seen.has(row.concern_id))failures.push(`duplicate concern:${row.concern_id}`);else seen.add(row.concern_id);
    if(typeof row.canonical_authority!=='string'||!row.canonical_authority.trim())failures.push(`${row.concern_id}: exactly one canonical_authority string required`);
    if(!Array.isArray(row.supporting_systems))failures.push(`${row.concern_id}: supporting_systems array required`);
    if(!Array.isArray(row.forbidden_authority))failures.push(`${row.concern_id}: forbidden_authority array required`);
  }
  for(const id of requiredConcerns)if(!seen.has(id))failures.push(`missing concern:${id}`);
  const analytics=(registry.concerns||[]).find((row)=>row.concern_id==='PRODUCT_EXPERIENCE_ANALYTICS');
  if(!analytics?.supporting_systems?.some((x)=>String(x).includes('PostHog')))failures.push('PostHog must be bounded under PRODUCT_EXPERIENCE_ANALYTICS');
  const flags=(registry.concerns||[]).find((row)=>row.concern_id==='BRANCH_ACTIVATION_CERTIFICATION');
  if(!flags?.forbidden_authority?.some((x)=>String(x).includes('PostHog')))failures.push('PostHog must be forbidden as branch activation/certification authority');
  const money=(registry.concerns||[]).find((row)=>row.concern_id==='MONEY_LEDGER');
  if(!money?.forbidden_authority?.includes('PostHog'))failures.push('PostHog must be explicitly forbidden as money authority');
  const ai=(registry.concerns||[]).find((row)=>row.concern_id==='AI_OBSERVABILITY');
  if(!ai?.forbidden_authority?.some((x)=>String(x).includes('PostHog AI Observability')))failures.push('PostHog AI observability overlap must be explicitly rejected');
}
const result={status:failures.length?'RED':'GREEN',registry:'TECHNICAL_COHESION_AUTHORITY_REGISTRY',concerns:registry?.concerns?.length||0,failures};
console.log(JSON.stringify(result,null,2));if(failures.length)process.exitCode=1;
