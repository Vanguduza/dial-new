#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendJsonl, writeJsonAtomic } from './state-store.mjs';
import { recordRuntimeHealth } from './runtime-health.mjs';
import { registerConnection, registerRuntime, syncModelBindingFromRuntimeHealth } from './model-registry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const REQUESTED_MODEL = 'claude-sonnet-5';

function now() { return new Date().toISOString(); }

function resultObject(stdout) {
  try {
    const parsed = JSON.parse(stdout || 'null');
    if (Array.isArray(parsed)) return parsed.at(-1) ?? null;
    return parsed;
  } catch {
    return null;
  }
}

function classify(stderr = '', stdout = '') {
  const text = `${stderr}\n${stdout}`.toLowerCase();
  if (/authenticate|authentication|not logged|oauth|credential/.test(text)) return 'AUTH_FAILED';
  if (/weekly.*limit|usage.*limit|session.*limit|overagestatus.*rejected|capacity.*exhaust/.test(text)) return 'ACCOUNT_LIMITED';
  if (/rate.?limit|429|too many requests/.test(text)) return 'RATE_LIMITED';
  if (/overload|unavailable|503/.test(text)) return 'MODEL_LIMITED';
  return 'PROCESS_FAILED';
}

export function probeClaudeCode({ repoDir = DEFAULT_REPO, root, timeoutMs = 90000 } = {}) {
  const startedAt = now();
  const result = spawnSync('claude', [
    '-p', 'Reply with exactly DIAL_CLAUDE_OK. Do not use tools.',
    '--model', REQUESTED_MODEL,
    '--effort', 'low',
    '--output-format', 'json',
    '--permission-mode', 'plan',
    '--max-turns', '1',
    '--name', 'DIAL-SONNET-PROBE',
  ], {
    cwd: repoDir,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, DIAL_CONTROL_HOME: root || process.env.DIAL_CONTROL_HOME, DIAL_REPO_DIR: repoDir },
  });

  const structured = resultObject(result.stdout);
  const modelUsage = structured?.modelUsage ?? structured?.model_usage ?? {};
  const usedModels = Object.keys(modelUsage);
  const resolvedModel = usedModels.length === 1 ? usedModels[0] : null;
  const response = structured?.result ?? '';
  const responseOk = /DIAL_CLAUDE_OK/.test(response);
  const identityProven = resolvedModel === REQUESTED_MODEL;
  const state = result.status === 0 && responseOk && identityProven ? 'HEALTHY'
    : result.status === 0 ? 'TOOLCHAIN_DEGRADED'
      : classify(result.stderr, result.stdout);

  const probe = {
    event: 'CLAUDE_CODE_PROBE',
    state,
    requested_model: REQUESTED_MODEL,
    resolved_model: resolvedModel,
    identity_proven: identityProven,
    response_ok: responseOk,
    session_id: structured?.session_id ?? null,
    exit_status: result.status,
    signal: result.signal ?? null,
    used_models: usedModels,
    started_at: startedAt,
    finished_at: now(),
  };

  writeJsonAtomic('runtime-health/claude-code-probe.json', probe, root);
  appendJsonl('events/runtime-probes.jsonl', probe, root);
  const health = recordRuntimeHealth('claude_code', {
    state,
    requested_model: REQUESTED_MODEL,
    resolved_model: resolvedModel,
    reason: state === 'HEALTHY' ? 'official Claude Code probe passed with modelUsage provenance' : classify(result.stderr, result.stdout),
    details: { response_ok: responseOk, session_id: probe.session_id, used_models: usedModels },
  }, root);

  registerConnection({
    connection_id: 'claude-code-subscription',
    type: 'CLAUDE_CODE_SUBSCRIPTION',
    name: 'Claude Code subscription',
    auth_state: state === 'AUTH_FAILED' ? 'AUTH_REQUIRED' : 'AUTHENTICATED_OR_NOT_REQUIRED',
    discovery_supported: false,
  }, root);
  registerRuntime({
    runtime_id: 'claude_code',
    display_name: 'Claude Code',
    harness: 'Claude Code',
    connection_id: 'claude-code-subscription',
    capabilities: ['CHAT', 'TOOLS', 'REPOSITORY_READ', 'REPOSITORY_WRITE', 'SHELL', 'WORKER_PACKETS'],
    health: state,
    last_probe: health.observed_at,
  }, root);
  syncModelBindingFromRuntimeHealth({
    model_id: resolvedModel ?? REQUESTED_MODEL,
    display_name: resolvedModel ?? REQUESTED_MODEL,
    provider: 'Anthropic',
    runtime_id: 'claude_code',
    connection_id: 'claude-code-subscription',
    health,
    capabilities: ['CHAT', 'TOOLS', 'REPOSITORY_READ', 'REPOSITORY_WRITE', 'SHELL', 'WORKER_PACKETS'],
  }, root);
  return probe;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const probe = probeClaudeCode({ repoDir: process.env.DIAL_REPO_DIR || DEFAULT_REPO });
  process.stdout.write(`${JSON.stringify(probe, null, 2)}\n`);
  if (probe.state !== 'HEALTHY') process.exitCode = 1;
}
