# Grocery Rounds — Round Credit Model v1

**Status:** DECIDED by the product owner, 30 Aug 2026. Amends the §2 locked
decisions of `GROCERY_ROUNDS_MASTER_PLAN_v1.md`.
**Answers:** review findings B1 (second money authority), B3 (what the member is
buying), B4 (deposit versus taxable supply).
**Executable form:** `packages/round-credit/src/credit-model.ts`, rules
`RCM-001..016`, proven by `tests/round-credit.test.ts`.
**Still requires counsel:** the tax and consumer-law positions below are stated
as the design's assumptions and the engineering that survives either answer.
Zimbabwean tax counsel and the `ACT-REG-004` owner confirm them; this document
does not.

---

## 1. The decision

A subscription payment does not place money with Dial. It **buys credits**, and
the credit is the member's claim on groceries Dial holds for them. The Round
settles — the groceries are allocated and delivered — when the group decides it
is time.

Under the binding terms:

- credits are **not money**;
- credits are **not redeemable in money**, in any circumstance;
- credits are **not transactional** — they are not a means of paying anyone;
- credits are **not transferable** between members or to third parties.

Because the payment is consideration for goods rather than a repayable sum, the
issue of credits is a **taxable supply at the point of sale**, not a deposit
against which VAT arises later.

---

## 2. What this settles, and why it works

### It closes B1 without ratifying a second money authority

`ACT-REG-001` governs the holding of customer **money**. Its whole apparatus —
EscrowAdapter, PSP arrangement, settlement contract tests, AML/KYC matrix —
exists because Dial takes a sum it will later pay out.

Under this model Dial never holds a sum it will later pay out. The payment is
extinguished on receipt into a non-monetary, non-repayable entitlement to goods.
What persists for the 3–12 months of a Round is an **obligation to deliver
groceries**, which is fulfilment and custody semantics — precisely what
`01_AUDIT/COHERENCE_DEPENDENCY_MAP.md` permits Groceries to extend:

> Groceries and Laundry extend fulfilment/custody semantics but do not create
> second money/delivery/identity systems.

The contradiction the review raised is therefore resolved by removing the money,
not by ratifying a second way of holding it. That is the better of the two
options B1 offered, and it is available only for as long as condition C1 holds.

### It makes §3.2's disclaimers true rather than aspirational

§3.2 already says a Round must not behave as a deposit account, a peer-to-peer
wallet, an open-loop stored value or a cash withdrawal product. Non-redeemable,
non-transferable, single-purpose credits are the **mechanism** that makes each of
those statements structurally true. Before this decision they were assertions
about intent.

### It gives B4 the simpler of the two tax answers

A supply at the moment of sale means one fiscal event per subscription payment,
one receipt, and no open deposit liability requiring explanation. The harder
answer — a deposit with the tax point at delivery — would have required
fiscalising an unidentified future basket months later, per member.

That simplicity is real, and it is conditional on C3.

---

## 3. Conditions — what the decision obliges the build to do

These are not commentary. Each is enforced by a rule in
`packages/round-credit/src/credit-model.ts`, because a term in a contract that
the code does not enforce is a term the code will eventually contradict.

### C1 — Closed-loop is enforced in code, not only in the terms  `RCM-001, 002, 015`

Dial is a multi-trade marketplace. The moment a grocery credit can settle
anything outside grocery fulfilment — a spare part, a provider job, a laundry
order, another member's balance — it stops being a prepayment for identified
goods and becomes a general means of payment. That is the fact pattern that
attracts stored-value and payment-instrument treatment, and it would reopen
`ACT-REG-001` on materially worse facts than today, because by then real
customer value would be sitting inside it.

Therefore:

- every credit carries `scope: 'GROCERY_FULFILMENT'`, asserted by every consumer;
- there is no `credit → payment` edge anywhere in the domain model;
- the credit ledger is an **entitlement ledger under fulfilment**, and must never
  be reachable from, or reconciled into, the payments ledger as a funding source;
- no redemption path returns money, including as a fallback, a goodwill gesture
  or an exception handled off-system.

The last one deserves emphasis. A single manual cash refund, made kindly by a
support agent to a distressed member, is evidence that credits are repayable.
The exception path must exist (C5) and must be in kind.

### C2 — Non-transferability survives contact with households  `RCM-003, 004`

Members share households. A spouse, a relative or a domestic worker will collect
groceries. If that is implemented by moving credits between accounts, Dial has
built a transfer rail while its terms deny one, and the denial is worth nothing.

Model **authorised collection on the delivery**, never ownership change on the
credit: the credit stays with the member, and a named collector may receive the
goods. Same practical outcome, rule intact, and it produces a better audit trail
than a transfer would.

### C3 — The tax rate must be determinate at the moment of sale  `RCM-005, 006, 007`

This is the condition that costs money if it is missed.

If the credit sale is the taxable supply, VAT arises then, at a rate that depends
on what the credit will buy. Zimbabwe zero-rates a substantial part of the basic
food basket and standard-rates the rest. §11.2 does not fix the basket until
month 5, by vote. As designed, **the tax character of the supply is decided after
the tax point**, which is not a treatment any authority can accept and not a
receipt any fiscal device can print.

Both failure directions are expensive:

| If the issue is | and settlement is | consequence |
|---|---|---|
| fiscalised standard-rated | mostly zero-rated staples | members charged VAT never due; credit notes across every member, or an unjust-enrichment position |
| fiscalised zero-rated | standard-rated goods | Dial owes the VAT out of margin on the whole float — at the plan's own US$8.42M outstanding, on the order of US$1.1M |

**The fix keeps the decision intact: fix the tax class at Round creation and
constrain the vote inside it.**

- A Round is created with a declared basket tax class whose treatment is
  determinate at issue.
- The basket vote chooses **within** that class and never across it. A product
  that would change the rate is not on the ballot.
- At minimum this means two Round products rather than one: a staples Round that
  is wholly zero-rated, and a mixed Round fiscalised and priced standard-rated
  throughout.

This is not an extra burden bolted onto the decision. It is the condition on
which the decision holds. A credit whose tax treatment is knowable at issue is a
**single-purpose** instrument, and single-purpose is exactly the category that is
taxed on issue; a credit that could settle into either rate is multi-purpose, and
multi-purpose is taxed on redemption — which is the deposit-shaped answer this
decision was taken to avoid.

### C4 — The tax point is not revenue recognition  `RCM-008, 009, 010`

VAT arising at issue does not make the cash earned income. The consideration is a
**contract liability** until the goods transfer at settlement.

Booking credit sales as revenue at issue would produce three separate harms, in
increasing order of seriousness: Dial reports profit it has not earned; Dial pays
income tax on it; and Dial's own management reporting tells it the float is
spendable margin — which is precisely the behaviour review finding B2 identifies
as the most likely route to non-delivery. The accounting error and the product's
central risk are the same error.

§9.3 already separates "customer prepaid grocery obligation" from "realised Dial
margin". The credit model maps onto that structure rather than replacing it:

- `credit_issued` → contract liability increases, VAT output recognised, **no revenue**;
- `credit_settled` → liability releases to revenue, cost of goods recognised;
- invariant, at all times: outstanding contract liability equals the value of
  unsettled credits.

That invariant is `RCM-010`, and it is checkable on every close.

### C5 — "Never redeemable in money" needs a non-cash exit, or the law supplies a cash one  `RCM-011, 012`

The Consumer Protection Act [Chapter 14:44] provides cancellation and refund
rights, and a term rendering a prepayment permanently forfeit is the term most
exposed to being read down as unfair. If a court or the Consumer Protection
Commission orders a cash refund, Dial has a repayable sum — arrived at
involuntarily, at the worst possible moment, and on the record.

The defence is to build a remedy substantial enough that no one needs to order
one, in kind:

- a member may at any time convert credits into an immediate ordinary Dial
  grocery order at current prices and leave;
- or carry credits into the next Round;
- if a Round fails its minimum membership, or Dial cannot deliver, credits
  convert to immediate grocery fulfilment — never to cash.

This also removes a governance defect the decision would otherwise introduce.
**Credits are owned individually. The group vote decides when the Round procures;
it does not decide whether a member may leave.** Without that separation,
strangers in a public Round can strand one member's value for twelve months,
which is both unjust and the strongest argument available to anyone attacking the
non-redeemability term.

### C6 — Denominate credits in goods, not in dollars  `RCM-013`

**Recommended, and it is a commercial choice with a price, not a technicality.**

If a credit is "US$100 of future groceries", the member carries food inflation:
review finding B3's gap between what is sold and what is delivered stays open,
and a dollar-denominated non-redeemable claim reads more like currency, which
weakens the not-money position at exactly the point it needs to be strongest.

If a credit is a **basket unit** — 10kg mealie meal, 2L cooking oil, and so on —
then four things resolve at once:

1. Dial literally does keep groceries for the member, which is how the product
   was described and is now also how it works;
2. the supply is of identified goods, the strongest possible footing for
   prepayment-for-goods rather than deposit;
3. the VAT rate is determinate at issue, so C3 is satisfied by construction;
4. B3 closes — quantity is fixed at purchase, so there is no gap between the
   promise and the mechanics.

The cost is that **Dial carries the price risk instead of the member.** That is
real and must be met, not absorbed: forward supply agreements under the
procurement-lock feature the plan already contemplates, plus a priced provision
in the tiers, settled before tiers are published rather than after — the same
sequencing point review finding H2 makes about the broker RFQ.

If the price risk is judged unbearable, the alternative is currency denomination
plus B3's disclosure sentence in the consent gateway, in the member's own words:

> Your contributions buy a share of what this Round can procure at the prices
> available when it matures. If prices rise, the quantity you receive may fall.

What is not available is currency denomination with goods-denominated marketing.

### C7 — The float has no protection under this model, and the gateway must say so  `RCM-014, 016`

A taxable supply means the cash is Dial's, on Dial's balance sheet, spendable on
operations. That is the legally clean position and it is the point of the
decision. Its corollary is unavoidable: **on insolvency the member is an
unsecured creditor holding an instrument that is, by construction, not a money
claim.** Expected recovery is close to zero, and the credits are worthless in a
liquidation precisely because they are not money.

Nothing about the credit framing improves review finding B2 — it sharpens it. The
most likely route to non-delivery remains Dial solvent, trading normally, float
spent on operations, food dearer than when the Round was sold. Two responses,
which are not alternatives:

1. **The insurance layer must be bound against this construct specifically.**
   §16 insures "paid-but-undelivered grocery delivery obligations". An underwriter
   will ask what exactly is owed and to whom; "credits that are not money and are
   not redeemable" is an answer the policy wording has to accommodate before it is
   relied on. Take that question to the broker RFQ, not to the claim.
2. **A voluntary procurement reserve.** Dial adopts an internal treasury policy
   holding a stated percentage of unsettled credit value in procurement-committed
   stock or forward contracts. This is not a customer reserve account, creates no
   second money authority, and does not disturb the tax position — it is a
   solvency policy with a number, reported on the §20 dashboard. `RCM-016`
   requires the number to exist and be declared; it does not set it.

### AML/KYC is reduced, not removed

Review finding H5 stands, at lower exposure. Non-transferability removes the
layering route that makes prepaid instruments attractive for placement, which is
a genuine structural improvement over a wallet. But credits are still bought over
months, by strangers in public Rounds, and convert into goods of real resale
value. Verification thresholds, source-of-funds questions at scale, and
structuring detection across linked accounts remain required.

---

## 4. Amendments to the master plan's locked decisions

§2 is amended as follows. The plan is marked LOCKED, so these are recorded as
deliberate changes by the owner rather than reinterpretation by an implementer.

| §2 decision | Status | Replacement |
|---|---|---|
| "Customers are purchasing groceries in advance; Dial owes groceries under the applicable Round contract" | **Retained and strengthened** | Purchase is effected by the issue of grocery credits that are not money, not redeemable in money, not transactional and not transferable. |
| "No ring-fenced customer reserve-account model is to be used as the core customer protection architecture" | **Retained** | Consistent with the decision: there is no customer money to ring-fence. A voluntary procurement reserve (C7) is a Dial treasury policy, not a customer account, and does not breach this. |
| "Protection is based on insuring Dial's paid-but-undelivered grocery delivery obligations" | **Retained, conditioned** | Policy wording must be bound against the credit construct specifically (C7.1). |
| — | **Added** | A Round declares a basket tax class at creation; the basket vote operates strictly within it (C3). |
| — | **Added** | Credits are individually owned. The vote decides when the Round procures, not whether a member may exit (C5). |
| — | **Added** | Credit denomination is declared per Round product as `GOODS` or `CURRENCY`; `CURRENCY` requires the B3 price-risk disclosure at the consent gateway (C6). |

### Consent gateway — §6.1 additions

The customer-facing summary gains, in the member's own words:

> Your payments buy grocery credits. Credits are not money, cannot be exchanged
> for money, and cannot be transferred to anyone else.

> You can use your credits for a Dial grocery order at any time, or carry them
> into the next Round. What you cannot do is take them out as cash.

> Dial is not holding your money for you. You have bought groceries, and Dial
> owes you those groceries.

That third line is the honest one and it should not be softened. It states the
benefit and the exposure in the same breath, which is what makes the rest of the
disclosure credible.

---

## 5. Open — for the `ACT-REG-004` and `ACT-REG-001` owners

1. **Confirm the VAT treatment of credit issue with Zimbabwean tax counsel**,
   specifically whether a single-purpose grocery credit is taxed on issue and what
   evidence of basket tax class ZIMRA expects at fiscalisation. The engineering
   in C3 is built to take either answer; the cost of finding out late is in the
   table above.
2. **Confirm that a non-redeemable, non-transferable, single-purpose credit falls
   outside deposit-taking and payment-instrument regulation** on Zimbabwean facts
   — and record what would take it back inside, so C1 has a stated boundary rather
   than an assumed one.
3. **Confirm the consumer-law standing of permanent non-redeemability in money**
   given the in-kind exit in C5, and whether the exit is sufficient.
4. **Decide C6 — goods or currency denomination.** This is the commercial call,
   and it should be made before tiers are published, alongside H2's broker
   pricing, because both determine the same numbers.
5. **Set the C7 procurement reserve percentage**, or record a decision that it is
   zero and that insurance carries the load alone.

Until 1–3 are answered, the vertical slice in §26 builds against the rules in
`packages/round-credit` and takes no real customer money, which is what
`ACT-REG-001`'s development mode already provides for.
