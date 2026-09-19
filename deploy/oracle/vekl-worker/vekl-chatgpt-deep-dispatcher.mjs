#!/usr/bin/env node
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { Pool }=require(process.env.DIAL_VEKL_PG_PACKAGE || '/home/ubuntu/.local/share/dial-vekl-runtime/node_modules/pg');

const pool=new Pool({host:'/var/run/postgresql',database:'dial_vekl',user:'dial_research_loop',max:1,application_name:'dial-vekl-chatgpt-deep-dispatcher'});
try {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const rows=await client.query(`
      SELECT p.packet_id,p.packet_hash,p.resume
      FROM vekl_research_packets p
      JOIN vekl_research_missions m ON m.mission_id=p.mission_id
      WHERE m.state='READY'
        AND p.state IN ('READY','RETRY')
        AND EXISTS (SELECT 1 FROM vekl_research_evidence e WHERE e.packet_hash=p.packet_hash AND e.evidence_kind='GROQ_RESEARCH')
        AND NOT EXISTS (SELECT 1 FROM vekl_research_evidence e WHERE e.packet_hash=p.packet_hash AND e.evidence_kind='DEEPER_EVIDENCE')
        AND COALESCE(p.resume->'chatgpt_deep_research'->>'state','') NOT IN ('READY','LEASED','COMPLETE')
      ORDER BY p.ordinal
      LIMIT 50
      FOR UPDATE OF p SKIP LOCKED`);
    for (const row of rows.rows) {
      const marker={state:'READY',dispatcher:'DIAL_NATIVE_HANDOFF',reason:'GROQ_FIRST_PASS_AVAILABLE',ready_at:new Date().toISOString()};
      await client.query(`UPDATE vekl_research_packets SET resume=COALESCE(resume,'{}'::jsonb)||jsonb_build_object('chatgpt_deep_research',$2::jsonb) WHERE packet_id=$1`,[row.packet_id,JSON.stringify(marker)]);
      await client.query(`INSERT INTO vekl_research_events(lease_id,event_kind,payload) VALUES(NULL,'DEEP_RESEARCH_READY',$1)`,[{packet_id:row.packet_id,packet_hash:row.packet_hash,dispatcher:'DIAL_NATIVE_HANDOFF'}]);
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ok:true,deep_research_ready_marked:rows.rowCount}));
  } catch(e){await client.query('ROLLBACK');throw e} finally {client.release()}
} finally {await pool.end()}
