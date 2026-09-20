#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFrontendProductExperienceProjection } from './frontend-product-experience.mjs';
import {
  buildStitchVisualProductionPacket,
  buildInteractionMotionEnrichmentPacket,
  freezeVisualAuthorityArtifact,
  freezeExperienceAuthorityArtifact,
  buildProductionBindingContract,
  resolveTruthSourceProfile,
} from './frontend-generation-architecture.mjs';
import { selectCanonicalFrontendDesignProvider } from './frontend-design-provider-orchestrator.mjs';
import { compileInteractionDesignPreflight, compileInteractionMotionIntelligence } from './interaction-motion-intelligence.mjs';
import { loadCanonicalScreenGraph } from './screen-feature-graph.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const read=(rel)=>JSON.parse(fs.readFileSync(path.join(repo,rel),'utf8'));
const results=[];
const gate=(id,ok,detail)=>results.push({id,ok:Boolean(ok),detail});

try {
  const policy=read('agent-system/registries/DESIGN_PROVIDER_POLICY.json');
  gate('FGA-G01',policy.automatic_design_provider==='google-stitch' && policy.automatic_provider_fallback_forbidden===true,'Stitch is the sole automatic frontend design provider');
  gate('FGA-G02',policy.providers?.figma?.automatic_dispatch===false && policy.providers?.figma?.fallback_on_stitch_failure===false && /EXPLICIT/.test(policy.providers?.figma?.invocation||''),'Figma is explicit-only and never automatic fallback');

  const {registry,graph}=loadCanonicalScreenGraph(repo);
  gate('FGA-G03',registry.stats?.application_platform_count===20 && registry.stats?.canonical_screen_count===428,'canonical graph covers 20 application/platform nodes and 428 screens');
  gate('FGA-G04',Object.values(registry.gaps||{}).every((x)=>Array.isArray(x)&&x.length===0),'canonical Screen Registry × Feature Graph has zero declared gaps');
  gate('FGA-G05',graph.indexes?.screen_to_applications && graph.indexes?.application_to_screens && graph.indexes?.feature_to_screens && graph.indexes?.screen_to_features,'graph remains bidirectional through screens, features and applications');

  const features=read('docs/dial/final-audit/11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json');
  const modules=[...new Set(registry.screens.map((x)=>x.module))].sort();
  let truthProfiles=true;
  for(const module of modules){try{const p=resolveTruthSourceProfile({repoDir:repo,module});if(!p.module_sources?.length)truthProfiles=false;}catch{truthProfiles=false;}}
  gate('FGA-G06',modules.length===15 && truthProfiles,'all 15 canonical screen modules have authoritative truth-source profiles');

  const archetypes=read('agent-system/registries/FRONTEND_ARCHETYPE_REGISTRY.json');
  const commerce=archetypes.archetypes?.find((x)=>x.archetype_id==='DIAL_COMMERCE_DISCOVERY_EDITORIAL_HERO_V1');
  gate('FGA-G07',commerce?.authority_class==='OWNER_APPROVED_ARCHETYPE' && commerce?.reuse_mode==='GRAMMAR_NOT_PIXEL_COPY' && commerce?.owner_approved===true,'owner-approved discovery archetype is reusable as grammar, not pixel copy');

  const units=read('agent-system/registries/DEVELOPMENT_UNIT_REGISTRY.json').units;
  const unit=units.find((x)=>(x.feature_ids||[]).includes('SPARE-F001'));
  const spare=features.find((x)=>x.feature_id==='SPARE-F001');
  const px=buildFrontendProductExperienceProjection({repoDir:repo,unit,featureRecord:spare,instruction:'Design the Dial a Spare home discovery screen',affectedPaths:['apps/android/spare/HomeScreen.kt']});
  const ctx=px.frontend_generation_context;
  gate('FGA-G08',ctx?.screen_context?.target_screen_id==='SCREEN:SPARE:SPARE_HOME_ENTRY' && ctx?.feature_context?.feature_ids?.includes('SPARE-F001'),'task intent resolves to canonical Spare home screen before provider dispatch');
  gate('FGA-G09',ctx?.design_authority?.archetype_refs?.includes('DIAL_COMMERCE_DISCOVERY_EDITORIAL_HERO_V1'),'applicable owner archetype is injected into the screen context');
  gate('FGA-G10',ctx?.completeness?.provider_dispatch_ready===true,'complete screen context can dispatch to Stitch');

  const blocked=buildFrontendProductExperienceProjection({repoDir:repo,unit,featureRecord:spare,instruction:'Design the Dial a Spare home discovery screen',affectedPaths:['apps/android/spare/HomeScreen.kt'],requestedTruth:['vehicle.engine_code']});
  gate('FGA-G11',blocked.frontend_generation_context?.completeness?.failures?.includes('MISSING_REQUIRED_TRUTH'),'missing required catalogue/EPC truth fails closed');

  const provider=selectCanonicalFrontendDesignProvider({repoDir:repo,providerHealth:{stitch:'HEALTHY'}});
  const outage=selectCanonicalFrontendDesignProvider({repoDir:repo,providerHealth:{stitch:'UNAVAILABLE'}});
  const figma=selectCanonicalFrontendDesignProvider({repoDir:repo,requestedProvider:'figma',explicitProviderRequest:false});
  gate('FGA-G12',provider.selected==='google-stitch' && outage.ok===false && outage.automatic_fallback===false && figma.reason==='FIGMA_EXPLICIT_INVOCATION_REQUIRED','canonical provider router never silently substitutes Figma/direct design');

  const acuityPolicy=read('agent-system/registries/DESIGN_ACUITY_POLICY.json');
  const patternRegistry=read('agent-system/registries/INTERACTION_MOTION_PATTERN_REGISTRY.json');
  const sourceRegistry=read('agent-system/registries/INTERACTION_MOTION_SOURCE_REGISTRY.json');
  gate('FGA-G13',acuityPolicy.interaction_motion_pass==='MANDATORY_FOR_INTERACTIVE_FRONTEND' && acuityPolicy.visual_preflight_required===true && acuityPolicy.post_visual_enrichment_required===true && patternRegistry.patterns?.length>=50,'interaction/motion is a mandatory first-class design lifecycle with a substantial admitted pattern corpus');

  const preflight=compileInteractionDesignPreflight({repoDir:repo,generationContext:ctx});
  gate('FGA-G14',preflight.status==='READY' && preflight.visual_preflight_requirements?.length>0 && preflight.open_world_discovery_brief?.admission_required_before_guidance===true,'interaction design preflight runs before visual generation and bridges qualified open-world discovery');
  gate('FGA-G15',(preflight.required_considerations||[]).some((x)=>x.pattern_id==='PATTERN_PREDICTIVE_BACK') && !(preflight.additional_candidates||[]).some((x)=>x.pattern_id==='PATTERN_COMMAND_PALETTE'),'pattern retrieval is platform/screen contextual rather than a fashionable-pattern checklist');

  const visualPacket=buildStitchVisualProductionPacket({generationContext:ctx,designBrief:{content_hash:'brief'},interactionPreflight:preflight,blindReferenceMode:true});
  gate('FGA-G16',visualPacket.provider==='google-stitch' && visualPacket.reference_policy==='REFERENCE_IMAGE_ACCESS_FORBIDDEN' && visualPacket.target_screen?.screen_id==='SCREEN:SPARE:SPARE_HOME_ENTRY' && visualPacket.interaction_design_preflight?.content_hash===preflight.content_hash,'Stitch visual generation receives screen/feature/platform truth plus interaction-readiness preflight');

  const frozen=freezeVisualAuthorityArtifact({generationContext:ctx,candidate:{provider:'google-stitch',project_id:'p',screen_id:'s',response_hash:'a'.repeat(64)},critique:{verdict:'PASS'},promotedBy:'gate',promotionAuthority:'AUTHORIZED_DESIGN_AUTHORITY'});
  const intelligence=compileInteractionMotionIntelligence({repoDir:repo,generationContext:ctx,visualAuthority:frozen.visual_authority,preflight});
  gate('FGA-G17',intelligence.expert_role==='PRINCIPAL_PRODUCT_DESIGN_ENGINEER_AND_INTERACTION_MOTION_SPECIALIST' && intelligence.required_outputs?.includes('DesignAcuityAssessment') && intelligence.required_outputs?.includes('ResponsiveInteractionPlan') && intelligence.decision_contract?.rationale_required===true,'post-freeze interaction intelligence requires expert design-acuity analysis and rationale');
  const interaction=buildInteractionMotionEnrichmentPacket({generationContext:ctx,visualAuthority:frozen.visual_authority,intelligence});
  gate('FGA-G18',frozen.ok && interaction.provider==='google-stitch' && interaction.preserve?.includes('approved_composition') && interaction.required_outputs?.includes('MotionSpec') && interaction.structural_delta_policy?.silent_redesign_forbidden===true,'visual freeze precedes expert interaction/motion enrichment with bounded structural delta');
  gate('FGA-G19',sourceRegistry.sources?.every((x)=>x.production_import_allowed===false && x.design_authority_allowed===false) && interaction.open_world_discovery_brief?.raw_external_code_to_provider_forbidden===true,'interaction knowledge uses external sources only as non-authoritative reference/inspiration');

  const interactionArtifact={content_hash:'b'.repeat(64),interaction_intent_map:[],gesture_map:[],motion_spec:[],advanced_component_decisions:[]};
  const experience=freezeExperienceAuthorityArtifact({generationContext:ctx,visualAuthority:frozen.visual_authority,interactionArtifact,acceptance:{passed:true,content_hash:'c'.repeat(64)}});
  const bindings=Object.fromEntries((ctx.screen_context.screens[0].action_refs||[]).map((x)=>[x,`domain.${x}`]));
  const production=buildProductionBindingContract({generationContext:ctx,experienceAuthority:experience.experience_authority,bindings:{actions:bindings}});
  gate('FGA-G20',experience.ok && production.policy?.redesign_forbidden===true && production.policy?.preserve_visual_parity===true && production.policy?.preserve_interaction_parity===true,'DDE productionization preserves frozen experience authority and parity');
} catch(error) {
  gate('FGA-UNCAUGHT',false,error.stack||error.message);
}

for(const row of results) console.log(`${row.ok?'PASS':'FAIL'} ${row.id} ${row.detail}`);
const failures=results.filter((x)=>!x.ok);
console.log(JSON.stringify({status:failures.length?'RED':'GREEN',gates:results.length,failures:failures.map((x)=>x.id)},null,2));
if(failures.length) process.exitCode=1;
