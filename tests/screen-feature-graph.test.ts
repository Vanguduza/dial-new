import { test, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { buildCanonicalScreenFeatureGraph } from '../agent-system/bin/build-screen-feature-graph.mjs';
import { buildScreenFeatureProjection, getFeaturesForScreen, getScreensForFeature, loadCanonicalScreenGraph } from '../agent-system/orchestration/screen-feature-graph.mjs';
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
  expect(registry.gaps.orphan_subfeature_refs).toEqual([]);
  expect(registry.gaps.missing_supporting_capability_refs).toEqual([]);
  expect(registry.gaps.missing_eventuality_refs).toEqual([]);
  expect(registry.gaps.unclassified_app_families).toEqual([]);
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
