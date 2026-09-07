# DIAL Consolidated Development Plan v2.2

**Status:** active development authority
**Supersedes:** v2.1, on execution sequence only
**Retains, unchanged:** v2.1's four-layer architecture, its frontend decisions, its
no-go rules, and both customer-ready definitions. All v2.0 closure, security,
money, NFR, eventuality, operational and activation rules continue to apply.

---

## 1. Why v2.2 exists

v2.1 is a good dependency map and a poor execution order.

Its sixteen steps are horizontal: each layer finished before the next begins,
with nothing a customer can see until step 6. Against 244 features that are 23
contracts deep and one feature proven end to end, that defers learning by months
and pushes every integration risk to the far side of the schedule.

Two of its steps also cannot close as written. **Step 3 — money / payment /
ledger / reconciliation** — is gated by `ACT-REG-001`, `ACT-REG-002` and
`ACT-REG-003`, all open, so it completes in sandbox only and is then carried
unfinished through thirteen further steps. **Steps 7 and 8 — Spare vehicle
foundation and transition/EPC migration** — assume the catalogue and flow packs
are built in this repository. They are not: they are produced elsewhere and
injected against `24_INJECTION_STANDARDS`, so those steps are re-read as *receive,
validate, integrate*.

And v2.1 predates 38 of the current 244 features: Grocery Rounds
(`GROC-F019..F034`) and DKRF (`DKRF-F001..F022`). Neither appears in its sequence.


### 2026-09-07 development-system capability — VEKL

`DEC-019` adopts the DIAL Versioned Engineering Knowledge Layer (VEKL) as a horizontal development-system capability, not a product Feature fan-out and not a new source of truth. Every ordinary Oracle development packet resolves a versioned Skill Activation Manifest after Feature/JIT context. Approved specialist skills may improve execution technique, but canon/FRC/security/current code/evidence remain authoritative and the normal contract/reviewer/gate ladder is unchanged.

The first Android qualification wave is now partially production-qualified: Adaptive Compose, Navigation 3, Edge-to-edge and Android Intent Security are approved as exact-pin, exact-hash, immutable `ENGINEERING_GUIDANCE_ONLY` inputs under encoded DIAL constraints. The upstream Android CLI is quarantined for a blocked curl-pipe-shell install instruction and the upstream Testing Setup skill is not directly approved; DIAL-owned safe wrappers are staged for those two procedures. This does not alter the Track A/Grocery Rounds programme priority. VEKL remains an execution-quality multiplier applied to the packet the plan already chooses, not a competing product workstream.

### 2026-09-06 canonical breadth extension — GMPC

The active registry now contains **309** feature anchors: the 244-feature state this plan was adopted against plus **65 `GMPC-F*`** Growth, Marketing & Promotions Control Centre features. The GMPC architecture is adopted at `27_GROWTH_MARKETING_PROMOTIONS/` with 195 atomic feature-to-page controls. All 65 enter at `SPECIFIED`; this breadth addition does not manufacture implementation evidence and does not change the Track A / Grocery Rounds execution priority.

GMPC is horizontal Corporate commercial capability. It depends on the kernel, `PLAT-F014` margin/pricing, Finance/Ledger, consent/privacy, capacity signals, DKRF and governed external adapters. `GMPC-F200..F211` are a commercial DKRF profile over `DKRF-F001..F022`, not a competing knowledge fabric. Campaign/promotion economics therefore consume existing authorities rather than creating another pricing, money, customer or RAG source of truth.

When GMPC implementation starts, use thin vertical commercial slices rather than horizontal fan-out: opportunity → campaign → deterministic promotion → approved creative/channel execution → conversion/fulfilment → contribution attribution → outcome-verified learning. Every participating `GMPC-F*` feature gets its own acceptance contract before code, exactly as §3 requires.

## 2. What does not change

The architecture stands exactly as v2.1 states it:

```text
DIAL v2 deterministic kernel / sources of truth
        ↓
DIAL-owned shared commerce platform
        ↓
Shop-Ecommerce-derived customer frontend composition
        ↓
division-specific specialist experiences
   ├── Spare: Vehicle + Fitment + EPC + CGI/Exploded
   └── Groceries: Store + Pantry + Measures + Substitutions + Slots + Rounds
```

The frontend donor decisions stand. The selected frontend donor does not become
the commerce backend. The Spare transition/EPC subsystem stays technically
independent of the general ecommerce visual layer, and the two meet only through
typed DIAL contracts.

**The no-go rules stand in full, and are extended by three.** v2.1's list has
earned its keep — "do not create another payment/ledger source of truth" is what
caught the Grocery Rounds money conflict before anything was built. Added:

- do not implement a feature before it has its own acceptance contract;
- do not let a Grocery Round credit settle anything outside grocery fulfilment;
- do not price a product from an unevidenced cost input.

## 3. The throttle, stated plainly

**A feature entering implementation gets its own acceptance contract first. The
generic contract is not a contract.**

This is the actual rate limiter on the whole programme, and v2.1 never named it.
At 23 acceptance contracts across 244 features and 8 eventuality test sets across
233 material eventualities, contract authorship — not coding — is the dominant
term in every estimate. A plan that sequences features without pricing their
contracts will be wrong by the size of that gap.

Two consequences worth planning around:

- **Estimate in contracts, not features.** A feature's cost is its contract plus
  its implementation plus its evidence. The first of those is currently the least
  practised.
- **`SPARE-F004` and `SPARE-F001` are the worked examples.** Anyone writing their
  first contract should read `SPARE-F004_ACCEPTANCE_CONTRACT.md` before starting —
  particularly its "Non-goals, and why" section, which is where a contract earns
  its value by refusing to claim what the code does not do.

## 4. Execution: three tracks, not sixteen steps

v2.1's numbered sequence remains the dependency map — nothing below reverses its
ordering. What changes is that the work runs in three concurrent tracks. Track B
runs on other people's calendars, so it starts today — but it gates *activation*,
not development, and nothing in Tracks A or C waits on it.

### Track A — Kernel (unblocked, engineering, starts immediately)

v2.1 step 2: identity, permission, evidence, audit.

The dependency root under all 309 currently registered features, blocked by nothing external, and the
cheapest place to learn the contract-first rhythm — a mistake here is caught by a
test rather than by a customer. Work contract-first, feature by feature. Do not
fan out.

**Exit:** the kernel features at `DOMAIN_TESTED` against real CI, each with its own
acceptance contract, and at least one carrying an independent specialist review so
the review path itself is proven and not merely described.

### Track B — External clock (runs alongside; gates activation, not development)

None of these need a developer, and — the correction that matters — **none of them
blocks building.** They gate taking a real customer's money and publishing a
public price. Confusing the two is how a project waits on other people for work it
could already be doing.

| Item | Gates | Status |
|---|---|---|
| Catalogue and flow pack delivery | Spare customer-ready gates | **In flight.** Produced externally, injected against `24_INJECTION_STANDARDS` and validated by `packages/catalog-coverage/src/injection.ts`. A scheduled dependency, not an open blocker. |
| Broker conversation | publishing a Round tier (`RCM-019` at `TIERS_PUBLISHED`) | Rate resolved as a working figure — see below. The open question is availability and collateral for an unrated principal, not price. |
| Counsel, half an hour | the two questions research could not close | Narrowed from four questions to two: the National Payment Systems Act stored-value position, and the Consumer Protection Act reading of non-redeemability. |
| AML/KYC responsibility matrix | Grocery Rounds taking real money | Genuinely required by `ACT-REG-001`. Unchanged. |

**Three of the original four questions are now closed by research**, recorded with
their primary sources in
`26_MARGIN_AND_PRICING/PROTECTION_AND_LEGAL_RESEARCH_v1.md`:

- **Deposit-taking — no.** The Banking Act's "banking business" is cumulative:
  accepting repayable deposits **and** employing them by lending. Round credits
  fail both limbs independently — nothing is repayable, and the money buys stock
  rather than being lent.
- **Insurance intermediation — no.** An agent acts on behalf of an insurer, a
  broker on behalf of another person, and insurance business means assuming an
  insurer's obligations. Dial insuring its own delivery obligation and pricing the
  cost into the product is none of the three. The line is exactly where `RCM-019`
  already drew it: registration risk starts only if the member becomes the insured.
- **Protection rate — 4% stands.** Published surety pricing runs 1–3% for contract
  bonds and up to 10% at the licence-bond end, so 4% for an unrated principal is
  defensible planning. Trade credit insurance rates were the wrong comparator; they
  cover a seller against a buyer, which is the opposite exposure.

**Exit:** the AML/KYC matrix delivered, the broker question answered on
availability, and the two counsel questions closed. Each has a date or it is not a
plan.

### Track C — Margin and pricing engine (near-unblocked, high leverage)

`26_MARGIN_AND_PRICING/MARGIN_ENGINE_SPEC_v1.md`, phases 1 and 2. Pure
calculation, no external dependency, and it sets pricing for every division.
Blocked only on three stakeholder answers — module and Feature ID, v1 scope, and
who owns cost inputs — none of which cost anything but a decision.

**Exit:** a Round product priced by the engine, from evidenced inputs, with the
refusal path proven on a missing input.

## 5. The milestone that matters

**The Grocery Rounds vertical slice at `STAGING_GREEN`** — the master plan's §26,
sixteen steps from *create Round* to *reconcile and complete*, exercising kernel,
money, entitlement and frontend contracts together at small scale.

It is chosen, not deferred. The two candidates are not equally blocked:

- **Grocery Rounds is buildable now.** Its money model is locked (`DEC-001..007`)
  and enforced by `packages/round-credit`; the deposit-taking and intermediation
  questions are closed by research; the protection rate has a defensible figure;
  and the sandbox `EscrowAdapter` exists for exactly this. Every remaining Track B
  item gates taking real money, not writing code. All sixteen §26 steps can reach
  `STAGING_GREEN` without another party answering anything.
- **Spare reaches a demo sooner than a proof.** It can run against
  `examples/hilux-an130/`, but that pack's hand-authored DGM ids are rejected by
  `isProductionDgmId`, so the eleven-stage gate correctly reports zero
  customer-ready vehicles throughout. The slice would prove the plumbing and not
  the product. It becomes the stronger slice the moment a real catalogue lands, and
  that work is scheduled rather than blocked.

**The real cost of the slice, stated up front.** §26 touches roughly six of
`GROC-F019..F034` — agreement and consent, the Round ledger, entitlement,
allocation, procurement lock, delivery — and none of them has an acceptance
contract. Six contracts is the first fortnight, before any implementation. That is
not a reason to choose differently; it is the price of the first slice under §3's
throttle, and it is the same price whichever slice is chosen.

## 6. Where late canonical extensions sit

**Grocery Rounds — `GROC-F019..F034`.** Its money model is LOCKED at `DEC-001` to
`DEC-007` and enforced by `packages/round-credit` rules `RCM-001..027`. Credits are
not money, so Rounds does **not** consume the step-3 payment/ledger path for its
subscriptions, and the v2.1 sequence's dependency on step 3 is weaker here than it
looks. All sixteen features remain `SPECIFIED` on generic contracts; none is
implemented. The vertical slice in the master plan §26 is the right first bite.

**DKRF — `DKRF-F001..F022`.** Sits alongside the kernel as a retrieval fabric, not
inside the commerce path. It is not on the critical path to the vertical slice and
should not compete with Track A for attention until the kernel exits.

**GMPC — `GMPC-F*` (65 feature anchors).** Adopted 2026-09-06 as the horizontal Growth, Marketing & Promotions Control Centre. All are `SPECIFIED`. The source document contains the 195 atomic feature/page controls, the commercial workflow, promotion determinism, external connector boundaries and the commercial DKRF profile. It is canonical breadth but not permission for broad fan-out: implementation remains contract-first and should begin only as bounded commercial vertical slices after the current priority work permits it.

**Catalogue and transition flow packs.** No longer built here. They arrive as
injections validated by `packages/catalog-coverage/src/injection.ts` against
`24_INJECTION_STANDARDS`. v2.1 steps 7 and 8 are re-read as *receive, validate,
integrate* — a smaller job on an external clock, and the reason Track B's first row
is the most schedule-critical item in this document.

**Margin engine.** `DEC-008`, PROPOSED. Not yet allocated a Feature ID; see Track C.

## 7. Definitions of build-ready and customer-ready

Unchanged from v2.1, and repeated here because they are the gates the tracks aim
at:

**The shared commerce frontend is build-ready when** the exact donor
commit/licence is recorded; the selected frontend source-path map exists; the DIAL
target component map exists; the donor dependency/security scan is green; the DIAL
design-system token mapping exists; the public responsive shell works without the
donor backend; and customer actions are driven by DIAL state.

**A Spare flow is customer-ready when**, in addition to normal commerce
certification, the selected vehicle passes all eleven transition/catalogue
readiness gates and direct EPC fallback.

**A Grocery flow is customer-ready when**, in addition to normal commerce
certification, stock/availability honesty, substitutions, weighted goods, final
total, slot/capacity, fulfilment route, cold-chain/recall and support/recovery all
pass their FRC, eventuality and security tests.

**A Grocery Round is customer-ready when**, additionally, its Round product is
conformant under `validateRoundCreditModel` with zero findings, its protection
cover is bound, and `ACT-REG-001`, `ACT-REG-004` and `ACT-REG-007` are answered for
the Rounds construct.

## 8. Honest state at adoption

Recorded so that a reader six months from now knows what this plan was written
against, and `BUILD_READINESS_SCORECARD.json` remains the live version:

- 244 features; 23 per-feature acceptance contracts; 8 eventuality test sets across
  233 material eventualities. CT-1, CT-2 and CT-7 all AMBER.
- 15 items at `DOMAIN_TESTED`, 15 at `CODE_PRESENT`; everything else `SPECIFIED`.
- One feature — `SPARE-F004` — proven against real CI. Its contract was written and
  proven by the same agent; the reviewer gate on it is unresolved in the record.
- All eleven activation blockers OPEN.
- Identity fidelity WAIVED at IoU 0.545–0.589 against a 0.90 threshold, not met.
- No catalogue injected, so the eleven-stage gate correctly reports zero
  customer-ready vehicles.
- `npm run verify` green: 13 gates, 196 tests, none skipped. CI green on three jobs.

Broad feature fan-out remains **unauthorised**. Controlled foundation engineering
is authorised, which is precisely what Track A is.
