# DIAL Deep Technical Cohesion Audit — VEKL 2.1, Module Authority & PostHog

**Date:** 2026-09-08
**Status:** implementation/audit evidence; not an independent source of product truth
**Canonical owners changed by this work:** Project Truth, active Development Plan, existing VEKL canon and Master Product/Technical/Delivery Architecture.
**Purpose:** prevent DIAL's growing tool/module surface from turning into overlapping authorities, ambiguous runtime decisions or prompt/context bloat.

---

## 1. Audit conclusion

DIAL already had unusually strong anti-conflict rules: one money ledger, deterministic pricing, one product AI package, DKRF as the horizontal product retrieval fabric, explicit donor boundaries, one selected tool where functions overlap, and VEKL as non-authoritative engineering guidance. The principal defect was not missing tools. It was that several of those boundaries were expressed in prose but were not all projected into one machine-checkable cross-tool authority map, while VEKL's generic resource resolver still used a global top-N ranking that could make complementary resource classes compete accidentally.

The highest-value correction is therefore **cohesion, not expansion**:

1. VEKL resource resolution now performs hard eligibility before ranking.
2. Skills have exactly one selection owner: the exact-pin Skill resolver. The generic resource resolver cannot select them a second time.
3. Optional engineering resources compete only inside deterministic `(purpose, role)` slots.
4. Complementary authority/guidance/executor/verifier/policy/reference/diagnostic roles may coexist.
5. Registry identity is fingerprinted into selected resource provenance and current activations can be checked against current registry/source state.
6. Resource context defaults to descriptor-only unless directly relevant authority material needs an eager excerpt.
7. A machine-checkable Technical Cohesion Authority Registry now projects cross-tool ownership without becoming a second source of truth.
8. PostHog is adopted only as a bounded product-experience telemetry/rollout adapter, not as another business platform.

This is the same architectural direction as DDE Production VEKL's strongest ideas, adapted to DIAL rather than copied wholesale.

---

## 2. DDE VEKL comparison

The 2026-09-08 DDE Production VEKL reference has several controls that were stronger and more explicit than DIAL VEKL v2 before this tranche:

| Concern | DDE VEKL | DIAL before this audit | DIAL after this audit |
|---|---|---|---|
| Authority separation | Explicit Project Truth / governance / VEKL / verification split | Present in canon, less explicit in resolver | Preserved and made part of cohesion lock |
| Hard eligibility | Separate hard rejection phase before ranking | Mixed relevance/status/tool checks and scoring | Explicit hard eligibility boundary |
| Resource composition | Smallest qualified coalition | Global top-N | Deterministic `(purpose, role)` minimal coalition |
| Complementary resources | Roles coexist | Could be displaced by higher-scoring peers | Authority/executor/verifier/policy/etc coexist by slot |
| Skill ownership | Exact Skill binding/projection | Dedicated Skill resolver plus generic SKILL resource projection | Generic resolver refuses SKILL; one owner only |
| Manifest continuity | Immutable exact selected identity | Strong for Skills; resources persisted in same manifest | Resource registry fingerprint added; current state revalidation supported |
| Progressive disclosure | Descriptor first, lazy executable/detail hydration | Cached resource excerpts could be injected broadly | Descriptor-only by default; directly relevant authority excerpts eager |
| Provider failover | Same manifest | Already strong Sol→Sonnet symmetry | Preserved |
| Anti-overengineering | Explicit no-second-engine laws | Many individual no-go rules | Cross-tool authority projection + no new orchestration engine |
| Learning | Verifier-backed outcome law | Skill/resource outcomes non-authoritative | Preserved; no analytics/learning system becomes truth |

### What DIAL deliberately does **not** copy

DIAL does not create a second capability-lease engine, a second side-effect journal, a second hook engine, a second workflow engine or a DDE-style Production Studio VEKL workbench. DIAL already has its own Oracle/Hermes control plane, tool guards, mission controller, feature/FRC/evidence gates and product runtime architecture. Copying DDE's internal control-plane services would violate the very anti-overengineering rule being adopted.

The transfer is therefore principles and deterministic selection law, not wholesale subsystem duplication.

---

## 3. VEKL 2.1 resolution law

The resource path now follows:

```text
Feature / packet / affected paths
        +
DIAL Project Truth and engineering policy
        ↓
Task classification
        ↓
Hard eligibility
  - admitted source
  - admitted resource class
  - valid lifecycle state
  - executable-source permission where applicable
  - required tool availability
  - task specificity for community evidence
        ↓
Skills removed from generic resource pass
        ↓
Deterministic role + purpose assignment
        ↓
Mandatory explicit policy bindings
        +
One winner per optional (purpose, role) slot
        ↓
Explicit context budget
        ↓
Engineering Knowledge Activation Manifest
```

Stable resource roles are:

```text
AUTHORITY
GUIDANCE
EXECUTOR
VERIFIER
POLICY
REUSE
DIAGNOSTIC
REFERENCE
```

The design intentionally avoids a graph optimiser. The concrete requirement is smaller: preserve complementary functions and prune redundant peers reproducibly.

### Important invariant

`maxResources` is a context budget, not a quality algorithm. Quality/eligibility decides valid candidates first. The budget is applied only after slot competition and may not manufacture eligibility.

---

## 4. Current VEKL implementation corrections

Implemented in this tranche:

- `engineering-resource-resolver.mjs`
  - VEKL 2.1 policy version;
  - hard eligibility;
  - deterministic role/purpose assignment;
  - purpose+role minimal coalition;
  - input-order-independent tie behavior;
  - explicit redundant-peer reasons;
  - generic Skill-selection prohibition;
  - compact context-delivery mode;
  - registry fingerprint per selected resource;
  - PostHog product-analytics task classification.
- `skill-activation-store.mjs`
  - refuses duplicate SKILL resources;
  - can revalidate selected resource registry/source state;
  - validates cached content identity where present;
  - includes role/purpose/delivery/fingerprint in activation evidence;
  - only eagerly injects cached resource material when the selection asks for it.
- source/resource registries
  - official PostHog source and reference added;
  - core DIAL hooks/loops are no longer implicitly treated as prompt cargo merely because they are project-local policy;
  - only explicitly declared always-bound policy is mandatory in VEKL context.

The implementation retains the existing exact-pin immutable Skill path and the same Sol→Sonnet manifest.

---

## 5. Technical cohesion law

DIAL now treats each cross-cutting concern as having exactly one canonical owner plus zero or more supporting adapters.

```text
Canonical authority
     ↓ emits / decides
Typed domain contract/event
     ↓
Supporting projection / tool / adapter
     ↓
Observation, execution or presentation only
```

A supporting system may never become authoritative merely because it has a richer dashboard, more data, a convenient SDK or an internal database.

The machine projection is:

`agent-system/registries/TECHNICAL_COHESION_AUTHORITY_REGISTRY.json`

and is checked by:

`agent-system/bin/technical-cohesion-check.mjs`

This registry explicitly declares itself **NOT_AN_INDEPENDENT_SOURCE_OF_TRUTH**. It is a CI assertion projection of canonical decisions.

---

## 6. Cross-tool symbiosis map

### Money and commercial truth

- Finance/Ledger + PSP reconciliation owns money.
- `PLAT-F014` owns deterministic pricing/margin calculation.
- deterministic promotions/commercial policy owns binding promotion eligibility/value.
- GMPC can propose, simulate and govern commercial decisions within its contracts.
- PostHog, Metabase, Langfuse, Hermes and AI are never money/pricing authorities.

### Product analytics and rollout

- DIAL versioned event contracts/domain truth define what happened.
- PostHog observes product behavior and controls bounded exposure only.
- DIAL DB activation/certification remains above any feature flag.
- PostHog outage cannot break checkout, booking, dispatch, payment, fulfilment or support.

### Experiments

- GMPC-F110 owns experiment identity, hypothesis, success/counter-metrics, approval and result record.
- PostHog may perform variant assignment and product-behavior measurement.
- A PostHog experiment is never the sole DIAL experiment source of truth.

### Surveys

- Formbricks remains the survey intake tool feeding DIAL quality/outcome contracts.
- PostHog Surveys is deliberately not introduced as a duplicate.

### Technical telemetry

- OpenTelemetry + Prometheus/Loki/Tempo/Grafana owns technical metrics/logs/traces and service health.
- PostHog replay/error context may be correlated as UX evidence only; it does not replace the technical plane.

### AI telemetry and quality

- Langfuse owns AI trace/prompt/dataset observability under DIAL contracts.
- Promptfoo + deterministic assertions + human promotion owns AI evaluation/promotion evidence.
- PostHog AI Observability is not adopted as a parallel trace/eval authority.

### BI and operations

- Metabase is read-only business exploration over DIAL data.
- Command Centre owns operational queues, contracted KPIs and typed actions.
- Dashboards never gain write authority merely because an operator can see an anomaly there.

### Search

- catalogue/fitment/domain DB remains truth.
- Meilisearch is a derived search projection only.

### Customer support

- DIAL Support OS/domain records own support/business state.
- Chatwoot is the bridged human-support console.

### Workflow execution

The existing three-way split remains correct and should be enforced rather than consolidated into one “automation platform”:

- **Temporal** — durable business workflows with long-lived state/retries/reconciliation;
- **BullMQ** — bounded asynchronous jobs such as reindexing, image work and webhook processing;
- **n8n** — operator/integration glue where an ops-owned visual workflow is appropriate.

No one of these replaces the others, and none becomes a domain system of record.

---

## 7. PostHog adoption decision

PostHog is high-value for DIAL, but only under a bounded profile. DIAL already selected PostHog over GrowthBook in product canon; the missing part was an enforceable integration boundary.

### Adopt

1. Product analytics: activation, funnels, adoption, retention and drop-off.
2. Web analytics where consent/privacy rules permit.
3. Session replay and heatmaps only on explicitly permitted surfaces with consent.
4. Staff/dogfood/progressive UX rollouts.
5. Variant assignment and behavioral measurement for DIAL-owned GMPC experiments.

### Do not duplicate existing owners

| PostHog capability | DIAL decision |
|---|---|
| Surveys | Do not adopt as parallel survey path; Formbricks stays canonical tool |
| AI Observability | Do not adopt as parallel AI trace path; Langfuse stays canonical |
| AI evaluation | Promptfoo + human gate stays canonical |
| Logs / technical traces | Do not replace OpenTelemetry/Prometheus/Loki/Tempo/Grafana |
| Managed warehouse / CDP | Do not become customer/business/money/campaign SoR |
| Workflows | Do not replace Temporal/BullMQ/n8n/domain services |
| Error tracking | Optional UX correlation only; technical error authority remains technical observability plane |

### Privacy posture

DIAL uses explicit events, not “capture everything and decide later.” External product analytics accepts only `PUBLIC` and `PSEUDONYMOUS` telemetry classifications. Sensitive/restricted fields and exact financial values are rejected by the DIAL adapter.

Session replay is denied on:

- checkout;
- payment;
- identity/authentication;
- Dial Health;
- claims;
- employee surfaces.

This is a DIAL minimum. A future privacy review may narrow it further.

---

## 8. `@dial/product-telemetry`

A DIAL-owned boundary package now exists at:

`packages/product-telemetry`

It deliberately does **not** put a third-party SDK inside domain packages. The adapter accepts a PostHog-like client at the platform edge.

It provides:

- versioned semantic event validation (`domain.action.vN`);
- privacy-class enforcement;
- forbidden sensitive/exact-money property detection;
- graceful analytics failure semantics;
- session replay policy;
- canonical-gate-first rollout composition;
- refusal of flag domains such as pricing, payment, ledger, authorization, compliance and Health/claims.

The key rollout law is:

```text
DIAL canonical gate = false
        ↓
feature unavailable

DIAL canonical gate = true
        +
PostHog rollout/variant
        ↓
exposure decision only
```

PostHog can reduce/expose an already-valid experience. It cannot create authority.

---

## 9. Event taxonomy rules

Every product analytics event should be:

```text
<domain>.<action>.v<schema-version>
```

Examples:

```text
spare.search_completed.v1
tech.booking_opened.v1
grocery.round_joined.v1
home.branch_opened.v1
```

Do not emit exact payment amounts, balances, card/bank details, claim/clinical content, credentials or direct identity fields to the general product-analytics path.

If the business needs financial analytics, derive it in governed BI/MetricContracts from authoritative finance/domain data rather than exporting the money ledger into a product-event taxonomy.

---

## 10. Determinism and failure semantics

For each module/integration, determine four things before implementation:

1. **Owner** — which canonical module decides?
2. **Input contract** — what typed state/event does it consume?
3. **Output/effect class** — observation, projection, proposal or mutation?
4. **Failure policy** — fail closed, degrade, retry/reconcile or continue without optional side path?

Examples:

- PostHog unavailable → core flow continues; telemetry reports sink failure.
- PostHog flag unavailable → stable local experience while DIAL canonical gate remains authoritative.
- Meilisearch unavailable → no invented catalogue truth; search degrades/fails explicitly.
- Metabase unavailable → no operational state loss; BI unavailable only.
- Langfuse unavailable → AI observability degrades according to AI policy; never invents evaluation evidence.
- PSP outcome unknown → money path reconciles; never infer settlement from analytics/UI state.

---

## 11. Anti-overengineering rules

This audit explicitly rejects:

- a new “unified observability platform” that replaces PostHog + OTel + Langfuse + Metabase + Command Centre with blurred authority;
- a new VEKL graph planner;
- a second Skill resolver;
- a second workflow/orchestration engine created only to coordinate existing workflow engines;
- a PostHog data warehouse as a shortcut around DIAL domain models;
- flags embedded in pricing/payment/authorization logic;
- duplicated survey stacks;
- duplicated AI eval stacks;
- “analytics-driven” direct production mutation without a canonical domain command and policy gate.

Complexity is added only when evidence shows the simpler deterministic split is insufficient.

---

## 12. Verification added

New/expanded tests prove:

- VEKL resource roles remain complementary;
- redundant peers are pruned deterministically;
- reversing candidate input order returns the same resource identities;
- PostHog official guidance resolves for product analytics work;
- Skills cannot be selected by the generic resource path;
- sensitive/exact-money product telemetry is rejected;
- analytics sink failure cannot throw through the product flow;
- restricted session replay surfaces are blocked;
- PostHog cannot override a disabled canonical DIAL gate;
- money/auth/compliance/Health flag domains are refused;
- the Technical Cohesion Authority Registry has one declared authority per concern and explicit PostHog overlap refusals.

Repository-wide `npm run verify` remains the final integration gate.

---

## 13. Remaining measured follow-ups

These are not reasons to add more architecture now:

1. Instrument real apps only as their customer-facing slices are implemented; do not create synthetic analytics completion evidence before the surfaces exist.
2. Add platform-native PostHog SDK adapters at app edges once web/Android/iOS app packages are real, while preserving `@dial/product-telemetry` as the policy boundary.
3. Define the first production event catalogue per implemented vertical slice rather than pre-authoring hundreds of unused events.
4. Add consent storage/binding tests when the legal/consent runtime is implemented.
5. Measure VEKL false-activation rate/context footprint before considering any selector more complex than `(purpose, role)`.
6. Expand the cohesion registry only when a new cross-cutting tool or authority is introduced; do not mirror every ordinary package into it.

---

## 14. Architecture lock

The resulting rule is:

> **DIAL should have many capabilities but few authorities. Every supporting tool must have one bounded job, every business decision must resolve to one canonical owner, optional analytics must never become transaction-critical, and VEKL must select the smallest complementary engineering resource set needed for the current packet.**
