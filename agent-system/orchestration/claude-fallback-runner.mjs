#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';
import { HERMES_PREFERRED_CLAUDE_MODEL } from './hermes-plan-models.mjs';
import { recordRuntimeHealth } from './runtime-health.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const MODEL = HERMES_PREFERRED_CLAUDE_MODEL;

const QUALIFICATION_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'Bash(git status*)',
  'Bash(git log*)',
  'Bash(git show*)',
  'Bash(git diff*)',
];

const OPERATIONAL_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'Edit',
  'Write',
  'Bash(git status*)',
  'Bash(git log*)',
  'Bash(git show*)',
  'Bash(git diff*)',
  'Bash(npm *)',
  'Bash(npx *)',
  'Bash(node *)',
];

function now() { return new Date().toISOString(); }

function classifyFailure(stderr = '', stdout = '') {
  const text = `${stderr}\n${stdout}`.toLowerCase();
  if (/login|authenticate|authentication|oauth|credential/.test(text)) return 'AUTH_FAILED';
  if (/weekly.*limit|usage.*limit|session.*limit|overagestatus.*rejected|capacity.*exhaust|quota/.test(text)) return 'ACCOUNT_LIMITED';
  if (/rate.?limit|429|too many requests/.test(text)) return 'RATE_LIMITED';
  if (/overload|unavailable|503/.test(text)) return 'MODEL_LIMITED';
  return 'PROCESS_FAILED';
}

function resultObject(stdout) {
  try {
    const parsed = JSON.parse(stdout || 'null');
    return Array.isArray(parsed) ? (parsed.at(-1) ?? null) : parsed;
  } catch {
    return null;
  }
}

export async function runClaudeHermesFallback({
  repoDir = DEFAULT_REPO,
  instruction = '',
  context = '',
  mode = 'qualification',
  root,
  timeoutMs = 30 * 60 * 1000,
} = {}) {
  if (!['qualification', 'operational'].includes(mode)) {
    throw new Error(`unsupported Claude Hermes fallback mode: ${mode}`);
  }

  const selection = readJson('state/hermes-runtime.json', null, root);
  if (
    !selection
    || selection.status !== 'ACTIVE'
    || selection.authority !== 'HERMES_RUNTIME_ONLY'
    || selection.runtime !== 'claude_code'
    || selection.requested_model !== MODEL
    || selection.selected_model !== MODEL
    || selection.resolved_model !== MODEL
    || selection.runtime_health !== 'HEALTHY'
    || !selection.runtime_health_observed_at
  ) {
    throw new Error(`active, identity-proven exact ${MODEL} Hermes selection is required`);
  }

  const operational = mode === 'operational';
  const prompt = [
    'DIAL HERMES FALLBACK RUNTIME',
    'You are the active external Hermes runtime fallback, powered by official Claude Code.',
    `You are hard-pinned to exact ${MODEL}. Do not switch models or aliases.`,
    'DIAL repository canon, Feature IDs, FRCs, gates, evidence and deterministic controls remain authoritative.',
    'Runtime selection is availability/provenance only. Do not invent a parallel development-authority hierarchy.',
    'Use retrieved context as continuity support only; verify it against current repository state before acting.',
    operational
      ? 'This is an operational fallback turn. Inspect current state before edits because the failed primary runtime may have completed partial work.'
      : 'This is a read-only qualification turn. Do not modify repository files.',
    context ? `\nDIAL CONTEXT PACKET\n${context}` : '',
    '',
    `Instruction: ${instruction || (operational ? 'Continue safely from current repository state.' : 'Report current repository status without modifying files.')}`,
  ].filter(Boolean).join('\n');

  const args = [
    '-p', prompt,
    '--model', MODEL,
    '--effort', operational ? 'high' : 'low',
    '--output-format', 'json',
    '--permission-mode', operational ? 'acceptEdits' : 'plan',
    '--max-turns', operational ? '100' : '1',
    '--allowedTools', ...(operational ? OPERATIONAL_TOOLS : QUALIFICATION_TOOLS),
    '--name', operational ? 'DIAL-HERMES-SONNET-5-FALLBACK' : 'DIAL-SONNET-5-RUNTIME-PROBE-TURN',
  ];

  const startedAt = now();
  const result = spawnSync('claude', args, {
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
  const finishedAt = now();

  const structured = resultObject(result.stdout);
  const modelUsage = structured?.modelUsage ?? structured?.model_usage ?? {};
  const usedModels = Object.keys(modelUsage);
  const resolvedModel = usedModels.length === 1 ? usedModels[0] : null;
  const identityProven = resolvedModel === MODEL;
  const completed = result.status === 0 && identityProven;
  const errorClass = completed
    ? null
    : (result.status === 0 ? 'TOOLCHAIN_DEGRADED' : classifyFailure(result.stderr, result.stdout));

  const event = {
    event: completed
      ? 'HERMES_SONNET_FALLBACK_TURN_COMPLETED'
      : 'HERMES_SONNET_FALLBACK_TURN_FAILED',
    authority: 'HERMES_RUNTIME_ONLY',
    policy: 'LOCKED_SOL_THEN_SONNET',
    mode,
    runtime: 'claude_code',
    preferred_model: MODEL,
    requested_model: MODEL,
    selected_model: MODEL,
    resolved_model: resolvedModel,
    identity_proven: identityProven,
    hermes_selection_id: selection.selection_id,
    session_id: structured?.session_id ?? null,
    used_models: usedModels,
    started_at: startedAt,
    finished_at: finishedAt,
    exit_status: result.status,
    signal: result.signal ?? null,
    error_class: errorClass,
  };

  recordRuntimeHealth('claude_code', {
    state: completed ? 'HEALTHY' : errorClass,
    requested_model: MODEL,
    resolved_model: resolvedModel,
    reason: completed
      ? `Claude Code ${mode} turn completed with exact ${MODEL} provenance`
      : `Claude Code ${mode} turn failed: ${errorClass}`,
    details: {
      identity_proven: identityProven,
      toolchain_usable: completed,
      session_id: event.session_id,
      used_models: usedModels,
      source: `${mode}_fallback_turn`,
    },
  }, root);

  appendJsonl('events/hermes-sonnet-fallback.jsonl', event, root);
  writeJsonAtomic('state/hermes-sonnet-fallback-last.json', event, root);

  if (result.error) throw result.error;
  if (!completed) {
    const error = new Error(`Hermes Sonnet 5 fallback failed: ${event.error_class}`);
    error.cause = {
      stderr: result.stderr?.slice(-4000),
      stdout: result.stdout?.slice(-4000),
      event,
    };
    throw error;
  }

  return { event, output: structured ?? { result: result.stdout } };
}

export const runClaudeFallback = runClaudeHermesFallback;

async function main() {
  const instruction = process.argv.slice(2).join(' ').trim();
  const result = await runClaudeHermesFallback({
    repoDir: process.env.DIAL_REPO_DIR || DEFAULT_REPO,
    instruction,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error);
    if (error.cause) console.error(JSON.stringify(error.cause, null, 2));
    process.exitCode = 1;
  });
}
