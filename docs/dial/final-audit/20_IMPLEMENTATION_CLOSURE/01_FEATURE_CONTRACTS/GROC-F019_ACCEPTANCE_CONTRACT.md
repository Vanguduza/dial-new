# GROC-F019 — Round plans & configuration

**Second feature of the Grocery Rounds vertical slice (`DEC-009`).**

| | |
|---|---|
| Aggregate | `RoundPlan` |
| Owner | `groceries` |
| Client exposure | CUSTOMER — `DIAL_CONSUMER`, `DIAL_WEB`, `WHATSAPP` |
| Security tier | S2 — internet-facing, configuration-driven, no money movement of its own |
| Target gate | `DOMAIN_TESTED` |
| Governing sources | `GROCERY_ROUNDS_MASTER_PLAN_v1.md` §5; `ROUND_CREDIT_MODEL_v1.md`; `DEC-001`–`DEC-007` |
| Current state | `SPECIFIED` — no code |

---

## What this feature actually is

§5 reads as two things and is one. §5.1 publishes ready-made plan families —
Starter, Household, Extended, Annual, Campaign — and §5.4 lets a customer
configure a custom Round. The registry's generic contract would make this a CRUD
resource with a create command and a name field.

It is not that. **A Round configuration is a choice made inside a plan's bounds,
never a free-form document.** The plan is the authority; the creator picks within
it. That single sentence is what makes three separate governance problems the same
problem:

- `RCM-026` — Dial authors the credit pools and their catalogues, because tax
  classification is not a creator-facing knob;
- review finding **M4** — creator-set voting thresholds need central bounds, or a
  minority can be configured into binding a majority;
- §5.4's own *"within Dial-approved min/max"*, *"within allowed product range"*,
  *"within governance bounds"*, which appear four times and are enforced nowhere.

So this feature owns the **bounds**, and refuses a configuration that leaves them.

It is also the point where a Round product becomes a credit product. A
configuration is not valid unless the credit posture it produces is conformant
under `validateRoundCreditModel` — which is how `DEC-001` through `DEC-007` reach
a real Round rather than remaining a document.

### Non-goals, and why

- **Publishing plans.** Which plan families exist, and their bounds, is a
  commercial decision by `groceries`. This feature validates against a plan; it
  does not author one.
- **Moderation.** §5.4 requires profanity and moderation checks on the Round name.
  That is a content-safety service with its own failure modes and its own vendor
  question. This feature refuses an empty or over-long name and no more, and says
  so rather than implying a check it does not perform.
- **Persistence and discovery.** The public Round Marketplace of §5.2, and any
  storage, belong elsewhere. The domain here is pure.
- **Pricing.** What a plan should cost is `PLAT-F014`'s question (`DEC-008`). This
  feature enforces that a contribution sits inside the plan's band; it has no view
  on whether the band is right.
- **Human validation of public Rounds.** §5.2 requires it "where required". Which
  Rounds require it, and who performs it, is undefined in the source and is left
  undefined here rather than invented.

---

## Requirements

### P0 — cannot ship without

**R1 — Every §5.4 field is bounded by the plan, and a configuration outside any
bound is refused.** Contribution amount, duration, member minimum and maximum,
join cut-off, visibility, membership mode, delivery zone, basket mode and voting
threshold each validate against the plan, and each refusal names the field, the
observed value and the bound it left.

**R2 — Dates are consistent with cadence.** Maturity must equal the start date
advanced by the plan's duration at the contribution frequency. A six-month monthly
Round whose maturity is five months out cannot collect six instalments, and
discovering that at month five is discovering it too late.

**R3 — The join cut-off precedes maturity and admits at least one instalment.**
§5.4 exists to prevent late-join entitlement ambiguity; a cut-off after maturity,
or one leaving no time to contribute, prevents nothing.

**R4 — Member bounds are coherent and satisfiable.** Minimum members no greater
than maximum, minimum at least one, and a minimum the plan permits.

**R5 — The creator configures commerce, never tax.** A configuration may not
declare credit pools, tax classes or catalogues. Those come from the plan
(`RCM-026`). A configuration attempting to carry them is refused rather than
having them silently ignored, because silently ignoring them is how a creator
believes they set something they did not.

**R6 — The voting threshold sits inside central governance bounds.** A creator may
choose within the plan's band and no further (review finding M4).

**R7 — A valid configuration produces a conformant credit product.** The
configuration composed with its plan must pass `validateRoundCreditModel` with zero
findings. A configuration that would produce a non-conformant Round is refused
here, not at first payment.

**R8 — Refusals, not warnings.** Every finding carries a rule id, the observed
value and a remedy. Any finding at all means the configuration does not open.

### P1 — fast follow

- Name moderation, once a content-safety service exists.
- Plan versioning, so a Round records the bounds it was created under and a later
  bound change cannot retroactively invalidate a live Round.

### P2 — design for, do not build

- Non-monthly contribution frequencies. §5.4 says "monthly initially; architecture
  extensible", so the cadence is modelled as a value rather than assumed.
- Campaign plans with Dial-defined durations outside the standard ranges.

---

## Acceptance contract

Replaces the generic contract. Each criterion names its test.
`tests/round-plan.test.ts` runs in the `gates, types and unit suites` CI job.

1. A contribution below the plan's minimum is refused, naming the bound.
2. A contribution above the plan's maximum is refused, naming the bound.
3. A duration outside the plan's allowed range is refused.
4. A maturity date inconsistent with start plus duration at cadence is refused.
5. A join cut-off at or after maturity is refused.
6. A join cut-off before the start date is refused.
7. A minimum member count above the maximum is refused.
8. A member minimum below the plan's floor is refused.
9. A configuration declaring its own credit pools, tax class or catalogue is
   refused (`RCM-026`).
10. A voting threshold outside the plan's governance band is refused (M4).
11. A private Round with an open membership mode is refused as incoherent.
12. A configuration with no delivery zone is refused, because free-delivery
    economics depend on it.
13. A configuration whose composed credit product is non-conformant is refused, and
    the credit model's own findings are surfaced rather than summarised away.
14. A configuration inside every bound opens, and composes to a conformant Round
    credit product with zero findings.

**Not claimed.** No criterion asserts that a plan's bounds are commercially
correct, that a Round name is appropriate, that anything is persisted, or that a
public Round has been validated by a human.

## Permissions

```text
groceries.round-plan.read            # read published plans and their bounds
groceries.round-plan.publish         # author or amend a plan's bounds
groceries.round-configuration.create # configure a Round within a plan
groceries.round-configuration.read
```

`publish` is separated from `create` deliberately: publishing moves the bounds
every future Round is configured inside, and creating chooses within them. They may
not be held by the same automated identity.

## What DOMAIN_TESTED requires, and its evidence

1. Every acceptance criterion has a test that runs — not one that skips.
2. `npm run verify` green, including all thirteen gates.
3. `node agent-system/bin/source-map.mjs` accepts the gate claim.
4. A CI run of the commit carrying the claim, on Linux, green.

**What this gate does not include.** No independent specialist review. S2 does not
trigger the money reviewer, but the composition with `round-credit` touches the
money model, and the implementing agent cannot self-certify that boundary.

## Open questions

- **Who validates a public Round, and against what (product, blocking for §5.2).**
  The source says "where required" and does not say when it is required.
- **Plan bound changes against live Rounds (product, blocking for P1).** If a plan's
  minimum contribution rises, what happens to Rounds already running under the old
  bound? Silence here becomes a retroactive term change.

## Dependencies

- **`packages/round-credit`** — the credit posture a configuration composes to.
  Built and locked.
- **`GROC-F021`** — the consent gateway that gates Round creation. Built, at
  `DOMAIN_TESTED`.
