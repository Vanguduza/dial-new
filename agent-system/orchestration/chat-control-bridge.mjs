#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { externalWorkStatus, submitExternalWork } from './external-orchestrator.mjs';
import { getProject, ensureProjectRegistry } from './project-registry.mjs';
import { operationsStatus } from './operations-plane.mjs';
import { sanitizeOperationsEvidence } from './operations-api.mjs';
import {
  DIAL_ROOT_MISSION_ID,
  ensureDialMission,
  listMissionApprovals,
  listMissionPackets,
  missionStatus,
  pauseDialMission,
  recordMissionApproval,
  resumeDialMission,
  setDialMissionPriority,
} from './mission-control.mjs';
import { appendJsonl, ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';
import { engineeringKnowledgeStatus } from './engineering-knowledge-broker.mjs';
import { engineeringResearchStatus } from './engineering-presearch.mjs';
import { runtimeCapacityStatus } from './runtime-capacity-status.mjs';

export const CHAT_CONTROL_AUTHORITY = 'DIAL_OPERATOR_CONTROL_SURFACE_ONLY';
export const CHAT_CONTROL_TOKEN_REL = 'secrets/chat-control.token';
const DEFAULT_HOST = process.env.DIAL_CHAT_CONTROL_HOST || '127.0.0.1';
const DEFAULT_PORT = Number(process.env.DIAL_CHAT_CONTROL_PORT || 9130);
const WRITE_TOOLS = new Set(['dial_submit_instruction', 'dial_pause_mission', 'dial_resume_mission', 'dial_reprioritize', 'dial_approve_gate', 'dial_reject_gate']);
const EVENT_FILES = [
  'events/mission-control.jsonl',
  'events/external-orchestrator.jsonl',
  'events/operations-plane.jsonl',
  'events/chat-control.jsonl',
  'events/engineering-knowledge.jsonl',
  'events/skill-outcomes.jsonl',
  'events/runtime-probes.jsonl',
  'events/runtime-identity.jsonl',
  'events/hermes-operational-turns.jsonl',
  'events/engineering-research.jsonl',
];

function now() { return new Date().toISOString(); }
function clean(value, max = 8000) { return String(value ?? '').trim().slice(0, max); }
function sha(value) { return crypto.createHash('sha256').update(String(value ?? '')).digest('hex'); }
function jsonText(value) { return JSON.stringify(value, null, 2); }
function rpcError(id, code, message, data) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }; }
function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }

function tokenPath(root) { return resolveControlPath(CHAT_CONTROL_TOKEN_REL, root); }
export function ensureChatControlToken(root) {
  ensureControlLayout(root);
  const target = tokenPath(root);
  try {
    const stat = fs.statSync(target);
    if ((stat.mode & 0o077) !== 0) fs.chmodSync(target, 0o600);
    const existing = fs.readFileSync(target, 'utf8').trim();
    if (existing.length >= 32) return { path: target, created: false, fingerprint: sha(existing).slice(0, 16) };
  } catch {}
  const token = crypto.randomBytes(32).toString('base64url');
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, `${token}\n`, { encoding: 'utf8', mode: 0o600, flag: 'w' });
  fs.chmodSync(target, 0o600);
  appendJsonl('events/chat-control.jsonl', { event: 'CHAT_CONTROL_TOKEN_CREATED', fingerprint: sha(token).slice(0, 16), at: now() }, root);
  return { path: target, created: true, fingerprint: sha(token).slice(0, 16) };
}
function readToken(root) { ensureChatControlToken(root); return fs.readFileSync(tokenPath(root), 'utf8').trim(); }
function timingSafeTokenEqual(provided, expected) {
  const a = Buffer.from(String(provided || '')); const b = Buffer.from(String(expected || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function gitValue(repo, args) {
  try { return execFileSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 10000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim(); }
  catch (error) { return clean(error?.stderr || error?.message || error, 2000); }
}
function repoSnapshot(repo) {
  const status = gitValue(repo, ['status', '--porcelain=v1']);
  return {
    repo_dir: repo,
    head: gitValue(repo, ['rev-parse', 'HEAD']),
    branch: gitValue(repo, ['branch', '--show-current']),
    remote: gitValue(repo, ['remote', 'get-url', 'origin']),
    dirty: Boolean(status),
    dirty_paths: status ? status.split('\n').slice(0, 200) : [],
  };
}

function ensureDialOnly(root) {
  ensureProjectRegistry(root, { dialRepoDir: process.env.DIAL_REPO_DIR });
  const project = getProject('dial', root);
  if (project.slug !== 'dial') throw new Error('chat control bridge is hard-bound to DIAL only');
  return project;
}

function readJsonl(rel, root) {
  const target = resolveControlPath(rel, root);
  try {
    return fs.readFileSync(target, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
      try { return { index, value: JSON.parse(line) }; } catch { return null; }
    }).filter(Boolean);
  } catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
}
function encodeCursor(offsets) { return Buffer.from(JSON.stringify(offsets), 'utf8').toString('base64url'); }
function decodeCursor(cursor) {
  if (!cursor) return {};
  try { const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8')); return parsed && typeof parsed === 'object' ? parsed : {}; }
  catch { throw new Error('invalid progress cursor'); }
}
function progressSince({ root, cursor, limit = 100 } = {}) {
  const offsets = decodeCursor(cursor); const events = [];
  for (const rel of EVENT_FILES) {
    const rows = readJsonl(rel, root); const start = Math.max(0, Number(offsets[rel] || 0));
    for (const row of rows.slice(start)) events.push({ source: rel, sequence: row.index + 1, ...row.value });
  }
  events.sort((a, b) => String(a.at || a.observed_at || '').localeCompare(String(b.at || b.observed_at || '')) || a.source.localeCompare(b.source) || a.sequence - b.sequence);
  const bounded = events.slice(0, Math.max(1, Math.min(500, Number(limit) || 100)));
  const next = { ...offsets };
  for (const event of bounded) next[event.source] = Math.max(Number(next[event.source] || 0), Number(event.sequence || 0));
  return { events: bounded, has_more: events.length > bounded.length, next_cursor: encodeCursor(next) };
}

function packetRecord(jobId, root) {
  const record = externalWorkStatus(jobId, root);
  if (!record) return null;
  const safe = JSON.parse(sanitizeOperationsEvidence(record));
  if (safe.instruction) safe.instruction = clean(safe.instruction, 4000);
  return safe;
}

function latestVerification(root) {
  const ops = operationsStatus(root);
  const latest = ops.last_runs?.dial?.deterministic_verify ?? null;
  return {
    latest_verification: latest,
    development_gate: readJson('state/external-orchestration-gate.json', null, root),
    control_plane: readJson('state/control-plane.json', null, root),
    runtime_health: readJson('state/runtime-health.json', null, root),
  };
}

function normalizeRequestId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/.test(id)) throw new Error('write controls require request_id (8-128 safe characters) for idempotency');
  return id;
}
function idempotencyRel(tool, requestId) { return `chat-control/idempotency/${tool}/${requestId}.json`; }
function readIdempotentResult(tool, args, root) {
  if (!WRITE_TOOLS.has(tool)) return null;
  const requestId = normalizeRequestId(args?.request_id);
  return readJson(idempotencyRel(tool, requestId), null, root);
}
function saveIdempotentResult(tool, args, result, root) {
  if (!WRITE_TOOLS.has(tool)) return;
  const requestId = normalizeRequestId(args?.request_id);
  writeJsonAtomic(idempotencyRel(tool, requestId), {
    schema_version: 1, project: 'dial', tool, request_id: requestId,
    result, result_sha256: sha(JSON.stringify(result || {})), created_at: now(),
  }, root);
}

function auditTool(root, tool, args, result) {
  appendJsonl('events/chat-control.jsonl', {
    event: 'CHAT_CONTROL_TOOL_CALLED', tool, mission_id: DIAL_ROOT_MISSION_ID,
    request_id: clean(args?.request_id, 120) || null,
    arguments_sha256: sha(JSON.stringify(args || {})),
    result_sha256: sha(JSON.stringify(result || {})), at: now(),
  }, root);
}

const TOOL_DEFS = Object.freeze([
  ['dial_project_status', 'Read the live DIAL repository, control-plane, queue and project binding status.', {}],
  ['dial_mission_status', 'Read the persistent Oracle DIAL root mission and current packet summary.', {}],
  ['dial_submit_instruction', 'Submit a bounded DIAL development instruction to the persistent Oracle queue. This does not execute in Claude chat.', { instruction: { type: 'string' }, priority: { type: 'integer', minimum: 0, maximum: 100 }, request_id: { type: 'string' } }],
  ['dial_list_packets', 'List DIAL root-mission packets and their states without exposing unrelated projects.', { limit: { type: 'integer', minimum: 1, maximum: 500 } }],
  ['dial_packet_status', 'Read one persisted DIAL packet, result and runtime provenance.', { packet_id: { type: 'string' } }],
  ['dial_progress_since', 'Read a cursor-based progress/event feed. Pass the returned next_cursor on the next call.', { cursor: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 500 } }],
  ['dial_pause_mission', 'Pause dispatch/claim of DIAL root-mission work after current executing work naturally finishes.', { reason: { type: 'string' }, request_id: { type: 'string' } }],
  ['dial_resume_mission', 'Resume the persistent DIAL root mission. Oracle, not this chat, continues execution.', { reason: { type: 'string' }, request_id: { type: 'string' } }],
  ['dial_reprioritize', 'Set the owner priority directive consumed by subsequent Oracle manager turns.', { directive: { type: 'string' }, request_id: { type: 'string' } }],
  ['dial_approve_gate', 'Record an explicit owner approval for a named DIAL gate/decision.', { gate_id: { type: 'string' }, rationale: { type: 'string' }, request_id: { type: 'string' } }],
  ['dial_reject_gate', 'Record an explicit owner rejection for a named DIAL gate/decision.', { gate_id: { type: 'string' }, rationale: { type: 'string' }, request_id: { type: 'string' } }],
  ['dial_verification_status', 'Read latest deterministic verification, development gate and runtime health evidence.', {}],
  ['dial_recent_failures', 'List recent failed DIAL root-mission packets.', { limit: { type: 'integer', minimum: 1, maximum: 100 } }],
  ['dial_evidence', 'Read the latest non-authoritative deterministic operations evidence prepared for DIAL.', {}],
  ['dial_skill_status', 'Backward-compatible VEKL status alias: read skills plus federated engineering-resource activation for a packet/current mission.', { packet_id: { type: 'string' } }],
  ['dial_engineering_knowledge_status', 'Read VEKL v2 skills, federated resource/source counts, current packet activation provenance and ahead-of-work research linkage.', { packet_id: { type: 'string' } }],
  ['dial_engineering_research_status', 'Read the current project-aware VEKL ahead-of-work forecast and passive resource-cache index.', {}],
  ['dial_runtime_capacity_status', 'Read Sol capacity-preservation state, exact-identity cache validity, provider cooldown and recent model-call suppression/usage evidence.', {}],
]);

const REQUIRED_ARGS = Object.freeze({
  dial_submit_instruction: ['instruction', 'request_id'],
  dial_packet_status: ['packet_id'],
  dial_pause_mission: ['request_id'],
  dial_resume_mission: ['request_id'],
  dial_reprioritize: ['directive', 'request_id'],
  dial_approve_gate: ['gate_id', 'request_id'],
  dial_reject_gate: ['gate_id', 'request_id'],
});
export const CHAT_CONTROL_TOOLS = TOOL_DEFS.map(([name, description, properties]) => ({ name, description, inputSchema: { type: 'object', properties, additionalProperties: false, required: REQUIRED_ARGS[name] || [] } }));

export async function callChatControlTool(name, args = {}, root) {
  const project = ensureDialOnly(root); ensureDialMission({ root, repoDir: project.repo_dir });
  const replay = readIdempotentResult(name, args, root);
  if (replay) {
    appendJsonl('events/chat-control.jsonl', { event: 'CHAT_CONTROL_IDEMPOTENT_REPLAY', tool: name, request_id: args.request_id, mission_id: DIAL_ROOT_MISSION_ID, at: now() }, root);
    return replay.result;
  }
  let result;
  if (name === 'dial_project_status') result = { authority: CHAT_CONTROL_AUTHORITY, project, repository: repoSnapshot(project.repo_dir), operations: operationsStatus(root), queue: externalWorkStatus(null, root), mission_controller: readJson('state/mission-controller-heartbeat.json', null, root), engineering_knowledge: engineeringKnowledgeStatus({ repoDir: project.repo_dir, root }) };
  else if (name === 'dial_mission_status') result = missionStatus(root);
  else if (name === 'dial_submit_instruction') {
    const instruction = clean(args.instruction, 30000); if (!instruction) throw new Error('instruction is required');
    const mission = ensureDialMission({ root, repoDir: project.repo_dir });
    if (mission.state === 'COMPLETE') throw new Error('root mission is complete');
    result = submitExternalWork({ root, repoDir: project.repo_dir, instruction, requestedBy: 'claude_chat', metadata: { mission_id: mission.mission_id, priority: Math.max(0, Math.min(100, Number(args.priority ?? 60))), request_id: normalizeRequestId(args.request_id), submitted_via: 'CHAT_CONTROL_BRIDGE' } });
  }
  else if (name === 'dial_list_packets') result = { mission_id: DIAL_ROOT_MISSION_ID, packets: listMissionPackets({ root, limit: args.limit }) };
  else if (name === 'dial_packet_status') result = packetRecord(clean(args.packet_id, 160), root);
  else if (name === 'dial_progress_since') result = progressSince({ root, cursor: args.cursor, limit: args.limit });
  else if (name === 'dial_pause_mission') result = pauseDialMission({ root, reason: args.reason || 'paused from Claude chat' });
  else if (name === 'dial_resume_mission') result = resumeDialMission({ root, reason: args.reason || 'resumed from Claude chat' });
  else if (name === 'dial_reprioritize') result = setDialMissionPriority({ root, directive: args.directive });
  else if (name === 'dial_approve_gate') result = recordMissionApproval({ root, gateId: args.gate_id, decision: 'APPROVED', rationale: args.rationale, requestedBy: 'claude_chat' });
  else if (name === 'dial_reject_gate') result = recordMissionApproval({ root, gateId: args.gate_id, decision: 'REJECTED', rationale: args.rationale, requestedBy: 'claude_chat' });
  else if (name === 'dial_verification_status') result = latestVerification(root);
  else if (name === 'dial_recent_failures') result = { failures: listMissionPackets({ root, limit: 500 }).filter((p) => p.state === 'FAILED').slice(0, Math.max(1, Math.min(100, Number(args.limit) || 20))) };
  else if (name === 'dial_evidence') result = readJson('operations/projects/dial/latest/evidence_prepare.json', { state: 'NO_EVIDENCE_PREPARED' }, root);
  else if (name === 'dial_skill_status' || name === 'dial_engineering_knowledge_status') result = engineeringKnowledgeStatus({ repoDir: project.repo_dir, root, packetId: clean(args.packet_id, 180) || null });
  else if (name === 'dial_engineering_research_status') result = engineeringResearchStatus(root);
  else if (name === 'dial_runtime_capacity_status') result = runtimeCapacityStatus({ repoDir: project.repo_dir, root });
  else throw new Error(`unknown DIAL chat-control tool: ${name}`);
  saveIdempotentResult(name, args, result, root);
  auditTool(root, name, args, result);
  return result;
}

async function handleRpc(body, root) {
  const id = body?.id; const method = body?.method;
  if (method === 'initialize') return rpcResult(id, { protocolVersion: body?.params?.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'dial-oracle-control', version: '1.0.0' }, instructions: 'DIAL-only operator control surface. Oracle owns execution and persistence; the chat is a thin control console.' });
  if (method === 'notifications/initialized') return null;
  if (method === 'ping') return rpcResult(id, {});
  if (method === 'tools/list') return rpcResult(id, { tools: CHAT_CONTROL_TOOLS });
  if (method === 'tools/call') {
    const name = body?.params?.name; const args = body?.params?.arguments || {};
    try {
      const value = await callChatControlTool(name, args, root);
      return rpcResult(id, { content: [{ type: 'text', text: jsonText(value) }], structuredContent: value, isError: false });
    } catch (error) {
      const message = clean(error?.message || error, 4000);
      return rpcResult(id, { content: [{ type: 'text', text: message }], isError: true });
    }
  }
  return rpcError(id, -32601, `method not found: ${method}`);
}

function sendJson(res, status, value) { const payload = JSON.stringify(value); res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), 'cache-control': 'no-store' }); res.end(payload); }
async function readBody(req, max = 1024 * 1024) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > max) throw new Error('request body too large'); chunks.push(chunk); } return Buffer.concat(chunks).toString('utf8'); }

export function createChatControlServer({ root, host = DEFAULT_HOST, port = DEFAULT_PORT } = {}) {
  ensureControlLayout(root); ensureChatControlToken(root); const expected = readToken(root);
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { service: 'dial-chat-control', project: 'dial', authority: CHAT_CONTROL_AUTHORITY, state: 'UP', at: now() });
    if (req.url !== '/mcp') return sendJson(res, 404, { error: 'not found' });
    const auth = String(req.headers.authorization || ''); const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!timingSafeTokenEqual(provided, expected)) return sendJson(res, 401, { error: 'unauthorized' });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST required' });
    try {
      const raw = await readBody(req); const body = JSON.parse(raw); const response = await handleRpc(body, root);
      if (response === null) { res.writeHead(202, { 'cache-control': 'no-store' }); return res.end(); }
      return sendJson(res, 200, response);
    } catch (error) { return sendJson(res, 400, rpcError(null, -32700, clean(error?.message || error, 4000))); }
  });
  server.listen(port, host, () => {
    writeJsonAtomic('state/chat-control-heartbeat.json', { service: 'dial-chat-control', project: 'dial', pid: process.pid, host, port, authority: CHAT_CONTROL_AUTHORITY, state: 'RUNNING', token_fingerprint: ensureChatControlToken(root).fingerprint, at: now() }, root);
  });
  const stop = () => server.close(() => process.exit(0)); process.on('SIGTERM', stop); process.on('SIGINT', stop);
  return server;
}

async function main() {
  const command = process.argv[2] || 'serve';
  if (command === 'serve') { createChatControlServer({}); return; }
  if (command === 'token-init') return console.log(JSON.stringify(ensureChatControlToken(), null, 2));
  if (command === 'tools') return console.log(JSON.stringify(CHAT_CONTROL_TOOLS, null, 2));
  if (command === 'call') { const name = process.argv[3]; const args = process.argv[4] ? JSON.parse(process.argv[4]) : {}; return console.log(JSON.stringify(await callChatControlTool(name, args), null, 2)); }
  throw new Error(`unknown chat-control command: ${command}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
