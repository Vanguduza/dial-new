#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { appendJsonl, ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';

export const OPENROUTER_SCREEN_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_SCREEN_AUTHORITY = 'OPENROUTER_FREE_SCREEN_COMPOSITION_GENERATOR_ONLY';
export const OPENROUTER_SCREEN_KEY_REL = 'secrets/openrouter-screen-generator.key';
export const OPENROUTER_SCREEN_CONFIG_REL = 'screen-factory/openrouter-generation-config.json';
export const OPENROUTER_SCREEN_CATALOG_REL = 'screen-factory/openrouter-generation-catalog.json';
export const OPENROUTER_SCREEN_SELECTION_REL = 'screen-factory/openrouter-generation-selection.json';
export const OPENROUTER_SCREEN_HEALTH_REL = 'screen-factory/openrouter-generation-health.json';
export const OPENROUTER_SCREEN_USAGE_REL = 'screen-factory/openrouter-generation-usage.json';
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
function loadUsage(root) {
  return readJson(OPENROUTER_SCREEN_USAGE_REL, { schema_version: 1, request_attempts: 0, successful_requests: 0, prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, cached_tokens: 0, total_tokens: 0, by_role: {}, by_model: {}, updated_at: null }, root);
}
function bump(bucket, key, values = {}) {
  const row = bucket[key] || { request_attempts: 0, successful_requests: 0, prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, cached_tokens: 0, total_tokens: 0 };
  for (const [name, value] of Object.entries(values)) row[name] = Number(row[name] || 0) + Number(value || 0);
  bucket[key] = row;
}
function recordApiMetric(root, { role = 'unknown', model = 'unknown', attempted = 0, successful = 0, usage = null } = {}) {
  const state = loadUsage(root);
  const prompt = Number(usage?.prompt_tokens || 0), completion = Number(usage?.completion_tokens || 0);
  const reasoning = Number(usage?.completion_tokens_details?.reasoning_tokens || usage?.reasoning_tokens || 0);
  const cached = Number(usage?.prompt_tokens_details?.cached_tokens || usage?.cached_tokens || 0);
  const total = Number(usage?.total_tokens || (prompt + completion));
  const values = { request_attempts: attempted, successful_requests: successful, prompt_tokens: prompt, completion_tokens: completion, reasoning_tokens: reasoning, cached_tokens: cached, total_tokens: total };
  for (const [name, value] of Object.entries(values)) state[name] = Number(state[name] || 0) + Number(value || 0);
  state.by_role ||= {}; state.by_model ||= {}; bump(state.by_role, role, values); bump(state.by_model, model, values); state.updated_at = now();
  writeJsonAtomic(OPENROUTER_SCREEN_USAGE_REL, state, root); return state;
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
function quotaResetMs(text = '') {
  const raw = String(text);
  const match = raw.match(/X-RateLimit-Reset[^0-9]{0,20}([0-9]{10,13})/i);
  if (!match) return null;
  let epoch = Number(match[1]);
  if (!Number.isFinite(epoch)) return null;
  if (epoch < 1e12) epoch *= 1000;
  return Math.max(60_000, epoch - Date.now() + 30_000);
}
function classifyFailure(status, text = '') {
  const t = String(text).toLowerCase();
  if (status === 429 && /free-models-per-day|daily.*limit|openrouter_free_tier_daily/.test(t)) {
    return { state: 'ACCOUNT_QUOTA_EXHAUSTED', retryMs: quotaResetMs(text) || 24 * 60 * 60 * 1000, accountWide: true };
  }
  if (status === 429 || /rate.?limit|upstream_429/.test(t)) return { state: 'RATE_LIMITED', retryMs: 5 * 60 * 1000, accountWide: false };
  if (status === 404 && /data policy|free model training/.test(t)) return { state: 'POLICY_BLOCKED', retryMs: 6 * 60 * 60 * 1000, accountWide: false };
  if (status === 404 && /no endpoints|model.*not found|unknown model|retired/.test(t)) return { state: 'ENDPOINT_UNAVAILABLE', retryMs: 6 * 60 * 60 * 1000, accountWide: false };
  if (status === 408 || status >= 500) return { state: 'UPSTREAM_UNAVAILABLE', retryMs: 2 * 60 * 1000, accountWide: false };
  return { state: 'REQUEST_FAILED', retryMs: 10 * 60 * 1000, accountWide: false };
}
function quotaBlock(root) {
  const usage = loadUsage(root);
  const retryAt = Date.parse(usage?.quota_retry_after || '');
  if (usage?.quota_state === 'ACCOUNT_QUOTA_EXHAUSTED' && Number.isFinite(retryAt) && retryAt > Date.now()) {
    return { blocked: true, retry_after: usage.quota_retry_after, reason: usage.quota_reason || 'OpenRouter free account quota exhausted' };
  }
  return { blocked: false, retry_after: null, reason: null };
}
function setQuotaBlock(root, reason, retryMs) {
  const usage = loadUsage(root);
  usage.quota_state = 'ACCOUNT_QUOTA_EXHAUSTED';
  usage.quota_reason = String(reason || '').replace(/\s+/g, ' ').slice(0, 600);
  usage.quota_observed_at = now();
  usage.quota_retry_after = new Date(Date.now() + Math.max(60_000, Number(retryMs) || 60_000)).toISOString();
  usage.updated_at = now();
  writeJsonAtomic(OPENROUTER_SCREEN_USAGE_REL, usage, root);
  appendJsonl('events/screen-factory-openrouter.jsonl', { event: 'SCREEN_FACTORY_OPENROUTER_ACCOUNT_QUOTA_BLOCKED', retry_after: usage.quota_retry_after, at: now() }, root);
  return usage;
}
function clearExpiredQuotaBlock(root) {
  const usage = loadUsage(root);
  const retryAt = Date.parse(usage?.quota_retry_after || '');
  if (usage?.quota_state && (!Number.isFinite(retryAt) || retryAt <= Date.now())) {
    usage.quota_state = null; usage.quota_reason = null; usage.quota_observed_at = null; usage.quota_retry_after = null; usage.updated_at = now();
    writeJsonAtomic(OPENROUTER_SCREEN_USAGE_REL, usage, root);
  }
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
    scope: 'SCREEN_FACTORY_COMPOSITION_GENERATION_ONLY',
    manager_eligible: false, hermes_runtime_eligible: false, auxiliary_eligible: false,
    preferred_models: PREFERRED_SCREEN_MODELS,
    retirement_policy: 'LIVE_CATALOG_THEN_CURATED_CAPABILITY_SCORE_REPLACEMENT',
    data_policy: OPENROUTER_SCREEN_DATA_CLASS,
    provider_policy: { data_collection: 'allow', synthetic_contracts_only: true, require_parameters: true },
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
    scope: cfg?.scope ?? 'SCREEN_FACTORY_COMPOSITION_GENERATION_ONLY',
    preferred_models: PREFERRED_SCREEN_MODELS,
    active_models: selection?.active_models ?? [], replacements: selection?.replacements ?? [],
    retirement_policy: cfg?.retirement_policy ?? 'LIVE_CATALOG_THEN_CURATED_CAPABILITY_SCORE_REPLACEMENT',
    last_catalog_refresh: selection?.catalog_refreshed_at ?? null,
    model_health: loadModelHealth(root).models,
    usage: loadUsage(root),
  };
}
export async function refreshOpenRouterScreenCatalog({ root, fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(`${OPENROUTER_SCREEN_BASE_URL}/models`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`OpenRouter model catalog returned HTTP ${response.status}`);
  const payload = await response.json();
  const models = (payload?.data ?? []).filter(viable).map((model) => ({
    id: model.id, name: model.name, context_length: model.context_length,
    pricing: model.pricing, supported_parameters: model.supported_parameters ?? [], reasoning: model.reasoning ?? null,
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
  if (!catalogFresh(catalog)) {
    try { catalog = await refreshOpenRouterScreenCatalog({ root, fetchImpl }); }
    catch (error) {
      if (!catalog?.models?.length) throw error;
      appendJsonl('events/screen-factory-openrouter.jsonl', { event: 'SCREEN_FACTORY_OPENROUTER_CATALOG_STALE_FALLBACK', reason: String(error?.message || error).slice(0,300), cached_refreshed_at: catalog.refreshed_at || null, at: now() }, root);
    }
  }
  return { catalog, selection: selectOpenRouterScreenModels(catalog, root) };
}
function rotate(models, taskKey) {
  if (models.length < 2) return [...models];
  const hash = crypto.createHash('sha256').update(String(taskKey || '')).digest();
  const start = hash[0] % models.length;
  return [...models.slice(start), ...models.slice(0, start)];
}

function modelCoach(model) {
  if (model === 'z-ai/glm-5.2:free') return 'Use strict structure. Decide the viewport composition before markup. Do not expand every contract feature into visible content.';
  if (model === 'minimax/minimax-m3:free') return 'Use strong frontend composition and refined CSS. Avoid repetitive card stacks, generic templates and unnecessary scroll depth.';
  if (model === 'nvidia/nemotron-3-ultra-550b-a55b:free') return 'Use deep hierarchy reasoning, but keep UI copy concise. Return exactly one JSON object even when response_format is unavailable.';
  return 'Match the Dial Health premium benchmark exactly; preserve concise consumer hierarchy, structured JSON and viewport-first composition.';
}
function compositionCoach(model) {
  if (model === 'minimax/minimax-m3:free') return 'Plan the whole screen family first, then emit concise DSL. Vary hierarchy where tasks differ; keep each screen compact and deliberate.';
  if (model === 'z-ai/glm-5.2:free') return 'Use strict schema discipline and contract indices. Repair hierarchy precisely without adding regions or actions that are not needed.';
  if (model === 'nvidia/nemotron-3-ultra-550b-a55b:free') return 'Use hierarchy reasoning to preserve task clarity and family coherence; output only compact DSL with no explanatory prose.';
  return 'Return concise, schema-valid premium composition DSL only. Preserve contract coverage, viewport discipline and family-level variety.';
}
function screenRoleSystemPrompt(role, model) {
  const common = 'Use only the supplied synthetic product contract. Never browse, call tools, request secrets, or invent patient/provider/clinical/financial truth. Never expose chain-of-thought. Return only the exact JSON object requested.';
  const coach = modelCoach(model);
  const composition = compositionCoach(model);
  if (role === 'batch_composer') return `You are the Dial Health platform-family composition designer. Return only compact composition DSL records for all supplied screen contracts. Think across the family for coherence without cloning layouts. Never output HTML/CSS or invented data. ${common} ${composition}`;
  if (role === 'composition_repair') return `You are the Dial Health composition repair specialist. Correct only the compact composition DSL using deterministic QA feedback; preserve every canonical function and avoid expanding the screen. Never output HTML/CSS. ${common} ${composition}`;
  if (role === 'art_director') return `You are the independent Dial Health premium UI art director. Critique visual hierarchy, density, composition, brand coherence, component polish and platform-native feel. Do not rewrite product truth. ${common} ${coach}`;
  if (role === 'repair_polisher') return `You are the Dial Health senior UI designer and implementation polisher. Repair the supplied draft using the art-director corrections and produce a finished App-Store-quality implementation packet. ${common} ${coach}`;
  if (role === 'final_auditor') return `You are the Dial Health final visual-quality auditor. Score the implementation against the supplied premium benchmark and fail any template-like, crowded, overlong or unpolished consumer screen. ${common} ${coach}`;
  return `You are the authoritative Dial Health premium screen designer/compiler. Produce a finished, implementation-ready, App-Store-quality screen rather than a wireframe or admin template. ${common} ${coach}`;
}


function reasoningConfig(meta) {
  const profile = meta?.reasoning ?? {};
  if (!profile.mandatory) return { enabled: false, exclude: true };
  if (profile.supports_max_tokens) return { max_tokens: 1800, exclude: true };
  const efforts = Array.isArray(profile.supported_efforts) ? profile.supported_efforts : [];
  const effort = efforts.includes('low') ? 'low' : (efforts.includes('medium') ? 'medium' : efforts.at(-1));
  return effort ? { effort, exclude: true } : { enabled: true, exclude: true };
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
export async function callOpenRouterScreenCompiler({ content, root, taskKey, fetchImpl = globalThis.fetch, maxOutputTokens = 20000, role = 'lead_designer', excludeModels = [] } = {}) {
  clearExpiredQuotaBlock(root);
  const quota = quotaBlock(root);
  if (quota.blocked) throw new Error(`OpenRouter Screen Factory account quota blocked until ${quota.retry_after}: ${quota.reason}`);
  const status = openRouterScreenGeneratorStatus(root);
  if (!status.enabled) throw new Error('OpenRouter Screen Factory generation is not configured');
  const cfg = readJson(OPENROUTER_SCREEN_CONFIG_REL, null, root);
  if (cfg?.scope !== 'SCREEN_FACTORY_COMPOSITION_GENERATION_ONLY') throw new Error('OpenRouter key scope is not Screen Factory composition generation only');
  const key = readKey(root);
  const { catalog, selection } = await currentSelection(root, fetchImpl);
  // Quality-first deterministic role order: preferred healthy models first, then curated replacements.
  // Different roles use excludeModels to force independent review without randomizing into weaker models.
  const rolePreference = role === 'batch_composer'
    ? ['minimax/minimax-m3:free','z-ai/glm-5.2:free','nvidia/nemotron-3-ultra-550b-a55b:free']
    : role === 'composition_repair'
      ? ['z-ai/glm-5.2:free','minimax/minimax-m3:free','nvidia/nemotron-3-ultra-550b-a55b:free']
      : PREFERRED_SCREEN_MODELS;
  const activeSet = new Set(selection.active_models);
  const primaryOrder = [...rolePreference.filter((id)=>activeSet.has(id)), ...selection.active_models.filter((id)=>!rolePreference.includes(id))];
  const replacementOrder = (catalog.models ?? []).map((m) => m.id).filter((id) => !primaryOrder.includes(id));
  const allModels = [...primaryOrder, ...replacementOrder];
  const excluded = new Set((excludeModels || []).map(String));
  const filtered = allModels.filter((id) => !excluded.has(id));
  const models = filtered.length ? filtered : allModels;
  const failures = [];
  for (const model of models) {
    if (healthBlocked(loadModelHealth(root).models?.[model])) continue;
    const meta = catalog.models.find((item) => item.id === model);
    const params = new Set(meta?.supported_parameters ?? []);
    const body = {
      model,
      messages: [
        { role: 'system', content: screenRoleSystemPrompt(role, model) },
        { role: 'user', content: String(content ?? '') },
      ],
      temperature: 0,
      max_tokens: Math.max(['batch_composer','composition_repair'].includes(role) ? 1024 : 4096, Math.min(24000, Number(maxOutputTokens) || 20000)),
      reasoning: reasoningConfig(meta),
      // Free-provider training is permitted ONLY because this isolated key receives synthetic product contracts.
      // PHI, credentials and real member/provider records remain prohibited by the Screen Factory boundary.
      provider: { data_collection: 'allow', require_parameters: true },
    };
    if (params.has('response_format')) body.response_format = { type: 'json_object' };
    let response;
    recordApiMetric(root, { role, model, attempted: 1 });
    try {
      response = await fetchImpl(`${OPENROUTER_SCREEN_BASE_URL}/chat/completions`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify(body), signal: AbortSignal.timeout(['art_director','final_auditor'].includes(role) ? 120000 : 180000),
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
      if (classified.accountWide) {
        const usage = setQuotaBlock(root, detail, classified.retryMs);
        throw new Error(`OpenRouter Screen Factory account quota blocked until ${usage.quota_retry_after}: ${detail}`);
      }
      continue;
    }
    let payload;
    try { payload = await response.json(); }
    catch (error) {
      const detail = `response body failed: ${String(error?.name || error?.message || error).slice(0,180)}`;
      failures.push(`${model}: ${detail}`); recordModelHealth(root, model, 'UPSTREAM_UNAVAILABLE', detail, 2 * 60 * 1000); continue;
    }
    const resolved = String(payload?.model || model);
    if (resolved !== model) {
      const detail = `resolved model mismatch ${resolved}`; failures.push(`${model}: ${detail}`);
      recordModelHealth(root, model, 'IDENTITY_MISMATCH', detail, 60 * 60 * 1000);
      continue;
    }
    const output = responseText(payload);
    if (!output) { failures.push(`${model}: empty output`); recordModelHealth(root, model, 'EMPTY_OUTPUT', 'empty output', 10 * 60 * 1000); continue; }
    const normalized = output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'');
    let jsonOk = false;
    try { JSON.parse(normalized); jsonOk = true; } catch {}
    if (!jsonOk) {
      const a = normalized.indexOf('{'), b = normalized.lastIndexOf('}');
      if (a >= 0 && b > a) { try { JSON.parse(normalized.slice(a,b+1)); jsonOk = true; } catch {} }
    }
    if (!jsonOk) {
      const detail = `malformed JSON output (${normalized.length} chars)`;
      failures.push(`${model}: ${detail}`);
      recordModelHealth(root, model, 'MALFORMED_OUTPUT', detail, 10 * 60 * 1000);
      continue;
    }
    recordModelHealth(root, model, 'HEALTHY', 'compile completed', 0);
    const usage = payload?.usage || null; recordApiMetric(root, { role, model, successful: 1, usage });
    appendJsonl('events/screen-factory-openrouter.jsonl', {
      event: 'SCREEN_FACTORY_OPENROUTER_COMPILE_COMPLETE', task_key: taskKey || null, role,
      model, authority: OPENROUTER_SCREEN_AUTHORITY, usage, at: now(),
    }, root);
    return { response: output, runtime: 'openrouter_free_screen_compiler', model, role, selection, attempt_failures: failures, usage };
  }
  appendJsonl('events/screen-factory-openrouter.jsonl', {
    event: 'SCREEN_FACTORY_OPENROUTER_COMPILE_FAILED', task_key: taskKey || null, role,
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
