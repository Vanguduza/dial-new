#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildResearchCoverageManifest, buildResearchHarvestManifest, finalizeUnionAlphaResearchMission } from './vekl-research-harvest.mjs';
import { DEFAULT_CONTROL_HOME, readJson, writeJsonAtomic } from './state-store.mjs';
import { researchProviderStatus } from './providers/research/research-provider-router.mjs';

const ROOT = process.env.DIAL_RESEARCH_HARVEST_HOME || DEFAULT_CONTROL_HOME;
const REPO = process.env.DIAL_REPO_DIR || process.cwd();
const rel = 'knowledge/research/union-alpha/controller.json';
const now = () => new Date().toISOString();
function current() { return readJson(rel, null, ROOT); }
function save(value) { writeJsonAtomic(rel, { ...value, updated_at: now() }, ROOT); return current(); }
function create() {
  const manifest = buildResearchHarvestManifest({ repoDir: REPO, root: ROOT });
  const existing = current();
  if (existing?.mission_id === manifest.mission_id) return existing;
  return save({ schema_version: 1, mission_id: manifest.mission_id, manifest_hash: manifest.manifest_hash, repository_sha: manifest.repository_sha, state: 'CREATED', paused: false, retry_requests: [], created_at: now() });
}
function command(name, arg) {
  const state = current() || create();
  if (name === 'create') return state;
  if (name === 'status') return { ...state, provider_execution: researchProviderStatus({ root: ROOT }) };
  if (name === 'start' || name === 'resume') return save({ ...state, state: 'READY', paused: false, pause_reason: null });
  if (name === 'pause') return save({ ...state, state: 'PAUSED', paused: true, pause_reason: arg || 'operator request' });
  if (name === 'retry') return save({ ...state, retry_requests: [...new Set([...(state.retry_requests || []), arg || '*'])].sort(), state: state.paused ? 'PAUSED' : 'READY' });
  if (name === 'coverage') return buildResearchCoverageManifest({ repoDir: REPO, root: ROOT, missionId: state.mission_id, providerState: process.env.DIAL_UNION_ALPHA_PROVIDER_STATE || 'FREE_WINDOW_CLOSED' });
  if (name === 'verify') { const coverage = command('coverage'); return { state: coverage.provider_state === 'FREE_WINDOW_CLOSED' ? 'BLOCKED' : 'READY', checks: { canonical_units: coverage.units.length === 309, exact_model: coverage.model_id === 'stealth/union-alpha', free_window_open: coverage.provider_state !== 'FREE_WINDOW_CLOSED' }, coverage_manifest_hash: coverage.coverage_manifest_hash }; }
  if (name === 'admit') return finalizeUnionAlphaResearchMission({ repoDir: REPO, root: ROOT, missionId: state.mission_id });
  if (name === 'graph-compile' || name === 'capsule-build') return { state: 'REFUSED', reason: 'NO_VERIFIED_ADMITTED_RESEARCH', operation: name, mission_id: state.mission_id };
  if (name === 'certify') { const verification = command('verify'); return { schema_version: 1, certification: 'NOT_CERTIFIED', provider_state: 'FREE_WINDOW_CLOSED', worker_connectivity: fs.existsSync(process.env.DIAL_PRIVATE_MCP_URL_FILE || '/var/lib/dial-worker/secrets/private-mcp-url') ? 'CONFIGURED_NOT_PROBED' : 'BLOCKED_PRIVATE_MCP_URL_MISSING', repository_sha: state.repository_sha, mission_id: state.mission_id, verification, generated_at: now() }; }
  throw new Error(`unknown operation: ${name}`);
}

const operation = process.argv[2] || 'status';
const result = command(operation, process.argv[3]);
const outputFlag = process.argv.indexOf('--output');
if (outputFlag >= 0) {
  const target = path.resolve(process.argv[outputFlag + 1]);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
}
console.log(JSON.stringify(result, null, 2));
