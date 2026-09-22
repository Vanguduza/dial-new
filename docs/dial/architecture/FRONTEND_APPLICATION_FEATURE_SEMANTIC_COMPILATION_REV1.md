# Frontend Application × Feature Semantic Compilation — Rev 1

## Status

Canonical DIAL frontend generation architecture amendment under `DEC-041`.

## Problem closed

A canonical screen may legitimately be referenced by multiple applications and many domain features. Those references do not mean that every application, actor, command, lifecycle or feature implementation belongs in every generated instance of the screen.

A provider packet that serializes the raw union of those references can be technically graph-complete while semantically wrong. It can mix customer and provider applications, expose internal commands on customer Home, confuse adjacent feature families, invent a plausible but incorrect domain model, or let a design model replace a product-specific visual identity with a generic category trend.

## Required compilation order

```text
Generation request
  → canonical Screen Registry × Feature Graph
  → target application / actor / platform resolution
  → screen-feature edge-role projection
  → FeatureSemanticEnvelope + subsystem boundaries
  → domain brand/product-positioning authority
  → authoritative runtime truth hydration
  → capability and interaction-intent projection
  → VEKL interaction-design preflight
  → Stitch visual generation
  → provider truth-claim extraction + TruthLiteralLint
  → visual critique/convergence
  → VisualAuthority freeze
```

Application scope and feature semantics therefore resolve before provider dispatch. Raw graph reachability is never itself a provider instruction.

## Target-application rule

Interactive screen generation targets one application/platform/actor context unless the task explicitly requests a multi-platform design exercise.

For example, the canonical Groceries Home participates in customer, merchant, shopper and courier graph contexts. A task targeting the Android customer Home compiles to `DIAL_CONSUMER_ANDROID` and `CUSTOMERS`; courier, merchant, shopper, iOS, web and WhatsApp contexts remain graph truth but are not provider context for that generation.

An unresolved target application fails provider completeness rather than merging candidate contexts.

## Screen-feature edge roles

Every explicitly governed screen-feature relation may carry one of these semantic roles:

- `PRIMARY_CAPABILITY` — principal feature authority of the screen;
- `DIRECT_INTERACTION` — directly manipulated from the screen;
- `STATUS_SUMMARY` — authoritative state may be summarized when hydrated;
- `DISCOVERY_ENTRY` — the screen may route into the deeper capability;
- `CONTEXT_ONLY` — feature semantics constrain the screen but its workflow is not exposed here;
- `DEEP_LINK_ONLY` — only a route/deep-link relationship is exposed;
- `NOT_EXPOSED` — feature is graph-related but must not be presented to this actor/application.

`UNCLASSIFIED_CONTEXT` is explicit technical debt, not permission to expose a feature. Where a module has an active semantic policy, an unclassified target-screen edge fails provider completeness.

## FeatureSemanticEnvelope

The compiler binds feature IDs to the authoritative Feature Realization Registry and overlays admitted domain semantic constraints. A provider receives feature outcome, screen-edge role, subsystem identity, canonical semantic invariants and non-equivalence guards rather than feature IDs alone.

Commands, queries and events are not automatically inherited because a feature references a screen. Provider interaction context is the screen-specific design-safe projection. Domain commands remain production/domain authority.

## Groceries canonical semantic partition

`FRONTEND_DOMAIN_SEMANTIC_REGISTRY.json` establishes the current Groceries projection:

- `NORMAL_SHOPPING` — broad grocery/household catalogue, basket/order and supported fulfilment context;
- `PANTRY` — household stock/replenishment context (`GROC-F012`);
- `SCHEDULED_BASKET` — recurring/planned basket and route-delivery functionality (`GROC-F013`);
- `GROCERY_ROUNDS` — `GROC-F019..GROC-F034`, governed collective prepaid grocery purchasing and its complete lifecycle.

Scheduled Basket and Grocery Rounds are explicitly non-equivalent.

### Grocery Rounds invariant

A Grocery Round is a governed collective prepaid grocery-purchase programme over a defined plan period. Supported configured durations include 3, 6, 9 and 12 months. Member payments create governed grocery credits/entitlements rather than withdrawable savings. Member-level accounting remains transparent; basket planning and equal member voting apply where the lifecycle requires collective decisions; purchasing power is aggregated for wholesale/bulk procurement after the relevant accumulation/planning stage; groceries are allocated against entitlements and fulfilled as groceries, including applicable free-delivery benefits.

A Grocery Round is not a Scheduled Basket, recurring-delivery subscription, flash group-buy, same-day neighbourhood wholesale order, savings account, investment pool or rotating cash mukando.

Authoritative product sources remain the Grocery Rounds master plan, Round Credit Model and locked owner decisions beginning with `DEC-001`; this frontend registry is a projection, not a competing business authority.

## Groceries Home authority

`SCREEN:GROCERIES:GROCERIES_HOME_ENTRY` is a customer discovery/navigation/light-merchandising surface. It does not become the Round Room, Grocery Rounds Command Centre, merchant workbench or fulfilment operations screen simply because those features are graph-related.

The Android customer Home exposes design-safe intents such as search/browse, Shopping mode, category/product/cart navigation, Pantry, Scheduled Basket and Grocery Rounds entry. Internal or operational domain commands are not provider instructions.

## Groceries product and visual identity

DIAL Groceries is general grocery and household commerce. Fresh produce is a category and possible merchandising story, not the application thesis.

The owner-approved Groceries visual identity is orange + black + warm white:

- DIAL orange `#F04E00` as the primary accent;
- ink/black `#141311` as the structural anchor;
- white and warm-white surfaces;
- green only as a supporting semantic colour for freshness, availability, success or sustainability.

The Home retains a first-class `Shopping mode` concept so the customer can understand/switch how they are shopping without turning Home into a fulfilment dashboard.

## Provider truth-claim contract

Visual creativity does not authorize factual invention. Stitch must embed a non-executable JSON contract with id `dial-visual-truth-claims` listing every displayed runtime/business factual literal such as prices, stock, merchant/store identity, location, ETA/slot, order ID, discounts/savings, member count, balance, entitlement, maturity date or operational status.

DIAL parses those claims from the raw provider artifact before sanitization, validates them against `ScreenTruthEnvelope`, and persists `TruthLiteralLint`. Missing/invalid truth-claim contracts or rejected truth lint prevent `VisualAuthorityArtifact` from freezing.

Provider output can remain a quarantined design candidate when it fails this gate; it simply cannot become authority.

## Interaction/motion relationship

`DEC-040` remains fully active. Application scope and semantic compilation improve the inputs to `InteractionDesignPreflight`; they do not weaken the expert interaction/motion pass. Interaction patterns are chosen for the resolved application/platform and allowed interactions, not for the union of every application that happens to share a canonical screen.

## External references

`DEC-039` remains unchanged. Repositories, galleries and libraries are reference/inspiration only. Product Truth, Screen Registry × Feature Graph, domain semantics, domain truth and DIAL visual authority remain superior.

## Enforcement

Primary enforcement is implemented by:

- `agent-system/registries/FRONTEND_DOMAIN_SEMANTIC_REGISTRY.json`;
- `agent-system/bin/build-screen-feature-graph.mjs`;
- `agent-system/orchestration/screen-feature-graph.mjs`;
- `agent-system/orchestration/frontend-generation-architecture.mjs`;
- `agent-system/orchestration/frontend-product-experience.mjs`;
- `agent-system/orchestration/frontend-design-provider-orchestrator.mjs`;
- `agent-system/orchestration/stitch-design-orchestration.mjs`;
- `tests/groceries-frontend-semantic-compiler.test.ts`.

## Acceptance invariant

A screen is not ready for Stitch merely because its canonical screen ID and feature list resolve. The exact application/actor scope, feature-edge semantics, relevant subsystem meanings, product/brand authority, capability projection and required truth must survive compilation into the provider packet. A generated candidate cannot freeze as VisualAuthority until its factual literal claims pass DIAL truth lint.
