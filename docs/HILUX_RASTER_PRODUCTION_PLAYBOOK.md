# Hilux-style raster transition production

User direction: 30 August 2026. This route improves the original image-based
Hilux presentation. The TRELLIS mesh pilot is not part of this workflow and is
not called as a fallback. The two supplied production guides are working notes;
their evidence discipline and rendered-UI requirements are retained. Frozen
catalog identity, coverage and routing contracts remain unchanged.

## One engine, model-specific artwork

Use a normalized, identity-locked hero; prepare a registered **assembled**
component scene; derive studio surface and engineering lines from those same
pixels; move the persistent components continuously; use the final renderer's
ownership image for navigation. The final frame is the interactive still, not a
separately generated exploded picture.

The original Hilux established the visual direction: photographic body surfaces,
dark studio, restrained metallic mechanical details, fine cool line work and
outward separation. Its old screen-space crops of an exploded still are a
development reference, not the production algorithm.

Shared across models: seven categories, motion windows, easing, material
treatment, ownership rules, display transform, cache versioning and thresholds.
Per family: source photograph, source-derived masks, body topology, registered
component artwork, wheel positions and catalog-injected category bindings.
No Hilux exterior or hand-authored Hilux timeline is transferred to another car.

## Source preparation now implemented

`packages/scene-engine/src/raster-source.ts` accepts a strict source manifest and
produces an existing scene-engine job. `dial-visual raster <source.json>` prepares
and renders it; `--prepare-only` validates and saves the layers without rendering.

1. Verify the source hash and reject foreign-family annotations.
2. Normalize with one uniform scale and translation; lock the normalized hero.
3. Partition visible source pixels into components. Wheel ownership subtracts
   those pixels from body panels and the residual shell. Competing wheel masks
   or competing panel masks fail instead of depending on drawing order.
4. Register genuine-alpha mechanical references behind the assembled silhouette.
   Hidden reference pixels must be occluded at the start, not teleport in from
   outside the car. Retain reference bytes and hashes.
5. Validate exclusive ownership, physical-wheel policy, reassembled appearance,
   silhouette, topology and all existing scene gates; save failed QA first.
6. Generate material states and motion from that scene. Tall panels use side
   space instead of forcing every door into a shallow strip. All components
   retain one common scale at every instant; category timing stays shared.
7. Save source closure, all component/group layers, frames, final ownership,
   geometry, navigation targets and measured QA. Human approval stays PENDING.

This adapter implements **source preparation from supplied annotations and
references**, not a trained unattended semantic segmenter. The two example
annotations are vision-assisted development data. A perfect reassembly score
proves that source pixels were preserved; it does not independently prove that
the silhouette annotation, door boundary or partially hidden tyre is correct.

## The quality issue the real-image trial exposed

The initial prepared Hilux reassembled exactly but its separated render did not
match the original Hilux demonstration's visual quality. Coarse panel cuts looked
flat, residual background fragments remained, and partially visible far wheels
were incomplete when separated. This candidate is **not approved** and must not
replace the customer preview merely because mathematical checks pass.

The missing authoring requirement is **amodal part completion**: a moving part
needs a complete raster illustration, including surfaces that the assembled
vehicle hides. Source partitioning is necessary for exclusive ownership, but
is not by itself sufficient for polished exploded artwork. Complete these
occluded surfaces in the same image-based workflow; do not switch to meshes or
crop the old exploded still to conceal the problem.

## Reusable artwork-authoring request

For every visual family, give the image-authoring worker the normalized hero,
its silhouette, source masks, visible component landmarks, explicit physical
wheel positions and the Hilux style reference. Treat the original photo as the
identity authority and the Hilux reference as style only.

Request one registered assembled raster scene with persistent component IDs:

- Keep the exact camera, handedness, body proportions, door configuration,
  roofline, grille, lamps, paint and visible wheels. Never change a coupe into a
  sedan or a closed cargo body into a pickup.
- Supply separate transparent component assets on the common canvas, source
  visible masks and the complete/occluded component silhouette. Keep all visible
  source pixels unchanged. Complete only hidden surfaces needed by separation.
- No ground shadows, opaque rectangles, baked text or other components inside a
  part asset. A photographic background must not become residual body geometry.
- Every physical wheel has exactly one complete tyre asset and one persistent
  position ID. Visible and hidden portions are one component, not separate
  tyres. Do not detach only the small visible crescent of a far wheel.
- Mechanical illustrations are recognition aids, with a declared reference
  class. Passenger independent suspension and pickup live-axle references are
  not interchangeable. EV/drivetrain artwork requires an eligible reference
  class; do not infer a combustion engine from a generic seven-category schema.
- Do not output an already-exploded scene as the rendering input. The engine
  owns all destination geometry and timing.

If a quality check fails, return the failing component IDs and measurement,
request a targeted mask/completion repair, retain unaffected layers and the hero
lock, then revalidate. Do not regenerate all stages or rerun an identical prompt
blindly. Prepared scenes can use the existing bounded production factory; a
family awaiting artwork must not halt already prepared families.

## Body-type coverage

The input contract accepts pickup, coupe, sedan, hatchback, SUV, van and wagon.
This is **schema coverage, not a completed visual benchmark**. Pickup and coupe
are the two current real-source experiments. For production evaluation include
short/long wheelbases, front-left/front-right camera views, dark/light paint,
closed/open cargo bodies, 2/4-door bodies, partially hidden wheels and dual-rear
wheel configurations. Author those differences as topology/asset data; never
add a model-specific animation implementation.

Require independent annotation/identity evidence before approval. In particular,
reprojection against an annotation produced by the same worker is not an
independent semantic recognition test. Preserve NOT_MEASURED where an actual
detector or reviewer has not performed the check.

## Research applied without changing the strategy

Spatial conditioning can constrain image generation with edges and segmentation
maps; it is evidence for supplying structural references rather than relying on
a model name in a prompt. It is not proof of vehicle-identity accuracy, and no
new reconstruction backend was installed. [ControlNet paper](https://arxiv.org/abs/2302.05543)

Transparent-layer generation supports making real per-part RGBA assets instead
of flattening the whole vehicle. It does not establish semantic part completion
for this catalog. [LayerDiffuse paper](https://arxiv.org/abs/2402.17113)

Alpha compositing must account for both source and destination alpha. The
registered scene and its masks use source-over composition; the player must not
apply screen blending to black-backed crops and call them isolated components.
[W3C compositing specification](https://www.w3.org/TR/compositing-1/)

## Website integration and release boundary

`/raster-lab` is a diagnostic consumer of the generated frame/ownership packs.
It holds a bounded window of pending images, advances only through loaded frames
and uses the canvas's actual contain rectangle for both image and picking. Its
local completion key is explicitly for diagnostics, not a customer fingerprint.
The existing homepage is unchanged while the new artwork fails visual review.

For the final customer integration, reuse the frozen five-ID completion recipe,
runtime fitment/variant and catalog release. Search commits selection and starts
the pack; unchanged return restores settled. Garage may enter that flow or bypass
it for EPC. Resolve family/category targets from injected catalog data, never
from the illustration. Keep exactly the two required text elements inside the
window, no progress/play controls, and real semantic category links outside it.
Do not ship the diagnostic page's selection-report buttons as the customer EPC
navigation experience.

No catalog-wide consistency, completed queue, production approval or autonomous
hero-only artwork generation is claimed by these development results.
