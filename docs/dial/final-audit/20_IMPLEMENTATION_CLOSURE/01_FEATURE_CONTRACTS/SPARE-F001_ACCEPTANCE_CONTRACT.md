# SPARE-F001 — Vehicle selection & My Garage

**Pilot feature for RBC-009.** This is the first feature to carry a per-feature
acceptance contract and permission set rather than the generic ones shared by all
186 features. It is therefore also the template for the CT-1 remedy.

| | |
|---|---|
| Aggregate | `VehicleProfile` |
| Archetype | WORKFLOW |
| Security tier | S2 — internet-facing transactional |
| Target gate | DOMAIN_TESTED |
| Governing contract | `22_COMMERCE_FRONTEND_AND_TRANSITION/03_TRANSITION_EPC_SOURCE/DIAL_FULL_CUSTOMER_EXPERIENCE_INTEGRATION_BLUEPRINT.md` (frozen) |
| Current state | CODE_PRESENT — client-side fixture over one hardcoded vehicle |

---

## Problem statement

Vehicle selection is the entry point to the entire Dial a Spare journey: nothing
downstream — transition, EPC browse, fitment, offers, cart — can resolve without
exactly one committed vehicle context. Today the cascade and Garage exist only as
a client-side fixture: `app/garage/page.tsx` renders chassis, engine and market as
literal strings, and there is no persistence of any kind.

Blueprint §7.1 requires Garage state to be server-backed and customer-owned, with
a versioned identity snapshot per saved vehicle. Until that exists, a customer
cannot keep a vehicle between sessions or devices, catalog release changes cannot
be revalidated against saved vehicles (§7.4), and the displayed vehicle facts can
drift silently from the mapping that actually governs routing.

## Goals

1. **One resolved context.** Every entry path — cascade, Garage, Browse EPC menu,
   VIN when available — produces the same server-validated vehicle context before
   any animation starts. Measured by: no transition can begin from client-side
   labels alone.
2. **Vehicles persist.** A saved vehicle survives session end, device change and
   re-login. Measured by: restore returns identical stable IDs, not labels.
3. **Release changes are safe.** When a catalog release is superseded, an
   unambiguous match is retained automatically and an ambiguous one requires
   customer confirmation. Measured by: no saved vehicle is ever silently
   reattached to a different maker, family or chassis.
4. **Both Garage actions work.** "Start visual parts journey" and "Open EPC
   categories" both resolve the same vehicle; the second bypasses animation
   entirely (§7.2).

## Non-goals

- **VIN resolution.** Depends on the Quomation donor passing the import gate;
  the context shape already carries `source: vin` so nothing blocks later.
- **The transition itself.** Owned by CATVIS-S005/S007. This feature commits the
  vehicle and hands off. The split at §4.5 is that this feature owns the
  completion fingerprint and when it is invalidated (R8); CATVIS-S005 owns what
  the visual does on a match.
- **EPC browse.** SPARE-F002 and EPC-S002/S003.
- **Fleet semantics.** Multi-vehicle organisational custody is FLEET-F003; a
  Garage is a consumer's own vehicles.
- **WhatsApp surface.** Phase 9. The FRC lists it under `surfaces`, but it needs
  the WhatsApp gateway and ACT-REG-010, neither of which exists.

## User stories

- As a customer, I want to select my exact vehicle step by step so that the parts
  I am shown actually fit it.
- As a returning customer, I want my saved vehicle already filled in so that I do
  not repeat the cascade every visit.
- As a customer with several vehicles, I want to mark one as primary so that the
  homepage assumes the right one.
- As a customer, I want an edit to an upstream field to clear the incompatible
  choices below it so that I cannot commit an impossible combination.
- As a customer whose vehicle's catalog release was replaced, I want to confirm
  the match myself when its meaning changed so that I am not silently switched to
  a different vehicle.
- As a support agent, I want to see the customer's vehicle context on their case
  so that they do not have to repeat it.

## Requirements

### P0 — cannot ship without

**R1 — Server-resolved context.** `POST /api/vehicles/resolve` accepts cascade
selections and returns the full context (`catalogReleaseId, makerId,
catalogFamilyId, generationId, variantId, fitmentId, visualFamilyId, flowPackId,
market, source`) or a typed refusal. Client labels are never authoritative.

**R2 — Cascade integrity.** Each field enables only after its parent has a valid
value; changing an upstream field clears incompatible downstream values; a step
offering no real choice collapses; acquisition-backlog records never appear.

**R3 — Server-backed Garage.** Full lifecycle over `GET/POST/PATCH/DELETE
/api/me/garage`, `PUT /api/me/garage/{id}/primary`, `PUT /api/me/active-vehicle`.
Each record stores the versioned identity snapshot from §7.1. Browser storage may
cache only a non-sensitive active choice.

**R4 — Ownership enforcement.** Every Garage read and write is scoped to the
authenticated customer server-side. Object-level authorization is enforced on the
record, not inferred from the request.

**R5 — Release revalidation.** On release change, stable IDs are re-resolved:
unambiguous matches retained, ambiguous ones moved to a state requiring customer
confirmation, and never reattached across maker, family or chassis.

**R6 — Readiness gate.** Only vehicles passing all eleven stages are selectable.
The customer selector reads `customerVisible = true AND QA_READY = PASS`.

**R7 — Committed-field treatment.** After Search, values remain visible as faint
grey, keep their accessible names, restore normal contrast on focus or edit, and
clear on upstream change (§3.4). Contrast must meet WCAG AA.

**R8 — Completion memory and its invalidation.** Blueprint §4.5 stores a
completed-flow fingerprint against the active vehicle context —
`catalogReleaseId + fitmentId + visualFamilyId + flowPackId + variantId`, those
five values and no others, which is what keeps it non-sensitive enough to cache
in the browser. This feature owns writing it, comparing it and invalidating it;
what the transition *does* on a match is CATVIS-S005's. On return to the
homepage the active vehicle's fingerprint is compared with the stored one; on a
match the settled exploded view is restored with the category map live and no
replay, and the committed cascade values stay faint per R7. Any change to an
identity-bearing value invalidates the match, so the new vehicle's flow runs
after Search. The preview may hold this in session storage; production keeps the
authoritative active-vehicle identity server-backed and may cache only the
fingerprint client-side. Labels never participate: two vehicles that read the
same on screen but differ in any of the five values must not match.

### P1 — fast follow

- Nickname and per-vehicle notes.
- Vehicle sharing / delegated read (pairs with VHUB-F013).
- Support-facing read of a customer's active vehicle, with case context.

### P2 — design for, do not build

- VIN-sourced resolution (`source: vin` already in the context shape).
- Multiple active vehicles per session for comparison.

## Acceptance contract

Replaces the generic contract for this feature. Each criterion is independently
testable and maps to a mandatory security test where applicable.

1. `POST /api/vehicles/resolve` returns exactly one context or a typed refusal;
   no partial or ambiguous context is ever returned.
2. A transition cannot start from client-supplied labels: resolution must have
   committed first.
3. Changing an upstream cascade field clears every incompatible downstream value.
4. A cascade step with a single real option collapses and does not appear.
5. A vehicle failing any of the eleven readiness stages is absent from the
   selector and unreachable by direct request.
6. Garage records persist server-side and restore by stable ID, not by label.
7. Reading or mutating another customer's Garage record is refused server-side —
   negative object-level authorization test, S2 mandatory.
8. Exactly one vehicle per customer is primary; setting a new primary clears the
   previous one atomically.
9. `SelectVehicle`, `AddVehicle` and `CreateVehicleProfile` are idempotent under
   retry with the same idempotency key.
10. `VehicleSelected`, `VehicleAdded` and `VehicleProfileCreated` are outboxed
    before any projection reads them.
11. On release supersession, an unambiguous match is retained automatically; an
    ambiguous one enters BLOCKED pending customer confirmation.
12. No saved vehicle is ever reattached to a different maker, family or chassis
    without explicit customer confirmation.
13. Both Garage actions resolve the same context; "Open EPC categories" reaches
    EPC without the transition running.
14. Committed cascade values meet WCAG AA contrast in their faint state and
    retain their accessible names.
15. Allowed actions are derived server-side from state; the client never decides
    which commands are offered.
16. Rate limiting applies to resolve and Garage mutation — S2 abuse control.
17. A masked VIN is never returned in a list response; only on explicit
    single-record read by the owner.
18. Support access to a customer's vehicle context is permitted only with an open
    case reference and is audited.
19. Returning to the homepage with an unchanged vehicle restores the settled
    exploded view with the category map active and no replay; the stored
    fingerprint is exactly the five identity-bearing values and carries nothing
    else.
20. Changing any one of `catalogReleaseId`, `fitmentId`, `visualFamilyId`,
    `flowPackId` or `variantId` invalidates the completion match, and two
    vehicles whose labels read identically but whose identity values differ
    never match.

## Permissions

Replaces `read / create / act`. Object-scoped, with delegation and support access
separated so that segregation of duties is expressible.

```text
spare.vehicle-profile.read.own
spare.vehicle-profile.create.own
spare.vehicle-profile.update.own
spare.vehicle-profile.delete.own
spare.vehicle-profile.set-primary.own
spare.vehicle-profile.read.delegated     # granted via VHUB-F013 vehicle sharing
spare.vehicle-profile.read.support       # requires an open case ref; audited
spare.vehicle-profile.merge              # master-data steward; domain command only
```

`.own` permissions are evaluated against the record's owner, never against the
request. `.support` and `.merge` are separate roles and may not be held by the
same position as a customer-facing operator.

## What DOMAIN_TESTED requires

1. `VehicleProfile` aggregate with the 7 states and 9 commands, transitions
   guarded server-side.
2. The five vehicle endpoints and six Garage endpoints from Blueprint §8.
3. Persistence with owner scoping enforced at the data layer.
4. Event envelope per the versioning canon — schema version, aggregate ref and
   version, occurred/recorded time, producer, correlation and causation IDs —
   emitted through the shared type in `packages/contracts`.
5. Tests: one per acceptance criterion above, plus the six S2 mandatory security
   tests, plus the material eventualities on the feature's `eventuality_refs`.
   Criteria 19 and 20 are exercised end-to-end in `tests/e2e/transition.spec.ts`
   ("completion memory (§4.5)"), against the `completionMemory` block the flow
   pack publishes — schema version 1.2.0 and above.
6. The preview player switched from `lib/epc-catalog.ts` fixtures to the real
   endpoints.

## Open questions

- **Identity (engineering, blocking).** Does a Garage vehicle require an
  authenticated DIAL identity, or may an anonymous session hold one that is
  claimed at signup? §7.1 says "customer-owned" but does not settle pre-signup.
- **Ambiguity SLA (product, non-blocking).** After a release change leaves a
  saved vehicle ambiguous, how long may it sit unconfirmed before it is treated
  as stale and dropped from the homepage preload?
- **VIN at rest (privacy/legal, blocking for P1).** Is a masked VIN stored at
  rest, and under which data classification? Interacts with ACT-REG-005.
- **Primary vs active (product, non-blocking).** Are "primary vehicle" and
  "active vehicle" one concept or two? The Blueprint uses both; the current
  fixture treats them as one.

## Dependencies

- Party/Identity and permissions/RLS from Phase 1 — R4 and R7 cannot be honestly
  tested before they exist.
- Catalogue/Vehicle/Fitment contracts (Phase 6A.1) for the resolve endpoint.
- The eleven-stage readiness gate, which currently reports zero customer-ready
  models pending the 44,532 diagram-identity collisions.

R1, R2 and R7 can proceed against a seeded catalog now. R3–R5 need identity
first. That split is the natural phasing.
