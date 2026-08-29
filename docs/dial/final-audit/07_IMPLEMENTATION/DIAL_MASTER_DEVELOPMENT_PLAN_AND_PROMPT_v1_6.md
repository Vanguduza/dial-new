# DIAL Master Development Plan & Execution Prompt — v1.6

**Status:** CANONICAL DEVELOPMENT EXECUTION PROMPT  
**Purpose:** Turn the audited DIAL architecture into one coherent production software environment without research drift, context drift, duplicate systems of record or silent scope loss.  
**Repository target:** `Vanguduza/dial`  
**Baseline audit pack:** DIAL Final 360° Ecosystem Audit & Development System v1.6  
**Feature registry:** 186 seeded top-level Feature IDs at this baseline.

> This entire document is intentionally written so it can be supplied directly to Claude Code, Cursor or another principal coding agent as the **master development instruction**.  
> Do not interpret dependency order as an MVP or permission to omit later capabilities.

---

# 0. MASTER INSTRUCTION

Act as the **Principal DIAL Software Architect, Lead Full-Stack Engineer, Platform Engineer, Security Engineer, Data Architect, Test Architect, Release Engineer and Development Coordinator**.

Your responsibility is to implement the complete DIAL platform in the existing repository while preserving the locked architecture and avoiding duplicate infrastructure or context drift.

You are not being asked to redesign DIAL.

You must:

1. inspect the actual repository before changing code;
2. treat the audited DIAL canon and machine registries as architectural authority;
3. resolve work through Feature IDs and Feature Realization Contracts;
4. reuse shared DIAL capabilities rather than rebuilding them inside divisions;
5. assimilate donor code according to the locked donor mode;
6. implement happy paths and material eventualities;
7. prove changes with fresh tests/evidence;
8. keep the Command Centre development projection truthful;
9. update durable project context only when evidence supports the change;
10. stop and surface a contradiction when two authoritative locks cannot both be satisfied.

Never equate a planning document with implemented code.

---

# 1. PRODUCT MISSION

DIAL is one operating platform supporting multiple customer-facing business divisions and the internal operation of DIAL as a company.

The production architecture must remain recognizably one platform:

```text
                                      DIAL
                                       │
              ┌────────────────────────┼─────────────────────────┐
              │                        │                         │
        BUSINESS DIVISIONS       CORPORATE OS            COMMAND CENTRE
              │                        │                         │
 Spare · Tech · Groceries       People · Payroll          Market control
 Laundry · Fleet · Hub          Finance · FP&A            Company control
 Care · Assist · Projects       Procurement · WMS         Development control
 Dial Health/ZHOTN              Assets · GRC · IT         Intelligence
              │                        │                         │
              └────────────────────────┼─────────────────────────┘
                                       │
                                  DIAL KERNEL
                                       │
 Party · Identity · Organisation · Permissions · Evidence · Events
 Catalogue · Fitment · Pricing · Orders · Jobs · Delivery · Payments
 Ledger · Tax · FX · Resolution · Trust · Compliance · Notifications
 Search · Workflow · Analytics · AI · Simulation
```

No division is permitted to become an independent application with its own duplicate identity, payment, ledger, delivery, evidence or resolution architecture.

---

# 2. SOURCE AUTHORITY

When sources disagree, use this order:

1. `agent-system/canon/PROJECT_TRUTH.md`
2. approved machine registries in `agent-system/registries/`
3. this Master Development Plan and the final audit master
4. current division/shared-system audit or approved FRC
5. current locked specialist architecture:
   - Corporate Management OS v1.1
   - Dial Health/ZHOTN authoritative specialist master
   - Command Centre v2.2+ corrected architecture
6. approved evidence/gate records
7. donor dossiers/research
8. historical architecture documents
9. implementation inference

Historical documents do not regain authority merely because they contain more detail.

When a historical document conflicts with a later locked decision, record it as superseded rather than trying to compromise between them.

---

# 3. HARD ARCHITECTURAL LOCKS

These are not suggestions.

## 3.1 Core platform

- one canonical Party/Identity graph;
- one Organisation/corporate structure model;
- one canonical DIAL Ledger;
- one Delivery system of record;
- one RCE case model;
- one Customer 360;
- one supplier/provider relationship graph;
- one Catalogue/Fitment authority;
- one Evidence/Audit model;
- one event envelope/outbox convention;
- one branch/capability activation model;
- one Command Centre read/decision/control plane.

## 3.2 Money

- AI never determines a binding payable amount;
- AI never posts journals or releases funds;
- payment state and ledger state are not inferred from UI or provider HTTP success;
- every material money command is idempotent;
- refunds/reversals/callback duplicates/reconciliation are first-class;
- historical posted accounting is corrected through controlled reversal/adjustment, not mutation.

## 3.3 Spare

- agency-only commercial model;
- do not restore the superseded D-51 owned-stock principal model;
- internal Corporate WMS stock does not become Dial a Spare marketplace stock.

## 3.4 Tech

- hybrid direct booking + Opportunity Marketplace;
- technicians may express interest/propose without pay-to-bid ranking at launch;
- FixItNow is a **PORT-WHOLESALE donor using the MIT-licensed `Sachinrajawat/FixItNow` publication**;
- import/pin provenance, preserve MIT notice, then replace donor identity/database/payment/job authority with DIAL;
- add DIAL-specific Opportunity Marketplace, Job Reserve, safety, WHT, evidence, RCE and Command Centre functionality.

## 3.5 Health

- Dial Health/ZHOTN is a **required standalone DIAL division**;
- it is not Corporate Management, Tech or an optional future portfolio item;
- health-specific clinical, pharmacy, funder, emergency, consent, interoperability, regulatory and safety authorities remain in Dial Health bounded contexts;
- shared DIAL primitives are consumed through explicit anti-corruption contracts;
- ordinary DIAL integration certification never substitutes for healthcare-specific safety/regulatory certification.

## 3.6 Communications / maps / delivery

- official WhatsApp Cloud API/Flows only;
- MapLibre is the map-rendering layer;
- approved geocoding/routing/optimisation stack remains Nominatim/OSRM/VROOM unless a later locked decision replaces it;
- Delivery owns delivery jobs and authoritative dispatch state.

## 3.7 AI / simulation

- AI output must separate fact, inference and recommendation;
- evidence/freshness accompanies consequential AI insight;
- AI cannot waive safety/compliance/liability;
- simulation has no production mutation path.

## 3.8 UI

- no generic "AI-looking" production UI;
- DIAL Command Design System is final appearance authority;
- operator-facing records use human-readable references such as `JOB-`, `ORD-`, `PO-`, `EMP-`, `CASE-`;
- internal UUIDs may remain database keys;
- loading, empty, error, permission, stale and degraded states are part of implementation.

## 3.9 Evidence

- historical evidence is provenance;
- a new repository/tree/schema cannot inherit a historical green gate without the applicable migration regression revalidation;
- E6a Command Centre does not receive a synthetic historical green.

---

# 4. REQUIRED PRODUCT SCOPE

The target includes all of the following. Do not silently remove a division because another is being developed first.

## Customer/business divisions

### Dial a Spare
Vehicle context, catalogue/fitment, part search, supplier offers, sourcing requests, comparison, pricing/promotions, checkout/payment/fiscal, supplier fulfilment, delivery/pickup, returns/warranty/refunds, quality/counterfeit, supplier portal, WhatsApp and Vehicle Hub history.

### Dial a Tech
Trade/JobClass, guided intake, direct booking, Opportunity Marketplace, eligibility/matching, proposals, award, diagnosis/quote, Job Reserve, dispatch, technician Android/offline execution, HIRA/PPE/LOTO/SOP, evidence, scope variation, team jobs, completion, WHT/settlement, workmanship claims, technician quality and trust.

### Dial Groceries
Store catalogue/availability, slots, variable measure, OrderGroup/SubOrders, merchant pick, DIAL shopper, substitutions, produce preferences, final total approval, click & collect, delivery/cold chain, My Pantry, Scheduled Basket, beneficiary orders, restricted goods, recall/food safety, resolution and merchant reconciliation.

### Dial Laundry
Service catalogue, estimate/max approval, pickup custody, facility intake, weigh/itemize/inspect, care labels, final pricing, load planning, process/machines, QC/rewash, rack assembly, return custody, claims, subscriptions, commercial manifests, healthcare segregation, facility capacity and environmental compliance.

### Dial Fleet
Fleet/org hierarchy, vehicle assignment, odometer/usage, maintenance plans, defects, service/parts orchestration, inspections, vehicle documents, downtime, TCO/cost centres, provider quality, optional telematics and B2B reporting.

### Vehicle Hub
Canonical vehicle identity, VIN/chassis/variant facts, ownership/org relationships, documents, mileage, service/part/incident history, reminders, Care eligibility, conflict/merge, delegated access and history export.

### Dial Care
Plan catalogue, eligibility, membership, recurring billing, entitlement ledger, reminders, Tech/Assist/Spare benefit use, grace/suspension, renewal/cancellation, abuse controls, benefit economics and partner benefits.

### Dial Assist
Incident intake, incident-scoped location, coverage, safety triage, provider matching, towing/roadside dispatch, routing/ETA, emergency referral, arrival, proof, payments/entitlements, fallback, claims, SLA/quality, degraded communications and Vehicle Hub incident history.

### DIAL Projects
Request, assessment, scope/BoQ/quote, project, team/PM, milestones, dependencies/critical path, materials, budget/commitments/EAC, progressive funding, variations, safety/quality, evidence/progress, client visibility, handover and disputes.

### Dial Health / ZHOTN
Implement according to the existing specialist Health master, including the Main DIAL bridge for My Health, Practice OS, Pharmacy OS, Hospital OS, Transaction Network, Pharma Cloud, Emergency Network, Communication Gateway, Developer Platform, identity/consent, interoperability, prescriptions, medicine fulfilment, funder/claim handling, appointments/referrals, medicine delivery and health safety/compliance.

## Corporate Management OS

Implement the full Corporate Management architecture:
- organisation, positions and cost centres;
- recruitment;
- onboarding/JML;
- workforce/attendance/timesheets;
- leave;
- performance/learning;
- compensation/payroll;
- Zimbabwe statutory rules;
- accounting/AP/AR;
- FP&A;
- treasury;
- procurement/vendor management;
- internal inventory/WMS;
- assets/facilities;
- corporate IT/ITSM;
- contracts/e-sign/records;
- GRC/internal audit;
- strategy/board/portfolio;
- SHEQ/continuity;
- DoA/SoD/access review.

---

# 5. SHARED PLATFORM SYSTEMS

The following are shared products, not incidental helpers:

- Identity / Party / Organisations
- Customer 360
- Engagement / CRM
- Supplier OS
- Technician OS
- Catalogue Factory / Fitment
- Pricing / Promotions
- Orders
- Jobs / Trades / JobClass
- Delivery
- Payments
- Ledger
- Tax / FX
- Treasury
- Evidence / Audit
- Resolution & Conflict Engine
- Claims
- Provider Quality
- Trust / Guarantee
- Network / Liquidity
- Compliance
- Partners / Contracts
- Search
- Notifications / WhatsApp
- Analytics
- Observability
- AI / Intelligence
- Commercial Simulation
- Experiments
- Improvement / CAPA
- Development / Certification
- Command Centre

When two divisions require the same horizontal capability, extend the shared capability rather than creating branch-specific duplicates unless the specialist semantics genuinely differ.

---

# 6. DEVELOPMENT BOOTSTRAP — MUST HAPPEN FIRST

The first engineering changeset is development infrastructure, not customer UI.

## 6.1 Apply the development harness

Apply through a reviewed branch:

```text
CLAUDE.md
agent-system/
  canon/
  registries/
  bin/
  hooks/
  evals/
.claude/
  settings.json
  rules/
  skills/
  agents/
```

Use the ready-to-copy files in this pack as the bootstrap source.

Do not enable `.mcp.json.example` until the DIAL Truth MCP server is implemented and tested.

## 6.2 Establish machine Project Truth

Populate and validate:

- `FEATURE_REGISTRY.json`
- `DECISION_LOG.json`
- `DONOR_REGISTRY.json`
- `EVIDENCE_INDEX.json`
- `RESEARCH_REGISTRY.json`
- `MODULE_INDEX.json`
- `ACTIVE_WORK.json`

The registry is not decorative documentation. Development status is generated from it.

## 6.3 Clean stale active context

Before scaling feature work, remove/mark superseded active instructions for:
- D-51 owned-stock/principal Spare;
- stale FixItNow licence quarantine;
- Dial Health optional/portfolio-candidate status;
- old phased Command Centre target;
- old gate-inheritance wording.

Run `agent:drift-check`.

## 6.4 Claude Code validation

Validate:
- `/doctor`
- `/memory`
- `/skills`
- `/agents`
- `/hooks`
- `/mcp`
- `/permissions`
- fixed harness evals.

## 6.5 DIAL Truth MCP

Implement a small read-only MCP after the file-based context system works.

Allowed tools:
- `get_feature`
- `get_decision`
- `get_module`
- `get_donor`
- `get_evidence`
- `search_canon`

Keep output bounded/paginated.

No production database/payment write tools.

---

# 7. FEATURE-DRIVEN DEVELOPMENT METHOD

Every material development task starts with a registered Feature ID.

Example:

```text
TECH-F012 — HIRA/PPE/LOTO/SOP
GROC-F007 — Substitutions
LAUN-F010 — Laundry QC
FLEET-F006 — Defect reporting
CORP-F013 — Internal Inventory/WMS
HEALTH-F012 — Prescription lifecycle
```

Run:

```bash
node agent-system/bin/context-get.mjs <FEATURE_ID>
```

Then inspect the actual repository.

## Status lifecycle

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

Never skip a status solely because the agent is confident.

---

# 8. FEATURE REALIZATION CONTRACT

Before material implementation, the Feature ID must resolve to:

```yaml
feature_id:
module:
user_outcome:

actors:
entry_points:
screens:

domain_owner:
aggregate:
state_machine:

commands:
queries:
data:
events:

permissions:
approval_or_policy:

money_effect:
inventory_effect:
delivery_effect:

integrations:
offline_degraded:

security_privacy:
eventualities:

observability:
command_centre:
ai_authority:

donor_records:
tests:
evidence:
current_gate:
```

If a required field is unresolved, either resolve it from canon/current code or create a targeted design decision. Do not invent a hidden assumption.

---



---

# 8A. MANDATORY FINAL REALIZATION LAYER

The 186 Feature IDs are not a complete implementation checklist by themselves.

Before implementing or certifying a Feature ID, load:

- `11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json`
- `11_FEATURE_REALIZATION/SUBFEATURE_FUNCTION_REGISTRY.json`
- `11_FEATURE_REALIZATION/SUPPORTING_CAPABILITY_REGISTRY.json`
- `11_FEATURE_REALIZATION/EVENTUALITY_PLAYBOOK_REGISTRY.json`
- `11_FEATURE_REALIZATION/DONOR_REGISTRY.json`
- `12_CLIENT_EXPERIENCE/CUSTOMER_ENDPOINT_REGISTRY.json`

Every parent feature has nine required realization facets:

1. entry/discovery;
2. input/validation;
3. core workflow;
4. detail/history;
5. state-driven actions;
6. eventuality/recovery;
7. notifications/support/human escalation;
8. observability/audit/certification;
9. security/privacy/abuse resistance.

A parent feature cannot advance beyond DOMAIN_TESTED simply because its happy path exists.

Customer-facing work must satisfy the Client App Architecture and Customer Service OS.

Spare visual browsing must satisfy the EPC + Vehicle Visual Transformation Integration Contract. The detailed parallel EPC/visual specialist document may refine internals but must plug into the frozen DIAL catalogue/vehicle/fitment/asset boundaries.


# 9. EVENTUALITY IMPLEMENTATION

Apply the global Eventuality Standard.

A material feature considers applicable:

- missing/malformed/ambiguous input;
- identity/session/permission;
- eligibility;
- replay/duplicate/concurrency;
- capacity;
- partial completion;
- timeout;
- cancellation;
- substitution/replacement;
- quantity/weight/scope/price/FX/tax variation;
- payment/refund/reversal;
- no-show/failed handoff;
- safety/compliance;
- trust/fraud;
- evidence conflict;
- dependency outage;
- offline/reconnect;
- complaint/claim/appeal;
- accounting/reconciliation;
- data correction/merge;
- operator recovery;
- privacy/retention/legal hold;
- continuity.

Every material eventuality gets:
condition, detection, state, command, transition, side effects, owner, evidence, compensation/recovery and test.

---

# 10. CANONICAL TECHNICAL PLATFORM

Unless a later approved decision changes it, build on the locked architecture:

## Monorepo
- pnpm workspaces
- Turborepo
- Node 20 LTS+
- TypeScript strict

## Web
- Next.js App Router
- Tailwind CSS 4
- shadcn/ui / DIAL design system
- Refine Core only where headless operational resource plumbing is useful

## Data
- PostgreSQL/Supabase
- Supabase Auth
- RLS
- S3-compatible object storage
- Meilisearch projections

## Work
- Redis/BullMQ for bounded queues
- Temporal for durable long-running/stateful workflows

## Messaging / support / engagement
- official WhatsApp Cloud API / Flows
- Chatwoot where human support is appropriate
- n8n for non-authoritative automation
- PostHog for analytics/flags
- Formbricks for survey/outcome collection

## Geo / delivery
- MapLibre
- Nominatim
- OSRM
- VROOM

## AI
- LiteLLM
- approved API/local model routing
- Promptfoo
- Langfuse

## BI / observability
- Metabase
- OpenTelemetry Collector
- Prometheus
- Loki
- Tempo
- Grafana

---

# 11. REPOSITORY OWNERSHIP AND PACKAGE BOUNDARIES

The codebase must make domain ownership obvious.

A package may call another domain through a public contract. It may not reach through and mutate the other domain's persistence.

Architecture tests must eventually enforce rules such as:

- only Ledger writes journal tables;
- only Delivery writes delivery-job truth;
- only Payroll writes payroll results;
- only Corporate Inventory writes internal inventory movements;
- only People writes employment;
- Command Centre never imports domain persistence repositories;
- AI packages cannot import payment execution;
- donor runtime persistence is never authoritative.

Use interfaces/events rather than circular package knowledge.

---

# 12. DOMAIN EVENTS AND OUTBOX

Use one event envelope:

```ts
type DomainEvent<T> = {
  eventId: string
  eventType: string
  aggregateType: string
  aggregateId: string
  aggregateVersion: number
  schemaVersion: number
  occurredAt: string
  emittedAt: string
  correlationId: string
  causationId?: string
  actor: ActorRef
  payload: T
}
```

Rules:
- transaction + outbox atomically;
- idempotent consumers;
- versioned schemas;
- dead-letter/operator replay;
- no business truth hidden only in a queue payload.

---

# 13. COMMAND / CONCURRENCY MODEL

Material state transitions use typed commands.

```ts
type Command<T> = {
  commandId: string
  commandType: string
  targetRef: string
  expectedVersion?: number
  idempotencyKey: string
  correlationId: string
  actor: ActorRef
  reason?: string
  payload: T
}
```

Use optimistic concurrency for material aggregates.

Do not implement arbitrary UI status dropdowns that bypass state machines.

---

# 14. MONEY / LEDGER IMPLEMENTATION

Money-affecting FRCs must explicitly document:

```text
source document
calculation authority
quote/version
tax treatment
FX source/version
authorization
capture
settlement
accounting event
debit/credit mapping
refund/reversal
reconciliation
failure/unknown state
```

The Ledger verifies balanced double-entry and idempotency.

Payment provider success is confirmed by authoritative provider state/reconciliation, not merely request success.

---

# 15. DONOR ASSIMILATION

Read the Global Donor Assimilation Registry before donor work.

Allowed modes:
- PORT-WHOLESALE-QUARANTINE
- PORT-WHOLESALE
- PORT-SELECTED-MODULE
- PORT-ALGORITHM-ENGINE
- PORT-SCHEMA-WORKFLOW
- PORT-UX-UI
- LIBRARY
- INTEGRATE-SERVICE
- EXTERNAL-ADAPTER
- REFERENCE
- CONFORMANCE-REFERENCE

## Required donor record

```yaml
donor_id:
repository:
revision:
license:
source_paths:
adoption_mode:
feature_ids:

dial_target:
  package:
  aggregate:

boundaries_replaced:
  auth:
  persistence:
  money:
  workflow:
  audit:

parity:
  donor_tests:
  dial_tests:
  accepted_differences:
```

Never copy production donor code without provenance.

Never automatically merge donor upstream releases.

## FixItNow

Use:
`Sachinrajawat/FixItNow`

Classification:
- MIT
- PORT-WHOLESALE

The purpose is to preserve as much proven Tech application structure and UX as is valuable while surgically replacing its system-of-record boundaries with DIAL.

---

# 16. USER EXPERIENCE DEVELOPMENT

## One DIAL experience

The interface must look coherent even when donor patterns come from different products.

### Command Centre
Appearance hierarchy:
DIAL Command Design System → Studio Admin visual donor → shadcn/ui primitives → Tremor Raw analytics → selective secondary donors.

### Division apps
Use their approved donors as design/workflow evidence but retokenize/restructure into DIAL.

### Operator UI
Prefer:
- queues;
- dense readable tables;
- clear states;
- maps only when geography matters;
- timelines for workflow/evidence;
- charts for trends;
- short human refs.

Avoid endless generic cards.

## Visual completion
A screen is not finished until:
- real or realistic contract-shaped data exists;
- responsive layout works;
- empty/loading/error/permission/degraded states exist;
- keyboard/accessibility basics work;
- visual regression/evaluator passes where material.

---

# 17. ANDROID / MOBILE

## Command Centre Android
Native Kotlin/Compose shell + hardened WebView around authoritative Command Centre web.

Android owns:
- adaptive shell;
- device security;
- biometrics/passkeys;
- push;
- deep links;
- scanner/camera/files;
- offline incident snapshots.

It does not duplicate business authority.

## Technician / courier / warehouse
Use native Android where locked/operationally justified.

Offline operations need:
- explicit local state;
- sync protocol;
- idempotency;
- conflict policy;
- clear stale/degraded status;
- no hidden queued high-risk money operation.

---

# 18. CORPORATE MANAGEMENT IMPLEMENTATION

Use Corporate Management OS v1.1 as the specialist canon.

Critical cross-domain proofs:

### Hire-to-pay
recruitment → employee → access → time/leave → payroll → ledger → payment → reconciliation.

### Procure-to-pay
requisition → sourcing → PO → receipt/service acceptance → invoice match → AP → payment → reconciliation.

### Buy-to-stock-to-expense
PO → receipt → inventory movement/valuation → issue/consume → GL.

### Buy-to-asset
PO → receipt → capitalization → custody → depreciation → disposal → GL.

### Joiner-mover-leaver
employment → permissions/assets → change → access recalculation → exit → revocation/recovery/final pay.

### Risk-to-CAPA
risk → control → test → finding → CAPA → effectiveness.

DoA/SoD negative tests are mandatory.

---

# 19. DIAL HEALTH IMPLEMENTATION

Treat Dial Health as a peer specialist bounded context.

Before implementation of a Health Feature ID:
1. retrieve Main DIAL Feature record;
2. retrieve the applicable Health specialist architecture section;
3. resolve which shared DIAL primitives are reused;
4. create anti-corruption interface contracts;
5. apply health-specific safety/privacy/regulatory gates;
6. do not flatten clinical semantics into generic DIAL job/order objects unless explicitly designed as an adapter.

Health certification remains independent where clinical/pharmacy/funder/regulatory correctness is consequential.

---

# 20. COMMAND CENTRE DEVELOPMENT

Build the Command Centre early and continuously, but never fabricate operational truth.

## It is a projection/control plane

```text
domain transaction
→ outbox/event
→ projection
→ Command Centre read model
→ metric/alert/decision/control UI
```

## Required room inventory

Enterprise + every business division + shared platform systems + Corporate Management.

Dial Health receives a standalone Health room.

## Control action

```text
click
→ permission
→ current-state read
→ impact preview
→ reason
→ approval/four-eyes if required
→ idempotent typed command
→ owning domain
→ event
→ projection refresh
→ verification
→ audit
```

No Command Centre direct business-table mutation.

---

# 21. DEVELOPMENT CONTROL ROOM

The Command Centre Development room should eventually project:

- Feature ID;
- module;
- current status/gate;
- repository path;
- PR/commit;
- CI state;
- security findings;
- donor parity;
- unresolved blockers;
- evidence refs;
- deployment;
- incidents/regressions.

The feature registry is the planning/implementation join key.

---

# 22. AI DEVELOPMENT

AI capabilities are implemented only after deterministic boundaries exist.

Every AI feature declares:
- allowed data;
- tool calls;
- permission scope;
- prompt/model version;
- evaluation suite;
- fallback/degraded behavior;
- whether output is fact/inference/recommendation;
- human decision point.

AI failure must not disable deterministic transactional operation.

---

# 23. RESEARCH CONTROL

Do not restart broad research during implementation.

Check `RESEARCH_REGISTRY.json`.

Research is triggered only by:
- unmapped donor behavior required by active feature;
- upstream revision/security change;
- current regulation/provider API change;
- test failure exposing unknown behavior;
- genuine architecture contradiction.

Ordinary feature research budget:
- one primary source;
- up to two corroborating sources;
- official consequential source if needed.

Strategic QDRS maximum:
- two deep investigations active simultaneously.

Every research task must name the Feature ID/decision it unlocks.

---

# 24. CLAUDE CODE / AGENT EXECUTION MODEL

## Main development agent
Owns one coherent changeset.

## Subagents
Use for noisy exploration/reviews:
- context librarian;
- repo cartographer;
- domain auditor;
- money reviewer;
- security reviewer;
- UI evaluator;
- test certifier;
- donor archaeologist;
- migration revalidator.

Do not use permanent multi-agent swarms for routine CRUD.

## Worktrees
Use isolated worktrees only when modules have clean ownership and do not modify contested shared contracts.

## Hooks
Use the approved standard profile for normal work.

No hook may silently modify canonical product decisions.

---

# 25. IN-PROJECT PROMPT FORMAT

Preferred task invocation:

```text
FEATURE: <FEATURE_ID>
OUTCOME: <user/business outcome>
SCOPE: <allowed packages/apps>
TARGET_GATE: <desired status>
SPECIAL_TRIGGER: <money/security/UI/donor/health/etc if applicable>

Execute the DIAL Feature Realization loop.
Retrieve JIT context.
Inspect current repository state.
Do not assume planning equals implementation.
Do not change locked architecture without surfacing a contradiction.
```

Do not use giant free-form requests that make the agent rediscover the whole platform.

---

# 26. IMPLEMENTATION WORKSTREAMS

These are full-target workstreams and may overlap only after dependencies are stable.

## WS-A — Agent system / Project Truth

Deliver:
- harness;
- registries;
- drift tests;
- context retrieval;
- DIAL Truth MCP;
- first harness certification.

Exit:
one Feature ID can be developed end-to-end with accurate bounded context.

## WS-B — Kernel

Deliver:
- Party;
- Identity/Auth;
- Organisation;
- permissions/RLS;
- human refs;
- Evidence/Audit;
- event/outbox;
- idempotency;
- optimistic concurrency;
- DoA/SoD;
- documents/object references.

## WS-C — Money & commercial spine

Deliver:
- Pricing/Promotions;
- Payments;
- Ledger;
- Tax;
- FX;
- Treasury adapters;
- money tests/property tests.

## WS-D — Catalogue / vehicle / search

Deliver:
- Catalogue Factory;
- product/part models;
- fitment;
- vehicle canonical model;
- Meilisearch;
- ingest/provenance;
- fitment confidence/evidence.

## WS-E — Orders / Jobs / Projects primitives

Deliver:
- Orders;
- JobClass/Trades;
- Jobs;
- Booking;
- Opportunity Marketplace primitives;
- quote/variation;
- project/milestone foundations.

## WS-F — Delivery / network / provider

Deliver:
- Delivery SoR;
- geo/routing;
- supplier/technician/provider relationship models;
- Network/Liquidity;
- Provider Quality;
- Trust;
- Compliance;
- Partner contracts.

## WS-G — Customer / engagement / resolution

Deliver:
- Customer 360;
- household/B2B relationships;
- engagement/journeys/preferences;
- RCE;
- Claims;
- Guarantee.

## WS-H — Business divisions

Implement all business division Feature IDs against shared contracts.

Recommended parallel streams after shared contracts:
- Commerce: Spare + Groceries + Laundry;
- Services: Tech + Projects + Assist;
- Vehicle lifecycle: Fleet + Vehicle Hub + Care;
- Health: Dial Health specialist team.

Cross-stream shared contracts remain centrally reviewed.

## WS-I — Corporate Management

Implement Corporate OS using the same kernel and money/evidence primitives.

## WS-J — Command Centre

Implement web Command Centre, control rooms, corporate rooms, health room and Android wrapper continuously as domains become real.

## WS-K — Intelligence / simulation / experimentation

Implement governed AI, commercial simulation, forecasts and experiments after stable telemetry/domain truth.

## WS-L — certification / activation

Full cross-domain, resilience, security, migration and operational certification.

---

# 27. INITIAL REPOSITORY BACKLOG

Execute the following before uncontrolled feature parallelism.

## Bootstrap batch

1. Create development branch/worktree for harness.
2. Apply `CLAUDE.md`.
3. Apply `agent-system`.
4. Apply `.claude/settings/rules/skills/agents`.
5. Add package scripts for context/drift/coverage.
6. Run drift checker.
7. Remove/mark stale D-51 instructions.
8. Correct stale FixItNow references.
9. Add Health as required standalone module everywhere.
10. Mark old Command Centre phased target superseded.
11. Correct evidence-inheritance statements.
12. Run harness eval set.
13. Map existing repository code to Feature Registry.
14. Mark features only to the highest evidence-proven status.
15. Implement DIAL Truth MCP.
16. Re-run harness certification.

## Kernel batch

17. Audit existing Identity/Party implementation.
18. Freeze/publicize domain contract package conventions.
19. Finalize human-reference service.
20. Finalize event envelope/outbox.
21. Finalize idempotency utilities.
22. Finalize Evidence/Audit interfaces.
23. Finalize permissions/RLS test harness.
24. Finalize DoA/SoD primitives.
25. Add architecture fitness tests.

## Transactional spine batch

26. Validate Pricing/Promotions against locks.
27. Implement/complete Payments.
28. Implement/complete Ledger.
29. Implement Tax/FX interfaces.
30. Implement Catalogue/Fitment/Vehicle contracts.
31. Implement Orders.
32. Implement Jobs/JobClass/Trades.
33. Implement Delivery SoR.
34. Implement RCE/Claims baseline.
35. Run first shared cross-domain transaction tests.

Only then scale multiple division worktrees aggressively.

---

# 28. TEST STRATEGY

Every material feature gets the smallest adequate test pyramid.

## Unit
deterministic rules, calculations, invariants.

## Property/invariant
money, inventory, state transitions, identifiers.

## Integration
database, outbox, RLS, adapters.

## Contract
events, external providers, internal APIs.

## E2E
critical user/business paths.

## Visual/accessibility
material UI.

## Security
IDOR/RLS/privilege/webhook/upload/secret.

## Resilience
provider timeout, worker failure, replay, stale projection, recovery.

## Migration revalidation
required whenever inherited evidence is applied to materially changed tree/schema.

---

# 29. MANDATORY CROSS-DOMAIN CERTIFICATION JOURNEYS

At minimum:

1. Spare:
vehicle → fitment → supplier offer → price → payment → delivery → return/refund → Vehicle Hub.

2. Tech:
intake → direct booking/opportunity → proposal/award → diagnosis → reserve → safety → execution → completion → WHT/payout → claim.

3. Groceries:
cart → merchant suborders → picking → substitution → variable-measure finalization → capture → delivery → Pantry → issue/recall.

4. Laundry:
estimate → pickup custody → facility → inspect → final price → process → QC → return custody → claim.

5. Fleet:
defect → downtime → Tech/Spare → completion → cost → Vehicle Hub history.

6. Care:
membership → entitlement → benefit use through Tech/Assist/Spare → accounting → renewal.

7. Assist:
incident → safety/location → provider dispatch → proof → payment/entitlement → claim → Vehicle Hub.

8. Projects:
assessment → scope → team → material → milestones → progressive funding → variation → handover/claim.

9. Health:
patient/provider/pharmacy/funder/emergency workflows through specialist Health safety/regulatory gates.

10. Corporate:
hire → pay;
requisition → pay;
buy → stock → consume;
buy → asset → depreciate/dispose;
risk → control → CAPA;
joiner → mover → leaver.

11. Development:
commit/release → Command Centre development projection → deployment → operational metric/incident correlation.

---

# 30. SECURITY BASELINE

For every public/server action:
- authenticate server-side;
- derive actor identity server-side;
- authorize permission + scope;
- enforce RLS/database constraints;
- validate input;
- enforce state/version;
- apply approval/SoD if consequential;
- audit;
- never expose service role to clients.

Mandatory negative tests:
- IDOR;
- role escalation;
- scope escape;
- self-approval;
- webhook replay;
- duplicate command;
- stale state;
- secret exposure;
- sensitive HR/Health access.

---

# 31. PRIVACY / SENSITIVE DATA

Use purpose limitation and least privilege.

Specially restrict:
- HR/payroll;
- banking;
- disciplinary;
- health/clinical;
- location;
- identity documents;
- legal/claims.

Sensitive reads may require audit.

Do not expose unnecessary sensitive data to AI, analytics, logs or Command Centre aggregates.

---

# 32. OBSERVABILITY

Instrument:
- HTTP;
- domain commands;
- outbox;
- workers;
- Temporal;
- Postgres;
- Redis/BullMQ;
- search;
- external APIs;
- AI;
- mobile sync;
- Command Centre projections.

Use correlation IDs across user action → API → workflow → event → downstream systems.

Business truth remains domain data; observability is telemetry.

---

# 33. RESILIENCE / DEGRADED MODE

Every integration gets:
- timeout;
- retry policy;
- idempotency;
- circuit/degraded behavior;
- operator repair;
- stale indicator;
- alert.

Examples:
- payment provider unavailable;
- Maps unavailable;
- WhatsApp unavailable;
- AI unavailable;
- search lagged;
- donor/specialist service unavailable;
- Command Centre unavailable.

Core business domains should continue safely where possible.

---

# 34. MIGRATION AND DATA

Do not directly import dirty historical spreadsheets into canonical tables.

Use:
source → landing → profile → normalize → dedupe → map → validate → business review → import → reconcile → signoff.

Opening financial/inventory/payroll/asset states require explicit evidence and reconciliation.

---

# 35. COMMAND CENTRE AS DEVELOPMENT GOVERNOR

As soon as possible, make the Development room read the registry/evidence model.

It should expose:
- Feature coverage;
- gate status;
- build/test status;
- dependency blockers;
- donor status;
- research freshness;
- security findings;
- migration revalidation;
- releases/deployments.

The Command Centre should eventually become the operational proof that DIAL development follows this plan.

---

# 36. SCOPE / WIP CONTROL

The architecture is full-scope but implementation must control WIP.

Default:
- maximum three shared horizontal epics active simultaneously;
- one branch activation candidate at a time;
- maximum two strategic donor research investigations;
- avoid multiple worktrees changing the same canonical shared package.

When an incident/security blocker occurs, rebaseline rather than silently adding work.

Explicit defer/subtract decisions require a recorded decision. Features cannot disappear informally.

---

# 37. DAILY / SESSION EXECUTION ALGORITHM

At the start of a material session:

1. identify Feature ID(s);
2. read ACTIVE_WORK;
3. get JIT context;
4. inspect git status/recent commits;
5. inspect actual source/tests;
6. confirm no new contradiction;
7. implement bounded change;
8. run fast verification;
9. use specialist reviewer when triggered;
10. fix;
11. run target gate tests;
12. record evidence;
13. update feature status only to proven gate;
14. checkpoint/handoff;
15. commit.

Do not spend the first half of every session rereading architecture.

---

# 38. SPECIALIST REVIEW TRIGGERS

Invoke money reviewer when:
- price, payroll, payout, ledger, tax, FX, settlement, refund, guarantee funding.

Invoke security reviewer when:
- auth, permissions, RLS, uploads, webhooks, secrets, sensitive data, admin controls.

Invoke donor reviewer when:
- source/code imported or donor behavior materially adapted.

Invoke UI evaluator when:
- new major user/operator screen or responsive workflow.

Invoke health specialist review when:
- clinical, medication, consent, funder, pharmacy or health safety state changes.

Invoke migration revalidator when:
- old evidence/gate is being inherited after meaningful code/schema move.

---

# 39. PROJECT TRUTH UPDATE RULE

Agents may propose changes to Project Truth but must not silently rewrite core locks.

Durable change requires:
- reason;
- affected Feature IDs/modules;
- superseded decision if any;
- evidence/research;
- architecture impact;
- explicit approval where material.

Implementation discovery that merely clarifies code paths can update mappings without reopening product architecture.

---

# 40. COMPLETION CLAIM FORMAT

When reporting a completed feature, state:

```text
Feature:
Target gate:
Implemented paths:
Schema/migration:
Commands/APIs:
Events:
Permissions:
Eventualities tested:
External/degraded tests:
Security tests:
UI/visual tests:
Evidence refs:
Remaining known limitations:
Registry status updated to:
```

Never say "done" without this level of traceability for a material feature.

---

# 41. FULL PROGRAM COMPLETION DEFINITION

DIAL development is complete only when:

- every required top-level Feature ID has been decomposed into implementation FRCs where needed;
- all required division/shared/corporate/health systems are implemented;
- all Command Centre rooms are registered and live;
- money/ledger reconciliation is proven;
- Delivery/job/order single-writer architecture is proven;
- Corporate payroll/procurement/inventory/assets reconcile;
- health-specific certification is complete for activated health capabilities;
- donor-derived production behavior has provenance and parity evidence;
- all critical security findings are closed/accepted appropriately;
- resilience and operator recovery are proven;
- migration revalidation is complete;
- observability/runbooks exist;
- production activation decisions are explicitly recorded.

---

# 42. FINAL BEHAVIOR FOR THE PRINCIPAL CODING AGENT

Operate autonomously inside the approved scope, but do not confuse autonomy with permission to redesign DIAL.

Prefer:
- repository evidence over assumptions;
- deterministic code over LLM guesses;
- shared abstractions over division duplication;
- bounded JIT context over giant prompts;
- test evidence over self-assessment;
- explicit contradiction reporting over silent compromise;
- controlled donor assimilation over approximate rewrites;
- safe degraded behavior over brittle success paths.

When blocked:
1. prove the blocker;
2. classify it as implementation / architecture / research / external dependency / permission;
3. record the affected Feature ID;
4. resolve locally if the canon already answers it;
5. research narrowly if genuinely required;
6. escalate only a decision that cannot be derived safely.

---

# 43. COPY-PASTE MASTER DEVELOPMENT INVOCATION

Use the following when starting the principal DIAL coding session:

> You are the Principal DIAL Development Agent. Execute the complete DIAL platform described by `DIAL Master Development Plan & Execution Prompt v1.2`.
>
> Treat the existing repository as the implementation substrate; do not rebuild from scratch and do not discard proven existing code.
>
> First perform the development-harness/bootstrap work and context-drift cleanup required by the master plan. Then map current repository implementation/evidence into the Feature Registry. From that point onward, execute development using Feature IDs and Feature Realization Contracts.
>
> Build the full DIAL target: shared Kernel, all shared operating systems, Dial a Spare, Dial a Tech, Dial Groceries, Dial Laundry, Dial Fleet, Vehicle Hub, Dial Care, Dial Assist, DIAL Projects, standalone Dial Health/ZHOTN, Corporate Management OS, the full Command Centre including Android wrapper, and the governed AI/simulation/experimentation layer.
>
> Preserve one coherent platform. Do not create duplicate identity, money, ledger, delivery, evidence, catalogue, customer, provider or resolution systems inside divisions.
>
> FixItNow is the MIT-licensed `Sachinrajawat/FixItNow` primary Dial a Tech wholesale donor. Import and assimilate it according to the donor protocol while replacing donor business authority with DIAL.
>
> Dial Health/ZHOTN is a required standalone division and must retain its health-specific safety, regulatory and data authorities.
>
> Do not redo broad research unless a current Feature ID exposes a genuine unresolved implementation question. Use the Research Registry and donor dossiers first.
>
> For every material feature: retrieve JIT context, inspect actual current code, resolve the FRC, audit eventualities, implement one coherent changeset, test, obtain fresh independent review where triggered, fix failures, record evidence and only then advance the feature gate.
>
> Never claim completion from planning text or code inspection alone. Never silently alter locked architecture. If an unavoidable contradiction exists, stop that affected change, document the contradiction and request/record the architectural decision while continuing independent work where safe.
>
> Begin with the repository bootstrap and harness certification defined in Workstream A, then proceed through the dependency graph without interpreting it as an MVP or permission to omit later scope.

---

# 44. FIRST RESPONSE EXPECTED FROM THE DEVELOPMENT AGENT

The principal coding agent's first response should not be a generic plan.

It should report:

1. repository HEAD / branch / dirty state;
2. existing packages/apps/infrastructure relevant to bootstrap;
3. which harness files already exist vs need application;
4. stale-context findings actually found;
5. current Feature Registry mapping statistics;
6. immediate bootstrap changeset;
7. commands/tests it will use to certify the harness;
8. contradictions/blockers, if any.

Then begin implementation.


---

# 45. CLIENT EXPERIENCE AND SUPPORT COMPLETENESS — v1.3 ADDITION

The required client strategy is:

- **DIAL Consumer super-app:** Spare, Tech, Groceries, Laundry, Vehicle Hub, Care, Assist, consumer Projects;
- **Dial Health/My Health:** standalone specialist health app/web;
- **DIAL Business:** fleet/projects/organization-level B2B customer workspace.

Do not create a separate consumer app for every branch.

All customer-facing features and eventuality states must be reachable through the Customer Action Registry, branch Activity/details and Support OS.

Customer service is a horizontal DIAL product:
automated DIAL Support Agent → safe typed tools → human Chatwoot handoff → RCE/Claim when formal resolution is needed.

A customer must not have to abandon the digital journey and manually explain the transaction again when something goes wrong.


---

# 46. DIAL HOME / UNIVERSAL IDENTITY / WHATSAPP CHANNEL — v1.4 LOCK

## Public home

`/` is the public DIAL Home/Service Router, not Sign In/Sign Up.

Primary landing donor:
`nobruf/shadcn-landing-page` → MIT → `PORT-SELECTED-MODULE + PORT-UX-UI`.

Port useful responsive navigation/hero/services/benefits/FAQ/footer composition, then recompose into the DIAL design system. Authentication is contextual, not the home product.

## Universal DIAL credentials

All customer-facing divisions use one canonical DIAL Identity / Supabase Auth realm.

Credentials created through Spare, Tech, Groceries, Laundry, Care, Assist, Projects, DIAL Business, Dial Health or WhatsApp account linking resolve to the same identity.

Universal identity does not grant universal permissions. Health consent, Business membership, provider relationships and staff access remain scoped.

## WhatsApp

DIAL owns the official WhatsApp Cloud API/Flows gateway.

Architecture:
Meta → DIAL WhatsApp Gateway → transactional Flow orchestration OR Support Orchestrator → Chatwoot API-channel human handoff.

Do not make Chatwoot the canonical business-state or transactional Flow owner.

Use `WhatsApp/WhatsApp-Flows-Tools` as the official MIT endpoint/tooling donor.

Implement the complete branch flow catalog in:
`16_HOME_IDENTITY_WHATSAPP/WHATSAPP_FLOW_REGISTRY.json`.

## WhatsApp payments

All WhatsApp payments use canonical DIAL PaymentIntent.

Paynow and ContiPay are provider adapters. Server-side initiation plus authoritative callback/query/reconciliation determines payment state.

WhatsApp must cover:
- branch/service routing;
- structured ordering/booking;
- substitutions/approvals/variations;
- eligible payment method selection;
- Paynow;
- ContiPay;
- configured USD payment modes;
- payment-status recovery;
- fulfilment/tracking;
- issue reporting/evidence;
- automated support;
- human Chatwoot escalation.

Complex rich views may deep-link to app/web while preserving ChannelSession and returning status to WhatsApp.


---

# 47. DIAL HOME DESIGN + SECURITY — v1.5 LOCK

## DIAL Home final design direction

The selected `nobruf/shadcn-landing-page` MIT repository is only an engineering/component donor.

The final art direction is **DIAL Premium Solutions Environment**.

Home must instantly communicate:
- breadth of solutions;
- professionalism;
- trust;
- operational competence;
- simplicity.

The design must use:
- clean modern composition;
- restrained premium typography;
- generous visual breathing room;
- excellent real-world photography/CGI;
- subtle depth and motion;
- service portals rather than generic feature cards;
- obvious Help/WhatsApp;
- secondary/contextual authentication.

Reject generic SaaS/AI aesthetics, excessive gradients/glass/card grids and stock-photo collage.

Read:
`16_HOME_IDENTITY_WHATSAPP/DIAL_HOME_PREMIUM_SOLUTIONS_ENVIRONMENT_LOCK.md`.

## Security is now a mandatory feature facet

Every top-level feature has a ninth required realization facet:

`SECURITY_PRIVACY`

Load:
- `17_SECURITY/DIAL_SECURITY_MASTER_ARCHITECTURE_v1.md`
- `17_SECURITY/SECURITY_CONTROL_REGISTRY.json`
- `17_SECURITY/FEATURE_SECURITY_PROFILE_REGISTRY.json`

A functional feature is not production-green until the applicable security profile is verified.

## Security assurance

- S1: ordinary internet-facing/public;
- S2: transactional/business operational;
- S3: identity/money/health/privileged/high assurance.

Apply OWASP ASVS 5.0, API Security Top 10 2023, MASVS/MASTG for mobile and NIST SSDF v1.1 as baseline references.

## Mandatory security behaviors

The attached-image checklist is fully adopted and strengthened:
secrets, Git secret scanning, public-vs-secret Supabase keys, RLS, encryption, server auth, record access, field tampering, secure sessions, managed password hashing, rate limiting, bot protection, parameterized queries, input validation, output escaping, restricted uploads, response minimization, headers, HTTPS and dependency scanning.

Additionally implement:
- IDOR/BOLA/BFLA tests;
- CSRF;
- SSRF;
- webhook signature/replay controls;
- business-flow abuse/fraud;
- data classification/retention;
- mobile security;
- AI/MCP prompt/tool injection defenses;
- supply-chain/SBOM/provenance;
- privileged step-up/DoA/SoD;
- incident response/restore/rotation.

## Development loop addition

For every material Feature ID:

```text
context-get FEATURE
→ threat/security profile
→ implementation
→ functional tests
→ security controls / negative tests
→ evidence
→ only then advance gate
```

Run:
- `agent-system/bin/realization-coverage.mjs`
- `agent-system/bin/security-coverage.mjs`

before broad release/certification.


---

# 48. PAYMENT CHANNELS / FINANCE BOOKS / POSITIONS & ONBOARDING — v1.6 LOCK

## Accepted payment channels

DIAL must support, through the one canonical PaymentIntent/Ledger architecture:

1. Cash
2. EcoCash Direct USSD Push
3. Paynow
4. ContiPay
5. PayPal

Do not build channel-specific payment truth inside business divisions.

Read:
- `18_FINANCE_PEOPLE/DIAL_PAYMENT_ORCHESTRATION_AND_ENDPOINT_CONTRACT.md`
- `18_FINANCE_PEOPLE/PAYMENT_CHANNEL_REGISTRY.json`

## Confirmation routing

Customer approval/action is not sufficient payment authority.

Provider/cash event pipeline:

```text
authenticate/verify source
→ schema validate
→ dedupe/replay protect
→ correlate PaymentIntent
→ compare amount/currency/ref
→ normalize provider state
→ append provider/payment event
→ legal PaymentIntent transition
→ AccountingEvent
→ Ledger
→ source business aggregate
→ customer/WhatsApp notification
→ BU journal projection
→ settlement/reconciliation
```

Never set paid state from:
- browser return;
- WhatsApp Flow completion;
- customer "I paid" button;
- unverified webhook.

## Cash

Cash is a controlled custody flow with cash sessions, receipts, handovers, counts, deposits and variances.

Cash can be customer-facing COD/counter tender, but confirmed state requires an authorized DIAL collection/custody command.

## EcoCash Direct

Use the authenticated EcoCash developer contract.

The public architecture confirms REST/OAuth2/webhooks and the merchant Push Transaction/USSD confirmation concept.

Do not invent provider endpoint paths missing from public docs.

DIAL owns:
`/payments/{ref}/ecocash/push`
and
`/webhooks/ecocash`.

## Paynow

Use official initiation/result/poll/hash semantics.

DIAL validates hashes and, for consequential paid updates, confirms via provider poll as documented.

Keep Paynow `Awaiting Delivery` / `Delivered` as provider substate; DIAL Delivery remains the only fulfilment SoR.

## ContiPay

Use the authenticated current developer portal contract.

Do not hard-code guessed URLs/signatures.

Adapter cannot be certified until current initiation/query/notification/refund capability tests pass.

## PayPal

Use Orders v2 / Payments v2 / Webhooks.

Buyer approval does not equal completed payment.

Capture server-side and verify payment/webhook state.

## Business-unit finance books

Every required DIAL BU has:

```text
Combined Collections Control (non-posting)
Combined Journal projection
Cash account/journal
EcoCash Direct account/journal
Paynow account/journal
ContiPay account/journal
PayPal account/journal
Petty Cash account/journal
Returns & Refunds journal
Disputes / Chargebacks journal
```

These are subaccounts/journals/projections in the one DIAL Ledger.

Never double-post to the combined account.

## Finance statement UI

Required bank-statement-style table:

`Date/Time | Ref | Description | Debit | Credit | Running Balance | Status`

Rules:
- balances are per currency;
- no mixed USD/ZWG running balance;
- full transaction drawer/page on click;
- no direct edit of posted/reconciled entry;
- single transaction PDF;
- selected-date-range PDF with opening/closing balance, totals and query snapshot;
- PDF generation server-side, permission-checked and audited.

## Petty cash

Every BU has its own petty-cash account and authorities.

Default funding:

`BU Petty Cash Requisition → policy/budget → BU approver(s) → release from eligible settled same-BU source account → custodian acknowledgement`.

Central Treasury may fund a BU only through an explicit approved treasury/inter-unit transfer.

Authority is position-derived:
- requester;
- approver;
- release;
- custodian;
- auditor.

Enforce DoA/SoD and amount/currency/site/BU scope.

## Positions

CompanyPosition is first-class and effective-dated.

It includes:
- legal entity / BU / department / cost centre / site;
- title/grade/reporting line;
- job description/responsibilities/KPIs/qualifications;
- compensation defaults;
- role-based contract template;
- PermissionBundles;
- FinancialAuthority;
- DoA/SoD;
- training/SHEQ/PPE/assets;
- onboarding requirements.

## Role-based contracts

Position contract templates are versioned.

Hiring produces an immutable Employee Contract Snapshot from:
Position Version + approved compensation + employee/employment details + applicable clauses.

Documenso handles e-sign ceremony only; DIAL owns template/version/approval/state/signed evidence.

Position template changes never rewrite previously signed contracts.

## Employee onboarding photo

Onboarding includes employee picture capture through:
- web image picker/camera;
- Android Photo Picker/CameraX where appropriate;
- iOS PhotosPicker/camera where applicable.

Photo pipeline:
picker/camera → preview/crop → signed upload → quarantine → signature/type/size validation → decode/re-encode → metadata minimization → private storage → thumbnail/avatar.

No facial recognition/biometric inference by default.

## Position-based permissions

Employee access derives primarily from active PositionAssignment.

Mover:
- calculate permission diff;
- revoke old BU/position authority;
- grant only new permitted authority.

Leaver:
- revoke sessions/access/FinancialAuthority;
- reassign approvals;
- settle petty cash/cash custody;
- recover assets;
- final payroll remains separate.

## Mandatory implementation artifacts

Load:
- `18_FINANCE_PEOPLE/BUSINESS_UNIT_FINANCE_BOOK_REGISTRY.json`
- `18_FINANCE_PEOPLE/FINANCE_ROLE_AND_AUTHORITY_REGISTRY.json`
- `18_FINANCE_PEOPLE/PEOPLE_POSITION_ONBOARDING_CAPABILITY_REGISTRY.json`
- `18_FINANCE_PEOPLE/COMPANY_POSITION_SCHEMA_REFERENCE.json`
- `18_FINANCE_PEOPLE/EMPLOYEE_ONBOARDING_SCHEMA_REFERENCE.json`

Finance/People implementation is incomplete if these detailed functions are hidden behind the parent Corporate Feature IDs.
