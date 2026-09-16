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
  sanitizeDesignArtifactForEvidence,
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

const STITCH_VISUAL_AUTHORITY_SOURCES = Object.freeze({
  PREMIUM_SOLUTIONS_ENVIRONMENT: Object.freeze({
    path: 'docs/dial/final-audit/16_HOME_IDENTITY_WHATSAPP/DIAL_HOME_PREMIUM_SOLUTIONS_ENVIRONMENT_LOCK.md',
    section_headings: ['3. Visual direction', '7. Trust atmosphere', '9. Interaction quality', '10. Anti-patterns'],
  }),
});

function markdownSection(markdown, heading) {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start < 0) return null;
  const bodyStart = start + marker.length;
  const next = markdown.indexOf('\n## ', bodyStart);
  return markdown.slice(bodyStart, next < 0 ? markdown.length : next).trim();
}

export function resolveStitchVisualAuthorityProjection({ repoDir, fdep } = {}) {
  if (!repoDir || !fdep) throw new Error('STITCH_VISUAL_AUTHORITY_INPUT_REQUIRED');
  const refs = fdep.visual_reference_spec?.references || [];
  const resolved = refs.map((ref) => {
    const referenceId = ref.reference_id || ref.ref;
    const source = STITCH_VISUAL_AUTHORITY_SOURCES[referenceId];
    if (!source) {
      if (ref.authority_level === 'CANONICAL_REFERENCE') throw new Error(`STITCH_VISUAL_AUTHORITY_REFERENCE_UNRESOLVED:${referenceId}`);
      return { reference_id: referenceId, authority_level: ref.authority_level || null, status: 'REFERENCE_ID_ONLY' };
    }
    const abs = path.join(repoDir, source.path);
    if (!fs.existsSync(abs)) throw new Error(`STITCH_VISUAL_AUTHORITY_SOURCE_MISSING:${source.path}`);
    const markdown = fs.readFileSync(abs, 'utf8');
    const sections = source.section_headings.map((heading) => ({ heading, body: markdownSection(markdown, heading) }));
    if (sections.some((row) => !row.body)) throw new Error(`STITCH_VISUAL_AUTHORITY_SECTION_MISSING:${referenceId}`);
    const projectionText = sections.map((row) => `## ${row.heading}\n${row.body}`).join('\n\n');
    return {
      reference_id: referenceId,
      authority_level: ref.authority_level || null,
      required_fidelity: ref.required_fidelity || null,
      status: 'RESOLVED_CANONICAL_PROJECTION',
      source_ref: source.path,
      source_sha256: rawSha256(markdown),
      projection_text: projectionText,
      projection_sha256: rawSha256(projectionText),
    };
  });
  return { references: resolved, projection_hash: hashObject(resolved) };
}

export function resolveStitchFeatureContractProjection({ repoDir, fdep } = {}) {
  if (!repoDir || !fdep) throw new Error('STITCH_FEATURE_CONTRACT_INPUT_REQUIRED');
  const featureIds = [...new Set((fdep.surface_manifest?.feature_ids || []).filter(Boolean))].sort();
  if (!featureIds.length) return { features: [], projection_hash: hashObject([]) };
  const rel = 'docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json';
  const abs = path.join(repoDir, rel);
  if (!fs.existsSync(abs)) throw new Error(`STITCH_FEATURE_CONTRACT_SOURCE_MISSING:${rel}`);
  const source = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const rows = Array.isArray(source) ? source : (source.contracts || source.features || []);
  const projected = featureIds.map((featureId) => {
    const row = rows.find((item) => item.feature_id === featureId);
    if (!row) throw new Error(`STITCH_FEATURE_CONTRACT_UNRESOLVED:${featureId}`);
    return {
      feature_id: row.feature_id,
      module: row.module || null,
      outcome: row.outcome || null,
      aggregate: row.aggregate || null,
      states: row.states || [],
      commands: row.commands || [],
      queries: row.queries || [],
      permissions: row.permissions || [],
      data_entities: row.data_entities || [],
      surfaces: row.surfaces || [],
      acceptance_contract: row.acceptance_contract || [],
    };
  });
  return { source_ref: rel, source_sha256: rawSha256(fs.readFileSync(abs)), features: projected, projection_hash: hashObject(projected) };
}

function stitchSurfaceRows(fdep) {
  const rows = (fdep.surface_manifest?.surfaces || []).filter((row) => row?.surface_id);
  return rows.length ? rows : [{ surface_id: 'DIAL_WEB' }];
}

function stitchDeviceType(surfaceId) {
  return String(surfaceId).toUpperCase() === 'DIAL_WEB' ? 'DESKTOP' : 'MOBILE';
}

function safeSurfaceSlug(surfaceId) {
  return String(surfaceId || 'surface').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'surface';
}

export function buildStitchDesignPrompt({ repoDir, fdep, brief, surfaceId = null } = {}) {
  const visualAuthorityProjection = resolveStitchVisualAuthorityProjection({ repoDir, fdep });
  const featureContractProjection = resolveStitchFeatureContractProjection({ repoDir, fdep });
  const targetSurfaceId = surfaceId || stitchSurfaceRows(fdep)[0].surface_id;
  const targetSurface = stitchSurfaceRows(fdep).find((row) => row.surface_id === targetSurfaceId);
  if (!targetSurface) throw new Error(`STITCH_TARGET_SURFACE_NOT_DECLARED:${targetSurfaceId}`);
  const targetStateRow = (fdep.surface_state_matrix?.surfaces || []).find((row) => row.surface_id === targetSurfaceId) || { surface_id: targetSurfaceId, states: [] };
  const providerDataPolicy = {
    literal_domain_values_allowed_only_when_present_verbatim_in_governed_projection: true,
    no_fabricated_vin_vehicle_model_year_part_number_price_stock_location_percentage_telemetry_error_code_identity_revision_or_metric: true,
    no_unproven_certification_audit_accessibility_or_test_claims: true,
    data_bearing_ready_state_without_authoritative_values: 'SHOW_FIELD_LABELS_AND_EMPTY_BOUND_REGIONS_ONLY',
    required_state_variants_without_authoritative_values: 'SHOW_STATE_NAME_AND_STRUCTURAL_TREATMENT_ONLY',
    target_surface_id: targetSurfaceId,
  };
  const projection = {
    task_id: fdep.task_id,
    unit_lineage_id: fdep.unit_lineage_id,
    unit_revision_hash: fdep.unit_revision_hash,
    product_design_profile: fdep.product_design_profile,
    target_surface: targetSurface,
    target_surface_states: targetStateRow,
    visual_reference_spec: fdep.visual_reference_spec,
    visual_authority_projection: visualAuthorityProjection,
    feature_contract_projection: featureContractProjection,
    presentation_decision: fdep.presentation_decision,
    change_budget: fdep.change_budget,
    authority_constraints: fdep.authority_constraints,
    provider_data_policy: providerDataPolicy,
    design_brief_hash: brief?.content_hash || null,
  };
  return [
    'DIAL governed Stitch design provider stage.',
    `TARGET_SURFACE=${targetSurfaceId}. Generate exactly one composition for this surface only.`,
    'Return a non-authoritative design candidate only. Project Truth, FRC, Product Experience authority and the governed projections remain superior.',
    'The resolved visual-authority excerpt and feature-contract projection below are one-way projections from canonical DIAL authority. Follow them exactly.',
    'This must look like a real customer-facing DIAL experience, not a governance dashboard, debug console, state matrix, design-system specimen, test report, or engineering diagnostics screen.',
    'Do not visibly print surface IDs, Unit IDs, hashes, governance labels, archetype names, pattern names, provider names, qualification text, zero-fabrication notices, or acceptance/test metadata in the customer UI.',
    'ZERO FABRICATION: do not invent or display literal VINs, vehicle makes/models/years, part or OEM numbers, prices, stock quantities, depot/location names, compatibility percentages, telemetry/latency, error codes, account identities, revision/version/date values, business metrics, or operational facts unless the exact literal value is present in the governed projection JSON.',
    'Do not claim verified business status, official channel status, WCAG compliance, audits, certification, verification, tests passed, security clearance, cache freshness, connectivity quality, delivery state, queue state, or any other achieved/runtime status unless it is explicit governed domain truth.',
    'Use only domain nouns, actions, permissions and state names present in the feature-contract projection. Do not invent adjacent product functionality.',
    'The primary composition is the READY customer experience. When authoritative literal data is absent, use labels and empty bound value regions only; never insert example/demo/placeholder/realistic-looking values.',
    'Required LOADING, EMPTY, ERROR, PERMISSION_DENIED and DEGRADED treatments may appear as coherent state variants for this same surface, but must not turn the composition into a debug/state-matrix dashboard and must not invent causes, codes, timestamps, retry intervals, permission tiers, cache ages or system messages.',
    'Preserve responsive/accessibility intent and the Premium Solutions Environment characteristics: clean modern composition, generous breathing room, restrained typography, sophisticated neutral surfaces, subtle depth, high confidence and human premium polish.',
    'Prefer static self-contained markup: no scripts, inline event handlers, remote assets, remote URLs, iframes, service workers or executable browser behavior. DIAL treats all provider output as non-authoritative evidence and sanitizes it before admission.',
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
  const surfaceRows = stitchSurfaceRows(fdep);
  const surfaceArtifacts = {};
  const generatedSurfaces = [];
  for (const surface of surfaceRows) {
    const surfaceId = surface.surface_id;
    const slug = safeSurfaceSlug(surfaceId);
    const generated = await stitch.generate({
      project_title: `DIAL ${fdep.unit_lineage_id} ${surfaceId} ${taskId}`,
      prompt: buildStitchDesignPrompt({ repoDir, fdep, brief, surfaceId }),
      device_type: stitchDeviceType(surfaceId),
      design_projection_hash: designProjectionHash,
    });
    const htmlArtifact = await artifactDownloader(generated.html_url, { maxBytes: 2_000_000 });
    const imageArtifact = await artifactDownloader(generated.image_url, { maxBytes: 8_000_000 });
    const rawHtml = Buffer.from(htmlArtifact.body).toString('utf8');
    const sanitization = sanitizeDesignArtifactForEvidence({ content: rawHtml, mimeType: htmlArtifact.content_type || 'text/html' });
    const rawStored = persistPrivateArtifact(root, taskId, `candidate-${slug}-raw.html`, Buffer.from(htmlArtifact.body));
    if (!sanitization.ok) throw new Error(`STITCH_STAGE_QUARANTINED:${surfaceId}:${sanitization.sanitized_quarantine.violations.join(',')}`);
    const html = sanitization.content;
    const htmlStored = persistPrivateArtifact(root, taskId, `candidate-${slug}.html`, Buffer.from(html, 'utf8'));
    const imageStored = persistPrivateArtifact(root, taskId, `candidate-${slug}-image.bin`, Buffer.from(imageArtifact.body));
    surfaceArtifacts[surfaceId] = {
      surface_id: surfaceId,
      device_type: stitchDeviceType(surfaceId),
      screen_id_hash: generated.screen_id ? sha256(generated.screen_id) : null,
      raw_html: { ...rawStored, content_type: htmlArtifact.content_type || null, quarantine_violations: sanitization.raw_quarantine.violations },
      html: { ...htmlStored, content_type: htmlArtifact.content_type || null, inert_evidence: true, transformation_hash: sanitization.transformation_hash },
      image: { ...imageStored, content_type: imageArtifact.content_type || null },
    };
    generatedSurfaces.push({ surface_id: surfaceId, screen_id: generated.screen_id, response_hash: generated.response_hash || null, html });
  }
  const aggregateHtml = generatedSurfaces.map((row) => `<!-- ${row.surface_id} -->\n${row.html}`).join('\n');
  const aggregateQuarantine = quarantineDesignArtifact({ content: aggregateHtml, mimeType: 'text/html' });
  if (!aggregateQuarantine.ok) throw new Error(`STITCH_STAGE_AGGREGATE_QUARANTINED:${aggregateQuarantine.violations.join(',')}`);
  const candidate = buildDesignCandidateManifest({
    taskId,
    providerId: 'google-stitch',
    unitLineageId: fdep.unit_lineage_id,
    unitRevisionHash: fdep.unit_revision_hash,
    designAuthorityProjectionHash: designProjectionHash,
    rawContent: aggregateHtml,
    quarantine: aggregateQuarantine,
    screenRefs: generatedSurfaces.map((row) => row.screen_id).filter(Boolean),
    fdepHash: fdep.content_hash,
    designBriefHash: brief.content_hash,
    changeBudgetHash: fdep.change_budget?.content_hash || null,
    presentationDecisionHash: fdep.presentation_decision?.content_hash || null,
    vrdeHash: fdep.visual_render_determinism_envelope?.content_hash || null,
  });
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
    provider_response_hash: hashObject(generatedSurfaces.map((row) => ({ surface_id: row.surface_id, response_hash: row.response_hash }))),
    surface_count: generatedSurfaces.length,
    artifacts: generatedSurfaces.length === 1 ? {
      ...surfaceArtifacts[generatedSurfaces[0].surface_id],
      surfaces: surfaceArtifacts,
    } : { surfaces: surfaceArtifacts },
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
