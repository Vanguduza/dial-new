import { hashObject, loadRegistry, registryHash } from './knowledge-graph-core.mjs';
import { loadCanonicalScreenGraph } from './screen-feature-graph.mjs';

export const FRONTEND_GENERATION_ARCHITECTURE_VERSION = 'canonical-frontend-generation-1.0';

export const FRONTEND_GENERATION_REFS = Object.freeze({
  policy: 'agent-system/registries/FRONTEND_GENERATION_POLICY.json',
  truthSources: 'agent-system/registries/FRONTEND_TRUTH_SOURCE_REGISTRY.json',
  archetypes: 'agent-system/registries/FRONTEND_ARCHETYPE_REGISTRY.json',
  capabilities: 'docs/dial/final-audit/11_FEATURE_REALIZATION/SUPPORTING_CAPABILITY_REGISTRY.json',
  featureRealizations: 'docs/dial/final-audit/11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json',
  domainSemantics: 'agent-system/registries/FRONTEND_DOMAIN_SEMANTIC_REGISTRY.json',
});

const uniq = (xs = []) => [...new Set((xs || []).filter(Boolean).map(String))].sort();
const stableRows = (xs = []) => [...xs].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const truthClass = (value) => String(value || '').toUpperCase();
const VERIFIED_TRUTH_CLASSES = new Set(['VERIFIED_FACT', 'VERIFIED_DERIVED_FACT']);
const ALLOWED_TRUTH_CLASSES = new Set(['VERIFIED_FACT', 'VERIFIED_DERIVED_FACT', 'CREATIVE_PRESENTATION', 'DESIGN_PROPOSAL_FACT']);

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function moduleKey(featureRecord = {}, screens = []) {
  const raw = String(featureRecord?.module || screens?.[0]?.module || '').toUpperCase();
  const aliases = Object.freeze({ PLAT: 'PLATFORM', CORP: 'CORPORATE', PROJ: 'PROJECTS', ASST: 'ASSIST' });
  if (aliases[raw]) return aliases[raw];
  const known = ['SPARE','TECH','GROCERIES','LAUNDRY','VHUB','CARE','ASSIST','PROJECTS','FLEET','HEALTH','CORPORATE','PLATFORM','GMPC','DKRF','HOME'];
  return known.find((id) => raw === id || raw.startsWith(`${id} `) || raw.startsWith(`${id}_`) || raw.startsWith(`${id}-`)) || (raw || null);
}
function buildArtifact(type, id, body) {
  const artifact = { schema_version: 1, artifact_type: type, artifact_id: id, status: 'RESOLVED', provenance: {}, ...body };
  artifact.content_hash = hashObject({ ...artifact, content_hash: null });
  return artifact;
}

export function loadFrontendGenerationPolicy(repoDir) { return loadRegistry(repoDir, FRONTEND_GENERATION_REFS.policy); }
export function loadFrontendTruthSourceRegistry(repoDir) { return loadRegistry(repoDir, FRONTEND_GENERATION_REFS.truthSources); }
export function loadFrontendDomainSemanticRegistry(repoDir) { return loadRegistry(repoDir, FRONTEND_GENERATION_REFS.domainSemantics, { modules: {} }); }

export function resolveDomainSemanticProfile({ repoDir, module } = {}) {
  const registry = loadFrontendDomainSemanticRegistry(repoDir);
  const profile = registry.modules?.[module] || null;
  if (!profile) return null;
  return buildArtifact('FrontendDomainSemanticProfile', 'domain-semantics:' + module, {
    module,
    registry_version: registry.registry_version,
    product_positioning: profile.product_positioning || null,
    product_scope_statement: profile.product_scope_statement || null,
    category_scope: clone(profile.category_scope || []),
    freshness_positioning: profile.freshness_positioning || null,
    brand_authority: clone(profile.brand_authority || null),
    shopping_mode: clone(profile.shopping_mode || null),
    subsystems: clone(profile.subsystems || {}),
    screen_policies: clone(profile.screen_policies || {}),
    provenance: {
      registry_ref: FRONTEND_GENERATION_REFS.domainSemantics,
      registry_hash: registryHash(repoDir, FRONTEND_GENERATION_REFS.domainSemantics),
    },
  });
}

function inferRequestedPlatform({ presentationDecision = null, instruction = '', affectedPaths = [] } = {}) {
  const renderer = String(presentationDecision?.renderer_id || '').toUpperCase();
  const text = (String(instruction || '') + ' ' + (affectedPaths || []).join(' ')).toUpperCase();
  if (renderer === 'JETPACK_COMPOSE' || /ANDROID|\.KT\b|COMPOSE/.test(text)) return 'ANDROID';
  if (/\bIOS\b|SWIFT|SWIFTUI/.test(text)) return 'IOS';
  if (/WHATSAPP/.test(text)) return 'WHATSAPP';
  if (renderer === 'REACT_TYPESCRIPT' || /\bWEB\b|\.TSX?\b|REACT|VITE/.test(text)) return 'WEB';
  return null;
}

function resolveTargetApplication({ registry, graph, screens = [], featureRecord = null, presentationDecision = null, instruction = '', affectedPaths = [], explicitApplicationId = null } = {}) {
  const candidateIds = uniq(screens.flatMap((screen) => graph.indexes?.screen_to_applications?.[screen.screen_id] || []));
  const all = new Map((registry.application_platforms || []).map((x) => [x.application_id, x]));
  if (explicitApplicationId) {
    if (!candidateIds.includes(explicitApplicationId)) throw new Error('TARGET_APPLICATION_OUTSIDE_SCREEN_AUTHORITY:' + explicitApplicationId);
    const app = all.get(explicitApplicationId);
    if (!app) throw new Error('TARGET_APPLICATION_UNKNOWN:' + explicitApplicationId);
    return { status:'EXPLICIT', target_application_id:explicitApplicationId, candidate_application_ids:candidateIds, application:app };
  }
  const requestedPlatform = inferRequestedPlatform({ presentationDecision, instruction, affectedPaths });
  const text = (String(instruction || '') + ' ' + (affectedPaths || []).join(' ')).toUpperCase();
  const customerFacing = String(featureRecord?.exposure || '').toUpperCase() === 'CUSTOMER'
    || screens.some((x) => x.screen_kind === 'HOME_ENTRY' || x.screen_kind === 'SEARCH_RESULTS');
  const operationalSignal = /COURIER|MERCHANT|SUPPLIER|SHOPPER|WAREHOUSE|STAFF|COMMAND CENTRE|COMMAND_CENTER/.test(text);
  const scored = candidateIds.map((id) => {
    const app = all.get(id);
    if (!app) return { id, score:-999 };
    let score = 0;
    const platforms = (app.platform_targets || []).map((x) => String(x).toUpperCase());
    if (requestedPlatform) score += platforms.includes(requestedPlatform) ? 60 : -80;
    if (text.includes(String(id).toUpperCase()) || text.includes(String(app.display_name || '').toUpperCase())) score += 200;
    if (customerFacing && !operationalSignal) {
      if (app.application_class === 'CUSTOMER_APP') score += 50;
      if ((app.primary_users || []).includes('CUSTOMERS')) score += 50;
    }
    if (operationalSignal && app.application_class !== 'CUSTOMER_APP') score += 25;
    if ((app.module_scope || []).includes(screens[0]?.module)) score += 10;
    if (featureRecord?.feature_id && (app.feature_refs || []).includes(featureRecord.feature_id)) score += 5;
    return { id, score };
  }).sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id));
  const top = scored[0];
  const ties = top ? scored.filter((x)=>x.score===top.score) : [];
  if (!top || top.score < 0 || ties.length !== 1) {
    return { status:'AMBIGUOUS', target_application_id:null, candidate_application_ids:candidateIds, application:null, scores:scored };
  }
  return { status:'RESOLVED_FROM_TASK_CONTEXT', target_application_id:top.id, candidate_application_ids:candidateIds, application:all.get(top.id), scores:scored };
}

function buildFeatureSemanticEnvelope({ repoDir, module, screen, featureRecord = null, targetApplication = null } = {}) {
  const registry = loadFrontendDomainSemanticRegistry(repoDir);
  const moduleProfile = registry.modules?.[module] || {};
  const sourceFeatures = loadRegistry(repoDir, FRONTEND_GENERATION_REFS.featureRealizations, []);
  const byId = new Map((sourceFeatures || []).map((x)=>[x.feature_id,x]));
  const screenPolicy = moduleProfile.screen_policies?.[screen?.screen_id] || {};
  const roleOverrides = screenPolicy.feature_edge_roles || {};
  const graphEdgeRoles = Object.fromEntries((screen?.feature_edges || []).map((x)=>[x.feature_id,x.edge_role]));
  const subsystemEntries = Object.entries(moduleProfile.subsystems || {});
  const subsystemFor = (featureId) => subsystemEntries.find(([,v]) => (v.feature_refs || []).includes(featureId)) || null;
  const features = uniq(screen?.feature_refs || []).map((featureId) => {
    const source = byId.get(featureId) || {};
    const subsystemEntry = subsystemFor(featureId);
    const subsystem = subsystemEntry?.[0] || null;
    const subsystemPolicy = subsystemEntry?.[1] || {};
    let role = graphEdgeRoles[featureId] || roleOverrides[featureId] || (featureId === featureRecord?.feature_id ? 'PRIMARY_CAPABILITY' : 'CONTEXT_ONLY');
    if (targetApplication?.application_class === 'CUSTOMER_APP' && String(source.exposure || '').toUpperCase() === 'INTERNAL') role = 'NOT_EXPOSED';
    return {
      feature_id: featureId,
      outcome: source.outcome || null,
      aggregate: source.aggregate || null,
      exposure: source.exposure || null,
      primary_route: source.primary_route || null,
      app_families: uniq(source.app_families || []),
      subsystem,
      edge_role: role,
      provider_visible: role !== 'NOT_EXPOSED',
      semantic_invariants: clone(subsystemPolicy.semantic_invariants || []),
      semantic_guards: clone(subsystemPolicy.semantic_guards || []),
      source_ref: FRONTEND_GENERATION_REFS.featureRealizations,
    };
  });
  return buildArtifact('FeatureSemanticEnvelope', 'feature-semantics:' + (screen?.screen_id || module || 'unknown'), {
    module,
    screen_id: screen?.screen_id || null,
    target_application_id: targetApplication?.application_id || null,
    product_positioning: moduleProfile.product_positioning || null,
    product_scope_statement: moduleProfile.product_scope_statement || null,
    category_scope: clone(moduleProfile.category_scope || []),
    freshness_positioning: moduleProfile.freshness_positioning || null,
    features,
    subsystem_semantics: subsystemEntries.map(([subsystem_id,policy])=>({
      subsystem_id,
      feature_refs: uniq(policy.feature_refs || []),
      semantic_invariants: clone(policy.semantic_invariants || []),
      semantic_guards: clone(policy.semantic_guards || []),
    })),
    screen_feature_edges: features.map((x)=>({ feature_id:x.feature_id, role:x.edge_role, subsystem:x.subsystem, provider_visible:x.provider_visible })),
    provider_interaction_intents: clone(screenPolicy.provider_interaction_intents || []),
    provider_command_policy: screenPolicy.provider_command_policy || 'DOMAIN_COMMANDS_ONLY_WHEN_DIRECTLY_REQUIRED',
    provider_action_policy: screenPolicy.provider_action_policy || 'DOMAIN_ACTIONS_ONLY_WHEN_DIRECTLY_REQUIRED',
    screen_policy: clone(screenPolicy),
    provenance: {
      registry_ref: FRONTEND_GENERATION_REFS.domainSemantics,
      registry_hash: registryHash(repoDir, FRONTEND_GENERATION_REFS.domainSemantics),
      feature_registry_ref: FRONTEND_GENERATION_REFS.featureRealizations,
      feature_registry_hash: registryHash(repoDir, FRONTEND_GENERATION_REFS.featureRealizations),
    },
  });
}

export function resolveTruthSourceProfile({ repoDir, module } = {}) {
  if (!repoDir || !module) throw new Error('truth source profile requires repoDir and module');
  const registry = loadFrontendTruthSourceRegistry(repoDir);
  const profile = registry.modules?.[module] || null;
  if (!profile) throw new Error(`FRONTEND_TRUTH_SOURCE_PROFILE_MISSING:${module}`);
  return buildArtifact('FrontendTruthSourceProfile', `truth-sources:${module}`, {
    status: 'RESOLVED',
    module,
    registry_version: registry.registry_version,
    global_sources: clone(registry.global_sources || []),
    module_sources: clone(profile.truth_sources || []),
    core_domains: uniq(profile.core_domains || []),
    missing_required_truth_policy: profile.missing_required_truth_policy || 'FAIL_CLOSED_AT_PROVIDER_DISPATCH',
    provenance: { registry_ref: FRONTEND_GENERATION_REFS.truthSources, registry_hash: registryHash(repoDir, FRONTEND_GENERATION_REFS.truthSources) },
  });
}

function screenRoleBoundary(screen = {}) {
  const kind = screen.screen_kind || 'DOMAIN_SCREEN';
  const title = String(screen.title || '').toUpperCase();
  if (kind === 'HOME_ENTRY') return {
    role: 'DISCOVERY_NAVIGATION_CONTEXT_AND_LIGHT_MERCHANDISING',
    responsibilities: ['orient_actor', 'show_current_context', 'expose_primary_discovery', 'route_to_deeper_work'],
    prohibited_responsibilities: ['deep_engineering_benchmark', 'unrequested_analytics_dashboard', 'admin_inventory_workbench', 'deep_product_analysis'],
  };
  if (/PRODUCT|PART|CATALOG/.test(title) && /DETAIL/.test(title)) return {
    role: 'PRODUCT_INSPECTION_AND_COMMERCE',
    responsibilities: ['inspect_product', 'understand_verified_benefits', 'verify_compatibility', 'perform_purchase_action'],
    prohibited_responsibilities: ['invented_performance_index', 'unsupported_engineering_scorecard', 'telemetry_dashboard'],
  };
  if (kind === 'TRACKING') return {
    role: 'LIVE_STATUS_AND_FULFILMENT_TRACKING',
    responsibilities: ['show_current_state', 'show_route_or_eta_when_authorized', 'expose_allowed_actions', 'preserve_issue_path'],
    prohibited_responsibilities: ['parallel_delivery_state_machine', 'invented_eta', 'invented_courier_state'],
  };
  if (kind === 'ACTION_SHEET') return {
    role: 'CONTEXTUAL_ALLOWED_ACTIONS',
    responsibilities: ['show_domain_allowed_actions', 'preserve_current_context'],
    prohibited_responsibilities: ['hard_coded_unauthorized_actions', 'new_business_workflow'],
  };
  if (kind === 'ISSUE_SUPPORT') return {
    role: 'ISSUE_SUPPORT_AND_ESCALATION',
    responsibilities: ['preserve_context', 'collect_allowed_evidence', 'route_to_support_or_rce'],
    prohibited_responsibilities: ['silent_case_creation', 'invented_remedy'],
  };
  if (kind === 'TIMELINE') return {
    role: 'AUDIT_AND_HISTORY',
    responsibilities: ['show_authoritative_history', 'show_provenance'],
    prohibited_responsibilities: ['invented_events', 'editable_audit_history'],
  };
  if (kind === 'SEARCH_RESULTS') return {
    role: 'SEARCH_FILTER_AND_RESULT_DISCOVERY',
    responsibilities: ['show_query_context', 'show_authoritative_results', 'support_filtering_and_selection'],
    prohibited_responsibilities: ['invented_result_counts', 'invented_inventory'],
  };
  if (kind === 'QUEUE') return {
    role: 'OPERATIONAL_WORK_QUEUE',
    responsibilities: ['prioritize_authoritative_work_items', 'expose_allowed_actions', 'surface_exceptions'],
    prohibited_responsibilities: ['consumer_merchandising', 'invented_operational_metrics'],
  };
  if (kind === 'DRAWER') return {
    role: 'NAVIGATION_AND_CONTEXT_SWITCHING',
    responsibilities: ['expose_registered_destinations', 'preserve_actor_context', 'support_context_switching'],
    prohibited_responsibilities: ['invented_navigation_destination', 'hidden_business_workflow', 'unscoped_admin_action'],
  };
  if (kind === 'PANEL') return {
    role: 'CONTEXTUAL_SECONDARY_INFORMATION_OR_ACTIONS',
    responsibilities: ['preserve_parent_context', 'show_authoritative_secondary_state', 'expose_capability_backed_actions'],
    prohibited_responsibilities: ['independent_business_state_machine', 'invented_metric', 'invented_action'],
  };
  return {
    role: 'DOMAIN_TASK_SURFACE',
    responsibilities: ['represent_domain_state', 'expose_allowed_actions', 'preserve_navigation_and_support'],
    prohibited_responsibilities: ['invented_domain_state', 'invented_business_capability'],
  };
}

function normalizeHydratedFacts(hydratedTruth = {}) {
  const facts = [];
  for (const row of hydratedTruth.facts || []) {
    const c = truthClass(row.truth_class || 'VERIFIED_FACT');
    if (!ALLOWED_TRUTH_CLASSES.has(c)) throw new Error(`UNKNOWN_TRUTH_CLASS:${c}`);
    if (VERIFIED_TRUTH_CLASSES.has(c) && (!row.source_id || !row.provenance_ref)) throw new Error(`VERIFIED_FACT_PROVENANCE_REQUIRED:${row.fact_id || row.path || 'unknown'}`);
    if (c === 'VERIFIED_DERIVED_FACT' && !row.derivation_ref) throw new Error(`DERIVED_FACT_DERIVATION_REQUIRED:${row.fact_id || row.path || 'unknown'}`);
    facts.push({
      fact_id: String(row.fact_id || row.path || `fact-${facts.length + 1}`),
      path: String(row.path || row.fact_id || ''),
      value: clone(row.value),
      truth_class: c,
      source_id: row.source_id || null,
      provenance_ref: row.provenance_ref || null,
      derivation_ref: row.derivation_ref || null,
    });
  }
  return stableRows(facts);
}

function requestedTruthKeys({ featureRecord = {}, contractRecord = {}, requestedTruth = [] } = {}) {
  return uniq([
    ...(requestedTruth || []),
    ...(featureRecord.frontend_required_truth || []),
    ...(featureRecord.screen_truth_requirements || []),
    ...(contractRecord?.frontend_required_truth || []),
    ...(contractRecord?.screen_truth_requirements || []),
  ]);
}

export function buildScreenTruthEnvelope({ repoDir, module, featureRecord = null, contractRecord = null, requestedTruth = [], hydratedTruth = {} } = {}) {
  const profile = resolveTruthSourceProfile({ repoDir, module });
  const facts = normalizeHydratedFacts(hydratedTruth);
  const requiredFactKeys = requestedTruthKeys({ featureRecord, contractRecord, requestedTruth });
  const verifiedPaths = new Set(facts.filter((x) => VERIFIED_TRUTH_CLASSES.has(x.truth_class)).flatMap((x) => [x.fact_id, x.path]).filter(Boolean));
  const missingRequired = requiredFactKeys.filter((key) => !verifiedPaths.has(key));
  const sourceIds = new Set([...(profile.global_sources || []), ...(profile.module_sources || [])].map((x) => x.source_id));
  const unknownVerifiedSources = uniq(facts.filter((x) => VERIFIED_TRUTH_CLASSES.has(x.truth_class) && x.source_id && !sourceIds.has(x.source_id)).map((x) => x.source_id));
  const state = unknownVerifiedSources.length ? 'BLOCKED_UNKNOWN_TRUTH_SOURCE' : missingRequired.length ? 'AWAITING_REQUIRED_TRUTH' : 'HYDRATED_FOR_DECLARED_REQUIREMENTS';
  return buildArtifact('ScreenTruthEnvelope', `screen-truth:${featureRecord?.feature_id || module || 'unknown'}`, {
    status: state,
    module,
    source_profile_hash: profile.content_hash,
    required_fact_keys: requiredFactKeys,
    missing_required_fact_keys: missingRequired,
    facts,
    candidate_sources: uniq([...(profile.global_sources || []), ...(profile.module_sources || [])].map((x) => x.source_id)),
    unknown_verified_sources: unknownVerifiedSources,
    truth_class_policy: {
      verified_fact: 'MAY_DISPLAY_AS_FACT',
      verified_derived_fact: 'MAY_DISPLAY_WITH_DERIVATION_PROVENANCE',
      creative_presentation: 'MAY_INVENT_ONLY_WHEN_NON_FACTUAL',
      design_proposal_fact: 'BLOCKED_FROM_PRODUCTION_UNTIL_VERIFIED',
      unknown_fact: 'OMIT_OR_DEFER_DO_NOT_FABRICATE',
    },
    provenance: { truth_source_registry_ref: FRONTEND_GENERATION_REFS.truthSources, feature_id: featureRecord?.feature_id || null, contract_ref: contractRecord?.contract_id || contractRecord?.feature_id || null },
  });
}

function buildCapabilityEnvelope({ repoDir, screens = [], featureRecords = null, allowedInteractionActions = null, domainCommands = null, capabilityOverrides = {} } = {}) {
  const registry = loadRegistry(repoDir, FRONTEND_GENERATION_REFS.capabilities, []);
  const byId = new Map((registry || []).map((x) => [x.capability_id, x]));
  const capabilityIds = featureRecords
    ? uniq(featureRecords.flatMap((x) => x.supporting_capability_refs || []))
    : uniq(screens.flatMap((x) => x.capability_refs || x.supporting_capability_refs || []));
  const capabilities = capabilityIds.map((id) => {
    const source = byId.get(id);
    return {
      capability_id: id,
      known: Boolean(source),
      name: source?.name || null,
      purpose: source?.purpose || null,
      app_families: uniq(source?.app_families || []),
      status: capabilityOverrides[id]?.status || source?.status || 'UNKNOWN',
      supported: capabilityOverrides[id]?.supported ?? Boolean(source),
      source: source ? 'SUPPORTING_CAPABILITY_REGISTRY' : 'MISSING',
    };
  });
  const actions = allowedInteractionActions == null ? uniq(screens.flatMap((x) => x.action_refs || [])) : uniq(allowedInteractionActions);
  const commands = domainCommands == null ? uniq(screens.flatMap((x) => x.command_refs || [])) : uniq(domainCommands);
  return buildArtifact('CapabilityEnvelope', `capabilities:${hashObject(screens.map((x) => x.screen_id)).slice(0, 16)}`, {
    status: capabilities.every((x) => x.known) ? 'RESOLVED' : 'BLOCKED_MISSING_CAPABILITY_AUTHORITY',
    capabilities,
    allowed_interaction_actions: actions,
    domain_commands: commands,
    capability_invention_forbidden: true,
    unsupported_behavior_policy: 'DO_NOT_RENDER_AS_AVAILABLE_INTERACTION',
  });
}

function selectArchetypes({ repoDir, module, screens = [], presentationDecision = null } = {}) {
  const registry = loadRegistry(repoDir, FRONTEND_GENERATION_REFS.archetypes, { archetypes: [] });
  const selected = [];
  const presentationId = presentationDecision?.archetype_id;
  if (presentationId) {
    const found = (registry.archetypes || []).find((x) => x.archetype_id === presentationId);
    if (found) selected.push({ ...clone(found), selection_reason: 'PRESENTATION_DECISION' });
  }
  for (const row of registry.archetypes || []) {
    if (row.authority_class !== 'OWNER_APPROVED_ARCHETYPE') continue;
    const applicability = row.applicability?.[module] || row.applicability?.OPERATIONAL || null;
    if (!applicability || applicability === 'NONE' || applicability === 'LOW') continue;
    const hasHome = screens.some((x) => x.screen_kind === 'HOME_ENTRY');
    if (!hasHome && /DISCOVERY/.test((row.intents || []).join(' '))) continue;
    if (!selected.some((x) => x.archetype_id === row.archetype_id)) selected.push({ ...clone(row), selection_reason: `OWNER_APPROVED_${applicability}` });
  }
  return stableRows(selected);
}

function buildAcceptanceContract({ screens = [], truthEnvelope, capabilityEnvelope } = {}) {
  return buildArtifact('FrontendAcceptanceContract', `acceptance:${hashObject(screens.map((x) => x.screen_id)).slice(0, 16)}`, {
    product: ['SCREEN_MAPPED_TO_AUTHORITY', 'ACTIONS_HAVE_DOMAIN_CONTRACT', 'REQUIRED_STATES_PRESENT', 'NO_FAKE_DATA'],
    visual: ['AUTHORED_COMPOSITION', 'DOMAIN_SPECIFICITY', 'HIERARCHY', 'IMAGERY_AUTHORITY', 'ANTI_CARD_SOUP'],
    interaction: ['NO_DEAD_CONTROLS', 'CAPABILITY_BACKED_INTERACTIONS', 'GESTURE_CONFLICT_FREE', 'REDUCED_MOTION_SAFE'],
    accessibility: ['SEMANTICS', 'TOUCH_TARGETS', 'FOCUS_ORDER', 'CONTRAST', 'REDUCED_MOTION'],
    responsive: ['HIERARCHY_PRESERVED', 'NO_UNBOUNDED_OVERFLOW', 'PLATFORM_APPROPRIATE_NAVIGATION'],
    implementation: ['VISUAL_PARITY', 'INTERACTION_PARITY', 'REAL_DATA_BINDING', 'NO_PROVIDER_RUNTIME_DEPENDENCY'],
    truth: [
      truthEnvelope.missing_required_fact_keys.length ? 'MISSING_REQUIRED_TRUTH_BLOCKS_PROVIDER' : 'DECLARED_REQUIRED_TRUTH_PRESENT',
      capabilityEnvelope.status === 'RESOLVED' ? 'CAPABILITIES_RESOLVED' : 'CAPABILITY_AUTHORITY_BLOCKED',
      'UNKNOWN_FACTS_MUST_NOT_BE_INVENTED',
    ],
  });
}

export function evaluateFrontendGenerationCompleteness(context, { requireTargetScreen = true } = {}) {
  const failures = [];
  const warnings = [];
  if (!context?.screen_context?.screens?.length) failures.push('NO_CANONICAL_SCREEN_MAPPING');
  if (requireTargetScreen && !context?.screen_context?.target_screen_id) failures.push('TARGET_SCREEN_REQUIRED');
  if (!context?.feature_context?.feature_ids?.length && context?.screen_context?.module !== 'HOME') failures.push('NO_FEATURE_AUTHORITY');
  if (!context?.platform_context?.applications?.length) failures.push('NO_APPLICATION_PLATFORM_MAPPING');
  if (!context?.platform_context?.target_application_id) failures.push('TARGET_APPLICATION_REQUIRED');
  if (context?.feature_context?.semantic_envelope && (context.feature_context.screen_feature_edges || []).some((x)=>x.role === 'UNCLASSIFIED_CONTEXT')) failures.push('UNCLASSIFIED_SCREEN_FEATURE_EDGE');
  if (context?.truth?.screen_truth_envelope?.unknown_verified_sources?.length) failures.push('UNKNOWN_VERIFIED_TRUTH_SOURCE');
  if (context?.truth?.screen_truth_envelope?.missing_required_fact_keys?.length) failures.push('MISSING_REQUIRED_TRUTH');
  if (context?.capability_envelope?.status !== 'RESOLVED') failures.push('CAPABILITY_AUTHORITY_INCOMPLETE');
  if (!context?.design_authority?.archetype_refs?.length) warnings.push('NO_APPLICABLE_ARCHETYPE_USE_PROFILE_AND_GENERAL_DESIGN_AUTHORITY');
  return {
    planning_ready: !failures.includes('NO_CANONICAL_SCREEN_MAPPING') && !failures.includes('NO_APPLICATION_PLATFORM_MAPPING'),
    provider_dispatch_ready: failures.length === 0,
    failures: uniq(failures),
    warnings: uniq(warnings),
  };
}

export function resolveFrontendTargetScreenId({ screenFeatureProjection, instruction = '', affectedPaths = [] } = {}) {
  const screens = screenFeatureProjection?.screens || [];
  if (!screens.length) return { status: 'NO_SCREEN_CANDIDATES', target_screen_id: null, candidates: [] };
  if (screens.length === 1) return { status: 'RESOLVED_SINGLE', target_screen_id: screens[0].screen_id, candidates: [screens[0].screen_id] };
  const text = `${instruction} ${(affectedPaths || []).join(' ')}`.toUpperCase();
  const kindSignals = [
    ['HOME_ENTRY', /HOME|LANDING|ENTRY|DISCOVERY/],
    ['DETAIL_STATE', /DETAIL|PDP|PRODUCT DETAIL|STATE/],
    ['SEARCH_RESULTS', /SEARCH|FILTER|BROWSE|RESULT/],
    ['TRACKING', /TRACK|MAP|ETA|FULFILMENT/],
    ['ISSUE_SUPPORT', /ISSUE|SUPPORT|HELP|CLAIM/],
    ['TIMELINE', /TIMELINE|HISTORY|AUDIT/],
    ['ACTION_SHEET', /ACTION SHEET|CONTEXT ACTION/],
    ['QUEUE', /QUEUE|WORKLIST/],
  ];
  const scored = screens.map((screen) => {
    let score = 0;
    const title = String(screen.title || '').toUpperCase();
    const id = String(screen.screen_id || '').toUpperCase();
    for (const [kind, rx] of kindSignals) if (screen.screen_kind === kind && rx.test(text)) score += 12;
    const titleWords = title.split(/[^A-Z0-9]+/).filter((x) => x.length >= 4 && !['DETAIL','STATE','ENTRY','SHEET'].includes(x));
    for (const word of titleWords) if (text.includes(word)) score += 2;
    if (text.includes(id)) score += 100;
    return { screen_id: screen.screen_id, score };
  }).sort((a,b) => b.score - a.score || a.screen_id.localeCompare(b.screen_id));
  const top = scored[0];
  const ties = scored.filter((x) => x.score === top.score);
  if (top.score <= 0 || ties.length !== 1) return { status: 'AMBIGUOUS_TARGET', target_screen_id: null, candidates: scored.map((x) => x.screen_id), scores: scored };
  return { status: 'RESOLVED_FROM_TASK_INTENT', target_screen_id: top.screen_id, candidates: scored.map((x) => x.screen_id), scores: scored };
}

export function compileFrontendGenerationContext({
  repoDir, unit, featureRecord = null, contractRecord = null, frontendProjection = null, targetScreenId = null,
  requestedTruth = [], hydratedTruth = {}, capabilityOverrides = {}, instruction = '', affectedPaths = [], targetApplicationId = null,
} = {}) {
  if (!repoDir || !unit) throw new Error('frontend generation context requires repoDir and unit');
  const { registry, graph } = loadCanonicalScreenGraph(repoDir);
  const projectionScreens = frontendProjection?.screen_feature_projection?.screens || [];
  const candidateIds = projectionScreens.map((x) => x.screen_id);
  const selectedIds = targetScreenId ? [targetScreenId] : candidateIds;
  if (targetScreenId && !registry.screens.some((x) => x.screen_id === targetScreenId)) throw new Error(`TARGET_SCREEN_NOT_CANONICAL:${targetScreenId}`);
  if (targetScreenId && featureRecord && !candidateIds.includes(targetScreenId)) throw new Error(`TARGET_SCREEN_OUTSIDE_FEATURE_AUTHORITY:${featureRecord.feature_id || 'UNKNOWN'}:${targetScreenId}`);
  const byId = new Map(registry.screens.map((x) => [x.screen_id, x]));
  const selectedScreens = selectedIds.map((id) => byId.get(id)).filter(Boolean);
  const allScreens = targetScreenId ? selectedScreens : projectionScreens.map((x) => byId.get(x.screen_id) || x);
  const module = moduleKey({}, allScreens) || moduleKey(featureRecord, allScreens);
  if (!module) throw new Error('FRONTEND_MODULE_UNRESOLVED');
  if (featureRecord?.module && moduleKey(featureRecord, []) !== module) throw new Error(`TARGET_SCREEN_MODULE_MISMATCH:${featureRecord.module}:${module}`);

  const appResolution = resolveTargetApplication({
    registry, graph, screens: allScreens, featureRecord,
    presentationDecision: frontendProjection?.presentation_decision,
    instruction, affectedPaths, explicitApplicationId: targetApplicationId,
  });
  const applications = (appResolution.application ? [appResolution.application] : []).map((x) => ({
    application_id: x.application_id, display_name: x.display_name, application_class: x.application_class,
    primary_users: uniq(x.primary_users || []), platform_targets: uniq(x.platform_targets || []),
    app_family_refs: uniq(x.app_family_refs || []), module_scope: uniq(x.module_scope || []),
  }));
  const screenRows = allScreens.map((s) => ({
    screen_id: s.screen_id, title: s.title, screen_kind: s.screen_kind, module: s.module, route_refs: uniq(s.route_refs || []),
    feature_refs: uniq(s.feature_refs || []), feature_edges: clone(s.feature_edges || []), subfeature_refs: uniq(s.subfeature_refs || []), capability_refs: uniq(s.supporting_capability_refs || []),
    eventuality_refs: uniq(s.eventuality_refs || []), action_refs: uniq(s.action_refs || []), query_refs: uniq(s.query_refs || []),
    command_refs: uniq(s.command_refs || []), event_refs: uniq(s.event_refs || []), application_refs: uniq(graph.indexes?.screen_to_applications?.[s.screen_id] || []),
    state_contract: clone(s.state_contract || {}), role_boundary: screenRoleBoundary(s),
  }));

  const domainSemantics = resolveDomainSemanticProfile({ repoDir, module });
  const featureSemanticEnvelope = buildFeatureSemanticEnvelope({
    repoDir, module, screen: screenRows[0], featureRecord, targetApplication: appResolution.application,
  });
  const sourceFeatureRegistry = loadRegistry(repoDir, FRONTEND_GENERATION_REFS.featureRealizations, []);
  const sourceFeatureById = new Map((sourceFeatureRegistry || []).map((x)=>[x.feature_id,x]));
  const semanticPolicyActive = Boolean(domainSemantics);
  const directFeatureIds = featureSemanticEnvelope.screen_feature_edges
    .filter((x)=>['PRIMARY_CAPABILITY','DIRECT_INTERACTION'].includes(x.role))
    .map((x)=>x.feature_id);
  const directFeatureRecords = directFeatureIds.map((id)=>sourceFeatureById.get(id)).filter(Boolean);
  const providerInteractionIntents = semanticPolicyActive
    ? (featureSemanticEnvelope.provider_interaction_intents || [])
    : uniq(screenRows.flatMap((x)=>x.action_refs || []));
  const truthEnvelope = buildScreenTruthEnvelope({ repoDir, module, featureRecord, contractRecord, requestedTruth, hydratedTruth });
  const capabilityEnvelope = buildCapabilityEnvelope({
    repoDir, screens: screenRows, featureRecords: semanticPolicyActive ? directFeatureRecords : null,
    allowedInteractionActions: providerInteractionIntents,
    domainCommands: semanticPolicyActive ? [] : null,
    capabilityOverrides,
  });
  const archetypes = selectArchetypes({ repoDir, module, screens: screenRows, presentationDecision: frontendProjection?.presentation_decision });
  const acceptance = buildAcceptanceContract({ screens: screenRows, truthEnvelope, capabilityEnvelope });

  const context = {
    schema_version: 1, artifact_type: 'FrontendGenerationContext',
    artifact_id: `frontend-generation:${unit.unit_lineage_id}:${targetScreenId || 'multi'}`,
    architecture_version: FRONTEND_GENERATION_ARCHITECTURE_VERSION,
    business_unit_context: {
      module, branch_space: featureRecord?.branch_space || null, feature_id: featureRecord?.feature_id || null,
      outcome: featureRecord?.outcome || null, canonical_owner: featureRecord?.canonical_owner || null, aggregate: featureRecord?.aggregate || null,
      product_positioning: domainSemantics?.product_positioning || null,
      product_scope_statement: domainSemantics?.product_scope_statement || null,
      category_scope: clone(domainSemantics?.category_scope || []),
      freshness_positioning: domainSemantics?.freshness_positioning || null,
      shopping_mode: clone(domainSemantics?.shopping_mode || null),
      business_rules: uniq([featureRecord?.eventuality_requirement, featureRecord?.support_requirement, featureRecord?.command_centre_requirement, ...(featureRecord?.completion_contract || [])]),
    },
    platform_context: {
      target_application_id: appResolution.target_application_id,
      resolution: appResolution.status,
      candidate_application_ids: appResolution.candidate_application_ids,
      applications,
    },
    actor_context: { exposure: featureRecord?.exposure || null, actor_classes: uniq(applications.flatMap((x) => x.primary_users || [])) },
    screen_context: {
      target_screen_id: targetScreenId || (screenRows.length === 1 ? screenRows[0].screen_id : null),
      target_resolution: targetScreenId || screenRows.length === 1 ? 'RESOLVED' : 'MULTI_SCREEN_TARGET_REQUIRES_SELECTION',
      module, screens: screenRows,
    },
    feature_context: {
      feature_ids: semanticPolicyActive ? featureSemanticEnvelope.features.filter((x)=>x.provider_visible).map((x)=>x.feature_id) : uniq(screenRows.flatMap((x)=>x.feature_refs)),
      all_screen_feature_ids: uniq(screenRows.flatMap((x) => x.feature_refs)),
      screen_feature_edges: clone(featureSemanticEnvelope.screen_feature_edges),
      semantic_envelope: semanticPolicyActive ? featureSemanticEnvelope : null,
      subfeature_refs: uniq(screenRows.flatMap((x) => x.subfeature_refs)),
      actions: uniq(providerInteractionIntents),
      queries: semanticPolicyActive ? [] : uniq(screenRows.flatMap((x)=>x.query_refs)),
      commands: semanticPolicyActive ? [] : uniq(screenRows.flatMap((x)=>x.command_refs)),
      events: semanticPolicyActive ? [] : uniq(screenRows.flatMap((x)=>x.event_refs)),
      eventuality_refs: uniq(screenRows.flatMap((x) => x.eventuality_refs)),
      workflow: uniq(featureRecord?.workflow || []),
      command_scope_policy: semanticPolicyActive ? 'PRIMARY_AND_DIRECT_INTERACTION_ONLY' : 'LEGACY_SCREEN_GRAPH_SCOPE',
    },
    truth: { truth_source_profile: resolveTruthSourceProfile({ repoDir, module }), screen_truth_envelope: truthEnvelope },
    capability_envelope: capabilityEnvelope,
    design_authority: {
      product_design_profile_hash: frontendProjection?.product_design_profile?.content_hash || null,
      visual_reference_spec_hash: frontendProjection?.visual_reference_spec?.content_hash || null,
      presentation_decision_hash: frontendProjection?.presentation_decision?.content_hash || null,
      archetype_refs: archetypes.map((x) => x.archetype_id), applicable_archetypes: archetypes,
      domain_brand_authority: clone(domainSemantics?.brand_authority || null),
      design_provider: 'google-stitch', figma_policy: 'EXPLICIT_OWNER_OR_AUTHORIZED_TASK_ONLY',
    },
    acceptance_contract: acceptance,
    authority_refs: {
      screen_registry_hash: registry.content_hash, screen_feature_graph_hash: graph.content_hash,
      generation_policy_hash: registryHash(repoDir, FRONTEND_GENERATION_REFS.policy),
      truth_source_registry_hash: registryHash(repoDir, FRONTEND_GENERATION_REFS.truthSources),
      archetype_registry_hash: registryHash(repoDir, FRONTEND_GENERATION_REFS.archetypes),
      domain_semantic_registry_hash: registryHash(repoDir, FRONTEND_GENERATION_REFS.domainSemantics),
      feature_realization_registry_hash: registryHash(repoDir, FRONTEND_GENERATION_REFS.featureRealizations),
    },
  };
  context.completeness = evaluateFrontendGenerationCompleteness(context);
  context.status = context.completeness.provider_dispatch_ready ? 'READY_FOR_STITCH_VISUAL_GENERATION' : context.completeness.planning_ready ? 'CONTEXT_RESOLVED_AWAITING_COMPLETENESS' : 'BLOCKED';
  context.content_hash = hashObject({ ...context, content_hash: null });
  return context;
}

export function buildStitchVisualProductionPacket({ generationContext, designBrief, qualityPacket = null, interactionPreflight = null, designSynthesis = null, blindReferenceMode = false } = {}) {
  if (!generationContext?.content_hash) throw new Error('FRONTEND_GENERATION_CONTEXT_REQUIRED');
  const completeness = evaluateFrontendGenerationCompleteness(generationContext);
  if (!completeness.provider_dispatch_ready) throw new Error(`FRONTEND_PACKET_INCOMPLETE:${completeness.failures.join(',')}`);
  const target = generationContext.screen_context.screens.find((x) => x.screen_id === generationContext.screen_context.target_screen_id);
  if (!target) throw new Error('TARGET_SCREEN_REQUIRED');
  const packet = {
    schema_version: 1, artifact_type: 'StitchVisualProductionPacket', artifact_id: `stitch-visual:${generationContext.screen_context.target_screen_id}`, status: 'READY', provider: 'google-stitch', phase: 'VISUAL_GENERATION', provenance: { generation_context_hash: generationContext.content_hash },
    generation_context_hash: generationContext.content_hash, design_brief_hash: designBrief?.content_hash || null,
    quality_packet_hash: qualityPacket?.packet_hash || qualityPacket?.content_hash || null,
    target_screen: clone(target), business_unit_context: clone(generationContext.business_unit_context),
    platform_context: clone(generationContext.platform_context), actor_context: clone(generationContext.actor_context),
    feature_context: clone(generationContext.feature_context),
    verified_truth: generationContext.truth.screen_truth_envelope.facts.filter((x) => VERIFIED_TRUTH_CLASSES.has(x.truth_class)),
    truth_policy: clone(generationContext.truth.screen_truth_envelope.truth_class_policy),
    capability_envelope: clone(generationContext.capability_envelope), design_authority: clone(generationContext.design_authority),
    interaction_design_preflight: clone(interactionPreflight),
    design_synthesis: clone(designSynthesis),
    acceptance_contract: clone(generationContext.acceptance_contract),
    reference_policy: blindReferenceMode ? 'REFERENCE_IMAGE_ACCESS_FORBIDDEN' : 'ONLY_DECLARED_VISUAL_AUTHORITY',
    instructions: [
      'Treat the packet as compiled product execution context, not as a layout prescription.',
      'Functional requirements specify truths, actions and states; they do not prescribe one component per requirement.',
      'Use the DesignSynthesisBrief to translate knowledge into a coherent experience before selecting visible sections or components.',
      'Do not expose validation, preflight, graph, provenance or internal policy material as customer-facing content.',
      'Exercise substantial creative authority over composition, hierarchy, imagery, iconography, typography, merchandising and visual storytelling within the declared freedom and archetype grammar.',
      'Do not invent product, operational, compatibility, pricing, inventory, legal, security or performance facts.',
      'Unknown facts must be omitted, deferred, or represented without fabricated values.',
      'Screen role boundaries are hard constraints.',
      'Interaction is part of the design, not a later decoration pass: preserve visual room for the preflight interaction structures, edge states and responsive behaviors.',
      'Do not mechanically apply every interaction pattern; use the preflight to make the visual composition interaction-ready.',
      'Produce coded frontend plus a rendered preview suitable for critique and later interaction enrichment.',
    ],
  };
  packet.packet_hash = hashObject({ ...packet, packet_hash: null });
  return packet;
}

export function freezeVisualAuthorityArtifact({ generationContext, candidate, critique = {}, truthLiteralLint = null, designSynthesisLint = null, promotedBy, promotionAuthority } = {}) {
  const failures = [];
  if (!generationContext?.content_hash) failures.push('GENERATION_CONTEXT_REQUIRED');
  if (!candidate?.candidate_hash && !candidate?.response_hash) failures.push('CANDIDATE_HASH_REQUIRED');
  if (!['OWNER', 'AUTHORIZED_DESIGN_AUTHORITY'].includes(promotionAuthority)) failures.push('VISUAL_AUTHORITY_PROMOTION_REQUIRES_OWNER_OR_AUTHORIZED_DESIGN_AUTHORITY');
  if (critique.verdict && !['PASS', 'ACCEPT'].includes(String(critique.verdict).toUpperCase())) failures.push('CRITIQUE_NOT_ACCEPTED');
  if (!truthLiteralLint?.content_hash) failures.push('TRUTH_LITERAL_LINT_REQUIRED');
  else if (truthLiteralLint.status !== 'PASSED') failures.push('TRUTH_LITERAL_LINT_REJECTED');
  if (!designSynthesisLint?.content_hash) failures.push('DESIGN_SYNTHESIS_LINT_REQUIRED');
  else if (designSynthesisLint.status !== 'PASSED') failures.push('DESIGN_SYNTHESIS_LINT_REJECTED');
  if (failures.length) return { ok: false, failures: uniq(failures), visual_authority: null };
  const visual = buildArtifact('VisualAuthorityArtifact', `visual-authority:${generationContext.screen_context.target_screen_id}`, {
    status: 'FROZEN', generation_context_hash: generationContext.content_hash, screen_id: generationContext.screen_context.target_screen_id,
    provider: candidate.provider || 'google-stitch', project_id: candidate.project_id || null, screen_refs: uniq(candidate.screen_refs || [candidate.screen_id]),
    candidate_hash: candidate.candidate_hash || candidate.response_hash, code_artifact_ref: candidate.code_artifact_ref || candidate.html_url || null,
    rendered_preview_ref: candidate.rendered_preview_ref || candidate.image_url || null, structure_map_ref: candidate.structure_map_ref || null,
    composition_locked: true, hierarchy_locked: true, section_order_locked: true, imagery_strategy_locked: true,
    design_tokens_ref: candidate.design_tokens_ref || null, critique_hash: critique.content_hash || hashObject(critique || {}), truth_literal_lint_hash: truthLiteralLint.content_hash, design_synthesis_lint_hash: designSynthesisLint.content_hash,
    promoted_by: promotedBy || null, promotion_authority: promotionAuthority,
    allowed_post_freeze_change: 'INTERACTION_ENRICHMENT_WITH_MINIMUM_NECESSARY_STRUCTURAL_ADJUSTMENT',
  });
  return { ok: true, failures: [], visual_authority: visual };
}

export function buildInteractionMotionEnrichmentPacket({ generationContext, visualAuthority, intelligence } = {}) {
  if (!generationContext?.content_hash) throw new Error('GENERATION_CONTEXT_REQUIRED');
  if (visualAuthority?.status !== 'FROZEN') throw new Error('FROZEN_VISUAL_AUTHORITY_REQUIRED');
  if (visualAuthority.generation_context_hash !== generationContext.content_hash) throw new Error('VISUAL_AUTHORITY_CONTEXT_HASH_MISMATCH');
  if (!intelligence?.content_hash || intelligence.generation_context_hash !== generationContext.content_hash || intelligence.visual_authority_hash !== visualAuthority.content_hash) throw new Error('INTERACTION_MOTION_INTELLIGENCE_REQUIRED');
  const candidatePatterns=[...(intelligence.required_considerations||[]),...(intelligence.strong_candidates||[]),...(intelligence.additional_candidates||[])];
  const packet = {
    schema_version: 2, artifact_type: 'InteractionMotionEnrichmentPacket', artifact_id: `interaction-motion:${generationContext.screen_context.target_screen_id}`, status: 'READY', provider: 'google-stitch', phase: 'INTERACTION_AND_MOTION_ENRICHMENT', provenance: { visual_authority_hash: visualAuthority.content_hash, interaction_intelligence_hash: intelligence.content_hash },
    generation_context_hash: generationContext.content_hash, visual_authority_hash: visualAuthority.content_hash, interaction_intelligence_hash:intelligence.content_hash,
    target_screen_id: generationContext.screen_context.target_screen_id,
    preserve: ['approved_composition', 'approved_visual_identity', 'brand_expression', 'imagery_strategy', 'primary_hierarchy_unless_reconvergence_requested'],
    capability_envelope: clone(generationContext.capability_envelope),
    screen_role_boundaries: generationContext.screen_context.screens.map((x) => ({ screen_id: x.screen_id, role_boundary: x.role_boundary })),
    expert_role:intelligence.expert_role,
    design_acuity_dimensions:clone(intelligence.acuity_dimensions),
    motion_hierarchy:clone(intelligence.motion_hierarchy),
    structural_delta_policy:clone(intelligence.structural_delta_policy),
    interaction_families_to_review:clone(intelligence.interaction_families_to_review),
    pattern_candidates:candidatePatterns.map((x)=>({
      pattern_id:x.pattern_id,family:x.family,problem_solved:x.problem_solved,priority:x.default_priority,motion_level:x.motion_level,
      motion_purpose:x.motion_purpose,avoid_when:x.avoid_when,selection:x.selection,implementation_policy:x.implementation_policy
    })),
    pattern_decision_contract:clone(intelligence.decision_contract),
    open_world_discovery_brief:clone(intelligence.open_world_discovery_brief),
    allowed_design_decisions: candidatePatterns.map((x)=>x.pattern_id),
    required_outputs: ['enriched_code', ...intelligence.required_outputs.filter((x)=>x!=='InteractionAcceptanceMatrix'), 'InteractionAcceptanceMatrix'],
    rules: [
      'Act as a principal product design engineer and interaction/motion specialist, not an animation decorator.',
      'Review the complete screen, every important control, every applicable state and every target platform before proposing effects.',
      'For each required/strong candidate pattern, return ADOPT, ADAPT, REJECT or NO_EFFECT_NEEDED with rationale.',
      'Improve professional product quality through hierarchy, disclosure, feedback, continuity, responsive recomposition, native behavior and state completeness.',
      'Preserve the approved visual identity. Bounded interaction-driven structural deltas are allowed only inside StructuralDeltaPolicy.',
      'If interaction quality requires a primary hierarchy, major section order, hero identity or information-architecture change, return RETURN_TO_VISUAL_RECONVERGENCE instead of silently redesigning.',
      'Interaction invention is allowed only for capabilities and actions present in the CapabilityEnvelope or feature contract.',
      'Capability invention is forbidden.',
      'Motion must communicate feedback, continuity, orientation, causality, hierarchy, accessibility or bounded brand expression; gratuitous animation is forbidden.',
      'NO_EFFECT_NEEDED is valid for an individual pattern, but the expert review itself is mandatory.',
      'Reduced-motion equivalents, interruptibility, state restoration, gesture-conflict behavior and platform-native behavior are mandatory.',
      'Touch, keyboard/focus where relevant, accessibility semantics, responsive recomposition and performance budgets must be specified.',
      'External references are inspiration/evidence only. Do not copy external code, components, assets or pixel layouts.',
    ],
  };
  packet.packet_hash = hashObject({ ...packet, packet_hash: null });
  return packet;
}

export function freezeExperienceAuthorityArtifact({
  generationContext, visualAuthority, interactionArtifact, acceptance,
  promotedBy = 'SYSTEM_AFTER_ACCEPTANCE', promotionAuthority = 'AUTHORIZED_DESIGN_AUTHORITY',
} = {}) {
  const failures = [];
  if (visualAuthority?.status !== 'FROZEN') failures.push('FROZEN_VISUAL_AUTHORITY_REQUIRED');
  if (!interactionArtifact?.content_hash && !interactionArtifact?.response_hash) failures.push('INTERACTION_ARTIFACT_HASH_REQUIRED');
  if (acceptance?.passed !== true) failures.push('INTERACTION_ACCEPTANCE_REQUIRED');
  if (!['OWNER', 'AUTHORIZED_DESIGN_AUTHORITY'].includes(promotionAuthority)) failures.push('EXPERIENCE_AUTHORITY_PROMOTION_NOT_AUTHORIZED');
  if (failures.length) return { ok: false, failures: uniq(failures), experience_authority: null };
  const artifact = buildArtifact('ExperienceAuthorityArtifact', `experience-authority:${generationContext.screen_context.target_screen_id}`, {
    status: 'FROZEN', generation_context_hash: generationContext.content_hash, visual_authority_hash: visualAuthority.content_hash,
    interaction_artifact_hash: interactionArtifact.content_hash || interactionArtifact.response_hash,
    interaction_intent_map: clone(interactionArtifact.interaction_intent_map || []), gesture_map: clone(interactionArtifact.gesture_map || []),
    motion_spec: clone(interactionArtifact.motion_spec || []), advanced_component_decisions: clone(interactionArtifact.advanced_component_decisions || []),
    interaction_acceptance_hash: acceptance.content_hash || hashObject(acceptance), visual_locked: true, interaction_locked: true,
    productionization_policy: 'PRESERVE_EXPERIENCE_AUTHORITY_NO_REDESIGN', promoted_by: promotedBy, promotion_authority: promotionAuthority,
  });
  return { ok: true, failures: [], experience_authority: artifact };
}

export function buildProductionBindingContract({ generationContext, experienceAuthority, bindings = {} } = {}) {
  if (!generationContext?.content_hash || experienceAuthority?.status !== 'FROZEN') throw new Error('GENERATION_CONTEXT_AND_FROZEN_EXPERIENCE_AUTHORITY_REQUIRED');
  if (experienceAuthority.generation_context_hash !== generationContext.content_hash) throw new Error('EXPERIENCE_AUTHORITY_CONTEXT_HASH_MISMATCH');
  const target = generationContext.screen_context.screens.find((x) => x.screen_id === generationContext.screen_context.target_screen_id);
  const actionBindings = (target?.action_refs || []).map((action) => ({ action, binding: bindings.actions?.[action] || null, status: bindings.actions?.[action] ? 'BOUND' : 'UNBOUND' }));
  const factBindings = generationContext.truth.screen_truth_envelope.facts.filter((x) => VERIFIED_TRUTH_CLASSES.has(x.truth_class)).map((fact) => ({
    fact_id: fact.fact_id, path: fact.path, runtime_binding: bindings.facts?.[fact.fact_id] || bindings.facts?.[fact.path] || null,
    source_id: fact.source_id, provenance_ref: fact.provenance_ref,
    status: (bindings.facts?.[fact.fact_id] || bindings.facts?.[fact.path]) ? 'BOUND' : 'STATIC_VERIFIED_OR_PENDING_BINDING',
  }));
  return buildArtifact('ProductionBindingContract', `production-binding:${generationContext.screen_context.target_screen_id}`, {
    status: actionBindings.some((x) => x.status === 'UNBOUND') ? 'BINDING_INCOMPLETE' : 'READY_FOR_PRODUCTIONIZATION',
    generation_context_hash: generationContext.content_hash, experience_authority_hash: experienceAuthority.content_hash,
    screen_id: generationContext.screen_context.target_screen_id, action_bindings: actionBindings, fact_bindings: factBindings,
    queries: uniq(target?.query_refs || []), commands: uniq(target?.command_refs || []), events: uniq(target?.event_refs || []),
    policy: { preserve_visual_parity: true, preserve_interaction_parity: true, real_data_binding_required: true, provider_runtime_dependency_forbidden: true, redesign_forbidden: true },
  });
}

export function lintCandidateFacts({ generationContext, candidateFacts = [] } = {}) {
  if (!generationContext?.truth?.screen_truth_envelope) throw new Error('GENERATION_CONTEXT_TRUTH_REQUIRED');
  const verified = generationContext.truth.screen_truth_envelope.facts.filter((x) => VERIFIED_TRUTH_CLASSES.has(x.truth_class));
  const byPath = new Map(verified.flatMap((x) => [[x.path, x], [x.fact_id, x]]).filter(([k]) => k));
  const findings = [];
  for (const row of candidateFacts || []) {
    const key = row.path || row.fact_id || row.label;
    const authority = byPath.get(key);
    if (!authority) { findings.push({ finding_id: `UNVERIFIED_FACT:${key}`, severity: 'BLOCKING', value: clone(row.value) }); continue; }
    if (JSON.stringify(authority.value) !== JSON.stringify(row.value)) findings.push({ finding_id: `FACT_VALUE_MISMATCH:${key}`, severity: 'BLOCKING', expected: clone(authority.value), observed: clone(row.value) });
  }
  return buildArtifact('TruthLiteralLint', `truth-lint:${generationContext.screen_context.target_screen_id || 'unknown'}`, {
    status: findings.length ? 'REJECTED' : 'PASSED', findings, verified_fact_count: verified.length,
  });
}
