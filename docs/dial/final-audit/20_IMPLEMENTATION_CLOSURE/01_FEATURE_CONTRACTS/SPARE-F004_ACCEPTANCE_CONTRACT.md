# SPARE-F004 — Catalogue readiness & coverage ledger

**Pilot feature for RBC-009.** The second feature to carry a per-feature
acceptance contract rather than the generic one shared by 206 features, and the
first to be driven to `DOMAIN_TESTED` against CI that actually runs.

| | |
|---|---|
| Aggregate | `CatalogueIngestBatch` |
| Archetype | EVALUATION |
| Security tier | S2 — internet-facing transactional |
| Target gate | `DOMAIN_TESTED` |
| Governing contract | `22_COMMERCE_FRONTEND_AND_TRANSITION/03_TRANSITION_EPC_SOURCE/DIAL_FULL_CUSTOMER_EXPERIENCE_INTEGRATION_BLUEPRINT.md` (frozen) §2.3, §10 |
| Current state | `CODE_PRESENT` — evaluation and ledger implemented, ingest normalisation not |

---

## What this feature actually is

The registry names this feature "Catalogue ingest & normalization", and the
generic FRC gives it a `CatalogueIngestBatch` aggregate with a
`DRAFT → ACTIVE → SUPERSEDED → RETIRED` lifecycle and five CRUD-shaped commands.
Almost none of that is what the code does, and pretending otherwise is how a
gate becomes a lie.

What exists, and what this contract governs, is the **decision that keeps an
incomplete vehicle out of the customer's hands**: an eleven-stage readiness
evaluation, a coverage ledger that records the verdict per model with its
evidence, and a catalogue integrity gate that detects cross-maker diagram
identity collisions.

That decision is load-bearing well beyond this feature. SPARE-F001's acceptance
criterion 5 — "a vehicle failing any of the eleven readiness stages is absent
from the selector and unreachable by direct request" — is a statement about
*this* evaluation. If it is wrong, a customer is shown a vehicle whose parts
cannot be resolved.

### Non-goals, and why

- **Ingest normalisation itself.** Reading a supplier catalogue and normalising
  it into DIAL's model is not built. This feature *detects* the integrity
  problem that blocks it — 44,532 cross-maker `node_id` collisions — and refuses
  `DIAGRAM_READY` and `HOTSPOT_READY` while it stands. Repair is the DGM
  migration, tracked separately, and is a precondition for any vehicle reaching
  `customerReady`, not for this evaluation being correct.
- **The `CatalogueIngestBatch` lifecycle commands.** `CreateCatalogueIngestBatch`
  and its four siblings are the generic FRC skeleton, shared with 205 other
  features. No ingest batch aggregate exists, no command handler exists, and
  claiming otherwise would put a state machine behind a gate on the strength of
  a naming convention. They stay `SPECIFIED`.
- **The nine realization facets.** Required before this feature advances
  *beyond* `DOMAIN_TESTED`, per each facet's own acceptance clause, not before
  it reaches it.

This contract therefore covers strictly less than the feature's eventual scope,
and says so. The gate it supports is `DOMAIN_TESTED` for the evaluation domain,
not for catalogue ingest.

---

## Requirements

### P0 — cannot ship without

**R1 — Eleven stages, all required.** A model is customer-ready only when every
one of `IDENTITY_READY`, `CASCADE_READY`, `FITMENT_READY`, `HERO_READY`,
`TRANSITION_READY`, `EPC_HIERARCHY_READY`, `DIAGRAM_READY`, `HOTSPOT_READY`,
`PART_DATA_READY`, `ROUTING_READY` and `QA_READY` passes. There is no partial
credit and no stage that may be waived.

**R2 — Readiness is derived from evidence, never asserted.** A stage passes
because a measurement says so — every variant carries a resolved fitment
identity, every diagram carries position hotspots — not because a flag was set.
A stage with no evidence is not a pass.

**R3 — The first blocking stage is named.** An evaluation that fails reports
which stage blocked it and why, in ladder order, so the next action is
unambiguous.

**R4 — Nothing incomplete is ever visible.** No model may be `customerVisible`
while its evaluation is not `customerReady`. This is the invariant the customer
actually depends on, and it must hold for every model in the ledger regardless
of catalogue size.

**R5 — Acquisition backlog is not catalogue.** Models on the acquisition list
but not observed in the catalogue never appear as customer-selectable, and never
inflate readiness counts.

**R6 — Integrity is reported, never swallowed.** The cross-maker diagram
identity collision count and the `globalDiagramIdentitySafe` flag must agree
with each other in both directions, and a failing gate must name the cause.

**R7 — Counts are internally consistent.** The combined universe is a
de-duplicated union of observed and supplemental, so it is at least the larger
of the two and at most their sum. Customer-ready models never exceed observed
models.

### P1 — fast follow

- Per-stage evidence timestamps, so a stale pass is distinguishable from a fresh one.
- Ledger diffing between catalogue releases, feeding SPARE-F001's R5 revalidation.

### P2 — design for, do not build

- The `CatalogueIngestBatch` lifecycle, once ingest exists.
- Operator-facing remediation queues per blocking stage.

---

## Acceptance contract

Replaces the generic contract for this feature. Each criterion is independently
testable, and each names the test that proves it. `tests/catalog-coverage.test.ts`
runs in the `gates, types and unit suites` CI job.

1. A model with any stage not passing is not customer-ready, for every one of the
   eleven stages taken individually.
2. `customerReady` is true only when all eleven stages pass.
3. The first blocking stage reported is the earliest failing stage in ladder
   order, not an arbitrary one.
4. Every blocker attached to a failing stage appears in the evaluation's blocker
   list; a failing stage with no stated blocker is itself a failure.
5. A stage whose evidence is absent is `NOT_STARTED`, never a pass.
6. `FITMENT_READY` passes only when every variant carries a resolved fitment
   identity, and blocks when any variant does not.
7. `HOTSPOT_READY` passes only when every diagram carries position hotspots, and
   blocks while diagram identity collisions remain.
8. An acquisition-backlog model is never customer-visible and never counted as
   observed.
9. No ledger entry is ever `customerVisible` while its evaluation is not
   `customerReady` — asserted on a synthetic ledger unconditionally, and on the
   published snapshot when one is present.
10. `globalDiagramIdentitySafe` is true exactly when the cross-maker collision
    count is zero, in both directions.
11. A failing integrity gate names `node_id` or `DGM` in its notes, so the cause
    is stated rather than implied.
12. Combined maker and model counts lie between the larger of the two inputs and
    their sum, and customer-ready models never exceed observed models.

13. `DIAGRAM_READY` requires positive evidence that stable DGM IDs were minted,
    not merely the absence of cross-maker `node_id` collisions — a single-maker
    catalogue collides with nothing — and `HOTSPOT_READY` is held behind it,
    because a hotspot joins its diagram through that ID.

**Not claimed.** No criterion here asserts that catalogue ingest works, that the
`CatalogueIngestBatch` aggregate exists, or that any real vehicle is currently
customer-ready. At the time of writing the eleven-stage gate reports **zero**
customer-ready models, which is the correct answer while the collisions stand.

## Permissions

Replaces `read / create / act`.

```text
spare.catalogue-coverage.read            # ledger and summary, operator-facing
spare.catalogue-coverage.evaluate        # run the readiness evaluation
spare.catalogue-coverage.publish         # write the ledger a release is judged on
spare.catalogue-integrity.read           # collision counts and integrity notes
```

`publish` is separated from `evaluate` deliberately: evaluating is a
non-destructive computation, publishing changes what the customer selector will
honour. They may not be held by the same automated identity.

## What DOMAIN_TESTED requires, and its evidence

1. Every acceptance criterion above has a test that runs — not one that skips.
2. `npm run verify` green, including the ten gates.
3. `node agent-system/bin/source-map.mjs` accepts the gate claim, which requires
   both `code_paths` and `test_paths` to exist and resolve.
4. A CI run of the commit carrying the claim, on Linux, green.

**What this gate does not include.** No independent specialist review has been
performed. This contract was written and proven by the same agent, which is
exactly the arrangement the closure canon's reviewer gate exists to prevent;
`npm run verify` passing is not that review, and neither is any tool output.
Treat `DOMAIN_TESTED` here as "the domain logic is tested and the evidence
re-derives", not as "a second party agreed".

## Open questions

- **Stage evidence freshness (engineering, non-blocking).** Nothing records when
  a stage's evidence was measured, so a pass from a superseded catalogue release
  is indistinguishable from a current one.
- **Publish authority (product, blocking for P1).** Which identity may publish a
  ledger that changes customer-visible inventory, and under what approval.

## Dependencies

- The DGM migration, for any model to reach `customerReady`. Not required for
  this evaluation to be correct — a correct evaluation of an unready catalogue
  returns zero ready models, which is what it does.
- A catalogue. None has been injected. The catalogue is produced outside this
  repository and accepted against
  `24_INJECTION_STANDARDS/CATALOG_DATA_INJECTION_STANDARD_v1.md`, whose rules
  are this feature's inputs stated as obligations on the producer. This feature
  evaluates what arrives; it does not audit a catalogue in flight.
