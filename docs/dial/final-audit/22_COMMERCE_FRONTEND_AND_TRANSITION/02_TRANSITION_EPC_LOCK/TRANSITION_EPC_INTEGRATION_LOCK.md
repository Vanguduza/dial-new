# DIAL v2.1 — Vehicle Transition / EPC Integration Lock

The two supplied specialist documents are authoritative for the vehicle-to-EPC journey:

- `03_TRANSITION_EPC_SOURCE/CATALOG_AGENT_BUILD_PROMPT.md`
- `03_TRANSITION_EPC_SOURCE/DIAL_FULL_CUSTOMER_EXPERIENCE_INTEGRATION_BLUEPRINT.md`

The broader website/frontend team must integrate around these contracts.

## Locked journey

```text
select or restore exact vehicle
→ server resolves one active vehicle context
→ customer commits with Search
→ transition starts automatically
→ approved hero
→ studio CGI
→ engineering line art
→ continuous physical separation into exploded systems
→ invisible click map activates
→ click routes to selected vehicle's EPC category family
→ assembly group
→ diagram
→ synchronized positions/parts
```

## One active vehicle context

Every Home/Spare/Garage/EPC/transition interaction retains:

```text
catalogReleaseId
makerId
catalogFamilyId
generationId
variantId
fitmentId
visualFamilyId
flowPackId
market
source
```

Visual appearance may be shared between variants. Exact fitment may not.

## Customer-visible transition constraints

Required visible sequence:

```text
HERO_PHOTOGRAPHY
IDENTITY_LOCK
STUDIO_CGI
ENGINEERING_LINE_ART
EXPLODED_SYSTEMS
VISUAL_HIT_MAP
EPC_SECTION_HANDOFF
EPC_DIAGRAM_AND_PARTS
```

`Technical` is not a customer-visible stage.

No:
- Play control;
- visible progress bar/percentage;
- stage labels;
- visible hotspot dots/labels;
- noisy helper UI inside the visual window.

Search commitment triggers the transition automatically.

## Continuous explosion

Do not crossfade from line art to an already-separated still.

Major groups need:
- layer/mask;
- origin;
- destination;
- depth;
- timing;
- easing;
- continuous interpolation.

The final moving frame aligns with the stable exploded master.

Reduced-motion can jump safely to the stable exploded result.

## Invisible navigation

The exploded vehicle is itself the navigation control.

Hit regions:
- are invisible;
- use normalized geometry;
- are forgiving on mobile;
- resolve within the active vehicle/release;
- open a section/category family, not a raw source node;
- have a safe Body & Exterior fallback when an otherwise visible component is not specifically classified.

Equivalent keyboard/screen-reader category actions remain available.

## EPC hierarchy

```text
selected vehicle
→ section/category family
→ assembly group
→ diagram
→ position/hotspot + synchronized parts
```

Use stable DIAL `DGM-*` diagram IDs.

Never use `source_node_id` as a global/public diagram identity.

## My Garage

Every EPC-ready saved vehicle supports:

1. `Start visual parts journey`
2. `Open EPC categories`

The second action bypasses animation entirely.

Release changes revalidate stable identities. Ambiguous changed fitment requires customer confirmation.

## Customer visibility release gate

A vehicle is public only when all pass:

```text
IDENTITY_READY
CASCADE_READY
FITMENT_READY
HERO_READY
TRANSITION_READY
EPC_HIERARCHY_READY
DIAGRAM_READY
HOTSPOT_READY
PART_DATA_READY
ROUTING_READY
QA_READY
```

The acquisition backlog remains internal.

## Commerce integration

The Shop-Ecommerce-derived Spare frontend may control page composition around the visual module, but it may not:

- alter active vehicle identity;
- start animation before exact resolution;
- replace the flow stages;
- expose incomplete vehicles;
- convert invisible hit regions into visible hotspot UI;
- change EPC route identity;
- bypass direct-EPC fallback;
- replace the catalogue readiness gate.

The transition system is a specialist subsystem plugged into the storefront through stable DIAL contracts.
