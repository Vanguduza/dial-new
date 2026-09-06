#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  appendJsonl, ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic,
} from './state-store.mjs';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_AUX_AUTHORITY = 'NON_AUTHORITATIVE_AUXILIARY_REASONING_ONLY';
export const OPENROUTER_KEY_REL = 'secrets/openrouter-auxiliary.key';
export const OPENROUTER_CONFIG_REL = 'auxiliary/openrouter-config.json';
export const OPENROUTER_CATALOG_REL = 'auxiliary/openrouter-model-catalog.json';
export const OPENROUTER_DATA_CLASS = 'SYNTHETIC_NON_SENSITIVE';

const APPROVED = Object.freeze({
  'z-ai/glm-5.2:free': { structured: true, deep: 92 },
  'nvidia/nemotron-3-ultra-550b-a55b:free': { structured: false, deep: 100 },
  'nvidia/nemotron-3-super-120b-a12b:free': { structured: true, deep: 94 },
  'minimax/minimax-m3:free': { structured: true, deep: 91 },
  'minimax/minimax-m2.7:free': { structured: true, deep: 88 },
  'nvidia/nemotron-3.5-lightning:free': { structured: false, deep: 84 },
});
const PURPOSE_ORDER = Object.freeze({
  contract_lint: [
    'z-ai/glm-5.2:free', 'nvidia/nemotron-3-super-120b-a12b:free',
    'minimax/minimax-m3:free', 'nvidia/nemotron-3-ultra-550b-a55b:free',
  ],
  deep_review: [
    'nvidia/nemotron-3-ultra-550b-a55b:free', 'z-ai/glm-5.2:free',
    'nvidia/nemotron-3-super-120b-a12b:free', 'minimax/minimax-m3:free',
  ],
  copy_assist: [
    'minimax/minimax-m3:free', 'z-ai/glm-5.2:free',
    'nvidia/nemotron-3-super-120b-a12b:free', 'minimax/minimax-m2.7:free',
  ],
});

function now() { return new Date().toISOString(); }
function keyPath(root) { return resolveControlPath(OPENROUTER_KEY_REL, root); }
function freePrice(value) { return Number(value ?? NaN) === 0; }
function secretLike(text) {
  return /(sk-[A-Za-z0-9_-]{12,}|api[_-]?key\s*[=:]|bearer\s+[A-Za-z0-9._~+\/-]{8,}|password\s*[=:]|private[_-]?key)/i.test(text);
}
export function openRouterAuxStatus(root) {
  const cfg = readJson(OPENROUTER_CONFIG_REL, null, root);
  let keyConfigured = false, keyMode = null;
  try {
    const stat = fs.statSync(keyPath(root));
    keyConfigured = stat.isFile();
    keyMode = (stat.mode & 0o777).toString(8).padStart(3, '0');
  } catch {}
  return {
    schema_version: 1,
    authority: OPENROUTER_AUX_AUTHORITY,
    development_authority: false,
    manager_eligible: false,
    runtime_fallback_eligible: false,
    base_url: OPENROUTER_BASE_URL,
    configured: Boolean(cfg && keyConfigured && keyMode === '600'),
    enabled: Boolean(cfg?.enabled && keyConfigured && keyMode === '600'),
    key_configured: keyConfigured,
    key_file_mode: keyMode,
    key_material_exposed: false,
    model_policy: 'CURATED_FREE_REASONING_ONLY_NO_FREE_ROUTER',
    updated_at: cfg?.updated_at ?? null,
  };
}
export function configureOpenRouterAux({ apiKey, enabled = true } = {}, root) {
  ensureControlLayout(root);
  const secret = String(apiKey ?? '').trim();
  if (secret.length < 16) throw new Error('OpenRouter auxiliary API key is required');
  const target = keyPath(root);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, `${secret}\n`, { encoding: 'utf8', mode: 0o600, flag: 'w' });
  fs.chmodSync(target, 0o600);
  writeJsonAtomic(OPENROUTER_CONFIG_REL, {
    schema_version: 1,
    enabled: Boolean(enabled),
    base_url: OPENROUTER_BASE_URL,
    authority: OPENROUTER_AUX_AUTHORITY,
    development_authority: false,
    manager_eligible: false,
    runtime_fallback_eligible: false,
    data_policy: 'SYNTHETIC_NON_SENSITIVE_ONLY',
    provider_policy: { data_collection: 'deny', require_parameters: true },
    updated_at: now(),
  }, root);
  appendJsonl('events/auxiliary-openrouter.jsonl', {
    event: 'OPENROUTER_AUX_CONFIGURED', authority: OPENROUTER_AUX_AUTHORITY, at: now(),
  }, root);
  return openRouterAuxStatus(root);
}
export async function refreshOpenRouterCatalog({ root, fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(`${OPENROUTER_BASE_URL}/models`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`OpenRouter model catalog returned HTTP ${response.status}`);
  const payload = await response.json();
  const models = (payload?.data ?? []).filter((model) => {
    const pricing = model?.pricing ?? {};
    const params = new Set(model?.supported_parameters ?? []);
    return Boolean(
      APPROVED[model?.id]
      && model.id.endsWith(':free')
      && freePrice(pricing.prompt)
      && freePrice(pricing.completion)
      && params.has('reasoning')
      && Number(model.context_length ?? 0) >= 128000
    );
  }).map((model) => ({
    id: model.id,
    name: model.name,
    context_length: model.context_length,
    supported_parameters: model.supported_parameters ?? [],
    quality_profile: APPROVED[model.id],
  }));
  const catalog = {
    schema_version: 1,
    authority: OPENROUTER_AUX_AUTHORITY,
    source: `${OPENROUTER_BASE_URL}/models`,
    policy: 'EXPLICIT_CURATED_FREE_REASONING_MODELS_ONLY',
    models,
    refreshed_at: now(),
  };
  writeJsonAtomic(OPENROUTER_CATALOG_REL, catalog, root);
  appendJsonl('events/auxiliary-openrouter.jsonl', {
    event: 'OPENROUTER_AUX_CATALOG_REFRESHED', admitted: models.map((m) => m.id), at: now(),
  }, root);
  return catalog;
}

export function selectOpenRouterAuxModels(purpose = 'contract_lint', catalog = null) {
  const available = new Set((catalog?.models ?? []).map((model) => model.id));
  const order = PURPOSE_ORDER[purpose] ?? PURPOSE_ORDER.contract_lint;
  const selected = order.filter((id) => available.has(id));
  if (!selected.length) throw new Error(`no approved free reasoning models available for ${purpose}`);
  if (selected.some((id) => id === 'openrouter/free' || !id.endsWith(':free'))) {
    throw new Error('invalid OpenRouter auxiliary route');
  }
  return selected;
}
function readAuxKey(root) {
  const target = keyPath(root);
  const stat = fs.statSync(target);
  if ((stat.mode & 0o077) !== 0) throw new Error('OpenRouter auxiliary key file permissions must be 0600');
  return fs.readFileSync(target, 'utf8').trim();
}

export function assertAuxiliaryPayload({ content, dataClassification } = {}) {
  if (dataClassification !== OPENROUTER_DATA_CLASS) {
    throw new Error(`OpenRouter auxiliary input must be classified ${OPENROUTER_DATA_CLASS}`);
  }
  const text = typeof content === 'string' ? content : JSON.stringify(content ?? {});
  if (secretLike(text)) throw new Error('OpenRouter auxiliary input rejected: possible secret material');
  if (text.length > 120000) throw new Error('OpenRouter auxiliary input exceeds bounded payload limit');
  return text;
}

function responseText(payload) {
  const value = payload?.choices?.[0]?.message?.content;
  if (Array.isArray(value)) return value.map((p) => p?.text ?? '').join('\n').trim();
  return String(value ?? '').trim();
}
export async function callOpenRouterAux({
  purpose = 'contract_lint', content, dataClassification, root, fetchImpl = globalThis.fetch,
  structured = false, maxOutputTokens = 1800,
} = {}) {
  const status = openRouterAuxStatus(root);
  if (!status.enabled) return { authority: OPENROUTER_AUX_AUTHORITY, state: 'NOT_ENABLED' };
  const safeContent = assertAuxiliaryPayload({ content, dataClassification });
  let catalog = readJson(OPENROUTER_CATALOG_REL, null, root);
  if (!catalog?.models?.length) catalog = await refreshOpenRouterCatalog({ root, fetchImpl });
  let models = selectOpenRouterAuxModels(purpose, catalog);
  if (structured) {
    models = models.filter((id) => catalog.models.find((m) => m.id === id)?.supported_parameters?.includes('response_format'));
    if (!models.length) throw new Error(`no approved structured-output free reasoning model available for ${purpose}`);
  }
  const key = readAuxKey(root);
  const system = [
    'You are an auxiliary non-authoritative Dial Health Screen Factory reviewer.',
    'Use only the supplied synthetic/non-sensitive contract.',
    'Never change canonical requirements, manager decisions, runtime routing, or release gates.',
    'Never request tools, credentials, patient data, or external resources.',
    'Return suggestions or verification only. GPT-5.6 Sol / Claude Sonnet 5 remain authoritative.',
  ].join(' ');
  const body = {
    model: models[0],
    models,
    messages: [{ role: 'system', content: system }, { role: 'user', content: safeContent }],
    temperature: 0,
    max_tokens: Math.max(256, Math.min(4096, Number(maxOutputTokens) || 1800)),
    reasoning: { effort: 'high' },
    provider: { data_collection: 'deny', require_parameters: true },
  };
  if (structured) body.response_format = { type: 'json_object' };
  const response = await fetchImpl(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) {
    const reason = `OpenRouter auxiliary returned HTTP ${response.status}`;
    appendJsonl('events/auxiliary-openrouter.jsonl', { event: 'OPENROUTER_AUX_FAILED', purpose, reason, at: now() }, root);
    return { authority: OPENROUTER_AUX_AUTHORITY, state: 'FAILED', reason };
  }
  const payload = await response.json();
  const output = responseText(payload).slice(0, 16000);
  const usedModel = payload?.model ?? models[0];
  if (!models.includes(usedModel)) {
    throw new Error(`OpenRouter auxiliary resolved outside curated model list: ${usedModel}`);
  }
  appendJsonl('events/auxiliary-openrouter.jsonl', {
    event: 'OPENROUTER_AUX_COMPLETED', purpose, requested_models: models,
    resolved_model: usedModel, authority: OPENROUTER_AUX_AUTHORITY, at: now(),
  }, root);
  return {
    authority: OPENROUTER_AUX_AUTHORITY,
    development_authority: false,
    manager_eligible: false,
    state: 'COMPLETED',
    model: usedModel,
    output,
  };
}

async function readStdin() { const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk); return Buffer.concat(chunks).toString('utf8').trim(); }
async function main() {
  const command = process.argv[2] || 'status';
  if (command === 'status') return console.log(JSON.stringify(openRouterAuxStatus(), null, 2));
  if (command === 'catalog') return console.log(JSON.stringify(await refreshOpenRouterCatalog(), null, 2));
  if (command === 'configure') {
    if (!process.argv.includes('--api-key-stdin')) throw new Error('configure requires --api-key-stdin');
    const apiKey = await readStdin();
    return console.log(JSON.stringify(configureOpenRouterAux({ apiKey }), null, 2));
  }
  throw new Error(`unknown OpenRouter auxiliary command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
}
