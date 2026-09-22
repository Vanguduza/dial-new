// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildFrontendProductExperienceProjection, buildDesignBriefBundle } from '../agent-system/orchestration/frontend-product-experience.mjs';
import { buildCanonicalStitchVisualPacket, renderStitchVisualProductionPrompt } from '../agent-system/orchestration/frontend-design-provider-orchestrator.mjs';
import { freezeVisualAuthorityArtifact, lintCandidateFacts } from '../agent-system/orchestration/frontend-generation-architecture.mjs';
import { extractVisualTruthClaimsFromHtml } from '../agent-system/orchestration/stitch-design-orchestration.mjs';

const repoDir=path.resolve(process.cwd());
const features=JSON.parse(fs.readFileSync(path.join(repoDir,'docs/dial/final-audit/11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json'),'utf8'));
const units=JSON.parse(fs.readFileSync(path.join(repoDir,'agent-system/registries/DEVELOPMENT_UNIT_REGISTRY.json'),'utf8')).units;
const feature=features.find((x)=>x.feature_id==='GROC-F001');
const unit=units.find((x)=>(x.feature_ids||[]).includes('GROC-F001'));

function build(){
  return buildFrontendProductExperienceProjection({
    repoDir,unit,featureRecord:feature,targetScreenId:'SCREEN:GROCERIES:GROCERIES_HOME_ENTRY',
    instruction:'Create the DIAL Groceries Android consumer home screen.',
    affectedPaths:['apps/android/groceries/HomeScreen.kt'],
  });
}

describe('Groceries canonical frontend semantic compiler',()=>{
  test('consumer Android home resolves to one target application instead of cross-platform/provider contamination',()=>{
    const ctx=build().frontend_generation_context;
    expect(ctx.platform_context.target_application_id).toBe('DIAL_CONSUMER_ANDROID');
    expect(ctx.platform_context.applications.map((x)=>x.application_id)).toEqual(['DIAL_CONSUMER_ANDROID']);
    expect(ctx.actor_context.actor_classes).toEqual(['CUSTOMERS']);
  });

  test('screen feature edges distinguish direct home behavior from discovery/context/deep-link features',()=>{
    const ctx=build().frontend_generation_context;
    const edges=Object.fromEntries(ctx.feature_context.screen_feature_edges.map((x)=>[x.feature_id,x.role]));
    expect(edges['GROC-F001']).toBe('PRIMARY_CAPABILITY');
    expect(edges['GROC-F002']).toBe('DIRECT_INTERACTION');
    expect(edges['GROC-F012']).toBe('DISCOVERY_ENTRY');
    expect(edges['GROC-F013']).toBe('DISCOVERY_ENTRY');
    expect(edges['GROC-F019']).toBe('DISCOVERY_ENTRY');
    expect(edges['GROC-F030']).toBe('CONTEXT_ONLY');
    expect(edges['GROC-F034']).toBe('NOT_EXPOSED');
    expect(edges['GROC-F018']).toBe('NOT_EXPOSED');
  });

  test('canonical graph itself carries explicit Groceries Home feature-edge roles with no unclassified semantic edge',()=>{
    const registry=JSON.parse(fs.readFileSync(path.join(repoDir,'agent-system/registries/SCREEN_REGISTRY.json'),'utf8'));
    const screen=registry.screens.find((x)=>x.screen_id==='SCREEN:GROCERIES:GROCERIES_HOME_ENTRY');
    expect(screen.feature_edges).toHaveLength(screen.feature_refs.length);
    expect(screen.feature_edges.some((x)=>x.edge_role==='UNCLASSIFIED_CONTEXT')).toBe(false);
    expect(screen.feature_edges.find((x)=>x.feature_id==='GROC-F019').edge_role).toBe('DISCOVERY_ENTRY');
  });

  test('Grocery Rounds semantics are hydrated and explicitly separated from Scheduled Basket',()=>{
    const semantics=build().frontend_generation_context.feature_context.semantic_envelope;
    const round=semantics.features.find((x)=>x.feature_id==='GROC-F019');
    const schedule=semantics.features.find((x)=>x.feature_id==='GROC-F013');
    expect(round.subsystem).toBe('GROCERY_ROUNDS');
    expect(round.semantic_invariants.join(' ')).toMatch(/prepaid grocery/i);
    expect(round.semantic_invariants.join(' ')).toMatch(/3.*6.*9.*12/);
    expect(round.semantic_invariants.join(' ')).toMatch(/bulk.*procurement/i);
    expect(round.semantic_guards.join(' ')).toMatch(/not.*recurring.*delivery/i);
    expect(schedule.subsystem).toBe('SCHEDULED_BASKET');
    expect(schedule.semantic_guards.join(' ')).toMatch(/not.*grocery round/i);
    const room=semantics.features.find((x)=>x.feature_id==='GROC-F030');
    expect(room.outcome).toBe('Round Room');
  });

  test('home action and command context is derived only from direct screen-feature roles',()=>{
    const ctx=build().frontend_generation_context;
    expect(ctx.feature_context.actions).not.toContain('upload_evidence');
    expect(ctx.feature_context.commands).not.toContain('CreateGroceryOrderGroup');
    expect(ctx.feature_context.command_scope_policy).toBe('PRIMARY_AND_DIRECT_INTERACTION_ONLY');
  });

  test('Groceries brand authority keeps orange black warm-white and general-grocery positioning with Shopping mode',()=>{
    const ctx=build().frontend_generation_context;
    const brand=ctx.design_authority.domain_brand_authority;
    expect(brand.identity).toBe('DIAL_GROCERIES_ORANGE_BLACK_WARM_WHITE');
    expect(brand.palette.primary_accent.toUpperCase()).toBe('#F04E00');
    expect(brand.palette.ink.toUpperCase()).toBe('#141311');
    expect(brand.semantic_colour_policy.green).toMatch(/support/i);
    expect(ctx.business_unit_context.product_positioning).toBe('GENERAL_GROCERY_AND_HOUSEHOLD_COMMERCE');
    expect(ctx.business_unit_context.shopping_mode.required_on_home).toBe(true);
    expect(ctx.business_unit_context.category_scope).toEqual(expect.arrayContaining(['FRESH_PRODUCE','PANTRY','HOUSEHOLD_ESSENTIALS','BEVERAGES']));
  });

  test('compiled Stitch prompt carries semantic invariants, edge roles, target app and brand authority',()=>{
    const px=build();
    const brief=buildDesignBriefBundle({projection:px,unit,taskId:'groc-semantic',instruction:'Create the DIAL Groceries Android consumer home screen.'});
    const packet=buildCanonicalStitchVisualPacket({repoDir,fdep:px,brief});
    const prompt=renderStitchVisualProductionPrompt({packet});
    expect(prompt).toMatch(/Target application: DIAL_CONSUMER_ANDROID/);
    expect(prompt).toMatch(/GROCERY_ROUNDS/);
    expect(prompt).toMatch(/prepaid grocery/i);
    expect(prompt).toMatch(/not.*recurring.*delivery/i);
    expect(prompt).toMatch(/GENERAL_GROCERY_AND_HOUSEHOLD_COMMERCE/);
    expect(prompt).toMatch(/#F04E00/i);
    expect(prompt).toMatch(/Shopping mode/i);
  });

  test('visual truth-claims contract is machine-readable before visual authority freeze',()=>{
    const html='<main>Groceries</main><script id="dial-visual-truth-claims" type="application/json">{"claims":[{"path":"cart.total","value":42,"display_text":"$42"}]}</script>';
    const parsed=extractVisualTruthClaimsFromHtml(html);
    expect(parsed.status).toBe('PARSED');
    expect(parsed.claims).toEqual([{path:'cart.total',value:42,display_text:'$42'}]);
    expect(parsed.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(extractVisualTruthClaimsFromHtml('<main>No contract</main>').status).toBe('MISSING');
  });

  test('visual authority freeze fails closed when truth-literal lint is absent or rejected',()=>{
    const ctx=build().frontend_generation_context;
    const candidate={provider:'google-stitch',project_id:'p',screen_id:'s',response_hash:'a'.repeat(64)};
    const absent=freezeVisualAuthorityArtifact({generationContext:ctx,candidate,critique:{verdict:'PASS'},promotedBy:'test',promotionAuthority:'AUTHORIZED_DESIGN_AUTHORITY'});
    expect(absent.ok).toBe(false);
    expect(absent.failures).toContain('TRUTH_LITERAL_LINT_REQUIRED');
    const rejected=lintCandidateFacts({generationContext:ctx,candidateFacts:[{path:'store.name',value:'Bayswater Fresh Hub'}]});
    const bad=freezeVisualAuthorityArtifact({generationContext:ctx,candidate,critique:{verdict:'PASS'},truthLiteralLint:rejected,designSynthesisLint:{status:'PASSED',content_hash:'e'.repeat(64)},promotedBy:'test',promotionAuthority:'AUTHORIZED_DESIGN_AUTHORITY'});
    expect(bad.ok).toBe(false);
    expect(bad.failures).toContain('TRUTH_LITERAL_LINT_REJECTED');
    const passed=lintCandidateFacts({generationContext:ctx,candidateFacts:[]});
    const good=freezeVisualAuthorityArtifact({generationContext:ctx,candidate,critique:{verdict:'PASS'},truthLiteralLint:passed,designSynthesisLint:{status:'PASSED',content_hash:'e'.repeat(64)},promotedBy:'test',promotionAuthority:'AUTHORIZED_DESIGN_AUTHORITY'});
    expect(good.ok).toBe(true);
  });
});
