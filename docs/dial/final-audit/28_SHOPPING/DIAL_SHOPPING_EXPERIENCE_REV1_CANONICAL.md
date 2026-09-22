# DIAL Shopping Experience Rev 1 — Canonical Product-Truth Integration

**Authority status:** CANONICAL PRODUCT / EXPERIENCE INTENT  
**Owner admission:** 22 September 2026  
**Decision:** DEC-039  
**Implementation state:** SPECIFIED / NOT CUSTOMER-READY  
**Screen namespace:** `SHOP` (experience namespace only; not a new business division)

## 1. Purpose

DIAL Shopping is the horizontal adaptive-commerce experience inside DIAL Consumer. It gives a customer one place to discover and compare products across participating retail categories while preserving the authoritative business rules of the DIAL divisions and shared platform services that actually execute those transactions.

The governing experience rule is:

> **Unified engine, differentiated category experiences.**

DIAL Shopping is therefore not a new source of truth for products, prices, stock, fitment, orders, money, delivery, support or compliance. It composes those authorities into a coherent customer experience.

## 2. Relationship to existing DIAL divisions

The required DIAL divisions remain unchanged. Shopping is **not** an additional division.

The first canonically activated Shopping category profiles are:

- **Spare Parts** — implemented through the existing Spare + Vehicle Hub + fitment/catalogue authorities.
- **Groceries** — implemented through the existing Groceries catalogue, stores, slots, substitutions, Pantry, fulfilment and Grocery Rounds authorities.

The following category experience profiles are admitted as **design/discovery profiles only until their commercial/domain activation is separately authorised**:

- Electronics
- Fashion & Beauty
- Home & Furniture
- Toys & Kids
- Hardware & DIY
- Solar & Power
- Agriculture
- Industrial & MRO

A category profile does not create a new division, merchant-of-record model, stock owner, tax model, returns policy or compliance authority. Those must exist before that category may become transactionally active.

## 3. Universal shopping entry and discovery

DIAL Consumer exposes a Shopping entry under the existing modular super-app architecture. Canonical shared Shopping surfaces include:

- DIAL Shop Home
- All Departments
- Universal Search / Ask DIAL
- Adaptive Search Results
- DIAL Lens
- Adaptive Product Detail
- Seller Offer Comparison
- Shopping Bag / Domain Carts Overview
- Shopping Activity / Order Projection
- Shopping Resolution entry
- Groceries Home
- Spare Parts Home
- Fitment & Compatibility Detail
- Seller Centre
- Product Media Studio
- Fulfilment Control
- Support / Case Centre
- Search Relevance Console

These screens are composition surfaces over existing feature authorities. They do not require a new top-level `SHOP-F*` feature family merely to exist.

## 4. Universal multimodal search

Shopping search accepts text, voice, camera image, gallery image, screenshot/share-to-DIAL, barcode/GTIN/QR/part-number markings, image + text and conversational problem statements.

The canonical search pipeline is:

```text
customer intent
  → query interpretation
  → lexical / identifier / visual retrieval
  → category-specific hard eligibility
  → qualified RAG / GraphRAG expansion where applicable
  → live price / offer / stock / fulfilment join
  → bounded reranking
  → typed SearchResultPlan
  → adaptive screen composition
```

The search index, embeddings and GraphRAG are derived/query systems. They never become transaction truth.

Customer-visible search must distinguish at least `EXACT`, `HIGH_CONFIDENCE`, `COMPATIBLE`, `VISUALLY_SIMILAR`, `POSSIBLE` and `UNVERIFIABLE`. A visually similar result is never promoted to compatibility merely because a vision model scores it highly.

## 5. DIAL Lens

DIAL Lens is the shared image-search entry for Shopping.

For Spare Parts:
- OCR/OEM/MPN/barcode/vehicle context and qualified fitment evidence outrank visual similarity.
- `SPARE-F003` remains the fitment-claims/confidence authority.
- vehicle context remains under Spare/Vehicle Hub authority.

For Groceries:
- barcode/GTIN, merchant catalogue identity, pack/measure and live store availability outrank appearance.

For visual-first future categories, visual similarity may carry greater discovery weight, but purchase eligibility still depends on the category's canonical attributes and live offer state.

## 6. RAG / GraphRAG boundary

VEKL / qualified retrieval may provide manuals, catalogues, technical sheets and relationships such as `fits`, `equivalent_to`, `supersedes`, `requires`, `accessory_for`, `installable_by` and `protected_by`.

RAG/GraphRAG cannot manufacture current price, current stock, settlement state, fulfilment state, binding fitment, restricted-goods eligibility or product authority. Hard eligibility is resolved before ranking.

## 7. Product identity versus seller offer

DIAL Shopping adopts the invariant:

> **Canonical product identity is not a seller offer.**

The catalogue/fitment authorities own product/variant/identifier truth. Seller/merchant authorities own seller offer, price, stock location, freshness and fulfilment promise. Search joins them for presentation.

This requirement extends the existing Spare catalogue/supplier and Groceries catalogue/merchant models; it does not create a second catalogue.

## 8. Transaction boundary — no universal cross-branch cart

This canon explicitly preserves the locked DIAL Client Application Architecture rule that there is **no universal cross-branch cart or transaction aggregate**.

DIAL Shopping may present one **Shopping Bag / Domain Carts Overview** and one cross-category activity projection, but transactional execution remains in the owning domain:

- Spare cart/order remains Spare authority.
- Grocery OrderGroup remains Groceries authority.
- Grocery Rounds remain their separately governed prepaid-entitlement product.
- Laundry booking, Tech job/quote, Projects and Health transactions remain outside a Shopping cart.
- Product + service "complete the job" experiences create linked domain intents/transactions; they do not silently collapse incompatible state machines into one order.

A same-domain multi-seller order may only exist where that domain's canonical order model supports it.

## 9. Fulfilment boundary

Shopping supports **Partner Fulfilled** and **DIAL Fulfilled** as experience labels for qualified fulfilment routes.

"DIAL Fulfilled" means DIAL operates or coordinates fulfilment/custody under the applicable domain contract. It does **not** by itself mean DIAL owns the goods or becomes principal.

For Spare, the locked agency-only model remains: the supplier remains the seller/principal and DIAL must not recreate the discarded owned-stock principal model through warehousing language.

Groceries continues to use its merchant-pick, DIAL-shopper, pickup and delivery authorities.

## 10. DIAL Product Media Studio

Product Media Studio is a shared catalogue/seller supporting capability used through existing supplier/merchant/catalogue feature authorities.

Capture pipeline:

```text
CAPTURED → UPLOADED → VALIDATING → QUALITY_CHECK → SEGMENTING
→ NORMALIZING → ENHANCING → DERIVATIVES → HUMAN_REVIEW
→ APPROVED → EMBEDDING_INDEXED → PUBLISHED
```

Required rules:
1. raw image is immutable;
2. every derivative records parent hash and pipeline/provider/model revision;
3. unnecessary public EXIF/geolocation is stripped;
4. canonical imagery may remove background, normalize colour/profile/exposure and crop/pad;
5. generative processing may not alter product geometry, labels, connectors, colour/variant-defining regions or included accessories in the canonical image;
6. generated lifestyle/studio backgrounds are provenance-labelled secondary derivatives;
7. seller/staff can compare raw and derived assets before approval;
8. approved imagery may produce visual embeddings for DIAL Lens.

## 11. Category Experience Profiles

The global DIAL shell owns identity, location, universal search/Lens, Activity, Support and Account.

Each category profile may control homepage information architecture, discovery rails, adaptive result blocks, facets, product-card emphasis, PDP hierarchy, related services/bundles and bounded visual/motion treatment within DIAL design authority.

### Groceries profile
Prioritises delivery slot, Buy Again, Pantry, category shortcuts, promotions, substitutions, weighted goods, scheduled baskets and Grocery Rounds.

### Spare Parts profile
Prioritises Garage/vehicle context, VIN/YMM, OEM/MPN, photograph-a-part, EPC/category browse, fitment confidence, seller offers and technician attachment.

Additional profiles remain activation-gated as stated in §2.

## 12. Seller Centre

The Shopping Seller Centre is a shared responsive workspace composed from the existing Supplier OS plus branch-specific merchant/supplier features.

It may expose onboarding/KYB status, canonical product matching, catalogue import, Product Media Studio, seller offers, inventory and locations, order/fulfilment work, returns/issues, analytics/search demand and settlement projection from existing financial authority.

It does not own a second customer, order, finance or catalogue truth.

## 13. External tools and repos

The researched external platforms are **candidate donors/adapters**, not Project Truth authorities.

Current candidate roles:
- Medusa — bounded marketplace/commerce donor or compatibility spike;
- Typesense — search/image-search pilot;
- Qdrant — deferred advanced vector candidate if benchmark proves need;
- Metarank — later learning-to-rank candidate;
- Fleetbase — bounded logistics/WMS/driver donor subject to licence/authority gate;
- Chatwoot — support conversation adapter;
- WACRM — WhatsApp CRM UX/workflow donor only;
- Novu — notification delivery/orchestration candidate;
- listmonk — lean marketing campaign candidate;
- Mautic — later richer marketing automation candidate;
- BillionMail — reference/donor, not default production mail transport;
- Photoroom / Cloudinary — managed Product Media Studio quality/cost benchmark;
- rembg — self-host research only after exact model-weight commercial licence admission;
- imgproxy / sharp — deterministic derivative-processing candidates;
- ZXing-C++ — barcode/identifier capture candidate;
- CameraX — Android capture substrate;
- PostHog — already governed by DEC-024 through DIAL product telemetry, not shopping truth;
- Unleash — only if a feature-management gap remains;
- Akeneo — PIM reference/deferred candidate.

No candidate becomes an enrolled production dependency merely because it appears here.

## 14. Screen Registry × Feature Graph rule

Shopping screens are canonical composition surfaces and must map bidirectionally to the existing feature authorities they expose.

The canonical screen namespace may be `SCREEN:SHOP:*` while feature authority remains, for example, `SPARE-F*`, `GROC-F*`, `PLAT-F*`.

This is deliberate. It avoids creating duplicate feature authority merely because multiple divisions share one customer screen.

## 15. Blueprint provisional IDs

Any `PROP-SHOP-F*` identifiers in the research blueprint are **non-canonical planning aliases**.

They must not be copied wholesale into `FEATURE_REGISTRY.json`.

Each alias is resolved in `SHOPPING_BLUEPRINT_INTEGRATION_MAP.json` as one of:
- composition of existing Feature IDs;
- shared supporting capability under existing authorities;
- activation-gated future category requirement.

A new top-level Feature ID is allocated only if reconciliation proves that the requirement is not already owned elsewhere.

## 16. Development and evidence

This canon defines product/experience intent, not implementation evidence.

Before any Shopping capability advances beyond `SPECIFIED`:
- resolve the owning Feature ID(s);
- create/update the per-feature acceptance contract;
- qualify exact donor/tool versions and licences;
- preserve security profile/eventuality coverage;
- generate/verify Screen Registry × Feature Graph;
- provide deterministic tests, negative cases and runtime evidence;
- update current Project Truth/evidence state honestly.

## 17. Canonical outcome

DIAL Shopping is one intelligent shopping experience over multiple authoritative DIAL domains.

It may unify discovery, image search, comparison, seller tooling and customer navigation. It may **not** unify incompatible domain transactions, erase the agency-only Spare model, bypass fitment evidence, replace Groceries fulfilment rules, or promote search/AI/donors into business authority.
