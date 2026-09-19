#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildResearchHarvestManifest, RESEARCH_ROLES } from '../../../agent-system/orchestration/vekl-research-harvest.mjs';
import { RESEARCH_DIMENSIONS } from '../../../agent-system/orchestration/vekl-research-contracts.mjs';
import { runResearchBatch, researchProviderStatus } from '../../../agent-system/orchestration/providers/research/research-provider-router.mjs';

const require = createRequire(import.meta.url);
const pg = require(process.env.DIAL_VEKL_PG_PACKAGE || '/home/ubuntu/.local/share/dial-vekl-runtime/node_modules/pg');
const { Pool } = pg;
const REPO = process.env.DIAL_REPO_DIR || process.cwd();
const ROOT = process.env.DIAL_CONTROL_HOME || '/var/lib/dial-control';
const STATE_DIR = path.join(ROOT, 'knowledge/research/groq-harvest');
const MODEL = 'openai/gpt-oss-120b';
const WORKER_ID = 'groq-vekl-worker';
const sha = (v) => crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');

function ensureState() { fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 }); }
function statePath(missionId) { return path.join(STATE_DIR, missionId + '.json'); }
function readState(missionId) {
  try { return JSON.parse(fs.readFileSync(statePath(missionId), 'utf8')); }
  catch { return { schema_version: 1, mission_id: missionId, next_batch_index: 0, completed_batches: [], failures: [] }; }
}
function writeState(v) {
  const tmp = statePath(v.mission_id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ ...v, updated_at: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, statePath(v.mission_id));
}
function evidenceForUnit(record, subjectId) {
  const subject = record.result.subjects.find((x) => x.subject_id === subjectId);
  if (!subject) throw new Error('GROQ_SUBJECT_RESULT_MISSING:' + subjectId);
  return {
    claims: { roles: subject.roles, cross_role_synthesis: subject.cross_role_synthesis || {}, batch_contradictions: record.result.batch_contradictions || [] },
    sources: { open_world_evidence: record.open_world_evidence || {}, provider: record.provider, model_id: record.model_id, provider_packet_hash: record.provider_packet_hash, response_hash: record.response_hash },
  };
}

async function persistUnit(client, { manifest, binding, subjectId, record }) {
  const found = await client.query('SELECT packet_id,packet_hash,state FROM vekl_research_packets WHERE mission_id=$1 AND unit_lineage_id=$2 FOR UPDATE', [manifest.mission_id, binding.unit_lineage_id]);
  const packet = found.rows[0];
  if (!packet) throw new Error('PACKET_NOT_SEEDED:' + binding.unit_lineage_id);
  const prior = await client.query("SELECT evidence_hash FROM vekl_research_evidence WHERE packet_hash=$1 AND evidence_kind='GROQ_RESEARCH' ORDER BY created_at DESC LIMIT 1", [packet.packet_hash]);
  if (prior.rows[0]) return { unit_lineage_id: binding.unit_lineage_id, evidence_hash: prior.rows[0].evidence_hash, replay: true };
  if (!['READY', 'RETRY'].includes(packet.state)) throw new Error('PACKET_NOT_AVAILABLE_FOR_GROQ:' + binding.unit_lineage_id + ':' + packet.state);
  const leaseId = crypto.randomUUID();
  await client.query("UPDATE vekl_research_packets SET state='LEASED',worker_id=$2,lease_id=$3,lease_expires_at=now()+interval '30 minutes' WHERE packet_id=$1", [packet.packet_id, WORKER_ID, leaseId]);
  const evidence = evidenceForUnit(record, subjectId);
  const evidenceHash = sha({ packet_hash: packet.packet_hash, evidence_kind: 'GROQ_RESEARCH', claims: evidence.claims, sources: evidence.sources });
  await client.query("INSERT INTO vekl_research_evidence(evidence_hash,lease_id,packet_hash,worker_id,evidence_kind,claims,sources) VALUES($1,$2,$3,$4,'GROQ_RESEARCH',$5,$6) ON CONFLICT(evidence_hash) DO NOTHING", [evidenceHash, leaseId, packet.packet_hash, WORKER_ID, evidence.claims, evidence.sources]);
  await client.query("UPDATE vekl_research_coverage SET status='SYNTHESIZED',reason='GROQ_OPEN_WORLD_FIRST_PASS',artifact_refs=CASE WHEN artifact_refs ? $4 THEN artifact_refs ELSE artifact_refs || jsonb_build_array($4::text) END,updated_at=now() WHERE mission_id=$1 AND unit_lineage_id=$2 AND dimension=ANY($3::text[])", [manifest.mission_id, binding.unit_lineage_id, RESEARCH_DIMENSIONS, evidenceHash]);
  const resume = { groq_first_pass: { evidence_hash: evidenceHash, provider: 'groq', model_id: MODEL, completed: true } };
  await client.query("UPDATE vekl_research_packets SET state='READY',worker_id=NULL,lease_id=NULL,lease_expires_at=NULL,resume=COALESCE(resume,'{}'::jsonb)||$2::jsonb WHERE packet_id=$1", [packet.packet_id, JSON.stringify(resume)]);
  await client.query("INSERT INTO vekl_research_events(lease_id,event_kind,payload) VALUES($1,'GROQ_FIRST_PASS_COMPLETE',$2)", [leaseId, { unit_lineage_id: binding.unit_lineage_id, evidence_hash: evidenceHash, provider: 'groq', model_id: MODEL }]);
  return { unit_lineage_id: binding.unit_lineage_id, evidence_hash: evidenceHash, replay: false };
}

async function runOne(manifest, state, pool) {
  for (let index = state.next_batch_index; index < manifest.unit_batches.length; index += 1) {
    const batch = { ...manifest.unit_batches[index], mission_id: manifest.mission_id };
    try {
      const record = await runResearchBatch({ batch, bindings: batch.bindings, repoDir: REPO, root: ROOT, provider: 'groq', env: { ...process.env, DIAL_HOST_ROLE: 'vekl-worker', GROQ_API_KEY_FILE: '/var/lib/dial-worker/secrets/groq-api.key' } });
      const bySubject = new Map(batch.bindings.map((x) => [x.subject_id, x]));
      const client = await pool.connect();
      const persisted = [];
      try {
        await client.query('BEGIN');
        for (const subject of record.result.subjects) persisted.push(await persistUnit(client, { manifest, binding: bySubject.get(subject.subject_id), subjectId: subject.subject_id, record }));
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      state.completed_batches = [...new Set([...(state.completed_batches || []), batch.batch_id])];
      state.next_batch_index = index + 1;
      state.last_batch = { batch_id: batch.batch_id, evidence_hash: record.evidence_hash, persisted, at: new Date().toISOString() };
      writeState(state);
      return { state: 'BATCH_COMPLETE', batch_id: batch.batch_id, batch_index: index, units: persisted.length, evidence_hash: record.evidence_hash };
    } catch (error) {
      state.failures = [...(state.failures || []), { batch_id: batch.batch_id, index, error: String(error?.message || error).slice(0, 2000), at: new Date().toISOString() }].slice(-50);
      state.last_error = state.failures.at(-1); writeState(state); throw error;
    }
  }
  const r = await pool.query("SELECT (SELECT count(*) FROM vekl_research_evidence e JOIN vekl_research_packets p ON p.packet_hash=e.packet_hash WHERE p.mission_id=$1 AND e.evidence_kind='GROQ_RESEARCH')::int AS evidence,(SELECT count(*) FROM vekl_research_coverage WHERE mission_id=$1 AND status='SYNTHESIZED')::int AS cells", [manifest.mission_id]);
  return { state: 'COMPLETE', mission_id: manifest.mission_id, counts: r.rows[0] };
}

async function main() {
  ensureState();
  const env = { ...process.env, DIAL_HOST_ROLE: 'vekl-worker', GROQ_API_KEY_FILE: '/var/lib/dial-worker/secrets/groq-api.key' };
  const status = researchProviderStatus({ root: ROOT, env });
  if (!status.groq.approved) throw new Error('GROQ_RESEARCH_NOT_APPROVED:' + status.groq.reason);
  const manifest = buildResearchHarvestManifest({ repoDir: REPO, root: ROOT });
  if (manifest.unit_count !== 309 || RESEARCH_ROLES.length !== 18 || RESEARCH_DIMENSIONS.length !== 17) throw new Error('RESEARCH_INVARIANT_FAILURE');
  const pool = new Pool({ host: '/var/run/postgresql', database: 'dial_vekl', user: 'dial_research_loop', max: 2, application_name: 'dial-vekl-groq-research' });
  try { console.log(JSON.stringify({ ok: true, provider_status: status, ...(await runOne(manifest, readState(manifest.mission_id), pool)) }, null, 2)); }
  finally { await pool.end(); }
}
main().catch((error) => { console.error(JSON.stringify({ ok: false, error: String(error?.stack || error).slice(0, 5000) }, null, 2)); process.exitCode = 1; });
