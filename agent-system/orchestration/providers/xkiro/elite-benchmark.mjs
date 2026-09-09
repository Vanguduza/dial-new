import crypto from 'node:crypto';
import path from 'node:path';
import { defaultProviderRatePolicy } from '../../auxiliary/rate-limiter.mjs';
import { writeJsonAtomic } from '../../state-store.mjs';
import { assertAssembledRequestSafe } from '../../auxiliary/data-classification.mjs';
import { parseStructuredAuxiliaryOutput } from '../../auxiliary/evidence-packet.mjs';
import { evaluatePromotion, loadPerformanceLedger, recordModelOutcome, setModelLifecycle } from '../../auxiliary/model-performance-ledger.mjs';
import { buildXKiroRequest, callXKiroChat } from './xkiro-client.mjs';
import { fetchXKiroCatalog, persistCatalogSnapshot } from './xkiro-catalog.mjs';
import { qualificationCandidates } from './xkiro-model-router.mjs';
import { readSecureXKiroKey } from './xkiro-qualification.mjs';
import { fetchXKiroUsage, persistUsageSnapshot } from './xkiro-usage.mjs';

export const ELITE_BENCHMARK_VERSION = 'haif-elite-benchmark-v1';
export const ELITE_BENCHMARK_THRESHOLDS = Object.freeze({
  minimum_fixture_count: 12,
  schema_valid_rate_floor: 0.98,
  evidence_fidelity_floor: 0.95,
  unsupported_claim_rate_ceiling: 0.02,
  correction_rate_ceiling: 0.05,
  timeout_rate_ceiling: 0.05,
  provider_error_rate_ceiling: 0.05,
  p95_latency_ms_ceiling: 60_000,
});

function fixtures(archetype) {
  return Array.from({ length: 12 }, (_, index) => {
    const sourceId = `benchmark-source-${index + 1}`;
    const value = `VALUE_${String(index + 1).padStart(2, '0')}`;
    return {
      source_id: sourceId,
      value,
      purpose: `Extract the explicit value from admitted evidence for ${archetype}. Return one factual claim with claim_key fact_value and evidence_refs containing ${sourceId}.`,
      evidence: { source_id: sourceId, text: `The explicit benchmark value is ${value}. No other value is asserted.` },
    };
  });
}

function metricFromResult({ content, fixture, latencyMs }) {
  try {
    const parsed = parseStructuredAuxiliaryOutput(content);
    const claims = parsed.claims ?? [];
    const normalized = claims.map((item) => typeof item === 'string' ? { claim: item, evidence_refs: [] } : item);
    const supported = normalized.filter((claim) => Array.isArray(claim.evidence_refs) && claim.evidence_refs.includes(fixture.source_id));
    const valueClaims = supported.filter((claim) => String(claim.claim ?? claim.text ?? '').includes(fixture.value));
    const unsupported = normalized.filter((claim) => (claim.evidence_refs ?? []).some((ref) => ref !== fixture.source_id));
    const denominator = Math.max(1, normalized.length);
    return {
      schema_valid: true,
      evidence_fidelity: valueClaims.length > 0 ? 1 : supported.length > 0 ? 0.5 : 0,
      unsupported_claim_rate: unsupported.length / denominator,
      correction_rate: 0,
      latency_ms: latencyMs,
      timeout: false,
      provider_error: false,
    };
  } catch {
    return { schema_valid: false, evidence_fidelity: 0, unsupported_claim_rate: 1, correction_rate: 1, latency_ms: latencyMs, timeout: false, provider_error: false };
  }
}

function scorePromotion(evalResult) {
  if (!evalResult?.eligible) return -Infinity;
  const m = evalResult.metrics;
  const latencyPenalty = Math.min(0.2, Number(m.p95_latency_ms ?? 0) / 300000);
  return (m.schema_valid_rate * 0.30) + (m.evidence_fidelity * 0.40)
    + ((1 - m.unsupported_claim_rate) * 0.15) + ((1 - m.provider_error_rate) * 0.10)
    + ((1 - m.timeout_rate) * 0.05) - latencyPenalty;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export async function benchmarkEliteModels({ project, root, providerRoot, keyFile, archetype, fetchImpl = globalThis.fetch, paceMs = null } = {}) {
  if (!['dial', 'dde'].includes(project)) throw new Error('HAIF benchmark project must be dial or dde');
  if (!archetype) throw new Error('HAIF benchmark archetype is required');
  const apiKey = readSecureXKiroKey(keyFile);
  const catalog = await fetchXKiroCatalog({ fetchImpl });
  persistCatalogSnapshot(catalog, providerRoot);
  const usage = await fetchXKiroUsage({ apiKey, fetchImpl });
  persistUsageSnapshot(usage, providerRoot);
  const candidates = qualificationCandidates(catalog, { limit: 8 });
  const policy = defaultProviderRatePolicy();
  const derivedPaceMs = Math.ceil(60_000 / Math.max(1, policy.max_requests_per_minute));
  const effectivePaceMs = paceMs == null ? (fetchImpl === globalThis.fetch ? derivedPaceMs : 0) : Math.max(0, Number(paceMs) || 0);
  let nextRequestAt = 0;
  const results = [];
  for (const candidate of candidates) {
    let routeBlocked = null;
    for (const fixture of fixtures(archetype)) {
      const task = {
        task_id: crypto.randomUUID(), attempt_id: crypto.randomUUID(), project,
        task_archetype: archetype, authority: 'NON_AUTHORITATIVE_AUXILIARY',
        budget_policy: 'FREE_ONLY', data_class: 'PUBLIC', purpose: fixture.purpose,
        evidence_refs: [fixture.source_id], evidence: fixture.evidence,
        max_output_tokens: 384, required_capabilities: { tools: false },
      };
      const requestBody = buildXKiroRequest({ task, modelId: candidate.model_id });
      assertAssembledRequestSafe({ task, requestBody, root, maxBytes: 200_000 });
      try {
        const waitMs = Math.max(0, nextRequestAt - Date.now());
        if (waitMs > 0) await sleep(waitMs);
        nextRequestAt = Date.now() + effectivePaceMs;
        const response = await callXKiroChat({ apiKey, requestBody, fetchImpl, maxAttempts: 2, timeoutMs: 60000, rateLimit: { accountRoot: path.join(providerRoot, 'xkiro', 'rate'), estimatedTokens: 1000, requestId: task.task_id, policy } });
        if (response.model !== candidate.model_id) throw new Error('xKiro benchmark model identity mismatch');
        recordModelOutcome({ root, modelId: candidate.model_id, archetype, metrics: metricFromResult({ content: response.content, fixture, latencyMs: response.latency_ms }), benchmarkVersion: ELITE_BENCHMARK_VERSION });
      } catch (error) {
        const category = error?.category ?? 'PROVIDER_ERROR';
        recordModelOutcome({ root, modelId: candidate.model_id, archetype, metrics: {
          schema_valid: false, evidence_fidelity: 0, unsupported_claim_rate: 1, correction_rate: 1,
          latency_ms: 0, timeout: category.includes('TIMEOUT'), provider_error: true,
        }, benchmarkVersion: ELITE_BENCHMARK_VERSION });
        if (['ROUTE_INELIGIBLE', 'PAID_CAPACITY_REQUIRED', 'REQUEST_REJECTED', 'AUTH_FAILED'].includes(category)) {
          routeBlocked = category;
          break;
        }
      }
    }
    const record = loadPerformanceLedger(root).routes?.[`${candidate.model_id}::${archetype}`];
    const promotion = evaluatePromotion(record, ELITE_BENCHMARK_THRESHOLDS);
    results.push({ candidate, route_blocked: routeBlocked, promotion, score: scorePromotion(promotion) });
  }
  const eligible = results.filter((item) => item.promotion.eligible).sort((a, b) => b.score - a.score);
  if (eligible[0]) setModelLifecycle({ root, modelId: eligible[0].candidate.model_id, archetype, state: 'CHAMPION', thresholds: ELITE_BENCHMARK_THRESHOLDS, benchmarkVersion: ELITE_BENCHMARK_VERSION });
  if (eligible[1]) setModelLifecycle({ root, modelId: eligible[1].candidate.model_id, archetype, state: 'CHALLENGER', thresholds: ELITE_BENCHMARK_THRESHOLDS, benchmarkVersion: ELITE_BENCHMARK_VERSION });
  const summary = {
    schema_version: 1, project, archetype, benchmark_version: ELITE_BENCHMARK_VERSION,
    thresholds: ELITE_BENCHMARK_THRESHOLDS,
    pacing: { requests_per_minute_ceiling: policy.max_requests_per_minute, effective_pace_ms: effectivePaceMs },
    candidates: results.map(({ candidate, route_blocked, promotion, score }) => ({ model_id: candidate.model_id, route_blocked, promotion, score })),
    champion: eligible[0]?.candidate.model_id ?? null,
    challenger: eligible[1]?.candidate.model_id ?? null,
    completed_at: new Date().toISOString(),
  };
  writeJsonAtomic(`operations/auxiliary/benchmarks/${archetype}.json`, summary, root);
  return summary;
}
