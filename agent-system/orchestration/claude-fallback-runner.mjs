#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const MODEL = 'claude-sonnet-5';

const HERMES_SUPPORT_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'Bash(git status*)',
  'Bash(git log*)',
  'Bash(git show*)',
  'Bash(git diff*)',
];

function now() { return new Date().toISOString(); }

function classifyFailure(stderr = '', stdout = '') {
  const text = `${stderr}\n${stdout}`.toLowerCase();
  if (/login|authenticate|authentication|oauth|credential/.test(text)) return 'AUTH_FAILED';
  if (/weekly.*limit|usage.*limit|session.*limit|overagestatus.*rejected|capacity.*exhaust/.test(text)) return 'ACCOUNT_LIMITED';
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
  root,
  timeoutMs = 30 * 60 * 1000,
} = {}) {
  const selection = readJson('state/hermes-runtime.json', null, root);
  if (
    !selection
    || selection.status !== 'ACTIVE'
    || selection.authority !== 'HERMES_RUNTIME_ONLY'
    || selection.runtime !== 'claude_code'
    || selection.requested_model !== MODEL
    || selection.resolved_model !== MODEL
    || selection.runtime_health !== 'HEALTHY'
    || !selection.runtime_health_observed_at
  ) {
    throw new Error(`active, identity-proven Hermes fallback runtime selection for ${MODEL} is required`);
  }

  const prompt = [
    'DIAL HERMES FALLBACK RUNTIME',
    'You are the active external Hermes runtime fallback.',
    'DIAL repository canon, Feature IDs, gates, evidence and deterministic controls remain authoritative.',
    'Use retrieved context as continuity support only; do not invent or advance repository gate state from memory or prose.',
    'This qualification runner is read-only and exists to prove the fallback toolchain and model provenance.',
    '',
    `Instruction: ${instruction || 'Report current repository status without modifying files.'}`,
  ].join('\n');

  const args = [
    '-p', prompt,
    '--model', MODEL,
    '--effort', 'low',
    '--output-format', 'json',
    '--permission-mode', 'plan',
    '--allowedTools', ...HERMES_SUPPORT_TOOLS,
    '--name', 'DIAL-HERMES-SONNET-FALLBACK',
  ];

  const startedAt = now();
  const result = spawnSync('claude', args, {
    cwd: repoDir,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
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

  const event = {
    event: result.status === 0 && identityProven
      ? 'HERMES_SONNET_FALLBACK_TURN_COMPLETED'
      : 'HERMES_SONNET_FALLBACK_TURN_FAILED',
    authority: 'HERMES_RUNTIME_ONLY',
    runtime: 'claude_code',
    requested_model: MODEL,
    resolved_model: resolvedModel,
    identity_proven: identityProven,
    hermes_selection_id: selection.selection_id,
    session_id: structured?.session_id ?? null,
    used_models: usedModels,
    started_at: startedAt,
    finished_at: finishedAt,
    exit_status: result.status,
    signal: result.signal ?? null,
    error_class: result.status === 0 && identityProven
      ? null
      : (result.status === 0 ? 'TOOLCHAIN_DEGRADED' : classifyFailure(result.stderr, result.stdout)),
  };

  appendJsonl('events/hermes-sonnet-fallback.jsonl', event, root);
  writeJsonAtomic('state/hermes-sonnet-fallback-last.json', event, root);

  if (result.error) throw result.error;
  if (result.status !== 0 || !identityProven) {
    const error = new Error(`Hermes Sonnet fallback failed: ${event.error_class}`);
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
