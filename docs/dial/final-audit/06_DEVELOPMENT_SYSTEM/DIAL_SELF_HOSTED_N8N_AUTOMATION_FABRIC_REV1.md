# DIAL Self-Hosted n8n Automation Fabric — Rev 1

**Subordinate to:** `DIAL_DEVELOPMENT_PRODUCT_INTELLIGENCE_AUTOMATION_ARCHITECTURE_REV_3_1.md` (§7, §28)
**Decision:** `DEC-035`
**Status:** Contract implemented and qualified; no estate stood up
**Evidence:** `DIAL_REV_3_1_IMPLEMENTATION_EVIDENCE.md`

## 1. Three names, never two

```
VEKL_N8N_CORPUS    knowledge ABOUT workflows. Executes nothing.
DIAL_N8N_DEV       self-hosted development workflow runtime.
DIAL_N8N_PROD      self-hosted production workflow runtime.
```

`agent:vekl:n8n-corpus-check` is the corpus check's name; `agent:vekl:n8n-check` is retained as
a compatible alias because other automation calls it. `agent:n8n-dev:qualification` and
`agent:n8n-prod:qualification` qualify the runtime estates. The corpus may inform runtime
workflow quality; the runtime never becomes the corpus's authority.

## 2. Node policy is a projection, not a second allowlist

```
n8n-node-capability-map.json + n8n-security-rules.json
        ↓  compileRuntimeNodePolicy()
DEV node policy          PROD node policy
```

The compiler **refuses to start** when an estate names a capability the corpus does not know.
That is what makes "no second allowlist" enforceable rather than aspirational: the runtime
cannot name a capability the corpus has never classified, and `assertProductionNotLooserThanDev`
proves production is stricter than development on every capability and on network default.

Corpus risk classes survive the projection: `executeCommand` stays `CRITICAL`, `code` stays
`HIGH`. An unofficial node package or a node unknown to the corpus is refused in **both**
estates — unknown means unqualified, not safe.

## 3. Authority boundary

n8n may receive events, call governed APIs, wait, retry, route, enrich, notify, request
approval, trigger integrations, aggregate evidence, schedule and coordinate multi-system
processes.

n8n may never author: price, money state, beneficiary allocation, account balance, grocery
credit truth, inventory truth, final order truth, identity truth, access-control truth or
Project Truth. `evaluateDatabaseWrites` refuses a workflow that mutates an authoritative table
or names a forbidden authority; a read-only query against the same table passes.

## 4. Event envelope

Signed HMAC-SHA256 over a canonical serialization of the envelope minus its signature, so key
order cannot change the digest. Required: `event_id`, `event_type`, `event_version`,
`occurred_at`, `producer`, `aggregate_type`, `aggregate_id`, `correlation_id`, `data_class`,
`payload`, `signature`.

`verifyDomainEvent` refuses a forged signature, a tampered payload, an unsigned event, a
replayed `event_id`, an event outside the 900-second replay window, one dated from the future,
and `HEALTH_SENSITIVE` data class — sensitive Health context is not ordinary workflow context.

## 5. Idempotency

```
workflow_effect_key = hash(event_id + workflow_id + workflow_version + effect_name)
```

An adapter either declares itself repeatable or it does not run twice. The default is
not-repeatable, because an adapter that forgot to say is far more likely to be a notification
than a no-op. One customer notification, one supplier job, one document request, one
escalation, one CRM activity — proven under repeated delivery.

## 6. Retry classes

`TRANSIENT`, `RATE_LIMIT`, `AUTH_EXPIRED`, `DEPENDENCY_UNAVAILABLE`, `VALIDATION_FAILURE`,
`POLICY_DENIED`, `PERMANENT_BUSINESS_FAILURE`, `UNKNOWN`. Retry depends on class — and four
refusals override any class, including the retryable ones:

- an invalid payment operation,
- a policy-denied action,
- a malformed business command,
- an irreversible effect with no idempotency key.

## 7. Dead letters

Carry execution id, workflow id and version, triggering event, failure classification, retry
count, last error, correlation id, affected aggregate, whether business state was mutated, and
a recommended operator action. Production dead letters alert.

## 8. Release identity and promotion

Every production workflow has an immutable release: content hash (excluding mutable
bookkeeping), environment, approver and approval authority, promotion source, test evidence
hash, dependency manifest hash, node policy hash, secrets contract hash, egress allowlist and
rollback version.

`assertReleaseIntegrity` compares what is running against the release that authorised it, so an
in-place production edit is detected rather than discovered at the next incident.

The pipeline runs `DRAFT → STATIC_VALIDATION → CORPUS_SECURITY_CHECK → DEV_EXECUTION →
SYNTHETIC_TESTS → FAILURE_PATH_TESTS → IDEMPOTENCY_TEST → SECRET_NETWORK_POLICY_TEST →
APPROVAL → SIGNED_RELEASE_EXPORT → PRODUCTION_IMPORT → CANARY → PRODUCTION_ACTIVE`, and
`promoteWorkflow` refuses a skipped or reordered stage. A production release additionally
requires human approval, test evidence, a promotion source and a rollback version.

## 9. Secrets, network, database

Secrets never appear in workflow JSON; the scan reuses the corpus security patterns rather than
restating them, and a credential referenced by expression is correct usage rather than a
finding. Production egress is deny-by-default with per-release allowlists, and runtime URL
injection (`https://{{$json.host}}/…`) is refused for privileged workflows because it cannot be
checked against an allowlist at promotion time. Service APIs are preferred over direct database
access; direct authoritative-table mutation is refused.

## 10. Estate isolation

Separate database, encryption key, credential store, webhook domain, service account, network
policy, execution retention, role bindings, promotion path, backups and audit stream — even
when both estates initially share a VM. A dev estate that shares a credential id with
production, or declares `has_production_credentials: true`, fails qualification. An
isolation requirement left undeclared fails as `ISOLATION_UNDECLARED` rather than passing.

## 11. What is qualified, and what is not

`agent:n8n-dev:qualification` and `agent:n8n-prod:qualification` qualify the **contract**: node
policy projection, release identity, event verification, idempotency, retry and dead-letter
behaviour, egress and database boundaries, isolation declarations.

They do **not** claim an estate is running. A repository check cannot observe a VM, so the live
state is reported as `UNVERIFIED_FROM_REPOSITORY` unless a deployment descriptor says
otherwise. Standing an estate up is an Oracle/owner action.

## 12. Rollout

Both estates ship behind feature flags. Development workflows start with VEKL discovery
orchestration, frontend candidate orchestration, CI evidence aggregation, research harvest
tracking and Hermes notification. Production pilots are one low-authority-risk workflow per
product domain; money-sensitive flows are deferred.

Rollback disables workflows at the ingress/event subscription layer. Domain services continue,
and n8n is never the only place core business truth exists.

## 13. Surfaces

| Concern | Module |
| --- | --- |
| corpus → runtime node policy projection | `agent-system/orchestration/n8n-runtime-node-policy.mjs` |
| event envelope, idempotency, retry, dead letters, status | `agent-system/orchestration/n8n-runtime-events.mjs` |
| releases, promotion, secrets, egress, database, isolation | `agent-system/orchestration/n8n-runtime-release.mjs` |
| estate qualification | `agent-system/orchestration/n8n-runtime-qualification.mjs` |
| policy | `agent-system/registries/N8N_RUNTIME_POLICY.json` |
| deployment | `deploy/n8n/{dev,prod,shared}/` |
| negative tests | `tests/orchestration-n8n-runtime.test.mjs` |
