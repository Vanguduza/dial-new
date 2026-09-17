#!/usr/bin/env node
import readline from 'node:readline';

const EXA_MCP_URL = 'https://mcp.exa.ai/mcp';
const ALLOWED_TOOLS = new Set(['web_search_exa', 'web_fetch_exa']);
const ALLOWED_METHODS = new Set(['initialize', 'notifications/initialized', 'ping', 'tools/list', 'tools/call']);
const TIMEOUT_MS = 60_000;
let sessionId = null;

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function parseSse(text) {
  const messages = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    try { messages.push(JSON.parse(payload)); } catch {}
  }
  return messages.at(-1) ?? null;
}

async function remote(message) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    const response = await fetch(EXA_MCP_URL, {
      method: 'POST', headers, body: JSON.stringify(message), signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Exa MCP HTTP ${response.status}`);
    const newSession = response.headers.get('mcp-session-id');
    if (newSession) sessionId = newSession;
    if (response.status === 202 || response.status === 204) return null;
    const text = await response.text();
    if (!text.trim()) return null;
    if ((response.headers.get('content-type') || '').includes('text/event-stream')) return parseSse(text);
    try { return JSON.parse(text); } catch { throw new Error('Exa MCP returned non-JSON response'); }
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeToolsList(response) {
  if (!response?.result?.tools) return response;
  const tools = response.result.tools.filter((tool) => ALLOWED_TOOLS.has(tool?.name));
  const names = new Set(tools.map((tool) => tool.name));
  for (const required of ALLOWED_TOOLS) {
    if (!names.has(required)) throw new Error(`required Exa MCP tool missing: ${required}`);
  }
  return { ...response, result: { ...response.result, tools } };
}

async function handle(message) {
  const method = message?.method;
  const id = message?.id;
  if (!method || !ALLOWED_METHODS.has(method)) {
    if (id === undefined) return null;
    return jsonRpcError(id, -32601, 'method not admitted by DIAL Exa MCP boundary');
  }
  if (method === 'tools/call') {
    const tool = message?.params?.name;
    if (!ALLOWED_TOOLS.has(tool)) return jsonRpcError(id, -32601, `tool not admitted by DIAL Exa MCP boundary: ${tool || 'unknown'}`);
  }
  const response = await remote(message);
  return method === 'tools/list' ? sanitizeToolsList(response) : response;
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  let message;
  try { message = JSON.parse(line); }
  catch { process.stdout.write(`${JSON.stringify(jsonRpcError(null, -32700, 'parse error'))}\n`); continue; }
  try {
    const response = await handle(message);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    if (message.id !== undefined) process.stdout.write(`${JSON.stringify(jsonRpcError(message.id, -32603, String(error?.message || error).slice(0, 500)))}\n`);
  }
}
