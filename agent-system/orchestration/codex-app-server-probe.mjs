#!/usr/bin/env node
import readline from 'node:readline';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendJsonl, writeJsonAtomic } from './state-store.mjs';
import { recordRuntimeHealth } from './runtime-health.mjs';
import { registerConnection, registerRuntime, syncModelBindingFromRuntimeHealth } from './model-registry.mjs';

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
  child.stderr.on('data', (chunk) => { stderr += chunk; if (stderr.length > 12000) stderr = stderr.slice(-12000); });

  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  let nextId = 1;
  const pending = new Map();
  let thread = null;
  let reroute = null;
  let terminalError = null;
  let finalMessage = '';
  let completedTurn = null;

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
      if (msg.method === 'item/completed' && msg.params?.item?.type === 'agentMessage') finalMessage = msg.params.item.text ?? finalMessage;
      if (msg.method === 'turn/completed') {
        completedTurn = msg.params?.turn ?? msg.params ?? null;
        resolve();
      }
    });
    child.on('exit', () => resolve());
  });

  let rpcFailure = null;
  try {
    await request('initialize', {
      clientInfo: { name: 'dial_control_plane_probe', title: 'DIAL Control Plane Probe', version: '1.0.0' },
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
  const health = recordRuntimeHealth('codex_app_server', {
    state,
    requested_model: REQUESTED_MODEL,
    resolved_model: resolvedModel,
    reason: error ? JSON.stringify(error).slice(0, 2000) : (identityProven ? 'direct app-server probe passed' : 'model identity not proven'),
    details: { rerouted: Boolean(reroute), response_ok: responseOk, thread_id: thread?.id ?? null },
  }, root);

  registerConnection({
    connection_id: 'codex-chatgpt-subscription',
    type: 'CODEX_CHATGPT_SUBSCRIPTION',
    name: 'Codex / ChatGPT subscription',
    auth_state: state === 'AUTH_FAILED' ? 'AUTH_REQUIRED' : 'AUTHENTICATED_OR_NOT_REQUIRED',
    discovery_supported: false,
  }, root);
  registerRuntime({
    runtime_id: 'codex_app_server',
    display_name: 'Codex App Server',
    harness: 'Codex App Server / Codex CLI',
    connection_id: 'codex-chatgpt-subscription',
    capabilities: ['CHAT', 'TOOLS', 'REPOSITORY_READ', 'REPOSITORY_WRITE', 'SHELL', 'WORKER_PACKETS'],
    health: state,
    last_probe: health.observed_at,
  }, root);
  syncModelBindingFromRuntimeHealth({
    model_id: resolvedModel ?? REQUESTED_MODEL,
    display_name: resolvedModel ?? REQUESTED_MODEL,
    provider: 'OpenAI',
    runtime_id: 'codex_app_server',
    connection_id: 'codex-chatgpt-subscription',
    health,
    capabilities: ['CHAT', 'TOOLS', 'REPOSITORY_READ', 'REPOSITORY_WRITE', 'SHELL', 'WORKER_PACKETS'],
  }, root);
  return probe;
}

async function main() {
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
