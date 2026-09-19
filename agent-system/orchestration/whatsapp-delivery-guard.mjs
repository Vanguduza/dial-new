import fs from 'node:fs';
import path from 'node:path';
import { readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';

export const WHATSAPP_RETENTION = Object.freeze({ max_processed: 500, max_age_ms: 7 * 24 * 60 * 60 * 1000, rate_limit: 20, rate_window_ms: 60_000 });

export function consumeSenderRateLimit({ root, senderHash, nowMs = Date.now(), limit = WHATSAPP_RETENTION.rate_limit, windowMs = WHATSAPP_RETENTION.rate_window_ms } = {}) {
  if (!/^[0-9a-f]{16,64}$/.test(String(senderHash || ''))) throw new Error('WHATSAPP_SENDER_HASH_REQUIRED');
  const rel = `operator-channels/whatsapp/rate/${senderHash}.json`;
  const prior = readJson(rel, { timestamps: [] }, root);
  const timestamps = (prior.timestamps || []).map(Number).filter((value) => Number.isFinite(value) && nowMs - value < windowMs);
  if (timestamps.length >= limit) return { ok: false, retry_after_ms: Math.max(1, windowMs - (nowMs - timestamps[0])), count: timestamps.length };
  timestamps.push(nowMs);
  writeJsonAtomic(rel, { schema_version: 1, sender_hash: senderHash, timestamps: timestamps.slice(-limit), updated_at: new Date(nowMs).toISOString() }, root);
  return { ok: true, count: timestamps.length, remaining: Math.max(0, limit - timestamps.length) };
}

export function gcProcessedMessageFiles({ root, nowMs = Date.now(), maxEntries = WHATSAPP_RETENTION.max_processed, maxAgeMs = WHATSAPP_RETENTION.max_age_ms } = {}) {
  const dir = resolveControlPath('operator-channels/whatsapp/processed', root);
  if (!fs.existsSync(dir)) return { removed: 0, retained: 0 };
  const rows = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => {
    const file = path.join(dir, name); const stat = fs.statSync(file); const value = readJson(`operator-channels/whatsapp/processed/${name}`, {}, root);
    const completed = Date.parse(value.completed_at || value.reply_sent_at || '') || stat.mtimeMs;
    return { file, completed };
  }).sort((a, b) => b.completed - a.completed);
  const remove = rows.filter((row, index) => index >= maxEntries || nowMs - row.completed > maxAgeMs);
  for (const row of remove) fs.unlinkSync(row.file);
  return { removed: remove.length, retained: rows.length - remove.length };
}

export function compactProcessedIds(processed, { nowMs = Date.now(), maxEntries = 250, maxAgeMs = WHATSAPP_RETENTION.max_age_ms } = {}) {
  return (processed || []).map((item) => typeof item === 'string' ? { id_hash: item, at_ms: nowMs } : item)
    .filter((item) => item?.id_hash && Number.isFinite(Number(item.at_ms)) && nowMs - Number(item.at_ms) <= maxAgeMs)
    .slice(-maxEntries);
}
