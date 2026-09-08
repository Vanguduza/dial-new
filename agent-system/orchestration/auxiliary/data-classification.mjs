import crypto from 'node:crypto';
import { readJson } from '../state-store.mjs';

export const DATA_CLASSES = Object.freeze([
  'PUBLIC', 'INTERNAL_SANITIZED', 'RESTRICTED', 'SECRET_HIGH_SENSITIVITY',
]);

const SECRET_PATTERNS = Object.freeze([
  /\bsk-xt-[A-Za-z0-9_-]{12,}\b/g,
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}\b/gi,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\b(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|CLIENT_SECRET|PASSWORD|SIGNING_KEY)\b\s*[=:]\s*[^\s,;]+/gi,
]);

const RESTRICTED_HINTS = Object.freeze([
  /\b(?:card number|cvv|cvc|bank account|national id|passport number)\b/i,
  /\b(?:exact gps|precise location|latitude|longitude)\b/i,
]);


const IDENTIFIER_KEY = /(?:^|_)(?:name|full_name|email|phone|mobile|address|street|passport|national_id|customer_id|employee_id|patient_id|card_number|bank_account|latitude|longitude|gps)(?:$|_)/i;
const EXACT_TIMESTAMP_KEY = /(?:^|_)(?:timestamp|occurred_at|created_at|updated_at|event_time|datetime)(?:$|_)/i;

export function assertSanitizedAggregateSafe(value, { path = '$' } = {}) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) assertSanitizedAggregateSafe(value[i], { path: `${path}[${i}]` });
    return true;
  }
  if (!value || typeof value !== 'object') return true;
  for (const [key, child] of Object.entries(value)) {
    if (IDENTIFIER_KEY.test(key)) throw new Error(`INTERNAL_SANITIZED contains row-level identifier field at ${path}.${key}`);
    if (EXACT_TIMESTAMP_KEY.test(key) && typeof child === 'string' && /T\d{2}:\d{2}/.test(child)) {
      throw new Error(`INTERNAL_SANITIZED contains exact timestamp at ${path}.${key}`);
    }
    if (typeof child === 'string' && /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/.test(child)) {
      throw new Error(`INTERNAL_SANITIZED contains precise coordinate pair at ${path}.${key}`);
    }
    assertSanitizedAggregateSafe(child, { path: `${path}.${key}` });
  }
  return true;
}

export function generalizeAggregateRows(rows, { minCohortSize = 5, dimensionKeys = [], countKey = 'count', timestampKeys = [], quasiIdentifierKeys = [] } = {}) {
  const protectedRows = protectAggregateRows(rows, { minCohortSize, dimensionKeys, countKey });
  return protectedRows.map((row) => {
    const out = { ...row };
    for (const key of timestampKeys) {
      if (typeof out[key] === 'string') {
        const parsed = new Date(out[key]);
        if (Number.isFinite(parsed.getTime())) out[key] = parsed.toISOString().slice(0, 7);
      }
    }
    for (const key of quasiIdentifierKeys) if (key in out) out[key] = '[GENERALIZED]';
    return out;
  });
}

export function providerGovernance(root) {
  return readJson('operations/auxiliary/provider-governance.json', {
    schema_version: 1,
    provider: 'xkiro',
    state: 'PUBLIC_ONLY',
    non_public_authorized: false,
    reviewed_at: null,
    valid_until: null,
  }, root);
}
export function governanceAllowsNonPublic(root, nowMs = Date.now()) {
  const gate = providerGovernance(root);
  if (gate?.state !== 'APPROVED' || gate?.non_public_authorized !== true) return false;
  const until = Date.parse(gate?.valid_until ?? '');
  if (!Number.isFinite(until) || until < nowMs) return false;
  return true;
}

export function secretFindings(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const findings = [];
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) findings.push(pattern.source.slice(0, 80));
  }
  return findings;
}

export function assertDataClassAllowed(dataClass, root) {
  if (!DATA_CLASSES.includes(dataClass)) throw new Error(`unsupported HAIF data class: ${dataClass}`);
  if (dataClass === 'SECRET_HIGH_SENSITIVITY') throw new Error('SECRET_HIGH_SENSITIVITY is never eligible for HAIF external routing');
  if (dataClass === 'RESTRICTED') throw new Error('raw RESTRICTED data is not eligible for HAIF external routing');
  if (dataClass === 'INTERNAL_SANITIZED' && !governanceAllowsNonPublic(root)) {
    throw new Error('provider governance is not approved for INTERNAL_SANITIZED routing');
  }
  return dataClass;
}

export function assertDeterministicInputSafe({ dataClass, evidence, root }) {
  assertDataClassAllowed(dataClass, root);
  const secrets = secretFindings(evidence);
  if (secrets.length) throw new Error('HAIF input failed deterministic secret detection');
  const text = typeof evidence === 'string' ? evidence : JSON.stringify(evidence);
  if (dataClass === 'PUBLIC' && RESTRICTED_HINTS.some((pattern) => pattern.test(text))) {
    throw new Error('PUBLIC HAIF input contains restricted-data indicators');
  }
  if (dataClass === 'INTERNAL_SANITIZED') assertSanitizedAggregateSafe(evidence);
  return true;
}
export function protectAggregateRows(rows, { minCohortSize = 5, dimensionKeys = [], countKey = 'count' } = {}) {
  if (!Array.isArray(rows)) throw new Error('aggregate rows must be an array');
  return rows.map((row) => {
    const count = Number(row?.[countKey]);
    if (!Number.isFinite(count)) throw new Error(`aggregate row is missing numeric ${countKey}`);
    if (count >= minCohortSize) return { ...row };
    const protectedRow = { ...row, [countKey]: `<${minCohortSize}`, suppressed: true };
    for (const key of dimensionKeys) if (key in protectedRow) protectedRow[key] = '[SUPPRESSED]';
    return protectedRow;
  });
}

export function egressFingerprint(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

export function assertAssembledRequestSafe({ task, requestBody, root, maxBytes = 1_000_000 }) {
  assertDataClassAllowed(task.data_class, root);
  const raw = JSON.stringify(requestBody);
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new Error('HAIF assembled request exceeds egress size policy');
  if (secretFindings(raw).length) throw new Error('HAIF assembled request failed final egress DLP');
  if (/\b(?:eval\(|exec\(|sh -c|powershell -command)\b/i.test(raw) && task.task_archetype !== 'CLUSTER_LOGS') {
    throw new Error('HAIF assembled request contains executable-command indicators outside log analysis');
  }
  return { safe: true, sha256: egressFingerprint(raw), bytes: Buffer.byteLength(raw, 'utf8') };
}
