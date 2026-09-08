#!/usr/bin/env node
import readline from 'node:readline';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendJsonl, writeJsonAtomic } from './state-store.mjs';
import { recordRuntimeHealth } from './runtime-health.mjs';
import {
  loadHermesPlanModels,
  parseCodexModelListEvidence,
  saveHermesPlanModels,
} from './hermes-plan-models.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const REQUESTED_MODEL = 'gpt-5.6-sol';

function now() { return new Date().toISOString(); }

function classifyCodexError(error) {
  const info = error?.codexErrorInfo ?? error?.codex_error_info ?? null;
  const text = JSON.stringify({ error, info }).toLowerCase();
  if (/usagelimitexceeded|sessionbudgetexceeded|usage.*limit|budget.*exceed/.test(text)) return 'ACCOUNT_LIMITED';
  if (/unauthorized|login|oauth|auth/.test(text)) return 'AUTH_FAILED';
  if (/429|rate.*limit/.test(text)) return 'RATE_LIMITED';
  if (/overload|unavailable|503/.test(text)) return 'MODEL_LIMITED';
  if (/httpconnectionfailed|responsestreamconnectionfailed|disconnected|too.*failed.*attempt/.test(text)) return 'PROCESS_FAILED';
  return 'UNKNOWN';
}

export async function probeCodexAppServer({ repoDir = DEFAULT_REPO, root, timeoutMs = 90000 } = {}) {
  const startedAt = now();
  const child = spawn('codex', ['app-server', '--listen', 'stdio://'], {
    cwd: repoDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    if (stderr.length > 12000) stderr = stderr.slice(-12000);
  });

  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  let nextId = 1;
  const pending = new Map();
  let thread = null;
  let reroute = null;
  let terminalError = null;
  let finalMessage = '';
  let completedTurn = null;

  function rejectPending(error) {
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  }

  child.on('error', (error) => {
    terminalError = terminalError ?? { message: String(error?.message || error), codexErrorInfo: 'AppServerProcessError' };
    rejectPending(error);
  });

  function send(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function request(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send({ id, method, params });
    });
  }

  const timeout = setTimeout(() => {
    terminalError = { message: `probe timeout after ${timeoutMs}ms`, codexErrorInfo: 'ProbeTimeout' };
    child.kill('SIGTERM');
  }, timeoutMs);

  const done = new Promise((resolve) => {
    rl.on('line', (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.id != null && pending.has(msg.id)) {
        const waiter = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) waiter.reject(Object.assign(new Error(msg.error.message || 'Codex RPC error'), { rpc: msg.error }));
        else waiter.resolve(msg.result);
        return;
      }
      if (msg.method === 'model/rerouted') reroute = msg.params ?? msg;
      if (msg.method === 'error') terminalError = msg.params?.error ?? msg.params ?? msg;
      if (msg.method === 'item/agentMessage/delta') finalMessage += msg.params?.delta ?? '';
      if (msg.method === 'item/completed' && msg.params?.item?.type === 'agentMessage') {
        finalMessage = msg.params.item.text ?? finalMessage;
      }
      if (msg.method === 'turn/completed') {
        completedTurn = msg.params?.turn ?? msg.params ?? null;
        resolve();
      }
    });
    child.on('exit', (code, signal) => {
      if (pending.size) rejectPending(new Error(`Codex App Server exited before RPC completion (code=${code}, signal=${signal})`));
      resolve();
    });
  });

  let rpcFailure = null;
  try {
    await request('initialize', {
      clientInfo: { name: 'dial_hermes_runtime_probe', title: 'DIAL Hermes Runtime Probe', version: '1.0.0' },
      capabilities: { experimentalApi: true },
    });
    send({ method: 'initialized' });
    const threadResult = await request('thread/start', {
      model: REQUESTED_MODEL,
      cwd: repoDir,
      ephemeral: true,
      approvalPolicy: 'never',
      permissions: ':read-only',
      allowProviderModelFallback: false,
    });
    thread = threadResult?.thread ?? null;
    if (!thread?.id) throw new Error('Codex thread/start did not return a thread id');

    await request('turn/start', {
      threadId: thread.id,
      input: [{ type: 'text', text: 'Reply with exactly DIAL_CODEX_OK and do not use tools.' }],
      model: REQUESTED_MODEL,
      effort: 'low',
      approvalPolicy: 'never',
      permissions: ':read-only',
    });
    await done;
  } catch (error) {
    rpcFailure = error?.rpc ?? { message: String(error?.message || error) };
  } finally {
    clearTimeout(timeout);
    if (!child.killed) child.kill('SIGTERM');
    rl.close();
  }

  const error = terminalError ?? completedTurn?.error ?? rpcFailure;
  const threadModel = thread?.model ?? thread?.modelId ?? null;
  const reroutedTo = reroute?.toModel ?? reroute?.to_model ?? null;
  const resolvedModel = reroutedTo ?? threadModel;
  const responseOk = /DIAL_CODEX_OK/.test(finalMessage);
  const identityProven = resolvedModel === REQUESTED_MODEL && !reroute;
  const state = error ? classifyCodexError(error) : (responseOk && identityProven ? 'HEALTHY' : 'TOOLCHAIN_DEGRADED');

  const probe = {
    event: 'CODEX_APP_SERVER_PROBE',
    state,
    requested_model: REQUESTED_MODEL,
    resolved_model: resolvedModel,
    identity_proven: identityProven,
    rerouted: reroute,
    response_ok: responseOk,
    thread_id: thread?.id ?? null,
    error: error ?? null,
    stderr_tail: stderr ? stderr.slice(-3000) : null,
    started_at: startedAt,
    finished_at: now(),
  };

  writeJsonAtomic('runtime-health/codex-app-server-probe.json', probe, root);
  appendJsonl('events/runtime-probes.jsonl', probe, root);
  recordRuntimeHealth('codex_app_server', {
    state,
    requested_model: REQUESTED_MODEL,
    resolved_model: resolvedModel,
    reason: error
      ? JSON.stringify(error).slice(0, 2000)
      : (identityProven ? 'direct Codex App Server probe passed' : 'model identity not proven'),
    details: {
      identity_proven: identityProven,
      rerouted: Boolean(reroute),
      source: 'codex_app_server_probe',
      response_ok: responseOk,
      thread_id: thread?.id ?? null,
      toolchain_usable: state === 'HEALTHY' && responseOk && identityProven,
    },
  }, root);

  return probe;
}

async function withCodexAppServerRpc({ repoDir = DEFAULT_REPO, timeoutMs = 30000, run } = {}) {
  const child = spawn('codex', ['app-server', '--listen', 'stdio://'], {
    cwd: repoDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    if (stderr.length > 12000) stderr = stderr.slice(-12000);
  });

  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  let nextId = 1;
  const pending = new Map();

  function rejectPending(error) {
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  }

  child.on('error', (error) => rejectPending(error));
  child.on('exit', (code, signal) => {
    if (pending.size) rejectPending(new Error(`Codex App Server exited before RPC completion (code=${code}, signal=${signal})`));
  });

  function send(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function request(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send({ id, method, params });
    });
  }

  const timeout = setTimeout(() => {
    child.kill('SIGTERM');
  }, timeoutMs);

  rl.on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id != null && pending.has(msg.id)) {
      const waiter = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) waiter.reject(Object.assign(new Error(msg.error.message || 'Codex RPC error'), { rpc: msg.error }));
      else waiter.resolve(msg.result);
    }
  });

  try {
    return await run({ request, send, child });
  } finally {
    clearTimeout(timeout);
    if (!child.killed) child.kill('SIGTERM');
    rl.close();
    void stderr;
  }
}

export async function listCodexPlanModelsFromAppServer({ repoDir = DEFAULT_REPO, timeoutMs = 30000 } = {}) {
  return withCodexAppServerRpc({
    repoDir,
    timeoutMs,
    run: async ({ request, send }) => {
      await request('initialize', {
        clientInfo: { name: 'dial_hermes_plan_list', title: 'DIAL Hermes Plan Model List', version: '1.0.0' },
        capabilities: { experimentalApi: true },
      });
      send({ method: 'initialized' });

      const pages = [];
      let cursor = null;
      for (let i = 0; i < 20; i += 1) {
        const params = { limit: 100, includeHidden: false };
        if (cursor) params.cursor = cursor;
        const result = await request('model/list', params);
        pages.push({ result });
        cursor = result?.nextCursor ?? result?.next_cursor ?? null;
        if (!cursor) break;
      }
      return pages;
    },
  });
}

export async function listCodexPlanModels({
  repoDir = DEFAULT_REPO,
  root,
  timeoutMs = 30000,
  listRunner,
} = {}) {
  let source = 'unavailable';
  let sourceDetail = null;
  let raw = null;
  let error = null;

  try {
    if (typeof listRunner === 'function') {
      raw = await listRunner();
      source = 'injected';
      sourceDetail = 'caller-provided Codex plan/list evidence; no model names invented';
    } else {
      raw = await listCodexPlanModelsFromAppServer({ repoDir, timeoutMs });
      source = 'codex_app_server_model_list';
      sourceDetail = 'Codex App Server model/list after initialize; no thread/turn probe';
    }
  } catch (caught) {
    error = String(caught?.message || caught);
    source = 'unavailable';
    sourceDetail = `Codex CLI has no first-class models command; App Server model/list failed: ${error}`.slice(0, 1000);
  }

  const listed = parseCodexModelListEvidence(raw);
  const current = loadHermesPlanModels(root);
  const recorded = saveHermesPlanModels({
    ...current,
    runtimes: {
      ...current.runtimes,
      codex_app_server: {
        source,
        source_detail: sourceDetail,
        models: listed,
      },
    },
  }, root);

  writeJsonAtomic('runtime-health/codex-plan-models.json', {
    event: 'CODEX_PLAN_MODELS_LISTED',
    authority: 'HERMES_RUNTIME_ONLY',
    source,
    source_detail: sourceDetail,
    models: listed.map((model) => model.id),
    error,
    listed_at: now(),
  }, root);

  return {
    source,
    source_detail: sourceDetail,
    models: recorded.runtimes.codex_app_server.models,
    error,
  };
}

async function main() {
  if (process.argv.includes('--list-models')) {
    const listed = await listCodexPlanModels({ repoDir: process.env.DIAL_REPO_DIR || DEFAULT_REPO });
    process.stdout.write(`${JSON.stringify(listed, null, 2)}\n`);
    if (listed.source === 'unavailable') process.exitCode = 1;
    return;
  }
  const probe = await probeCodexAppServer({ repoDir: process.env.DIAL_REPO_DIR || DEFAULT_REPO });
  process.stdout.write(`${JSON.stringify(probe, null, 2)}\n`);
  if (probe.state !== 'HEALTHY') process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
