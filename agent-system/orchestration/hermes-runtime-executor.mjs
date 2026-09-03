#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildCheckpoint, saveCheckpoint } from './checkpoint-store.mjs';
import { buildDialHermesContext } from './context-broker.mjs';
import { runClaudeHermesFallback } from './claude-fallback-runner.mjs';
import { reconcileHermesRuntime } from './hermes-runtime-router.mjs';
import { loadRuntimeHealth, recordRuntimeHealth, runtimeEligible } from './runtime-health.mjs';
import { appendJsonl } from './state-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const PRIMARY_MODEL = 'gpt-5.6-sol';
const FALLBACK_MODEL = 'claude-sonnet-5';
const FAILOVER_STATES = new Set([
  'ACCOUNT_LIMITED',
  'RATE_LIMITED',
  'MODEL_LIMITED',
  'AUTH_FAILED',
  'PROCESS_FAILED',
  'TOOLCHAIN_DEGRADED',
]);

function now() { return new Date().toISOString(); }

function readJsonFile(target) {
  try { return JSON.parse(fs.readFileSync(target, 'utf8')); }
  catch { return null; }
}

function bounded(value, max = 4000) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function classifyPrimaryFailure({ stderr = '', stdout = '', usage = null, status = null, signal = null, error = null } = {}) {
  const text = [
    stderr,
    stdout,
    usage ? JSON.stringify(usage) : '',
    error ? String(error?.message || error) : '',
    signal || '',
  ].join('\n').toLowerCase();

  if (/authenticate|authentication|not logged|oauth|credential|unauthorized|401\b/.test(text)) return 'AUTH_FAILED';
  if (/weekly.*limit|usage.*limit|session.*limit|budget.*exceed|billing|insufficient.*credit|account.*limit|quota/.test(text)) return 'ACCOUNT_LIMITED';
  if (/rate.?limit|too many requests|429\b/.test(text)) return 'RATE_LIMITED';
  if (/overload|model.*unavailable|service unavailable|503\b/.test(text)) return 'MODEL_LIMITED';
  if (/rerout|identity.*mismatch|resolved.*model|unexpected.*model/.test(text)) return 'TOOLCHAIN_DEGRADED';
  if (
    signal
    || status === null
    || /codex app-server turn failed|broken pipe|connection.*(closed|failed|reset)|subprocess.*(exit|fail)|process.*(exit|fail)|timed? ?out|timeout|econnreset|econnrefused/.test(text)
  ) return 'PROCESS_FAILED';
  return status === 0 ? 'TOOLCHAIN_DEGRADED' : 'PROCESS_FAILED';
}

export function failoverEligible(state) {
  return FAILOVER_STATES.has(state);
}

export function runPrimaryHermes({
  repoDir = DEFAULT_REPO,
  instruction = '',
  root,
  timeoutMs = 30 * 60 * 1000,
} = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-hermes-primary-'));
  const usageFile = path.join(tempDir, 'usage.json');
  const startedAt = now();
  try {
    const result = spawnSync('hermes', [
      '-z',
      instruction,
      '--provider', 'openai-codex',
      '--model', PRIMARY_MODEL,
      '--usage-file', usageFile,
    ], {
      cwd: repoDir,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        DIAL_CONTROL_HOME: root || process.env.DIAL_CONTROL_HOME,
        DIAL_REPO_DIR: repoDir,
      },
    });

    const usage = readJsonFile(usageFile);
    const resolvedModel = usage?.model ?? null;
    const provider = usage?.provider ?? null;
    const identityProven = resolvedModel === PRIMARY_MODEL && provider === 'openai-codex';
    const completed = result.status === 0 && usage?.failed !== true && usage?.completed !== false;
    const ok = completed && identityProven;
    const state = ok
      ? 'HEALTHY'
      : (completed && !identityProven
        ? 'TOOLCHAIN_DEGRADED'
        : classifyPrimaryFailure({
          stderr: result.stderr,
          stdout: result.stdout,
          usage,
          status: result.status,
          signal: result.signal,
          error: result.error,
        }));

    const observation = recordRuntimeHealth('codex_app_server', {
      state,
      requested_model: PRIMARY_MODEL,
      resolved_model: resolvedModel,
      reason: ok
        ? 'operational Hermes turn completed through Codex App Server with exact Sol provenance'
        : `operational Hermes turn failed or lost hard-pin proof: ${state}`,
      details: {
        identity_proven: identityProven,
        toolchain_usable: ok,
        provider,
        session_id: usage?.session_id ?? null,
        exit_status: result.status,
        signal: result.signal ?? null,
        source: 'operational_turn',
      },
    }, root);

    return {
      ok,
      runtime: 'codex_app_server',
      requested_model: PRIMARY_MODEL,
      resolved_model: resolvedModel,
      state,
      response: result.stdout ?? '',
      usage,
      health: observation,
      stderr_tail: ok ? null : bounded(result.stderr),
      started_at: startedAt,
      finished_at: now(),
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function ensureClaudeFallbackEligible({ repoDir = DEFAULT_REPO, root } = {}) {
  let health = loadRuntimeHealth(root)?.runtimes?.claude_code ?? null;
  if (!runtimeEligible(health, { hardPin: true, requireFresh: true })) {
    const { probeClaudeCode } = await import('./claude-code-probe.mjs');
    probeClaudeCode({ repoDir, root });
    health = loadRuntimeHealth(root)?.runtimes?.claude_code ?? null;
  }
  if (!runtimeEligible(health, { hardPin: true, requireFresh: true })) {
    return { eligible: false, reason: 'CLAUDE_FALLBACK_NOT_HEALTHY', health };
  }
  const selection = reconcileHermesRuntime({ root });
  if (
    !selection.selected
    || selection.selection?.runtime !== 'claude_code'
    || selection.selection?.requested_model !== FALLBACK_MODEL
    || selection.selection?.resolved_model !== FALLBACK_MODEL
  ) {
    return { eligible: false, reason: 'CLAUDE_FALLBACK_NOT_SELECTED', health, selection };
  }
  return { eligible: true, health, selection: selection.selection };
}

export async function executeHermesInstruction({
  repoDir = DEFAULT_REPO,
  instruction = '',
  root,
  timeoutMs = 30 * 60 * 1000,
  primaryRunner = runPrimaryHermes,
  ensureFallback = ensureClaudeFallbackEligible,
  fallbackRunner = runClaudeHermesFallback,
  contextBuilder = buildDialHermesContext,
} = {}) {
  if (!String(instruction || '').trim()) throw new Error('instruction is required');

  const startedAt = now();
  const primary = await primaryRunner({ repoDir, instruction, root, timeoutMs });
  if (primary?.ok) {
    reconcileHermesRuntime({ root });
    const event = {
      event: 'HERMES_OPERATIONAL_TURN_COMPLETED',
      authority: 'HERMES_RUNTIME_ONLY',
      runtime: 'codex_app_server',
      requested_model: PRIMARY_MODEL,
      resolved_model: PRIMARY_MODEL,
      fallback_used: false,
      started_at: startedAt,
      finished_at: now(),
    };
    appendJsonl('events/hermes-operational-turns.jsonl', event, root);
    return { ...event, response: primary.response, primary };
  }

  const failureState = primary?.state || 'PROCESS_FAILED';
  if (!failoverEligible(failureState)) {
    const event = {
      event: 'HERMES_OPERATIONAL_TURN_FAILED',
      authority: 'HERMES_RUNTIME_ONLY',
      runtime: 'codex_app_server',
      fallback_used: false,
      failure_state: failureState,
      reason: 'PRIMARY_FAILURE_NOT_ELIGIBLE_FOR_RUNTIME_FAILOVER',
      started_at: startedAt,
      finished_at: now(),
    };
    appendJsonl('events/hermes-operational-turns.jsonl', event, root);
    return { ...event, primary };
  }

  const checkpoint = buildCheckpoint(repoDir, {
    phase: 'HERMES_RUNTIME_FAILOVER',
    atomic_unit: 'PRIMARY_RUNTIME_FAILED',
    next_unit: 'CONTINUE_FROM_OBSERVED_REPOSITORY_STATE',
    runtime_provenance: {
      runtime: 'codex_app_server',
      requested_model: PRIMARY_MODEL,
      resolved_model: primary?.resolved_model ?? null,
      runtime_health: failureState,
      authority: 'HERMES_RUNTIME_ONLY',
    },
  });
  saveCheckpoint(checkpoint, root);

  const fallbackEligibility = await ensureFallback({ repoDir, root });
  if (!fallbackEligibility?.eligible) {
    const event = {
      event: 'HERMES_OPERATIONAL_TURN_FAILED',
      authority: 'HERMES_RUNTIME_ONLY',
      runtime: null,
      fallback_used: false,
      failure_state: failureState,
      reason: 'NO_HERMES_RUNTIME_AVAILABLE',
      started_at: startedAt,
      finished_at: now(),
    };
    appendJsonl('events/hermes-operational-turns.jsonl', event, root);
    return { ...event, primary, fallback_eligibility: fallbackEligibility };
  }

  const packet = await contextBuilder({
    repoDir,
    userMessage: instruction,
    root,
  });
  const fallbackInstruction = [
    'PRIMARY HERMES RUNTIME FAILURE',
    `Failure class: ${failureState}`,
    '',
    'The GPT-5.6 Sol / Codex App Server attempt may have completed some tool actions before the runtime failed.',
    'Do not blindly replay the failed attempt. Inspect the current repository/worktree first and continue only from observable current state.',
    'DIAL repository canon, Feature IDs, FRCs, gates, tests and evidence remain authoritative.',
    'Do not advance a gate merely because previous runtime prose or memory says work is complete.',
    '',
    'ORIGINAL INSTRUCTION',
    instruction,
  ].join('\n');

  const fallback = await fallbackRunner({
    repoDir,
    instruction: fallbackInstruction,
    context: packet.context,
    mode: 'operational',
    root,
    timeoutMs,
  });

  const event = {
    event: 'HERMES_OPERATIONAL_TURN_COMPLETED',
    authority: 'HERMES_RUNTIME_ONLY',
    runtime: 'claude_code',
    requested_model: FALLBACK_MODEL,
    resolved_model: fallback?.event?.resolved_model ?? null,
    fallback_used: true,
    primary_failure_state: failureState,
    primary_requested_model: PRIMARY_MODEL,
    started_at: startedAt,
    finished_at: now(),
  };
  appendJsonl('events/hermes-operational-turns.jsonl', event, root);
  return {
    ...event,
    response: fallback?.output?.result ?? fallback?.output ?? null,
    primary,
    fallback,
  };
}

async function readInstruction() {
  const fromArgs = process.argv.slice(2).join(' ').trim();
  if (fromArgs) return fromArgs;
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input.trim();
}

async function main() {
  const instruction = await readInstruction();
  const result = await executeHermesInstruction({
    repoDir: process.env.DIAL_REPO_DIR || DEFAULT_REPO,
    instruction,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.event !== 'HERMES_OPERATIONAL_TURN_COMPLETED') process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
