import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_CONTROL_HOME,
  readJson,
  resolveControlPath,
  writeJsonAtomic,
} from './state-store.mjs';
import { loadSharedMemoryIndex, readSharedMemoryObject } from './shared-project-memory.mjs';

const DEFAULT_ENDPOINT = 'http://127.0.0.1:1933';
const DEFAULT_USER = 'default';
const MAX_CONTEXT_TOKENS = 6000;

function slug(value, label = 'value') {
  const out = String(value || '').toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9][a-z0-9._:-]{0,220}$/.test(out)) throw new Error(`invalid ${label}: ${value}`);
  return out;
}
function cleanUser(value) {
  const out = String(value || DEFAULT_USER).trim();
  if (!/^[A-Za-z0-9._:@+-]{1,180}$/.test(out)) throw new Error('invalid OpenViking user id');
  return out;
}
function config(root = DEFAULT_CONTROL_HOME, env = process.env) {
  const endpoint = String(env.DIAL_OPENVIKING_ENDPOINT || DEFAULT_ENDPOINT).replace(/\/+$/, '');
  const user = cleanUser(env.DIAL_OPENVIKING_USER || DEFAULT_USER);
  const keyFile = env.DIAL_OPENVIKING_API_KEY_FILE || resolveControlPath('secrets/openviking-root-api.key', root);
  let apiKey = String(env.DIAL_OPENVIKING_API_KEY || '').trim();
  if (!apiKey && fs.existsSync(keyFile)) apiKey = fs.readFileSync(keyFile, 'utf8').trim();
  return { endpoint, user, apiKey, keyFile };
}
function headers(cfg) {
  const out = {
    'Content-Type': 'application/json',
    'User-Agent': 'dial-spmrf-openviking/1',
  };
  const authMode = String(process.env.DIAL_OPENVIKING_AUTH_MODE || 'api_key').toLowerCase();
  if (cfg.apiKey) {
    out.Authorization = `Bearer ${cfg.apiKey}`;
    out['X-API-Key'] = cfg.apiKey;
  }
  if (authMode === 'trusted') {
    out['X-OpenViking-Account'] = process.env.DIAL_OPENVIKING_ACCOUNT || 'default';
    out['X-OpenViking-User'] = cfg.user;
  }
  return out;
}
async function request(pathname, { method = 'GET', body = null, root = DEFAULT_CONTROL_HOME, timeoutMs = 7000 } = {}) {
  const cfg = config(root);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${cfg.endpoint}${pathname}`, {
      method,
      headers: headers(cfg),
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text.slice(0, 2000) }; }
    if (!response.ok) {
      const error = new Error(`OpenViking HTTP ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}
export function openVikingProjectRoot(project, root = DEFAULT_CONTROL_HOME) {
  const cfg = config(root);
  return `viking://user/${cfg.user}/memories/dial-projects/${slug(project, 'project')}`;
}
function projectionRel(project) {
  return `openviking/projection/${slug(project, 'project')}.json`;
}
export function openVikingProjectionStatus(project, root = DEFAULT_CONTROL_HOME) {
  return readJson(projectionRel(project), {
    schema_version: 1,
    project: slug(project, 'project'),
    last_scanned_sequence: 0,
    last_projected_sequence: 0,
    projected_count: 0,
    failed_count: 0,
    last_error: null,
    updated_at: null,
  }, root);
}
async function ensureProjectionRoot(project, root = DEFAULT_CONTROL_HOME) {
  const cfg = config(root);
  const base = `viking://user/${cfg.user}/memories/dial-projects`;
  const target = openVikingProjectRoot(project, root);
  for (const [uri, description] of [
    [base, 'DIAL governed project-memory semantic projections'],
    [target, `DIAL project semantic projection: ${slug(project, 'project')}`],
  ]) {
    try {
      await request('/api/v1/fs/mkdir', {
        method: 'POST',
        root,
        timeoutMs: 10000,
        body: { uri, description },
      });
    } catch (error) {
      if (![400, 409].includes(Number(error?.status))) throw error;
    }
  }
  return target;
}

function projectionDocument(entry, record) {
  return [
    '---',
    'dial_projection: spmrf_admitted_memory',
    `project: ${record.project}`,
    `memory_id: ${entry.memory_id}`,
    `sequence: ${entry.sequence}`,
    `tier: ${record.tier}`,
    `type: ${record.type}`,
    `admission_authority: ${record.admission_authority || 'UNKNOWN'}`,
    `repository_sha: ${record.repository_sha || ''}`,
    `recorded_at: ${record.recorded_at || ''}`,
    `admitted_at: ${record.admitted_at || ''}`,
    'project_authority: NON_AUTHORITATIVE_CONTEXT',
    '---',
    '',
    record.text,
    '',
    record.refs?.length ? 'Evidence / references:' : '',
    ...(record.refs || []).map((ref) => `- ${ref}`),
    '',
    'Authority rule: this is a semantic projection of already-admitted DIAL shared memory. It cannot override Project Truth, repository evidence, registries, VEKL, or the source SPMRF record.',
    '',
  ].filter((line) => line !== '').join('\n');
}
export async function openVikingHealth({ root = DEFAULT_CONTROL_HOME } = {}) {
  const started = Date.now();
  try {
    const payload = await request('/health', { root, timeoutMs: 3500 });
    return { available: true, latency_ms: Date.now() - started, payload };
  } catch (error) {
    return { available: false, latency_ms: Date.now() - started, error: String(error?.message || error) };
  }
}
export async function projectAdmittedMemoryToOpenViking({
  project,
  root = DEFAULT_CONTROL_HOME,
  limit = 100,
} = {}) {
  const projectId = slug(project, 'project');
  const index = loadSharedMemoryIndex(projectId, root);
  const state = openVikingProjectionStatus(projectId, root);
  const targetRoot = await ensureProjectionRoot(projectId, root);
  const pending = (index.entries || [])
    .filter((entry) => Number(entry.sequence) > Number(state.last_scanned_sequence || 0))
    .slice(0, Math.max(1, Math.min(Number(limit) || 100, 500)));
  let projected = 0;
  let scanned = Number(state.last_scanned_sequence || 0);
  let lastProjected = Number(state.last_projected_sequence || 0);
  for (const entry of pending) {
    scanned = Math.max(scanned, Number(entry.sequence) || 0);
    if (entry.admission_state !== 'ADMITTED') continue;
    const record = readSharedMemoryObject(entry.object_rel, root);
    if (!record || record.admission_state !== 'ADMITTED') continue;
    const uri = `${targetRoot}/${String(entry.sequence).padStart(8, '0')}-${entry.memory_id}.md`;
    try {
      await request('/api/v1/content/write', {
        method: 'POST',
        root,
        timeoutMs: 20000,
        body: {
          uri,
          content: projectionDocument(entry, record),
          mode: 'replace',
          wait: false,
          tags: [
            `project=${projectId}`,
            'source=spmrf',
            'authority=non_authoritative_context',
            `tier=${String(record.tier || '').toLowerCase()}`,
            `type=${String(record.type || '').toLowerCase()}`,
          ],
          tag_mode: 'replace',
        },
      });
      projected += 1;
      lastProjected = Number(entry.sequence) || lastProjected;
      const next = {
        ...state,
        last_scanned_sequence: scanned,
        last_projected_sequence: lastProjected,
        projected_count: Number(state.projected_count || 0) + projected,
        last_error: null,
        updated_at: new Date().toISOString(),
      };
      writeJsonAtomic(projectionRel(projectId), next, root);
    } catch (error) {
      const failed = {
        ...state,
        last_scanned_sequence: Number(state.last_scanned_sequence || 0),
        last_projected_sequence: lastProjected,
        failed_count: Number(state.failed_count || 0) + 1,
        last_error: String(error?.message || error).slice(0, 1000),
        updated_at: new Date().toISOString(),
      };
      writeJsonAtomic(projectionRel(projectId), failed, root);
      return { ok: false, project: projectId, projected, pending: pending.length, status: failed };
    }
  }
  const finalState = {
    ...state,
    last_scanned_sequence: scanned,
    last_projected_sequence: lastProjected,
    projected_count: Number(state.projected_count || 0) + projected,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  writeJsonAtomic(projectionRel(projectId), finalState, root);
  return { ok: true, project: projectId, projected, pending: pending.length, status: finalState };
}
function contextText(payload) {
  const result = payload?.result;
  if (typeof result === 'string') return result;
  if (typeof result?.context === 'string') return result.context;
  if (typeof result?.text === 'string') return result.text;
  return result == null ? '' : JSON.stringify(result);
}
export async function searchOpenVikingProjectContext({
  project,
  query,
  root = DEFAULT_CONTROL_HOME,
  maxTokens = 2400,
  sessionId = null,
} = {}) {
  const projectId = slug(project, 'project');
  const projection = openVikingProjectionStatus(projectId, root);
  if (!projection.last_projected_sequence) {
    return {
      available: false,
      reason: 'NO_ADMITTED_MEMORY_PROJECTED',
      project: projectId,
      projection,
      authority: 'NON_AUTHORITATIVE_SEMANTIC_PROJECTION',
      context: '',
    };
  }
  try {
    const payload = await request('/api/v1/search/search', {
      method: 'POST',
      root,
      timeoutMs: 10000,
      body: {
        query: String(query || '').slice(0, 2000),
        mode: 'context',
        target_uri: openVikingProjectRoot(projectId, root),
        purpose: 'coding',
        max_tokens: Math.max(256, Math.min(Number(maxTokens) || 2400, MAX_CONTEXT_TOKENS)),
        query_expansion: 'auto',
        ...(sessionId ? { session_id: String(sessionId).slice(0, 180), dedup_turns: 5 } : {}),
      },
    });
    return {
      available: true,
      project: projectId,
      projection,
      authority: 'NON_AUTHORITATIVE_SEMANTIC_PROJECTION',
      target_uri: openVikingProjectRoot(projectId, root),
      context: contextText(payload).slice(0, 32000),
    };
  } catch (error) {
    return {
      available: false,
      reason: 'OPENVIKING_UNAVAILABLE',
      project: projectId,
      projection,
      authority: 'NON_AUTHORITATIVE_SEMANTIC_PROJECTION',
      context: '',
      error: String(error?.message || error).slice(0, 1000),
    };
  }
}
export function discoverProjectionProjects(root = DEFAULT_CONTROL_HOME) {
  const dir = resolveControlPath('shared-memory/index', root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .map((name) => path.basename(name, '.json'))
    .filter(Boolean)
    .sort();
}
