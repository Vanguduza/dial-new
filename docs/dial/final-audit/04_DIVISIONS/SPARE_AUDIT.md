# Dial a Spare — Final Feature & Eventuality Audit

**Planning status:** GREEN for repository FRC generation.  
**Implementation status:** must be proven feature-by-feature from code/evidence.

## Feature → software map

| Feature ID | Usable capability | Canonical domain/package owner | Primary aggregate |
|---|---|---|---|
| SPARE-F001 | Vehicle selection & garage | `vehicles/vehicle-hub` | `VehicleProfile` |
| SPARE-F002 | Part/category search & browse | `catalogue/search` | `SearchQuery` |
| SPARE-F003 | Fitment claims & confidence | `fitment` | `FitmentClaim` |
| SPARE-F004 | Catalogue ingest & normalization | `catalogue` | `CatalogueIngestBatch` |
| SPARE-F005 | Supplier offers & stock freshness | `suppliers` | `SupplierOffer` |
| SPARE-F006 | Non-catalogue sourcing request | `spare-sourcing` | `SpareRequest` |
| SPARE-F007 | Offer comparison & selection | `orders/pricing` | `OfferSelection` |
| SPARE-F008 | Cart, pricing & promotions | `pricing/promotions` | `PriceQuote` |
| SPARE-F009 | Checkout / FX / payment / fiscal | `orders/payments/tax` | `SpareOrder` |
| SPARE-F010 | Supplier acceptance & fulfilment prep | `orders/suppliers` | `SupplierFulfilment` |
| SPARE-F011 | Delivery / pickup / POD | `delivery` | `DeliveryJob` |
| SPARE-F012 | Returns / warranty / refunds | `orders/claims/rce` | `ReturnRequest` |
| SPARE-F013 | Counterfeit/wrong-fitment quality | `provider-quality/trust` | `QualityCase` |
| SPARE-F014 | Supplier portal | `supplier-web` | `SupplierWorkspace` |
| SPARE-F015 | WhatsApp Spare journey | `whatsapp` | `ChannelSession` |
| SPARE-F016 | Vehicle purchase/service history | `vehicle-hub` | `VehicleHistoryEntry` |
| SPARE-F017 | Spare AI assistance | `ai/catalogue-intelligence` | `AIInsight` |

## Material module-specific eventualities

- vehicle/VIN uncertain or conflicting
- part number ambiguous
- fitment confidence below threshold
- catalogue match missing
- supplier stock stale
- supplier declines/no response
- offers expire during checkout
- price/FX/tax changes
- payment authorized but supplier cannot fulfil
- partial quantity
- wrong/damaged/counterfeit part
- delivery/POD dispute
- return policy dispute
- warranty evidence incomplete
- duplicate webhook
- fitment later proved wrong
- refund/capture mismatch
- supplier suspended mid-fulfilment

These extend the global Eventuality Standard and become concrete EV rows in implementation.

## Donor classification

Mercur B2C/vendor panel conditional wholesale; Your Next Store/Nimara UX reference; Medusa/Mercur domain reference; SandPIM/ACES/PIES schema reference; TecDoc/Autodata/MOTOR future licensed data adapters; TableFlow import.

## Mandatory weave

Identity/Party; Evidence/Audit; RCE/Claims; Money/Ledger/Tax where applicable; Customer360/Engagement where applicable; Delivery where fulfilment applies; Command Centre manifest/metrics/alerts/controls; Development evidence and gates.

## Software-complete rule

A feature is complete only when its FRC, state transitions, API/commands/queries, data, events, permissions/RLS, applicable eventuality tests, degraded behavior, UI states, Command Centre registration and evidence are implemented and verified.
