#!/usr/bin/env node
import fs from 'node:fs';
import { cachedCodexIdentity, DEFAULT_IDENTITY_CACHE_MAX_AGE_MS, loadRuntimeIdentityCache } from './runtime-identity-cache.mjs';
import { loadRuntimeHealth } from './runtime-health.mjs';
import { primaryAttemptDecision } from './runtime-capacity-policy.mjs';
import { readJson, resolveControlPath } from './state-store.mjs';

function rows(rel, root) {
  try {
    return fs.readFileSync(resolveControlPath(rel, root), 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

export function runtimeCapacityStatus({ repoDir = process.env.DIAL_REPO_DIR || process.cwd(), root, nowMs = Date.now() } = {}) {
  const health = loadRuntimeHealth(root)?.runtimes?.codex_app_server ?? null;
  const identity = cachedCodexIdentity({ repoDir, root, nowMs });
  const decision = primaryAttemptDecision(health, { nowMs });
  const cutoff = nowMs - 24 * 60 * 60 * 1000;
  const recent = (rel) => rows(rel, root).filter((r) => {
    const t = Date.parse(r.at ?? r.observed_at ?? r.finished_at ?? '');
    return Number.isFinite(t) && t >= cutoff && t <= nowMs;
  });
  const probes = recent('events/runtime-probes.jsonl');
  const turns = recent('events/hermes-operational-turns.jsonl');
  const research = recent('events/engineering-research.jsonl');
  return {
    schema_version: 1,
    policy: 'SOL_CAPACITY_PRESERVATION_V1',
    primary_runtime: 'codex_app_server',
    primary_model: 'gpt-5.6-sol',
    fallback_model: 'claude-sonnet-5',
    current_health: health,
    primary_attempt: decision,
    identity_cache: {
      valid: Boolean(identity),
      observed_at: identity?.observed_at ?? null,
      source: identity?.source ?? null,
      fingerprint: identity?.fingerprint ?? loadRuntimeIdentityCache(root)?.runtimes?.codex_app_server?.fingerprint ?? null,
      max_age_hours: DEFAULT_IDENTITY_CACHE_MAX_AGE_MS / 3600000,
    },
    ahead_of_work_forecast: (() => {
      const f = readJson('knowledge/research/current-forecast.json', null, root);
      return f ? { state: f.state, forecast_id: f.forecast_id, created_at: f.created_at, runtime_provenance: f.runtime_provenance } : null;
    })(),
    last_24h: {
      live_codex_probes: probes.filter((r) => r.event === 'CODEX_APP_SERVER_PROBE' && r.live_inference !== false).length,
      reused_or_suppressed_codex_probes: probes.filter((r) => /PROBE_(?:SKIPPED|REUSED)/.test(r.event || '') || r.live_inference === false).length,
      sol_operational_completions: turns.filter((r) => r.event === 'HERMES_OPERATIONAL_TURN_COMPLETED' && r.runtime === 'codex_app_server').length,
      sol_attempts_suppressed: turns.filter((r) => r.event === 'HERMES_PRIMARY_ATTEMPT_SUPPRESSED').length,
      sol_research_forecasts: research.filter((r) => r.event === 'ENGINEERING_RESEARCH_FORECAST_MODEL_COMPLETED' && r.runtime === 'codex_app_server').length,
      sol_research_skipped: research.filter((r) => r.event === 'ENGINEERING_RESEARCH_SOL_SKIPPED').length,
    },
    rules: {
      supervisor_restart_invalidates_fresh_identity: false,
      background_live_probe_interval_hours: 12,
      semantic_research_ttl_hours: Number(process.env.DIAL_ENGINEERING_RESEARCH_TTL_HOURS || 12),
      probe_during_active_provider_cooldown: false,
      ordinary_packet_retries_sol_during_active_provider_cooldown: false,
      full_production_qualification_may_force_live_probe: true,
    },
    observed_at: new Date(nowMs).toISOString(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify(runtimeCapacityStatus({}), null, 2)}\n`);
}
