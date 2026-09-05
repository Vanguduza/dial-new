#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { appendJsonl, ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';

export const OPENROUTER_SCREEN_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_SCREEN_AUTHORITY = 'OPENROUTER_FREE_SCREEN_IMPLEMENTATION_COMPILER_ONLY';
export const OPENROUTER_SCREEN_KEY_REL = 'secrets/openrouter-screen-generator.key';
export const OPENROUTER_SCREEN_CONFIG_REL = 'screen-factory/openrouter-generation-config.json';
export const OPENROUTER_SCREEN_CATALOG_REL = 'screen-factory/openrouter-generation-catalog.json';
export const OPENROUTER_SCREEN_SELECTION_REL = 'screen-factory/openrouter-generation-selection.json';
export const OPENROUTER_SCREEN_HEALTH_REL = 'screen-factory/openrouter-generation-health.json';
export const OPENROUTER_SCREEN_DATA_CLASS = 'SYNTHETIC_PRODUCT_CONTRACT_ONLY';
export const OPENROUTER_SCREEN_CATALOG_MAX_AGE_MS = 30 * 60 * 1000;

export const PREFERRED_SCREEN_MODELS = Object.freeze([
  'z-ai/glm-5.2:free',
  'minimax/minimax-m3:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
]);
const CURATED = Object.freeze({
  'z-ai/glm-5.2:free': { quality: 100, structured: true },
  'minimax/minimax-m3:free': { quality: 98, structured: true },
  'nvidia/nemotron-3-ultra-550b-a55b:free': { quality: 97, structured: false },
  'dots-studio/dots-3-note-preview:free': { quality: 96, structured: true },
  'nvidia/nemotron-3-super-120b-a12b:free': { quality: 94, structured: true },
  'cohere/north-mini-code:free': { quality: 92, structured: false },
  'poolside/laguna-s-2.1:free': { quality: 91, structured: false },
  'minimax/minimax-m2.7:free': { quality: 90, structured: true },
  'nvidia/nemotron-3.5-lightning:free': { quality: 86, structured: false },
});

function now() { return new Date().toISOString(); }
function keyPath(root) { return resolveControlPath(OPENROUTER_SCREEN_KEY_REL, root); }
function freePrice(value) { return Number(value ?? NaN) === 0; }
function modelParams(model) { return new Set(model?.supported_parameters ?? []); }
function viable(model) {
  const params = modelParams(model);
  const pricing = model?.pricing ?? {};
  return Boolean(CURATED[model?.id]
    && String(model.id).endsWith(':free')
    && freePrice(pricing.prompt) && freePrice(pricing.completion)
    && params.has('reasoning') && params.has('max_tokens')
    && Number(model.context_length ?? 0) >= 128000);
}
function score(model) {
  const profile = CURATED[model.id] ?? { quality: 0 };
  const params = modelParams(model);
  return profile.quality
    + (params.has('response_format') ? 3 : 0)
    + (params.has('structured_outputs') ? 2 : 0)
    + Math.min(3, Math.log2(Math.max(128000, Number(model.context_length || 0)) / 128000));
}
function catalogFresh(catalog) {
  const at = Date.parse(catalog?.refreshed_at || '');
  return Number.isFinite(at) && Date.now() - at >= 0 && Date.now() - at <= OPENROUTER_SCREEN_CATALOG_MAX_AGE_MS;
}
function loadModelHealth(root) {
  return readJson(OPENROUTER_SCREEN_HEALTH_REL, { schema_version: 1, models: {}, updated_at: null }, root);
}
function healthBlocked(entry) {
  if (!entry || entry.state === 'HEALTHY') return false;
  const retryAt = Date.parse(entry.retry_after || '');
  return Number.isFinite(retryAt) && retryAt > Date.now();
}
function recordModelHealth(root, model, state, reason, retryMs = 0) {
  const health = loadModelHealth(root);
  health.schema_version = 1; health.updated_at = now();
  health.models[model] = {
    state, reason: String(reason || '').replace(/\s+/g, ' ').slice(0, 600), observed_at: now(),
    retry_after: retryMs > 0 ? new Date(Date.now() + retryMs).toISOString() : null,
  };
  writeJsonAtomic(OPENROUTER_SCREEN_HEALTH_REL, health, root);
  appendJsonl('events/screen-factory-openrouter.jsonl', { event: 'SCREEN_FACTORY_OPENROUTER_MODEL_HEALTH', model, state, retry_after: health.models[model].retry_after, at: now() }, root);
  return health.models[model];
}
function effectiveModels(catalog, root) {
  const health = loadModelHealth(root);
  return (catalog?.models ?? []).filter((model) => !healthBlocked(health.models?.[model.id]));
}
function classifyFailure(status, text = '') {
  const t = String(text).toLowerCase();
  if (status === 429 || /rate.?limit|upstream_429/.test(t)) return { state: 'RATE_LIMITED', retryMs: 5 * 60 * 1000 };
  if (status === 404 && /data policy|free model training/.test(t)) return { state: 'POLICY_BLOCKED', retryMs: 6 * 60 * 60 * 1000 };
  if (status === 404 && /no endpoints|model.*not found|unknown model|retired/.test(t)) return { state: 'ENDPOINT_UNAVAILABLE', retryMs: 6 * 60 * 60 * 1000 };
  if (status === 408 || status >= 500) return { state: 'UPSTREAM_UNAVAILABLE', retryMs: 2 * 60 * 1000 };
  return { state: 'REQUEST_FAILED', retryMs: 10 * 60 * 1000 };
}
function readKey(root) {
  const target = keyPath(root);
  const stat = fs.statSync(target);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('OpenRouter Screen Factory key must be a 0600 file');
  const key = fs.readFileSync(target, 'utf8').trim();
  if (key.length < 16) throw new Error('OpenRouter Screen Factory key is missing');
  return key;
}
export function configureOpenRouterScreenGenerator({ apiKey, enabled = true } = {}, root) {
  ensureControlLayout(root);
  const secret = String(apiKey ?? '').trim();
  if (secret.length < 16) throw new Error('OpenRouter Screen Factory API key is required');
  const target = keyPath(root);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, `${secret}\n`, { encoding: 'utf8', mode: 0o600, flag: 'w' });
  fs.chmodSync(target, 0o600);
  writeJsonAtomic(OPENROUTER_SCREEN_CONFIG_REL, {
    schema_version: 1, enabled: Boolean(enabled), authority: OPENROUTER_SCREEN_AUTHORITY,
    scope: 'SCREEN_FACTORY_IMPLEMENTATION_COMPILATION_ONLY',
    manager_eligible: false, hermes_runtime_eligible: false, auxiliary_eligible: false,
    preferred_models: PREFERRED_SCREEN_MODELS,
    retirement_policy: 'LIVE_CATALOG_THEN_CURATED_CAPABILITY_SCORE_REPLACEMENT',
    data_policy: OPENROUTER_SCREEN_DATA_CLASS,
    provider_policy: { data_collection: 'deny', require_parameters: true },
    updated_at: now(),
  }, root);
  appendJsonl('events/screen-factory-openrouter.jsonl', { event: 'SCREEN_FACTORY_OPENROUTER_CONFIGURED', authority: OPENROUTER_SCREEN_AUTHORITY, at: now() }, root);
  return openRouterScreenGeneratorStatus(root);
}
export function openRouterScreenGeneratorStatus(root) {
  const cfg = readJson(OPENROUTER_SCREEN_CONFIG_REL, null, root);
  const selection = readJson(OPENROUTER_SCREEN_SELECTION_REL, null, root);
  let keyConfigured = false, keyMode = null;
  try { const stat = fs.statSync(keyPath(root)); keyConfigured = stat.isFile(); keyMode = (stat.mode & 0o777).toString(8).padStart(3, '0'); } catch {}
  return {
    schema_version: 1, authority: OPENROUTER_SCREEN_AUTHORITY,
    configured: Boolean(cfg && keyConfigured && keyMode === '600'),
    enabled: Boolean(cfg?.enabled && keyConfigured && keyMode === '600'),
    key_configured: keyConfigured, key_file_mode: keyMode, key_material_exposed: false,
    scope: cfg?.scope ?? 'SCREEN_FACTORY_IMPLEMENTATION_COMPILATION_ONLY',
    preferred_models: PREFERRED_SCREEN_MODELS,
    active_models: selection?.active_models ?? [], replacements: selection?.replacements ?? [],
    retirement_policy: cfg?.retirement_policy ?? 'LIVE_CATALOG_THEN_CURATED_CAPABILITY_SCORE_REPLACEMENT',
    last_catalog_refresh: selection?.catalog_refreshed_at ?? null,
    model_health: loadModelHealth(root).models,
  };
}
export async function refreshOpenRouterScreenCatalog({ root, fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(`${OPENROUTER_SCREEN_BASE_URL}/models`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`OpenRouter model catalog returned HTTP ${response.status}`);
  const payload = await response.json();
  const models = (payload?.data ?? []).filter(viable).map((model) => ({
    id: model.id, name: model.name, context_length: model.context_length,
    pricing: model.pricing, supported_parameters: model.supported_parameters ?? [],
    capability_score: Number(score(model).toFixed(3)), quality_profile: CURATED[model.id],
  })).sort((a, b) => b.capability_score - a.capability_score || a.id.localeCompare(b.id));
  const catalog = { schema_version: 1, authority: OPENROUTER_SCREEN_AUTHORITY, models, refreshed_at: now() };
  writeJsonAtomic(OPENROUTER_SCREEN_CATALOG_REL, catalog, root);
  appendJsonl('events/screen-factory-openrouter.jsonl', { event: 'SCREEN_FACTORY_OPENROUTER_CATALOG_REFRESHED', admitted: models.map((m) => m.id), at: now() }, root);
  return catalog;
}
export function selectOpenRouterScreenModels(catalog, root) {
  const candidates = root ? effectiveModels(catalog, root) : (catalog?.models ?? []);
  const byId = new Map(candidates.map((model) => [model.id, model]));
  const active = PREFERRED_SCREEN_MODELS.filter((id) => byId.has(id));
  const replacements = [];
  const retired = PREFERRED_SCREEN_MODELS.filter((id) => !byId.has(id));
  const replacementPool = candidates.filter((m) => !PREFERRED_SCREEN_MODELS.includes(m.id));
  for (const model of replacementPool) {
    if (active.length >= PREFERRED_SCREEN_MODELS.length) break;
    const slot = retired[replacements.length] || null;
    active.push(model.id); replacements.push({ retired_or_unavailable_slot: slot, replacement: model.id, capability_score: model.capability_score });
  }
  if (!active.length) throw new Error('no eligible curated free OpenRouter Screen Factory models are currently available');
  const selection = {
    schema_version: 1, authority: OPENROUTER_SCREEN_AUTHORITY,
    preferred_models: PREFERRED_SCREEN_MODELS, active_models: active.slice(0, 3),
    retired_or_unavailable: retired, replacements,
    health_filtered: root ? PREFERRED_SCREEN_MODELS.filter((id) => (catalog?.models ?? []).some((m) => m.id === id) && !byId.has(id)) : [],
    catalog_refreshed_at: catalog?.refreshed_at ?? null, selected_at: now(),
  };
  if (root) writeJsonAtomic(OPENROUTER_SCREEN_SELECTION_REL, selection, root);
  return selection;
}
async function currentSelection(root, fetchImpl) {
  let catalog = readJson(OPENROUTER_SCREEN_CATALOG_REL, null, root);
  if (!catalogFresh(catalog)) catalog = await refreshOpenRouterScreenCatalog({ root, fetchImpl });
  return { catalog, selection: selectOpenRouterScreenModels(catalog, root) };
}
function rotate(models, taskKey) {
  if (models.length < 2) return [...models];
  const hash = crypto.createHash('sha256').update(String(taskKey || '')).digest();
  const start = hash[0] % models.length;
  return [...models.slice(start), ...models.slice(0, start)];
}
function responseText(payload) {
  const value = payload?.choices?.[0]?.message?.content;
  if (Array.isArray(value)) return value.map((item) => item?.text ?? '').join('\n').trim();
  return String(value ?? '').trim();
}
function failureDetail(status, text) {
  const compact = String(text || '').replace(/\s+/g, ' ').slice(0, 500);
  return `HTTP ${status}${compact ? ` ${compact}` : ''}`;
}
export async function callOpenRouterScreenCompiler({ content, root, taskKey, fetchImpl = globalThis.fetch, maxOutputTokens = 20000 } = {}) {
  const status = openRouterScreenGeneratorStatus(root);
  if (!status.enabled) throw new Error('OpenRouter Screen Factory generation is not configured');
  const cfg = readJson(OPENROUTER_SCREEN_CONFIG_REL, null, root);
  if (cfg?.scope !== 'SCREEN_FACTORY_IMPLEMENTATION_COMPILATION_ONLY') throw new Error('OpenRouter key scope is not Screen Factory generation only');
  const key = readKey(root);
  const { catalog, selection } = await currentSelection(root, fetchImpl);
  const primaryOrder = rotate(selection.active_models, taskKey);
  const replacementOrder = (catalog.models ?? []).map((m) => m.id).filter((id) => !primaryOrder.includes(id));
  const models = [...primaryOrder, ...replacementOrder];
  const failures = [];
  for (const model of models) {
    if (healthBlocked(loadModelHealth(root).models?.[model])) continue;
    const meta = catalog.models.find((item) => item.id === model);
    const params = new Set(meta?.supported_parameters ?? []);
    const body = {
      model,
      messages: [
        { role: 'system', content: 'You are the authoritative Dial Health Screen Factory implementation compiler. Use only the supplied synthetic product contract. Do not browse, call tools, request secrets, or invent patient/clinical/financial truth. Return only the requested JSON implementation packet.' },
        { role: 'user', content: String(content ?? '') },
      ],
      temperature: 0,
      max_tokens: Math.max(4096, Math.min(24000, Number(maxOutputTokens) || 20000)),
      reasoning: { effort: 'high' },
      provider: { data_collection: 'deny', require_parameters: true },
    };
    if (params.has('response_format')) body.response_format = { type: 'json_object' };
    let response;
    try {
      response = await fetchImpl(`${OPENROUTER_SCREEN_BASE_URL}/chat/completions`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify(body), signal: AbortSignal.timeout(90000),
      });
    } catch (error) {
      const reason = String(error?.name || error?.message || error).slice(0, 160);
      failures.push(`${model}: ${reason}`);
      recordModelHealth(root, model, 'UPSTREAM_UNAVAILABLE', reason, 2 * 60 * 1000);
      continue;
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const detail = failureDetail(response.status, text);
      failures.push(`${model}: ${detail}`);
      const classified = classifyFailure(response.status, text);
      recordModelHealth(root, model, classified.state, detail, classified.retryMs);
      continue;
    }
    const payload = await response.json();
    const resolved = String(payload?.model || model);
    if (resolved !== model) {
      const detail = `resolved model mismatch ${resolved}`; failures.push(`${model}: ${detail}`);
      recordModelHealth(root, model, 'IDENTITY_MISMATCH', detail, 60 * 60 * 1000);
      continue;
    }
    const output = responseText(payload);
    if (!output) { failures.push(`${model}: empty output`); recordModelHealth(root, model, 'EMPTY_OUTPUT', 'empty output', 10 * 60 * 1000); continue; }
    recordModelHealth(root, model, 'HEALTHY', 'compile completed', 0);
    appendJsonl('events/screen-factory-openrouter.jsonl', {
      event: 'SCREEN_FACTORY_OPENROUTER_COMPILE_COMPLETE', task_key: taskKey || null,
      model, authority: OPENROUTER_SCREEN_AUTHORITY, at: now(),
    }, root);
    return { response: output, runtime: 'openrouter_free_screen_compiler', model, selection, attempt_failures: failures };
  }
  appendJsonl('events/screen-factory-openrouter.jsonl', {
    event: 'SCREEN_FACTORY_OPENROUTER_COMPILE_FAILED', task_key: taskKey || null,
    attempted_models: models, failure_count: failures.length, authority: OPENROUTER_SCREEN_AUTHORITY, at: now(),
  }, root);
  throw new Error(`OpenRouter Screen Factory generation unavailable across curated free pool: ${failures.join(' | ').slice(0, 1800)}`);
}

async function readStdin() { const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk); return Buffer.concat(chunks).toString('utf8').trim(); }
async function main() {
  const command = process.argv[2] || 'status';
  if (command === 'status') return console.log(JSON.stringify(openRouterScreenGeneratorStatus(), null, 2));
  if (command === 'catalog') return console.log(JSON.stringify(await refreshOpenRouterScreenCatalog({}), null, 2));
  if (command === 'configure') {
    if (!process.argv.includes('--api-key-stdin')) throw new Error('configure requires --api-key-stdin');
    return console.log(JSON.stringify(configureOpenRouterScreenGenerator({ apiKey: await readStdin() }), null, 2));
  }
  throw new Error(`unknown OpenRouter Screen Factory generator command: ${command}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
