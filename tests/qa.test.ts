import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import type { VisualCategoryId, VisualEpcMapping } from "../packages/contracts/src/index.js";
import { buildHotspots } from "../packages/hotspots/src/index.js";
import { runAutomatedQa, type StageIdentityResult } from "../packages/qa/src/index.js";
import {
  buildIdentityLock,
  compareIdentity,
  type IdentityMetrics,
} from "../packages/identity-lock/src/index.js";

// Minimal mapping fixture. buildHotspots now takes the catalog targets from the
// VisualEpcMapping rather than inventing them, per Catalog Agent section 8.
function mappingFor(categories: VisualCategoryId[]): VisualEpcMapping {
  return {
    schemaVersion: "2.0.0",
    mappingId: "VEM-TEST",
    catalogReleaseId: "CAT-TEST",
    fitmentId: "FIT-TEST",
    visualFamilyId: "VF-TEST",
    vehicleContext: {
      makerSlug: "test",
      catalogFamilyId: "CF-TEST",
      familySlug: "test",
      variantId: null,
      variantSlug: null,
      chassisCodes: [],
      engineCodes: [],
      market: null,
      attributes: {},
    },
    categories: categories.map((visualCategoryId) => ({
      visualCategoryId,
      componentFamilyId: `VCF-${visualCategoryId.replace("VC-", "")}`,
      label: visualCategoryId,
      target: {
        sectionSlug:
          visualCategoryId === "VC-ENG"
            ? "engine"
            : visualCategoryId === "VC-TRN"
              ? "transmission-drivetrain"
              : visualCategoryId === "VC-BODY"
                ? "body-exterior"
                : "chassis-systems",
        groupId: null,
        groupSlug: null,
        defaultDiagramId: null,
        fallbackQuery: null,
        selectionMode: "SECTION" as const,
        minimumReadiness: "BROWSE_READY" as const,
      },
    })),
    componentFamilies: [],
    provenance: {
      authority: "CATALOG" as const,
      source: "test",
      sourceVersion: "1",
      confidence: 1,
      reviewedAt: null,
    },
  };
}

const roots: string[] = [];

async function render(svg: string, name: string) {
  const root = await mkdtemp(join(tmpdir(), "dvtg-qa-"));
  roots.push(root);
  const path = join(root, name);
  await sharp(Buffer.from(svg)).resize(1600, 900, { fit: "fill" }).png().toFile(path);
  return path;
}

const vehicle = (bodyWidth: number, roofTop: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
  <rect width="1600" height="900" fill="#0a0e14"/>
  <path d="M300 620 L${300 + bodyWidth} 620 L${300 + bodyWidth} 460 L1000 ${roofTop} L560 ${roofTop} L300 460 Z" fill="#c8d2dc"/>
  <circle cx="480" cy="640" r="70" fill="#e8eef4"/>
  <circle cx="1120" cy="640" r="70" fill="#e8eef4"/>
</svg>`;

const policy = {
  expectedWheelPositions: 4,
  tyresPerPosition: { frontLeft: 1, frontRight: 1, rearLeft: 1, rearRight: 1 },
  looseSpareTyres: 0,
};

// Two fitments sharing one body: the pack's whole reason for existing.
const coverage = [
  {
    fitmentId: "FIT-TEST-A",
    variantId: "CV-TEST-A",
    variantSlug: "test-a",
    expectedWheelPositions: 4,
  },
  {
    fitmentId: "FIT-TEST-B",
    variantId: "CV-TEST-B",
    variantSlug: "test-b",
    expectedWheelPositions: 4,
  },
];

function stage(metrics: IdentityMetrics): StageIdentityResult[] {
  return [{ stage: "STUDIO_CGI", asset: "cgi/cgi-master.avif", metrics }];
}

describe("identity QA", () => {
  it("derives the lock from the source rather than a constant", async () => {
    const a = await render(vehicle(900, 340), "a.png");
    const b = await render(vehicle(700, 300), "b.png");
    const lockA = await buildIdentityLock(a);
    const lockB = await buildIdentityLock(b);
    // A different vehicle must produce a different lock. The previous
    // implementation wrote the same Hilux constant for every source.
    expect(lockA.silhouetteMask).not.toBe(lockB.silhouetteMask);
    expect(lockA.occupiedCells).toBeGreaterThan(0);
    expect(lockA.source).toBe("derived-from-normalized-source");
  }, 30_000);

  it("passes measured silhouette checks but does not prove unmeasured landmarks", async () => {
    const source = await render(vehicle(900, 340), "source.png");
    const lock = await buildIdentityLock(source);
    const metrics = await compareIdentity(lock, source);
    expect(metrics.silhouetteIoU).toBeGreaterThan(0.99);
    const result = runAutomatedQa({
      stages: stage(metrics),
      hotspots: buildHotspots(["VC-ENG"], mappingFor(["VC-ENG"])),
      enabledCategories: ["VC-ENG"],
      explodedViewPolicy: policy,
      coverage,
      identityFidelityRequired: true,
    });
    expect(result.identity[0].checks.silhouette).toBe("PASS");
    expect(result.passed).toBe(false);
    expect(result.identityFidelityProven).toBe(false);
    expect(result.identityVerdict).toBe("NOT_PROVEN");
  }, 30_000);

  it("blocks visible silhouette drift measured against the lock", async () => {
    const source = await render(vehicle(900, 340), "source.png");
    // Materially different roofline and body length — the exact drift the
    // identity gate exists to catch.
    const drifted = await render(vehicle(560, 200), "drifted.png");
    const lock = await buildIdentityLock(source);
    const metrics = await compareIdentity(lock, drifted);
    expect(metrics.silhouetteIoU).toBeLessThan(0.9);
    const result = runAutomatedQa({
      stages: stage(metrics),
      hotspots: buildHotspots(["VC-ENG"], mappingFor(["VC-ENG"])),
      enabledCategories: ["VC-ENG"],
      explodedViewPolicy: policy,
      coverage,
      identityFidelityRequired: true,
    });
    expect(result.passed).toBe(false);
    expect(result.identityFailures.join(" ")).toContain("silhouette");
  }, 30_000);

  it("reports unmeasurable landmark drift as NOT_MEASURED rather than passing it", async () => {
    const source = await render(vehicle(900, 340), "source.png");
    const lock = await buildIdentityLock(source);
    const metrics = await compareIdentity(lock, source);
    const result = runAutomatedQa({
      stages: stage(metrics),
      hotspots: buildHotspots(["VC-ENG"], mappingFor(["VC-ENG"])),
      enabledCategories: ["VC-ENG"],
      explodedViewPolicy: policy,
      coverage,
      identityFidelityRequired: true,
    });
    expect(metrics.wheelCentreDisplacement).toBe("NOT_MEASURED");
    expect(result.notMeasured).toContain("wheelCentres");
    expect(result.notMeasured).toContain("lamps");
    expect(result.passed).toBe(false);
    expect(result.identityFidelityProven).toBe(false);
  }, 30_000);

  it("waives identity fidelity for the development adapter but records the drift", async () => {
    const source = await render(vehicle(900, 340), "source.png");
    const drifted = await render(vehicle(560, 200), "drifted.png");
    const lock = await buildIdentityLock(source);
    const metrics = await compareIdentity(lock, drifted);
    const result = runAutomatedQa({
      stages: stage(metrics),
      hotspots: buildHotspots(["VC-ENG"], mappingFor(["VC-ENG"])),
      enabledCategories: ["VC-ENG"],
      explodedViewPolicy: policy,
      coverage,
      identityFidelityRequired: false,
    });
    // The pack may proceed, but it must never claim identity was proven.
    expect(result.passed).toBe(true);
    expect(result.identityFidelityProven).toBe(false);
    expect(result.identityVerdict).toBe("WAIVED_DEVELOPMENT_ADAPTER");
    expect(result.identityFailures.length).toBeGreaterThan(0);
  }, 30_000);

  it("blocks a covered fitment that cannot share this pack's exploded view", async () => {
    const source = await render(vehicle(900, 340), "source.png");
    const lock = await buildIdentityLock(source);
    const metrics = await compareIdentity(lock, source);
    const result = runAutomatedQa({
      stages: stage(metrics),
      hotspots: buildHotspots(["VC-ENG"], mappingFor(["VC-ENG"])),
      enabledCategories: ["VC-ENG"],
      explodedViewPolicy: policy,
      // A cab-chassis with dual rear wheels: same body, same picture, right up
      // until the wheels come off. It may not ride along on this pack.
      coverage: [
        ...coverage,
        {
          fitmentId: "FIT-TEST-DUALLY",
          variantId: "CV-TEST-DUALLY",
          variantSlug: "test-dually",
          expectedWheelPositions: 6,
        },
      ],
      identityFidelityRequired: true,
    });
    expect(result.checks.coverage).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.coverageErrors.join(" ")).toContain("FIT-TEST-DUALLY");
  }, 30_000);

  it("accepts several fitments that genuinely share one body", async () => {
    const source = await render(vehicle(900, 340), "source.png");
    const lock = await buildIdentityLock(source);
    const metrics = await compareIdentity(lock, source);
    const result = runAutomatedQa({
      stages: stage(metrics),
      hotspots: buildHotspots(["VC-ENG"], mappingFor(["VC-ENG"])),
      enabledCategories: ["VC-ENG"],
      explodedViewPolicy: policy,
      coverage,
      identityFidelityRequired: false,
    });
    // Different drivetrains, one picture — this is the point of the pack.
    expect(result.checks.coverage).toBe(true);
    expect(result.coverageErrors).toEqual([]);
  }, 30_000);

  it("blocks duplicate tyres at any exploded-view wheel position", async () => {
    const source = await render(vehicle(900, 340), "source.png");
    const lock = await buildIdentityLock(source);
    const metrics = await compareIdentity(lock, source);
    const result = runAutomatedQa({
      stages: stage(metrics),
      hotspots: buildHotspots(["VC-ENG"], mappingFor(["VC-ENG"])),
      enabledCategories: ["VC-ENG"],
      explodedViewPolicy: {
        expectedWheelPositions: 4,
        tyresPerPosition: { frontLeft: 2, frontRight: 1, rearLeft: 1, rearRight: 2 },
        looseSpareTyres: 0,
      },
      coverage,
      identityFidelityRequired: true,
    });
    expect(result.passed).toBe(false);
    expect(result.checks.wheelMultiplicity).toBe(false);
  }, 30_000);

  it("blocks an enabled category with no hit region", async () => {
    const source = await render(vehicle(900, 340), "source.png");
    const lock = await buildIdentityLock(source);
    const metrics = await compareIdentity(lock, source);
    const result = runAutomatedQa({
      stages: stage(metrics),
      hotspots: buildHotspots(["VC-ENG"], mappingFor(["VC-ENG"])),
      enabledCategories: ["VC-ENG", "VC-TRN"],
      explodedViewPolicy: policy,
      coverage,
      identityFidelityRequired: true,
    });
    expect(result.passed).toBe(false);
    expect(result.uncoveredCategories).toContain("VC-TRN");
  }, 30_000);
});

afterAll(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
