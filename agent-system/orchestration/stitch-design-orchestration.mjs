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
import {
  selectCanonicalFrontendDesignProvider,
  buildCanonicalStitchVisualPacket,
  renderStitchVisualProductionPrompt,
  buildCanonicalInteractionMotionPacket,
  renderInteractionMotionPrompt,
  buildInteractionAcceptanceMatrix,
} from './frontend-design-provider-orchestrator.mjs';
import {
  freezeVisualAuthorityArtifact,
  freezeExperienceAuthorityArtifact,
  buildProductionBindingContract,
  lintCandidateFacts,
} from './frontend-generation-architecture.mjs';
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
import { evaluateCreativeCandidate, selectCreativeCandidate } from './frontend-creative-strategy.mjs';
import { sha256 } from './providers/google/external-capability-core.mjs';

function now() { return new Date().toISOString(); }
function candidateRel(taskId) { return `execution/tasks/${taskId}/stitch-design-candidate.json`; }
function creativeExplorationRel(taskId) { return `execution/tasks/${taskId}/stitch-creative-exploration.json`; }
function creativeConvergenceRel(taskId) { return `execution/tasks/${taskId}/stitch-creative-convergence.json`; }
function acceptedRel(taskId) { return `execution/tasks/${taskId}/stitch-design-accepted.json`; }
function consumptionRel(taskId) { return `execution/tasks/${taskId}/stitch-unit-consumption.json`; }
function certificationRel(taskId) { return `execution/tasks/${taskId}/stitch-screen-certification.json`; }
function workerEvidenceRel(taskId) { return `execution/tasks/${taskId}/stitch-worker-evidence.json`; }
function workerEvidenceDirRel(taskId) { return `execution/tasks/${taskId}/stitch-worker-evidence`; }
function visualAuthorityRel(taskId) { return `execution/tasks/${taskId}/visual-authority.json`; }
function interactionMotionRel(taskId) { return `execution/tasks/${taskId}/stitch-interaction-motion.json`; }
function interactionAcceptanceRel(taskId) { return `execution/tasks/${taskId}/interaction-acceptance.json`; }
function experienceAuthorityRel(taskId) { return `execution/tasks/${taskId}/experience-authority.json`; }
function productionBindingRel(taskId) { return `execution/tasks/${taskId}/production-binding-contract.json`; }
function proofWithHash(value) { return { ...value, evidence_hash: sha256({ ...value, evidence_hash: undefined }) }; }
function evidenceHashMatches(value) { return Boolean(value?.evidence_hash) && value.evidence_hash === sha256({ ...value, evidence_hash: undefined }); }
function rawSha256(body) { return crypto.createHash('sha256').update(Buffer.from(body)).digest('hex'); }
function repositorySha(repoDir) { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).trim(); } catch { return null; } }

function designModeForFdep(fdep) {
  if ((fdep?.external_reference_inspiration_projections || []).length) return 'REFERENCE_INSPIRED_DIAL_NATIVE';
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
  const withheldFields = ['aggregate','states','commands','queries','events','api_contract','permissions','data_entities','relationships','acceptance_contract'];
  const projected = featureIds.map((featureId) => {
    const row = rows.find((item) => item.feature_id === featureId);
    if (!row) throw new Error(`STITCH_FEATURE_CONTRACT_UNRESOLVED:${featureId}`);
    return {
      feature_id: row.feature_id,
      module: row.module || null,
      outcome: row.outcome || null,
      surfaces: row.surfaces || [],
      provider_projection_scope: 'VISUAL_SAFE_PRODUCT_SEMANTICS_ONLY',
      internal_contract_fields_withheld: withheldFields,
    };
  });
  return {
    source_ref: rel,
    source_sha256: rawSha256(fs.readFileSync(abs)),
    features: projected,
    internal_contract_fields_withheld: withheldFields,
    projection_hash: hashObject(projected),
  };
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

export function buildStitchDesignPrompt({ repoDir, fdep, brief, surfaceId = null, stage = 'EXPLORE', candidateDirection = null } = {}) {
  const visualAuthorityProjection = resolveStitchVisualAuthorityProjection({ repoDir, fdep });
  const featureContractProjection = resolveStitchFeatureContractProjection({ repoDir, fdep });
  const targetSurfaceId = surfaceId || stitchSurfaceRows(fdep)[0].surface_id;
  const targetSurface = stitchSurfaceRows(fdep).find((row) => row.surface_id === targetSurfaceId);
  if (!targetSurface) throw new Error(`STITCH_TARGET_SURFACE_NOT_DECLARED:${targetSurfaceId}`);
  const creativeStrategy = fdep.creative_screen_generation?.surfaces?.[targetSurfaceId] || null;
  const canonicalPacket = fdep.frontend_generation_context?.content_hash
    ? buildCanonicalStitchVisualPacket({ fdep, brief, blindReferenceMode: false })
    : null;
  const canonicalPrompt = canonicalPacket ? renderStitchVisualProductionPrompt({ packet: canonicalPacket }) : null;
  const providerDataPolicy = {
    literal_domain_values_allowed_only_when_present_verbatim_in_governed_projection: true,
    no_fabricated_vin_vehicle_model_year_part_number_price_stock_location_percentage_telemetry_error_code_identity_revision_or_metric: true,
    no_unproven_certification_audit_accessibility_or_test_claims: true,
    data_bearing_ready_state_without_authoritative_values: 'SHOW_FIELD_LABELS_AND_EMPTY_BOUND_REGIONS_ONLY',
    provider_visual_scope: 'PRIMARY_READY_COMPOSITION_ONLY',
    state_matrix_implementation_owner: 'DIAL_AEF_DOWNSTREAM',
    internal_contract_identifiers_visible_in_ui: false,
    target_surface_id: targetSurfaceId,
  };
  const projection = {
    task_id: fdep.task_id,
    unit_lineage_id: fdep.unit_lineage_id,
    unit_revision_hash: fdep.unit_revision_hash,
    product_design_profile: fdep.product_design_profile,
    target_surface: targetSurface,
    visual_reference_spec: fdep.visual_reference_spec,
    visual_authority_projection: visualAuthorityProjection,
    feature_contract_projection: featureContractProjection,
    presentation_decision: fdep.presentation_decision,
    change_budget: fdep.change_budget,
    authority_constraints: fdep.authority_constraints,
    provider_data_policy: providerDataPolicy,
    design_brief_hash: brief?.content_hash || null,
    governed_design_intent: brief?.design_intent || null,
    creative_stage: stage,
    creative_screen_generation: creativeStrategy,
    canonical_frontend_generation_context_hash: fdep.frontend_generation_context?.content_hash || null,
    canonical_stitch_visual_packet_hash: canonicalPacket?.packet_hash || null,
    canonical_target_screen_id: fdep.frontend_generation_context?.screen_context?.target_screen_id || null,
    candidate_direction: candidateDirection,
  };
  return [
    'DIAL governed Stitch design provider stage.',
    ...(canonicalPrompt ? [canonicalPrompt] : []),
    'CREATIVE_STAGE='+stage+'. TARGET_SURFACE='+targetSurfaceId+'. Generate exactly one composition for this surface only.',
    'This is guided creativity, not template filling. Make deliberate professional visual decisions wherever the CreativeDirectionProfile and DesignFreedomBudget permit freedom; preserve every immutable product, domain, accessibility and authority constraint.',
    'Do not collapse the result into a generic safe average. Establish a clear focal hierarchy, intentional spatial rhythm, distinctive product character and a coherent visual idea suited to this exact surface.',
    candidateDirection ? 'CANDIDATE_DIRECTION='+JSON.stringify(candidateDirection)+'. Push this direction far enough to be meaningfully distinguishable while remaining inside the freedom budget.' : 'Use the exploration plan to establish a strong initial direction that can produce meaningfully distinct variants.',
    'Return a non-authoritative design candidate only. Project Truth, FRC, Product Experience authority and the governed projections remain superior.',
    'The resolved visual-authority excerpt, visual-safe feature projection and governed design intent below are one-way projections from canonical DIAL authority. Follow them exactly.',
    'Treat governed_design_intent.text as the bounded task brief. Do not add product mechanics, labels, controls or runtime claims that are absent from that intent and the visual-safe feature projection.',
    'This must look like a real customer-facing DIAL experience, not a governance dashboard, debug console, state matrix, design-system specimen, test report, or engineering diagnostics screen.',
    'Do not visibly print feature IDs, surface IDs, Unit IDs, hashes, governance labels, archetype names, pattern names, provider names, qualification text, zero-fabrication notices, or acceptance/test metadata in the customer UI.',
    'ZERO FABRICATION: do not invent or display literal VINs, vehicle makes/models/years, part or OEM numbers, prices, stock quantities, depot/location names, compatibility percentages, telemetry/latency, error codes, account identities, revision/version/date values, business metrics, or operational facts unless the exact literal value is present in the governed projection JSON.',
    'Do not claim verified business status, official channel status, WCAG compliance, audits, certification, verification, tests passed, security clearance, cache freshness, connectivity quality, delivery state, queue state, or any other achieved/runtime status unless it is explicit governed domain truth.',
    'Use only the product-facing outcome and surface semantics present in the visual-safe feature projection. Internal aggregate, command, query, event, API, permission, lifecycle-state, audit and data-entity identifiers are deliberately withheld and must never be invented or rendered.',
    'Generate the primary normal/READY composition only. Do not render lifecycle controls, state switchers, state matrices, loading/error/permission/degraded variants, or operational status panels. DIAL AEF implements and certifies the complete FDEP state matrix after provider-design admission.',
    'When authoritative literal data is absent, use only non-data-bearing structure and product-facing labels implied directly by the governed outcome; never insert example/demo/placeholder/realistic-looking values.',
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
  if (fdep.creative_screen_generation?.surfaces && Object.keys(fdep.creative_screen_generation.surfaces).length) {
    return executeStitchCreativeExplorationStage({ repoDir, root, taskId, env, adapter, artifactDownloader, envelopeGuard, fdepGuard });
  }
  const envelopeCheck = envelopeGuard({ repoDir, root, envelope });
  if (!envelopeCheck?.ok) throw new Error(`STITCH_STAGE_STALE_ENVELOPE:${(envelopeCheck?.reasons || []).join(',')}`);
  const fdepCheck = fdepGuard({ repoDir, root, packet: fdep });
  if (!fdepCheck?.ok) throw new Error(`STITCH_STAGE_STALE_FDEP:${(fdepCheck?.reasons || []).join(',')}`);

  const stitch = adapter || new StitchAdapter({ enabled: true, env });
  const health = await stitch.health();
  const providerRoute = selectCanonicalFrontendDesignProvider({ repoDir, providerHealth: { stitch: health?.state } });
  if (!providerRoute.ok || providerRoute.selected !== 'google-stitch') throw Object.assign(new Error(`STITCH_STAGE_NOT_SELECTION_READY:${providerRoute.reason || health?.state}`), { category: health?.failure_class || 'PROVIDER_UNAVAILABLE' });
  const route = { ...providerRoute, provider: 'google-stitch', selected: designModeForFdep(fdep) === 'NEW_DIAL_DESIGN' ? 'STITCH_NEW_DESIGN_THEN_BUILD' : 'STITCH_CODE_TO_DESIGN_THEN_BUILD' };

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
      provider_locator: { project_id: generated.project_id || null, screen_id: generated.screen_id || null },
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


export async function executeStitchCreativeExplorationStage({
  repoDir,
  root = DEFAULT_CONTROL_HOME,
  taskId,
  env = process.env,
  adapter = null,
  artifactDownloader = downloadStitchArtifact,
  envelopeGuard = checkTaskExecutionEnvelope,
  fdepGuard = checkFrontendDesignExecutionPacket,
} = {}) {
  if (!repoDir || !taskId) throw new Error('STITCH_CREATIVE_EXPLORATION_INPUTS_REQUIRED');
  const envelope = readJson('execution/tasks/'+taskId+'/envelope.json', null, root);
  const fdep = readJson('execution/tasks/'+taskId+'/frontend-design-execution-packet.json', null, root);
  const brief = readJson('execution/tasks/'+taskId+'/design-brief-bundle.json', null, root);
  if (!envelope || !fdep || fdep.applicable === false || !brief) throw new Error('STITCH_CREATIVE_GOVERNED_FRONTEND_TASK_REQUIRED');
  const envelopeCheck = envelopeGuard({ repoDir, root, envelope });
  if (!envelopeCheck?.ok) throw new Error('STITCH_CREATIVE_STALE_ENVELOPE:'+(envelopeCheck?.reasons || []).join(','));
  const fdepCheck = fdepGuard({ repoDir, root, packet: fdep });
  if (!fdepCheck?.ok) throw new Error('STITCH_CREATIVE_STALE_FDEP:'+(fdepCheck?.reasons || []).join(','));

  const stitch = adapter || new StitchAdapter({ enabled: true, env });
  const health = await stitch.health();
  const providerRoute = selectCanonicalFrontendDesignProvider({ repoDir, providerHealth: { stitch: health?.state } });
  if (!providerRoute.ok || providerRoute.selected !== 'google-stitch') {
    throw Object.assign(new Error('STITCH_CREATIVE_NOT_SELECTION_READY:'+(providerRoute.reason || health?.state)), { category: health?.failure_class || 'PROVIDER_UNAVAILABLE' });
  }
  const route = { ...providerRoute, provider: 'google-stitch', selected: designModeForFdep(fdep) === 'NEW_DIAL_DESIGN' ? 'STITCH_NEW_DESIGN_THEN_BUILD' : 'STITCH_CODE_TO_DESIGN_THEN_BUILD' };
  if (typeof stitch.variants !== 'function') throw new Error('STITCH_CREATIVE_VARIANTS_UNAVAILABLE');

  const designProjectionHash = fdep.provenance?.frontend_projection_hash || brief.provenance?.projection_hash;
  if (!designProjectionHash) throw new Error('STITCH_CREATIVE_DESIGN_PROJECTION_HASH_REQUIRED');

  const surfaces = {};
  const providerResponses = [];
  for (const surface of stitchSurfaceRows(fdep)) {
    const surfaceId = surface.surface_id;
    const slug = safeSurfaceSlug(surfaceId);
    const strategy = fdep.creative_screen_generation?.surfaces?.[surfaceId];
    if (!strategy) throw new Error('STITCH_CREATIVE_STRATEGY_MISSING:'+surfaceId);
    const lenses = strategy.exploration_plan?.candidates || [];
    const variantOptions = strategy.exploration_plan?.provider_variant_options;
    if (!lenses.length || !variantOptions?.variantCount) throw new Error('STITCH_CREATIVE_EXPLORATION_PLAN_INVALID:'+surfaceId);
    const seedPrompt = buildStitchDesignPrompt({ repoDir, fdep, brief, surfaceId, stage: 'EXPLORE' });
    const explorePrompt = [
      buildStitchDesignPrompt({ repoDir, fdep, brief, surfaceId, stage: 'EXPLORE' }),
      'Generate a set of meaningfully distinct candidates. Each candidate must remain inside the exact same immutable anchors and product semantics.',
      'Candidate lenses to deliberately separate:',
      JSON.stringify(lenses),
      'Do not merely recolor or reorder the same composition. Vary hierarchy, rhythm, art direction and product expression while preserving functional truth.',
    ].join('\n');
    const generated = await stitch.variants({
      project_title: 'DIAL '+fdep.unit_lineage_id+' '+surfaceId+' '+taskId+' creative exploration',
      seed_prompt: seedPrompt,
      explore_prompt: explorePrompt,
      variant_options: variantOptions,
      device_type: stitchDeviceType(surfaceId),
      model_id: 'GEMINI_3_1_PRO',
      design_projection_hash: designProjectionHash,
    });
    const rows = generated.variants || [];
    if (rows.length < Number(strategy.design_freedom_budget?.convergence_policy?.minimum_distinct_candidates || variantOptions.variantCount)) {
      throw new Error('STITCH_CREATIVE_VARIANT_COUNT_INSUFFICIENT:'+surfaceId+':'+rows.length);
    }
    const variants = [];
    for (let i = 0; i < Math.min(rows.length, lenses.length); i += 1) {
      const row = rows[i];
      const lens = lenses[i];
      const htmlArtifact = await artifactDownloader(row.html_url, { maxBytes: 2_000_000 });
      const imageArtifact = await artifactDownloader(row.image_url, { maxBytes: 8_000_000 });
      const rawHtml = Buffer.from(htmlArtifact.body).toString('utf8');
      const sanitization = sanitizeDesignArtifactForEvidence({ content: rawHtml, mimeType: htmlArtifact.content_type || 'text/html' });
      const rawStored = persistPrivateArtifact(root, taskId, 'explore-'+slug+'-'+lens.candidate_id+'-raw.html', Buffer.from(htmlArtifact.body));
      if (!sanitization.ok) throw new Error('STITCH_CREATIVE_VARIANT_QUARANTINED:'+surfaceId+':'+lens.candidate_id+':'+sanitization.sanitized_quarantine.violations.join(','));
      const html = sanitization.content;
      const htmlStored = persistPrivateArtifact(root, taskId, 'explore-'+slug+'-'+lens.candidate_id+'.html', Buffer.from(html, 'utf8'));
      const imageStored = persistPrivateArtifact(root, taskId, 'explore-'+slug+'-'+lens.candidate_id+'-image.bin', Buffer.from(imageArtifact.body));
      variants.push({
        candidate_id: lens.candidate_id,
        candidate_direction: lens,
        project_id: row.project_id || generated.project_id,
        screen_id: row.screen_id,
        project_id_hash: sha256(row.project_id || generated.project_id),
        screen_id_hash: sha256(row.screen_id),
        artifacts: {
          raw_html: { ...rawStored, content_type: htmlArtifact.content_type || null, quarantine_violations: sanitization.raw_quarantine.violations },
          html: { ...htmlStored, content_type: htmlArtifact.content_type || null, inert_evidence: true, transformation_hash: sanitization.transformation_hash },
          image: { ...imageStored, content_type: imageArtifact.content_type || null },
        },
      });
    }
    surfaces[surfaceId] = {
      surface_id: surfaceId,
      strategy_hash: strategy.content_hash,
      creative_direction_hash: strategy.creative_direction_profile?.content_hash || null,
      freedom_budget_hash: strategy.design_freedom_budget?.content_hash || null,
      exploration_plan_hash: strategy.exploration_plan?.content_hash || null,
      variants,
    };
    providerResponses.push({ surface_id: surfaceId, response_hash: generated.response_hash || null, project_id_hash: sha256(generated.project_id) });
  }

  const repoSha = repositorySha(repoDir);
  if (!repoSha) throw new Error('STITCH_CREATIVE_REPOSITORY_SHA_UNAVAILABLE');
  const record = proofWithHash({
    schema_version: 1,
    provider: 'google-stitch',
    repository_sha: repoSha,
    status: 'CREATIVE_EXPLORATION_READY_FOR_CRITIC',
    task_id: taskId,
    envelope_hash: envelope.envelope_hash,
    fdep_hash: fdep.content_hash,
    route,
    strategy_version: fdep.creative_screen_generation?.strategy_version || null,
    strategy_hash: fdep.creative_screen_generation?.content_hash || null,
    surfaces,
    provider_response_hash: hashObject(providerResponses),
    observed_at: now(),
  });
  writeJsonAtomic(creativeExplorationRel(taskId), record, root);
  appendJsonl('events/adaptive-execution.jsonl', {
    event: 'STITCH_CREATIVE_EXPLORATION_READY',
    task_id: taskId,
    strategy_hash: record.strategy_hash,
    evidence_hash: record.evidence_hash,
    at: record.observed_at,
  }, root);
  return record;
}

export async function convergeStitchCreativeStage({
  repoDir,
  root = DEFAULT_CONTROL_HOME,
  taskId,
  criticEvidence,
  env = process.env,
  adapter = null,
  artifactDownloader = downloadStitchArtifact,
  envelopeGuard = checkTaskExecutionEnvelope,
  fdepGuard = checkFrontendDesignExecutionPacket,
} = {}) {
  if (!repoDir || !taskId || !criticEvidence || typeof criticEvidence !== 'object') throw new Error('STITCH_CREATIVE_CONVERGENCE_INPUTS_REQUIRED');
  const exploration = readJson(creativeExplorationRel(taskId), null, root);
  const envelope = readJson('execution/tasks/'+taskId+'/envelope.json', null, root);
  const fdep = readJson('execution/tasks/'+taskId+'/frontend-design-execution-packet.json', null, root);
  const brief = readJson('execution/tasks/'+taskId+'/design-brief-bundle.json', null, root);
  if (!exploration || !envelope || !fdep || !brief) throw new Error('STITCH_CREATIVE_EXPLORATION_OR_GOVERNANCE_MISSING');
  if (!evidenceHashMatches(exploration)) throw new Error('STITCH_CREATIVE_EXPLORATION_TAMPERED');
  const currentSha = repositorySha(repoDir);
  if (!currentSha || exploration.repository_sha !== currentSha || exploration.fdep_hash !== fdep.content_hash || exploration.envelope_hash !== envelope.envelope_hash) {
    throw new Error('STITCH_CREATIVE_EXPLORATION_STALE');
  }
  const envelopeCheck = envelopeGuard({ repoDir, root, envelope });
  if (!envelopeCheck?.ok) throw new Error('STITCH_CREATIVE_CONVERGENCE_STALE_ENVELOPE:'+(envelopeCheck?.reasons || []).join(','));
  const fdepCheck = fdepGuard({ repoDir, root, packet: fdep });
  if (!fdepCheck?.ok) throw new Error('STITCH_CREATIVE_CONVERGENCE_STALE_FDEP:'+(fdepCheck?.reasons || []).join(','));

  const stitch = adapter || new StitchAdapter({ enabled: true, env });
  const health = await stitch.health();
  if (health?.state !== 'HEALTHY') throw Object.assign(new Error('STITCH_CREATIVE_CONVERGENCE_PROVIDER_UNAVAILABLE:'+health?.state), { category: health?.failure_class || 'PROVIDER_UNAVAILABLE' });
  if (typeof stitch.refine !== 'function') throw new Error('STITCH_CREATIVE_REFINE_UNAVAILABLE');

  const designProjectionHash = fdep.provenance?.frontend_projection_hash || brief.provenance?.projection_hash;
  const finalSurfaceArtifacts = {};
  const generatedSurfaces = [];
  const selections = {};
  for (const [surfaceId, surfaceRecord] of Object.entries(exploration.surfaces || {}).sort(([a],[b]) => a.localeCompare(b))) {
    const evidenceRows = Array.isArray(criticEvidence[surfaceId]) ? criticEvidence[surfaceId] : criticEvidence[surfaceId]?.evaluations;
    if (!Array.isArray(evidenceRows)) throw new Error('STITCH_CREATIVE_CRITIC_EVIDENCE_MISSING:'+surfaceId);
    const evaluations = evidenceRows.map((row) => evaluateCreativeCandidate({
      candidate_id: row.candidate_id,
      metrics: row.metrics,
      hard_gates: row.hard_gates,
    }));
    const selection = selectCreativeCandidate({ evaluations });
    if (!selection.selected) throw new Error('STITCH_CREATIVE_NO_ELIGIBLE_CANDIDATE:'+surfaceId);
    const selectedVariant = (surfaceRecord.variants || []).find((row) => row.candidate_id === selection.selected);
    if (!selectedVariant) throw new Error('STITCH_CREATIVE_SELECTED_VARIANT_MISSING:'+surfaceId+':'+selection.selected);
    const selectedEvaluation = evaluations.find((row) => row.candidate_id === selection.selected);
    const strategy = fdep.creative_screen_generation?.surfaces?.[surfaceId];
    const convergencePrompt = [
      buildStitchDesignPrompt({
        repoDir,
        fdep,
        brief,
        surfaceId,
        stage: 'CONVERGE',
        candidateDirection: selectedVariant.candidate_direction,
      }),
      'Refine this selected candidate rather than redesigning from scratch.',
      'Preserve the strongest distinctive characteristics of the selected direction; do not regress toward an averaged generic layout.',
      'Critic evidence for the selected candidate:',
      JSON.stringify(selectedEvaluation),
      'Resolve any weakness visible in the critic metrics while preserving all hard gates and immutable anchors.',
    ].join('\n');
    const refined = await stitch.refine({
      project_id: selectedVariant.project_id,
      screen_id: selectedVariant.screen_id,
      prompt: convergencePrompt,
      device_type: stitchDeviceType(surfaceId),
      model_id: 'GEMINI_3_1_PRO',
      design_projection_hash: designProjectionHash,
    });
    const htmlArtifact = await artifactDownloader(refined.html_url, { maxBytes: 2_000_000 });
    const imageArtifact = await artifactDownloader(refined.image_url, { maxBytes: 8_000_000 });
    const rawHtml = Buffer.from(htmlArtifact.body).toString('utf8');
    const sanitization = sanitizeDesignArtifactForEvidence({ content: rawHtml, mimeType: htmlArtifact.content_type || 'text/html' });
    const slug = safeSurfaceSlug(surfaceId);
    const rawStored = persistPrivateArtifact(root, taskId, 'candidate-'+slug+'-raw.html', Buffer.from(htmlArtifact.body));
    if (!sanitization.ok) throw new Error('STITCH_CREATIVE_CONVERGED_QUARANTINED:'+surfaceId+':'+sanitization.sanitized_quarantine.violations.join(','));
    const html = sanitization.content;
    const htmlStored = persistPrivateArtifact(root, taskId, 'candidate-'+slug+'.html', Buffer.from(html, 'utf8'));
    const imageStored = persistPrivateArtifact(root, taskId, 'candidate-'+slug+'-image.bin', Buffer.from(imageArtifact.body));
    finalSurfaceArtifacts[surfaceId] = {
      surface_id: surfaceId,
      device_type: stitchDeviceType(surfaceId),
      screen_id_hash: refined.screen_id ? sha256(refined.screen_id) : null,
      provider_locator: { project_id: refined.project_id || selectedVariant.project_id || null, screen_id: refined.screen_id || null },
      raw_html: { ...rawStored, content_type: htmlArtifact.content_type || null, quarantine_violations: sanitization.raw_quarantine.violations },
      html: { ...htmlStored, content_type: htmlArtifact.content_type || null, inert_evidence: true, transformation_hash: sanitization.transformation_hash },
      image: { ...imageStored, content_type: imageArtifact.content_type || null },
      creative_selection: {
        selected_candidate_id: selection.selected,
        selection_hash: selection.content_hash,
        selected_score: selection.selected_score,
        selected_quality_floor: selection.selected_quality_floor,
      },
    };
    generatedSurfaces.push({ surface_id: surfaceId, screen_id: refined.screen_id, response_hash: refined.response_hash || null, html });
    selections[surfaceId] = { selection, critic_evidence_hash: sha256(evidenceRows) };
  }

  const aggregateHtml = generatedSurfaces.map((row) => '<!-- '+row.surface_id+' -->\n'+row.html).join('\n');
  const aggregateQuarantine = quarantineDesignArtifact({ content: aggregateHtml, mimeType: 'text/html' });
  if (!aggregateQuarantine.ok) throw new Error('STITCH_CREATIVE_AGGREGATE_QUARANTINED:'+aggregateQuarantine.violations.join(','));
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
  const convergence = proofWithHash({
    schema_version: 1,
    provider: 'google-stitch',
    repository_sha: currentSha,
    status: 'QUARANTINED_SAFE_REVIEW_REQUIRED',
    task_id: taskId,
    envelope_hash: envelope.envelope_hash,
    candidate,
    creative_strategy: {
      strategy_version: fdep.creative_screen_generation?.strategy_version || null,
      strategy_hash: fdep.creative_screen_generation?.content_hash || null,
      exploration_evidence_hash: exploration.evidence_hash,
      selections,
      critic_evidence_hash: sha256(criticEvidence),
    },
    provider_response_hash: hashObject(generatedSurfaces.map((row) => ({ surface_id: row.surface_id, response_hash: row.response_hash }))),
    surface_count: generatedSurfaces.length,
    artifacts: generatedSurfaces.length === 1
      ? { ...finalSurfaceArtifacts[generatedSurfaces[0].surface_id], surfaces: finalSurfaceArtifacts }
      : { surfaces: finalSurfaceArtifacts },
    observed_at: now(),
  });
  writeJsonAtomic(creativeConvergenceRel(taskId), convergence, root);
  writeJsonAtomic(candidateRel(taskId), convergence, root);
  writeJsonAtomic('execution/design/candidates/'+candidate.candidate_id+'.json', convergence, root);
  appendJsonl('events/adaptive-execution.jsonl', {
    event: 'STITCH_CREATIVE_CANDIDATE_CONVERGED',
    task_id: taskId,
    candidate_id: candidate.candidate_id,
    candidate_hash: candidate.candidate_hash,
    strategy_hash: convergence.creative_strategy.strategy_hash,
    at: convergence.observed_at,
  }, root);
  return convergence;
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
  const stateCoverageMode = evidence.state_coverage_mode || 'PROVIDER_REQUIRED';
  const deferredStateCoverage = stateCoverageMode === 'DOWNSTREAM_AEF_REQUIRED';
  const authorityConformanceMode = evidence.authority_conformance_mode || 'PROVIDER_REQUIRED';
  const deferredAuthorityConformance = authorityConformanceMode === 'DOWNSTREAM_AEF_REQUIRED';
  if ((!deferredAuthorityConformance && evidence.authority_conforms !== true) || (deferredAuthorityConformance && evidence.provider_visual_conforms !== true) || evidence.change_budget_satisfied !== true) throw new Error('STITCH_ADMISSION_ACCEPTANCE_EVIDENCE_INCOMPLETE');
  if (!deferredStateCoverage && evidence.required_states_present !== true) throw new Error('STITCH_ADMISSION_ACCEPTANCE_EVIDENCE_INCOMPLETE');
  if (deferredStateCoverage && evidence.primary_composition_present !== true) throw new Error('STITCH_ADMISSION_PRIMARY_COMPOSITION_REQUIRED');
  const normalization = normalizeDesignCandidate({ repoDir, candidate: evidence.design_candidate_facts || {}, fdep, changeBudget: fdep.change_budget });
  if (normalization.status !== 'NORMALIZED') throw new Error(`STITCH_ADMISSION_NORMALIZATION_FAILED:${normalization.violations.join(',')}`);
  const admitted = admitDesignCandidate({
    candidate: record.candidate,
    authorityConforms: evidence.authority_conforms,
    authorityConformanceMode,
    providerVisualConforms: evidence.provider_visual_conforms,
    requiredStatesPresent: evidence.required_states_present,
    stateCoverageMode,
    primaryCompositionPresent: evidence.primary_composition_present,
    externalReferenceNonAuthorityPreserved: evidence.external_reference_non_authority !== false,
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
    state_coverage_mode: stateCoverageMode,
    downstream_state_certification_required: deferredStateCoverage,
    authority_conformance_mode: authorityConformanceMode,
    downstream_authority_certification_required: deferredAuthorityConformance,
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

function writeReadOnlyEvidenceFile(abs, body) {
  fs.mkdirSync(path.dirname(abs), { recursive: true, mode: 0o700 });
  const tmp = `${abs}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(tmp, body, { mode: 0o400 });
  fs.chmodSync(tmp, 0o400);
  fs.renameSync(tmp, abs);
  fs.chmodSync(abs, 0o400);
}

export function materializeAcceptedStitchDesignEvidence({ repoDir, root = DEFAULT_CONTROL_HOME, taskId } = {}) {
  const accepted = loadCurrentStitchAcceptedDesign({ repoDir, root, taskId });
  const record = readJson(candidateRel(taskId), null, root);
  if (!accepted || !record?.candidate || !evidenceHashMatches(record)) throw new Error('STITCH_WORKER_EVIDENCE_SOURCE_MISSING_OR_TAMPERED');
  if (record.repository_sha !== accepted.repository_sha || record.task_id !== taskId || record.candidate.candidate_hash !== accepted.candidate_hash) throw new Error('STITCH_WORKER_EVIDENCE_BINDING_INVALID');
  const surfaces = record.artifacts?.surfaces || (record.artifacts?.surface_id ? { [record.artifacts.surface_id]: record.artifacts } : {});
  const entries = Object.entries(surfaces).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) throw new Error('STITCH_WORKER_EVIDENCE_ARTIFACTS_MISSING');
  const dirRel = workerEvidenceDirRel(taskId);
  const dirAbs = resolveControlPath(dirRel, root);
  fs.rmSync(dirAbs, { recursive: true, force: true });
  fs.mkdirSync(dirAbs, { recursive: true, mode: 0o700 });
  const files = [];
  for (const [surfaceId, surface] of entries) {
    const htmlMeta = surface?.html;
    const imageMeta = surface?.image;
    if (htmlMeta?.inert_evidence !== true || !htmlMeta?.rel || !htmlMeta?.sha256 || !imageMeta?.rel || !imageMeta?.sha256) throw new Error(`STITCH_WORKER_EVIDENCE_INCOMPLETE:${surfaceId}`);
    const htmlBody = fs.readFileSync(resolveControlPath(htmlMeta.rel, root));
    const imageBody = fs.readFileSync(resolveControlPath(imageMeta.rel, root));
    if (rawSha256(htmlBody) !== htmlMeta.sha256 || rawSha256(imageBody) !== imageMeta.sha256) throw new Error(`STITCH_WORKER_EVIDENCE_HASH_MISMATCH:${surfaceId}`);
    const inertCheck = quarantineDesignArtifact({ content: htmlBody.toString('utf8'), mimeType: 'text/html' });
    if (!inertCheck.ok) throw new Error(`STITCH_WORKER_EVIDENCE_NOT_INERT:${surfaceId}:${inertCheck.violations.join(',')}`);
    if (imageMeta.content_type !== 'image/png' || imageBody.length < 8 || imageBody.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`STITCH_WORKER_EVIDENCE_IMAGE_INVALID:${surfaceId}`);
    const slug = String(surfaceId).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    const htmlRel = `${dirRel}/${slug}.html`;
    const imageRel = `${dirRel}/${slug}.png`;
    writeReadOnlyEvidenceFile(resolveControlPath(htmlRel, root), htmlBody);
    writeReadOnlyEvidenceFile(resolveControlPath(imageRel, root), imageBody);
    files.push({ surface_id: surfaceId, kind: 'INERT_HTML', rel: htmlRel, sha256: htmlMeta.sha256, bytes: htmlBody.length, content_type: 'text/html' });
    files.push({ surface_id: surfaceId, kind: 'PNG', rel: imageRel, sha256: imageMeta.sha256, bytes: imageBody.length, content_type: 'image/png' });
  }
  const proof = proofWithHash({
    schema_version: 1,
    provider: 'google-stitch',
    repository_sha: accepted.repository_sha,
    status: 'MATERIALIZED_READ_ONLY',
    task_id: taskId,
    candidate_hash: accepted.candidate_hash,
    accepted_evidence_hash: accepted.evidence_hash,
    files,
    raw_provider_artifacts_materialized: false,
    materialized_at: now(),
  });
  writeJsonAtomic(workerEvidenceRel(taskId), proof, root);
  appendJsonl('events/adaptive-execution.jsonl', { event: 'STITCH_ACCEPTED_EVIDENCE_MATERIALIZED_FOR_WORKER', task_id: taskId, candidate_hash: accepted.candidate_hash, evidence_hash: proof.evidence_hash, at: proof.materialized_at }, root);
  return proof;
}

export function recordStitchUnitConsumption({ repoDir, root = DEFAULT_CONTROL_HOME, taskId, workerArtifactId, envelopeHash } = {}) {
  const accepted = loadCurrentStitchAcceptedDesign({ repoDir, root, taskId, envelopeHash });
  if (!accepted) return null;
  if (!workerArtifactId || !envelopeHash) throw new Error('STITCH_UNIT_CONSUMPTION_BINDING_INVALID');
  const materialized = readJson(workerEvidenceRel(taskId), null, root);
  if (!materialized || !evidenceHashMatches(materialized)) throw new Error('STITCH_UNIT_CONSUMPTION_REQUIRES_MATERIALIZED_EVIDENCE');
  if (materialized.status !== 'MATERIALIZED_READ_ONLY' || materialized.repository_sha !== accepted.repository_sha || materialized.task_id !== taskId || materialized.candidate_hash !== accepted.candidate_hash || materialized.accepted_evidence_hash !== accepted.evidence_hash || materialized.raw_provider_artifacts_materialized !== false || !(materialized.files || []).length) throw new Error('STITCH_UNIT_CONSUMPTION_MATERIALIZATION_BINDING_INVALID');
  const proof = proofWithHash({
    schema_version: 1,
    provider: 'google-stitch',
    repository_sha: accepted.repository_sha,
    status: 'PASSED',
    task_id: taskId,
    candidate_hash: accepted.candidate_hash,
    accepted_evidence_hash: accepted.evidence_hash,
    materialization_evidence_hash: materialized.evidence_hash,
    materialized_file_hashes: materialized.files.map((file) => file.sha256).sort(),
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
  const required = ['accessibility', 'performance', 'security', 'domain_truth', 'normalization', 'design_lint', 'parity', 'state_matrix_coverage', 'vrde_comparable'];
  const visualGates = certification.visual_gates || [];
  const requiredVisualGateIds = ['V1_STRUCTURAL','V2_GEOMETRY','V3_TYPOGRAPHY','V4_ASSETS','V5_PERCEPTUAL','V6_DELTA_PROVENANCE','V7_RESPONSIVE_IDENTITY','V8_AUTHORITY_SIGNOFF'];
  const visualGateMap = new Map(visualGates.map((gate) => [gate.gate_id, gate]));
  if (required.some((key) => certification[key] !== true)
    || certification.hard_gate?.ok !== true
    || certification.qualitative_gate?.state !== 'PASSED'
    || requiredVisualGateIds.some((gateId) => !String(visualGateMap.get(gateId)?.state || '').startsWith('PASSED'))
    || visualGates.some((gate) => !String(gate.state || '').startsWith('PASSED'))) throw new Error('STITCH_SCREEN_CERTIFICATION_REQUIRED_DIMENSIONS_MISSING');
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

export function freezeAcceptedStitchVisualAuthority({
  repoDir,
  root = DEFAULT_CONTROL_HOME,
  taskId,
  surfaceId = null,
  promotedBy,
  promotionAuthority,
  critique = { verdict: 'PASS' },
} = {}) {
  if (!repoDir || !taskId) throw new Error('STITCH_VISUAL_FREEZE_INPUTS_REQUIRED');
  const accepted = loadCurrentStitchAcceptedDesign({ repoDir, root, taskId });
  const record = readJson(candidateRel(taskId), null, root);
  const fdep = readJson(`execution/tasks/${taskId}/frontend-design-execution-packet.json`, null, root);
  if (!accepted || !record?.candidate || !fdep?.frontend_generation_context) throw new Error('STITCH_VISUAL_FREEZE_GOVERNED_INPUTS_MISSING');
  const surfaces = record.artifacts?.surfaces || (record.artifacts?.surface_id ? { [record.artifacts.surface_id]: record.artifacts } : {});
  const ids = Object.keys(surfaces).sort();
  const selectedSurface = surfaceId || (ids.length === 1 ? ids[0] : null);
  if (!selectedSurface || !surfaces[selectedSurface]) throw new Error('STITCH_VISUAL_AUTHORITY_SURFACE_SELECTION_REQUIRED');
  const artifact = surfaces[selectedSurface];
  if (!artifact.provider_locator?.project_id || !artifact.provider_locator?.screen_id) throw new Error('STITCH_VISUAL_AUTHORITY_PROVIDER_LOCATOR_REQUIRED');
  const frozen = freezeVisualAuthorityArtifact({
    generationContext: fdep.frontend_generation_context,
    candidate: {
      provider: 'google-stitch',
      project_id: artifact.provider_locator.project_id,
      screen_id: artifact.provider_locator.screen_id,
      response_hash: record.provider_response_hash || record.candidate.candidate_hash,
      code_artifact_ref: artifact.html?.rel || null,
      rendered_preview_ref: artifact.image?.rel || null,
      structure_map_ref: null,
    },
    critique,
    promotedBy,
    promotionAuthority,
  });
  if (!frozen.ok) throw new Error(`STITCH_VISUAL_AUTHORITY_FREEZE_FAILED:${frozen.failures.join(',')}`);
  const proof = proofWithHash({
    ...frozen.visual_authority,
    repository_sha: accepted.repository_sha,
    task_id: taskId,
    surface_id: selectedSurface,
    accepted_candidate_hash: accepted.candidate_hash,
    frozen_at: now(),
  });
  writeJsonAtomic(visualAuthorityRel(taskId), proof, root);
  appendJsonl('events/adaptive-execution.jsonl', { event: 'STITCH_VISUAL_AUTHORITY_FROZEN', task_id: taskId, surface_id: selectedSurface, visual_authority_hash: proof.content_hash, at: proof.frozen_at }, root);
  return proof;
}

export async function executeStitchInteractionMotionStage({
  repoDir,
  root = DEFAULT_CONTROL_HOME,
  taskId,
  env = process.env,
  adapter = null,
  artifactDownloader = downloadStitchArtifact,
  fdepGuard = checkFrontendDesignExecutionPacket,
} = {}) {
  if (!repoDir || !taskId) throw new Error('STITCH_INTERACTION_STAGE_INPUTS_REQUIRED');
  const fdep = readJson(`execution/tasks/${taskId}/frontend-design-execution-packet.json`, null, root);
  const visualAuthority = readJson(visualAuthorityRel(taskId), null, root);
  if (!fdep?.frontend_generation_context || visualAuthority?.status !== 'FROZEN') throw new Error('STITCH_INTERACTION_STAGE_REQUIRES_FROZEN_VISUAL_AUTHORITY');
  const currentSha = repositorySha(repoDir);
  if (!currentSha || visualAuthority.repository_sha !== currentSha || !evidenceHashMatches(visualAuthority)) throw new Error('STITCH_VISUAL_AUTHORITY_STALE_OR_TAMPERED');
  const fdepCheck = fdepGuard({ repoDir, root, packet: fdep });
  if (!fdepCheck?.ok) throw new Error(`STITCH_INTERACTION_STALE_FDEP:${(fdepCheck?.reasons || []).join(',')}`);
  const packet = buildCanonicalInteractionMotionPacket({ fdep, visualAuthority });
  const prompt = renderInteractionMotionPrompt({ packet });
  const stitch = adapter || new StitchAdapter({ enabled: true, env });
  const health = await stitch.health();
  const providerRoute = selectCanonicalFrontendDesignProvider({ repoDir, providerHealth: { stitch: health?.state } });
  if (!providerRoute.ok || providerRoute.selected !== 'google-stitch') throw Object.assign(new Error(`STITCH_INTERACTION_PROVIDER_NOT_READY:${providerRoute.reason || health?.state}`), { category: health?.failure_class || 'PROVIDER_UNAVAILABLE' });
  if (typeof stitch.refine !== 'function') throw new Error('STITCH_INTERACTION_REFINE_UNAVAILABLE');
  const refined = await stitch.refine({
    project_id: visualAuthority.project_id,
    screen_id: visualAuthority.screen_refs?.[0],
    prompt,
    device_type: stitchDeviceType(visualAuthority.surface_id || 'DIAL_CONSUMER'),
    model_id: 'GEMINI_3_1_PRO',
    design_projection_hash: fdep.provenance?.frontend_projection_hash || fdep.frontend_generation_context.content_hash,
  });
  const htmlArtifact = await artifactDownloader(refined.html_url, { maxBytes: 2_000_000 });
  const imageArtifact = await artifactDownloader(refined.image_url, { maxBytes: 8_000_000 });
  const rawHtml = Buffer.from(htmlArtifact.body).toString('utf8');
  const sanitization = sanitizeDesignArtifactForEvidence({ content: rawHtml, mimeType: htmlArtifact.content_type || 'text/html' });
  const rawStored = persistPrivateArtifact(root, taskId, 'interaction-motion-raw.html', Buffer.from(htmlArtifact.body));
  if (!sanitization.ok) throw new Error(`STITCH_INTERACTION_QUARANTINED:${sanitization.sanitized_quarantine.violations.join(',')}`);
  const htmlStored = persistPrivateArtifact(root, taskId, 'interaction-motion.html', Buffer.from(sanitization.content, 'utf8'));
  const imageStored = persistPrivateArtifact(root, taskId, 'interaction-motion-image.bin', Buffer.from(imageArtifact.body));
  const record = proofWithHash({
    schema_version: 1,
    provider: 'google-stitch',
    phase: 'INTERACTION_AND_MOTION_ENRICHMENT',
    repository_sha: currentSha,
    status: 'QUARANTINED_SAFE_REVIEW_REQUIRED',
    task_id: taskId,
    surface_id: visualAuthority.surface_id,
    visual_authority_hash: visualAuthority.content_hash,
    interaction_motion_packet_hash: packet.packet_hash,
    provider_locator: { project_id: refined.project_id || visualAuthority.project_id, screen_id: refined.screen_id },
    artifacts: {
      raw_html: { ...rawStored, content_type: htmlArtifact.content_type || null, quarantine_violations: sanitization.raw_quarantine.violations },
      html: { ...htmlStored, content_type: htmlArtifact.content_type || null, inert_evidence: true, transformation_hash: sanitization.transformation_hash },
      image: { ...imageStored, content_type: imageArtifact.content_type || null },
    },
    required_structured_outputs: packet.required_outputs.filter((x) => x !== 'enriched_code'),
    provider_response_hash: refined.response_hash || null,
    observed_at: now(),
  });
  writeJsonAtomic(interactionMotionRel(taskId), record, root);
  appendJsonl('events/adaptive-execution.jsonl', { event: 'STITCH_INTERACTION_MOTION_READY_FOR_REVIEW', task_id: taskId, visual_authority_hash: visualAuthority.content_hash, evidence_hash: record.evidence_hash, at: record.observed_at }, root);
  return record;
}

export function acceptStitchInteractionMotionStage({
  repoDir,
  root = DEFAULT_CONTROL_HOME,
  taskId,
  interactionArtifact,
  checks,
  promotedBy = 'SYSTEM_AFTER_ACCEPTANCE',
  promotionAuthority = 'AUTHORIZED_DESIGN_AUTHORITY',
} = {}) {
  if (!repoDir || !taskId || !interactionArtifact) throw new Error('STITCH_INTERACTION_ACCEPTANCE_INPUTS_REQUIRED');
  const fdep = readJson(`execution/tasks/${taskId}/frontend-design-execution-packet.json`, null, root);
  const visualAuthority = readJson(visualAuthorityRel(taskId), null, root);
  const stage = readJson(interactionMotionRel(taskId), null, root);
  if (!fdep?.frontend_generation_context || visualAuthority?.status !== 'FROZEN' || !stage || !evidenceHashMatches(stage)) throw new Error('STITCH_INTERACTION_ACCEPTANCE_GOVERNED_INPUTS_MISSING');
  if (stage.visual_authority_hash !== visualAuthority.content_hash) throw new Error('STITCH_INTERACTION_VISUAL_AUTHORITY_BINDING_INVALID');
  const candidateFacts = interactionArtifact.candidate_facts || [];
  const truthLint = lintCandidateFacts({ generationContext: fdep.frontend_generation_context, candidateFacts });
  if (truthLint.status !== 'PASSED') throw new Error(`STITCH_INTERACTION_TRUTH_LINT_FAILED:${truthLint.findings.map((x) => x.finding_id).join(',')}`);
  const acceptance = buildInteractionAcceptanceMatrix({ interactionArtifact, checks });
  if (!acceptance.passed) throw new Error(`STITCH_INTERACTION_ACCEPTANCE_FAILED:${acceptance.failures.join(',')}`);
  const freeze = freezeExperienceAuthorityArtifact({
    generationContext: fdep.frontend_generation_context,
    visualAuthority,
    interactionArtifact,
    acceptance,
    promotedBy,
    promotionAuthority,
  });
  if (!freeze.ok) throw new Error(`STITCH_EXPERIENCE_AUTHORITY_FREEZE_FAILED:${freeze.failures.join(',')}`);
  const experience = proofWithHash({ ...freeze.experience_authority, repository_sha: stage.repository_sha, task_id: taskId, interaction_stage_evidence_hash: stage.evidence_hash, truth_lint_hash: truthLint.content_hash, frozen_at: now() });
  writeJsonAtomic(interactionAcceptanceRel(taskId), acceptance, root);
  writeJsonAtomic(experienceAuthorityRel(taskId), experience, root);
  appendJsonl('events/adaptive-execution.jsonl', { event: 'STITCH_EXPERIENCE_AUTHORITY_FROZEN', task_id: taskId, experience_authority_hash: experience.content_hash, at: experience.frozen_at }, root);
  return { acceptance, truth_lint: truthLint, experience_authority: experience };
}

export function compileStitchProductionBindingContract({ repoDir, root = DEFAULT_CONTROL_HOME, taskId, bindings = {} } = {}) {
  if (!repoDir || !taskId) throw new Error('STITCH_PRODUCTION_BINDING_INPUTS_REQUIRED');
  const fdep = readJson(`execution/tasks/${taskId}/frontend-design-execution-packet.json`, null, root);
  const experienceAuthority = readJson(experienceAuthorityRel(taskId), null, root);
  if (!fdep?.frontend_generation_context || experienceAuthority?.status !== 'FROZEN') throw new Error('STITCH_PRODUCTION_BINDING_REQUIRES_FROZEN_EXPERIENCE_AUTHORITY');
  const contract = buildProductionBindingContract({ generationContext: fdep.frontend_generation_context, experienceAuthority, bindings });
  writeJsonAtomic(productionBindingRel(taskId), contract, root);
  return contract;
}

export function proveStitchOutageFallback({ repoDir = process.env.DIAL_REPO_DIR || process.cwd(), root = DEFAULT_CONTROL_HOME } = {}) {
  const route = selectCanonicalFrontendDesignProvider({ repoDir, providerHealth: { stitch: 'UNAVAILABLE' } });
  if (route.ok || route.selected != null || route.automatic_fallback !== false || route.outage_behavior !== 'WAIT_RETRY_OR_REPORT_UNAVAILABLE') {
    throw new Error('STITCH_OUTAGE_NO_SUBSTITUTION_NOT_PROVEN');
  }
  const repoSha = repositorySha(repoDir);
  if (!repoSha) throw new Error('STITCH_FALLBACK_REPOSITORY_SHA_UNAVAILABLE');
  const proof = proofWithHash({
    schema_version: 1,
    provider: 'google-stitch',
    repository_sha: repoSha,
    status: 'PASSED',
    simulated_provider_state: 'UNAVAILABLE',
    selected: null,
    automatic_fallback: false,
    outage_behavior: route.outage_behavior,
    reason: route.reason,
    selection_hash: route.selection_hash,
    runtime_dependency_created: false,
    provider_substitution_performed: false,
    acceptance_preserved: true,
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
