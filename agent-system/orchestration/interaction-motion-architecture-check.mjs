#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFrontendProductExperienceProjection } from './frontend-product-experience.mjs';
import { compileInteractionDesignPreflight, compileInteractionMotionIntelligence } from './interaction-motion-intelligence.mjs';
import { freezeVisualAuthorityArtifact, lintCandidateFacts } from './frontend-generation-architecture.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const read=(rel)=>JSON.parse(fs.readFileSync(path.join(repo,rel),'utf8'));
const checks=[]; const gate=(id,ok,detail)=>checks.push({id,ok:Boolean(ok),detail});

try {
 const policy=read('agent-system/registries/DESIGN_ACUITY_POLICY.json');
 const patterns=read('agent-system/registries/INTERACTION_MOTION_PATTERN_REGISTRY.json');
 const sources=read('agent-system/registries/INTERACTION_MOTION_SOURCE_REGISTRY.json');
 const generation=read('agent-system/registries/FRONTEND_GENERATION_POLICY.json');
 const tokens=read('agent-system/registries/FRONTEND_TOKEN_REGISTRY.json');
 const components=read('agent-system/registries/FRONTEND_COMPONENT_REGISTRY.json');
 const anti=read('agent-system/registries/DESIGN_ANTI_PATTERN_REGISTRY.json');
 const routes=read('agent-system/registries/KNOWLEDGE_ROUTE_REGISTRY.json');
 gate('IM-G01',policy.interaction_motion_pass==='MANDATORY_FOR_INTERACTIVE_FRONTEND'&&policy.visual_preflight_required===true&&policy.post_visual_enrichment_required===true,'interaction/motion is mandatory before and after visual freeze');
 gate('IM-G02',(policy.acuity_dimensions||[]).length>=16,'expert design acuity covers task, hierarchy, feedback, platform, responsive, state, accessibility, performance and polish');
 gate('IM-G03',(patterns.patterns||[]).length>=50&&patterns.global_rules?.all_applicable_families_must_be_considered===true,'substantial admitted pattern corpus is contextually considered');
 gate('IM-G04',(sources.sources||[]).length>=20&&(sources.sources||[]).every((x)=>x.production_import_allowed===false&&x.design_authority_allowed===false),'reference sources are broad but non-authoritative');
 const stageIds=new Set((generation.stages||[]).map((x)=>x.stage_id));
 gate('IM-G05',stageIds.has('VEKL_INTERACTION_DESIGN_PREFLIGHT')&&stageIds.has('VEKL_INTERACTION_MOTION_INTELLIGENCE')&&stageIds.has('STITCH_INTERACTION_MOTION_ENRICHMENT'),'interaction acuity is encoded as first-class generation stages');
 gate('IM-G06',(tokens.tokens||[]).some((x)=>x.token_id==='semantic.motion.spring.snappy')&&(tokens.tokens||[]).some((x)=>x.token_id==='semantic.motion.reduced'),'motion and reduced-motion are token-governed');
 gate('IM-G07',(components.components||[]).filter((x)=>x.interaction_contract_required===true).length>=12,'advanced interaction structures have production component identities/contracts');
 const antiIds=new Set([...(anti.enforced_baseline||[]),...(anti.guided_additional||[])].map((x)=>x.pattern_id));
 gate('IM-G08',['ANIMATION_FOR_ANIMATION_SAKE','GESTURE_CONFLICT','RESPONSIVE_SHRINKING','MISSING_REDUCED_MOTION','PLATFORM_ALIEN_BEHAVIOR'].every((x)=>antiIds.has(x)),'interaction/motion anti-patterns are enforceable');
 gate('IM-G09',(routes.routes||[]).some((x)=>x.route_id==='INTERACTION_MOTION'&&x.automatic_for_ui===true),'VEKL has an automatic interaction/motion knowledge route');
 const duRegistry=read('agent-system/registries/DEVELOPMENT_UNIT_REGISTRY.json');
 const uiUnits=(duRegistry.units||[]).filter((x)=>(x.knowledge_route_ids||[]).includes('PRODUCT_EXPERIENCE'));
 gate('IM-G09B',uiUnits.length>0&&uiUnits.every((x)=>(x.knowledge_route_ids||[]).includes('INTERACTION_MOTION')),'every UI-bearing Development Unit is routed through interaction/motion knowledge');
 const features=read('docs/dial/final-audit/11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json');
 const feature=features.find((x)=>x.feature_id==='SPARE-F001');
 const unit={unit_lineage_id:'DU-IM-CHECK',unit_revision_hash:'rev1',feature_ids:['SPARE-F001'],knowledge_route_ids:['PRODUCT_EXPERIENCE']};
 const px=buildFrontendProductExperienceProjection({repoDir:repo,unit,featureRecord:feature,targetScreenId:'SCREEN:SPARE:SPARE_HOME_ENTRY',instruction:'DIAL A SPARE Android discovery home',affectedPaths:['apps/android/spare/HomeScreen.kt']});
 const ctx=px.frontend_generation_context;
 const pf=compileInteractionDesignPreflight({repoDir:repo,generationContext:ctx});
 const selected=[...(pf.required_considerations||[]),...(pf.strong_candidates||[]),...(pf.additional_candidates||[])].map((x)=>x.pattern_id);
 gate('IM-G10',selected.includes('PATTERN_PREDICTIVE_BACK')&&selected.includes('PATTERN_HORIZONTAL_CONTENT_RAIL')&&!selected.includes('PATTERN_COMMAND_PALETTE'),'pattern selection is contextual for an Android commerce discovery screen');
 gate('IM-G11',pf.open_world_discovery_brief?.admission_required_before_guidance===true&&pf.open_world_discovery_brief?.raw_external_code_to_provider_forbidden===true,'open-world discovery feeds VEKL only through qualification/admission');
 const va=freezeVisualAuthorityArtifact({generationContext:ctx,candidate:{provider:'google-stitch',project_id:'p',screen_id:'s',response_hash:'a'.repeat(64)},critique:{verdict:'PASS'},truthLiteralLint:lintCandidateFacts({generationContext:ctx,candidateFacts:[]}),designSynthesisLint:{status:'PASSED',content_hash:'e'.repeat(64)},promotedBy:'gate',promotionAuthority:'AUTHORIZED_DESIGN_AUTHORITY'}).visual_authority;
 const intel=compileInteractionMotionIntelligence({repoDir:repo,generationContext:ctx,visualAuthority:va,preflight:pf});
 gate('IM-G12',intel.expert_role==='PRINCIPAL_PRODUCT_DESIGN_ENGINEER_AND_INTERACTION_MOTION_SPECIALIST'&&intel.decision_contract?.rationale_required===true,'post-freeze pass has explicit expert role and reasoned decisions');
 gate('IM-G13',intel.structural_delta_policy?.silent_redesign_forbidden===true&&intel.structural_delta_policy?.requires_visual_reconvergence?.includes('MATERIAL_INFORMATION_ARCHITECTURE_CHANGE'),'bounded interaction deltas cannot silently redesign frozen visual authority');
 gate('IM-G14',(intel.required_outputs||[]).includes('StateBehaviorMatrix')&&(intel.required_outputs||[]).includes('ResponsiveInteractionPlan')&&(intel.required_outputs||[]).includes('InteractionRiskRegister'),'expert output covers responsive/state/risk behavior, not animation alone');
 gate('IM-G15',fs.existsSync(path.join(repo,'docs/dial/architecture/VEKL_INTERACTION_MOTION_DESIGN_ACUITY_REV1.md')),'canonical interaction/motion design-acuity specification exists');
} catch(error){gate('IM-INTERNAL',false,error.stack||error.message);}
for(const row of checks) console.log(`${row.ok?'PASS':'FAIL'} ${row.id} ${row.detail}`);
const failures=checks.filter((x)=>!x.ok);
console.log(JSON.stringify({status:failures.length?'RED':'GREEN',gates:checks.length,failures:failures.map((x)=>x.id)},null,2));
if(failures.length) process.exitCode=1;
