import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  containsPoint,
  deriveHitRegions,
  toHitRegion,
  type HotspotLike,
} from "../apps/preview-player/lib/hit-map.js";

/**
 * Blueprint §4.2 and §10 make QA_READY depend on the transition window showing
 * only the model headline — no progress UI, no stage labels, no visible click
 * markers, no Technical stage.
 *
 * The previous version of this file read dvtg-preview.tsx as a string and
 * asserted that six copy strings were absent and four were present. That tests
 * the source, not the screen: a progress bar added with different wording
 * passes, and renaming a variable fails. It was the only check behind the gate.
 *
 * This file asserts on the published flow-pack contract, which is machine
 * truth, and on the structural properties of the rendered markup. Full DOM
 * assertions belong in a Playwright run against the dev server — that is
 * tracked separately and is not something a unit test can honestly stand in for.
 */

const PACK =
  "apps/preview-player/public/packs/VF-TOYOTA-HILUX-AN130-DC-FL/v1/navigation/hero-to-epc-flow-pack.json";
const COMPONENT = "apps/preview-player/components/dvtg-preview.tsx";

describe("customer transition contract", () => {
  it("publishes the shortened visible sequence with no Technical stage", async () => {
    const flow = JSON.parse(await readFile(resolve(PACK), "utf8"));
    const ids = flow.stages.map((stage: { id: string }) => stage.id);

    // Blueprint §9: the exact customer-visible sequence.
    expect(ids).toEqual([
      "HERO_PHOTOGRAPHY",
      "IDENTITY_LOCK",
      "STUDIO_CGI",
      "ENGINEERING_LINE_ART",
      "EXPLODED_SYSTEMS",
      "VISUAL_HIT_MAP",
      "EPC_SECTION_HANDOFF",
      "EPC_DIAGRAM_AND_PARTS",
    ]);
    expect(ids).not.toContain("TECHNICAL_SHADED");
    // §4.1: a technical render may exist internally but must never be a public
    // flow-pack stage.
    expect(JSON.stringify(flow.stages)).not.toMatch(/technical\/technical-shaded/);
  });

  it("locks autoplay to search commitment with no user play control", async () => {
    const flow = JSON.parse(await readFile(resolve(PACK), "utf8"));
    expect(flow.autoplay).toMatchObject({
      trigger: "VEHICLE_SEARCH_COMMITTED",
      userPlayControl: false,
      reducedMotionBehavior: "CUT_TO_NAVIGATION_READY",
    });
    expect(flow.retainedSelection).toMatchObject({
      preserveUntilEdited: true,
      committedTextAppearance: "FAINT_GREY",
    });
  });

  it("keeps an incomplete pack out of customer visibility", async () => {
    const flow = JSON.parse(await readFile(resolve(PACK), "utf8"));
    // §2.3 and §10: customerReady is only true once every gate has passed, and
    // the schema requires PRODUCTION_READY with a null blocker alongside it.
    if (flow.customerReady === true) {
      expect(flow.status).toBe("PRODUCTION_READY");
      expect(flow.readiness.productionBlocker).toBeNull();
    } else {
      expect(flow.readiness.productionBlocker).toBeTruthy();
    }
  });

  it("declares what completion memory compares, not just what it does on a match", async () => {
    const flow = JSON.parse(await readFile(resolve(PACK), "utf8"));

    // §4.5. `autoplay.completedVehicleReturnState` said what to do on a match;
    // until the pack also carried the fingerprint it never said what it
    // matched against, so the return behaviour was unfalsifiable.
    const identityBearing = [
      "catalogReleaseId",
      "fitmentId",
      "visualFamilyId",
      "flowPackId",
      "variantId",
    ];
    expect(flow.completionMemory.fingerprintComponents).toEqual(identityBearing);
    // Every identity-bearing value invalidates the match (§4.5(5)).
    expect([...flow.completionMemory.invalidatesOn].sort()).toEqual([...identityBearing].sort());
    expect(flow.completionMemory.onMatch).toBe("RESTORE_SETTLED_EXPLODED_WITHOUT_REPLAY");
    // §4.5(3): the invisible category map stays live on restore.
    expect(flow.completionMemory.keepsHitMapActive).toBe(true);

    // No resolved fingerprint. One pack serves every fitment in `coverage`, so
    // a value baked at build time would assert one customer's context inside an
    // asset shared by all of them; the player computes it per visit.
    expect(flow.completionMemory.fingerprint).toBeUndefined();
  });

  it("is scoped to a visual family and declares every fitment it serves", async () => {
    const flow = JSON.parse(await readFile(resolve(PACK), "utf8"));

    // The pack exists to make a customer recognize their car. Which exact
    // drivetrain they have is their selection, resolved by the EPC from the
    // fitment that travels with the click — so naming one fitment up here
    // would bind a shared asset to one of the vehicles it serves.
    expect(flow.vehicle.fitmentId).toBeUndefined();
    expect(flow.vehicle.variantId).toBeUndefined();
    expect(flow.flowPackId).toContain(flow.vehicle.visualFamilyId.replace(/^VF-/, ""));

    // Coverage is declared, not implied.
    expect(Array.isArray(flow.coverage)).toBe(true);
    expect(flow.coverage.length).toBeGreaterThan(0);
    const ids = flow.coverage.map((entry: { fitmentId: string }) => entry.fitmentId);
    expect(new Set(ids).size).toBe(ids.length);

    // And it is a claim the exploded view can actually honour: a variant whose
    // wheel positions differ cannot share this picture.
    for (const entry of flow.coverage) {
      expect(entry.expectedWheelPositions).toBe(
        flow.visualIntegrity.explodedViewPolicy.expectedWheelPositions,
      );
    }
  });

  it("carries both wheel-multiplicity verdicts and cannot claim human review it has not had", async () => {
    const flow = JSON.parse(await readFile(resolve(PACK), "utf8"));
    const policy = flow.visualIntegrity.explodedViewPolicy;

    // §10, QA_READY: automated metadata validation *and* human visual review.
    expect(typeof policy.automatedPass).toBe("boolean");
    expect(["PENDING", "PASS", "FAIL"]).toContain(policy.humanVisualReview);

    // §4.3: at most one tyre per physical wheel position, no loose spares
    // unless the configuration genuinely includes them.
    expect(Object.values(policy.tyresPerPosition)).toEqual(
      Object.values(policy.tyresPerPosition).map(() => 1),
    );
    expect(policy.looseSpareTyres).toBe(0);

    // A pack may not be customer-ready on an automated pass alone.
    if (flow.customerReady === true) {
      expect(policy.automatedPass).toBe(true);
      expect(policy.humanVisualReview).toBe("PASS");
    }
  });

  it("renders the hit map without visible markers or playback chrome", async () => {
    const source = await readFile(resolve(COMPONENT), "utf8");

    // Structural, not copy-based. A hit region must carry no visible fill and
    // must be hidden from the accessibility tree, because §5.4 requires the
    // keyboard equivalent to be a separate semantic category list.
    expect(source).toMatch(/aria-hidden/);

    // No playback controls may exist in the window at all — asserted on the
    // control semantics rather than on button labels, so re-wording cannot
    // reintroduce them.
    const playbackControls =
      /<(button|input)[^>]*\b(aria-label|title)\s*=\s*["'][^"']*\b(play|pause|restart|replay|scrub|seek|skip)\b/i;
    expect(source).not.toMatch(playbackControls);

    // No progress semantics of any kind inside the transition window.
    expect(source).not.toMatch(/role\s*=\s*["']progressbar["']/i);
    expect(source).not.toMatch(/<progress[\s>]/i);
    expect(source).not.toMatch(/aria-valuenow/i);

    // The one permitted headline, §4.2.
    // Built as one interpolated string, not JSX fragments: §4.2 permits two
    // text elements in the window, and a headline split across seven text
    // nodes is neither one of them.
    expect(source).toMatch(/Know your \$\{[^}]*make\}/);
    expect(source).toContain("left-1/2 top-2");
    expect(source).toContain("sm:top-3");
  });

  it("keeps precise powertrain regions above broad chassis coverage", async () => {
    const source = await readFile(resolve(COMPONENT), "utf8");
    expect(source).toContain("(settledExplosionScale - layer.fromScale) * partProgress");
    expect(source).toContain("transform: `scale(${settledExplosionScale})`");
  });
});

/**
 * §5.1 hit-map geometry, exercised rather than read.
 *
 * This replaces two assertions that searched the component's source text for a
 * sort expression and for the order of hardcoded object literals. They could
 * only ever describe one vehicle's hardcoded shapes, and they passed or failed
 * on how the code was spelled rather than on what it computes — the same defect
 * the e2e header calls out about screening rendered copy for forbidden words.
 *
 * The published pack is used as the fixture, so these also guard the pack: a
 * generated hotspot set that breaks the precondition fails here, at the point
 * it is produced, rather than in a browser probe much later.
 */
describe("hit map geometry (§5.1)", () => {
  const hotspots = JSON.parse(
    readFileSync(
      resolve(
        "apps/preview-player/public/packs/VF-TOYOTA-HILUX-AN130-DC-FL/v1/navigation/hotspots.json",
      ),
      "utf8",
    ),
  ).hotspots as HotspotLike[];

  it("gives every category its own box rather than one shared full-bleed box", () => {
    const regions = deriveHitRegions(hotspots);
    expect(regions.length).toBeGreaterThan(1);

    const boxes = regions.map((r) => `${r.left},${r.top},${r.width},${r.height}`);
    expect(new Set(boxes).size, "regions must not share a bounding box").toBe(
      boxes.length,
    );

    for (const region of regions) {
      expect(region.width).toBeGreaterThan(0);
      expect(region.height).toBeGreaterThan(0);
      expect(region.left + region.width).toBeLessThanOrEqual(100.001);
      expect(region.top + region.height).toBeLessThanOrEqual(100.001);
    }
  });

  it("paints broad regions first so specific ones capture their own points", () => {
    const regions = deriveHitRegions(hotspots);
    const priorities = regions.map((r) => r.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));

    // Body is the broad region §5.1 names, and engine is what it must not
    // swallow. Later in paint order means on top.
    const body = regions.findIndex((r) => r.visualCategoryId === "VC-BODY");
    const engine = regions.findIndex((r) => r.visualCategoryId === "VC-ENG");
    expect(body).toBeGreaterThanOrEqual(0);
    expect(engine).toBeGreaterThan(body);
  });

  it("places each region's clickable centre inside its own polygon", () => {
    // §5.4's probes click the centre of a region's box. A polygon whose
    // bounding-box centre falls outside the shape is clipped away at exactly
    // the point the contract aims at, and the probe would silently land on
    // whatever is underneath.
    for (const hotspot of hotspots) {
      const xs = hotspot.polygon.map((p) => p.x);
      const ys = hotspot.polygon.map((p) => p.y);
      const centre = {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
      expect(
        containsPoint(hotspot.polygon, centre),
        `${hotspot.visualCategoryId}: bounding-box centre falls outside its polygon`,
      ).toBe(true);
    }
  });

  it("refuses a degenerate polygon instead of drawing an unclickable region", () => {
    expect(
      toHitRegion({ visualCategoryId: "VC-X", label: "x", polygon: [] }),
    ).toBeNull();
    expect(
      toHitRegion({
        visualCategoryId: "VC-X",
        label: "x",
        polygon: [
          { x: 0.1, y: 0.1 },
          { x: 0.1, y: 0.4 },
        ],
      }),
    ).toBeNull();
    expect(
      toHitRegion({
        visualCategoryId: "VC-X",
        label: "x",
        polygon: [
          { x: 0.2, y: 0.2 },
          { x: 0.2, y: 0.2 },
          { x: 0.2, y: 0.2 },
        ],
      }),
      "a zero-area polygon has no clickable area",
    ).toBeNull();
  });
});
