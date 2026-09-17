#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const repoDir = path.resolve(process.env.DIAL_REPO_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd());
const SOURCES = Object.freeze({
  feature: 'agent-system/registries/FEATURE_REGISTRY.json',
  decision: 'agent-system/registries/DECISION_LOG.json',
  module: 'agent-system/registries/MODULE_INDEX.json',
  donor: 'agent-system/registries/DONOR_APPLICABILITY_REGISTRY.json',
});
const MAX_LIMIT = 25;
const MAX_TEXT = 24_000;
const TOOLS = [
  ['get_feature', 'Read one canonical Feature registry row.', 'feature_id'],
  ['get_decision', 'Read one locked/evolved decision row.', 'decision_id'],
  ['get_module', 'Read one module-index row.', 'module_id'],
  ['get_donor', 'Read one donor-applicability row.', 'donor_id'],
  ['get_evidence', 'Find bounded canonical references to an evidence ID.', 'evidence_id'],
  ['search_canon', 'Search the bounded canonical registries with cursor pagination.', 'query'],
].map(([name, description, required]) => ({ name, description, inputSchema: { type: 'object', properties: { [required]: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT }, cursor: { type: 'integer', minimum: 0 } }, required: [required], additionalProperties: false } }));

function read(rel) { return JSON.parse(fs.readFileSync(path.join(repoDir, rel), 'utf8')); }
function rows(kind) {
  const value = read(SOURCES[kind]);
  if (Array.isArray(value)) return value;
  for (const key of ['modules', 'donors', 'rows', 'entries']) if (Array.isArray(value?.[key])) return value[key];
  return Object.entries(value || {}).filter(([, item]) => item && typeof item === 'object').map(([id, item]) => ({ id, ...item }));
}
function identifier(row, kind) { return row?.[`${kind}_id`] || row?.id || row?.module || row?.name || null; }
function bounded(value) {
  const text = JSON.stringify(value);
  if (text.length <= MAX_TEXT) return value;
  return { truncated: true, sha256_note: 'result exceeded the read-only MCP response bound', excerpt: text.slice(0, MAX_TEXT) };
}
function one(kind, id) {
  const row = rows(kind).find((item) => identifier(item, kind) === id);
  return row ? { found: true, source: SOURCES[kind], id, row: bounded(row) } : { found: false, source: SOURCES[kind], id };
}
function search(query, limit = 10, cursor = 0) {
  const q = String(query).toLowerCase();
  const all = Object.keys(SOURCES).flatMap((kind) => rows(kind).map((row) => ({ kind, id: identifier(row, kind), source: SOURCES[kind], row })));
  const hits = all.filter((item) => JSON.stringify(item.row).toLowerCase().includes(q)).sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  const start = Math.max(0, Number(cursor) || 0); const size = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || 10));
  return { query, cursor: start, limit: size, total: hits.length, next_cursor: start + size < hits.length ? start + size : null, results: hits.slice(start, start + size).map((item) => ({ kind: item.kind, id: item.id, source: item.source, row: bounded(item.row) })) };
}
function evidence(id, limit = 10, cursor = 0) {
  const refs = rows('feature').filter((row) => (row.evidence_refs || []).includes(id) || JSON.stringify(row.evidence_refs || []).includes(id)).map((row) => ({ kind: 'feature', id: row.feature_id, source: SOURCES.feature, evidence_refs: row.evidence_refs || [] }));
  const start = Math.max(0, Number(cursor) || 0); const size = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || 10));
  return { evidence_id: id, found: refs.length > 0, cursor: start, next_cursor: start + size < refs.length ? start + size : null, results: refs.slice(start, start + size) };
}
function invoke(name, args = {}) {
  if (name === 'get_feature') return one('feature', args.feature_id);
  if (name === 'get_decision') return one('decision', args.decision_id);
  if (name === 'get_module') return one('module', args.module_id);
  if (name === 'get_donor') return one('donor', args.donor_id);
  if (name === 'get_evidence') return evidence(args.evidence_id, args.limit, args.cursor);
  if (name === 'search_canon') return search(args.query, args.limit, args.cursor);
  throw new Error(`unknown read-only tool: ${name}`);
}
function send(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function result(id, value) { return { jsonrpc: '2.0', id, result: value }; }
async function handle(message) {
  if (message.method === 'initialize') return result(message.id, { protocolVersion: message.params?.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'dial-truth', version: '1.0.0' }, instructions: 'Read-only bounded Project Truth projection. Repository authority remains canonical.' });
  if (message.method === 'notifications/initialized') return null;
  if (message.method === 'ping') return result(message.id, {});
  if (message.method === 'tools/list') return result(message.id, { tools: TOOLS });
  if (message.method === 'tools/call') {
    try { const value = invoke(message.params?.name, message.params?.arguments); return result(message.id, { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value, isError: false }); }
    catch (error) { return result(message.id, { content: [{ type: 'text', text: error.message }], isError: true }); }
  }
  return { jsonrpc: '2.0', id: message.id ?? null, error: { code: -32601, message: `method not found: ${message.method}` } };
}
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => { if (!line.trim()) return; let message; try { message = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); } const response = await handle(message); if (response) send(response); });
