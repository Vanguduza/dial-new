/** Hilux-style image authoring adapter. No mesh reconstruction or exploded-still input. */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { stableStringify } from "../../pipeline-core/src/hash.js";
import { sourceProvenanceSchema } from "../../contracts/src/index.js";
import { alphaBounds, cropRaster, decodeRgba, digest, encodePng, makeConfinedDirectory, readAsset, type Raster } from "./assets.js";
import { assetSchema, catalogBindingSchema, categorySchema, componentSceneSchema, report, roleSchema, SceneGateError, SCENE_ENGINE_VERSION, type ComponentScene, type GateCheck, type SceneJob } from "./contracts.js";
import { writeEvidence } from "./package.js";
import { prepareScene } from "./prepare.js";

export const RASTER_SOURCE_VERSION = "1.0.0";
const point = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
const polygon = z.array(point).min(3).max(256);
const box = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).strict().refine(b => b.x + b.width <= 1.000001 && b.y + b.height <= 1.000001, "Box must stay in frame");
const shape = z.discriminatedUnion("kind", [z.object({ kind: z.literal("polygon"), points: polygon }).strict(), z.object({ kind: z.literal("ellipse"), box }).strict()]);
const partId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const rasterSourceSchema = z.object({
  rasterSourceVersion: z.literal(RASTER_SOURCE_VERSION),
  visualFamilyId: z.string().regex(/^VF-[A-Z0-9-]+$/),
  hero: assetSchema,
  // Annotations are source-image normalized coordinates, not screen coordinates.
  annotation: z.object({ heroSha256: z.string().regex(/^[a-f0-9]{64}$/), visualFamilyId: z.string(), method: z.enum(["VISION_ASSISTED", "MASK_PROVIDER", "HUMAN_AUTHORED"]), review: z.literal("PENDING") }).strict(),
  topology: z.object({ bodyStyle: z.enum(["PICKUP", "COUPE", "SEDAN", "HATCHBACK", "SUV", "VAN", "WAGON"]), doorCount: z.number().int().min(2).max(6), cargoBed: z.boolean(), wheelPositions: z.array(partId).min(4).max(12) }).strict(),
  foreground: polygon,
  visibleParts: z.array(z.object({ id: partId, role: z.enum(["body-part", "wheel"]), shape, wheelPosition: partId.nullable() }).strict()).min(2).max(24),
  illustrations: z.array(z.object({
    id: partId, role: roleSchema, visualCategoryId: categorySchema, wheelPosition: partId.nullable(),
    source: z.union([z.object({ asset: assetSchema, crop: box.optional() }).strict(), z.object({ visiblePartId: partId }).strict()]),
    placement: box,
    // This names recognition art, never an exact fitted engine/axle assertion.
    disclosure: z.literal("CATEGORY_ILLUSTRATION_NOT_EXACT_FITMENT"),
  }).strict()).min(1).max(16),
  outputRoot: z.string().default("raster-prepared"),
  canvas: z.object({ width: z.number().int().min(640).max(1920), height: z.number().int().min(360).max(1080) }).strict().default({ width: 1024, height: 576 }),
  frameCount: z.number().int().min(48).max(120).default(96),
  catalog: catalogBindingSchema.optional(),
  provenance: z.record(z.string(), sourceProvenanceSchema),
}).strict();
export type RasterSource = z.infer<typeof rasterSourceSchema>;

export function insidePolygon(x: number, y: number, points: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function insideShape(x: number, y: number, s: RasterSource["visibleParts"][number]["shape"]) {
  if (s.kind === "polygon") return insidePolygon(x, y, s.points);
  const b = s.box;
  return ((x - b.x - b.width / 2) / (b.width / 2)) ** 2 + ((y - b.y - b.height / 2) / (b.height / 2)) ** 2 <= 1;
}

/** Partition, never copy: every visible pixel has exactly one persistent owner. */
export function partitionHero(hero: Raster, source: RasterSource, sourceTransform: { width: number; height: number; left: number; top: number }) {
  const { width, height } = hero;
  const layers = ["body-shell", ...source.visibleParts.map(p => p.id)].map(() => ({ width, height, pixels: Buffer.alloc(width * height * 4) }));
  const mask: Raster = { width, height, pixels: Buffer.alloc(width * height * 4) };
  let ambiguous = 0, foregroundPixels = 0, wheelCutouts = 0;
  const counts = layers.map(() => 0);
  const boxes = source.visibleParts.map(part => part.shape.kind === "ellipse" ? part.shape.box : {
    x: Math.min(...part.shape.points.map(p => p[0])), y: Math.min(...part.shape.points.map(p => p[1])),
    width: Math.max(...part.shape.points.map(p => p[0])) - Math.min(...part.shape.points.map(p => p[0])),
    height: Math.max(...part.shape.points.map(p => p[1])) - Math.min(...part.shape.points.map(p => p[1])),
  });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const nx = (x + 0.5 - sourceTransform.left) / sourceTransform.width, ny = (y + 0.5 - sourceTransform.top) / sourceTransform.height;
    if (!insidePolygon(nx, ny, source.foreground)) continue;
    let first = 0, wheel = 0, ownerCount = 0, wheelCount = 0;
    for (let index = 0; index < source.visibleParts.length; index++) {
      const b = boxes[index], part = source.visibleParts[index];
      if (nx < b.x || nx > b.x + b.width || ny < b.y || ny > b.y + b.height || !insideShape(nx, ny, part.shape)) continue;
      if (!first) first = index + 1;
      ownerCount++;
      if (part.role === "wheel") { wheelCount++; if (!wheel) wheel = index + 1; }
    }
    // An explicit physical wheel mask subtracts its pixels from panels. Two
    // wheels or two body panels competing for a pixel are genuine ambiguity.
    if (wheelCount > 1 || (wheelCount === 0 && ownerCount > 1)) ambiguous++;
    if (wheelCount === 1 && ownerCount > 1) wheelCutouts++;
    const owner = wheel || first, offset = (y * width + x) * 4;
    hero.pixels.copy(layers[owner].pixels, offset, offset, offset + 4);
    layers[owner].pixels[offset + 3] = 255;
    mask.pixels.set([255, 255, 255, 255], offset);
    counts[owner]++; foregroundPixels++;
  }
  return { layers, mask, ambiguous, counts, foregroundPixels, wheelCutouts };
}

export async function prepareRasterSource(inputPath: string) {
  const root = dirname(resolve(inputPath));
  const input = rasterSourceSchema.parse(JSON.parse(await readFile(inputPath, "utf8")));
  const sourceBytes = await readAsset(root, input.hero);
  const source = await decodeRgba(sourceBytes);
  // Include adapter + contract + encoder versions so stale annotations cannot hit an old cache.
  const key = digest(stableStringify({ adapter: RASTER_SOURCE_VERSION, engine: SCENE_ENGINE_VERSION, input, encoder: sharp.versions }));
  const output = await makeConfinedDirectory(root, `${input.outputRoot}/${input.visualFamilyId}/${key.slice(0, 16)}`);
  const checks: GateCheck[] = [];
  const check = (gate: string, pass: boolean, detail: string, actual?: number) => checks.push({ gate, status: pass ? "PASS" : "FAIL", detail, ...(actual === undefined ? {} : { actual }) });
  const save = async (file: string, raster: Raster) => { const bytes = await encodePng(raster); await writeFile(join(output, file), bytes); return { file, sha256: digest(bytes) }; };
  try {
    check("ANNOTATION_IDENTITY_LOCK", input.annotation.heroSha256 === input.hero.sha256 && input.annotation.visualFamilyId === input.visualFamilyId, "Masks bind to this hero and visual family; never reuse Hilux annotations for a foreign vehicle.");
    check("BODY_TOPOLOGY", input.topology.cargoBed === (input.topology.bodyStyle === "PICKUP") && (input.topology.bodyStyle !== "COUPE" || input.topology.doorCount === 2), "Body-style topology must agree; a coupe cannot inherit a pickup bed or four-door body.");
    const ids = ["body-shell", ...input.visibleParts.map(p => p.id), ...input.illustrations.map(p => p.id)];
    check("UNIQUE_SOURCE_PARTS", new Set(ids).size === ids.length, "Source component names must be unique.");
    check("SOURCE_ROLE_OWNERSHIP", [...input.visibleParts, ...input.illustrations].every(p => (p.role === "wheel") === (p.wheelPosition !== null)), "Only physical wheel components may own wheel positions.");
    check("ILLUSTRATIVE_ROLES", input.illustrations.every(p => p.role !== "body-shell" && p.role !== "body-part"), "Visible exterior identity comes from this hero, not a generic donor body.");
    if (checks.some(c => c.status !== "PASS")) throw new SceneGateError(report(checks));
    const { width, height } = input.canvas;
    const scale = Math.min(width / source.width, height / source.height);
    const w = Math.round(source.width * scale), h = Math.round(source.height * scale);
    const left = Math.floor((width - w) / 2), top = Math.floor((height - h) / 2);
    const normalized = await sharp(sourceBytes).resize(w, h).extend({ left, right: width - w - left, top, bottom: height - h - top, background: "#080b0e" }).png().toBuffer();
    const hero = await decodeRgba(normalized);
    const heroAsset = await save("hero.png", hero);
    // Lock AFTER normalization. The original source is retained separately for provenance.
    await writeFile(join(output, "original-source.png"), await encodePng(source));
    const partition = partitionHero(hero, input, { width: w, height: h, left, top });
    check("UNAMBIGUOUS_VISIBLE_MASKS", partition.ambiguous === 0, "Overlapping visible masks require an annotation repair; priority cannot hide duplicate wheel ownership.", partition.ambiguous);
    check("WHEEL_PIXELS_SUBTRACTED_FROM_BODY", true, "Wheel-owned pixels are removed from every panel and the residual shell before any animation.", partition.wheelCutouts);
    check("NONEMPTY_SOURCE_COMPONENTS", partition.counts.every(n => n >= 24), "Every declared exterior component needs actual source pixels.", Math.min(...partition.counts));
    const spec: ComponentScene = { schemaVersion: "1.0.0", visualFamilyId: input.visualFamilyId, heroSha256: heroAsset.sha256, canvas: input.canvas, camera: "LOCKED_REGISTERED_HERO_CAMERA", foregroundMask: await save("foreground.png", partition.mask), expectedWheelPositions: input.topology.wheelPositions, requiredSections: ["body-exterior", "engine", "transmission-drivetrain", "chassis-systems"], components: [] };
    for (const [index, raster] of partition.layers.entries()) {
      const part = input.visibleParts[index - 1];
      spec.components.push({ id: part?.id ?? "body-shell", role: part?.role ?? "body-shell", asset: await save(`${part?.id ?? "body-shell"}.png`, raster), depth: 20, wheelPosition: part?.wheelPosition ?? null, evidence: "HERO_VISIBLE_PIXELS", reference: null });
    }
    for (const part of input.illustrations) {
      let reference: Raster;
      if ("visiblePartId" in part.source) {
        const index = input.visibleParts.findIndex(p => p.id === (part.source as { visiblePartId: string }).visiblePartId);
        if (index < 0 || input.visibleParts[index].role !== "wheel" || part.role !== "wheel") throw new Error("Only a declared wheel may supply an occluded illustrative wheel");
        reference = partition.layers[index + 1];
      } else {
        reference = await decodeRgba(await readAsset(root, part.source.asset));
        if (part.source.crop) {
          const b = part.source.crop;
          reference = cropRaster(reference, { x: Math.round(b.x * reference.width), y: Math.round(b.y * reference.height), width: Math.floor(b.width * reference.width), height: Math.floor(b.height * reference.height) });
        }
      }
      const bounds = alphaBounds(reference);
      if (!bounds) throw new Error(`Illustration ${part.id} is empty`);
      check(`TRUE_ALPHA:${part.id}`, reference.pixels.some((v, i) => i % 4 === 3 && v < 24), "Illustration must have real alpha; no baked background rectangles.");
      const cut = cropRaster(reference, bounds);
      const target = part.placement;
      const pw = Math.round(target.width * w), ph = Math.round(target.height * h);
      const fit = Math.min(pw / cut.width, ph / cut.height);
      const tw = Math.max(1, Math.round(cut.width * fit)), th = Math.max(1, Math.round(cut.height * fit));
      const tx = left + Math.round(target.x * w + (pw - tw) / 2), ty = top + Math.round(target.y * h + (ph - th) / 2);
      const rgba = await sharp(cut.pixels, { raw: { width: cut.width, height: cut.height, channels: 4 } }).resize(tw, th).raw().toBuffer();
      const registered: Raster = { width, height, pixels: Buffer.alloc(width * height * 4) };
      let leak = 0;
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const from = (y * tw + x) * 4, to = ((ty + y) * width + tx + x) * 4;
        if (rgba[from + 3] >= 24 && partition.mask.pixels[to] !== 255) leak++;
        rgba.copy(registered.pixels, to, from, from + 4);
      }
      check(`ASSEMBLED_OCCLUSION:${part.id}`, leak === 0, "Illustrative internals start completely behind visible hero surfaces; never pop into place from outside the car.", leak);
      spec.components.push({ id: part.id, role: part.role, visualCategoryId: part.visualCategoryId, asset: await save(`${part.id}.png`, registered), depth: 0, wheelPosition: part.wheelPosition, evidence: "CATEGORY_ILLUSTRATION", reference: await save(`${part.id}-reference.png`, cut) });
    }
    await writeEvidence(join(output, "source-preparation-qa.json"), report(checks));
    if (checks.some(c => c.status !== "PASS")) throw new SceneGateError(report(checks));
    componentSceneSchema.parse(spec);
    const job: SceneJob = { sceneEngineVersion: SCENE_ENGINE_VERSION, visualFamilyId: input.visualFamilyId, hero: heroAsset, sceneFile: "component-scene.json", outputRoot: "packs", frameCount: input.frameCount, fps: 30, provenance: input.provenance, ...(input.catalog ? { catalog: input.catalog } : {}) };
    await writeEvidence(join(output, "component-scene.json"), spec);
    await writeEvidence(join(output, "job.json"), job);
    const prepared = await prepareScene(job, output);
    checks.push(...prepared.checks);
    await writeEvidence(join(output, "source-preparation-qa.json"), report(checks));
    await writeEvidence(join(output, "source-receipt.json"), { adapter: RASTER_SOURCE_VERSION, key, originalHero: input.hero, normalizedHero: heroAsset, annotation: input.annotation, topology: input.topology, normalization: { scale, width: w, height: h, left, top }, sourcePreservationMeasured: true, semanticRecognitionProven: false, humanVisualReview: "PENDING", customerReady: false });
    return { jobPath: join(output, "job.json"), output, qa: report(checks) };
  } catch (error) {
    const qa = error instanceof SceneGateError ? error.report : report([...checks, { gate: "RASTER_PREPARATION", status: "FAIL", detail: error instanceof Error ? error.message : String(error) }]);
    await writeEvidence(join(output, "source-preparation-qa.json"), qa);
    throw new SceneGateError(qa, join(output, "source-preparation-qa.json"));
  }
}
