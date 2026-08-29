# DIAL Consolidated Development Plan v2.1

**Status:** active development authority after repository bootstrap  
**Supersedes:** v2.0 implementation prompt for frontend/donor/Spare-transition implementation only  
**Retains:** all v2.0 closure, security, money, NFR, eventuality, operational and activation rules

## Executive lock

The development strategy is now consolidated around four layers:

```text
DIAL v2 deterministic kernel / sources of truth
        ↓
DIAL-owned shared commerce platform
        ↓
Shop-Ecommerce-derived customer frontend composition
        ↓
division-specific specialist experiences
   ├── Spare: Vehicle + Fitment + EPC + CGI/Exploded
   └── Groceries: Store + Pantry + Measures + Substitutions + Slots
```

The selected frontend donor does not become the commerce backend.

## Frontend decisions

### Dial a Spare
Primary public frontend composition:
`jatolentino/Shop-Ecommerce`

Enhance with:
- Mercur marketplace/supplier workflows;
- Nimara/Your Next Store polish;
- Spares Shop automotive storefront cues;
- Car Zone automotive merchandising;
- Car_e-commerce automotive functionality;
- SandPIM/ACES tool catalogue intelligence;
- VIN validation;
- DIAL-native EPC/transition engine.

### Dial Groceries
Primary public frontend composition:
`jatolentino/Shop-Ecommerce`

Enhance with:
- Mercur merchant/marketplace workflows;
- Nimara/YNS polish;
- DIAL Grocery/Pantry/fulfilment state.

## Spare unique product experience

The attached transition/EPC documents are frozen specialist contracts.

The final Spare frontend must allow them to remain technically independent of the general ecommerce visual layer.

The ecommerce page supplies:
- site shell;
- merchandising;
- catalogue/product UI;
- cart/account;
- support.

The vehicle/EPC subsystem supplies:
- exact vehicle;
- Garage resolution;
- transition flow;
- invisible hit map;
- EPC hierarchy;
- fitment.

The two meet only through typed DIAL contracts.

## Development sequence

1. v2 repository canonicalization
2. kernel / identity / permission / evidence / audit
3. money / payment / ledger / reconciliation
4. shared catalogue/search/order/returns/delivery/support
5. donor qualification
6. Shop-Ecommerce-derived shared commerce UI
7. Spare vehicle/catalogue/Fitment foundation
8. Spare transition/EPC v2 migration and readiness system
9. Spare storefront integration
10. Groceries frontend adaptation
11. supplier/merchant operations
12. WhatsApp/support/payment integration
13. client/mobile surfaces
14. Command Centre and operational queues
15. cross-domain/security/NFR certification
16. branch activation gates

## Critical no-go rules

Do not:
- begin broad feature fan-out before v2 repository bootstrap;
- copy Shop-Ecommerce backend/auth/payment/database authority;
- show unready vehicles;
- play Spare transition before exact vehicle resolution;
- expose raw source EPC node IDs;
- let AI decide fitment;
- use generic ecommerce state to bypass Grocery measure/substitution/final-total rules;
- create another payment/ledger/order source of truth;
- ship a donor without provenance/security/licence gate.

## Definition of build-ready for the new commerce frontend

The shared frontend is build-ready when:
- exact donor commit/licence is recorded;
- selected frontend source-path map exists;
- DIAL target component map exists;
- donor dependency/security scan is green;
- DIAL design-system token mapping exists;
- public responsive shell works without donor backend;
- customer actions are driven by DIAL state.

## Definition of customer-ready Spare flow

In addition to normal commerce certification, the selected vehicle must pass all 11 transition/catalogue readiness gates and direct EPC fallback.

## Definition of customer-ready Grocery flow

In addition to normal commerce certification:
- stock/availability honesty;
- substitutions;
- weighted goods;
- final total;
- slot/capacity;
- fulfilment route;
- cold-chain/recall;
- support/recovery
must pass their FRC/eventuality/security tests.
