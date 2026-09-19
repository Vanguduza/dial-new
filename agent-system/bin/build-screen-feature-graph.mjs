import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const BASE = 'docs/dial/final-audit/11_FEATURE_REALIZATION';
const INPUTS = {
  features: `${BASE}/FEATURE_REALIZATION_REGISTRY.json`,
  subfeatures: `${BASE}/SUBFEATURE_FUNCTION_REGISTRY.json`,
  capabilities: `${BASE}/SUPPORTING_CAPABILITY_REGISTRY.json`,
  eventualities: `${BASE}/EVENTUALITY_PLAYBOOK_REGISTRY.json`,
  platformFunctions: `${BASE}/SHARED_PLATFORM_FUNCTION_REGISTRY.json`,
  customerEndpoints: 'docs/dial/final-audit/12_CLIENT_EXPERIENCE/CUSTOMER_ENDPOINT_REGISTRY.json',
};
const OUTPUTS = {
  screens: 'agent-system/registries/SCREEN_REGISTRY.json',
  graph: 'agent-system/registries/SCREEN_FEATURE_GRAPH.json',
};

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const uniq = (xs = []) => [...new Set(xs.filter(Boolean).map(String))].sort();
const slug = (v) => String(v || 'unknown').trim().toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const hash = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const add = (map, key, value) => { if (!key || !value) return; const s = map.get(key) || new Set(); s.add(value); map.set(key, s); };
const mapObj = (m) => Object.fromEntries([...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [...v].sort()]));

const PLATFORM_PROFILES = Object.freeze({
  DIAL_CONSUMER: { channel_class: 'NATIVE_CONSUMER_APP', platform_targets: ['ANDROID', 'IOS'], authority_ref: 'DIAL_CLIENT_APP_ARCHITECTURE' },
  DIAL_WEB: { channel_class: 'RESPONSIVE_WEB', platform_targets: ['WEB'], authority_ref: 'DIAL_CLIENT_APP_ARCHITECTURE' },
  WHATSAPP: { channel_class: 'CONVERSATIONAL_COMPANION', platform_targets: ['WHATSAPP'], authority_ref: 'DIAL_CLIENT_APP_ARCHITECTURE' },
  DIAL_HEALTH: { channel_class: 'SPECIALIST_NATIVE_APP', platform_targets: ['ANDROID', 'IOS'], authority_ref: 'DIAL_CLIENT_APP_ARCHITECTURE' },
  DIAL_HEALTH_WEB: { channel_class: 'SPECIALIST_WEB', platform_targets: ['WEB'], authority_ref: 'DIAL_CLIENT_APP_ARCHITECTURE' },
  WHATSAPP_HEALTH: { channel_class: 'SPECIALIST_CONVERSATIONAL', platform_targets: ['WHATSAPP'], authority_ref: 'DIAL_CLIENT_APP_ARCHITECTURE' },
  DIAL_BUSINESS: { channel_class: 'BUSINESS_CLIENT', platform_targets: ['BUSINESS_CLIENT'], authority_ref: 'DIAL_CLIENT_APP_ARCHITECTURE' },
  DIAL_BUSINESS_WEB: { channel_class: 'BUSINESS_WEB', platform_targets: ['WEB'], authority_ref: 'DIAL_CLIENT_APP_ARCHITECTURE' },
  COMMAND_CENTRE: { channel_class: 'OPERATOR_CONTROL', platform_targets: ['WEB'], authority_ref: 'DIAL_CLIENT_APP_ARCHITECTURE' },
  STAFF_WEB: { channel_class: 'STAFF_WEB', platform_targets: ['WEB'], authority_ref: 'DIAL_CLIENT_APP_ARCHITECTURE' },
  DIAL_BUSINESS_INTERNAL: { channel_class: 'INTERNAL_BUSINESS_APP', platform_targets: ['INTERNAL_WEB'], authority_ref: 'DIAL_CLIENT_APP_ARCHITECTURE' },
});

function classifyScreen(label = '') {
  const t = String(label).toUpperCase();
  if (/HOME\/ENTRY/.test(t)) return 'HOME_ENTRY';
  if (/DETAIL\/STATE/.test(t)) return 'DETAIL_STATE';
  if (/ACTIONS SHEET|ACTION SHEET/.test(t)) return 'ACTION_SHEET';
  if (/ISSUE\/SUPPORT/.test(t)) return 'ISSUE_SUPPORT';
  if (/HISTORY\/TIMELINE|AUDIT TIMELINE/.test(t)) return 'TIMELINE';
  if (/SEARCH\/FILTER\/BROWSE/.test(t)) return 'SEARCH_RESULTS';
  if (/QUEUE/.test(t)) return 'QUEUE';
  if (/PANEL/.test(t)) return 'PANEL';
  if (/DRAWER/.test(t)) return 'DRAWER';
  if (/MAP|TRACKER/.test(t)) return 'TRACKING';
  return 'DOMAIN_SCREEN';
}

function makeIndexBag() {
  const names = ['screen_to_features', 'feature_to_screens', 'screen_to_subfeatures', 'subfeature_to_screens', 'screen_to_capabilities', 'capability_to_screens', 'screen_to_eventualities', 'eventuality_to_screens', 'screen_to_actions', 'action_to_screens', 'screen_to_queries', 'query_to_screens', 'screen_to_commands', 'command_to_screens', 'screen_to_events', 'event_to_screens', 'screen_to_app_families', 'app_family_to_screens', 'screen_to_app_surfaces', 'app_surface_to_screens', 'screen_to_routes', 'route_to_screens', 'screen_to_modules', 'module_to_screens'];
  return Object.fromEntries(names.map((n) => [n, new Map()]));
}

export function buildCanonicalScreenFeatureGraph() {
  const features = readJson(INPUTS.features);
  const subfeatures = readJson(INPUTS.subfeatures);
  const capabilities = readJson(INPUTS.capabilities);
  const eventualities = readJson(INPUTS.eventualities);
  const platformFunctions = readJson(INPUTS.platformFunctions);
  const customerEndpoints = readJson(INPUTS.customerEndpoints);

  const featureById = new Map(features.map((x) => [x.feature_id, x]));
  const subByParent = new Map();
  for (const sf of subfeatures) { const a = subByParent.get(sf.parent_feature_id) || []; a.push(sf); subByParent.set(sf.parent_feature_id, a); }
  const endpointByFeature = new Map(customerEndpoints.map((x) => [x.feature_id, x]));
  const capabilityIds = new Set(capabilities.map((x) => x.capability_id));
  const eventualityIds = new Set(eventualities.map((x) => x.eventuality_id));

  const screens = new Map();
  const realizations = [];
  const idx = makeIndexBag();
  const appSurfaces = new Map();

  for (const f of features) {
    const module = f.module || 'UNKNOWN';
    const featureId = f.feature_id;
    const childIds = uniq((subByParent.get(featureId) || []).map((x) => x.subfeature_id));
    const capRefs = uniq(f.supporting_capability_refs || []);
    const evRefs = uniq(f.applicable_eventuality_refs || []);
    const endpoint = endpointByFeature.get(featureId) || null;
    const families = uniq(f.app_families || []);

    for (const family of families) {
      const id = `APP_SURFACE:${slug(module)}:${slug(family)}`;
      if (!appSurfaces.has(id)) appSurfaces.set(id, { app_surface_id: id, module, app_family: family, platform_profile: PLATFORM_PROFILES[family] || { channel_class: 'UNCLASSIFIED', platform_targets: [], authority_ref: null }, screen_refs: new Set(), feature_refs: new Set() });
      appSurfaces.get(id).feature_refs.add(featureId);
    }

    for (const raw of (f.screens || [])) {
      const label = typeof raw === 'string' ? raw : (raw.screen_id || raw.surface_id || raw.id || raw.name || raw.title || JSON.stringify(raw));
      const screenId = `SCREEN:${slug(module)}:${slug(label)}`;
      let s = screens.get(screenId);
      if (!s) {
        s = {
          screen_id: screenId,
          module,
          title: String(label),
          screen_kind: classifyScreen(label),
          branch_spaces: new Set(),
          feature_refs: new Set(),
          subfeature_refs: new Set(),
          supporting_capability_refs: new Set(),
          eventuality_refs: new Set(),
          app_family_refs: new Set(),
          app_surface_refs: new Set(),
          route_refs: new Set(),
          action_refs: new Set(),
          query_refs: new Set(),
          command_refs: new Set(),
          event_refs: new Set(),
          source_realization_refs: new Set(),
        };
        screens.set(screenId, s);
      }

      if (f.branch_space) s.branch_spaces.add(f.branch_space);
      s.feature_refs.add(featureId);
      childIds.forEach((x) => s.subfeature_refs.add(x));
      capRefs.forEach((x) => s.supporting_capability_refs.add(x));
      evRefs.forEach((x) => s.eventuality_refs.add(x));
      families.forEach((family) => {
        s.app_family_refs.add(family);
        const as = `APP_SURFACE:${slug(module)}:${slug(family)}`;
        s.app_surface_refs.add(as);
        appSurfaces.get(as)?.screen_refs.add(screenId);
      });
      if (f.primary_route) s.route_refs.add(f.primary_route);
      uniq([...(f.customer_or_operator_actions || []), ...(endpoint?.actions || [])]).forEach((x) => s.action_refs.add(x));
      uniq(f.queries || []).forEach((x) => s.query_refs.add(x));
      uniq(f.commands || []).forEach((x) => s.command_refs.add(x));
      uniq(f.events || []).forEach((x) => s.event_refs.add(x));
      if (f.realization_id) s.source_realization_refs.add(f.realization_id);

      const realization = {
        realization_edge_id: `SFR:${featureId}:${hash(screenId).slice(0, 12)}`,
        screen_id: screenId,
        feature_id: featureId,
        module,
        app_families: families,
        app_surface_refs: families.map((x) => `APP_SURFACE:${slug(module)}:${slug(x)}`).sort(),
        route: f.primary_route || endpoint?.route || null,
        workflow: uniq(f.workflow || []),
        actions: uniq([...(f.customer_or_operator_actions || []), ...(endpoint?.actions || [])]),
        queries: uniq(f.queries || []),
        commands: uniq(f.commands || []),
        events: uniq(f.events || []),
        subfeature_refs: childIds,
        supporting_capability_refs: capRefs,
        eventuality_refs: evRefs,
        provenance: {
          feature_realization_id: f.realization_id || null,
          feature_id: featureId,
          screen_source_field: 'FEATURE_REALIZATION_REGISTRY.screens',
          endpoint_registry_bound: Boolean(endpoint),
        },
      };
      realizations.push(realization);

      add(idx.screen_to_features, screenId, featureId); add(idx.feature_to_screens, featureId, screenId);
      childIds.forEach((x) => { add(idx.screen_to_subfeatures, screenId, x); add(idx.subfeature_to_screens, x, screenId); });
      capRefs.forEach((x) => { add(idx.screen_to_capabilities, screenId, x); add(idx.capability_to_screens, x, screenId); });
      evRefs.forEach((x) => { add(idx.screen_to_eventualities, screenId, x); add(idx.eventuality_to_screens, x, screenId); });
      realization.actions.forEach((x) => { add(idx.screen_to_actions, screenId, x); add(idx.action_to_screens, x, screenId); });
      realization.queries.forEach((x) => { add(idx.screen_to_queries, screenId, x); add(idx.query_to_screens, x, screenId); });
      realization.commands.forEach((x) => { add(idx.screen_to_commands, screenId, x); add(idx.command_to_screens, x, screenId); });
      realization.events.forEach((x) => { add(idx.screen_to_events, screenId, x); add(idx.event_to_screens, x, screenId); });
      families.forEach((x) => {
        add(idx.screen_to_app_families, screenId, x); add(idx.app_family_to_screens, x, screenId);
        const as = `APP_SURFACE:${slug(module)}:${slug(x)}`;
        add(idx.screen_to_app_surfaces, screenId, as); add(idx.app_surface_to_screens, as, screenId);
      });
      if (f.primary_route) { add(idx.screen_to_routes, screenId, f.primary_route); add(idx.route_to_screens, f.primary_route, screenId); }
      add(idx.screen_to_modules, screenId, module); add(idx.module_to_screens, module, screenId);
    }
  }

  const orphanSubfeatures = subfeatures.filter((x) => !featureById.has(x.parent_feature_id)).map((x) => x.subfeature_id);
  const missingCapabilities = uniq(features.flatMap((f) => (f.supporting_capability_refs || []).filter((x) => !capabilityIds.has(x))));
  const missingEventualities = uniq(features.flatMap((f) => (f.applicable_eventuality_refs || []).filter((x) => !eventualityIds.has(x))));

  const screenRows = [...screens.values()].map((s) => ({
    ...s,
    branch_spaces: [...s.branch_spaces].sort(),
    feature_refs: [...s.feature_refs].sort(),
    subfeature_refs: [...s.subfeature_refs].sort(),
    supporting_capability_refs: [...s.supporting_capability_refs].sort(),
    eventuality_refs: [...s.eventuality_refs].sort(),
    app_family_refs: [...s.app_family_refs].sort(),
    app_surface_refs: [...s.app_surface_refs].sort(),
    route_refs: [...s.route_refs].sort(),
    action_refs: [...s.action_refs].sort(),
    query_refs: [...s.query_refs].sort(),
    command_refs: [...s.command_refs].sort(),
    event_refs: [...s.event_refs].sort(),
    source_realization_refs: [...s.source_realization_refs].sort(),
    state_contract: {
      required: ['READY', 'LOADING', 'EMPTY', 'ERROR', 'DEGRADED'],
      conditional: ['PARTIAL', 'OFFLINE', 'STALE', 'PERMISSION_DENIED', 'SYNCING', 'CONFLICT', 'SUCCESS'],
      authority_ref: 'frontend-product-experience.mjs:SURFACE_STATE_IDS',
    },
    packet_injection_contract: {
      inject_before_truth_hydration: true,
      inject_feature_graph: true,
      inject_capability_graph: true,
      inject_eventuality_graph: true,
      missing_required_mapping: 'FAIL_CLOSED',
    },
  })).sort((a, b) => a.screen_id.localeCompare(b.screen_id));

  const appSurfaceRows = [...appSurfaces.values()].map((x) => ({
    ...x,
    screen_refs: [...x.screen_refs].sort(),
    feature_refs: [...x.feature_refs].sort(),
  })).sort((a, b) => a.app_surface_id.localeCompare(b.app_surface_id));

  const sourceHashes = Object.fromEntries(Object.entries(INPUTS).map(([k, p]) => [k, hash(readJson(p))]));
  const stats = {
    feature_count: features.length,
    subfeature_count: subfeatures.length,
    supporting_capability_count: capabilities.length,
    eventuality_count: eventualities.length,
    shared_platform_function_count: platformFunctions.length,
    customer_endpoint_count: customerEndpoints.length,
    source_screen_reference_count: features.reduce((n, f) => n + (f.screens || []).length, 0),
    canonical_screen_count: screenRows.length,
    app_surface_count: appSurfaceRows.length,
    screen_feature_realization_count: realizations.length,
  };
  const gaps = {
    orphan_subfeature_refs: orphanSubfeatures,
    missing_supporting_capability_refs: missingCapabilities,
    missing_eventuality_refs: missingEventualities,
    unclassified_app_families: uniq(features.flatMap((f) => (f.app_families || []).filter((x) => !PLATFORM_PROFILES[x]))),
  };

  const registry = {
    schema_version: 1,
    registry_version: 'dial-canonical-screen-registry-1.0',
    authority: 'PROJECT_TRUTH_DERIVED_CANONICAL_REGISTRY',
    generated_from: INPUTS,
    source_hashes: sourceHashes,
    stats,
    gaps,
    screens: screenRows,
    app_surfaces: appSurfaceRows,
  };
  registry.content_hash = hash({ ...registry, content_hash: null });

  const graph = {
    schema_version: 1,
    graph_version: 'dial-screen-feature-graph-1.0',
    authority: 'BIDIRECTIONAL_CANONICAL_SCREEN_FEATURE_GRAPH',
    screen_registry_hash: registry.content_hash,
    source_hashes: sourceHashes,
    stats,
    gaps,
    screen_feature_realizations: realizations.sort((a, b) => a.realization_edge_id.localeCompare(b.realization_edge_id)),
    indexes: Object.fromEntries(Object.entries(idx).map(([k, v]) => [k, mapObj(v)])),
  };
  graph.content_hash = hash({ ...graph, content_hash: null });
  return { registry, graph };
}

function writeOrCheck(rel, obj, check) {
  const text = JSON.stringify(obj, null, 2) + '\n';
  const abs = path.join(ROOT, rel);
  if (check) {
    if (!fs.existsSync(abs) || fs.readFileSync(abs, 'utf8') !== text) {
      console.error(`STALE ${rel}`);
      process.exitCode = 1;
    } else console.log(`OK ${rel}`);
  } else {
    fs.writeFileSync(abs, text);
    console.log(`WROTE ${rel}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  const { registry, graph } = buildCanonicalScreenFeatureGraph();
  writeOrCheck(OUTPUTS.screens, registry, check);
  writeOrCheck(OUTPUTS.graph, graph, check);
  if (!process.exitCode) console.log(JSON.stringify({ state: 'COMPLETE', check, stats: registry.stats, gaps: registry.gaps, screen_registry_hash: registry.content_hash, graph_hash: graph.content_hash }, null, 2));
}
