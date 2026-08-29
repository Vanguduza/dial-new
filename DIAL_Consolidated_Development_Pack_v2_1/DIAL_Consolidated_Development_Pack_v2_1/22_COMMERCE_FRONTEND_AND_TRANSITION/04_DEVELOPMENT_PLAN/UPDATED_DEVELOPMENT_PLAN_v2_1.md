# DIAL v2.1 — Updated Development Plan

## Status

v2.0 closure remains the architectural baseline.

v2.1 changes the implementation strategy for customer commerce surfaces and finalizes how the Spare frontend integrates with the vehicle/EPC transition work.

This is a **development consolidation**, not a new feature expansion.

## Phase 0 — Repository v2 bootstrap

Before division work:

- install root `CLAUDE.md`;
- install v2 agent system / bounded context;
- supersede stale active v4/D-number instructions;
- install drift/security/realization/closure gates;
- map existing code/tests to Feature IDs;
- prove one pilot Feature to DOMAIN_TESTED.

Broad fan-out stays blocked until this is green.

## Phase 1 — Shared kernel

Build and certify:

- Party / Identity / Organisation;
- permission/RLS/DoA/SoD;
- Human Reference;
- Evidence/Audit;
- event envelope/outbox;
- idempotency/concurrency;
- state/allowed-action conventions;
- object storage;
- notifications;
- support case foundation.

## Phase 2 — Money

Build:

- PaymentIntent;
- Cash;
- EcoCash Direct;
- Paynow;
- ContiPay;
- PayPal;
- AccountingEvent;
- Ledger;
- settlement/reconciliation;
- refunds/disputes;
- BU finance books;
- Petty Cash;
- tax/FX interfaces.

No commerce frontend is allowed to own payment truth.

## Phase 3 — Commerce platform foundation

Build reusable DIAL commerce primitives:

```text
packages/commerce-contracts
packages/commerce-ui
packages/catalogue
packages/search
packages/cart
packages/customer-state
packages/offers
packages/order
packages/returns
packages/merchant-supplier
```

No universal cross-domain cart.

## Phase 4 — Donor qualification / imports

### Shop-Ecommerce
Qualify first because it is now the primary public commerce frontend donor.

Tasks:
1. pin exact commit;
2. verify LICENSE file/hash;
3. quarantine selected `client` tree;
4. capture route/component screenshot baseline;
5. map components to DIAL targets;
6. scan dependencies;
7. remove all backend/payment/auth assumptions;
8. port/recompose selected frontend into Next.js/Tailwind/shadcn;
9. parity-test chosen visual/interaction behaviors;
10. retokenize to DIAL.

### Mercur
Qualify current monorepo and map marketplace/vendor modules.

Port only supplier/vendor/marketplace behavior that improves DIAL.

### Nimara / Your Next Store
Use as polish review checkpoints.

### Automotive donors
Qualify Car_e-commerce, SandPIM, ACESinspector, ACESlint, VIN utility as defined in donor matrix.

Reference-only visual repos do not become dependencies.

## Phase 5 — Shared Shop-Ecommerce-derived commerce shell

Implement DIAL-owned frontend primitives suitable for both Spare and Groceries.

Deliver:

- responsive commerce header/navigation;
- merchandising sections;
- category rails;
- product cards;
- product detail shell;
- search/filter shell;
- favourites;
- cart presentation;
- customer account/order/activity surfaces;
- support entry;
- loading/empty/error/degraded states;
- accessibility;
- visual regression baselines.

## Phase 6A — Dial a Spare

### 6A.1 Vehicle/Catalogue foundation
- vehicle identity;
- release-scoped selection cascade;
- Garage resolution;
- fitment;
- supplier offers;
- part/cross-reference data;
- ACES/PIES ingestion QA.

### 6A.2 Transition/EPC specialist integration
Implement the attached Catalog Agent prompt against the catalogue repository.

Preserve the supplied v1 database read-only and build reviewable v2 migration/artifact.

Fix diagram identity before public EPC work:
- stable `DGM-*`;
- scoped source identities;
- quarantine ambiguous children.

### 6A.3 Spare storefront composition
Combine:

```text
Shop-Ecommerce customer frontend grammar
+ DIAL design system
+ automotive visual cues from Spares Shop / Car Zone
+ exact vehicle / My Garage
+ DIAL transition/EPC
+ DIAL fitment/search/offers/order/payment/delivery/support
```

### 6A.4 Exact homepage/Spare behavior
If vehicle context is active:
- preload or expose Garage context;
- Search commits exact vehicle;
- transition autoplays;
- visual hit region opens EPC category.

If no vehicle:
- ordinary part discovery/search may remain available;
- do not fabricate compatibility.

### 6A.5 Visual part recognition
Car_e-commerce may inform image-to-part candidate workflows.

AI result is a discovery candidate, never fitment authority.

### 6A.6 EPC fallbacks
- transition unavailable → direct EPC;
- diagram image missing → list-first;
- hotspot missing → diagram + parts;
- incomplete extraction → explicit partial state;
- stale visual mapping → active vehicle category hub.

## Phase 6B — Dial Groceries

Use the same DIAL-owned commerce UI foundation but adapt for:

- store/location context;
- multi-retailer;
- Pantry;
- scheduled/repeat baskets;
- variable-measure products;
- substitutions;
- pick mode;
- slots;
- delivery/pickup;
- beneficiary;
- cold chain;
- recall;
- estimate/final-total approval.

The Shop-Ecommerce frontend is a presentation donor only; ordinary generic ecommerce checkout logic cannot override grocery state.

## Phase 7 — Supplier / merchant operations

Mercur-derived supplier patterns feed DIAL Supplier/Merchant apps:

Spare:
- supplier offers;
- source freshness;
- stock/lead time;
- sourcing responses;
- returns/quality;
- catalogue feed QA.

Groceries:
- merchant/store setup;
- catalogue/price/stock projections;
- substitution support;
- pick readiness;
- recalls;
- fulfilment issues.

## Phase 8 — Client/mobile adaptation

Keep the DIAL client-family strategy.

Do not adopt the Shop-Ecommerce Flutter mobile app as the DIAL architecture.

Use mobile donor patterns only where they improve:
- catalogue;
- product detail;
- cart;
- tracking;
- photo input.

Native app state derives from the same DIAL APIs/FRCs.

## Phase 9 — Support / WhatsApp

All major Spare/Grocery transactions are reachable through DIAL Support and relevant WhatsApp flows.

WhatsApp uses:
- structured flows;
- DIAL PaymentIntent;
- DIAL order/job state;
- app/web deep links for rich EPC/transition/catalogue interactions.

Do not try to reproduce the 3D/EPC visual experience inside WhatsApp.

## Phase 10 — Command Centre / certification

Operational rooms must expose:
- catalogue/fitment readiness;
- donor/import status;
- vehicle flow readiness;
- incomplete/blocked catalogue records;
- payment/reconciliation;
- merchant/supplier health;
- fulfilment;
- support/RCE;
- security;
- NFR/SLO;
- activation blockers.

## Required cross-cutting tests

### Frontend donor parity
- selected Shop-Ecommerce patterns represented;
- no donor backend dependency;
- no donor secrets/payment authority;
- DIAL tokens/navigation/accessibility.

### Spare
- exact vehicle before autoplay;
- all 11 readiness stages;
- invisible click map;
- direct EPC;
- Garage restore/revalidate;
- fitment remains exact;
- no `source_node_id` public identity.

### Groceries
- weighted line;
- substitution;
- slot race;
- out-of-stock;
- estimate vs final;
- Pantry;
- cold chain;
- recall.

### Security
- RLS/IDOR;
- frontend action tampering;
- provider callbacks;
- upload/image scanning;
- donor dependency scan.

### Money
- payment unknown/duplicate;
- refund/reversal;
- provider settlement;
- no client-generated binding amount.

## Development unlock

Broad Spare/Groceries UI implementation is allowed only when:
- repository v2 bootstrap is green;
- Shop-Ecommerce donor dossier is green;
- shared commerce shell contract is green.

Customer-ready Spare vehicle journeys additionally require the 11-stage catalogue/transition readiness gate.
