import crypto from 'node:crypto';

export const RESEARCH_LOOP_ACTIONS = Object.freeze([
  'claim', 'fetch', 'search', 'fetch-read', 'submit-analysis',
  'submit-deeper-evidence', 'complete', 'retry', 'refuse',
]);
export const RESEARCH_LOOP_AUTHORITY = 'NON_AUTHORITATIVE_ENGINEERING_RESEARCH';
export const DEFAULT_LEASE_MS = 15 * 60 * 1000;

const sha = (value) => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const clone = (value) => structuredClone(value);
const publicUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(url.hostname) && !url.hostname.endsWith('.local');
  } catch { return false; }
};

export function immutableDuPacket(packet) {
  if (!packet?.unit_lineage_id || !packet?.unit_revision_hash || !Array.isArray(packet?.research_roles) || packet.research_roles.length !== 18) throw new Error('DU_PACKET_INVALID');
  if (packet.authority === 'PROJECT_TRUTH' || packet.may_mutate_project_truth === true) throw new Error('PROJECT_TRUTH_AUTHORITY_PROHIBITED');
  const body = {
    schema_version: 1,
    packet_kind: 'IMMUTABLE_DU_RESEARCH_PACKET',
    authority: RESEARCH_LOOP_AUTHORITY,
    unit_lineage_id: packet.unit_lineage_id,
    unit_revision_hash: packet.unit_revision_hash,
    feature_ids: [...new Set(packet.feature_ids || [])].sort(),
    research_roles: [...packet.research_roles],
    questions: clone(packet.questions || []),
    discovery_workload: clone(packet.discovery_workload || {}),
    guided_frontend_context: clone(packet.guided_frontend_context || null),
    n8n_architecture_context: clone(packet.n8n_architecture_context || null),
    repository_sha: packet.repository_sha,
    project_truth_hash: packet.project_truth_hash,
  };
  return Object.freeze({ ...body, packet_hash: sha(body) });
}
export function validateResearchSubmission({ packet, claims, sources, deeper = false }) {
  const failures = [];
  if (!packet?.packet_hash || immutableDuPacket(packet).packet_hash !== packet.packet_hash) failures.push('PACKET_HASH_MISMATCH');
  if (!Array.isArray(claims) || claims.length < 1) failures.push('CLAIMS_REQUIRED');
  if (!Array.isArray(sources) || sources.length < 1) failures.push('SOURCES_REQUIRED');
  for (const source of sources || []) {
    if (!publicUrl(source.url)) failures.push('PUBLIC_HTTPS_SOURCE_REQUIRED');
    if (!source.content_hash || !/^[a-f0-9]{64}$/.test(source.content_hash)) failures.push('SOURCE_HASH_REQUIRED');
    if (!source.observed_at) failures.push('SOURCE_FRESHNESS_REQUIRED');
  }
  for (const claim of claims || []) {
    if (!claim.text || !['FACTUAL', 'INFERENTIAL'].includes(claim.classification)) failures.push('CLAIM_INVALID');
    if (!Array.isArray(claim.source_refs) || claim.source_refs.length < 1) failures.push('CLAIM_SOURCE_REQUIRED');
  }
  if (deeper && !(sources || []).some((source) => source.depth === 'PRIMARY' || source.depth === 'CORROBORATING')) failures.push('DEEPER_EVIDENCE_REQUIRED');
  return { ok: failures.length === 0, failures: [...new Set(failures)].sort() };
}

export class VeklResearchLoop {
  constructor({ store, clock = () => Date.now(), leaseMs = DEFAULT_LEASE_MS } = {}) {
    if (!store) throw new Error('AUTHORITATIVE_VEKL_POSTGRES_STORE_REQUIRED');
    this.store = store;
    this.clock = clock;
    this.leaseMs = leaseMs;
  }
  async invoke(action, input = {}) {
    if (!RESEARCH_LOOP_ACTIONS.includes(action)) throw new Error('RESEARCH_ACTION_NOT_ALLOWED');
    if (input.sql != null || input.query_sql != null) throw new Error('ARBITRARY_SQL_PROHIBITED');
    if (input.project_truth_patch != null || input.project_truth_mutation != null) throw new Error('PROJECT_TRUTH_MUTATION_PROHIBITED');
    const requestId = input.request_id;
    if (!requestId || !/^[A-Za-z0-9_.:-]{8,160}$/.test(requestId)) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
    const prior = await this.store.getRequest(requestId);
    if (prior) return clone(prior.response);
    const response = await this[`_${action.replaceAll('-', '_')}`](input);
    await this.store.putRequest({ request_id: requestId, action, input_hash: sha(input), response: clone(response), created_at_ms: this.clock() });
    return response;
  }
  async _claim(input) {
    const packet = await this.store.claimNext({ worker_id: input.worker_id, now_ms: this.clock(), lease_expires_ms: this.clock() + this.leaseMs });
    if (!packet) return { state: 'EMPTY' };
    return { state: 'CLAIMED', lease_id: packet.lease_id, lease_expires_ms: packet.lease_expires_ms, packet: immutableDuPacket(packet.packet) };
  }
  async active(input) {
    const lease = await this.store.getLease(input.lease_id);
    if (!lease || lease.worker_id !== input.worker_id) throw new Error('LEASE_NOT_OWNED');
    if (lease.lease_expires_ms <= this.clock()) throw new Error('LEASE_EXPIRED');
    return lease;
  }
  async _fetch(input) { const lease = await this.active(input); return { state: 'ACTIVE', packet: immutableDuPacket(lease.packet), resume: clone(lease.resume || {}) }; }
  async _search(input) {
    await this.active(input);
    if (!String(input.search_query || '').trim()) throw new Error('SEARCH_QUERY_REQUIRED');
    return this.store.recordSearch({ lease_id: input.lease_id, search_query: String(input.search_query).slice(0, 500), adapter: input.adapter || 'governed-search', at_ms: this.clock() });
  }
  async _fetch_read(input) {
    await this.active(input);
    if (!publicUrl(input.url)) throw new Error('PUBLIC_HTTPS_URL_REQUIRED');
    return this.store.recordRead({ lease_id: input.lease_id, url: input.url, content_hash: input.content_hash, at_ms: this.clock() });
  }
  async submit(input, deeper) {
    const lease = await this.active(input);
    const packet = immutableDuPacket(lease.packet);
    const validation = validateResearchSubmission({ packet, claims: input.claims, sources: input.sources, deeper });
    if (!validation.ok) return { state: 'REJECTED', validation };
    return this.store.persistEvidence({ lease_id: input.lease_id, packet_hash: packet.packet_hash, worker_id: input.worker_id, kind: deeper ? 'DEEPER_EVIDENCE' : 'ANALYSIS', claims: clone(input.claims), sources: clone(input.sources), evidence_hash: sha({ packet_hash: packet.packet_hash, claims: input.claims, sources: input.sources, deeper }), at_ms: this.clock() });
  }
  async _submit_analysis(input) { return this.submit(input, false); }
  async _submit_deeper_evidence(input) { return this.submit(input, true); }
  async _complete(input) { const lease = await this.active(input); return this.store.complete({ lease_id: lease.lease_id, worker_id: input.worker_id, at_ms: this.clock() }); }
  async _retry(input) { const lease = await this.active(input); return this.store.retry({ lease_id: lease.lease_id, worker_id: input.worker_id, reason: String(input.reason || 'retry requested').slice(0, 500), at_ms: this.clock() }); }
  async _refuse(input) { const lease = await this.active(input); return this.store.refuse({ lease_id: lease.lease_id, worker_id: input.worker_id, reason: String(input.reason || '').slice(0, 500), at_ms: this.clock() }); }
}
