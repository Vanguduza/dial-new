#!/usr/bin/env node
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { Pool }=require(process.env.DIAL_VEKL_PG_PACKAGE || '/home/ubuntu/.local/share/dial-vekl-runtime/node_modules/pg');
const pool=new Pool({host:'/var/run/postgresql',database:'dial_vekl',user:'dial_research_loop',max:1,application_name:'dial-vekl-research-repair'});
try {
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    const rows=await db.query(`
      SELECT p.packet_id,p.packet_hash
      FROM vekl_research_packets p
      WHERE p.state='COMPLETE'
        AND NOT EXISTS (
          SELECT 1 FROM vekl_research_evidence e
          WHERE e.packet_hash=p.packet_hash AND e.evidence_kind='DEEPER_EVIDENCE'
        )
      FOR UPDATE OF p`);
    for (const row of rows.rows) {
      const marker={
        state:'READY',
        repair_reason:'LEGACY_COMPLETE_WITHOUT_DEEPER_EVIDENCE',
        repaired_at:new Date().toISOString(),
      };
      await db.query(`
        UPDATE vekl_research_packets
        SET state='RETRY',worker_id=NULL,lease_id=NULL,lease_expires_at=NULL,
            resume=COALESCE(resume,'{}'::jsonb)
              || jsonb_build_object('chatgpt_deep_research',$2::jsonb)
              || jsonb_build_object('completion_gate_repair',jsonb_build_object('reason','MISSING_DEEPER_EVIDENCE','repaired_at',now()))
        WHERE packet_id=$1`,[row.packet_id,JSON.stringify(marker)]);
      await db.query(`
        INSERT INTO vekl_research_events(lease_id,event_kind,payload)
        VALUES(NULL,'COMPLETION_GATE_REPAIR',$1)`,[{
          packet_id:row.packet_id,
          packet_hash:row.packet_hash,
          reason:'LEGACY_COMPLETE_WITHOUT_DEEPER_EVIDENCE',
        }]);
    }
    await db.query('COMMIT');
    console.log(JSON.stringify({ok:true,repaired_invalid_complete_packets:rows.rowCount}));
  } catch(e){await db.query('ROLLBACK');throw e} finally {db.release()}
} finally {await pool.end()}
