import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readJson, writeJsonAtomic } from '../../state-store.mjs';
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
  return envBool('DIAL_ANTIGRAVITY_ENABLED', true, env);
}

export function antigravityRuntimeHome(env = process.env) {
  const explicit = String(env.DIAL_ANTIGRAVITY_HOME || '').trim();
  if (explicit) return explicit;
  const controlHome = String(env.DIAL_CONTROL_HOME || '/var/lib/dial-control').trim();
  return path.join(controlHome, 'identities', 'antigravity-worker');
}

export function antigravityRuntimeEnv(env = process.env) {
  const home = antigravityRuntimeHome(env);
  const sanitized = { ...env };
  for (const key of ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'CLOUDSDK_CONFIG', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT_ID']) delete sanitized[key];
  return {
    ...sanitized,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    AGY_CLI_DISABLE_AUTO_UPDATE: 'true',
  };
}

export async function runProcess(command, args, { cwd, env = process.env, timeoutMs = 300000 } = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => { if (!settled) child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish({ ok: false, code: null, stdout, stderr, error: error.message }));
    child.on('close', (code, signal) => finish({ ok: code === 0, code, signal, stdout, stderr, error: null }));
  });
}

export async function antigravityBinaryStatus({ runner = runProcess, env = process.env } = {}) {
  const binary = resolveAntigravityBinary(env);
  const probe = await runner(binary, ['--version'], { timeoutMs: 15000, env });
  const version = probe.ok ? String(probe.stdout).trim().split(/\s+/).pop() : null;
  return {
    installed: probe.ok,
    binary,
    version,
    exact_pinned_version: version === ANTIGRAVITY_PINNED_VERSION,
    error_class: probe.ok ? null : (/not found|ENOENT/i.test(`${probe.stderr} ${probe.error}`) ? 'BINARY_MISSING' : 'BINARY_PROBE_FAILED'),
  };
}

export function classifyAntigravityFailure(result) {
  const combined = `${result?.stderr || ''}\n${result?.stdout || ''}\n${result?.error || ''}\n${result?.log || ''}`;
  if (/resource_exhausted|individual quota|quota|rate.?limit|credits|capacity|429/i.test(combined)) return 'CAPACITY_LIMITED';
  if (/authentication required|invalid_grant|login|sign.?in|authorize|could not resolve authentication method/i.test(combined)) return 'AUTH_REQUIRED';
  if (/permission|denied|blocked/i.test(combined)) return 'PERMISSION_BLOCKED';
  if (/timeout|timed out|stream was interrupted/i.test(combined)) return 'TIMEOUT';
  return 'PROVIDER_ERROR';
}

export function antigravityModelMetadata(modelId, displayName = '') {
  const id = String(modelId || '');
  const providerFamily = id.startsWith('claude-') ? 'anthropic'
    : id.startsWith('gpt-') ? 'openai'
      : id.startsWith('gemini-') ? 'google'
        : 'provider-native';
  return {
    model_id: id,
    display_name: String(displayName || id),
    provider_family: providerFamily,
    family: 'provider_native',
    subscription_source: 'google-subscription',
    harness_id: 'antigravity',
    worker_eligible: true,
    manager_eligible: false,
    effort_semantics: 'MODEL_SELECTION_OWNS_REASONING_PROFILE',
  };
}

export async function antigravityModelDiscovery({ runner = runProcess, env = process.env } = {}) {
  const binary = resolveAntigravityBinary(env);
  const result = await runner(binary, ['models'], {
    timeoutMs: 30000,
    env: antigravityRuntimeEnv(env),
  });
  if (!result.ok) {
    const category = classifyAntigravityFailure(result);
    return {
      ok: false,
      authenticated: category !== 'AUTH_REQUIRED',
      category,
      models: [],
      error: `${result.stderr || ''}\n${result.error || ''}`.trim().slice(0, 1200),
    };
  }
  const models = String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^Fetching available models/i.test(line))
    .map((line) => {
      const match = line.match(/^(\S+)\s+(.+)$/);
      return match ? antigravityModelMetadata(match[1], match[2]) : null;
    })
    .filter(Boolean);
  if (!models.length) return { ok: false, authenticated: true, category: 'MODEL_DISCOVERY_EMPTY', models: [] };
  return { ok: true, authenticated: true, category: null, models };
}

export function updateAvailabilityState({ root, observedAt, discovery, selectedModelId = null, failureClass = null, canaryPassed = false } = {}) {
  if (!root || !discovery?.ok) return null;
  const prior = readJson('state/model-availability.json', { models: {}, harnesses: {} }, root) || { models: {}, harnesses: {} };
  const models = { ...(prior.models || {}) };
  for (const model of discovery.models || []) {
    const previous = models[model.model_id] || {};
    const selected = model.model_id === selectedModelId;
    models[model.model_id] = {
      ...previous,
      ...model,
      availability: 'PRESENT',
      subscription_present: true,
      qualification_state: 'PRESENT',
      health_state: selected && canaryPassed ? 'HEALTHY'
        : selected && failureClass ? 'DEGRADED'
          : (previous.health_state || 'UNKNOWN'),
      quota_state: selected && failureClass === 'CAPACITY_LIMITED' ? 'EXHAUSTED'
        : selected && canaryPassed ? 'AVAILABLE'
          : (previous.quota_state || 'UNKNOWN'),
      observed_at: observedAt,
      discovered_by: 'ANTIGRAVITY_MODEL_DISCOVERY',
      capability_fingerprint: sha256(model),
    };
  }
  const antigravityModels = Object.values(models).filter((model) => model?.harness_id === 'antigravity' && model?.subscription_present === true);
  const healthyModels = antigravityModels.filter((model) => model.health_state === 'HEALTHY' && model.quota_state !== 'EXHAUSTED');
  const degradedModels = antigravityModels.filter((model) => model.health_state === 'DEGRADED' || model.quota_state === 'EXHAUSTED');
  const harnesses = {
    ...(prior.harnesses || {}),
    antigravity: {
      ...(prior.harnesses?.antigravity || {}),
      authenticated: true,
      health_state: healthyModels.length ? 'HEALTHY' : (degradedModels.length ? 'DEGRADED' : 'UNKNOWN'),
      quota_state: healthyModels.length ? 'AVAILABLE' : (degradedModels.length ? 'LIMITED' : 'UNKNOWN'),
      observed_at: observedAt,
      model_count: discovery.models.length,
      healthy_model_count: healthyModels.length,
      degraded_model_count: degradedModels.length,
    },
  };
  const next = { ...prior, observed_at: observedAt, models, harnesses };
  writeJsonAtomic('state/model-availability.json', next, root);
  return next;
}

export function recordAntigravityDispatchOutcome({ root, modelId, passed = false, failureClass = null, observedAt = now() } = {}) {
  if (!root || !modelId) throw new Error('ANTIGRAVITY_DISPATCH_OUTCOME_INPUTS_REQUIRED');
  const prior = readJson('state/model-availability.json', { models: {}, harnesses: {} }, root) || { models: {}, harnesses: {} };
  const previous = prior.models?.[modelId];
  if (!previous || previous.harness_id !== 'antigravity') throw new Error(`ANTIGRAVITY_MODEL_NOT_DISCOVERED:${modelId}`);
  const models = { ...(prior.models || {}) };
  const nextModel = {
    ...previous,
    health_state: passed ? 'HEALTHY' : (failureClass ? 'DEGRADED' : previous.health_state || 'UNKNOWN'),
    quota_state: failureClass === 'CAPACITY_LIMITED' ? 'EXHAUSTED' : (passed ? 'AVAILABLE' : previous.quota_state || 'UNKNOWN'),
    observed_at: observedAt,
    last_dispatch: { passed: Boolean(passed), failure_class: failureClass || null, observed_at: observedAt },
  };
  models[modelId] = nextModel;
  const antigravityModels = Object.values(models).filter((model) => model?.harness_id === 'antigravity' && model?.subscription_present === true);
  const healthyModels = antigravityModels.filter((model) => model.health_state === 'HEALTHY' && model.quota_state !== 'EXHAUSTED');
  const degradedModels = antigravityModels.filter((model) => model.health_state !== 'HEALTHY' || model.quota_state === 'EXHAUSTED');
  const priorHarness = prior.harnesses?.antigravity || {};
  const authFailed = failureClass === 'AUTH_REQUIRED';
  const harnesses = {
    ...(prior.harnesses || {}),
    antigravity: {
      ...priorHarness,
      authenticated: authFailed ? false : priorHarness.authenticated !== false,
      health_state: authFailed ? 'DEGRADED' : (healthyModels.length ? 'HEALTHY' : (degradedModels.length ? 'DEGRADED' : 'UNKNOWN')),
      quota_state: healthyModels.length ? 'AVAILABLE' : (degradedModels.length ? 'LIMITED' : 'UNKNOWN'),
      observed_at: observedAt,
      healthy_model_count: healthyModels.length,
      degraded_model_count: degradedModels.length,
      last_dispatch_model_id: modelId,
      last_dispatch_failure_class: failureClass || null,
    },
  };
  const next = { ...prior, observed_at: observedAt, models, harnesses };
  writeJsonAtomic('state/model-availability.json', next, root);
  return { model: nextModel, harness: harnesses.antigravity };
}

export async function antigravityHeadless({ prompt, repoDir, model = null, effort = 'high', runner = runProcess, timeoutMs = 300000, env = process.env } = {}) {
  if (!antigravityConfigured(env)) throw Object.assign(new Error('ANTIGRAVITY_DISABLED'), { category: 'DISABLED' });
  if (!prompt || !repoDir) throw new Error('Antigravity prompt and repoDir are required');
  const logFile = path.join(os.tmpdir(), `dial-antigravity-${process.pid}-${Date.now()}.log`);
  const args = [
    '--log-file', logFile,
    '-p', String(prompt),
    '--output-format', 'json',
    '--sandbox',
    '--print-timeout', `${Math.max(1, Math.ceil(timeoutMs / 60000))}m`,
  ];
  if (model) args.push('--model', model);
  else if (effort) args.push('--effort', effort);
  const binary = resolveAntigravityBinary(env);
  const result = await runner(binary, args, {
    cwd: repoDir,
    env: { ...antigravityRuntimeEnv(env), DIAL_REPO_DIR: repoDir },
    timeoutMs: timeoutMs + 15000,
  });
  let log = '';
  try { if (fs.existsSync(logFile)) log = fs.readFileSync(logFile, 'utf8'); } catch {}
  try { fs.rmSync(logFile, { force: true }); } catch {}
  if (!result.ok) {
    const category = classifyAntigravityFailure({ ...result, log });
    const error = new Error(`ANTIGRAVITY_${category}`);
    error.category = category;
    error.detail = `${result.stderr || ''}\n${result.error || ''}`.slice(0, 1200);
    throw error;
  }
  let parsed;
  try { parsed = JSON.parse(String(result.stdout || '').trim().split(/\r?\n/).filter((line) => line.trim().startsWith('{')).pop() || ''); }
  catch { throw Object.assign(new Error('ANTIGRAVITY_INVALID_JSON_RESULT'), { category: 'PROVIDER_ERROR' }); }
  if (parsed.status !== 'SUCCESS' || !String(parsed.response || '').trim()) {
    const category = classifyAntigravityFailure({ stdout: `${parsed.error || ''}\n${parsed.response || ''}`, log });
    const error = new Error(`ANTIGRAVITY_${category}`);
    error.category = category;
    error.detail = String(parsed.error || parsed.response || 'non-success result').slice(0, 1200);
    throw error;
  }
  return {
    provider: 'google-antigravity',
    model_id: model || null,
    status: parsed.status,
    response: parsed.response,
    conversation_id: parsed.conversation_id || null,
    usage: parsed.usage || null,
    duration_seconds: parsed.duration_seconds || null,
    result_hash: sha256({ model: model || null, response: parsed.response, usage: parsed.usage || null, status: parsed.status }),
  };
}

export async function qualifyAntigravityPairings({ repoDir, root, discovery, runner = runProcess, env = process.env, timeoutMs = 30000 } = {}) {
  if (!discovery?.ok || !(discovery.models || []).length) return { checked_all: false, any_healthy: false, results: [], counts: { total: 0, healthy: 0, degraded: 0 } };
  const results = [];
  for (const model of discovery.models) {
    const observedAt = now();
    try {
      const result = await antigravityHeadless({
        prompt: 'Reply with exactly DIAL_ANTIGRAVITY_CANARY_OK. Do not modify files and do not use tools.',
        repoDir,
        model: model.model_id,
        runner,
        env,
        timeoutMs,
      });
      const passed = String(result.response).trim() === 'DIAL_ANTIGRAVITY_CANARY_OK';
      updateAvailabilityState({ root, observedAt, discovery, selectedModelId: model.model_id, canaryPassed: passed, failureClass: passed ? null : 'PROVIDER_ERROR' });
      results.push({ model_id: model.model_id, passed, failure_class: passed ? null : 'PROVIDER_ERROR', result_hash: result.result_hash || null });
    } catch (error) {
      const failureClass = error?.category || 'PROVIDER_ERROR';
      updateAvailabilityState({ root, observedAt, discovery, selectedModelId: model.model_id, failureClass });
      results.push({ model_id: model.model_id, passed: false, failure_class: failureClass, result_hash: null });
    }
  }
  const healthy = results.filter((row) => row.passed).length;
  const degraded = results.length - healthy;
  return {
    checked_all: results.length === discovery.models.length,
    any_healthy: healthy > 0,
    results,
    counts: { total: results.length, healthy, degraded },
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

export async function qualifyAntigravity({ repoDir, root, runner = runProcess, env = process.env, guardProof = false, receiptProof = false, orchestratedProof = false, fallbackProof = false, proofRefs = null, probeAllModels = false, pairingTimeoutMs = 30000 } = {}) {
  const observedAt = now();
  const binary = await antigravityBinaryStatus({ runner, env });
  let authentication = { verified: false };
  let discovery = { ok: false, authenticated: false, models: [] };
  let liveQualification = { passed: false };
  let pairingQualification = null;
  let status = binary.installed && binary.exact_pinned_version ? 'AUTH_REQUIRED' : 'IMPLEMENTED';
  if (binary.installed && binary.exact_pinned_version && antigravityConfigured(env)) {
    discovery = await antigravityModelDiscovery({ runner, env });
    if (discovery.ok && discovery.authenticated) {
      authentication = { verified: true, method: 'cached_google_oauth', model_discovery_verified: true };
      status = 'AUTHENTICATED';
    } else if (discovery.category === 'AUTH_REQUIRED') {
      status = 'AUTH_REQUIRED';
    }
    if (probeAllModels && discovery.ok) {
      pairingQualification = await qualifyAntigravityPairings({ repoDir, root, discovery, runner, env, timeoutMs: pairingTimeoutMs });
      liveQualification = {
        passed: pairingQualification.any_healthy,
        pairing_matrix_complete: pairingQualification.checked_all,
        healthy_model_count: pairingQualification.counts.healthy,
        degraded_model_count: pairingQualification.counts.degraded,
      };
      status = pairingQualification.any_healthy ? 'LIVE_QUALIFIED' : 'DEGRADED';
    } else {
      const selectedModel = discovery.models.find((row) => row.model_id === 'gemini-3.8-flash-low') || discovery.models[0] || null;
      try {
        if (!selectedModel) throw Object.assign(new Error('ANTIGRAVITY_MODEL_DISCOVERY_EMPTY'), { category: discovery.category || 'PROVIDER_ERROR' });
        const result = await antigravityHeadless({
          prompt: 'Reply with exactly DIAL_ANTIGRAVITY_CANARY_OK. Do not modify files and do not use tools.',
          repoDir,
          model: selectedModel.model_id,
          runner,
          env,
          timeoutMs: 120000,
        });
        const passed = String(result.response).trim() === 'DIAL_ANTIGRAVITY_CANARY_OK';
        authentication = { verified: true, method: 'cached_google_oauth', model_discovery_verified: discovery.ok };
        liveQualification = { passed, model_id: selectedModel.model_id, result_hash: result.result_hash, conversation_id_present: Boolean(result.conversation_id) };
        status = passed ? 'LIVE_QUALIFIED' : 'AUTHENTICATED';
        updateAvailabilityState({ root, observedAt, discovery, selectedModelId: selectedModel.model_id, canaryPassed: passed });
      } catch (error) {
        const failureClass = error?.category || 'PROVIDER_ERROR';
        if (failureClass === 'AUTH_REQUIRED' && !authentication.verified) status = 'AUTH_REQUIRED';
        else if (failureClass === 'CAPACITY_LIMITED') status = 'DEGRADED';
        else status = authentication.verified ? 'AUTHENTICATED' : 'IMPLEMENTED';
        liveQualification = { passed: false, model_id: selectedModel?.model_id || null, failure_class: failureClass };
        updateAvailabilityState({ root, observedAt, discovery, selectedModelId: selectedModel?.model_id || null, failureClass });
      }
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
    model_discovery: discovery,
    live_qualification: liveQualification,
    pairing_qualification: pairingQualification,
    orchestrated_use: { passed: Boolean(orchestratedProof) },
    proof_refs: proofRefs && typeof proofRefs === 'object' ? proofRefs : null,
    definition_of_done: dod,
    status,
  };
  return persistCapabilityEvidence(root, ANTIGRAVITY_CAPABILITY_ID, artifact);
}
