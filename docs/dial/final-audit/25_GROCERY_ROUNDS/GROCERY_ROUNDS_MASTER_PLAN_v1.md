# DIAL GROCERIES — GROCERY ROUNDS
## Comprehensive Product, Technical, Commercial, Governance, Protection & Fulfilment Integration Plan

**Dial feature-planning standard • Implementation-ready architecture**

**Status:** LOCKED PRODUCT DIRECTION  
**Version:** 1.0  
**Date:** 30 August 2026

---

# 1. Executive Purpose

**Purpose:** Integrate Zimbabwe-style grocery rounds into Dial Groceries as a first-class prepaid collective-commerce subsystem, preserving the commercial reality of pooled buying power while avoiding bank-like savings architecture.

Dial Grocery Rounds allows customers to collectively pre-purchase groceries over a defined period, build a transparent group purchasing position, vote on or configure the final grocery basket, unlock wholesale procurement economics, and receive their entitled groceries with **free delivery inside supported Dial delivery zones**.

The commercial promise is **grocery value and fulfilment** — not interest, investment return, cash storage, or financial intermediation.

---

# 2. Locked Product Decisions

The following are baseline product requirements and must not be reinterpreted during implementation:

- Grocery Rounds are true collective prepaid grocery purchasing pools inside Dial Groceries.
- Customers are purchasing groceries in advance; Dial owes groceries under the applicable Round contract, not a savings balance or investment return.
- No ring-fenced customer reserve-account model is to be used as the core customer protection architecture.
- Dial must support preconfigured 3-, 6-, 9-, 12-month and additional product tiers, with contribution values maintained as configuration rather than hard-coded logic.
- Customers can create custom public or private Rounds with permitted configurable timelines, contribution amounts, membership thresholds, city/zone and other parameters.
- Eligible public custom Rounds can be joined by people who do not know each other.
- Creating or joining a Round requires explicit acceptance of binding, versioned terms and conditions before proceeding.
- Every Round requires a transparent member contribution/accounting ledger, basket planning, voting, entitlement/allocation, dispute handling, Round Room and WhatsApp integration.
- Round initiators may organise and moderate but may not withdraw, redirect, alter or privately control pooled purchase contributions.
- All Grocery Rounds include free delivery inside supported delivery zones.
- The architecture must support Zimbabwean cities beyond Harare from inception.
- Protection is based on insuring Dial's paid-but-undelivered grocery delivery obligations, supplemented by commercial crime/fidelity, cyber, supplier guarantees, stock/property, goods-in-transit, business interruption and reinsurance as scale requires.
- Step-in replacement-grocery fulfilment is the preferred customer remedy after an insured systemic failure where practical; financial indemnification is a fallback.
- Dial must never present itself as the insurer and must accurately disclose insurer, policy scope, limits, exclusions and eligibility.
- Profit comes from grocery commerce economics — procurement margin, supplier rebates, private-label margin, logistics density, forecasting advantage and cross-sell — not interest or investment of customer purchase value.

---

# 3. Product Definition and Boundaries

## 3.1 What the Product Is

A Grocery Round is a governed collective prepaid grocery purchase programme.

Members make scheduled grocery purchase instalments into a specific Round. The Round aggregates demand into one procurement opportunity while retaining deterministic member-level purchase records and entitlements.

Example:

```text
100 members
US$100 per month
6 months
────────────────
US$60,000 collective grocery order
```

The Round is therefore a **commerce construct**, not a savings or deposit product.

## 3.2 What the Product Is Not

Dial Grocery Rounds must not behave as any of the following:

- deposit account;
- savings account;
- interest-bearing instrument;
- investment scheme;
- rotating cash mukando;
- peer-to-peer wallet;
- open-loop stored value;
- cash withdrawal product;
- foreign-exchange product;
- lending or credit product.

---

# 4. Personas and Roles

| Role | Primary Goals | Hard Permission Boundary |
|---|---|---|
| Round Member | Pre-purchase groceries, see transparent accounting, influence basket, receive fair allocation and free delivery | Cannot alter ledger, other members' entitlements or supplier settlement |
| Round Initiator | Configure permitted parameters, recruit members, moderate group, propose purchases | No treasury power; cannot withdraw, release, alter or redirect pooled value |
| Dial Grocery Operations | Manage catalogue, procurement, receiving, fulfilment and exceptions | Cannot silently edit immutable purchase history |
| Procurement Manager | Aggregate demand, issue RFQs, lock supplier contracts, optimise landed cost | Requires controlled approval for high-value commitments |
| Logistics Manager | Plan warehouse staging, route capacity, live delivery and exceptions | Does not control accounting entitlements |
| Customer Support / Resolution | Investigate disputes using evidence and workflows | Adjustments only through controlled reversals/commands |
| Protection / Risk Admin | Maintain policy eligibility, exposure reporting and claim workflows | Cannot mark uninsured exposure as protected |
| Auditor / Governance | Read ledgers, exceptions, agreements and reconciliation evidence | Read-only except formal audit annotations |

---

# 5. Round Types and Configuration

## 5.1 Dial Preconfigured Plans

Dial should expose ready-made Round plans.

| Plan Family | Example Contribution | Duration | Purpose |
|---|---:|---:|---|
| Starter | US$25/month | 3 months | Low-barrier short-cycle stock-up |
| Household | US$50–100/month | 6 months | Core family bulk-buy plan |
| Extended | Configurable | 9 months | Mid-term seasonal/household accumulation |
| Annual / Festive | Configurable | 12 months | Large year-end household procurement |
| Campaign / Seasonal | Configurable | Dial-defined | School opening, festive, harvest, promotions |

Amounts, minimum membership, product eligibility and launch windows must be configuration-driven.

## 5.2 Community Public Rounds

Created by a customer but discoverable in the public Round Marketplace after automated and, where required, human validation.

People who do not know the creator may join if they satisfy eligibility, location and Round requirements.

## 5.3 Private Rounds

Designed for:

- families;
- workplaces;
- churches;
- clubs;
- cooperatives;
- existing mukandos;
- neighbourhood groups;
- invited communities;
- employer or institutional groups.

Join mechanisms may include:

- secure invitation link;
- QR code;
- invite code;
- approved join request.

## 5.4 Custom Round Configuration Schema

| Field | Examples / Rules |
|---|---|
| Round name | Human-readable; moderation/profanity checks |
| Contribution amount | Within Dial-approved min/max |
| Contribution frequency | Monthly initially; architecture extensible |
| Duration | Within allowed product range |
| Start and maturity dates | Validated against contribution cadence |
| Minimum / maximum members | Must satisfy economics and fulfilment constraints |
| Visibility | Public or private |
| Membership mode | Open, request-to-join, invitation |
| City / delivery zone | Required for free-delivery economics |
| Basket mode | Group vote, guided staples, curated template, mixed |
| Voting rules | Within governance bounds; no creator override |
| Join cut-off | Prevents late-join entitlement ambiguity |
| Allowed categories | Groceries/approved household consumables |

---

# 6. Mandatory Agreement and Consent Gateway

No user may:

- create a Round;
- join a Round;
- make the first purchase/contribution;

until the relevant Grocery Round agreement has been explicitly accepted.

The application must block progression until affirmative acceptance is recorded.

## 6.1 Required Customer-Facing Summary

The popup should clearly state:

> You are purchasing groceries in advance.

> Dial owes you groceries under this Round agreement.

> This is not a savings account, bank deposit or investment.

> Your completed purchases determine your grocery entitlement.

> Wholesale pricing depends on the purchasing power achieved by the Round and Dial's negotiated supplier pricing.

> Eligible Round delivery is free within the selected supported delivery zone.

> Insurance protection is subject to the insurer's actual policy wording, limits, conditions and exclusions.

## 6.2 Acceptance Record

Every acceptance must store:

- `acceptance_id`;
- `customer_id`;
- `round_id`;
- `agreement_type`;
- `agreement_version`;
- immutable `agreement_hash`;
- terms summary version;
- insurance/protection disclosure version;
- delivery policy version;
- refund/cancellation policy version;
- `accepted_at`;
- session/device metadata;
- locale;
- application version.

Material terms must never be retroactively overwritten.

Material changes requiring fresh consent must create a new agreement version.

---

# 7. Round Lifecycle and State Machine

```text
DRAFT
  ↓
PENDING_APPROVAL
  ↓
OPEN_FOR_MEMBERS
  ↓
MINIMUM_REACHED
  ↓
ACTIVE
  ↓
CONTRIBUTION_PERIOD
  ↓
BASKET_PLANNING
  ↓
PROCUREMENT_QUOTING
  ↓
MEMBER_APPROVAL
  ↓
PROCUREMENT_LOCKED
  ↓
ORDERING
  ↓
RECEIVING
  ↓
ALLOCATION
  ↓
DELIVERY
  ↓
RECONCILIATION
  ↓
COMPLETED
```

Exception states:

```text
FAILED_TO_FORM
PAUSED
UNDER_REVIEW
CANCELLED
REFUNDING
DISPUTED
INSURANCE_EVENT
STEP_IN_FULFILMENT
CLOSED
```

Every state transition must be auditable and, where appropriate, idempotent.

---

# 8. Round Room

Every Round receives a dedicated operational collaboration environment.

## 8.1 Round Room Navigation

```text
Overview
Chat
Members
Purchases
Basket
Deals
Votes
Delivery
Protection
Documents
Activity
Support
```

## 8.2 Responsibilities

| Tab | Purpose |
|---|---|
| Overview | Round status, membership, purchase completion, maturity, protection and delivery summary |
| Chat | Member discussion; bridged to supported WhatsApp interactions |
| Members | Membership and contribution status subject to consent/privacy |
| Purchases / Ledger | Transparent member purchase records and Round accounting |
| Basket | Proposals, quantities, pricing, preferences |
| Deals | Wholesale opportunities and supplier-saving options |
| Votes | Formal proposals and results |
| Delivery | Address, zone, delivery window and live tracking |
| Protection | Insurer, protected exposure, claims and policy disclosure |
| Documents | Agreements, invoices, procurement evidence, notices |
| Activity | Append-only Round audit timeline |
| Support | Disputes and customer service |

---

# 9. Ledger and Accounting Architecture

The Grocery Round ledger must reuse Dial's canonical ledger and accounting kernel.

It must be operationally append-only:

- corrections become reversals;
- adjustments become new ledger events;
- no silent edits;
- no deletion of settled purchase records.

## 9.1 Member Purchase Record

Each member has a deterministic prepaid grocery purchase history.

Example:

```text
Month 1       US$100
Month 2       US$100
Month 3       US$100
Month 4       US$100
Month 5       US$100
Month 6       US$100
────────────────────
Total prepaid grocery purchases:
US$600
```

This US$600 is an accounting measure of Dial's grocery obligation, **not a general-purpose wallet balance**.

## 9.2 Required Ledger Events

- `purchase_due`
- `purchase_processing`
- `purchase_paid`
- `purchase_failed`
- `partial_purchase`
- `late_purchase`
- `reversal`
- `refund`
- `procurement_commitment`
- `goods_received`
- `allocation_created`
- `goods_delivered`
- `insurance_recovery`
- `supplier_recovery`

## 9.3 Double-Entry Separation

Accounting must distinguish:

- customer prepaid grocery obligation;
- collected purchase value;
- procurement cost;
- allocated inventory;
- delivered fulfilment;
- refunds;
- insurer recoveries;
- supplier recoveries;
- logistics cost;
- supplier rebates;
- realised Dial margin.

Customer grocery obligations must never be confused with free corporate cash or operating profit.

---

# 10. Missed Payments, Defaults and Member Fairness

A member's failure to complete all planned instalments must not automatically reduce other members' entitlements.

Unless a specific approved plan states otherwise, entitlement follows valid prepaid purchases.

| Scenario | System Behaviour |
|---|---|
| Member is late | Show due/late status; trigger configured reminders and grace rules |
| Partial payment | Record exact valid purchase and calculate proportional entitlement |
| Member stops contributing | Preserve valid purchases already made; apply contractual exit/maturity rules |
| Round drops below procurement threshold | Re-price, recruit, aggregate with compatible Rounds, extend where permitted, or fail/refund under contract |
| Creator disappears | Round continues under platform governance; creator has no treasury authority |

---

# 11. Basket Planning, Voting and Entitlement

## 11.1 Basket Planning

Members propose products from:

- Dial Grocery catalogue;
- supported wholesale deal cards;
- approved substitutes;
- previous Round templates;
- curated household bundles.

Dial continuously compares proposed basket cost against available purchasing capacity.

## 11.2 Voting

Formal votes are required for material collective decisions.

A vote contains:

```text
proposal_id
round_id
proposal_type
eligible_voters
threshold
deadline
yes_count
no_count
abstain_count
result
effective_at
```

Chat sentiment is not a substitute for a formal vote.

## 11.3 Entitlement Engine

The Entitlement Engine must calculate each member's fair entitlement from:

- valid prepaid grocery purchases;
- refunds and reversals;
- final product prices;
- Round discounts;
- approved allocation rules;
- partial contributions;
- approved substitutions.

No creator or staff member may arbitrarily redistribute entitlement.

## 11.4 Allocation Engine

The Allocation Engine converts entitlement into concrete product quantities.

Where exact division is impossible, permitted resolution options may include:

- alternative product;
- quantity adjustment;
- lawful top-up;
- approved residual treatment.

---

# 12. Wholesale Procurement Integration

Grocery Rounds must connect directly to Dial Grocery procurement.

## 12.1 Demand Aggregation

Compatible Rounds may be aggregated upstream for supplier negotiation while preserving:

- separate Round ledgers;
- separate member entitlements;
- separate allocation records;
- separate delivery obligations.

Example:

```text
Round A        3,200 units oil
Round B        2,100 units oil
Round C        4,500 units oil
Round D        1,800 units oil
──────────────────────────────
Combined       11,600 units
```

## 12.2 Procurement Optimisation Variables

Procurement optimisation should consider:

- landed cost;
- MOQ;
- carton quantity;
- pallet quantity;
- supplier availability;
- lead time;
- quality;
- expiry;
- brand preference;
- cold-chain requirements;
- supplier reliability;
- return terms;
- transport;
- insurance;
- delivery network capacity.

## 12.3 Supplier RFQ Flow

```text
Round demand
    ↓
Cross-Round aggregation
    ↓
RFQ
    ↓
Supplier comparison
    ↓
Commercial approval
    ↓
Procurement lock
    ↓
Purchase order
    ↓
Goods receiving
    ↓
Quality control
    ↓
Allocation
    ↓
Delivery
```

---

# 13. Profit Model

**Core rule: Dial earns grocery-commerce margin, not financial yield on customer contributions.**

## 13.1 Primary Profit Levers

| Profit Lever | How It Works |
|---|---|
| Procurement margin | Round selling price remains below normal retail while Dial's aggregated supplier cost is lower still |
| Cross-Round aggregation | Larger combined orders unlock manufacturer/distributor tiers |
| Supplier rebates | Volume and promotional rebates increase realised commerce margin |
| Private label | Dial captures more of the value chain on staples and household goods |
| Logistics density | Known future deliveries lower per-household fulfilment cost while delivery remains free |
| Demand forecasting | Committed future demand reduces inventory guesswork and strengthens supplier negotiation |
| Cross-sell | Round members buy top-ups, ordinary groceries and recurring pantry replenishment |

## 13.2 Illustrative Unit Economics

| Line | Illustrative Amount |
|---|---:|
| Customer Round sales | US$60,000 |
| Equivalent ordinary retail benchmark | US$72,000 |
| Negotiated grocery procurement | US$47,000 |
| Warehouse / pick-pack | US$1,700 |
| Free delivery | US$2,200 |
| Protection allocation | US$900 |
| Payments / platform operations | US$1,200 |
| Total direct cost | US$53,000 |
| Illustrative contribution before central overhead/tax | **US$7,000** |
| Illustrative customer saving vs benchmark | **US$12,000** |

This example is illustrative only.

Production pricing must use actual:

- supplier quotes;
- city delivery costs;
- payment fees;
- insurance premiums;
- loss/wastage provisions;
- taxes;
- operational overhead;
- expected returns/shortages.

## 13.3 Commercial Flywheel

```text
Committed Round demand
        ↓
Large aggregated supplier order
        ↓
Lower procurement cost
        ↓
Customer price below ordinary retail
        ↓
Dial commerce margin
        ↓
More attractive Rounds
        ↓
More customers
        ↓
Even stronger procurement leverage
```

---

# 14. Free Delivery and Multi-City Fulfilment

All Grocery Rounds include **free delivery within the selected supported delivery zone**.

Free delivery is a pricing-engine constraint, not a hidden later surcharge.

## 14.1 Required Location Model

- country;
- province;
- city;
- delivery zone;
- warehouse/hub;
- delivery date/window;
- last-mile method;
- fleet/capacity constraints.

## 14.2 Zimbabwe Expansion Architecture

The architecture must support rollout across locations such as:

- Harare;
- Chitungwiza;
- Bulawayo;
- Mutare;
- Gweru;
- Masvingo;
- Kwekwe;
- Kadoma;
- Chinhoyi;
- Marondera;
- Bindura;
- Victoria Falls;
- additional supported towns/cities.

Commercial activation depends on Dial's actual logistics capability.

## 14.3 Logistics Integration

Rounds must reuse Dial Logistics capabilities including:

- automatic job assignment;
- order-preparation task generation;
- driver queues;
- live logistics map;
- route clustering;
- warehouse staging;
- delivery windows;
- customer live delivery tracking;
- delivery exception workflows.

---

# 15. WhatsApp and Notification Integration

The **Dial Round Room is the system of record**.

WhatsApp is a communication adapter.

| Channel | Use |
|---|---|
| WhatsApp | Round alerts, supported group interaction, voting links, delivery messages, support |
| System / App | Authoritative Round state, ledger, documents, votes and entitlements |
| Email | Agreements, receipts, statements, material notices |
| SMS | Fallback or critical alerts subject to customer preferences |

Unsupported or unofficial WhatsApp automation must not become a production dependency.

---

# 16. Protection and Insurance Architecture

**Protected subject:** Dial's outstanding paid-but-undelivered grocery obligation.

The protection architecture deliberately does **not** rely on a customer reserve or ring-fenced bank account.

## 16.1 Required Protection Layers

| Layer | Purpose |
|---|---|
| Customer grocery performance / advance-payment guarantee | Target eligible non-delivery, insolvency and fraud-related non-performance through expressly negotiated wording |
| Commercial crime / fidelity | Employee dishonesty, procurement fraud, collusion, electronic theft and related insured crime |
| Cyber | Platform compromise, data breach, restoration and interruption risks |
| Supplier guarantees | Advance-payment and performance protection on significant supplier commitments |
| Stock / property | Physical goods, warehouse and relevant deterioration/property risk |
| Goods in transit | Supplier-to-warehouse, inter-city and last-mile cargo exposure |
| Business interruption | Qualifying events that prevent fulfilment |
| Reinsurance | Additional risk capacity as aggregate outstanding obligation grows |

## 16.2 Dynamic Protection Exposure

```text
Protection Exposure
=
Valid paid grocery purchases
-
Grocery value already fulfilled
```

Example:

```text
Customer prepaid purchases      US$600
Groceries delivered             US$200
─────────────────────────────────────
Outstanding protected exposure  US$400
```

## 16.3 Protection Centre

Each eligible customer should be able to view:

- prepaid grocery value;
- delivered value;
- outstanding protected obligation;
- protection status;
- insurer;
- policy/guarantee identifier;
- cover summary;
- limits;
- exclusions;
- claim route;
- active claim or step-in status.

## 16.4 Step-In Fulfilment

Preferred systemic-failure flow:

```text
Dial unable to fulfil
        ↓
Protection event
        ↓
Insurer / programme administrator
        ↓
Approved replacement supplier
        ↓
Outstanding grocery allocation
        ↓
Free delivery to customer
```

Financial indemnification is a fallback where replacement grocery fulfilment is impractical or policy wording provides for it.

## 16.5 Insurance Language Guardrail

Dial must never describe itself as the insurer.

Marketing and UI may only describe coverage that is actually:

- bound;
- current;
- applicable to the customer;
- within policy limits;
- subject to displayed exclusions and conditions.

---

# 17. Data Model and Supabase Direction

Suggested bounded context:

```text
grocery_rounds
```

The exact physical schema should align with Dial's shared identity, party, ledger, orders, delivery, evidence and event architecture.

| Aggregate / Table | Key Responsibility |
|---|---|
| `round_plans` | Dial preconfigured plans |
| `rounds` | Round identity, status, configuration, city/zone |
| `round_memberships` | Member role, join state, visibility/privacy |
| `round_agreements` | Agreement version metadata |
| `round_agreement_acceptances` | Immutable member acceptance evidence |
| `round_purchase_schedules` | Expected instalments |
| `round_purchase_transactions` | Canonical purchase status/provider references |
| `round_ledger_entries` | Append-only accounting events |
| `round_baskets` | Current/approved basket |
| `round_basket_items` | Products, quantities, price sources |
| `round_proposals` | Formal governance proposals |
| `round_votes` | Member votes |
| `round_procurement_orders` | Procurement linkage |
| `round_entitlements` | Calculated member entitlement snapshots |
| `round_allocations` | Concrete goods assigned to member |
| `round_deliveries` | Delivery linkage |
| `round_protection_exposure` | Paid-but-undelivered insured exposure |
| `round_disputes` | Resolution cases |
| `round_activity_events` | Human-readable audit timeline |

---

# 18. Security, RLS and Separation of Duties

- Members may read their Round and permitted member-level transparency data, but never private payment credentials.
- Public discovery exposes only approved public Round metadata.
- Creators receive moderator permissions but no treasury/ledger mutation capability.
- Procurement lock, supplier settlement, bulk refund, agreement publication, entitlement override and protection adjustments require privileged roles and audited commands.
- Administrative corrections must create reversal/adjustment events.
- Direct deletion or silent balance editing is forbidden.
- Sensitive operations require MFA and separation of duties where risk warrants it.
- Supabase RLS policies must be tested against hostile cross-tenant and cross-Round access.
- Service-role usage must be tightly scoped and audited.

---

# 19. Domain Events and API Surface

## 19.1 Core Domain Events

- `RoundCreated`
- `RoundPublished`
- `RoundAgreementAccepted`
- `RoundJoined`
- `RoundMinimumReached`
- `RoundActivated`
- `GroceryPurchaseCompleted`
- `GroceryPurchaseFailed`
- `MemberBecameLate`
- `BasketItemProposed`
- `RoundVoteOpened`
- `RoundVoteClosed`
- `BasketApproved`
- `WholesaleQuoteReceived`
- `ProcurementLocked`
- `SupplierOrderPlaced`
- `GoodsReceived`
- `MemberAllocationCalculated`
- `DeliveryScheduled`
- `DeliveryCompleted`
- `ProtectionExposureChanged`
- `ProtectionEventOpened`
- `RoundCompleted`

Events must be:

- versioned;
- idempotent where required;
- auditable;
- replay-safe where applicable.

## 19.2 Representative APIs

```text
POST /grocery-rounds
GET  /grocery-rounds
GET  /grocery-rounds/{id}

POST /grocery-rounds/{id}/join
POST /grocery-rounds/{id}/agreements/accept

POST /grocery-rounds/{id}/purchases

GET  /grocery-rounds/{id}/ledger

POST /grocery-rounds/{id}/basket/proposals
POST /grocery-rounds/{id}/votes

GET  /grocery-rounds/{id}/entitlement
GET  /grocery-rounds/{id}/protection
GET  /grocery-rounds/{id}/delivery
```

All mutating APIs must be idempotent wherever duplication could create financial, fulfilment or governance risk.

---

# 20. Admin and Grocery Rounds Command Centre

The Dial ERP/Admin environment should gain a dedicated Grocery Rounds Command Centre.

## 20.1 Core Metrics

| Metric / View | Why It Matters |
|---|---|
| Active Rounds / members | Scale and operational load |
| Paid-but-undelivered grocery obligation | Primary outstanding fulfilment/protection exposure |
| Maturing in next 30/60/90 days | Procurement and warehouse planning |
| City demand heatmap | Capacity and supplier planning |
| Contribution completion / default rate | Round viability |
| Wholesale savings / realised margin | Commercial performance |
| Protection eligibility and declared exposure | Risk control |
| Open disputes / SLA | Customer trust |
| Supplier concentration | Procurement resilience |
| Delivery capacity / route load | Free-delivery viability |
| Fraud / anomaly alerts | Loss prevention |

## 20.2 Example Dashboard

```text
ACTIVE ROUNDS                      482
ACTIVE MEMBERS                  38,420
PAID-BUT-UNDELIVERED
GROCERY OBLIGATION             US$8.42M

NEXT 30 DAY PROCUREMENT        US$2.61M
PROTECTION ELIGIBILITY            99.8%
FAILED PURCHASE RATE               2.4%
DELIVERY SLA                       97.6%
OPEN DISPUTES                       123
```

---

# 21. Analytics and KPIs

Required KPIs include:

- Round creation-to-activation conversion;
- join conversion by plan and city;
- on-time purchase completion rate;
- average active member value;
- average Round purchasing power;
- procurement saving versus verified retail benchmark;
- gross merchandise margin;
- contribution margin;
- free-delivery cost per household;
- supplier rebate yield;
- allocation accuracy;
- dispute rate;
- on-time delivery rate;
- protection exposure;
- insured eligibility ratio;
- claim frequency and severity;
- repeat Round participation;
- cross-sell into ordinary Dial Groceries.

---

# 22. AI and RAG Opportunities

AI should enhance decision quality but must not become the system of record.

| Capability | Use | Guardrail |
|---|---|---|
| Demand forecasting | Forecast city/product maturity demand | Expose uncertainty and source data |
| Basket optimisation | Suggest value-maximising baskets | Never alter approved basket without workflow |
| Wholesale deal intelligence | Compare supplier offers and thresholds | Procurement staff retain approval |
| Default-risk forecasting | Identify Round viability risk | No opaque denial of contractual rights |
| Dispute summarisation | Assemble evidence timeline | Decisions use source evidence |
| Fraud anomaly detection | Flag suspicious reversals, suppliers and admin actions | Human review for consequential action |
| RAG assistant | Answer Round, policy, supplier and agreement questions from governed documents | Cite authoritative source/version; never invent insurance cover |

## 22.1 RAG Corpus

Potential governed sources:

- Round agreements;
- plan rules;
- insurance policies;
- supplier contracts;
- catalogue/price history;
- procurement SOPs;
- logistics SOPs;
- dispute policies;
- consumer service policies;
- food-safety rules;
- previous resolved disputes;
- city delivery-zone documentation.

RAG must never override canonical database records for:

- balances;
- purchase status;
- votes;
- entitlement;
- allocation;
- delivery completion;
- insurance eligibility.

---

# 23. Disputes, Refunds, Cancellations and Failure Handling

| Failure Mode | Required Behaviour |
|---|---|
| Payment not recognised | Provider reconciliation + evidence workflow |
| Round fails minimum membership | Apply pre-agreed failure/refund/transfer rule |
| Supplier fails | Alternate supplier / supplier guarantee / re-quote |
| Price shock | Re-optimise basket, disclose impact, vote where material |
| Product unavailable | Apply approved substitution rules |
| Short/damaged delivery | Evidence capture and replacement/refund/remedy |
| Creator misconduct | Remove moderation privileges; creator cannot access pooled value |
| Internal fraud | Freeze affected workflow, preserve evidence, commercial crime claim where covered |
| Dial systemic non-delivery | Protection event evaluation and step-in/claim process |
| Warehouse/logistics loss | Stock/transit/business interruption recovery while customer obligation remains |

---

# 24. Regulatory and Legal Review Gates

The product architecture intentionally positions Grocery Rounds as prepaid grocery commerce.

Final legal characterisation depends on implementation, contractual wording and actual payment behaviour.

Production release therefore requires Zimbabwean counsel to review:

- consumer contract and advance-purchase terms;
- payment architecture and provider flows;
- electronic contracting and evidence;
- privacy and member-ledger visibility consent;
- refund and cancellation rights;
- advertising and wholesale-saving claims;
- insurance/guarantee beneficiary rights;
- supplier agreements and guarantees;
- food-safety and recall obligations;
- delivery promises and free-delivery boundaries.

---

# 25. Simulation and Adversarial Test Matrix

| Scenario | Pass Condition |
|---|---|
| 10-member Round | All workflow states, allocations and delivery reconcile |
| 100,000 active members | Performance, ledger, notifications and procurement scale without accounting drift |
| Mass missed payments | No cross-member entitlement corruption |
| Christmas maturity spike | Warehousing, supplier and delivery capacity remain controlled |
| Supplier collapse | Alternate procurement/guarantee workflow preserves member obligation |
| Warehouse fire | Insurance/logistics recovery maintains customer resolution |
| Dial insolvency trigger | Protection exposure and step-in process can be reconstructed independently |
| Procurement fraud | Separation of duties, anomaly detection and evidence work |
| Cyber outage | No duplicate payments or state corruption after recovery |
| Custom creator disappears | Round continues without treasury dependency |
| Price inflation shock | Basket and vote workflows handle changed economics |
| Product recall | Affected batches, Rounds and customers are identified quickly |

---

# 26. Vertical Slice

The first implementation slice proves integration, not feature completeness.

1. Create Round.
2. Accept agreement.
3. Join Round.
4. Complete prepaid grocery purchase.
5. Write ledger.
6. Show transparent member status.
7. Create basket proposal.
8. Vote.
9. Obtain/record wholesale quote.
10. Lock procurement.
11. Receive goods.
12. Calculate entitlement.
13. Allocate goods.
14. Schedule free delivery.
15. Track live delivery.
16. Reconcile and complete.

A green vertical slice **must not be interpreted as full product completion**.

---

# 27. Production Acceptance Gates

| Gate | Minimum Production Standard |
|---|---|
| Product | All locked flows implemented; no hidden manual treasury dependency |
| Commercial | Actual unit economics prove wholesale value + free delivery + viable margin |
| Legal | Final contracts, refund rules, marketing and insurance wording reviewed |
| Ledger | Append-only, double-entry, reconciled, reversal-based corrections |
| Security | RLS, RBAC/ABAC, MFA, privileged auditing, hostile access tests |
| Procurement | RFQ, ordering, receiving, substitution and supplier failure tested |
| Protection | Policy bound, eligibility logic, exposure reporting, claims and step-in tested |
| Logistics | Multi-city zone model, preparation, assignment, live map and exceptions |
| Resolution | Payment, allocation, delivery, supplier, fraud and systemic-failure disputes tested |
| Scale | Load tests and maturity spikes pass |
| Observability | Metrics, tracing, audit and alerting cover high-risk flows |

---

# 28. Recommended Rollout

| Phase | Scope |
|---|---|
| Phase 0 — Legal / Insurance Closure | Final wording, legal review, broker tender, supplier contract templates |
| Phase 1 — Controlled Harare Pilot | Small Dial-created Rounds, limited products, full ledger/agreement/protection instrumentation |
| Phase 2 — Harare + Chitungwiza Scale | Broader catalogue, automation, live delivery, supplier aggregation |
| Phase 3 — Mutare / Bulawayo / Gweru | Multi-city warehousing and route economics |
| Phase 4 — Community Public Rounds | Enable stranger participation after moderation, fraud and governance controls mature |
| Phase 5 — Private / Institutional Rounds | Workplaces, churches, cooperatives, employers and associations |
| Phase 6 — National Expansion | Additional cities, private label, advanced procurement, reinsurance capacity |

---

# 29. Open Implementation Actions

- Obtain final Zimbabwean legal opinion on the implemented prepaid-grocery/collective-purchase structure.
- Issue an insurance-broker RFP for the bespoke grocery performance/advance-payment protection programme and supporting covers.
- Confirm direct/enforceable beneficiary mechanism and insolvency/non-delivery/fraud wording before advertising protection.
- Define actual initial plan prices, minimums, contribution limits and durations from commercial simulations.
- Map the Grocery Rounds domain into the current Dial Supabase/shared-kernel architecture.
- Define official WhatsApp capability available at implementation time and fallback notification patterns.
- Model city-by-city free-delivery economics and supported zones.
- Design procurement RFQ and supplier guarantee templates.
- Build simulation harnesses for maturity spikes, supplier collapse, internal fraud and step-in fulfilment.
- Produce UX prototypes for Marketplace, Round Room, agreement gateway, basket/voting, ledger, Protection Centre and live delivery tracking.

---

# 30. Final Integrated Architecture

```text
                           DIAL CONSUMER APP
                                  │
                                  ▼
                         DIAL GROCERIES
                                  │
             ┌────────────────────┴────────────────────┐
             │                                         │
       NORMAL GROCERY                          GROCERY ROUNDS
         COMMERCE                                     │
                                                       │
                            ┌──────────────────────────┼───────────────┐
                            │                          │               │
                      DIAL PLANS                 COMMUNITY         PRIVATE
                                                 ROUNDS            ROUNDS
                            │                          │               │
                            └──────────────┬───────────┴───────────────┘
                                           │
                                           ▼
                                    ROUND AGREEMENT
                                           │
                                           ▼
                                     ROUND MEMBERSHIP
                                           │
                                           ▼
                                PREPAID GROCERY PURCHASE
                                           │
                              ┌────────────┼─────────────┐
                              │            │             │
                              ▼            ▼             ▼
                           LEDGER      ROUND ROOM      PROTECTION
                              │            │             │
                              │      WHATSAPP CHANNEL    │
                              │            │             │
                              └──────┬─────┘             │
                                     ▼                   │
                               BASKET / VOTING           │
                                     │                   │
                                     ▼                   │
                            WHOLESALE PROCUREMENT        │
                                     │                   │
                           ┌─────────┼──────────┐        │
                           ▼         ▼          ▼        │
                       DIAL STOCK WHOLESALER MANUFACTURER│
                           │         │          │        │
                           └─────────┼──────────┘        │
                                     ▼                   │
                                ORDERGROUP               │
                                     │                   │
                                     ▼                   │
                               GOODS RECEIVED            │
                                     │                   │
                                     ▼                   │
                             ENTITLEMENT ENGINE          │
                                     │                   │
                                     ▼                   │
                              ALLOCATION ENGINE          │
                                     │                   │
                                     ▼                   │
                              DIAL LOGISTICS             │
                                     │                   │
                                FREE DELIVERY            │
                                     │                   │
                                     ▼                   │
                                  CUSTOMER ◄─────────────┘
```

Underlying shared Dial capabilities remain:

```text
Identity
Party
Catalogue
Pricing
Ledger
Orders
Delivery
Evidence
Resolution
Trust
Compliance
Workflow
Events
Notifications
Search
Analytics
AI
RAG
Simulation
```

---

# 31. Final Architecture Principle

> **Customers collectively pre-purchase groceries. Dial converts aggregated demand into superior procurement economics, allocates groceries fairly through auditable rules, and delivers every eligible Round order free inside supported zones. Dial earns commerce margin — not financial yield — and protects the outstanding grocery-delivery obligation through explicit insurance, supplier, operational and governance layers.**

This principle is a locked architectural constraint for all subsequent Dial Grocery Rounds design and implementation.
