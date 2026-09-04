import crypto from 'node:crypto';
import { appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';
import { healthFresh, loadRuntimeHealth, runtimeEligible } from './runtime-health.mjs';
import {
  HERMES_PREFERRED_CLAUDE_MODEL,
  HERMES_PREFERRED_CODEX_MODEL,
} from './hermes-plan-models.mjs';

export const HERMES_RUNTIME_POLICY = Object.freeze([
  {
    runtime: 'codex_app_server',
    requested_model: HERMES_PREFERRED_CODEX_MODEL,
    role: 'HERMES_PRIMARY_RUNTIME',
    hard_pin: true,
    rank: 10,
  },
  {
    runtime: 'claude_code',
    requested_model: HERMES_PREFERRED_CLAUDE_MODEL,
    role: 'HERMES_FALLBACK_RUNTIME',
    hard_pin: true,
    rank: 20,
  },
]);

function now() { return new Date().toISOString(); }

function exactHealthy(slot, expectedModel) {
  return Boolean(
    slot
    && slot.requested_model === expectedModel
    && slot.resolved_model === expectedModel
    && runtimeEligible(slot, { hardPin: true, requireFresh: true })
    && healthFresh(slot),
  );
}

function candidateFromSlot({ runtime, role, requested_model, health }) {
  return {
    runtime,
    role,
    preferred_model: requested_model,
    requested_model,
    selected_model: requested_model,
    hard_pin: true,
    in_plan_fallback: false,
    plan_source: null,
    health,
  };
}

/**
 * DIAL Hermes has exactly two executable runtime slots.
 *
 * 1. Codex App Server / GPT-5.6 Sol
 * 2. official Claude Code / Claude Sonnet 5
 *
 * Model discovery may exist elsewhere for observability, but discovered models
 * are never executable fallbacks for Hermes. If neither locked slot has fresh,
 * exact, toolchain-usable HEALTHY evidence the router fails closed.
 */
export function selectHermesRuntime(runtimeHealth, options = {}) {
  const includeRuntimes = new Set(
    Array.isArray(options)
      ? ['codex_app_server', 'claude_code']
      : (options.includeRuntimes ?? ['codex_app_server', 'claude_code']),
  );
  const runtimes = runtimeHealth?.runtimes ?? {};

  const sol = runtimes.codex_app_server;
  if (includeRuntimes.has('codex_app_server') && exactHealthy(sol, HERMES_PREFERRED_CODEX_MODEL)) {
    return candidateFromSlot({
      runtime: 'codex_app_server',
      role: 'HERMES_PRIMARY_RUNTIME',
      requested_model: HERMES_PREFERRED_CODEX_MODEL,
      health: sol,
    });
  }

  const sonnet = runtimes.claude_code;
  if (includeRuntimes.has('claude_code') && exactHealthy(sonnet, HERMES_PREFERRED_CLAUDE_MODEL)) {
    return candidateFromSlot({
      runtime: 'claude_code',
      role: 'HERMES_FALLBACK_RUNTIME',
      requested_model: HERMES_PREFERRED_CLAUDE_MODEL,
      health: sonnet,
    });
  }

  return null;
}

export function issueHermesRuntimeSelection({ candidate, previous_selection_id = null }, root) {
  if (!candidate) throw new Error('Hermes runtime candidate is required');
  if (!runtimeEligible(candidate.health, { hardPin: true, requireFresh: true })) {
    throw new Error('Hermes runtime candidate does not have fresh identity-proven HEALTHY evidence');
  }
  if (
    candidate.health.requested_model !== candidate.requested_model
    || candidate.health.resolved_model !== candidate.requested_model
  ) {
    throw new Error('Hermes runtime policy/model does not match runtime health evidence');
  }

  const selection = {
    schema_version: 4,
    selection_id: crypto.randomUUID(),
    authority: 'HERMES_RUNTIME_ONLY',
    policy: 'LOCKED_SOL_THEN_SONNET',
    role: candidate.role,
    runtime: candidate.runtime,
    preferred_model: candidate.requested_model,
    requested_model: candidate.requested_model,
    selected_model: candidate.requested_model,
    resolved_model: candidate.requested_model,
    in_plan_fallback: false,
    plan_source: null,
    runtime_session: candidate.health.details?.session_id ?? candidate.health.details?.thread_id ?? null,
    runtime_health: candidate.health.state,
    runtime_health_observed_at: candidate.health.observed_at,
    status: 'ACTIVE',
    selected_at: now(),
    previous_selection_id,
  };
  writeJsonAtomic('state/hermes-runtime.json', selection, root);
  appendJsonl('events/hermes-runtime.jsonl', { event: 'HERMES_RUNTIME_SELECTED', ...selection }, root);
  return selection;
}

export function expireHermesRuntimeSelection(reason = 'UNSPECIFIED', root) {
  const existing = readJson('state/hermes-runtime.json', null, root);
  if (!existing || existing.status !== 'ACTIVE') return existing;
  const expired = {
    ...existing,
    status: 'EXPIRED',
    expired_at: now(),
    expiration_reason: reason,
  };
  writeJsonAtomic('state/hermes-runtime.json', expired, root);
  appendJsonl('events/hermes-runtime.jsonl', { event: 'HERMES_RUNTIME_EXPIRED', ...expired }, root);
  return expired;
}

export function reconcileHermesRuntime({
  root,
  runtimeHealth = loadRuntimeHealth(root),
  includeRuntimes,
} = {}) {
  const previous = readJson('state/hermes-runtime.json', null, root);
  const candidate = selectHermesRuntime(runtimeHealth, { includeRuntimes });

  if (!candidate) {
    if (previous?.status === 'ACTIVE') expireHermesRuntimeSelection('NO_HERMES_RUNTIME_AVAILABLE', root);
    return { selected: false, reason: 'NO_HERMES_RUNTIME_AVAILABLE', runtime_health: runtimeHealth };
  }

  if (
    previous?.status === 'ACTIVE'
    && previous.policy === 'LOCKED_SOL_THEN_SONNET'
    && previous.runtime === candidate.runtime
    && previous.requested_model === candidate.requested_model
    && previous.resolved_model === candidate.requested_model
    && healthFresh(candidate.health)
  ) {
    return { selected: true, changed: false, selection: previous };
  }

  if (previous?.status === 'ACTIVE') expireHermesRuntimeSelection('HERMES_RUNTIME_RESELECTION', root);
  const selection = issueHermesRuntimeSelection({
    candidate,
    previous_selection_id: previous?.selection_id ?? null,
  }, root);
  return { selected: true, changed: true, selection };
}
