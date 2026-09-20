#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFrontendProductExperienceProjection } from './frontend-product-experience.mjs';
import { compileFrontendDesignSynthesis, evaluateDesignSynthesisCandidate } from './frontend-design-synthesis.mjs';
import { buildCanonicalStitchVisualPacket, renderStitchVisualProductionPrompt } from './frontend-design-provider-orchestrator.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const read=(rel)=>JSON.parse(fs.readFileSync(path.join(repo,rel),'utf8'));
const rows=[]; const gate=(id,ok,detail)=>rows.push({id,ok:Boolean(ok),detail});

try {
  const features=read('docs/dial/final-audit/11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json');
  const units=read('agent-system/registries/DEVELOPMENT_UNIT_REGISTRY.json').units;
  const feature=features.find((x)=>x.feature_id==='GROC-F001');
  const unit=units.find((x)=>(x.feature_ids||[]).includes('GROC-F001'));
  const px=buildFrontendProductExperienceProjection({repoDir:repo,unit,featureRecord:feature,targetScreenId:'SCREEN:GROCERIES:GROCERIES_HOME_ENTRY',instruction:'Design the DIAL Groceries Android consumer home',affectedPaths:['apps/android/groceries/HomeScreen.kt']});
  const ctx=px.frontend_generation_context;
  const synthesis=compileFrontendDesignSynthesis({repoDir:repo,generationContext:ctx});
  gate('DS-G01',synthesis.screen_purpose==='DISCOVERY_COMMERCE_HOME','Groceries Home compiles as a discovery-commerce surface');
  gate('DS-G02',synthesis.composition_budget.discovery_and_merchandising_min_percent>=60&&synthesis.composition_budget.system_assurance_max_percent<=10,'discovery/merchandising dominates assurance/policy content');
  gate('DS-G03',synthesis.composition_budget.required_experience_zones.includes('HERO_DISCOVERY')&&synthesis.composition_budget.required_experience_zones.includes('POPULAR_OR_RELEVANT_PRODUCTS'),'Home reserves primary space for hero discovery and relevant products');
  gate('DS-G04',synthesis.visual_storytelling.hero_visual_required===true&&synthesis.visual_storytelling.imagery_priority==='HIGH','visual storytelling is first-class for consumer discovery Home');
  const by=Object.fromEntries(synthesis.feature_to_experience.map((x)=>[x.feature_id,x]));
  gate('DS-G05',by['GROC-F009']?.renderability==='BACKGROUND_BEHAVIOR'&&by['GROC-F009']?.must_not_become_section===true&&by['GROC-F011']?.must_not_become_section===true,'approval/cold-chain semantics shape behavior instead of becoming Home sections');
  gate('DS-G06',by['GROC-F019']?.renderability==='CUSTOMER_EXPERIENCE'&&/round/i.test(by['GROC-F019']?.experience_expression||''),'Grocery Rounds becomes a customer journey entry rather than an operations dump');
  const validation=synthesis.knowledge_channels.validation_only.join(' ');
  gate('DS-G07',/Feature IDs/.test(validation)&&/State simulator/.test(validation)&&/Acceptance matrices/.test(validation),'graph/debug/preflight material is validation-only');
  const packet=buildCanonicalStitchVisualPacket({repoDir:repo,fdep:px,brief:{content_hash:'brief'}});
  const prompt=renderStitchVisualProductionPrompt({packet});
  gate('DS-G08',/DESIGN SYNTHESIS CONTRACT/.test(prompt)&&/Do not turn every feature into a card, section, badge, or navigation destination/i.test(prompt),'Stitch receives synthesis-first instructions');
  gate('DS-G09',!/Required states: READY, LOADING, EMPTY, ERROR, DEGRADED/.test(prompt)&&/NEVER RENDER PREFLIGHT\/STATE-SIMULATOR UI/.test(prompt),'state coverage is not rendered as customer test UI');
  const bad=evaluateDesignSynthesisCandidate({synthesis,html:'<main><h2>DIAL Grocery Guarantees</h2><div>GROC-F013</div><h3>State Preflight Simulator</h3></main>'});
  gate('DS-G10',bad.status==='REJECTED'&&bad.findings.some((x)=>x.finding_id==='VISIBLE_FEATURE_ID')&&bad.findings.some((x)=>x.finding_id==='VISIBLE_VALIDATION_UI'),'provider feature/debug dumping fails synthesis lint');
  const good=evaluateDesignSynthesisCandidate({synthesis,html:'<main><section class="hero"><img src="hero.jpg" alt="Grocery shopping"/><h1>Everything for the week</h1></section><section><h2>Popular this week</h2></section></main>'});
  gate('DS-G11',good.status==='PASSED','clean image-led customer composition passes synthesis lint');
} catch(error){ gate('DS-INTERNAL',false,error.stack||error.message); }

for(const r of rows) console.log(`${r.ok?'PASS':'FAIL'} ${r.id} ${r.detail}`);
const failures=rows.filter((x)=>!x.ok);
console.log(JSON.stringify({status:failures.length?'RED':'GREEN',gates:rows.length,failures:failures.map((x)=>x.id)},null,2));
if(failures.length) process.exitCode=1;
