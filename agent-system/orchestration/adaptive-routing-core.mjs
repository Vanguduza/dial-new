// Adaptive harness x model routing — shared primitives (DEC-032).
//
// Registry loading, the token estimator and the qualification predicates that
// every routing stage shares. Kept separate from the router so the estimator
// and the eligibility rules can be tested without constructing a full routing
// call.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_DIR = path.resolve(here, '../..');

export const REGISTRY_PATHS = Object.freeze({
  harnesses: 'agent-system/registries/HARNESS_REGISTRY.json',
  models: 'agent-system/registries/MODEL_REGISTRY.json',
  compatibility: 'agent-system/registries/HARNESS_MODEL_COMPATIBILITY.json',
  specialists: 'agent-system/registries/SPECIALIST_CAPABILITY_REGISTRY.json',
  behaviors: 'agent-system/registries/MODEL_BEHAVIOR_RESOURCE_REGISTRY.json',
  ledger: 'agent-system/registries/MODEL_TASK_PERFORMANCE_LEDGER.json',
  policy: 'agent-system/registries/ADAPTIVE_ROUTING_POLICY.json',
});

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}
export function stableJson(value) { return JSON.stringify(canonical(value)); }
export function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
export function hashObject(value) { return sha256(stableJson(value)); }
export function nowIso() { return new Date().toISOString(); }

function read(repoDir, rel) { return JSON.parse(fs.readFileSync(path.join(repoDir, rel), 'utf8')); }

export function loadRoutingRegistries(repoDir = DEFAULT_REPO_DIR) {
  return {
    harnesses: read(repoDir, REGISTRY_PATHS.harnesses),
    models: read(repoDir, REGISTRY_PATHS.models),
    compatibility: read(repoDir, REGISTRY_PATHS.compatibility),
    specialists: read(repoDir, REGISTRY_PATHS.specialists),
    behaviors: read(repoDir, REGISTRY_PATHS.behaviors),
    ledger: read(repoDir, REGISTRY_PATHS.ledger),
    policy: read(repoDir, REGISTRY_PATHS.policy),
  };
}

export function loadRoutingPolicy(repoDir = DEFAULT_REPO_DIR) { return read(repoDir, REGISTRY_PATHS.policy); }

// ── token estimation ───────────────────────────────────────────────────────
/**
 * The document makes budgets enforceable but never says whose tokenizer, and
 * Claude and GPT do not agree on the same text. Rather than pick one and be
 * silently wrong for the other, the estimate is per-family and carries a
 * declared error bound; enforcement inflates by that bound so an under-estimate
 * cannot slip past a hard limit. An exact count from the harness supersedes it.
 */
export function estimateTokens({ repoDir = DEFAULT_REPO_DIR, text, modelFamily = 'default', exactCount = null } = {}) {
  const policy = loadRoutingPolicy(repoDir).token_accounting || {};
  if (Number.isFinite(exactCount)) {
    return { tokens: Math.max(0, Math.round(exactCount)), exact: true, enforced_tokens: Math.max(0, Math.round(exactCount)) };
  }
  const ratios = policy.chars_per_token_by_family || {};
  const ratio = Number(ratios[modelFamily] ?? ratios.default ?? 3.6);
  const chars = String(text ?? '').length;
  const tokens = Math.ceil(chars / (ratio > 0 ? ratio : 3.6));
  const margin = Number(policy.enforcement_margin_percent ?? 0) / 100;
  return { tokens, exact: false, enforced_tokens: Math.ceil(tokens * (1 + margin)) };
}

// ── qualification ──────────────────────────────────────────────────────────
export function modelRoutable({ model, policyRegistry, riskClass = 'LOW' } = {}) {
  const state = model?.qualification?.state;
  const routable = policyRegistry?.routable_states || ['LIMITED_TRAFFIC', 'QUALIFIED', 'APPROVED'];
  const highRisk = policyRegistry?.high_risk_routable_states || ['QUALIFIED', 'APPROVED'];
  const needed = riskClass === 'HIGH' || riskClass === 'CRITICAL' ? highRisk : routable;
  return needed.includes(state);
}

export function harnessQualified(harness) {
  return ['QUALIFIED', 'APPROVED'].includes(harness?.qualification?.state);
}

/** Discovery staleness fails closed, mirroring DIAL's host-telemetry rule. */
export function discoveryFresh({ models, nowMs = Date.now() } = {}) {
  const discovery = models?.discovery || {};
  if (discovery.required !== true) return { fresh: true, reason: null };
  const observed = Date.parse(discovery.last_observed_at ?? '');
  if (!Number.isFinite(observed)) {
    return { fresh: false, reason: 'DISCOVERY_NEVER_RUN', fail_closed: discovery.stale_discovery_behaviour === 'FAIL_CLOSED' };
  }
  const age = nowMs - observed;
  const max = Number(discovery.max_discovery_age_ms ?? 0);
  return age <= max ? { fresh: true, reason: null } : { fresh: false, reason: 'STALE_DISCOVERY', age_ms: age };
}

/**
 * Pair compatibility. Absence is a block, not a shrug: DEC-032 §9 exists
 * because a plausible-sounding pairing that no route supports is worse than
 * no pairing at all.
 */
export function pairCompatible({ compatibility, harnessId, model } = {}) {
  const entry = compatibility?.compatibility?.[harnessId];
  if (!entry) return { ok: false, reason: 'PAIR_NOT_COMPATIBLE', detail: `no compatibility entry for ${harnessId}` };
  if (!(entry.allowed_model_families || []).includes(model?.family)) {
    return { ok: false, reason: 'PAIR_NOT_COMPATIBLE', detail: `${harnessId} does not host family ${model?.family}` };
  }
  if (!(entry.allowed_provider_routes || []).includes(model?.subscription_source)) {
    return { ok: false, reason: 'PAIR_NOT_COMPATIBLE', detail: `${harnessId} does not support route ${model?.subscription_source}` };
  }
  const proven = (entry.proven_pairs || []).includes(model?.model_id);
  const candidate = (entry.candidate_pairs || []).includes(model?.model_id);
  if (!proven && !candidate) {
    return { ok: false, reason: 'PAIR_NOT_COMPATIBLE', detail: `${model?.model_id} is neither proven nor candidate on ${harnessId}` };
  }
  return { ok: true, proven, candidate };
}

/** Generates every compatible pair. Blocking happens here, ranking later. */
export function generatePairs({ registries, riskClass = 'LOW' } = {}) {
  const pairs = [];
  const blocked = [];
  for (const harness of registries.harnesses.harnesses || []) {
    for (const model of registries.models.models || []) {
      const compat = pairCompatible({ compatibility: registries.compatibility, harnessId: harness.harness_id, model });
      const id = `${harness.harness_id}+${model.model_id}`;
      if (!compat.ok) { blocked.push({ pair_id: id, reason: compat.reason, detail: compat.detail }); continue; }
      pairs.push({
        pair_id: id,
        harness_id: harness.harness_id,
        model_id: model.model_id,
        harness,
        model,
        proven: compat.proven,
        candidate: compat.candidate,
        independence_class: harness.independence_class,
        provider: model.provider,
        subscription_source: model.subscription_source,
      });
    }
  }
  pairs.sort((a, b) => a.pair_id.localeCompare(b.pair_id));
  blocked.sort((a, b) => a.pair_id.localeCompare(b.pair_id));
  return { pairs, blocked, risk_class: riskClass };
}

/** Inherited qualification from a DEC-028 worker card, for the floor bootstrap. */
export function inheritedShimQualification({ registries, harnessId, modelId } = {}) {
  const shims = registries.harnesses?.compatibility_shims;
  if (!shims || shims.retired === true) return null;
  for (const [cardId, mapped] of Object.entries(shims.card_to_pair || {})) {
    if (mapped.harness_id === harnessId && mapped.model_id === modelId) return cardId;
  }
  return null;
}
