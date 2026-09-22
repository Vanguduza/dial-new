# Frontend Design Synthesis & Renderability — Rev 1

## Status

Canonical DIAL frontend-generation architecture under `DEC-042`.

## Purpose

Frontend packets contain far more truth than should ever become visible screen content. Product semantics, feature contracts, state requirements, interaction preflight, accessibility rules, acceptance gates, provenance and graph identifiers are necessary for correctness, but they are not all customer-facing content.

`DEC-042` introduces an explicit **knowledge-to-design synthesis layer** between semantic compilation and Stitch visual generation. The provider must use the packet to understand the product, then synthesize a coherent experience. It must not render the packet as a requirements inventory.

## Governing rule

```text
KNOW EVERYTHING REQUIRED FOR CORRECTNESS
            ↓
CLASSIFY WHAT IS RENDERABLE
            ↓
SYNTHESIZE CUSTOMER EXPERIENCE
            ↓
COMPOSE VISUAL HIERARCHY
            ↓
GENERATE WITH STITCH
            ↓
LINT FOR FEATURE/DEBUG DUMPING
            ↓
VISUAL AUTHORITY
```

Functional completeness is demonstrated by correct flows, state behavior and capability-backed interactions. It is **not** demonstrated by visibly listing every feature, policy, state or subsystem on the screen.

## Four renderability channels

Every provider-relevant fact is classified into one of four channels.

### 1. RENDERABLE_CUSTOMER_CONTENT

Material that may become visible customer experience when appropriate:

- product/category discovery;
- search and primary task entry;
- meaningful customer context;
- product/content collections;
- primary actions;
- continuity/repeat-use opportunities;
- customer-facing entry points to deeper capabilities;
- truth-backed status summaries where useful.

Even here, one item does not automatically equal one section. Related capabilities are compressed into coherent experience zones.

### 2. BACKGROUND_PRODUCT_SEMANTICS

Product meaning required for correctness but not normally deserving independent screen space:

- lifecycle semantics;
- approval/authority rules;
- entitlement rules;
- substitution behavior;
- cold-chain/fulfilment semantics;
- accounting/ledger meaning;
- disputes/remedies;
- deeper subsystem behavior.

These facts influence wording, affordances, availability and deeper navigation. They do not automatically become cards or panels.

### 3. DESIGN_CONSTRAINT_ONLY

Requirements that shape behavior and composition but are not customer content:

- required/conditional screen states;
- accessibility;
- reduced motion;
- responsive recomposition;
- gesture conflict handling;
- performance budgets;
- platform-native behavior;
- truth-provenance constraints;
- capability boundaries.

Loading/error/offline requirements therefore create robust component behavior, not a customer-visible “State Preflight Simulator”.

### 4. VALIDATION_ONLY

Material that must never appear in customer UI:

- feature IDs;
- screen IDs;
- graph references;
- packet hashes;
- preflight controls;
- state simulators;
- test hooks;
- acceptance matrices;
- debug/status panels;
- engineering labels;
- provenance records.

## DesignSynthesisBrief

`compileFrontendDesignSynthesis()` creates a `FrontendDesignSynthesisBrief` from the resolved `FrontendGenerationContext`.

The brief contains:

- screen purpose;
- renderability channels;
- feature-to-experience transformation;
- composition budget;
- required/optional experience zones;
- visual-storytelling contract;
- forbidden dominant sections;
- internal traceability retained outside customer rendering.

The provider receives the **synthesized experience model** instead of being asked to independently decide which technical requirements deserve visual real estate.

## Feature-to-experience transformation

Feature graph membership is not equivalent to visual-section membership.

Examples for Groceries Home:

- catalogue projection → search/category/product discovery;
- shopping/fulfilment selection → compact `Shopping mode` context;
- substitutions → background cart/product behavior;
- approval ceiling → background transactional constraint;
- cold-chain evidence → trust/detail/fulfilment behavior when relevant;
- Pantry → continuity/replenishment entry;
- Scheduled Basket → continuity entry;
- Grocery Rounds → customer discovery/status entry into the long-horizon prepaid grocery programme;
- Round Room / voting / ledger / allocation → deeper Round semantics, never separate Home sections.

## Composition budgets

Screen purpose controls visual priority. A `HOME_ENTRY` should not have the same composition budget as a queue, form or detail screen.

For `SCREEN:GROCERIES:GROCERIES_HOME_ENTRY`, the required composition is discovery-led:

- hero discovery;
- Shopping mode;
- search;
- category discovery;
- popular/relevant products;
- customer continuity;
- supporting discovery;
- primary navigation.

Optional entries include Pantry, Scheduled Basket, Grocery Rounds and offers/collections.

At least 65% of meaningful Home content is reserved for discovery/merchandising/customer momentum. System assurance/policy material is capped at 5% and should normally be implicit. State simulators, policy explainers, guarantees panels, fulfilment-policy panels, cold-chain status panels, feature matrices and engineering status are forbidden as dominant sections.

## Visual storytelling

Discovery-oriented consumer screens require visual communication, not only functional density.

For Groceries Home:

- an image-led hero/value moment is required unless authoritative content makes it impossible;
- imagery priority is high;
- imagery must support general grocery/household discovery, customer value and the shopping moment;
- imagery must not redefine DIAL Groceries as fresh-produce-only, a speciality farm market or an operational dashboard.

The owner-approved orange + black + warm-white Groceries identity remains superior. Green remains semantic/supporting rather than dominant.

## Stitch provider prompt policy

Provider-visible prompts lead with the Design Synthesis Contract. Raw feature IDs and screen IDs are retained in DIAL packet provenance but are removed from the creative prompt. Feature semantics are translated into customer experiences and background constraints before provider dispatch.

The prompt explicitly tells Stitch:

- do not turn every feature into a card, section, badge or navigation destination;
- state/error/loading requirements are behavior constraints, not simulator UI;
- validation/debug/provenance material must never render;
- synthesize a few strong experience zones;
- preserve substantial creative authority over composition, imagery, hierarchy and visual storytelling;
- maintain functional correctness through capability-backed interactions and state handling.

## DesignSynthesisLint

Prompting alone is not sufficient. Raw Stitch HTML is evaluated before VisualAuthority can freeze.

`DesignSynthesisLint` currently blocks:

- visible feature IDs;
- visible screen IDs;
- visible preflight/state simulators;
- visible acceptance/feature matrices;
- debug/status/packet-hash engineering UI;
- background semantics promoted into dominant headings such as Grocery Guarantees, fulfilment policy or cold-chain status;
- missing image-led storytelling where the synthesis contract requires a hero visual.

A rejected candidate remains quarantined evidence but cannot become `VisualAuthorityArtifact`.

## Relationship to truth lint

`DesignSynthesisLint` and `TruthLiteralLint` are separate gates:

- `DesignSynthesisLint` asks: **did the provider turn knowledge into the right kind of screen?**
- `TruthLiteralLint` asks: **are the displayed factual literals authoritative?**

Both must pass before VisualAuthority freezes.

## Relationship to interaction/motion

`DEC-040` remains active. The synthesis brief shapes the visual composition before generation; interaction preflight ensures the composition can support modern behavior; after visual freeze, the expert interaction/motion pass enriches that accepted design without silently redesigning it.

## SaaS/product design acuity

The synthesis system seeks modern, professional, visually authored product quality appropriate to the application class. Enterprise/operations surfaces may use professional SaaS workspace patterns. Consumer commerce surfaces should achieve equivalent polish without being forced into an enterprise dashboard shell. “Professional SaaS quality” means hierarchy, clarity, responsive composition, spacing, typography, states, interaction, motion and optical polish — not card density.

## Enforcement

Primary enforcement:

- `agent-system/registries/FRONTEND_DESIGN_SYNTHESIS_POLICY.json`;
- `agent-system/orchestration/frontend-design-synthesis.mjs`;
- `agent-system/orchestration/frontend-design-provider-orchestrator.mjs`;
- `agent-system/orchestration/frontend-generation-architecture.mjs`;
- `agent-system/orchestration/stitch-design-orchestration.mjs`;
- `agent-system/orchestration/frontend-design-synthesis-check.mjs`;
- `tests/frontend-design-synthesis.test.ts`.
