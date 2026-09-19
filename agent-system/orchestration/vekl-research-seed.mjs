#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildResearchHarvestManifest, buildResearchCoverageManifest, RESEARCH_ROLES } from './vekl-research-harvest.mjs';
import { RESEARCH_DIMENSIONS } from './vekl-research-contracts.mjs';
import { immutableDuPacket } from './vekl-research-loop.mjs';
import { createVeklResearchPool } from './vekl-research-db-client.mjs';

const repoDir = process.env.DIAL_REPO_DIR || process.cwd();
const root = process.env.DIAL_RESEARCH_HARVEST_HOME || '/var/lib/dial-control';
const sha = (v) => crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
export const OWNER_FIRST_RESEARCH_TASK = 'Owner-mandated first ChatGPT research task: consolidate and expand GPT-SOL harvest work from baseline 0d783d65 to current VEKL open-world discovery, guided frontend design, and n8n automation architecture. Preserve cited evidence and do not fabricate execution or results.';

function contexts(subject) {
  const tags = new Set(subject.technology_tags || []);
  const moduleClass = subject.module_class || '';
  const frontend = tags.has('React') || tags.has('Android') || moduleClass.includes('CLIENT');
  const automation = tags.has('n8n') || moduleClass === 'PLATFORM_AUTOMATION_CLOUD';
  return {
    guided_frontend_context: {
      applicable: frontend,
      design_provenance_mode: ['NEW_DIAL_DESIGN', 'DONOR_ADAPT', 'DONOR_PRESERVE', 'LOCKED_BASELINE_REPAIR'],
      design_iteration_phase: ['EXPLORE', 'CONVERGE', 'RECONSTRUCT'],
      evidence_required: ['SCREEN_QUALITY_PACKET', 'STRUCTURED_CRITICS', 'FREEDOM_BUDGET', 'DONOR_APPLICABILITY', 'VISUAL_AUTHORITY'],
      authority: 'PROJECT_TRUTH_GOVERNED_NON_AUTHORITATIVE_RESEARCH',
    },
    n8n_architecture_context: {
      applicable: automation,
      knowledge_plane: 'VEKL_N8N_CORPUS',
      runtime_estates: ['DIAL_N8N_DEV', 'DIAL_N8N_PROD'],
      evidence_required: ['NODE_CAPABILITY_POLICY', 'WORKFLOW_SECURITY', 'IDEMPOTENCY', 'RELEASE_IDENTITY', 'DEV_PROD_ISOLATION', 'TENANT_ISOLATION', 'DONOR_PATTERN_PROVENANCE'],
      authority: 'WORKFLOW_RUNTIME_NOT_SYSTEM_OF_RECORD',
    },
  };
}

function flattenUnits(manifest) {
  const registry = JSON.parse(fs.readFileSync(path.join(repoDir, 'agent-system/registries/DEVELOPMENT_UNIT_REGISTRY.json')));
  const unitById = new Map(registry.units.map((unit) => [unit.unit_lineage_id, unit]));
  const rows = [];
  for (const batch of manifest.unit_batches || []) {
    const subjects = new Map((batch.subjects || []).map((s) => [s.subject_id, s]));
    for (const binding of batch.bindings || []) {
      const subject = subjects.get(binding.subject_id);
      if (!subject) throw new Error('SUBJECT_BINDING_MISSING:' + binding.subject_id);
      const context = contexts(subject);
      const unit = unitById.get(binding.unit_lineage_id);
      const packet = immutableDuPacket({
        mission_id: manifest.mission_id,
        unit_lineage_id: binding.unit_lineage_id,
        unit_revision_hash: binding.unit_revision_hash,
        feature_ids: binding.feature_ids || [],
        research_roles: [...RESEARCH_ROLES],
        research_dimensions: [...RESEARCH_DIMENSIONS],
        questions: subject.engineering_questions || [],
        provider_subject: subject,
        discovery_workload: { ...(subject.discovery_workload || {}), source_hints: subject.source_hints || [], search_queries: subject.search_queries || [] },
        ...context,
        repository_sha: manifest.repository_sha,
        project_truth_hash: manifest.project_truth_hash,
        project_truth_fingerprint: manifest.project_truth_fingerprint,
        graph_generation_id: manifest.graph_generation_id || 'UNAVAILABLE_IN_DU_REGISTRY',
        graph_revision_hash: manifest.graph_revision_hash || 'UNAVAILABLE_IN_DU_REGISTRY',
        contract_bindings: [...(unit?.contracts_consumed || []), ...(unit?.contracts_produced || [])],
        project_truth_slice_hash: unit?.applicable_project_truth_slice_hash || null,
      });
      rows.push({ binding, subject, packet });
    }
  }
  rows.sort((a, b) => a.binding.unit_lineage_id.localeCompare(b.binding.unit_lineage_id));
  rows[0].packet = immutableDuPacket({ ...rows[0].packet, questions: [OWNER_FIRST_RESEARCH_TASK] });
  return rows;
}

async function seed() {
  const baseManifest = buildResearchHarvestManifest({ repoDir, root });
  const { manifest_hash: _baseHash, ...baseWithoutHash } = baseManifest;
  const revisionMissionId = `vekl-full-research-${sha(`${baseManifest.repository_sha}|${baseManifest.project_truth_hash}|${baseManifest.development_unit_registry_hash}|${baseManifest.graph_revision_hash || 'NO_GRAPH_REVISION'}`).slice(0, 20)}`;
  const manifest = { ...baseWithoutHash, mission_id: revisionMissionId, provider_binding: { provider: 'groq', model_id: 'openai/gpt-oss-120b', credential_location: 'VEKL_WORKER_ONLY', zdr_required: true }, model_id: 'openai/gpt-oss-120b', union_alpha_execution: 'NEVER_EXECUTED_NO_RESULTS' };
  manifest.manifest_hash = sha(manifest);
  const coverage = buildResearchCoverageManifest({ repoDir, root, missionId: manifest.mission_id, providerState: 'READY' });
  const rows = flattenUnits(manifest);
  if (rows.length !== 309) throw new Error('SEED_EXPECTED_309_UNITS:' + rows.length);
  if (RESEARCH_ROLES.length !== 18) throw new Error('SEED_EXPECTED_18_ROLES:' + RESEARCH_ROLES.length);
  if (RESEARCH_DIMENSIONS.length !== 17) throw new Error('SEED_EXPECTED_17_DIMENSIONS:' + RESEARCH_DIMENSIONS.length);
  const cellCount = rows.length * RESEARCH_DIMENSIONS.length;
  if (cellCount !== 5253) throw new Error('SEED_EXPECTED_5253_CELLS:' + cellCount);

  const pool = createVeklResearchPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('dial-vekl-canonical-research-seed'))");
    const sameManifest = await client.query(
      'SELECT mission_id,state FROM vekl_research_missions WHERE manifest_hash=$1 FOR UPDATE',
      [manifest.manifest_hash],
    );
    if (sameManifest.rows[0] && sameManifest.rows[0].mission_id !== manifest.mission_id) {
      throw new Error('MANIFEST_HASH_MISSION_ID_COLLISION');
    }
    await client.query(
      "UPDATE vekl_research_missions SET state='SUPERSEDED' WHERE state='READY' AND manifest_hash<>$1",
      [manifest.manifest_hash],
    );
    await client.query(
      "UPDATE vekl_research_packets SET state='BLOCKED',worker_id=NULL,lease_id=NULL,lease_expires_at=NULL WHERE mission_id IN (SELECT mission_id FROM vekl_research_missions WHERE state='SUPERSEDED') AND state IN ('READY','RETRY','LEASED')",
    );
    if (!sameManifest.rows[0]) {
      await client.query(
        'INSERT INTO vekl_research_missions(mission_id,repository_sha,project_truth_hash,graph_generation_id,graph_revision_hash,provider,model_id,state,manifest_json,manifest_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [manifest.mission_id, manifest.repository_sha, manifest.project_truth_hash, manifest.graph_generation_id, manifest.graph_revision_hash, 'groq', 'openai/gpt-oss-120b', 'READY', manifest, manifest.manifest_hash],
      );
    } else {
      await client.query("UPDATE vekl_research_missions SET state='READY',updated_at=now() WHERE mission_id=$1", [manifest.mission_id]);
    }
    let ordinal = 0;
    for (const row of rows) {
      ordinal += 1;
      const packetId = 'DU-RSCH-' + sha(manifest.mission_id + '|' + row.packet.unit_lineage_id).slice(0, 24);
      const prior = await client.query('SELECT packet_hash,state FROM vekl_research_packets WHERE packet_id=$1 FOR UPDATE', [packetId]);
      if (prior.rows[0] && prior.rows[0].packet_hash !== row.packet.packet_hash) {
        if (prior.rows[0].state === 'COMPLETE') throw new Error('COMPLETE_PACKET_HASH_DRIFT:' + packetId);
        throw new Error('PACKET_ID_COLLISION_WITH_DIFFERENT_HASH:' + packetId);
      }
      if (!prior.rows[0]) {
        await client.query(
          'INSERT INTO vekl_research_packets(packet_id,mission_id,ordinal,unit_lineage_id,unit_revision_hash,packet_json,packet_hash,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [packetId, manifest.mission_id, ordinal, row.packet.unit_lineage_id, row.packet.unit_revision_hash, row.packet, row.packet.packet_hash, 'READY'],
        );
      }
    }

    const byUnit = new Map(coverage.units.map((u) => [u.unit_lineage_id, u]));
    for (const row of rows) {
      const unit = byUnit.get(row.packet.unit_lineage_id);
      if (!unit) throw new Error('COVERAGE_UNIT_MISSING:' + row.packet.unit_lineage_id);
      for (const dimension of RESEARCH_DIMENSIONS) {
        const entry = unit.dimensions[dimension];
        await client.query(
          'INSERT INTO vekl_research_coverage(mission_id,unit_lineage_id,dimension,status,reason,artifact_refs) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(mission_id,unit_lineage_id,dimension) DO NOTHING',
          [manifest.mission_id, row.packet.unit_lineage_id, dimension, entry.status, entry.reason, entry.artifact_refs || []],
        );
      }
    }

    const counts = await client.query(
      'SELECT (SELECT count(*) FROM vekl_research_packets WHERE mission_id=$1)::int AS packets,(SELECT count(*) FROM vekl_research_coverage WHERE mission_id=$1)::int AS cells',
      [manifest.mission_id],
    );
    if (counts.rows[0].packets !== 309 || counts.rows[0].cells !== 5253) throw new Error('DATABASE_COVERAGE_COUNT_MISMATCH:' + JSON.stringify(counts.rows[0]));
    await client.query('COMMIT');
    console.log(JSON.stringify({
      ok: true,
      mission_id: manifest.mission_id,
      manifest_hash: manifest.manifest_hash,
      repository_sha: manifest.repository_sha,
      graph_generation_id: manifest.graph_generation_id,
      graph_revision_hash: manifest.graph_revision_hash,
      development_units: counts.rows[0].packets,
      research_dimensions: RESEARCH_DIMENSIONS.length,
      coverage_cells: counts.rows[0].cells,
      research_roles: RESEARCH_ROLES.length,
      provider: 'groq',
      model_id: 'openai/gpt-oss-120b',
      authority: 'NON_AUTHORITATIVE_ENGINEERING_RESEARCH',
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
