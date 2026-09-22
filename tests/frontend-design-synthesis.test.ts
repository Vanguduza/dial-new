// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildFrontendProductExperienceProjection, buildDesignBriefBundle } from '../agent-system/orchestration/frontend-product-experience.mjs';
import { compileFrontendDesignSynthesis, evaluateDesignSynthesisCandidate } from '../agent-system/orchestration/frontend-design-synthesis.mjs';
import { buildCanonicalStitchVisualPacket, renderStitchVisualProductionPrompt } from '../agent-system/orchestration/frontend-design-provider-orchestrator.mjs';

const repoDir=path.resolve(process.cwd());
const features=JSON.parse(fs.readFileSync(path.join(repoDir,'docs/dial/final-audit/11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json'),'utf8'));
const units=JSON.parse(fs.readFileSync(path.join(repoDir,'agent-system/registries/DEVELOPMENT_UNIT_REGISTRY.json'),'utf8')).units;
const feature=features.find((x)=>x.feature_id==='GROC-F001');
const unit=units.find((x)=>(x.feature_ids||[]).includes('GROC-F001'));
function projection(){ return buildFrontendProductExperienceProjection({repoDir,unit,featureRecord:feature,targetScreenId:'SCREEN:GROCERIES:GROCERIES_HOME_ENTRY',instruction:'Design the DIAL Groceries Android consumer home',affectedPaths:['apps/android/groceries/HomeScreen.kt']}); }

describe('frontend knowledge-to-design synthesis',()=>{
  test('classifies provider knowledge by renderability instead of treating requirements as sections',()=>{
    const s=compileFrontendDesignSynthesis({repoDir,generationContext:projection().frontend_generation_context});
    expect(Object.keys(s.knowledge_channels).sort()).toEqual(['background_product_semantics','design_constraints_only','renderable_customer_content','validation_only'].sort());
    expect(s.knowledge_channels.validation_only.join(' ')).toMatch(/feature ids|state simulator|preflight|acceptance/i);
    expect(s.knowledge_channels.background_product_semantics.join(' ')).toMatch(/approval|substitution|cold-chain|round/i);
  });

  test('Groceries Home is explicitly discovery-led and reserves prime space for hero and products',()=>{
    const s=compileFrontendDesignSynthesis({repoDir,generationContext:projection().frontend_generation_context});
    expect(s.screen_purpose).toBe('DISCOVERY_COMMERCE_HOME');
    expect(s.composition_budget.required_experience_zones).toEqual(expect.arrayContaining(['HERO_DISCOVERY','SHOPPING_MODE','SEARCH','CATEGORY_DISCOVERY','POPULAR_OR_RELEVANT_PRODUCTS']));
    expect(s.composition_budget.discovery_and_merchandising_min_percent).toBeGreaterThanOrEqual(60);
    expect(s.composition_budget.system_assurance_max_percent).toBeLessThanOrEqual(10);
    expect(s.composition_budget.forbidden_dominant_sections).toEqual(expect.arrayContaining(['STATE_PREFLIGHT_SIMULATOR','POLICY_EXPLAINER','GUARANTEES_PANEL']));
  });

  test('feature semantics are transformed into customer experiences rather than rendered one-feature-per-card',()=>{
    const s=compileFrontendDesignSynthesis({repoDir,generationContext:projection().frontend_generation_context});
    const byFeature=Object.fromEntries(s.feature_to_experience.map((x)=>[x.feature_id,x]));
    expect(byFeature['GROC-F001'].renderability).toBe('CUSTOMER_EXPERIENCE');
    expect(byFeature['GROC-F001'].experience_expression).toMatch(/catalog|discover|product/i);
    expect(byFeature['GROC-F009'].renderability).toBe('BACKGROUND_BEHAVIOR');
    expect(byFeature['GROC-F009'].must_not_become_section).toBe(true);
    expect(byFeature['GROC-F011'].must_not_become_section).toBe(true);
    expect(byFeature['GROC-F019'].experience_expression).toMatch(/round/i);
  });

  test('visual storytelling contract requires image-led customer discovery without turning imagery into a domain claim',()=>{
    const s=compileFrontendDesignSynthesis({repoDir,generationContext:projection().frontend_generation_context});
    expect(s.visual_storytelling.hero_visual_required).toBe(true);
    expect(s.visual_storytelling.imagery_priority).toBe('HIGH');
    expect(s.visual_storytelling.hero_must_support).toContain('GENERAL_GROCERY_AND_HOUSEHOLD_DISCOVERY');
    expect(s.visual_storytelling.hero_must_not_imply).toContain('FRESH_PRODUCE_ONLY_PRODUCT_IDENTITY');
  });


  test('design-synthesis lint rejects feature/debug dumping and missing image-led discovery',()=>{
    const synthesis=compileFrontendDesignSynthesis({repoDir,generationContext:projection().frontend_generation_context});
    const bad='<main><h2>DIAL Grocery Guarantees</h2><div>GROC-F013</div><h3>State Preflight Simulator</h3></main>';
    const result=evaluateDesignSynthesisCandidate({synthesis,html:bad});
    expect(result.status).toBe('REJECTED');
    expect(result.findings.map((x)=>x.finding_id)).toEqual(expect.arrayContaining(['VISIBLE_FEATURE_ID','VISIBLE_VALIDATION_UI','DISCOVERY_HERO_VISUAL_MISSING']));
    const good='<main><section class="hero"><img src="hero.jpg" alt="A full grocery and household shopping moment"/><h1>Everything for the week, in one place</h1></section><section><h2>Popular this week</h2></section></main>';
    expect(evaluateDesignSynthesisCandidate({synthesis,html:good}).status).toBe('PASSED');
  });

  test('Stitch prompt tells the model to synthesize, not display internal graph/debug material',()=>{
    const px=projection();
    const brief=buildDesignBriefBundle({projection:px,unit,taskId:'synthesis-test',instruction:'Design the DIAL Groceries Android consumer home'});
    const packet=buildCanonicalStitchVisualPacket({repoDir,fdep:px,brief});
    expect(packet.design_synthesis?.content_hash).toMatch(/^[a-f0-9]{64}$/);
    const prompt=renderStitchVisualProductionPrompt({packet});
    expect(prompt).toMatch(/DESIGN SYNTHESIS CONTRACT/);
    expect(prompt).toMatch(/DO NOT render feature IDs/i);
    expect(prompt).toContain('State/error/loading requirements are behavior constraints, not customer-visible simulator controls');
    expect(prompt).toMatch(/Hero discovery/i);
    expect(prompt).toMatch(/Popular or relevant products/i);
    expect(prompt).toMatch(/Do not turn every feature into a card, section, badge, or navigation destination/i);
    expect(prompt).not.toMatch(/Required states: READY, LOADING, EMPTY, ERROR, DEGRADED/);
    expect(prompt).not.toMatch(/GROC-F\d{3}/);
    expect(prompt).not.toMatch(/SCREEN:GROCERIES/);
  });
});
