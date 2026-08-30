# Transition engine — pack production guide

**Audience.** The agent building the hero→exploded transition engine and the
packs it emits.

**Status.** Working notes, not canon. Where this disagrees with
`DIAL_FULL_CUSTOMER_EXPERIENCE_INTEGRATION_BLUEPRINT.md` or
`CATALOG_AGENT_BUILD_PROMPT.md`, those are frozen and this is wrong. What this
adds is the *why* behind the rules and the specific ways the current
implementation has already got them wrong — every item in §10 is a defect that
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

## 2. What the pack is for, and what it is not for

**The pack's job is recognition.** It exists to give the customer the first
impression that the right car is selected — that is my Hilux, in my body style,
in my facelift. It is not a technical depiction of their exact drivetrain, and
it does not need to be.

Variant precision happens *after* the click. The hit region contributes a
section (`engine`, `chassis-systems`); the customer's own selection contributes
the fitment; the EPC resolves the exact parts catalog from the two together.
That split is what lets one pack serve every variant that shares a body — and
avoiding a pack per variant is the whole economics of the catalog. A model with
six drivetrains and two markets is one pack, not twelve.

So the discipline is: **anything variant-specific in the pack is a bug**, not a
detail. It either forces a pack per variant, or it makes the pack lie about the
variants sharing it. The expensive parts — artwork, motion, hit-region geometry
— are naturally variant-invariant. What leaks is metadata, and it leaks
quietly: a `fitmentId` in a header block, a resolved fingerprint, a variant slug
in a filename.

**Coverage is declared, not implied.** The pack lists every fitment it serves,
and that list is checked. Wheel positions are where the claim usually breaks: a
cab-chassis with dual rear wheels is the same body and the same picture right up
until the wheels come off, and it cannot ride along on a two-position exploded
view. Same for a variant whose body style differs — that is a different visual
family, however similar the marketing name.

Two things follow that are easy to get wrong:

- **The completed-flow fingerprint is a runtime value, never a pack constant.**
  Two fitments in one coverage list produce two different fingerprints from the
  same artwork. The pack declares the recipe — which components, in which order,
  what invalidates a match — and the player resolves it per visit.
- **The hotspot target is family-level.** `catalogFamilyId` +
  `sectionSlug`, with no fitment and no variant anywhere in the hit map. If you
  find yourself wanting to bake a variant into a hit region, the region is
  wrong; the fitment belongs on the click.

## 3. Two identities, and never confuse them

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

## 4. What is authored once vs. per vehicle

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

- Hero source asset, with licence and provenance (§9).
- The identity lock derived from the normalized hero.
- Per-group layer assets, one per `layerAssetId` in the plan.
- Hit-region polygons, in normalized 0–1 coordinates.
- The EPC mapping's category→family bindings.
- Wheel policy: how many physical wheel positions this configuration has.

**Per fitment — and not inside the pack:** `fitmentId` and `variantId` arrive
with the customer's selection at runtime. The pack's `coverage` list names them
only to declare, and let QA verify, which fitments this one pack serves.
`catalogReleaseId` is pack-level: the pack's targets were validated against that
release.

If you find yourself wanting a per-vehicle timeline, a per-vehicle priority, or
a per-vehicle string, the answer is no. That impulse is how a catalog of packs
stops being one product.

---

## 5. The production method rule

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

## 6. Motion: one authority, overlapping windows

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

## 7. The hit map

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

**Positioning (§17.2, enforced):** a region sits on its own polygon's bounding
box; clip-path shapes it, it does not place it. Full-bleed overlays that differ
only by clip-path share one bounding box and one centre, which makes §5.1
unsatisfiable and §5.4's probes meaningless. The bounding-box centre must also
fall inside the polygon, because that is the point a probe clicks.

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

## 8. Determinism, or why pack 3,000 differs from pack 1

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

## 9. Rights: the constraint that outranks quality

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

## 10. Defects already made here — check yours for these

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

## 11. Blockers are not gates

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

## 12. Flow pack: what must be in it

Schema `1.3.0`, `additionalProperties: false` throughout. `vehicle` carries family identity only; `coverage` lists the fitments served.

Eight customer-visible stages, exactly: `HERO_PHOTOGRAPHY`, `IDENTITY_LOCK`,
`STUDIO_CGI`, `ENGINEERING_LINE_ART`, `EXPLODED_SYSTEMS`, `VISUAL_HIT_MAP`,
`EPC_SECTION_HANDOFF`, `EPC_DIAGRAM_AND_PARTS`. **The technical render is not a
public stage** — it exists internally and must never appear in the pack.

Completion memory (§4.5) is `catalogReleaseId + fitmentId + visualFamilyId +
flowPackId + variantId`, those five and no others. The list is `const` in the
schema because it is what keeps the fingerprint non-sensitive enough to cache
in a browser — adding a field is a privacy decision, not a convenience. All
five appear in `invalidatesOn`. `onMatch` restores the settled exploded view
with the category map live and no replay. The pack carries the recipe and no
resolved value (§2).

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

## 13. The transition window itself

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

## 14. Pipeline shape

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

## 15. Before you call a pack good

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
- [ ] `coverage` lists every fitment this pack serves, with no duplicates.
- [ ] Every covered fitment agrees with the wheel positions the pack renders.
- [ ] No `fitmentId` or `variantId` outside `coverage`; no resolved fingerprint.
- [ ] Exactly two text elements; no progress or playback affordance.
- [ ] Technical render absent from the flow pack.
- [ ] Identity metrics recorded — including any `NOT_MEASURED`.
- [ ] `qa.json` written before the pass/fail decision.
- [ ] Every path pack-relative; no absolute paths anywhere.
- [ ] Provenance and licence present for every source asset.
- [ ] `humanVisualReview` is `PENDING` unless a person actually reviewed it.

---

## 16. Open, as of this writing

- `BLUEPRINT-4.3-METHOD` — the player crops an exploded still.
- `BLUEPRINT-4.3-LAYERS` — pipeline renders flattened whole-scene frames; no
  per-layer assets, and no QA check that would notice.
- `BLUEPRINT-4.3-MATRIX` — nothing emits or asserts the shared display matrix.
- Two conflicting motion timelines (§6).
- ~~The Playwright suite is written and has never been executed.~~ **Closed.**
  It runs in CI and passes: 41 passed, 4 skipped. What it found on first
  execution, and what the player now guarantees, is §17.
- `packages/scene-engine/` is in flight and looks like the answer to METHOD and
  LAYERS — per-part sprites, per-part motion tracks, an owner-code buffer for
  hit testing. Read it before designing a replacement.

---

## 17. The rendered contract — now executed, not intended

§16 said the Playwright suite had never been executed and that everything about
rendered DOM behaviour was "asserted only in intent". That is no longer true,
and what happened when it first ran is the most useful thing in this document.

**First execution: 2 passed, 13 failed.** All 45 now pass or skip correctly.
Nine failures were the player. Four were defects in the tests themselves —
checks that could not have failed, or could not have passed, whatever the code
did. Both halves matter to you: the first tells you what the player now
guarantees, the second is a warning about how a green suite can mean nothing.

### 17.1 What the player guarantees, so you do not re-solve it

Build packs against these. They are asserted on every run.

| Surface | Contract |
|---|---|
| Transition window | `role="region"`, named `Interactive {make} {model} visual transformation` |
| Flow state | `data-flow-state` on that region: `idle` → `playing` → `navigation-ready` → `complete` |
| Hit regions | `[data-hit-region][data-visual-category="VC-*"]`, `aria-hidden="true"`, `tabindex="-1"`, no fill, border or outline |
| Keyboard route | `<ul aria-label="Vehicle categories">` of real links — §5.4's equivalent for a map hidden from assistive technology |
| Committed cascade | `[data-committed="true"]`, composited contrast ≥ 4.5:1, cleared on focus |
| Window copy | Exactly two text elements, each a **single text node** |

The hit map is **derived from your polygons** by
`apps/preview-player/lib/hit-map.ts`. There is no per-vehicle code left in the
player: a new visual family needs a new pack, not a new clip-path literal. The
hardcoded shapes that used to live in the component have been deleted.

### 17.2 Pack geometry preconditions — machine-checked for every pack

`tests/transition-ui-contract.test.ts` globs
`apps/preview-player/public/packs/*/*/navigation/hotspots.json` and holds
**every** pack to the rules below. A bad pack fails `npm run verify` at the
point it is produced, not in a browser probe against one model much later.

1. **At least two categories**, each polygon ≥ 3 points with non-zero area.
   Degenerate polygons are refused rather than drawn as unclickable regions.
2. **Distinct bounding boxes.** This is the one that bit hardest — see 17.3.
3. **Inside the frame:** every point within 0–1.
4. **Priority descends in paint order**, 0 being most specific. Shared
   priorities are fine; *overlapping* regions sharing one are not, because only
   then does routing depend on hit-test order. (§7 already said this; the test
   now enforces exactly that rule and not the over-strict version of it.)
5. **The bounding-box centre must lie inside the polygon.** §5.4's probes click
   that point. A crescent or L-shape whose centre falls outside its own shape is
   clipped away exactly where the contract aims, and the click lands on whatever
   is underneath — resolving silently to the wrong EPC section.
6. **Tappable on mobile.** Against the reference stage (412 × 690 at scale
   1.04), every region's box must be ≥ 44px on both axes. In normalised terms
   that is roughly **width ≥ 0.103, height ≥ 0.062**. Leave margin.

### 17.3 The defects, and the rule each one leaves behind

**Every region shared one bounding box.** The map was seven full-bleed overlays
distinguished only by `clip-path`. They therefore had identical bounds and
identical centres, so a broad Body region captured points visibly occupied by
the engine — the precise thing §5.1 forbids — and no coordinate probe could
distinguish any region from any other. *Rule: a hit region is positioned on its
own polygon's bounding box. Clip-path shapes it; it does not place it.*

**The window was not a region.** `aria-label` sat on a plain `div`, which names
nothing, while the search panel above it was a named landmark matching
"vehicle". Anything looking for the vehicle region found the search panel and
asserted against it — passing while testing the wrong element. *Rule: name one
landmark per role, and make sure the one you mean is the one that matches.*

**Reduced motion never engaged.** `matchMedia` was read in an effect committing
alongside autostart, so the start closure captured `false` and played the full
seven-second sequence for people who had asked not to see motion. *Rule: a
preference that changes what happens on first paint is read during render.*

**"Faint grey" was below AA.** White at 35% over `#0c151f` composites to
3.21:1. It is 55% now, measuring 6.15:1. *Rule: §3.4 faint is a contrast budget,
not an opacity value — measure the composite.*

**The headline could never match.** Assembled from JSX interpolation, `Know your
{make} {model} {gen}.<br/>Find the right part.` is seven text nodes, none of
them the permitted headline, and the `<br>` left no space between the sentences.
And its width cap of `calc(100% - 2.5rem)` is 90% of a phone stage, so it
covered the vehicle it describes. *Rule: §4.2's permitted text elements are
single text nodes, and the width cap is against the stage.*

### 17.4 Four tests that were lying

Worth reading before you trust any suite, including this one.

**Guards that threw instead of skipping.** The mobile and reduced-motion guards
read `testInfo.project` from a second argument Playwright does not pass to a
describe-level `test.skip`. They threw, so nothing skipped: project-specific
tests ran in all three projects and failed in the two they existed to exclude.
A guard that throws reports as a contract violation.

**A contrast check that could not measure contrast.** It regex-scraped numbers
from the computed colour. Tailwind emits `oklab(1 0 0 / 0.55)`, so it read
`1, 0, 0` as near-black and returned 1.14 for white text on a dark panel — and
it discarded alpha, the single property it existed to measure. It composites
through a canvas now.

**A count that raced the animation.** `.count()` does not auto-wait, so counting
hit regions immediately after navigation returned zero and reported it as a
§5.4 violation.

**Assertions against source text.** The unit file asserted that the component's
*source* contained a sort expression and hardcoded ids in a given order — the
same defect its own header criticises about screening copy for forbidden words.
It failed the moment the implementation stopped being hardcoded, while never
having tested what the code computes. Replaced with tests of the extracted
geometry, run against the published packs.

**One finding is not ours.** Playwright 1.56.1 does not propagate
`reducedMotion` from a project's `use` block to the page fixture. `colorScheme`
set the same way does arrive, and the resolved `project.use` carries
`reducedMotion: "reduce"` — it is simply not applied. The test sets it
explicitly and asserts the media state before testing, so it cannot exercise the
animated path while reporting on §4.3. If you write another media-dependent
project, assert the media state first.

### 17.5 Verifying a new flow

```
npm run verify        # gates, types, unit suites — includes pack geometry
npm run test:e2e      # desktop, mobile, reduced-motion against the dev server
```

`npm run test:e2e` needs `apps/preview-player` installed from **its own**
lockfile (`npm ci --workspaces=false` in that directory). The root tree resolves
vite 7 via vitest and hoists `@cloudflare/vite-plugin` beside it; the app runs
vite 8, and workerd dies with `Missing field 'moduleType'` before the server
binds. CI does this in its own step.

Expect **41 passed, 4 skipped**. The 4 are the mobile-only and
reduced-motion-only tests in the projects they do not apply to. A run with 0
skipped means the guards have broken again.
