import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeUsage } from '../../auxiliary/quota-allocator.mjs';
import { XKIRO_BASE_URL } from './xkiro-catalog.mjs';
import { classifyXKiroHttpError } from './xkiro-errors.mjs';

function now() { return new Date().toISOString(); }
function sha(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }

export async function fetchXKiroUsage({ apiKey, fetchImpl = globalThis.fetch, baseUrl = XKIRO_BASE_URL } = {}) {
  if (!apiKey) throw new Error('xKiro API key is required for usage');
  const response = await fetchImpl(`${baseUrl}/usage`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json', 'user-agent': 'hermes-haif/1.1' },
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) throw classifyXKiroHttpError(response.status, payload, response.headers);
  const normalized = normalizeUsage(payload);
  const safe = {
    schema_version: 1, provider: 'xkiro', observed_at: now(), plan: normalized.plan,
    windows: normalized.windows, free_tokens: {
      used_today: normalized.used_today, limit_per_day: normalized.limit_per_day, remaining: normalized.remaining,
    }, wallet: normalized.wallet,
  };
  safe.usage_snapshot_id = `sha256:${sha(JSON.stringify(safe))}`;
  return safe;
}
export function persistUsageSnapshot(snapshot, providerRoot) {
  const dir = path.join(providerRoot, 'xkiro', 'usage');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const latest = path.join(dir, 'latest.json');
  const history = path.join(dir, 'history.jsonl');
  fs.writeFileSync(latest, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  fs.appendFileSync(history, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
  return snapshot;
}

export function usageEquivalent(a, b) {
  if (!a || !b) return false;
  return a.plan === b.plan
    && Number(a.free_tokens?.limit_per_day) === Number(b.free_tokens?.limit_per_day)
    && Number(a.free_tokens?.used_today) === Number(b.free_tokens?.used_today)
    && Number(a.free_tokens?.remaining) === Number(b.free_tokens?.remaining);
}
