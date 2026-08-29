# DIAL EPC Browsing + Vehicle Visual Transformation Integration Contract

## Status

This document freezes the **integration boundary** now.

The separate specialist agent may continue to refine:
- EPC providers/data model;
- exact visual/CGI transformation pipeline;
- asset-generation tooling;
- animation technology;
- source catalog pack.

When its complete specialist document arrives, it becomes the detailed authority **inside this boundary**. It must not create a second DIAL catalogue, vehicle identity or fitment authority.

## Product experience

The desired Spare discovery flow supports both conventional search and visual browsing:

```text
Select vehicle
    ↓
clean hero vehicle
    ↓
optional CGI/3D-like cinematic transformation
    ↓
vehicle explodes / reveals major systems
    ↓
tap system/category
    ↓
EPC system/group/assembly
    ↓
diagram + hotspot
    ↓
part number / supersession / applicability
    ↓
DIAL fitment claim
    ↓
supplier offers or sourcing request
    ↓
cart / checkout
```

The cinematic layer is navigation enhancement, not a blocking requirement.

Search/category/EPC fallback must remain available when the visual asset is absent or too expensive for the device/network.

## Canonical ownership

| Truth | Owner |
|---|---|
| vehicle identity | Vehicle Hub |
| product/part family | Catalogue |
| fitment/applicability | Fitment |
| supplier offer | Supplier OS |
| EPC raw provider reference | EPC adapter/provenance layer |
| generated image/animation | VisualAssetRegistry |
| hotspot/category binding | Catalogue visual-navigation binding |
| customer order | Orders |
| visual generator | processing engine only |

## Visual model

```ts
type VehicleVisualAsset = {
  visualAssetId: string
  vehicleVisualGroupId: string
  assetType:
    | "HERO_SOURCE"
    | "HERO_NORMALIZED"
    | "CGI_STAGE"
    | "TRANSITION"
    | "EXPLODED_NAV"
    | "HOTSPOT_OVERLAY"
    | "THUMBNAIL"
    | "STATIC_FALLBACK"
  sourceRef?: string
  generatorVersion?: string
  format: string
  width?: number
  height?: number
  durationMs?: number
  bytes?: number
  checksum: string
  provenance: ProvenanceRef
  approvalState: "DRAFT" | "REVIEW" | "APPROVED" | "RETIRED"
}
```

## Visual equivalence

Not every engine/trim needs a unique generated body if the body/visible category geometry is materially identical.

Create `VehicleVisualGroup`:

```text
Make
Model
Generation/body
year range
body style
visual differentiators
member variants
approved representative
```

Fitment still remains variant-specific. Visual equivalence never means parts equivalence.

## Navigation binding

Generated exploded visuals do not invent taxonomy at runtime.

```ts
type VisualNavigationBinding = {
  bindingId: string
  visualAssetId: string
  hotspotId: string
  dialCategoryId?: string
  epcGroupRef?: string
  epcAssemblyRef?: string
  vehicleVisualGroupId: string
  status: "DRAFT" | "VERIFIED" | "PUBLISHED"
}
```

Bindings are human/validated-data authored and versioned.

## EPC adapter

```ts
interface EpcCatalogProvider {
  resolveVehicle(input: VehicleResolutionInput): Promise<EpcVehicleMatch[]>
  listSystems(vehicle: EpcVehicleRef): Promise<EpcSystem[]>
  listGroups(vehicle: EpcVehicleRef, system: string): Promise<EpcGroup[]>
  listAssemblies(vehicle: EpcVehicleRef, group: string): Promise<EpcAssembly[]>
  getDiagram(assembly: EpcAssemblyRef): Promise<EpcDiagram>
  getParts(assembly: EpcAssemblyRef): Promise<EpcPartRef[]>
  getSupersessions(part: EpcPartRef): Promise<EpcSupersession[]>
}
```

Provider-specific data remains behind adapters.

## Customer EPC UX

Required:

- vehicle context persistent at top;
- breadcrumbs;
- search within selected vehicle;
- system/group/assembly hierarchy;
- zoom/pan;
- tap/click hotspots;
- list alternative accessible selection to hotspots;
- selected part drawer;
- part number copy;
- supersession notices;
- applicability/fitment confidence;
- available supplier offers;
- "source this part" when no offer;
- "ask for help" carrying vehicle/assembly/part/hotspot context;
- back-navigation without losing selection.

## Eventualities

### Vehicle cannot be resolved
Ask for VIN/chassis/variant details; show confidence; allow human/catalogue review.

### Hero asset missing
Use approved static/family fallback; do not block parts search.

### Transition generation failed
Use static hero + category tiles/EPC.

### EPC unavailable
Show catalogue/category/search with "EPC temporarily unavailable"; preserve selected vehicle.

### EPC provider licence forbids local cache
Use compliant transient/provider-backed rendering and record rights.

### Diagram hotspot does not map to DIAL catalogue
Allow part reference view and sourcing request; create mapping-review queue.

### Part superseded
Show current/superseded relationship and require fitment validation before offer selection.

### Variant visually identical but parts differ
Share visual asset only; retain variant-specific EPC/fitment.

### Customer on data-saver/weak connection
Do not auto-play large transition. Serve thumbnail/static exploded image and explicit "view animation".

### Reduced motion
No forced cinematic transition.

## Asset pipeline integration

Expected external specialist output:

```text
source hero
→ normalization
→ CGI/depth/visual transformation stage
→ transition/explosion output
→ exploded navigation representation
→ QC
→ asset manifest
```

The manifest is imported to `VisualAssetRegistry`.

The specialist engine should return assets and metadata, not modify Catalogue tables directly.

## Admin / Catalogue Factory

Command Centre/Catalogue Factory needs:

- missing visual coverage by make/model/generation;
- generation queue;
- failed/review queue;
- provenance/licence status;
- visual group mapping;
- EPC binding coverage;
- hotspot mapping review;
- asset size/performance metrics;
- publication/rollback;
- customer interaction/conversion analytics.

## Integration acceptance

The specialist EPC/visual document is considered integrated when:

1. its data/provider choices satisfy these interfaces;
2. every generated asset has provenance and version;
3. all vehicle mappings use canonical Vehicle Hub IDs;
4. all sellable part mappings converge on DIAL Catalogue/Fitment/Supplier offers;
5. missing/failed visual/EPC paths have functional fallback;
6. web/Android/iOS support data-saver and accessibility;
7. support receives full visual/EPC context;
8. tests prove a vehicle→visual/EPC→part→offer→order journey.
