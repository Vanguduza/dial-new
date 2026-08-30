# Transition Flow Pack Injection Standard — v1

**Audience:** the agent producing hero-to-exploded transition flow packs for the catalogue.
**Status:** binding on injection. Packs are produced outside this repository and injected when complete; this is the contract they are accepted against.
**Executable form:** `npm run verify` — the pack geometry rules in `tests/transition-ui-contract.test.ts` run against **every** pack under `apps/preview-player/public/packs/`, and `npm run schema:check` validates pack JSON. `npm run test:e2e` proves the rendered contract.
**Background, not repeated here:** `22_COMMERCE_FRONTEND_AND_TRANSITION/06_TRANSITION_ENGINE/TRANSITION_ENGINE_PACK_PRODUCTION_GUIDE.md`, especially §17 — what the player guarantees, and the nine defects the first Playwright run exposed.

---

## 0. The one idea

**The pack is the vehicle-specific part. The player is not.**

There is no per-vehicle code left in the transition player. The hit map is derived from the polygons your pack publishes; the flow state, the accessible region, the category list and the committed-value treatment are the player's, identical for every vehicle. A new visual family needs a new pack, never a new clip-path literal.

That is what makes 2,228 models tractable, and it is also the constraint: anything the player cannot derive from your pack, it cannot show. Geometry that was "close enough" for one hand-tuned pilot becomes 2,228 wrong hit maps.

---

## 1. Hit map geometry — enforced on every pack

The player builds its hit map from `navigation/hotspots.json` via `deriveHitRegions`. Six rules, all machine-checked on every pack in the repository:

**1. At least two categories, each polygon ≥ 3 points with non-zero area.** Degenerate polygons are refused rather than drawn as unclickable regions.

**2. Distinct bounding boxes.** Each region is positioned on its own polygon's bounding box; clip-path shapes it, it does not place it. Full-bleed overlays differing only by clip-path share one bounding box and one centre — a broad Body region then captures points visibly occupied by the engine, which §5.1 forbids, and coordinate probes cannot tell the regions apart at all. This was the single largest defect in the pilot player.

**3. Every point inside 0–1.** Normalised stage coordinates, never pixels. This is what lets one map serve desktop and mobile.

**4. Priority descends in paint order; 0 is most specific.** Broad regions sit underneath. Shared priorities are fine — front and rear brakes legitimately share one and never overlap. *Overlapping* regions sharing a priority are not, because only then does routing depend on hit-test order.

**5. The bounding-box centre must lie inside its own polygon.** §5.4's probes click that point. A crescent or L-shape whose box centre falls outside the shape is clipped away exactly where the contract aims, and the click lands on whatever is underneath — silently resolving to the wrong EPC section.

**6. Tappable on mobile.** Against the reference stage (412 × 690 at scale 1.04), every region's box is ≥ 44 px on both axes: roughly **width ≥ 0.103, height ≥ 0.062** normalised. Leave margin.

Rule 5 is the one that will catch you off guard on organic shapes. If a region legitimately has a hollow centre, split it into two categories or reshape it — do not ship it and hope.

---

## 2. Pack identity and coverage

**One pack serves a visual family, not a fitment.** The pack exists to make a customer recognise their car. Which exact drivetrain they have is their selection, resolved by the EPC from the fitment that travels with the click. So:

- `vehicle` carries family identity only — no `fitmentId`, no `variantId`.
- `coverage[]` declares every fitment the pack serves, with no duplicates.
- Every coverage entry's `expectedWheelPositions` matches the exploded view's policy. A variant whose wheel positions differ cannot share the picture.

**Diagram references use DGM ids.** Every diagram the pack routes to is named by its stable `DGM-` id from the Catalogue Data Injection Standard, never a source `node_id`. Public URLs carry the DGM id; §6.3 forbids exposing a raw source identifier.

---

## 3. Completion memory

The pack publishes the **recipe**, never a resolved value:

- `completionMemory.fingerprintComponents` is exactly `catalogReleaseId, fitmentId, visualFamilyId, flowPackId, variantId` — those five and no others.
- `completionMemory.invalidatesOn` covers every one of them.
- `completionMemory.fingerprint` **must be absent.** One pack serves many fitments, so a value baked at build time asserts one customer's context inside an asset shared by all of them. The player computes it per visit.

Two vehicles whose labels read identically but whose identity values differ must never match.

---

## 4. Stages

The customer-visible sequence is exact:

```text
HERO_PHOTOGRAPHY → IDENTITY_LOCK → STUDIO_CGI → ENGINEERING_LINE_ART
→ EXPLODED_SYSTEMS → VISUAL_HIT_MAP → EPC_SECTION_HANDOFF → EPC_DIAGRAM_AND_PARTS
```

`TECHNICAL_SHADED` is not a customer-visible stage. A technical render may exist internally; it may never appear in the flow pack, and no stage may reference `technical/technical-shaded`.

`autoplay` is locked: `trigger: VEHICLE_SEARCH_COMMITTED`, `userPlayControl: false`, `reducedMotionBehavior: CUT_TO_NAVIGATION_READY`.

---

## 5. Readiness and QA

`customerReady: true` requires `status: PRODUCTION_READY` **and** a null `productionBlocker`. Otherwise a blocker must be stated.

QA carries **both** verdicts: `automatedPass` (boolean) and `humanVisualReview` (`PENDING` / `PASS` / `FAIL`). A pack may not be customer-ready on an automated pass alone, and `humanVisualReview` stays `PENDING` unless a person actually reviewed it.

The exploded view policy allows at most one tyre per physical wheel position and zero loose spares unless the configuration genuinely includes them. Duplicate residual tyres are the most common generation defect.

---

## 6. Determinism

Pack 3,000 must be comparable with pack 1.

- No absolute paths anywhere. Every path pack-relative.
- No wall-clock timestamps inside hashed evidence. A `generated_at` inside a hashed manifest makes the hash change on every run and the check meaningless — this repository has made that mistake once already.
- Rendered bytes vary with the encoder build, so byte-comparability comes from one environment, not from hope. Generate in CI.
- QA evidence is written **before** the pass/fail decision, so it exists on failures too — which is precisely when it is worth having.

---

## 7. Rights

Every source asset carries provenance and a licence. **ACT-REG-011 is an open activation blocker**, and imagery is close to irreversible once it enters version history.

Follow `examples/hilux-an130/source/licensed/`: the licence is named in each filename and a `provenance.json` accompanies them. A hero image called `hilux-hero.png` with nothing attached is not acceptable, however good it looks — 5.3 MB of exactly that is currently sitting uncommitted for this reason.

---

## 8. What the player guarantees, so you do not rebuild it

Do not ship these in a pack; they exist already and are asserted on every run:

| Surface | Contract |
|---|---|
| Transition window | `role="region"`, named `Interactive {make} {model} visual transformation` |
| Flow state | `data-flow-state`: `idle` → `playing` → `navigation-ready` → `complete` |
| Hit regions | `[data-hit-region][data-visual-category]`, `aria-hidden`, no fill, border or outline |
| Keyboard route | a named list of real links, because the map is hidden from assistive technology |
| Committed cascade | `[data-committed="true"]`, composited contrast ≥ 4.5:1 |
| Window copy | exactly two text elements, each a single text node |

---

## 9. Handover

```bash
npm run verify        # gates, types, unit suites — includes pack geometry for every pack
npm run schema:check  # pack JSON against the published schemas
npm run test:e2e      # desktop, mobile, reduced-motion
```

`test:e2e` needs `apps/preview-player` installed from **its own** lockfile (`npm ci --workspaces=false` in that directory); the root tree resolves a different Vite and workerd dies before the server binds. CI does this in its own step.

Expect **41 passed, 4 skipped** on the customer route. The 4 are mobile-only and reduced-motion-only tests in the projects they do not apply to; a run with 0 skipped means the project guards have broken again.

---

## 10. The pilot is a tuning fixture, not a template

`VF-TOYOTA-HILUX-AN130-DC-FL` and `examples/hilux-an130` exist to tune this process. They are development material: the flow pack is explicitly not customer-ready, its diagram ids are hand-authored placeholders that fail `isProductionDgmId`, and its identity fidelity is `WAIVED_DEVELOPMENT_ADAPTER` with measured silhouette IoU 0.545–0.589 against a 0.90 threshold.

Copy the *shape*. Do not inherit the waivers.
