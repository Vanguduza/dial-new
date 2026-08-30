# GROC-F024 — Round ledger & accounting

**Fifth feature of the Grocery Rounds vertical slice (`DEC-009`).** The one the
locked money decisions actually land in.

| | |
|---|---|
| Aggregate | `RoundLedgerEntry` |
| Owner | `groceries` (posting into the canonical ledger kernel, never beside it) |
| Client exposure | CUSTOMER — members see their own position |
| Security tier | S4 — records what a member paid and what Dial owes |
| Target gate | `DOMAIN_TESTED` |
| Governing sources | `GROCERY_ROUNDS_MASTER_PLAN_v1.md` §9; `ROUND_CREDIT_MODEL_v1.md` C4; `DEC-003`, `DEC-004` |
| Current state | `SPECIFIED` — no code |

---

## What this feature actually is

§9 gives fourteen event names, a double-entry separation list, and one sentence
that is the whole feature:

> Customer grocery obligations must never be confused with free corporate cash or
> operating profit.

That is `DEC-004` stated before `DEC-004` existed. Money arriving for groceries not
yet delivered is a **contract liability**, and it becomes revenue when the
groceries transfer — never when the cash does. Getting this wrong reports unearned
profit, attracts income tax on it, and tells management the float is spendable
margin, which is review finding B2's failure mode reached through the accounts
rather than through bad luck.

So this feature owns four things:

1. an **append-only** event log where corrections are reversals and nothing is
   edited or deleted (§9);
2. the **posting rules** that turn each of §9.2's events into movements across
   §9.3's separated balances;
3. the **invariants** that must hold after every event, including `RCM-010`'s —
   contract liability equals unsettled credit value, derived two ways;
4. the **split** of each payment across credit pools at the ratio fixed when it was
   taken (`DEC-003`, `RCM-024`), with the VAT extracted per pool.

It reuses `packages/round-credit` rather than restating it. The ledger is where the
credit model stops being a validator and starts being an account.

### Non-goals, and why

- **Being a second ledger.** §9 says the Round ledger reuses Dial's canonical
  ledger and accounting kernel, and `CLAUDE.md` forbids a second money authority.
  This feature computes postings; it does not own the ledger they post into. The
  distinction is not cosmetic — it is the difference between a projection and a
  parallel source of truth.
- **Payments.** Taking money is `ACT-REG-002`/`ACT-REG-003` and is not built. This
  feature records that a payment was recognised; it does not recognise it.
- **Entitlement and allocation.** `GROC-F027` and `F028`. The ledger records what
  was paid and what is owed, not who gets which packet of maize meal.
- **The VAT return.** `RCM-023`'s dated schedule tells this feature the rate. Filing
  is the accounting system's job.
- **Persistence.** Pure functions over an event sequence.

---

## Requirements

### P0 — cannot ship without

**R1 — Append-only, with reversals rather than edits.** No function removes or
mutates an event. A correction is a new event that negates an earlier one, and a
reversal of a non-existent or already-reversed event is refused.

**R2 — Every §9.2 event has a posting rule.** Each of the fourteen event names maps
to defined movements, and an event with no rule is refused rather than silently
ignored.

**R3 — Cash never becomes revenue on arrival.** `purchase_paid` increases collected
value and the customer grocery obligation. It increases revenue by nothing.
Revenue moves only on `goods_delivered`.

**R4 — §9.3's balances stay separated.** Customer prepaid obligation, collected
value, procurement cost, allocated inventory, delivered fulfilment, refunds,
insurer recoveries, supplier recoveries, logistics cost, supplier rebates and
realised margin are distinct and independently derivable.

**R5 — The contract-liability invariant holds after every event.** Outstanding
obligation equals unsettled credit value, computed from the money and from the
credit register independently (`RCM-010`). A divergence halts rather than warns.

**R6 — Payments split by pool, with VAT per pool.** A recognised payment allocates
across the Round's pools at the split fixed for that payment, and the standard-rated
pool's VAT is extracted from it rather than added to it (`DEC-003`).

**R7 — A member's position is derivable from events alone.** No stored balance is
authoritative. Review finding M2 requires that entitlement snapshots be
recomputable rather than trusted, and the same must be true here.

**R8 — Money is integer minor units throughout**, and every posting balances: the
movements of an event sum to zero across the separated balances.

**R9 — Refusals, not warnings**, with rule id, observed value and remedy.

### P1 — fast follow

- `entitlement_adjusted`, which review finding M5 notes is missing from §9.2 —
  substitutions and residual treatment change what a member receives and are
  currently invisible in the audit timeline §8 promises.
- Period close, producing the figures `PLAT-F014` reconciles modelled margin
  against.

### P2 — design for, do not build

- Multi-currency Rounds. `DEC-002` denominates credits in monetary value, and which
  currency is a live question in a dual-currency economy.

---

## Acceptance contract

`tests/round-ledger.test.ts`, in the `gates, types and unit suites` CI job.

1. Appending an event returns a new log; the input log is unchanged.
2. No exported function removes or edits an event.
3. A reversal of an unknown event is refused.
4. A reversal of an already-reversed event is refused.
5. A reversal negates the original's movements exactly.
6. An event kind with no posting rule is refused, naming the kind.
7. `purchase_paid` moves nothing into revenue.
8. `goods_delivered` is the only event that recognises revenue.
9. Every event's movements sum to zero across balances.
10. Balances are independently derivable from the event log.
11. The contract-liability invariant holds across a full Round: contributions,
    settlement, a default, a reversal.
12. A forced divergence between the two derivations is detected and refused.
13. A payment splits across pools at the fixed ratio and the parts sum to the
    payment exactly.
14. VAT is extracted from the standard-rated pool's share, not added to it, and the
    exempt pool carries none.
15. A member's position — paid, owed, settled — is computed from events with no
    stored balance consulted.
16. Non-integer or negative money is refused.

**Not claimed.** No criterion asserts that a payment was actually received, that
postings reached the canonical ledger, that a VAT return is correct, or that
anything is persisted.

## Permissions

```text
groceries.round-ledger.read           # a member's own position
groceries.round-ledger.read-all       # operator-facing, all members
groceries.round-ledger.append         # record a recognised event
groceries.round-ledger.reverse        # record a correcting reversal
```

`reverse` is separated from `append` because a reversal states that something
previously recorded was wrong, which is a different act with a different approval.

## What DOMAIN_TESTED requires, and its evidence

1. Every acceptance criterion has a test that runs.
2. `npm run verify` green, including all thirteen gates.
3. `source-map.mjs` accepts the gate claim.
4. A green CI run of the commit carrying the claim, on Linux.

**What this gate does not include.** No independent specialist review. This is the
feature most clearly triggering the **money reviewer** under the closure canon, and
the implementing agent cannot self-certify it. Treat `DOMAIN_TESTED` here as "the
posting rules and invariants are tested", not as "the accounting is right".

## Open questions

- **Which canonical ledger interface these postings target (engineering, blocking
  for integration).** §9 requires reuse of the kernel; the kernel is not built, so
  the posting shape here is defined by DIAL's separated balances rather than by an
  interface that exists.
- **Residual treatment (product, blocking).** Review finding H3: §11.4's "approved
  residual treatment" has no owner, and unallocatable residual across many members
  is real money. Until it is a rule and a ledger event, this feature has no posting
  for it.

## Dependencies

- **`packages/round-credit`** — `projectCreditLedger`, `assertContractLiabilityInvariant`
  and `allocatePayment`. Built and locked.
- **`GROC-F019`, `F020`, `F022`** — configuration, lifecycle and membership. Built.
