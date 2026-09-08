import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJson, writeJsonAtomic, appendJsonl } from './state-store.mjs';
import { HERMES_PREFERRED_CODEX_MODEL } from './hermes-plan-models.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const CACHE_REL = 'state/runtime-identity-cache.json';
export const DEFAULT_IDENTITY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function read(target) { try { return fs.readFileSync(target); } catch { return Buffer.from(''); } }
function command(command, args = []) {
  try { return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}
function executable(commandName) { return command('bash', ['-lc', `command -v ${commandName} || true`]); }

export function codexIdentityFingerprint({ repoDir = DEFAULT_REPO } = {}) {
  const codexPath = executable('codex');
  const hermesPath = process.env.DIAL_HERMES_BIN || executable('hermes');
  const configPath = path.join(process.env.HOME || '', '.hermes/config.yaml');
  const codePaths = [
    'agent-system/orchestration/codex-app-server-probe.mjs',
    'agent-system/orchestration/engineering-research-manager.mjs',
    'agent-system/orchestration/hermes-plan-models.mjs',
    'agent-system/orchestration/hermes-runtime-executor.mjs',
    'agent-system/orchestration/runtime-capacity-policy.mjs',
    'agent-system/orchestration/runtime-identity-cache.mjs',
    'agent-system/orchestration/runtime-health.mjs',
  ];
  const material = {
    schema_version: 1,
    requested_model: HERMES_PREFERRED_CODEX_MODEL,
    codex_path: codexPath,
    codex_version: codexPath ? command(codexPath, ['--version']) : '',
    codex_auth_route: command('codex', ['login', 'status']).includes('Logged in using ChatGPT') ? 'CHATGPT_OAUTH' : 'OTHER_OR_UNAVAILABLE',
    hermes_path: hermesPath,
    hermes_version: hermesPath ? command(hermesPath, ['--version']) : '',
    hermes_config_sha256: hash(read(configPath)),
    control_code: Object.fromEntries(codePaths.map((rel) => [rel, hash(read(path.join(repoDir, rel)))])),
  };
  return { algorithm: 'sha256-runtime-identity-v1', value: hash(JSON.stringify(material)), material };
}

export function loadRuntimeIdentityCache(root) {
  return readJson(CACHE_REL, { schema_version: 1, runtimes: {}, updated_at: null }, root);
}

export function cachedCodexIdentity({ repoDir = DEFAULT_REPO, root, nowMs = Date.now(), maxAgeMs = DEFAULT_IDENTITY_CACHE_MAX_AGE_MS } = {}) {
  const cache = loadRuntimeIdentityCache(root);
  const proof = cache.runtimes?.codex_app_server ?? null;
  if (!proof?.identity_proven || proof.requested_model !== HERMES_PREFERRED_CODEX_MODEL || proof.resolved_model !== HERMES_PREFERRED_CODEX_MODEL) return null;
  const observed = Date.parse(proof.observed_at ?? '');
  if (!Number.isFinite(observed) || nowMs - observed < 0 || nowMs - observed > maxAgeMs) return null;
  const current = codexIdentityFingerprint({ repoDir });
  if (proof.fingerprint?.algorithm !== current.algorithm || proof.fingerprint?.value !== current.value) return null;
  return proof;
}

export function recordCodexIdentityProof({ repoDir = DEFAULT_REPO, root, source, threadId = null, sessionId = null, observedAt = new Date().toISOString() } = {}) {
  const cache = loadRuntimeIdentityCache(root);
  const proof = {
    runtime: 'codex_app_server',
    requested_model: HERMES_PREFERRED_CODEX_MODEL,
    resolved_model: HERMES_PREFERRED_CODEX_MODEL,
    identity_proven: true,
    source: source || 'UNKNOWN',
    thread_id: threadId,
    session_id: sessionId,
    fingerprint: codexIdentityFingerprint({ repoDir }),
    observed_at: observedAt,
  };
  cache.schema_version = 1;
  cache.updated_at = new Date().toISOString();
  cache.runtimes = { ...(cache.runtimes || {}), codex_app_server: proof };
  writeJsonAtomic(CACHE_REL, cache, root);
  appendJsonl('events/runtime-identity.jsonl', { event: 'RUNTIME_IDENTITY_PROOF_CACHED', ...proof }, root);
  return proof;
}
