# Quantum Donor Repository Study System (QDRS)

## Goal
Reconstruct a strategic donor as a functioning system: behavior, state, failures, recovery, security, concurrency, operations, performance and UX—not merely files/features.

## Applicability
- **Full QDRS:** primary strategic donors, money/security/safety-critical donors, major PORT-WHOLESALE application donors.
- **Targeted QDRS:** specialist donors where only a bounded subsystem matters.
- **Commodity dependency review:** use CDR rather than full QDRS for ordinary libraries/frameworks.

## Q0 — Qualification
Score blueprint relevance, workflow depth, production history, code/test/operator/config/security/performance/UX value. Classify donor purpose and qualification.

## Q1 — Evidence Freeze
Capture commit/tag/branch/release/acquisition date/docs/tests/fixtures/build/dependencies/migrations/issues/releases. Assign `DRR-<MODULE>-<DONOR>-NNN`.

## Q2 — Total Repository Census
Classify material paths: application/domain/persistence/UI/API/integrations/jobs/queues/security/config/migrations/tests/ops/observability/deployment/infrastructure/legacy/docs. Unexplained material code is research debt.

## Q3 — Build & Runtime
Reconstruct toolchain, dependencies, DB/migrations/config/services/startup/workers/seed/test environment in isolation where feasible.

## Q4 — Architecture Archaeology
Produce module/dependency/service/data-authority/API/event/queue/job/permission/state/failure/external-system graphs.

## Q5 — Data Model Forensics
Entities, relations, keys, constraints, indexes, triggers, views, audit/history/migrations/deletion/archive. Extract hidden invariants.

## Q6 — Behavioral Atom Catalogue
Use `BA-<MODULE>-NNNN`. Record actor/trigger/inputs/preconditions/state/validation/mutation/events/external calls/output/audit/failure/offline/concurrency/evidence/confidence.

## Q7 — State Machines
States, legal/prohibited transitions, actors, guards, prerequisites, side effects, timeout, reversal, compensation, audit.

## Q8 — Runtime Behavioral Tracing
Trace `USER ACTION → COMMAND → SERVICE → VALIDATION → DATABASE → EVENT → BACKGROUND WORK → DOWNSTREAM EFFECT → FINAL STATE`.

## Q9 — Network Forensics
Destination/protocol/endpoint/purpose/data/auth/retry/failure. Deny-by-default where feasible. Classify dependencies: reproduce locally / replace / explicit integrate / reject.

## Q10 — Test Archaeology
Classify feature/regression/edge/security/concurrency/migration/integration/performance tests. Ask why unusual tests exist; translate into DIAL invariants/regressions.

## Q11 — Issue/Commit/Bug Archaeology
Mine bugs/security/races/data loss/support/rollbacks/migrations/performance/hotfixes. Record `failure → root cause → missing invariant → fix → regression protection → DIAL relevance`.

## Q12 — Configuration Archaeology
Env, tenant settings, flags, templates, policies, plugins, user/integration settings. Defaults are not the whole product.

## Q13 — Operator & Support
Retry/reconcile/repair/audit/bulk/diagnostic/monitoring/backup/recovery. Ask what support does when the normal flow fails.

## Q14 — Failure Injection
DB/network/timeouts/duplicates/stale state/malformed responses/queue backlog/restart/partial transaction/auth expiry/disk pressure/missing config. Observe detect/rollback/retry/compensate/operator/reconcile/final state.

## Q15 — Concurrency & Race Analysis
Simultaneous writes, duplicates, stale clients, reordered events, delayed callbacks, resource claims. Study locking/OCC/constraints/isolation/idempotency/compensation.

## Q16 — Fuzzing & Boundary Discovery
Appropriate APIs/parsers/uploads/imports/messages/QR/config/protocols.

## Q17 — Security Reconstruction
Authn/authz/tenancy/privileges/session/secrets/crypto/uploads/validation/audit/export/trust boundaries. Produce donor threat model + DIAL lessons.

## Q18 — Performance Archaeology
Throughput/latency/CPU/memory/query/slow query/cache/locks/queue/batch/startup/storage. Determine first bottleneck, scaling/degradation/recovery. Produce DIAL Performance Envelope.

## Q19 — UX Behavioral Reconstruction
Hierarchy/navigation/steps/interactions/forms/components/decision points/error prevention/loading/empty/responsive/mobile/accessibility/efficiency. Produce UXR + screen parity when UX donor.

## Q20 — Domain Invariants
Use `INV-<MODULE>-NNN`. Convert to property/invariant tests.

## Q21 — Negative Behavior
Use `NEG-<MODULE>-NNN`: `System MUST NOT ...`.

## Q22 — Cross-Donor Triangulation
Primary + triangulation + specialist + standards. Classify behavior COMMON/STANDARD-DERIVED/DONOR-SPECIFIC/SUPERIOR/LEGACY/LOCALISE/DIAL-ENHANCE. Keep visual source of truth separate from behavioral consensus.

## Q23 — Domain Expert Validation
Required where real-world specialist operation or high-consequence behavior is involved.

## Q24 — Quantum Reference Package
Create `QRP-<MODULE>-<CONSENSUS>-NNN`.

## QRP contents
Repository census; architecture graphs; domain/data authority; state machines; Behavioral Atoms; invariants; negative behaviors; API/integration/event model; runtime traces; Failure Atlas; concurrency; security; configuration; operator workflows; Performance Envelope; Historical Failure Knowledge Base; UX reconstruction; Screen Parity; BDCM; donor comparison; implementation-neutral spec; test scenarios/properties/oracle vectors; residual uncertainty; Q-score.

## Evidence
A+ source+runtime+tests+expert; A source+runtime+tests; B two evidence types; C one direct source; D inferred; U unresolved.

Critical safety/security/money/authority decisions cannot proceed only on D/U evidence.

## Quantum-understood gate
Strategic Q ≥ 90. High-criticality Q ≥ 95. Critical unresolved safety/integrity items = 0.

## PORT-WHOLESALE note
QDRS does not force a wholesale donor rewrite. It tells DIAL what the imported application really does and what must be retained/replaced/isolated.
