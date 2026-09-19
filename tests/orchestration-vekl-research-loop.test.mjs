import { describe, expect, it } from 'vitest';
import { immutableDuPacket, RESEARCH_LOOP_ACTIONS, validateResearchSubmission, VeklResearchLoop } from '../agent-system/orchestration/vekl-research-loop.mjs';
import { researchToolDefinitions } from '../agent-system/mcp/dial-research-server.mjs';
import { VeklPostgresResearchStore, VEKL_RESEARCH_FIXED_SQL } from '../agent-system/orchestration/vekl-research-postgres-store.mjs';

const roles = Array.from({ length: 18 }, (_, i) => `ROLE_${i + 1}`);
const packet = () => ({ unit_lineage_id: 'DU-001', unit_revision_hash: 'a'.repeat(64), feature_ids: ['F-1'], research_roles: roles, research_dimensions: ['OFFICIAL_DOCUMENTATION'], questions: ['current evidence?'], discovery_workload: { mode: 'OPEN_WORLD_BOUNDED' }, guided_frontend_context: { applicable: false }, n8n_architecture_context: { applicable: false }, repository_sha: 'b'.repeat(40), project_truth_hash: 'c'.repeat(64), project_truth_fingerprint: 'd'.repeat(64), graph_generation_id: 'KG-test', graph_revision_hash: 'e'.repeat(64), contract_bindings: [{ contract_id: 'FRC:F-1', fingerprint: 'f'.repeat(64) }] });

class Store {
  constructor() { this.requests = new Map(); this.lease = null; this.evidence = []; this.events = []; }
  getRequest(id) { return this.requests.get(id); }
  putRequest(v) { this.requests.set(v.request_id, v); }
  claimNext(v) {
    this.lease = { ...v, packet_id: 'DU-RSCH-test', packet_hash: immutableDuPacket(packet()).packet_hash, lease_id: 'lease-1', packet: packet(), resume: {} };
    this.events.push({ event_kind: 'CLAIM', payload: { lease_id: 'lease-1', packet_id: this.lease.packet_id, packet_hash: this.lease.packet_hash, worker_id: v.worker_id } });
    return this.lease;
  }
  getLease() { return this.lease; }
  event(kind, v) { this.events.push({ event_kind: kind, ...v }); return { state: 'RECORDED', event_id: this.events.length }; }
  recordSearch(v) { this.events.push({ event_kind: 'SEARCH', ...v }); return { state: 'RECORDED', ...v }; }
  recordRead(v) { this.events.push({ event_kind: 'FETCH_READ', ...v }); return { state: 'RECORDED', ...v }; }
  completionBundle() {
    const issued = immutableDuPacket(this.lease.packet);
    return {
      packet_id: 'DU-RSCH-test',
      packet_hash: issued.packet_hash,
      packet_json: this.lease.packet,
      resume: {},
      state: 'LEASED',
      worker_id: this.lease.worker_id,
      lease_id: this.lease.lease_id,
      evidence: this.evidence.map((v) => ({ evidence_kind: v.kind, claims: v.claims, sources: v.sources, evidence_hash: v.evidence_hash })),
      events: this.events.map((e) => ({ event_kind: e.event_kind, payload: e })),
    };
  }
  persistEvidence(v) { this.evidence.push(v); this.events.push({ event_kind: v.kind === 'DEEPER_EVIDENCE' ? 'DEEPER_EVIDENCE_SUBMITTED' : 'ANALYSIS_SUBMITTED', ...v }); return { state: 'VALIDATED_PERSISTED', evidence_hash: v.evidence_hash }; }
  complete() { return { state: 'COMPLETE' }; }
  retry() { return { state: 'RETRY' }; }
  refuse() { return { state: 'REFUSED' }; }
}

describe('server-side ChatGPT developer-mode research loop', () => {
  it('exposes only the bounded contract and one immutable DU packet', async () => {
    const definitions = researchToolDefinitions();
    expect(definitions.map((x) => x.name)).toEqual(RESEARCH_LOOP_ACTIONS.map((x) => `dial_research_${x.replaceAll('-', '_')}`));
    expect(definitions.every((x) => x.inputSchema.additionalProperties === false)).toBe(true);
    expect(definitions.find((x) => x.name === 'dial_research_submit_analysis').inputSchema.required).toEqual(expect.arrayContaining(['request_id', 'worker_id', 'lease_id', 'claims', 'sources']));
    const store = new Store(); const loop = new VeklResearchLoop({ store, clock: () => 1000 });
    const claim = await loop.invoke('claim', { request_id: 'request-claim-1', worker_id: 'chatgpt-dev' });
    expect(claim.packet).toEqual(immutableDuPacket(packet()));
    expect(claim.packet.authority).toBe('NON_AUTHORITATIVE_ENGINEERING_RESEARCH');
  });


  it('keeps packet hashes stable across JSONB-style object key reordering', () => {
    const a = immutableDuPacket(packet());
    const reordered = packet();
    reordered.contract_bindings = [{ fingerprint: 'f'.repeat(64), contract_id: 'FRC:F-1' }];
    reordered.discovery_workload = { mode: 'OPEN_WORLD_BOUNDED' };
    const b = immutableDuPacket(reordered);
    expect(b.packet_hash).toBe(a.packet_hash);
  });

  it('rejects evidence bound to a different authoritative packet hash', () => {
    const issued = immutableDuPacket(packet());
    const result = validateResearchSubmission({
      packet: issued,
      expected_packet_hash: '0'.repeat(64),
      claims: [{ text: 'Fact', classification: 'FACTUAL', source_refs: ['https://example.com/evidence'] }],
      sources: [{ ref: 'source:' + 'd'.repeat(64), url: 'https://example.com/evidence', content_hash: 'd'.repeat(64), observed_at: '2026-09-19T00:00:00Z', depth: 'PRIMARY' }],
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('PACKET_HASH_MISMATCH');
  });

  it('requires every claim source ref to be supplied by the evidence packet', () => {
    const issued = immutableDuPacket(packet());
    const result = validateResearchSubmission({
      packet: issued,
      expected_packet_hash: issued.packet_hash,
      claims: [{ text: 'Fact', classification: 'FACTUAL', source_refs: ['source:' + 'a'.repeat(64)] }],
      sources: [{ ref: 'source:' + 'b'.repeat(64), url: 'https://example.com/evidence', content_hash: 'b'.repeat(64), observed_at: '2026-09-19T00:00:00Z', depth: 'PRIMARY' }],
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('CLAIM_SOURCE_NOT_PROVIDED');
  });

  it('allows the Postgres lease selector to reclaim expired leases', () => {
    expect(VEKL_RESEARCH_FIXED_SQL.lease).toContain("state='LEASED'");
    expect(VEKL_RESEARCH_FIXED_SQL.lease).toContain('lease_expires_at <= to_timestamp($1/1000.0)');
    expect(VEKL_RESEARCH_FIXED_SQL.lease).toContain("e.evidence_kind='GROQ_RESEARCH'");
    expect(VEKL_RESEARCH_FIXED_SQL.lease).toContain("e.evidence_kind='DEEPER_EVIDENCE'");
  });

  it('is idempotent, leased, resumable and validates before persistence', async () => {
    const store = new Store(); const loop = new VeklResearchLoop({ store, clock: () => 1000 });
    const input = { request_id: 'request-claim-2', worker_id: 'chatgpt-dev' };
    expect(await loop.invoke('claim', input)).toEqual(await loop.invoke('claim', input));
    const fetched = await loop.invoke('fetch', { request_id: 'request-fetch-1', worker_id: 'chatgpt-dev', lease_id: 'lease-1' });
    expect(fetched.resume).toEqual({});
    const rejected = await loop.invoke('submit-analysis', { request_id: 'request-submit-1', worker_id: 'chatgpt-dev', lease_id: 'lease-1', claims: [], sources: [] });
    expect(rejected.state).toBe('REJECTED');
    expect(store.evidence).toHaveLength(0);
    const accepted = await loop.invoke('submit-analysis', { request_id: 'request-submit-2', worker_id: 'chatgpt-dev', lease_id: 'lease-1', claims: [{ text: 'Fact', classification: 'FACTUAL', source_refs: ['https://example.com/evidence'] }], sources: [{ ref: 'source:' + 'd'.repeat(64), url: 'https://example.com/evidence', content_hash: 'd'.repeat(64), observed_at: '2026-09-19T00:00:00Z', depth: 'PRIMARY' }] });
    expect(accepted.state).toBe('VALIDATED_PERSISTED');
  });

  it('blocks terminal completion until the complete evidence/event contract exists', async () => {
    const store = new Store();
    const loop = new VeklResearchLoop({ store, clock: () => Date.parse('2026-09-19T00:00:00Z') });
    const claim = await loop.invoke('claim', { request_id: 'request-gate-claim-1', worker_id: 'chatgpt-dev' });
    await loop.invoke('fetch', { request_id: 'request-gate-fetch-1', worker_id: 'chatgpt-dev', lease_id: claim.lease_id });
    const blocked = await loop.invoke('complete', { request_id: 'request-gate-complete-1', worker_id: 'chatgpt-dev', lease_id: claim.lease_id });
    expect(blocked.state).toBe('COMPLETION_GATE_BLOCKED');
    expect(blocked.missing).toEqual(expect.arrayContaining(['GROQ_RESEARCH','ANALYSIS','DEEPER_EVIDENCE','SEARCH','FETCH_READ']));
  });

  it('passes terminal completion only after Groq, analysis, deeper evidence, search and fetch-read', async () => {
    const store = new Store();
    const loop = new VeklResearchLoop({
      store,
      clock: () => Date.parse('2026-09-19T00:00:00Z'),
      searchAdapter: async () => ({ results: [{ url: 'https://example.com/doc', title: 'Doc' }] }),
      fetchAdapter: async () => ({ url: 'https://example.com/doc', sha256: 'e'.repeat(64), content_type: 'text/html', excerpt: 'bounded public evidence' }),
    });
    const claim = await loop.invoke('claim', { request_id: 'request-gate-claim-2', worker_id: 'chatgpt-dev' });
    const issued = claim.packet;
    store.evidence.push({ kind: 'GROQ_RESEARCH', claims: [], sources: [] });
    await loop.invoke('fetch', { request_id: 'request-gate-fetch-2', worker_id: 'chatgpt-dev', lease_id: claim.lease_id });
    await loop.invoke('search', { request_id: 'request-gate-search-2', worker_id: 'chatgpt-dev', lease_id: claim.lease_id, search_query: 'evidence' });
    const read = await loop.invoke('fetch-read', { request_id: 'request-gate-read-2', worker_id: 'chatgpt-dev', lease_id: claim.lease_id, url: 'https://example.com/doc' });
    const source = read.source;
    const claimBody = [{ text: 'Fact', classification: 'FACTUAL', source_refs: [source.ref] }];
    await loop.invoke('submit-analysis', { request_id: 'request-gate-analysis-2', worker_id: 'chatgpt-dev', lease_id: claim.lease_id, claims: claimBody, sources: [source] });
    await loop.invoke('submit-deeper-evidence', { request_id: 'request-gate-deep-2', worker_id: 'chatgpt-dev', lease_id: claim.lease_id, claims: claimBody, sources: [source] });
    const done = await loop.invoke('complete', { request_id: 'request-gate-complete-2', worker_id: 'chatgpt-dev', lease_id: claim.lease_id });
    expect(done.state).toBe('COMPLETE');
    expect(issued.packet_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns bounded public search and fetch evidence through the research connector', async () => {
    const store = new Store();
    const loop = new VeklResearchLoop({
      store,
      clock: () => Date.parse('2026-09-19T00:00:00Z'),
      searchAdapter: async () => ({ results: [{ url: 'https://example.com/doc', title: 'Doc' }] }),
      fetchAdapter: async () => ({ url: 'https://example.com/doc', sha256: 'e'.repeat(64), content_type: 'text/html', excerpt: 'bounded public evidence' }),
    });
    const claim = await loop.invoke('claim', { request_id: 'request-claim-web-1', worker_id: 'chatgpt-dev' });
    const searched = await loop.invoke('search', { request_id: 'request-search-web-1', worker_id: 'chatgpt-dev', lease_id: claim.lease_id, search_query: 'current evidence' });
    expect(searched.state).toBe('SEARCH_RESULTS');
    expect(searched.adapter).toBe('PUBLIC_SEARCH');
    expect(searched.content).toContain('https://example.com/doc');
    const fetched = await loop.invoke('fetch-read', { request_id: 'request-read-web-1', worker_id: 'chatgpt-dev', lease_id: claim.lease_id, url: 'https://example.com/doc' });
    expect(fetched.state).toBe('FETCHED');
    expect(fetched.source.content_hash).toBe('e'.repeat(64));
    expect(fetched.excerpt).toBe('bounded public evidence');
  });

  it('refuses arbitrary SQL, Project Truth mutation, expired leases and Hermes persistence', async () => {
    const store = new Store(); let time = 1000; const loop = new VeklResearchLoop({ store, clock: () => time, leaseMs: 10 });
    await loop.invoke('claim', { request_id: 'request-claim-3', worker_id: 'chatgpt-dev' }); time = 2000;
    await expect(loop.invoke('fetch', { request_id: 'request-fetch-2', worker_id: 'chatgpt-dev', lease_id: 'lease-1' })).rejects.toThrow('LEASE_EXPIRED');
    await expect(loop.invoke('search', { request_id: 'request-search-1', worker_id: 'chatgpt-dev', lease_id: 'lease-1', sql: 'select 1' })).rejects.toThrow('ARBITRARY_SQL_PROHIBITED');
    await expect(loop.invoke('retry', { request_id: 'request-retry-1', worker_id: 'chatgpt-dev', lease_id: 'lease-1', project_truth_patch: {} })).rejects.toThrow('PROJECT_TRUTH_MUTATION_PROHIBITED');
    expect(() => new VeklPostgresResearchStore({ client: {}, databaseHostRole: 'hermes', databaseRole: 'AUTHORITATIVE_VEKL' })).toThrow('VEKL_POSTGRES_DATABASE_MUST_BE_ON_VEKL_WORKER');
    expect(Object.values(VEKL_RESEARCH_FIXED_SQL).every((sql) => /\$1/.test(sql))).toBe(true);
  });
});
