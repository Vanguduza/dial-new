#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCheckpoint, saveCheckpoint } from './checkpoint-store.mjs';
import { buildDialHermesContext } from './context-broker.mjs';
import { runClaudeHermesFallback } from './claude-fallback-runner.mjs';
import { spawnCapture } from './process-capture.mjs';
import { reconcileHermesRuntime } from './hermes-runtime-router.mjs';
import {
  HERMES_PREFERRED_CLAUDE_MODEL,
  HERMES_PREFERRED_CODEX_MODEL,
} from './hermes-plan-models.mjs';
import { loadRuntimeHealth, recordRuntimeHealth, runtimeEligible } from './runtime-health.mjs';
import { cachedCodexIdentity, recordCodexIdentityProof } from './runtime-identity-cache.mjs';
import { parseProviderRetryAfter, primaryAttemptDecision } from './runtime-capacity-policy.mjs';
import { appendJsonl } from './state-store.mjs';
import { activationSummary, loadSkillActivationForPacket, renderSkillActivationBundle, verifySkillActivation } from './skill-activation-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const PRIMARY_MODEL = HERMES_PREFERRED_CODEX_MODEL;
const FALLBACK_MODEL = HERMES_PREFERRED_CLAUDE_MODEL;
const HERMES_BIN = process.env.DIAL_HERMES_BIN || (process.env.HOME && fs.existsSync(path.join(process.env.HOME, '.local/bin/hermes')) ? path.join(process.env.HOME, '.local/bin/hermes') : 'hermes');
const FAILOVER_STATES = new Set([
  'ACCOUNT_LIMITED',
  'RATE_LIMITED',
  'MODEL_LIMITED',
  'AUTH_FAILED',
  'PROCESS_FAILED',
  'STALLED',
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

export function resolvePrimaryTurnIdentity({ usage = null, preTurnHealth = null, cachedIdentity = null } = {}) {
  const directUsageIdentity = usage?.model === PRIMARY_MODEL && usage?.provider === 'openai-codex';
  const freshPinnedPreflightIdentity = Boolean(
    preTurnHealth
    && runtimeEligible(preTurnHealth, { hardPin: true, requireFresh: true, maxAgeMs: 15 * 60 * 1000 })
    && preTurnHealth?.requested_model === PRIMARY_MODEL
    && preTurnHealth?.resolved_model === PRIMARY_MODEL
    && preTurnHealth?.details?.identity_proven === true
    && preTurnHealth?.details?.rerouted !== true
  );
  const cachedPinnedIdentity = Boolean(
    cachedIdentity?.identity_proven === true
    && cachedIdentity?.requested_model === PRIMARY_MODEL
    && cachedIdentity?.resolved_model === PRIMARY_MODEL
  );
  const identityProven = directUsageIdentity || (
    usage?.model == null
    && usage?.provider == null
    && (freshPinnedPreflightIdentity || cachedPinnedIdentity)
  );
  return {
    identityProven,
    resolvedModel: usage?.model ?? (identityProven ? PRIMARY_MODEL : null),
    provider: usage?.provider ?? (identityProven ? 'openai-codex' : null),
    identitySource: directUsageIdentity
      ? 'HERMES_USAGE_REPORT'
      : (freshPinnedPreflightIdentity
        ? 'EXPLICIT_HERMES_HARD_PIN_PLUS_FRESH_CODEX_PROVENANCE'
        : (cachedPinnedIdentity ? 'EXPLICIT_HERMES_HARD_PIN_PLUS_CACHED_CODEX_PROVENANCE' : null)),
  };
}

export async function runPrimaryHermes({
  repoDir = DEFAULT_REPO,
  instruction = '',
  root,
  timeoutMs = 30 * 60 * 1000,
  model = PRIMARY_MODEL,
  packetId = null,
  skillActivation = null,
} = {}) {
  const requestedModel = String(model || PRIMARY_MODEL);
  if (requestedModel !== PRIMARY_MODEL) {
    throw new Error(`DIAL Hermes primary model is hard-pinned to ${PRIMARY_MODEL}; requested ${requestedModel}`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-hermes-primary-'));
  const usageFile = path.join(tempDir, 'usage.json');
  const startedAt = now();
  try {
    const result = await spawnCapture(HERMES_BIN, [
      '-z',
      instruction,
      '--provider', 'openai-codex',
      '--model', PRIMARY_MODEL,
      '--usage-file', usageFile,
    ], {
      cwd: repoDir,
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        DIAL_CONTROL_HOME: root || process.env.DIAL_CONTROL_HOME,
        DIAL_REPO_DIR: repoDir,
        ...(packetId ? { DIAL_PACKET_ID: packetId } : {}),
        ...(skillActivation?.activation_id ? { DIAL_SKILL_ACTIVATION_ID: skillActivation.activation_id } : {}),
        ...(skillActivation?.runtime_skill_dir ? { DIAL_SKILL_ACTIVATION_DIR: skillActivation.runtime_skill_dir } : {}),
      },
    });

    const usage = readJsonFile(usageFile);
    const preTurnHealth = loadRuntimeHealth(root)?.runtimes?.codex_app_server ?? null;
    const cachedIdentity = cachedCodexIdentity({ repoDir, root });
    // Hermes' current openai-codex one-shot usage report can omit model/provider even
    // when the underlying Codex App Server turn is hard-pinned. In that specific
    // case, preserve fail-closed identity by requiring fresh exact App Server
    // provenance immediately before the explicitly pinned --provider/--model turn.
    const { identityProven, resolvedModel, provider, identitySource } = resolvePrimaryTurnIdentity({ usage, preTurnHealth, cachedIdentity });
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

    const retryAfter = state === 'ACCOUNT_LIMITED' || state === 'RATE_LIMITED' || state === 'MODEL_LIMITED'
      ? parseProviderRetryAfter([result.stderr, result.stdout, usage ? JSON.stringify(usage) : '', result.error?.message].filter(Boolean).join('\n'))
      : null;
    if (identityProven) recordCodexIdentityProof({ repoDir, root, source: 'HERMES_OPERATIONAL_TURN', sessionId: usage?.session_id ?? null });
    const observation = recordRuntimeHealth('codex_app_server', {
      state,
      requested_model: PRIMARY_MODEL,
      resolved_model: resolvedModel,
      retry_after: retryAfter,
      reason: ok
        ? `operational Hermes turn completed through Codex App Server with exact ${PRIMARY_MODEL} provenance`
        : `operational Hermes turn failed or lost hard-pin proof: ${state}`,
      details: {
        identity_proven: identityProven,
        toolchain_usable: ok,
        provider,
        session_id: usage?.session_id ?? null,
        exit_status: result.status,
        signal: result.signal ?? null,
        source: 'operational_turn',
        preferred_model: PRIMARY_MODEL,
        identity_source: identitySource,
        preflight_observed_at: preTurnHealth?.observed_at ?? null,
        executable: HERMES_BIN,
      },
    }, root);

    return {
      ok,
      runtime: 'codex_app_server',
      preferred_model: PRIMARY_MODEL,
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
  const exactHealthy = () => Boolean(
    runtimeEligible(health, { hardPin: true, requireFresh: true })
    && health?.requested_model === FALLBACK_MODEL
    && health?.resolved_model === FALLBACK_MODEL,
  );

  if (!exactHealthy()) {
    const { probeClaudeCode } = await import('./claude-code-probe.mjs');
    probeClaudeCode({ repoDir, root });
    health = loadRuntimeHealth(root)?.runtimes?.claude_code ?? null;
  }

  if (!exactHealthy()) {
    return { eligible: false, reason: 'CLAUDE_SONNET_5_NOT_HEALTHY', health };
  }

  const selection = reconcileHermesRuntime({ root, includeRuntimes: ['claude_code'] });
  if (
    !selection.selected
    || selection.selection?.runtime !== 'claude_code'
    || selection.selection?.requested_model !== FALLBACK_MODEL
    || selection.selection?.resolved_model !== FALLBACK_MODEL
  ) {
    return { eligible: false, reason: 'CLAUDE_SONNET_5_NOT_SELECTED', health, selection };
  }

  return { eligible: true, health, selection: selection.selection };
}

function completedEventBase(startedAt) {
  return {
    event: 'HERMES_OPERATIONAL_TURN_COMPLETED',
    authority: 'HERMES_RUNTIME_ONLY',
    policy: 'LOCKED_SOL_THEN_SONNET',
    started_at: startedAt,
    finished_at: now(),
  };
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
  packetId = null,
  skillActivation = null,
} = {}) {
  if (!String(instruction || '').trim()) throw new Error('instruction is required');

  const startedAt = now();
  let activation = skillActivation || (packetId ? loadSkillActivationForPacket(packetId, root) : null);
  if (activation) {
    const activationCheck = verifySkillActivation(activation, root);
    if (!activationCheck.ok) {
      const event = { event: 'HERMES_OPERATIONAL_TURN_FAILED', authority: 'HERMES_RUNTIME_ONLY', policy: 'LOCKED_SOL_THEN_SONNET', runtime: null, fallback_used: false, failure_state: 'SKILL_ACTIVATION_INVALID', reason: activationCheck.failures.join('; '), skill_activation_id: activation.activation_id, started_at: startedAt, finished_at: now() };
      appendJsonl('events/hermes-operational-turns.jsonl', event, root);
      return event;
    }
  }
  const skillSummary = activationSummary(activation);
  const instructionWithKnowledge = activation ? [
    'DIAL VEKL ACTIVATION',
    `Activation ID: ${activation.activation_id}`,
    `Manifest SHA-256: ${activation.manifest_sha256}`,
    `Resolution: ${activation.resolution_state}`,
    `Selected approved skills: ${(activation.skills || []).map((s) => `${s.skill_id}@${s.upstream_commit}`).join(', ') || 'none'}`,
    'Only the listed approved skill versions may be treated as activated engineering guidance for this packet. They are non-authoritative: DIAL canon/FRC/security/current code/evidence win.',
    'When a selected skill has a runtime_name, use Hermes skill_view for that exact activated skill before relying on it.',
    '',
    instruction,
  ].join('\n') : instruction;
  const priorPrimaryHealth = loadRuntimeHealth(root)?.runtimes?.codex_app_server ?? null;
  const primaryDecision = primaryAttemptDecision(priorPrimaryHealth);
  let primary;
  if (!primaryDecision.allowed) {
    primary = {
      ok: false,
      runtime: 'codex_app_server',
      preferred_model: PRIMARY_MODEL,
      requested_model: PRIMARY_MODEL,
      resolved_model: priorPrimaryHealth?.resolved_model ?? null,
      state: priorPrimaryHealth?.state ?? 'UNKNOWN',
      skipped: true,
      skip_reason: primaryDecision.reason,
      retry_after: primaryDecision.retry_after ?? priorPrimaryHealth?.retry_after ?? null,
      health: priorPrimaryHealth,
      started_at: startedAt,
      finished_at: now(),
    };
    appendJsonl('events/hermes-operational-turns.jsonl', {
      event: 'HERMES_PRIMARY_ATTEMPT_SUPPRESSED',
      runtime: 'codex_app_server', requested_model: PRIMARY_MODEL,
      state: primary.state, reason: primary.skip_reason, retry_after: primary.retry_after,
      packet_id: packetId, at: now(),
    }, root);
  } else {
    primary = await primaryRunner({ repoDir, instruction: instructionWithKnowledge, root, timeoutMs, model: PRIMARY_MODEL, packetId, skillActivation: activation });
  }
  if (primary?.ok) {
    reconcileHermesRuntime({ root });
    const event = {
      ...completedEventBase(startedAt),
      runtime: 'codex_app_server',
      preferred_model: PRIMARY_MODEL,
      requested_model: PRIMARY_MODEL,
      selected_model: PRIMARY_MODEL,
      resolved_model: PRIMARY_MODEL,
      in_plan_fallback: false,
      fallback_used: false,
      skill_activation_id: activation?.activation_id ?? null,
      skill_manifest_sha256: activation?.manifest_sha256 ?? null,
      selected_skills: skillSummary?.selected_skills ?? [],
    };
    appendJsonl('events/hermes-operational-turns.jsonl', event, root);
    return { ...event, response: primary.response, primary };
  }

  const failureState = primary?.state || 'PROCESS_FAILED';
  if (!failoverEligible(failureState)) {
    const event = {
      event: 'HERMES_OPERATIONAL_TURN_FAILED',
      authority: 'HERMES_RUNTIME_ONLY',
      policy: 'LOCKED_SOL_THEN_SONNET',
      runtime: 'codex_app_server',
      preferred_model: PRIMARY_MODEL,
      requested_model: PRIMARY_MODEL,
      selected_model: null,
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
    atomic_unit: 'SOL_RUNTIME_FAILED',
    next_unit: 'CONTINUE_FROM_OBSERVED_REPOSITORY_STATE_ON_SONNET',
    skill_activation: skillSummary,
    runtime_provenance: {
      runtime: 'codex_app_server',
      preferred_model: PRIMARY_MODEL,
      requested_model: PRIMARY_MODEL,
      selected_model: null,
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
      policy: 'LOCKED_SOL_THEN_SONNET',
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

  if (packetId) {
    const latestActivation = loadSkillActivationForPacket(packetId, root);
    if (latestActivation?.activation_id && latestActivation.activation_id !== activation?.activation_id) {
      const latestCheck = verifySkillActivation(latestActivation, root);
      if (!latestCheck.ok) throw new Error(`audited VEKL re-resolution is invalid: ${latestCheck.failures.join('; ')}`);
      appendJsonl('events/engineering-knowledge.jsonl', { event: 'SKILL_ACTIVATION_FAILOVER_RELOAD', packet_id: packetId, from_activation_id: activation?.activation_id ?? null, to_activation_id: latestActivation.activation_id, reason: latestActivation.re_resolution_reason || 'packet activation pointer changed through persisted re-resolution', at: now() }, root);
      activation = latestActivation;
    }
  }
  const fallbackSkillBundle = activation ? renderSkillActivationBundle(activation, root) : '';
  const packet = await contextBuilder({
    repoDir,
    userMessage: instruction,
    root,
    packetId,
    skillActivation: activation,
  });
  const fallbackInstruction = [
    'PRIMARY HERMES RUNTIME FAILURE',
    `Failure class: ${failureState}`,
    '',
    primary?.skipped
      ? `The ${PRIMARY_MODEL} / Codex App Server call was intentionally skipped because a known provider cooldown is active; no primary tool actions occurred in this packet.`
      : `The ${PRIMARY_MODEL} / Codex App Server attempt may have completed some tool actions before the runtime failed.`,
    primary?.skipped
      ? 'Continue through the exact approved fallback from current repository state without spending another Sol inference during the cooldown.'
      : 'Do not blindly replay the failed attempt. Inspect the current repository/worktree first and continue only from observable current state.',
    'DIAL repository canon, Feature IDs, FRCs, gates, tests and evidence remain authoritative.',
    'Do not advance a gate merely because previous runtime prose or memory says work is complete.',
    `The only permitted fallback runtime is official Claude Code with exact ${FALLBACK_MODEL}.`,
    '',
    'ORIGINAL INSTRUCTION',
    instruction,
  ].join('\n');

  try {
    const fallback = await fallbackRunner({
      repoDir,
      instruction: fallbackInstruction,
      context: packet.context,
      mode: 'operational',
      root,
      timeoutMs,
      packetId,
      skillActivation: activation,
      skillBundle: fallbackSkillBundle,
    });

    const resolved = fallback?.event?.resolved_model ?? null;
    if (resolved !== FALLBACK_MODEL) {
      throw new Error(`Hermes fallback identity mismatch: expected ${FALLBACK_MODEL}, resolved ${resolved ?? 'unknown'}`);
    }

    const event = {
      ...completedEventBase(startedAt),
      runtime: 'claude_code',
      preferred_model: FALLBACK_MODEL,
      requested_model: FALLBACK_MODEL,
      selected_model: FALLBACK_MODEL,
      resolved_model: FALLBACK_MODEL,
      in_plan_fallback: false,
      fallback_used: true,
      primary_failure_state: failureState,
      primary_requested_model: PRIMARY_MODEL,
      skill_activation_id: activation?.activation_id ?? null,
      skill_manifest_sha256: activation?.manifest_sha256 ?? null,
      selected_skills: activationSummary(activation)?.selected_skills ?? [],
    };
    appendJsonl('events/hermes-operational-turns.jsonl', event, root);
    return {
      ...event,
      response: fallback?.output?.result ?? fallback?.output ?? null,
      primary,
      fallback,
    };
  } catch (error) {
    const event = {
      event: 'HERMES_OPERATIONAL_TURN_FAILED',
      authority: 'HERMES_RUNTIME_ONLY',
      policy: 'LOCKED_SOL_THEN_SONNET',
      runtime: 'claude_code',
      preferred_model: FALLBACK_MODEL,
      requested_model: FALLBACK_MODEL,
      selected_model: null,
      resolved_model: null,
      fallback_used: true,
      primary_failure_state: failureState,
      failure_state: 'FALLBACK_FAILED',
      reason: bounded(error?.message || error),
      skill_activation_id: activation?.activation_id ?? null,
      skill_manifest_sha256: activation?.manifest_sha256 ?? null,
      started_at: startedAt,
      finished_at: now(),
    };
    appendJsonl('events/hermes-operational-turns.jsonl', event, root);
    return { ...event, primary, fallback_error: bounded(error?.stack || error) };
  }
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
  if (result.event !== 'HERMES_OPERATIONAL_TURN_COMPLETED') process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
