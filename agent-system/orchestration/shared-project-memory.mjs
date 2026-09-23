import fs from 'node:fs';
import path from 'node:path';
import {
  appendJsonl,
  DEFAULT_CONTROL_HOME,
  ensureControlLayout,
  readJson,
  resolveControlPath,
  writeJsonAtomic,
} from './state-store.mjs';
import { assertNoSecretMaterial } from './feature-memory.mjs';
import { hashObject, safeId, writeContentAddressedJson } from './knowledge-graph-core.mjs';

const TYPES = new Set([
  'OWNER_INSTRUCTION',
  'DECISION_NOTE',
  'CHECKPOINT',
  'HANDOFF',
  'REVIEW',
  'RISK',
  'FAILURE',
  'IMPLEMENTATION_NOTE',
  'RESEARCH_NOTE',
  'SESSION_NOTE',
  'TEST_EVIDENCE',
]);
const TIERS = new Set(['HOT', 'WARM', 'COLD']);
const ADMISSION_AUTHORITIES = new Set(['OWNER_EXPLICIT', 'VERIFIED_SYSTEM', 'HERMES_RECONCILED']);
const MAX_TEXT = 12000;
const MAX_REFS = 40;
const MAX_INDEX = 4000;
const SPMRF_SECRET_PATTERNS = [
  /\b(?:api[_-]?key|secret[_-]?key|client[_-]?secret|private[_-]?token)\s*[=:]\s*["']?[^\s"'{}]{8,}/i,
  /\b(?:token|credential)\s*[=:]\s*["']?[A-Za-z0-9._~+\/-]{16,}/i,
];

function assertSharedMemorySafe(value, label = 'shared project memory') {
  assertNoSecretMaterial(value, label);
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  for (const pattern of SPMRF_SECRET_PATTERNS) {
    if (pattern.test(text)) throw new Error(`${label} rejected: possible secret material`);
  }
  return value;
}

function now() { return new Date().toISOString(); }
function bounded(value, max = MAX_TEXT) {
  const text = String(value ?? '').replace(/\u0000/g, '').trim();
  if (!text) return '';
  assertSharedMemorySafe(text, 'shared project memory');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
function cleanRefs(refs) {
  return Array.isArray(refs)
    ? refs.slice(0, MAX_REFS).map((x) => bounded(x, 700)).filter(Boolean)
    : [];
}
function projectSlug(project) {
  return safeId(String(project || '').toLowerCase().replace(/[^a-z0-9._:-]+/g, '-'), 'project');
}
function indexRel(project) { return `shared-memory/index/${projectSlug(project)}.json`; }
function lockPath(project, root) { return resolveControlPath(`shared-memory/index/.${projectSlug(project)}.lock`, root); }

function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

function withProjectLock(project, root, fn) {
  ensureControlLayout(root);
  const lock = lockPath(project, root);
  const started = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(lock, { mode: 0o700 });
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (Date.now() - started > 2500) throw new Error(`shared memory lock timeout: ${project}`);
      sleepSync(25);
    }
  }
  try { return fn(); }
  finally { try { fs.rmdirSync(lock); } catch {} }
}

export function loadSharedMemoryIndex(project, root = DEFAULT_CONTROL_HOME) {
  const slug = projectSlug(project);
  return readJson(indexRel(slug), {
    schema_version: 1,
    project: slug,
    sequence: 0,
    last_event_hash: null,
    entries: [],
    updated_at: null,
  }, root);
}

function updateIndex(project, entry, root) {
  return withProjectLock(project, root, () => {
    const index = loadSharedMemoryIndex(project, root);
    const sequence = Number(index.sequence || 0) + 1;
    const row = {
      sequence,
      memory_id: entry.memory_id,
      content_hash: entry.content_hash,
      admission_state: entry.admission_state,
      tier: entry.tier,
      type: entry.type,
      feature_id: entry.feature_id ?? null,
      source_harness: entry.source_harness ?? null,
      recorded_at: entry.recorded_at,
      object_rel: entry.object_rel,
    };
    const eventHash = hashObject({ previous: index.last_event_hash, row });
    index.sequence = sequence;
    index.last_event_hash = eventHash;
    index.entries = [...(index.entries || []), row].slice(-MAX_INDEX);
    index.updated_at = now();
    writeJsonAtomic(indexRel(project), index, root);
    appendJsonl('events/shared-project-memory.jsonl', {
      event: 'SHARED_MEMORY_INDEXED',
      project: projectSlug(project),
      sequence,
      memory_id: entry.memory_id,
      admission_state: entry.admission_state,
      event_hash: eventHash,
      at: index.updated_at,
    }, root);
    return { sequence, event_hash: eventHash, index };
  });
}

export function sharedMemoryCursor(project, root = DEFAULT_CONTROL_HOME) {
  const index = loadSharedMemoryIndex(project, root);
  return {
    project: index.project,
    sequence: Number(index.sequence || 0),
    last_event_hash: index.last_event_hash ?? null,
    updated_at: index.updated_at ?? null,
  };
}

export function writeMemoryCandidate({
  project,
  featureId = null,
  tier = 'WARM',
  type = 'IMPLEMENTATION_NOTE',
  text,
  refs = [],
  sourceHarness,
  sessionRef = null,
  repositorySha = null,
  checkpointId = null,
  metadata = {},
} = {}, root = DEFAULT_CONTROL_HOME) {
  const slug = projectSlug(project);
  const resolvedTier = String(tier || 'WARM').toUpperCase();
  const resolvedType = String(type || 'IMPLEMENTATION_NOTE').toUpperCase();
  if (!TIERS.has(resolvedTier)) throw new Error(`unsupported memory tier: ${tier}`);
  if (!TYPES.has(resolvedType)) throw new Error(`unsupported memory type: ${type}`);
  const bodyText = bounded(text);
  if (!bodyText) throw new Error('shared memory text is required');
  assertSharedMemorySafe(metadata, 'shared project memory metadata');

  const record = {
    schema_version: 1,
    project: slug,
    feature_id: featureId ? bounded(featureId, 180) : null,
    tier: resolvedTier,
    type: resolvedType,
    text: bodyText,
    refs: cleanRefs(refs),
    source_harness: bounded(sourceHarness || 'unknown', 180),
    session_ref: sessionRef ? bounded(sessionRef, 300) : null,
    repository_sha: repositorySha ? bounded(repositorySha, 80) : null,
    checkpoint_id: checkpointId ? bounded(checkpointId, 180) : null,
    metadata,
    admission_state: 'CANDIDATE',
    project_authority: 'NON_AUTHORITATIVE_CONTEXT',
    recorded_at: now(),
  };
  const stored = writeContentAddressedJson('shared-memory/candidates', record, { root, prefix: 'memory-candidate' });
  const memoryId = `mem-${stored.hash}`;
  const indexed = {
    ...record,
    memory_id: memoryId,
    content_hash: stored.hash,
    object_rel: stored.rel,
  };
  updateIndex(slug, indexed, root);
  return indexed;
}

export function admitMemoryCandidate({
  project,
  candidateRel,
  admissionAuthority,
  evidenceRefs = [],
  reconciliation = null,
} = {}, root = DEFAULT_CONTROL_HOME) {
  const slug = projectSlug(project);
  const authority = String(admissionAuthority || '').toUpperCase();
  if (!ADMISSION_AUTHORITIES.has(authority)) {
    throw new Error(`unsupported shared memory admission authority: ${admissionAuthority}`);
  }
  const candidate = readJson(candidateRel, null, root);
  if (!candidate || candidate.project !== slug || candidate.admission_state !== 'CANDIDATE') {
    throw new Error('shared memory candidate missing or project mismatch');
  }
  assertSharedMemorySafe(reconciliation, 'shared memory reconciliation');
  const admitted = {
    ...candidate,
    candidate_rel: candidateRel,
    admission_state: 'ADMITTED',
    admission_authority: authority,
    admission_evidence_refs: cleanRefs(evidenceRefs),
    reconciliation: reconciliation ? bounded(reconciliation, 4000) : null,
    admitted_at: now(),
    project_authority: 'NON_AUTHORITATIVE_CONTEXT',
  };
  const stored = writeContentAddressedJson('shared-memory/admitted', admitted, { root, prefix: 'memory-admitted' });
  const indexed = {
    ...admitted,
    memory_id: `mem-${stored.hash}`,
    content_hash: stored.hash,
    object_rel: stored.rel,
  };
  updateIndex(slug, indexed, root);
  return indexed;
}

function tokens(value) {
  return new Set(String(value || '').toLowerCase().match(/[a-z0-9_.:-]{2,}/g) || []);
}
function score(queryTokens, entry, record) {
  const hay = tokens([
    entry.type,
    entry.tier,
    entry.feature_id,
    entry.source_harness,
    record?.text,
    ...(record?.refs || []),
  ].filter(Boolean).join(' '));
  let overlap = 0;
  for (const token of queryTokens) if (hay.has(token)) overlap += 1;
  return queryTokens.size ? overlap / queryTokens.size : 0;
}

export function searchSharedMemory({
  project,
  query = '',
  featureId = null,
  tiers = ['HOT', 'WARM', 'COLD'],
  admittedOnly = true,
  limit = 20,
} = {}, root = DEFAULT_CONTROL_HOME) {
  const index = loadSharedMemoryIndex(project, root);
  const allowedTiers = new Set(tiers.map((x) => String(x).toUpperCase()));
  const queryTokens = tokens(query);
  const rows = [];
  for (const entry of [...(index.entries || [])].reverse()) {
    if (!allowedTiers.has(entry.tier)) continue;
    if (featureId && entry.feature_id !== featureId) continue;
    if (admittedOnly && entry.admission_state !== 'ADMITTED') continue;
    const record = readJson(entry.object_rel, null, root);
    if (!record) continue;
    const lexical = score(queryTokens, entry, record);
    if (queryTokens.size && lexical === 0) continue;
    rows.push({ ...entry, record, lexical_score: Number(lexical.toFixed(6)) });
  }
  rows.sort((a, b) => b.lexical_score - a.lexical_score || b.sequence - a.sequence);
  return {
    project: projectSlug(project),
    query: bounded(query, 1000),
    cursor: sharedMemoryCursor(project, root),
    results: rows.slice(0, Math.max(1, Math.min(Number(limit) || 20, 100))),
    authority: 'NON_AUTHORITATIVE_CONTEXT',
  };
}

export function readSharedMemoryObject(rel, root = DEFAULT_CONTROL_HOME) {
  const value = readJson(rel, null, root);
  if (!value) return null;
  assertSharedMemorySafe(value, 'shared memory object');
  return value;
}
