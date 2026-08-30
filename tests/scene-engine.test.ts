import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { decodeRgba, digest, type Raster } from "../packages/scene-engine/src/assets.js";
import { sceneJobSchema, type ComponentScene } from "../packages/scene-engine/src/contracts.js";
import { prepareScene } from "../packages/scene-engine/src/prepare.js";
import { createMotionPlan, TIMELINE, transformAt, validateMotion } from "../packages/scene-engine/src/motion.js";
import { categoryHref, pickComponent, SceneRenderer } from "../packages/scene-engine/src/render.js";
import { runGuardedTransition } from "../packages/scene-engine/src/index.js";

const roots: string[] = [];
const width = 640, height = 360;
// Abstract blocks are test geometry only; no test car is used as production art.
function block(x: number, y: number, w: number, h: number, colour: number[]): Raster {
  const pixels = Buffer.alloc(width * height * 4);
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    pixels.set([...colour, 255], (yy * width + xx) * 4);
  }
  return { pixels, width, height };
}
async function save(root: string, file: string, raster: Raster) {
  const bytes = await sharp(raster.pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
  await writeFile(join(root, file), bytes);
  return { file, sha256: digest(bytes) };
}
async function fixture(offset = 0) {
  const root = await mkdtemp(join(tmpdir(), "dial-scene-engine-")); roots.push(root);
  const rasters = {
    shell: block(200 + offset, 110, 230, 85, offset ? [170, 30, 40] : [180, 190, 205]),
    engine: block(360 + offset, 130, 50, 50, [70, 95, 105]),
    transmission: block(250 + offset, 130, 55, 45, [120, 110, 90]),
    "rear-wheel": block(225 + offset, 210, 65, 65, [35, 40, 45]),
    "front-wheel": block(365 + offset, 210, 65, 65, [40, 45, 50]),
  };
  const hero = block(0, 0, width, height, [8, 11, 14]);
  const mask = block(0, 0, width, height, [0, 0, 0]);
  for (const key of ["engine", "transmission", "shell", "rear-wheel", "front-wheel"] as const) {
    const raster = rasters[key];
    for (let p = 0; p < raster.pixels.length; p += 4) if (raster.pixels[p + 3]) {
      raster.pixels.copy(hero.pixels, p, p, p + 4);
      mask.pixels.set([255, 255, 255, 255], p);
    }
  }
  const heroAsset = await save(root, "hero.png", hero);
  const spec: ComponentScene = {
    schemaVersion: "1.0.0", visualFamilyId: offset ? "VF-TEST-SECOND" : "VF-TEST-FIRST",
    heroSha256: heroAsset.sha256, canvas: { width, height }, camera: "LOCKED_REGISTERED_HERO_CAMERA",
    foregroundMask: await save(root, "mask.png", mask), expectedWheelPositions: ["rear-left", "front-left"],
    requiredSections: ["body-exterior", "engine", "transmission-drivetrain", "chassis-systems"],
    components: [],
  };
  for (const [id, raster] of Object.entries(rasters)) {
    const hidden = id === "engine" || id === "transmission";
    spec.components.push({ id, asset: await save(root, `${id}.png`, raster),
      role: id === "shell" ? "body-shell" : id.endsWith("wheel") ? "wheel" : id as "engine" | "transmission",
      depth: hidden ? 0 : 10,
      wheelPosition: id === "rear-wheel" ? "rear-left" : id === "front-wheel" ? "front-left" : null,
      evidence: hidden ? "VERIFIED_REFERENCE" : "HERO_VISIBLE_PIXELS", reference: hidden ? heroAsset : null });
  }
  const job = sceneJobSchema.parse({ sceneEngineVersion: "1.0.0", visualFamilyId: spec.visualFamilyId, hero: heroAsset, sceneFile: "scene.json", frameCount: 48 });
  await writeFile(join(root, "scene.json"), JSON.stringify(spec));
  await writeFile(join(root, "job.json"), JSON.stringify(job));
  return { root, spec, job, rasters };
}
// The parameter shadowed the function inside its own type annotation, so
// `typeof fixture` resolved to the parameter and TypeScript reported a circular
// reference (TS2502). Naming the type once, at module scope, resolves it against
// the function.
type SceneFixture = Awaited<ReturnType<typeof fixture>>;

async function update(fixture: SceneFixture) {
  await writeFile(join(fixture.root, "scene.json"), JSON.stringify(fixture.spec));
}

describe("one shared source scene and hard quality gates", () => {
  it("renders different hero inputs with the same engine without hard-coded vehicle art", async () => {
    for (const offset of [0, 15]) {
      const input = await fixture(offset), scene = await prepareScene(input.job, input.root);
      const motion = createMotionPlan(scene);
      expect(validateMotion(scene, motion, input.job.frameCount).every((check) => check.status === "PASS")).toBe(true);
      const renderer = new SceneRenderer(scene, motion);
      const hero = await renderer.frame(0);
      expect(hero.raster.pixels.equals(scene.hero.pixels)).toBe(true);
      const line = await renderer.frame(TIMELINE.lineEnd), start = await renderer.frame(TIMELINE.explosionStart);
      expect(line.raster.pixels.equals(start.raster.pixels)).toBe(true);
      const end = await renderer.frame(1), settled = await renderer.frame(TIMELINE.settled);
      expect(end.raster.pixels.equals(settled.raster.pixels)).toBe(true);
      expect(new Set(motion.tracks.map((track) => track.scale)).size).toBe(1);
      expect(end.parts.filter((part) => part.id.endsWith("wheel"))).toHaveLength(2);
    }
  }, 60_000);

  it("moves persistent parts continuously with exact assembled origins and settled destinations", async () => {
    const input = await fixture(), scene = await prepareScene(input.job, input.root);
    const plan = createMotionPlan(scene);
    for (const track of plan.tracks) {
      expect(transformAt(track, TIMELINE.explosionStart)).toEqual(track.source);
      const next = transformAt(track, TIMELINE.explosionStart + 0.00001);
      expect(Math.abs(next.x - track.source.x)).toBeLessThan(0.00001);
      expect(transformAt(track, 1)).toEqual(transformAt(track, TIMELINE.explosionEnd));
    }
  });

  it("uses actual visible engine pixels and forgiving padding, never a broad chassis rectangle", async () => {
    const input = await fixture(), scene = await prepareScene(input.job, input.root);
    const plan = createMotionPlan(scene), frame = await new SceneRenderer(scene, plan).frame(1);
    const engine = frame.parts.find((part) => part.id === "engine")!;
    let probed = 0;
    frame.owners.forEach((owner, pixel) => {
      if (owner !== engine.code) return;
      expect(pickComponent(frame, pixel % width, Math.floor(pixel / width), 0)?.section).toBe("engine"); probed++;
    });
    expect(probed).toBeGreaterThan(100);
    const bounds = transformAt(plan.tracks.find((track) => track.id === "engine")!, 1);
    expect(pickComponent(frame, bounds.x - 4, bounds.y + bounds.height / 2)?.section).toBe("engine");
    expect(pickComponent(frame, 0, 0)).toBeNull();
    expect(categoryHref("engine", input.job.visualFamilyId, null)).toBeNull();
    expect(categoryHref("engine", input.job.visualFamilyId, { visualFamilyId: "VF-WRONG", familySlug: "wrong", fitmentId: "FIT-WRONG" })).toBeNull();
    expect(categoryHref("engine", input.job.visualFamilyId, { visualFamilyId: input.job.visualFamilyId, familySlug: "correct-family", fitmentId: "FIT-CORRECT" })).toBe("/epc/vehicles/correct-family/sections/engine?fitment=FIT-CORRECT");
  });

  it("rejects duplicated wheel ownership", async () => {
    const input = await fixture();
    input.spec.components.find((part) => part.id === "front-wheel")!.wheelPosition = "rear-left";
    await update(input);
    await expect(prepareScene(input.job, input.root)).rejects.toThrow("WHEEL_OWNERSHIP");
  });

  it("detects an actual tyre still painted into the residual body layer", async () => {
    const input = await fixture(), residual = input.rasters.shell, tyre = input.rasters["front-wheel"];
    for (let p = 0; p < residual.pixels.length; p += 4) if (tyre.pixels[p + 3]) tyre.pixels.copy(residual.pixels, p, p, p + 4);
    input.spec.components.find((part) => part.id === "shell")!.asset = await save(input.root, "duplicated-body.png", residual);
    await update(input);
    await expect(prepareScene(input.job, input.root)).rejects.toThrow("EXCLUSIVE_SOURCE_OWNERSHIP");
  });

  it("rejects camera/geometry drift measured from rendered pixels, not approval flags", async () => {
    const input = await fixture();
    input.spec.components.find((part) => part.id === "shell")!.asset = await save(input.root, "drifted-shell.png", block(140, 50, 210, 80, [180, 190, 205]));
    await update(input);
    await expect(prepareScene(input.job, input.root)).rejects.toThrow("ASSEMBLED_SOURCE_SILHOUETTE");
  });

  it("rejects flattened plates and independently supplied stage images", async () => {
    const input = await fixture();
    input.spec.components.find((part) => part.id === "engine")!.asset = input.job.hero;
    await update(input);
    await expect(prepareScene(input.job, input.root)).rejects.toThrow("ISOLATED_PART");
    await writeFile(join(input.root, "scene.json"), JSON.stringify({ ...input.spec, explodedImage: "some-independent-car.png" }));
    await expect(prepareScene(input.job, input.root)).rejects.toThrow("SCENE_CONTRACT");
  });

  it("rejects missing mechanical evidence, missing categories and foreign identity", async () => {
    const input = await fixture();
    input.spec.components.find((part) => part.id === "engine")!.reference = null;
    await update(input);
    await expect(prepareScene(input.job, input.root)).rejects.toThrow("HIDDEN_COMPONENT_EVIDENCE");
    input.spec.components = input.spec.components.filter((part) => part.id !== "engine");
    await update(input);
    await expect(prepareScene(input.job, input.root)).rejects.toThrow("CATEGORY_COVERAGE");
    input.spec.visualFamilyId = "VF-FOREIGN";
    await update(input);
    await expect(prepareScene(input.job, input.root)).rejects.toThrow("SOURCE_LINEAGE");
  });

  it("refuses stale layer hashes and path traversal", async () => {
    const input = await fixture();
    input.spec.components[0].asset.sha256 = "0".repeat(64);
    await update(input);
    await expect(prepareScene(input.job, input.root)).rejects.toThrow("Checksum mismatch");
    input.spec.components[0].asset.file = "../elsewhere.png";
    await update(input);
    await expect(prepareScene(input.job, input.root)).rejects.toThrow("confined relative");
  });

  it("does not render an arbitrary hero before reconstruction is available", async () => {
    const input = await fixture();
    await expect(prepareScene({ ...input.job, sceneFile: null }, input.root)).rejects.toThrow("COMPONENT_SCENE_REQUIRED");
  });

  it("writes a real frame sequence, matching endpoint and geometry-derived pick map, but no automatic approval", async () => {
    const input = await fixture();
    const result = await runGuardedTransition(join(input.root, "job.json"));
    expect(result.qa.passed).toBe(true);
    expect(result.productionPublishable).toBe(false);
    const manifest = JSON.parse(await readFile(join(result.packRoot, "manifest.json"), "utf8"));
    expect(manifest.frames.length).toBeGreaterThanOrEqual(48);
    expect(manifest.customerReady).toBe(false);
    const finalFrame = await readFile(resolve(result.packRoot, manifest.frames.at(-1).file));
    const endpoint = await readFile(join(result.packRoot, "states/exploded.webp"));
    expect(finalFrame.equals(endpoint)).toBe(true);
    const ownership = await decodeRgba(await readFile(join(result.packRoot, "navigation/ownership.png")));
    expect(ownership.width).toBe(width);
    expect(ownership.height).toBe(height);
    const review = JSON.parse(await readFile(join(result.packRoot, "qa/visual-review.json"), "utf8"));
    expect(review.status).toBe("PENDING");
  }, 120_000);
});

afterAll(async () => {
  // All targets are explicit directories returned by mkdtemp, never a broad root.
  for (const root of roots) await rm(root, { recursive: true, force: true });
});
