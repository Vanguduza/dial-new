import { hashObject } from './knowledge-graph-core.mjs';

const BAD = [['SCRIPT', /<script\b/i], ['EVENT_HANDLER', /\son[a-z]+\s*=/i], ['JAVASCRIPT_URL', /javascript:/i], ['EVAL', /\beval\s*\(|new\s+Function\s*\(/i], ['IFRAME', /<(?:iframe|object|embed)\b/i], ['META_REFRESH', /<meta[^>]+http-equiv=["']?refresh/i], ['SERVICE_WORKER', /serviceWorker\.register/i], ['WEBSOCKET', /\b(?:WebSocket|EventSource)\s*\(/i], ['CSS_IMPORT', /@import\s+/i], ['REMOTE_URL', /https?:\/\//i], ['SVG_SCRIPT', /<svg[\s\S]*?<script\b/i]];

export function quarantineDesignArtifact({ content, mimeType = 'text/html' } = {}) {
  const text = String(content ?? '');
  const violations = BAD.filter(([, r]) => r.test(text)).map(([id]) => id);
  return { ok: violations.length === 0, mime_type: mimeType, size_bytes: Buffer.byteLength(text), artifact_hash: hashObject(text), violations };
}

function stripCssImports(text) {
  const source = String(text ?? ''); let out = ''; let cursor = 0; const re = /@import\b/ig;
  while (true) {
    re.lastIndex = cursor; const match = re.exec(source);
    if (!match) { out += source.slice(cursor); break; }
    out += source.slice(cursor, match.index);
    let i = re.lastIndex; let quote = null; let depth = 0; let escaped = false;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '(') { depth += 1; continue; }
      if (ch === ')') { depth = Math.max(0, depth - 1); continue; }
      if (ch === ';' && depth === 0) { i += 1; break; }
      if ((ch === '\n' || ch === '\r') && depth === 0) break;
    }
    cursor = i;
  }
  return out;
}

export function sanitizeDesignArtifactForEvidence({ content, mimeType = 'text/html' } = {}) {
  const raw = String(content ?? ''); const rawQuarantine = quarantineDesignArtifact({ content: raw, mimeType });
  const inert = stripCssImports(raw).replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/<(?:iframe|object|embed)\b[\s\S]*?<\/(?:iframe|object|embed)\s*>/gi, '').replace(/<(?:iframe|object|embed)\b[^>]*\/?\s*>/gi, '').replace(/<meta\b[^>]*http-equiv=[\"']?refresh[^>]*>/gi, '').replace(/\s+on[a-z]+\s*=\s*(?:[\"'][^\"']*[\"']|[^\s>]+)/gi, '').replace(/\s+(?:src|href|action|formaction|poster)\s*=\s*([\"'])https?:\/\/[^\"']*\1/gi, '').replace(/\s+(?:src|href|action|formaction|poster)\s*=\s*https?:\/\/[^\s>]+/gi, '').replace(/url\(\s*([\"']?)https?:\/\/[^)]*\1\s*\)/gi, 'url("")').replace(/javascript:/gi, '').replace(/https?:\/\/[^\s<>'\")]+/gi, '');
  const sanitizedQuarantine = quarantineDesignArtifact({ content: inert, mimeType });
  return { ok: sanitizedQuarantine.ok, content: inert, raw_quarantine: rawQuarantine, sanitized_quarantine: sanitizedQuarantine, transformed: raw !== inert, transformation_hash: hashObject({ raw_artifact_hash: rawQuarantine.artifact_hash, sanitized_artifact_hash: sanitizedQuarantine.artifact_hash, policy: 'INERT_DESIGN_EVIDENCE_V1' }) };
}

// Guided generation sits upstream of this function and downstream of Product
// Truth projection (Rev 3.1 §2.1). Quarantine, manifests, admission and
// promotion are unchanged; the guided fields are additive and only present when
// a guided run supplies them, so every stored legacy candidate hash still
// reproduces exactly.
export function buildDesignCandidateManifest({
  taskId, providerId, unitLineageId, unitRevisionHash, designAuthorityProjectionHash, rawContent, quarantine,
  screenRefs = [], fdepHash = null, designBriefHash = null, changeBudgetHash = null, presentationDecisionHash = null, vrdeHash = null,
  screenQualityPacketHash = null, designIterationPhase = null, designProvenanceMode = null, productTruthHash = null,
} = {}) {
  if (!quarantine?.ok) throw new Error('PROVIDER_OUTPUT_QUARANTINE_FAILED');
  const base = {
    schema_version: 1,
    task_id: taskId,
    provider_id: providerId,
    unit_lineage_id: unitLineageId,
    unit_revision_hash: unitRevisionHash,
    design_authority_projection_hash: designAuthorityProjectionHash,
    frontend_design_execution_packet_hash: fdepHash,
    design_brief_bundle_hash: designBriefHash,
    change_budget_hash: changeBudgetHash,
    presentation_decision_hash: presentationDecisionHash,
    visual_render_determinism_envelope_hash: vrdeHash,
    raw_artifact_hash: hashObject(String(rawContent ?? '')),
    quarantine_evidence_hash: hashObject(quarantine),
    screen_refs: [...new Set(screenRefs)].sort(),
    security_state: 'PASS',
    authority_state: 'REVIEW_REQUIRED',
    authority: 'NON_AUTHORITATIVE_DESIGN_CANDIDATE',
  };
  const guided = screenQualityPacketHash === null && designIterationPhase === null && productTruthHash === null
    ? base
    : {
      ...base,
      screen_quality_packet_hash: screenQualityPacketHash,
      design_iteration_phase: designIterationPhase,
      design_provenance_mode: designProvenanceMode,
      product_truth_hash: productTruthHash,
    };
  return { ...guided, candidate_hash: hashObject(guided), candidate_id: `DESIGN-${hashObject(guided).slice(0, 24)}` };
}

export function admitDesignCandidate({
  candidate, authorityConforms, authorityConformanceMode = 'PROVIDER_REQUIRED', providerVisualConforms = null,
  requiredStatesPresent, stateCoverageMode = 'PROVIDER_REQUIRED', primaryCompositionPresent = null,
  externalReferenceNonAuthorityPreserved = null, donorSemanticsPreserved = null,
  designNormalizationEvidence = null, changeBudgetSatisfied = null, criticEvidence = null,
} = {}) {
  if (!candidate) throw new Error('candidate required');
  const failures = [];
  const deferred = stateCoverageMode === 'DOWNSTREAM_AEF_REQUIRED';
  const authorityDeferred = authorityConformanceMode === 'DOWNSTREAM_AEF_REQUIRED';
  if (!['PROVIDER_REQUIRED', 'DOWNSTREAM_AEF_REQUIRED'].includes(stateCoverageMode)) failures.push('STATE_COVERAGE_MODE_INVALID');
  if (!['PROVIDER_REQUIRED', 'DOWNSTREAM_AEF_REQUIRED'].includes(authorityConformanceMode)) failures.push('AUTHORITY_CONFORMANCE_MODE_INVALID');
  if (!authorityDeferred && authorityConforms !== true) failures.push('DESIGN_AUTHORITY_DRIFT');
  if (authorityDeferred && !candidate.frontend_design_execution_packet_hash) failures.push('AUTHORITY_DEFER_REQUIRES_FDEP');
  if (authorityDeferred && providerVisualConforms !== true) failures.push('PROVIDER_VISUAL_CONFORMANCE_REQUIRED');
  if (!deferred && requiredStatesPresent !== true) failures.push('REQUIRED_STATES_MISSING');
  if (deferred && !candidate.frontend_design_execution_packet_hash) failures.push('STATE_COVERAGE_DEFER_REQUIRES_FDEP');
  if (deferred && primaryCompositionPresent !== true) failures.push('PRIMARY_COMPOSITION_REQUIRED');
  const externalReferenceBoundaryOk = externalReferenceNonAuthorityPreserved ?? (donorSemanticsPreserved === null ? true : donorSemanticsPreserved);
  if (externalReferenceBoundaryOk !== true) failures.push('EXTERNAL_REFERENCE_NON_AUTHORITY_VIOLATION');
  if (candidate.frontend_design_execution_packet_hash && designNormalizationEvidence?.status !== 'NORMALIZED') failures.push('DESIGN_NORMALIZATION_REQUIRED');
  if (candidate.change_budget_hash && changeBudgetSatisfied !== true) failures.push('CHANGE_BUDGET_NOT_SATISFIED');
  // A guided candidate carries critic evidence, and a critic rejection is
  // binding: structural conformance alone cannot admit a degraded screen.
  if (candidate.screen_quality_packet_hash) {
    if (!criticEvidence?.evidence_hash) failures.push('CRITIC_EVIDENCE_REQUIRED_FOR_GUIDED_CANDIDATE');
    else {
      if (criticEvidence.candidate_id !== candidate.candidate_id) failures.push('CRITIC_EVIDENCE_CANDIDATE_MISMATCH');
      if (criticEvidence.verdict === 'REJECT') failures.push('CRITIC_REJECTION_BINDING');
    }
  }
  if (failures.length) return { ok: false, failures };
  const base = {
    schema_version: 1,
    candidate_id: candidate.candidate_id,
    candidate_hash: candidate.candidate_hash,
    unit_lineage_id: candidate.unit_lineage_id,
    unit_revision_hash: candidate.unit_revision_hash,
    design_authority_projection_hash: candidate.design_authority_projection_hash,
    frontend_design_execution_packet_hash: candidate.frontend_design_execution_packet_hash || null,
    design_normalization_evidence_hash: designNormalizationEvidence?.content_hash || null,
    accepted_screen_refs: candidate.screen_refs,
    state_coverage_mode: stateCoverageMode,
    required_states_present_at_admission: requiredStatesPresent === true,
    downstream_state_certification_required: deferred,
    authority_conformance_mode: authorityConformanceMode,
    authority_conforms_at_admission: authorityConforms === true,
    downstream_authority_certification_required: authorityDeferred,
    accepted_at: new Date().toISOString(),
  };
  const guided = candidate.screen_quality_packet_hash
    ? { ...base, screen_quality_packet_hash: candidate.screen_quality_packet_hash, design_iteration_phase: candidate.design_iteration_phase, critic_evidence_hash: criticEvidence.evidence_hash }
    : base;
  return { ok: true, manifest: { ...guided, manifest_hash: hashObject({ ...guided, accepted_at: null }) } };
}
