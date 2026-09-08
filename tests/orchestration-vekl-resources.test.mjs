import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveEngineeringResources } from '../agent-system/orchestration/engineering-resource-resolver.mjs';
import { refreshAheadOfWorkResearch } from '../agent-system/orchestration/engineering-presearch.mjs';
import { persistSkillActivation, activationSummary, renderSkillActivationBundle } from '../agent-system/orchestration/skill-activation-store.mjs';
import { reResolvePacketEngineeringKnowledge, resolvePacketEngineeringKnowledge } from '../agent-system/orchestration/engineering-knowledge-broker.mjs';
import { ensureControlLayout, readJson, writeJsonAtomic } from '../agent-system/orchestration/state-store.mjs';

const repoDir=process.cwd();
function temp(name){return fs.mkdtempSync(path.join(os.tmpdir(),`${name}-`));}

describe('VEKL 2 federated engineering resources',()=>{
  it('prefers official stack resources for a Supabase RLS task and marks community signals as corroboration only',()=>{
    const root=temp('vekl2-resolve');ensureControlLayout(root);
    const plan=resolveEngineeringResources({repoDir,root,instruction:'Implement Supabase Postgres RLS policies and TypeScript validation for Grocery Rounds, then add Vitest coverage.',affectedPaths:['packages/rounds/src/policy.ts'],maxResources:12});
    const ids=plan.selected_resources.map((r)=>r.resource_id);
    expect(ids).toContain('ref.supabase.docs');
    expect(ids).toContain('ref.postgresql.docs');
    expect(ids).toContain('ref.typescript.docs');
    expect(ids).toContain('ref.vitest.docs');
    const communities=plan.selected_resources.filter((r)=>r.authority==='COMMUNITY_SIGNAL_ONLY');
    expect(communities.every((r)=>r.corroboration_required===true)).toBe(true);
    expect(plan.policy_version).toBe('vekl-2.0');
  });

  it('uses a project-aware forecast to prefetch approved sources ahead of work without making them executable',async()=>{
    const root=temp('vekl2-research');ensureControlLayout(root);
    const planner=async()=>({ok:true,runtime:'codex_app_server',requested_model:'gpt-5.6-sol',resolved_model:'gpt-5.6-sol',identity_proven:true,forecast:{schema_version:1,forecast_horizon:'next_3_to_5_dependency_safe_packets',items:[
      {feature_id:'GROC-F021',objective:'Close Grocery Rounds RLS and contract tests',task_classes:['DATABASE','RLS_SECURITY','UNIT_TESTING'],technologies:['Supabase','PostgreSQL','Vitest'],research_questions:['What are the current RLS policy semantics relevant to the existing schema?'],preferred_source_ids:['official.supabase','official.postgresql','official.vitest'],search_queries:['Supabase RLS policy auth.uid current guidance'],risks:['Do not create a second authority.']},
      {feature_id:'PLAT-F014',objective:'Research deterministic margin calculation refusal paths',task_classes:['VALIDATION','UNIT_TESTING'],technologies:['Zod','Vitest'],research_questions:['How should missing evidenced inputs fail closed?'],preferred_source_ids:['official.zod','official.vitest'],search_queries:['Zod discriminated union missing input'],risks:['No second price authority.']},
      {feature_id:null,objective:'Research kernel authorization negative tests',task_classes:['RLS_SECURITY','E2E_TESTING'],technologies:['Supabase','Playwright'],research_questions:['How should cross-tenant access be denied and tested?'],preferred_source_ids:['official.supabase','official.playwright'],search_queries:['Supabase RLS Playwright negative authorization'],risks:['No privileged test client may manufacture green evidence.']}
    ],exclusions:['No provider migration.']}});
    const fakeFetch=async(url)=>new Response(`<html><body>Official engineering reference for ${url}</body></html>`,{status:200,headers:{'content-type':'text/html'}});
    const result=await refreshAheadOfWorkResearch({repoDir,root,force:true,planner,fetchImpl:fakeFetch,maxResources:8});
    expect(result.state).toBe('READY');
    expect(result.runtime_provenance.resolved_model).toBe('gpt-5.6-sol');
    expect(result.resource_cache_count).toBeGreaterThan(0);
    const index=readJson('knowledge/research/cache-index.json',null,root);
    expect(index.resources['ref.supabase.docs'].cache_ref).toMatch(/^knowledge\/research\/cache\//);
    const cached=readJson(index.resources['ref.supabase.docs'].cache_ref,null,root);
    expect(cached.executable).toBe(false);
    expect(cached.authority).toBe('ENGINEERING_GUIDANCE_ONLY');
  });

  it('persists resource provenance in the same packet activation and renders cached presearch evidence for fallback symmetry',()=>{
    const root=temp('vekl2-activation');ensureControlLayout(root);
    writeJsonAtomic('knowledge/research/cache/example.json',{content_excerpt:'Supabase RLS cached evidence.',content_hash:'abc'},root);
    const manifest=persistSkillActivation({packetId:'packet-resource-1',plan:{policy_version:'vekl-2.0',task_classes:['RLS_SECURITY'],resolution_state:'NO_EXTERNAL_SKILL_REQUIRED',selected_skills:[],selected_resources:[{resource_id:'ref.supabase.docs',name:'Supabase documentation',resource_class:'OFFICIAL_DOC',source_id:'official.supabase',trust_tier:'T1_OFFICIAL',authority:'ENGINEERING_GUIDANCE_ONLY',activation_mode:'REFERENCE_ONLY',locator:'https://supabase.com/docs',freshness:'FRESH',cache_ref:'knowledge/research/cache/example.json',content_hash:'abc',corroboration_required:false,forbidden_effects:['CREATE_SECOND_SOR']}],rejected:[],resource_rejected:[],relevant_bundles:[]},root});
    const summary=activationSummary(manifest);
    expect(summary.selected_resources[0].resource_id).toBe('ref.supabase.docs');
    const bundle=renderSkillActivationBundle(manifest,root);
    expect(bundle).toContain('RESOURCE ref.supabase.docs');
    expect(bundle).toContain('Supabase RLS cached evidence.');
  });

  it('persists federated resources through audited packet re-resolution when the concrete task changes',()=>{
    const root=temp('vekl2-reresolve');ensureControlLayout(root);
    const first=resolvePacketEngineeringKnowledge({repoDir,root,packetId:'packet-reresource-1',instruction:'Implement Supabase Postgres RLS policies for Grocery Rounds.',metadata:{feature_id:'GROC-F021',affected_paths:['packages/rounds/src/policy.ts']}});
    expect(first.policy_version).toBe('vekl-2.0');
    expect(first.resources.some((r)=>r.resource_id==='ref.supabase.docs')).toBe(true);
    const second=reResolvePacketEngineeringKnowledge({repoDir,root,packetId:'packet-reresource-1',instruction:'Implement and verify the Next.js customer surface for the same bounded Feature.',metadata:{feature_id:'GROC-F021',affected_paths:['apps/web/app/rounds/page.tsx']},reason:'concrete UI packet selected after repository inspection'});
    expect(second.previous_activation_id).toBe(first.activation_id);
    expect(second.re_resolution_reason).toMatch(/concrete UI packet/);
    expect(second.resources.some((r)=>r.resource_id==='ref.nextjs.docs')).toBe(true);
  });

  it('records MODEL_UNAVAILABLE rather than fabricating an ahead-of-work forecast',async()=>{
    const root=temp('vekl2-model-unavailable');ensureControlLayout(root);
    const result=await refreshAheadOfWorkResearch({repoDir,root,force:true,planner:async()=>({ok:false,runtime:null,error:'quota unavailable'}),fetchImpl:async()=>{throw new Error('should not fetch');}});
    expect(result.state).toBe('MODEL_UNAVAILABLE');
    expect(result.items).toEqual([]);
    expect(result.error).toContain('quota unavailable');
  });


  it('refuses redirects from an allowlisted research source to an unallowlisted/internal host',async()=>{
    const root=temp('vekl2-ssrf');ensureControlLayout(root);
    const planner=async()=>({ok:true,runtime:'codex_app_server',requested_model:'gpt-5.6-sol',resolved_model:'gpt-5.6-sol',identity_proven:true,forecast:{schema_version:1,forecast_horizon:'next_3_to_5_dependency_safe_packets',items:[
      {feature_id:'GROC-F021',objective:'Check current Supabase RLS guidance',task_classes:['RLS_SECURITY'],technologies:['Supabase'],research_questions:['Current RLS behavior?'],preferred_source_ids:['official.supabase'],search_queries:['Supabase RLS'],risks:[]},
      {feature_id:'PLAT-F014',objective:'Check validation guidance',task_classes:['VALIDATION'],technologies:['Zod'],research_questions:['Current validation behavior?'],preferred_source_ids:['official.zod'],search_queries:['Zod validation'],risks:[]},
      {feature_id:null,objective:'Check test guidance',task_classes:['UNIT_TESTING'],technologies:['Vitest'],research_questions:['Current test behavior?'],preferred_source_ids:['official.vitest'],search_queries:['Vitest tests'],risks:[]}
    ],exclusions:[]}});
    let calls=0;const fakeFetch=async()=>{calls++;return new Response('',{status:302,headers:{location:'http://127.0.0.1:9999/private','content-type':'text/plain'}});};
    const result=await refreshAheadOfWorkResearch({repoDir,root,force:true,planner,fetchImpl:fakeFetch,maxResources:4});
    expect(result.state).toBe('READY');
    expect(calls).toBeGreaterThanOrEqual(1);
    const index=readJson('knowledge/research/cache-index.json',null,root);
    const cached=readJson(index.resources['ref.supabase.docs'].cache_ref,null,root);
    expect(cached.state).toBe('FETCH_FAILED');
    expect(cached.error).toMatch(/redirect escaped allowlist/);
  });

  it('sanitizes feature ranges because a forecast item must never invent a non-atomic Feature ID',async()=>{
    const root=temp('vekl2-feature-sanitize');ensureControlLayout(root);
    const item={feature_id:'GROC-F019..F034',objective:'Research the next bounded Grocery Rounds packet',task_classes:['DATABASE'],technologies:['PostgreSQL'],research_questions:['Which exact feature owns this packet?'],preferred_source_ids:['official.postgresql'],search_queries:['PostgreSQL ledger'],risks:['Resolve exact Feature ID before implementation.']};
    const planner=async()=>({ok:true,runtime:'claude_code',requested_model:'claude-sonnet-5',resolved_model:'claude-sonnet-5',identity_proven:true,forecast:{schema_version:1,forecast_horizon:'next_3_to_5_dependency_safe_packets',items:[item,{...item,feature_id:'PLAT-F014'},{...item,feature_id:null}],exclusions:[]}});
    const result=await refreshAheadOfWorkResearch({repoDir,root,force:true,planner,fetchImpl:async()=>new Response('ok',{status:200,headers:{'content-type':'text/plain'}}),maxResources:2});
    expect(result.state).toBe('READY');
    expect(result.items[0].feature_id).toBe(null);
  });

});
