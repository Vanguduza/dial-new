import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PROTECTED_RESERVE_RATIO = 0.10;

function now() { return new Date().toISOString(); }
function num(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

export function normalizeUsage(payload = {}) {
  const free = payload?.free_tokens ?? {};
  const limit = Math.max(0, num(free.limit_per_day));
  const used = Math.max(0, num(free.used_today));
  const remaining = Math.max(0, num(free.remaining, Math.max(0, limit - used)));
  return {
    plan: payload?.plan ?? null,
    limit_per_day: limit,
    used_today: used,
    remaining,
    windows: Array.isArray(payload?.windows) ? payload.windows : [],
    wallet: payload?.wallet ?? null,
  };
}

export function quotaOperatingState(usage, { reserveRatio = PROTECTED_RESERVE_RATIO } = {}) {
  const u = normalizeUsage({ free_tokens: usage });
  if (u.limit_per_day <= 0 || u.remaining <= 0) return 'EXHAUSTED';
  const ratio = u.remaining / u.limit_per_day;
  if (ratio <= reserveRatio) return 'RESERVE';
  if (ratio <= 0.20) return 'CONSERVE';
  if (ratio >= 0.60) return 'ABUNDANT';
  return 'NORMAL';
}

function ledgerPath(accountRoot) { return path.join(accountRoot, 'allocation.json'); }
function lockPath(accountRoot) { return path.join(accountRoot, '.allocation.lock'); }
function defaultLedger(project = null) {
  return {
    schema_version: 2,
    provider: 'xkiro',
    account_scope: project,
    observed_limit: 0,
    reserved: 0,
    actual: 0,
    reservations: {},
    updated_at: now(),
  };
}

export function readAllocationLedger(accountRoot, project = null) {
  try { return JSON.parse(fs.readFileSync(ledgerPath(accountRoot), 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return defaultLedger(project); throw error; }
}

function writeLedger(ledger, accountRoot) {
  const target = ledgerPath(accountRoot);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify({ ...ledger, updated_at: now() }, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, target);
  return target;
}

function withLedgerLock(accountRoot, fn) {
  const lock = lockPath(accountRoot);
  fs.mkdirSync(path.dirname(lock), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 2500;
  while (true) {
    try { fs.mkdirSync(lock, { mode: 0o700 }); break; }
    catch (error) {
      if (error?.code !== 'EEXIST' || Date.now() > deadline) throw new Error('HAIF account quota ledger lock unavailable');
    }
  }
  try { return fn(); } finally { try { fs.rmdirSync(lock); } catch {} }
}

export function admissionDecision({ project, usagePayload, estimatedTokens, accountRoot, priority = 'NORMAL' }) {
  if (!['dial', 'dde'].includes(project)) throw new Error('HAIF project must be dial or dde');
  if (!accountRoot) throw new Error('HAIF accountRoot is required');
  const usage = normalizeUsage(usagePayload);
  const state = quotaOperatingState({ limit_per_day: usage.limit_per_day, used_today: usage.used_today, remaining: usage.remaining });
  const estimate = Math.max(1, Math.ceil(num(estimatedTokens, 1)));
  if (state === 'EXHAUSTED') return { admitted: false, reason: 'FREE_QUOTA_EXHAUSTED', state, usage };
  const reserve = usage.limit_per_day * PROTECTED_RESERVE_RATIO;
  if (usage.remaining - estimate < reserve && priority !== 'PRIORITY') {
    return { admitted: false, reason: 'PROTECTED_RESERVE', state: 'RESERVE', usage };
  }
  const ledger = readAllocationLedger(accountRoot, project);
  if (ledger.account_scope && ledger.account_scope !== project) {
    return { admitted: false, reason: 'ACCOUNT_SCOPE_MISMATCH', state, usage };
  }
  if (num(ledger.reserved) + estimate > usage.remaining - reserve && priority !== 'PRIORITY') {
    return { admitted: false, reason: 'ACCOUNT_CAPACITY_RESERVED', state, usage };
  }
  return { admitted: true, reason: 'WITHIN_PROJECT_ACCOUNT_CAPACITY', state, usage };
}

export function reserveQuota({ project, estimatedTokens, usagePayload, accountRoot, taskId, priority = 'NORMAL' }) {
  const decision = admissionDecision({ project, estimatedTokens, usagePayload, accountRoot, priority });
  if (!decision.admitted) return decision;
  return withLedgerLock(accountRoot, () => {
    const ledger = readAllocationLedger(accountRoot, project);
    if (ledger.account_scope && ledger.account_scope !== project) throw new Error('HAIF account quota ledger scope mismatch');
    ledger.account_scope = project;
    ledger.observed_limit = decision.usage.limit_per_day;
    const reservationId = crypto.randomUUID();
    const amount = Math.max(1, Math.ceil(num(estimatedTokens, 1)));
    ledger.reserved = num(ledger.reserved) + amount;
    ledger.reservations ??= {};
    ledger.reservations[reservationId] = { reservation_id: reservationId, task_id: taskId ?? null, project, amount, created_at: now() };
    writeLedger(ledger, accountRoot);
    return { ...decision, reservation_id: reservationId, reserved_tokens: amount };
  });
}

export function settleQuota({ reservationId, actualTokens = 0, accountRoot }) {
  if (!reservationId) return null;
  return withLedgerLock(accountRoot, () => {
    const ledger = readAllocationLedger(accountRoot);
    const reservation = ledger.reservations?.[reservationId];
    if (!reservation) return null;
    ledger.reserved = Math.max(0, num(ledger.reserved) - num(reservation.amount));
    ledger.actual = num(ledger.actual) + Math.max(0, num(actualTokens));
    delete ledger.reservations[reservationId];
    writeLedger(ledger, accountRoot);
    return { project: reservation.project, released_tokens: reservation.amount, actual_tokens: Math.max(0, num(actualTokens)) };
  });
}

export function resetDailyActualsIfProviderReset({ project, usagePayload, accountRoot }) {
  const usage = normalizeUsage(usagePayload);
  return withLedgerLock(accountRoot, () => {
    const ledger = readAllocationLedger(accountRoot, project);
    if (usage.used_today < num(ledger.actual)) ledger.actual = 0;
    ledger.account_scope = project;
    ledger.observed_limit = usage.limit_per_day;
    writeLedger(ledger, accountRoot);
    return ledger;
  });
}
