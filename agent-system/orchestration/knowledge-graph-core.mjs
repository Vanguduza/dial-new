import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONTROL_HOME, ensureControlLayout, resolveControlPath, writeJsonAtomic } from './state-store.mjs';

export const KNOWLEDGE_POLICY_VERSION = 'vekl-2.2-rev2';
export const GRAPH_SCHEMA_VERSION = 'vekl-graph-1';
export const UNIT_SCHEMA_VERSION = 'vekl-unit-1';
export const AUTHORITY_PATHS = Object.freeze([
  'PROJECT_CANONICAL_STATE.json', 'PROJECT_TRUTH_PROTOCOL.md', 'agent-system/canon/PROJECT_TRUTH.md',
  'agent-system/registries/DECISION_LOG.json', 'agent-system/registries/FEATURE_REGISTRY.json',
  'docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json',
  'agent-system/registries/TECHNICAL_COHESION_AUTHORITY_REGISTRY.json',
]);

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}
export function stableJson(value) { return JSON.stringify(canonical(value)); }
export function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
export function hashObject(value) { return sha256(stableJson(value)); }
export function hashFile(file) { return sha256(fs.readFileSync(file)); }
export function readJsonFile(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { if (error?.code === 'ENOENT' && fallback !== null) return fallback; throw error; }
}
export function loadRegistry(repoDir, rel, fallback = null) { return readJsonFile(path.join(repoDir, rel), fallback); }
export function sourceRef(repoDir, rel) {
  const abs = path.join(repoDir, rel); return { stable_ref: rel, expected_content_hash: fs.existsSync(abs) ? hashFile(abs) : null };
}
export function projectTruthHash(repoDir) {
  const parts = AUTHORITY_PATHS.filter((rel) => fs.existsSync(path.join(repoDir, rel))).sort().map((rel) => [rel, hashFile(path.join(repoDir, rel))]);
  return hashObject({ authority_files: parts });
}
export function technicalStackFingerprint(repoDir) {
  const rels = ['package.json','package-lock.json','agent-system/registries/TECHNICAL_COHESION_AUTHORITY_REGISTRY.json'];
  return hashObject(rels.filter((r)=>fs.existsSync(path.join(repoDir,r))).sort().map((r)=>[r,hashFile(path.join(repoDir,r))]));
}
export function registryHash(repoDir, rel) { const abs = path.join(repoDir, rel); return fs.existsSync(abs) ? hashFile(abs) : sha256('MISSING:'+rel); }
export function now() { return new Date().toISOString(); }
export function safeId(value, label='id') { const v=String(value||''); if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,220}$/.test(v)) throw new Error(`invalid ${label}: ${value}`); return v; }
export function writeContentAddressedJson(relDir, value, { root = DEFAULT_CONTROL_HOME, prefix = 'obj' } = {}) {
  ensureControlLayout(root); const hash = hashObject(value); const id = `${prefix}-${hash}`; const rel = `${relDir}/${id}.json`; const abs = resolveControlPath(rel, root);
  if (fs.existsSync(abs)) { const existing = readJsonFile(abs); if (hashObject(existing) !== hash) throw new Error(`content-addressed collision: ${id}`); return { id, hash, rel, path: abs, created: false }; }
  writeJsonAtomic(rel, value, root); return { id, hash, rel, path: abs, created: true };
}
export function unitRegistryRows(repoDir) { const d=loadRegistry(repoDir,'agent-system/registries/DEVELOPMENT_UNIT_REGISTRY.json',{units:[]}); return Array.isArray(d)?d:(d.units||[]); }
export function findUnit(repoDir, id) { return unitRegistryRows(repoDir).find((u)=>u.unit_lineage_id===id || u.unit_revision_hash===id || (u.feature_ids||[]).includes(id)) || null; }
