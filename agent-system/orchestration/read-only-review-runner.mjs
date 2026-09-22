#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync, spawn } from 'node:child_process';
import { spawnCapture } from './process-capture.mjs';

const DEFAULT_CODEX_MODEL = process.env.DIAL_REVIEW_CODEX_MODEL || 'gpt-5.6-sol';
const DEFAULT_CLAUDE_MODEL = process.env.DIAL_REVIEW_CLAUDE_MODEL || 'claude-sonnet-5';

function run(cwd, command, args, options = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  }).trim();
}
function parseReviewJson(text) {
  const raw = String(text || '').trim();
  const candidates = [
    raw,
    raw.replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, ''),
    raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object') return value;
    } catch {}
  }
  throw new Error('review harness did not return parseable JSON');
}
function normalizeReview(value) {
  const verdict = String(value?.verdict || 'COMMENT').toUpperCase();
  const allowedVerdicts = new Set(['PASS', 'COMMENT', 'CHANGES_REQUIRED', 'BLOCK']);
  const findings = (Array.isArray(value?.findings) ? value.findings : []).slice(0, 100).map((finding) => ({
    severity: String(finding?.severity || 'INFO').toUpperCase(),
    category: String(finding?.category || 'GENERAL').slice(0, 120),
    file: finding?.file ? String(finding.file).slice(0, 500) : null,
    line: Number.isFinite(Number(finding?.line)) ? Number(finding.line) : null,
    claim: String(finding?.claim || finding?.message || '').slice(0, 4000),
    evidence: finding?.evidence ? String(finding.evidence).slice(0, 4000) : null,
  }));
  return {
    verdict: allowedVerdicts.has(verdict) ? verdict : 'COMMENT',
    summary: String(value?.summary || '').slice(0, 8000),
    findings,
  };
}
function buildPrompt(packet) {
  return [
    'DIAL INDEPENDENT CHECKPOINT REVIEW',
    '',
    'You are an independent reviewer. The authoring harness is not you.',
    'Review the exact immutable repository checkpoint supplied below. Do not edit files, commit, install dependencies, mutate configuration, or take external side effects.',
    'Project Truth, current repository evidence and tests outrank memory or prior model prose.',
    'The handover/context packet exists to avoid rediscovering the whole project. Read additional source only when needed to verify affected behavior, dependencies, tests or a suspected gap.',
    'Focus on correctness, completeness, coherence, determinism, integration, regressions, authority boundaries, security and the stated completion claims.',
    'Do not manufacture issues. Every finding must include concrete evidence.',
    '',
    'Return ONLY JSON with this exact shape:',
    '{"verdict":"PASS|COMMENT|CHANGES_REQUIRED|BLOCK","summary":"...","findings":[{"severity":"CRITICAL|HIGH|MEDIUM|LOW|INFO","category":"...","file":"path or null","line":123,"claim":"...","evidence":"..."}]}',
    '',
    `Checkpoint ID: ${packet.checkpoint_id}`,
    `Repository SHA: ${packet.repository_sha}`,
    `Base SHA: ${packet.base_sha || 'none'}`,
    `Author harness: ${packet.author_harness}`,
    `Feature: ${packet.feature_id || 'unscoped'}`,
    `Domains: ${(packet.domains || []).join(', ') || 'none'}`,
    packet.summary ? `Author summary: ${packet.summary}` : '',
    packet.claims?.length ? `Completion claims:\n- ${packet.claims.join('\n- ')}` : '',
    packet.tests?.length ? `Tests claimed:\n- ${packet.tests.join('\n- ')}` : '',
    packet.delta_context ? `\nVERIFIED HANDOVER/DELTA CONTEXT\n${packet.delta_context}` : '',
  ].filter(Boolean).join('\n');
}

function createReviewWorktree(repoDir, sha) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-review-worktree-'));
  run(repoDir, 'git', ['worktree', 'add', '--detach', root, sha]);
  const observed = run(root, 'git', ['rev-parse', 'HEAD']);
  if (observed !== sha) throw new Error(`review worktree SHA mismatch: expected ${sha}, got ${observed}`);
  return root;
}
function removeReviewWorktree(repoDir, worktree) {
  try { execFileSync('git', ['worktree', 'remove', '--force', worktree], { cwd: repoDir, stdio: 'ignore' }); }
  catch { try { fs.rmSync(worktree, { recursive: true, force: true }); } catch {} }
}

async function runCodexReview({ prompt, cwd, model = DEFAULT_CODEX_MODEL, timeoutMs = 20 * 60 * 1000 } = {}) {
  const child = spawn('codex', ['app-server', '--listen', 'stdio://'], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; if (stderr.length > 12000) stderr = stderr.slice(-12000); });
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  let nextId = 1;
  const pending = new Map();
  let finalMessage = '';
  let completed = null;
  let reroute = null;

  function send(message) { child.stdin.write(`${JSON.stringify(message)}\n`); }
  function request(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send({ id, method, params });
    });
  }
  const turnDone = new Promise((resolve) => {
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
      if (msg.method === 'item/agentMessage/delta') finalMessage += msg.params?.delta ?? '';
      if (msg.method === 'item/completed' && msg.params?.item?.type === 'agentMessage') finalMessage = msg.params.item.text ?? finalMessage;
      if (msg.method === 'turn/completed') { completed = msg.params?.turn ?? msg.params ?? null; resolve(); }
    });
    child.on('exit', resolve);
  });
  const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);

  try {
    await request('initialize', {
      clientInfo: { name: 'dial_spmrf_reviewer', title: 'DIAL SPMRF Reviewer', version: '1.0.0' },
      capabilities: { experimentalApi: true },
    });
    send({ method: 'initialized' });
    const started = await request('thread/start', {
      model,
      cwd,
      ephemeral: true,
      approvalPolicy: 'never',
      permissions: ':read-only',
      allowProviderModelFallback: false,
    });
    const thread = started?.thread;
    if (!thread?.id) throw new Error('Codex reviewer thread/start did not return thread id');
    await request('turn/start', {
      threadId: thread.id,
      input: [{ type: 'text', text: prompt }],
      model,
      effort: 'high',
      approvalPolicy: 'never',
      permissions: ':read-only',
    });
    await turnDone;
    if (completed?.error) throw new Error(`Codex review turn failed: ${JSON.stringify(completed.error)}`);
    const resolvedModel = reroute?.toModel ?? reroute?.to_model ?? thread.model ?? thread.modelId ?? model;
    if (reroute || resolvedModel !== model) throw new Error(`Codex reviewer model identity mismatch: requested ${model}, resolved ${resolvedModel}`);
    return {
      review: normalizeReview(parseReviewJson(finalMessage)),
      provenance: {
        provider_family: 'openai',
        runtime: 'codex_app_server',
        requested_model: model,
        resolved_model: resolvedModel,
        identity_proven: true,
        thread_id: thread.id,
      },
    };
  } finally {
    clearTimeout(timer);
    if (!child.killed) child.kill('SIGTERM');
    rl.close();
    void stderr;
  }
}

async function runClaudeReview({ prompt, cwd, model = DEFAULT_CLAUDE_MODEL, timeoutMs = 20 * 60 * 1000 } = {}) {
  const result = await spawnCapture(process.env.DIAL_CLAUDE_BIN || 'claude', [
    '-p', prompt,
    '--model', model,
    '--effort', 'high',
    '--output-format', 'json',
    '--permission-mode', 'plan',
    '--max-turns', '40',
    '--allowedTools',
    'Read', 'Glob', 'Grep',
    'Bash(git status*)', 'Bash(git log*)', 'Bash(git show*)', 'Bash(git diff*)',
    '--name', 'DIAL-SPMRF-INDEPENDENT-REVIEW',
  ], {
    cwd,
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env },
  });
  if (result.status !== 0) throw new Error(`Claude review failed: ${String(result.stderr || result.stdout).slice(-3000)}`);
  let envelope;
  try { envelope = JSON.parse(result.stdout || '{}'); } catch { envelope = {}; }
  if (Array.isArray(envelope)) envelope = envelope.at(-1) || {};
  const modelUsage = envelope?.modelUsage ?? envelope?.model_usage ?? {};
  const used = Object.keys(modelUsage);
  const resolvedModel = used.length === 1 ? used[0] : null;
  if (resolvedModel !== model) throw new Error(`Claude reviewer model identity mismatch: requested ${model}, resolved ${resolvedModel || 'unknown'}`);
  const text = envelope?.result ?? envelope?.response ?? '';
  return {
    review: normalizeReview(parseReviewJson(text)),
    provenance: {
      provider_family: 'anthropic',
      runtime: 'claude_code',
      requested_model: model,
      resolved_model: resolvedModel,
      identity_proven: true,
      session_id: envelope?.session_id ?? null,
    },
  };
}

export async function runReadOnlyCheckpointReview({
  harnessId,
  repoDir,
  packet,
  timeoutMs,
} = {}) {
  if (!harnessId || !repoDir || !packet?.repository_sha) throw new Error('harnessId, repoDir and packet repository_sha are required');
  const worktree = createReviewWorktree(repoDir, packet.repository_sha);
  try {
    const prompt = buildPrompt(packet);
    const result = harnessId.startsWith('claude-')
      ? await runClaudeReview({ prompt, cwd: worktree, timeoutMs })
      : await runCodexReview({ prompt, cwd: worktree, timeoutMs });
    return {
      harness_id: harnessId,
      checkpoint_id: packet.checkpoint_id,
      reviewed_repository_sha: packet.repository_sha,
      ...result.review,
      model_provenance: result.provenance,
    };
  } finally {
    removeReviewWorktree(repoDir, worktree);
  }
}

async function main() {
  const packetFile = process.argv[2];
  const harnessId = process.argv[3] || process.env.DIAL_HARNESS_ID || 'chatgpt-hermes';
  if (!packetFile) throw new Error('usage: read-only-review-runner.mjs <packet.json> [harness-id]');
  const packet = JSON.parse(fs.readFileSync(packetFile, 'utf8'));
  const result = await runReadOnlyCheckpointReview({
    harnessId,
    repoDir: process.env.DIAL_REPO_DIR || process.cwd(),
    packet,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
}
