import crypto from 'node:crypto';

const SQL = Object.freeze({
  getRequest: 'SELECT response FROM vekl_research_idempotency WHERE request_id = $1',
  putRequest: 'INSERT INTO vekl_research_idempotency(request_id, action, input_hash, response, created_at) VALUES($1,$2,$3,$4,to_timestamp($5/1000.0)) ON CONFLICT (request_id) DO NOTHING',
  lease: `WITH candidate AS (SELECT packet_id FROM vekl_research_packets WHERE state IN ('READY','RETRY') AND (lease_expires_at IS NULL OR lease_expires_at <= to_timestamp($1/1000.0)) ORDER BY ordinal FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE vekl_research_packets p SET state='LEASED',worker_id=$2,lease_id=$3,lease_expires_at=to_timestamp($4/1000.0) FROM candidate WHERE p.packet_id=candidate.packet_id RETURNING p.*`,
  getLease: 'SELECT * FROM vekl_research_packets WHERE lease_id = $1',
  event: 'INSERT INTO vekl_research_events(lease_id,event_kind,payload,created_at) VALUES($1,$2,$3,to_timestamp($4/1000.0)) RETURNING event_id',
  evidence: 'INSERT INTO vekl_research_evidence(lease_id,packet_hash,worker_id,evidence_kind,claims,sources,evidence_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0)) ON CONFLICT(evidence_hash) DO UPDATE SET evidence_hash=EXCLUDED.evidence_hash RETURNING evidence_hash',
  source: 'INSERT INTO vekl_research_sources(source_hash,url,source_kind,trust_tier,observed_at,metadata) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_hash) DO NOTHING',
  discovery: 'INSERT INTO vekl_research_discovery_links(packet_id,candidate_id,lifecycle_state,trust_tier,evidence_refs) SELECT packet_id,$2,$3,$4,$5 FROM vekl_research_packets WHERE lease_id=$1 ON CONFLICT(packet_id,candidate_id) DO UPDATE SET lifecycle_state=EXCLUDED.lifecycle_state,trust_tier=EXCLUDED.trust_tier,evidence_refs=EXCLUDED.evidence_refs',
  transition: 'UPDATE vekl_research_packets SET state=$2,lease_expires_at=NULL,resume=$3 WHERE lease_id=$1 RETURNING packet_id,state',
});

function normalizeLease(row) {
  if (!row) return null;
  const leaseExpiresMs = row.lease_expires_at instanceof Date
    ? row.lease_expires_at.getTime()
    : Date.parse(row.lease_expires_at || '');
  return { ...row, packet: row.packet_json, lease_expires_ms: Number.isFinite(leaseExpiresMs) ? leaseExpiresMs : 0 };
}

export class VeklPostgresResearchStore {
  constructor({ client, executionHostRole = process.env.DIAL_HOST_ROLE, databaseHostRole = process.env.DIAL_VEKL_DATABASE_HOST_ROLE, databaseRole = process.env.DIAL_VEKL_DATABASE_ROLE } = {}) {
    if (!client) throw new Error('POSTGRES_CLIENT_REQUIRED');
    if (databaseHostRole !== 'vekl-worker') throw new Error('VEKL_POSTGRES_DATABASE_MUST_BE_ON_VEKL_WORKER');
    if (databaseRole !== 'AUTHORITATIVE_VEKL') throw new Error('AUTHORITATIVE_VEKL_DATABASE_REQUIRED');
    this.client = client;
    this.executionHostRole = executionHostRole || 'unknown';
  }
  async getRequest(id) { const r = await this.client.query(SQL.getRequest, [id]); return r.rows[0] || null; }
  async putRequest(v) { await this.client.query(SQL.putRequest, [v.request_id, v.action, v.input_hash, v.response, v.created_at_ms]); }
  async claimNext(v) { const leaseId = crypto.randomUUID(); const r = await this.client.query(SQL.lease, [v.now_ms, v.worker_id, leaseId, v.lease_expires_ms]); return normalizeLease(r.rows[0]); }
  async getLease(id) { const r = await this.client.query(SQL.getLease, [id]); return normalizeLease(r.rows[0]); }
  async event(kind, v) { const r = await this.client.query(SQL.event, [v.lease_id, kind, v, v.at_ms]); return { state: 'RECORDED', event_id: r.rows[0].event_id }; }
  recordSearch(v) { return this.event('SEARCH', v); }
  recordRead(v) { return this.event('FETCH_READ', v); }
  async persistEvidence(v) {
    const db = this.client.totalCount === undefined ? this.client : await this.client.connect();
    await db.query('BEGIN');
    try {
      const r = await db.query(SQL.evidence, [v.lease_id, v.packet_hash, v.worker_id, v.kind, v.claims, v.sources, v.evidence_hash, v.at_ms]);
      for (const source of v.sources || []) await db.query(SQL.source, [source.content_hash, source.url, source.source_kind || 'PUBLIC_WEB', source.trust_tier || null, source.observed_at, source.metadata || {}]);
      for (const candidate of v.discovery_candidates || []) await db.query(SQL.discovery, [v.lease_id, candidate.candidate_id, candidate.lifecycle_state || 'DISCOVERED', candidate.trust_tier || 'T3_COMMUNITY_CORROBORATION', candidate.evidence_refs || [v.evidence_hash]]);
      await db.query('COMMIT');
      return { state: 'VALIDATED_PERSISTED', evidence_hash: r.rows[0].evidence_hash };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { if (db !== this.client) db.release(); }
  }
  async transition(state, v) { const r = await this.client.query(SQL.transition, [v.lease_id, state, { reason: v.reason || null, at_ms: v.at_ms }]); return { state: r.rows[0]?.state || state }; }
  complete(v) { return this.transition('COMPLETE', v); }
  retry(v) { return this.transition('RETRY', v); }
  refuse(v) { return this.transition('REFUSED', v); }
}

export { SQL as VEKL_RESEARCH_FIXED_SQL };
