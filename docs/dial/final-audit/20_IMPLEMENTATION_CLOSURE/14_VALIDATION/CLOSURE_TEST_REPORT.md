# DIAL v2.2 Closure Test Report

**Canon:** AMBER — contract specificity
**Actual repository:** BOOTSTRAP APPLIED
**Broad feature fan-out:** BLOCKED until pilot certification
**Controlled foundation engineering:** AUTHORIZED

This report supersedes the v2.0 closure test report. Two tests previously reported
GREEN are re-scored AMBER. Nothing was removed or weakened; the measurement was
wrong and has been corrected.

---

## What changed since v2.0

### The v2.1 packaging defect

v2.1 was authored as a 12-file overlay carrying four decisions: the Shop-Ecommerce
frontend donor, the frozen transition/EPC contracts, the 11-stage vehicle readiness
gate, and the v2.1 development prompt. It was packaged as a replacement pack.

The result dropped 181 of v2.0's 199 files, including all 33 machine registries and
the `21_READY_TO_APPLY_REPOSITORY_BOOTSTRAP/` tree that the closure canon §9 names as
the mechanism for clearing CT-6. The canon continued to reference paths the shipped
pack no longer contained.

v2.2 restores the v2.0 substrate underneath the v2.1 decisions. All registries were
recovered intact and every one matches its declared count exactly.

`npm run agent:manifest-check` now fails when a manifest is incomplete or a
canon-referenced path is absent. The same defect cannot ship again.

### The CT-1/CT-2 measurement defect

v2.0 reported "183 distinct command sets" and "183 distinct event sets" across 186
features as evidence that CT-1 was GREEN.

Every command name embeds the name of the aggregate it acts on. `CompleteVehicleProfile`
and `CompleteSupplierOffer` are distinct strings and the same contract. The metric was
counting name interpolation, not design.

---

## CT-1 — Concrete Feature Contracts — AMBER *(was GREEN)*

| Measure | Value |
|---|---|
| Feature IDs | 186 |
| Concrete FRCs | 186 |
| Distinct command **names** | 183 |
| Distinct command **skeletons** after aggregate substitution | **39** |
| Commands that are lifecycle boilerplate | **678 of 1,450** (46.8%) |
| Distinct state models | 12 |
| Distinct acceptance contracts | **1** |
| Distinct permission skeletons | **2** |
| Distinct eventuality reference sets | 11 |

Sixty-seven features share one identical
`Create / Start / Block / Resume / Complete / Cancel` skeleton. Eighty-four share a
single seven-state workflow.

CT-1 requires a per-feature acceptance contract and per-feature permissions. One
acceptance contract covers all 186 features, and permissions resolve to read/create/act
with no delegation of authority or segregation of duties expressed.

The structural elements CT-1 enumerates are all present. The feature-specific content
is not yet. That is a legitimate AMBER, not a failure — the registries are a sound
skeleton, and treating them as finished contracts is what would cause the interpretation
drift v2 exists to prevent.

**Remedy.** Author per-feature acceptance contracts and permission sets ahead of each
feature entering implementation, beginning with the pilot's bounded context. Do not
attempt all 186 up front.

---

## CT-2 — Executable Eventualities — AMBER *(was GREEN)*

| Measure | Value |
|---|---|
| Eventuality contracts | 254 |
| Material | 233 |
| Distinct test definitions | **8** |
| Distinct procedures | 47 |
| Distinct compensation rules | **1** |
| Distinct evidence sets | 8 |

Every material contract carries owner queue, commands, procedure, evidence freeze and
terminal states, so the structural requirement holds.

CT-2 also requires tests. Eight test definitions span 254 contracts — roughly thirty
contracts per test block — and two of those eight are themselves generic
("trigger condition / duplicate-replay / authorization-SoD / recovery-compensation /
final audit-evidence").

The bespoke definitions already present — damage reported before POD, offline-before-submit,
timeout-then-success — are exactly the right shape and show what the remainder should look like.

**Remedy.** Write real test definitions for material, customer-visible, money- and
safety-touching contracts first. Leave the generic block only where the contract genuinely
is ordinary.

---

## CT-3 — Donors — GREEN as a design/process gate

- 43 donor/service records; adoption mode locked.
- Code donors pinned at first import, not prematurely.
- Import blocked until commit, licence, source paths, supply-chain scan, parity and
  provenance evidence exist.
- **v2.1 change carried forward:** `jatolentino/Shop-Ecommerce` is the primary
  customer-facing frontend composition donor for Spare and Groceries. Mercur is retained
  for marketplace and supplier architecture rather than as the primary public frontend.
  Frontend composition only — no donor backend, auth, payment or persistence authority.

---

## CT-4 — NFR / deployment — GREEN

17 core NFR system profiles, 7 defined environments. SLO, latency, RPO, RTO and degraded
behaviour are testable.

---

## CT-5 — External activation dependencies — GREEN as explicit gates

11 named Activation Blockers. External unknowns are named gates, not hidden assumptions.
ACTIVE remains blocked per branch until its `ACT-*` evidence is green.

---

## CT-6 — Repository alignment — AMBER, in progress *(was AMBER, pending apply)*

The bootstrap is applied and the harness executes. Seven of ten checklist tasks are
complete.

```text
RBC-001  reviewed bootstrap branch/worktree            COMPLETE
RBC-002  root CLAUDE.md v2                             COMPLETE
RBC-003  agent-system context/drift/coverage/closure   COMPLETE
RBC-004  .claude rules/skills/agents/hooks settings    COMPLETE
RBC-005  replace stale Cursor v4 authority rule        COMPLETE
RBC-006  archive/supersede stale planning authority    COMPLETE
RBC-007  map source/test paths to Feature Registry     PENDING
RBC-008  run closure/drift/security/realization checks COMPLETE
RBC-009  prove one pilot Feature to DOMAIN_TESTED      COMPLETE
RBC-010  enable broad multi-worktree development       PENDING
```

Verified executing green:

```text
agent:v2-closure-check       CANON_GREEN_REPOSITORY_BOOTSTRAP_REQUIRED
agent:drift-check            green across 47 instruction/canon files
agent:realization-coverage   GREEN
agent:security-coverage      GREEN
agent:feature-coverage       186 SPECIFIED
agent:manifest-check         GREEN
schema:check                 GREEN
```

---

## CT-7 — Contract Specificity — AMBER *(new in v2.2)*

CT-1 and CT-2 were reported green by counting interpolated names. CT-7 measures the
property those tests were meant to assert.

It is a **regression gate**, not an absolute one: the committed baseline records today's
values as a floor, and the check fails if any metric falls. Specificity can only rise.

```text
node agent-system/bin/contract-specificity.mjs
baseline: agent-system/registries/CONTRACT_SPECIFICITY_BASELINE.json
```

Targets: 186 acceptance contracts, 233 eventuality test definitions, feature-specific
command ratio ≥ 0.75.

---

## Decision

DIAL v2.2 is ready for:

1. ~~source/test path mapping to Feature IDs (RBC-007)~~ — COMPLETE;
2. per-feature contract specificity, now 23 of 206 acceptance contracts (CT-7, AMBER);
3. shared foundation implementation;
4. ~~one pilot Feature end-to-end (RBC-009)~~ — COMPLETE. SPARE-F004 reached
   DOMAIN_TESTED against CI run 33314202480, green on all three jobs. The
   Playwright suite, which had never executed anywhere, went from 2 passed /
   13 failed to 41 passed / 4 skipped.

Broad multi-worktree development (RBC-010) is no longer blocked, but is not
therefore advisable yet: CT-7 remains AMBER at 23 of 206, source-map reports 21
unclaimed source files, and no independent specialist review has been performed
on the pilot — its contract was written and proven by the same agent.

Do not reopen broad product architecture. The AMBER results are contract-authoring work
inside the existing architecture, not an architectural question.
