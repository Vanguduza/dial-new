# Dial Groceries — Final Feature & Eventuality Audit

**Planning status:** GREEN for repository FRC generation.  
**Implementation status:** must be proven feature-by-feature from code/evidence.

## Feature → software map

| Feature ID | Usable capability | Canonical domain/package owner | Primary aggregate |
|---|---|---|---|
| GROC-F001 | Merchant/store catalogue projection | `groceries/catalogue` | `StoreProduct` |
| GROC-F002 | Store/zone/slot selection | `groceries/slots` | `FulfilmentSlot` |
| GROC-F003 | Variable-measure goods | `groceries/orders` | `MeasuredLine` |
| GROC-F004 | Order group / merchant suborders | `groceries/orders` | `GroceryOrderGroup` |
| GROC-F005 | Merchant-pick fulfilment | `groceries/picking` | `PickTask` |
| GROC-F006 | DIAL shopper fulfilment | `groceries/shopper` | `ShopperTask` |
| GROC-F007 | Substitutions | `groceries/substitutions` | `SubstitutionDecision` |
| GROC-F008 | Produce preferences | `groceries/preferences` | `ProducePreference` |
| GROC-F009 | Final total / approval ceiling | `pricing/payments` | `GroceryPriceFinalization` |
| GROC-F010 | Click & collect | `groceries/fulfilment` | `PickupHandoff` |
| GROC-F011 | Delivery / cold-chain evidence | `delivery/groceries-safety` | `GroceryDelivery` |
| GROC-F012 | My Pantry stock model | `pantry` | `PantryItem` |
| GROC-F013 | Scheduled basket / route delivery | `pantry/groceries/delivery` | `ScheduledBasket` |
| GROC-F014 | Beneficiary/gift ordering | `groceries/orders` | `BeneficiaryOrder` |
| GROC-F015 | Restricted goods policy | `compliance/groceries` | `RestrictionCheck` |
| GROC-F016 | Food safety / lot / recall | `groceries-safety` | `FoodSafetyCase` |
| GROC-F017 | Grocery-specific resolution | `rce/claims` | `GroceryIssue` |
| GROC-F018 | Merchant operations/reconciliation | `suppliers/groceries` | `MerchantSubOrder` |

## Material module-specific eventualities

- displayed stock wrong
- slot disappears
- weight exceeds ceiling
- short pick
- merchant cancels
- shopper no-show
- substitute unavailable
- no substitution response
- partial multi-merchant fulfilment
- cold-chain breach
- spoiled/expired/wrong item
- beneficiary unreachable
- pickup uncollected
- restricted item blocked
- recall after delivery
- final total differs
- delivery capacity failure
- Pantry prediction stale
- cutoff passes during edit
- auto-replenish not consented
- merchant POS stale/offline

These extend the global Eventuality Standard and become concrete EV rows in implementation.

## Donor classification

Instacart behavioral reference; SPAR/OK Zimbabwe local operating references; Sentry WMS bounded scan/pick reference only; Enatega/NutriBasket comparative reference; DIAL WMS primitives reused.

## Mandatory weave

Identity/Party; Evidence/Audit; RCE/Claims; Money/Ledger/Tax where applicable; Customer360/Engagement where applicable; Delivery where fulfilment applies; Command Centre manifest/metrics/alerts/controls; Development evidence and gates.

## Software-complete rule

A feature is complete only when its FRC, state transitions, API/commands/queries, data, events, permissions/RLS, applicable eventuality tests, degraded behavior, UI states, Command Centre registration and evidence are implemented and verified.
