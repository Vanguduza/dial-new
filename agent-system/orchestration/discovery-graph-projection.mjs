#!/usr/bin/env node
// Two-plane knowledge boundary (Rev 3.1 §5.11–§5.12).
//
// The canonical/admitted plane and the discovery/candidate plane do not need
// separate graph databases; they need a boundary a resolver cannot cross by
// accident. That boundary is this projection: every retrieved item carries the
// metadata needed to tell what it is, and candidate-plane items are structurally
// incapable of carrying AUTHORITY.
//
// `enforceRetrievalBoundary` is the assertion the resolver runs before handing
// anything to a worker. It is written as a filter that REMOVES violations rather
// than one that flags them, because a warning attached to authoritative-looking
// text is not a control.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from './knowledge-graph-core.mjs';
import { loadDiscoveryPolicy, loadDiscoveryCandidates } from './discovery-lifecycle.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO = path.resolve(here, '../..');
const SOURCE_REL = 'agent-system/engineering-knowledge/registries/ENGINEERING_RESOURCE_SOURCE_REGISTRY.json';
const RESOURCE_REL = 'agent-system/engineering-knowledge/registries/ENGINEERING_RESOURCE_REGISTRY.json';

export const CANONICAL_PLANE = 'CANONICAL_ADMITTED';
export const CANDIDATE_PLANE = 'DISCOVERY_CANDIDATE';

export function authorityRoleForTier(policy, tier) {
  return (policy.authority_role_by_tier || {})[tier] || 'SIGNAL';
}

export function freshnessStateFor({ source, admittedAt, nowMs = Date.now() }) {
  const ttl = Number(source?.freshness_ttl_hours ?? 0);
  if (!ttl) return 'CURRENT';
  const at = Date.parse(admittedAt || '');
  if (!Number.isFinite(at)) return 'UNKNOWN';
  return (nowMs - at) > ttl * 3600 * 1000 ? 'STALE' : 'CURRENT';
}

export function projectAdmittedResource({ policy, resource, source, nowMs = Date.now() }) {
  const tier = source?.trust_tier || 'T4_COMMUNITY_SIGNAL';
  return {
    schema_version: 1,
    resource_id: resource.resource_id,
    plane: CANONICAL_PLANE,
    lifecycle_state: 'ADMITTED',
    trust_tier: tier,
    authority_role: authorityRoleForTier(policy, tier),
    exact_version: resource.production_pin || null,
    source_hash: resource.content_hash || null,
    admitted_at: resource.admitted_at || null,
    freshness_state: freshnessStateFor({ source, admittedAt: resource.admitted_at, nowMs }),
    executable_eligibility: resource.activation_mode === 'EXECUTABLE_CAPABILITY' && Boolean(resource.production_pin)
      ? 'ELIGIBLE' : 'INELIGIBLE',
    sensitive_data_eligibility: source?.sensitive_data_allowed === true ? 'ELIGIBLE' : 'INELIGIBLE',
    task_classes: [...(resource.task_classes || [])].sort(),
  };
}

export function projectCandidate({ policy, candidate }) {
  const tier = candidate.provisional_trust_tier || 'T4_COMMUNITY_SIGNAL';
  return {
    schema_version: 1,
    resource_id: candidate.candidate_id,
    plane: CANDIDATE_PLANE,
    lifecycle_state: candidate.lifecycle_state,
    trust_tier: tier,
    // A candidate is never authority regardless of the tier its provenance would
    // eventually earn: the tier describes the source, the plane describes whether
    // DIAL has finished evaluating it.
    authority_role: authorityRoleForTier(policy, tier) === 'AUTHORITY' ? 'CORROBORATION' : authorityRoleForTier(policy, tier),
    exact_version: candidate.provenance?.exact_revision || candidate.provenance?.package_version || null,
    source_hash: candidate.candidate_hash || null,
    admitted_at: null,
    freshness_state: 'UNKNOWN',
    executable_eligibility: 'INELIGIBLE',
    sensitive_data_eligibility: 'INELIGIBLE',
    task_classes: [...(candidate.claimed_task_classes || [])].sort(),
  };
}

export function buildTrustProjection({ repoDir = DEFAULT_REPO, policy = null, nowMs = Date.now() } = {}) {
  const p = policy || loadDiscoveryPolicy(repoDir);
  const sources = new Map(loadRegistry(repoDir, SOURCE_REL, []).map((s) => [s.source_id, s]));
  const resources = loadRegistry(repoDir, RESOURCE_REL, []);
  const candidates = loadDiscoveryCandidates(repoDir);
  const admitted = resources.map((r) => projectAdmittedResource({ policy: p, resource: r, source: sources.get(r.source_id), nowMs }));
  // An ADMITTED candidate has left the candidate plane: its admitted row is the
  // one that carries authority, and projecting it twice would double-count it.
  const pending = candidates
    .filter((c) => c.lifecycle_state !== 'ADMITTED')
    .map((c) => projectCandidate({ policy: p, candidate: c }));
  return {
    schema_version: 1,
    canonical_plane: admitted,
    candidate_plane: pending,
    counts: { admitted: admitted.length, candidate: pending.length },
  };
}

// The boundary itself. Anything that fails is dropped with a named reason; the
// caller receives what survived plus the audit record of what did not.
export function enforceRetrievalBoundary({
  projections = [],
  requireAuthority = false,
  allowStale = false,
  allowCandidatePlane = false,
  sensitiveContext = false,
  executableRequested = false,
} = {}) {
  const admittedItems = [];
  const withheld = [];
  for (const item of projections) {
    const reasons = [];
    if (item.plane === CANDIDATE_PLANE && !allowCandidatePlane) reasons.push('CANDIDATE_PLANE_NOT_AUTHORITATIVE');
    if (item.plane === CANDIDATE_PLANE && item.authority_role === 'AUTHORITY') reasons.push('CANDIDATE_CANNOT_CARRY_AUTHORITY');
    if (requireAuthority && item.authority_role !== 'AUTHORITY') reasons.push('AUTHORITY_ROLE_REQUIRED');
    if (!allowStale && ['STALE', 'SUPERSEDED', 'DEPRECATED', 'REVOKED'].includes(item.freshness_state)) {
      reasons.push(`FRESHNESS_${item.freshness_state}`);
    }
    if (sensitiveContext && item.sensitive_data_eligibility !== 'ELIGIBLE') reasons.push('SENSITIVE_DATA_NOT_ELIGIBLE');
    if (executableRequested && item.executable_eligibility !== 'ELIGIBLE') reasons.push('EXECUTABLE_NOT_ELIGIBLE');
    if (reasons.length) withheld.push({ resource_id: item.resource_id, plane: item.plane, reasons: reasons.sort() });
    else admittedItems.push(item);
  }
  return {
    ok: true,
    results: admittedItems.sort((a, b) => a.resource_id.localeCompare(b.resource_id)),
    withheld: withheld.sort((a, b) => a.resource_id.localeCompare(b.resource_id)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const projection = buildTrustProjection({});
  console.log(JSON.stringify({ counts: projection.counts }, null, 2));
}
