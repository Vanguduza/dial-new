import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deterministicMinimalCoalition, resolveEngineeringResources } from '../agent-system/orchestration/engineering-resource-resolver.mjs';
import { refreshAheadOfWorkResearch } from '../agent-system/orchestration/engineering-presearch.mjs';
import { runProjectAwareResearchForecast } from '../agent-system/orchestration/engineering-research-manager.mjs';
import { loadRuntimeHealth, recordRuntimeHealth } from '../agent-system/orchestration/runtime-health.mjs';
import { cachedCodexIdentity } from '../agent-system/orchestration/runtime-identity-cache.mjs';
import { persistSkillActivation, activationSummary, renderSkillActivationBundle } from '../agent-system/orchestration/skill-activation-store.mjs';
import { reResolvePacketEngineeringKnowledge, resolvePacketEngineeringKnowledge } from '../agent-system/orchestration/engineering-knowledge-broker.mjs';
import { ensureControlLayout, readJson, writeJsonAtomic } from '../agent-system/orchestration/state-store.mjs';

const repoDir=process.cwd();
function temp(name){return fs.mkdtempSync(path.join(os.tmpdir(),`${name}-`));}

describe('VEKL 2 federated engineering resources',()=>{
  it('keeps Oracle qualification and finalization pinned to the current federated-resource policy version',()=>{
    for (const rel of [
      'deploy/oracle/hermes-codex/qualify-control-plane.sh',
      'deploy/oracle/hermes-codex/finalize-control-plane.sh',
      'deploy/oracle/hermes-codex/finalize-development-readiness.sh',
    ]) {
      const text=fs.readFileSync(path.join(repoDir,rel),'utf8');
      expect(text).toContain('vekl-2.1');
      expect(text).not.toContain('vekl-2.0');
    }
  });
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
    expect(plan.policy_version).toBe('vekl-2.1');
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

  it('turns an exact Sol research quota response into reusable identity plus cooldown before falling back',async()=>{
    const root=temp('vekl2-sol-boundary');ensureControlLayout(root);
    const forecast={schema_version:1,forecast_horizon:'next_3_to_5_dependency_safe_packets',items:[
      {feature_id:'GROC-F021',objective:'A',task_classes:[],technologies:[],research_questions:[],preferred_source_ids:[],search_queries:[],risks:[]},
      {feature_id:'PLAT-F014',objective:'B',task_classes:[],technologies:[],research_questions:[],preferred_source_ids:[],search_queries:[],risks:[]},
      {feature_id:null,objective:'C',task_classes:[],technologies:[],research_questions:[],preferred_source_ids:[],search_queries:[],risks:[]},
    ],exclusions:[]};
    const result=await runProjectAwareResearchForecast({
      repoDir,root,sourceIds:[],
      primaryRunner:async()=>({ok:false,runtime:'codex_app_server',requested_model:'gpt-5.6-sol',resolved_model:'gpt-5.6-sol',identity_proven:true,thread_id:'thread-test',forecast:null,error:"You've hit your usage limit; try again at Sep 12th, 2026 5:42 AM. usageLimitExceeded",stderr:''}),
      fallbackRunner:async()=>({ok:true,runtime:'claude_code',requested_model:'claude-sonnet-5',resolved_model:'claude-sonnet-5',identity_proven:true,forecast}),
    });
    expect(result.runtime).toBe('claude_code');
    const health=loadRuntimeHealth(root).runtimes.codex_app_server;
    expect(health.state).toBe('ACCOUNT_LIMITED');
    expect(health.retry_after).toBe('2026-09-12T05:42:00.000Z');
    expect(cachedCodexIdentity({repoDir,root})).not.toBeNull();
  });

  it('does not invoke Sol research while a known provider cooldown is active',async()=>{
    const root=temp('vekl2-sol-cooldown');ensureControlLayout(root);
    recordRuntimeHealth('codex_app_server',{
      state:'ACCOUNT_LIMITED',requested_model:'gpt-5.6-sol',resolved_model:'gpt-5.6-sol',
      retry_after:new Date(Date.now()+60_000).toISOString(),details:{identity_proven:true,toolchain_usable:false},
    },root);
    let primaryCalls=0,fallbackCalls=0;
    const forecast={schema_version:1,forecast_horizon:'next_3_to_5_dependency_safe_packets',items:[
      {feature_id:'GROC-F021',objective:'A',task_classes:[],technologies:[],research_questions:[],preferred_source_ids:[],search_queries:[],risks:[]},
      {feature_id:'PLAT-F014',objective:'B',task_classes:[],technologies:[],research_questions:[],preferred_source_ids:[],search_queries:[],risks:[]},
      {feature_id:null,objective:'C',task_classes:[],technologies:[],research_questions:[],preferred_source_ids:[],search_queries:[],risks:[]},
    ],exclusions:[]};
    const result=await runProjectAwareResearchForecast({
      repoDir,root,sourceIds:[],
      primaryRunner:async()=>{primaryCalls++;return {ok:true,runtime:'codex_app_server',requested_model:'gpt-5.6-sol',resolved_model:'gpt-5.6-sol',identity_proven:true,forecast};},
      fallbackRunner:async()=>{fallbackCalls++;return {ok:true,runtime:'claude_code',requested_model:'claude-sonnet-5',resolved_model:'claude-sonnet-5',identity_proven:true,forecast};},
    });
    expect(primaryCalls).toBe(0);
    expect(fallbackCalls).toBe(1);
    expect(result.runtime).toBe('claude_code');
  });

  it('keeps a forecast current across volatile mission turn changes but refreshes on priority changes',async()=>{
    const root=temp('vekl2-semantic-fingerprint');ensureControlLayout(root);
    let calls=0;
    const item={feature_id:'GROC-F021',objective:'Research bounded work',task_classes:[],technologies:[],research_questions:[],preferred_source_ids:[],search_queries:[],risks:[]};
    const planner=async()=>{calls++;return {ok:true,runtime:'claude_code',requested_model:'claude-sonnet-5',resolved_model:'claude-sonnet-5',identity_proven:true,forecast:{schema_version:1,forecast_horizon:'next_3_to_5_dependency_safe_packets',items:[item,{...item,feature_id:'PLAT-F014'},{...item,feature_id:null}],exclusions:[]}};};
    writeJsonAtomic('missions/dial-development-root.json',{state:'RUNNING',objective:'Continue DIAL',priority_directive:'canonical order',turn_number:1,last_packet_id:'a',last_packet_state:'COMPLETED'},root);
    await refreshAheadOfWorkResearch({repoDir,root,planner,fetchImpl:async()=>new Response('ok',{status:200,headers:{'content-type':'text/plain'}})});
    expect(calls).toBe(1);
    writeJsonAtomic('missions/dial-development-root.json',{state:'BLOCKED_OWNER',objective:'Continue DIAL',priority_directive:'canonical order',turn_number:99,last_packet_id:'different',last_packet_state:'FAILED'},root);
    const reused=await refreshAheadOfWorkResearch({repoDir,root,planner,fetchImpl:async()=>new Response('ok',{status:200,headers:{'content-type':'text/plain'}})});
    expect(calls).toBe(1);
    expect(reused.refresh_state).toBe('CURRENT');
    writeJsonAtomic('missions/dial-development-root.json',{state:'RUNNING',objective:'Continue DIAL',priority_directive:'prioritise changed bounded work',turn_number:100,last_packet_id:'different2',last_packet_state:'COMPLETED'},root);
    await refreshAheadOfWorkResearch({repoDir,root,planner,fetchImpl:async()=>new Response('ok',{status:200,headers:{'content-type':'text/plain'}})});
    expect(calls).toBe(2);
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
    expect(first.policy_version).toBe('vekl-2.2-rev2');
    expect(first.knowledge_context?.scope).toBe('DEVELOPMENT_UNIT');
    expect(first.resources.some((r)=>r.resource_id==='ref.supabase.docs')).toBe(true);
    const second=reResolvePacketEngineeringKnowledge({repoDir,root,packetId:'packet-reresource-1',instruction:'Implement and verify the Next.js customer surface for the same bounded Feature.',metadata:{feature_id:'GROC-F021',affected_paths:['apps/web/app/rounds/page.tsx']},reason:'concrete UI packet selected after repository inspection'});
    expect(second.policy_version).toBe('vekl-2.2-rev2');
    expect(second.previous_activation_id).toBe(first.activation_id);
    expect(second.re_resolution_reason).toMatch(/concrete UI packet/);
    expect(second.resources.some((r)=>r.resource_id==='ref.nextjs.docs')).toBe(true);
  }, 60000);

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

  it('keeps complementary VEKL roles while pruning redundant peers deterministically regardless of input order',()=>{
    const rows=[
      {resource:{resource_id:'react-doc-a'},purpose:'REACT',role:'AUTHORITY',score:.95,mandatory:false},
      {resource:{resource_id:'react-doc-b'},purpose:'REACT',role:'AUTHORITY',score:.80,mandatory:false},
      {resource:{resource_id:'react-tool'},purpose:'REACT',role:'EXECUTOR',score:.70,mandatory:false},
      {resource:{resource_id:'a11y-oracle'},purpose:'ACCESSIBILITY',role:'VERIFIER',score:.90,mandatory:false},
      {resource:{resource_id:'dial-policy'},purpose:'DIAL_GOVERNANCE',role:'POLICY',score:1,mandatory:true},
    ];
    const a=deterministicMinimalCoalition(rows,8);
    const b=deterministicMinimalCoalition([...rows].reverse(),8);
    expect(a.selected_resource_ids).toEqual(b.selected_resource_ids);
    expect(a.selected_resource_ids).toEqual(['a11y-oracle','dial-policy','react-doc-a','react-tool']);
    expect(a.rejected).toContainEqual({resource_id:'react-doc-b',reason:'REDUNDANT_PEER_PRUNED:REACT:AUTHORITY'});
  });

  it('selects PostHog official guidance only for product analytics/rollout work and never through the Skill selection path',()=>{
    const root=temp('vekl21-posthog');ensureControlLayout(root);
    const plan=resolveEngineeringResources({repoDir,root,instruction:'Instrument PostHog product analytics funnels, session replay policy and staff dogfood feature flags.',affectedPaths:['packages/product-telemetry/src/index.ts'],maxResources:12});
    const posthog=plan.selected_resources.find((row)=>row.resource_id==='ref.posthog.docs');
    expect(posthog).toMatchObject({selection_role:'AUTHORITY',selection_purpose:'POSTHOG_PRODUCT_EXPERIENCE_TELEMETRY'});
    expect(plan.selected_resources.some((row)=>row.resource_class==='SKILL')).toBe(false);
    expect(plan.invariants.hard_eligibility_before_ranking).toBe(true);
    expect(plan.invariants.input_order_independent).toBe(true);
  });

});
