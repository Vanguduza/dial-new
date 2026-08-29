# DIAL v2.0 — Implementation Closure & Build-Ready Canon

**Purpose:** end broad design expansion, convert DIAL into implementation-grade contracts, and create the gate that allows controlled engineering to begin without reopening architecture in every coding session.

**Status:** `CANON BUILD-READY — CT-1/CT-2 AMBER ON CONTRACT SPECIFICITY`  
**Repository status:** `BOOTSTRAP APPLIED; PILOT REQUIRED BEFORE BROAD FEATURE FAN-OUT`  
**Activation status:** branch-specific; external/regulatory blockers may remain open while software is built.

**Reconciled by Consolidated Development Pack v2.2.** v2.1 layered four decisions on this
canon — the Shop-Ecommerce frontend donor, the frozen transition/EPC contracts, the
eleven-stage vehicle readiness gate and the v2.1 development prompt — and those remain
active. v2.1 also shipped as a twelve-file overlay packaged as a replacement, dropping the
registries and the bootstrap this document depends on; v2.2 restores them. See
`../20_IMPLEMENTATION_CLOSURE/14_VALIDATION/CLOSURE_TEST_REPORT.md`.

---

## 1. What v2 changes

v1.x achieved very broad product coverage but still allowed too much interpretation during coding.

v2 closes that problem by making six things explicit:

1. every one of the 186 Feature IDs has a concrete implementation contract;
2. every eventuality has a structured recovery contract and Material cases require executable ownership/recovery;
3. every donor has a frozen adoption mode and a mandatory import/service gate;
4. non-functional targets and deployment environments are explicit;
5. external commercial/regulatory unknowns are Activation Blockers rather than hidden assumptions;
6. the actual GitHub repository has a defined canonicalization path before broad development.

v2 is therefore a **closure release**, not a feature release.

---

# 2. Authority hierarchy

After v2 is applied to the repository:

1. explicit founder/owner decisions recorded in v2 Project Truth;
2. this v2 compact canon;
3. machine registries/FRCs/security/eventuality/NFR/activation contracts;
4. specialist integration documents referenced by v2;
5. actual implementation/tests as evidence;
6. archived v1/v4/D-number material only as provenance/reference unless imported by v2.

A stale document cannot regain authority merely because an agent finds it first.

---

# 3. Permanent DIAL invariants

These remain non-negotiable:

- DIAL is the source of truth; donor systems never silently become a second ERP;
- one Party/Identity model, scoped relationships and permissions;
- one append-only double-entry Ledger;
- money uses integer minor units + explicit currency;
- no AI creates binding payable amounts or writes Ledger/payment authority;
- payments separate customer action, confirmation, settlement and reconciliation;
- Delivery is the delivery source of truth;
- inventory changes through immutable movements/compensation, not balance editing;
- health remains a standalone specialist division with stronger safety/consent boundaries;
- Command Centre is a projection/control plane, not a second domain database;
- human-readable references are used on operational/customer surfaces;
- external provider callbacks are untrusted until authenticated/validated;
- code donors enter through the Donor Assimilation Gate;
- historical evidence may be inherited as provenance but must be regression-revalidated after material migration;
- branch deployment and branch commercial activation are separate;
- security/privacy/abuse resistance is the ninth mandatory feature facet.

---

# 4. The six closure tests

## CT-1 — Concrete Feature Contract

Every Feature ID must resolve to:
- aggregate;
- state model;
- named commands;
- named queries;
- named events;
- API/command boundary;
- permissions;
- data relationships;
- money/inventory/delivery effects;
- surfaces;
- Security Profile;
- applicable eventualities;
- donor refs;
- acceptance contract.

The authoritative machine file is:

`20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json`

No `feature-specific command TBD` placeholder is permitted.

**Specificity is part of this test, and is measured.** Command and event names embed their
aggregate name, so counting distinct names proves nothing. CT-7 substitutes the aggregate
out and measures what is actually feature-specific. CT-1 is AMBER until each feature
entering implementation has its own acceptance contract and permission set.

## CT-2 — Executable Eventuality Contract

Every eventuality resolves to:
- trigger;
- severity/materiality;
- owner queue;
- named recovery commands;
- procedure;
- evidence freeze;
- financial/safety guard;
- terminal states;
- compensation;
- tests.

Material eventualities cannot be satisfied by prose saying "ops will handle it".

Nor by a shared test block. Eight test definitions currently span 254 contracts; CT-2 is
AMBER until material, customer-visible, money- and safety-touching contracts carry their own.

## CT-3 — Donor Qualification

The adoption mode is closed now.

The exact repository commit is pinned **at first import**, immediately before code is copied, so DIAL does not create stale months-old pins.

No code import occurs before:
- commit/tag;
- licence/hash;
- selected paths;
- supply-chain/security scan;
- DIAL boundary replacement;
- parity tests;
- provenance;
are recorded.

## CT-4 — NFR / Deployment Closure

Core systems have:
- availability target;
- latency/performance target;
- RPO;
- RTO;
- degraded behavior;
- capacity/load expectation.

Environments and promotion/migration behavior are defined.

## CT-5 — Activation Blocker Closure

Every known external dependency is either:
- resolved, or
- a named `ACT-*` blocker stating what can be built now and exactly what prevents ACTIVE.

An unresolved legal/provider/commercial fact may not become an assumed code behavior.

## CT-6 — Canon / Repository Alignment

The active repository must:
- point to v2;
- stop old v4/D-number rules from acting as current authority;
- install bounded-context development tooling;
- map current source/tests to Feature IDs;
- run drift/closure/security/realization checks.

Broad multi-worktree development is blocked until the repository bootstrap is green.

## CT-7 — Contract Specificity

Introduced in v2.2 because CT-1 and CT-2 were reported green on a metric that counted
interpolated names.

CT-7 measures, after substituting each aggregate's name out of its own commands:
- distinct command skeletons;
- lifecycle-boilerplate ratio;
- distinct state models;
- distinct acceptance contracts;
- distinct permission skeletons;
- distinct eventuality test definitions and compensation rules.

It is a **regression gate**. The committed baseline records the current values as a floor
and the check fails if any of them falls. Contracts may only become more specific.

```text
node agent-system/bin/contract-specificity.mjs
agent-system/registries/CONTRACT_SPECIFICITY_BASELINE.json
```

---

# 5. Build readiness vs launch readiness

`BUILD-READY` means the engineering question is closed sufficiently for code to be written.

It does not mean every division may legally/commercially launch.

Lifecycle:

```text
DESIGN_CLOSED
→ BUILDABLE
→ CODE_PRESENT
→ DOMAIN_TESTED
→ INTEGRATION_GREEN
→ STAGING_GREEN
→ CERTIFIED_DORMANT
→ ACTIVATION_BLOCKERS_GREEN
→ ACTIVE
```

This preserves DIAL's long-horizon model: build broad, certify deeply, activate selectively.

---

# 6. Feature engineering loop

For every material change:

```text
Feature ID
→ bounded context
→ inspect current source/tests
→ resolve concrete FRC
→ inspect Material eventualities
→ inspect Security Profile
→ inspect donor/NFR/activation refs
→ implementation plan
→ bounded code change
→ unit/property/integration/contract/E2E tests
→ triggered independent specialist reviews
→ fix
→ evidence
→ highest proven gate
→ compact handoff
```

No broad research is performed unless the current contract contains a genuinely unresolved implementation question.

---

# 7. Review triggers

Money reviewer:
- price;
- payment;
- FX;
- tax;
- ledger;
- payroll;
- settlement;
- refund;
- payout;
- petty cash;
- accounting event.

Security reviewer:
- identity/auth;
- permissions/RLS;
- secrets;
- uploads;
- webhooks;
- sensitive data;
- admin;
- external inputs.

Health reviewer:
- clinical;
- medicine;
- prescription;
- consent/delegation;
- health safety;
- medical aid.

Donor reviewer:
- imported donor code;
- schema/workflow/algorithm extraction;
- upstream upgrade.

Eventuality reviewer:
- customer-visible exception;
- external-provider failure;
- capacity/fallback;
- cancellation/partial/reversal;
- safety/compliance.

NFR reviewer:
- new service/deployable;
- hot path;
- large data/media;
- polling/queue;
- realtime/location.

Migration reviewer:
- schema changes;
- long-running Temporal workflows;
- event/API breaking change;
- evidence inheritance after tree move.

UI reviewer:
- major customer/operator journey;
- donor UI assimilation;
- accessibility/responsive behavior.

---

# 8. Shared build order

Controlled engineering begins with:

1. repository canonicalization + v2 harness;
2. Project Truth / registries / closure checks;
3. Party / Identity / Organisation;
4. permissions / RLS / DoA / SoD;
5. Human Reference / Evidence / Audit;
6. event envelope / outbox / idempotency / concurrency;
7. Payments / Ledger / Tax / FX / Treasury primitives;
8. Catalogue / Vehicle / Fitment / Search contracts;
9. Orders / Jobs / Projects primitives;
10. Delivery / provider / network / RCE;
11. customer/client shells + Home + support channels;
12. business divisions against shared contracts;
13. Corporate OS;
14. Command Centre continuously as real domains land;
15. governed AI/simulation after deterministic telemetry/domain truth;
16. cross-domain certification;
17. branch activation only after its `ACT-*` blockers are green.

Parallelism may expand only after shared contracts are stable.

---

# 9. Repository truth

At the v2 audit date the connected GitHub repository was still on the old active authority
model and lacked root `CLAUDE.md`. The **first development change was repository bootstrap**,
not a customer feature.

That bootstrap has now been applied from:

`21_READY_TO_APPLY_REPOSITORY_BOOTSTRAP/`

Current state is tracked in:

`20_IMPLEMENTATION_CLOSURE/11_REPOSITORY_ALIGNMENT/REPOSITORY_BOOTSTRAP_CHECKLIST.json`

Seven of ten tasks are complete. Three remain, and they gate broad fan-out:

```text
RBC-007  map source/test paths to the Feature Registry     PENDING
RBC-009  prove one pilot Feature to DOMAIN_TESTED          PENDING
RBC-010  enable broad multi-worktree development           BLOCKED
```

The harness executes. From the repository root:

```text
npm run verify                    typecheck, schemas, manifest, drift, closure, tests
npm run agent:v2-closure-check    the closure tests
npm run agent:manifest-check      manifest completeness and canon-referenced paths
```

`agent:manifest-check` exists because this canon previously referenced
`21_READY_TO_APPLY_REPOSITORY_BOOTSTRAP/` and the bootstrap checklist while neither was
present in the shipped pack. A canon-referenced path that does not exist is now a build
failure.

---

# 10. Claude Code development strategy

Keep `CLAUDE.md` short.

Use:
- Skills for repeatable standards;
- narrow Subagents for independent review;
- Hooks for lifecycle automation;
- read-only Project Truth MCP;
- bounded registry retrieval;
- compact checkpoints before context compression.

The Project Truth MCP server is **not yet implemented**. `dial-development-governor/.mcp.json`
is therefore shipped as `.mcp.json.example` and is inert. Bounded context comes from
`agent-system/bin/context-get.mjs` until the server exists. Do not enable the MCP config
against a server that is not there.

Critical security/review behavior may not depend solely on plugin hook propagation; CI and explicit reviewer contracts enforce the same gates.

---

# 11. Product/UX closure rule

v2 does not freeze every pixel before implementation.

It freezes:
- interaction architecture;
- client app topology;
- DIAL design system authority;
- DIAL Home Premium Solutions Environment;
- complete state/error/recovery/support requirements;
- donor UX assimilation rules.

Representative high-value journeys should be prototyped/validated before large UI fan-out.

Implementation can refine visual craft without reopening business/source-of-truth architecture.

---

# 12. Money closure rule

Any new money event must join the canonical accounting-event matrix.

A new payment channel, refund type, fee, tax or payout does **not** get an independent balance model.

Flow:

`source business event → Payment/Accounting Event → balanced Ledger → BU journal projection → settlement/reconciliation`

The business-unit books remain scoped views of one Ledger.

---

# 13. Operational closure rule

Every Material exception requiring a human maps to:

`state → queue → Position/role → SLA → procedure → evidence → escalation → terminal result`

No undocumented manual database fix is an operating procedure.

---

# 14. Completion claim

A Feature cannot be described as complete without:

```text
Feature ID
Target gate
Source paths
Schema/migrations
Concrete commands/queries/events
Permissions/RLS
Material eventualities tested
Security tests
NFR tests
Donor provenance/parity if applicable
UI/accessibility tests if applicable
External/degraded tests
Evidence refs
Known limitations
Registry status
```

---

# 15. What remains legitimately open after v2

Only two classes may remain open without making the canon incomplete:

1. **repository application** — the ready-to-apply v2 bootstrap has not yet been merged;
2. **activation blockers** — external/provider/legal/commercial evidence needed for a live branch.

Those are explicit gates, not design holes.

If implementation discovers a true architectural contradiction, stop only the affected change, create a targeted decision record, and continue independent work.

Do not restart broad DIAL redesign.
