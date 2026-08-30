# Transition engine — pack production guide

**Audience.** The agent building the hero→exploded transition engine and the
packs it emits.

**Status.** Working notes, not canon. Where this disagrees with
`DIAL_FULL_CUSTOMER_EXPERIENCE_INTEGRATION_BLUEPRINT.md` or
`CATALOG_AGENT_BUILD_PROMPT.md`, those are frozen and this is wrong. What this
adds is the *why* behind the rules and the specific ways the current
implementation has already got them wrong — every item in §9 is a defect that
was really in this repository, not a hypothetical.

**Scope.** One pack per `visualFamilyId`. The catalog will hold thousands. The
whole problem is making pack number 3,000 come out the same shape as pack
number 1, produced by a different run on a different machine.

---

## 1. The one idea

**A pack is an evidence record that happens to contain pictures.**

Not the other way round. The images are the cheap part — deterministic
renderers produce them all day. What makes a pack customer-visible is that
every claim in it was *measured* and the measurement was *kept*. A pack that
looks perfect and cannot show its working is not shippable; a pack that looks
rough and records exactly why is.

Three rules follow, and almost everything else in this document is a
consequence of one of them.

1. **Freeze evidence before the gate decides.** Write `qa.json`, *then* pass or
   fail on it. This repository did it the other way round: QA threw on failure
   and the evidence write never executed, so the record was discarded on
   precisely the runs where it mattered.
2. **Nothing may assert a verdict it did not produce.** Stage 16 reads
   `qa/qa.json` back to fill the flow pack's `automatedPass`, rather than
   restating the job's own claims. A human-review field starts `PENDING` and no
   machine may move it.
3. **Unmeasurable is not passing.** A landmark that could not be measured
   reports `NOT_MEASURED`, never `0`. `identityFidelityProven` requires zero
   failures *and* zero unmeasured checks.

---

## 2. Two identities, and never confuse them

| | `visualFamilyId` | `fitmentId` |
|---|---|---|
| Answers | what does it *look* like | what actually *fits* it |
| Shape | `VF-TOYOTA-HILUX-AN130-DC-FL` | `FIT-DEMO-ZA-HILUX-AN130-2020-2GD-6MT` |
| Granularity | one per shared appearance | one per applicability set |
| Owns | the pack, its artwork, its hit map | parts applicability, routing |
| Cardinality | many fitments share one visual family | — |

A facelift that changes only the grille is a new `visualFamilyId`. A different
engine in an identical body is *not* — same pack, different fitment. Getting
this wrong is the most expensive mistake available: it either multiplies pack
production by every drivetrain variant, or it shows a customer parts that do
not fit their car.

Both identities travel together through the whole flow. The click that leaves
the hit map carries `fitmentId`; the artwork it left came from
`visualFamilyId`. Neither substitutes for the other.

**Labels are never identity.** Two vehicles that read identically on screen and
differ in any identity value are different vehicles. Every comparison —
completion memory, cache keys, resume keys, dedupe — uses IDs.

---

## 3. What is authored once vs. per vehicle

The single biggest lever on consistency across the catalog is keeping this
boundary sharp. Anything in the left column that leaks into per-vehicle
authoring becomes 3,000 opportunities to diverge.

**Authored once, shared by every pack — never per vehicle:**

- The category set: `VC-ENG`, `VC-TRN`, `VC-FBRK`, `VC-RBRK`, `VC-FSUS`,
  `VC-RSUS`, `VC-BODY`. Seven, closed.
- `HIT_REGION_PRIORITY` — ENG 90, TRN 80, front/rear brakes 60, front/rear
  suspension 50, BODY 10.
- The motion profile and its segment boundaries.
- Easing curve names (`shell-lift`, `mechanical-out`, `radial-out`).
- Layer asset IDs (`LAYER-BODY-SHELL`, `LAYER-ENGINE`, …).
- Section slugs (`engine`, `transmission-drivetrain`, `chassis-systems`,
  `body-exterior`).
- All customer-facing text. Both strings in §4.2 are fixed; the headline's only
  variable is the model name.
- The flow-pack schema and every threshold in `QA_THRESHOLDS`.

**Per visual family:**

- Hero source asset, with licence and provenance (§8).
- The identity lock derived from the normalized hero.
- Per-group layer assets, one per `layerAssetId` in the plan.
- Hit-region polygons, in normalized 0–1 coordinates.
- The EPC mapping's category→family bindings.
- Wheel policy: how many physical wheel positions this configuration has.

**Per fitment:** `fitmentId`, `catalogReleaseId`, `variantId`.

If you find yourself wanting a per-vehicle timeline, a per-vehicle priority, or
a per-vehicle string, the answer is no. That impulse is how a catalog of packs
stops being one product.

---

## 4. The production method rule

This is the rule most likely to be violated by something that looks right.

> Blueprint §4.3: "Cropping pieces from an already-exploded still and sliding
> those crops into view is not an acceptable production method."

The current preview player does exactly this — 23 hardcoded CSS `clip-path`
polygons translated over a single already-exploded image. On a screenshot it is
indistinguishable from a compliant render. It is recorded as
`BLUEPRINT-4.3-METHOD` against `CATVIS-S005` and it blocks that capability.

Why it matters beyond compliance: a crop-and-slide sequence cannot generalize.
Its polygons are traced against one specific image, so every new vehicle needs
hand-tracing, and nothing about it survives a change of hero. A part-based
scene generalizes because the *parts* are the unit, not the picture.

**What compliant means:**

- The motion engine emits component or group layers, masks, depth order,
  origin, destination, vector, timing and easing. A flattened start image plus
  a flattened end image is explicitly not sufficient.
- 3D: body and component meshes separately named, each interpolated from its
  assembled transform to its approved explosion transform.
- Raster: render that same part-based scene as a frame sequence. The frames are
  an *output* of a part-based scene, never a substitute for one.
- Every `layerAssetId` named in the plan has a real asset in the pack. QA
  should fail a pack whose plan names a layer nothing rendered — that check
  does not exist yet and is `BLUEPRINT-4.3-LAYERS`.

**Minimum plan record**, one per group. Key names are contract, not style —
the Blueprint spells it `easing`, and this repository had `easingProfile` until
recently, which meant a consumer following the document found the key absent:

```json
{
  "visualCategoryId": "VC-ENG",
  "layerAssetId": "LAYER-ENGINE",
  "origin": { "x": 0.62, "y": 0.55 },
  "destination": { "x": 0.78, "y": 0.35 },
  "depth": 5,
  "startProgress": 0.6433,
  "endProgress": 0.73,
  "easing": "mechanical-out"
}
```

---

## 5. Motion: one authority, overlapping windows

`MOTION_PROFILES["premium-v1"]` — 96 desktop frames, 48 mobile:

```
HERO       0.00 → 0.18
CGI        0.18 → 0.42
LINE_ART   0.42 → 0.60
EXPLOSION  0.60 → 0.86
SETTLE     0.86 → 0.94
NAVIGATION 0.94 → 1.00
```

Groups are staggered *within* the explosion segment by their `order`, each
travelling two slots' worth of time so adjacent groups overlap. Without the
overlap you get a sequence of discrete steps; §4.3 asks for continuous
interpolation with no frame jump. Current output:

```
VC-BODY   0.6000 → 0.6867   shell lifts first
VC-ENG    0.6433 → 0.7300
VC-TRN    0.6867 → 0.7734
VC-FBRK   0.7300 → 0.8167   front/rear move together
VC-RBRK   0.7300 → 0.8167
VC-FSUS   0.7733 → 0.8600
VC-RSUS   0.7733 → 0.8600
```

**There must be exactly one definition of the timeline.** As of this writing
there are two: `MOTION_PROFILES` puts explosion at 0.60–0.86, and the in-flight
`packages/scene-engine/src/motion.ts` `TIMELINE` puts it at 0.56–0.90. Two
motion authorities that disagree will produce packs whose groups land at
different progress values depending on which code path built them — the exact
inconsistency this document exists to prevent. Settle it before the engine
lands, and delete the loser.

Acceptance conditions worth restating because they are easy to lose:

- No single frame introduces the already-exploded vehicle abruptly.
- Each major group can be followed visually from assembled to separated.
- The last moving frame and the first interactive frame align without a jump.
- Desktop and mobile preserve the same group relationships — different frame
  counts, same choreography.
- Reduced motion cuts directly to the stable exploded result. Not a fast
  version of the animation; a cut.

---

## 6. The hit map

Geometry is **normalized 0–1**, never pixels. That is what lets one hit map
serve desktop and mobile, and it is why the categories and priorities can be
shared while polygons vary per family.

**Precedence (§5.1):** a broad Chassis or Body region must never capture a
point visibly occupied by the engine or transmission. Priorities come from the
fixed table, so a violation means someone edited the table without re-reading
the Blueprint — `buildHotspots` throws rather than emitting a pack that routes
a click to the wrong system.

**Overlap is by design.** Body & Exterior is the fallback layer *beneath* the
specific regions; priority disambiguates. Routing is ambiguous only when two
*overlapping* regions share a priority, because only then does the result
depend on hit-test order. An earlier version of the QA check failed on any
shared priority at all, which wrongly condemned every pack: front and rear
brakes legitimately share priority 60 and never overlap. Symmetric pairs are
normal. Overlap-at-equal-priority is the bug.

**Every enabled category needs a region,** or a click on it has nowhere to
route. And each region carries a `target` plus a `fallbackSectionSlug`, so a
missing catalog section degrades to Body & Exterior instead of a dead click.

**Ownership split (Catalog Agent §8):** the visual engine owns normalized
hit-region geometry and motion layers; the catalog owns the category-family
targets those regions resolve to. Targets are *injected* from the
`VisualEpcMapping` — never authored twice, or the two copies will drift.

**Presentation:** regions are invisible (no fill, no border, no outline) and
`aria-hidden`. Because they are hidden from assistive technology, §5.4 requires
a separate semantic category list as the keyboard equivalent. Mobile taps need
a minimum 44px target.

**The unbuilt piece.** §4.3 requires the *exact same* final scale, translation,
crop and object-fit matrix applied to both the artwork and the hit map —
"visual separation must never create interaction drift". Nothing currently
emits or asserts that shared matrix. It is `BLUEPRINT-4.3-MATRIX`, and it is
the one most likely to produce a subtly wrong pack that passes every existing
check: the picture and the click map slowly disagree as viewport ratios change,
and no gate notices.

---

## 7. Determinism, or why pack 3,000 differs from pack 1

Consistency across the catalog is mostly a reproducibility problem. Four ways
this repository has already lost it:

**Absolute paths in generated output.** `generateDepthMap` returned its
absolute output path, so the committed `depth-meta.json` contained
`C:\Users\Admin\Documents\dial new\...` — a developer's filesystem, inside a
tracked artifact, differing on every machine. Every path a pack emits is
pack-relative. Audit for this specifically; it hides well because the file
still parses and still validates.

**Encoder version affects bytes.** Identical inputs through different
`sharp`/libavif builds produce different AVIF bytes. Regenerating the same pack
on two machines changed ~190 binary files with no semantic difference at all.
Consequences: pin the encoder version; generate packs in one environment (CI,
not laptops); and do not hash-compare rendered binaries across machines
expecting equality. If generated packs are tracked in version control, decide
deliberately — either ignore them and rebuild, or freeze them and never
regenerate. Right now `artifacts/` is both, which is the worst option.

**Timestamps inside hashed evidence.** `meta.json` carries `generatedAt`. That
is fine for provenance and fatal for byte-comparison. Keep wall-clock out of
anything a hash covers, or exclude those fields from comparison explicitly.

**Resume keys that ignore the contract shape.** The pipeline resumes unchanged
work idempotently, which is correct and valuable — but after `easingProfile`
was renamed to `easing`, cached packs happily kept the old key, because the
resume key covered the inputs and not the plan schema. Include a pipeline and
contract version in the resume key so a contract change invalidates the cache.
A silently stale artifact is worse than a slow rebuild.

---

## 8. Rights: the constraint that outranks quality

**Network tools may not acquire catalogue, EPC or vehicle image data.** Rights
are an open activation blocker (`ACT-REG-011`). An agent optimizing for pack
quality will be tempted to go and fetch better reference images. Do not. A
beautiful pack built on unlicensed art is not a better pack, it is a legal
liability that has to be destroyed and rebuilt.

Every source asset carries `assetId`, `sourceUrl`, `author`, `licence`,
`licenceUrl`, `attribution`, `downloadedAt`. Development fixtures are marked as
such and say so in `meta.json`: *"Synthetic development fixture. Not licensed
production vehicle art."* Do not quietly promote a fixture to production by
deleting that warning.

Related, and equally non-negotiable: **AI never creates binding fitment, money,
ledger or completion truth.** A model may propose a hit region; a human
approves it. `humanVisualReview` exists precisely so that the difference is
recorded.

---

## 9. Defects already made here — check yours for these

Every one of these was real, shipped, and invisible to the gates at the time.

| Defect | Why it survived | Rule |
|---|---|---|
| QA wrote `qa.json` after throwing | Nobody looked at a failed run's evidence, because there wasn't any | Freeze evidence, then decide |
| Identity gate could not fail | It never measured; when made to measure, first real silhouette IoU was 0.545–0.589 against a 0.90 threshold | A gate that cannot fail is not a gate |
| Threshold pressure | The temptation was to lower 0.90 to make it green | Never loosen a threshold to pass. Record an explicit waiver (`identityFidelityRequired: false`, `identityVerdict: WAIVED_DEVELOPMENT_ADAPTER`, `identityFidelityProven: false`) so the drift stays visible |
| Unmeasurable read as 0 | 0 displacement looks like a perfect score | `NOT_MEASURED`, and it blocks `identityFidelityProven` |
| `easingProfile` vs `easing` | Both sides were internally consistent | A key name in a frozen document is contract |
| `const` compared with `!==` | A const array could never match anything, so a correct document reported RED | Validators need deep equality; a gate that can't express what you meant is worse than none |
| Schema bumped without the emitter | Every pack instantly failed | Bump schema and emitter in the same change |
| Duplicate-priority check too strict | Front/rear pairs share a priority legitimately | Flag equal priority *and* overlap, not equal priority |
| Completion behaviour with no fingerprint | The pack said what to do on a match and never what it matched | If a behaviour has no recorded input, it is unfalsifiable |
| Wheel counts recorded, verdicts not | The schema was satisfied with the review never having happened | Record the verdict, not just the measurement |
| Blocker written as a note | Nothing read it | See §10 |

---

## 10. Blockers are not gates

A gate records **how far** something got. A blocker records that it **may go no
further**. Two axes. Writing `BLOCKED` into a status field that also holds
`CODE_PRESENT` and `DOMAIN_TESTED` breaks every ordinal comparison over the
ladder, so `CATVIS-S005` keeps `current_gate: CODE_PRESENT` and carries a
separate `blockers` array.

A blocker that is only prose is decoration. Each one names its `source_clause`,
its `statement`, what it is `violated_by`, and — most importantly —
`clears_when`. `v2-closure-check` enforces both halves: a blocker missing any
of those fields fails the check, and a capability carrying an open blocker may
not be reported at or above `DOMAIN_TESTED`.

Note what the enforcement deliberately does *not* do: an open blocker is not
itself a RED. A gate that goes red for a known, deliberately-recorded blocker
teaches people to delete blockers to get green.

---

## 11. Flow pack: what must be in it

Schema `1.2.0`, `additionalProperties: false` throughout.

Eight customer-visible stages, exactly: `HERO_PHOTOGRAPHY`, `IDENTITY_LOCK`,
`STUDIO_CGI`, `ENGINEERING_LINE_ART`, `EXPLODED_SYSTEMS`, `VISUAL_HIT_MAP`,
`EPC_SECTION_HANDOFF`, `EPC_DIAGRAM_AND_PARTS`. **The technical render is not a
public stage** — it exists internally and must never appear in the pack.

Completion memory (§4.5) is `catalogReleaseId + fitmentId + visualFamilyId +
flowPackId + variantId`, those five and no others. The list is `const` in the
schema because it is what keeps the fingerprint non-sensitive enough to cache
in a browser — adding a field is a privacy decision, not a convenience. All
five appear in `invalidatesOn`. `onMatch` restores the settled exploded view
with the category map live and no replay.

Wheel policy: at most one tyre per physical wheel position; never an attached
tyre *and* a separated duplicate for the same position; loose spares only when
the configuration genuinely includes them and the plan identifies them
separately. Carries both `automatedPass` (read from QA evidence) and
`humanVisualReview` (`PENDING` until a person acts).

A pack may become `customerReady: true` only with `status: PRODUCTION_READY`, a
null `productionBlocker`, `automatedPass: true` and `humanVisualReview: PASS`.
The schema enforces this conditionally so it cannot be half-satisfied.

Eleven release gates apply per customer-visible vehicle: `IDENTITY_READY`,
`CASCADE_READY`, `FITMENT_READY`, `HERO_READY`, `TRANSITION_READY`,
`EPC_HIERARCHY_READY`, `DIAGRAM_READY`, `HOTSPOT_READY`, `PART_DATA_READY`,
`ROUTING_READY`, `QA_READY`. Incomplete records stay internal.

---

## 12. The transition window itself

Two text elements. Exactly two.

1. Top: `click on the category image to browse parts`
2. Bottom-left: `Know your {exact chosen model}. Find the right part.`

No third string, no stage labels, no progress UI of any kind — no progressbar
role, no `<progress>`, no `aria-valuenow`, no percentage text. No playback
control: no play, pause, restart, replay, scrub, seek or skip, and no range
input. Assert on control *semantics*, not on button labels, or a rewording
reintroduces them.

Test this on the rendered DOM with an allowlist — walk visible text nodes and
require each to match one of the two permitted patterns. A denylist of
forbidden words cannot catch copy nobody thought to forbid, and it actively
misfires: the previous version screened for the word "browse", which v2.2 then
made part of the *required* top instruction.

---

## 13. Pipeline shape

Sixteen stages: `01_SOURCE_VALIDATE`, `02_NORMALIZE`, `03_IDENTITY_LOCK`,
`04_SEGMENT`, `05_DEPTH_ESTIMATE`, `06_DEPTH_ACTIVATE`, `07_CGI_GENERATE`,
`08_TECHNICAL_GENERATE`, `09_LINEART_GENERATE`, `10_EXPLOSION_PLAN`,
`11_EXPLOSION_RENDER`, `12_ANIMATE`, `13_FRAME_ENCODE`, `14_HOTSPOTS`,
`15_QA`, `16_PACKAGE`.

The identity lock is derived at stage 03 from the **normalized** hero, and
every later state is measured against it. That ordering matters: lock from the
raw source and you bake normalization differences into every comparison.

Stage 15 measures; stage 16 packages what 15 measured. Keep that direction.
The moment stage 16 starts computing its own verdicts, the evidence and the
claim can disagree.

---

## 14. Before you call a pack good

- [ ] Every `layerAssetId` in the plan has a rendered asset.
- [ ] No frame introduces the exploded state abruptly; groups overlap.
- [ ] Last moving frame aligns with first interactive frame.
- [ ] Desktop and mobile share choreography.
- [ ] Reduced motion cuts to settled.
- [ ] Every enabled category has a hit region with a target and a fallback.
- [ ] No equal-priority overlapping regions.
- [ ] Engine and transmission sit above Body everywhere they overlap.
- [ ] Coordinate probes resolve to the expected section on desktop *and* mobile.
- [ ] Hit regions invisible, `aria-hidden`, keyboard list present, ≥44px on mobile.
- [ ] One tyre per wheel position; spares only if real.
- [ ] Exactly two text elements; no progress or playback affordance.
- [ ] Technical render absent from the flow pack.
- [ ] Identity metrics recorded — including any `NOT_MEASURED`.
- [ ] `qa.json` written before the pass/fail decision.
- [ ] Every path pack-relative; no absolute paths anywhere.
- [ ] Provenance and licence present for every source asset.
- [ ] `humanVisualReview` is `PENDING` unless a person actually reviewed it.

---

## 15. Open, as of this writing

- `BLUEPRINT-4.3-METHOD` — the player crops an exploded still.
- `BLUEPRINT-4.3-LAYERS` — pipeline renders flattened whole-scene frames; no
  per-layer assets, and no QA check that would notice.
- `BLUEPRINT-4.3-MATRIX` — nothing emits or asserts the shared display matrix.
- Two conflicting motion timelines (§5).
- The Playwright suite is written and has never been executed. It is the
  largest untested surface in the transition; everything above about rendered
  DOM behaviour is currently asserted only in intent.
- `packages/scene-engine/` is in flight and looks like the answer to METHOD and
  LAYERS — per-part sprites, per-part motion tracks, an owner-code buffer for
  hit testing. Read it before designing a replacement.
