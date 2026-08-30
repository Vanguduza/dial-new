import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { digest, encodePng, type Raster } from "../../packages/scene-engine/src/assets.js";
import { sceneJobSchema, type ComponentScene, type SceneJob } from "../../packages/scene-engine/src/contracts.js";

/** Abstract test geometry, NOT real-model visual quality evidence. */
export async function sceneFixture(root: string, family = "VF-TEST-COUPE", colour = 180) {
  await mkdir(root, { recursive: true });
  const width = 640, height = 360;
  const box = (x: number, y: number, w: number, h: number, c: number): Raster => {
    const pixels = Buffer.alloc(width * height * 4);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) pixels.set([c, c, c, 255], (yy * width + xx) * 4);
    return { pixels, width, height };
  };
  const rasters = {
    shell: box(200, 110, 230, 85, colour), engine: box(360, 130, 50, 50, 75), transmission: box(250, 130, 55, 45, 105),
    "rear-wheel": box(225, 210, 65, 65, 35), "front-wheel": box(365, 210, 65, 65, 45),
    "front-suspension": box(350, 130, 55, 50, 65), "rear-suspension": box(225, 135, 55, 50, 70),
  };
  const hero = box(0, 0, width, height, 8), mask = box(0, 0, width, height, 0);
  for (const name of ["engine", "transmission", "front-suspension", "rear-suspension", "shell", "rear-wheel", "front-wheel"] as const) {
    const raster = rasters[name];
    for (let p = 0; p < raster.pixels.length; p += 4) if (raster.pixels[p + 3]) {
      raster.pixels.copy(hero.pixels, p, p, p + 4); mask.pixels.set([255, 255, 255, 255], p);
    }
  }
  const save = async (file: string, raster: Raster) => { const bytes = await encodePng(raster); await writeFile(join(root, file), bytes); return { file, sha256: digest(bytes) }; };
  const heroAsset = await save("hero.png", hero);
  const spec: ComponentScene = { schemaVersion: "1.0.0", visualFamilyId: family, heroSha256: heroAsset.sha256, canvas: { width, height }, camera: "LOCKED_REGISTERED_HERO_CAMERA", foregroundMask: await save("mask.png", mask), expectedWheelPositions: ["front-left", "rear-left"], requiredSections: ["body-exterior", "engine", "transmission-drivetrain", "chassis-systems"], components: [] };
  for (const [id, raster] of Object.entries(rasters)) {
    const hidden = id === "engine" || id === "transmission" || id.endsWith("suspension");
    spec.components.push({ id, role: id === "shell" ? "body-shell" : id.endsWith("wheel") ? "wheel" : id.endsWith("suspension") ? "suspension" : id as "engine" | "transmission",
      ...(id.endsWith("suspension") ? { visualCategoryId: id.startsWith("front") ? "VC-FSUS" as const : "VC-RSUS" as const } : {}),
      asset: await save(`${id}.png`, raster), depth: hidden ? 0 : 10,
      wheelPosition: id.endsWith("wheel") ? (id.startsWith("front") ? "front-left" : "rear-left") : null,
      evidence: hidden ? "CATEGORY_ILLUSTRATION" : "HERO_VISIBLE_PIXELS", reference: hidden ? heroAsset : null });
  }
  const job: SceneJob = sceneJobSchema.parse({ sceneEngineVersion: "1.1.0", visualFamilyId: family, hero: heroAsset, sceneFile: "scene.json", frameCount: 48 });
  const persist = async () => { await writeFile(join(root, "scene.json"), JSON.stringify(spec)); await writeFile(join(root, "job.json"), JSON.stringify(job)); };
  await persist(); return { root, spec, job, rasters, persist, save, jobPath: join(root, "job.json") };
}
