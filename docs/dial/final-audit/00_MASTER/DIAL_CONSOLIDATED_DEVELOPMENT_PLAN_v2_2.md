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
injected against `24_INJECTION_STANDARDS`, on a clock this team does not control.

And v2.1 predates 38 of the current 244 features: Grocery Rounds
(`GROC-F019..F034`) and DKRF (`DKRF-F001..F022`). Neither appears in its sequence.

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
ordering. What changes is that the work runs in three concurrent tracks, because
two of the three are waiting on parties outside this team and starting them late
is the single most expensive available mistake.

### Track A — Kernel (unblocked, engineering, starts immediately)

v2.1 step 2: identity, permission, evidence, audit.

The dependency root under all 244 features, blocked by nothing external, and the
cheapest place to learn the contract-first rhythm — a mistake here is caught by a
test rather than by a customer. Work contract-first, feature by feature. Do not
fan out.

**Exit:** the kernel features at `DOMAIN_TESTED` against real CI, each with its own
acceptance contract, and at least one carrying an independent specialist review so
the review path itself is proven and not merely described.

### Track B — External clock (starts today, no engineering)

None of these need a developer, all of them gate something, and each runs on
someone else's calendar:

| Item | Gates | Owner |
|---|---|---|
| Catalogue delivery schedule from the producing pipeline | every Spare customer-ready gate; the whole Spare slice | Catalogue / `ACT-REG-011` |
| AML/KYC responsibility matrix | Grocery Rounds taking real money (review H5) | `ACT-REG-001` |
| Protection broker quote | Round tier pricing (`RCM-019`, review H2) | `ACT-REG-007` |
| Counsel meeting — four questions in one sitting | exempt schedule, voucher provision, in-kind exit, protection wording | `ACT-REG-004`, `ACT-REG-001`, `ACT-REG-007` |
| ZIMRA ruling, only if deferral is wanted | `RCM-007` | `ACT-REG-004` |

**Exit:** each item either delivered or returned with a date. A date is a result;
silence is not.

### Track C — Margin and pricing engine (near-unblocked, high leverage)

`26_MARGIN_AND_PRICING/MARGIN_ENGINE_SPEC_v1.md`, phases 1 and 2. Pure
calculation, no external dependency, and it sets pricing for every division.
Blocked only on three stakeholder answers — module and Feature ID, v1 scope, and
who owns cost inputs — none of which cost anything but a decision.

**Exit:** a Round product priced by the engine, from evidenced inputs, with the
refusal path proven on a missing input.

## 5. The milestone that matters

**One vertical slice at `STAGING_GREEN`** — a single customer journey from action
to fulfilled outcome, exercising kernel, money, catalogue and frontend contracts
together at small scale.

Do not choose the slice now. Both candidates are blocked on Track B, and which
unblocks first is not yet known:

- **Spare slice** — vehicle resolution → transition → hit region → part → cart →
  order. The differentiated product, and the one with the most existing code. It
  cannot be proven without an injected catalogue.
- **Grocery Rounds slice** — the master plan's §26, against the locked credit
  model in `packages/round-credit`. It has no catalogue dependency and can run
  against the sandbox `EscrowAdapter`, but it cannot take real customer money
  until the AML/KYC matrix, the broker quote and counsel are done.

Choose when Track B reports. Until then, build the slice's contracts — that work
is useful under either answer.

## 6. Where the 38 late features sit

**Grocery Rounds — `GROC-F019..F034`.** Its money model is LOCKED at `DEC-001` to
`DEC-007` and enforced by `packages/round-credit` rules `RCM-001..027`. Credits are
not money, so Rounds does **not** consume the step-3 payment/ledger path for its
subscriptions, and the v2.1 sequence's dependency on step 3 is weaker here than it
looks. All sixteen features remain `SPECIFIED` on generic contracts; none is
implemented. The vertical slice in the master plan §26 is the right first bite.

**DKRF — `DKRF-F001..F022`.** Sits alongside the kernel as a retrieval fabric, not
inside the commerce path. It is not on the critical path to the vertical slice and
should not compete with Track A for attention until the kernel exits.

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
