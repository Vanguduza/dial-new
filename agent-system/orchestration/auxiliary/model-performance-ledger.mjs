import { readJson, writeJsonAtomic, appendJsonl } from '../state-store.mjs';

const LEDGER_REL = 'operations/auxiliary/ledger/model-performance.json';
const EVENTS_REL = 'operations/auxiliary/ledger/model-performance.jsonl';

function now() { return new Date().toISOString(); }
function routeKey(modelId, archetype) { return `${modelId}::${archetype}`; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

export function loadPerformanceLedger(root) {
  return readJson(LEDGER_REL, { schema_version: 1, routes: {}, updated_at: null }, root);
}

export function recordModelOutcome({ root, modelId, archetype, metrics = {}, benchmarkVersion = null }) {
  const ledger = loadPerformanceLedger(root);
  const key = routeKey(modelId, archetype);
  const prior = ledger.routes[key] ?? { model_id: modelId, archetype, state: 'DISCOVERED', samples: [] };
  const sample = {
    at: now(), benchmark_version: benchmarkVersion,
    schema_valid: Boolean(metrics.schema_valid),
    evidence_fidelity: num(metrics.evidence_fidelity),
    unsupported_claim_rate: num(metrics.unsupported_claim_rate),
    correction_rate: num(metrics.correction_rate),
    latency_ms: num(metrics.latency_ms),
    timeout: Boolean(metrics.timeout),
    provider_error: Boolean(metrics.provider_error),
  };
  const samples = [...(prior.samples ?? []), sample].slice(-500);
  ledger.routes[key] = { ...prior, samples, updated_at: now() };
  ledger.updated_at = now();
  writeJsonAtomic(LEDGER_REL, ledger, root);
  appendJsonl(EVENTS_REL, { event: 'HAIF_MODEL_OUTCOME_RECORDED', model_id: modelId, archetype, at: now() }, root);
  return ledger.routes[key];
}

function aggregate(samples) {
  const n = samples.length || 1;
  const latencies = samples.map((s) => Math.max(0, num(s.latency_ms))).sort((a, b) => a - b);
  const p95Index = latencies.length ? Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1) : 0;
  return {
    sample_count: samples.length,
    schema_valid_rate: samples.filter((s) => s.schema_valid).length / n,
    evidence_fidelity: samples.reduce((a, s) => a + num(s.evidence_fidelity), 0) / n,
    unsupported_claim_rate: samples.reduce((a, s) => a + num(s.unsupported_claim_rate), 0) / n,
    correction_rate: samples.reduce((a, s) => a + num(s.correction_rate), 0) / n,
    timeout_rate: samples.filter((s) => s.timeout).length / n,
    provider_error_rate: samples.filter((s) => s.provider_error).length / n,
    average_latency_ms: latencies.length ? latencies.reduce((a, value) => a + value, 0) / latencies.length : 0,
    p95_latency_ms: latencies.length ? latencies[p95Index] : 0,
  };
}

export function evaluatePromotion(routeRecord, thresholds) {
  if (!thresholds || typeof thresholds !== 'object') return { eligible: false, reason: 'NUMERICAL_GATES_NOT_CONFIGURED' };
  const samples = routeRecord?.samples ?? [];
  const metrics = aggregate(samples);
  const checks = {
    sample_count: metrics.sample_count >= Number(thresholds.minimum_fixture_count ?? Infinity),
    schema_valid_rate: metrics.schema_valid_rate >= Number(thresholds.schema_valid_rate_floor ?? Infinity),
    evidence_fidelity: metrics.evidence_fidelity >= Number(thresholds.evidence_fidelity_floor ?? Infinity),
    unsupported_claim_rate: metrics.unsupported_claim_rate <= Number(thresholds.unsupported_claim_rate_ceiling ?? -Infinity),
    correction_rate: metrics.correction_rate <= Number(thresholds.correction_rate_ceiling ?? -Infinity),
    timeout_rate: metrics.timeout_rate <= Number(thresholds.timeout_rate_ceiling ?? -Infinity),
    provider_error_rate: metrics.provider_error_rate <= Number(thresholds.provider_error_rate_ceiling ?? -Infinity),
    p95_latency_ms: metrics.p95_latency_ms <= Number(thresholds.p95_latency_ms_ceiling ?? -Infinity),
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  return { eligible: failed.length === 0, failed, metrics };
}

export function setModelLifecycle({ root, modelId, archetype, state, thresholds = null, benchmarkVersion = null }) {
  const allowed = new Set(['DISCOVERED', 'CANARY', 'BENCHMARKED', 'APPROVED', 'CHAMPION', 'CHALLENGER', 'DEGRADED', 'QUARANTINED', 'REMOVED']);
  if (!allowed.has(state)) throw new Error('invalid HAIF model lifecycle state');
  const ledger = loadPerformanceLedger(root);
  const key = routeKey(modelId, archetype);
  const current = ledger.routes[key] ?? { model_id: modelId, archetype, samples: [] };
  if (['APPROVED', 'CHAMPION', 'CHALLENGER'].includes(state)) {
    const evalResult = evaluatePromotion(current, thresholds);
    if (!evalResult.eligible) throw new Error(`HAIF model promotion gates failed: ${evalResult.reason ?? evalResult.failed.join(',')}`);
  }
  ledger.routes[key] = { ...current, state, benchmark_version: benchmarkVersion, thresholds: thresholds ?? current.thresholds ?? null, updated_at: now() };
  ledger.updated_at = now();
  writeJsonAtomic(LEDGER_REL, ledger, root);
  appendJsonl(EVENTS_REL, { event: 'HAIF_MODEL_LIFECYCLE_CHANGED', model_id: modelId, archetype, state, benchmark_version: benchmarkVersion, at: now() }, root);
  return ledger.routes[key];
}

export function performanceProjection({ root, modelId, archetype }) {
  const record = loadPerformanceLedger(root).routes[routeKey(modelId, archetype)] ?? null;
  if (!record) return null;
  return { ...record, aggregate: aggregate(record.samples ?? []) };
}
