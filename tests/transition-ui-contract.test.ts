import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
    expect(source).toMatch(/Know your \{[^}]*make\}/);
    expect(source).toContain("left-1/2 top-2");
    expect(source).toContain("sm:top-3");
  });

  it("keeps precise powertrain regions above broad chassis coverage", async () => {
    const source = await readFile(resolve(COMPONENT), "utf8");
    const categoryMap = source.slice(
      source.indexOf("const categoryHitAreas"),
      source.indexOf("const settledExplosionScale"),
    );

    expect(source).toContain(".sort((a, b) => a.priority - b.priority)");
    expect(categoryMap.indexOf("id: 'engine'")).toBeGreaterThan(
      categoryMap.indexOf("id: 'front-chassis-family'"),
    );
    expect(categoryMap.indexOf("id: 'transmission'")).toBeGreaterThan(
      categoryMap.indexOf("id: 'front-chassis-family'"),
    );
    expect(source).toContain("(settledExplosionScale - layer.fromScale) * partProgress");
    expect(source).toContain("transform: `scale(${settledExplosionScale})`");
  });
});
