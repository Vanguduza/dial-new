# DIAL transition factory: implementation and reconstruction decision

Updated 30 August 2026. Scope: vehicle selection context, visual packs and EPC handoff, not a redesign of the whole website.

## Outcome and honest boundary

The shared component engine now has batch orchestration, automatic residual-pixel repair, candidate replacement, adaptive motion sampling, portable asset packaging, render checkpoints and geometry-derived picking. These are implemented, not proposals.

It is **not yet a complete arbitrary-photograph-to-parts reconstruction service**. Its runnable renderer consumes registered component layers. Its studio treatment is deterministic raster grading, not reconstructed 3D CGI. The worker connector can invoke an installed reconstruction service. A separate [public TRELLIS.2 pilot](../workers/trellis-pilot/README.md) now supplies a bounded client of Microsoft's existing ZeroGPU demo; it saves whole-mesh candidates and evidence, not registered semantic components. No complete SAM/TRELLIS/PartCrafter-to-component-scene worker has been connected or benchmarked here. Test geometry does not demonstrate real-car visual quality. The existing customer preview has not been switched to this new pack format.

Consequently, do not report the catalog queue as completed, promote the rejected Acura images, or promise that any photograph will produce an accurate exploded vehicle. The implementation makes recovery and consistency testable; the remaining reconstruction stage must still be integrated and validated.

## What was adopted from the supplied guide

- One shared motion authority, with body, engine, transmission, brakes and suspension using overlapping windows. Both the legacy explosion planner and the component engine consume the shared definitions.
- One pack per verified exterior visual family. A facelift or materially different wheel topology cannot silently share a pack. Exact fitment is contributed at runtime, not painted into artwork or stored in hotspot targets.
- Persist QA before branching on its verdict. Packaging reads the persisted measurements. Missing measurements cannot become passes.
- Package real layers and their source closure: hero, masks, component assets, supporting references, normalized motion records and checksums. Plans cannot merely name absent layers.
- A single display matrix governs artwork, invisible ownership and region geometry; desktop/mobile probes exercise its inverse.
- Review and production are separate. A batch can finish rendering every eligible item while human review remains pending. No machine changes a human-review field to PASS.
- Stable versioned cache keys include source/scene evidence, engine and contract versions, motion, thresholds and encoder versions. No wall-clock generation timestamp is placed inside the sealed content record.

Two guide details need care. Its fixed 96/48 frame counts are sampling baselines here: the engine inserts additional frames where the staggered motion would violate the existing displacement bound. This preserves choreography and thresholds instead of making them vehicle-specific. Also, the guide's blanket network-acquisition prohibition is not adopted as a replacement for the user's already-established open-image sourcing policy. This change performs no new vehicle-image acquisition; existing automated rights/provenance checks remain separate from visual reconstruction.

## Implemented processing sequence

1. Parse a strict family job and verify its hero hash. Reconstruction inputs must use the normalized hero coordinate system; registered scenes with unnormalized EXIF orientation are rejected.
2. Read the candidate scene, verify its asset hashes and confinement, and measure its assembled relationship to the hero.
3. Check unique component IDs, wheel ownership, visible-pixel ownership, real category geometry and semantic category/section agreement. A declared engine cannot map to chassis.
4. Find a generic layout from component bounds and shared family bands. Grid density is solved from measured sizes; there are no Acura/Hilux-specific coordinates in this engine.
5. Sample the shared motion. Where a step exceeds the displacement limit, insert intermediate samples, with a bounded sampling budget. Relative component scale stays uniform.
6. Render the same components through surface, line and outward-motion states. Line appearance changes material pixels, not component geometry. The final animation image is also the settled image.
7. Produce an owner-code image from those same rendered components. Exact visible pixels take precedence; forgiving padding is measured in CSS pixels, with deterministic canonical priority at equal distances.
8. Record QA, real layer assets, navigation data and the complete source closure. Seal the pack with a manifest of relative asset paths and hashes.
9. If catalog bindings have been supplied, emit the family-level flow-pack 1.3.0 envelope. If they have not, retain a media pack with catalog injection pending; never invent fitment IDs.

The seven shared visual categories remain `VC-ENG`, `VC-TRN`, `VC-FBRK`, `VC-RBRK`, `VC-FSUS`, `VC-RSUS`, and `VC-BODY`. A category is only enabled when there is real geometry for it. An imported scene with fewer categories must not be described as full seven-category coverage.

### Automatic recovery, without queue-wide stopping

The local factory processes independent work items with bounded concurrency. Its default budget is three candidates, each with at most one local repair. These are configurable operational limits, not lowered QA thresholds.

When a visible tyre or panel is also painted into the residual body layer, the local repair removes the duplicate source ownership from the body. It creates a new candidate, preserves the original and re-runs all source-comparison checks. It does not manufacture hidden geometry or erase one of two peer components by guesswork.

Other failures generate structured repair advice. A configured worker receives the locked input plus the failed checks and can propose another registered scene. Foreign family IDs, changed hero hashes, changed catalog coverage and changed delivery settings are rejected. Workers cannot approve their own output.

Healthy items continue while an unresolved item records `NEEDS_RECONSTRUCTION` or `REPAIR_EXHAUSTED`. These states do not mean a completed pack. `PACK_BUILT_REVIEW_PENDING` means a measured media result was built, not that a vehicle is customer-ready.

On another batch invocation, a built pack is reused only if its input key still matches and all sealed assets rehash correctly. Incomplete batch work is rerun safely; this is not yet distributed workflow replay. Individual renderer frames have content-addressed checkpoints and are revalidated before reuse. A damaged cache frame is regenerated. Failed attempts and their QA remain on disk.

## Running the factory

Build the TypeScript engine with `npm run build:core`, then invoke:

```text
node dist/apps/cli/src/index.js batch path/to/production-plan.json
node dist/apps/cli/src/index.js batch path/to/production-plan.json --workers path/to/trusted-workers.json
```

The first form works with supplied registered scenes and candidate jobs. The second also allows reconstruction workers. The example below is a **format example**, not a claim that those vehicle assets exist:

```json
{
  "productionVersion": "1.0.0",
  "outputRoot": "production-runs",
  "concurrency": 2,
  "maxCandidates": 3,
  "maxRepairsPerCandidate": 1,
  "jobs": [
    {
      "id": "verified-visual-family",
      "job": "families/verified-visual-family/job.json",
      "candidates": ["families/verified-visual-family/alternative/job.json"]
    }
  ]
}
```

Paths in this plan are relative to its directory. Each candidate is a scene job, not an independent exploded photograph. Plan IDs must be unique. Duplicate visual-family work items are refused within the batch; merge their compatible fitment coverage instead of generating duplicate family packs.

The batch writes per-item checkpoints, attempt QA and `batch-summary.json`. Exit code 2 means some work remains unresolved; already built packs are retained. The factory does not publish media or update catalog readiness automatically.

### Reconstruction worker interface

Worker configuration is supplied explicitly by the operator, never by image metadata or catalog content. Each worker has an ID, pinned version, absolute executable path, argument array and timeout. `{request}` and `{response}` arguments are expanded as literal paths. Execution uses no shell and hides the process window.

A request contains `protocolVersion`, `jobPath`, `outputDirectory`, `attempt`, `previousQuality` and `repairAdvice`. The worker writes a response of the form `{"job":"job.json"}`. The returned job and all of its assets must be self-contained inside that output directory. Returning `{"job":null}` records an unavailable candidate; it does not count as success.

The returned job must keep the locked hero hash, visual-family identity, catalog authority and delivery profile unchanged. It must produce full-canvas registered RGBA component assets and an explicit foreground mask. `visualCategoryId` is explicit for brake/suspension groups; wheel positions are physical identifiers, not guesses from left/right image coordinates.

For unseen mechanical assemblies, `CATEGORY_ILLUSTRATION` permits a traceable recognition-oriented reference. It is not evidence of the selected variant's exact engine or drivetrain. The catalog alone resolves exact applicability after a click. `VERIFIED_REFERENCE` also requires a retained reference asset; neither label alone proves semantic correctness.

This connector is operational infrastructure, **not an implemented adapter for a specific reconstruction model**. The GPU worker must still implement segmentation, reconstruction, camera registration and component export.

## Researched reconstruction recommendation

The following is an engineering recommendation based on primary sources, not a benchmark result for this catalog.

Start with approved multipart vehicle assets when an exact exterior family match exists. Reuse a verified family scene across its covered variants. Do not deduplicate by marketing model name alone, and do not transfer Hilux exterior parts to unrelated models. A shared category-reference library can supply explicitly illustrative mechanical groups without pretending to depict exact variant internals.

For missing exteriors, benchmark two interchangeable reconstruction routes behind the worker interface:

- **Whole-vehicle reconstruction followed by part separation.** TRELLIS.2 produces textured image-to-3D assets and documents Linux plus an NVIDIA GPU with at least 24GB memory. Its published H100 generation timings cover the model operation, not complete vehicle processing. It does not by itself establish the EPC meaning of every part. [Microsoft TRELLIS.2](https://github.com/microsoft/TRELLIS.2)
- **Joint part reconstruction.** PartCrafter generates multiple parts from one image. Its authors document training on rendered Objaverse images and a real-photograph domain gap. Their optional style-transfer step should not become the identity authority: compare the candidate back to the original normalized hero. [PartCrafter](https://github.com/wgsxm/PartCrafter)

SAM 3 provides promptable image/video segmentation and is a candidate for visible-part masks and corrective prompting. It cannot recover exact hidden drivetrain geometry from a photograph. [Meta SAM 3](https://ai.meta.com/sam3/)

For mesh decomposition, HoloPart completes initially segmented surface patches into parts; segmentation is a separate input step in its repository. Hunyuan3D-Part combines P3-SAM segmentation with X-Part completion; its repository explicitly describes the released X-Part as a light version. Both deserve evaluation against the same vehicle holdout set, rather than being assumed production-complete. [HoloPart](https://github.com/VAST-AI-Research/HoloPart), [Hunyuan3D-Part](https://github.com/Tencent-Hunyuan/Hunyuan3D-Part)

EI-Part is a newer research candidate that uses separated and reassembled representations for completion/refinement. Its project results are promising, but not proof of exact vehicle recognition or ready-to-run catalog infrastructure. Do not make the delivery schedule depend on an unverified research release. [EI-Part project](https://cvhadessun.github.io/EI-Part/)

After reconstruction, keep one camera, scene graph, named components and transforms. Render the surface, line and exploded states from that same scene. Blender exposes object/material masks and Cryptomatte passes suitable for deriving the final click ownership; Three.js documents the corresponding unique-color picking approach. This is the foundation for eliminating hand-traced category drift, not a claim that either tool reconstructs vehicles automatically. [Blender render passes](https://docs.blender.org/manual/en/latest/render/layers/passes.html), [Three.js picking](https://threejs.org/manual/en/picking.html)

For distributed GPU production, replace the local lease with a durable activity workflow. Retry infrastructure failures at the failing activity; treat visual-quality failures as diagnostic results that choose a changed repair action. Repeating the identical prompt or entire workflow indefinitely is not recovery. [Temporal retry policies](https://docs.temporal.io/encyclopedia/retry-policies)

Keep the existing automated rights allowlist. Research code and weights also have their own eligibility: for example PartPacker's published terms restrict use to non-commercial purposes, so it is not the default commercial-production backend. This is a one-time backend selection constraint, not a new per-car manual license queue. [NVIDIA PartPacker model card](https://huggingface.co/nvidia/PartPacker/blob/main/README.md)

## What remains before calling it catalog-wide production

1. Finish the GPU reconstruction-to-component worker and connect an eligible reference-asset library. The local hardware check reported Intel UHD Graphics 620, not an NVIDIA CUDA GPU; Blender was not found on PATH. The separate TRELLIS pilot uses Microsoft's existing public ZeroGPU service, not a local model installation or newly provisioned hosting. A client connection is not a registered-parts engine. No paid GPU service has been provisioned or charged.
2. Normalize source photos automatically upstream of the identity lock, acquire alternate permitted references when needed, reconstruct missing parts and export the registered scene. The current engine validates normalized inputs; it does not yet perform this complete acquisition/reconstruction stage.
3. Add calibrated independent vehicle-recognition checks. Pixel/silhouette agreement alone cannot prove correct generation, facelift, lamp shape or wheel count within a mislabeled bitmap. A declared component is not a semantic detector.
4. Benchmark real vehicles across body styles and source conditions. Suggested pilot: 30 verified visual families, three input conditions each, including pickups, sedans, coupes, SUVs, vans, EVs and Chinese models. These are proposed sample sizes, not completed tests.
5. Measure first-pass and post-repair acceptance, false acceptance, review minutes, GPU minutes per accepted pack, and processing-time distributions. Set throughput promises only from these measurements; do not extrapolate a single model's inference time to the entire catalog.
6. Connect the preview/player to the new package contract, then run actual browser tests for layout, keyboard equivalents, 44px touch usability, reduced motion and return-from-EPC behavior. Mathematical display probes do not replace browser testing.
7. Produce dedicated mobile delivery assets or a tested compressed video/streaming strategy. Both devices must share the choreography and stable endpoint. The current runner emits one requested baseline plus adaptive intermediate frames per run, not both delivery bundles automatically.
8. Validate all catalog release gates and independent review before activation. No model creates authoritative fitment IDs, prices, release readiness or human approval.

## Website integration boundary

Search commits the cascade selection and triggers a prebuilt pack. Do not run reconstruction in a customer's request. The transition window keeps only the top instruction and small bottom-left exact-model headline; there are no progress or playback controls and no technical stage.

Consume `displayTransform` for both artwork and picking. Keep targets invisible and provide semantic category navigation outside the artwork for keyboard users. Resolve a click using the active release, fitment, variant and visual-family context against the pack's declared coverage. The new `resolveBoundCategory` helper rejects stale releases and unlisted fitments.

Completion memory remains the five-field runtime recipe: catalog release, fitment, visual family, flow pack and variant. The same pack can therefore serve multiple fitments without sharing their completion identity. An unchanged selection returning from EPC restores the settled image and active click map. My Garage and the Browse EPC menu can still bypass animation and open the selected vehicle's catalog directly.

## Verification scope

The new regression cases exercise shared choreography, adaptive samples, registered-frame rendering, portable source closure, all seven group assets, family-only mapping, per-fitment runtime routing, saved failed QA, automatic duplicate-ownership repair, fallback after a foreign-family candidate, cached-pack reuse, byte-stable repeated builds in the same environment and corrupt-asset rejection.

These tests use explicit synthetic geometry. They establish software invariants, not broad real-model reconstruction accuracy or visual acceptance. The engine and the remaining GPU reconstruction work must continue to be reported separately.

Verification on 30 August 2026: TypeScript checking passed; the core build passed; the complete suite passed **63 tests across 10 files** with two test workers. Actual browser end-to-end tests were not run for this engine change. The lint executable was not present in the installed dependencies, so no lint pass is claimed.
