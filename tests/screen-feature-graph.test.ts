// @ts-nocheck
import { test, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { buildCanonicalScreenFeatureGraph } from '../agent-system/bin/build-screen-feature-graph.mjs';
import { buildScreenFeatureProjection, getApplicationsForFeature, getApplicationsForScreen, getFeaturesForApplication, getFeaturesForScreen, getScreensForApplication, getScreensForFeature, loadCanonicalScreenGraph } from '../agent-system/orchestration/screen-feature-graph.mjs';
import { buildSurfaceManifest } from '../agent-system/orchestration/frontend-product-experience.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(here, '..');
const realizationPath = path.join(repoDir, 'docs/dial/final-audit/11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json');
const subfeaturePath = path.join(repoDir, 'docs/dial/final-audit/11_FEATURE_REALIZATION/SUBFEATURE_FUNCTION_REGISTRY.json');

test('canonical screen graph covers every declared feature screen reference without dangling core refs', () => {
  const features = JSON.parse(fs.readFileSync(realizationPath, 'utf8'));
  const subfeatures = JSON.parse(fs.readFileSync(subfeaturePath, 'utf8'));
  const { registry, graph } = buildCanonicalScreenFeatureGraph();
  const expectedRefs = features.reduce((n, f) => n + (f.screens || []).length, 0);
  expect(registry.stats.feature_count).toBe(features.length);
  expect(registry.stats.subfeature_count).toBe(subfeatures.length);
  expect(registry.stats.source_screen_reference_count).toBe(expectedRefs);
  expect(registry.stats.screen_feature_realization_count).toBe(expectedRefs);
  expect(registry.stats.canonical_screen_count).toBeGreaterThan(0);
  expect(registry.stats.app_surface_count).toBeGreaterThan(0);
  expect(registry.stats.application_platform_count).toBe(20);
  expect(registry.stats.declared_channel_family_count).toBe(22);
  expect(registry.gaps.orphan_subfeature_refs).toEqual([]);
  expect(registry.gaps.missing_supporting_capability_refs).toEqual([]);
  expect(registry.gaps.missing_eventuality_refs).toEqual([]);
  expect(registry.gaps.unclassified_app_families).toEqual([]);
  expect(registry.gaps.application_screen_coverage_gaps).toEqual([]);
  expect(graph.screen_registry_hash).toBe(registry.content_hash);
});

test('feature and screen indexes are bidirectionally symmetric', () => {
  const { graph } = loadCanonicalScreenGraph(repoDir);
  for (const [featureId, screens] of Object.entries(graph.indexes.feature_to_screens)) {
    for (const screenId of screens) expect(graph.indexes.screen_to_features[screenId]).toContain(featureId);
  }
  for (const [screenId, features] of Object.entries(graph.indexes.screen_to_features)) {
    for (const featureId of features) expect(graph.indexes.feature_to_screens[featureId]).toContain(screenId);
  }
});

test('subfeature, capability and eventuality reverse indexes resolve from real feature mappings', () => {
  const { graph } = loadCanonicalScreenGraph(repoDir);
  const pairs = [
    ['screen_to_subfeatures', 'subfeature_to_screens'],
    ['screen_to_capabilities', 'capability_to_screens'],
    ['screen_to_eventualities', 'eventuality_to_screens'],
  ];
  for (const [forward, reverse] of pairs) {
    for (const [screenId, refs] of Object.entries(graph.indexes[forward])) {
      for (const ref of refs) expect(graph.indexes[reverse][ref]).toContain(screenId);
    }
  }
});

test('every application family projection has at least one canonical screen', () => {
  const { registry, graph } = loadCanonicalScreenGraph(repoDir);
  expect(registry.app_surfaces.length).toBeGreaterThan(0);
  for (const surface of registry.app_surfaces) {
    expect(surface.screen_refs.length).toBeGreaterThan(0);
    expect(graph.indexes.app_surface_to_screens[surface.app_surface_id]).toEqual(surface.screen_refs);
  }
});

test('screen projection injects feature graph before frontend design packet compilation', () => {
  const features = JSON.parse(fs.readFileSync(realizationPath, 'utf8'));
  const feature = features.find((x) => x.feature_id === 'SPARE-F001');
  const unit = { unit_lineage_id: 'DU-SCREEN-GRAPH', unit_revision_hash: 'r1', feature_ids: ['SPARE-F001'], knowledge_route_ids: ['PRODUCT_EXPERIENCE'] };
  const surfaceManifest = buildSurfaceManifest({ unit, featureRecord: feature, contractRecord: null });
  const projection = buildScreenFeatureProjection({ repoDir, featureRecord: feature, surfaceManifest });
  expect(projection.status).toBe('RESOLVED');
  expect(projection.screen_refs.length).toBe(feature.screens.length);
  expect(projection.authority.injection_phase).toBe('BEFORE_TRUTH_HYDRATION_AND_STITCH_PACKET_COMPILATION');
  expect(projection.authority.missing_mapping_policy).toBe('FAIL_CLOSED');
  expect(projection.relations.eventuality_refs.length).toBeGreaterThan(0);
});

test('direct lookups work in both directions for a canonical Spare screen', () => {
  const screens = getScreensForFeature({ repoDir, featureId: 'SPARE-F001' });
  expect(screens.length).toBeGreaterThan(0);
  const first = screens[0];
  expect(getFeaturesForScreen({ repoDir, screenId: first.screen_id })).toContain('SPARE-F001');
});

test('all canonical DIAL application/platform nodes are screen-bound with bidirectional indexes', () => {
  const { registry, graph } = loadCanonicalScreenGraph(repoDir);
  expect(registry.application_platforms).toHaveLength(20);
  for (const application of registry.application_platforms) {
    if (application.screen_requirement === 'REQUIRED') expect(application.screen_refs.length).toBeGreaterThan(0);
    for (const screenId of application.screen_refs) {
      expect(graph.indexes.application_to_screens[application.application_id]).toContain(screenId);
      expect(graph.indexes.screen_to_applications[screenId]).toContain(application.application_id);
      const screen = registry.screens.find((x) => x.screen_id === screenId);
      expect(screen?.application_refs).toContain(application.application_id);
    }
  }
});

test('public web home is a canonical capability-authority screen instead of a fabricated feature', () => {
  const screens = getScreensForApplication({ repoDir, applicationId: 'DIAL_PUBLIC_WEB' });
  expect(screens).toHaveLength(1);
  expect(screens[0].screen_id).toBe('SCREEN:HOME:PUBLIC_DIAL_SERVICE_ROUTER_LANDING');
  expect(screens[0].feature_refs).toEqual([]);
  expect(screens[0].supporting_capability_refs).toEqual(['HOME-S001','HOME-S002','HOME-S003','HOME-S004','HOME-S005']);
  expect(getApplicationsForScreen({ repoDir, screenId: screens[0].screen_id })).toContain('DIAL_PUBLIC_WEB');
});

test('courier Android resolves shared delivery feature authority instead of creating a second delivery state machine', () => {
  const expected = ['SPARE-F011','GROC-F011','GROC-F013','LAUN-F003','LAUN-F012','HEALTH-F016'].sort();
  const features = getFeaturesForApplication({ repoDir, applicationId: 'COURIER_ANDROID' });
  expect(features).toEqual(expected);
  expect(getScreensForApplication({ repoDir, applicationId: 'COURIER_ANDROID' }).length).toBeGreaterThan(0);
  for (const featureId of expected) expect(getApplicationsForFeature({ repoDir, featureId })).toContain('COURIER_ANDROID');
});


test('shopping screens compose existing domain authorities without creating a duplicate SHOP feature family', () => {
  const featureRegistry = JSON.parse(fs.readFileSync(path.join(repoDir, 'agent-system/registries/FEATURE_REGISTRY.json'), 'utf8'));
  const { registry } = loadCanonicalScreenGraph(repoDir);
  expect(featureRegistry.some((x) => String(x.feature_id).startsWith('SHOP-F'))).toBe(false);

  const shopScreens = registry.screens.filter((x) => x.screen_id.startsWith('SCREEN:SHOP:'));
  expect(shopScreens.length).toBeGreaterThanOrEqual(18);

  expect(getFeaturesForScreen({ repoDir, screenId: 'SCREEN:SHOP:DIAL_SHOP_HOME' })).toEqual(
    expect.arrayContaining(['SPARE-F002','GROC-F001'])
  );
  expect(getFeaturesForScreen({ repoDir, screenId: 'SCREEN:SHOP:FITMENT_COMPATIBILITY_DETAIL' })).toEqual(['SPARE-F003']);

  const bag = shopScreens.find((x) => x.screen_id === 'SCREEN:SHOP:SHOPPING_BAG_DOMAIN_CARTS_OVERVIEW');
  expect(bag?.action_refs).toContain('open_domain_cart');
  expect(bag?.action_refs).not.toContain('checkout_all_branches');

  const media = shopScreens.find((x) => x.screen_id === 'SCREEN:SHOP:PRODUCT_MEDIA_STUDIO');
  expect(media?.feature_refs).toEqual(expect.arrayContaining(['SPARE-F004','SPARE-F014','GROC-F001','GROC-F018','PLAT-F004']));
});
