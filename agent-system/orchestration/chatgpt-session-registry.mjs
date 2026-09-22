#!/usr/bin/env node
import crypto from 'node:crypto';
import { appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';

const REGISTRY_REL = 'sessions/chatgpt/index.json';
const EVENT_REL = 'events/chatgpt-sessions.jsonl';

export const CHATGPT_SESSION_STATES = Object.freeze([
  'STARTING',
  'READY',
  'BUSY',
  'WAITING_FOR_OWNER',
  'DEGRADED',
  'RECOVERING',
  'CLOSING',
  'CLOSED',
]);

export const CHATGPT_SESSION_SURFACES = Object.freeze([
  'CODEX_CHATGPT_OAUTH',
  'CODEX_APP_SERVER',
  'CHATGPT_DESKTOP',
]);

function now() { return new Date().toISOString(); }
function clean(value, name) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}
function bounded(value, max = 4000) {
  const text = value == null ? null : String(value);
  if (text == null) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function loadChatGptSessionRegistry(root) {
  return readJson(REGISTRY_REL, {
    schema_version: 1,
    authority: 'HERMES',
    updated_at: null,
    sessions: {},
  }, root);
}

function persist(registry, root) {
  registry.schema_version = 1;
  registry.authority = 'HERMES';
  registry.updated_at = now();
  writeJsonAtomic(REGISTRY_REL, registry, root);
  return registry;
}

function event(root, payload) {
  const record = { ...payload, at: now() };
  appendJsonl(EVENT_REL, record, root);
  return record;
}

export function registerChatGptSession({
  root,
  sessionRef = crypto.randomUUID(),
  commanderId,
  host,
  project,
  workspace,
  surface = 'CODEX_CHATGPT_OAUTH',
  state = 'STARTING',
  taskId = null,
  threadId = null,
  processId = null,
  metadata = {},
} = {}) {
  if (!CHATGPT_SESSION_STATES.includes(state)) throw new Error(`invalid session state: ${state}`);
  if (!CHATGPT_SESSION_SURFACES.includes(surface)) throw new Error(`invalid ChatGPT session surface: ${surface}`);
  const registry = loadChatGptSessionRegistry(root);
  const id = clean(sessionRef, 'sessionRef');
  if (registry.sessions[id] && registry.sessions[id].state !== 'CLOSED') {
    throw new Error(`active session already exists: ${id}`);
  }
  const timestamp = now();
  const record = {
    session_ref: id,
    commander_id: clean(commanderId, 'commanderId'),
    host: clean(host, 'host'),
    project: clean(project, 'project'),
    workspace: clean(workspace, 'workspace'),
    surface,
    state,
    task_id: taskId ? String(taskId) : null,
    thread_id: threadId ? String(threadId) : null,
    process_id: processId == null ? null : String(processId),
    context_fingerprint: metadata?.context_fingerprint ?? null,
    branch: metadata?.branch ?? null,
    repository_head: metadata?.repository_head ?? null,
    created_at: timestamp,
    updated_at: timestamp,
    last_heartbeat: timestamp,
    last_checkpoint: null,
    checkpoint_summary: null,
    metadata: { ...metadata },
  };
  registry.sessions[id] = record;
  persist(registry, root);
  event(root, { event: 'CHATGPT_SESSION_REGISTERED', session_ref: id, commander_id: record.commander_id, host: record.host, project: record.project, surface });
  return record;
}

export function updateChatGptSession(sessionRef, patch = {}, root) {
  const registry = loadChatGptSessionRegistry(root);
  const id = clean(sessionRef, 'sessionRef');
  const current = registry.sessions[id];
  if (!current) throw new Error(`unknown session: ${id}`);
  if (patch.state && !CHATGPT_SESSION_STATES.includes(patch.state)) throw new Error(`invalid session state: ${patch.state}`);
  if (patch.surface && !CHATGPT_SESSION_SURFACES.includes(patch.surface)) throw new Error(`invalid session surface: ${patch.surface}`);
  const next = {
    ...current,
    ...patch,
    session_ref: id,
    commander_id: current.commander_id,
    host: current.host,
    project: current.project,
    workspace: current.workspace,
    updated_at: now(),
  };
  registry.sessions[id] = next;
  persist(registry, root);
  event(root, { event: 'CHATGPT_SESSION_UPDATED', session_ref: id, state: next.state, task_id: next.task_id ?? null });
  return next;
}

export function heartbeatChatGptSession(sessionRef, { state = null, processId = null, threadId = null } = {}, root) {
  const patch = { last_heartbeat: now() };
  if (state) patch.state = state;
  if (processId != null) patch.process_id = String(processId);
  if (threadId != null) patch.thread_id = String(threadId);
  return updateChatGptSession(sessionRef, patch, root);
}

export function checkpointChatGptSession(sessionRef, {
  summary,
  taskId = null,
  contextFingerprint = null,
  branch = null,
  repositoryHead = null,
  state = null,
} = {}, root) {
  const timestamp = now();
  const patch = {
    last_checkpoint: timestamp,
    checkpoint_summary: bounded(summary, 12000),
  };
  if (taskId != null) patch.task_id = String(taskId);
  if (contextFingerprint != null) patch.context_fingerprint = String(contextFingerprint);
  if (branch != null) patch.branch = String(branch);
  if (repositoryHead != null) patch.repository_head = String(repositoryHead);
  if (state) patch.state = state;
  const updated = updateChatGptSession(sessionRef, patch, root);
  event(root, { event: 'CHATGPT_SESSION_CHECKPOINTED', session_ref: updated.session_ref, state: updated.state, task_id: updated.task_id });
  return updated;
}

export function closeChatGptSession(sessionRef, { reason = 'OWNER_OR_HERMES_CLOSED' } = {}, root) {
  const updated = updateChatGptSession(sessionRef, {
    state: 'CLOSED',
    closed_at: now(),
    close_reason: bounded(reason, 1000),
  }, root);
  event(root, { event: 'CHATGPT_SESSION_CLOSED', session_ref: updated.session_ref, reason: updated.close_reason });
  return updated;
}

export function selectReusableChatGptSession({
  project,
  commanderId = null,
  host = null,
  workspace = null,
  contextFingerprint = null,
  root,
} = {}) {
  const registry = loadChatGptSessionRegistry(root);
  const reusableStates = new Set(['READY', 'WAITING_FOR_OWNER']);
  const matches = Object.values(registry.sessions)
    .filter((session) => reusableStates.has(session.state))
    .filter((session) => session.project === project)
    .filter((session) => commanderId == null || session.commander_id === commanderId)
    .filter((session) => host == null || session.host === host)
    .filter((session) => workspace == null || session.workspace === workspace)
    .filter((session) => contextFingerprint == null || session.context_fingerprint === contextFingerprint)
    .sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at));
  return matches[0] ?? null;
}

export function markStaleChatGptSessions({
  root,
  nowMs = Date.now(),
  maxHeartbeatAgeMs = 10 * 60 * 1000,
} = {}) {
  const registry = loadChatGptSessionRegistry(root);
  const changed = [];
  for (const session of Object.values(registry.sessions)) {
    if (!['STARTING', 'READY', 'BUSY', 'RECOVERING'].includes(session.state)) continue;
    const observed = Date.parse(session.last_heartbeat || session.updated_at || session.created_at);
    if (!Number.isFinite(observed) || nowMs - observed <= maxHeartbeatAgeMs) continue;
    session.state = 'DEGRADED';
    session.degraded_reason = 'HEARTBEAT_STALE';
    session.updated_at = new Date(nowMs).toISOString();
    changed.push(session.session_ref);
    event(root, { event: 'CHATGPT_SESSION_DEGRADED', session_ref: session.session_ref, reason: 'HEARTBEAT_STALE' });
  }
  if (changed.length) persist(registry, root);
  return changed;
}

function parseJsonArg(value, fallback = {}) {
  if (!value) return fallback;
  return JSON.parse(value);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const root = process.env.DIAL_CONTROL_HOME;
  if (command === 'list' || !command) {
    process.stdout.write(`${JSON.stringify(loadChatGptSessionRegistry(root), null, 2)}\n`);
    return;
  }
  if (command === 'register') {
    process.stdout.write(`${JSON.stringify(registerChatGptSession({ ...parseJsonArg(args[0]), root }), null, 2)}\n`);
    return;
  }
  if (command === 'update') {
    process.stdout.write(`${JSON.stringify(updateChatGptSession(clean(args[0], 'sessionRef'), parseJsonArg(args[1]), root), null, 2)}\n`);
    return;
  }
  if (command === 'checkpoint') {
    process.stdout.write(`${JSON.stringify(checkpointChatGptSession(clean(args[0], 'sessionRef'), parseJsonArg(args[1]), root), null, 2)}\n`);
    return;
  }
  if (command === 'heartbeat') {
    process.stdout.write(`${JSON.stringify(heartbeatChatGptSession(clean(args[0], 'sessionRef'), parseJsonArg(args[1]), root), null, 2)}\n`);
    return;
  }
  if (command === 'close') {
    process.stdout.write(`${JSON.stringify(closeChatGptSession(clean(args[0], 'sessionRef'), parseJsonArg(args[1]), root), null, 2)}\n`);
    return;
  }
  if (command === 'mark-stale') {
    process.stdout.write(`${JSON.stringify({ degraded: markStaleChatGptSessions({ root }) }, null, 2)}\n`);
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
