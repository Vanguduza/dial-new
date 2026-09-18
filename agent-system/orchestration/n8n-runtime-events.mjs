#!/usr/bin/env node
// Domain event contract, idempotency, retry classification and dead letters
// (Rev 3.1 §7.8–§7.11).
//
// The runtime coordinates; it never becomes the authority for what it
// coordinates. Two mechanisms carry most of that weight here:
//
//   - `verifyDomainEvent` rejects an unsigned, replayed or misclassified event
//     before a workflow ever sees it, so a forged webhook cannot start a
//     business process.
//   - `applyEffect` makes every externally visible side effect idempotent by
//     key, so a duplicate delivery produces one notification, one supplier job,
//     one escalation — not two.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashObject } from './knowledge-graph-core.mjs';
import { loadRuntimePolicy } from './n8n-runtime-node-policy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO = path.resolve(here, '../..');

// The signature covers the envelope minus the signature itself; a canonical
// serialization means key order cannot change the digest.
export function signableBody(event) {
  const { signature: _omit, ...rest } = event;
  return JSON.stringify(hashObject(rest));
}

export function signDomainEvent(event, secret) {
  return crypto.createHmac('sha256', String(secret)).update(signableBody(event)).digest('hex');
}

export function buildDomainEvent({
  eventType, eventVersion = 1, producer, aggregateType, aggregateId,
  correlationId, causationId = null, tenantId = null, dataClass = 'BUSINESS',
  payload = {}, occurredAt = new Date().toISOString(), secret = null, eventId = null,
} = {}) {
  const base = {
    event_id: eventId || `evt_${crypto.randomUUID().replace(/-/g, '')}`,
    event_type: eventType,
    event_version: eventVersion,
    occurred_at: occurredAt,
    producer,
    aggregate_type: aggregateType,
    aggregate_id: aggregateId,
    correlation_id: correlationId || `cor_${crypto.randomUUID().replace(/-/g, '')}`,
    causation_id: causationId,
    tenant_id: tenantId,
    data_class: dataClass,
    payload,
  };
  return { ...base, signature: secret ? signDomainEvent(base, secret) : null };
}

export function verifyDomainEvent({
  event, secret, policy = null, repoDir = DEFAULT_REPO, nowMs = Date.now(), seenEventIds = new Set(),
} = {}) {
  const p = policy || loadRuntimePolicy(repoDir);
  const contract = p.event_contract || {};
  const failures = [];

  for (const field of contract.required_fields || []) {
    const value = event?.[field];
    if (value === undefined || value === null || value === '') failures.push(`MISSING_FIELD:${field}`);
  }
  if (event?.event_version !== contract.envelope_version) failures.push(`UNSUPPORTED_ENVELOPE_VERSION:${event?.event_version}`);
  if (!(contract.data_classes || []).includes(event?.data_class)) failures.push(`UNKNOWN_DATA_CLASS:${event?.data_class}`);
  // Sensitive Health context is not ordinary workflow context.
  if ((contract.data_classes_denied_in_workflows || []).includes(event?.data_class)) {
    failures.push(`DATA_CLASS_DENIED_IN_WORKFLOWS:${event?.data_class}`);
  }

  const occurredMs = Date.parse(event?.occurred_at ?? '');
  if (!Number.isFinite(occurredMs)) failures.push('INVALID_OCCURRED_AT');
  else {
    const age = (nowMs - occurredMs) / 1000;
    if (age > Number(contract.replay_window_seconds || 900)) failures.push('EVENT_OUTSIDE_REPLAY_WINDOW');
    if (age < -60) failures.push('EVENT_FROM_THE_FUTURE');
  }

  if (!secret) failures.push('NO_VERIFICATION_SECRET');
  else {
    const expected = signDomainEvent(event, secret);
    const got = String(event?.signature ?? '');
    const valid = got.length === expected.length
      && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
    if (!valid) failures.push('SIGNATURE_INVALID');
  }

  // Replay detection is separate from signature validity: a correctly signed
  // event replayed is still a duplicate.
  const duplicate = seenEventIds.has(event?.event_id);
  return {
    ok: failures.length === 0 && !duplicate,
    duplicate,
    failures: [...new Set(failures)].sort(),
    event_id: event?.event_id ?? null,
    correlation_id: event?.correlation_id ?? null,
  };
}

// workflow_effect_key = hash(event_id + workflow_id + workflow_version + effect_name)
export function effectKey({ eventId, workflowId, workflowVersion, effectName }) {
  return hashObject({ event_id: eventId, workflow_id: workflowId, workflow_version: workflowVersion, effect_name: effectName });
}

export function createEffectLedger(initial = []) {
  const store = new Map(initial.map((r) => [r.effect_key, r]));
  return {
    has: (key) => store.has(key),
    get: (key) => store.get(key) ?? null,
    record: (row) => { store.set(row.effect_key, row); return row; },
    all: () => [...store.values()].sort((a, b) => a.effect_key.localeCompare(b.effect_key)),
    size: () => store.size,
  };
}

// An effect adapter either declares itself repeatable or it does not run twice.
// The default is not-repeatable, because an adapter that forgot to say is far
// more likely to be a notification than a no-op.
export function applyEffect({ ledger, eventId, workflowId, workflowVersion, effectName, repeatable = false, apply }) {
  const key = effectKey({ eventId, workflowId, workflowVersion, effectName });
  const existing = ledger.get(key);
  if (existing && !repeatable) {
    return { applied: false, suppressed: true, reason: 'DUPLICATE_EFFECT_SUPPRESSED', effect_key: key, first_applied_at: existing.applied_at, result: existing.result };
  }
  const result = apply ? apply() : null;
  const row = { effect_key: key, event_id: eventId, workflow_id: workflowId, workflow_version: workflowVersion, effect_name: effectName, applied_at: new Date().toISOString(), result };
  ledger.record(row);
  return { applied: true, suppressed: false, reason: null, effect_key: key, first_applied_at: row.applied_at, result };
}

const CLASSIFIERS = Object.freeze([
  { class: 'RATE_LIMIT', test: (e) => e.status === 429 || /rate.?limit|too many requests/i.test(e.message || '') },
  { class: 'AUTH_EXPIRED', test: (e) => [401, 403].includes(e.status) || /token expired|unauthori[sz]ed/i.test(e.message || '') },
  { class: 'DEPENDENCY_UNAVAILABLE', test: (e) => [502, 503, 504].includes(e.status) || /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|unavailable/i.test(e.message || e.code || '') },
  { class: 'TRANSIENT', test: (e) => [408].includes(e.status) || /ETIMEDOUT|ECONNRESET|socket hang up|timeout/i.test(e.message || e.code || '') },
  { class: 'VALIDATION_FAILURE', test: (e) => [400, 422].includes(e.status) || /validation|schema|malformed/i.test(e.message || '') },
  { class: 'POLICY_DENIED', test: (e) => e.policy_denied === true || /policy denied|not permitted/i.test(e.message || '') },
  { class: 'PERMANENT_BUSINESS_FAILURE', test: (e) => e.business_failure === true || [404, 409, 410].includes(e.status) },
]);

export function classifyFailure(error = {}) {
  for (const classifier of CLASSIFIERS) {
    if (classifier.test(error)) return classifier.class;
  }
  return 'UNKNOWN';
}

export function retryDecision({
  policy = null, repoDir = DEFAULT_REPO, failureClass, attempt = 1,
  effectIrreversible = false, idempotencyKeyPresent = false, operation = null,
} = {}) {
  const p = policy || loadRuntimePolicy(repoDir);
  const rule = p.retry_classes?.[failureClass] || p.retry_classes?.UNKNOWN || { retryable: false, max_attempts: 0 };
  const refusals = [];
  // §7.10: never blindly retry. These four refusals override any retry class,
  // including the retryable ones, because the cost of a wrong retry here is a
  // duplicated irreversible act rather than a wasted call.
  if (operation === 'PAYMENT' && failureClass !== 'TRANSIENT') refusals.push('INVALID_PAYMENT_OPERATION');
  if (failureClass === 'POLICY_DENIED') refusals.push('POLICY_DENIED_ACTION');
  if (failureClass === 'VALIDATION_FAILURE') refusals.push('MALFORMED_BUSINESS_COMMAND');
  if (effectIrreversible && !idempotencyKeyPresent) refusals.push('IRREVERSIBLE_EFFECT_WITHOUT_IDEMPOTENCY');

  const exhausted = attempt >= Number(rule.max_attempts || 0);
  const retry = rule.retryable === true && !exhausted && refusals.length === 0;
  return {
    retry,
    failure_class: failureClass,
    attempt,
    max_attempts: Number(rule.max_attempts || 0),
    backoff: retry ? rule.backoff : 'NONE',
    refusals: refusals.sort(),
    dead_letter: !retry,
  };
}

export function buildDeadLetter({
  policy = null, repoDir = DEFAULT_REPO, executionId, workflowId, workflowVersion, event,
  failureClass, retryCount = 0, lastError = '', affectedAggregate = null,
  businessStateMutated = false, recommendedOperatorAction = null, environment = 'DEV',
} = {}) {
  const p = policy || loadRuntimePolicy(repoDir);
  const record = {
    schema_version: 1,
    execution_id: executionId,
    workflow_id: workflowId,
    workflow_version: workflowVersion,
    triggering_event_id: event?.event_id ?? null,
    failure_class: failureClass,
    retry_count: retryCount,
    last_error: String(lastError).slice(0, 2000),
    correlation_id: event?.correlation_id ?? null,
    affected_aggregate: affectedAggregate ?? (event ? `${event.aggregate_type}:${event.aggregate_id}` : null),
    business_state_mutated: businessStateMutated === true,
    recommended_operator_action: recommendedOperatorAction
      || (businessStateMutated ? 'RECONCILE_AGGREGATE_THEN_REPLAY' : 'INVESTIGATE_THEN_REPLAY'),
    environment,
    alert_required: environment === 'PROD' && p.dead_letter?.prod_alert_required === true,
  };
  const missing = (p.dead_letter?.required_fields || []).filter((f) => record[f] === undefined || record[f] === null);
  return {
    ok: missing.length === 0,
    missing_fields: missing.sort(),
    record: { ...record, dead_letter_hash: hashObject(record) },
  };
}

// Status sent to Hermes must carry evidence references, not "success" prose (§8.6).
export function buildRuntimeStatusReport({ workflowId, workflowVersion, executionId, outcome, evidenceRefs = [] } = {}) {
  const failures = [];
  if (!evidenceRefs.length) failures.push('STATUS_REQUIRES_EVIDENCE_REFS');
  if (!['SUCCEEDED', 'FAILED', 'DEAD_LETTERED', 'SUPPRESSED_DUPLICATE'].includes(outcome)) failures.push(`UNKNOWN_OUTCOME:${outcome}`);
  if (failures.length) return { ok: false, failures: failures.sort(), report: null };
  const base = {
    schema_version: 1,
    workflow_id: workflowId,
    workflow_version: workflowVersion,
    execution_id: executionId,
    outcome,
    evidence_refs: [...evidenceRefs].sort(),
    authority: 'WORKFLOW_EXECUTION_EVIDENCE_ONLY',
  };
  return { ok: true, failures: [], report: { ...base, report_hash: hashObject(base) } };
}
