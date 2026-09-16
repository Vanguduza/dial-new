// DEC-032 model availability discovery. This layer establishes subscription presence and freshness;
// it never uses the performance ledger to exclude a model.
import { hashObject, nowIso } from './adaptive-routing-core.mjs';

const PRESENT = new Set(['AVAILABLE', 'PRESENT', 'HEALTHY']);
const ABSENT = new Set(['ABSENT', 'UNAVAILABLE']);

function modelFromLiveProbe(modelId, probe) {
  if (probe?.discovered_by !== 'ANTIGRAVITY_MODEL_DISCOVERY') return null;
  if (probe?.subscription_source !== 'google-subscription' || probe?.harness_id !== 'antigravity') return null;
  return {
    model_id: modelId,
    provider: 'google',
    family: probe.family || 'provider_native',
    lineage: modelId,
    subscription_source: 'google-subscription',
    availability: String(probe.availability || 'PRESENT').toUpperCase(),
    worker_eligible: probe.worker_eligible !== false,
    manager_eligible: false,
    capabilities: {
      coding: true,
      reasoning: true,
      visual_reasoning: true,
      long_context: true,
      structured_output: true,
      tool_reasoning: true,
      architecture: true,
      debugging: true,
      review: true,
    },
    cost_profile: 'STANDARD',
    latency_profile: 'STANDARD',
    reliability_profile: 'PROVIDER_ESTABLISHED',
    context_window: null,
    known_strengths: ['provider-native Antigravity execution'],
    known_failure_modes: [],
    identity: {
      resolved_version: probe.display_name || modelId,
      capability_fingerprint: probe.capability_fingerprint || null,
      qualification_epoch: 1,
      discovery_source: 'ANTIGRAVITY_MODEL_DISCOVERY',
    },
    qualification: {
      state: 'PRESENT',
      basis: 'SUBSCRIPTION_PRESENCE',
      confirmed_by: 'LIVE_DISCOVERY',
      prior_record: 'LIVE_ANTIGRAVITY_MODEL_DISCOVERY',
    },
    registry_entry_kind: 'LIVE_DISCOVERY',
  };
}

export function discoverModelAvailability({ modelRegistry, health = {}, nowMs = Date.now() } = {}) {
  if (!modelRegistry) throw new Error('MODEL_REGISTRY_REQUIRED');
  const probes = health.models || {};
  const probeRows = Object.entries(probes).filter(([, value]) => value && typeof value === 'object');
  const observedTimes = probeRows.map(([, value]) => Date.parse(value.observed_at || '')).filter(Number.isFinite);
  const observedAt = observedTimes.length ? new Date(Math.max(...observedTimes)).toISOString() : modelRegistry.discovery?.last_observed_at || null;
  const seededIds = new Set((modelRegistry.models || []).map((model) => model.model_id));
  const dynamic = probeRows
    .filter(([modelId]) => !seededIds.has(modelId))
    .map(([modelId, probe]) => modelFromLiveProbe(modelId, probe))
    .filter(Boolean);
  const models = [...(modelRegistry.models || []), ...dynamic].map((model) => {
    const probe = probes[model.model_id];
    if (!probe) return model;
    const availability = String(probe.availability || probe.state || '').toUpperCase();
    const subscriptionPresent = probe.subscription_present === true || PRESENT.has(availability);
    const explicitlyAbsent = probe.subscription_present === false || ABSENT.has(availability);
    const state = subscriptionPresent ? 'PRESENT' : explicitlyAbsent ? (availability === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'ABSENT') : model.qualification?.state;
    return {
      ...model,
      availability: availability || model.availability,
      identity: {
        ...model.identity,
        resolved_version: probe.resolved_version || probe.display_name || model.identity?.resolved_version || null,
        capability_fingerprint: probe.capability_fingerprint || model.identity?.capability_fingerprint || null,
      },
      qualification: {
        ...model.qualification,
        state,
        basis: subscriptionPresent ? 'SUBSCRIPTION_PRESENCE' : model.qualification?.basis,
        confirmed_by: probeRows.length ? 'LIVE_DISCOVERY' : model.qualification?.confirmed_by,
      },
    };
  });
  const discovery = {
    ...modelRegistry.discovery,
    last_observed_at: observedAt,
    last_observed_hash: hashObject({ observed_at: observedAt, probes }),
    observed_model_count: probeRows.length || undefined,
  };
  return { registry: { ...modelRegistry, models, discovery }, observed_at: observedAt, evidence_hash: discovery.last_observed_hash, now_ms: nowMs };
}

export function assertModelAvailableForDispatch({ modelRegistry, modelId, health = {}, nowMs = Date.now() } = {}) {
  const discovered = discoverModelAvailability({ modelRegistry, health, nowMs });
  const observed = Date.parse(discovered.registry.discovery?.last_observed_at || '');
  const maxAge = Number(discovered.registry.discovery?.max_discovery_age_ms || 0);
  if (!Number.isFinite(observed) || (maxAge > 0 && nowMs - observed > maxAge)) throw new Error('REFUSED_STALE_MODEL_DISCOVERY');
  const model = discovered.registry.models.find((item) => item.model_id === modelId);
  if (!model || model.qualification?.state !== 'PRESENT') throw new Error(`MODEL_NOT_PRESENT_ON_SUBSCRIPTION:${modelId}`);
  const probe = health.models?.[modelId] || {};
  if (probe.quota_state === 'EXHAUSTED') throw new Error(`MODEL_QUOTA_EXHAUSTED:${modelId}`);
  if (probe.health_state === 'UNHEALTHY') throw new Error(`MODEL_UNHEALTHY:${modelId}`);
  return { ok: true, model, observed_at: discovered.observed_at, evidence_hash: discovered.evidence_hash, checked_at: nowIso() };
}
