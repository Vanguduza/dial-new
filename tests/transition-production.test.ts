import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  boundSectionHref,
  inspectTransitionReceipt,
  sectionAtPoint,
  transitionReceiptSchema,
  verifyTransitionAsset,
} from "../packages/catalog-coverage/src/transition-production.js";
import { assertDevelopmentFixture } from "../packages/cgi/src/index.js";
import { parseJob } from "../packages/contracts/src/index.js";

async function draft() {
  return transitionReceiptSchema.parse(JSON.parse(await readFile("catalog-data/production/vehicles/VF-ACURA-CL.json", "utf8")));
}
const identity = { vehicleKey: "acura/cl", visualFamilyId: "VF-ACURA-CL", plannedFlowPackId: "H2E-ACURA-CL-V1" };

describe("actual vehicle-transition production evidence", () => {
  it("verifies the first pack's actual hero and three generated states without declaring a transition", async () => {
    const result = await inspectTransitionReceipt(process.cwd(), identity, await draft());
    expect(result.assetStagesPresent).toBe(4);
    expect(result.assets.hero.valid).toBe(true);
    expect(result.assets.exploded?.valid).toBe(true);
    expect(result.status).toBe("REJECTED");
    expect(result.transitionReady).toBe(false);
    expect(result.customerReady).toBe(false);
    expect(result.blockers).toContain("CONTINUOUS_PART_BASED_RENDER_MISSING");
    // Catalog IDs must not gate media production; they gate customer activation separately.
    expect(result.blockers.some((blocker) => blocker.includes("FITMENT"))).toBe(false);
    expect(result.catalogStatus).toBe("AWAITING_EXACT_FITMENT_BINDING");
  });

  it("does not turn approved stills or injected catalog IDs into a completed animation", async () => {
    const receipt = await draft();
    Object.values(receipt.reviews).forEach((review) => { review.status = "PASS"; });
    receipt.catalogBinding = { familySlug: "example-cl-family", fitmentId: "test-only-fitment", catalogReleaseId: "test-only-release", verified: true };
    const result = await inspectTransitionReceipt(process.cwd(), identity, receipt);
    expect(result.transitionReady).toBe(false);
    expect(result.customerReady).toBe(false);
    expect(result.blockers).toEqual(["SHARED_SCENE_ENGINE_EVIDENCE_REQUIRED", "CONTINUOUS_PART_BASED_RENDER_MISSING"]);
  });

  it("rejects fake motion made by repeating one still", async () => {
    const receipt = await draft();
    Object.values(receipt.reviews).forEach((review) => { review.status = "PASS"; });
    receipt.motion = { origin: "PART_BASED_SCENE", scene: receipt.source, fps: 30, frames: Array.from({ length: 24 }, () => receipt.assets.exploded!) };
    const result = await inspectTransitionReceipt(process.cwd(), identity, receipt);
    expect(result.transitionReady).toBe(false);
    expect(result.blockers).toContain("MOTION_HAS_TOO_FEW_DISTINCT_FRAMES");
  });

  it("rejects cross-vehicle receipts, foreign assets, traversal and changed bytes", async () => {
    const receipt = await draft();
    await expect(inspectTransitionReceipt(process.cwd(), { ...identity, vehicleKey: "acura/ilx" }, receipt)).rejects.toThrow("does not match queue identity");
    for (const path of ["output/vehicle-transitions/VF-TOYOTA-HILUX/hero.png", "output/vehicle-transitions/VF-ACURA-CL/../VF-TOYOTA-HILUX/hero.png"]) {
      expect((await verifyTransitionAsset(process.cwd(), identity.visualFamilyId, { ...receipt.source, path })).valid).toBe(false);
    }
    const changed = await verifyTransitionAsset(process.cwd(), identity.visualFamilyId, { ...receipt.source, sha256: "0".repeat(64) });
    expect(changed.valid).toBe(false);
    expect(changed.error).toContain("checksum");
  });

  it("routes engine, transaxle, all body pieces and wheel groups to the right broad family", async () => {
    const receipt = await draft();
    expect(sectionAtPoint(receipt, 0.86, 0.35)).toBe("engine");
    expect(sectionAtPoint(receipt, 0.81, 0.74)).toBe("transmission-drivetrain");
    for (const point of [[0.28, 0.28], [0.56, 0.16], [0.63, 0.45], [0.33, 0.55]]) {
      expect(sectionAtPoint(receipt, point[0], point[1])).toBe("body-exterior");
    }
    for (const point of [[0.08, 0.65], [0.16, 0.62], [0.39, 0.77], [0.51, 0.70]]) {
      expect(sectionAtPoint(receipt, point[0], point[1])).toBe("chassis-systems");
    }
    expect(sectionAtPoint(receipt, 0.75, 0.18)).toBe("engine");
    expect(sectionAtPoint(receipt, 0.99, 0.99)).toBeNull();
    expect(sectionAtPoint(receipt, Number.NaN, 0.5)).toBeNull();
    expect(receipt.hitMap.visible).toBe(false);
  });

  it("does not invent EPC destinations while fitment is unbound", async () => {
    const receipt = await draft();
    expect(boundSectionHref(receipt, "engine")).toBeNull();
    receipt.catalogBinding = { familySlug: "example-cl-family", fitmentId: "test-fitment & value", catalogReleaseId: "test-only-release", verified: true };
    const href = boundSectionHref(receipt, "engine")!;
    const url = new URL(href, "https://example.test");
    expect(url.pathname).toBe("/epc/vehicles/example-cl-family/sections/engine");
    expect(url.searchParams.get("fitment")).toBe("test-fitment & value");
    receipt.catalogBinding.verified = false;
    expect(boundSectionHref(receipt, "engine")).toBeNull();
  });

  it("prevents the development pickup renderer from substituting for a queued car", async () => {
    const hilux = parseJob(JSON.parse(await readFile("examples/hilux-an130/job.json", "utf8")));
    expect(() => assertDevelopmentFixture(hilux)).not.toThrow();
    expect(() => assertDevelopmentFixture({ ...hilux, make: "Acura", model: "CL", visualFamilyId: "VF-ACURA-CL" })).toThrow("isolated Hilux/test fixture");
    expect(() => assertDevelopmentFixture({ ...hilux, developmentMode: false })).toThrow("isolated Hilux/test fixture");
  });
});
