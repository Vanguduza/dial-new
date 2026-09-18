#!/usr/bin/env node
// VEKL open-world discovery lifecycle.
//
// Two axes, deliberately kept apart (Rev 3.1 §5.2, Principle 2):
//
//   lifecycle_state  — how far DIAL has evaluated this thing.
//   trust_tier       — what authority class the source actually belongs to.
//
// Conflating them is the failure this module exists to prevent: a community
// repository that DIAL sandboxed successfully is still community material.
// `assignTrustTier` therefore never reads trial results, and T0 is unreachable
// from the open world at all.
//
// The candidate ledger is a staging plane, not a second registry: admission
// writes into the existing ENGINEERING_RESOURCE_SOURCE_REGISTRY /
// ENGINEERING_RESOURCE_REGISTRY, reusing their T0–T4 vocabulary verbatim.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashObject, loadRegistry } from './knowledge-graph-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO = path.resolve(here, '../..');
export const POLICY_REL = 'agent-system/registries/DISCOVERY_POLICY.json';
export const CANDIDATE_REL = 'agent-system/engineering-knowledge/registries/DISCOVERY_CANDIDATE_REGISTRY.json';

export function loadDiscoveryPolicy(repoDir = DEFAULT_REPO) {
  const policy = loadRegistry(repoDir, POLICY_REL, null);
  if (!policy) throw new Error(`discovery policy missing: ${POLICY_REL}`);
  return policy;
}

export function loadDiscoveryCandidates(repoDir = DEFAULT_REPO) {
  const rows = loadRegistry(repoDir, CANDIDATE_REL, []);
  if (!Array.isArray(rows)) throw new Error('DISCOVERY_CANDIDATE_REGISTRY must be an array');
  return rows;
}

// ── identity ───────────────────────────────────────────────────────────────
// Two adapters finding the same repository must produce one candidate, or the
// ledger silently double-counts and triage happens twice. Normalisation is
// scheme/host/path only: query strings and fragments are presentation.
export function normalizeLocator(locator) {
  const raw = String(locator || '').trim();
  if (!raw) throw new Error('canonical_locator required');
  let url;
  try { url = new URL(raw); } catch { return raw.toLowerCase().replace(/\/+$/, ''); }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let pathname = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
  if (host === 'github.com') {
    // Owner/repo is the identity; tree/blob/issues paths are views of it.
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) pathname = `/${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`;
  }
  return `${url.protocol.toLowerCase()}//${host}${pathname}`;
}

export function candidateIdFor(locator) {
  return `DISC-${hashObject({ identity: normalizeLocator(locator) }).slice(0, 24)}`;
}

// ── trust tier ─────────────────────────────────────────────────────────────
// Fail-closed: a tier is granted only when every declared requirement is
// satisfied by provenance. An unverifiable claim falls to the policy default,
// never upward. The adapter that found the candidate also caps the tier, so a
// web-search hit cannot claim T1 because the page says "official".
export function assignTrustTier({ policy, provenance = {}, sourceAdapter = null, requestedTier = null }) {
  const rules = policy.tier_assignment_rules || {};
  const fallback = policy.default_provisional_tier || 'T4_COMMUNITY_SIGNAL';
  const order = policy.trust_tiers || [];
  const adapter = (policy.source_adapters || []).find((a) => a.adapter_id === sourceAdapter) || null;
  const cap = adapter?.max_provisional_tier || null;

  const predicates = {
    official_publisher_verified: () => provenance.official_publisher_verified === true,
    canonical_locator_on_publisher_domain_or_repo: () =>
      Boolean(provenance.publisher_identity) && (Boolean(provenance.repository_url) || provenance.official_publisher_verified === true),
    maintainer_identity_linked: () => provenance.maintainer_identity_linked === true,
    independent_corroboration_count_at_least_2: () => Number(provenance.independent_corroboration_count || 0) >= 2,
  };

  const evaluate = (tier) => {
    const rule = rules[tier];
    if (!rule) return { tier, granted: false, reasons: [`no rule for ${tier}`] };
    if (rule.open_world_assignable === false) return { tier, granted: false, reasons: [rule.reason || `${tier} is not open-world assignable`] };
    const unmet = (rule.requires_all || []).filter((name) => !(predicates[name]?.() === true));
    return { tier, granted: unmet.length === 0, reasons: unmet.map((name) => `unmet:${name}`) };
  };

  // Candidate tiers, strongest first, bounded by the adapter cap.
  const ranked = order.filter((t) => t !== 'T0_DIAL_PROJECT');
  const capIndex = cap ? ranked.indexOf(cap) : 0;
  const permitted = ranked.slice(Math.max(0, capIndex));

  const rejections = [];
  for (const tier of permitted) {
    if (requestedTier && order.indexOf(tier) < order.indexOf(requestedTier)) continue;
    const verdict = evaluate(tier);
    if (verdict.granted) {
      return {
        trust_tier: tier,
        justification: [
          `adapter=${sourceAdapter || 'UNSPECIFIED'}`,
          cap ? `adapter_max_tier=${cap}` : 'adapter_max_tier=UNCAPPED',
          ...(rules[tier]?.requires_all || []).map((name) => `met:${name}`),
        ],
        rejected: rejections,
      };
    }
    rejections.push(verdict);
  }
  return {
    trust_tier: fallback,
    justification: [`fell back to ${fallback}`, ...rejections.flatMap((r) => r.reasons.map((x) => `${r.tier}:${x}`))],
    rejected: rejections,
  };
}

// ── registration ───────────────────────────────────────────────────────────
export function buildDiscoveryCandidate({
  policy,
  canonicalLocator,
  discoveredBy = 'vekl-discovery',
  discoveredAt = new Date().toISOString(),
  originatingTask = null,
  queryHash = null,
  sourceAdapter,
  triggerClass = 'REACTIVE',
  claimedResourceClasses = [],
  claimedTaskClasses = [],
  provenance = {},
  executableContentDetected = false,
  networkTrialAllowed = false,
} = {}) {
  if (!policy) throw new Error('policy required');
  if (!(policy.source_adapters || []).some((a) => a.adapter_id === sourceAdapter)) {
    throw new Error(`unknown discovery adapter: ${sourceAdapter}`);
  }
  if (!(policy.trigger_classes || []).some((t) => t.trigger_id === triggerClass)) {
    throw new Error(`unknown discovery trigger class: ${triggerClass}`);
  }
  const identity = normalizeLocator(canonicalLocator);
  const fullProvenance = {
    publisher_identity: provenance.publisher_identity ?? null,
    repository_url: provenance.repository_url ?? null,
    exact_revision: provenance.exact_revision ?? null,
    package_version: provenance.package_version ?? null,
    release_tag: provenance.release_tag ?? null,
    license: provenance.license ?? null,
    official_publisher_verified: provenance.official_publisher_verified === true,
    maintainer_identity_linked: provenance.maintainer_identity_linked === true,
    independent_corroboration_count: Number(provenance.independent_corroboration_count || 0),
  };
  const tier = assignTrustTier({ policy, provenance: fullProvenance, sourceAdapter });
  const base = {
    schema_version: 1,
    candidate_id: candidateIdFor(canonicalLocator),
    canonical_locator: String(canonicalLocator),
    identity_key: identity,
    discovered_at: discoveredAt,
    discovered_by: discoveredBy,
    originating_task: originatingTask,
    query_hash: queryHash,
    source_adapter: sourceAdapter,
    trigger_class: triggerClass,
    lifecycle_state: 'DISCOVERED',
    provisional_trust_tier: tier.trust_tier,
    claimed_resource_classes: [...new Set(claimedResourceClasses)].sort(),
    claimed_task_classes: [...new Set(claimedTaskClasses)].sort(),
    provenance: fullProvenance,
    safety: {
      executable_content_detected: executableContentDetected === true,
      // Never negotiable: discovery payloads are built from sanitized intent.
      sensitive_data_allowed: false,
      network_trial_allowed: networkTrialAllowed === true,
    },
    evidence_refs: [],
    disposition_reason: null,
    superseded_by: null,
    admitted_resource_id: null,
    admitted_source_id: null,
    authority: 'NON_AUTHORITATIVE_DISCOVERY_CANDIDATE',
  };
  const transition = {
    from_state: null,
    to_state: 'DISCOVERED',
    at: discoveredAt,
    actor: discoveredBy,
    reason: `discovered via ${sourceAdapter} (${triggerClass})`,
    evidence_refs: [],
  };
  const history = [{ ...transition, transition_hash: hashObject(transition) }];
  const record = { ...base, history, tier_justification: tier.justification };
  return { ...record, candidate_hash: hashObject({ ...record, history: history.map((h) => h.transition_hash) }) };
}

// Deduplicate by normalised identity, keeping the earliest record and merging
// the later one's corroboration into it. A second independent sighting is
// evidence about the same thing, not a new thing.
export function dedupeCandidates(candidates) {
  const byIdentity = new Map();
  for (const row of candidates) {
    const key = row.identity_key || normalizeLocator(row.canonical_locator);
    const prior = byIdentity.get(key);
    if (!prior) { byIdentity.set(key, row); continue; }
    const merged = {
      ...prior,
      provenance: {
        ...prior.provenance,
        independent_corroboration_count:
          Number(prior.provenance?.independent_corroboration_count || 0)
          + Number(row.provenance?.independent_corroboration_count || 0),
      },
      evidence_refs: [...new Set([...(prior.evidence_refs || []), ...(row.evidence_refs || [])])].sort(),
    };
    byIdentity.set(key, merged);
  }
  return [...byIdentity.values()].sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
}

// ── transitions ────────────────────────────────────────────────────────────
export function transitionCandidate({
  policy,
  candidate,
  toState,
  actor = 'vekl-discovery',
  reason = '',
  at = new Date().toISOString(),
  evidence = {},
} = {}) {
  if (!candidate) throw new Error('candidate required');
  const from = candidate.lifecycle_state;
  const allowed = (policy.lifecycle_transitions || {})[from] || [];
  if (!allowed.includes(toState)) {
    return { ok: false, failures: [`ILLEGAL_TRANSITION:${from}->${toState}`], candidate };
  }
  const required = (policy.transition_evidence_required || {})[toState] || [];
  const missing = required.filter((key) => {
    const value = evidence[key];
    return value === undefined || value === null || value === '' || value === false;
  });
  if (missing.length) {
    return { ok: false, failures: missing.map((key) => `MISSING_EVIDENCE:${key}`), candidate };
  }
  const transition = {
    from_state: from,
    to_state: toState,
    at,
    actor,
    reason: reason || `${from} -> ${toState}`,
    evidence_refs: Object.entries(evidence)
      .filter(([, v]) => typeof v === 'string' && v)
      .map(([k, v]) => `${k}:${v}`)
      .sort(),
  };
  const history = [...(candidate.history || []), { ...transition, transition_hash: hashObject(transition) }];
  const next = {
    ...candidate,
    lifecycle_state: toState,
    history,
    evidence_refs: [...new Set([...(candidate.evidence_refs || []), ...transition.evidence_refs])].sort(),
    disposition_reason: evidence.disposition_reason ?? candidate.disposition_reason ?? null,
    superseded_by: evidence.superseded_by ?? candidate.superseded_by ?? null,
  };
  const { candidate_hash: _ignored, ...withoutHash } = next;
  return {
    ok: true,
    failures: [],
    candidate: { ...withoutHash, candidate_hash: hashObject({ ...withoutHash, history: history.map((h) => h.transition_hash) }) },
  };
}

// The ledger is history-preserving: a rewrite that shortens or reorders an
// existing candidate's history is a defect, not an update.
export function verifyAppendOnly(priorRows, nextRows) {
  const failures = [];
  const next = new Map((nextRows || []).map((r) => [r.candidate_id, r]));
  for (const prior of priorRows || []) {
    const cur = next.get(prior.candidate_id);
    if (!cur) { failures.push({ candidate_id: prior.candidate_id, reason: 'CANDIDATE_DELETED' }); continue; }
    const before = prior.history || [];
    const after = cur.history || [];
    if (after.length < before.length) {
      failures.push({ candidate_id: prior.candidate_id, reason: 'HISTORY_TRUNCATED' });
      continue;
    }
    for (let i = 0; i < before.length; i += 1) {
      if (before[i].transition_hash !== after[i].transition_hash) {
        failures.push({ candidate_id: prior.candidate_id, reason: `HISTORY_REWRITTEN_AT_${i}` });
        break;
      }
    }
  }
  return { ok: failures.length === 0, failures };
}

export function validateCandidateRegistry({ repoDir = DEFAULT_REPO, policy = null, rows = null } = {}) {
  const p = policy || loadDiscoveryPolicy(repoDir);
  const candidates = rows || loadDiscoveryCandidates(repoDir);
  const failures = [];
  const ids = new Set();
  const identities = new Set();
  const states = new Set(p.lifecycle_states || []);
  for (const row of candidates) {
    const id = row?.candidate_id || '<candidate>';
    if (!/^DISC-[0-9a-f]{24}$/.test(id)) failures.push(`${id}: candidate_id shape invalid`);
    if (ids.has(id)) failures.push(`${id}: duplicate candidate_id`); else ids.add(id);
    const identity = row?.identity_key || '';
    if (identities.has(identity)) failures.push(`${id}: duplicate identity_key ${identity}`); else identities.add(identity);
    if (candidateIdFor(row?.canonical_locator || '') !== id) failures.push(`${id}: candidate_id not derived from canonical_locator`);
    if (!states.has(row?.lifecycle_state)) failures.push(`${id}: unknown lifecycle_state ${row?.lifecycle_state}`);
    if (row?.provisional_trust_tier === 'T0_DIAL_PROJECT') failures.push(`${id}: open-world discovery may not claim T0_DIAL_PROJECT`);
    if (!(p.trust_tiers || []).includes(row?.provisional_trust_tier)) failures.push(`${id}: unknown trust tier ${row?.provisional_trust_tier}`);
    if (row?.authority !== 'NON_AUTHORITATIVE_DISCOVERY_CANDIDATE') failures.push(`${id}: candidate must declare NON_AUTHORITATIVE_DISCOVERY_CANDIDATE`);
    if (row?.safety?.sensitive_data_allowed !== false) failures.push(`${id}: sensitive_data_allowed must be false`);
    if (!Array.isArray(row?.history) || !row.history.length) failures.push(`${id}: history required`);
    // The recorded history must actually end where lifecycle_state claims.
    const last = (row?.history || [])[(row?.history || []).length - 1];
    if (last && last.to_state !== row.lifecycle_state) failures.push(`${id}: lifecycle_state does not match history tail`);
    // Every recorded hop must be legal under the live transition table.
    for (let i = 1; i < (row?.history || []).length; i += 1) {
      const step = row.history[i];
      const legal = (p.lifecycle_transitions || {})[step.from_state] || [];
      if (!legal.includes(step.to_state)) failures.push(`${id}: illegal recorded transition ${step.from_state}->${step.to_state}`);
    }
    if (row?.lifecycle_state === 'ADMITTED' && !row?.admitted_resource_id) {
      failures.push(`${id}: ADMITTED candidate must name its admitted_resource_id`);
    }
  }
  return { ok: failures.length === 0, candidate_count: candidates.length, failures };
}

export function writeDiscoveryCandidates(rows, repoDir = DEFAULT_REPO) {
  const sorted = [...rows].sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  fs.writeFileSync(path.join(repoDir, CANDIDATE_REL), `${JSON.stringify(sorted, null, 2)}\n`);
  return sorted;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateCandidateRegistry({});
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
