# GROC-F020 — Round lifecycle

**Third feature of the Grocery Rounds vertical slice (`DEC-009`).**

| | |
|---|---|
| Aggregate | `GroceryRound` |
| Owner | `groceries` |
| Client exposure | CUSTOMER |
| Security tier | S4 — the state machine gates every money-adjacent action in the Round |
| Target gate | `DOMAIN_TESTED` |
| Governing sources | `GROCERY_ROUNDS_MASTER_PLAN_v1.md` §7, §10, §16; `DEC-001`, `DEC-005` |
| Current state | `SPECIFIED` — no code |

---

## What this feature actually is

§7 draws seventeen states in a column with arrows between them, and nine exception
states in a list with no arrows at all. The column is the easy half. **The feature
is the arrows that are not drawn** — which exception state is reachable from
where, what returns from a pause, and what a transition requires before it is
allowed.

Two properties from §7 carry most of the weight:

> Every state transition must be auditable and, where appropriate, idempotent.

**Auditable** means a transition returns a record, not a mutated object. A state
machine that changes a field and returns void has already lost the only artefact
anyone will want during a dispute.

**Idempotent where appropriate** is the harder half, and it is a distributed-systems
requirement wearing product clothing: a member's payment webhook will arrive twice,
a retry will re-drive the same transition, and the second attempt must not fail
loudly or advance twice. Re-entering the state you are already in is a no-op that
succeeds.

### The finding this feature surfaces

§7 lists an exception state named **`REFUNDING`**. `DEC-001` and `DEC-005` make
credits non-redeemable in money in every circumstance — a leaving member receives
groceries at standard retail, never cash.

The state is not wrong; the name is dangerous. A state called `REFUNDING` will be
read as *money back* by every support agent, operations dashboard and integration
that ever sees it, and `RCM-002`'s whole point is that a single kindly cash refund
is evidence that credits are repayable. So this feature **permits the state and
refuses the meaning**: entering it requires a declared in-kind outcome, and a cash
outcome is refused at the transition rather than at the payment run.

The naming itself is recorded as an open question rather than changed, because
renaming a state in a locked plan is a product decision.

### Non-goals, and why

- **What happens inside a state.** Basket planning, quoting, allocation and
  delivery are `GROC-F025` through `F032`. This feature owns whether a Round may
  be in a state, never what it does there.
- **Persistence, events, projections.** The domain is pure; the outbox arrives with
  `GROC-F024`.
- **Time.** Nothing here reads a clock. Whether the join cut-off has passed is an
  input, so the machine is testable and a Round cannot advance because a test ran
  slowly.
- **Authorisation.** Who may drive a transition is the permission layer's. This
  feature says which transitions exist and what they require.

---

## Requirements

### P0 — cannot ship without

**R1 — Only §7's transitions are legal.** Every other transition is refused,
naming the states and what is reachable instead. The seventeen-state main line runs
in order; nothing skips.

**R2 — Transitions are auditable.** A successful transition returns a record
carrying from, to, the actor, the reason and the moment — not a mutation.

**R3 — Re-entering the current state is an idempotent no-op.** It succeeds, is
marked idempotent, and produces no second audit record. §7 requires this and a
retried webhook depends on it.

**R4 — Guarded transitions refuse when their condition is unmet.** `MINIMUM_REACHED`
requires the member minimum; `ACTIVE` requires every member to have accepted the
agreement (`GROC-F021`); `PROCUREMENT_LOCKED` requires recorded member approval;
`ALLOCATION` requires goods received.

**R5 — `FAILED_TO_FORM` is reachable only from `OPEN_FOR_MEMBERS`, and only once the
join cut-off has passed.** A Round that has not yet closed to joiners has not
failed to form; it is simply not full.

**R6 — `PAUSED` and `UNDER_REVIEW` return to where they came from.** Resuming
restores the prior state, and a resume with no recorded prior state is refused
rather than guessed.

**R7 — `REFUNDING` requires an in-kind outcome.** A cash outcome is refused,
citing `DEC-005`.

**R8 — Terminal states are terminal.** `COMPLETED`, `CLOSED`, `CANCELLED` and
`FAILED_TO_FORM` have no outbound transitions, and attempting one is refused.

**R9 — Refusals, not warnings**, with rule id, observed value and remedy.

### P1 — fast follow

- Transition authorisation, once the permission layer exists.
- A projection of the audit trail for the Round Room's timeline (`GROC-F030`).

### P2 — design for, do not build

- Compensating transitions for `DISPUTED` and `INSURANCE_EVENT`, which need §16's
  claim flow to exist first.

---

## Acceptance contract

`tests/round-lifecycle.test.ts`, in the `gates, types and unit suites` CI job.

1. The seventeen-state main line advances in order, each step legal.
2. A transition skipping a main-line state is refused, naming what is reachable.
3. A backward transition on the main line is refused.
4. A successful transition returns an audit record carrying from, to, actor,
   reason and timestamp.
5. Re-entering the current state succeeds, is marked idempotent, and adds no
   second audit record.
6. `MINIMUM_REACHED` is refused below the member minimum and allowed at it.
7. `ACTIVE` is refused while any member has not accepted the agreement.
8. `PROCUREMENT_LOCKED` is refused without recorded member approval.
9. `ALLOCATION` is refused before goods are received.
10. `FAILED_TO_FORM` is refused from any state but `OPEN_FOR_MEMBERS`.
11. `FAILED_TO_FORM` is refused before the join cut-off has passed.
12. `PAUSED` records where it came from, and resuming returns exactly there.
13. Resuming with no recorded prior state is refused rather than guessed.
14. `REFUNDING` with a cash outcome is refused, citing `DEC-005`.
15. `REFUNDING` with an in-kind outcome is allowed.
16. Every terminal state refuses every outbound transition.

**Not claimed.** No criterion asserts anything is persisted, that a transition was
authorised, that time has passed, or that the work inside a state was performed.

## Permissions

```text
groceries.round.read
groceries.round.transition          # drive a main-line transition
groceries.round.exception           # drive an exception transition
groceries.round.resume              # return from PAUSED or UNDER_REVIEW
```

`exception` is separated from `transition` because the exception states are where a
Round stops behaving as sold, and `resume` from both because restoring a Round to
its prior state after a review is a decision, not a continuation.

## What DOMAIN_TESTED requires, and its evidence

1. Every acceptance criterion has a test that runs.
2. `npm run verify` green, including all thirteen gates.
3. `source-map.mjs` accepts the gate claim.
4. A green CI run of the commit carrying the claim, on Linux.

**What this gate does not include.** No independent specialist review. S4 triggers
the security and money reviewers, which the implementing agent cannot self-certify.

## Open questions

- **`REFUNDING` is a misleading state name (product + legal, blocking for P1).**
  It means in-kind settlement and reads as cash. The code refuses the cash meaning;
  the name still teaches everyone who sees it the wrong thing. Renaming a state in
  a locked plan is a product decision and is not taken here.
- **Who may pause a Round, and for how long (product).** `PAUSED` has no maximum
  duration in §7, so a Round can be parked indefinitely with members' value in it.

## Dependencies

- **`GROC-F021`** — acceptance, for R4's `ACTIVE` guard. Built.
- **`GROC-F019`** — configuration, for the member minimum and join cut-off. Built.
