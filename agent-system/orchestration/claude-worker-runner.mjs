import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnCapture } from './process-capture.mjs';
import { recordRuntimeHealth } from './runtime-health.mjs';

const MODEL = 'claude-sonnet-5';
const CLAUDE_BIN = process.env.DIAL_CLAUDE_BIN || (process.env.HOME && fs.existsSync(path.join(process.env.HOME, '.local/bin/claude')) ? path.join(process.env.HOME, '.local/bin/claude') : 'claude');
const WORKER_TOOLS = [
  'Read', 'Glob', 'Grep', 'Edit', 'Write',
  'Bash(git status*)', 'Bash(git log*)', 'Bash(git show*)', 'Bash(git diff*)',
  'Bash(npm *)', 'Bash(npx *)', 'Bash(node *)',
];

function classify(stderr = '', stdout = '') {
  const text = `${stderr}\n${stdout}`.toLowerCase();
  if (/login|authenticate|authentication|oauth|credential|unauthorized|401\b/.test(text)) return 'AUTH_FAILED';
  if (/weekly.*limit|usage.*limit|session.*limit|capacity.*exhaust|quota/.test(text)) return 'ACCOUNT_LIMITED';
  if (/rate.?limit|429|too many requests/.test(text)) return 'RATE_LIMITED';
  if (/overload|unavailable|503/.test(text)) return 'MODEL_LIMITED';
  return 'PROCESS_FAILED';
}

function parsed(stdout) {
  try { const value = JSON.parse(stdout || 'null'); return Array.isArray(value) ? value.at(-1) : value; }
  catch { return null; }
}

export async function runClaudeHcxWorker({
  prompt,
  repoDir,
  env = process.env,
  configDir = null,
  runtimeId = 'claude_code',
  profileId = 'primary',
  timeoutMs = 30 * 60 * 1000,
} = {}) {
  if (!String(prompt || '').trim()) throw new Error('CLAUDE_HCX_PROMPT_REQUIRED');
  const result = await spawnCapture(CLAUDE_BIN, [
    '-p', prompt,
    '--model', MODEL,
    '--effort', 'high',
    '--output-format', 'json',
    '--permission-mode', 'acceptEdits',
    '--max-turns', '100',
    '--allowedTools', ...WORKER_TOOLS,
    '--name', `DIAL-HCX-CLAUDE-${profileId.toUpperCase()}`,
  ], {
    cwd: repoDir,
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...env,
      ...(configDir ? { CLAUDE_CONFIG_DIR: configDir } : {}),
    },
  });
  const out = parsed(result.stdout);
  const modelUsage = out?.modelUsage ?? out?.model_usage ?? {};
  const usedModels = Object.keys(modelUsage);
  const resolvedModel = usedModels.length === 1 ? usedModels[0] : null;
  const identityProven = resolvedModel === MODEL;
  const ok = result.status === 0 && identityProven;
  const failureClass = ok ? null : (result.status === 0 ? 'TOOLCHAIN_DEGRADED' : classify(result.stderr, result.stdout));
  recordRuntimeHealth(runtimeId, {
    state: ok ? 'HEALTHY' : failureClass,
    requested_model: MODEL,
    resolved_model: resolvedModel,
    reason: ok ? `HCX ${profileId} Claude worker completed with exact ${MODEL}` : `HCX ${profileId} Claude worker failed: ${failureClass}`,
    details: { identity_proven: identityProven, toolchain_usable: ok, profile_id: profileId, config_isolated: Boolean(configDir), used_models: usedModels },
  }, env.DIAL_CONTROL_HOME);
  if (!ok) {
    const error = new Error(`CLAUDE_HCX_WORKER_FAILED:${failureClass}`);
    error.category = failureClass;
    error.details = { resolved_model: resolvedModel, stderr_tail: String(result.stderr || '').slice(-3000) };
    throw error;
  }
  const response = out?.result ?? result.stdout ?? '';
  return {
    provider: 'anthropic-claude-code',
    model: MODEL,
    profile_id: profileId,
    response,
    usage: out?.usage ?? out?.modelUsage ?? null,
    session_id: out?.session_id ?? null,
    result_hash: crypto.createHash('sha256').update(JSON.stringify({ profileId, resolvedModel, response })).digest('hex'),
  };
}
