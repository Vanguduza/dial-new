# DIAL Canonical Screen Registry × Feature Graph

## Status

Canonical frontend authority derived from Project Truth and the final realization layer.

The graph is generated, not hand-maintained. The authoritative generated artifacts are:

- `agent-system/registries/SCREEN_REGISTRY.json`
- `agent-system/registries/SCREEN_FEATURE_GRAPH.json`

The generator is:

- `agent-system/bin/build-screen-feature-graph.mjs`

Runtime resolution is provided by:

- `agent-system/orchestration/screen-feature-graph.mjs`

## Purpose

The graph makes every frontend generation task screen-aware before design starts.

The design system must be able to answer, in both directions:

```text
SCREEN -> FEATURES
FEATURE -> SCREENS
SCREEN -> SUBFEATURES
SUBFEATURE -> SCREENS
SCREEN -> SUPPORTING CAPABILITIES
CAPABILITY -> SCREENS
SCREEN -> EVENTUALITIES
EVENTUALITY -> SCREENS
SCREEN -> ACTIONS / QUERIES / COMMANDS / EVENTS
ACTION / QUERY / COMMAND / EVENT -> SCREENS
SCREEN -> APP FAMILY / APP SURFACE / ROUTE / MODULE
APP FAMILY / APP SURFACE / ROUTE / MODULE -> SCREENS
```

This graph is the canonical screen/feature spine used before truth hydration, Stitch packet compilation, interaction/motion enrichment, implementation binding and parity certification.

## Source authorities

Generation consumes the current canonical registries rather than copying their contents into a second manually curated model:

- `FEATURE_REALIZATION_REGISTRY.json`
- `SUBFEATURE_FUNCTION_REGISTRY.json`
- `SUPPORTING_CAPABILITY_REGISTRY.json`
- `EVENTUALITY_PLAYBOOK_REGISTRY.json`
- `SHARED_PLATFORM_FUNCTION_REGISTRY.json`
- `CUSTOMER_ENDPOINT_REGISTRY.json`

The DIAL client application architecture supplies platform/channel interpretation for the app-family values already declared by feature realization records.

No feature, screen, app-family or relation is silently invented by the graph builder.

## Canonical screen identity

A canonical screen ID is scoped by module and declared surface name:

```text
SCREEN:<MODULE>:<NORMALIZED_DECLARED_SCREEN_NAME>
```

This prevents generic names such as `Issue/support entry` from accidentally collapsing unrelated business-unit screens into one node.

A screen may be realized by many features. A feature may be realized by many screens.

## App-surface identity

Every module × app-family pair is represented as an explicit application surface:

```text
APP_SURFACE:<MODULE>:<APP_FAMILY>
```

This preserves the distinction between the same business capability appearing in consumer, web, WhatsApp, business, health, staff, internal or Command Centre contexts.

Platform profiles are derived from the current client architecture:

- DIAL Consumer -> Android / iOS
- DIAL Web -> responsive web
- WhatsApp -> conversational companion
- DIAL Health -> Android / iOS
- DIAL Health Web -> web
- WhatsApp Health -> official health conversational channel
- DIAL Business -> business client
- DIAL Business Web -> business web
- Command Centre -> operator/control web
- Staff Web -> staff web
- DIAL Business Internal -> internal business application

Unknown future app-family values remain explicitly unclassified and fail the completeness gate until a platform profile is added.

## Screen-feature realization edge

Each declared feature-to-screen occurrence produces a `ScreenFeatureRealization` record carrying the source feature's:

- app families
- app surfaces
- primary route
- workflow
- allowed customer/operator actions
- queries
- commands
- events
- child subfeatures
- supporting capabilities
- applicable eventualities
- provenance

The edge therefore preserves more than a visual association. It preserves the operational contract that explains why the screen exists.

## Subfeature mapping

The current subfeature registry maps each subfeature to a parent feature, not directly to a screen.

The canonical graph projects those subfeatures to the screens declared by their parent feature and labels that relationship through the generated screen-feature realization.

This is deterministic inheritance from an explicit parent relation, not semantic guessing.

Future direct subfeature-to-screen authority may override this inheritance when the source registries gain screen-local mappings.

## Shared platform functions

The shared platform function registry is included in graph source provenance and completeness statistics.

It does not currently contain explicit per-screen edges. The graph therefore does not fabricate them.

A future canonical `platform_function_refs` relation must be added at feature or screen authority level before screen-specific platform-function edges may be emitted.

This is a deliberate truth boundary.

## Injection point

For Product Experience work, the order is:

```text
Development Unit / feature target
        |
        v
SurfaceManifest
        |
        v
ScreenFeatureProjection        <-- canonical graph injected here
        |
        v
truth / catalogue / EPC hydration
        |
        v
screen-specific completeness gate
        |
        v
VEKL design authority
        |
        v
Stitch visual production packet
        |
        v
Stitch visual candidate
        |
        v
visual convergence + authority freeze
        |
        v
Stitch interaction & motion enrichment
        |
        v
DDE production binding
        |
        v
visual + interaction + functional parity
```

`frontend-product-experience.mjs` resolves the `ScreenFeatureProjection` and fails closed when a known feature has no canonical screen mapping.

The `DesignBriefBundle` carries the screen-feature projection hash so a provider packet cannot silently detach from the screen/feature authority used to build it.

## Truth hydration boundary

The graph determines what screen and feature context must be present.

It does not replace business truth.

For example, a Spare discovery screen can resolve to:

- vehicle selection feature
- catalogue browsing feature
- fitment feature
- image-search capability
- cart actions
- eventuality paths

The subsequent truth-hydration stage must still obtain concrete vehicle, engine, generation, EPC, catalogue, pricing, inventory and fitment truth from their authoritative systems.

This is the distinction between:

```text
WHAT THIS SCREEN NEEDS
```

and:

```text
THE CURRENT VERIFIED VALUES TO SHOW
```

## Bidirectional invariants

The graph is invalid if any of the following occurs:

1. A declared feature screen is absent from the canonical screen registry.
2. A feature-to-screen relation does not have the reverse screen-to-feature relation.
3. A projected subfeature has no valid parent feature.
4. A referenced supporting capability is absent.
5. A referenced eventuality is absent.
6. An app family has no platform profile.
7. The generated graph references a different screen-registry hash.
8. Generated artifacts differ from a fresh deterministic rebuild.

These invariants are checked by:

- `tests/screen-feature-graph.test.mjs`
- `npm run agent:screen-feature-graph`

## Design-provider rule

This graph is upstream of design providers.

A provider receives a compiled screen-specific execution context. It does not decide which DIAL features belong on a screen.

Stitch may exercise visual and interaction creativity inside the supplied screen/feature/truth/capability boundaries.

The graph therefore preserves the rule:

```text
creative freedom in presentation and interaction
!=
freedom to invent product authority
```

## Maintenance

Do not manually edit the generated JSON files.

Change the upstream canonical realization/endpoint registries, then run:

```bash
node agent-system/bin/build-screen-feature-graph.mjs
```

CI/currentness verification uses:

```bash
npm run agent:screen-feature-graph
```

A clean rebuild must be byte-identical.
