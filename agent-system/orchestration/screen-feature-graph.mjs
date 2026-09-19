import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SCREEN_REGISTRY_REF = 'agent-system/registries/SCREEN_REGISTRY.json';
export const SCREEN_FEATURE_GRAPH_REF = 'agent-system/registries/SCREEN_FEATURE_GRAPH.json';

const readJson = (repoDir, rel) => JSON.parse(fs.readFileSync(path.join(repoDir, rel), 'utf8'));
const uniq = (xs = []) => [...new Set(xs.filter(Boolean).map(String))].sort();
const hashObject = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

export function loadCanonicalScreenGraph(repoDir) {
  const registry = readJson(repoDir, SCREEN_REGISTRY_REF);
  const graph = readJson(repoDir, SCREEN_FEATURE_GRAPH_REF);
  if (graph.screen_registry_hash !== registry.content_hash) throw new Error('SCREEN_FEATURE_GRAPH_REGISTRY_HASH_MISMATCH');
  return { registry, graph };
}

export function getScreenById({ repoDir, screenId } = {}) {
  if (!repoDir || !screenId) throw new Error('screen lookup requires repoDir and screenId');
  const { registry } = loadCanonicalScreenGraph(repoDir);
  return registry.screens.find((x) => x.screen_id === screenId) || null;
}

export function getScreensForFeature({ repoDir, featureId } = {}) {
  if (!repoDir || !featureId) throw new Error('feature screen lookup requires repoDir and featureId');
  const { registry, graph } = loadCanonicalScreenGraph(repoDir);
  const ids = graph.indexes?.feature_to_screens?.[featureId] || [];
  const byId = new Map(registry.screens.map((x) => [x.screen_id, x]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export function getFeaturesForScreen({ repoDir, screenId } = {}) {
  if (!repoDir || !screenId) throw new Error('screen feature lookup requires repoDir and screenId');
  const { graph } = loadCanonicalScreenGraph(repoDir);
  return graph.indexes?.screen_to_features?.[screenId] || [];
}

export function buildScreenFeatureProjection({ repoDir, featureRecord = null, surfaceManifest = null } = {}) {
  const featureId = featureRecord?.feature_id || null;
  const { registry, graph } = loadCanonicalScreenGraph(repoDir);
  const mappedIds = featureId ? (graph.indexes?.feature_to_screens?.[featureId] || []) : [];
  const requested = new Set((surfaceManifest?.surfaces || []).flatMap((x) => [x.source_ref, x.title].filter(Boolean).map(String)));
  const byId = new Map(registry.screens.map((x) => [x.screen_id, x]));
  const selected = mappedIds.map((id) => byId.get(id)).filter(Boolean).filter((screen) => !requested.size || requested.has(screen.title) || requested.has(screen.screen_id));
  const screens = (selected.length ? selected : mappedIds.map((id) => byId.get(id)).filter(Boolean)).map((s) => ({
    screen_id: s.screen_id,
    title: s.title,
    module: s.module,
    screen_kind: s.screen_kind,
    app_family_refs: s.app_family_refs,
    app_surface_refs: s.app_surface_refs,
    route_refs: s.route_refs,
    feature_refs: s.feature_refs,
    subfeature_refs: s.subfeature_refs,
    supporting_capability_refs: s.supporting_capability_refs,
    eventuality_refs: s.eventuality_refs,
    action_refs: s.action_refs,
    query_refs: s.query_refs,
    command_refs: s.command_refs,
    event_refs: s.event_refs,
    state_contract: s.state_contract,
    packet_injection_contract: s.packet_injection_contract,
  }));
  const status = featureId && mappedIds.length === 0 ? 'BLOCKED_FEATURE_HAS_NO_CANONICAL_SCREEN_MAPPING' : 'RESOLVED';
  const artifact = {
    schema_version: 1,
    artifact_type: 'ScreenFeatureProjection',
    artifact_id: `screen-feature:${featureId || surfaceManifest?.unit_lineage_id || 'unknown'}`,
    status,
    feature_id: featureId,
    screen_refs: screens.map((x) => x.screen_id),
    screens,
    relations: {
      subfeature_refs: uniq(screens.flatMap((x) => x.subfeature_refs)),
      supporting_capability_refs: uniq(screens.flatMap((x) => x.supporting_capability_refs)),
      eventuality_refs: uniq(screens.flatMap((x) => x.eventuality_refs)),
      action_refs: uniq(screens.flatMap((x) => x.action_refs)),
      query_refs: uniq(screens.flatMap((x) => x.query_refs)),
      command_refs: uniq(screens.flatMap((x) => x.command_refs)),
      event_refs: uniq(screens.flatMap((x) => x.event_refs)),
      app_family_refs: uniq(screens.flatMap((x) => x.app_family_refs)),
      app_surface_refs: uniq(screens.flatMap((x) => x.app_surface_refs)),
      route_refs: uniq(screens.flatMap((x) => x.route_refs)),
    },
    authority: {
      screen_registry_ref: SCREEN_REGISTRY_REF,
      screen_registry_hash: registry.content_hash,
      graph_ref: SCREEN_FEATURE_GRAPH_REF,
      graph_hash: graph.content_hash,
      injection_phase: 'BEFORE_TRUTH_HYDRATION_AND_STITCH_PACKET_COMPILATION',
      missing_mapping_policy: 'FAIL_CLOSED',
    },
  };
  artifact.content_hash = hashObject({ ...artifact, content_hash: null });
  return artifact;
}
