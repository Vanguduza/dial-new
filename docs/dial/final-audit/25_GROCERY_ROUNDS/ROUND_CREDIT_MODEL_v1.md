# Grocery Rounds — Round Credit Model v1

**Status:** DECIDED by the product owner, 30 Aug 2026. Amends the §2 locked
decisions of `GROCERY_ROUNDS_MASTER_PLAN_v1.md`.
**Answers:** review findings B1 (second money authority), B3 (what the member is
buying), B4 (deposit versus taxable supply).
**Executable form:** `packages/round-credit/src/credit-model.ts`, rules
`RCM-001..027`, proven by `tests/round-credit.test.ts`.
**Revision:** Rev 3, 30 Aug 2026 — see §0. Rev 3 closes the tax question against
Zimbabwean law as it now stands and supersedes Rev 2 on the tax point only; Rev
2's other three decisions stand.
**Still requires counsel:** the tax and consumer-law positions below are stated
as the design's assumptions and the engineering that survives either answer.
Zimbabwean tax counsel and the `ACT-REG-004` owner confirm them; this document
does not.

---

## 0. Revision 3 — the tax question, closed

**Recommendation adopted: the tax point is when the member pays, and a Round
carries one credit pool per tax character rather than one basket.** Rev 2's
monetary denomination, retail-priced exit and protection charge all stand. Only
the tax point moves back.

Three findings drove it, and the third is worth more than the first two.

### 1. Deferral is not ours to elect

Section 8 of the VAT Act [Chapter 23:12] fixes the time of supply at the
**earlier of invoice issued or payment received**. For an instalment, that is the
day the money arrives. The exception that would let a monetary voucher be taxed
on redemption is the kind of provision South Africa's VAT Act carries for tokens
and vouchers; **no equivalent has been confirmed for Zimbabwe**, and a treatment
that cannot be pointed to is not a treatment.

The asymmetry decides it. If we tax at payment and deferral was in fact
available, we have paid VAT early — a cash-flow cost, recoverable in argument. If
we defer and it was not available, we owe retrospective output VAT plus penalties
across the entire float, and we find out during an audit rather than during
design. `RCM-007` therefore refuses deferral unless a **written ZIMRA ruling** is
recorded against the Round product. Obtaining one is cheap next to the exposure
and is the right way to reopen this permanently.

### 2. On the flagship product there is nothing to defer

**SI 248 of 2023, effective 1 January 2024, moved maize meal, bread, milk, sugar,
cooking oil and salt from zero-rated to *exempt*.** An exempt supply carries no
output VAT at either end of the tax point. For a staples Round the entire timing
argument is moot — the cash-flow prize Rev 2 reached for does not exist on the
basket most members will buy.

### 3. The money is in input tax, and no tax-point choice touches it

Exempt is not zero-rated, and the difference is the whole point. Under
zero-rating a supplier charges 0% **and recovers** the VAT on its costs. Under
exemption it charges nothing **and recovers nothing** — the VAT on fuel,
packaging, warehousing, logistics and platform costs attributable to those
supplies becomes a permanent cost, estimated in the market at 2–3% of cost. On a
grocery margin that is not a rounding error, and it dwarfs any timing benefit
that was ever on the table.

Two consequences, both now rules:

- **Apportionment is machinery, not an afterthought** (`RCM-021`). A Round
  supplying exempt goods declares how input tax is split between taxable and
  exempt activity. Get this wrong and the claim is either overstated, which is an
  assessment, or understated, which is money left behind every month.
- **The standard-rated Round earns its place** (`RCM-006`, `RCM-021`). A
  Household Round that is standard-rated throughout generates recoverable input
  tax against shared costs. The two-product split is therefore not only tax
  hygiene — it is an input-recovery lever, and the mix between the two products
  is a real commercial decision rather than a marketing one.

### But we do not know which items will settle the payment

That objection is correct and it is the one this design has to answer, because
the basket is chosen by vote months after the money arrives, and the member picks
brands and quantities after that.

**We do not need to know the items. We need to know the class.** A Round declares
**credit pools**, and a pool is a menu with one tax character. The vote chooses
freely inside a pool — 10kg or 20kg, this brand or that, more oil and less sugar
— and every one of those choices carries the same VAT treatment, so the rate is
determined on the day the money arrives even though the shopping list is not.
What the vote cannot do is cross a tax boundary, because that would change the
rate of a supply already taxed.

A member wanting both staples and household goods does not join two Rounds.
**They subscribe once and the payment splits across pools** — one debit order, one
Round Room, one group, two tax characters. On the worked example of US$52 at the
Round's 70/30 default:

| | Share | Gross | VAT to ZIMRA | Dial holds |
|---|---|---|---|---|
| Staples pool (exempt) | 70% | US$36.40 | — | US$36.40 |
| Household pool (15.5%) | 30% | US$15.60 | US$2.09 | US$13.51 |
| **Total** | | **US$52.00** | **US$2.09** | **US$49.91** |

Shop prices include VAT, so the tax comes out of the household share rather than
on top of it: `15.60 × 1550 ÷ 11550`.

Four rules hold this together:

- **`RCM-005`** — a Round declares at least one pool, each with one tax class, and
  pool ids are distinct.
- **`RCM-006`** — every item on a pool's catalogue carries that pool's tax class,
  and an empty catalogue is refused because its credits could settle nothing.
- **`RCM-024`** — pool shares sum to the whole payment to the basis point, and the
  split is **fixed when a payment is taken**. A member may change it for future
  instalments, never for money already collected: moving value between pools after
  the fact would restate VAT on a return already filed.
- **`allocatePayment()`** computes the split and the VAT on it, using
  largest-remainder so the pool amounts sum to the payment exactly. A dropped cent
  here puts the credit ledger and the bank a cent apart every month, per member.

#### Who sets the split — three levels, and only one of them is Dial's to give away

| Level | Decides | Why there |
|---|---|---|
| **Dial** | which pools exist, and every item on each catalogue | `RCM-026`. Tax classification is a compliance surface, not a product knob. |
| **Round creator** | the default split, and the band members may move within | The creator already configures money, duration, membership and city under §5.4. This is the same kind of knob. |
| **Member** | their own split, inside the Round's band, for future instalments | `RCM-025`. A household with a big family and a household with none want different things, and the Round should not have to choose for them. |

**Creators must never author pools or catalogues.** A creator who puts a crate of
soft drinks on a menu labelled "staples" has mis-stated a VAT return, and they
will never know they did it — there is no feedback loop that would tell them. It
is the same class of problem review finding H4 raises about creators making
representations in-product, and the answer is the same: the creator surface simply
does not offer it. `RCM-026` refuses a Round whose pools are creator-authored.

**Voting weight follows the pool, not the Round** (`RCM-027`). A member who put
nothing in the household pool has no say in what the household pool buys. Weighting
by total Round credits would let members who bear none of a pool's cost decide how
it is spent — which is review finding M4 (minorities configured into binding
majorities) arriving in a new place. It also makes each pool's vote simpler: only
the people with something at stake are in it.

**The band is the safety rail.** A Round declares, per pool, a default and a
minimum and maximum a member may choose. `RCM-025` refuses a default outside its
own band, and refuses bands that admit no split adding to a whole payment. Two
members in the same Round paying the same US$52 can therefore owe different VAT,
correctly: at the 70/30 default the household share carries US$2.09, and a member
who moved everything to staples carries nothing.

**One framing caution.** The split changes what the member is buying, and the tax
follows from that. It must be presented that way — *how much of your Round is
staples, and how much is household goods* — and never as a way to pay less tax. A
customer-facing "reduce your VAT" control is tax-driven structuring dressed as a
product feature, and it is not what this is.

The commercial consequence worth naming: **the exempt menu is short.** SI 248 of
2023 names maize meal and maize flour, bread and plain buns, milk and cream, cane
sugar, cooking oils and salt. Rice, meat, vegetables and everything else needs its
status confirmed before it goes on a staples catalogue rather than assumed onto
it. The staples pool is a specific list, not "food".

### The cost nobody has modelled: transfer tax on every instalment

IMTT is charged per transfer — 2% on USD, and 1.5% on ZiG from 2026. **A Round
collected monthly incurs it once per instalment.** Six payments of US$100 cost
about US$12 per member; the same US$600 taken once costs about US$4. On the
plan's own illustrative 100-member Round that is roughly US$1,200 against a
US$7,000 contribution — around 17% of it — and §13.2 does not mention transfer
tax at all.

`RCM-022` refuses a Round product that does not declare its instalment count and
transfer-tax rate, so the charge appears in the model rather than in the
reconciliation. Two levers follow directly: fewer, larger instalments, and ZiG
collection where the member is willing, at 1.5% against 2%.

### Rates move, so they resolve from a schedule

The standard rate went from **15% to 15.5% on 1 January 2026**, and the exempt
schedule has been amended twice since 2023. A Round sold before a change and
collected after it must resolve the rate in force on the day it applies.
`RCM-023` refuses a Round product with no dated schedule reference; no rate is a
constant in the code.

### What this leaves for counsel

Narrower than before, and each item is now a yes/no rather than a design
question:

1. Confirm the exempt schedule as it currently stands, and that the intended
   basket sits inside it. The schedule has moved twice; this document's reading is
   `SI 248 of 2023` as amended.
2. Confirm there is no monetary-voucher provision permitting a deferred tax
   point — and if there is, name it, and `deferralRulingRef` becomes unnecessary.
3. Settle the apportionment method with the auditors before the first Round
   opens, not at the first return.
4. Confirm IMTT incidence on the intended collection rails, so the modelled rate
   is the charged rate.

**Everything else about the tax question is now closed.**

---

## 0. Revision 2 — 30 Aug 2026

Four further owner decisions, taken after Rev 1 was recorded:

1. ~~**The tax point moves to collection.**~~ **Superseded by Rev 3** — deferral
   is not available on election, and on the exempt staples basket there is no VAT
   to defer. See §0.
2. **Credits are denominated in monetary value**, not in goods.
3. **A member leaving receives groceries to the value of their credits at standard
   retail prices**, with no Round pricing, free delivery or other Round benefit.
4. **A protection charge is collected on top of credit value** — the working
   figure is 4%, so 5,200 buys 5,000 of credit and 200 towards cover.

Decisions 2, 3 and 4 stand. Decision 1 was reversed by Rev 3 once the statutory
position was checked; the reasoning below is kept because it is what Rev 3 was
tested against. The rules now run to twenty-three.

### What decision 1 buys, and what it costs

**It is not what makes the float usable.** Whether Dial may spend the money was
settled by the credit being a sale rather than a deposit; the tax point only
decides *when Dial hands VAT to ZIMRA*. This remains true and is the reason the
reversal in Rev 3 costs the business nothing structural. *(Rev 3: the cash-flow
gain that motivated the deferral turned out to be largely absent — the staples
basket is exempt, so there is no output VAT to defer.)*

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

**The cost was that the credit would become multi-purpose, which is the weaker
position — and Rev 3 found it also unavailable.** See §0 and condition C3.

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

### C3 — One tax character per Round, taxed when the member pays  `RCM-005, 006, 007, 020, 021, 022, 023`

**Rev 3 settles this condition.** The reasoning is in §0; the obligations are:

- **A Round declares credit pools, one per tax character, each with its own
  catalogue** (`RCM-005`, `RCM-006`, `RCM-024`). The vote chooses inside a pool;
  it never crosses one. A payment splits across pools at a ratio fixed when it is
  taken. This is what makes the rate knowable at payment while leaving the basket
  genuinely open — see §0.
- **The tax point is payment** (`RCM-007`). Deferral to collection is available
  only against a recorded written ZIMRA ruling — never as an election.
- **Fiscalisation follows the tax point** (`RCM-020`): one receipt per instalment
  while taxed at payment; an itemised sale per delivery if a ruling later moves it.
- **An exempt Round declares its input-tax apportionment method** (`RCM-021`),
  because exemption makes the input VAT behind those supplies permanently
  irrecoverable.
- **Instalment count and transfer-tax rate are declared** (`RCM-022`), so IMTT is
  priced rather than discovered.
- **Rates resolve against a dated schedule** (`RCM-023`), never a constant.

The through-line: the Rev 1 discipline of fixing the tax class at Round creation
was right, but for the wrong reason, and at the wrong level. It is not needed to
make a single-purpose voucher work, and it does not need to fix the *basket*. It
is needed because **the rate has to be applied on the day the money arrives** —
so it fixes the *menu*, which is a far lighter constraint and leaves the vote
entirely intact.

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

## 5. Open — for the `ACT-REG-001`, `ACT-REG-004` and `ACT-REG-007` owners

The tax question is closed at Rev 3. What remains is confirmation and commercial
choice, not design.

1. **Confirm the exempt schedule as it currently stands** and that the intended
   staples basket sits inside it. This document reads `SI 248 of 2023` as amended.
   Owner: `ACT-REG-004`.
2. **Confirm there is no monetary-voucher provision** permitting a deferred tax
   point; if there is one, name it and `RCM-007`'s ruling requirement falls away.
   Owner: `ACT-REG-004`.
3. **Settle the input-tax apportionment method with the auditors** before the
   first Round opens rather than at the first return. This is the largest tax
   number in the product. Owner: `ACT-REG-004`.
4. **Confirm IMTT incidence on the intended collection rails**, so the modelled
   rate is the charged rate — and decide the instalment cadence with that number
   visible. Owner: Finance.
5. **Confirm that a non-redeemable, non-transferable, closed-loop credit falls
   outside deposit-taking and payment-instrument regulation** on Zimbabwean facts,
   and record what would take it back inside. C1 is the whole defence. Owner:
   `ACT-REG-001`.
6. **Confirm the consumer-law standing of permanent non-redeemability in money**
   given the retail-priced exit in C5.
7. **Clear the protection-charge wording** so that disclosing what the price funds
   does not become the sale of a policy, and obtain the indicative broker quote
   before tiers publish (`RCM-019`, review finding H2). Owner: `ACT-REG-007`.
8. **Set the C7 procurement reserve percentage**, or record that it is zero. It is
   the only lever that reaches the uninsurable failure mode.

Until 5 and 6 are answered, the vertical slice in §26 builds against the rules in
`packages/round-credit` and takes no real customer money, which is what
`ACT-REG-001`'s development mode already provides for.

---

## 6. Sources for the Rev 3 tax position

- Value Added Tax Act [Chapter 23:12], section 8 — time of supply, earlier of
  invoice or payment. [ZIMRA](https://www.zimra.co.zw/downloads/category/17-acts?download=3984:value-added-tax-act-chapter-2312),
  and [DLA Piper Africa / Manokore on the time-of-supply rules](https://www.dlapiperafrica.com/en/zimbabwe/insights/2019/proposed-changes-to-the-time-of-supply-rules.html).
- [SI 248 of 2023 — Value Added Tax (General) (Amendment) Regulations (No. 64)](https://www.veritaszim.net/sites/veritas_d/files/SI%202023-248%20Value%20Added%20Tax%20(General)%20(Amendment)%20Regulations,%202023%20(No.64).pdf),
  effective 1 January 2024: maize meal, bread, milk, sugar, cooking oils and salt
  moved to **exempt**.
- [Lucent Consultancy — essential goods moved from zero-rated to exempt](https://lucent.co.zw/tax/value-added-tax-list-of-essential-goods-moved-from-zero-rated-status-to-exempt-status/),
  on the loss of input-tax recovery and the 2–3% cost estimate.
- [SI 15 of 2024 — further VAT exemptions](https://www.dlapiperafrica.com/en/zimbabwe/insights/2024/Understanding-the-Value-Added-Tax-General-Amendment-Regulations-2024-Statutory-15-of-2024),
  effective 9 February 2024.
- [Zimbabwe raises VAT to 15.5% from 1 January 2026](https://www.vatcalc.com/zimbabwe/zimbabwe-raises-vat-to-15-5-2026/),
  with IMTT on ZiG transactions cut from 2% to 1.5%.

These establish the design constraints; they are not a tax opinion, and the
confirmations listed in §5 are still required.
