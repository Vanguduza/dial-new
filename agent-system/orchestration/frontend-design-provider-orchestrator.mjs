import { hashObject } from './knowledge-graph-core.mjs';
import { buildStitchVisualProductionPacket, buildInteractionMotionEnrichmentPacket } from './frontend-generation-architecture.mjs';
import { compileInteractionDesignPreflight, compileInteractionMotionIntelligence } from './interaction-motion-intelligence.mjs';
import { compileFrontendDesignSynthesis, renderDesignSynthesisPromptBlock } from './frontend-design-synthesis.mjs';
import { loadRegistry } from './knowledge-graph-core.mjs';
import { buildDesignCandidateManifest, quarantineDesignArtifact } from './design-candidate-admission.mjs';
import { normalizeDesignCandidate } from './frontend-design-normalizer.mjs';

export const FIGMA_AUTHORITY_STATES=Object.freeze(['NON_AUTHORITATIVE_CANDIDATE','REFINEMENT_SOURCE','PROMOTION_PENDING','PROMOTED_VISUAL_AUTHORITY']);

export function selectCanonicalFrontendDesignProvider({ repoDir, requestedProvider = null, explicitProviderRequest = false, providerHealth = {} } = {}) {
  if (!repoDir) throw new Error('FRONTEND_PROVIDER_SELECTION_REQUIRES_REPO');
  const policy = loadRegistry(repoDir, 'agent-system/registries/DESIGN_PROVIDER_POLICY.json');
  const requested = requestedProvider || policy.automatic_design_provider || policy.primary_design_provider;
  let result;
  if (requested === 'figma') {
    result = !explicitProviderRequest
      ? { ok: false, selected: null, reason: 'FIGMA_EXPLICIT_INVOCATION_REQUIRED', automatic_fallback: false }
      : { ok: true, selected: 'figma', reason: 'EXPLICIT_AUTHORIZED_REQUEST', automatic_fallback: false };
  } else if (requested !== 'google-stitch') {
    result = { ok: false, selected: null, reason: `FRONTEND_PROVIDER_NOT_ALLOWED:${requested}`, automatic_fallback: false };
  } else {
    const health = providerHealth['google-stitch'] || providerHealth.stitch || 'UNKNOWN';
    result = ['UNAVAILABLE','DISABLED','AUTH_REQUIRED','CAPACITY_LIMITED'].includes(String(health).toUpperCase())
      ? { ok: false, selected: null, reason: `STITCH_${String(health).toUpperCase()}`, automatic_fallback: false, outage_behavior: 'WAIT_RETRY_OR_REPORT_UNAVAILABLE' }
      : { ok: true, selected: 'google-stitch', reason: requestedProvider ? 'EXPLICIT_STITCH_REQUEST' : 'CANONICAL_AUTOMATIC_PROVIDER', automatic_fallback: false };
  }
  return { ...result, selection_hash: hashObject({ requested, explicitProviderRequest, providerHealth, result }) };
}

export function buildCanonicalStitchVisualPacket({ repoDir, fdep, brief, qualityPacket = null, blindReferenceMode = false } = {}) {
  if (!repoDir) throw new Error('STITCH_VISUAL_PACKET_REQUIRES_REPO');
  if (!fdep?.frontend_generation_context) throw new Error('FDEP_FRONTEND_GENERATION_CONTEXT_REQUIRED');
  const interactionPreflight=fdep.interaction_design_preflight||compileInteractionDesignPreflight({repoDir,generationContext:fdep.frontend_generation_context});
  const designSynthesis=compileFrontendDesignSynthesis({repoDir,generationContext:fdep.frontend_generation_context});
  return buildStitchVisualProductionPacket({ generationContext: fdep.frontend_generation_context, designBrief: brief, qualityPacket, interactionPreflight, designSynthesis, blindReferenceMode });
}

export function renderStitchVisualProductionPrompt({ packet } = {}) {
  if (!packet?.packet_hash) throw new Error('STITCH_VISUAL_PACKET_REQUIRED');
  const truth = (packet.verified_truth || []).map((x) => `${x.path || x.fact_id}=${JSON.stringify(x.value)} [${x.source_id}]`).join('\n');
  const archetypes = (packet.design_authority?.applicable_archetypes || []).map((x) => `${x.archetype_id}:${x.reuse_mode || 'GUIDANCE'}`).join(', ');
  const preflight=packet.interaction_design_preflight||null;
  const interactionReadiness=(preflight?.visual_preflight_requirements||[]).join('\n- ');
  const priorityPatterns=[...(preflight?.required_considerations||[]),...(preflight?.strong_candidates||[])].slice(0,16).map((x)=>`${x.pattern_id}:${x.problem_solved}`).join('\n');
  const semantic=packet.feature_context?.semantic_envelope||null;
  const brand=packet.design_authority?.domain_brand_authority||null;
  const synthesisBlock=renderDesignSynthesisPromptBlock(packet.design_synthesis||{});
  return [
    'DIAL — STITCH VISUAL GENERATION PASS',
    `Screen role: ${packet.target_screen?.role_boundary?.role || 'DOMAIN_TASK_SURFACE'}.`,
    `Business unit: ${packet.business_unit_context?.module}.`,
    `Target application: ${packet.platform_context?.target_application_id || 'UNRESOLVED'}.`,
    `Applications/platforms: ${(packet.platform_context?.applications || []).map((x) => `${x.application_id}[${(x.platform_targets || []).join('/')}]`).join(', ')}.`,
    `Product positioning: ${packet.business_unit_context?.product_positioning || 'authority-defined'}.`,
    `Category scope: ${(packet.business_unit_context?.category_scope || []).join(', ')}.`,
    `Shopping mode: ${packet.business_unit_context?.shopping_mode?.required_on_home ? 'REQUIRED on Home; '+packet.business_unit_context.shopping_mode.purpose : 'authority-defined'}.`,
    `Supported interaction behavior (internal labels; do not render these labels): ${(packet.feature_context?.actions || []).join(', ')}.`,
    `Applicable design archetypes: ${archetypes || 'none; use governed product profile'}.`,
    `Reference policy: ${packet.reference_policy}.`,
    synthesisBlock,
    'DOMAIN BRAND AUTHORITY:',
    brand ? JSON.stringify(brand) : '(No module-specific brand override; use governed product profile.)',
    semantic?.product_scope_statement ? `PRODUCT SCOPE: ${semantic.product_scope_statement}` : '',
    semantic?.freshness_positioning ? `FRESHNESS POSITIONING: ${semantic.freshness_positioning}` : '',
    'VERIFIED FACTS (only these supplied literals may be stated as factual):',
    truth || '(No runtime literals supplied; omit unknown values rather than inventing them.)',
    'SCREEN ROLE BOUNDARIES:',
    `Responsibilities: ${(packet.target_screen?.role_boundary?.responsibilities || []).join(', ')}.`,
    `Prohibited: ${(packet.target_screen?.role_boundary?.prohibited_responsibilities || []).join(', ')}.`,
    'INTERACTION-READINESS PREFLIGHT — DESIGN CONSTRAINT ONLY, NEVER RENDER PREFLIGHT/STATE-SIMULATOR UI (shape composition so behavior remains possible):',
    interactionReadiness ? `- ${interactionReadiness}` : '(No special structural readiness requirement beyond the screen/state contract.)',
    'HIGH-PRIORITY INTERACTION KNOWLEDGE FOR VISUAL READINESS:',
    priorityPatterns || '(none)',
    ...packet.instructions,
    'TRUTH CLAIM CONTRACT: embed a non-executable <script id="dial-visual-truth-claims" type="application/json"> containing {"claims":[...]} where every displayed runtime/business factual literal is listed as {path,value,display_text}. If there are no displayed factual literals, emit {"claims":[]}. Creative labels/headlines without factual claims are not claims. Never omit a displayed price, stock quantity, merchant/store identity, location, ETA/time slot, order ID, discount/savings percentage, member count, balance, entitlement, maturity date or operational status from this contract.',
  ].filter(Boolean).join('\n');
}

export function buildCanonicalInteractionMotionPacket({ repoDir, fdep, visualAuthority } = {}) {
  if (!repoDir) throw new Error('INTERACTION_MOTION_PACKET_REQUIRES_REPO');
  if (!fdep?.frontend_generation_context) throw new Error('FDEP_FRONTEND_GENERATION_CONTEXT_REQUIRED');
  const intelligence=compileInteractionMotionIntelligence({repoDir,generationContext:fdep.frontend_generation_context,visualAuthority,preflight:fdep.interaction_design_preflight||null});
  return buildInteractionMotionEnrichmentPacket({ generationContext: fdep.frontend_generation_context, visualAuthority, intelligence });
}

export function renderInteractionMotionPrompt({ packet } = {}) {
  if (!packet?.packet_hash) throw new Error('INTERACTION_MOTION_PACKET_REQUIRED');
  const patterns=(packet.pattern_candidates||[]).map((x)=>`${x.pattern_id} | ${x.family} | ${x.priority} | problem=${x.problem_solved}`).join('\n');
  const dimensions=(packet.design_acuity_dimensions||[]).map((x)=>`${x.dimension_id}: ${x.question}`).join('\n');
  return [
    'DIAL — EXPERT INTERACTION, MOTION & PRODUCT-POLISH PASS',
    `Target screen: ${packet.target_screen_id}.`,
    `Expert role: ${packet.expert_role}.`,
    'The approved visual identity is frozen, but bounded interaction-driven structural improvements are allowed by the supplied StructuralDeltaPolicy.',
    `Preserve: ${(packet.preserve || []).join(', ')}.`,
    'DESIGN ACUITY REVIEW DIMENSIONS:', dimensions||'(none)',
    'CONTEXTUALLY SELECTED PATTERNS TO CONSIDER:', patterns||'(none)',
    `Interaction families to review: ${(packet.interaction_families_to_review||[]).join(', ')}.`,
    `Allowed domain actions: ${(packet.capability_envelope?.allowed_interaction_actions || []).join(', ')}.`,
    `Supported capabilities: ${(packet.capability_envelope?.capabilities || []).filter((x) => x.supported).map((x) => x.capability_id).join(', ')}.`,
    'Do not mechanically apply the library. For every required/strong pattern decide ADOPT, ADAPT, REJECT or NO_EFFECT_NEEDED and explain why.',
    'Improve the screen like a principal product design engineer: interaction clarity, responsive recomposition, professional SaaS ergonomics, feedback, spatial continuity, edge states, native behavior, accessibility and performance all matter.',
    'If a necessary improvement exceeds the bounded structural delta, return RETURN_TO_VISUAL_RECONVERGENCE instead of silently redesigning.',
    ...packet.rules,
    `Required outputs: ${(packet.required_outputs || []).join(', ')}.`,
    'Embed the structured outputs in the generated HTML as JSON in a script tag with id="dial-interaction-contract" and type="application/json" so DIAL can validate the design decision record.',
  ].join('\n');
}

export function buildInteractionAcceptanceMatrix({ interactionArtifact = {}, checks = {}, requiredChecks = null } = {}) {
  const required = requiredChecks || [
    'design_acuity_review_complete','pattern_decisions_complete','no_dead_controls','capability_backed','purposeful_motion','motion_hierarchy_coherent',
    'touch_targets','keyboard_and_focus_where_relevant','accessibility_semantics','reduced_motion','performance_budget','state_restoration',
    'gesture_conflicts_clear','interruptible_transitions','responsive_recomposition','edge_states_covered','platform_native_behavior',
    'optical_polish_reviewed','structural_delta_within_budget','external_reference_non_authority'
  ];
  const rows = required.map((id) => ({ check_id: id, passed: checks[id] === true, evidence_ref: checks[`${id}_evidence_ref`] || null }));
  const failed = rows.filter((x) => !x.passed).map((x) => x.check_id);
  const artifact = { schema_version: 2, artifact_type: 'InteractionAcceptanceMatrix', status: failed.length ? 'REJECTED' : 'PASSED', passed: failed.length === 0, rows, failures: failed, interaction_artifact_hash: interactionArtifact.content_hash || interactionArtifact.response_hash || null };
  artifact.content_hash = hashObject({ ...artifact, content_hash: null });
  return artifact;
}


export function providerPromptFromDesignBrief({brief,fdep}={}){
  if(!brief||!fdep) throw new Error('provider design brief and FDEP required');
  const surfaces=(fdep.surface_manifest?.surfaces||[]).map((x)=>x.surface_id).join(', ');
  const states=(fdep.surface_state_matrix?.surfaces||[]).flatMap((x)=>x.states.filter((s)=>String(s.requirement).startsWith('REQUIRED')).map((s)=>`${x.surface_id}:${s.state_id}`)).join(', ');
  return [
    'DIAL bounded frontend design task. Provider output is a non-authoritative candidate.',
    `Execution mode: ${fdep.presentation_decision?.execution_mode}.`,
    `Renderer target: ${fdep.presentation_decision?.renderer_id}.`,
    `Archetype: ${fdep.presentation_decision?.archetype_id}.`,
    `Pattern policy selection: ${fdep.presentation_decision?.pattern_id}.`,
    `Surfaces: ${surfaces||'authority-defined'}.`,
    `Canonical screen graph context: ${fdep.frontend_generation_context?.content_hash || 'legacy/unresolved'}.`,
    `Required whole-surface states: ${states||'see SurfaceStateMatrix'}.`,
    'Do not invent product truth, prices, permissions, domain rules, security policy, tokens, or component identities.',
    'Preserve approved visual authority exactly where the packet declares CANONICAL_REFERENCE.',
    `Design brief hash: ${brief.content_hash}. FDEP hash: ${fdep.content_hash}.`,
  ].join('\\n');
}

export function bindProviderCandidate({repoDir,providerId,taskId,unitLineageId,unitRevisionHash,rawContent,screenRefs=[],fdep,brief,candidateSemantics={}}={}){
  if(!fdep||!brief) throw new Error('provider candidate requires FDEP and DesignBriefBundle');
  const quarantine=quarantineDesignArtifact({content:rawContent,mimeType:'text/html'});
  if(!quarantine.ok) return {ok:false,stage:'QUARANTINE',quarantine};
  const manifest=buildDesignCandidateManifest({taskId,providerId,unitLineageId,unitRevisionHash,designAuthorityProjectionHash:fdep.visual_reference_spec?.content_hash||'SYSTEM_STANDARD',rawContent,quarantine,screenRefs,fdepHash:fdep.content_hash,designBriefHash:brief.content_hash,changeBudgetHash:fdep.change_budget?.content_hash||null,presentationDecisionHash:fdep.presentation_decision?.content_hash||null,vrdeHash:fdep.visual_render_determinism_envelope?.content_hash||null});
  const normalization=normalizeDesignCandidate({repoDir,candidate:candidateSemantics,fdep});
  return {ok:normalization.status==='NORMALIZED',stage:normalization.status==='NORMALIZED'?'NORMALIZED':'REJECTED',quarantine,manifest,normalization};
}

export function createFigmaCandidateState({taskId,fileRef,nodeRefs=[],fdep,previous=null,action='CREATE_CANDIDATE',authorityApprovalRef=null}={}){
  if(!fdep) throw new Error('Figma state requires FDEP');
  const transitions={
    CREATE_CANDIDATE:['NON_AUTHORITATIVE_CANDIDATE'],
    MARK_REFINEMENT_SOURCE:['REFINEMENT_SOURCE'],
    REQUEST_PROMOTION:['PROMOTION_PENDING'],
    PROMOTE:['PROMOTED_VISUAL_AUTHORITY'],
  };
  const target=(transitions[action]||[])[0]; if(!target) throw new Error(`unknown Figma action: ${action}`);
  const prev=previous?.authority_state||null;
  if(action==='PROMOTE' && prev!=='PROMOTION_PENDING') throw new Error('FIGMA_PROMOTION_REQUIRES_PENDING_STATE');if(action==='PROMOTE'&&!authorityApprovalRef)throw new Error('FIGMA_PROMOTION_REQUIRES_AUTHORITY_APPROVAL');
  const artifact={schema_version:1,artifact_type:'FigmaDesignCandidateState',artifact_id:`figma:${taskId}`,task_id:taskId,file_ref:fileRef||null,node_refs:[...new Set(nodeRefs)].sort(),authority_state:target,previous_authority_state:prev,fdep_hash:fdep.content_hash,presentation_decision_hash:fdep.presentation_decision?.content_hash||null,promotion_requires_owner_or_authorized_design_authority:target==='PROMOTED_VISUAL_AUTHORITY',authority_approval_ref:target==='PROMOTED_VISUAL_AUTHORITY'?authorityApprovalRef:null,reverse_authority_flow_forbidden:true,status:target,provenance:{action,previous_content_hash:previous?.content_hash||null}};
  artifact.content_hash=hashObject({...artifact,content_hash:null}); return artifact;
}
