import { hashObject, loadRegistry } from './knowledge-graph-core.mjs';

const PRIORITY_WEIGHT=Object.freeze({REQUIRED:100,STRONG:70,CONSIDER:40,OPTIONAL:20});
const COMMERCE_MODULES=new Set(['SPARE','GROCERIES','LAUNDRY','TECH']);
const PROFESSIONAL_MODULES=new Set(['CORPORATE','PROJECTS','FLEET','GMPC','DKRF','PLATFORM']);

function uniq(values){return [...new Set((values||[]).filter(Boolean).map(String))].sort();}
function upper(value){return String(value||'').toUpperCase();}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}

function platformTags(generationContext){
  const tags=new Set();
  for(const app of generationContext?.platform_context?.applications||[]){
    const joined=[app.application_id,...(app.platform_targets||[])].join(' ').toUpperCase();
    if(joined.includes('ANDROID')){tags.add('ANDROID');tags.add('MOBILE');tags.add('TOUCH');}
    if(joined.includes('IOS')||joined.includes('IPHONE')){tags.add('IOS');tags.add('MOBILE');tags.add('TOUCH');}
    if(joined.includes('WEB')){tags.add('WEB');tags.add('KEYBOARD');tags.add('POINTER');}
    if(joined.includes('DESKTOP')||joined.includes('WINDOWS')){tags.add('DESKTOP');tags.add('KEYBOARD');tags.add('POINTER');}
    if(joined.includes('TABLET')){tags.add('TABLET');tags.add('TOUCH');}
  }
  return tags;
}

export function deriveInteractionSignals({generationContext}={}){
  if(!generationContext?.screen_context?.target_screen_id) throw new Error('INTERACTION_SIGNALS_REQUIRE_GENERATION_CONTEXT');
  const target=generationContext.screen_context.screens.find((x)=>x.screen_id===generationContext.screen_context.target_screen_id)||generationContext.screen_context.screens[0];
  const module=upper(generationContext.business_unit_context?.module);
  const tags=platformTags(generationContext);
  tags.add('ANY_SCREEN');
  tags.add(upper(target?.screen_kind||'DOMAIN_SCREEN'));
  const role=upper(target?.role_boundary?.role);
  if(role) tags.add(role);
  for(const state of [...(target?.state_contract?.required||[]),...(target?.state_contract?.conditional||[])]) tags.add(upper(state));
  if(['HOME_ENTRY','SEARCH_RESULTS'].includes(target?.screen_kind)){tags.add('DISCOVERY');tags.add('NAVIGATION');}
  if(target?.screen_kind==='DETAIL_STATE'){tags.add('DETAIL');tags.add('INSPECTION');tags.add('LONG_SCROLL');}
  if(target?.screen_kind==='QUEUE'){tags.add('QUEUE');tags.add('LIST');tags.add('DATA_DENSE');tags.add('OPERATIONAL');}
  if(target?.screen_kind==='TRACKING'){tags.add('LIVE_STATE');tags.add('RESILIENCE');}
  if(['ACTION_SHEET','PANEL','DRAWER'].includes(target?.screen_kind)) tags.add('CONTEXTUAL');
  if(COMMERCE_MODULES.has(module)){tags.add('COMMERCE');tags.add('MERCHANDISING');}
  if(PROFESSIONAL_MODULES.has(module)){tags.add('PROFESSIONAL_SAAS');tags.add('WORKSPACE');}
  if((target?.state_contract?.conditional||[]).some((x)=>['OFFLINE','DEGRADED','STALE','SYNCING','CONFLICT'].includes(upper(x)))) tags.add('RESILIENCE');
  const semanticText=JSON.stringify({
    actions:target?.action_refs||[],queries:target?.query_refs||[],commands:target?.command_refs||[],events:target?.event_refs||[],
    capabilities:generationContext.capability_envelope?.capabilities||[],responsibilities:target?.role_boundary?.responsibilities||[]
  }).toUpperCase();
  const signals=[
    ['SEARCH',/SEARCH|QUERY|FILTER/],['FILTER',/FILTER|FACET/],['CART',/CART|BASKET/],['ADD_TO_CART',/ADD.?TO.?CART|ADD.?TO.?BASKET/],
    ['FAVORITE',/FAVOURITE|FAVORITE|SAVE/],['QUANTITY',/QUANTITY|QTY/],['IMAGE',/IMAGE|PHOTO|MEDIA|GALLERY/],['MAP',/MAP|ROUTE|GEO/],
    ['FORM',/FORM|INPUT|FIELD|SUBMIT/],['EDIT',/EDIT|UPDATE|MODIFY/],['APPROVAL',/APPROV|AUTHORIS|AUTHORIZ/],['AUTHORITY',/LOCK|PERMISSION|AUTHORITY|APPROV/],
    ['REORDER',/REORDER|SORT|DRAG/],['TRANSACTION',/PAY|TRANSACTION|CHECKOUT|SETTLEMENT/],['ORDER',/ORDER|FULFIL/],['AI',/\bAI\b|ASSISTANT|\bMODEL\b|\bCHAT\b/],
    ['REPEAT_ACTION',/QUEUE|LIST|BATCH|REPEAT/],['LOW_RISK_MUTATION',/FAVORITE|SAVE|PREFERENCE|CART|BASKET/],['CONTENT',/PRODUCT|ITEM|RECORD|CONTENT/],
  ];
  for(const [tag,rx] of signals) if(rx.test(semanticText)) tags.add(tag);
  if(tags.has('WEB')||tags.has('DESKTOP')) tags.add('RESPONSIVE');
  if(tags.has('MOBILE')||tags.has('TABLET')) tags.add('RESPONSIVE');
  if(tags.has('TOUCH')) tags.add('ACTION');
  if((target?.action_refs||[]).length) tags.add('ACTION');
  tags.add('ACCESSIBILITY');tags.add('VERIFICATION');tags.add('POLISH');tags.add('MOTION_SYSTEM');
  return {
    target_screen_id:target?.screen_id||generationContext.screen_context.target_screen_id,
    screen_kind:target?.screen_kind||null,module,role:target?.role_boundary?.role||null,
    platforms:uniq([...platformTags(generationContext)]),tags:uniq([...tags]),
    actions:uniq(target?.action_refs||[]),queries:uniq(target?.query_refs||[]),commands:uniq(target?.command_refs||[]),
    states:{required:uniq(target?.state_contract?.required||[]),conditional:uniq(target?.state_contract?.conditional||[])},
    capabilities:uniq((generationContext.capability_envelope?.capabilities||[]).filter((x)=>x.supported!==false).map((x)=>x.capability_id)),
  };
}

function matchesPlatform(pattern,signals){
  const ps=pattern.platforms||['ANY'];
  return ps.includes('ANY')||ps.some((x)=>signals.platforms.includes(x));
}
function patternSelection(pattern,signals){
  if(!matchesPlatform(pattern,signals)) return {selected:false,reason:'PLATFORM_NOT_APPLICABLE'};
  if((pattern.avoid_when||[]).some((x)=>signals.tags.includes(x))) return {selected:false,reason:'AVOID_CONDITION_PRESENT'};
  const requiredCaps=pattern.requires_capabilities||[];
  if(requiredCaps.length && !requiredCaps.every((x)=>signals.capabilities.includes(x))) return {selected:false,reason:'CAPABILITY_NOT_AVAILABLE'};
  const requiredAll=pattern.requires_all_tags||[];
  if(requiredAll.length && !requiredAll.every((x)=>signals.tags.includes(x))) return {selected:false,reason:'REQUIRED_CONTEXT_MISSING'};
  const requiredAny=pattern.requires_any_tags||[];
  if(requiredAny.length && !requiredAny.some((x)=>signals.tags.includes(x))) return {selected:false,reason:'REQUIRED_CONTEXT_MISSING'};
  const hits=(pattern.applicability_tags||[]).filter((x)=>signals.tags.includes(x));
  const universal=(pattern.applicability_tags||[]).includes('ANY_SCREEN');
  if(!hits.length&&!universal&&!requiredAll.length&&!requiredAny.length) return {selected:false,reason:'NO_CONTEXT_MATCH'};
  const score=(PRIORITY_WEIGHT[pattern.default_priority]||20)+(hits.length*8)+(matchesPlatform(pattern,signals)?4:0);
  return {selected:true,score,hits,priority:pattern.default_priority||'CONSIDER'};
}

function discoveryBrief({signals,sourceRegistry,policy}={}){
  const platform=signals.platforms.join(' ')||'multi-platform';
  const module=signals.module||'DIAL';
  const kind=signals.screen_kind||'screen';
  return {
    mode:policy.open_world_discovery?.mode||'VEKL_DISCOVERY_CANDIDATE_PLANE',
    authority:'NON_AUTHORITATIVE_DISCOVERY_EVIDENCE',
    admission_required_before_guidance:true,
    raw_external_code_to_provider_forbidden:true,
    search_queries:[
      `${platform} ${module} ${kind} modern interaction patterns 2026 accessibility reduced motion`,
      `${module} ${kind} shipped product UX patterns feedback navigation responsive motion`,
      `${platform} ${kind} platform native gestures adaptive layout state restoration performance`,
      `professional SaaS ${kind} interaction microinteractions information density recovery states`,
    ],
    source_classes:uniq((sourceRegistry.sources||[]).map((x)=>x.source_class)),
    desired_outputs:['new_pattern_candidates','anti_patterns','platform_updates','accessibility_updates','performance_findings','shipped_product_flow_evidence'],
    qualification_path:['DISCOVERED','TRIAGED','INVESTIGATING','QUALIFIED','ADMITTED'],
  };
}

function selectPatterns({registry,signals}={}){
  const selected=[];const rejected=[];
  for(const pattern of registry.patterns||[]){
    const decision=patternSelection(pattern,signals);
    if(decision.selected) selected.push({...clone(pattern),selection:{score:decision.score,hits:decision.hits,priority:decision.priority}});
    else rejected.push({pattern_id:pattern.pattern_id,reason:decision.reason});
  }
  selected.sort((a,b)=>b.selection.score-a.selection.score||a.pattern_id.localeCompare(b.pattern_id));
  return {selected,rejected};
}

function buildVisualPreflightRequirements(selected){
  const ids=new Set(selected.map((x)=>x.pattern_id));
  const requirements=[];
  if(ids.has('PATTERN_HORIZONTAL_CONTENT_RAIL')) requirements.push('Leave sufficient visual affordance and clipping/continuation cues for horizontal content rails where selected.');
  if(ids.has('PATTERN_SPATIAL_SHEET')) requirements.push('Keep secondary workflows visually separable so they can become contextual sheets without redesigning primary hierarchy.');
  if(ids.has('PATTERN_STICKY_CONTEXT_ACTION')||ids.has('PATTERN_DOCKED_ACTION_BAR')) requirements.push('Reserve a coherent action hierarchy that can support sticky/docked behavior without covering content.');
  if(ids.has('PATTERN_PRODUCT_GALLERY_ZOOM')) requirements.push('Make product imagery structurally important enough to support gallery/zoom inspection.');
  if(ids.has('PATTERN_MULTI_ZONE_SHELL')||ids.has('PATTERN_PERSISTENT_WORKSPACE_PANEL')) requirements.push('Use stable zones/panes rather than a single undifferentiated vertical column on large professional surfaces.');
  if(ids.has('PATTERN_RESPONSIVE_RECOMPOSITION')) requirements.push('Design responsive roles for sections; do not assume proportional shrinking.');
  if(ids.has('PATTERN_OFFLINE_DEGRADED_STATE')||ids.has('PATTERN_CONTEXTUAL_RECOVERY')) requirements.push('Leave clear state/recovery affordance locations that do not require a later visual rewrite.');
  return requirements;
}

export function compileInteractionDesignPreflight({repoDir,generationContext}={}){
  if(!repoDir) throw new Error('INTERACTION_PREFLIGHT_REQUIRES_REPO');
  const policy=loadRegistry(repoDir,'agent-system/registries/DESIGN_ACUITY_POLICY.json');
  const registry=loadRegistry(repoDir,'agent-system/registries/INTERACTION_MOTION_PATTERN_REGISTRY.json');
  const sources=loadRegistry(repoDir,'agent-system/registries/INTERACTION_MOTION_SOURCE_REGISTRY.json');
  const signals=deriveInteractionSignals({generationContext});
  const {selected,rejected}=selectPatterns({registry,signals});
  const required=selected.filter((x)=>x.default_priority==='REQUIRED');
  const strong=selected.filter((x)=>x.default_priority==='STRONG');
  const consider=selected.filter((x)=>!['REQUIRED','STRONG'].includes(x.default_priority));
  const artifact={
    schema_version:1,artifact_type:'InteractionDesignPreflight',artifact_id:`interaction-preflight:${signals.target_screen_id}`,status:'READY',
    generation_context_hash:generationContext.content_hash,policy_version:policy.policy_version,pattern_registry_version:registry.registry_version,source_registry_version:sources.registry_version,
    provenance:{generation_context_hash:generationContext.content_hash,design_acuity_policy_version:policy.policy_version,pattern_registry_version:registry.registry_version,source_registry_version:sources.registry_version},
    signals,required_considerations:required,strong_candidates:strong,additional_candidates:consider.slice(0,18),rejected_pattern_count:rejected.length,
    visual_preflight_requirements:buildVisualPreflightRequirements(selected),
    mandatory_acuity_dimensions:clone(policy.acuity_dimensions),motion_hierarchy:clone(policy.motion_hierarchy),
    structural_delta_policy:clone(policy.structural_delta_policy),
    open_world_discovery_brief:discoveryBrief({signals,sourceRegistry:sources,policy}),
    external_reference_policy:{use_mode:'REFERENCE_AND_INSPIRATION_ONLY',raw_code_or_screen_authority_forbidden:true,decision_ref:'DEC-039'},
  };
  artifact.content_hash=hashObject({...artifact,content_hash:null});
  return artifact;
}

export function compileInteractionMotionIntelligence({repoDir,generationContext,visualAuthority,preflight=null}={}){
  if(visualAuthority?.status!=='FROZEN') throw new Error('INTERACTION_INTELLIGENCE_REQUIRES_FROZEN_VISUAL_AUTHORITY');
  if(visualAuthority.generation_context_hash!==generationContext?.content_hash) throw new Error('INTERACTION_INTELLIGENCE_CONTEXT_MISMATCH');
  const policy=loadRegistry(repoDir,'agent-system/registries/DESIGN_ACUITY_POLICY.json');
  const pf=preflight||compileInteractionDesignPreflight({repoDir,generationContext});
  const all=[...(pf.required_considerations||[]),...(pf.strong_candidates||[]),...(pf.additional_candidates||[])];
  const families=uniq(all.map((x)=>x.family));
  const artifact={
    schema_version:1,artifact_type:'InteractionMotionIntelligence',artifact_id:`interaction-intelligence:${pf.signals.target_screen_id}`,status:'READY',
    generation_context_hash:generationContext.content_hash,visual_authority_hash:visualAuthority.content_hash,preflight_hash:pf.content_hash,
    provenance:{generation_context_hash:generationContext.content_hash,visual_authority_hash:visualAuthority.content_hash,interaction_design_preflight_hash:pf.content_hash},
    expert_role:'PRINCIPAL_PRODUCT_DESIGN_ENGINEER_AND_INTERACTION_MOTION_SPECIALIST',
    signals:clone(pf.signals),acuity_dimensions:clone(policy.acuity_dimensions),motion_hierarchy:clone(policy.motion_hierarchy),
    required_considerations:clone(pf.required_considerations),strong_candidates:clone(pf.strong_candidates),additional_candidates:clone(pf.additional_candidates),
    interaction_families_to_review:families,structural_delta_policy:clone(policy.structural_delta_policy),
    decision_contract:{
      every_candidate_requires_one_of:['ADOPT','ADAPT','REJECT','NO_EFFECT_NEEDED'],
      rationale_required:true,problem_solved_required:true,capability_binding_required_for_behavior:true,
      visual_delta_beyond_budget_requires:'RETURN_TO_VISUAL_RECONVERGENCE',
    },
    required_outputs:[
      'DesignAcuityAssessment','InteractionOpportunityMap','PatternDecisionSet','InteractionIntentMap','GestureMap','MotionHierarchyPlan','MotionSpec',
      'AdvancedComponentDecisionSet','ResponsiveInteractionPlan','StateBehaviorMatrix','StructuralDeltaDecision','InteractionRiskRegister','InteractionAcceptanceMatrix'
    ],
    open_world_discovery_brief:clone(pf.open_world_discovery_brief),
    reference_policy:{external_sources:'REFERENCE_AND_INSPIRATION_ONLY',copying_forbidden:true,raw_external_provider_input_forbidden:true},
  };
  artifact.content_hash=hashObject({...artifact,content_hash:null});
  return artifact;
}

export function validateInteractionArtifactAgainstIntelligence({intelligence,interactionArtifact}={}){
  const failures=[];
  if(!intelligence?.content_hash) failures.push('INTERACTION_INTELLIGENCE_REQUIRED');
  if(!interactionArtifact||typeof interactionArtifact!=='object') failures.push('INTERACTION_ARTIFACT_REQUIRED');
  const requiredOutputs=intelligence?.required_outputs||[];
  const keys={
    DesignAcuityAssessment:'design_acuity_assessment',InteractionOpportunityMap:'interaction_opportunity_map',PatternDecisionSet:'pattern_decision_set',
    InteractionIntentMap:'interaction_intent_map',GestureMap:'gesture_map',MotionHierarchyPlan:'motion_hierarchy_plan',MotionSpec:'motion_spec',
    AdvancedComponentDecisionSet:'advanced_component_decisions',ResponsiveInteractionPlan:'responsive_interaction_plan',StateBehaviorMatrix:'state_behavior_matrix',
    StructuralDeltaDecision:'structural_delta_decision',InteractionRiskRegister:'interaction_risk_register',InteractionAcceptanceMatrix:'interaction_acceptance_matrix'
  };
  for(const output of requiredOutputs){const key=keys[output];if(key && interactionArtifact?.[key]==null) failures.push(`MISSING_OUTPUT:${output}`);}
  const decisions=interactionArtifact?.pattern_decision_set||[];
  const expected=[...(intelligence?.required_considerations||[]),...(intelligence?.strong_candidates||[])].map((x)=>x.pattern_id);
  const byId=new Map(decisions.map((x)=>[x.pattern_id,x]));
  for(const id of expected){
    const row=byId.get(id);
    if(!row) failures.push(`PATTERN_DECISION_MISSING:${id}`);
    else if(!['ADOPT','ADAPT','REJECT','NO_EFFECT_NEEDED'].includes(row.decision)) failures.push(`PATTERN_DECISION_INVALID:${id}`);
    else if(!String(row.rationale||'').trim()) failures.push(`PATTERN_RATIONALE_REQUIRED:${id}`);
  }
  if(interactionArtifact?.structural_delta_decision?.classification==='BEYOND_BOUNDED_DELTA' && interactionArtifact?.structural_delta_decision?.action!=='RETURN_TO_VISUAL_RECONVERGENCE') failures.push('UNSAFE_STRUCTURAL_DELTA');
  return {ok:failures.length===0,failures:uniq(failures),intelligence_hash:intelligence?.content_hash||null};
}
