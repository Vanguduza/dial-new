#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function canonical(value) { return JSON.stringify(value, Object.keys(value).sort()); }
export function appendAudit(event, file = process.env.DIAL_CONTROL_AUDIT_LOG) {
  if (!file) return null;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  let previous_hash = null;
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    if (lines.length) previous_hash = JSON.parse(lines.at(-1)).record_hash ?? null;
  }
  const record = { ...event, previous_hash };
  const record_hash = crypto.createHash('sha256').update(canonical(record)).digest('hex');
  const finalRecord = { ...record, record_hash };
  fs.appendFileSync(file, `${JSON.stringify(finalRecord)}\n`, { encoding: 'utf8', mode: 0o600 });
  return finalRecord;
}

export function verifyLedger(file = process.env.DIAL_CONTROL_AUDIT_LOG) {
  if (!file || !fs.existsSync(file)) return { valid: true, records: 0 };
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
  let prev = null;
  for (let i = 0; i < lines.length; i++) {
    const r = JSON.parse(lines[i]);
    if ((r.previous_hash ?? null) !== prev) return { valid: false, records: i, reason: 'CHAIN_BREAK' };
    const { record_hash, ...unsigned } = r;
    const expected = crypto.createHash('sha256').update(canonical(unsigned)).digest('hex');
    if (expected !== record_hash) return { valid: false, records: i, reason: 'HASH_MISMATCH' };
    prev = record_hash;
  }
  return { valid: true, records: lines.length, head: prev };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(verifyLedger(process.argv[2]), null, 2));
