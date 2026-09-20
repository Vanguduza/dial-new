import { hashObject, loadRegistry, registryHash } from './knowledge-graph-core.mjs';
import { sanitizeAndClassifyProviderInput } from './donor-egress-guard.mjs';
import { buildScreenFeatureProjection, SCREEN_FEATURE_GRAPH_REF, SCREEN_REGISTRY_REF } from './screen-feature-graph.mjs';
import { compileFrontendGenerationContext, resolveFrontendTargetScreenId, FRONTEND_GENERATION_REFS } from './frontend-generation-architecture.mjs';

export const FRONTEND_INTEGRATION_VERSION = 'dial-frontend-product-experience-1.1';

const REGISTRIES = Object.freeze({
  profiles: 'agent-system/registries/FRONTEND_PRODUCT_PROFILE_REGISTRY.json',
  tokens: 'agent-system/registries/FRONTEND_TOKEN_REGISTRY.json',
  components: 'agent-system/registries/FRONTEND_COMPONENT_REGISTRY.json',
  archetypes: 'agent-system/registries/FRONTEND_ARCHETYPE_REGISTRY.json',
  patterns: 'agent-system/registries/FRONTEND_PATTERN_POLICY.json',
  renderers: 'agent-system/registries/FRONTEND_RENDERER_POLICY.json',
  templates: 'agent-system/registries/FRONTEND_TEMPLATE_REGISTRY.json',
  visualDeterminism: 'agent-system/registries/FRONTEND_VISUAL_DETERMINISM_POLICY.json',
  schemas: 'agent-system/registries/FRONTEND_CONTRACT_SCHEMA_REGISTRY.json',
  screens: SCREEN_REGISTRY_REF,
  screenFeatureGraph: SCREEN_FEATURE_GRAPH_REF,
  generationPolicy: FRONTEND_GENERATION_REFS.policy,
  truthSources: FRONTEND_GENERATION_REFS.truthSources,
  designAcuity: 'agent-system/registries/DESIGN_ACUITY_POLICY.json',
  interactionMotionPatterns: 'agent-system/registries/INTERACTION_MOTION_PATTERN_REGISTRY.json',
  interactionMotionSources: 'agent-system/registries/INTERACTION_MOTION_SOURCE_REGISTRY.json',
  domainSemantics: 'agent-system/registries/FRONTEND_DOMAIN_SEMANTIC_REGISTRY.json',
});

export const SURFACE_STATE_IDS = Object.freeze([
  'READY','LOADING','EMPTY','PARTIAL','ERROR','OFFLINE','STALE','PERMISSION_DENIED',
  'SYNCING','CONFLICT','DEGRADED','SUCCESS',
]);

function uniq(values) { return [...new Set((values || []).filter(Boolean).map(String))].sort(); }
function upper(value) { return String(value || '').toUpperCase(); }
function asRows(value) { return Array.isArray(value) ? value : value ? [value] : []; }
function cleanId(value) { return String(value || '').replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '') || 'surface'; }
function merge(base, overlay) {
  if (Array.isArray(base) || Array.isArray(overlay)) return overlay === undefined ? base : overlay;
  if (!base || typeof base !== 'object') return overlay === undefined ? base : overlay;
  if (!overlay || typeof overlay !== 'object') return overlay === undefined ? base : overlay;
  const out = { ...base };
  for (const [k,v] of Object.entries(overlay)) out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) ? merge(base[k], v) : v;
  return out;
}

export function frontendRegistryHashes(repoDir) {
  return Object.fromEntries(Object.entries(REGISTRIES).map(([id, rel]) => [id, { rel, hash: registryHash(repoDir, rel) }]));
}

function chooseProfileId({ unit, featureRecord }) {
  const explicit = featureRecord?.product_design_profile_id || featureRecord?.frontend_profile_id || unit?.product_design_profile_id;
  if (explicit) return explicit;
  const text = upper([featureRecord?.module, featureRecord?.feature_id, featureRecord?.app_family, ...(unit?.feature_ids || [])].join(' '));
  if (/GROC/.test(text)) return 'dial.groceries';
  if (/LAUNDRY/.test(text)) return 'dial.laundry';
  if (/VHUB|VEHICLE HUB|GARAGE/.test(text)) return 'dial.vhub';
  if (/ASSIST|ROADSIDE/.test(text)) return 'dial.assist';
  if (/PROJECT/.test(text)) return 'dial.projects';
  if (/FLEET/.test(text)) return 'dial.fleet';
  if (/HEALTH|CLINICAL|PHARMACY|HOSPITAL/.test(text)) return 'dial.health';
  if (/CORPORATE|HR|WMS|TREASURY/.test(text)) return 'dial.corporate';
  if (/GMPC|CAMPAIGN|PROMOTION/.test(text)) return 'dial.gmpc';
  if (/DKRF|KNOWLEDGE|RETRIEVAL/.test(text)) return 'dial.dkrf';
  if (/PLATFORM|COMMAND CENTRE|SUPPLIER OS|CUSTOMER 360/.test(text)) return 'dial.platform';
  if (/LOGISTICS|DELIVERY|DRIVER|COURIER/.test(text)) return 'dial.logistics';
  if (/CARE/.test(text)) return 'dial.care';
  if (/SPARE|PART|CATALOG|GTR|AUTO/.test(text)) return 'dial.spare';
  if (/TECH|REPAIR|SERVICE/.test(text)) return 'dial.tech';
  if (/HERMES|CONTROL|ORACLE|ADMIN/.test(text)) return 'dial.control';
  if (/\bVAN\b|ASSISTANT|WIZARD/.test(text)) return 'dial.van';
  return 'dial.global';
}

export function resolveProductDesignProfile({ repoDir, unit, featureRecord = null } = {}) {
  const registry = loadRegistry(repoDir, REGISTRIES.profiles, { profiles: [] });
  const rows = new Map((registry.profiles || []).map((p) => [p.profile_id, p]));
  const selectedId = chooseProfileId({ unit, featureRecord });
  const visited = new Set();
  function resolve(id) {
    if (visited.has(id)) throw new Error(`frontend profile inheritance cycle: ${id}`);
    const row = rows.get(id);
    if (!row) throw new Error(`frontend product profile missing: ${id}`);
    visited.add(id);
    let value = row.extends ? merge(resolve(row.extends), row) : { ...row };
    visited.delete(id);
    const add = value.pattern_allowlist_add || [];
    value.pattern_allowlist = uniq([...(value.pattern_allowlist || []), ...add]);
    delete value.pattern_allowlist_add;
    return value;
  }
  const profile = resolve(selectedId);
  const result = {
    schema_version: 1,
    artifact_type: 'ProductDesignProfile',
    artifact_id: selectedId,
    status: 'RESOLVED',
    registry_version: registry.registry_version,
    profile,
    provenance: { registry: REGISTRIES.profiles, source_profile_id: selectedId },
  };
  result.content_hash = hashObject({ ...result, content_hash: null });
  return result;
}

function surfaceRef(row, index, unit) {
  if (typeof row === 'string') return { surface_id: cleanId(row), source_ref: row, source: 'FRC_SURFACE' };
  const id = row?.screen_id || row?.surface_id || row?.id || row?.route || row?.name || `${unit?.unit_lineage_id || 'unit'}-surface-${index+1}`;
  return {
    surface_id: cleanId(id),
    source_ref: row?.screen_ref || row?.authority_ref || row?.route || row?.id || id,
    source: 'FRC_SURFACE',
    title: row?.title || row?.name || null,
    route: row?.route || row?.path || null,
    kind: row?.kind || row?.surface_type || null,
    required_states: uniq(row?.required_states || []),
    user_journey_refs: uniq(row?.user_journey_refs || row?.journey_refs || []),
    action_refs: uniq(row?.action_refs || row?.actions || []),
  };
}

export function buildSurfaceManifest({ unit, featureRecord = null, contractRecord = null } = {}) {
  const rawSurfaces = asRows(contractRecord?.surfaces);
  const fallback = rawSurfaces.length ? rawSurfaces : asRows(featureRecord?.screens || featureRecord?.surfaces || featureRecord?.app_families);
  const surfaces = fallback.map((row, i) => surfaceRef(row, i, unit));
  if (!surfaces.length && (unit?.knowledge_route_ids || []).includes('PRODUCT_EXPERIENCE')) {
    surfaces.push({
      surface_id: cleanId(`${unit.unit_lineage_id}-surface`),
      source_ref: unit.unit_lineage_id,
      source: 'UNIT_DERIVED_PENDING_FRC_SCREEN_DETAIL',
      title: null, route: null, kind: null, required_states: [], user_journey_refs: [], action_refs: [],
    });
  }
  const manifest = {
    schema_version: 1,
    artifact_type: 'SurfaceManifest',
    artifact_id: `surfaces:${unit?.unit_lineage_id || 'unknown'}`,
    status: surfaces.length ? 'RESOLVED' : 'EMPTY',
    unit_lineage_id: unit?.unit_lineage_id || null,
    unit_revision_hash: unit?.unit_revision_hash || null,
    feature_ids: uniq(unit?.feature_ids || []),
    surfaces: surfaces.sort((a,b) => a.surface_id.localeCompare(b.surface_id)),
    provenance: { source: rawSurfaces.length ? 'FRC' : 'FEATURE_OR_UNIT' },
  };
  manifest.content_hash = hashObject({ ...manifest, content_hash: null });
  return manifest;
}

function stateRequirement(state, contractRecord) {
  const eventualities = JSON.stringify(contractRecord?.eventualities || contractRecord?.acceptance_contract || '').toUpperCase();
  if (state === 'CONFLICT') return /CONFLICT|MERGE|VERSION/.test(eventualities) ? 'REQUIRED' : 'SUPPORTED_WHEN_DOMAIN_CAN_EMIT';
  if (state === 'PERMISSION_DENIED') return /PERMISSION|AUTH|ROLE|ACCESS/.test(eventualities) ? 'REQUIRED' : 'SUPPORTED_WHEN_DOMAIN_CAN_EMIT';
  if (state === 'OFFLINE' || state === 'STALE' || state === 'SYNCING') return /OFFLINE|SYNC|CACHE|STALE|NETWORK/.test(eventualities) ? 'REQUIRED' : 'SUPPORTED_WHEN_DOMAIN_CAN_EMIT';
  return ['READY','LOADING','EMPTY','ERROR','DEGRADED'].includes(state) ? 'REQUIRED' : 'SUPPORTED_WHEN_DOMAIN_CAN_EMIT';
}

export function buildSurfaceStateMatrix({ surfaceManifest, contractRecord = null } = {}) {
  const surfaces = (surfaceManifest?.surfaces || []).map((surface) => ({
    surface_id: surface.surface_id,
    states: SURFACE_STATE_IDS.map((state_id) => ({ state_id, requirement: surface.required_states?.includes(state_id) ? 'REQUIRED_BY_SURFACE' : stateRequirement(state_id, contractRecord) })),
  }));
  const matrix = {
    schema_version: 1,
    artifact_type: 'SurfaceStateMatrix',
    artifact_id: `states:${surfaceManifest?.unit_lineage_id || 'unknown'}`,
    status: surfaces.length ? 'RESOLVED' : 'EMPTY',
    unit_lineage_id: surfaceManifest?.unit_lineage_id || null,
    surfaces,
    provenance: { surface_manifest_hash: surfaceManifest?.content_hash || null, contract_source: 'FRC_AND_DOMAIN_EVENTUALITIES' },
  };
  matrix.content_hash = hashObject({ ...matrix, content_hash: null });
  return matrix;
}

export function buildVisualReferenceSpec({ unit, featureRecord = null, contractRecord = null } = {}) {
  const refs = asRows(unit?.design_authorities).map((x, i) => {
    if (typeof x === 'string') return { reference_id: cleanId(x), ref: x, authority_level: 'CANONICAL_REFERENCE', required_fidelity: 'AUTHORITY_DEFINED' };
    return {
      reference_id: cleanId(x?.design_authority_id || x?.reference_id || x?.id || `design-authority-${i+1}`),
      ref: x?.ref || x?.path || x?.uri || x?.id || null,
      authority_level: x?.authority_level || x?.level || 'CANONICAL_REFERENCE',
      required_fidelity: x?.required_fidelity || 'AUTHORITY_DEFINED',
      viewport: x?.viewport || null,
      approved_delta_refs: uniq(x?.approved_delta_refs || []),
    };
  });
  const artifact = {
    schema_version: 1,
    artifact_type: 'VisualReferenceSpec',
    artifact_id: `visual-ref:${unit?.unit_lineage_id || 'unknown'}`,
    status: refs.length ? 'RESOLVED' : 'SYSTEM_STANDARD',
    unit_lineage_id: unit?.unit_lineage_id || null,
    references: refs,
    fallback_authority_level: refs.length ? null : 'SYSTEM_STANDARD',
    benchmark_hints: uniq([featureRecord?.visual_authority_ref, contractRecord?.visual_authority_ref]),
    provenance: { design_authority_count: refs.length },
  };
  artifact.content_hash = hashObject({ ...artifact, content_hash: null });
  return artifact;
}

function inferArchetype(text) {
  const t = upper(text);
  if (/BENCHMARK|RECONSTRUCT|VISUAL REFERENCE/.test(t)) return 'REFERENCE_RECONSTRUCTION';
  if (/POS|CHECKOUT|CART|ORDER/.test(t)) return 'TRANSACTIONAL_WORKSPACE';
  if (/DASHBOARD|CONTROL|MONITOR|OPERAT/.test(t)) return 'OPERATIONAL_DASHBOARD';
  if (/CATALOG|SEARCH|BROWSE|SPARE/.test(t)) return 'CATALOG_EXPLORER';
  if (/CHAT|ASSISTANT|VAN|WIZARD/.test(t)) return 'CONVERSATIONAL_ASSISTANT';
  return 'FORM_WORKFLOW';
}

function inferMode({ instruction, visualReferenceSpec, donorProjection }) {
  const t = upper(instruction);
  // External repositories are reference/inspiration only under DEC-039; their presence never changes implementation into assimilation.
  if (donorProjection?.applicable) return 'SYNTHESIZE';
  if (/ENHANCE|MODERN|POLISH|IMPROVE/.test(t)) return 'ENHANCE';
  if (visualReferenceSpec?.references?.length && /RECONSTRUCT|MATCH|EXACT|BENCHMARK|REFERENCE/.test(t)) return 'RECONSTRUCT';
  return visualReferenceSpec?.references?.length ? 'RECONSTRUCT' : 'SYNTHESIZE';
}

function chooseRenderer({ affectedPaths = [], instruction = '', unit = null, featureRecord = null, contractRecord = null }) {
  const text = upper([...affectedPaths, instruction, featureRecord?.module, featureRecord?.outcome, contractRecord?.platform, contractRecord?.renderer, ...(unit?.affected_paths || [])].filter(Boolean).join(' '));
  if (/\.KT\b|COMPOSE|ANDROID/.test(text)) return 'JETPACK_COMPOSE';
  if (/\.TSX?\b|\.JSX?\b|REACT|WEB|VITE/.test(text)) return 'REACT_TYPESCRIPT';
  if (/RIVE|\.RIV\b/.test(text)) return 'RIVE';
  if (/SVG/.test(text)) return 'SVG';
  if (/CANVAS/.test(text)) return 'CANVAS';
  // Do not infer a renderer from the repository-wide technical-cohesion registry: DIAL is
  // intentionally multi-renderer and a global Android entry must never force an unrelated
  // web surface into Compose. An unresolved renderer is explicit and must be resolved by
  // task/path or product authority before execution.
  return 'UNRESOLVED';
}

export function compilePresentationDecision({ repoDir, unit, featureRecord = null, contractRecord = null, instruction = '', affectedPaths = [], productDesignProfile, visualReferenceSpec, donorProjection = null } = {}) {
  const templates = loadRegistry(repoDir, REGISTRIES.templates, { templates: [] });
  const archetype_id = inferArchetype([instruction, featureRecord?.module, featureRecord?.outcome, ...(unit?.feature_ids || [])].join(' '));
  const execution_mode = inferMode({ instruction, visualReferenceSpec, donorProjection });
  const renderer_id = chooseRenderer({ affectedPaths, instruction, unit, featureRecord, contractRecord });
  const templateIds = (templates.templates || []).filter((x) => x.mode === execution_mode || ['RESPONSIVE_RECOMPOSE','VISUAL_CRITIC','ACCESSIBILITY_AUDIT','PERFORMANCE_CERTIFY','RELEASE_CERTIFY'].includes(x.mode)).map((x) => x.template_id).sort();
  const profilePatterns = productDesignProfile?.profile?.pattern_allowlist || [];
  const pattern_id = profilePatterns.includes('PRECISION_MINIMALISM') ? 'PRECISION_MINIMALISM' : (profilePatterns[0] || 'PRECISION_MINIMALISM');
  const decision = {
    schema_version: 1,
    artifact_type: 'PresentationDecision',
    artifact_id: `presentation:${unit?.unit_lineage_id || 'unknown'}`,
    status: 'RESOLVED',
    execution_mode,
    archetype_id,
    renderer_id,
    density: productDesignProfile?.profile?.density_default || 'STANDARD',
    pattern_id,
    motion_policy: productDesignProfile?.profile?.motion_policy || 'PURPOSEFUL_REDUCED_MOTION_SAFE',
    template_ids: templateIds,
    exception_policy: 'AI_MAY_PROPOSE_BUT_APPROVED_VISUAL_DELTA_OR_EXPERIENCE_ENHANCEMENT_REQUIRED',
    explanation: {
      mode: donorProjection?.applicable ? 'external reference may inform DIAL-native synthesis but has no design or implementation authority' : visualReferenceSpec?.references?.length ? 'visual authority exists' : 'no direct visual benchmark; synthesize from governed profile',
      renderer: renderer_id === 'UNRESOLVED' ? 'no surface-local renderer authority was found; execution must fail closed until resolved' : 'selected from affected paths, instruction, unit paths, or surface-local authority',
      pattern: 'selected from resolved ProductDesignProfile allowlist',
    },
    provenance: { profile_hash: productDesignProfile?.content_hash || null, visual_reference_hash: visualReferenceSpec?.content_hash || null },
  };
  decision.content_hash = hashObject({ ...decision, content_hash: null });
  return decision;
}

export function compileVisualRenderDeterminismEnvelope({ repoDir, presentationDecision, override = {} } = {}) {
  const policy = loadRegistry(repoDir, REGISTRIES.visualDeterminism, { profiles: [] });
  const renderer = presentationDecision?.renderer_id;
  const profile = (policy.profiles || []).find((p) => p.renderer === renderer) || {};
  const artifact = {
    schema_version: 1,
    artifact_type: 'VisualRenderDeterminismEnvelope',
    artifact_id: `vrde:${presentationDecision?.artifact_id || 'unknown'}`,
    status: renderer === 'UNRESOLVED' ? 'BLOCKED_RENDERER_UNRESOLVED' : 'RESOLVED',
    policy_version: policy.registry_version || 'unknown',
    ...profile,
    ...override,
    asset_manifest_hash: override.asset_manifest_hash || null,
    framework_version: override.framework_version || null,
    harness_version: override.harness_version || null,
    provenance: { presentation_decision_hash: presentationDecision?.content_hash || null, policy_registry: REGISTRIES.visualDeterminism },
  };
  artifact.content_hash = hashObject({ ...artifact, content_hash: null });
  return artifact;
}

export function buildFrontendProductExperienceProjection({ repoDir, unit, featureRecord = null, contractRecord = null, instruction = '', affectedPaths = [], donorProjection = null, targetScreenId = null, targetApplicationId = null, requestedTruth = [], hydratedTruth = {}, capabilityOverrides = {} } = {}) {
  const applicable = (unit?.knowledge_route_ids || []).includes('PRODUCT_EXPERIENCE') || (unit?.design_authorities || []).length > 0;
  if (!applicable) return { applicable: false, state: 'NOT_APPLICABLE', integration_version: FRONTEND_INTEGRATION_VERSION };
  const product_design_profile = resolveProductDesignProfile({ repoDir, unit, featureRecord });
  const surface_manifest = buildSurfaceManifest({ unit, featureRecord, contractRecord });
  const screen_feature_projection = buildScreenFeatureProjection({ repoDir, featureRecord, surfaceManifest: surface_manifest });
  if (screen_feature_projection.status !== 'RESOLVED') throw new Error(screen_feature_projection.status);
  const target_screen_resolution = targetScreenId
    ? { status: 'EXPLICIT', target_screen_id: targetScreenId, candidates: screen_feature_projection.screen_refs || [] }
    : resolveFrontendTargetScreenId({ screenFeatureProjection: screen_feature_projection, instruction, affectedPaths });
  const resolved_target_screen_id = targetScreenId || target_screen_resolution.target_screen_id || null;
  const surface_state_matrix = buildSurfaceStateMatrix({ surfaceManifest: surface_manifest, contractRecord });
  const visual_reference_spec = buildVisualReferenceSpec({ unit, featureRecord, contractRecord });
  const presentation_decision = compilePresentationDecision({ repoDir, unit, featureRecord, contractRecord, instruction, affectedPaths, productDesignProfile: product_design_profile, visualReferenceSpec: visual_reference_spec, donorProjection });
  const visual_render_determinism_envelope = compileVisualRenderDeterminismEnvelope({ repoDir, presentationDecision: presentation_decision });
  const frontend_generation_context = compileFrontendGenerationContext({
    repoDir,
    unit,
    featureRecord,
    contractRecord,
    targetScreenId: resolved_target_screen_id,
    requestedTruth,
    hydratedTruth,
    capabilityOverrides,
    instruction,
    affectedPaths,
    targetApplicationId,
    frontendProjection: {
      product_design_profile,
      surface_manifest,
      screen_feature_projection,
      surface_state_matrix,
      visual_reference_spec,
      presentation_decision,
      visual_render_determinism_envelope,
    },
  });
  const registry_hashes = frontendRegistryHashes(repoDir);
  const projection = {
    applicable: true,
    state: 'RESOLVED_FOR_PRODUCT_EXPERIENCE',
    integration_version: FRONTEND_INTEGRATION_VERSION,
    product_design_profile,
    surface_manifest,
    screen_feature_projection,
    target_screen_resolution,
    frontend_generation_context,
    surface_state_matrix,
    visual_reference_spec,
    presentation_decision,
    visual_render_determinism_envelope,
    registry_hashes,
    component_registry_ref: REGISTRIES.components,
    token_registry_ref: REGISTRIES.tokens,
    archetype_registry_ref: REGISTRIES.archetypes,
    pattern_policy_ref: REGISTRIES.patterns,
    renderer_policy_ref: REGISTRIES.renderers,
    template_registry_ref: REGISTRIES.templates,
  };
  projection.projection_hash = hashObject({ ...projection, projection_hash: null });
  return projection;
}

export function buildDesignBriefBundle({ projection, unit, taskId = null, ownerAuthorityRef = null, instruction = '' } = {}) {
  if (!projection?.applicable) return null;
  const intentRaw = String(instruction || '').trim();
  const intentGuard = sanitizeAndClassifyProviderInput(intentRaw, { requestedClass: 'INTERNAL_SAFE_FOR_APPROVED_PROVIDER' });
  if (!intentGuard.ok) throw new Error(`DESIGN_BRIEF_PROVIDER_EGRESS_DENIED:${intentGuard.data_class}`);
  const maxIntentChars = 8000;
  const boundedIntent = String(intentGuard.sanitized || '').slice(0, maxIntentChars);
  const brief = {
    schema_version: 1,
    artifact_type: 'DesignBriefBundle',
    artifact_id: `design-brief:${taskId || unit?.unit_lineage_id || 'unknown'}`,
    status: 'READY',
    task_id: taskId,
    unit_lineage_id: unit?.unit_lineage_id || null,
    unit_revision_hash: unit?.unit_revision_hash || null,
    owner_authority_ref: ownerAuthorityRef,
    design_intent: {
      text: boundedIntent,
      data_class: intentGuard.data_class,
      findings: intentGuard.findings || [],
      source_hash: intentGuard.sanitized_hash,
      bounded_hash: hashObject(boundedIntent),
      max_chars: maxIntentChars,
      truncated: String(intentGuard.sanitized || '').length > maxIntentChars,
    },
    product_design_profile_hash: projection.product_design_profile.content_hash,
    surface_manifest_hash: projection.surface_manifest.content_hash,
    screen_feature_projection_hash: projection.screen_feature_projection.content_hash,
    frontend_generation_context_hash: projection.frontend_generation_context.content_hash,
    surface_state_matrix_hash: projection.surface_state_matrix.content_hash,
    visual_reference_spec_hash: projection.visual_reference_spec.content_hash,
    presentation_decision_hash: projection.presentation_decision.content_hash,
    visual_render_determinism_envelope_hash: projection.visual_render_determinism_envelope.content_hash,
    constraints: {
      authority_flow: 'ONE_WAY_FROM_DIAL_TO_PROVIDER',
      provider_output_authoritative: false,
      invent_domain_truth: false,
      invent_tokens: false,
      required_state_coverage: true,
      normalization_required: true,
      composite_certification_required: true,
      screen_feature_graph_required: true,
      truth_hydration_required_before_provider_dispatch: true,
      stitch_primary_provider: true,
      figma_explicit_only: true,
      interaction_motion_enrichment_required_after_visual_freeze: true,
    },
    provenance: { projection_hash: projection.projection_hash },
  };
  brief.content_hash = hashObject({ ...brief, content_hash: null });
  return brief;
}
