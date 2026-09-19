import crypto from 'node:crypto';

const SQL = Object.freeze({
  getRequest: 'SELECT response FROM vekl_research_idempotency WHERE request_id = $1',
  putRequest: 'INSERT INTO vekl_research_idempotency(request_id, action, input_hash, response, created_at) VALUES($1,$2,$3,$4,to_timestamp($5/1000.0)) ON CONFLICT (request_id) DO NOTHING',
  lease: `WITH candidate AS (
    SELECT p.packet_id
    FROM vekl_research_packets p
    JOIN vekl_research_missions m ON m.mission_id=p.mission_id
    WHERE m.state='READY'
      AND (p.state IN ('READY','RETRY') OR (p.state='LEASED' AND p.lease_expires_at <= to_timestamp($1/1000.0)))
      AND (p.lease_expires_at IS NULL OR p.lease_expires_at <= to_timestamp($1/1000.0))
      AND EXISTS (
        SELECT 1 FROM vekl_research_evidence e
        WHERE e.packet_hash=p.packet_hash AND e.evidence_kind='GROQ_RESEARCH'
      )
      AND COALESCE(p.resume->'chatgpt_deep_research'->>'state','')='READY'
      AND NOT EXISTS (
        SELECT 1 FROM vekl_research_evidence e
        WHERE e.packet_hash=p.packet_hash AND e.evidence_kind='DEEPER_EVIDENCE'
      )
    ORDER BY p.ordinal
    FOR UPDATE OF p SKIP LOCKED
    LIMIT 1
  )
  UPDATE vekl_research_packets p
  SET state='LEASED',worker_id=$2,lease_id=$3,lease_expires_at=to_timestamp($4/1000.0)
  FROM candidate
  WHERE p.packet_id=candidate.packet_id
  RETURNING p.*`,
  getLease: 'SELECT * FROM vekl_research_packets WHERE lease_id = $1',
  event: 'INSERT INTO vekl_research_events(lease_id,event_kind,payload,created_at) VALUES($1,$2,$3,to_timestamp($4/1000.0)) RETURNING event_id',
  evidence: 'INSERT INTO vekl_research_evidence(lease_id,packet_hash,worker_id,evidence_kind,claims,sources,evidence_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0)) ON CONFLICT(evidence_hash) DO UPDATE SET evidence_hash=EXCLUDED.evidence_hash RETURNING evidence_hash',
  source: 'INSERT INTO vekl_research_sources(source_hash,url,source_kind,trust_tier,observed_at,metadata) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_hash) DO NOTHING',
  discovery: `INSERT INTO vekl_research_discovery_links(packet_id,candidate_id,lifecycle_state,trust_tier,evidence_refs)
    SELECT packet_id,$2,$3,$4,$5 FROM vekl_research_packets WHERE lease_id=$1
    ON CONFLICT(packet_id,candidate_id) DO UPDATE SET
      lifecycle_state=CASE
        WHEN vekl_research_discovery_links.lifecycle_state IN ('REJECTED','SUPERSEDED','DEPRECATED','QUARANTINED')
          THEN vekl_research_discovery_links.lifecycle_state
        WHEN EXCLUDED.lifecycle_state IN ('REJECTED','SUPERSEDED','DEPRECATED','QUARANTINED')
          THEN EXCLUDED.lifecycle_state
        WHEN (CASE EXCLUDED.lifecycle_state
          WHEN 'DISCOVERED' THEN 10 WHEN 'TRIAGED' THEN 20 WHEN 'INVESTIGATING' THEN 30
          WHEN 'EXPERIMENTAL' THEN 40 WHEN 'QUALIFIED' THEN 50 WHEN 'ADMITTED' THEN 60 ELSE 0 END)
          >
          (CASE vekl_research_discovery_links.lifecycle_state
          WHEN 'DISCOVERED' THEN 10 WHEN 'TRIAGED' THEN 20 WHEN 'INVESTIGATING' THEN 30
          WHEN 'EXPERIMENTAL' THEN 40 WHEN 'QUALIFIED' THEN 50 WHEN 'ADMITTED' THEN 60 ELSE 0 END)
          THEN EXCLUDED.lifecycle_state
        ELSE vekl_research_discovery_links.lifecycle_state
      END,
      trust_tier=CASE
        WHEN vekl_research_discovery_links.trust_tier IS NULL THEN EXCLUDED.trust_tier
        WHEN EXCLUDED.trust_tier IS NULL THEN vekl_research_discovery_links.trust_tier
        WHEN substring(vekl_research_discovery_links.trust_tier from '^T([1-4])_')::int
             <= substring(EXCLUDED.trust_tier from '^T([1-4])_')::int
          THEN vekl_research_discovery_links.trust_tier
        ELSE EXCLUDED.trust_tier
      END,
      evidence_refs=(
        SELECT COALESCE(jsonb_agg(DISTINCT ref), '[]'::jsonb)
        FROM (
          SELECT value AS ref
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(vekl_research_discovery_links.evidence_refs)='array'
              THEN vekl_research_discovery_links.evidence_refs ELSE '[]'::jsonb END
          )
          UNION
          SELECT value AS ref
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(EXCLUDED.evidence_refs)='array'
              THEN EXCLUDED.evidence_refs ELSE '[]'::jsonb END
          )
        ) merged_refs
      )`,
  transition: 'UPDATE vekl_research_packets SET state=$2,worker_id=NULL,lease_id=NULL,lease_expires_at=NULL,resume=COALESCE(resume,\'{}\'::jsonb) || $3::jsonb WHERE lease_id=$1 RETURNING packet_id,state',
  completionBundle: `SELECT p.packet_id,p.packet_hash,p.packet_json,p.resume,p.state,p.worker_id,p.lease_id,p.lease_expires_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'evidence_kind',e.evidence_kind,'claims',e.claims,'sources',e.sources,'evidence_hash',e.evidence_hash
    ) ORDER BY e.created_at) FROM vekl_research_evidence e WHERE e.packet_hash=p.packet_hash),'[]'::jsonb) AS evidence,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'event_kind',ev.event_kind,'payload',ev.payload,'created_at',ev.created_at
    ) ORDER BY ev.event_id) FROM vekl_research_events ev WHERE ev.lease_id=p.lease_id),'[]'::jsonb) AS events
    FROM vekl_research_packets p WHERE p.lease_id=$1`,
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
  async putRequest(v) { await this.client.query(SQL.putRequest, [v.request_id, v.action, v.input_hash, JSON.stringify(v.response), v.created_at_ms]); }
  async claimNext(v) {
    const leaseId = crypto.randomUUID();
    const r = await this.client.query(SQL.lease, [v.now_ms, v.worker_id, leaseId, v.lease_expires_ms]);
    const row = normalizeLease(r.rows[0]);
    if (row) await this.event('CLAIM', { lease_id: leaseId, packet_id: row.packet_id, packet_hash: row.packet_hash, worker_id: v.worker_id, at_ms: v.now_ms });
    return row;
  }
  async getLease(id) { const r = await this.client.query(SQL.getLease, [id]); return normalizeLease(r.rows[0]); }
  async event(kind, v) { const r = await this.client.query(SQL.event, [v.lease_id, kind, JSON.stringify(v), v.at_ms]); return { state: 'RECORDED', event_id: r.rows[0].event_id }; }
  recordSearch(v) { return this.event('SEARCH', v); }
  recordRead(v) { return this.event('FETCH_READ', v); }
  async completionBundle(leaseId) {
    const r = await this.client.query(SQL.completionBundle, [leaseId]);
    return r.rows[0] || null;
  }
  async persistEvidence(v) {
    const db = this.client.totalCount === undefined ? this.client : await this.client.connect();
    await db.query('BEGIN');
    try {
      const r = await db.query(SQL.evidence, [v.lease_id, v.packet_hash, v.worker_id, v.kind, JSON.stringify(v.claims), JSON.stringify(v.sources), v.evidence_hash, v.at_ms]);
      for (const source of v.sources || []) await db.query(SQL.source, [source.content_hash, source.url, source.source_kind || 'PUBLIC_WEB', source.trust_tier || null, source.observed_at, JSON.stringify(source.metadata || {})]);
      for (const candidate of v.discovery_candidates || []) await db.query(SQL.discovery, [v.lease_id, candidate.candidate_id, candidate.lifecycle_state || 'DISCOVERED', candidate.trust_tier || 'T3_COMMUNITY_CORROBORATION', JSON.stringify(candidate.evidence_refs || [v.evidence_hash])]);
      const maturity = v.kind === 'DEEPER_EVIDENCE' ? 'DEEP_EVIDENCE_COMPLETE' : 'ANALYZED';
      await db.query(
        `UPDATE vekl_research_coverage c
         SET status=$2, reason=$3,
             artifact_refs=CASE WHEN artifact_refs ? $4 THEN artifact_refs ELSE artifact_refs || jsonb_build_array($4::text) END,
             updated_at=now()
         FROM vekl_research_packets p
         WHERE p.lease_id=$1 AND c.mission_id=p.mission_id AND c.unit_lineage_id=p.unit_lineage_id
           AND c.status NOT IN ('QUALIFIED','ADMITTED')`,
        [v.lease_id, maturity, v.kind, v.evidence_hash],
      );
      await db.query(SQL.event, [
        v.lease_id,
        v.kind === 'DEEPER_EVIDENCE' ? 'DEEPER_EVIDENCE_SUBMITTED' : 'ANALYSIS_SUBMITTED',
        JSON.stringify({ lease_id: v.lease_id, packet_hash: v.packet_hash, evidence_hash: v.evidence_hash, worker_id: v.worker_id }),
        v.at_ms,
      ]);
      await db.query('COMMIT');
      return { state: 'VALIDATED_PERSISTED', evidence_hash: r.rows[0].evidence_hash, coverage_maturity: maturity };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { if (db !== this.client) db.release(); }
  }
  async transition(state, v) {
    const deepState = state === 'COMPLETE' ? 'COMPLETE' : state === 'REFUSED' ? 'REFUSED' : 'READY';
    const resume = {
      reason: v.reason || null,
      at_ms: v.at_ms,
      completion_gate: v.completion_gate || null,
      chatgpt_deep_research: { state: deepState, updated_at_ms: v.at_ms },
    };
    const r = await this.client.query(SQL.transition, [v.lease_id, state, JSON.stringify(resume)]);
    return { state: r.rows[0]?.state || state };
  }
  complete(v) { return this.transition('COMPLETE', v); }
  retry(v) { return this.transition('RETRY', v); }
  refuse(v) { return this.transition('REFUSED', v); }
}

export { SQL as VEKL_RESEARCH_FIXED_SQL };
