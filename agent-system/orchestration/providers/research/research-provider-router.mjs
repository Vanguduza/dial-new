import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  UNION_ALPHA_DATA_CLASS,
  UNION_ALPHA_ROLES,
  runUnionAlphaResearchBatch,
  sanitizeUnionAlphaProviderPacket,
  validateUnionAlphaResult,
  gatherPublicEvidence,
} from '../openrouter/union-alpha-research-adapter.mjs';
import { DEFAULT_CONTROL_HOME, readJson, writeJsonAtomic, appendJsonl } from '../../state-store.mjs';

export const GROQ_RESEARCH_MODEL_ID = 'openai/gpt-oss-120b';
export const RESEARCH_PROVIDER_APPROVAL = 'operations/research/providers/groq-credential-approval.json';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const now = () => new Date().toISOString();
const sha = (value) => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const bounded = (value, max = 1200) => String(value ?? '').slice(0, max);

function approvedKey(root, env = process.env) {
  const approval = readJson(RESEARCH_PROVIDER_APPROVAL, null, root);
  const validUntil = approval?.valid_until ? Date.parse(approval.valid_until) : NaN;
  const approved = approval?.status === 'APPROVED' && approval?.provider === 'groq' &&
    approval?.credential_reference && (!Number.isFinite(validUntil) || validUntil > Date.now());
  if (!approved) return { approved: false, reason: 'APPROVED_CREDENTIAL_REQUIRED', approval: null, key: null };
  let key = env.GROQ_API_KEY || null;
  let source = key ? 'environment' : null;
  if (!key && env.GROQ_API_KEY_FILE) {
    const secrets = path.resolve(root, 'secrets');
    const target = path.resolve(env.GROQ_API_KEY_FILE);
    const controlSecret = target.startsWith(`${secrets}${path.sep}`);
    const workerLocalSecret = env.DIAL_HOST_ROLE === 'vekl-worker' &&
      approval.credential_reference === 'worker-local-groq-key' &&
      target === '/var/lib/dial-worker/secrets/groq-api.key';
    if (!controlSecret && !workerLocalSecret) return { approved: false, reason: 'CREDENTIAL_FILE_OUTSIDE_APPROVED_SECRET_BOUNDARY', approval: null, key: null };
    key = fs.readFileSync(target, 'utf8').trim();
    source = workerLocalSecret ? 'vekl_worker_local_key_file' : 'control_key_file';
  }
  if (!key) return { approved: false, reason: 'APPROVED_CREDENTIAL_NOT_CONFIGURED', approval: null, key: null };
  if (approval.zdr_required === true) {
    const marker = path.resolve(env.GROQ_ZDR_MARKER || '/var/lib/dial-worker/secrets/groq-zdr-enabled');
    const workerMarker = env.DIAL_HOST_ROLE === 'vekl-worker' && marker === '/var/lib/dial-worker/secrets/groq-zdr-enabled';
    if (!workerMarker || !fs.existsSync(marker) || fs.statSync(marker).size < 1) {
      return { approved: false, reason: 'GROQ_ZDR_MARKER_REQUIRED', approval: null, key: null };
    }
  }
  return { approved: true, reason: null, approval, key, source };
}

export function researchProviderStatus({ root = DEFAULT_CONTROL_HOME, env = process.env } = {}) {
  const groq = approvedKey(root, env);
  return {
    selection: 'PROVIDER_NEUTRAL_CREDENTIAL_GATED',
    active_provider: groq.approved ? 'groq' : null,
    active_model_id: groq.approved ? GROQ_RESEARCH_MODEL_ID : null,
    groq: { approved: groq.approved, reason: groq.reason, credential_source: groq.source || null, material_exposed: false },
    historical_union_alpha: { provider: 'openrouter', model_id: 'stealth/union-alpha', execution_state: 'CLOSED_NO_SUBSTITUTION', results_may_be_fabricated: false },
  };
}

function normalizeOpenWorldEvidence(evidence) {
  const official = (evidence?.official || []).slice(0, 3).map((row) => ({
    ref: row.url,
    url: row.url,
    content_type: row.content_type || null,
    sha256: row.sha256 || null,
    excerpt: bounded(row.excerpt || '', 1200),
  }));
  const exa = (evidence?.exa || []).slice(0, 1).map((row) => ({
    ref: 'exa:' + sha({ query: row.query, result: row.result }).slice(0, 24),
    query: bounded(row.query || '', 500),
    result: bounded(typeof row.result === 'string' ? row.result : JSON.stringify(row.result || {}), 1500),
  }));
  const context7 = (evidence?.context7 || []).slice(0, 1).map((row) => ({
    ref: 'context7:' + sha({ library_id: row.library_id, excerpt: row.excerpt }).slice(0, 24),
    technology: bounded(row.technology || '', 200),
    library_id: bounded(row.library_id || '', 500),
    excerpt: bounded(row.excerpt || '', 1200),
  }));
  const refs = [...official, ...exa, ...context7].map((row) => row.ref);
  return {
    official,
    exa,
    context7,
    retrieval_errors: (evidence?.retrieval_errors || []).slice(0, 8).map((row) => ({
      adapter: bounded(row.adapter || '', 120),
      error: bounded(row.error || '', 500),
    })),
    refs,
  };
}

function prompt(packet, openWorldEvidence = null) {
  const roles = Object.fromEntries(UNION_ALPHA_ROLES.map((role) => [role, {
    findings: [{ claim: 'evidence-backed claim', source_refs: ['one supplied evidence ref'], confidence: 0.8, freshness_note: 'current|version note|null' }],
    risks: ['concise risk'],
    recommendations: ['concise recommendation'],
    unknowns: ['explicit unknown if evidence is insufficient'],
  }]));
  return [
    'DIAL public engineering research. You are subordinate evidence, never product or architecture authority.',
    'Use only PUBLIC_RESEARCH_ONLY content. Never request or infer repository-private data, credentials, customer, payment, production, owner-control, or identifiable Health data.',
    'For open-world discovery report provenance, exact version/revision, freshness, contradictions, and candidate sources; discovery and trial never confer authority.',
    'For guided frontend work assess EXPLORE, CONVERGE, and RECONSTRUCT separately; preserve semantic invariants, apply declared freedom budgets, and provide evidence for all mandatory critics.',
    'For n8n distinguish the non-executable VEKL corpus from DEV and PROD runtimes; assess node provenance, secret/egress/database controls, event integrity, idempotency, and estate isolation.',
    'Do not invent citations or claim research was performed when evidence is absent. Every findings entry MUST be an object with claim, source_refs, confidence, and freshness_note. Every source_refs value MUST be one of the supplied source_hint ids/URLs or an open_world_evidence ref. If evidence is insufficient for a role, use findings: [] and put the limitation in unknowns.',
    'Treat Exa as discovery/corroboration unless its result points to an authoritative source. Context7 is documentation evidence, not product authority. Preserve contradictions rather than averaging them away.',
    'Be concise: at most one finding, one risk, one recommendation, and one unknown per role. Preserve all 18 roles even when evidence is thin.',
    'Return JSON only in this shape:',
    JSON.stringify({ schema_version: 1, batch_id: packet.batch_id, subjects: [{ subject_id: 'supplied subject_id', roles, cross_role_synthesis: { implementation_patterns: [], anti_patterns: [], verification_focus: [], unresolved_contradictions: [] } }], batch_contradictions: [] }),
    '--- SANITIZED PACKET ---',
    JSON.stringify(packet),
    '--- OPEN WORLD EVIDENCE ---',
    JSON.stringify(openWorldEvidence),
  ].join('\n');
}

function extractJson(value) {
  const text = String(value || '').trim();
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw Object.assign(new Error('RESEARCH_PROVIDER_INVALID_JSON'), { category: 'INVALID_OUTPUT' });
}

export async function runResearchBatch({ batch, bindings = [], repoDir, root = DEFAULT_CONTROL_HOME, fetchImpl = fetch, provider = 'auto', env = process.env } = {}) {
  if (provider === 'union-alpha') return runUnionAlphaResearchBatch({ batch, bindings, repoDir, root, fetchImpl });
  if (!['auto', 'groq'].includes(provider)) throw new Error(`RESEARCH_PROVIDER_UNSUPPORTED:${provider}`);
  const credential = approvedKey(root, env);
  if (!credential.approved) throw Object.assign(new Error(`GROQ_${credential.reason}`), { category: 'AUTH_REQUIRED' });
  const packet = sanitizeUnionAlphaProviderPacket(batch);
  const packetHash = sha(packet);
  const retrieved = await gatherPublicEvidence(packet, { repoDir, fetchImpl });
  const openWorldEvidence = normalizeOpenWorldEvidence(retrieved);
  const artifactRel = `knowledge/research/provider-neutral/artifacts/${packet.mission_id}/${packet.batch_id}.json`;
  const existing = readJson(artifactRel, null, root);
  if (existing?.provider_packet_hash === packetHash && existing?.evidence_hash) return { ...existing, idempotent_replay: true };
  const response = await fetchImpl(GROQ_URL, { method: 'POST', headers: { authorization: `Bearer ${credential.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: GROQ_RESEARCH_MODEL_ID, messages: [{ role: 'system', content: 'Return valid JSON only.' }, { role: 'user', content: prompt(packet, openWorldEvidence) }], response_format: { type: 'json_object' }, temperature: 0.15, reasoning_effort: 'low', max_completion_tokens: 4000 }) });
  const raw = await response.text();
  if (!response.ok) throw Object.assign(new Error(`GROQ_HTTP_${response.status}:${bounded(raw, 800)}`), { category: [401, 403].includes(response.status) ? 'AUTH_REQUIRED' : response.status === 429 ? 'CAPACITY_LIMITED' : 'PROVIDER_ERROR', detail: bounded(raw) });
  const payload = JSON.parse(raw);
  const result = extractJson(payload?.choices?.[0]?.message?.content);
  const check = validateUnionAlphaResult(result, packet, openWorldEvidence.refs);
  if (!check.ok) throw Object.assign(new Error(`RESEARCH_RESULT_REJECTED:${check.reason}`), { category: 'INVALID_OUTPUT' });
  const record = { schema_version: 1, authority: 'NON_AUTHORITATIVE_ENGINEERING_GUIDANCE', provider: 'groq', model_id: GROQ_RESEARCH_MODEL_ID, data_class: UNION_ALPHA_DATA_CLASS, provider_packet_hash: packetHash, mission_id: packet.mission_id, batch_id: packet.batch_id, batch_kind: packet.batch_kind, subject_bindings: bindings, open_world_evidence: openWorldEvidence, open_world_evidence_hash: sha(openWorldEvidence), request_hash: sha({ model: GROQ_RESEARCH_MODEL_ID, packet, open_world_evidence_hash: sha(openWorldEvidence) }), response_hash: sha(raw), result, usage: payload?.usage || null, credential_approval: { credential_reference: credential.approval.credential_reference, approval_id: credential.approval.approval_id || null }, completed_at: now() };
  record.evidence_hash = sha(record);
  if (env.DIAL_RESEARCH_DB_AUTHORITATIVE !== '1') {
    writeJsonAtomic(artifactRel, record, root);
    appendJsonl('events/engineering-research.jsonl', { event: 'RESEARCH_BATCH_COMPLETED', provider: 'groq', mission_id: packet.mission_id, batch_id: packet.batch_id, evidence_hash: record.evidence_hash, at: record.completed_at }, root);
  }
  return record;
}
