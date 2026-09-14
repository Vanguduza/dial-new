import fs from 'node:fs';
import path from 'node:path';

// Structured JSONL event log. Every bootstrap action, probe and decision is one event.
// Values are redacted through `redact()` before they are written; secrets never enter the log.
// [pattern, replacement]. Prefix-preserving patterns keep the key/scheme and replace only the value.
const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9_-]{16,}/g, 'REDACTED'],
  [/gh[pousr]_[A-Za-z0-9]{20,}/g, 'REDACTED'],
  [/github_pat_[A-Za-z0-9_]{20,}/g, 'REDACTED'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/g, 'REDACTED'],
  [/AKIA[0-9A-Z]{16}/g, 'REDACTED'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, 'REDACTED'],
  [/((?:api[_-]?key|token|secret|password|authorization)\s*[=:]\s*)([^\s"',;]{8,})/gi, '$1REDACTED'],
  [/(Bearer\s+)([A-Za-z0-9._~+/-]{16,})/gi, '$1REDACTED'],
];

export function redact(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    let out = value;
    for (const [re, rep] of SECRET_PATTERNS) out = out.replace(re, rep);
    return out;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  return value;
}

export function createLogger({ file = null, runId, quiet = false, json = false } = {}) {
  if (file) fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const events = [];
  function emit(level, event, data = {}) {
    const row = redact({ ts: new Date().toISOString(), run_id: runId, level, event, ...data });
    events.push(row);
    if (file) fs.appendFileSync(file, `${JSON.stringify(row)}\n`, { mode: 0o600 });
    if (!quiet && !json) {
      const tag = level === 'error' ? '✗' : level === 'warn' ? '!' : level === 'ok' ? '✓' : '·';
      const extra = data.status ? ` [${data.status}]` : '';
      process.stderr.write(`${tag} ${event}${extra}${data.message ? ` — ${data.message}` : ''}\n`);
    }
    return row;
  }
  return {
    info: (e, d) => emit('info', e, d),
    ok: (e, d) => emit('ok', e, d),
    warn: (e, d) => emit('warn', e, d),
    error: (e, d) => emit('error', e, d),
    events,
  };
}
