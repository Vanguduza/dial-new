// Workstream C — self-hosted n8n automation fabric.
//
// §13 lists eight n8n failure cases that must be induced rather than assumed:
// duplicate delivery, a production workflow receiving a dev credential, an
// unapproved node, an arbitrary host, direct money-state mutation, a version
// change without promotion, a transient dependency failure, and an irreversible
// effect retried without an idempotency key. Each has a test below.
import { describe, expect, it } from 'vitest';
import {
  assertProductionNotLooserThanDev, classifyNodeType, compileRuntimeNodePolicy,
  evaluateWorkflowNodes, loadCorpusKnowledge, loadRuntimePolicy,
} from '../agent-system/orchestration/n8n-runtime-node-policy.mjs';
import {
  applyEffect, buildDeadLetter, buildDomainEvent, buildRuntimeStatusReport, classifyFailure,
  createEffectLedger, effectKey, retryDecision, signDomainEvent, verifyDomainEvent,
} from '../agent-system/orchestration/n8n-runtime-events.mjs';
import {
  assertEstateIsolation, assertReleaseIntegrity, buildWorkflowRelease, evaluateDatabaseWrites,
  evaluateEgressPolicy, promoteWorkflow, scanWorkflowForSecrets, workflowContentHash,
} from '../agent-system/orchestration/n8n-runtime-release.mjs';
import { qualifyN8nRuntime } from '../agent-system/orchestration/n8n-runtime-qualification.mjs';

const repoDir = process.cwd();
const policy = loadRuntimePolicy(repoDir);
const corpus = loadCorpusKnowledge(repoDir);
const SECRET = 'test-signing-secret';

const notifyWorkflow = (extraNodes = []) => ({
  name: 'spare-supplier-availability-notification',
  nodes: [
    { name: 'Event', type: 'n8n-nodes-base.webhook', parameters: { path: 'spare/availability' } },
    { name: 'Route', type: 'n8n-nodes-base.if', parameters: {} },
    { name: 'Notify', type: 'n8n-nodes-base.emailSend', parameters: { subject: 'Part available' } },
    ...extraNodes,
  ],
  connections: {},
  settings: {},
});

const orderPaid = (overrides = {}) => buildDomainEvent({
  eventType: 'OrderPaid', producer: 'dial-payments', aggregateType: 'order', aggregateId: 'ord_7781',
  correlationId: 'cor_7781', causationId: 'cmd_7781', payload: { amount_minor: 4500, currency: 'USD' },
  secret: SECRET, ...overrides,
});

describe('the corpus plane and the runtime plane are distinct', () => {
  it('names both and lets only one execute', () => {
    expect(policy.naming.VEKL_N8N_CORPUS.executes_workflows).toBe(false);
    expect(policy.naming.DIAL_N8N_DEV.executes_workflows).toBe(true);
    expect(policy.naming.DIAL_N8N_PROD.executes_workflows).toBe(true);
    expect(policy.naming.VEKL_N8N_CORPUS.check).toBe('agent:vekl:n8n-corpus-check');
    expect(policy.naming.VEKL_N8N_CORPUS.legacy_check_alias).toBe('agent:vekl:n8n-check');
  });

  it('forbids the runtime writing the corpus or loosening it', () => {
    expect(policy.corpus_projection.runtime_may_write_corpus).toBe(false);
    expect(policy.corpus_projection.runtime_may_be_looser_than_corpus).toBe(false);
    expect(policy.corpus_projection.second_allowlist_forbidden).toBe(true);
  });
});

describe('runtime node policy is a projection of the corpus', () => {
  const dev = compileRuntimeNodePolicy({ repoDir, estate: 'DEV', policy, corpus });
  const prod = compileRuntimeNodePolicy({ repoDir, estate: 'PROD', policy, corpus });

  it('projects exactly the corpus capability set, no more', () => {
    const corpusCapabilities = new Set((corpus.capabilities.rules || []).flatMap((r) => r.capabilities || []));
    expect(new Set(dev.capabilities.map((c) => c.capability))).toEqual(corpusCapabilities);
    expect(new Set(prod.capabilities.map((c) => c.capability))).toEqual(corpusCapabilities);
  });

  it('carries the corpus risk classes through', () => {
    expect(classifyNodeType({ nodeType: 'n8n-nodes-base.executeCommand', capabilities: corpus.capabilities }).risk_class).toBe('CRITICAL');
    expect(classifyNodeType({ nodeType: 'n8n-nodes-base.code', capabilities: corpus.capabilities }).risk_class).toBe('HIGH');
    expect(classifyNodeType({ nodeType: 'n8n-nodes-base.if', capabilities: corpus.capabilities }).risk_class).toBe('LOW');
  });

  it('refuses to compile an estate that names a capability the corpus does not know', () => {
    const forged = JSON.parse(JSON.stringify(policy));
    forged.estates.DEV.denied_capabilities.push('TIME_TRAVEL');
    expect(() => compileRuntimeNodePolicy({ repoDir, estate: 'DEV', policy: forged, corpus }))
      .toThrow(/absent from the VEKL corpus/);
  });

  it('keeps production no looser than development', () => {
    expect(assertProductionNotLooserThanDev({ devPolicy: dev, prodPolicy: prod }).ok).toBe(true);
  });

  it('detects a production estate quietly loosened', () => {
    const loosened = { ...prod, capabilities: prod.capabilities.map((c) => (c.capability === 'CODE_EXECUTION' ? { ...c, allowed: true } : c)) };
    const loosenedDev = { ...dev, capabilities: dev.capabilities.map((c) => (c.capability === 'CODE_EXECUTION' ? { ...c, allowed: false } : c)) };
    expect(assertProductionNotLooserThanDev({ devPolicy: loosenedDev, prodPolicy: loosened }).failures)
      .toContain('PROD_LOOSER_THAN_DEV:CODE_EXECUTION');
  });

  it.each([
    ['arbitrary shell', 'n8n-nodes-base.executeCommand', 'PROD'],
    ['arbitrary shell', 'n8n-nodes-base.executeCommand', 'DEV'],
    ['unrestricted code execution', 'n8n-nodes-base.code', 'PROD'],
    ['filesystem traversal', 'n8n-nodes-base.readWriteFile', 'PROD'],
    ['ssh', 'n8n-nodes-base.ssh', 'PROD'],
    ['an MCP client', 'n8n-nodes-base.mcpClient', 'PROD'],
  ])('denies %s in %s', (_label, type, estate) => {
    const result = evaluateWorkflowNodes({ repoDir, estate, policy, nodes: [{ name: 'X', type }] });
    expect(result.ok).toBe(false);
    expect(result.blocking_findings.some((f) => f.reason.startsWith(`CAPABILITY_DENIED_IN_${estate}`))).toBe(true);
  });

  it('refuses an unapproved or unknown node rather than defaulting to safe', () => {
    const result = evaluateWorkflowNodes({ repoDir, estate: 'DEV', policy, nodes: [{ name: 'Mystery', type: 'n8n-nodes-community.something' }] });
    expect(result.ok).toBe(false);
    expect(result.blocking_findings.map((f) => f.reason)).toEqual(expect.arrayContaining(['UNOFFICIAL_NODE_PACKAGE', 'NODE_UNKNOWN_TO_CORPUS']));
  });

  it('requires approval for high-risk capabilities that remain allowed in production', () => {
    for (const row of prod.capabilities) {
      if (row.high_risk && row.allowed) expect(row.approval_required, row.capability).toBe(true);
    }
  });

  it('admits an ordinary notification workflow in both estates', () => {
    for (const estate of ['DEV', 'PROD']) {
      expect(evaluateWorkflowNodes({ repoDir, estate, policy, nodes: notifyWorkflow().nodes }).ok, estate).toBe(true);
    }
  });
});

describe('event contract', () => {
  it('accepts a correctly signed in-window event', () => {
    const event = orderPaid();
    const result = verifyDomainEvent({ event, secret: SECRET, policy });
    expect(result.ok, JSON.stringify(result.failures)).toBe(true);
  });

  it('rejects a forged signature', () => {
    const event = orderPaid();
    expect(verifyDomainEvent({ event: { ...event, signature: 'a'.repeat(64) }, secret: SECRET, policy }).failures).toContain('SIGNATURE_INVALID');
    expect(verifyDomainEvent({ event, secret: 'other', policy }).failures).toContain('SIGNATURE_INVALID');
  });

  it('rejects a tampered payload even with the original signature', () => {
    const event = orderPaid();
    const tampered = { ...event, payload: { ...event.payload, amount_minor: 1 } };
    expect(verifyDomainEvent({ event: tampered, secret: SECRET, policy }).failures).toContain('SIGNATURE_INVALID');
  });

  it('rejects an unsigned event', () => {
    const event = buildDomainEvent({ eventType: 'X', producer: 'p', aggregateType: 'a', aggregateId: '1', correlationId: 'c' });
    const result = verifyDomainEvent({ event, secret: SECRET, policy });
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('MISSING_FIELD:signature');
  });

  it('rejects a replayed event id', () => {
    const event = orderPaid();
    const result = verifyDomainEvent({ event, secret: SECRET, policy, seenEventIds: new Set([event.event_id]) });
    expect(result.ok).toBe(false);
    expect(result.duplicate).toBe(true);
  });

  it('rejects events outside the replay window in either direction', () => {
    const event = orderPaid();
    const base = Date.parse(event.occurred_at);
    expect(verifyDomainEvent({ event, secret: SECRET, policy, nowMs: base + 3_600_000 }).failures).toContain('EVENT_OUTSIDE_REPLAY_WINDOW');
    expect(verifyDomainEvent({ event, secret: SECRET, policy, nowMs: base - 600_000 }).failures).toContain('EVENT_FROM_THE_FUTURE');
  });

  it('refuses identifiable Health context as ordinary workflow context', () => {
    const event = orderPaid({ dataClass: 'HEALTH_SENSITIVE' });
    expect(verifyDomainEvent({ event, secret: SECRET, policy }).failures).toContain('DATA_CLASS_DENIED_IN_WORKFLOWS:HEALTH_SENSITIVE');
  });

  it('signs canonically, so key order does not change the digest', () => {
    const event = orderPaid();
    const reordered = Object.fromEntries(Object.entries(event).reverse());
    expect(signDomainEvent(reordered, SECRET)).toBe(signDomainEvent(event, SECRET));
  });
});

describe('idempotency', () => {
  it('produces one side effect when the same event is delivered twice', () => {
    const ledger = createEffectLedger();
    const event = orderPaid();
    let notifications = 0;
    const deliver = () => applyEffect({
      ledger, eventId: event.event_id, workflowId: 'wf-notify', workflowVersion: '1.0.0',
      effectName: 'CUSTOMER_NOTIFICATION', apply: () => { notifications += 1; return 'sent'; },
    });
    const first = deliver();
    const second = deliver();
    const third = deliver();
    expect(notifications).toBe(1);
    expect(first.applied).toBe(true);
    expect([second, third].every((r) => r.suppressed && r.reason === 'DUPLICATE_EFFECT_SUPPRESSED')).toBe(true);
    expect(second.first_applied_at).toBe(first.first_applied_at);
  });

  it.each([
    ['a customer notification', 'CUSTOMER_NOTIFICATION'],
    ['a supplier job', 'CREATE_SUPPLIER_JOB'],
    ['a document request', 'ISSUE_DOCUMENT_REQUEST'],
    ['an escalation', 'OPEN_ESCALATION'],
    ['a CRM activity', 'POST_CRM_ACTIVITY'],
  ])('applies %s exactly once', (_label, effectName) => {
    const ledger = createEffectLedger();
    const event = orderPaid();
    let count = 0;
    for (let i = 0; i < 4; i += 1) {
      applyEffect({ ledger, eventId: event.event_id, workflowId: 'wf', workflowVersion: '1.0.0', effectName, apply: () => { count += 1; } });
    }
    expect(count).toBe(1);
  });

  it('keys on event, workflow, version and effect together', () => {
    const args = { eventId: 'evt_1', workflowId: 'wf', workflowVersion: '1.0.0', effectName: 'NOTIFY' };
    expect(effectKey(args)).toBe(effectKey({ ...args }));
    expect(effectKey(args)).not.toBe(effectKey({ ...args, eventId: 'evt_2' }));
    expect(effectKey(args)).not.toBe(effectKey({ ...args, workflowVersion: '1.0.1' }));
    expect(effectKey(args)).not.toBe(effectKey({ ...args, effectName: 'ESCALATE' }));
  });

  it('repeats only what explicitly declares itself repeatable', () => {
    const ledger = createEffectLedger();
    let count = 0;
    for (let i = 0; i < 3; i += 1) {
      applyEffect({ ledger, eventId: 'evt_1', workflowId: 'wf', workflowVersion: '1.0.0', effectName: 'REFRESH_CACHE', repeatable: true, apply: () => { count += 1; } });
    }
    expect(count).toBe(3);
  });
});

describe('retry classes and dead letters', () => {
  it.each([
    [{ status: 429 }, 'RATE_LIMIT'],
    [{ status: 401 }, 'AUTH_EXPIRED'],
    [{ status: 503 }, 'DEPENDENCY_UNAVAILABLE'],
    [{ code: 'ECONNREFUSED' }, 'DEPENDENCY_UNAVAILABLE'],
    [{ code: 'ETIMEDOUT' }, 'TRANSIENT'],
    [{ status: 422 }, 'VALIDATION_FAILURE'],
    [{ policy_denied: true }, 'POLICY_DENIED'],
    [{ status: 409 }, 'PERMANENT_BUSINESS_FAILURE'],
    [{}, 'UNKNOWN'],
  ])('classifies %j as %s', (error, expected) => {
    expect(classifyFailure(error)).toBe(expected);
  });

  it('retries a transient dependency failure until attempts are exhausted', () => {
    const attempts = [1, 2, 3, 4, 5, 6].map((attempt) => retryDecision({ policy, failureClass: 'TRANSIENT', attempt }));
    expect(attempts.slice(0, 4).every((a) => a.retry)).toBe(true);
    expect(attempts.at(-1).retry).toBe(false);
    expect(attempts.at(-1).dead_letter).toBe(true);
  });

  it.each([
    ['a validation failure', { failureClass: 'VALIDATION_FAILURE' }, 'MALFORMED_BUSINESS_COMMAND'],
    ['a policy-denied action', { failureClass: 'POLICY_DENIED' }, 'POLICY_DENIED_ACTION'],
    ['an invalid payment operation', { failureClass: 'DEPENDENCY_UNAVAILABLE', operation: 'PAYMENT' }, 'INVALID_PAYMENT_OPERATION'],
    ['an irreversible effect with no idempotency key', { failureClass: 'TRANSIENT', effectIrreversible: true }, 'IRREVERSIBLE_EFFECT_WITHOUT_IDEMPOTENCY'],
  ])('never retries %s', (_label, args, expectedRefusal) => {
    const decision = retryDecision({ policy, attempt: 1, ...args });
    expect(decision.retry).toBe(false);
    expect(decision.refusals).toContain(expectedRefusal);
  });

  it('does retry an irreversible effect once an idempotency key exists', () => {
    expect(retryDecision({ policy, failureClass: 'TRANSIENT', effectIrreversible: true, idempotencyKeyPresent: true, attempt: 1 }).retry).toBe(true);
  });

  it('builds a dead letter carrying full lineage', () => {
    const event = orderPaid();
    const dl = buildDeadLetter({
      policy, executionId: 'exec_9', workflowId: 'wf-notify', workflowVersion: '1.0.0', event,
      failureClass: 'DEPENDENCY_UNAVAILABLE', retryCount: 5, lastError: 'supplier api down',
      businessStateMutated: true, environment: 'PROD',
    });
    expect(dl.ok).toBe(true);
    expect(dl.missing_fields).toEqual([]);
    expect(dl.record.triggering_event_id).toBe(event.event_id);
    expect(dl.record.correlation_id).toBe(event.correlation_id);
    expect(dl.record.affected_aggregate).toBe('order:ord_7781');
    expect(dl.record.business_state_mutated).toBe(true);
    expect(dl.record.recommended_operator_action).toBe('RECONCILE_AGGREGATE_THEN_REPLAY');
    expect(dl.record.alert_required).toBe(true);
  });

  it('does not alert on a development dead letter', () => {
    expect(buildDeadLetter({ policy, executionId: 'e', workflowId: 'w', workflowVersion: '1.0.0', event: orderPaid(), failureClass: 'UNKNOWN', environment: 'DEV' }).record.alert_required).toBe(false);
  });
});

describe('workflow releases and promotion', () => {
  const workflow = notifyWorkflow();

  it('gives every release an immutable content identity', () => {
    const release = buildWorkflowRelease({ repoDir, policy, workflow, workflowId: 'wf-notify', semanticVersion: '1.0.0', environment: 'DEV' });
    expect(release.ok, JSON.stringify(release.failures)).toBe(true);
    expect(release.release.content_hash).toBe(workflowContentHash(workflow));
  });

  it('excludes mutable bookkeeping from workflow identity', () => {
    expect(workflowContentHash({ ...workflow, updatedAt: '2026-01-01' })).toBe(workflowContentHash(workflow));
    expect(workflowContentHash({ ...workflow, name: 'renamed' })).not.toBe(workflowContentHash(workflow));
  });

  it('refuses a release with an embedded secret', () => {
    const leaky = notifyWorkflow([{ name: 'Call', type: 'n8n-nodes-base.httpRequest', parameters: { authorization: 'Bearer ghp_abcdefghijklmnopqrstuvwxyz012345' } }]);
    const release = buildWorkflowRelease({ repoDir, policy, workflow: leaky, workflowId: 'wf', semanticVersion: '1.0.0', environment: 'DEV' });
    expect(release.ok).toBe(false);
    expect(release.failures.some((f) => f.startsWith('EMBEDDED_SECRET'))).toBe(true);
  });

  it('allows a credential referenced by expression rather than inlined', () => {
    const referenced = notifyWorkflow([{ name: 'Call', type: 'n8n-nodes-base.httpRequest', parameters: { authorization: '={{$credentials.supplierApi}}' } }]);
    expect(scanWorkflowForSecrets({ workflow: referenced, repoDir }).ok).toBe(true);
  });

  it('refuses a production release with no approval, evidence, source or rollback', () => {
    const release = buildWorkflowRelease({ repoDir, policy, workflow, workflowId: 'wf', semanticVersion: '1.0.1', environment: 'PROD', allowlist: ['api.dial.local'] });
    expect(release.ok).toBe(false);
    expect(release.failures).toEqual(expect.arrayContaining([
      'PROD_RELEASE_REQUIRES_HUMAN_APPROVAL', 'PROD_RELEASE_REQUIRES_TEST_EVIDENCE', 'PROD_RELEASE_REQUIRES_PROMOTION_SOURCE',
    ]));
  });

  const prodRelease = buildWorkflowRelease({
    repoDir, policy, workflow, workflowId: 'wf-notify', semanticVersion: '1.0.1', environment: 'PROD',
    promotedFrom: '1.0.0', testEvidenceHash: 'a'.repeat(64), approvedBy: 'product owner',
    approvalAuthority: 'OWNER', allowlist: ['api.dial.local'], rollbackVersion: '1.0.0',
  });

  it('accepts a fully evidenced, owner-approved production release', () => {
    expect(prodRelease.ok, JSON.stringify(prodRelease.failures)).toBe(true);
    expect(prodRelease.release.rollback_version).toBe('1.0.0');
  });

  it('refuses a promotion that skips or reorders pipeline stages', () => {
    expect(promoteWorkflow({ policy, release: prodRelease.release, stagesCompleted: ['DRAFT', 'APPROVAL'] }).failures.some((f) => f.startsWith('STAGE_NOT_COMPLETED'))).toBe(true);
    expect(promoteWorkflow({ policy, release: prodRelease.release, stagesCompleted: ['APPROVAL', 'CANARY'] }).ok).toBe(false);
  });

  it('records promotion once every stage has run', () => {
    const stages = policy.promotion_pipeline.slice(0, policy.promotion_pipeline.indexOf('PRODUCTION_ACTIVE'));
    const promoted = promoteWorkflow({ policy, release: prodRelease.release, stagesCompleted: stages });
    expect(promoted.ok, JSON.stringify(promoted.failures)).toBe(true);
    expect(promoted.evidence.approval_authority).toBe('OWNER');
    expect(promoted.evidence.from_version).toBe('1.0.0');
  });

  it('detects a production workflow edited in place without a new release', () => {
    const edited = notifyWorkflow([{ name: 'Extra', type: 'n8n-nodes-base.noOp' }]);
    expect(assertReleaseIntegrity({ release: prodRelease.release, runningWorkflow: edited }).failures).toContain('WORKFLOW_EDITED_WITHOUT_RELEASE');
    expect(assertReleaseIntegrity({ release: prodRelease.release, runningWorkflow: workflow }).ok).toBe(true);
  });

  it('refuses a release whose environment does not match the promotion target', () => {
    const devRelease = buildWorkflowRelease({ repoDir, policy, workflow, workflowId: 'wf', semanticVersion: '1.0.0', environment: 'DEV' });
    expect(promoteWorkflow({ policy, release: devRelease.release, targetEnvironment: 'PROD', stagesCompleted: policy.promotion_pipeline }).failures)
      .toContain('RELEASE_ENVIRONMENT_MISMATCH:DEV');
  });
});

describe('network and database boundaries', () => {
  it('refuses an arbitrary host under production deny-by-default egress', () => {
    const workflow = notifyWorkflow([{ name: 'Call', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://unknown.example/collect' } }]);
    const result = evaluateEgressPolicy({ workflow, estate: 'PROD', policy, repoDir, allowlist: ['api.dial.local'] });
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.reason === 'HOST_NOT_ON_ALLOWLIST' && f.detail === 'unknown.example')).toBe(true);
  });

  it('accepts an allowlisted host', () => {
    const workflow = notifyWorkflow([{ name: 'Call', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://api.dial.local/suppliers' } }]);
    expect(evaluateEgressPolicy({ workflow, estate: 'PROD', policy, repoDir, allowlist: ['api.dial.local'] }).ok).toBe(true);
  });

  it('refuses a runtime-injected URL in a privileged workflow', () => {
    const workflow = notifyWorkflow([{ name: 'Call', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://{{$json.callback_host}}/notify' } }]);
    expect(evaluateEgressPolicy({ workflow, estate: 'PROD', policy, repoDir }).findings.some((f) => f.reason === 'RUNTIME_URL_INJECTION')).toBe(true);
  });

  it.each([
    ['ledger_entries', 'UPDATE ledger_entries SET amount_minor = 0'],
    ['payments', 'INSERT INTO payments (id) VALUES (1)'],
    ['orders', 'DELETE FROM orders WHERE id = 1'],
  ])('refuses direct mutation of the authoritative %s table', (table, query) => {
    const workflow = notifyWorkflow([{ name: 'Write', type: 'n8n-nodes-base.postgres', parameters: { query } }]);
    const result = evaluateDatabaseWrites({ workflow, policy, repoDir, authoritativeTables: ['ledger_entries', 'payments', 'orders', 'grocery_credits'] });
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.reason === 'DIRECT_AUTHORITATIVE_TABLE_MUTATION' && f.detail === table)).toBe(true);
  });

  it('permits a read-only query against the same table', () => {
    const workflow = notifyWorkflow([{ name: 'Read', type: 'n8n-nodes-base.postgres', parameters: { query: 'SELECT status FROM orders WHERE id = $1' } }]);
    expect(evaluateDatabaseWrites({ workflow, policy, repoDir, authoritativeTables: ['orders'] }).ok).toBe(true);
  });

  it('declares money, identity, fulfilment and Project Truth outside runtime authority', () => {
    expect(policy.forbidden_runtime_authorities).toEqual(expect.arrayContaining([
      'PRICE', 'MONEY_STATE', 'BENEFICIARY_ALLOCATION', 'ACCOUNT_BALANCE', 'GROCERY_CREDIT_TRUTH',
      'INVENTORY_TRUTH', 'FINAL_ORDER_TRUTH', 'IDENTITY_TRUTH', 'ACCESS_CONTROL_TRUTH', 'PROJECT_TRUTH',
    ]));
  });
});

describe('estate isolation', () => {
  const separated = {
    dev: { database: 'n8n_dev', encryption_key_id: 'k-dev', credential_store: 's-dev', webhook_domain: 'hooks-dev', service_account: 'sa-dev', network_policy: 'np-dev', role_binding: 'rb-dev', backup_target: 'bk-dev', audit_stream: 'a-dev', promotion_path: 'export', execution_retention_days: 14, credential_ids: ['dev-smtp'], has_production_credentials: false },
    prod: { database: 'n8n_prod', encryption_key_id: 'k-prod', credential_store: 's-prod', webhook_domain: 'hooks', service_account: 'sa-prod', network_policy: 'np-prod', role_binding: 'rb-prod', backup_target: 'bk-prod', audit_stream: 'a-prod', promotion_path: 'import', execution_retention_days: 90, credential_ids: ['prod-smtp'] },
  };

  it('accepts properly separated estates', () => {
    const result = assertEstateIsolation({ policy, repoDir, ...separated });
    expect(result.ok, JSON.stringify(result.failures)).toBe(true);
  });

  it.each(['database', 'encryption_key_id', 'credential_store', 'webhook_domain', 'service_account', 'network_policy', 'role_binding', 'backup_target', 'audit_stream', 'promotion_path'])(
    'refuses estates sharing %s', (field) => {
      const result = assertEstateIsolation({ policy, repoDir, dev: { ...separated.dev, [field]: separated.prod[field] }, prod: separated.prod });
      expect(result.ok).toBe(false);
      expect(result.failures.some((f) => f.startsWith('ISOLATION_VIOLATION'))).toBe(true);
    },
  );

  it('refuses a production workflow estate sharing a credential with dev', () => {
    const result = assertEstateIsolation({ policy, repoDir, dev: { ...separated.dev, credential_ids: ['prod-smtp'] }, prod: separated.prod });
    expect(result.failures).toContain('SHARED_CREDENTIAL:prod-smtp');
  });

  it('refuses a dev estate holding production credentials at all', () => {
    const result = assertEstateIsolation({ policy, repoDir, dev: { ...separated.dev, has_production_credentials: true }, prod: separated.prod });
    expect(result.failures).toContain('DEV_HOLDS_PRODUCTION_CREDENTIALS');
  });

  it('names an undeclared isolation requirement rather than passing it', () => {
    const { encryption_key_id: _omitted, ...incomplete } = separated.dev;
    expect(assertEstateIsolation({ policy, repoDir, dev: incomplete, prod: separated.prod }).failures)
      .toContain('ISOLATION_UNDECLARED:separate_encryption_key');
  });
});

describe('status reporting to Hermes', () => {
  it('refuses unsupported "success" prose with no evidence', () => {
    expect(buildRuntimeStatusReport({ workflowId: 'w', workflowVersion: '1.0.0', executionId: 'e', outcome: 'SUCCEEDED' }).failures)
      .toContain('STATUS_REQUIRES_EVIDENCE_REFS');
  });

  it('accepts an evidence-backed report', () => {
    const report = buildRuntimeStatusReport({ workflowId: 'w', workflowVersion: '1.0.0', executionId: 'e', outcome: 'DEAD_LETTERED', evidenceRefs: ['exec://e', 'dl://e'] });
    expect(report.ok).toBe(true);
    expect(report.report.authority).toBe('WORKFLOW_EXECUTION_EVIDENCE_ONLY');
  });
});

describe('runtime qualification', () => {
  it('qualifies both estates and never claims a running estate', () => {
    for (const estate of ['DEV', 'PROD']) {
      const result = qualifyN8nRuntime({ estate });
      const failed = result.results.filter((r) => !r.ok);
      expect(failed.map((f) => `${f.id}: ${f.detail}`)).toEqual([]);
      expect(result.ok).toBe(true);
      const live = result.results.find((r) => r.id === 'N8N-RT-LIVE');
      expect(live.detail).toContain('UNVERIFIED_FROM_REPOSITORY');
    }
  });

  it('defers money-sensitive workflows and starts with low-risk pilots', () => {
    expect(policy.money_sensitive_workflows_deferred).toBe(true);
    expect(policy.production_pilots.map((p) => p.product).sort()).toEqual(['DIAL_A_SPARE', 'DIAL_A_TECH', 'DIAL_CARE', 'DIAL_GROCERIES', 'DIAL_LOGISTICS']);
    expect(policy.production_pilots.every((p) => p.authority_risk === 'LOW')).toBe(true);
  });

  it('keeps both estates behind feature flags until an owner enables them', () => {
    expect(policy.feature_flags.dev_estate_enabled).toBe(false);
    expect(policy.feature_flags.prod_estate_enabled).toBe(false);
  });

  it('keeps domain services authoritative on rollback', () => {
    expect(policy.rollback.n8n_sole_source_of_business_truth_forbidden).toBe(true);
    expect(policy.rollback.domain_services_must_continue).toBe(true);
  });
});
