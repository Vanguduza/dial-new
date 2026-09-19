import { createVeklResearchPool } from './vekl-research-db-client.mjs';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||min));
const pct=(n,d)=>d ? Number(((Number(n)*100)/Number(d)).toFixed(2)) : 0;

export class VeklResearchMonitor {
  constructor({ pool } = {}) { this.pool=pool || createVeklResearchPool(); }

  async snapshot() {
    const db=this.pool;
    const mission=(await db.query(`SELECT mission_id,provider,model_id,state,repository_sha,graph_generation_id,graph_revision_hash,created_at,updated_at FROM vekl_research_missions WHERE state='READY' ORDER BY updated_at DESC LIMIT 1`)).rows[0] || null;
    if(!mission) return {state:'NO_READY_MISSION'};
    const mid=mission.mission_id;
    const packetRows=(await db.query(`SELECT state,count(*)::int AS count FROM vekl_research_packets WHERE mission_id=$1 GROUP BY state ORDER BY state`,[mid])).rows;
    const coverageRows=(await db.query(`SELECT status,count(*)::int AS count FROM vekl_research_coverage WHERE mission_id=$1 GROUP BY status ORDER BY status`,[mid])).rows;
    const evidenceRows=(await db.query(`SELECT evidence_kind,count(*)::int AS count FROM vekl_research_evidence e JOIN vekl_research_packets p ON p.packet_hash=e.packet_hash WHERE p.mission_id=$1 GROUP BY evidence_kind ORDER BY evidence_kind`,[mid])).rows;
    const counts=(await db.query(`
      SELECT
        (SELECT count(*)::int FROM vekl_research_packets WHERE mission_id=$1) AS packets,
        (SELECT count(*)::int FROM vekl_research_coverage WHERE mission_id=$1) AS coverage_cells,
        (SELECT count(*)::int FROM vekl_research_sources s WHERE EXISTS (SELECT 1 FROM vekl_research_evidence e JOIN vekl_research_packets p ON p.packet_hash=e.packet_hash WHERE p.mission_id=$1 AND e.sources::text LIKE '%'||s.source_hash||'%')) AS sources,
        (SELECT count(*)::int FROM vekl_research_discovery_links d JOIN vekl_research_packets p ON p.packet_id=d.packet_id WHERE p.mission_id=$1) AS discovery_links,
        (SELECT count(*)::int FROM vekl_research_artifact_links a JOIN vekl_research_packets p ON p.packet_id=a.packet_id WHERE p.mission_id=$1) AS artifact_links,
        (SELECT count(*)::int FROM vekl_research_packets WHERE mission_id=$1 AND COALESCE((packet_json->'guided_frontend_context'->>'applicable')::boolean,false)) AS frontend_applicable,
        (SELECT count(*)::int FROM vekl_research_packets WHERE mission_id=$1 AND COALESCE((packet_json->'n8n_architecture_context'->>'applicable')::boolean,false)) AS n8n_applicable,
        (SELECT count(*)::int FROM vekl_research_packets WHERE mission_id=$1 AND COALESCE(resume->'chatgpt_deep_research'->>'state','')='READY') AS deep_ready
    `,[mid])).rows[0];
    const leases=(await db.query(`SELECT packet_id,ordinal,unit_lineage_id,worker_id,lease_id,lease_expires_at FROM vekl_research_packets WHERE mission_id=$1 AND state='LEASED' ORDER BY ordinal`,[mid])).rows;
    const latest=(await db.query(`SELECT event_id,lease_id,event_kind,payload,created_at FROM vekl_research_events ev WHERE EXISTS(SELECT 1 FROM vekl_research_packets p WHERE p.mission_id=$1 AND (p.lease_id=ev.lease_id OR p.packet_id=ev.payload->>'packet_id')) ORDER BY event_id DESC LIMIT 20`,[mid])).rows.reverse();
    const packets=Object.fromEntries(packetRows.map(r=>[r.state,r.count]));
    const evidence=Object.fromEntries(evidenceRows.map(r=>[r.evidence_kind,r.count]));
    const coverage=Object.fromEntries(coverageRows.map(r=>[r.status,r.count]));
    const total=counts.packets;
    return {
      authority:'READ_ONLY_VEKL_MONITOR',
      mission,
      invariant:{development_units:total,coverage_cells:counts.coverage_cells,expected_units:309,expected_cells:5253,roles_per_packet:18},
      packets,coverage,evidence,
      counts:{sources:counts.sources,discovery_links:counts.discovery_links,artifact_links:counts.artifact_links,frontend_applicable:counts.frontend_applicable,n8n_applicable:counts.n8n_applicable,deep_ready:counts.deep_ready},
      progress:{
        groq_first_pass_pct:pct(evidence.GROQ_RESEARCH||0,total),
        chatgpt_analysis_pct:pct(evidence.ANALYSIS||0,total),
        deeper_evidence_pct:pct(evidence.DEEPER_EVIDENCE||0,total),
        terminal_complete_pct:pct(packets.COMPLETE||0,total),
      },
      leases,latest_events:latest,
    };
  }

  async timeline({ cursor=0, limit=100 }={}) {
    const bounded=clamp(limit,1,200);
    const rows=(await this.pool.query(`SELECT event_id,lease_id,event_kind,payload,created_at FROM vekl_research_events WHERE event_id>$1 ORDER BY event_id LIMIT $2`,[Number(cursor)||0,bounded])).rows;
    return {authority:'READ_ONLY_VEKL_MONITOR',events:rows,next_cursor:rows.length?rows.at(-1).event_id:Number(cursor)||0,has_more:rows.length===bounded};
  }

  async packet({ packet_id=null, ordinal=null }={}) {
    if(!packet_id && ordinal==null) throw new Error('PACKET_ID_OR_ORDINAL_REQUIRED');
    const params=packet_id?[packet_id]:[Number(ordinal)];
    const where=packet_id?'p.packet_id=$1':"p.ordinal=$1 AND p.mission_id=(SELECT mission_id FROM vekl_research_missions WHERE state='READY' ORDER BY updated_at DESC LIMIT 1)";
    const p=(await this.pool.query(`SELECT p.packet_id,p.mission_id,p.ordinal,p.unit_lineage_id,p.unit_revision_hash,p.packet_hash,p.state,p.worker_id,p.lease_id,p.lease_expires_at,p.resume,p.packet_json FROM vekl_research_packets p WHERE ${where} LIMIT 1`,params)).rows[0];
    if(!p) return {state:'NOT_FOUND'};
    const evidence=(await this.pool.query(`SELECT evidence_hash,evidence_kind,worker_id,claims,sources,created_at FROM vekl_research_evidence WHERE packet_hash=$1 ORDER BY created_at`,[p.packet_hash])).rows;
    const discovery=(await this.pool.query(`SELECT candidate_id,lifecycle_state,trust_tier,evidence_refs FROM vekl_research_discovery_links WHERE packet_id=$1 ORDER BY candidate_id`,[p.packet_id])).rows;
    const events=(await this.pool.query(`SELECT event_id,lease_id,event_kind,payload,created_at FROM vekl_research_events WHERE payload->>'packet_id'=$1 OR lease_id=$2 ORDER BY event_id`,[p.packet_id,p.lease_id])).rows;
    return {authority:'READ_ONLY_VEKL_MONITOR',packet:p,evidence,discovery,events};
  }

  async alerts() {
    const snap=await this.snapshot();
    if(snap.state==='NO_READY_MISSION') return {authority:'READ_ONLY_VEKL_MONITOR',alerts:[{severity:'BLOCKING',code:'NO_READY_MISSION'}]};
    const alerts=[];
    if(snap.invariant.development_units!==309) alerts.push({severity:'BLOCKING',code:'DU_COUNT_DRIFT',observed:snap.invariant.development_units,expected:309});
    if(snap.invariant.coverage_cells!==5253) alerts.push({severity:'BLOCKING',code:'COVERAGE_COUNT_DRIFT',observed:snap.invariant.coverage_cells,expected:5253});
    for(const l of snap.leases) if(Date.parse(l.lease_expires_at)<=Date.now()) alerts.push({severity:'WARN',code:'EXPIRED_LEASE',packet_id:l.packet_id,worker_id:l.worker_id});
    for(const state of ['RETRY','REFUSED','BLOCKED']) if((snap.packets[state]||0)>0) alerts.push({severity:state==='BLOCKED'?'BLOCKING':'WARN',code:'PACKETS_'+state,count:snap.packets[state]});
    const rows=(await this.pool.query(`SELECT p.packet_id,p.ordinal FROM vekl_research_packets p WHERE EXISTS(SELECT 1 FROM vekl_research_evidence e WHERE e.packet_hash=p.packet_hash AND e.evidence_kind='ANALYSIS') AND NOT EXISTS(SELECT 1 FROM vekl_research_evidence e WHERE e.packet_hash=p.packet_hash AND e.evidence_kind='DEEPER_EVIDENCE') ORDER BY p.ordinal LIMIT 50`)).rows;
    if(rows.length) alerts.push({severity:'INFO',code:'ANALYZED_AWAITING_DEEPER_EVIDENCE',count:rows.length,packets:rows});
    return {authority:'READ_ONLY_VEKL_MONITOR',alerts};
  }
}
