import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  now,
  persistCapabilityEvidence,
  sha256,
} from './external-capability-core.mjs';

export const ANTIGRAVITY_CAPABILITY_ID = 'DEV-ANTIGRAVITY';
export const ANTIGRAVITY_PINNED_VERSION = '1.2.0';

export function resolveAntigravityBinary(env = process.env) {
  const explicit = String(env.DIAL_ANTIGRAVITY_BIN || '').trim();
  if (explicit) return explicit;
  const home = String(env.HOME || '').trim();
  if (home) {
    const local = path.join(home, '.local', 'bin', 'agy');
    if (fs.existsSync(local)) return local;
  }
  return 'agy';
}

function envBool(name, fallback = false, env = process.env) {
  const value = env[name];
  if (value == null) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

export function antigravityConfigured(env = process.env) {
  return envBool('DIAL_ANTIGRAVITY_ENABLED', false, env);
}

export async function runProcess(command, args, { cwd, env = process.env, timeoutMs = 300000 } = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false;
    const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => { if (!settled) child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish({ ok: false, code: null, stdout, stderr, error: error.message }));
    child.on('close', (code, signal) => finish({ ok: code === 0, code, signal, stdout, stderr, error: null }));
  });
}

export async function antigravityBinaryStatus({ runner = runProcess, env = process.env } = {}) {
  const binary = resolveAntigravityBinary(env);
  const probe = await runner(binary, ['--version'], { timeoutMs: 15000, env });
  return {
    installed: probe.ok,
    binary,
    version: probe.ok ? String(probe.stdout).trim().split(/\s+/).pop() : null,
    exact_pinned_version: probe.ok ? String(probe.stdout).trim().split(/\s+/).pop() === ANTIGRAVITY_PINNED_VERSION : false,
    error_class: probe.ok ? null : (/not found|ENOENT/i.test(`${probe.stderr} ${probe.error}`) ? 'BINARY_MISSING' : 'BINARY_PROBE_FAILED'),
  };
}

function classifyFailure(result) {
  const combined = `${result?.stderr || ''}\n${result?.stdout || ''}\n${result?.error || ''}`;
  if (/authentication required|login|sign.?in|authorize/i.test(combined)) return 'AUTH_REQUIRED';
  if (/quota|rate.?limit|credits|capacity/i.test(combined)) return 'CAPACITY_LIMITED';
  if (/permission|denied|blocked/i.test(combined)) return 'PERMISSION_BLOCKED';
  if (/timeout|timed out/i.test(combined)) return 'TIMEOUT';
  return 'PROVIDER_ERROR';
}

export async function antigravityHeadless({ prompt, repoDir, model = null, effort = 'high', runner = runProcess, timeoutMs = 300000, env = process.env } = {}) {
  if (!antigravityConfigured(env)) throw Object.assign(new Error('ANTIGRAVITY_DISABLED'), { category: 'DISABLED' });
  if (!prompt || !repoDir) throw new Error('Antigravity prompt and repoDir are required');  const args = [
    '-p', String(prompt),
    '--output-format', 'json',
    '--sandbox',
    '--effort', effort,
    '--print-timeout', `${Math.max(1, Math.ceil(timeoutMs / 60000))}m`,
  ];
  if (model) args.push('--model', model);
  const binary = resolveAntigravityBinary(env);
  const result = await runner(binary, args, {
    cwd: repoDir,
    env: { ...env, DIAL_REPO_DIR: repoDir },
    timeoutMs: timeoutMs + 15000,
  });
  if (!result.ok) {
    const category = classifyFailure(result);
    const error = new Error(`ANTIGRAVITY_${category}`);
    error.category = category;
    error.detail = `${result.stderr || ''}\n${result.error || ''}`.slice(0, 1200);
    throw error;
  }
  let parsed;
  try { parsed = JSON.parse(String(result.stdout || '').trim()); }
  catch { throw Object.assign(new Error('ANTIGRAVITY_INVALID_JSON_RESULT'), { category: 'PROVIDER_ERROR' }); }
  if (parsed.status !== 'SUCCESS' || !String(parsed.response || '').trim()) {
    throw Object.assign(new Error('ANTIGRAVITY_EMPTY_OR_NON_SUCCESS_RESULT'), { category: 'PROVIDER_ERROR' });
  }
  return {
    provider: 'google-antigravity',
    status: parsed.status,
    response: parsed.response,
    conversation_id: parsed.conversation_id || null,    usage: parsed.usage || null,
    duration_seconds: parsed.duration_seconds || null,
    result_hash: sha256({ response: parsed.response, usage: parsed.usage || null, status: parsed.status }),
  };
}

function antigravityDod({ binaryInstalled, authenticated, canaryPassed, guardProof = false, receiptProof = false, orchestratedProof = false, fallbackProof = false } = {}) {
  const checks = {
    implementation: Boolean(binaryInstalled),
    authentication: Boolean(authenticated),
    live_canary: Boolean(canaryPassed),
    guarded_write_denial: Boolean(guardProof),
    network_permission_denial: Boolean(guardProof),
    receipt: Boolean(receiptProof),
    orchestrated_unit_execution: Boolean(orchestratedProof),
    fallback: Boolean(fallbackProof),
  };
  return { passed: Object.values(checks).every(Boolean), checks, missing: Object.entries(checks).filter(([, ok]) => !ok).map(([id]) => id) };
}

export async function qualifyAntigravity({ repoDir, root, runner = runProcess, env = process.env, guardProof = false, receiptProof = false, orchestratedProof = false, fallbackProof = false } = {}) {
  const observedAt = now();
  const binary = await antigravityBinaryStatus({ runner, env });
  let authentication = { verified: false };
  let liveQualification = { passed: false };
  let status = binary.installed && binary.exact_pinned_version ? 'AUTH_REQUIRED' : 'IMPLEMENTED';
  if (binary.installed && binary.exact_pinned_version && antigravityConfigured(env)) {
    try {
      const result = await antigravityHeadless({
        prompt: 'Reply with exactly DIAL_ANTIGRAVITY_CANARY_OK. Do not modify files and do not use tools.',
        repoDir,
        runner,
        env,
        timeoutMs: 120000,
      });
      const passed = String(result.response).trim() === 'DIAL_ANTIGRAVITY_CANARY_OK';      authentication = { verified: true, method: 'cached_google_sign_in' };
      liveQualification = { passed, result_hash: result.result_hash, conversation_id_present: Boolean(result.conversation_id) };
      status = passed ? 'LIVE_QUALIFIED' : 'AUTHENTICATED';
    } catch (error) {
      if (error?.category === 'AUTH_REQUIRED') status = 'AUTH_REQUIRED';
      else if (error?.category === 'CAPACITY_LIMITED') status = 'DEGRADED';
      else status = 'IMPLEMENTED';
      liveQualification = { passed: false, failure_class: error?.category || 'PROVIDER_ERROR' };
    }
  }
  const dod = antigravityDod({
    binaryInstalled: binary.installed && binary.exact_pinned_version,
    authenticated: authentication.verified,
    canaryPassed: liveQualification.passed,
    guardProof,
    receiptProof,
    orchestratedProof,
    fallbackProof,
  });
  if (dod.passed) status = 'INTEGRATED';
  const artifact = {
    provider: 'google-antigravity',
    observed_at: observedAt,
    implementation: {
      plugin_present: fs.existsSync(path.join(repoDir, '.agents/plugins/dial-governed/plugin.json')),
      adapter_present: true,
      binary,
    },
    authentication,
    live_qualification: liveQualification,
    orchestrated_use: { passed: Boolean(orchestratedProof) },
    definition_of_done: dod,
    status,
  };
  return persistCapabilityEvidence(root, ANTIGRAVITY_CAPABILITY_ID, artifact);
}
