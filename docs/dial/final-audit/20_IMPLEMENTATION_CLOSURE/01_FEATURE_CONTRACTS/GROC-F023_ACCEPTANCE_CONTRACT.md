# GROC-F023 — Prepaid purchase schedule

**Sixth feature of the Grocery Rounds vertical slice (`DEC-009`).** The one that
tells the ledger what a member actually owes, and when.

| | |
|---|---|
| Aggregate | `RoundPurchaseSchedule` |
| Owner | `payments/ledger` |
| Client exposure | CUSTOMER — a member sees their own instalments |
| Security tier | S2 — canonical Feature Security Profile; internet-facing transactional feature |
| Target gate | `DOMAIN_TESTED` |
| Governing sources | `GROCERY_ROUNDS_MASTER_PLAN_v1.md` §5.4, §9.2, §10, §17, §26 step 4 |
| Current state | `SPECIFIED` — no code, no contract of its own (`ACT-REG-004`) |

---

## What this feature actually is

`packages/round-ledger` already declares `purchase_due`, `purchase_processing`,
`purchase_failed` and `late_purchase` as ledger event kinds, and posts zero
movements for every one of them — "intentions and failures move no money. They
are timeline, not ledger." Nothing in the repository decides *when* a
`purchase_due` becomes true, *whether* a recorded payment is the full instalment
or a `partial_purchase`, or *whether* a due date has passed without one — the
ledger only knows how to post whichever kind it is handed. `round-ledger`'s own
`recordPayment` hands it exactly one kind, unconditionally: every payment it
records is posted as `purchase_paid`, in full, no matter what was actually owed.

That gap is this feature. §9.1's six-line table —

```text
Month 1       US$100
Month 2       US$100
...
Total prepaid grocery purchases: US$600
```

— is not free-form bookkeeping; it is `contributionMinor` repeated
`durationMonths` times, one month apart from `startDate`, and `round-plan`
already carries both. Turning that configuration into a dated, amount-bearing
schedule, and turning a member's history of recorded payment attempts against it
into a status per instalment, is the whole of what makes §26 step 4 — "complete
prepaid grocery purchase" — a checkable fact rather than a payment provider's
opinion.

So this feature owns two things:

1. **The schedule.** A pure function of a Round's configuration and a member's
   `joinedAt`: how many instalments, for how much, due when.
2. **The classification.** A pure function from what has actually been recorded
   against an instalment (nothing, a failure, a partial amount, a full amount)
   and the current time, to that instalment's status — and to the one ledger
   event kind and amount that correctly describes it, so that whoever calls
   `round-ledger` cannot mis-post a partial as a `purchase_paid` or a paid
   instalment as `late_purchase`.

### Non-goals, and why

- **Posting to the ledger.** `GROC-F024` owns every movement across §9.3's
  balances. This feature decides what happened and what to call it; F024 decides
  what that does to a balance. `round-ledger`'s `recordPayment` will need to take
  this feature's classification instead of assuming `purchase_paid` — that wiring
  is this feature's integration work, and does not reopen F024's own
  `DOMAIN_TESTED` tests, which asserted the posting rules for event kinds handed
  to it, not how those kinds are chosen.
- **Taking the payment.** Capturing a member's money is `ACT-REG-002`/`ACT-REG-003`
  and is not built. This feature classifies a payment attempt that something else
  already recorded; it does not call a payment provider.
- **Reminders and grace periods.** §15's notification scheduling is a separate
  feature. This feature's `LATE` status is a fact about a due date and a recorded
  amount; when or whether a member is reminded about it is not decided here.
- **Entitlement.** `GROC-F027`/`F028` compute what a member receives from what
  they validly paid. This feature says what was due and what was recorded against
  it; it does not calculate a share of goods.
- **Persistence.** Pure functions over configuration and a recorded-attempt log,
  exactly as `round-ledger` and `round-plan` are.

---

## Requirements

### P0 — cannot ship without

**R1 — The schedule is a pure function of configuration.** Given a Round's
`contributionMinor`, `durationMonths`, `startDate` and (`MONTHLY`, the only
`ContributionFrequency` `round-plan` currently declares) contribution frequency,
`generateSchedule` produces exactly `durationMonths` instalments, one calendar
month apart starting at `startDate`, each for `contributionMinor`. The same
inputs produce byte-identical output on every call.

**R2 — The schedule accounts for the whole contribution, to the minor unit.** The
sum of every instalment's `amountMinor` equals `contributionMinor ×
durationMonths` exactly. `contributionMinor` is already a whole minor-unit
integer (`RPL-003`), so this is exact by construction, not by rounding.

**R3 — A schedule is refused for a member who joined after the Round's start
date.** `RPL-006` and `RMB-002` together permit a member to join at any point
between `startDate` and `joinCutoffDate`, which can be later than `startDate`. No
instalment policy for that member exists in the source (see Open questions), so
`generateSchedule` refuses rather than silently backdating, shortening, or
catching up their schedule.

**R4 — An instalment's status is derived, never stored.** Given a schedule and
the recorded attempts against one of its instalments, `deriveStatus` computes:

- `PENDING` — due date in the future, nothing recorded.
- `DUE` — due date has arrived, nothing recorded.
- `PARTIAL` — an amount less than the instalment's `amountMinor` is recorded, and
  the due date has not yet passed.
- `LATE` — the due date has passed and the total amount recorded against the
  instalment is less than its `amountMinor`, whether that total is zero or
  partial. No grace window is applied (see Open questions).
- `FAILED` — the most recent recorded attempt is a failure and nothing has been
  recorded since.
- `PAID` — the full `amountMinor` has been recorded, regardless of date.

No caller may set a status directly; it is always computed from the recorded
attempts and the clock.

**R5 — `PAID` is terminal and it wins.** Once an instalment's recorded attempts
sum to its full `amountMinor`, its status is `PAID` even if the due date has
since passed, and no further attempt may be recorded against it.

**R6 — A later success supersedes an earlier failure.** A `FAILED` instalment
that subsequently receives a successful attempt becomes `PARTIAL`, `LATE`, or
`PAID` under R4's ordinary rules — never stuck at `FAILED`.

**R7 — Overpayment is refused, not absorbed.** Recording an attempt whose amount
would take an instalment's recorded total past its `amountMinor` is refused
rather than silently applied to a different instalment or carried forward.

**R8 — Double-recording a completed instalment is refused.** An attempt recorded
against an instalment already at `PAID` is refused, naming the instalment.

**R9 — Classification names one ledger event kind and amount, and only one.**
`classifyForLedger` maps a recorded attempt plus the instalment's resulting
status to exactly one of `round-ledger`'s `purchase_due`, `purchase_processing`,
`purchase_paid`, `purchase_failed`, `partial_purchase`, `late_purchase`, with the
amount that kind expects — so that a caller posting to `GROC-F024` cannot itself
choose the kind and get it wrong. A full amount is never classified as
`partial_purchase`; a partial amount is never classified as `purchase_paid`.

**R10 — Refusals, not warnings**, with rule id, observed value and remedy.

### P1 — fast follow

- Grace period before `DUE` becomes `LATE`, once §15's reminder scheduling
  exists to define one. Until then `LATE` fires the instant the due date passes,
  which is the conservative direction to be wrong in.
- Overpayment applied forward to the next instalment, if product decides that is
  the right behaviour rather than a refusal.
- Wiring `round-ledger`'s `recordPayment` to take this feature's classification
  instead of assuming `purchase_paid` unconditionally.

### P2 — design for, do not build

- Non-monthly cadences. `round-plan`'s `ContributionFrequency` is `'MONTHLY'`
  only today; §5.4 calls the architecture "extensible", not extended.
- Rescheduling on Round aggregation (§10, §12.1) — review finding H7 (recorded
  against `GROC-F022`) already flags that aggregation can change terms a member
  accepted, which reopens consent before it reopens a schedule.

---

## Acceptance contract

`tests/round-purchase-schedule.test.ts`, in the `gates, types and unit suites` CI
job.

1. `generateSchedule` produces exactly `durationMonths` instalments for a
   monthly Round, one calendar month apart starting at `startDate`.
2. Every instalment's `amountMinor` equals `contributionMinor`; the total equals
   `contributionMinor × durationMonths` exactly.
3. `generateSchedule` is deterministic: the same configuration and `joinedAt`
   produce byte-identical output across repeated calls.
4. `generateSchedule` refuses a `joinedAt` after the Round's `startDate`.
5. Before its due date, with nothing recorded, an instalment's status is
   `PENDING`.
6. On its due date, with nothing recorded, an instalment's status is `DUE`.
7. After its due date, with nothing recorded, an instalment's status is `LATE`.
8. After its due date, with a partial amount recorded, an instalment's status is
   `LATE`, not `PARTIAL`.
9. Before its due date, with a partial amount recorded, an instalment's status is
   `PARTIAL`.
10. An instalment with its full `amountMinor` recorded is `PAID`, regardless of
    whether the due date has passed.
11. A failed attempt with nothing recorded since leaves the instalment `FAILED`.
12. A successful attempt recorded after a failed one supersedes it: the
    instalment is `PARTIAL`, `LATE` or `PAID` per R4, never `FAILED`.
13. An attempt that would take an instalment's recorded total past its
    `amountMinor` is refused.
14. An attempt recorded against an instalment already `PAID` is refused.
15. `classifyForLedger` never returns `purchase_paid` for a partial amount, and
    never returns `partial_purchase` for the full amount.
16. Every refusal names rule id, observed value and remedy.

**Not claimed.** No criterion asserts that a payment was actually captured by a
provider, that a posting reached the canonical ledger, that a member was
reminded, or that entitlement was computed.

## Permissions

```text
groceries.round-purchase-schedule.read              # a member's own schedule
groceries.round-purchase-schedule.read-all           # operator-facing, all members
groceries.round-purchase-schedule.record-attempt     # record a payment/processing/failure attempt
```

`record-attempt` is deliberately not the same permission as posting to the
ledger (`groceries.round-ledger.append`, `GROC-F024`). Recording that an attempt
happened is a fact about a payment provider callback; deciding what it does to a
balance is a different act with a different authority.

## What DOMAIN_TESTED requires, and its evidence

1. Every acceptance criterion has a test that runs.
2. `npm run verify` green, including all thirteen gates.
3. `source-map.mjs` accepts the gate claim.
4. A green CI run of the commit carrying the claim, on Linux.

**What this gate does not include.** No independent specialist review. The
canonical Feature Security Profile classifies this feature as S2. Money-path
review may still be requested as defence in depth, but it is not part of this
`DOMAIN_TESTED` claim and cannot be self-certified by the implementing agent.

## Open questions

- **Late-join instalment policy (product, blocking for R3).** Nothing in §5.4 or
  §10 says what a member who joins after `startDate` but before
  `joinCutoffDate` owes: a shortened schedule, a catch-up instalment, or a
  schedule anchored to their own join date instead of the Round's. Until product
  decides, this feature refuses rather than guesses.
- **Grace period before `LATE` (product, non-blocking — P1 depends on it).** §15
  is unbuilt, so there is no reminder cadence to derive a grace window from. This
  contract's default is no grace at all.
- **Overpayment handling (product, non-blocking — P1).** Whether an amount past
  an instalment's `amountMinor` should roll forward to the next instalment is
  undecided; refusing it is the safe default, not a considered answer.

## Dependencies

- **`GROC-F019`** — `RoundConfiguration`'s `contributionMinor`, `durationMonths`,
  `startDate`. Built.
- **`GROC-F022`** — `Membership.joinedAt`, for R3. Built.
- **`GROC-F024`** — consumes this feature's classification as the kind and
  amount passed to `appendEvent`/`recordPayment`. Built, but its `recordPayment`
  does not yet call this feature — wiring it is this feature's integration work,
  not a reopening of F024's contract.
- **`ACT-REG-002`/`ACT-REG-003`** — open. Payment capture that would produce a
  real "attempt" to classify is not built; this feature is exercised against
  recorded attempts supplied by tests until it exists.
