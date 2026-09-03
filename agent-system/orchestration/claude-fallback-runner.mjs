#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildManagerContext } from './context-broker.mjs';
import { appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const MODEL = 'claude-sonnet-5';

const ALLOWED_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'Edit',
  'Write',
  'Bash(git status*)',
  'Bash(git diff*)',
  'Bash(git log*)',
  'Bash(git show*)',
  'Bash(npm run typecheck*)',
  'Bash(npm run test*)',
  'Bash(npm run verify*)',
  'Bash(npm run agent:*)',
  'Bash(npx vitest*)',
];

function now() { return new Date().toISOString(); }

function classifyFailure(stderr = '', stdout = '') {
  const text = `${stderr}\n${stdout}`.toLowerCase();
  if (/login|authenticate|authentication|oauth|credential/.test(text)) return 'AUTH_FAILED';
  if (/weekly.*limit|usage.*limit|session.*limit|you.*limit|capacity.*exhaust/.test(text)) return 'ACCOUNT_LIMITED';
  if (/rate.?limit|429|too many requests/.test(text)) return 'RATE_LIMITED';
  if (/overload|unavailable|503/.test(text)) return 'MODEL_LIMITED';
  return 'PROCESS_FAILED';
}

export async function runClaudeFallback({ repoDir = DEFAULT_REPO, instruction = '', root, timeoutMs = 30 * 60 * 1000 } = {}) {
  const lease = readJson('state/manager-lease.json', null, root);
  if (!lease || lease.status !== 'ACTIVE' || lease.runtime !== 'claude_code' || lease.requested_model !== MODEL) {
    throw new Error(`active Claude manager lease for ${MODEL} is required before invoking fallback runtime`);
  }

  const managerContext = await buildManagerContext({ repoDir, userMessage: instruction, root });
  const prompt = [
    managerContext.context,
    '',
    'TAKEOVER INSTRUCTION',
    instruction || 'Validate the current DIAL state and continue the next safe atomic unit according to canon and the active manager lease.',
    '',
    'You are a replaceable manager lease-holder, not the control-plane authority. Do not claim a gate passed without fresh evidence.',
  ].join('\n');

  const args = [
    '-p', prompt,
    '--model', MODEL,
    '--effort', 'high',
    '--output-format', 'json',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', ...ALLOWED_TOOLS,
    '--name', `DIAL-${managerContext.feature_id || 'RECOVERY'}`,
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

  let structured = null;
  try { structured = result.stdout ? JSON.parse(result.stdout) : null; } catch {}

  const event = {
    event: result.status === 0 ? 'CLAUDE_FALLBACK_TURN_COMPLETED' : 'CLAUDE_FALLBACK_TURN_FAILED',
    requested_model: MODEL,
    feature_id: managerContext.feature_id,
    lease_id: lease.lease_id,
    session_id: structured?.session_id ?? null,
    result_model: structured?.model ?? structured?.response_model ?? null,
    started_at: startedAt,
    finished_at: finishedAt,
    exit_status: result.status,
    signal: result.signal ?? null,
    error_class: result.status === 0 ? null : classifyFailure(result.stderr, result.stdout),
  };

  appendJsonl('events/claude-fallback.jsonl', event, root);
  writeJsonAtomic('state/claude-fallback-last.json', event, root);

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`Claude fallback failed: ${event.error_class}`);
    error.cause = { stderr: result.stderr?.slice(-4000), stdout: result.stdout?.slice(-4000), event };
    throw error;
  }

  return { event, output: structured ?? { result: result.stdout } };
}

async function main() {
  const instruction = process.argv.slice(2).join(' ').trim();
  const result = await runClaudeFallback({
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
