#!/usr/bin/env node
// Workstream C gate: DIAL_N8N_DEV / DIAL_N8N_PROD runtime qualification.
//
// Two things this deliberately does NOT claim. It does not claim an estate is
// running — a repository check cannot observe a VM — and it does not claim
// production certification. It qualifies the CONTRACT: the node policy projects
// correctly from the corpus, releases carry identity, events are verified,
// effects are idempotent, and the estates are declared isolated. Whether the
// estate is actually standing is reported separately from a deployment
// descriptor, and says UNVERIFIED_FROM_REPOSITORY when there is none.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRuntimePolicy, compileRuntimeNodePolicy, evaluateWorkflowNodes, assertProductionNotLooserThanDev, classifyNodeType, loadCorpusKnowledge } from './n8n-runtime-node-policy.mjs';
import { applyEffect, buildDeadLetter, buildDomainEvent, buildRuntimeStatusReport, classifyFailure, createEffectLedger, retryDecision, verifyDomainEvent } from './n8n-runtime-events.mjs';
import { assertEstateIsolation, assertReleaseIntegrity, buildWorkflowRelease, evaluateEgressPolicy, promoteWorkflow, scanWorkflowForSecrets, workflowContentHash } from './n8n-runtime-release.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const exists = (rel) => fs.existsSync(path.join(repo, rel));

const SECRET = 'qualification-probe-secret';

function notifyWorkflow(extra = {}) {
  return {
    name: 'spare-supplier-availability-notification',
    nodes: [
      { name: 'Event', type: 'n8n-nodes-base.webhook', parameters: { path: 'spare/availability' } },
      { name: 'Route', type: 'n8n-nodes-base.if', parameters: {} },
      { name: 'Notify', type: 'n8n-nodes-base.emailSend', parameters: { subject: 'Part available' } },
    ],
    connections: {},
    settings: {},
    ...extra,
  };
}

export function qualifyN8nRuntime({ estate = 'DEV', deploymentDescriptorRel = null } = {}) {
  const results = [];
  const gate = (id, ok, detail) => results.push({ id, ok: Boolean(ok), detail });

  try {
    const policy = loadRuntimePolicy(repo);
    const corpus = loadCorpusKnowledge(repo);

    // ── naming: corpus plane and runtime plane are never the same thing ──────
    gate('N8N-RT-G01', policy.naming?.VEKL_N8N_CORPUS?.executes_workflows === false
      && policy.naming?.DIAL_N8N_DEV?.executes_workflows === true
      && policy.naming?.DIAL_N8N_PROD?.executes_workflows === true,
      'VEKL corpus and n8n runtime estates are explicitly distinguished');
    gate('N8N-RT-G02', policy.corpus_projection?.runtime_may_write_corpus === false
      && policy.corpus_projection?.second_allowlist_forbidden === true,
      'the runtime consumes corpus knowledge and never becomes its authority');

    // ── node policy is a projection, not a second allowlist ─────────────────
    const dev = compileRuntimeNodePolicy({ repoDir: repo, estate: 'DEV', policy, corpus });
    const prod = compileRuntimeNodePolicy({ repoDir: repo, estate: 'PROD', policy, corpus });
    const corpusCapabilities = new Set((corpus.capabilities.rules || []).flatMap((r) => r.capabilities || []));
    gate('N8N-RT-G03', dev.capabilities.every((c) => corpusCapabilities.has(c.capability))
      && dev.capabilities.length === corpusCapabilities.size,
      `runtime policy projects exactly the ${corpusCapabilities.size} capabilities the corpus knows`);
    const strictness = assertProductionNotLooserThanDev({ devPolicy: dev, prodPolicy: prod });
    gate('N8N-RT-G04', strictness.ok, strictness.ok ? 'production is never looser than development' : strictness.failures.join('; '));
    gate('N8N-RT-G05', prod.capabilities.filter((c) => c.high_risk && c.allowed && !c.approval_required).length === 0,
      'no high-risk capability is allowed unapproved in production');

    // High-risk capabilities are refused where the estate denies them.
    const shellInProd = evaluateWorkflowNodes({ repoDir: repo, estate: 'PROD', policy, nodes: [{ name: 'Shell', type: 'n8n-nodes-base.executeCommand' }] });
    gate('N8N-RT-G06', shellInProd.ok === false && shellInProd.blocking_findings.some((f) => f.reason.includes('CAPABILITY_DENIED_IN_PROD:SHELL_EXECUTION')),
      'arbitrary shell is denied in production');
    const codeInProd = evaluateWorkflowNodes({ repoDir: repo, estate: 'PROD', policy, nodes: [{ name: 'Code', type: 'n8n-nodes-base.code' }] });
    gate('N8N-RT-G07', codeInProd.ok === false, 'arbitrary code execution is denied in production');

    // An unknown or community node is not thereby safe.
    const unknown = evaluateWorkflowNodes({ repoDir: repo, estate: 'DEV', policy, nodes: [{ name: 'X', type: 'n8n-nodes-community.mystery' }] });
    gate('N8N-RT-G08', unknown.ok === false
      && unknown.blocking_findings.some((f) => f.reason === 'UNOFFICIAL_NODE_PACKAGE')
      && unknown.blocking_findings.some((f) => f.reason === 'NODE_UNKNOWN_TO_CORPUS'),
      'an unqualified node is refused in both estates');
    gate('N8N-RT-G09', classifyNodeType({ nodeType: 'n8n-nodes-base.executeCommand', capabilities: corpus.capabilities }).risk_class === 'CRITICAL',
      'corpus risk classes survive the projection');

    // ── event contract ──────────────────────────────────────────────────────
    const event = buildDomainEvent({
      eventType: 'OrderPaid', producer: 'dial-payments', aggregateType: 'order', aggregateId: 'ord_1',
      correlationId: 'cor_1', payload: { amount_minor: 1000 }, secret: SECRET,
    });
    gate('N8N-RT-G10', verifyDomainEvent({ event, secret: SECRET, policy }).ok, 'a correctly signed in-window event verifies');
    gate('N8N-RT-G11', verifyDomainEvent({ event, secret: 'wrong-secret', policy }).failures.includes('SIGNATURE_INVALID'),
      'a forged webhook is rejected');
    const replayed = verifyDomainEvent({ event, secret: SECRET, policy, seenEventIds: new Set([event.event_id]) });
    gate('N8N-RT-G12', replayed.ok === false && replayed.duplicate === true, 'a replayed event is detected');
    const stale = verifyDomainEvent({ event, secret: SECRET, policy, nowMs: Date.parse(event.occurred_at) + 3_600_000 });
    gate('N8N-RT-G13', stale.failures.includes('EVENT_OUTSIDE_REPLAY_WINDOW'), 'an event outside the replay window is rejected');
    const health = buildDomainEvent({
      eventType: 'CareRecordUpdated', producer: 'dial-care', aggregateType: 'record', aggregateId: 'r1',
      correlationId: 'cor_2', dataClass: 'HEALTH_SENSITIVE', secret: SECRET,
    });
    gate('N8N-RT-G14', verifyDomainEvent({ event: health, secret: SECRET, policy }).failures.some((f) => f.startsWith('DATA_CLASS_DENIED_IN_WORKFLOWS')),
      'identifiable Health context is refused as ordinary workflow context');

    // ── idempotency ─────────────────────────────────────────────────────────
    const ledger = createEffectLedger();
    let sends = 0;
    const send = () => applyEffect({ ledger, eventId: event.event_id, workflowId: 'wf-notify', workflowVersion: '1.0.0', effectName: 'CUSTOMER_NOTIFICATION', apply: () => { sends += 1; return 'sent'; } });
    const first = send();
    const second = send();
    gate('N8N-RT-G15', first.applied === true && second.applied === false && second.reason === 'DUPLICATE_EFFECT_SUPPRESSED' && sends === 1,
      `duplicate delivery produced ${sends} notification`);
    gate('N8N-RT-G16', first.effect_key !== applyEffect({ ledger, eventId: 'evt_other', workflowId: 'wf-notify', workflowVersion: '1.0.0', effectName: 'CUSTOMER_NOTIFICATION', apply: () => 'sent' }).effect_key,
      'a different event produces a different effect key');

    // ── retry classes ───────────────────────────────────────────────────────
    gate('N8N-RT-G17', classifyFailure({ status: 429 }) === 'RATE_LIMIT'
      && classifyFailure({ code: 'ECONNREFUSED' }) === 'DEPENDENCY_UNAVAILABLE'
      && classifyFailure({ status: 422 }) === 'VALIDATION_FAILURE'
      && classifyFailure({}) === 'UNKNOWN',
      'failures classify into the declared retry classes');
    gate('N8N-RT-G18', retryDecision({ policy, failureClass: 'TRANSIENT', attempt: 1 }).retry === true
      && retryDecision({ policy, failureClass: 'VALIDATION_FAILURE' }).retry === false
      && retryDecision({ policy, failureClass: 'POLICY_DENIED' }).retry === false,
      'retry depends on class, and policy-denied is never retried');
    const irreversible = retryDecision({ policy, failureClass: 'TRANSIENT', effectIrreversible: true, idempotencyKeyPresent: false });
    gate('N8N-RT-G19', irreversible.retry === false && irreversible.refusals.includes('IRREVERSIBLE_EFFECT_WITHOUT_IDEMPOTENCY'),
      'an irreversible effect is never retried without an idempotency key');
    gate('N8N-RT-G20', retryDecision({ policy, failureClass: 'DEPENDENCY_UNAVAILABLE', operation: 'PAYMENT' }).refusals.includes('INVALID_PAYMENT_OPERATION'),
      'an invalid payment operation is never blindly retried');

    // ── dead letters ────────────────────────────────────────────────────────
    const dl = buildDeadLetter({ policy, executionId: 'exec_1', workflowId: 'wf-notify', workflowVersion: '1.0.0', event, failureClass: 'DEPENDENCY_UNAVAILABLE', retryCount: 5, lastError: 'upstream down', environment: 'PROD' });
    gate('N8N-RT-G21', dl.ok && dl.record.alert_required === true && dl.record.triggering_event_id === event.event_id && dl.record.correlation_id === event.correlation_id,
      'a production dead letter carries full lineage and raises an alert');

    // ── releases and promotion ──────────────────────────────────────────────
    const workflow = notifyWorkflow();
    const devRelease = buildWorkflowRelease({
      repoDir: repo, policy, workflow, workflowId: 'wf-notify', semanticVersion: '1.0.0', environment: 'DEV',
      allowlist: [], testEvidenceHash: null,
    });
    gate('N8N-RT-G22', devRelease.ok && /^[0-9a-f]{64}$/.test(devRelease.release.content_hash),
      'a development release carries immutable content identity');

    const leaky = notifyWorkflow({ nodes: [...notifyWorkflow().nodes, { name: 'Call', type: 'n8n-nodes-base.httpRequest', parameters: { authorization: 'Bearer AKIAIOSFODNN7EXAMPLEKEY123' } }] });
    const leakyRelease = buildWorkflowRelease({ repoDir: repo, policy, workflow: leaky, workflowId: 'wf-leak', semanticVersion: '1.0.0', environment: 'DEV' });
    gate('N8N-RT-G23', leakyRelease.ok === false && leakyRelease.failures.some((f) => f.startsWith('EMBEDDED_SECRET')),
      'a workflow with an embedded secret cannot be released');
    gate('N8N-RT-G24', scanWorkflowForSecrets({ workflow, repoDir: repo }).ok, 'a clean workflow passes the secret scan');

    const unapproved = buildWorkflowRelease({
      repoDir: repo, policy, workflow, workflowId: 'wf-notify', semanticVersion: '1.0.1', environment: 'PROD',
      promotedFrom: '1.0.0', testEvidenceHash: 'a'.repeat(64), allowlist: ['api.dial.local'],
    });
    gate('N8N-RT-G25', unapproved.ok === false && unapproved.failures.includes('PROD_RELEASE_REQUIRES_HUMAN_APPROVAL'),
      'a production release requires human approval');

    const prodRelease = buildWorkflowRelease({
      repoDir: repo, policy, workflow, workflowId: 'wf-notify', semanticVersion: '1.0.1', environment: 'PROD',
      promotedFrom: '1.0.0', testEvidenceHash: 'a'.repeat(64), approvedBy: 'product owner', approvalAuthority: 'OWNER',
      allowlist: ['api.dial.local'], rollbackVersion: '1.0.0',
    });
    gate('N8N-RT-G26', prodRelease.ok, prodRelease.ok ? 'an approved production release is valid' : prodRelease.failures.join('; '));

    const skipped = promoteWorkflow({ policy, release: prodRelease.release, stagesCompleted: ['DRAFT', 'APPROVAL'] });
    gate('N8N-RT-G27', skipped.ok === false && skipped.failures.some((f) => f.startsWith('STAGE_NOT_COMPLETED')),
      'a workflow cannot skip the promotion pipeline');

    const fullPipeline = (policy.promotion_pipeline || []).slice(0, (policy.promotion_pipeline || []).indexOf('PRODUCTION_ACTIVE'));
    const promoted = promoteWorkflow({ policy, release: prodRelease.release, stagesCompleted: fullPipeline });
    gate('N8N-RT-G28', promoted.ok && promoted.evidence.stages_completed.length === fullPipeline.length,
      `promotion recorded after all ${fullPipeline.length} stages`);

    const edited = notifyWorkflow({ nodes: [...notifyWorkflow().nodes, { name: 'Sneaky', type: 'n8n-nodes-base.noOp' }] });
    gate('N8N-RT-G29', assertReleaseIntegrity({ release: prodRelease.release, runningWorkflow: edited }).failures.includes('WORKFLOW_EDITED_WITHOUT_RELEASE'),
      'an in-place production edit is detected');
    gate('N8N-RT-G30', assertReleaseIntegrity({ release: prodRelease.release, runningWorkflow: workflow }).ok,
      'an unmodified workflow matches its release');

    // ── network and database boundaries ─────────────────────────────────────
    const arbitraryHost = notifyWorkflow({ nodes: [...notifyWorkflow().nodes, { name: 'Call', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://unknown.example/collect' } }] });
    const egress = evaluateEgressPolicy({ workflow: arbitraryHost, estate: 'PROD', policy, repoDir: repo, allowlist: ['api.dial.local'] });
    gate('N8N-RT-G31', egress.ok === false && egress.findings.some((f) => f.reason === 'HOST_NOT_ON_ALLOWLIST'),
      'an arbitrary host is refused under production deny-by-default egress');
    const injected = notifyWorkflow({ nodes: [{ name: 'Call', type: 'n8n-nodes-base.httpRequest', parameters: { url: 'https://{{$json.host}}/x' } }] });
    gate('N8N-RT-G32', evaluateEgressPolicy({ workflow: injected, estate: 'PROD', policy, repoDir: repo }).findings.some((f) => f.reason === 'RUNTIME_URL_INJECTION'),
      'runtime URL injection is refused for privileged workflows');

    const moneyMutation = notifyWorkflow({ nodes: [{ name: 'Write', type: 'n8n-nodes-base.postgres', parameters: { query: 'UPDATE ledger_entries SET amount_minor = 0' } }] });
    const moneyRelease = buildWorkflowRelease({
      repoDir: repo, policy, workflow: moneyMutation, workflowId: 'wf-money', semanticVersion: '1.0.0',
      environment: 'PROD', promotedFrom: '0.9.0', testEvidenceHash: 'a'.repeat(64),
      approvedBy: 'product owner', approvalAuthority: 'OWNER', rollbackVersion: '0.9.0',
      authoritativeTables: ['ledger_entries', 'payments', 'orders'],
    });
    gate('N8N-RT-G33', moneyRelease.ok === false && moneyRelease.failures.some((f) => f.includes('DIRECT_AUTHORITATIVE_TABLE_MUTATION')),
      'direct money-state mutation from a workflow is refused');
    gate('N8N-RT-G34', (policy.forbidden_runtime_authorities || []).includes('MONEY_STATE')
      && (policy.forbidden_runtime_authorities || []).includes('PROJECT_TRUTH')
      && (policy.forbidden_runtime_authorities || []).includes('IDENTITY_TRUTH'),
      'money, identity and Project Truth are declared outside runtime authority');

    // ── estate isolation ────────────────────────────────────────────────────
    const isolated = assertEstateIsolation({
      policy,
      dev: { tenant_id: 'DIAL', estate_owner: 'DIAL', database_host: 'vekl-worker', database: 'n8n_dev', encryption_key_id: 'key-dev', credential_store: 'store-dev', webhook_domain: 'hooks-dev.dial.local', service_account: 'sa-dev', network_policy: 'np-dev', role_binding: 'rb-dev', backup_target: 'bk-dev', audit_stream: 'audit-dev', promotion_path: 'dev->prod', execution_retention_days: 14, credential_ids: ['dev-smtp'], has_production_credentials: false },
      prod: { tenant_id: 'DIAL', estate_owner: 'DIAL', database_host: 'vekl-worker', database: 'n8n_prod', encryption_key_id: 'key-prod', credential_store: 'store-prod', webhook_domain: 'hooks.dial.local', service_account: 'sa-prod', network_policy: 'np-prod', role_binding: 'rb-prod', backup_target: 'bk-prod', audit_stream: 'audit-prod', promotion_path: 'release-import', execution_retention_days: 90, credential_ids: ['prod-smtp'] },
    });
    gate('N8N-RT-G35', isolated.ok, isolated.ok ? 'a correctly separated pair of estates passes isolation' : isolated.failures.join('; '));
    const shared = assertEstateIsolation({
      policy,
      dev: { tenant_id: 'DIAL', estate_owner: 'DIAL', database_host: 'vekl-worker', database: 'n8n', encryption_key_id: 'key', credential_store: 'store', webhook_domain: 'h', service_account: 'sa', network_policy: 'np', role_binding: 'rb', backup_target: 'bk', audit_stream: 'a', promotion_path: 'p', execution_retention_days: 14, credential_ids: ['prod-smtp'], has_production_credentials: true },
      prod: { tenant_id: 'DIAL', estate_owner: 'DIAL', database_host: 'vekl-worker', database: 'n8n', encryption_key_id: 'key', credential_store: 'store', webhook_domain: 'h', service_account: 'sa', network_policy: 'np', role_binding: 'rb', backup_target: 'bk', audit_stream: 'a', promotion_path: 'p', execution_retention_days: 14, credential_ids: ['prod-smtp'] },
    });
    gate('N8N-RT-G36', shared.ok === false
      && shared.failures.includes('DEV_HOLDS_PRODUCTION_CREDENTIALS')
      && shared.failures.includes('SHARED_CREDENTIAL:prod-smtp'),
      'a shared estate is refused, and a dev estate holding production credentials is named');

    // ── status must carry evidence ──────────────────────────────────────────
    gate('N8N-RT-G37', buildRuntimeStatusReport({ workflowId: 'wf', workflowVersion: '1.0.0', executionId: 'e', outcome: 'SUCCEEDED' }).failures?.includes('STATUS_REQUIRES_EVIDENCE_REFS'),
      'a status report with no evidence references is refused');
    gate('N8N-RT-G38', buildRuntimeStatusReport({ workflowId: 'wf', workflowVersion: '1.0.0', executionId: 'e', outcome: 'SUCCEEDED', evidenceRefs: ['exec://e'] }).ok,
      'an evidence-backed status report is accepted');

    // ── rollback and flags ──────────────────────────────────────────────────
    gate('N8N-RT-G39', policy.rollback?.n8n_sole_source_of_business_truth_forbidden === true
      && policy.rollback?.domain_services_must_continue === true,
      'rollback keeps domain services authoritative');
    gate('N8N-RT-G40', policy.money_sensitive_workflows_deferred === true
      && (policy.production_pilots || []).every((p) => p.authority_risk === 'LOW'),
      'pilots start with low-authority-risk workflows, not money flows');

    gate('N8N-RT-G41', exists('deploy/n8n/dev/docker-compose.yml') && exists('deploy/n8n/dev/install-hermes-dev.sh') && exists('deploy/n8n/prod/docker-compose.yml') && exists('deploy/n8n/shared/README.md'),
      'deployment descriptors exist for both estates');
    gate('N8N-RT-G42', exists('tests/orchestration-n8n-runtime.test.mjs'), 'negative-test suite present');

    // ── live estate state: reported, never assumed ──────────────────────────
    const descriptor = deploymentDescriptorRel && exists(deploymentDescriptorRel)
      ? JSON.parse(fs.readFileSync(path.join(repo, deploymentDescriptorRel), 'utf8'))
      : null;
    const liveState = descriptor?.estates?.[estate]?.state || 'UNVERIFIED_FROM_REPOSITORY';
    results.push({
      id: 'N8N-RT-LIVE',
      ok: true,
      detail: `estate ${estate} runtime state: ${liveState} (a repository check cannot observe a running estate; standing one up is an Oracle/owner action)`,
      informational: true,
    });
  } catch (error) {
    gate('N8N-RT-INTERNAL', false, String(error?.stack || error));
  }

  const ok = results.every((x) => x.ok);
  return { ok, estate, passed: results.filter((x) => x.ok).length, total: results.length, results };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const estate = (process.argv[2] || 'DEV').toUpperCase();
  const result = qualifyN8nRuntime({ estate });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
