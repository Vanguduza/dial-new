# DIAL Canonical Frontend Generation Architecture

## Status

This document defines the canonical generation path for DIAL product-experience screens.

The architecture is screen-first, feature-bound, truth-hydrated, Stitch-authored and DIAL-productionized. It incorporates the canonical `SCREEN_REGISTRY.json` and `SCREEN_FEATURE_GRAPH.json` as the execution spine rather than treating screen generation as free-form prompt work.

## Authority model

The frontend authority chain is one-way:

```text
PROJECT / PRODUCT TRUTH
        ↓
CANONICAL SCREEN REGISTRY × FEATURE GRAPH
        ↓
DOMAIN / CATALOG / EPC / TRANSACTIONAL TRUTH
        ↓
VEKL DESIGN KNOWLEDGE + OWNER-APPROVED ARCHETYPES
        ↓
STITCH VISUAL AUTHORSHIP
        ↓
VISUAL AUTHORITY FREEZE
        ↓
STITCH INTERACTION & MOTION AUTHORSHIP
        ↓
EXPERIENCE AUTHORITY FREEZE
        ↓
DIAL-NATIVE PRODUCTION BINDING
        ↓
VISUAL + INTERACTION + FUNCTIONAL PARITY CERTIFICATION
```

Reverse authority flow is forbidden. A design provider cannot redefine product truth, business rules, security behavior, money behavior, catalogue truth, fitment truth or canonical application ownership.

## Independence from DDE

DDE is a separate independent development system and is currently one project that may be developed through the DIAL Development System. This DIAL frontend architecture has no runtime, state, memory, deployment or authority dependency on DDE. Similar frontend concepts in DDE are independent unless the owner later authorizes an explicit bounded integration. DDE outage, redesign or repository evolution must not change DIAL frontend capability.

## Design-provider policy

Google Stitch is the sole automatic DIAL frontend design provider.

It owns the automatic visual-design, interaction-design and motion-enrichment passes, subject to DIAL governance and acceptance. Provider output is still quarantined and non-authoritative until the relevant DIAL authority transition freezes it.

Figma remains registered but is explicit-use-only:

- no automatic dispatch;
- no automatic Stitch outage fallback;
- no silent provider substitution;
- owner or authorized task must explicitly request Figma.

When Stitch is unavailable, the automatic frontend design path waits/retries according to runtime policy or reports provider unavailability. It does not silently switch design authors.

Canonical policy: `agent-system/registries/DESIGN_PROVIDER_POLICY.json`.

## Screen Registry × Feature Graph injection

The canonical graph is injected before truth hydration and before a provider packet exists.

For each target, DIAL resolves:

```text
application/platform
  ↕
screen
  ↕
feature
  ↕
subfeature
  ↕
supporting capability
  ↕
eventuality
  ↕
action / query / command / event
  ↕
route / module / business unit
```

This graph is bidirectional. Design can start from an application, screen or Feature ID and reach the same authority set.

The graph currently contains 20 explicit DIAL application/platform nodes, 428 canonical screens and 1,579 feature-to-screen realization edges. Required application screen coverage is fail-closed.

## Target screen resolution

A frontend task must resolve a canonical target screen before provider dispatch.

Resolution order:

1. explicit canonical `screen_id`;
2. deterministic task-intent match against the feature's canonical screen set;
3. single-screen resolution where only one candidate exists;
4. unresolved/ambiguous target → block Stitch dispatch.

Intent recognition distinguishes home/entry, detail/state, search/browse, tracking/map, support/issue, timeline/history, action sheet and operational queue surfaces.

The resolver never creates a new screen to satisfy an ambiguous prompt.

## FrontendGenerationContext

The central compiled artifact is `FrontendGenerationContext`.

It contains:

- `BusinessUnitContext`
  - module/business unit;
  - Feature ID;
  - outcome;
  - canonical domain owner;
  - aggregate;
  - business/completion rules.
- `PlatformContext`
  - canonical DIAL applications;
  - platform targets;
  - application class;
  - primary actors.
- `ActorContext`
  - exposure;
  - actor classes.
- `ScreenContext`
  - canonical target screen;
  - screen type;
  - route;
  - role boundary;
  - required/conditional states;
  - application refs.
- `FeatureContext`
  - features;
  - subfeatures;
  - actions;
  - queries;
  - commands;
  - events;
  - eventualities;
  - workflow.
- `ScreenTruthEnvelope`.
- `CapabilityEnvelope`.
- `DesignAuthority`
  - product design profile;
  - presentation decision;
  - visual reference authority;
  - applicable owner-approved archetypes.
- `FrontendAcceptanceContract`.
- hashes binding the context to Screen Registry, Screen Feature Graph, generation policy, truth-source registry and archetype registry.

The artifact is content-addressed. A provider packet therefore cannot silently detach from the screen/feature authority that produced it.

## Truth hydration

A screen packet is not allowed to make Stitch solve a data-quality problem.

`FRONTEND_TRUTH_SOURCE_REGISTRY.json` declares authoritative source families for every current DIAL feature module:

- Spare;
- Tech;
- Groceries;
- Laundry;
- Vehicle Hub;
- Care;
- Assist;
- Projects;
- Fleet;
- Health;
- Corporate;
- Platform / Command Centre;
- GMPC;
- DKRF.

For Spare, for example, the candidate sources include EPC vehicle truth, parts catalogue, fitment, inventory, pricing and visual-asset authority. Therefore values such as make, model, generation, engine code, chassis code, OEM reference or fitment may be shown when they have actually been hydrated from those authorities.

The rule is not “never show detailed facts.” The rule is “never make the design provider guess them.”

## Truth classes

Every provider-visible factual item belongs to one of four classes:

### VERIFIED_FACT

May be displayed as fact. Requires `source_id` and `provenance_ref`.

### VERIFIED_DERIVED_FACT

May be displayed when deterministically derived from verified inputs. Requires provenance plus `derivation_ref`.

### CREATIVE_PRESENTATION

Stitch may invent expressive, non-factual presentation such as editorial headlines or brand-level phrasing, provided it creates no unsupported product/legal/performance claim.

### DESIGN_PROPOSAL_FACT

A provider-proposed factual idea may be retained for verification, but it is blocked from production until promoted by an authoritative source.

Unknown facts are omitted or deferred. Realism comes from design quality and hydrated truth, not fake precision.

## Completeness gate

Provider dispatch is fail-closed when any required condition is missing, including:

- no canonical screen mapping;
- unresolved/ambiguous target screen;
- no feature authority for a feature-backed screen;
- no application/platform mapping;
- required screen truth not hydrated;
- a claimed verified fact uses an unknown truth source;
- capability authority is incomplete.

The context can be planning-ready while still not provider-dispatch-ready. This permits upstream work to continue without allowing an incomplete packet to reach Stitch.

## Screen role boundaries

Each canonical screen receives an explicit role boundary.

Examples:

- home/entry → discovery, navigation, context and light merchandising;
- product/detail → inspection, verified benefits, compatibility and commerce;
- tracking → authoritative live state, route/ETA where supported, issue path;
- action sheet → only domain-allowed contextual actions;
- issue/support → preserved context, evidence and escalation;
- timeline → authoritative history only;
- search/browse → authoritative query/result discovery;
- queue → operational work prioritization and exceptions.

These boundaries prevent visually attractive but semantically misplaced modules. For example a commerce home cannot drift into an engineering benchmark dashboard, and a product page cannot invent a performance-index console merely to look technical.

## Owner-approved discovery archetype

`DIAL_COMMERCE_DISCOVERY_EDITORIAL_HERO_V1` is the first owner-approved DIAL commerce composition archetype.

It preserves the reusable grammar of the preferred Spare discovery screen:

- utility header;
- compact selected-context switch;
- contextual visual hero;
- hero-to-surface dissolve;
- context/title content overlapping that transition;
- elevated search bridge;
- multimodal search where capability-backed;
- one-row horizontal category rail;
- domain-specific icons;
- one dominant merchandising moment;
- quieter secondary collection;
- stable bottom navigation.

It is explicitly `GRAMMAR_NOT_PIXEL_COPY`. Hero subject, crop, copy, category representation, product composition, type scale, contextual actions and other expressive decisions remain variable.

Archetype applicability is screen/business-unit aware. It is not forced onto operational tracking, POS-like, administrative or otherwise unsuitable surfaces.

## Visual generation pass

The Stitch visual packet is compiled from the complete generation context.

It carries:

- target screen and role;
- application/platform context;
- feature/subfeature semantics;
- actions and states;
- verified truth literals and provenance class;
- capability envelope;
- design profile;
- owner-approved archetypes;
- acceptance requirements;
- reference policy;
- creative authority boundaries.

Functional requirements do not map one-to-one to components. Stitch has substantial authority over composition, hierarchy, typography, imagery, iconography, merchandising, visual storytelling, spacing, surfaces and micro-composition.

The provider must not invent domain truth or screen responsibilities.

## Visual critique and convergence

Exploration may produce multiple meaningfully different candidates. Convergence must use critic evidence and preserve the strongest distinctive direction rather than averaging candidates into a generic design.

Critique remains subordinate to hard product/truth/accessibility gates.

Provider artifacts are quarantined before admission. Raw provider output is not directly executable production code.

## VisualAuthorityArtifact

After a candidate is accepted, an owner or authorized design authority may freeze it.

The frozen artifact binds:

- generation-context hash;
- canonical screen;
- Stitch project/screen locator;
- coded artifact reference;
- rendered preview reference;
- critique evidence;
- composition;
- hierarchy;
- section order;
- imagery strategy.

After freeze, ordinary implementation workers may not redesign the screen.

## Interaction & Motion Enrichment Pass

The frozen visual artifact is sent back to Stitch in a separate second pass.

The instruction is to preserve the approved composition and determine whether context-appropriate interaction or motion improves usability, continuity, comprehension or perceived quality.

Allowed design decisions can include, only where capability-backed:

- swipe and horizontal rails;
- scroll snap;
- product carousel/gallery;
- tap-to-zoom or fullscreen image inspection;
- tabs;
- accordion disclosure;
- bottom sheets;
- sticky actions;
- favourite/save feedback;
- cart feedback;
- loading transitions;
- navigation transitions;
- restrained scroll-linked motion.

`NO_EFFECT_NEEDED` is a valid result.

Capability invention is forbidden. A design model may decide how to present an available image-search capability; it may not invent an AR installation system simply because it would look impressive.

Motion must communicate hierarchy, continuity, cause/effect or feedback. Gratuitous animation is rejected.

## Interaction artifacts

The enrichment pass is reviewed against explicit structured artifacts:

- `InteractionIntentMap` — element → trigger → behavior → purpose;
- `GestureMap` — tap/swipe/drag/pinch/keyboard behavior;
- `MotionSpec` — transition/motion semantics and reduced-motion behavior;
- `AdvancedComponentDecisionSet` — carousel, zoom viewer, sheet, tabs, sticky action, etc.;
- `InteractionAcceptanceMatrix` — no dead controls, capability backing, touch targets, accessibility, reduced motion, performance, state restoration and gesture-conflict checks.

Provider-enriched HTML is quarantined in the same way as visual output. The structured interaction contract is what DIAL's native frontend production layer uses to implement safe production behavior.

## ExperienceAuthorityArtifact

When interaction acceptance passes, visual and interaction authority are frozen together as `ExperienceAuthorityArtifact`.

It locks:

- visual authority;
- interaction intent;
- gestures;
- motion;
- advanced component decisions;
- acceptance evidence.

Its productionization policy is `PRESERVE_EXPERIENCE_AUTHORITY_NO_REDESIGN`.

## DIAL-native productionization

DIAL's native frontend production layer does not look at a screenshot and improvise a similar UI.

The DIAL-native frontend production layer receives the frozen experience and creates a `ProductionBindingContract` mapping:

- visual components → production components;
- screen actions → real domain actions;
- facts → real runtime data bindings;
- queries → real query contracts;
- commands → real command contracts;
- events → real event contracts;
- navigation → registered routes.

Hard policy:

- preserve visual parity;
- preserve interaction parity;
- bind real data;
- create no provider runtime dependency;
- do not redesign the approved experience.

Static literals may remain only when they are verified immutable content. Runtime values such as vehicle, price, availability, fitment or state must bind to canonical data sources.

## Truth literal lint

Before production acceptance, factual-looking candidate content is checked against the `ScreenTruthEnvelope`.

A candidate literal is:

- verified and matching;
- verified but mismatched → blocking;
- unverified → blocking until removed or verified.

This allows a richly detailed screen when the packet actually contains rich catalogue/EPC truth while preventing Stitch from manufacturing that detail.

## FDEP integration

`FrontendDesignExecutionPacket` now carries:

- `screen_feature_projection`;
- `target_screen_resolution`;
- `frontend_generation_context`;
- existing product design profile;
- surface/state matrix;
- visual authority;
- presentation decision;
- creative strategy;
- change budget.

FDEP status distinguishes a packet that is ready for Stitch from one that is still awaiting screen/truth completeness.

FDEP freshness verifies the Screen Feature Graph hash so graph changes invalidate stale frontend packets.

## VEKL integration

VEKL remains responsible for admitted design knowledge, critics, freedom budgets, donor applicability, anti-patterns and learned design authority.

The Screen Registry × Feature Graph tells VEKL what screen is being designed and which features/capabilities/truth domains apply. VEKL does not invent missing domain truth.

The screen-quality packet can carry the generation-context hash, graph hash, target screen, application refs, feature refs, truth-envelope hash, capability-envelope hash and role boundaries.

## Provider security boundary

Stitch is a development-time provider, never a production runtime dependency.

Provider artifacts remain quarantined. DIAL stores raw provider artifacts privately for evidence and converts reviewable output into inert evidence before downstream use. Production behavior is re-bound through DIAL domain contracts.

Provider output cannot alter Project Truth, the Screen Registry, Feature Graph, product authority, money authority, security policy or canonical state machines.

## Verification

The architecture is guarded by:

- `agent-system/orchestration/frontend-generation-architecture-check.mjs`;
- `tests/frontend-generation-architecture.test.ts`;
- `tests/screen-feature-graph.test.ts`;
- existing frontend Product Experience tests;
- existing guided-design tests;
- existing Stitch capability/orchestration tests.

The architecture gate checks at minimum:

- Stitch-only automatic provider policy;
- explicit-only Figma policy;
- graph completeness and bidirectionality;
- truth-source coverage for all current DIAL modules;
- owner-approved archetype registration;
- deterministic target-screen resolution;
- truth-hydration fail-closed behavior;
- provider routing with no silent substitution;
- canonical Stitch packet compilation;
- visual freeze before interaction/motion;
- DIAL-native no-redesign productionization policy.

## Canonical files

```text
agent-system/registries/SCREEN_REGISTRY.json
agent-system/registries/SCREEN_FEATURE_GRAPH.json
agent-system/registries/FRONTEND_GENERATION_POLICY.json
agent-system/registries/FRONTEND_TRUTH_SOURCE_REGISTRY.json
agent-system/registries/FRONTEND_ARCHETYPE_REGISTRY.json
agent-system/registries/FRONTEND_PRODUCT_PROFILE_REGISTRY.json
agent-system/registries/DESIGN_PROVIDER_POLICY.json
agent-system/registries/FRONTEND_CONTRACT_SCHEMA_REGISTRY.json

agent-system/orchestration/screen-feature-graph.mjs
agent-system/orchestration/frontend-generation-architecture.mjs
agent-system/orchestration/frontend-product-experience.mjs
agent-system/orchestration/frontend-design-execution-packet.mjs
agent-system/orchestration/frontend-design-provider-orchestrator.mjs
agent-system/orchestration/screen-quality-packet.mjs
agent-system/orchestration/stitch-design-orchestration.mjs
agent-system/orchestration/providers/google/stitch-adapter.mjs
```

## Final invariant

A DIAL screen must never reach automatic design as “a prompt asking an AI to make a screen.”

It reaches Stitch as a compiled, hash-bound execution context that already knows **which DIAL application it belongs to, which canonical screen it is, which features and states it realizes, which authoritative data exists, which capabilities are real, which design authorities apply, what the screen is responsible for, and what it is forbidden to become**.

Stitch owns visual and interaction authorship inside that envelope. DIAL's native frontend production layer owns faithful productionization. Product/domain authority remains superior to both.
