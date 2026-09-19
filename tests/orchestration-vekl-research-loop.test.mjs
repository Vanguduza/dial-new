import { describe, expect, it } from 'vitest';
import { immutableDuPacket, RESEARCH_LOOP_ACTIONS, VeklResearchLoop } from '../agent-system/orchestration/vekl-research-loop.mjs';
import { researchToolDefinitions } from '../agent-system/mcp/dial-research-server.mjs';
import { VeklPostgresResearchStore, VEKL_RESEARCH_FIXED_SQL } from '../agent-system/orchestration/vekl-research-postgres-store.mjs';

const roles = Array.from({ length: 18 }, (_, i) => `ROLE_${i + 1}`);
const packet = () => ({ unit_lineage_id: 'DU-001', unit_revision_hash: 'a'.repeat(64), feature_ids: ['F-1'], research_roles: roles, research_dimensions: ['OFFICIAL_DOCUMENTATION'], questions: ['current evidence?'], discovery_workload: { mode: 'OPEN_WORLD_BOUNDED' }, guided_frontend_context: { applicable: false }, n8n_architecture_context: { applicable: false }, repository_sha: 'b'.repeat(40), project_truth_hash: 'c'.repeat(64), project_truth_fingerprint: 'd'.repeat(64), graph_generation_id: 'KG-test', graph_revision_hash: 'e'.repeat(64), contract_bindings: [{ contract_id: 'FRC:F-1', fingerprint: 'f'.repeat(64) }] });

class Store {
  constructor() { this.requests = new Map(); this.lease = null; this.evidence = []; }
  getRequest(id) { return this.requests.get(id); }
  putRequest(v) { this.requests.set(v.request_id, v); }
  claimNext(v) { this.lease = { ...v, lease_id: 'lease-1', packet: packet(), resume: {} }; return this.lease; }
  getLease() { return this.lease; }
  recordSearch(v) { return { state: 'RECORDED', ...v }; }
  recordRead(v) { return { state: 'RECORDED', ...v }; }
  persistEvidence(v) { this.evidence.push(v); return { state: 'VALIDATED_PERSISTED', evidence_hash: v.evidence_hash }; }
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

  it('is idempotent, leased, resumable and validates before persistence', async () => {
    const store = new Store(); const loop = new VeklResearchLoop({ store, clock: () => 1000 });
    const input = { request_id: 'request-claim-2', worker_id: 'chatgpt-dev' };
    expect(await loop.invoke('claim', input)).toEqual(await loop.invoke('claim', input));
    const fetched = await loop.invoke('fetch', { request_id: 'request-fetch-1', worker_id: 'chatgpt-dev', lease_id: 'lease-1' });
    expect(fetched.resume).toEqual({});
    const rejected = await loop.invoke('submit-analysis', { request_id: 'request-submit-1', worker_id: 'chatgpt-dev', lease_id: 'lease-1', claims: [], sources: [] });
    expect(rejected.state).toBe('REJECTED');
    expect(store.evidence).toHaveLength(0);
    const accepted = await loop.invoke('submit-analysis', { request_id: 'request-submit-2', worker_id: 'chatgpt-dev', lease_id: 'lease-1', claims: [{ text: 'Fact', classification: 'FACTUAL', source_refs: ['s1'] }], sources: [{ url: 'https://example.com/evidence', content_hash: 'd'.repeat(64), observed_at: '2026-09-19T00:00:00Z', depth: 'PRIMARY' }] });
    expect(accepted.state).toBe('VALIDATED_PERSISTED');
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
