#!/usr/bin/env node
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { runResearchBatch, researchProviderStatus } from '../../../agent-system/orchestration/providers/research/research-provider-router.mjs';
import { UNION_ALPHA_DATA_CLASS } from '../../../agent-system/orchestration/providers/openrouter/union-alpha-research-adapter.mjs';
import { RESEARCH_DIMENSIONS } from '../../../agent-system/orchestration/vekl-research-contracts.mjs';

const require = createRequire(import.meta.url);
const pg = require(process.env.DIAL_VEKL_PG_PACKAGE || '/home/ubuntu/.local/share/dial-vekl-runtime/node_modules/pg');
const { Pool } = pg;

const REPO = process.env.DIAL_REPO_DIR || process.cwd();
const ROOT = process.env.DIAL_CONTROL_HOME || '/var/lib/dial-control';
const MODEL = 'openai/gpt-oss-120b';
const WORKER_ID = 'groq-vekl-worker';
const KEY_FILE = '/var/lib/dial-worker/secrets/groq-api.key';
const ZDR_MARKER = '/var/lib/dial-worker/secrets/groq-zdr-enabled';
const sha = (v) => crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');

async function claimOne(pool) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const found = await db.query(
      `SELECT * FROM vekl_research_packets
       WHERE state IN ('READY','RETRY')
         AND NOT (resume ? 'groq_first_pass')
         AND (lease_expires_at IS NULL OR lease_expires_at <= now())
       ORDER BY ordinal
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
    );
    if (!found.rows[0]) {
      await db.query('COMMIT');
      return null;
    }
    const packet = found.rows[0];
    const leaseId = crypto.randomUUID();
    await db.query(
      `UPDATE vekl_research_packets
       SET state='LEASED', worker_id=$2, lease_id=$3, lease_expires_at=now()+interval '30 minutes'
       WHERE packet_id=$1`,
      [packet.packet_id, WORKER_ID, leaseId],
    );
    await db.query('COMMIT');
    return { ...packet, lease_id: leaseId };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

function batchFromPacket(row) {
  const packet = row.packet_json;
  const subject = packet?.provider_subject;
  if (!subject?.subject_id) throw new Error('GROQ_PACKET_PROVIDER_SUBJECT_REQUIRED');
  return {
    batch: {
      mission_id: packet.mission_id,
      batch_id: `groq.${row.packet_id}`.slice(0, 160),
      batch_kind: 'UNIT_RESEARCH',
      data_class: UNION_ALPHA_DATA_CLASS,
      subjects: [subject],
    },
    bindings: [{
      subject_id: subject.subject_id,
      unit_lineage_id: packet.unit_lineage_id,
      unit_revision_hash: packet.unit_revision_hash,
      feature_ids: packet.feature_ids || [],
    }],
  };
}

function evidencePayload(record, subjectId) {
  const subject = record.result?.subjects?.find((x) => x.subject_id === subjectId);
  if (!subject) throw new Error('GROQ_SUBJECT_RESULT_MISSING');
  return {
    claims: {
      roles: subject.roles,
      cross_role_synthesis: subject.cross_role_synthesis || {},
      batch_contradictions: record.result.batch_contradictions || [],
    },
    sources: {
      provider: record.provider,
      model_id: record.model_id,
      provider_packet_hash: record.provider_packet_hash,
      response_hash: record.response_hash,
      open_world_evidence_hash: record.open_world_evidence_hash,
      open_world_evidence: record.open_world_evidence || {},
    },
  };
}

async function persistSuccess(pool, row, record, subjectId) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const current = await db.query('SELECT state,lease_id FROM vekl_research_packets WHERE packet_id=$1 FOR UPDATE', [row.packet_id]);
    if (current.rows[0]?.state !== 'LEASED' || current.rows[0]?.lease_id !== row.lease_id) {
      throw new Error('GROQ_LEASE_LOST');
    }

    const evidence = evidencePayload(record, subjectId);
    const evidenceHash = sha({
      packet_hash: row.packet_hash,
      evidence_kind: 'GROQ_RESEARCH',
      claims: evidence.claims,
      sources: evidence.sources,
    });

    await db.query(
      `INSERT INTO vekl_research_evidence
       (evidence_hash,lease_id,packet_hash,worker_id,evidence_kind,claims,sources)
       VALUES($1,$2,$3,$4,'GROQ_RESEARCH',$5,$6)
       ON CONFLICT(evidence_hash) DO NOTHING`,
      [evidenceHash, row.lease_id, row.packet_hash, WORKER_ID, evidence.claims, evidence.sources],
    );

    const official = record.open_world_evidence?.official || [];
    for (const source of official) {
      if (!source?.url || !/^[a-f0-9]{64}$/.test(String(source.sha256 || ''))) continue;
      await db.query(
        `INSERT INTO vekl_research_sources(source_hash,url,source_kind,trust_tier,observed_at,metadata)
         VALUES($1,$2,'PUBLIC_OFFICIAL','T1_OFFICIAL',now(),$3)
         ON CONFLICT(source_hash) DO NOTHING`,
        [source.sha256, source.url, {
          content_type: source.content_type || null,
          evidence_ref: source.ref || source.url,
          provider: 'groq',
        }],
      );
      const candidateId = 'DISC-' + sha(source.url).slice(0, 24);
      await db.query(
        `INSERT INTO vekl_research_discovery_links(packet_id,candidate_id,lifecycle_state,trust_tier,evidence_refs)
         VALUES($1,$2,'DISCOVERED','T1_OFFICIAL',$3)
         ON CONFLICT(packet_id,candidate_id)
         DO UPDATE SET evidence_refs=EXCLUDED.evidence_refs`,
        [row.packet_id, candidateId, JSON.stringify([evidenceHash, source.sha256])],
      );
    }

    for (const item of record.open_world_evidence?.exa || []) {
      const candidateId = 'DISC-' + sha(item.ref || item.query || JSON.stringify(item)).slice(0, 24);
      await db.query(
        `INSERT INTO vekl_research_discovery_links(packet_id,candidate_id,lifecycle_state,trust_tier,evidence_refs)
         VALUES($1,$2,'DISCOVERED','T3_COMMUNITY_CORROBORATION',$3)
         ON CONFLICT(packet_id,candidate_id)
         DO UPDATE SET evidence_refs=EXCLUDED.evidence_refs`,
        [row.packet_id, candidateId, JSON.stringify([evidenceHash, item.ref || null].filter(Boolean))],
      );
    }

    await db.query(
      `UPDATE vekl_research_coverage
       SET status='SYNTHESIZED',
           reason='GROQ_OPEN_WORLD_FIRST_PASS',
           artifact_refs=CASE
             WHEN artifact_refs ? $4 THEN artifact_refs
             ELSE artifact_refs || jsonb_build_array($4::text)
           END,
           updated_at=now()
       WHERE mission_id=$1 AND unit_lineage_id=$2 AND dimension=ANY($3::text[])`,
      [row.mission_id, row.unit_lineage_id, RESEARCH_DIMENSIONS, evidenceHash],
    );

    const resume = {
      groq_first_pass: {
        evidence_hash: evidenceHash,
        provider: 'groq',
        model_id: MODEL,
        completed: true,
        source_count: official.length,
        completed_at: new Date().toISOString(),
      },
    };
    await db.query(
      `UPDATE vekl_research_packets
       SET state='READY', worker_id=NULL, lease_id=NULL, lease_expires_at=NULL,
           resume=COALESCE(resume,'{}'::jsonb) || $2::jsonb
       WHERE packet_id=$1`,
      [row.packet_id, JSON.stringify(resume)],
    );
    await db.query(
      `INSERT INTO vekl_research_events(lease_id,event_kind,payload)
       VALUES($1,'GROQ_FIRST_PASS_COMPLETE',$2)`,
      [row.lease_id, {
        packet_id: row.packet_id,
        packet_hash: row.packet_hash,
        evidence_hash: evidenceHash,
        provider: 'groq',
        model_id: MODEL,
      }],
    );
    await db.query('COMMIT');
    return { evidence_hash: evidenceHash, packet_hash: row.packet_hash, source_count: official.length };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

async function releaseForRetry(pool, row, error) {
  await pool.query(
    `UPDATE vekl_research_packets
     SET state='RETRY', worker_id=NULL, lease_id=NULL, lease_expires_at=NULL,
         resume=COALESCE(resume,'{}'::jsonb) || $2::jsonb
     WHERE packet_id=$1 AND lease_id=$3`,
    [row.packet_id, JSON.stringify({
      groq_last_error: {
        message: String(error?.message || error).slice(0, 1200),
        at: new Date().toISOString(),
      },
    }), row.lease_id],
  );
}

async function main() {
  const env = {
    ...process.env,
    DIAL_HOST_ROLE: 'vekl-worker',
    GROQ_API_KEY_FILE: KEY_FILE,
    GROQ_ZDR_MARKER: ZDR_MARKER,
  };
  const status = researchProviderStatus({ root: ROOT, env });
  if (!status.groq.approved) throw new Error('GROQ_RESEARCH_NOT_APPROVED:' + status.groq.reason);

  const pool = new Pool({
    host: '/var/run/postgresql',
    database: 'dial_vekl',
    user: 'dial_research_loop',
    max: 2,
    application_name: 'dial-vekl-groq-research',
  });

  let row = null;
  try {
    row = await claimOne(pool);
    if (!row) {
      console.log(JSON.stringify({ ok: true, state: 'EMPTY', provider_status: status }, null, 2));
      return;
    }
    const { batch, bindings } = batchFromPacket(row);
    const record = await runResearchBatch({
      batch,
      bindings,
      repoDir: REPO,
      root: ROOT,
      provider: 'groq',
      env,
    });
    const persisted = await persistSuccess(pool, row, record, batch.subjects[0].subject_id);
    console.log(JSON.stringify({
      ok: true,
      state: 'GROQ_FIRST_PASS_COMPLETE',
      packet_id: row.packet_id,
      ordinal: row.ordinal,
      unit_lineage_id: row.unit_lineage_id,
      ...persisted,
    }, null, 2));
  } catch (error) {
    if (row) await releaseForRetry(pool, row, error).catch(() => {});
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error?.stack || error).slice(0, 5000) }, null, 2));
  process.exitCode = 1;
});
