# DIAL SOURCE OF TRUTH — MASTER PRODUCT, COMMERCIAL, TECHNICAL, RUNTIME & IMPLEMENTATION CANON

**Version:** 1.2 — Canon + Implementation Reconciliation  
**Date:** 4 September 2026  
**Status:** DEFINITIVE CURRENT SOURCE OF TRUTH  
**Canonical implementation repository:** `Vanguduza/dial-new`  
**Delivery doctrine:** **Build broad. Certify deeply. Activate selectively.**

---

# 0. PURPOSE AND AUTHORITY

This document is the single product/architecture authority for DIAL Main. It consolidates and supersedes the former v1.x/v2.x master plans, closure canons, anchor indexes, development prompts, reconstruction prompts, Round credit doctrine and later founder-locked decisions.

It exists to prevent authority drift. An engineer or agent must be able to determine current product law, implementation boundaries and required evidence without reconciling historical documents manually.

This is not a restart. Existing correct implementation is preserved; code is migrated only where it conflicts with current authority or is proven defective.

## 0.1 Authority order

Authority resolves in this order:

1. this document plus later explicitly founder-approved amendments;
2. the current Decision Registry, but only as a machine projection of this document;
3. machine registries and evidence: Feature, FRC, Security, Eventuality, Activation, Provider Capability, Evidence and Independent Review;
4. `agent-system/canon/PROJECT_TRUTH.md`, which is a compact projection of this document;
5. feature implementation contracts and current implementation evidence;
6. specialist annexes, donor dossiers, research and implementation notes, only where consistent with this document;
7. historical Git history.

A lower level may add detail but may not contradict a higher level. Historical detail does not regain authority because it is more detailed.

## 0.2 Repository lock

The active DIAL Main implementation repository is `Vanguduza/dial-new`.

`Vanguduza/dial` is legacy/provenance for current execution unless a deliberate repository migration is separately approved.

## 0.3 DDE boundary

DDE and DIAL are separate systems.

- DIAL is the business/product operating ecosystem.
- DDE is a development-engineering environment that may build DIAL.
- DDE manager-chair, worker-pool and development-model-routing concepts are not DIAL product architecture.
- Oracle/Hermes in this document belongs to DIAL runtime infrastructure, not DDE.

---

# 1. CURRENT DIAL MAIN SCOPE

Current non-health DIAL Main scope includes:

- DIAL Consumer;
- Dial a Spare;
- Dial a Tech and Technician OS;
- Dial Groceries, Pantry, Scheduled Basket and Grocery Rounds;
- Dial Laundry;
- My Assets;
- Vehicle Hub;
- Dial Care;
- Dial Assist;
- DIAL Projects;
- Dial Fleet Maintenance;
- DIAL Business;
- Supplier/Provider operating systems;
- Logistics & Delivery OS;
- Communication Fabric;
- Support OS and Resolution & Conflict Engine;
- Knowledge, Retrieval, Intelligence & Automation Platform;
- Visual Intelligence & Enterprise Digital Twin Fabric (`VITF`);
- Comprehensive Product Comparison Engine;
- Command Centre;
- Corporate Management OS;
- shared identity, catalogue, money, evidence, security, observability, analytics and activation systems.

## 1.1 Dial Health

Dial Health/ZHOTN is outside the current DIAL Main development programme. It will have its own specialist source of truth. Current DIAL Main feature counts, completion gates and branch activation must not depend on Health-only scope.

Any earlier document stating that Dial Health is a required current DIAL Main division is superseded.

---

# 2. NORTH-STAR DOCTRINE

DIAL is one governed operating ecosystem with many business experiences. It wins through trusted orchestration, commercial logic, customer relationships, canonical asset context, evidence, fulfilment visibility, quality loops, supplier/provider coordination, safe resolution, intelligence and controlled automation.

DIAL does not win by holding everyone’s money, duplicating systems of record per business unit, allowing AI to become transactional authority, or presenting isolated packages as a finished platform.

A technically complete capability may remain `CERTIFIED_DORMANT` until legal, provider, commercial or capacity activation gates are satisfied.

---

# 3. SHARED KERNEL — HARD SYSTEM-OF-RECORD LOCKS

DIAL maintains one authoritative framework for each shared concern:

1. Party / Identity;
2. Organisation / Relationship Graph;
3. Customer 360;
4. Asset Registry / My Assets;
5. Vehicle / Fitment authority;
6. Supplier / Provider relationships;
7. Catalogue;
8. Pricing & Commercial Policy;
9. Beneficiary Allocation / Entitlements;
10. Orders;
11. Jobs / Trade / JobClass;
12. Fulfilment;
13. Logistics / Delivery;
14. PaymentIntent / Money Orchestration;
15. Settlement / Reconciliation;
16. append-only Ledger / accounting facts;
17. Evidence / Audit;
18. Resolution & Conflict Engine;
19. Trust / Guarantee / Claims;
20. Communication Fabric;
21. Provider Quality / CAPA;
22. Knowledge & Retrieval Fabric;
23. governed Intelligence / Automation;
24. Analytics / semantic metrics;
25. Activation / capability control;
26. Command Centre projections and controlled actions;
27. VITF visual/digital-twin projections;
28. shared Product Comparison.

When multiple divisions need the same horizontal capability, extend the shared authority instead of creating a division-local replacement.

---

# 4. TRANSACTIONAL AUTHORITY LAW

Across DIAL:

- consequential transitions use typed commands;
- generic `PATCH status=...` is not business authority;
- commands are authenticated, authorised, version-aware, idempotent and auditable;
- domain mutation and durable outbox fact commit atomically;
- event consumers are idempotent;
- events are versioned facts, not second writers;
- queues, browser state, AI, search indexes and visual projections never become sources of truth;
- unknown external outcomes remain `UNKNOWN` until verified;
- historical financial facts are corrected with compensating transactions, never destructive edits.

---

# 5. MONEY, PRICING, ALLOCATION, PAYMENT AND SETTLEMENT

## 5.1 Four separate domains

DIAL maintains four distinct state machines:

1. **Pricing & Margin** — what the customer owes and expected economics;
2. **Beneficiary Allocation / Entitlements** — who economically owns each portion;
3. **Payment Orchestration** — which compliant provider executes the instruction;
4. **Settlement & Reconciliation** — what actually moved and whether external records agree.

They must never collapse into one generic payment status.

## 5.2 Immutable checkout snapshot

Once checkout is locked:

- customer price is immutable;
- beneficiary allocation is immutable;
- tax/FX/policy/provider-cost versions are snapshotted;
- discount funding source is snapshotted;
- later corrections use adjustment, replacement, refund, reversal or other compensating transaction;
- every cent maps to a beneficiary, tax, fee, discount-funding source or deterministic rounding adjustment.

## 5.3 DIAL role and no-custody rule

For ordinary marketplace commerce, DIAL is a disclosed agent. It is not the principal supplier merely because the transaction originated on DIAL and it is not the custodian of supplier money.

Target:

```text
CUSTOMER
   ↓ one original payment instruction
LICENSED PSP / ACQUIRER
   ├─→ SUPPLIER beneficiary settlement
   └─→ DIAL contractual fee settlement
```

DIAL must not solve PSP limitations by receiving gross supplier money into an ordinary DIAL account and later paying the supplier.

If one-to-many beneficiary settlement is unavailable for a multi-supplier cart, create explicit supplier-grouped PaymentIntents.

## 5.4 Current first-class provider set

Core marketplace routes are:

- Appletree Payments — Hosted Checkout where applicable;
- ContiPay;
- ZimSwitch / participating acquiring-bank route.

Provider-specific logic lives only in adapters.

Historical Paynow, PayPal and direct EcoCash assumptions are not current core marketplace authority unless explicitly re-approved for a specialist flow.

Cash/COD may exist only in explicitly approved workflows as a separate controlled physical-custody process.

## 5.5 Payment truth

Authoritative paid state comes from verified server-side provider evidence: signed callback/webhook, provider query, reconciliation and settlement evidence where applicable.

Browser redirect/customer action is journey UX only and cannot create `PAID`.

Ambiguous provider outcomes must be reconciled before unsafe retry.

## 5.6 Provider routing

The Money Orchestrator considers method, currency, beneficiary structure, settlement destination, capability, health, fees, expected IMTT treatment, approval rate, refund/chargeback support, settlement speed, transaction value, supplier eligibility, branch policy and risk/compliance state.

A cheaper route is ineligible if it violates no-custody or another hard control.

## 5.7 Legal/tax rule

Product code must not embed historical legal conclusions or rates as timeless truth. Legal/tax treatment is effective-dated, jurisdiction-aware, configuration/data-driven and separately activation-evidenced. Counsel/ZIMRA/provider evidence is required where consequential.

---

# 6. DIAL GROCERIES

Dial Groceries natively supports merchant/store-aware availability, shared product identity plus branch-owned offers, variable-measure goods, weighted-item approval, substitutions, produce preferences, retailer-pick and DIAL-shopper modes, OrderGroup/SubOrders/fulfilment jobs, slots/capacity, Pantry, Scheduled Basket, beneficiary fulfilment, click-and-collect, restricted-goods gates, batch/lot/expiry/recall where supported, cold-chain evidence and grocery-specific support outcomes.

Displayed stock is a timestamped projection, not a guaranteed promise.

---

# 7. GROCERY ROUNDS — DEFINITIVE CURRENT MODEL

## 7.1 Product definition

Grocery Rounds are **collective prepaid grocery purchasing groups**.

They are not savings, investment, lending, cash wallets, member-controlled pooled bank accounts, FX products or interest-bearing products.

Each member owns an individually attributable **Prepaid Grocery Entitlement**.

Preferred terminology:

- `prepaid_grocery_entitlement`;
- `grocery_entitlement`;
- `prepaid_grocery_value`.

Legacy code names containing `credit` are migration aliases only and must not drive customer semantics or governance.

## 7.2 Plan structures

Rounds support preconfigured 3-, 6-, 9-, 12-month and other approved tiers, custom public/private Rounds, configurable duration, purchase value, member thresholds/limits, city/zone and other approved parameters. Eligible public Rounds may be joined by strangers.

Creation and joining require explicit, versioned, auditable terms acceptance.

## 7.3 Democratic governance

**One active eligible member = one vote.**

Contribution size, entitlement value or legacy credit value does not increase voting power. Governance and economic entitlement are separate concepts.

## 7.4 Initiator role

A Round initiator may create the Round, configure permitted pre-lock parameters, invite members, moderate discussion under policy and propose products like another member.

The initiator may not override votes, change vote weights, spend/redirect another member’s entitlement, alter another member’s contribution, force procurement, add unapproved final-cart items, block a lawful opt-out, act as treasury controller or act as privileged financial administrator.

The initiator badge is organisational context only.

## 7.5 Authorization

Human Round commands require authenticated principal/session, Round ID, membership identity/status, requested capability, relationship/ownership, current Round/cart/voting state and policy evaluation. `actor_type == customer` is never sufficient.

Machine commands require authenticated service identity, explicit capability, valid state, invariant checks and idempotency.

## 7.6 Round Room

The Round Room is a purpose-built collaborative commerce workspace containing member roster, entitlement status, proposals, product discovery, basket candidates, structured voting, live tally, quorum/state, collective cart, discount preview, individual impact, opt-out, timeline, notices, discussion and WhatsApp integration where appropriate.

It is not a generic group chat with a voting widget.

## 7.7 Opt-out

Where the published Round state permits exit:

1. the member leaves future Round governance;
2. uncommitted entitlement attributable to that member is removed from Round allocation;
3. that uncommitted value transfers to the member’s ordinary Dial Groceries purchasing entitlement;
4. the member may use it to buy groceries normally;
5. the transfer is recorded immutably;
6. quorum, allocation and basket calculations recompute.

This is not forfeiture, cash withdrawal, discretionary initiator refund or initiator-controlled approval.

If value has crossed an irreversible procurement/settlement boundary, use compensating transactions instead of rewriting history.

## 7.8 Collective cart and procurement

Voting determines member demand. A deterministic cart state machine converts the result into a final collective cart.

No individual member issues final procurement.

Procurement becomes permissible only after required collective conditions are valid, for example:

```text
ROUND_STATE = CART_FINALISED
VOTING = CLOSED + VALID
ALLOCATIONS = LOCKED
CART_VALIDATION = PASSED
FUNDING_COVERAGE = COMPLETE
PROCUREMENT = NOT_CREATED
```

Then an authenticated capability-scoped DIAL service may execute procurement.

## 7.9 Discount engine

Voting asks what members want. The discount engine asks what commercial discount DIAL may offer on the selected basket.

Discount calculation is separate from voting and cannot change vote weight. Before lock it is estimated/provisional. After cart snapshot lock the final discount is immutable for that snapshot.

## 7.10 Allocation

The Allocation Engine maps collective-cart funding to member entitlements without giving one member control over another’s value. It records value committed, value remaining, product share/benefit where applicable, residual entitlement and rounding.

No entitlement may disappear, duplicate or change owner without ledger evidence.

## 7.11 Free delivery and Care

Qualifying Round fulfilment includes free delivery within supported zones. This is a Round benefit.

Every active qualifying Round member receives Dial Care Silver Access for the qualifying relationship. Round free delivery remains a Round benefit, not a generic Care allowance.

## 7.12 Protection

DIAL protects its paid-but-undelivered grocery obligation through an approved commercial protection structure appropriate to the risk. DIAL must not present itself as the insurer.

A historical approximate protection percentage such as 4% is not a permanently locked customer rate. Final customer pricing/cost recovery requires current approved commercial evidence.

## 7.13 Retired Round mechanics

The following are superseded and prohibited:

- contribution/pool-credit-weighted voting;
- initiator approval of exits;
- initiator financial/procurement privilege;
- cash withdrawal semantics;
- mutable final cart financial snapshots;
- generic `actor_type` authorization;
- exit models that strand eligible uncommitted entitlement inside a Round;
- language implying the initiator owns pooled money.

Code implementing these mechanics is `IMPLEMENTATION_CONFLICT` until migrated and retested.

---

# 8. DIAL CARE

Dial Care is a cross-DIAL membership, entitlement, preventive-care and relationship system. It is not vehicle-only and is not an unlimited repair-insurance pool.

Care domains include Mobility, Home & Property, Business & Equipment, Agriculture and future approved maintainable-asset domains.

Care may provide priority, negotiated economics, reminders, preventive tools, My Assets history, partner/member offers, controlled allowances, asset-health reviews and support benefits.

Actual parts, labour, major repairs, towing and substantial third-party costs remain separately chargeable unless explicitly funded by supplier, partner or licensed insurer.

Current tier doctrine:

- Silver Access — relationship/acquisition tier with low marginal-cost benefits;
- Gold — paid/earned recurring tier with stronger controlled benefits;
- Diamond — high-value household/multi-asset tier with broader controlled benefits.

Every benefit records cost, expected utilisation, funding source, limits, capacity and abuse controls. True insurance remains separate under an approved insurer/partner.

---

# 9. MY ASSETS, VEHICLE HUB AND FLEET

My Assets is the canonical customer/business workspace for maintainable assets including vehicles, industrial/agricultural equipment, generators, pumps, compressors, solar/power, refrigeration/HVAC, workshop equipment, construction equipment and other approved assets.

Vehicle Hub is a vehicle-specialist projection of My Assets, not a competing vehicle database.

Dial Fleet Maintenance is a B2B maintenance-management service focused on preventive control, service coordination, procurement leverage, expenditure visibility and downtime reduction. Maintenance may be time-, mileage-, hours-, cycle- or condition-based.

---

# 10. DIAL A SPARE AND VISUAL/EPC ENGINE

Dial a Spare is a disclosed-agency parts marketplace.

Target chain:

```text
vehicle / asset context
→ catalogue + visual browse + search
→ fitment confidence
→ supplier offers / stock freshness
→ sourcing if needed
→ comparison
→ immutable quote + margin guard
→ allocation
→ PaymentIntent / Money Orchestrator
→ supplier confirmation
→ fulfilment
→ returns / warranty / resolution
→ asset history + quality feedback
```

Fitment is deterministic/evidence-backed and may not be invented by AI.

The visual transformation/EPC engine is a specialist navigation/experience system, not catalogue truth. Generated assets may assist navigation but may not invent authoritative part or fitment identity.

Current specialist implementation is substantial but production readiness still requires real catalogue injection, identity/fidelity gates, production IDs, direct EPC fallback, accessibility, provenance and complete customer-to-product evidence.

---

# 11. PRODUCT COMPARISON ENGINE

The Comprehensive Product Comparison Engine is a normative shared commerce capability across products, offers, vendors, compatibility, technical suitability, landed cost, warranty, returns, support, stock, delivery, vendor fulfilment, evidence and customer preferences.

Recommendations must be reconstructable from a versioned ComparisonSnapshot containing source data, offers, fulfilment, warranty, vendor metrics, preference weights, scoring version and evidence state.

Any score/badge/recommendation must be explainable. Scoring is category-specific, versioned and separates product quality from vendor performance. Paid placement cannot masquerade as analytical ranking.

Compatibility claims come from authorised structured evidence. AI may explain but not invent compatibility.

DIAL must not gain commercial advantage by unsupported allegations. Missing documentation, low price, a new seller, identifier mismatch or failed lookup do not automatically mean counterfeit/fake/fraudulent. Serious concerns route to moderation/compliance.

**Current state:** `CANON_LOCKED / IMPLEMENTATION_PLANNED` until its feature family/FRCs are injected into the live registries.

---

# 12. VISUAL INTELLIGENCE & ENTERPRISE DIGITAL TWIN FABRIC — VITF

VITF is a first-class horizontal DIAL capability combining canonical entity references, controlled relationship ontology, graph projections, visual perspectives, semantic zoom, graph/layout rendering, maps, charts, realtime projections, global search, KRF/RAG evidence, Comparison Engine outputs, controlled actions, audit, observability and certification.

VITF is a visual operating system over DIAL authorities. It is not a new SoR, generic graph database, dashboard framework, React Flow skin, AI diagram layer, 3D model or fourth business plane.

PostgreSQL/Supabase and owning domains remain authoritative. A graph database requires measured justification and still may not become parallel business truth.

Consequential visual actions follow identity/permission → current-state read → impact preview → reason → approval where required → typed idempotent command → owning domain → event → projection refresh → verification → audit.

Critical information must have nonvisual equivalents where applicable. Export is separately authorised.

VITF consumes the governed Comparison Engine rather than calculating a competing score.

**Current state:** `CANON_LOCKED / IMPLEMENTATION_PLANNED` until registry/FRC injection.

---

# 13. KNOWLEDGE, RAG, INTELLIGENCE AND AUTOMATION

DIAL AI is a business-performance and operating-intelligence platform, not a generic chatbot.

Use the simplest reliable method:

```text
deterministic rule / SQL / calculation
→ search / retrieval / ranking
→ statistics / forecasting / ML
→ optimisation / simulation
→ LLM / multimodal reasoning
→ agentic typed-tool use
```

AI context may combine live domain truth, governed RAG knowledge, analytics/intelligence and approved external/partner signals. A vector chunk can explain policy; it cannot prove that today’s payment settled.

AI may retrieve, classify, forecast, rank, explain, recommend, draft and propose. It may not directly set binding payable values, post journals, release funds, mutate beneficial ownership, mark payment/settlement successful, publish unsupported fitment, change owning-domain truth, grant/consume Care entitlements outside policy, waive safety/legal/compliance, or become a SoR.

Governed knowledge requires provenance, version/effective date, ACL/RLS, purpose/tenant scope, classification, review status, freshness and chunk lineage. Permission/effective-date filtering occurs before semantic ranking.

Every production AI capability requires quality, privacy, grounding, prompt-injection, latency, cost, fallback, KPI, counter-metric, staged rollout and post-release evaluation gates.

If AI/RAG fails, deterministic DIAL transactions continue and high-risk actions never fail open.

---

# 14. ORACLE + HERMES — DIAL RUNTIME CONTROL PLANE

Hermes on Oracle is DIAL runtime infrastructure. It is not DDE manager/worker orchestration and it does not replace DIAL domain authority.

Locked runtime order:

```text
1. GPT-5.6 Sol
2. Claude Sonnet 5
3. explicitly approved further Hermes fallback only
4. otherwise NO_HERMES_RUNTIME_AVAILABLE
```

Immediate invariant: **SOL → SONNET**.

Do not silently insert another Codex-plan model or Fable between Sol and Sonnet. Do not derive fallback order from global model inventory.

Preferred runtime mechanisms are GPT-5.6 Sol through the configured Codex App Server/ChatGPT subscription runtime and Claude Sonnet 5 through supported Claude Code subscription authentication.

Every selection preserves runtime, requested model, resolved model, provider/toolchain, health evidence, observation timestamp, reason and fallback state.

Hermes HOT/WARM/COLD and feature memory is non-authoritative and secret-free.

The existing draft Hermes branch contains substantial implementation but the router currently tries additional Codex-plan models before Sonnet. That behavior is `IMPLEMENTATION_CONFLICT` and must be corrected before runtime qualification.

Repository code presence, Oracle deployment and production qualification are separate claims.

---

# 15. LOGISTICS & DELIVERY

DIAL uses one shared Logistics OS and one shared delivery application across delivery-enabled business units. It covers readiness/preparation, driver queues, automatic assignment, durable reassignment, multi-stop optimisation, live location/ETA, pickup/delivery proof, photo/signature evidence, failed delivery, returns, cold-chain/special handling, temporary cross-BU driver deployment and customer-safe tracking.

Open-source mapping/routing baseline:

- MapLibre — rendering;
- Nominatim — geocoding;
- OSRM — routing/duration;
- VROOM — multi-stop optimisation.

DIAL does not require a paid maps API for the canonical design.

Order, payment, supplier confirmation, preparation, fulfilment, delivery and claim states remain separate.

---

# 16. COMMUNICATION FABRIC & SUPPORT

Customer channels are:

- DIAL System Inbox / in-app/web;
- official WhatsApp Cloud API / WhatsApp Flows;
- email;
- Econet Enterprise/A2P SMS.

Telerivet is retired.

Resend serves transactional/critical email; Brevo serves CRM/marketing journeys subject to preference/consent.

WhatsApp is a first-class channel but never a SoR. Chatwoot may provide human support conversation tooling but is not business-state authority.

---

# 17. COMMAND CENTRE & CORPORATE MANAGEMENT

Command Centre is a cross-DIAL projection, decision-support and controlled-action plane. It does not directly mutate domain truth.

Consequential actions route to the owning domain through typed commands, approvals/segregation of duties and audit.

Corporate Management remains horizontal across governed company operations such as people, finance, procurement, assets, IT, GRC/SHEQ and portfolio/board support where defined.

---

# 18. SECURITY, PRIVACY AND EVIDENCE

Security/privacy is a first-class realisation obligation for every material Feature ID.

Baseline includes authentication, server authorisation, relationship/capability scope, RLS, schema validation, concurrency/version control, audit, classification, retention/deletion, export controls, abuse controls, incident handling and negative tests.

Money, S4/security, sensitive-data, privileged-action and other configured high-risk features require independent specialist review before high gates.

Independent review means a separate execution context/actor that did not implement and cannot self-certify the same change. Claimed model names do not prove independence.

---

# 19. FEATURE REALISATION AND GATES

Feature counts are machine-derived volatile state. No durable canon prose may use a fixed feature count as the completeness boundary. `FEATURE_REGISTRY.json` is the live count authority.

Every material feature covers entry/discovery, input/validation, core workflow, detail/history, state-driven actions, eventuality/recovery, notification/support/human escalation, observability/audit/certification, security/privacy/abuse resistance, and knowledge/RAG/intelligence/automation opportunity plus authority/evaluation boundaries.

Gate lifecycle:

```text
SPECIFIED
→ MAPPED
→ CODE_PRESENT
→ DOMAIN_TESTED
→ INTEGRATION_GREEN
→ STAGING_GREEN
→ PRODUCTION_GREEN
→ CERTIFIED_DORMANT
→ ACTIVE
```

Orthogonal reconciliation statuses include `SUPERSEDED`, `IMPLEMENTATION_CONFLICT`, `RUNTIME_UNVERIFIED` and `EXTERNAL_ACTIVATION_BLOCKED`.

A screen is not feature completion. A package is not integration. A `200` response is not readiness. A unit test is not staging evidence.

---

# 20. CURRENT IMPLEMENTATION SNAPSHOT — 4 SEPTEMBER 2026

This section is effective-dated evidence, not permanent product authority.

Current default-branch evidence snapshot: `11933e9fbb00eb2f4686ad420a71007263de6a37`.

Current application roots are API, catalogue coverage, CLI, preview player and review UI. The intended broad Consumer, Business, supplier/admin, Command Centre, corporate, technician and delivery final product applications are not yet complete runtime products.

## 20.1 Spare/visual system

Substantial specialist code exists for image processing, line art, depth/CGI, explosion, hotspots, scene engine, technical rendering, identity lock, QA, packaging and catalogue coverage. No production catalogue is yet injected and current fidelity evidence is below the recorded production target.

Classification: `SUBSTANTIAL SPECIALIST ENGINE / NOT CUSTOMER-READY`.

## 20.2 Grocery Rounds

Real domain packages exist for Round agreement, plan/configuration, lifecycle, membership, ledger and legacy credit/entitlement logic. Evidence places GROC-F019, F020, F021, F022 and F024 at domain-tested/equivalent progress.

Because post-August governance supersedes material legacy behavior, these features do not inherit integration/staging readiness until contracts/code/tests are migrated to equal voting, current opt-out, current authorization/procurement authority, current terminology and current protection semantics.

Classification: `DOMAIN_IMPLEMENTED + CANON_MIGRATION REQUIRED`.

## 20.3 Payments, Care, Logistics, KRF, Comparison, VITF and broad business apps

Architecture/registry design is substantially ahead of production runtime breadth. Status must follow actual Feature Registry/evidence rather than document existence.

## 20.4 Oracle/Hermes

Draft branch `chore/hermes-codex-control-plane` contains substantial runtime/deployment/control-plane implementation but is unmerged, not production-qualified and has a fallback-order conflict.

Classification: `SUBSTANTIAL IMPLEMENTATION / DRAFT / IMPLEMENTATION_CONFLICT / RUNTIME_UNVERIFIED`.

---

# 21. EXPLICIT SUPERSESSION LOCKS

The following older doctrines are retired:

1. `Vanguduza/dial` as current implementation repository;
2. Dial Health as required current DIAL Main scope;
3. fixed prose feature counts such as 186 or 244 as completeness law;
4. Cash + EcoCash Direct + Paynow + ContiPay + PayPal as the canonical core marketplace provider set;
5. ordinary DIAL collection then later supplier payout as the marketplace default;
6. contribution/pool-credit-weighted Round voting;
7. initiator financial/procurement privilege;
8. legacy exit semantics that do not transfer uncommitted value to ordinary Groceries entitlement;
9. legacy `credit` wording as customer/domain truth;
10. a permanent 4% Round protection price;
11. historical tax/legal conclusions/rates as timeless product law;
12. Product Comparison as an optional UI table;
13. Digital Twin/dashboard work as a separate authority plane;
14. Hermes fallback inserting arbitrary Codex-plan models before Sonnet;
15. global model discovery silently becoming Hermes fallback;
16. DDE manager/worker architecture being treated as Dial architecture;
17. stale v2.1/v2.2 plan prose overriding current registries/evidence;
18. scorecard prose overriding machine state;
19. boilerplate contract generation used to game specificity metrics;
20. self-review satisfying independent review.

Git history remains provenance; superseded files must not remain in the active tree as competing authorities.

---

# 22. REQUIRED REPOSITORY INTEGRITY RULES

After adoption:

- `docs/dial/canon/DIAL_SOURCE_OF_TRUTH_MASTER_PLAN_v1.2.md` is the single top-level product/architecture source;
- `PROJECT_TRUTH.md` and `CLAUDE.md` are thin projections/engineering entrypoints and may not add product doctrine;
- the Decision Registry may contain only current decisions consistent with this master;
- machine scorecards report evidence, not product law;
- specialist documents are subordinate implementation detail and cannot self-promote to master/canon authority;
- superseded master plans, anchor indexes, prompts, archives and duplicate reference copies are removed from the active repository tree;
- canon-coherence verification fails if forbidden superseded paths reappear or engineering entry files stop pointing to this source.

---

# 23. DEVELOPMENT EXECUTION ORDER

## R0 — Canon Integrity

Adopt this source, remove competing authorities, repair Project Truth/engineering entry, replace stale manifest behavior with canon coherence, update current decisions and run exact-current-head verification.

## R1 — Reconcile Existing Rounds Implementation

Migrate weighted voting, exit behavior, authorization/procurement semantics, immutable cart semantics and terminology without discarding correct domain packages.

## R2 — Complete Grocery Rounds Vertical Slice

Prove customer entry → Round creation → terms → membership → entitlement → Round Room → equal voting → cart → discount → allocation → procurement → compliant payment integration where applicable → fulfilment/free delivery → support/eventualities → reconciliation → operator visibility → audit/evidence.

## R3 — Oracle/Hermes Qualification Lane

Run in parallel because deterministic commerce must not depend on AI runtime availability. Correct `Sol → Sonnet`, then qualify live identity, fallback, process recovery, reboot recovery and memory/checkpoint recovery.

## R4 — Shared Capability Injection

Register and implement Comparison Engine, VITF and current KRF/Command Centre deltas without duplicate authorities.

## R5 — Broader Vertical Expansion

Proceed dependency-first into Spare customer-ready integration, Tech, broader Groceries, Logistics, Care/My Assets, Fleet, Business and remaining current-scope branches.

Governance work is justified when it removes a concrete blocker, enforces a discovered failure mode or is required by the active feature. Otherwise the default work item advances an integrated runtime capability.

---

# 24. CONTRACT-FIRST WITHOUT GAMING

A Feature ID enters implementation only when its contract is specific enough to describe states, commands, queries, events, permissions, relationships, eventualities, evidence and feature-specific invariants.

Do not mass-generate superficial FRC variants. Improve specificity just ahead of active implementation.

---

# 25. STATUS VOCABULARY

Use status terms precisely:

- `CANON_LOCKED` — authoritative product/architecture decision;
- `SPECIFIED` — design/contract exists;
- `MAPPED` — dependencies/surfaces/contracts mapped;
- `CODE_PRESENT` — code exists but domain gate not proved;
- `DOMAIN_TESTED` — bounded domain behavior evidenced;
- `INTEGRATION_GREEN` — cross-component integration proved;
- `STAGING_GREEN` — staging workflow plus negative/eventuality/security evidence proved;
- `PRODUCTION_GREEN` — production gate evidence complete;
- `CERTIFIED_DORMANT` — technically complete but intentionally inactive;
- `ACTIVE` — live capability;
- `IMPLEMENTATION_CONFLICT` — code exists but conflicts with current canon;
- `RUNTIME_UNVERIFIED` — runtime implementation exists without current qualification;
- `EXTERNAL_ACTIVATION_BLOCKED` — build may proceed but activation awaits an external condition;
- `SUPERSEDED` — historical authority no longer governs.

Do not use “done”, “green” or “implemented” without the matching evidence class.

---

# 26. FINAL LOCKED SUMMARY

1. `Vanguduza/dial-new` is current DIAL Main implementation authority.
2. Dial Health/ZHOTN is outside current DIAL Main.
3. Shared domains own cross-platform truth.
4. Dial a Spare is agency-only for marketplace inventory.
5. Marketplace money follows a no-custody disclosed-agent architecture.
6. Pricing, Allocation, Payment Orchestration and Settlement/Reconciliation are separate.
7. Checkout price/allocation facts become immutable snapshots.
8. Every cent has an explicit owner/reason.
9. Appletree Hosted Checkout, ContiPay and ZimSwitch/acquiring bank are current first-class core marketplace routes.
10. Provider logic exists only in adapters.
11. Browser action is never authoritative payment evidence.
12. One shared Logistics OS/delivery app serves delivery-enabled branches.
13. Mapping/routing baseline is MapLibre + Nominatim + OSRM + VROOM.
14. Communication uses System Inbox, WhatsApp Cloud/Flows, email and Econet Enterprise/A2P SMS; Telerivet is retired.
15. My Assets is canonical across vehicle and non-vehicle maintainable assets.
16. Vehicle Hub is a vehicle projection of My Assets.
17. Care is cross-domain, entitlement-based and economically controlled.
18. Active qualifying Round members receive Care Silver Access.
19. Grocery Rounds are prepaid grocery commerce, never savings/wallet/investment.
20. Every eligible active Round member has one equal vote regardless of contribution.
21. Round initiators have no treasury/procurement privilege.
22. Uncommitted value from lawful opt-out transfers to ordinary Groceries entitlement.
23. Valid collective state, not a person, authorises final procurement.
24. Round discounts are separate from voting and never affect vote weight.
25. Product Comparison is shared, evidence-based, explainable and vendor-neutral.
26. DIAL does not automatically label competing products counterfeit/fake/fraudulent from heuristics.
27. VITF is a horizontal visual/digital-twin projection fabric, not a SoR.
28. KRF/RAG never substitutes for live transactional truth.
29. AI is non-authoritative for money, fitment, safety, compliance and canonical state.
30. Hermes on Oracle belongs to DIAL, not DDE.
31. Hermes priority is GPT-5.6 Sol → Claude Sonnet 5 → explicitly approved further fallback only.
32. No arbitrary Codex/Fable/global-inventory insertion may silently alter Hermes fallback.
33. Hermes memory is non-authoritative and secret-free.
34. Current Hermes draft is substantial but not production-qualified until fallback conflict and live qualification are closed.
35. Feature counts are dynamic machine state, not permanent prose authority.
36. Feature completion requires evidence through the gate ladder.
37. Independent specialist review cannot be self-certified.
38. Existing Rounds packages must migrate to democratic governance before higher readiness.
39. Correct existing DIAL code is preserved; reconciliation is controlled migration, not restart.
40. After canon integrity is green, development continues through integrated vertical delivery, starting with Rounds while Hermes qualification proceeds in parallel.

---

# 27. FINAL NORTH STAR

> **DIAL is one governed operating ecosystem with many business experiences, not many disconnected applications. Its domains own truth; its shared kernel owns cross-platform consistency; its money architecture avoids unnecessary custody; its Grocery Rounds preserve individual entitlement and equal democratic governance; its Comparison Engine explains rather than attacks; its Visual Intelligence fabric makes the enterprise understandable without creating another source of truth; its AI and Hermes runtime assist rather than rule; and its engineering system may only claim what current evidence proves.**
