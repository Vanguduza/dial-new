#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appendJsonl, DEFAULT_CONTROL_HOME, readJson, writeJsonAtomic } from '../../state-store.mjs';
import { browserSearch, browserRenderedRead } from '../../browser-acquisition-client.mjs';

export const UNION_ALPHA_MODEL_ID = 'stealth/union-alpha';
export const UNION_ALPHA_DATA_CLASS = 'PUBLIC_RESEARCH_ONLY';
export const UNION_ALPHA_ROLES = Object.freeze([
  'TECHNOLOGY_RESEARCHER',
  'REPOSITORY_RESEARCHER',
  'ARCHITECTURE_RESEARCHER',
  'ARCHITECTURE_COMPARATOR',
  'SECURITY_RESEARCHER',
  'UX_PATTERN_RESEARCHER',
  'FRONTEND_RESEARCHER',
  'FAILURE_MODE_RESEARCHER',
  'OPERABILITY_RESEARCHER',
  'TESTING_RESEARCHER',
  'PERFORMANCE_RESEARCHER',
  'DEPLOYMENT_RESEARCHER',
  'INTEGRATION_RESEARCHER',
  'SOURCE_SYNTHESIZER',
  'CONTRADICTION_ANALYST',
  'ANTI_PATTERN_MINER',
  'OFFICIAL_DOC_SYNTHESIZER',
  'OPEN_SOURCE_DONOR_RESEARCHER',
]);

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const EXA_MCP_URL = 'https://mcp.exa.ai/mcp';
const CONTEXT7_WRAPPER = 'deploy/oracle/hermes-codex/research-mcp-runtime/run-context7.sh';
const MAX_SUBJECTS = 8;
const MAX_PROVIDER_PACKET_BYTES = 220_000;

function now() { return new Date().toISOString(); }
function sha(value) {
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  return crypto.createHash('sha256').update(body).digest('hex');
}
function bounded(value, max = 6000) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…[bounded]` : text;
}
function secretEnvPath(root) {
  return process.env.DIAL_UNION_ALPHA_ENV_FILE ||
    path.join(root, 'secrets/openrouter-union-alpha.env');
}
function parseEnvFile(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const idx = text.indexOf('=');
    if (idx < 1) continue;
    out[text.slice(0, idx).trim()] =
      text.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}
function readApprovedKeyFile(file, root) {
  const secretsRoot = path.resolve(root, 'secrets');
  const target = path.resolve(String(file || ''));
  if (!target.startsWith(`${secretsRoot}${path.sep}`)) {
    throw new Error('UNION_ALPHA_KEY_FILE_OUTSIDE_CONTROL_SECRETS');
  }
  return fs.readFileSync(target, 'utf8').trim();
}
function loadApiKey(root) {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  if (process.env.OPENROUTER_API_KEY_FILE) {
    return readApprovedKeyFile(process.env.OPENROUTER_API_KEY_FILE, root);
  }
  const env = parseEnvFile(secretEnvPath(root));
  if (env.OPENROUTER_API_KEY) return env.OPENROUTER_API_KEY;
  if (env.OPENROUTER_API_KEY_FILE) {
    return readApprovedKeyFile(env.OPENROUTER_API_KEY_FILE, root);
  }
  throw Object.assign(new Error('UNION_ALPHA_AUTH_REQUIRED'), {
    category: 'AUTH_REQUIRED',
  });
}

export function unionAlphaCredentialStatus(root = DEFAULT_CONTROL_HOME) {
  let configured = Boolean(process.env.OPENROUTER_API_KEY);
  let source = configured ? 'environment' : null;
  if (!configured) {
    try {
      const env = parseEnvFile(secretEnvPath(root));
      configured = Boolean(env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY_FILE);
      if (configured) source = env.OPENROUTER_API_KEY_FILE ? 'control_key_file' : 'control_secret_file';
    } catch {}
  }
  return {
    configured,
    source,
    model_id: UNION_ALPHA_MODEL_ID,
    data_class: UNION_ALPHA_DATA_CLASS,
    material_exposed: false,
  };
}

function publicHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local')) return false;
    if (/^(127|10|169\.254|192\.168)\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function validateSubject(subject) {
  if (!/^[a-f0-9]{12,64}$/.test(String(subject?.subject_id || ''))) {
    throw new Error('UNION_ALPHA_SUBJECT_ID_INVALID');
  }
  if (!String(subject?.topic || '').trim() || String(subject.topic).length > 320) {
    throw new Error('UNION_ALPHA_SUBJECT_TOPIC_INVALID');
  }
  if (!Array.isArray(subject?.engineering_questions) ||
      subject.engineering_questions.length < UNION_ALPHA_ROLES.length ||
      subject.engineering_questions.length > 24) {
    throw new Error('UNION_ALPHA_SUBJECT_QUESTIONS_INVALID');
  }
  if (!Array.isArray(subject?.role_scope) ||
      UNION_ALPHA_ROLES.some((role) => !subject.role_scope.includes(role))) {
    throw new Error('UNION_ALPHA_ROLE_COVERAGE_REQUIRED');
  }
  for (const hint of subject.source_hints || []) {
    if (hint?.url && !publicHttpsUrl(hint.url)) {
      throw new Error('UNION_ALPHA_SOURCE_HINT_NOT_PUBLIC');
    }
  }
}

export function sanitizeUnionAlphaProviderPacket(batch = {}) {
  if (batch.data_class !== UNION_ALPHA_DATA_CLASS) {
    throw new Error('UNION_ALPHA_PUBLIC_RESEARCH_ONLY');
  }
  if (!/^[A-Za-z0-9_.:-]{8,160}$/.test(String(batch.mission_id || '')) ||
      !/^[A-Za-z0-9_.:-]{8,160}$/.test(String(batch.batch_id || ''))) {
    throw new Error('UNION_ALPHA_BATCH_BINDING_INVALID');
  }
  if (!Array.isArray(batch.subjects) || batch.subjects.length < 1 ||
      batch.subjects.length > MAX_SUBJECTS) {
    throw new Error('UNION_ALPHA_SUBJECT_COUNT_INVALID');
  }
  batch.subjects.forEach(validateSubject);
  const safe = {
    schema_version: 1,
    mission_id: batch.mission_id,
    batch_id: batch.batch_id,
    batch_kind: bounded(batch.batch_kind || 'UNIT_RESEARCH', 80),
    data_class: UNION_ALPHA_DATA_CLASS,
    subjects: batch.subjects.map((subject) => ({
      subject_id: subject.subject_id,
      topic: bounded(subject.topic, 320),
      module_class: bounded(subject.module_class || 'GENERAL_SOFTWARE', 100),
      technology_tags: (subject.technology_tags || [])
        .slice(0, 16).map((item) => bounded(item, 120)),
      engineering_questions: subject.engineering_questions
        .slice(0, 24).map((q) => bounded(q, 900)),
      role_scope: [...UNION_ALPHA_ROLES],
      source_hints: (subject.source_hints || []).slice(0, 12)
        .filter((hint) => !hint?.url || publicHttpsUrl(hint.url))
        .map((hint) => ({
          source_id: bounded(hint?.source_id || 'public', 120),
          authority: bounded(hint?.authority || 'ENGINEERING_GUIDANCE_ONLY', 80),
          url: hint?.url || null,
          technology: hint?.technology ? bounded(hint.technology, 120) : null,
        })),
      search_queries: (subject.search_queries || [])
        .slice(0, 3).map((q) => bounded(q, 320)),
      prior_summary: subject.prior_summary ?
        bounded(subject.prior_summary, 7000) : null,
    })),
  };
  const size = Buffer.byteLength(JSON.stringify(safe));
  if (size > MAX_PROVIDER_PACKET_BYTES) {
    throw new Error('UNION_ALPHA_PROVIDER_PACKET_TOO_LARGE');
  }
  return safe;
}

function cleanHtml(text) {
  return bounded(String(text || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim(), 12000);
}

export async function fetchOfficial(url, fetchImpl = fetch) {
  if (!publicHttpsUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'DIAL-VEKL-UnionAlphaResearch/1.0',
        accept: 'text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.1',
      },
    });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') || '';
    if (!/(text|json|xml)/i.test(type)) return null;
    const body = (await response.text()).slice(0, 80000);
    return {
      url: response.url,
      content_type: type,
      sha256: sha(body),
      excerpt: cleanHtml(body),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function exaSearch(query, fetchImpl = fetch) {
  let sessionId = null;
  async function rpc(message) {
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    const response = await fetchImpl(EXA_MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
    });
    if (!response.ok) throw new Error(`EXA_HTTP_${response.status}`);
    sessionId = response.headers.get('mcp-session-id') || sessionId;
    const text = await response.text();
    if (!text.trim()) return null;
    const sse = text.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    return JSON.parse(sse.length ? sse.at(-1) : text);
  }
  await rpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'dial-vekl-union-alpha', version: '1.0' },
    },
  });
  await rpc({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  });
  const result = await rpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'web_search_exa',
      arguments: { query, numResults: 5 },
    },
  });
  return bounded(JSON.stringify(result?.result || result || {}), 16000);
}

export async function searchPublicWithBrowserFallback(query, fetchImpl = fetch) {
  try {
    const result = await exaSearch(query, fetchImpl);
    return { state: 'PRIMARY_ROUTE_OK', acquisition_method: 'EXA_SEARCH', content: result, fallback_cause: null };
  } catch (error) {
    const fallback = await browserSearch(query, fetchImpl);
    return {
      state: 'DEGRADED_ROUTE_USED',
      acquisition_method: 'BROWSER_SEARCH',
      content: fallback.excerpt,
      content_hash: fallback.content_hash,
      candidate_id: fallback.candidate_id,
      links: fallback.links || [],
      observed_at: fallback.observed_at,
      final_url: fallback.final_url,
      fallback_cause: bounded(error?.message || error, 300),
      normalized_evidence: fallback,
    };
  }
}

export async function fetchPublicWithBrowserFallback(url, fetchImpl = fetch) {
  const direct = await fetchOfficial(url, fetchImpl);
  if (direct) {
    return {
      state: 'PRIMARY_ROUTE_OK',
      acquisition_method: 'DIRECT_FETCH',
      url: direct.url,
      final_url: direct.url,
      content_type: direct.content_type,
      sha256: direct.sha256,
      excerpt: direct.excerpt,
      content_hash: direct.sha256,
      observed_at: now(),
    };
  }
  const rendered = await browserRenderedRead(url, fetchImpl);
  return {
    state: 'DEGRADED_ROUTE_USED',
    acquisition_method: 'BROWSER_RENDERED',
    url: rendered.final_url,
    final_url: rendered.final_url,
    content_type: 'text/html',
    sha256: rendered.content_hash,
    content_hash: rendered.content_hash,
    excerpt: rendered.excerpt,
    observed_at: rendered.observed_at,
    normalized_evidence: rendered,
    fallback_cause: 'DIRECT_FETCH_INCOMPLETE',
  };
}

function context7Query({ repoDir, technology, query }) {
  if (!repoDir || !technology) return null;
  const wrapper = path.join(repoDir, CONTEXT7_WRAPPER);
  if (!fs.existsSync(wrapper)) return null;
  const initialize = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'dial-vekl-union-alpha', version: '1.0' },
    },
  });
  const initialized = JSON.stringify({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  });
  const resolve = JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'resolve-library-id',
      arguments: { libraryName: technology, query },
    },
  });
  const first = spawnSync('bash', [wrapper], {
    cwd: repoDir,
    input: `${initialize}\n${initialized}\n${resolve}\n`,
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (first.status !== 0) return null;
  const response = String(first.stdout || '').split(/\r?\n/)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .find((row) => row?.id === 2);
  const resolvedText = (response?.result?.content || [])
    .map((item) => item?.text || '').join('\n');
  const match = resolvedText.match(/\/[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+(?:\/[-A-Za-z0-9_.]+)?/);
  if (!match) return null;
  const docsCall = JSON.stringify({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'query-docs',
      arguments: { libraryId: match[0], query },
    },
  });
  const second = spawnSync('bash', [wrapper], {
    cwd: repoDir,
    input: `${initialize}\n${initialized}\n${docsCall}\n`,
    encoding: 'utf8',
    timeout: 25000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (second.status !== 0) return null;
  const docsResponse = String(second.stdout || '').split(/\r?\n/)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .find((row) => row?.id === 3);
  const docs = (docsResponse?.result?.content || [])
    .map((item) => item?.text || '').join('\n');
  return {
    library_id: match[0],
    excerpt: bounded(docs, 14000),
  };
}

export async function gatherPublicEvidence(packet, { repoDir, fetchImpl = fetch } = {}) {
  const evidence = {
    official: [],
    exa: [],
    browser: [],
    context7: [],
    acquisition_routes: [],
    retrieval_errors: [],
  };
  const urls = [...new Set(packet.subjects.flatMap((subject) =>
    (subject.source_hints || []).map((hint) => hint.url).filter(Boolean)))].slice(0, 6);
  for (const url of urls) {
    const row = await fetchOfficial(url, fetchImpl);
    if (row) {
      evidence.official.push(row);
      evidence.acquisition_routes.push({ method: 'DIRECT_FETCH', url: row.url, content_hash: row.sha256 });
    } else {
      try {
        const rendered = await browserRenderedRead(url, fetchImpl);
        evidence.browser.push(rendered);
        evidence.acquisition_routes.push({ method: 'BROWSER_RENDERED', url: rendered.final_url, content_hash: rendered.content_hash, fallback_cause: 'DIRECT_FETCH_INCOMPLETE' });
      } catch (error) {
        evidence.retrieval_errors.push({ adapter: 'BROWSER_RENDERED', error: bounded(error?.message || error, 300) });
      }
    }
  }
  const queries = [...new Set(packet.subjects.flatMap((subject) =>
    subject.search_queries || []))].slice(0, 3);
  for (const query of queries) {
    try {
      const result = await exaSearch(query, fetchImpl);
      evidence.exa.push({ query, result });
      evidence.acquisition_routes.push({ method: 'EXA_SEARCH', query, state: 'PRIMARY_ROUTE_OK' });
    } catch (error) {
      const errorText = bounded(error?.message || error, 300);
      evidence.retrieval_errors.push({ adapter: 'EXA', error: errorText });
      try {
        const fallback = await browserSearch(query, fetchImpl);
        evidence.browser.push({ query, ...fallback, degraded_from: 'EXA_SEARCH', degraded_reason: errorText });
        evidence.acquisition_routes.push({ method: 'BROWSER_SEARCH', query, state: 'DEGRADED_ROUTE_USED', fallback_cause: errorText, content_hash: fallback.content_hash });
      } catch (browserError) {
        evidence.retrieval_errors.push({ adapter: 'BROWSER_SEARCH', error: bounded(browserError?.message || browserError, 300) });
      }
    }
  }
  const technologies = [...new Set(packet.subjects.flatMap((subject) =>
    subject.technology_tags || []))].slice(0, 2);
  for (const technology of technologies) {
    try {
      const result = context7Query({
        repoDir,
        technology,
        query: `Current implementation, security, migration, failure-mode and testing guidance for ${technology}`,
      });
      if (result) evidence.context7.push({ technology, ...result });
    } catch (error) {
      evidence.retrieval_errors.push({
        adapter: 'CONTEXT7',
        error: bounded(error?.message || error, 300),
      });
    }
  }
  return evidence;
}

function promptFor(packet, evidence) {
  const roleShape = Object.fromEntries(UNION_ALPHA_ROLES.map((role) => [
    role,
    {
      findings: [{
        claim: 'string',
        source_refs: ['string'],
        confidence: 0.8,
        freshness_note: 'string|null',
      }],
      risks: ['string'],
      recommendations: ['string'],
      unknowns: ['string'],
    },
  ]));
  return [
    'DIAL VEKL PUBLIC ENGINEERING RESEARCH HARVEST',
    'You are Union Alpha acting only as a subordinate, non-authoritative engineering research worker.',
    'The supplied packet is PUBLIC_RESEARCH_ONLY. Never infer or request private repository content, credentials, customer data, production identifiers, payment records, health data, or Project Truth.',
    'Cover every subject through every named role. Prefer official and maintainer evidence. Exa is discovery/corroboration unless it points to an authoritative source.',
    'Never change product requirements or claim authority over DIAL canon. Separate evidence-backed findings from hypotheses. Record uncertainty explicitly.',
    'Do not fabricate URLs, versions, benchmarks, compliance claims, legal conclusions, or vendor capabilities.',
    'Keep each role concise: normally 1-3 findings, 0-3 risks, 0-3 recommendations, and explicit unknowns.',
    'Return JSON only.',
    JSON.stringify({
      schema_version: 1,
      batch_id: packet.batch_id,
      subjects: [{
        subject_id: 'same supplied subject_id',
        roles: roleShape,
        cross_role_synthesis: {
          implementation_patterns: ['string'],
          anti_patterns: ['string'],
          verification_focus: ['string'],
          unresolved_contradictions: ['string'],
        },
      }],
      batch_contradictions: ['string'],
    }),
    '--- SANITIZED PACKET ---',
    JSON.stringify(packet),
    '--- RETRIEVED PUBLIC EVIDENCE ---',
    JSON.stringify(evidence),
  ].join('\n');
}

export function validateUnionAlphaResult(result, packet, extraSourceRefs = []) {
  if (!result || result.schema_version !== 1 ||
      result.batch_id !== packet.batch_id ||
      !Array.isArray(result.subjects)) {
    return { ok: false, reason: 'RESULT_SHAPE_INVALID' };
  }
  const expected = new Set(packet.subjects.map((subject) => subject.subject_id));
  const sourceRefs = new Set([...packet.subjects.flatMap((subject) => (subject.source_hints || []).flatMap((hint) => [hint.source_id, hint.url].filter(Boolean))), ...(extraSourceRefs || [])]);
  const seen = new Set();
  for (const subject of result.subjects) {
    if (!expected.has(subject?.subject_id) || seen.has(subject.subject_id)) {
      return { ok: false, reason: 'RESULT_SUBJECT_BINDING_INVALID' };
    }
    seen.add(subject.subject_id);
    for (const role of UNION_ALPHA_ROLES) {
      const row = subject.roles?.[role];
      if (!row || !Array.isArray(row.findings) ||
          !Array.isArray(row.risks) ||
          !Array.isArray(row.recommendations) ||
          !Array.isArray(row.unknowns)) {
        return { ok: false, reason: `RESULT_ROLE_MISSING:${role}` };
      }
      if (!row.findings.length && !row.unknowns.length) {
        return { ok: false, reason: `RESULT_ROLE_EMPTY:${role}` };
      }
      for (const finding of row.findings) {
        if (!String(finding?.claim || '').trim() ||
            !Array.isArray(finding?.source_refs) || !finding.source_refs.length) {
          return { ok: false, reason: `RESULT_FINDING_INVALID:${role}` };
        }
        if (sourceRefs.size && finding.source_refs.some((ref) => !sourceRefs.has(ref))) {
          return { ok: false, reason: `RESULT_CITATION_NOT_IN_PACKET:${role}` };
        }
      }
    }
  }
  return seen.size === expected.size ?
    { ok: true } :
    { ok: false, reason: 'RESULT_SUBJECT_COVERAGE_INCOMPLETE' };
}

export async function unionAlphaFreeWindowStatus({ root = DEFAULT_CONTROL_HOME, fetchImpl = fetch } = {}) {
  if (process.env.DIAL_UNION_ALPHA_FREE_WINDOW_CLOSED === '1') return {
    available: true,
    free: false,
    model_id: UNION_ALPHA_MODEL_ID,
    reason: 'FREE_WINDOW_CLOSED',
    observed_at: now(),
    source: 'OPERATOR_CONFIRMED_PROVIDER_STATE',
  };
  const key = loadApiKey(root);
  const response = await fetchImpl('https://openrouter.ai/api/v1/models', {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    const error = new Error(`UNION_ALPHA_MODEL_CATALOG_HTTP_${response.status}`);
    error.category = [401, 403].includes(response.status) ? 'AUTH_REQUIRED' : 'PROVIDER_ERROR';
    throw error;
  }
  const payload = await response.json();
  const model = (payload?.data || []).find((row) => row?.id === UNION_ALPHA_MODEL_ID);
  if (!model) return { available: false, free: false, model_id: UNION_ALPHA_MODEL_ID, reason: 'MODEL_NOT_LISTED' };
  const promptPrice = String(model?.pricing?.prompt ?? '');
  const completionPrice = String(model?.pricing?.completion ?? '');
  const free = Number(promptPrice) === 0 && Number(completionPrice) === 0;
  return {
    available: true, free, model_id: UNION_ALPHA_MODEL_ID,
    context_length: model?.context_length ?? null,
    prompt_price: promptPrice, completion_price: completionPrice,
    observed_at: now(),
  };
}

function extractJson(content) {
  const raw = String(content || '').trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error('UNION_ALPHA_INVALID_JSON');
}

export async function runUnionAlphaResearchBatch({
  batch,
  bindings = [],
  repoDir,
  root = DEFAULT_CONTROL_HOME,
  fetchImpl = fetch,
} = {}) {
  const packet = sanitizeUnionAlphaProviderPacket(batch);
  const providerPacketHash = sha(packet);
  const artifactRel = `knowledge/research/union-alpha/artifacts/${packet.mission_id}/${packet.batch_id}.json`;
  const existing = readJson(artifactRel, null, root);
  if (existing?.provider_packet_hash === providerPacketHash && existing?.evidence_hash) {
    return { ...existing, idempotent_replay: true };
  }
  const freeWindow = await unionAlphaFreeWindowStatus({ root, fetchImpl });
  if (!freeWindow.available || !freeWindow.free) {
    const error = new Error('UNION_ALPHA_FREE_WINDOW_CLOSED');
    error.category = 'FREE_WINDOW_CLOSED';
    error.detail = JSON.stringify({ available: freeWindow.available, free: freeWindow.free, model_id: freeWindow.model_id });
    throw error;
  }
  const evidence = await gatherPublicEvidence(packet, { repoDir, fetchImpl });
  const response = await fetchImpl(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${loadApiKey(root)}`,
      'content-type': 'application/json',
      'http-referer': 'https://github.com/Vanguduza/dial-new',
      'x-title': 'DIAL VEKL Research Harvest',
    },
    body: JSON.stringify({
      model: UNION_ALPHA_MODEL_ID,
      messages: [
        {
          role: 'system',
          content: 'Return only valid JSON. You are a non-authoritative PUBLIC_RESEARCH_ONLY engineering researcher.',
        },
        { role: 'user', content: promptFor(packet, evidence) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.15,
      max_tokens: 7000,
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    const error = new Error(`UNION_ALPHA_HTTP_${response.status}`);
    error.category = [401, 403].includes(response.status) ?
      'AUTH_REQUIRED' : response.status === 429 ?
        'CAPACITY_LIMITED' : 'PROVIDER_ERROR';
    error.detail = bounded(raw, 1200);
    throw error;
  }
  const payload = JSON.parse(raw);
  const result = extractJson(payload?.choices?.[0]?.message?.content);
  const check = validateUnionAlphaResult(result, packet);
  if (!check.ok) {
    throw Object.assign(
      new Error(`UNION_ALPHA_RESULT_REJECTED:${check.reason}`),
      { category: 'INVALID_OUTPUT' },
    );
  }
  const record = {
    schema_version: 1,
    authority: 'NON_AUTHORITATIVE_ENGINEERING_GUIDANCE',
    provider: 'openrouter',
    model_id: UNION_ALPHA_MODEL_ID,
    data_class: UNION_ALPHA_DATA_CLASS,
    provider_packet_hash: providerPacketHash,
    mission_id: packet.mission_id,
    batch_id: packet.batch_id,
    batch_kind: packet.batch_kind,
    subject_bindings: bindings.map((binding) => ({
      subject_id: binding.subject_id,
      unit_lineage_id: binding.unit_lineage_id || null,
      unit_revision_hash: binding.unit_revision_hash || null,
      feature_ids: Array.isArray(binding.feature_ids) ? binding.feature_ids : [],
      module: binding.module || null,
    })),
    retrieval: {
      official_count: evidence.official.length,
      exa_count: evidence.exa.length,
      browser_count: evidence.browser.length,
      acquisition_routes: evidence.acquisition_routes,
      context7_count: evidence.context7.length,
      errors: evidence.retrieval_errors,
      evidence_hash: sha(evidence),
    },
    request_hash: sha({ model: UNION_ALPHA_MODEL_ID, packet, evidence_hash: sha(evidence) }),
    source_hash: sha(evidence),
    response_hash: sha(raw),
    result,
    usage: payload?.usage || null,
    free_window: freeWindow,
    rate_limit: {
      limit: response.headers.get('x-ratelimit-limit') || null,
      remaining: response.headers.get('x-ratelimit-remaining') || null,
      reset: response.headers.get('x-ratelimit-reset') || null,
    },
    completed_at: now(),
  };
  record.evidence_hash = sha(record);
  writeJsonAtomic(artifactRel, record, root);
  writeJsonAtomic('knowledge/research/union-alpha/current.json', {
    schema_version: 1,
    mission_id: packet.mission_id,
    state: 'RUNNING',
    model_id: UNION_ALPHA_MODEL_ID,
    data_class: UNION_ALPHA_DATA_CLASS,
    last_batch_id: packet.batch_id,
    last_batch_kind: packet.batch_kind,
    last_evidence_hash: record.evidence_hash,
    updated_at: record.completed_at,
  }, root);
  appendJsonl('events/engineering-research.jsonl', {
    event: 'UNION_ALPHA_RESEARCH_BATCH_COMPLETED',
    mission_id: packet.mission_id,
    batch_id: packet.batch_id,
    batch_kind: packet.batch_kind,
    subjects: packet.subjects.length,
    evidence_hash: record.evidence_hash,
    at: record.completed_at,
  }, root);
  return record;
}

export function unionAlphaResearchStatus(root = DEFAULT_CONTROL_HOME) {
  return {
    credential: unionAlphaCredentialStatus(root),
    current: readJson('knowledge/research/union-alpha/current.json', null, root),
    roles: [...UNION_ALPHA_ROLES],
    provider_secret_on_worker: false,
    data_class: UNION_ALPHA_DATA_CLASS,
  };
}
