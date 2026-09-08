#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendJsonl, writeJsonAtomic } from './state-store.mjs';
import { recordRuntimeHealth } from './runtime-health.mjs';
import {
  loadHermesPlanModels,
  parseClaudeModelListEvidence,
  saveHermesPlanModels,
} from './hermes-plan-models.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const REQUESTED_MODEL = 'claude-sonnet-5';
const CLAUDE_BIN = process.env.DIAL_CLAUDE_BIN || (process.env.HOME && fs.existsSync(path.join(process.env.HOME, '.local/bin/claude')) ? path.join(process.env.HOME, '.local/bin/claude') : 'claude');

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
  const result = spawnSync(CLAUDE_BIN, [
    '-p', 'Reply with exactly DIAL_CLAUDE_OK. Do not use tools.',
    '--model', REQUESTED_MODEL,
    '--effort', 'low',
    '--output-format', 'json',
    '--permission-mode', 'plan',
    '--max-turns', '2',
    '--name', 'DIAL-SONNET-RUNTIME-PROBE',
  ], {
    cwd: process.env.DIAL_RUNTIME_PROBE_CWD || os.tmpdir(),
    input: '',
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      DIAL_CONTROL_HOME: root || process.env.DIAL_CONTROL_HOME,
      DIAL_REPO_DIR: repoDir,
    },
  });

  const structured = resultObject(result.stdout);
  const modelUsage = structured?.modelUsage ?? structured?.model_usage ?? {};
  const usedModels = Object.keys(modelUsage);
  const resolvedModel = usedModels.length === 1 ? usedModels[0] : null;
  const response = structured?.result ?? '';
  const responseOk = /DIAL_CLAUDE_OK/.test(response);
  const identityProven = resolvedModel === REQUESTED_MODEL;
  const state = result.status === 0 && responseOk && identityProven
    ? 'HEALTHY'
    : result.status === 0
      ? 'TOOLCHAIN_DEGRADED'
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
  recordRuntimeHealth('claude_code', {
    state,
    requested_model: REQUESTED_MODEL,
    resolved_model: resolvedModel,
    reason: state === 'HEALTHY'
      ? 'official Claude Code probe passed with modelUsage provenance'
      : classify(result.stderr, result.stdout),
    details: {
      identity_proven: identityProven,
      response_ok: responseOk,
      session_id: probe.session_id,
      used_models: usedModels,
      toolchain_usable: state === 'HEALTHY' && responseOk && identityProven,
    },
  }, root);

  return probe;
}

const CLAUDE_LIST_CANDIDATES = [
  ['model', 'list'],
  ['models'],
  ['--list-models'],
];

function claudeCommandLooksLikeUnknown(stderr = '', stdout = '') {
  const text = `${stderr}\n${stdout}`.toLowerCase();
  return /unknown|unrecognized|invalid command|no such|not a valid|usage:/.test(text);
}

export function detectClaudePlanListCommand({ spawn = spawnSync } = {}) {
  for (const args of CLAUDE_LIST_CANDIDATES) {
    const help = spawn(CLAUDE_BIN, [...args, '--help'], {
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (help.status === 0 && !claudeCommandLooksLikeUnknown(help.stderr, help.stdout)) {
      return { available: true, args };
    }
    const direct = spawn(CLAUDE_BIN, args, {
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (
      direct.status === 0
      && !claudeCommandLooksLikeUnknown(direct.stderr, direct.stdout)
      && parseClaudeModelListEvidence(direct.stdout).length > 0
    ) {
      return { available: true, args, sample: direct.stdout };
    }
  }
  return {
    available: false,
    args: null,
    reason: 'claude_cli_has_no_noninteractive_plan_list',
  };
}

export function listClaudePlanModels({
  repoDir = DEFAULT_REPO,
  root,
  listRunner,
  spawn = spawnSync,
} = {}) {
  let source = 'unavailable';
  let sourceDetail = 'Official Claude Code CLI has no supported non-interactive plan/model list; Anthropic API listing is intentionally unused.';
  let raw = null;
  let error = null;

  try {
    if (typeof listRunner === 'function') {
      raw = listRunner();
      source = 'injected';
      sourceDetail = 'caller-provided Claude Code plan/list evidence; no model names invented';
    } else {
      const detected = detectClaudePlanListCommand({ spawn });
      if (!detected.available) {
        source = 'claude_cli_has_no_noninteractive_plan_list';
        sourceDetail = 'Claude Code exposes models through interactive /model only. Hermes does not use the Anthropic API catalog and does not pin Fable 5 vs Fable 5.1.';
      } else {
        const listed = spawn(CLAUDE_BIN, detected.args, {
          cwd: repoDir,
          encoding: 'utf8',
          timeout: 15000,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        if (listed.status !== 0 || claudeCommandLooksLikeUnknown(listed.stderr, listed.stdout)) {
          throw new Error(listed.stderr || listed.stdout || 'claude plan list command failed');
        }
        raw = listed.stdout;
        source = `claude_cli_${detected.args.join('_')}`;
        sourceDetail = `Official Claude Code CLI ${detected.args.join(' ')}; no prompt turn`;
      }
    }
  } catch (caught) {
    error = String(caught?.message || caught);
    source = 'unavailable';
    sourceDetail = `Claude plan listing failed: ${error}`.slice(0, 1000);
  }

  const listed = parseClaudeModelListEvidence(raw);
  const current = loadHermesPlanModels(root);
  const recorded = saveHermesPlanModels({
    ...current,
    runtimes: {
      ...current.runtimes,
      claude_code: {
        source,
        source_detail: sourceDetail,
        models: listed,
      },
    },
  }, root);

  writeJsonAtomic('runtime-health/claude-plan-models.json', {
    event: 'CLAUDE_PLAN_MODELS_LISTED',
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
    models: recorded.runtimes.claude_code.models,
    error,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--list-models')) {
    const listed = listClaudePlanModels({ repoDir: process.env.DIAL_REPO_DIR || DEFAULT_REPO });
    process.stdout.write(`${JSON.stringify(listed, null, 2)}\n`);
    if (listed.source === 'unavailable') process.exitCode = 1;
  } else {
    const probe = probeClaudeCode({ repoDir: process.env.DIAL_REPO_DIR || DEFAULT_REPO });
    process.stdout.write(`${JSON.stringify(probe, null, 2)}\n`);
    if (probe.state !== 'HEALTHY') process.exitCode = 1;
  }
}
