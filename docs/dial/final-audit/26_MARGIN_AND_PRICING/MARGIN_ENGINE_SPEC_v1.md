# DIAL Margin & Pricing Engine — specification v1

**Status:** PROPOSED, 30 Aug 2026. Not yet allocated a Feature ID — see Open
Questions Q1.
**Origin:** the Grocery Rounds pricing work of `25_GROCERY_ROUNDS/`. Four
material costs surfaced by accident during one conversation; this exists so the
fifth is found by a model instead.
**Written per** `CLAUDE.md`: a Feature entering implementation needs its own
acceptance contract first. This is that contract, before any code.

---

## Problem statement

DIAL prices products from intuition and illustrative figures. The Grocery Rounds
master plan's §13.2 unit economics — US$900 protection on US$60,000, a US$7,000
contribution — is the only pricing model in the repository, and it is already
known to be wrong in at least three places:

- **Protection was allocated at 1.5%**; review finding H2 put the market rate at
  4–6%, and the owner has since set a working figure of 4%. That single line is
  most of the illustrative profit.
- **Transfer tax was not modelled at all.** IMTT is charged per instalment, so a
  six-payment Round costs roughly US$1,200 on the same 100 members — about 17% of
  the illustrative contribution.
- **Irrecoverable input VAT was not modelled.** SI 248 of 2023 made the staples
  basket exempt, so the VAT on fuel, packaging, warehousing and platform costs
  attributable to it cannot be reclaimed. Estimated at 2–3% of cost, permanently.

A fourth error was one of method rather than omission: comparing pool margins on
the **gross payment** rather than on net revenue inverted the answer, and would
have set a handling fee that varied by split in the wrong direction.

Every one of these was found by someone looking, in conversation, at one product.
DIAL has thirteen modules and 244 features. **The cost of not solving this is that
prices are set on numbers nobody has checked, in a market where the margin is thin
enough that a 2% modelling error is the whole business.**

## Goals

1. **One margin authority.** Every division's pricing derives from the same
   engine. Nobody ships a second one — that is `CLAUDE.md`'s standing prohibition
   applied to money's quieter cousin.
2. **No number without a source.** Every cost input carries an origin and a date.
   A missing input **refuses**; it never defaults to a plausible figure. This is
   the catalogue lesson — absent evidence is a refusal — applied to pricing.
3. **Answers pricing questions, not just margin questions.** What price clears a
   target contribution; what split breaks even; what happens if food inflation is
   25%. A calculator that only reports the past is a spreadsheet.
4. **Tax is a first-class input.** Rate, treatment class, recoverability and
   transfer tax are modelled explicitly, from a dated schedule.
5. **Modelled margin is checked against actual margin.** An engine nobody
   reconciles is decoration.

## Non-goals

- **Not a ledger, and never a money authority.** It computes; it posts nothing,
  charges nothing, and settles nothing. Actuals are read from the accounting
  kernel, never written to it.
- **Not a price setter.** It produces a *proposal*. A priced product remains a
  governed record with a human decision attached, per the standing rule that AI
  never creates binding money truth.
- **Not a dashboard, in v1.** A pure calculation library with a contract comes
  first. The dashboard is the easy part and it is the trap — it looks like
  progress while the inputs stay unevidenced.
- **Not demand forecasting or elasticity.** Predicting what people will buy at a
  price is a different discipline with different data. v1 answers "what does this
  price earn", not "how many will sell".
- **Not the VAT return.** It models tax to price correctly. Filing is the
  accounting system's job and stays there.


## GMPC consumer integration — 2026-09-06

The adopted GMPC canon (`../27_GROWTH_MARKETING_PROMOTIONS/DIAL_GROWTH_MARKETING_PROMOTIONS_CONTROL_CENTRE_REV2.md`) is a first-class consumer of this authority. GMPC uses `PLAT-F014` outputs for campaign simulation, promotion margin floors, supplier-funded offer economics, contribution attribution and budget optimisation. GMPC MUST NOT reimplement cost allocation, tax treatment, contribution calculation or binding price authority. Promotion evaluation may refuse on a breached margin floor, but the margin input itself comes from this canonical engine and binding money remains in the Finance/Ledger architecture.

---

## User stories

**Pricing owner**
- As a pricing owner, I want to see the contribution of a product at a given
  price and cost set, so I can decide whether to launch it.
- As a pricing owner, I want to ask what price clears a target margin, so I set
  the number rather than discovering it.
- As a pricing owner, I want the engine to refuse when a cost input is missing,
  so I never publish a tier priced on a blank.

**Finance**
- As a finance owner, I want every modelled figure to name its source and date, so
  I can defend the pricing to an auditor or a board.
- As a finance owner, I want modelled contribution compared to actual contribution
  per product, so I know whether to trust the model.
- As a finance owner, I want irrecoverable input VAT attributed to the supplies
  that caused it, so apportionment is derived rather than estimated.

**Division lead**
- As a division lead, I want to compare two product configurations side by side,
  so a commercial choice is made on numbers.
- As a division lead, I want to see which single input most changes the answer, so
  I know what to go and negotiate.

**Round product owner (the first consumer)**
- As the Rounds owner, I want the contribution of a Round at each allowed member
  split, so I can set the default split on evidence.
- As the Rounds owner, I want to see the effect of instalment count on transfer
  tax, so cadence is a priced decision.

## Requirements

### P0 — cannot ship without

**R1 — Deterministic, pure, integer.** Given the same inputs the engine returns
the same output, with no I/O in the calculation path. All money in integer minor
units. No floating-point money, anywhere.

*Acceptance:* identical inputs produce byte-identical output across runs; a
property test over randomised inputs finds no case where component amounts fail
to sum to their total.

**R2 — The cost model is explicit and complete.** Revenue, output tax, net
revenue, cost of goods, directly attributable overhead, allocated shared
overhead, transfer tax, protection cost, irrecoverable input tax, contribution.
Each a named line, each traceable to an input.

*Acceptance:* every output line names the inputs that produced it; no line is
computed from a constant embedded in the code.

**R3 — Every input carries evidence, and absence refuses.** Each cost input has a
`source` (supplier quote, broker quote, measured actual, ZIMRA schedule,
management estimate), an `asOf` date, and is either evidenced or explicitly marked
an estimate. A missing input produces a **refusal naming the input and what would
satisfy it** — never a default.

*Acceptance:* a model run missing any required input returns a refusal, not a
number; a run containing a management estimate is marked as such in its output and
cannot be recorded as an evidenced price.

**R4 — Tax treatment is modelled, not assumed.** Per revenue line: treatment class
(standard, zero-rated, exempt), the rate from a dated schedule, and whether input
tax attributable to it is recoverable. Transfer tax modelled per collection event,
not per customer.

*Acceptance:* an exempt line produces zero output tax and non-zero irrecoverable
input tax; a zero-rated line produces zero of both; a standard line produces
output tax with fully recoverable input tax. Changing the schedule date changes
the rate applied.

**R5 — Margin is reported on net revenue, and gross-basis comparison is
prevented.** The comparable margin figure is contribution over net revenue.
Where a gross figure is also shown it is labelled, and the engine never returns a
bare percentage whose base is ambiguous.

*Acceptance:* the inverted comparison that motivated this spec — a standard-rated
line appearing worse than an exempt one purely because tax passes through it — is
covered by a regression test.

**R6 — Target-margin solve.** Given a cost set and a target contribution
percentage, return the price that clears it, including the tax gross-up, or refuse
with the reason if no price does.

*Acceptance:* solving for a target and then running the forward calculation at
that price returns the target margin, within one basis point.

**R7 — Sensitivity.** Vary one input across a range and return the resulting
contribution band, plus which input most moves the answer.

*Acceptance:* on the Rounds worked example, the ranked sensitivity names
procurement cost, protection rate and instalment count in the output.

**R8 — Refusals, not warnings.** Following `catalog-coverage/src/injection.ts`
and `round-credit`: every finding is a refusal with a rule id, the observed value
and a remedy. There is no advisory tier.

### P1 — fast follow

- **Scenario comparison.** Two or more configurations side by side, with the
  differences attributed to specific lines.
- **Portfolio roll-up.** Contribution across a division's products at a stated
  mix, so a division's blended position is visible.
- **Modelled-versus-actual variance**, per product per period, reading actuals
  from the accounting kernel. This is what makes the engine trustworthy rather
  than decorative, and it is P1 only because it needs actuals to exist first.

### P2 — design for, do not build

- Demand elasticity and price testing.
- Per-customer or per-cohort profitability.
- An operator-facing pricing console. The calculation contract should be shaped so
  a UI can be added without reshaping it.

## Success metrics

**Leading**
- Share of priced products whose current price is traceable to a recorded engine
  run: target 100% of new products at launch, within one quarter of the engine
  shipping.
- Share of engine runs with zero management-estimate inputs: target rising, with
  a stated figure at each quarter rather than a fixed target — the honest measure
  is the trend from wherever it starts.

**Lagging**
- **Absolute variance between modelled and actual contribution**, per product per
  quarter. Success threshold: within 2 percentage points. Stretch: within 1. This
  is the metric that matters; a model that cannot predict its own product's margin
  should not be setting prices.
- Number of material cost lines discovered *after* a price was published: target
  zero. Four were discovered this way in the work that prompted this spec.

## Open questions

**Q1 — Module and Feature ID (stakeholder, blocking).** The engine is
cross-division, which argues for `PLAT`. It is also a finance capability, which
argues for `CORP`. Both modules exist. This is a product decision and is not the
implementer's to take; naming it here rather than choosing it.

**Q2 — Scope of v1 (stakeholder, blocking).** Groceries only, proving the model
against Rounds, or cross-division from the start? Recommendation: build the
calculation contract cross-division from day one, but land only the Grocery Rounds
inputs in v1. The shape is the expensive thing to change; the inputs are not.

**Q3 — Who owns cost inputs (finance, blocking).** Somebody has to be accountable
for the procurement cost, overhead ratio and protection rate the engine consumes,
and for their refresh cadence. Without a named owner, R3's evidence requirement
becomes a queue of refusals nobody clears.

**Q4 — Where actuals come from (engineering, non-blocking).** P1's variance
requires a read path into the accounting kernel. Which interface, and at what
grain — per product, per Round, per delivery.

**Q5 — Overhead allocation basis (finance, blocking for R2).** Attributable
overhead is straightforward; shared overhead needs an agreed allocation basis, and
that basis also drives the input-tax apportionment method `RCM-021` requires. One
decision, two consumers, and it should be made once.

## Timeline considerations

- **Blocked by nothing technical.** R1–R8 are pure calculation and can be built
  immediately; `packages/round-credit`'s `poolEconomics()` is a working sketch of
  R2 and R5 at one product's scale.
- **Blocks the Grocery Rounds tier publication.** Review finding H2 already says
  the broker quote must precede published tiers; the same argument applies to the
  whole tier. Rounds pricing should not be published before this engine has priced
  it.
- **Suggested phasing.** Phase 1: R1–R5, the calculation and its refusals. Phase
  2: R6–R7, the solve and sensitivity, which is what makes it a pricing tool
  rather than a reporting one. Phase 3: P1's variance, once actuals exist.
