import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { confinedExisting, decodeRgba, digest, encodePng, readAsset } from "./assets.js";
import { componentSceneSchema, sceneJobSchema, type GateReport } from "./contracts.js";
import { writeEvidence } from "./package.js";

export function repairAdvice(qa: GateReport) {
  const failures = qa.checks.filter((check) => check.status !== "PASS");
  return failures.map((check) => ({ gate: check.gate, action:
    check.gate.startsWith("EXCLUSIVE_SOURCE_OWNERSHIP:") ? "RESEGMENT_OWNERSHIP_PRESERVE_OTHER_PARTS" :
    /WHEEL/.test(check.gate) ? "RECONCILE_PHYSICAL_WHEEL_INVENTORY" :
    /SOURCE_|SILHOUETTE|APPEARANCE|CAMERA/.test(check.gate) ? "REFIT_CAMERA_OR_RECONSTRUCT_FROM_SAME_IDENTITY_REFERENCES" :
    /SCALE|SIZE|CLIPPING|SEPARATION/.test(check.gate) ? "REGROUP_OR_RELAYOUT_WITHOUT_CHANGING_GEOMETRY" :
    /CATEGORY|PICK|DISPLAY/.test(check.gate) ? "CORRECT_SEMANTIC_BINDING_OR_DISPLAY_TRANSFORM" :
    /EVIDENCE/.test(check.gate) ? "ADD_TRACEABLE_CATEGORY_REFERENCE" : "REBUILD_COMPONENT_SCENE",
    detail: check.detail }));
}

/** A narrow, measurable repair: remove duplicate visible-source pixels from a residual shell.
 * Never erase from two peer parts, invent missing geometry, change identity or lower thresholds.
 * The repaired candidate must pass the full source comparison again before it is used.
 */
export async function repairResidualOwnership(jobPath: string, qa: GateReport, destination: string) {
  const job = sceneJobSchema.parse(JSON.parse(await readFile(jobPath, "utf8")));
  if (!job.sceneFile) return null;
  const root = dirname(resolve(jobPath)), scenePath = await confinedExisting(root, job.sceneFile);
  const spec = componentSceneSchema.parse(JSON.parse(await readFile(scenePath, "utf8"))), sceneRoot = dirname(scenePath);
  const shell = spec.components.find((part) => part.role === "body-shell" && part.evidence === "HERO_VISIBLE_PIXELS");
  if (!shell) return null;
  const ids = new Set<string>();
  for (const check of qa.checks.filter((item) => item.status === "FAIL" && item.gate.startsWith("EXCLUSIVE_SOURCE_OWNERSHIP:"))) {
    const [, a, b] = check.gate.split(":");
    if (a === shell.id) ids.add(b); else if (b === shell.id) ids.add(a);
  }
  if (!ids.size) return null;
  const residual = await decodeRgba(await readAsset(sceneRoot, shell.asset));
  let removed = 0;
  for (const id of ids) {
    const part = spec.components.find((entry) => entry.id === id && entry.evidence === "HERO_VISIBLE_PIXELS");
    if (!part) return null;
    const raster = await decodeRgba(await readAsset(sceneRoot, part.asset));
    if (raster.width !== residual.width || raster.height !== residual.height) return null;
    for (let p = 3; p < raster.pixels.length; p += 4) if (raster.pixels[p] >= 128 && residual.pixels[p] !== 0) {
      residual.pixels.fill(0, p - 3, p + 1); removed++;
    }
  }
  if (!removed) return null;
  await mkdir(destination, { recursive: true });
  const save = async (bytes: Buffer, extension = ".png") => {
    const file = `${digest(bytes)}${extension || ".bin"}`;
    await writeFile(join(destination, file), bytes);
    return { file, sha256: digest(bytes) };
  };
  const hero = await save(await readAsset(root, job.hero), extname(job.hero.file));
  spec.foregroundMask = await save(await readAsset(sceneRoot, spec.foregroundMask), extname(spec.foregroundMask.file));
  for (const part of spec.components) {
    part.asset = await save(part.id === shell.id ? await encodePng(residual) : await readAsset(sceneRoot, part.asset), part.id === shell.id ? ".png" : extname(part.asset.file));
    if (part.reference) part.reference = await save(await readAsset(sceneRoot, part.reference), extname(part.reference.file));
  }
  await writeEvidence(join(destination, "component-scene.json"), spec);
  await writeEvidence(join(destination, "job.json"), { ...job, hero, sceneFile: "component-scene.json", outputRoot: "packs" });
  await writeEvidence(join(destination, "repair.json"), { operation: "REMOVE_DUPLICATED_SOURCE_OWNERSHIP", componentId: shell.id, ownedBy: [...ids].sort(), removedPixels: removed, sourceHeroHash: job.hero.sha256, thresholdsChanged: false });
  return join(destination, "job.json");
}
