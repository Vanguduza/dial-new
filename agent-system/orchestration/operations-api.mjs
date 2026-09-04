#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { appendJsonl, ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';

export const OPERATIONS_API_CONFIG_REL = 'operations/api-config.json';
export const OPERATIONS_API_KEY_REL = 'secrets/operations-api.key';
export const OPERATIONS_API_AUTHORITY = 'NON_AUTHORITATIVE_AUXILIARY_OPERATIONS_ONLY';
const SUPPORTED_PROVIDERS = new Set(['openai-compatible', 'anthropic']);

function now() { return new Date().toISOString(); }
function cleanText(value, max = 200) { return String(value ?? '').trim().slice(0, max); }
function normalizeBaseUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:') throw new Error('operations API base URL must use https');
  if (url.username || url.password) throw new Error('operations API base URL must not contain credentials');
  url.search = ''; url.hash = '';
  return url.toString().replace(/\/$/, '');
}
function keyPath(root) { return resolveControlPath(OPERATIONS_API_KEY_REL, root); }
function readKey(root) {
  const target = keyPath(root);
  const stat = fs.statSync(target);
  if ((stat.mode & 0o077) !== 0) throw new Error('operations API key file permissions must be 0600');
  const key = fs.readFileSync(target, 'utf8').trim();
  if (key.length < 8) throw new Error('operations API key is missing or invalid');
  return key;
}

export function operationsApiStatus(root) {
  const cfg = readJson(OPERATIONS_API_CONFIG_REL, null, root);
  let keyConfigured = false, keyMode = null;
  try { const stat = fs.statSync(keyPath(root)); keyConfigured = stat.isFile(); keyMode = (stat.mode & 0o777).toString(8).padStart(3, '0'); } catch {}
  const keyPermissionsSecure = keyConfigured && keyMode === '600';
  return {
    schema_version: 1,
    authority: OPERATIONS_API_AUTHORITY,
    configured: Boolean(cfg && keyPermissionsSecure),
    enabled: Boolean(cfg?.enabled && keyPermissionsSecure),
    provider: cfg?.provider ?? null,
    base_url: cfg?.base_url ?? null,
    model: cfg?.model ?? null,
    protocol: cfg?.protocol ?? null,
    timeout_ms: cfg?.timeout_ms ?? null,
    max_output_tokens: cfg?.max_output_tokens ?? null,
    key_configured: keyConfigured,
    key_file_mode: keyMode,
    key_permissions_secure: keyPermissionsSecure,
    key_material_exposed: false,
    updated_at: cfg?.updated_at ?? null,
  };
}

export function configureOperationsApi({ provider = 'openai-compatible', baseUrl, model, apiKey, enabled = true, timeoutMs = 30000, maxOutputTokens = 1200 } = {}, root) {
  ensureControlLayout(root);
  if (!SUPPORTED_PROVIDERS.has(provider)) throw new Error(`unsupported operations API provider: ${provider}`);
  const normalizedUrl = normalizeBaseUrl(baseUrl || (provider === 'anthropic' ? 'https://api.anthropic.com/v1' : ''));
  const normalizedModel = cleanText(model, 200);
  if (!normalizedModel) throw new Error('operations API model is required');
  const secret = String(apiKey ?? '').trim();
  if (secret.length < 8) throw new Error('operations API key is required');
  const target = keyPath(root);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, `${secret}\n`, { encoding: 'utf8', mode: 0o600, flag: 'w' });
  fs.chmodSync(target, 0o600);
  writeJsonAtomic(OPERATIONS_API_CONFIG_REL, {
    schema_version: 1,
    enabled: Boolean(enabled),
    provider,
    protocol: provider === 'anthropic' ? 'anthropic-messages' : 'openai-chat-completions',
    base_url: normalizedUrl,
    model: normalizedModel,
    timeout_ms: Math.max(5000, Math.min(120000, Number(timeoutMs) || 30000)),
    max_output_tokens: Math.max(128, Math.min(4096, Number(maxOutputTokens) || 1200)),
    authority: OPERATIONS_API_AUTHORITY,
    updated_at: now(),
  }, root);
  appendJsonl('events/operations-api.jsonl', { event: 'OPERATIONS_API_CONFIGURED', provider, model: normalizedModel, authority: OPERATIONS_API_AUTHORITY, at: now() }, root);
  return operationsApiStatus(root);
}

export function disableOperationsApi(root) {
  const cfg = readJson(OPERATIONS_API_CONFIG_REL, null, root);
  if (!cfg) return operationsApiStatus(root);
  writeJsonAtomic(OPERATIONS_API_CONFIG_REL, { ...cfg, enabled: false, updated_at: now() }, root);
  appendJsonl('events/operations-api.jsonl', { event: 'OPERATIONS_API_DISABLED', at: now() }, root);
  return operationsApiStatus(root);
}

export function clearOperationsApi(root) {
  for (const rel of [OPERATIONS_API_CONFIG_REL, OPERATIONS_API_KEY_REL]) {
    try { fs.rmSync(resolveControlPath(rel, root), { force: true }); } catch {}
  }
  appendJsonl('events/operations-api.jsonl', { event: 'OPERATIONS_API_CLEARED', at: now() }, root);
  return operationsApiStatus(root);
}

export function sanitizeOperationsEvidence(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  text = text
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+\/-]{8,}/gi, '$1 [REDACTED]')
    .replace(/"([^"]*(?:API_KEY|TOKEN|SECRET|PASSWORD)[^"]*)"\s*:\s*"[^"]*"/gi, '"$1": "[REDACTED]"')
    .replace(/\b([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))\b\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_API_KEY]');
  return text.slice(0, 80000);
}

export async function summarizeOperationsEvidence({ purpose, evidence, root, fetchImpl = globalThis.fetch } = {}) {
  const cfg = readJson(OPERATIONS_API_CONFIG_REL, null, root);
  const status = operationsApiStatus(root);
  if (!cfg?.enabled || !status.key_configured) {
    return { authority: OPERATIONS_API_AUTHORITY, state: 'API_NOT_ENABLED', summary: null };
  }
  const key = readKey(root);
  const sanitized = sanitizeOperationsEvidence(evidence);
  const system = [
    'You are a non-authoritative infrastructure operations summarizer.',
    'Use only the evidence supplied. Do not invent facts.',
    'Never authorize development, deployment, financial, security, or product decisions.',
    'Never output secrets. Never request tools. Never issue executable commands.',
    'Return a concise evidence-grounded summary, risks, and items requiring human or manager-model review.',
  ].join(' ');
  const userContent = `Purpose: ${cleanText(purpose, 500)}\n\nDeterministic evidence:\n${sanitized}`;
  const anthropic = cfg.provider === 'anthropic';
  const endpoint = anthropic ? `${cfg.base_url}/messages` : `${cfg.base_url}/chat/completions`;
  const headers = anthropic
    ? { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    : { 'content-type': 'application/json', authorization: `Bearer ${key}` };
  const body = anthropic
    ? { model: cfg.model, system, messages: [{ role: 'user', content: userContent }], temperature: 0, max_tokens: cfg.max_output_tokens }
    : { model: cfg.model, messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }], temperature: 0, max_tokens: cfg.max_output_tokens };
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeout_ms),
    });
  } catch (error) {
    appendJsonl('events/operations-api.jsonl', { event: 'OPERATIONS_API_CALL_FAILED', reason: cleanText(error?.message || error, 1000), at: now() }, root);
    return { authority: OPERATIONS_API_AUTHORITY, state: 'API_CALL_FAILED', summary: null, reason: cleanText(error?.message || error, 1000) };
  }
  if (!response.ok) {
    const reason = `provider returned HTTP ${response.status}`;
    appendJsonl('events/operations-api.jsonl', { event: 'OPERATIONS_API_CALL_FAILED', reason, at: now() }, root);
    return { authority: OPERATIONS_API_AUTHORITY, state: 'API_CALL_FAILED', summary: null, reason };
  }
  const payload = await response.json();
  const content = anthropic ? payload?.content : payload?.choices?.[0]?.message?.content;
  const summary = Array.isArray(content) ? content.map((part) => part?.text ?? '').join('\n').trim().slice(0, 12000) : cleanText(content, 12000);
  appendJsonl('events/operations-api.jsonl', { event: 'OPERATIONS_API_SUMMARY_COMPLETED', provider: cfg.provider, model: cfg.model, purpose: cleanText(purpose, 500), at: now() }, root);
  return { authority: OPERATIONS_API_AUTHORITY, state: 'COMPLETED', provider: cfg.provider, model: cfg.model, summary };
}

function argValue(args, name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }
async function readStdin() { const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk); return Buffer.concat(chunks).toString('utf8').trim(); }

async function main() {
  const command = process.argv[2] || 'status';
  const args = process.argv.slice(3);
  if (command === 'status') return console.log(JSON.stringify(operationsApiStatus(), null, 2));
  if (command === 'configure') {
    if (!args.includes('--api-key-stdin')) throw new Error('configure requires --api-key-stdin; API keys are never accepted as command-line arguments');
    const apiKey = await readStdin();
    return console.log(JSON.stringify(configureOperationsApi({ provider: argValue(args, '--provider') || 'openai-compatible', baseUrl: argValue(args, '--base-url'), model: argValue(args, '--model'), apiKey }, undefined), null, 2));
  }
  if (command === 'disable') return console.log(JSON.stringify(disableOperationsApi(), null, 2));
  if (command === 'clear') return console.log(JSON.stringify(clearOperationsApi(), null, 2));
  throw new Error(`unknown operations API command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
