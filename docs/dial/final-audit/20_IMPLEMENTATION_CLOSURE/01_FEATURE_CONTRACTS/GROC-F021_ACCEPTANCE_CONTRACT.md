# GROC-F021 — Round agreement & consent gateway

**First feature of the Grocery Rounds vertical slice (`DEC-009`).** The third
feature in the repository to carry a per-feature acceptance contract rather than
the generic one shared by 221 others.

| | |
|---|---|
| Aggregate | `RoundAgreement` |
| Owner | `legal/compliance` |
| Client exposure | CUSTOMER — `DIAL_CONSUMER`, `DIAL_WEB`, `WHATSAPP` |
| Security tier | S4 — states a binding position to a customer and gates every money-adjacent action |
| Target gate | `DOMAIN_TESTED` |
| Governing sources | `25_GROCERY_ROUNDS/GROCERY_ROUNDS_MASTER_PLAN_v1.md` §6; `ROUND_CREDIT_MODEL_v1.md` §4; `DEC-001`–`DEC-007` |
| Current state | `SPECIFIED` — no code |

---

## What this feature actually is

The master plan's §6 states it in one line: **no user may create a Round, join a
Round, or make a first purchase until the relevant agreement has been explicitly
accepted, and the application must block progression until affirmative acceptance
is recorded.**

That makes this feature a **gate**, not a form. The screen is the least of it. What
the code owns is:

1. an **agreement version** that is immutable and content-addressed, so what a
   member accepted can be re-derived years later rather than looked up in a table
   somebody has since edited;
2. an **acceptance record** carrying every field §6.2 requires, bound to that exact
   version by hash;
3. the **gate** itself, which refuses the three protected actions without a valid
   acceptance;
4. **fresh consent on material change** — a material change creates a new version
   and does not silently re-scope an existing acceptance.

It is also where all seven locked decisions become visible to a customer. `DEC-002`
requires the member to be told credits are a dollar amount rather than a fixed
shopping list. `DEC-005` requires the exit terms — groceries at standard retail,
no Round benefits, never cash. `DEC-006` requires the protection disclosure, and
`DEC-011` makes that disclosure lawful only if it is accurate. **A Round agreement
that omits any of those is not a lesser agreement; it is a mis-selling exposure
with a signature attached.**

### Non-goals, and why

- **The UI.** The gateway's presentation belongs to the consumer apps. This feature
  owns whether an action may proceed, and what was agreed. A React component that
  renders a checkbox is not the contract.
- **Identity.** Who the member is comes from the platform's identity kernel, which
  is not built. This feature takes a `customerId` as given and does not
  authenticate it. Stated because the acceptance record's evidential value depends
  entirely on that identity being real, and today it is asserted.
- **Storage.** No repository, table or migration. The domain is pure and the
  persistence layer arrives with the slice's ledger work in `GROC-F024`.
- **Legal drafting.** The agreement text is `legal/compliance`'s. This feature
  proves that the required disclosures are *present and versioned*, never that
  their wording is adequate — a check no code can perform.
- **Withdrawal and cooling-off.** Review finding M1 notes §6.2 has acceptance and
  no counterpart for cancellation within a cooling-off window. Real, and out of
  scope here: it belongs with the exit path in `GROC-F022`/`GROC-F033`.

---

## Requirements

### P0 — cannot ship without

**R1 — Three actions are gated, and no other path opens them.** Creating a Round,
joining a Round, and making a first purchase each require a recorded acceptance of
the agreement in force for that Round. There is no override, no operator bypass and
no "accepted verbally" path.

**R2 — An agreement version is immutable and content-addressed.** Its hash is
derived from its content — agreement type, version, the body, and every component
disclosure version. A version whose content no longer matches its hash is not a
version; it is evidence of tampering, and any acceptance bound to it is void.

**R3 — The acceptance record is complete.** Every field §6.2 requires:
`acceptanceId`, `customerId`, `roundId`, `agreementType`, `agreementVersion`,
`agreementHash`, terms-summary version, protection-disclosure version,
delivery-policy version, refund/cancellation-policy version, `acceptedAt`,
session/device metadata, locale, application version. A record missing any of them
is refused rather than stored incomplete.

**R4 — The locked decisions are present, by version.** An agreement version that
does not carry a price-risk disclosure (`DEC-002`), an exit-terms disclosure
(`DEC-005`) and a protection disclosure (`DEC-006`) may not be published. Their
presence is checkable; their adequacy is not, and this contract claims only the
former.

**R5 — Material change forces a new version and fresh consent.** A change to any
material term produces a new version with a new hash. Existing acceptances stay
bound to what was actually accepted and are never retroactively re-pointed —
§6.2's "material terms must never be retroactively overwritten". A member holding
consent to a superseded version may not take a gated action until they accept the
current one.

**R6 — Superseding does not rewrite history.** An acceptance recorded against
version 3 continues to evidence version 3 after version 4 is published, and
remains verifiable against version 3's content.

**R7 — Absent evidence is a refusal.** Following the house pattern: every finding
carries a rule id, the observed value and a remedy, and any finding at all means
the action does not proceed. No warnings tier.

### P1 — fast follow

- Cooling-off and withdrawal record (review finding M1).
- Acceptance replay: re-derive what a named member agreed at a date, as a single
  query, for a dispute.

### P2 — design for, do not build

- Multi-language agreement variants with per-locale hashes.
- WhatsApp-channel acceptance capture, where the evidential quality of "affirmative
  acceptance" differs from a web checkbox and needs its own treatment.

---

## Acceptance contract

Replaces the generic contract for this feature. Each criterion is independently
testable and names its test. `tests/round-agreement.test.ts` runs in the
`gates, types and unit suites` CI job.

1. Creating a Round without an acceptance is refused.
2. Joining a Round without an acceptance is refused.
3. A first purchase without an acceptance is refused.
4. Each of the three proceeds when a valid acceptance for the Round in force exists.
5. An agreement's hash is derived from its content, and changes when any content
   field or any component disclosure version changes.
6. An agreement whose stored hash does not match its content is refused as tampered,
   and any acceptance bound to it is void.
7. An acceptance missing any §6.2 field is refused, with the missing field named.
8. An agreement version lacking the price-risk disclosure is refused (`DEC-002`).
9. An agreement version lacking the exit-terms disclosure is refused (`DEC-005`).
10. An agreement version lacking the protection disclosure is refused (`DEC-006`).
11. A material change produces a new version with a different hash, and the prior
    version's content is unchanged by it.
12. An acceptance of a superseded version does not open a gated action; the member
    must accept the version in force.
13. An acceptance of a superseded version still verifies against the version it was
    made against, after supersession.
14. An acceptance is void if its `agreementHash` does not match the version it
    names, even when every other field is present and well-formed.

**Not claimed.** No criterion asserts that the agreement text is legally adequate,
that the customer identity is authenticated, that anything is persisted, or that a
member understood what they accepted. This contract governs the gate and the
evidence, and says so.

## Permissions

Replaces `read / create / act`.

```text
groceries.round-agreement.read            # read a published version and its disclosures
groceries.round-agreement.publish         # publish a new agreement version
groceries.round-agreement.accept          # record a member's acceptance
groceries.round-acceptance.read           # read acceptance records, operator-facing
```

`publish` is separated from `accept` deliberately, and neither may be held by the
same automated identity: publishing changes what every future member is bound by,
and accepting asserts that a specific person agreed to it.

## What DOMAIN_TESTED requires, and its evidence

1. Every acceptance criterion above has a test that runs — not one that skips.
2. `npm run verify` green, including all thirteen gates.
3. `node agent-system/bin/source-map.mjs` accepts the gate claim, which requires
   both `code_paths` and `test_paths` to exist and resolve.
4. A CI run of the commit carrying the claim, on Linux, green.

**What this gate does not include.** No independent specialist review has been
performed. This feature is S4 and customer-facing, which triggers the security and
money reviewers under the closure canon; the implementing agent cannot self-certify
either. `DOMAIN_TESTED` here means the domain logic is tested and its evidence
re-derives — not that a second party agreed.

## Open questions

- **Affirmative acceptance over WhatsApp (product + legal, blocking for P2).** A
  checkbox and a "YES" reply are not equivalent evidence, and `WHATSAPP` is a
  declared app family for this feature.
- **Who may publish an agreement version (legal, blocking for P1).** `publish`
  changes what every subsequent member is bound by. The identity and approval path
  are undefined.

## Dependencies

- **The identity kernel**, for the acceptance record to evidence a real person.
  Not built; `customerId` is taken as given, and R3's evidential value is
  conditional on it.
- **`packages/round-credit`**, for the Round product configuration whose
  disclosures this gateway must carry. Built and locked (`RCM-013`, `RCM-014`,
  `RCM-017`, `RCM-019`).
- **`ACT-REG-001`** remains open. This feature may be built and tested; it may not
  gate a real customer's first payment until that blocker closes.
