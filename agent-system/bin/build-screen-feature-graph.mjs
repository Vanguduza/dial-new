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

const APPLICATION_PROFILES = Object.freeze([
  { application_id: 'DIAL_CONSUMER_ANDROID', display_name: 'DIAL Consumer — Android', application_class: 'CUSTOMER_APP', primary_users: ['CUSTOMERS'], platform_targets: ['ANDROID'], app_family_refs: ['DIAL_CONSUMER'], module_scope: ['SPARE','TECH','GROCERIES','LAUNDRY','VHUB','CARE','ASSIST','PROJECTS'], native_screen_refs: ["SCREEN:SHOP:DIAL_SHOP_HOME","SCREEN:SHOP:ALL_DEPARTMENTS","SCREEN:SHOP:UNIVERSAL_SEARCH_ASK_DIAL","SCREEN:SHOP:ADAPTIVE_SEARCH_RESULTS","SCREEN:SHOP:DIAL_LENS_CAPTURE","SCREEN:SHOP:ADAPTIVE_PRODUCT_DETAIL","SCREEN:SHOP:SELLER_OFFER_COMPARISON","SCREEN:SHOP:SHOPPING_BAG_DOMAIN_CARTS_OVERVIEW","SCREEN:SHOP:SHOPPING_ACTIVITY_ORDER_PROJECTION","SCREEN:SHOP:SHOPPING_RESOLUTION","SCREEN:SHOP:GROCERIES_HOME","SCREEN:SHOP:SPARE_PARTS_HOME","SCREEN:SHOP:FITMENT_COMPATIBILITY_DETAIL","SCREEN:SHOP:SUPPORT_CASE_CENTRE"], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE'], screen_requirement: 'REQUIRED' },
  { application_id: 'DIAL_CONSUMER_IOS', display_name: 'DIAL Consumer — iOS', application_class: 'CUSTOMER_APP', primary_users: ['CUSTOMERS'], platform_targets: ['IOS'], app_family_refs: ['DIAL_CONSUMER'], module_scope: ['SPARE','TECH','GROCERIES','LAUNDRY','VHUB','CARE','ASSIST','PROJECTS'], native_screen_refs: ["SCREEN:SHOP:DIAL_SHOP_HOME","SCREEN:SHOP:ALL_DEPARTMENTS","SCREEN:SHOP:UNIVERSAL_SEARCH_ASK_DIAL","SCREEN:SHOP:ADAPTIVE_SEARCH_RESULTS","SCREEN:SHOP:DIAL_LENS_CAPTURE","SCREEN:SHOP:ADAPTIVE_PRODUCT_DETAIL","SCREEN:SHOP:SELLER_OFFER_COMPARISON","SCREEN:SHOP:SHOPPING_BAG_DOMAIN_CARTS_OVERVIEW","SCREEN:SHOP:SHOPPING_ACTIVITY_ORDER_PROJECTION","SCREEN:SHOP:SHOPPING_RESOLUTION","SCREEN:SHOP:GROCERIES_HOME","SCREEN:SHOP:SPARE_PARTS_HOME","SCREEN:SHOP:FITMENT_COMPATIBILITY_DETAIL","SCREEN:SHOP:SUPPORT_CASE_CENTRE"], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE'], screen_requirement: 'REQUIRED' },
  { application_id: 'DIAL_CONSUMER_WEB', display_name: 'DIAL Consumer — responsive web', application_class: 'CUSTOMER_APP', primary_users: ['CUSTOMERS'], platform_targets: ['WEB'], app_family_refs: ['DIAL_WEB'], module_scope: ['SPARE','TECH','GROCERIES','LAUNDRY','VHUB','CARE','ASSIST','PROJECTS'], native_screen_refs: ["SCREEN:SHOP:DIAL_SHOP_HOME","SCREEN:SHOP:ALL_DEPARTMENTS","SCREEN:SHOP:UNIVERSAL_SEARCH_ASK_DIAL","SCREEN:SHOP:ADAPTIVE_SEARCH_RESULTS","SCREEN:SHOP:DIAL_LENS_CAPTURE","SCREEN:SHOP:ADAPTIVE_PRODUCT_DETAIL","SCREEN:SHOP:SELLER_OFFER_COMPARISON","SCREEN:SHOP:SHOPPING_BAG_DOMAIN_CARTS_OVERVIEW","SCREEN:SHOP:SHOPPING_ACTIVITY_ORDER_PROJECTION","SCREEN:SHOP:SHOPPING_RESOLUTION","SCREEN:SHOP:GROCERIES_HOME","SCREEN:SHOP:SPARE_PARTS_HOME","SCREEN:SHOP:FITMENT_COMPATIBILITY_DETAIL","SCREEN:SHOP:SUPPORT_CASE_CENTRE"], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE'], screen_requirement: 'REQUIRED' },
  { application_id: 'DIAL_CONSUMER_WHATSAPP', display_name: 'DIAL Consumer — WhatsApp companion', application_class: 'CONVERSATIONAL_COMPANION', primary_users: ['CUSTOMERS'], platform_targets: ['WHATSAPP'], app_family_refs: ['WHATSAPP'], module_scope: ['SPARE','TECH','GROCERIES','LAUNDRY','VHUB','CARE','ASSIST','PROJECTS'], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE'], screen_requirement: 'CHANNEL_DEPENDENT' },
  { application_id: 'DIAL_PUBLIC_WEB', display_name: 'DIAL public web home', application_class: 'PUBLIC_WEB', primary_users: ['GUESTS','CUSTOMERS'], platform_targets: ['WEB'], explicit_capability_refs: ['HOME-S001','HOME-S002','HOME-S003','HOME-S004','HOME-S005'], native_screen_refs: ['SCREEN:HOME:PUBLIC_DIAL_SERVICE_ROUTER_LANDING'], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE','DIAL_HOME_SERVICE_ROUTER_ARCHITECTURE'], screen_requirement: 'REQUIRED' },
  { application_id: 'DIAL_HEALTH_ANDROID', display_name: 'Dial Health — Android', application_class: 'SPECIALIST_CUSTOMER_APP', primary_users: ['PATIENTS','FAMILIES'], platform_targets: ['ANDROID'], app_family_refs: ['DIAL_HEALTH'], module_scope: ['HEALTH'], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE'], screen_requirement: 'REQUIRED' },
  { application_id: 'DIAL_HEALTH_IOS', display_name: 'Dial Health — iOS', application_class: 'SPECIALIST_CUSTOMER_APP', primary_users: ['PATIENTS','FAMILIES'], platform_targets: ['IOS'], app_family_refs: ['DIAL_HEALTH'], module_scope: ['HEALTH'], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE'], screen_requirement: 'REQUIRED' },
  { application_id: 'DIAL_HEALTH_WEB', display_name: 'Dial Health — web', application_class: 'SPECIALIST_CUSTOMER_APP', primary_users: ['PATIENTS','FAMILIES'], platform_targets: ['WEB'], app_family_refs: ['DIAL_HEALTH_WEB'], module_scope: ['HEALTH'], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE'], screen_requirement: 'REQUIRED' },
  { application_id: 'DIAL_HEALTH_WHATSAPP', display_name: 'Dial Health — WhatsApp', application_class: 'SPECIALIST_CONVERSATIONAL', primary_users: ['PATIENTS','FAMILIES'], platform_targets: ['WHATSAPP'], app_family_refs: ['WHATSAPP_HEALTH'], module_scope: ['HEALTH'], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE'], screen_requirement: 'CHANNEL_DEPENDENT' },
  { application_id: 'DIAL_BUSINESS_WEB', display_name: 'DIAL Business — web workspace', application_class: 'BUSINESS_CLIENT', primary_users: ['B2B_CUSTOMERS','FLEET_MANAGERS','PROJECT_CLIENTS'], platform_targets: ['WEB'], app_family_refs: ['DIAL_BUSINESS','DIAL_BUSINESS_WEB'], module_scope: ['FLEET','PROJECTS','VHUB'], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE','OPERATIONAL_AND_PROVIDER_APP_SURFACE_PLAN'], screen_requirement: 'REQUIRED' },
  { application_id: 'DIAL_BUSINESS_MOBILE_COMPANION', display_name: 'DIAL Business — native mobile companion', application_class: 'BUSINESS_CLIENT_COMPANION', primary_users: ['B2B_CUSTOMERS'], platform_targets: ['NATIVE_MOBILE_WHERE_JUSTIFIED'], app_family_refs: ['DIAL_BUSINESS'], module_scope: ['FLEET','PROJECTS','VHUB'], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE'], screen_requirement: 'OPTIONAL_REUSE' },
  { application_id: 'TECHNICIAN_ANDROID', display_name: 'Technician Android', application_class: 'OPERATIONAL_PROVIDER_APP', primary_users: ['FIELD_TECHNICIANS'], platform_targets: ['ANDROID','JETPACK_COMPOSE'], explicit_feature_refs: ['TECH-F011'], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE','OPERATIONAL_AND_PROVIDER_APP_SURFACE_PLAN'], screen_requirement: 'REQUIRED' },
  { application_id: 'COURIER_ANDROID', display_name: 'Courier Android', application_class: 'OPERATIONAL_PROVIDER_APP', primary_users: ['COURIERS'], platform_targets: ['ANDROID','JETPACK_COMPOSE'], capability_family_refs: ['COURIER_ANDROID'], explicit_feature_refs: ['SPARE-F011','GROC-F011','GROC-F013','LAUN-F003','LAUN-F012','HEALTH-F016'], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE','OPERATIONAL_AND_PROVIDER_APP_SURFACE_PLAN'], screen_requirement: 'REQUIRED' },
  { application_id: 'SUPPLIER_MERCHANT_WEB', display_name: 'Supplier / Merchant Web', application_class: 'OPERATIONAL_PROVIDER_APP', primary_users: ['SPARE_SUPPLIERS','GROCERY_MERCHANTS'], platform_targets: ['WEB'], capability_family_refs: ['SUPPLIER_WEB'], explicit_feature_refs: ['SPARE-F014','GROC-F001','GROC-F004','GROC-F005','GROC-F018'], native_screen_refs: ["SCREEN:SHOP:SELLER_CENTRE","SCREEN:SHOP:PRODUCT_MEDIA_STUDIO","SCREEN:SHOP:SELLER_FULFILMENT_WORKSPACE"], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE','OPERATIONAL_AND_PROVIDER_APP_SURFACE_PLAN'], screen_requirement: 'REQUIRED' },
  { application_id: 'GROCERY_SHOPPER', display_name: 'Grocery Shopper', application_class: 'FIELD_OPERATIONS_APP', primary_users: ['DIAL_SHOPPERS'], platform_targets: ['NATIVE_OR_PWA_AFTER_FIELD_VALIDATION'], explicit_feature_refs: ['GROC-F006'], authority_refs: ['OPERATIONAL_AND_PROVIDER_APP_SURFACE_PLAN'], screen_requirement: 'REQUIRED' },
  { application_id: 'LAUNDRY_FACILITY', display_name: 'Laundry Facility', application_class: 'FACILITY_OPERATIONS_APP', primary_users: ['INTAKE_STAFF','PRODUCTION_STAFF','QC_STAFF'], platform_targets: ['TABLET','WEB'], explicit_feature_refs: ['LAUN-F004','LAUN-F005','LAUN-F006','LAUN-F008','LAUN-F009','LAUN-F010','LAUN-F011','LAUN-F016','LAUN-F017','LAUN-F018'], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE','OPERATIONAL_AND_PROVIDER_APP_SURFACE_PLAN'], screen_requirement: 'REQUIRED' },
  { application_id: 'WAREHOUSE_ANDROID', display_name: 'Warehouse Android', application_class: 'INTERNAL_OPERATIONS_APP', primary_users: ['WAREHOUSE_STAFF'], platform_targets: ['ANDROID'], explicit_feature_refs: ['CORP-F013'], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE','OPERATIONAL_AND_PROVIDER_APP_SURFACE_PLAN'], screen_requirement: 'REQUIRED' },
  { application_id: 'STAFF_WEB', display_name: 'Staff Web', application_class: 'INTERNAL_STAFF_APP', primary_users: ['EMPLOYEES','MANAGERS'], platform_targets: ['WEB'], app_family_refs: ['STAFF_WEB'], module_scope: ['CORPORATE'], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE','OPERATIONAL_AND_PROVIDER_APP_SURFACE_PLAN'], screen_requirement: 'REQUIRED' },
  { application_id: 'COMMAND_CENTRE', display_name: 'Command Centre', application_class: 'OPERATOR_CONTROL_PLANE', primary_users: ['DIAL_OPERATORS','LEADERS'], platform_targets: ['WEB'], app_family_refs: ['COMMAND_CENTRE'], native_screen_refs: ["SCREEN:SHOP:FULFILMENT_CONTROL","SCREEN:SHOP:SEARCH_RELEVANCE_CONSOLE","SCREEN:SHOP:SUPPORT_CASE_CENTRE"], authority_refs: ['DIAL_CLIENT_APP_ARCHITECTURE','OPERATIONAL_AND_PROVIDER_APP_SURFACE_PLAN'], screen_requirement: 'REQUIRED' },
  { application_id: 'DIAL_HEALTH_PROVIDER_SURFACES', display_name: 'Dial Health provider surfaces', application_class: 'SPECIALIST_PROVIDER_APP', primary_users: ['CLINICIANS','PHARMACIES','FACILITIES'], platform_targets: ['SPECIALIST_PROVIDER_SURFACE'], explicit_feature_refs: ['HEALTH-F002','HEALTH-F003','HEALTH-F004'], authority_refs: ['OPERATIONAL_AND_PROVIDER_APP_SURFACE_PLAN'], screen_requirement: 'REQUIRED' },
]);

const KNOWN_NON_SCREEN_FAMILIES = Object.freeze(new Set(['ALL','ALL_CUSTOMER_APPS','CHATWOOT','DEVELOPMENT_SYSTEM','POS','SERVER','SUPPORT','ANDROID','IOS']));

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
  const names = ['screen_to_features', 'feature_to_screens', 'screen_to_subfeatures', 'subfeature_to_screens', 'screen_to_capabilities', 'capability_to_screens', 'screen_to_eventualities', 'eventuality_to_screens', 'screen_to_actions', 'action_to_screens', 'screen_to_queries', 'query_to_screens', 'screen_to_commands', 'command_to_screens', 'screen_to_events', 'event_to_screens', 'screen_to_app_families', 'app_family_to_screens', 'screen_to_app_surfaces', 'app_surface_to_screens', 'screen_to_routes', 'route_to_screens', 'screen_to_modules', 'module_to_screens', 'screen_to_applications', 'application_to_screens', 'feature_to_applications', 'application_to_features', 'capability_to_applications', 'application_to_capabilities'];
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

  const supplementalScreens = [
    {
      screen_id: 'SCREEN:HOME:PUBLIC_DIAL_SERVICE_ROUTER_LANDING',
      module: 'HOME',
      title: 'Public DIAL service-router landing',
      screen_kind: 'HOME_ENTRY',
      branch_spaces: [],
      feature_refs: [],
      subfeature_refs: [],
      supporting_capability_refs: ['HOME-S001','HOME-S002','HOME-S003','HOME-S004','HOME-S005'],
      eventuality_refs: [],
      app_family_refs: ['DIAL_WEB'],
      app_surface_refs: [],
      route_refs: ['/'],
      action_refs: ['route_to_service','search_or_describe_intent','continue_active_work','check_service_availability','sign_in_when_required','open_support'],
      query_refs: [], command_refs: [], event_refs: [], source_realization_refs: [],
      authority_kind: 'CAPABILITY_AND_INFORMATION_ARCHITECTURE_AUTHORITY',
      source_authority_refs: ['docs/dial/final-audit/12_CLIENT_EXPERIENCE/DIAL_CLIENT_APP_ARCHITECTURE.md','docs/dial/final-audit/16_HOME_IDENTITY_WHATSAPP/DIAL_HOME_SERVICE_ROUTER_ARCHITECTURE.md'],
    },
  ];
  for (const s of supplementalScreens) {
    if (screens.has(s.screen_id)) throw new Error(`DUPLICATE_SUPPLEMENTAL_SCREEN:${s.screen_id}`);
    screens.set(s.screen_id, {
      ...s,
      branch_spaces: new Set(s.branch_spaces), feature_refs: new Set(s.feature_refs), subfeature_refs: new Set(s.subfeature_refs),
      supporting_capability_refs: new Set(s.supporting_capability_refs), eventuality_refs: new Set(s.eventuality_refs), app_family_refs: new Set(s.app_family_refs),
      app_surface_refs: new Set(s.app_surface_refs), route_refs: new Set(s.route_refs), action_refs: new Set(s.action_refs), query_refs: new Set(s.query_refs),
      command_refs: new Set(s.command_refs), event_refs: new Set(s.event_refs), source_realization_refs: new Set(s.source_realization_refs),
    });
    s.feature_refs.forEach((x) => {
      if (!featureById.has(x)) throw new Error(`SUPPLEMENTAL_SCREEN_UNKNOWN_FEATURE:${s.screen_id}:${x}`);
      add(idx.screen_to_features, s.screen_id, x); add(idx.feature_to_screens, x, s.screen_id);
    });
    s.supporting_capability_refs.forEach((x) => { add(idx.screen_to_capabilities, s.screen_id, x); add(idx.capability_to_screens, x, s.screen_id); });
    s.app_family_refs.forEach((x) => { add(idx.screen_to_app_families, s.screen_id, x); add(idx.app_family_to_screens, x, s.screen_id); });
    s.route_refs.forEach((x) => { add(idx.screen_to_routes, s.screen_id, x); add(idx.route_to_screens, x, s.screen_id); });
    s.action_refs.forEach((x) => { add(idx.screen_to_actions, s.screen_id, x); add(idx.action_to_screens, x, s.screen_id); });
    add(idx.screen_to_modules, s.screen_id, s.module); add(idx.module_to_screens, s.module, s.screen_id);
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

  const featureScreens = (featureId) => idx.feature_to_screens.get(featureId) || new Set();
  const applicationRows = APPLICATION_PROFILES.map((profile) => {
    const featureRefs = new Set(profile.explicit_feature_refs || []);
    for (const f of features) {
      const familyMatch = (profile.app_family_refs || []).some((x) => (f.app_families || []).includes(x));
      const moduleMatch = !(profile.module_scope || []).length || profile.module_scope.includes(f.module);
      if (familyMatch && moduleMatch) featureRefs.add(f.feature_id);
    }
    const screenRefs = new Set(profile.native_screen_refs || []);
    for (const featureId of featureRefs) for (const screenId of featureScreens(featureId)) screenRefs.add(screenId);
    const capabilityRefs = new Set(profile.explicit_capability_refs || []);
    const capabilityFamilies = uniq([...(profile.capability_family_refs || []), ...(profile.app_family_refs || [])]);
    for (const capability of capabilities) {
      if (capabilityFamilies.some((x) => (capability.app_families || []).includes(x))) capabilityRefs.add(capability.capability_id);
    }
    for (const screenId of screenRefs) add(idx.screen_to_applications, screenId, profile.application_id);
    for (const screenId of screenRefs) add(idx.application_to_screens, profile.application_id, screenId);
    for (const featureId of featureRefs) { add(idx.feature_to_applications, featureId, profile.application_id); add(idx.application_to_features, profile.application_id, featureId); }
    for (const capabilityId of capabilityRefs) { add(idx.capability_to_applications, capabilityId, profile.application_id); add(idx.application_to_capabilities, profile.application_id, capabilityId); }
    const coverage_state = screenRefs.size
      ? 'BOUND_TO_CANONICAL_SCREENS'
      : capabilityRefs.size
        ? 'CAPABILITY_ONLY_NO_CANONICAL_SCREEN_MAPPING'
        : profile.screen_requirement === 'OPTIONAL_REUSE'
          ? 'OPTIONAL_NO_DEDICATED_SCREEN_MAPPING'
          : 'NO_CANONICAL_SCREEN_MAPPING';
    return { ...profile, feature_refs: [...featureRefs].sort(), screen_refs: [...screenRefs].sort(), supporting_capability_refs: [...capabilityRefs].sort(), coverage_state };
  }).sort((a,b) => a.application_id.localeCompare(b.application_id));

  for (const screen of screenRows) screen.application_refs = [...(idx.screen_to_applications.get(screen.screen_id) || [])].sort();

  const allDeclaredFamilies = uniq([
    ...features.flatMap((f) => f.app_families || []),
    ...capabilities.flatMap((c) => c.app_families || []),
  ]);
  const profileFamilies = new Set(APPLICATION_PROFILES.flatMap((x) => [...(x.app_family_refs || []), ...(x.capability_family_refs || [])]));
  const declaredChannelFamilies = allDeclaredFamilies.map((family) => ({
    family_id: family,
    classification: PLATFORM_PROFILES[family]?.channel_class || (profileFamilies.has(family) ? 'APPLICATION_BOUND_FAMILY' : (KNOWN_NON_SCREEN_FAMILIES.has(family) ? 'NON_SCREEN_OR_SCOPE_FAMILY' : 'UNCLASSIFIED')),
    platform_targets: PLATFORM_PROFILES[family]?.platform_targets || [],
    feature_ref_count: features.filter((f) => (f.app_families || []).includes(family)).length,
    capability_ref_count: capabilities.filter((c) => (c.app_families || []).includes(family)).length,
  }));

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
    application_platform_count: applicationRows.length,
    declared_channel_family_count: declaredChannelFamilies.length,
    screen_feature_realization_count: realizations.length,
  };
  const gaps = {
    orphan_subfeature_refs: orphanSubfeatures,
    missing_supporting_capability_refs: missingCapabilities,
    missing_eventuality_refs: missingEventualities,
    unclassified_app_families: declaredChannelFamilies.filter((x) => x.classification === 'UNCLASSIFIED').map((x) => x.family_id),
    application_screen_coverage_gaps: applicationRows.filter((x) => x.screen_requirement === 'REQUIRED' && x.coverage_state !== 'BOUND_TO_CANONICAL_SCREENS').map((x) => x.application_id),
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
    application_platforms: applicationRows,
    declared_channel_families: declaredChannelFamilies,
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
