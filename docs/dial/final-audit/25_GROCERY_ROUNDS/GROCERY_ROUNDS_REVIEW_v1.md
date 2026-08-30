# Grocery Rounds Review — v1

**Reviews:** `GROCERY_ROUNDS_MASTER_PLAN_v1.md` (30 Aug 2026, marked LOCKED PRODUCT DIRECTION)
**Verdict:** The product is coherent and the governance instincts are unusually good. Four findings block build, seven need closing before a pilot takes real money. One of the four is a conflict with DIAL canon that the plan does not appear to know about.

> **Superseded in part, 30 Aug 2026.** The product owner has decided the money
> structure: subscriptions buy grocery credits that are not money, are not
> redeemable in money, are not transactional and are not transferable, making the
> transaction a taxable supply rather than a deposit. Rev 2 of that decision
> denominates credits in monetary value, prices the exit at standard retail, and
> funds protection with a charge on top of credit value; Rev 3 closes the tax
> point at payment and surfaces the exempt-supply input-tax cost. Together they
> answer **B1, B3 and B4**, and are recorded with the seven conditions they impose
> on the build in `ROUND_CREDIT_MODEL_v1.md`. The findings below are left as written — they are
> what the decision was taken against — with a resolution line on each. B2, the H
> findings and the M findings stand unchanged; B2 is sharpened rather than
> answered, and is dealt with as condition C7.

The plan is marked locked. Three of the four blocking findings are inside the locked decisions in §2, so they are raised as conflicts to be ratified or reversed deliberately — not as suggestions to reopen settled product direction.

---

## 0. What is right, and worth protecting

- **Moderation is separated from treasury.** §4 and §10: an initiator organises and moderates and can never withdraw, redirect or privately control pooled value, and a Round survives its creator disappearing. This single decision removes the failure mode that destroys informal mukandos, and it is the best thing in the document.
- **Formal votes over chat sentiment** (§11.2), with a proposal record that has a threshold, a deadline and a result.
- **Append-only ledger with reversals** (§9), no silent edits, no deletion of settled purchase records.
- **The Round Room is the system of record and WhatsApp is an adapter** (§15), with unofficial automation explicitly barred from becoming a production dependency.
- **Step-in grocery fulfilment preferred over cash indemnity** (§16.4). Replacing the groceries is what the customer actually wanted; cash is the fallback.
- **"Dial must never present itself as the insurer"** (§16.5), with UI limited to cover that is actually bound and applicable.
- **Entitlement follows valid prepaid purchases, and one member's default never reduces another's** (§10).

---

## 1. Blocking findings

### B1 — This creates a second money authority, and canon names Groceries specifically to forbid it

DIAL already has an answer to "we hold customer money before we deliver".

- **`TECH-F009` — Job Reserve / protected funds**, aggregate `JobReserve`, owner `payments/ledger`.
- **`ACT-REG-001` — Licensed hold-and-release / Job Reserve operating arrangement**, area `MONEY`, `development_mode: "EscrowAdapter interface + simulator/sandbox"`, which cannot activate until there is an executed provider/bank/PSP arrangement, legal and regulatory review, live settlement and payout contract tests, and an **AML/KYC responsibility matrix**.

§2 of the plan locks the opposite: *"No ring-fenced customer reserve-account model is to be used as the core customer protection architecture."* Protection is insurance instead.

Two canon statements bear directly on that:

> `CLAUDE.md`, Never: *let AI or donor code create a second money/identity/fulfilment/health authority*

> `01_AUDIT/COHERENCE_DEPENDENCY_MAP.md`: *Groceries and Laundry extend fulfilment/custody semantics but do not create second money/delivery/identity systems.*

Grocery Rounds holds customer money for 3–12 months at a scale the plan's own dashboard puts at **US$8.42M outstanding**, under a different model from the one DIAL has. That is not an implementation detail; it is a second money system inside the division canon names when forbidding exactly that.

The plan never mentions `ACT-REG-001`, `TECH-F009`, the Job Reserve, or the `EscrowAdapter`.

**Required.** One of two things, decided by whoever owns ACT-REG-001 (Commercial + Legal + Finance), not by an implementer:

1. **Rounds reuse the licensed hold-and-release pattern**, with insurance as a supplement rather than a substitute. This is the smaller change than it looks: the `EscrowAdapter` interface already exists as the development mode, Rounds becomes another consumer of it, and ACT-REG-001's `affected` list extends from `TECH, PROJECTS, CARE` to include `GROCERIES`.
2. **DIAL ratifies two money-holding models deliberately**, records why prepaid grocery obligations differ from job reserves, and updates the coherence map so the next reader does not find a contradiction and guess.

Silence is the one option that is not available, because the contradiction is already in the repository.

**Resolved — neither option, and better than both.** The credit model removes the
money rather than choosing a way to hold it. A payment is extinguished on receipt
into a non-monetary, non-repayable entitlement to goods, so Dial holds an
obligation to deliver groceries and not a sum it will later pay out. That is
fulfilment and custody semantics, which the coherence map expressly permits
Groceries to extend. `ACT-REG-001` is not engaged — **for exactly as long as
condition C1 holds**, and the day a grocery credit can settle a spare part or a
provider job it is engaged again, on worse facts, with real customer value
already inside it. `RCM-001`, `RCM-002` and `RCM-015` enforce that boundary.

### B2 — Insurance cannot cover the most likely way this fails

§16 protects against non-delivery arising from insolvency, fraud, employee dishonesty, cyber, transit loss, supplier failure and business interruption. Those are real perils and the layering is sensible.

The most probable route to non-delivery is none of them: **Dial is solvent, trading normally, has spent the float on operations, and food now costs more than when the Round was sold.** That is ordinary trading loss. It is not an insured peril, it is not claimable, and no amount of policy layering reaches it.

Segregation is the only structural answer to that failure, which is why B1 is not a governance formality. The two findings are the same finding seen from opposite ends: §2 removes segregation and asks insurance to carry the load, and insurance cannot carry this part of it.

**Required.** State plainly, in the plan and at the consent gateway, that protection covers insolvency and fraud-type non-delivery and not ordinary commercial shortfall — or restore segregation for the float.

**Not answered by the credit decision — sharpened by it.** A taxable supply means
the cash is Dial's, on Dial's balance sheet, spendable on operations. That is the
point of the decision and it is the legally clean position; its corollary is that
on insolvency the member is an unsecured creditor holding an instrument that is
by construction not a money claim. Recovery is close to zero, and the credits are
worthless in a liquidation precisely because they are not money. Condition C7
carries this: the insurance layer must be bound against the credit construct
specifically — an underwriter will ask what exactly is owed and to whom — and a
voluntary procurement reserve percentage must be declared, zero included
(`RCM-016`). A treasury policy is not a customer reserve account and creates no
second money authority.

### B3 — The member is sold one product and given another

The plan describes the customer's entitlement four different ways:

| Where | What it says | Which product that is |
|---|---|---|
| §3.1 | "collectively **pre-purchase groceries**" | a basket, fixed at purchase |
| §9.1 | "US$600 is an **accounting measure of Dial's grocery obligation**" | a dollar-denominated claim |
| §11.3 | entitlement computed from "**final product prices**" | maturity-priced |
| §6.1 | "Wholesale pricing depends on the **purchasing power achieved by the Round**" | a share of a pooled procurement |

Mechanically it is the fourth: a share of what the Round can buy at maturity. The marketing, and the consent gateway's own headline "You are purchasing groceries in advance", is the first.

In Zimbabwe, over a 12-month horizon, that gap is the entire risk. If USD food prices rise 25% between sale and maturity, either the member receives roughly 25% less food — in which case "Dial owes you groceries" was misleading and §23's "re-optimise basket, disclose impact, vote where material" is the member absorbing a loss they were not told they carried — or Dial absorbs it, and §13.2's US$7,000 contribution on US$60,000 is consumed twice over by a single bad quarter.

**Required.** Choose one and say it in §6.1's customer-facing summary, in the words the customer reads:

> Your contributions buy a share of what this Round can procure at the prices available when it matures. If prices rise, the quantity you receive may fall.

If that is unsellable, the alternative is a **priced floor** — a guaranteed minimum basket, with the price risk hedged or provisioned and costed into the tiers. What is not available is leaving the mechanics as (4) and the promise as (1). That gap is where mis-selling findings and consumer complaints live.

**Answered by disclosure, not by construction.** Rev 2 of the credit model
decides denomination: **credits carry monetary value**, not a quantity of goods.
The member therefore carries food inflation — US$50 of credit buys US$50 of
groceries at the prices current when the Round collects. That is the mechanics
described as (4) above, made explicit rather than left implicit, so this finding
closes only if the promise is corrected to match. `RCM-013` refuses a
currency-denominated Round with no recorded price-risk disclosure, and the
gateway wording in `ROUND_CREDIT_MODEL_v1.md` §4 states it plainly: *your credits
are a dollar amount, not a fixed shopping list.* Goods denomination remains
available per product and would close the finding outright, at the cost of moving
the price risk onto Dial.

### B4 — VAT and fiscalisation are unsolved, and §24 does not list tax at all

`ACT-REG-004` — Zimbabwe fiscalisation and current tax treatment — is an open activation blocker affecting all revenue-generating divisions.

A member pays US$100 in month 1. The basket is not determined until month 5 by vote. So at month 1:

- What is fiscalised, when the goods are unspecified?
- At what VAT treatment, when Zimbabwe zero-rates basic foodstuffs and standard-rates others, and the mix is unknown?
- Is the instalment a payment for a taxable supply at receipt, or a deposit with VAT arising on delivery?

That answer changes the payment architecture, the receipt the customer gets, the refund position, and the revenue recognition in §9.3. §24's legal review list covers consumer contract, payments, electronic contracting, privacy, refunds, advertising, insurance, suppliers, food safety and delivery — and does not mention tax or fiscalisation anywhere.

**Required.** Add tax to §24's gate list and resolve the deposit-versus-supply question before the payment flow is designed, not after.

**Closed at Rev 3.** The money is consideration for a sale rather than a sum held
for the member, which is what B4 asked. On the tax point, the answer is **when the
member pays** — VAT Act s8 fixes time of supply at the earlier of invoice or
payment, and no monetary-voucher exception has been confirmed for Zimbabwe, so
deferral is available only against a written ZIMRA ruling (`RCM-007`). Each Round
is confined to one tax character so a rate can be applied on the day the money
arrives (`RCM-005`, `RCM-006`).

This finding asked the wrong question, and answering it surfaced a larger one.
**SI 248 of 2023 moved the staples basket from zero-rated to *exempt* on 1 January
2024.** Exempt carries no output VAT at either end of the tax point — so on the
flagship product the timing question is moot — but it also makes the input VAT
behind those supplies permanently irrecoverable, estimated at 2–3% of cost. That
is a bigger number than any timing benefit and no tax-point choice touches it:
`RCM-021` requires an apportionment method, and the standard-rated Household Round
earns its place partly because it recovers input tax on shared costs. Two further
costs the plan does not model are now rules — IMTT charged per instalment
(`RCM-022`, roughly US$1,200 on the plan's own 100-member illustration against a
US$7,000 contribution) and rate movement (`RCM-023`, 15% to 15.5% on 1 January
2026).

Separately, and not raised in the original finding: **the tax point is not
revenue recognition.** VAT arising at issue does not make the cash earned income,
and booking it as revenue would tell Dial's own management that the float is
spendable margin — which is B2's failure mode reached through the ledger.
`RCM-008` and `RCM-010` hold the contract liability against unsettled credits.

---

## 2. To close before a pilot takes real money

**H1 — Reinsurance is a category error.** §16.1 lists reinsurance as a Dial protection layer. Reinsurance is insurance for insurers. Dial is the insured, not a cedant, and cannot buy it. Unless Dial forms a captive — a far larger regulatory undertaking, squarely inside `ACT-REG-007` and IPEC — Dial buys insurance and its *insurer* arranges reinsurance. Replace with "insurer panel capacity adequacy as aggregate exposure grows", which is a real thing to monitor and is what the layer was reaching for.

**H2 — The protection allocation looks under-priced by several times.** §13.2 allocates US$900 on US$60,000 — 1.5% — to protect an average outstanding obligation around US$30,000 over the period, and §16.1 stacks seven further covers on top of the primary guarantee. Advance-payment and performance guarantee pricing for an unrated startup principal in this market is unlikely to land there. If the real number is 4–6%, the illustrative US$7,000 contribution falls to US$4,000 or less before central overhead and tax. §29 already has the broker RFP; move it ahead of publishing plan tiers, because §13.2's figures will otherwise anchor pricing that cannot hold.

**H3 — Residual value has no owner.** §11.4's "approved residual treatment" carries a lot of weight. Across 38,420 members, unallocatable residual is real money, and if Dial retains it that is income derived from customer purchase value — precisely the financial yield §13 forbids. Make it a rule and a ledger event: residual returns to the member as credit toward a subsequent Round or is refunded, and is never retained.

**H4 — The public-marketplace fraud vector is not the one modelled.** §23 handles creator misconduct by removing moderation privileges, and the creator genuinely cannot touch pooled value. The live vector is **recruitment fraud**: side-payments, off-platform "top-ups", promises Dial never made, or a Dial Round used as legitimacy for an off-platform mukando that collapses. Required: Round marketing copy is generated by Dial from configuration, creators cannot make representations in-product, no off-platform contribution is ever honoured, and the member is told in the consent gateway that only in-app payments count.

**H5 — AML/KYC is absent.** `ACT-REG-001` requires an AML/KYC responsibility matrix. Rounds pool money from strangers over months, which is materially higher exposure than a single job reserve. §18 covers RLS, MFA and separation of duties and says nothing about verification thresholds, source of funds, sanctions screening or structuring detection. For public Rounds that strangers may join, this is a legal requirement rather than a hardening exercise.

**H6 — Free delivery is unbounded in the text.** §2 locks it; §13.1's cross-sell lever assumes members also buy top-ups and recurring replenishment. If free delivery leaks from the Round's maturity allocation into ordinary grocery commerce, the 3.7% allocation becomes the loss leader that consumes the margin. Bound it explicitly: free delivery applies to the Round's own allocation, once, within the selected supported zone.

**H7 — Aggregation can silently change the agreement a member accepted.** §10 allows a struggling Round to "aggregate with compatible Rounds"; §12.1 preserves separate ledgers, entitlements, allocations and delivery obligations, which is right. But if aggregation changes membership, duration or basket scope, it changes terms the member accepted under §6, and §6.2's own rule is that material changes require a new agreement version and fresh consent. Say which aggregations are procurement-only (no consent needed) and which are structural (fresh consent required).

---

## 3. Smaller corrections

- **M1 — No withdrawal or cooling-off record.** §6.2 stores acceptance comprehensively and has no counterpart for cancellation within a cooling-off window. Add the event and the window; consumer law usually supplies one whether or not the product does.
- **M2 — Entitlement must be derivable, not merely stored.** §25 requires that a Dial insolvency trigger leaves protection exposure and step-in reconstructable independently. That only holds if `round_entitlements` snapshots can be recomputed from ledger events rather than trusted as rows.
- **M3 — Ineligible members need a rule, not a percentage.** §20.2 displays "PROTECTION ELIGIBILITY 99.8%", implying some members are unprotected. What happens to them is undefined. They must be told before they pay.
- **M4 — Creator-set voting thresholds need central bounds.** §5.4 lets a creator configure voting rules "within governance bounds" and §11.2 carries a threshold. Bound thresholds centrally so a minority cannot be configured into binding the majority.
- **M5 — §9.2's ledger events have no `entitlement_adjusted`.** Substitutions and residual treatment (§11.4) change what a member receives; without an event they are invisible in the audit timeline that §8 promises.

---

## 4. Integration performed

- The plan is now inside the pack at `25_GROCERY_ROUNDS/`, declared by hash in `MANIFEST_v2_2.json`. Uploaded documents that sit at the repository root are outside the manifest and can drift unnoticed — eight of ten of the old `ref/` copies had.
- **16 features allocated, `GROC-F019`–`GROC-F034`**, extending the existing `GROC` module rather than creating a new one, because Rounds is a subsystem inside Dial Groceries and a new module code would imply a separate division. All `SPECIFIED`: no code, no per-feature contracts yet.
- Six carry `security_tier: S4` — agreement and consent, the Round ledger, entitlement, allocation, protection exposure, and procurement lock. Each either moves money, decides what a member receives, or states a protection position to a customer.
- `activation_blocker_refs` recorded against the features they gate: `ACT-REG-001` (money), `ACT-REG-004` (tax), `ACT-REG-007` (insurance characterisation).
- CT-7 moves from 23 of 228 to 23 of 244. Sixteen more features on generic contracts is a real worsening, stated rather than hidden, and each package needs its own acceptance contract before implementation.

---

## 5. Needing a decision before build

~~1. **B1** — reuse the licensed hold-and-release pattern, or ratify two money-holding models.~~ **Decided 30 Aug 2026:** neither. Credits are not money, so there is nothing to hold. See `ROUND_CREDIT_MODEL_v1.md` §2.

~~2. **B3** — which product the member is buying.~~ **Decided:** grocery credits, disclosed as such at the gateway. Goods-versus-currency denomination remains open as a commercial choice (C6, item 4 below).

~~3. **B4** — deposit or taxable supply.~~ **Decided:** taxable supply at credit issue, conditional on C3 fixing the basket tax class at Round creation.

Still needing a decision:

1. **Tax counsel confirmation** that a single-purpose grocery credit is taxed on issue on Zimbabwean facts, and what evidence of basket tax class ZIMRA expects at fiscalisation. Owner: `ACT-REG-004`.
2. **Regulatory confirmation** that a non-redeemable, non-transferable, single-purpose credit falls outside deposit-taking and payment-instrument regulation — and a written statement of what would take it back inside, so C1 has a stated boundary rather than an assumed one. Owner: `ACT-REG-001`.
3. **Consumer-law confirmation** that permanent non-redeemability in money survives, given the in-kind exit in C5.
4. **H2's broker quote**, before tiers are published. Rev 2 sets a protection charge of about 4% on top of credit value, which is better founded than §13.2's 1.5% and sits inside the band this review expected — but it is still an assumption until quoted, and `RCM-019` refuses a non-zero charge with no quote behind it.
5. **The protection-charge wording**, cleared with the `ACT-REG-007` owner so that disclosing what the price funds does not become the sale of a policy. Collecting an identified premium and arranging cover for the member is intermediation.
6. **C7 — the procurement reserve percentage**, or a recorded decision that it is zero. It is the only lever that reaches the uninsurable failure mode in B2.

Nothing in §26's vertical slice should take real customer money until 1, 2 and 3 are answered. The slice is well chosen and can be built against the rules in `packages/round-credit` in the meantime, which is the same posture `ACT-REG-001`'s development mode provides for.
