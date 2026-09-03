import fs from 'node:fs';
import path from 'node:path';
import { appendJsonl, DEFAULT_CONTROL_HOME, ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';

const FEATURE_RE = /^[A-Z][A-Z0-9_-]*-F\d{3}$/;
const TYPES = new Set(['DECISION', 'RISK', 'FAILURE', 'REVIEW', 'HANDOFF', 'NOTE']);
const MAX_TEXT = 2000;
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/i,
  /\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|CODEX_API_KEY|SUPABASE_SERVICE_ROLE_KEY)\s*[=:]\s*\S+/i,
  /\bpassword\s*[=:]\s*\S+/i,
];

function assertFeatureId(featureId) {
  if (!FEATURE_RE.test(String(featureId || ''))) throw new Error(`invalid Feature ID for memory: ${featureId}`);
  return featureId;
}

function bounded(value) {
  const text = String(value ?? '').replace(/\u0000/g, '').trim();
  if (!text) throw new Error('feature memory text is required');
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) throw new Error('feature memory rejected: possible secret material');
  }
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

function featureDir(featureId) {
  return `memory/features/${assertFeatureId(featureId)}`;
}

export function appendFeatureMemory(featureId, { type = 'NOTE', text, refs = [], source = null, manager = null } = {}, root = DEFAULT_CONTROL_HOME) {
  if (!TYPES.has(type)) throw new Error(`unsupported feature memory type: ${type}`);
  const record = {
    schema_version: 1,
    feature_id: assertFeatureId(featureId),
    type,
    text: bounded(text),
    refs: Array.isArray(refs) ? refs.slice(0, 20).map((r) => String(r).slice(0, 500)) : [],
    source: source ? String(source).slice(0, 500) : null,
    manager,
    recorded_at: new Date().toISOString(),
    authority: 'NON_AUTHORITATIVE_CONTEXT',
  };
  appendJsonl(`${featureDir(featureId)}/events.jsonl`, record, root);
  writeJsonAtomic(`${featureDir(featureId)}/latest.json`, record, root);
  return record;
}

export function readFeatureMemory(featureId, { limit = 30 } = {}, root = DEFAULT_CONTROL_HOME) {
  ensureControlLayout(root);
  const target = resolveControlPath(`${featureDir(featureId)}/events.jsonl`, root);
  let lines = [];
  try { lines = fs.readFileSync(target, 'utf8').split('\n').filter(Boolean); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const records = [];
  for (const line of lines.slice(-Math.max(1, Math.min(limit, 100)))) {
    try { records.push(JSON.parse(line)); } catch {}
  }
  return {
    feature_id: featureId,
    summary: readJson(`${featureDir(featureId)}/summary.json`, null, root),
    records,
    authority: 'NON_AUTHORITATIVE_CONTEXT',
  };
}

export function updateFeatureSummary(featureId, summary, root = DEFAULT_CONTROL_HOME) {
  const value = {
    schema_version: 1,
    feature_id: assertFeatureId(featureId),
    summary: bounded(summary),
    updated_at: new Date().toISOString(),
    authority: 'NON_AUTHORITATIVE_CONTEXT',
  };
  writeJsonAtomic(`${featureDir(featureId)}/summary.json`, value, root);
  return value;
}

export function compactFeatureMemory(featureId, { keep = 120 } = {}, root = DEFAULT_CONTROL_HOME) {
  const targetRel = `${featureDir(featureId)}/events.jsonl`;
  const target = resolveControlPath(targetRel, root);
  let lines;
  try { lines = fs.readFileSync(target, 'utf8').split('\n').filter(Boolean); } catch (error) {
    if (error?.code === 'ENOENT') return { feature_id: featureId, compacted: false, entries: 0 };
    throw error;
  }
  if (lines.length <= keep) return { feature_id: featureId, compacted: false, entries: lines.length };
  const archiveLines = lines.slice(0, -keep);
  const hotLines = lines.slice(-keep);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const coldRel = `memory/cold/${assertFeatureId(featureId)}/${stamp}.jsonl`;
  const cold = resolveControlPath(coldRel, root);
  fs.mkdirSync(path.dirname(cold), { recursive: true, mode: 0o700 });
  fs.writeFileSync(cold, `${archiveLines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(target, `${hotLines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  return { feature_id: featureId, compacted: true, archived: archiveLines.length, retained: hotLines.length, cold_path: coldRel };
}
