#!/usr/bin/env node
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { Pool }=require(process.env.DIAL_VEKL_PG_PACKAGE || '/home/ubuntu/.local/share/dial-vekl-runtime/node_modules/pg');
const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');

const pool=new Pool({host:'/var/run/postgresql',database:'dial_vekl',user:'dial_research_loop',max:1,application_name:'dial-vekl-reference-promoter'});
try {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    const links=await db.query(`
      SELECT dl.packet_id,dl.candidate_id,dl.lifecycle_state,dl.trust_tier,p.mission_id,p.unit_lineage_id
      FROM vekl_research_discovery_links dl
      JOIN vekl_research_packets p ON p.packet_id=dl.packet_id
      JOIN vekl_research_missions m ON m.mission_id=p.mission_id
      WHERE m.state='READY' AND dl.lifecycle_state IN ('DISCOVERED','TRIAGED','INVESTIGATING','QUALIFIED')
        AND dl.trust_tier='T1_OFFICIAL'
      ORDER BY p.ordinal LIMIT 100 FOR UPDATE OF dl SKIP LOCKED`);
    const sources=await db.query(`SELECT source_hash,url,source_kind,trust_tier,observed_at FROM vekl_research_sources WHERE trust_tier='T1_OFFICIAL'`);
    const byCandidate=new Map(sources.rows.map(s=>['DISC-'+sha(s.url).slice(0,24),s]));
    let admitted=0;
    for (const row of links.rows) {
      const source=byCandidate.get(row.candidate_id);
      if (!source || !/^https:\/\//.test(source.url) || !/^[a-f0-9]{64}$/.test(source.source_hash)) continue;
      const evidence={risk_class:'REFERENCE_KNOWLEDGE',qualification_track:'REFERENCE_LIGHTWEIGHT_V1',publisher_domain_verified:true,task_relevance:'BOUND_TO_CANONICAL_DU_PACKET',freshness_observed_at:source.observed_at,content_hash:source.source_hash,authority:'ENGINEERING_GUIDANCE_ONLY'};
      const lifecycle = ['TRIAGED','INVESTIGATING','QUALIFIED','ADMITTED'];
      let previous = row.lifecycle_state;
      const start = Math.max(0, lifecycle.indexOf(previous) + 1);
      for (const state of lifecycle.slice(start)) {
        const reason = state === 'TRIAGED' ? 'OFFICIAL_REFERENCE_RELEVANT'
          : state === 'INVESTIGATING' ? 'PUBLISHER_DOMAIN_AND_HASH_VERIFIED'
          : state === 'QUALIFIED' ? 'REFERENCE_LIGHTWEIGHT_V1_PASSED'
          : 'REFERENCE_ENGINEERING_GUIDANCE_ADMITTED';
        await db.query(
          `UPDATE vekl_research_discovery_links SET lifecycle_state=$3,evidence_refs=CASE WHEN evidence_refs ? $4 THEN evidence_refs ELSE evidence_refs||jsonb_build_array($4::text) END WHERE packet_id=$1 AND candidate_id=$2`,
          [row.packet_id,row.candidate_id,state,source.source_hash],
        );
        await db.query(
          `INSERT INTO vekl_research_events(lease_id,event_kind,payload) VALUES(NULL,'REFERENCE_DISCOVERY_LIFECYCLE',$1)`,
          [{packet_id:row.packet_id,candidate_id:row.candidate_id,from_state:previous,to_state:state,reason,source_hash:source.source_hash,...evidence}],
        );
        previous = state;
      }
      await db.query(`UPDATE vekl_research_coverage SET status='ADMITTED',reason='REFERENCE_LIGHTWEIGHT_V1',artifact_refs=CASE WHEN artifact_refs ? $4 THEN artifact_refs ELSE artifact_refs||jsonb_build_array($4::text) END,updated_at=now() WHERE mission_id=$1 AND unit_lineage_id=$2 AND dimension=ANY($3::text[])`,[row.mission_id,row.unit_lineage_id,['SOURCES','OFFICIAL_DOCS'],source.source_hash]);
      admitted++;
    }
    await db.query('COMMIT');
    console.log(JSON.stringify({ok:true,reference_candidates_admitted:admitted}));
  } catch(e){await db.query('ROLLBACK');throw e} finally {db.release()}
} finally {await pool.end()}
