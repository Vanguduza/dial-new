import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { buildHotspots } from "../packages/hotspots/src/index.js";
import { runAutomatedQa, type StageIdentityResult } from "../packages/qa/src/index.js";
import {
  buildIdentityLock,
  compareIdentity,
  type IdentityMetrics,
} from "../packages/identity-lock/src/index.js";

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

  it("passes a state that matches its own locked geometry", async () => {
    const source = await render(vehicle(900, 340), "source.png");
    const lock = await buildIdentityLock(source);
    const metrics = await compareIdentity(lock, source);
    expect(metrics.silhouetteIoU).toBeGreaterThan(0.99);
    const result = runAutomatedQa({
      stages: stage(metrics),
      hotspots: buildHotspots(["VC-ENG"]),
      enabledCategories: ["VC-ENG"],
      explodedViewPolicy: policy,
      identityFidelityRequired: true,
    });
    expect(result.passed).toBe(true);
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
      hotspots: buildHotspots(["VC-ENG"]),
      enabledCategories: ["VC-ENG"],
      explodedViewPolicy: policy,
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
      hotspots: buildHotspots(["VC-ENG"]),
      enabledCategories: ["VC-ENG"],
      explodedViewPolicy: policy,
      identityFidelityRequired: true,
    });
    expect(metrics.wheelCentreDisplacement).toBe("NOT_MEASURED");
    expect(result.notMeasured).toContain("wheelCentres");
    expect(result.notMeasured).toContain("lamps");
  }, 30_000);

  it("waives identity fidelity for the development adapter but records the drift", async () => {
    const source = await render(vehicle(900, 340), "source.png");
    const drifted = await render(vehicle(560, 200), "drifted.png");
    const lock = await buildIdentityLock(source);
    const metrics = await compareIdentity(lock, drifted);
    const result = runAutomatedQa({
      stages: stage(metrics),
      hotspots: buildHotspots(["VC-ENG"]),
      enabledCategories: ["VC-ENG"],
      explodedViewPolicy: policy,
      identityFidelityRequired: false,
    });
    // The pack may proceed, but it must never claim identity was proven.
    expect(result.passed).toBe(true);
    expect(result.identityFidelityProven).toBe(false);
    expect(result.identityVerdict).toBe("WAIVED_DEVELOPMENT_ADAPTER");
    expect(result.identityFailures.length).toBeGreaterThan(0);
  }, 30_000);

  it("blocks duplicate tyres at any exploded-view wheel position", async () => {
    const source = await render(vehicle(900, 340), "source.png");
    const lock = await buildIdentityLock(source);
    const metrics = await compareIdentity(lock, source);
    const result = runAutomatedQa({
      stages: stage(metrics),
      hotspots: buildHotspots(["VC-ENG"]),
      enabledCategories: ["VC-ENG"],
      explodedViewPolicy: {
        expectedWheelPositions: 4,
        tyresPerPosition: { frontLeft: 2, frontRight: 1, rearLeft: 1, rearRight: 2 },
        looseSpareTyres: 0,
      },
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
      hotspots: buildHotspots(["VC-ENG"]),
      enabledCategories: ["VC-ENG", "VC-TRN"],
      explodedViewPolicy: policy,
      identityFidelityRequired: true,
    });
    expect(result.passed).toBe(false);
    expect(result.uncoveredCategories).toContain("VC-TRN");
  }, 30_000);
});

afterAll(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
