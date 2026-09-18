#!/usr/bin/env node
// Outbound discovery-query sanitizer.
//
// Open-world discovery talks to public search surfaces. DIAL's standing rule is
// that secrets, payment/customer records and identifiable Health data never
// reach a public research source (CLAUDE.md "Never"; Rev 3.1 §5.10). This module
// is the enforcement point: a query is built from abstracted engineering intent
// and refused outright if it carries anything on the denylist.
//
// Fail-closed. A detector that is unsure refuses; there is no "probably fine"
// branch, because the cost of a false negative is disclosure that cannot be undone.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashObject } from './knowledge-graph-core.mjs';
import { loadDiscoveryPolicy } from './discovery-lifecycle.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO = path.resolve(here, '../..');

// Each detector names the denylist class it defends, so a refusal says which
// rule fired rather than "blocked".
const DETECTORS = Object.freeze([
  { class: 'SECRET', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { class: 'SECRET', pattern: /\b(?:secret|passphrase)\s*[:=]\s*\S{6,}/i },
  { class: 'API_KEY', pattern: /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/ },
  { class: 'API_KEY', pattern: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { class: 'API_KEY', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/ },
  { class: 'API_KEY', pattern: /\b(?:api[_-]?key|access[_-]?token|bearer)\s*[:=]?\s*[A-Za-z0-9._-]{16,}/i },
  { class: 'SERVICE_ROLE_KEY', pattern: /service[_-]?role/i },
  { class: 'PAYMENT_DETAIL', pattern: /\b(?:\d[ -]?){13,19}\b/ },
  { class: 'PAYMENT_DETAIL', pattern: /\b(?:cvv|cvc|card[_-]?number|iban|paynow[_-]?integration)\b/i },
  { class: 'CUSTOMER_IDENTIFIER', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  { class: 'CUSTOMER_IDENTIFIER', pattern: /\b(?:cus|ord|acct)_[A-Za-z0-9]{8,}\b/ },
  { class: 'CUSTOMER_IDENTIFIER', pattern: /\+\d{9,15}\b/ },
  { class: 'PRIVATE_ORDER_DATA', pattern: /\border\s*#?\s*\d{4,}/i },
  { class: 'IDENTIFIABLE_HEALTH_INFORMATION', pattern: /\b(?:patient|diagnosis|prescription|medical\s+record|claim\s+number)\b/i },
  { class: 'OWNER_PRIVATE_CREDENTIAL', pattern: /\bowner[_-]?(?:token|password|credential)\b/i },
  { class: 'PRODUCTION_DATABASE_CONTENT', pattern: /\b(?:postgres|postgresql|mysql|mongodb)(?:\+\w+)?:\/\/\S+/i },
  { class: 'PRODUCTION_DATABASE_CONTENT', pattern: /\bINSERT\s+INTO\b|\bSELECT\s+\*\s+FROM\s+(?:payments|orders|customers|health)/i },
]);

export function inspectDiscoveryPayload(text, { policy = null, repoDir = DEFAULT_REPO } = {}) {
  const p = policy || loadDiscoveryPolicy(repoDir);
  const denylist = new Set(p.sensitive_outbound_denylist || []);
  const body = String(text ?? '');
  const findings = [];
  for (const detector of DETECTORS) {
    if (!denylist.has(detector.class)) continue;
    if (detector.pattern.test(body)) {
      findings.push({ class: detector.class, rule: detector.pattern.source });
    }
  }
  const unique = [...new Map(findings.map((f) => [`${f.class}|${f.rule}`, f])).values()]
    .sort((a, b) => a.class.localeCompare(b.class) || a.rule.localeCompare(b.rule));
  return { ok: unique.length === 0, findings: unique };
}

export function buildDiscoveryQuery({
  intent,
  technologies = [],
  taskClasses = [],
  resourceClasses = [],
  policy = null,
  repoDir = DEFAULT_REPO,
} = {}) {
  const p = policy || loadDiscoveryPolicy(repoDir);
  const parts = [
    String(intent || '').trim(),
    ...technologies.map(String),
    ...taskClasses.map(String),
    ...resourceClasses.map(String),
  ].filter(Boolean);
  const query = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!query) return { ok: false, reason: 'EMPTY_DISCOVERY_INTENT', query: null, query_hash: null, findings: [] };
  const inspection = inspectDiscoveryPayload(query, { policy: p });
  if (!inspection.ok) {
    return {
      ok: false,
      reason: 'SENSITIVE_CONTEXT_IN_DISCOVERY_PAYLOAD',
      query: null,
      query_hash: null,
      findings: inspection.findings,
    };
  }
  return {
    ok: true,
    reason: null,
    query,
    query_hash: hashObject({ query }),
    findings: [],
    sanitization_policy_version: p.policy_version,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = buildDiscoveryQuery({ intent: process.argv.slice(2).join(' ') });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
