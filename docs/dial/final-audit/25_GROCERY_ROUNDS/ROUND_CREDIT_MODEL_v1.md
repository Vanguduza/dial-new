# Grocery Rounds — Round Credit Model v1

**Status:** DECIDED by the product owner, 30 Aug 2026. Amends the §2 locked
decisions of `GROCERY_ROUNDS_MASTER_PLAN_v1.md`.
**Answers:** review findings B1 (second money authority), B3 (what the member is
buying), B4 (deposit versus taxable supply).
**Executable form:** `packages/round-credit/src/credit-model.ts`, rules
`RCM-001..020`, proven by `tests/round-credit.test.ts`.
**Revision:** Rev 2, 30 Aug 2026 — see §0. Where §1 and §2 describe taxation at
issue, Rev 2 supersedes them; the text is kept because the reasoning is what the
later decision was taken against.
**Still requires counsel:** the tax and consumer-law positions below are stated
as the design's assumptions and the engineering that survives either answer.
Zimbabwean tax counsel and the `ACT-REG-004` owner confirm them; this document
does not.

---

## 0. Revision 2 — 30 Aug 2026

Four further owner decisions, taken after Rev 1 was recorded:

1. **The tax point moves to collection.** VAT is accounted for when the groceries
   are handed over, not when the credit is bought.
2. **Credits are denominated in monetary value**, not in goods.
3. **A member leaving receives groceries to the value of their credits at standard
   retail prices**, with no Round pricing, free delivery or other Round benefit.
4. **A protection charge is collected on top of credit value** — the working
   figure is 4%, so 5,200 buys 5,000 of credit and 200 towards cover.

Decisions 1 and 2 hang together and change the model's legal shape, which condition C3
below now explains. Decisions 3 and 4 close C5 and part of C7. The rules move
from sixteen to twenty; `RCM-005` and `RCM-006` become obligations on one route
rather than both, and `RCM-017`–`RCM-020` are new.

### What decision 1 buys, and what it costs

**It is not what makes the float usable.** Whether Dial may spend the money was
settled by the credit being a sale rather than a deposit; the tax point only
decides *when Dial hands VAT to ZIMRA*. Deferring it is a genuine cash-flow gain
— on 100 members at US$100 a month, roughly US$1,500 a month not paid out early
on a standard-rated basket — and that gain is worth having. It is not a change in
who owns the float.

**Two readings of "profit from the credit payments", and only one is available.**

- Using the months between payment and collection to **buy groceries better** —
  forward contracts, volume, supplier rebates, denser logistics — is the business
  model. §13.1 already names those levers, and the Round's whole purpose is to
  create the aggregation that earns them. This is the win-win, and it is real.
- Earning a **financial return on the held cash** — interest, placement,
  investment — is what §13 forbids in its own words: *profit comes from grocery
  commerce economics, not interest or investment of customer purchase value.* It
  is also the single fact most likely to convert this product into a deposit-taking
  or investment scheme in a regulator's hands, because it is what a bank does.

The first is what the design should be built to maximise. The second must not
appear in the model, the dashboard or the pitch.

**The cost is that the credit becomes multi-purpose, and that is the weaker
position.** See condition C3.

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
transaction is a **taxable supply and not a deposit**.

*Rev 2:* the credit carries **monetary value** rather than a quantity of goods,
and the supply is **accounted for when the groceries are collected**. Dial's
right to use the money is unaffected — that follows from the sale, not from the
tax point.

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
non-transferable, closed-loop credits are the **mechanism** that makes each of
those statements structurally true. Before this decision they were assertions
about intent. Rev 2's monetary denomination makes the closed loop carry more of
that weight, not less — see C3.

### It answers B4 — supply, not deposit

Whichever way the tax point falls, the money is consideration for a sale rather
than a sum held for the member. That is the answer B4 asked for, and it is the
part that keeps `ACT-REG-001` shut.

Rev 2 then places the tax point at collection, which is the more expensive of the
two operationally and the weaker of the two legally. Both consequences are set
out in C3.

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

### C3 — Tax point and credit character must agree  `RCM-005, 006, 007, 020`

**Rev 2 replaces this condition.** Rev 1 taxed the credit at issue and therefore
required the basket's tax class to be fixed when the Round was created. Rev 2
taxes at collection, which removes that requirement and adds three others.

#### Why the two decisions are one decision

A credit is **single-purpose** when what it will buy — and so the VAT rate — is
knowable on the day it is sold, and **multi-purpose** when it is not. That
distinction, not the wording of the terms, is what decides where the tax point
falls. Single-purpose is taxed on issue. Multi-purpose is taxed on redemption.

Rev 2's two decisions therefore hang together and are internally consistent: a
credit denominated in money, spendable across a basket the group has not yet
chosen, cannot be rated at issue, so it is multi-purpose, so it is taxed at
collection. Choosing monetary denomination and deferred tax is one coherent
model, not two preferences.

`RCM-007` refuses the incoherent middle: a Round may not both fix its basket
class at creation and defer the tax point. Holding both positions hands the
authority a choice of treatments, and it will not choose ours.

#### What it costs

**1. The "not money" position gets weaker, not stronger.** A multi-purpose
voucher for a stated monetary amount, spendable later on goods not yet chosen, is
the closest thing in the model to stored value. Non-redeemability and
non-transferability are what keep it on the right side of the line — and those
are now carrying the whole weight. **C1 moves from important to load-bearing.**
On the Rev 1 model, a credit that leaked into another trade would have been a
serious defect; on Rev 2, it is the difference between a grocery voucher and an
unlicensed payment instrument. The closed loop is no longer a discipline, it is
the licence condition.

**2. It may not be available.** VAT time-of-supply rules generally fix the tax
point at the *earlier* of invoice or payment, which for a prepayment means the
day the money arrives. The voucher regimes are the exception that allows
deferral, and they allow it precisely for multi-purpose instruments. So the
deferral is only available if the credit qualifies as a multi-purpose voucher
under Zimbabwean law — which is now the sharpest question for tax counsel, and it
is a question about a category, not about our preference. `RCM-007` and `RCM-020`
are written so that a "no" from counsel is a configuration change and not a
rebuild.

**3. Fiscalisation gets much heavier.** Taxing at issue is one receipt per
subscription payment. Taxing at collection makes **every delivery a fiscalised
sale, itemised per line, per member** — at the plan's own 38,420 members, a
materially larger fiscal-device integration than Rev 1 needed. The payment itself
still requires a document at the time it is taken; it is simply not a VAT
invoice. `RCM-020` refuses a Round whose fiscalisation model does not match its
tax point, so this cost cannot be discovered after the payment flow is built.

**4. The cash-flow gain is real and should be quantified honestly.** Not paying
output VAT until collection keeps roughly fifteen cents of every standard-rated
dollar in the business for the length of the Round. On the plan's illustrative
100 members at US$100 a month that is on the order of US$1,500 a month deferred.
It is a working-capital benefit, not earnings, and it reverses in full at
settlement — so it must appear in the cash-flow model and never in the margin.

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

### C5 — The exit is groceries at retail, and it is not the group's to refuse  `RCM-011, 012, 017`

The Consumer Protection Act [Chapter 14:44] provides cancellation and refund
rights, and a term rendering a prepayment permanently forfeit is the term most
exposed to being read down as unfair. If a court or the Consumer Protection
Commission orders a cash refund, Dial has a repayable sum — arrived at
involuntarily, at the worst possible moment, and on the record.

**Rev 2 sets the rule.** A member who leaves receives **groceries to the value of
their credits at standard retail prices, with no Round pricing, no free delivery
and no other Round benefit.** They keep their value; they lose the advantages
that were earned by staying in until procurement. That is a defensible position
in both directions — the member is not stripped, and the members who stayed do
not subsidise the one who left. `RCM-017` refuses a Round product configured any
other way.

Two things this obliges:

- **Say it before they pay, not when they ask.** The gateway must state that
  leaving early converts credits at ordinary shop prices without Round benefits,
  and that ordinary prices on the day of exit may buy less than the Round would
  have. An exit rule discovered at the point of exit is the complaint; the same
  rule disclosed at the start is a fair term.
- **The alternatives stay open.** Carrying credits into the next Round, and
  step-in fulfilment where Dial has failed, remain available (`RCM-011`). What is
  never available is cash.

**Credits are owned individually.** The group vote decides when the Round
procures; it does not decide whether a member may leave (`RCM-012`). Without that
separation, strangers in a public Round can strand one member's value for twelve
months, which is both unjust and the strongest argument available to anyone
attacking the non-redeemability term.

### C6 — Denomination: monetary value, so the price risk is the member's  `RCM-013`

**Decided in Rev 2: credits carry monetary value.** A credit is US$50 of future
groceries, not a stated quantity of them.

That is a real allocation of risk and it goes to the member. If food prices rise
between purchase and collection, US$50 buys less than it would have — Dial's
obligation is discharged in full by handing over US$50 of groceries at the prices
then current. The Round's aggregation should soften that (better wholesale
pricing is the whole point), but it does not remove it, and a bad quarter can
outrun it.

So review finding B3's gap does not close by construction the way goods
denomination would have closed it. It closes by **disclosure**, and the
disclosure has to be in the member's own words at the consent gateway:

> Your credits are a dollar amount, not a fixed shopping list. If prices rise
> before your Round collects, your credits will buy less.

`RCM-013` refuses a currency-denominated Round product with no recorded
price-risk disclosure version. It is the one rule here that protects Dial and the
member from the same event: an undisclosed shortfall is a mis-selling finding,
and a disclosed one is a term.

The residual commercial question stays open and belongs with tier pricing: how
much of the price risk to absorb through forward supply contracts under the
procurement-lock feature, and how much to leave with the member. Absorbing some
of it is a marketing advantage; absorbing all of it recreates the goods-
denominated model with none of its tax simplicity.

### C7 — The protection charge, and what it does not cover  `RCM-014, 016, 018, 019`

A taxable supply means the cash is Dial's, on Dial's balance sheet, spendable on
operations. That is the legally clean position and it is the point of the
decision. Its corollary is unavoidable: **on insolvency the member is an
unsecured creditor holding an instrument that is, by construction, not a money
claim.** Expected recovery is close to zero, and the credits are worthless in a
liquidation precisely because they are not money.

**Rev 2 funds the answer.** A protection charge rides on top of credit value —
the working figure is 4%, so US$52 buys US$50 of credit and US$2 towards cover.
That is a better-founded number than §13.2's 1.5% and sits inside the 4–6% band
review finding H2 expected. Four rules keep it honest.

**It rides on top; it never nets out** (`RCM-018`). A member paying US$52 must
receive US$50 of credit. Funding the charge by issuing US$48 of credit against
US$50 sells groceries that will not be delivered.

**It is not a premium the member pays an insurer** (`RCM-019`). This is the part
most likely to go wrong, and it is an `ACT-REG-007` question. Collecting an
identified premium from a customer and arranging cover in which that customer is
the beneficiary is **insurance intermediation**, which requires IPEC registration
that Dial does not hold — and §16.5 already forbids Dial from presenting itself
as the insurer. The safe construction is that Dial buys cover for **Dial's own
obligation**, prices that cost into the tier, and *discloses* that roughly 4% of
the price funds it. Disclosing what a price is made of is not selling a policy.
The wording clears with the `ACT-REG-007` owner before it is published.

**The rate is quoted, not assumed** (`RCM-019`). Advance-payment and performance
guarantee pricing for an unrated startup principal is exactly where H2 expected
4–6%; a tier published on an assumed 4% anchors pricing that may not hold when
the broker answers. The quote comes before the tiers.

**It does not cover the likeliest failure, and must not be sold as though it
does.** §16's perils are insolvency, fraud, employee dishonesty, cyber, transit
loss, supplier failure and business interruption. The most probable route to
non-delivery is none of them: Dial solvent, trading normally, float spent on
operations, food dearer than when the Round was sold. That is ordinary trading
loss, it is uninsurable, and no charge on the price reaches it. What reaches it is
buying the groceries early — the procurement reserve at `RCM-016`, a declared
percentage of unsettled credit value held in committed stock or forward
contracts. Zero remains an allowed answer; absent does not. And the policy
wording must be bound against the credit construct specifically, because an
underwriter will ask what exactly is owed and to whom, and "credits that are not
money" is an unusual answer.

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
| "Protection is based on insuring Dial's paid-but-undelivered grocery delivery obligations" | **Retained, conditioned** | Policy wording must be bound against the credit construct specifically, and the protection charge must not be sold as a member's premium (C7). |
| — | **Added** | The tax point is at collection, so a Round leaves its basket class open and fiscalises each delivery per line (C3). |
| — | **Added** | Credits are individually owned. The vote decides when the Round procures, not whether a member may exit (C5). |
| — | **Added** | A leaving member receives groceries to the value of their credits at standard retail prices, without Round benefits (C5). |
| — | **Added** | Credits are denominated in monetary value, and the price-risk disclosure is mandatory at the consent gateway (C6). |
| — | **Added** | A protection charge rides on top of credit value, is disclosed as part of the price, and is never presented as a member's insurance premium (C7). |

### Consent gateway — §6.1 additions

The customer-facing summary gains, in the member's own words:

> Your payments buy grocery credits. Credits are not money, cannot be exchanged
> for money, and cannot be transferred to anyone else.

> Your credits are a dollar amount, not a fixed shopping list. If prices rise
> before your Round collects, your credits will buy less.

> If you leave early you get groceries worth your credits at our normal shop
> prices, without Round pricing or free delivery. What you cannot do is take them
> out as cash.

> Part of what you pay funds cover that protects Dial's obligation to deliver.
> Dial is not an insurer and you are not buying a policy.

> Dial is not holding your money for you. You have bought groceries, and Dial
> owes you those groceries.

That third line is the honest one and it should not be softened. It states the
benefit and the exposure in the same breath, which is what makes the rest of the
disclosure credible.

---

## 5. Open — for the `ACT-REG-004`, `ACT-REG-001` and `ACT-REG-007` owners

1. **Does a multi-purpose grocery credit qualify for taxation on redemption under
   Zimbabwean law?** This is now the sharpest question. Time-of-supply rules
   generally fix the tax point at the earlier of invoice or payment, and voucher
   treatment is the exception that permits deferral. If the answer is no, the tax
   point returns to issue and the basket class must be fixed at Round creation —
   a configuration change under `RCM-005`, `RCM-006`, `RCM-007` and `RCM-020`,
   not a rebuild. Owner: `ACT-REG-004`.
2. **What does a per-delivery, per-line fiscalisation obligation cost to build and
   run** at the plan's own membership scale, and which fiscal-device provider
   supports it? Owner: `ACT-REG-004`.
3. **Confirm that a non-redeemable, non-transferable, closed-loop credit falls
   outside deposit-taking and payment-instrument regulation** on Zimbabwean facts
   — and record what would take it back inside. This matters more under Rev 2
   than it did under Rev 1, because a multi-purpose monetary credit sits closer to
   stored value and C1 is now the whole defence. Owner: `ACT-REG-001`.
4. **Confirm the consumer-law standing of permanent non-redeemability in money**
   given the retail-priced exit in C5, and whether that exit is sufficient.
5. **Clear the protection-charge wording** so that disclosing what the price funds
   does not become the sale of a policy, and confirm no intermediary registration
   is triggered. Owner: `ACT-REG-007`.
6. **Obtain the indicative broker quote** before tiers are published, and confirm
   whether 4% holds (`RCM-019`, review finding H2).
7. **Set the C7 procurement reserve percentage**, or record a decision that it is
   zero. This is the only lever that reaches the uninsurable failure mode.

Until 1, 3 and 4 are answered, the vertical slice in §26 builds against the rules
in `packages/round-credit` and takes no real customer money, which is what
`ACT-REG-001`'s development mode already provides for.
