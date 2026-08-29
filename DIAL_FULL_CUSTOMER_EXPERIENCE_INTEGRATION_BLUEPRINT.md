# DIAL Vehicle-to-EPC Integration Blueprint

## Focused specification for vehicle selection, visual transition, EPC browsing, and My Garage

**Version:** 2.2  
**Date:** 30 August 2026

---

## 1. Purpose and scope

This document explains only how four DIAL capabilities must be integrated into the final website:

1. exact vehicle selection;
2. the automatic visual transformation;
3. vehicle-scoped EPC browsing;
4. My Garage.

It does not prescribe the rest of the website’s visual design, page composition, branding, typography, header, footer, marketing content, commerce layout, or general design system. The final website designer may integrate these capabilities into the wider site as appropriate, provided the interaction and data contracts below remain unchanged.

The required customer flow is:

```text
Select or restore an exact vehicle
→ commit the selection with Search
→ run the transition automatically
→ click an invisible region of the exploded vehicle
→ open the corresponding EPC category family
→ browse groups, diagrams, positions, and parts
```

The visual layer helps the customer recognize where a part belongs. Exact fitment remains controlled by the catalog and fitment identity.

---

## 2. Integration principles

### 2.1 One active vehicle context

Homepage selection, My Garage, Browse EPC, visual transition, diagrams, search, and parts must use the same resolved vehicle context:

```json
{
  "catalogReleaseId": "CAT-...",
  "makerId": "MK-...",
  "catalogFamilyId": "CF-...",
  "generationId": "CG-...",
  "variantId": "CV-...",
  "fitmentId": "FIT-...",
  "visualFamilyId": "VF-...",
  "flowPackId": "H2E-...",
  "market": "ZA|ZW|...",
  "source": "homepage|garage|menu|vin"
}
```

No route may silently replace this context with a generic make/model record.

### 2.2 Visual identity and fitment identity are separate

Several variants may share one visual family. That is acceptable for the hero and motion assets. They must still retain separate fitment IDs and variant applicability in the EPC.

```text
visualFamilyId = shared appearance
fitmentId      = exact catalog applicability
```

### 2.3 Only complete flows are customer-visible

The internal acquisition universe can include incomplete makes and models. The customer vehicle selector must show only records whose complete selection-to-EPC path has passed release gates.

```text
customerVisible = true
AND QA_READY = PASS
AND catalog release is published
AND compatible flow pack is production-ready
```

### 2.4 Vehicle-specific open-license visual sourcing

The Hilux pack is a development fixture only. Its hero, CGI, line art, exploded artwork, masks, and hit regions must never be copied into another vehicle family.

Every model marked for catalog inclusion receives its own visual-source and transition record before catalog fitment data is complete:

```text
marked vehicle identity
→ Wikimedia Commons candidate search
→ Openverse fallback discovery
→ exact make/model/generation review
→ automated license allowlist and attribution capture
→ approved hero
→ vehicle-specific CGI, line art, exploded systems and hit map
→ catalog family and fitment IDs injected later
```

Accept only commercial-use licenses that permit derivatives, such as CC0, Public Domain Mark, CC BY, and CC BY-SA. Reject NC and ND material automatically. Persist creator, license, license URL, original file URL, source landing page, and attribution with every selected image. Do not add a routine human license-review step when complete allowlisted metadata is present. Escalate only missing or conflicting metadata. Human confirmation is reserved for exact vehicle identity, generation, and body style.

The catalog-wide planning artifact is `catalog-data/generated/visual-transition-source-queue.json`. It must contain one unique planned flow pack per marked vehicle, canonical category-family route templates, generation blockers, and a strict rule that one vehicle's source or derived assets cannot seed another vehicle.

---

## 3. Vehicle selection integration

### 3.1 Entry sources

The vehicle selector must accept four sources:

- manual progressive selection on the homepage;
- the primary or active vehicle from My Garage;
- an explicit saved-vehicle action from My Garage;
- a VIN resolution result when VIN support is available.

All sources end by producing the same resolved vehicle context.

### 3.2 Progressive cascade

The standard cascade is:

```text
Make
→ Model family
→ Generation / production range / body
→ true variant or exact specification when required
→ Search
```

Requirements:

- Enable each field only after its parent has a valid value.
- Load the next options from the active customer-ready catalog release.
- Changing an upstream field clears incompatible downstream values.
- Collapse a step when it offers no real catalog choice.
- Do not expose a synthetic one-to-one variant merely to preserve a route shape.
- Use production range, chassis, body, engine, transmission, driveline, and market to disambiguate when needed.
- Never include acquisition-backlog records in the customer selector.
- Search must resolve the selected labels to one server-validated vehicle context before the visual transition starts.

### 3.3 Saved vehicle on the homepage

When the customer has a primary or active Garage vehicle:

1. preload its values into the cascade;
2. retain all fields as normal editable values;
3. let Search confirm that vehicle;
4. resolve the current published catalog and flow-pack versions;
5. start the transition automatically only when that exact vehicle has not already completed the flow in the active customer session; otherwise restore the settled exploded view.

An asynchronously loaded Garage vehicle must not overwrite an explicit selection the customer has already started in the current tab.

### 3.4 Committed field appearance

After Search succeeds:

- keep the selected data visible in the fields;
- show the committed values as faint grey text;
- do not convert them to placeholder text;
- preserve field labels and accessibility names;
- restore normal value contrast when the customer focuses or edits a field;
- clear the committed state if an upstream selection changes;
- stop/reset the previous vehicle’s transition when editing begins.

The faint treatment must remain readable and meet accessibility contrast requirements.

### 3.5 Search is the transition trigger

There is no Play button.

```text
trigger = VEHICLE_SEARCH_COMMITTED
userPlayControl = false
```

Search performs two operations in order:

1. commit the exact resolved vehicle context;
2. start its approved transition flow automatically when the resolved vehicle fingerprint differs from the completed-flow fingerprint.

The transition must not begin from incomplete client-side labels while vehicle resolution is still pending.

If Search resolves the same unchanged vehicle whose flow is already complete, do not replay automatically. Restore the settled exploded view. Editing any identity-bearing cascade value invalidates that completion match and allows the newly resolved vehicle flow to run.

---

## 4. Visual transition integration

### 4.1 Visible sequence

The customer-visible sequence is strictly:

```text
Approved hero image
→ studio CGI
→ engineering line art
→ continuous physical separation into the exploded vehicle
→ invisible EPC click map becomes active
```

There is no customer-visible Technical stage. A technical render may exist internally as an asset-production aid, but it must not appear in the transition, public flow manifest, website labels, or visible stage sequence.

### 4.2 Transition window content and placement

The visual window may display only these two text elements:

At the top:

```text
click on the category image to browse parts
```

At the bottom-left, in compact type that does not cover the vehicle:

```text
Know your {exact chosen model}. Find the right part.
```

Example:

```text
Know your Toyota Hilux AN120/AN130. Find the right part.
```

The bottom-left headline must use a restrained responsive size and maximum width. Its bounding box must remain in the negative-space area of every approved hero, line-art, motion, and exploded crop.

Do not show any other visible text or interface inside the transition window. Specifically remove:

- progress percentage;
- progress bar;
- Hero / CGI / Technical / Line art / Exploded / Browse labels;
- current-stage labels;
- “interactive vehicle view” badges;
- transition status text;
- trust or VIN explanation text;
- system-selection panels;
- visible hotspot dots;
- hotspot labels;
- play, pause, restart, or scrub controls.

Vehicle fields may remain outside the window in the website’s selection area.

### 4.3 Continuous line-art explosion

Line art must not crossfade suddenly into a fully separated still image.

The required motion is:

1. hold the complete line-art vehicle long enough to establish its structure;
2. identify the major movable groups in the explosion plan;
3. begin each group at its assembled vehicle position;
4. move body shell, engine, transmission, brakes, suspension, and other groups along controlled vectors;
5. use continuous interpolation with no frame jump;
6. let the parts settle into the final exploded composition;
7. replace or blend the moving layers into the stable final exploded master only after their positions match.

The settled composition must leave enough negative space between major systems for a customer to distinguish and select them reliably. Apply the exact same final scale, translation, crop, and object-fit matrix to the artwork and its invisible hit map; visual separation must never create interaction drift.

The motion engine must produce component or group layers, masks, depth order, origin, destination, vector, timing, and easing. A flattened start image and flattened end image alone are not sufficient for a production flow.

For true 3D assets, keep body and component meshes separately named and interpolate each mesh from its assembled transform to its approved explosion transform. For raster delivery, render the same continuous motion as a frame sequence or video from that part-based scene. Cropping pieces from an already-exploded still and sliding those crops into view is not an acceptable production method.

Minimum explosion-plan record:

```json
{
  "visualCategoryId": "VC-ENG",
  "layerAssetId": "LAYER-...",
  "origin": { "x": 0.62, "y": 0.55 },
  "destination": { "x": 0.78, "y": 0.35 },
  "depth": 5,
  "startProgress": 0.60,
  "endProgress": 0.86,
  "easing": "mechanical-out"
}
```

Acceptance conditions:

- No single frame introduces the already-exploded vehicle abruptly.
- Each major group can be followed visually from assembled to separated position.
- The last moving frame and final interactive frame align without a jump.
- Desktop and mobile profiles preserve the same group relationships.
- A physical wheel position contains at most one tyre. Do not show an attached tyre and a separated duplicate for the same position.
- Loose spare tyres appear only when the vehicle configuration genuinely includes them and the explosion plan identifies them as a separate component.
- Reduced-motion mode cuts directly to the stable exploded result.

### 4.4 Loading behavior

- Load the hero first.
- Start loading CGI and line art after the vehicle is resolved.
- Load explosion layers before their movement begins.
- If later assets cannot load, keep the last valid visual and provide a direct EPC fallback outside the window.
- Do not show a progress UI inside the visual window while loading.

### 4.5 Completion memory and return behavior

Store a non-sensitive completed-flow fingerprint for the active vehicle context:

```text
catalogReleaseId + fitmentId + visualFamilyId + flowPackId + variantId
```

When the customer enters EPC from the exploded view and later navigates back to the homepage:

1. compare the active vehicle fingerprint with the completed-flow fingerprint;
2. if they match, render the settled exploded view immediately and do not replay;
3. keep the invisible category map active;
4. retain the committed cascade values as faint grey text;
5. if any identity-bearing selection changes, invalidate the match and run the new vehicle’s flow after Search.

The preview may use session storage. Production should keep the authoritative active-vehicle identity server-backed and may cache this non-sensitive completion fingerprint in the browser for immediate restoration.

---

## 5. Invisible exploded-vehicle click map

### 5.1 Required behavior

Once the exploded result is ready, the exploded vehicle itself becomes the navigation control.

- Click targets are invisible.
- No dot, circle, border, label, marker, tooltip, or hotspot overlay is visible by default.
- Clicking any depicted part or system routes to its category family for the selected vehicle.
- The click map uses broad, forgiving hit regions rather than tiny exact points.
- Prefer non-overlapping family regions. Where forgiving edges must overlap, assign an explicit deterministic priority: precise Engine and Transmission regions sit above broad Chassis and Body coverage.
- A broad Chassis or Body region must never capture a point visibly occupied by the engine or transmission.
- An uncovered exploded-vehicle area uses a safe vehicle-scoped fallback, normally Body & Exterior.
- The route opens a category-family/section page, not a raw source node URL.

### 5.2 Category resolution

```text
engine region              → Engine category family
transmission region        → Transmission & drivetrain category family
front/rear brake region    → Chassis systems category family
suspension region          → Chassis systems category family
body panel or closure      → Body & exterior category family
unclassified visible part  → Body & exterior category family fallback
```

If a more detailed assembly group is known, it may be highlighted after the category page opens, but the customer must land inside the correct category family first.

### 5.3 Hit-map data

Each invisible region must contain:

```json
{
  "hitRegionId": "HR-...",
  "visualCategoryId": "VC-BODY",
  "componentFamilyId": "VCF-BODY-FRONT-BUMPER",
  "geometryType": "POLYGON",
  "geometry": [[0.80, 0.42], [0.97, 0.42], [0.98, 0.62], [0.78, 0.61]],
  "target": {
    "catalogFamilyId": "CF-...",
    "sectionSlug": "body-exterior"
  },
  "fallbackSectionSlug": "body-exterior"
}
```

Coordinates use a normalized 0–1 system and remain aligned with the final exploded composition at every supported aspect ratio.

### 5.4 Interaction and accessibility

- The pointer cursor may indicate that the vehicle is interactive; target graphics remain invisible.
- Keyboard users need an equivalent semantic category list outside or visually hidden from the transition artwork.
- Screen-reader labels identify category actions, not pixel coordinates.
- Touch regions must remain forgiving on mobile.
- If the image crop changes, transform the hit map with the same image matrix.
- Use the same settled explosion scale and translation for both the rendered vehicle and hit-map coordinate system.
- Maintain desktop and mobile coordinate-probe fixtures for representative Engine, Transmission, Chassis, and Body points; each probe must resolve its expected vehicle-scoped section URL.

---

## 6. EPC browsing integration

### 6.1 Entry contract

Every transition click passes:

```text
catalogReleaseId
catalogFamilyId
variantId when required
fitmentId
visualFamilyId
visualCategoryId
componentFamilyId when available
source=visual-transition
```

The server validates that the mapped category belongs to the selected catalog release and vehicle family.

### 6.2 Browse hierarchy

The EPC structure integrated into the final website is:

```text
Selected vehicle
→ category family / section
→ assembly group
→ diagram
→ synchronized diagram position and part list
```

Maker and model steps are used only when the customer enters Browse EPC without an active vehicle.

### 6.3 Category-family route

Recommended route shape:

```text
/epc/vehicles/{familySlug}/sections/{sectionSlug}?fitment={fitmentId}&source=visual-transition
```

Optional context may include a component or preferred group. The public route must never use an unscoped source `node_id`.

### 6.4 Persistent context

The EPC must retain the selected vehicle through:

- category page;
- assembly-group page;
- diagram page;
- part-position selection;
- compatible product action;
- return to the visual vehicle.

Changing the active vehicle invalidates incompatible cached EPC results and reruns fitment checks.

### 6.5 Honest fallbacks

- Missing diagram image: show the parts list and an explicit image-unavailable state.
- Missing hotspots: show the diagram and parts without false interactivity.
- Partial extraction: disclose that the part list is incomplete.
- Missing detailed group route: open the correct category family.
- Invalid or stale mapping: open the selected vehicle’s category hub and record the mapping failure.

---

## 7. My Garage integration

### 7.1 Saved identity

Each saved vehicle stores a versioned identity snapshot containing:

```text
garageVehicleId
customerId
nickname
makerId
catalogFamilyId
generationId
variantId
fitmentId
visualFamilyId
catalogReleaseId used when confirmed
masked VIN / VIN reference when available
primary flag
identity status
created and updated timestamps
```

Production Garage state is server-backed and customer-owned. Browser storage may cache only a non-sensitive active choice and completed-flow fingerprint.

### 7.2 Garage actions

Every EPC-ready saved vehicle provides two integration actions.

**Start visual parts journey**

```text
make saved vehicle active
→ restore its cascade values
→ resolve current compatible releases
→ open the transition area
→ auto-start the flow
```

**Open EPC categories**

```text
make saved vehicle active
→ skip transition
→ open the vehicle’s EPC category homepage
```

### 7.3 Browse EPC menu

When Browse EPC is selected:

- active EPC-ready Garage vehicle: open its EPC category homepage directly;
- no active vehicle: open the EPC vehicle-selection path;
- stale or unresolved saved identity: request confirmation before browsing;
- vehicle without a complete customer-ready flow: do not expose broken visual or EPC routes.

### 7.4 Release changes

When a saved vehicle’s old catalog release is replaced:

1. resolve its stable identities against the new release;
2. retain it automatically only when the match is unambiguous;
3. request customer confirmation when variant or fitment meaning changes;
4. never silently attach it to a different maker, family, or chassis.

---

## 8. Minimal service interfaces

### Vehicle selection

```text
GET  /api/vehicles/makes
GET  /api/vehicles/families?makerId=...
GET  /api/vehicles/generations?familyId=...
GET  /api/vehicles/specifications?generationId=...
POST /api/vehicles/resolve
```

### Garage

```text
GET    /api/me/garage
POST   /api/me/garage
PATCH  /api/me/garage/{garageVehicleId}
DELETE /api/me/garage/{garageVehicleId}
PUT    /api/me/garage/{garageVehicleId}/primary
PUT    /api/me/active-vehicle
```

### Transition and mapping

```text
GET /api/flow-packs/{flowPackId}/manifest
GET /api/epc/{releaseId}/visual-route?fitmentId=...&visualFamilyId=...
```

### EPC

```text
GET /api/epc/{releaseId}/vehicles/{familyId}/sections
GET /api/epc/{releaseId}/sections/{sectionId}/groups
GET /api/epc/{releaseId}/groups/{groupId}/diagrams
GET /api/epc/{releaseId}/diagrams/{diagramId}
```

Every response includes release ID, vehicle context, readiness, and a typed fallback.

---

## 9. Flow-pack contract

Required customer-visible stages:

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

The pack must declare:

- exact vehicle and release IDs;
- homepage, Garage visual, Garage direct EPC, and menu Browse EPC entry modes;
- automatic Search trigger and no user Play control;
- retained-selection behavior;
- hero, CGI, line-art, explosion-layer, final exploded, and invisible hit-map assets;
- category-family route mapping;
- reduced-motion behavior;
- unchanged-vehicle completion memory and settled-exploded return behavior;
- a one-tyre-per-physical-wheel-position explosion policy;
- automated QA and human review state.

The technical render is not a public flow-pack stage.

---

## 10. Release gates

Every customer-visible vehicle must pass:

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

For this integration:

- `TRANSITION_READY` requires the shortened visible sequence and continuous line-art explosion.
- `HOTSPOT_READY` includes the invisible exploded-vehicle hit map and category-family fallbacks.
- `ROUTING_READY` requires every hit region to remain inside the selected release and vehicle family.
- `QA_READY` confirms that no progress UI, visible click markers, or Technical stage appears in the transition window; wheel multiplicity also passes automated metadata validation and human visual review.

Incomplete records remain internal.

---

## 11. Acceptance tests

### Vehicle selection

- A primary Garage vehicle preloads correctly.
- Manual selections progress in order.
- Redundant variant steps collapse.
- Upstream edits clear invalid downstream selections.
- Search resolves the exact vehicle before animation.
- Committed values remain faint grey until edited.

### Transition

- Search starts the flow automatically.
- No Play control appears.
- The browse instruction appears at the top of the visual window.
- The compact exact-model headline appears at the bottom-left without covering the vehicle.
- No text other than those two required elements appears inside the window.
- No progress bar, percentage, stage bar, badge, extra helper copy, or visible hotspot appears.
- The Technical view never appears.
- Line art separates continuously into the final exploded composition.
- Each rendered wheel position contains exactly one tyre, with no attached/separated duplicate.
- Reduced motion cuts directly to the stable exploded result.
- Returning from EPC with the same vehicle restores the settled exploded view without replay.
- Changing the vehicle invalidates completion memory and enables the newly selected flow.

### Invisible navigation

- Clicking an engine part opens the Engine family for the selected vehicle.
- Clicking transmission opens Transmission & drivetrain.
- Clicking brakes or suspension opens Chassis systems.
- Clicking a body part opens Body & exterior.
- No broad Chassis or Body region captures a representative engine or transmission coordinate.
- Major exploded systems have enough outward separation for reliable selection, and the invisible hit map remains aligned after the final transform.
- Clicking an unmapped depicted part uses the safe category-family fallback.
- No click target is visually drawn.
- No route contains a raw source node ID.

### My Garage and EPC

- Garage visual action restores context and autostarts.
- Garage EPC action skips animation.
- Browse EPC honors the active vehicle.
- Selected fitment persists through section, group, diagram, and parts.
- Stale or ambiguous saved identities require confirmation.

---

## 12. Current implementation files

```text
apps/preview-player/components/dvtg-preview.tsx
apps/preview-player/app/garage/page.tsx
apps/preview-player/app/epc/page.tsx
apps/preview-player/app/epc/vehicles/[familySlug]/...
apps/preview-player/lib/epc-catalog.ts
packages/pipeline-core/src/index.ts
packages/contracts/src/index.ts
packages/technical-render/src/scene.ts
schemas/hero-to-epc-flow-pack.schema.json
schemas/visual-epc-mapping.schema.json
catalog-data/generated/
```

This document should be handed to the final website team as an integration contract, not as instructions for designing the rest of the DIAL website.
