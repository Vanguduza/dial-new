import crypto from 'node:crypto';
import { HAIF_EVIDENCE_AUTHORITY } from './authority-gate.mjs';

export const HAIF_EVIDENCE_SCHEMA_VERSION = 1;

function now() { return new Date().toISOString(); }
function sha(value) { return crypto.createHash('sha256').update(String(value ?? '')).digest('hex'); }
function clean(value, max = 12000) { return String(value ?? '').trim().slice(0, max); }

export function parseStructuredAuxiliaryOutput(content) {
  const text = clean(content, 200_000);
  if (!text) throw new Error('HAIF model returned empty output');
  let parsed;
  try { parsed = JSON.parse(text); }
  catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (!match) throw new Error('HAIF model output is not valid structured JSON');
    try { parsed = JSON.parse(match[1]); } catch { throw new Error('HAIF fenced model output is not valid JSON'); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('HAIF structured output must be an object');
  const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
  const contradictions = Array.isArray(parsed.contradictions) ? parsed.contradictions : [];
  const unknowns = Array.isArray(parsed.unknowns) ? parsed.unknowns : [];
  const followups = Array.isArray(parsed.recommended_followups) ? parsed.recommended_followups : [];
  return { claims, contradictions, unknowns, recommended_followups: followups };
}
function normalizeClaim(item, allowedRefs) {
  const raw = typeof item === 'string' ? { claim: item } : item;
  if (!raw || typeof raw !== 'object') throw new Error('HAIF claim must be a string or object');
  const claim = clean(raw.claim ?? raw.text, 8000);
  if (!claim) throw new Error('HAIF claim text is required');
  const refs = Array.isArray(raw.evidence_refs) ? raw.evidence_refs.map((x) => clean(x, 500)).filter(Boolean) : [];
  if (allowedRefs.size && refs.some((ref) => !allowedRefs.has(ref))) throw new Error('HAIF claim references evidence outside the admitted input set');
  const confidence = Number(raw.confidence);
  return {
    claim,
    claim_key: clean(raw.claim_key, 500) || null,
    evidence_refs: refs,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
    status: 'UNVERIFIED',
  };
}

export function buildEvidencePacket({ task, route, catalogSnapshotId, usageSnapshotId, inputEvidenceRefs = [], inputHash, content, usage = {}, latencyMs = null, verificationState = 'NEEDS_GATE' }) {
  const structured = parseStructuredAuxiliaryOutput(content);
  const allowedRefs = new Set(inputEvidenceRefs.map(String));
  const claims = structured.claims.map((item) => normalizeClaim(item, allowedRefs));
  return {
    schema_version: HAIF_EVIDENCE_SCHEMA_VERSION,
    task_id: task.task_id,
    attempt_id: task.attempt_id,
    project: task.project,
    task_archetype: task.task_archetype,
    authority: HAIF_EVIDENCE_AUTHORITY,
    model: route.model_id,
    route_provider: route.route_provider ?? 'xkiro',
    provider_family: route.provider_family ?? null,
    model_lineage_id: route.model_lineage_id ?? null,
    independence_class: route.independence_class ?? 'UNKNOWN',
    catalog_snapshot_id: catalogSnapshotId,
    usage_snapshot_id: usageSnapshotId,
    input_evidence_refs: [...allowedRefs],
    input_hash: inputHash || sha(JSON.stringify(inputEvidenceRefs)),
    claims,
    contradictions: structured.contradictions,
    unknowns: structured.unknowns.map((x) => clean(x, 4000)).filter(Boolean),
    recommended_followups: structured.recommended_followups.map((x) => clean(x, 4000)).filter(Boolean),
    input_tokens: Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0,
    output_tokens: Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0,
    latency_ms: latencyMs,
    verification_state: verificationState,
    created_at: now(),
  };
}
