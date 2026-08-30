import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { rasterSourceSchema, partitionHero, insidePolygon } from "../packages/scene-engine/src/raster-source.js";
import type { Raster } from "../packages/scene-engine/src/assets.js";
import { categoryMotion } from "../packages/contracts/src/index.js";

const input = async (name: string) => rasterSourceSchema.parse(JSON.parse(await readFile(`examples/raster-hilux-strategy/${name}.json`, "utf8")));
const hero = (): Raster => ({ width: 320, height: 180, pixels: Buffer.from(Array.from({ length: 320 * 180 * 4 }, (_, i) => i % 4 === 3 ? 255 : i % 251)) });
const transform = { width: 320, height: 180, left: 0, top: 0 };

describe("Hilux raster source adapter (software invariants, not semantic vehicle recognition)", () => {
  it("uses the same source partitioner for a pickup and a coupe without moving source pixels", async () => {
    for (const name of ["hilux", "acura"]) {
      const spec = await input(name), source = hero();
      const result = partitionHero(source, spec, transform);
      expect(result.ambiguous).toBe(0);
      expect(result.counts.every(n => n > 10)).toBe(true);
      let pixels = 0, ownershipErrors = 0, colourErrors = 0;
      for (let p = 0; p < source.width * source.height; p++) {
        const owned = result.layers.filter(layer => layer.pixels[p * 4 + 3] > 0);
        if (owned.length !== (result.mask.pixels[p * 4] ? 1 : 0)) ownershipErrors++;
        if (owned[0]) {
          if (!owned[0].pixels.subarray(p * 4, p * 4 + 4).equals(source.pixels.subarray(p * 4, p * 4 + 4))) colourErrors++;
          pixels++;
        }
      }
      expect(pixels).toBe(result.foregroundPixels);
      expect(ownershipErrors).toBe(0);
      expect(colourErrors).toBe(0);
    }
  });

  it("subtracts detached wheel pixels from both panels and the residual shell", async () => {
    const spec = await input("hilux"), result = partitionHero(hero(), spec, transform);
    expect(result.wheelCutouts).toBeGreaterThan(0);
    for (const [index, part] of spec.visibleParts.entries()) {
      if (part.role !== "wheel") continue;
      for (let p = 3; p < result.layers[index + 1].pixels.length; p += 4) {
        if (!result.layers[index + 1].pixels[p]) continue;
        for (const [other, layer] of result.layers.entries()) if (other !== index + 1) expect(layer.pixels[p]).toBe(0);
      }
    }
  });

  it("does not mask a competing duplicate wheel behind a precedence rule", async () => {
    const spec = await input("hilux");
    spec.visibleParts.push({ ...spec.visibleParts[0], id: "duplicated-wheel" });
    expect(partitionHero(hero(), spec, transform).ambiguous).toBeGreaterThan(0);
  });

  it("detects competing body panels and zero-area masks", async () => {
    const spec = await input("acura");
    spec.visibleParts.push({ ...spec.visibleParts.find(p => p.role === "body-part")!, id: "duplicate-panel" });
    expect(partitionHero(hero(), spec, transform).ambiguous).toBeGreaterThan(0);
    spec.visibleParts[0].shape = { kind: "polygon", points: [[0, 0], [0, 0], [0, 0]] };
    expect(partitionHero(hero(), spec, transform).counts[1]).toBe(0);
  });

  it("rejects unbounded geometry, independent stage images and fake review approval", async () => {
    const spec = await input("hilux");
    expect(rasterSourceSchema.safeParse({ ...spec, explodedImage: "cheat.png" }).success).toBe(false);
    expect(rasterSourceSchema.safeParse({ ...spec, annotation: { ...spec.annotation, review: "PASS" } }).success).toBe(false);
    expect(rasterSourceSchema.safeParse({ ...spec, foreground: [[-1, 0], [1, 0], [1, 1]] }).success).toBe(false);
    expect(rasterSourceSchema.safeParse({ ...spec, illustrations: [{ ...spec.illustrations[0], placement: { x: .9, y: .9, width: .3, height: .3 } }] }).success).toBe(false);
  });

  it("records physical wheels explicitly, with no pickup bed or truck rear illustration on the coupe", async () => {
    const pickup = await input("hilux"), coupe = await input("acura");
    expect(pickup.topology.cargoBed).toBe(true);
    expect(coupe.topology).toMatchObject({ bodyStyle: "COUPE", doorCount: 2, cargoBed: false });
    for (const spec of [pickup, coupe]) {
      const wheels = [...spec.visibleParts, ...spec.illustrations].filter(p => p.role === "wheel");
      expect(wheels.map(p => p.wheelPosition).sort()).toEqual([...spec.topology.wheelPositions].sort());
      expect(spec.annotation.review).toBe("PENDING");
    }
    expect(coupe.illustrations.find(p => p.id === "rear-suspension")?.source).not.toEqual(pickup.illustrations.find(p => p.id === "rear-suspension")?.source);
  });

  it("has one shared staggered choreography across every supported body topology", async () => {
    const spec = await input("hilux");
    for (const bodyStyle of ["PICKUP", "COUPE", "SEDAN", "HATCHBACK", "SUV", "VAN", "WAGON"] as const) {
      expect(rasterSourceSchema.safeParse({ ...spec, topology: { ...spec.topology, bodyStyle, cargoBed: bodyStyle === "PICKUP", doorCount: bodyStyle === "COUPE" ? 2 : 4 } }).success).toBe(true);
      expect(categoryMotion("VC-BODY").startProgress).toBe(.6);
      expect(categoryMotion("VC-ENG").startProgress).toBeLessThan(categoryMotion("VC-BODY").endProgress);
    }
    expect(insidePolygon(.5, .5, [[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(true);
  });
});
