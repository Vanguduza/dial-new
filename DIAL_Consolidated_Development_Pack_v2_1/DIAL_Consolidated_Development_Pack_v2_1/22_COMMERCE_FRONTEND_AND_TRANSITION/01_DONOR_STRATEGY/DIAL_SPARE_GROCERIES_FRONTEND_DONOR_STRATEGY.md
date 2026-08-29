# DIAL v2.1 — Dial a Spare & Dial Groceries Frontend / Donor Assimilation Strategy

## 1. Locked customer-facing frontend decision

`jatolentino/Shop-Ecommerce` becomes the **primary customer-facing frontend composition donor** for:

- Dial a Spare;
- Dial Groceries.

This does **not** mean DIAL adopts its MERN backend, MongoDB model, authentication, payments, or order authority.

The chosen approach is:

```text
Shop-Ecommerce frontend
        ↓
inspect exact commit + screenshots + component tree
        ↓
select useful layouts/interactions
        ↓
recompose in DIAL Next.js + Tailwind + shadcn
        ↓
bind to DIAL state / APIs / allowed actions
        ↓
DIAL design-system retokenization
        ↓
division-specific adaptation
```

This preserves the frontend style and interaction qualities that were selected while avoiding a second application architecture.

## 2. Shared commerce shell vs domain-specific experience

Spare and Groceries may share:

- top-level commerce shell;
- catalogue/product-card grammar;
- search/filter presentation;
- favourites/saved items interaction;
- customer account patterns;
- cart/order presentation primitives;
- responsive navigation;
- merchandising modules;
- loading/empty/error patterns.

They **must not** share a universal cross-domain cart or flatten their business models.

### Spare divergence

Dial a Spare adds:

- exact vehicle selector;
- My Garage;
- active vehicle context;
- fitment state;
- visual hero → CGI → line art → exploded journey;
- EPC section/group/diagram/part browsing;
- part applicability/confidence;
- hard-to-find sourcing;
- supplier offer selection;
- fitment/quality/return protections.

### Groceries divergence

Dial Groceries adds:

- retailer/store context;
- Pantry/scheduled basket;
- weighted/variable-measure goods;
- substitutions;
- slot selection;
- Merchant Pick / DIAL Shopper;
- Click & Collect;
- beneficiary orders;
- cold-chain/recall;
- estimate → measured/final total;
- grocery-specific fulfilment issues.

## 3. Donor division of responsibility

### Shop-Ecommerce
Primary public frontend composition.

### Mercur current monorepo
Marketplace and supplier/vendor operational patterns beneath DIAL authority.

### Nimara / Your Next Store
Premium polish, product-detail quality, microinteraction and responsive reference.

### Spares Shop
Automotive-storefront visual language for Dial a Spare.

### Car Zone
Automotive category/product merchandising reference.

### Car_e-commerce
Functional automotive donor: part recognition, supplier/inventory, delivery, AI/support and native-mobile workflow ideas.

### SandPIM + ACESinspector + ACESlint
Automotive fitment/PIM data intelligence and feed-quality logic.

### Quomation VIN Decoder
Local first-pass VIN structural validation only.

### DIAL EPC + transition system
DIAL-native source of truth for the premium automotive browsing journey.

## 4. Shop-Ecommerce port rules

Port only after the donor gate records:

- exact commit;
- exact `LICENSE` file/hash;
- source paths/components selected;
- dependency/SCA/SBOM review;
- screenshots/parity fixtures;
- DIAL target components;
- intentional divergences.

The GitHub repository presents an MIT license, while README license wording is inconsistent. Treat the exact LICENSE file as the legal source and verify it at import.

Do **not** copy donor secrets, payment code, backend authentication, MongoDB persistence, or server authority.

## 5. Visual port strategy

Create a DIAL-owned component map such as:

```text
donor/client/...                         DIAL target
---------------------------------------------------------------
header/navigation                →       packages/design-system/commerce/*
home merchandising sections     →       apps/consumer-web/modules/commerce/*
catalog/product grid             →       packages/commerce-ui/catalog/*
product card                     →       packages/commerce-ui/product/*
product detail composition       →       packages/commerce-ui/product-detail/*
search/filter UI                 →       packages/commerce-ui/discovery/*
cart/favourites                  →       packages/commerce-ui/customer-state/*
account/order tracking shell     →       packages/commerce-ui/account/*
```

Exact paths are confirmed at first donor import.

Port behavior first, then retokenize to the DIAL design system.

## 6. Spare frontend integration

The selected ecommerce frontend must not visually fight the automotive journey.

Recommended Spare discovery page hierarchy:

```text
DIAL Spare header
→ exact vehicle / My Garage strip
→ premium visual vehicle journey
→ category/part discovery
→ search / product merchandising
→ fitment-aware product listings
→ supplier offers / sourcing
→ cart / checkout
→ Activity / support
```

The transition can be embedded as a premium discovery module rather than forcing the entire Spare storefront to look like an EPC.

## 7. Groceries frontend integration

Recommended Groceries hierarchy:

```text
DIAL Groceries header
→ store / delivery-location context
→ search
→ Pantry / Repeat / Scheduled basket
→ category merchandising
→ product grid
→ substitution/measure indicators
→ basket
→ slot / fulfilment method
→ estimate / final-measure approval where required
→ Activity / support
```

Shop-Ecommerce provides the broad frontend composition; grocery-specific state remains DIAL-native.

## 8. Non-negotiable authority boundaries

Frontend may render and request.

It cannot decide:

- identity or permission;
- fitment truth;
- inventory truth;
- binding price;
- payment confirmation;
- final weighted grocery total;
- delivery completion;
- return/refund liability;
- ledger entries;
- supplier payout.

All consequential actions use DIAL typed commands and state-derived allowed actions.
