import fs from 'node:fs';
import { resolveControlPath } from './state-store.mjs';
import { callOpenRouterScreenCompiler } from './screen-factory-openrouter-generator.mjs';
import {
  PREMIUM_VISUAL_STANDARD_VERSION, PREMIUM_VISUAL_TRAINING_PROMPT,
  PREMIUM_ART_DIRECTOR_RUBRIC, PREMIUM_ART_DIRECTOR_PASS_SCORE,
} from './screen-factory-premium-visual-standard.mjs';
import {
  assertTaskContractReady, experiencePolicy, validateDesignPacket,
  SCREEN_FACTORY_DESIGN_POLICY, SCREEN_FACTORY_DESIGN_SYSTEM,
} from './screen-factory-design-policy.mjs';

export const SCREEN_GENERATOR_POLICY='OPENROUTER_PREMIUM_MULTI_MODEL_ART_DIRECTION_REV3_FAIL_CLOSED';
const REQUIRED_STATES=['LOADING','POPULATED','EMPTY','PARTIAL','VALIDATION_ERROR','PERMISSION_DENIED','STEP_UP_REQUIRED','STALE','SOURCE_UNAVAILABLE','OFFLINE_READ','OFFLINE_QUEUED','CONFLICT','RECONCILIATION_REQUIRED','SUCCESS','CANCELLED','ARCHIVED/SUPERSEDED'];
const VALID_CRITICAL_DEFECTS=new Set(['HIERARCHY_COLLAPSE','DENSITY_OVERLOAD','BRAND_DRIFT','PLATFORM_BREAK','TEMPLATE_GENERIC','FUNCTIONAL_MISMATCH','ACCESSIBILITY_BLOCKER']);
function compositionRecipe(task){
  const title=String(task?.title||'').toLowerCase();
  if(/home|today|dashboard/.test(title)) return 'REFERENCE-CALIBRATED HOME: compact identity/greeting header; one meaningful health-focused hero using refined inline SVG or abstract illustration rather than an empty gradient strip; 3-4 quick actions in a balanced 2x2 or compact row; one highlighted upcoming/priority item; one recent result/status item; optional compact secondary actions; quiet 5-item bottom navigation is allowed even when routes overlap quick actions. Aim for about 1.0-1.2 viewports.';
  if(/provider|find care|need care/.test(title)) return 'CARE DISCOVERY: compact app bar; search/filter; concise segmented choice only when justified; 3-5 rich provider/facility rows with avatar/illustration slot, specialty/location metadata and one clear action per row; no dashboard chrome.';
  if(/appointment|slot|booking|queue|waiting/.test(title)) return 'APPOINTMENT/JOURNEY: foreground the current decision or next appointment; keep timing/status highly scannable; show only the next useful actions; secondary history/details use disclosure or routes.';
  if(/medicine|prescription|pharmacy|fulfil/.test(title)) return 'MEDICINE: foreground medicine/order identity, status and next action; use compact cards/rows; safety guidance is supportive and visually secondary; do not turn the page into a stock/ERP table.';
  if(/claim|benefit|medical aid|payment|shortfall|pre-author/.test(title)) return 'COVERAGE/FINANCE: summary first, status and member action second, focused detail thereafter; never expose ledger/dashboard density; use calm semantic status and progressive disclosure.';
  if(/result|lab|imaging|document|timeline|record/.test(title)) return 'RECORD/RESULT: concise summary first, 2-4 meaningful recent items/metrics, obvious focused-detail routing, export only where contracted; avoid dumping the full record into the initial view.';
  if(/profile|privacy|consent|notification|family|proxy|support|emergency/.test(title)) return 'ACCOUNT/SUPPORT: strong grouping, calm rows and one clear hierarchy; identity or safety context gets one focal treatment; avoid empty administrative chrome and repetitive equal cards.';
  return 'Choose one clear focal composition appropriate to the task; keep 3-5 major regions maximum, calm hierarchy, premium component finish and modest viewport depth.';
}
const REVIEW_CALIBRATION='CALIBRATION: restrained gradients ARE allowed for hero/priority surfaces; 22px is inside the 17-22px section-heading range; 2, 3 or 4 quick-action arrangements may be valid if spacing/touch targets/hierarchy fit; bottom navigation MAY overlap routes exposed by quick actions and that is not inherently a defect; current populated markup does not need to visibly render loading/empty states when state_map defines them; never invent visual requirements such as a mandatory teal border unless the benchmark or contract explicitly says so. Critical defects must use only these codes: HIERARCHY_COLLAPSE, DENSITY_OVERLOAD, BRAND_DRIFT, PLATFORM_BREAK, TEMPLATE_GENERIC, FUNCTIONAL_MISMATCH, ACCESSIBILITY_BLOCKER. Put all other observations in corrections, not critical_defects.';

function extractJson(text){
  const s=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(s)}catch{}
  const a=s.indexOf('{'),b=s.lastIndexOf('}');
  if(a<0||b<=a)throw new Error('generator returned no JSON object: '+s.slice(0,800));
  return JSON.parse(s.slice(a,b+1));
}
function workspace(root){const dir=resolveControlPath('screen-factory/model-workspace',root);fs.mkdirSync(dir,{recursive:true,mode:0o700});return dir;}
function contractShape(task){return {screen_id:task.screen_id,title:task.title,business_unit:task.business_unit,platform:task.platform,roles:task.roles,purpose:task.purpose,features:task.features,interaction:task.interaction,next_routes:task.next_routes,required_variants:task.required_variants,archetype:task.archetype,evidence_basis:task.evidence_basis,ux_profile:task.ux_profile,detail_policy:task.detail_policy,export_policy:task.export_policy};}
function retryFeedback(task){return Number(task.generation_attempts||0)>1&&String(task.last_error||'').trim()?`\nRETRY_FEEDBACK: retry ${task.generation_attempts}; prior deterministic failure: ${String(task.last_error).slice(0,1200)}. Fix it without weakening the contract or hiding required capability.`:'';}

function implementationPrompt(task){
  assertTaskContractReady(task); const policy=experiencePolicy(task);
  return `You are producing ONE Dial Health premium screen implementation packet as JSON only.${retryFeedback(task)}\nVISUAL_STANDARD_VERSION: ${PREMIUM_VISUAL_STANDARD_VERSION}\n${PREMIUM_VISUAL_TRAINING_PROMPT}\nSCREEN_CONTRACT: ${JSON.stringify(contractShape(task))}\nCOMPOSITION_RECIPE: ${compositionRecipe(task)}\nPOLICY: ${JSON.stringify(policy)}\nDESIGN_SYSTEM: ${SCREEN_FACTORY_DESIGN_SYSTEM}.\nFUNCTIONAL: semantic HTML only; no script/iframe/external URL/assets/fonts/inline handlers. Inline SVG icons are allowed. Every button/link has data-action and every meaningful region has data-ui/data-feature-id. No cosmetic controls. Every action maps to interaction_map; every authoritative value maps to data_bindings. For My Health the outer app/main root MUST include class="dh-screen" so the canonical premium component system is applied. Consumer My Health screens must not use HTML tables or emoji iconography.\nVIEWPORT-FIRST: compose for the real target viewport before writing markup. Top-level My Health should normally fit in <=1.20 viewport heights; focused detail/forms <=1.60. Use routes/disclosure instead of long first-load pages.\nEXPERIENCE_PROFILE: For My Health set progressive_disclosure=true and information_density=LOW_TO_MODERATE.\nDATA: never invent real-looking member/provider names, dates, diagnoses, prices, claim states, results or entitlements. Use generic data-bound labels.\nRECORDS: record/transaction items open complete focused detail routes/sheets. Export/download/share appears only where the current contract permits/requires it.\nEVIDENCE: render documented features only. Necessary missing features go in additional_features with feature_id,name,rationale,source_gap,integration_plan{domain_owner,data,api_or_service,events,security_privacy,audit,qa,rollout}.\nRETURN EXACT KEYS: screen_id,title,platform,semantic_html,css,experience_profile,interaction_map,data_bindings,state_map,feature_coverage,evidence_map,additional_features,component_contracts. All maps except experience_profile are arrays. state_map covers ${REQUIRED_STATES.join(', ')}. Use the canonical .dh-* component classes where useful and add screen-specific CSS only where it improves the composition.`;
}

function reviewPrompt(task,packet){
  return `Act as an independent premium mobile-health art director. Score the supplied implementation packet against this benchmark. Do not rewrite product truth.\nVISUAL_STANDARD_VERSION: ${PREMIUM_VISUAL_STANDARD_VERSION}\n${PREMIUM_VISUAL_TRAINING_PROMPT}\nSCREEN_CONTRACT: ${JSON.stringify(contractShape(task))}\nCOMPOSITION_RECIPE: ${compositionRecipe(task)}\n${REVIEW_CALIBRATION}\nRUBRIC_WEIGHTS: ${JSON.stringify(PREMIUM_ART_DIRECTOR_RUBRIC)}\nPASS_THRESHOLD: ${PREMIUM_ART_DIRECTOR_PASS_SCORE}.\nDRAFT_PACKET: ${JSON.stringify(packet)}\nReturn JSON only with exact keys: verdict,score,critical_defects,strengths,corrections,density_assessment,viewport_assessment,reference_quality_assessment. verdict is PASS or REPAIR. score is 0-100. critical_defects,strengths,corrections are arrays of concise strings. reference_quality_assessment is MATCH or BELOW. A template-like, crowded, overlong, admin-like, browser-default, visually flat or brand-incoherent consumer screen must be REPAIR even if functionally complete.`;
}

function repairPrompt(task,packet,review){
  return `Produce a repaired FINAL implementation packet for this Dial Health screen. Keep all canonical functionality and evidence, but apply every valid art-director correction. Return the implementation packet JSON only.\nVISUAL_STANDARD_VERSION: ${PREMIUM_VISUAL_STANDARD_VERSION}\n${PREMIUM_VISUAL_TRAINING_PROMPT}\nSCREEN_CONTRACT: ${JSON.stringify(contractShape(task))}\nCOMPOSITION_RECIPE: ${compositionRecipe(task)}\n${REVIEW_CALIBRATION}\nART_DIRECTOR_REVIEW: ${JSON.stringify(review)}\nDRAFT_PACKET: ${JSON.stringify(packet)}\nThe final must look deliberately designed, compact, premium and platform-native. Do not merely change colours; fix hierarchy, spacing, density, component composition and viewport depth. RETURN EXACT KEYS: screen_id,title,platform,semantic_html,css,experience_profile,interaction_map,data_bindings,state_map,feature_coverage,evidence_map,additional_features,component_contracts.`;
}

function validate(packet,task){
  if(String(packet?.screen_id)!==String(task.screen_id)||String(packet?.platform)!==String(task.platform))throw new Error('generator packet identity mismatch');
  if(!String(packet.semantic_html||'').trim()||!String(packet.css||'').trim())throw new Error('generator semantic_html/css missing');
  validateDesignPacket(packet,task); return packet;
}
function normalizeReview(review){
  const score=Math.max(0,Math.min(100,Number(review?.score)||0));
  const rawCritical=Array.isArray(review?.critical_defects)?review.critical_defects.map((x)=>String(x).trim()).filter(Boolean):[];
  const critical=rawCritical.filter((x)=>VALID_CRITICAL_DEFECTS.has(x));
  const discarded=rawCritical.filter((x)=>!VALID_CRITICAL_DEFECTS.has(x));
  const corrections=Array.isArray(review?.corrections)?review.corrections.map(String):[];
  if(discarded.length) corrections.push(...discarded.map((x)=>`Non-canonical critic note: ${x}`));
  const verdict=String(review?.verdict||'REPAIR').toUpperCase()==='PASS'?'PASS':'REPAIR';
  return {...review,score,raw_critical_defects:rawCritical,critical_defects:critical,discarded_critical_notes:discarded,corrections,verdict};
}
function reviewPass(review){return review.verdict==='PASS'&&review.score>=PREMIUM_ART_DIRECTOR_PASS_SCORE&&review.critical_defects.length===0&&String(review.reference_quality_assessment||'').toUpperCase()==='MATCH';}

export async function compileScreenPacket({task,root,modelCaller=callOpenRouterScreenCompiler}={}){
  if(!task?.screen_id)throw new Error('screen task required');
  assertTaskContractReady(task); workspace(root); const key=task.task_id||`${task.screen_id}::${task.platform}`;
  const lead=await modelCaller({content:implementationPrompt(task),root,taskKey:key,role:'lead_designer',maxOutputTokens:18000});
  let packet=validate(extractJson(lead.response),task);
  let reviewTurn=await modelCaller({content:reviewPrompt(task,packet),root,taskKey:key,role:'art_director',excludeModels:[lead.model],maxOutputTokens:2200});
  let review=normalizeReview(extractJson(reviewTurn.response));
  const provenance={lead_model:lead.model,art_director_model:reviewTurn.model,initial_review:review,repaired:false,final_review:null,visual_standard:PREMIUM_VISUAL_STANDARD_VERSION};
  if(!reviewPass(review)){
    const repair=await modelCaller({content:repairPrompt(task,packet,review),root,taskKey:key,role:'repair_polisher',excludeModels:[reviewTurn.model],maxOutputTokens:18000});
    packet=validate(extractJson(repair.response),task); provenance.repaired=true; provenance.repair_model=repair.model;
    const finalTurn=await modelCaller({content:reviewPrompt(task,packet),root,taskKey:key,role:'final_auditor',excludeModels:[repair.model],maxOutputTokens:2200});
    review=normalizeReview(extractJson(finalTurn.response)); provenance.final_review=review; provenance.final_auditor_model=finalTurn.model;
    if(!reviewPass(review)) throw new Error(`VISUAL_QUALITY_REVIEW_FAILED score=${review.score} defects=${review.critical_defects.join('; ').slice(0,700)} corrections=${review.corrections.join('; ').slice(0,700)}`);
  }
  return {packet,runtime:lead.runtime,model:provenance.repair_model||lead.model,policy:SCREEN_GENERATOR_POLICY,design_policy:SCREEN_FACTORY_DESIGN_POLICY,model_selection:lead.selection,quality_review:provenance};
}
