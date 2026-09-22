import { hashObject, loadRegistry, registryHash } from './knowledge-graph-core.mjs';

const POLICY_REF='agent-system/registries/FRONTEND_DESIGN_SYNTHESIS_POLICY.json';
const uniq=(xs=[])=>[...new Set((xs||[]).filter(Boolean).map(String))];
const clone=(v)=>v==null?v:JSON.parse(JSON.stringify(v));

function artifact(type,id,body){ const out={schema_version:1,artifact_type:type,artifact_id:id,status:'RESOLVED',provenance:{},...body}; out.content_hash=hashObject({...out,content_hash:null}); return out; }

function titleCase(id=''){ return String(id).toLowerCase().split('_').map(x=>x?x[0].toUpperCase()+x.slice(1):x).join(' '); }

function defaultFeatureTransform(feature){
  const role=feature.edge_role||'CONTEXT_ONLY';
  if(feature.provider_visible===false || role==='NOT_EXPOSED') return {feature_id:feature.feature_id,renderability:'VALIDATION_ONLY',experience_expression:null,must_not_become_section:true};
  if(['PRIMARY_CAPABILITY','DIRECT_INTERACTION','DISCOVERY_ENTRY','STATUS_SUMMARY'].includes(role)){
    return {feature_id:feature.feature_id,renderability:'CUSTOMER_EXPERIENCE',experience_expression:feature.outcome||feature.feature_id,must_not_become_section:false};
  }
  return {feature_id:feature.feature_id,renderability:'BACKGROUND_PRODUCT_SEMANTICS',experience_expression:feature.outcome||feature.feature_id,must_not_become_section:true};
}

export function loadFrontendDesignSynthesisPolicy(repoDir){ return loadRegistry(repoDir,POLICY_REF); }

export function compileFrontendDesignSynthesis({repoDir,generationContext}={}){
  if(!repoDir) throw new Error('DESIGN_SYNTHESIS_REPO_REQUIRED');
  if(!generationContext?.content_hash) throw new Error('DESIGN_SYNTHESIS_CONTEXT_REQUIRED');
  const policy=loadFrontendDesignSynthesisPolicy(repoDir);
  const screen=(generationContext.screen_context?.screens||[]).find(x=>x.screen_id===generationContext.screen_context?.target_screen_id) || generationContext.screen_context?.screens?.[0];
  if(!screen) throw new Error('DESIGN_SYNTHESIS_SCREEN_REQUIRED');
  const module=generationContext.business_unit_context?.module || screen.module;
  const kindProfile=policy.screen_kind_profiles?.[screen.screen_kind] || {};
  const override=policy.module_screen_overrides?.[`${module}:${screen.screen_id}`] || {};
  const merged={...clone(kindProfile),...clone(override)};
  const semantic=generationContext.feature_context?.semantic_envelope || {};
  const featureOverrides=override.feature_experience_overrides || {};
  const featureToExperience=(semantic.features||[]).map((feature)=>({
    ...defaultFeatureTransform(feature),
    ...clone(featureOverrides[feature.feature_id]||{}),
    edge_role:feature.edge_role,
    subsystem:feature.subsystem,
    outcome:feature.outcome,
  }));

  const renderable=featureToExperience.filter(x=>x.renderability==='CUSTOMER_EXPERIENCE'&&x.experience_expression).map(x=>x.experience_expression);
  const background=featureToExperience.filter(x=>['BACKGROUND_PRODUCT_SEMANTICS','BACKGROUND_BEHAVIOR'].includes(x.renderability)&&x.experience_expression).map(x=>x.experience_expression);
  const semanticGuards=uniq((semantic.subsystem_semantics||[]).flatMap(x=>[...(x.semantic_invariants||[]),...(x.semantic_guards||[])]));
  const states=uniq([...(screen.state_contract?.required||[]),...(screen.state_contract?.conditional||[])]);
  const validationOnly=[
    'Feature IDs and Screen IDs are internal traceability metadata, never customer-facing copy.',
    'State simulator and preflight controls are validation tools, never customer-facing product sections.',
    'Acceptance matrices, packet hashes, provenance, debug hooks, test switches and engineering labels are validation-only.',
  ];
  const designConstraints=[
    ...semanticGuards,
    states.length?`State/error/loading requirements are behavior constraints, not customer-visible simulator controls: ${states.join(', ')}.`:null,
    'Accessibility, reduced motion, responsive behavior, truth provenance and capability limits shape the design without becoming visible engineering UI.',
  ].filter(Boolean);
  const requiredZones=uniq(merged.required_experience_zones||[]);
  const optionalZones=uniq(merged.optional_experience_zones||[]);
  const visual=clone(merged.visual_storytelling||{
    hero_visual_required:screen.screen_kind==='HOME_ENTRY',
    imagery_priority:screen.screen_kind==='HOME_ENTRY'?'MEDIUM_HIGH':'CONTEXTUAL',
    hero_must_support:[],hero_must_not_imply:[]
  });

  return artifact('FrontendDesignSynthesisBrief',`design-synthesis:${screen.screen_id}`,{
    policy_version:policy.policy_version,
    generation_context_hash:generationContext.content_hash,
    target_screen_id:screen.screen_id,
    target_application_id:generationContext.platform_context?.target_application_id||null,
    screen_purpose:merged.screen_purpose||screen.role_boundary?.role||'PRODUCT_TASK_SURFACE',
    synthesis_principle:policy.principle,
    knowledge_channels:{
      renderable_customer_content:uniq(renderable),
      background_product_semantics:uniq(background),
      design_constraints_only:uniq(designConstraints),
      validation_only:validationOnly,
    },
    feature_to_experience:featureToExperience,
    composition_budget:{
      required_experience_zones:requiredZones,
      optional_experience_zones:optionalZones,
      discovery_and_merchandising_min_percent:merged.discovery_and_merchandising_min_percent??0,
      system_assurance_max_percent:merged.system_assurance_max_percent??15,
      forbidden_dominant_sections:uniq(merged.forbidden_dominant_sections||[]),
      compression_rule:'SYNTHESIZE_MULTIPLE_REQUIREMENTS_INTO_FEWER_COHERENT_EXPERIENCE_ZONES',
      section_rule:'NO_ONE_FEATURE_ONE_SECTION_OR_ONE_REQUIREMENT_ONE_CARD',
    },
    visual_storytelling:visual,
    design_translation_rules:[
      'Convert capabilities and semantics into customer goals, journeys, hierarchy and interactions before choosing visible components.',
      'Do not turn every feature into a card, section, badge, or navigation destination.',
      'Prefer a few strong composed experience zones over a complete visual inventory of requirements.',
      'Use background semantics to make visible experiences correct, not to claim screen real estate.',
      'Use design constraints to shape states and behavior invisibly until the user actually encounters them.',
      'Keep validation-only material out of customer-facing UI entirely.',
      'Functional completeness is proven through correct interactions and state handling, not by visibly listing every feature.',
      'For discovery-oriented screens, visual storytelling, imagery, product/content relevance and customer momentum outrank policy exposition.',
    ],
    internal_traceability:{
      feature_refs:(semantic.features||[]).map(x=>x.feature_id),
      screen_id:screen.screen_id,
      policy_ref:POLICY_REF,
      policy_hash:registryHash(repoDir,POLICY_REF),
      render_policy:'INTERNAL_NON_RENDERABLE',
    },
  });
}

export function renderDesignSynthesisPromptBlock(synthesis={}){
  const zones=(synthesis.composition_budget?.required_experience_zones||[]).map(titleCase).join(', ');
  const optional=(synthesis.composition_budget?.optional_experience_zones||[]).map(titleCase).join(', ');
  const renderable=(synthesis.knowledge_channels?.renderable_customer_content||[]).map(x=>`- ${x}`).join('\n');
  const background=(synthesis.knowledge_channels?.background_product_semantics||[]).map(x=>`- ${x}`).join('\n');
  const constraints=(synthesis.knowledge_channels?.design_constraints_only||[]).map(x=>`- ${x}`).join('\n');
  const validation=(synthesis.knowledge_channels?.validation_only||[]).map(x=>`- ${x}`).join('\n');
  const forbidden=(synthesis.composition_budget?.forbidden_dominant_sections||[]).map(titleCase).join(', ');
  const visual=synthesis.visual_storytelling||{};
  return [
    'DESIGN SYNTHESIS CONTRACT — THIS OVERRIDES REQUIREMENTS-LIST RENDERING',
    `Screen purpose: ${synthesis.screen_purpose}.`,
    `Required experience zones: ${zones||'derive from screen purpose'}.`,
    optional?`Optional experience zones: ${optional}.`:'',
    `Discovery/merchandising should occupy at least ${synthesis.composition_budget?.discovery_and_merchandising_min_percent??0}% of meaningful Home content when applicable; system assurance/policy material may occupy at most ${synthesis.composition_budget?.system_assurance_max_percent??15}% and should usually be implicit.`,
    forbidden?`Never make these dominant customer sections: ${forbidden}.`:'',
    visual.hero_visual_required?'Hero discovery / strong image-led value moment is REQUIRED unless authoritative content makes it impossible.':'Hero imagery is contextual rather than mandatory.',
    visual.hero_visual_required?'HARD VISUAL GATE: the primary hero must contain a real provider-generated or provider-curated grocery/lifestyle image in the rendered output (not only gradient, iconography, illustration glyphs or typography). Generic imagery is CREATIVE_PRESENTATION; it must not imply merchant, origin, availability, freshness, price or delivery facts.':'',
    `Imagery priority: ${visual.imagery_priority||'CONTEXTUAL'}.`,
    (visual.hero_must_support||[]).length?`Hero must support: ${visual.hero_must_support.map(titleCase).join(', ')}.`:'',
    (visual.hero_must_not_imply||[]).length?`Hero must not imply: ${visual.hero_must_not_imply.map(titleCase).join(', ')}.`:'',
    'CUSTOMER-RENDERABLE EXPERIENCE OPPORTUNITIES (synthesize these; do not make one section per line):',
    renderable||'- Derive customer-facing content from screen purpose.',
    'BACKGROUND PRODUCT SEMANTICS — understand and obey, but DO NOT automatically render as sections/cards:',
    background||'- none',
    'DESIGN CONSTRAINTS ONLY — shape behavior/state design; DO NOT expose as engineering/policy UI:',
    constraints||'- none',
    'VALIDATION ONLY — DO NOT RENDER:',
    validation||'- none',
    'DO NOT render feature IDs, screen IDs, graph references, packet hashes, state simulators, preflight controls, acceptance matrices, debug/status panels, engineering labels or provenance.',
    'Do not turn every feature into a card, section, badge, or navigation destination.',
    'Do not substitute guarantees, policies, technical trust claims, fulfilment mechanics, feature explainers or state/debug controls for the required customer discovery zones.',
    'When authoritative catalogue/runtime values are absent, prefer generic product/category presentation and visual placeholders over invented brands, prices, stock states, merchant/origin claims, delivery times or popularity metrics.',
    'Translate the supplied product knowledge into a clean, visually authored, customer-centric product composition. Functionality should emerge through meaningful affordances and flows, not through a visible requirements inventory.',
  ].filter(Boolean).join('\n');
}

function stripNonVisibleHtml(html=''){
  return String(html||'')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/\s+/g,' ')
    .trim();
}

function visibleHeadings(html=''){
  return [...String(html||'').matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
    .map((m)=>stripNonVisibleHtml(m[1])).filter(Boolean);
}

export function evaluateDesignSynthesisCandidate({synthesis,html}={}){
  if(!synthesis?.content_hash) throw new Error('DESIGN_SYNTHESIS_REQUIRED');
  const source=String(html||'');
  const visible=stripNonVisibleHtml(source);
  const headings=visibleHeadings(source);
  const findings=[];
  const add=(finding_id,severity,evidence)=>findings.push({finding_id,severity,evidence});
  if(/\b[A-Z]{2,12}-F\d{3}\b/.test(visible)) add('VISIBLE_FEATURE_ID','BLOCKING',visible.match(/\b[A-Z]{2,12}-F\d{3}\b/)?.[0]);
  if(/\bSCREEN:[A-Z0-9:_-]+\b/i.test(visible)) add('VISIBLE_SCREEN_ID','BLOCKING',visible.match(/\bSCREEN:[A-Z0-9:_-]+\b/i)?.[0]);
  if(/state\s+preflight|preflight\s+simulator|state\s+simulator|acceptance\s+matrix|feature\s+matrix|debug\s+(panel|controls?|status)|packet\s+hash|engineering\s+status/i.test(visible)) add('VISIBLE_VALIDATION_UI','BLOCKING','validation/debug material appears in visible text');
  const badHeading=headings.find((x)=>/grocery\s+guarantees|guarantees\s+panel|fulfil+ment\s+policy|cold[- ]chain\s+(status|monitor|guarantee)|policy\s+explainer|state\s+preflight|preflight\s+simulator/i.test(x));
  if(badHeading) add('BACKGROUND_SEMANTIC_PROMOTED_TO_PRIMARY_SECTION','BLOCKING',badHeading);
  if(synthesis.visual_storytelling?.hero_visual_required){
    const hasImage=/<img\b/i.test(source) || /background-image\s*:/i.test(source) || /<picture\b/i.test(source);
    if(!hasImage) add('DISCOVERY_HERO_VISUAL_MISSING','BLOCKING','no image-led visual storytelling found');
  }
  const status=findings.some((x)=>x.severity==='BLOCKING')?'REJECTED':'PASSED';
  const result={schema_version:1,artifact_type:'DesignSynthesisLint',artifact_id:`design-synthesis-lint:${synthesis.target_screen_id}`,status,design_synthesis_hash:synthesis.content_hash,findings};
  result.content_hash=hashObject({...result,content_hash:null});
  return result;
}
