# GROC-F022 — Round membership & join control

**Fourth feature of the Grocery Rounds vertical slice (`DEC-009`).**

| | |
|---|---|
| Aggregate | `RoundMembership` |
| Owner | `groceries` |
| Client exposure | CUSTOMER |
| Security tier | S4 — decides who may put value into a Round, and who may take it out |
| Target gate | `DOMAIN_TESTED` |
| Governing sources | `GROCERY_ROUNDS_MASTER_PLAN_v1.md` §4, §5.2, §5.3, §10, §23; `DEC-005`, `DEC-007` |
| Current state | `SPECIFIED` — no code |

---

## What this feature actually is

Joining a Round looks like a button. It is eight conditions that must hold at
once, and the interesting half of this feature is what happens when a member
*stops* — because §10 is where a Round either survives its worst member or
punishes its best ones.

Two sentences from the plan govern more than they appear to:

> §10 — A member's failure to complete all planned instalments must not
> automatically reduce other members' entitlements.

> §4 — Round initiators may organise and moderate but may not withdraw, redirect,
> alter or privately control pooled purchase contributions.

The second one is usually read as being about money. It is also about
**membership**, and that is the reading this feature enforces. A creator who can
remove a member holding credits has redirected pooled value by another route —
the member's entitlement does not vanish, but their standing in the Round that
holds it does. So a creator may moderate a member and may not end their
membership. Review finding H4 makes the same point about representations; this is
the same boundary, one step further in.

### Non-goals, and why

- **Entitlement arithmetic.** How a partial contributor's share is computed is
  `GROC-F027`. This feature preserves the fact of their valid purchases and refuses
  anything that would erase it; it does not calculate.
- **Invitations as artefacts.** §5.3's links, QR codes and invite codes are a
  delivery concern with their own expiry and revocation semantics. This feature
  takes "a valid invitation exists" as an input.
- **Identity and eligibility sources.** Whether a person is who they say, and
  whether they satisfy §5.2's eligibility, come from elsewhere. Supplied as inputs.
- **AML/KYC.** Review finding H5 is real, required by `ACT-REG-001`, and is not
  this feature. Public Rounds pool money from strangers over months; nothing here
  substitutes for that matrix.
- **Notifications.** Reminders and grace-period messaging are §15's.

---

## Requirements

### P0 — cannot ship without

**R1 — Joining requires all eight conditions.** The Round is in a state that
accepts members; the join cut-off has not passed; capacity remains; the applicant
is not already a member; they have recorded acceptance of the agreement in force
(`GROC-F021`); they satisfy eligibility; their delivery zone matches the Round's;
and the membership mode's own requirement is met. A failure names which condition
failed, not that "joining failed".

**R2 — Each membership mode has its own requirement.** `OPEN` needs nothing
further; `REQUEST_TO_JOIN` needs a recorded approval; `INVITATION` needs a valid
invitation. Presenting the wrong evidence for the mode is refused.

**R3 — A creator may moderate a member and may not end their membership.** Removal
by a creator is refused, citing §4. Platform governance may remove; a creator may
not.

**R4 — A Round survives its creator.** The creator leaving or being removed for
misconduct does not close the Round, does not transfer treasury authority, and does
not alter any member's standing (§10, §23).

**R5 — Stopping does not erase what was paid.** A member who stops contributing
moves to a state that preserves their valid purchases. No transition may zero them,
and a transition that would is refused.

**R6 — One member's default never changes another's standing.** Recording a default
alters exactly one membership.

**R7 — Exit settles in kind.** A member leaving takes `DEC-005`'s outcome —
groceries at standard retail, or carry-forward. A cash exit is refused.

**R8 — Capacity is exact.** The maximum is a maximum: the join that would exceed it
is refused, and the join that reaches it succeeds.

**R9 — Refusals, not warnings**, with rule id, observed value and remedy.

### P1 — fast follow

- Grace rules and late status, once §15's reminder scheduling exists.
- Aggregation with compatible Rounds (§10, §12.1), which review finding H7 notes
  may change terms a member accepted and therefore needs its own consent path.

### P2 — design for, do not build

- Waitlists when a Round is full.
- Transfer of membership between people, which is currently impossible by design
  (`DEC-001` — credits are not transferable) and would need that decision reopened.

---

## Acceptance contract

`tests/round-membership.test.ts`, in the `gates, types and unit suites` CI job.

1. A join into a Round not open for members is refused.
2. A join after the cut-off is refused.
3. A join that would exceed capacity is refused; the join that exactly reaches
   capacity succeeds.
4. A join by an existing member is refused.
5. A join with no recorded agreement acceptance is refused (`GROC-F021`).
6. A join by an ineligible applicant is refused.
7. A join from outside the Round's delivery zone is refused.
8. `REQUEST_TO_JOIN` without recorded approval is refused; with it, succeeds.
9. `INVITATION` without a valid invitation is refused; with it, succeeds.
10. A creator attempting to remove a member is refused, citing §4.
11. Platform governance may remove a member.
12. Removing the creator leaves every other membership unchanged and the Round
    open.
13. A member who stops contributing retains their recorded valid purchases.
14. Recording one member's default changes no other membership.
15. An exit with a cash outcome is refused; an in-kind exit succeeds.
16. Every refusal names the failed condition rather than reporting a generic
    failure.

**Not claimed.** No criterion asserts identity, that eligibility was assessed
correctly, that an invitation was securely issued, that AML/KYC was performed, or
that entitlement was computed.

## Permissions

```text
groceries.round-membership.read
groceries.round-membership.join
groceries.round-membership.approve      # approve a request to join
groceries.round-membership.remove       # platform governance only, never the creator
groceries.round-membership.exit
```

`remove` is deliberately not grantable to a Round creator. That is the whole of R3
expressed as a permission rather than a rule, because a rule can be argued with and
a permission that was never granted cannot.

## What DOMAIN_TESTED requires, and its evidence

1. Every acceptance criterion has a test that runs.
2. `npm run verify` green, including all thirteen gates.
3. `source-map.mjs` accepts the gate claim.
4. A green CI run of the commit carrying the claim, on Linux.

**What this gate does not include.** No independent specialist review. S4 triggers
the security and money reviewers, which the implementing agent cannot self-certify.

## Open questions

- **Who is "platform governance" (product + legal, blocking for R11).** §10 says a
  Round continues under platform governance when a creator disappears, and does not
  say which identity that is or what approval it needs.
- **What happens to a removed member's credits (product, blocking).** Removal by
  governance is permitted; whether it forces an exit settlement or leaves the
  membership dormant with its entitlement intact is undefined in the source.

## Dependencies

- **`GROC-F021`** — acceptance, for R1. Built.
- **`GROC-F019`** — configuration, for capacity, cut-off, mode and zone. Built.
- **`GROC-F020`** — lifecycle, for the states that accept members. Built.
- **`ACT-REG-001`** — open. A public Round may not pool real money from strangers
  before the AML/KYC matrix exists.
