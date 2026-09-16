#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  DEFAULT_CONTROL_HOME,
  appendJsonl,
  ensureControlLayout,
  readJson,
  resolveControlPath,
  writeJsonAtomic,
} from './state-store.mjs';
import { hashObject } from './knowledge-graph-core.mjs';
import { checkTaskExecutionEnvelope } from './task-execution-envelope.mjs';
import { checkFrontendDesignExecutionPacket } from './frontend-design-execution-packet.mjs';
import { selectDesignStrategy } from './design-provider-router.mjs';
import { StitchAdapter } from './stitch-adapter.mjs';
import {
  STITCH_PROOF_RELS,
  downloadStitchArtifact,
} from './providers/google/stitch-adapter.mjs';
import {
  admitDesignCandidate,
  buildDesignCandidateManifest,
  quarantineDesignArtifact,
} from './design-candidate-admission.mjs';
import { normalizeDesignCandidate } from './frontend-design-normalizer.mjs';
import { sha256 } from './providers/google/external-capability-core.mjs';

function now() { return new Date().toISOString(); }
function candidateRel(taskId) { return `execution/tasks/${taskId}/stitch-design-candidate.json`; }
function acceptedRel(taskId) { return `execution/tasks/${taskId}/stitch-design-accepted.json`; }
function consumptionRel(taskId) { return `execution/tasks/${taskId}/stitch-unit-consumption.json`; }
function certificationRel(taskId) { return `execution/tasks/${taskId}/stitch-screen-certification.json`; }
function proofWithHash(value) { return { ...value, evidence_hash: sha256({ ...value, evidence_hash: undefined }) }; }
function evidenceHashMatches(value) { return Boolean(value?.evidence_hash) && value.evidence_hash === sha256({ ...value, evidence_hash: undefined }); }
function rawSha256(body) { return crypto.createHash('sha256').update(Buffer.from(body)).digest('hex'); }
function repositorySha(repoDir) { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).trim(); } catch { return null; } }

function designModeForFdep(fdep) {
  if (fdep?.donor_frontend_reuse_projection?.reuse_mode && fdep.donor_frontend_reuse_projection.reuse_mode !== 'REJECT') return 'DONOR_ADAPT';
  return fdep?.presentation_decision?.execution_mode === 'SYNTHESIZE' ? 'NEW_DIAL_DESIGN' : 'EXISTING_DIAL_DESIGN';
}

function stitchPrompt(fdep, brief) {
  const projection = {
    task_id: fdep.task_id,
    unit_lineage_id: fdep.unit_lineage_id,
    unit_revision_hash: fdep.unit_revision_hash,
    product_design_profile: fdep.product_design_profile,
    surface_manifest: fdep.surface_manifest,
    surface_state_matrix: fdep.surface_state_matrix,
    visual_reference_spec: fdep.visual_reference_spec,
    presentation_decision: fdep.presentation_decision,
    change_budget: fdep.change_budget,
    authority_constraints: fdep.authority_constraints,
    design_brief_hash: brief?.content_hash || null,
  };
  return [
    'DIAL governed Stitch design provider stage.',
    'Return a design candidate only. Project Truth, FRC, Product Experience authority and this projection remain superior.',
    'Do not invent domain truth, production data, tokens, components, prices, customer facts or runtime behavior.',
    'Cover the required surface/state matrix and preserve the specified responsive/accessibility intent.',
    JSON.stringify(projection),
  ].join('\n');
}

function persistPrivateArtifact(root, taskId, suffix, body) {
  ensureControlLayout(root);
  const dir = resolveControlPath(`execution/design/quarantine/${taskId}`, root);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const target = path.join(dir, suffix);
  fs.writeFileSync(target, body, { mode: 0o600 });
  return { rel: path.relative(root, target).replaceAll('\\', '/'), sha256: rawSha256(body), bytes: body.byteLength };
}

export async function executeStitchDesignStage({
  repoDir,
  root = DEFAULT_CONTROL_HOME,
  taskId,
  env = process.env,
  adapter = null,
  artifactDownloader = downloadStitchArtifact,
  envelopeGuard = checkTaskExecutionEnvelope,
  fdepGuard = checkFrontendDesignExecutionPacket,
} = {}) {
  if (!repoDir || !taskId) throw new Error('STITCH_STAGE_INPUTS_REQUIRED');
  const envelope = readJson(`execution/tasks/${taskId}/envelope.json`, null, root);
  const fdep = readJson(`execution/tasks/${taskId}/frontend-design-execution-packet.json`, null, root);
  const brief = readJson(`execution/tasks/${taskId}/design-brief-bundle.json`, null, root);
  if (!envelope || !fdep || fdep.applicable === false || !brief) throw new Error('STITCH_STAGE_GOVERNED_FRONTEND_TASK_REQUIRED');
  const envelopeCheck = envelopeGuard({ repoDir, root, envelope });
  if (!envelopeCheck?.ok) throw new Error(`STITCH_STAGE_STALE_ENVELOPE:${(envelopeCheck?.reasons || []).join(',')}`);
  const fdepCheck = fdepGuard({ repoDir, root, packet: fdep });
  if (!fdepCheck?.ok) throw new Error(`STITCH_STAGE_STALE_FDEP:${(fdepCheck?.reasons || []).join(',')}`);

  const stitch = adapter || new StitchAdapter({ enabled: true, env });
  const health = await stitch.health();
  const route = selectDesignStrategy({
    designMode: designModeForFdep(fdep),
    stitchEnabled: true,
    stitchEligible: true,
    directWorkerEligible: true,
    providerHealth: health?.state,
    preference: 'STITCH',
  });
  if (!route.ok || !String(route.selected || '').startsWith('STITCH_')) throw Object.assign(new Error(`STITCH_STAGE_NOT_SELECTION_READY:${route.reason || route.selected || health?.state}`), { category: health?.failure_class || 'PROVIDER_UNAVAILABLE' });

  const designProjectionHash = fdep.provenance?.frontend_projection_hash || brief.provenance?.projection_hash;
  if (!designProjectionHash) throw new Error('STITCH_STAGE_DESIGN_PROJECTION_HASH_REQUIRED');
  const generated = await stitch.generate({
    project_title: `DIAL ${fdep.unit_lineage_id} ${taskId}`,
    prompt: stitchPrompt(fdep, brief),
    device_type: 'DESKTOP',
    design_projection_hash: designProjectionHash,
  });
  const htmlArtifact = await artifactDownloader(generated.html_url, { maxBytes: 2_000_000 });
  const imageArtifact = await artifactDownloader(generated.image_url, { maxBytes: 8_000_000 });
  const html = Buffer.from(htmlArtifact.body).toString('utf8');
  const quarantine = quarantineDesignArtifact({ content: html, mimeType: htmlArtifact.content_type || 'text/html' });
  if (!quarantine.ok) throw new Error(`STITCH_STAGE_QUARANTINED:${quarantine.violations.join(',')}`);
  const candidate = buildDesignCandidateManifest({
    taskId,
    providerId: 'google-stitch',
    unitLineageId: fdep.unit_lineage_id,
    unitRevisionHash: fdep.unit_revision_hash,
    designAuthorityProjectionHash: designProjectionHash,
    rawContent: html,
    quarantine,
    screenRefs: [generated.screen_id].filter(Boolean),
    fdepHash: fdep.content_hash,
    designBriefHash: brief.content_hash,
    changeBudgetHash: fdep.change_budget?.content_hash || null,
    presentationDecisionHash: fdep.presentation_decision?.content_hash || null,
    vrdeHash: fdep.visual_render_determinism_envelope?.content_hash || null,
  });
  const htmlStored = persistPrivateArtifact(root, taskId, 'candidate.html', Buffer.from(htmlArtifact.body));
  const imageStored = persistPrivateArtifact(root, taskId, 'candidate-image.bin', Buffer.from(imageArtifact.body));
  const repoSha = repositorySha(repoDir);
  if (!repoSha) throw new Error('STITCH_STAGE_REPOSITORY_SHA_UNAVAILABLE');
  const record = proofWithHash({
    schema_version: 1,
    provider: 'google-stitch',
    repository_sha: repoSha,
    status: 'QUARANTINED_SAFE_REVIEW_REQUIRED',
    task_id: taskId,
    envelope_hash: envelope.envelope_hash,
    route,
    candidate,
    provider_response_hash: generated.response_hash || null,
    artifacts: {
      html: { ...htmlStored, content_type: htmlArtifact.content_type || null },
      image: { ...imageStored, content_type: imageArtifact.content_type || null },
    },
    observed_at: now(),
  });
  writeJsonAtomic(candidateRel(taskId), record, root);
  writeJsonAtomic(`execution/design/candidates/${candidate.candidate_id}.json`, record, root);
  appendJsonl('events/adaptive-execution.jsonl', { event: 'STITCH_DESIGN_CANDIDATE_QUARANTINED', task_id: taskId, candidate_id: candidate.candidate_id, candidate_hash: candidate.candidate_hash, route_hash: route.selection_hash, at: record.observed_at }, root);
  return record;
}

export function admitStitchDesignStage({
  repoDir,
  root = DEFAULT_CONTROL_HOME,
  taskId,
  evidence,
  envelopeGuard = checkTaskExecutionEnvelope,
  fdepGuard = checkFrontendDesignExecutionPacket,
} = {}) {
  if (!repoDir || !taskId || !evidence || typeof evidence !== 'object') throw new Error('STITCH_ADMISSION_EVIDENCE_REQUIRED');
  const record = readJson(candidateRel(taskId), null, root);
  const envelope = readJson(`execution/tasks/${taskId}/envelope.json`, null, root);
  const fdep = readJson(`execution/tasks/${taskId}/frontend-design-execution-packet.json`, null, root);
  if (!record?.candidate || !envelope || !fdep) throw new Error('STITCH_CANDIDATE_OR_GOVERNED_TASK_MISSING');
  const currentSha = repositorySha(repoDir);
  if (!currentSha || record.repository_sha !== currentSha || !evidenceHashMatches(record)) throw new Error('STITCH_CANDIDATE_STALE_OR_TAMPERED');
  const envelopeCheck = envelopeGuard({ repoDir, root, envelope });
  if (!envelopeCheck.ok) throw new Error(`STITCH_ADMISSION_STALE_ENVELOPE:${envelopeCheck.reasons.join(',')}`);
  const fdepCheck = fdepGuard({ repoDir, root, packet: fdep });
  if (!fdepCheck.ok) throw new Error(`STITCH_ADMISSION_STALE_FDEP:${fdepCheck.reasons.join(',')}`);
  if (record.task_id !== taskId || record.envelope_hash !== envelope.envelope_hash || record.candidate.frontend_design_execution_packet_hash !== fdep.content_hash) throw new Error('STITCH_CANDIDATE_BINDING_INVALID');
  if (evidence.authority_conforms !== true || evidence.required_states_present !== true || evidence.change_budget_satisfied !== true) throw new Error('STITCH_ADMISSION_ACCEPTANCE_EVIDENCE_INCOMPLETE');
  const normalization = normalizeDesignCandidate({ repoDir, candidate: evidence.design_candidate_facts || {}, fdep, changeBudget: fdep.change_budget });
  if (normalization.status !== 'NORMALIZED') throw new Error(`STITCH_ADMISSION_NORMALIZATION_FAILED:${normalization.violations.join(',')}`);
  const admitted = admitDesignCandidate({
    candidate: record.candidate,
    authorityConforms: evidence.authority_conforms,
    requiredStatesPresent: evidence.required_states_present,
    donorSemanticsPreserved: evidence.donor_semantics_preserved !== false,
    designNormalizationEvidence: normalization,
    changeBudgetSatisfied: evidence.change_budget_satisfied,
  });
  if (!admitted.ok) throw new Error(`STITCH_ADMISSION_FAILED:${admitted.failures.join(',')}`);
  const accepted = proofWithHash({
    schema_version: 1,
    provider: 'google-stitch',
    repository_sha: record.repository_sha,
    status: 'ACCEPTED_AS_NON_AUTHORITATIVE_DESIGN_EVIDENCE',
    task_id: taskId,
    candidate_hash: record.candidate.candidate_hash,
    candidate_id: record.candidate.candidate_id,
    envelope_hash: record.envelope_hash,
    fdep_hash: fdep.content_hash,
    normalization_hash: normalization.content_hash,
    admission_manifest: admitted.manifest,
    acceptance_evidence_hash: sha256(evidence),
    accepted_at: now(),
  });
  writeJsonAtomic(acceptedRel(taskId), accepted, root);
  writeJsonAtomic(`execution/design/accepted/${record.candidate.candidate_id}.json`, accepted, root);
  appendJsonl('events/adaptive-execution.jsonl', { event: 'STITCH_DESIGN_CANDIDATE_ADMITTED', task_id: taskId, candidate_id: record.candidate.candidate_id, candidate_hash: record.candidate.candidate_hash, at: accepted.accepted_at }, root);
  return accepted;
}

export function loadCurrentStitchAcceptedDesign({ repoDir, root = DEFAULT_CONTROL_HOME, taskId, envelopeHash = null } = {}) {
  const accepted = readJson(acceptedRel(taskId), null, root);
  if (!accepted) return null;
  const currentSha = repositorySha(repoDir);
  if (!currentSha || accepted.repository_sha !== currentSha || !evidenceHashMatches(accepted)) throw new Error('STITCH_ACCEPTED_EVIDENCE_STALE_OR_TAMPERED');
  if (accepted.task_id !== taskId || (envelopeHash && accepted.envelope_hash !== envelopeHash)) throw new Error('STITCH_ACCEPTED_EVIDENCE_BINDING_INVALID');
  return accepted;
}

export function recordStitchUnitConsumption({ repoDir, root = DEFAULT_CONTROL_HOME, taskId, workerArtifactId, envelopeHash } = {}) {
  const accepted = loadCurrentStitchAcceptedDesign({ repoDir, root, taskId, envelopeHash });
  if (!accepted) return null;
  if (!workerArtifactId || !envelopeHash) throw new Error('STITCH_UNIT_CONSUMPTION_BINDING_INVALID');
  const proof = proofWithHash({
    schema_version: 1,
    provider: 'google-stitch',
    repository_sha: accepted.repository_sha,
    status: 'PASSED',
    task_id: taskId,
    candidate_hash: accepted.candidate_hash,
    accepted_evidence_hash: accepted.evidence_hash,
    worker_artifact_id: workerArtifactId,
    envelope_hash: envelopeHash,
    consumed_at: now(),
  });
  writeJsonAtomic(consumptionRel(taskId), proof, root);
  writeJsonAtomic(STITCH_PROOF_RELS.orchestrated_use, proof, root);
  appendJsonl('events/adaptive-execution.jsonl', { event: 'STITCH_DESIGN_EVIDENCE_CONSUMED_BY_AEF_UNIT', task_id: taskId, candidate_hash: accepted.candidate_hash, worker_artifact_id: workerArtifactId, at: proof.consumed_at }, root);
  return proof;
}

export function recordStitchScreenAcceptance({ repoDir, root = DEFAULT_CONTROL_HOME, taskId, certification } = {}) {
  const accepted = loadCurrentStitchAcceptedDesign({ repoDir, root, taskId });
  const consumption = readJson(consumptionRel(taskId), null, root);
  if (!accepted || !consumption) throw new Error('STITCH_ACCEPTANCE_REQUIRES_ADMISSION_AND_AEF_CONSUMPTION');
  if (!evidenceHashMatches(consumption) || consumption.repository_sha !== accepted.repository_sha || consumption.task_id !== taskId || consumption.candidate_hash !== accepted.candidate_hash || consumption.accepted_evidence_hash !== accepted.evidence_hash) throw new Error('STITCH_CONSUMPTION_EVIDENCE_STALE_OR_TAMPERED');
  if (certification?.ok !== true || certification?.status !== 'PASSED' || certification?.task_id !== taskId || certification?.fdep_hash !== accepted.fdep_hash) throw new Error('STITCH_SCREEN_CERTIFICATION_NOT_PASSED_OR_BOUND');
  const required = ['accessibility', 'security', 'state_matrix_coverage', 'vrde_comparable'];
  if (required.some((key) => certification[key] !== true) || (certification.visual_gates || []).some((gate) => !String(gate.state || '').startsWith('PASSED'))) throw new Error('STITCH_SCREEN_CERTIFICATION_REQUIRED_DIMENSIONS_MISSING');
  const proof = proofWithHash({
    schema_version: 1,
    provider: 'google-stitch',
    repository_sha: accepted.repository_sha,
    status: 'PASSED',
    task_id: taskId,
    candidate_hash: accepted.candidate_hash,
    fdep_hash: accepted.fdep_hash,
    certification_hash: certification.content_hash || sha256(certification),
    consumption_evidence_hash: consumption.evidence_hash,
    accepted_at: now(),
  });
  writeJsonAtomic(certificationRel(taskId), { ...proof, certification }, root);
  writeJsonAtomic(STITCH_PROOF_RELS.visual_acceptance, proof, root);
  return proof;
}

export function proveStitchOutageFallback({ repoDir = process.env.DIAL_REPO_DIR || process.cwd(), root = DEFAULT_CONTROL_HOME } = {}) {
  const route = selectDesignStrategy({
    designMode: 'NEW_DIAL_DESIGN',
    stitchEnabled: true,
    stitchEligible: true,
    directWorkerEligible: true,
    providerHealth: 'UNAVAILABLE',
    preference: 'STITCH',
  });
  if (!route.ok || !String(route.selected || '').startsWith('DIRECT_')) throw new Error('STITCH_OUTAGE_FALLBACK_NOT_PROVEN');
  const repoSha = repositorySha(repoDir);
  if (!repoSha) throw new Error('STITCH_FALLBACK_REPOSITORY_SHA_UNAVAILABLE');
  const proof = proofWithHash({
    schema_version: 1,
    provider: 'google-stitch',
    repository_sha: repoSha,
    status: 'PASSED',
    simulated_provider_state: 'UNAVAILABLE',
    selected: route.selected,
    selection_hash: route.selection_hash,
    runtime_dependency_created: false,
    observed_at: now(),
  });
  writeJsonAtomic(STITCH_PROOF_RELS.outage_fallback, proof, root);
  return proof;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const root = process.env.DIAL_CONTROL_HOME || DEFAULT_CONTROL_HOME;
  const repoDir = process.env.DIAL_REPO_DIR || process.cwd();
  if (command === 'stage') return executeStitchDesignStage({ repoDir, root, taskId: value('--task') });
  if (command === 'admit') {
    const file = value('--evidence-file');
    if (!file) throw new Error('stitch admit requires --evidence-file');
    return admitStitchDesignStage({ repoDir, root, taskId: value('--task'), evidence: JSON.parse(fs.readFileSync(file, 'utf8')) });
  }
  if (command === 'accept') {
    const file = value('--certification-file');
    if (!file) throw new Error('stitch accept requires --certification-file');
    return recordStitchScreenAcceptance({ repoDir, root, taskId: value('--task'), certification: JSON.parse(fs.readFileSync(file, 'utf8')) });
  }
  if (command === 'prove-outage-fallback') return proveStitchOutageFallback({ repoDir, root });
  throw new Error('usage: stitch-design-orchestration.mjs stage|admit|accept|prove-outage-fallback');
}

if (import.meta.url === `file://${process.argv[1]}`) main().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
