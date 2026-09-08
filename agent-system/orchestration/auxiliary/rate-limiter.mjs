import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const WINDOW_MS = 60_000;
const LEASE_MS = 120_000;

function nowIso(ms = Date.now()) { return new Date(ms).toISOString(); }
function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function defaultProviderRatePolicy(env = process.env) {
  return {
    max_requests_per_minute: Math.max(1, Math.floor(num(env.HAIF_XKIRO_MAX_RPM, 20))),
    max_tokens_per_minute: Math.max(1, Math.floor(num(env.HAIF_XKIRO_MAX_TPM, 100_000))),
    max_concurrency: Math.max(1, Math.floor(num(env.HAIF_XKIRO_MAX_CONCURRENCY, 2))),
  };
}

function statePath(accountRoot) { return path.join(accountRoot, 'rate-window.json'); }
function lockPath(accountRoot) { return path.join(accountRoot, '.rate-window.lock'); }
function initialState() {
  return { schema_version: 1, requests: [], active: {}, updated_at: null };
}
function readState(accountRoot) {
  try { return JSON.parse(fs.readFileSync(statePath(accountRoot), 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return initialState(); throw error; }
}

function writeState(accountRoot, state) {
  fs.mkdirSync(accountRoot, { recursive: true, mode: 0o700 });
  const target = statePath(accountRoot);
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify({ ...state, updated_at: nowIso() }, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, target);
}

function withLock(accountRoot, fn) {
  fs.mkdirSync(accountRoot, { recursive: true, mode: 0o700 });
  const lock = lockPath(accountRoot);
  const deadline = Date.now() + 2500;
  while (true) {
    try { fs.mkdirSync(lock, { mode: 0o700 }); break; }
    catch (error) {
      if (error?.code !== 'EEXIST' || Date.now() >= deadline) throw new Error('HAIF provider rate-window lock unavailable');
    }
  }
  try { return fn(); }
  finally { try { fs.rmdirSync(lock); } catch {} }
}
function normalizeState(state, nowMs) {
  const cutoff = nowMs - WINDOW_MS;
  const requests = (state.requests ?? []).filter((item) => Number(item.at_ms) >= cutoff);
  const active = {};
  for (const [id, lease] of Object.entries(state.active ?? {})) {
    if (Number(lease.expires_at_ms) > nowMs) active[id] = lease;
  }
  return { schema_version: 1, requests, active, updated_at: state.updated_at ?? null };
}

export function acquireProviderRateSlot({ accountRoot, estimatedTokens = 1, requestId = null, policy = defaultProviderRatePolicy(), nowMs = Date.now() } = {}) {
  if (!accountRoot) throw new Error('HAIF rate accountRoot is required');
  return withLock(accountRoot, () => {
    const state = normalizeState(readState(accountRoot), nowMs);
    const rpm = state.requests.length;
    const tpm = state.requests.reduce((sum, item) => sum + Math.max(0, num(item.tokens)), 0);
    const concurrency = Object.keys(state.active).length;
    const estimate = Math.max(1, Math.ceil(num(estimatedTokens, 1)));
    let reason = null;
    if (concurrency >= policy.max_concurrency) reason = 'PROVIDER_CONCURRENCY_LIMIT';
    else if (rpm >= policy.max_requests_per_minute) reason = 'PROVIDER_RPM_LIMIT';
    else if (tpm + estimate > policy.max_tokens_per_minute) reason = 'PROVIDER_TPM_LIMIT';
    if (reason) {
      const oldest = state.requests.map((x) => Number(x.at_ms)).filter(Number.isFinite).sort((a, b) => a - b)[0];
      const retryAfterMs = oldest ? Math.max(250, oldest + WINDOW_MS - nowMs) : 1000;
      writeState(accountRoot, state);
      return { admitted: false, reason, retry_after_ms: retryAfterMs, policy, observed: { rpm, tpm, concurrency } };
    }
    const reservationId = crypto.randomUUID();
    state.active[reservationId] = {
      reservation_id: reservationId, request_id: requestId, estimated_tokens: estimate,
      started_at_ms: nowMs, expires_at_ms: nowMs + LEASE_MS,
    };
    writeState(accountRoot, state);
    return { admitted: true, reservation_id: reservationId, policy, observed: { rpm, tpm, concurrency } };
  });
}
export function settleProviderRateSlot({ accountRoot, reservationId, actualTokens = null, nowMs = Date.now() } = {}) {
  if (!accountRoot || !reservationId) return null;
  return withLock(accountRoot, () => {
    const state = normalizeState(readState(accountRoot), nowMs);
    const lease = state.active?.[reservationId];
    if (!lease) return null;
    delete state.active[reservationId];
    const tokens = actualTokens == null
      ? Math.max(1, Math.ceil(num(lease.estimated_tokens, 1)))
      : Math.max(0, Math.ceil(num(actualTokens)));
    state.requests.push({
      reservation_id: reservationId,
      request_id: lease.request_id ?? null,
      at_ms: nowMs,
      tokens,
    });
    writeState(accountRoot, state);
    return { reservation_id: reservationId, tokens, at: nowIso(nowMs) };
  });
}

export function providerRateStatus(accountRoot, { policy = defaultProviderRatePolicy(), nowMs = Date.now() } = {}) {
  const state = normalizeState(readState(accountRoot), nowMs);
  return {
    policy,
    requests_last_minute: state.requests.length,
    tokens_last_minute: state.requests.reduce((sum, item) => sum + Math.max(0, num(item.tokens)), 0),
    active_concurrency: Object.keys(state.active).length,
  };
}
