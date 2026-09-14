import { DEFAULT_ATTEMPT_BUDGET } from './constants.mjs';

export function resolveAttemptBudget({ registry, unit, provider } = {}) {
  return {
    ...DEFAULT_ATTEMPT_BUDGET,
    ...(registry?.attempt_budget_defaults || {}),
    ...(provider?.attempt_budget_defaults || {}),
    ...(unit?.control_plane_facts?.attempt_budget || {}),
  };
}

export function budgetState({ attempts = [], budget, nowMs = Date.now(), startedAtMs = null } = {}) {
  const used = attempts.length;
  const wall = startedAtMs == null ? 0 : Math.max(0, (nowMs - startedAtMs) / 1000);
  const lastWall = attempts.length ? Number(attempts[attempts.length - 1]?.wall_clock_s || 0) : 0;
  const exhaustedAttempts = used >= Number(budget.max_provider_attempts);
  const exhaustedTotalWall = wall >= Number(budget.max_total_wall_clock);
  const exhaustedAttemptWall = lastWall > Number(budget.max_attempt_wall_clock);
  return {
    used_attempts: used,
    elapsed_s: wall,
    exhausted: exhaustedAttempts || exhaustedTotalWall,
    exhausted_attempts: exhaustedAttempts,
    exhausted_total_wall: exhaustedTotalWall,
    exhausted_attempt_wall: exhaustedAttemptWall,
  };
}
