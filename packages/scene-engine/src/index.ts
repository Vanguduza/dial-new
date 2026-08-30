import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import sharp from "sharp";
import { confine, confinedExisting, digest } from "./assets.js";
import { report, sceneJobSchema, SceneGateError, SCENE_ENGINE_VERSION, type GateCheck } from "./contracts.js";
import { createMotionPlan, motionSamples, TIMELINE, validateMotion } from "./motion.js";
import { prepareScene } from "./prepare.js";
import { SceneRenderer, type Frame } from "./render.js";
import { archiveScene, emitFlowPack, navigationRegions, sealPack } from "./package.js";
import { displayProbeChecks } from "./display.js";
import { frameCache } from "./frame-cache.js";

const json = (path: string, value: unknown) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const webp = (frame: Frame) => sharp(frame.raster.pixels, { raw: { width: frame.raster.width, height: frame.raster.height, channels: 4 } }).webp({ lossless: true }).toBuffer();

export async function validateSceneJob(jobPath: string) {
  const job = sceneJobSchema.parse(JSON.parse(await readFile(jobPath, "utf8")));
  const scene = await prepareScene(job, dirname(resolve(jobPath)));
  const motion = createMotionPlan(scene);
  const checks = [...scene.checks, ...validateMotion(scene, motion, job.frameCount)];
  return { job, scene, motion, qa: report(checks) };
}

export async function runGuardedTransition(jobPath: string, onEvent?: (event: Record<string, unknown>) => void) {
  const absolute = resolve(jobPath), root = await realpath(dirname(absolute));
  const jobText = await readFile(absolute, "utf8");
  const job = sceneJobSchema.parse(JSON.parse(jobText));
  const output = confine(root, job.outputRoot);
  // Check the closest existing ancestor BEFORE creating directories: junctions
  // must not redirect a writer outside the job's workspace.
  let parent = output;
  for (;;) {
    try {
      const canonical = await realpath(parent), rel = relative(root, canonical);
      if (rel === ".." || rel.startsWith(`..${sep}`) || /^[a-z]:/i.test(rel)) throw new Error("Output directory escapes job root");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      parent = dirname(parent);
    }
  }
  const packRoot = join(output, job.visualFamilyId, `${digest(jobText).slice(0, 12)}-${randomUUID().slice(0, 8)}`);
  await mkdir(join(packRoot, "qa"), { recursive: true });
  const qaPath = join(packRoot, "qa", "quality-gates.json");
  let checks: GateCheck[] = [];
  try {
    onEvent?.({ type: "scene_validation_started", visualFamilyId: job.visualFamilyId });
    const scene = await prepareScene(job, root);
    const motion = createMotionPlan(scene);
    checks = [...scene.checks, ...validateMotion(scene, motion, job.frameCount)];
    const renderer = new SceneRenderer(scene, motion);
    const cache = await frameCache(output, scene.sceneHash, job.hero.sha256);
    for (const folder of ["frames", "states", "navigation", "scene", "source"]) await mkdir(join(packRoot, folder), { recursive: true });
    // Preserve the exact source scene and its evidence; render input hashes are
    // rechecked on every run, including retries. Nothing is auto-approved.
    const groups = await archiveScene(root, job, dirname(await confinedExisting(root, job.sceneFile!)), scene, packRoot, motion);
    checks.push({ gate: "ALL_PLANNED_LAYERS_PRESENT", status: motion.tracks.every((track) => groups.some((group) => group.layerAssetId === track.layerAssetId && group.components.some((part) => part.id === track.id))) ? "PASS" : "FAIL", detail: "Every track resolves to a packaged group layer and its actual source component asset." });
    const frames: Array<{ file: string; sha256: string; progress: number }> = [];
    let lastFrame: Frame | undefined;
    let lastBytes: Buffer | undefined;
    const samples = motionSamples(motion, job.frameCount);
    for (const [index, progress] of samples.entries()) {
      const cached = await cache.get(progress);
      const frame = !cached || index === samples.length - 1 ? await renderer.frame(progress) : undefined;
      const bytes = cached ?? await webp(frame!);
      if (!cached) await cache.put(progress, bytes);
      const file = `frames/${String(index).padStart(4, "0")}.webp`;
      await writeFile(join(packRoot, file), bytes);
      frames.push({ file, sha256: digest(bytes), progress });
      if (index === 0) await writeFile(join(packRoot, "states", "hero.webp"), bytes);
      if (frame) lastFrame = frame;
      lastBytes = bytes;
      if (index % 12 === 0) onEvent?.({ type: cached ? "frame_reused" : "frame_rendered", index, total: samples.length });
    }
    // The settled master IS the last animation frame, not a separately made view.
    await writeFile(join(packRoot, "states", "exploded.webp"), lastBytes!);
    await writeFile(join(packRoot, "states", "studio-surface.webp"), await webp(await renderer.frame(TIMELINE.studioEnd)));
    await writeFile(join(packRoot, "states", "line-art.webp"), await webp(await renderer.frame(TIMELINE.lineEnd)));
    const independentlySettled = await webp(await renderer.frame(1));
    checks.push({ gate: "SETTLED_ENDPOINT_IDENTITY", status: digest(independentlySettled) === digest(lastBytes!) ? "PASS" : "FAIL", detail: "Animation's last frame and the clickable exploded master must be byte-identical." });
    const ownerCounts = new Map<number, number>();
    for (const code of lastFrame!.owners) if (code) ownerCounts.set(code, (ownerCounts.get(code) ?? 0) + 1);
    for (const part of lastFrame!.parts) checks.push({ gate: `VISIBLE_PICK_GEOMETRY:${part.id}`, status: (ownerCounts.get(part.code) ?? 0) >= 24 ? "PASS" : "FAIL", actual: ownerCounts.get(part.code) ?? 0, limit: 24, detail: "Every component must own visible selectable pixels in the final render." });
    checks.push(...displayProbeChecks(lastFrame!));
    const navigation = { coordinateSystem: "NORMALIZED_0_1", width: scene.spec.canvas.width, height: scene.spec.canvas.height,
      picking: "EXACT_VISIBLE_OWNER_THEN_NEAREST_CSS_PADDING", minimumTouchDiameterCss: 44,
      displayTransform: { version: "1.0.0", sourceCoordinates: "NORMALIZED_0_1", fit: "contain", scale: 1, translateX: 0, translateY: 0, appliesTo: ["ARTWORK", "OWNERSHIP", "REGIONS"] },
      visibleMarkers: false, ariaHidden: true, keyboardCategoryListRequired: true,
      ownershipAsset: "navigation/ownership.png", regions: navigationRegions(job, scene, motion), parts: lastFrame!.parts,
      visualFamilyId: job.visualFamilyId, catalogBinding: job.catalog ? "navigation/epc-mapping.json" : null };
    const ownerRgb = Buffer.alloc(lastFrame!.owners.length * 3);
    lastFrame!.owners.forEach((code, index) => { ownerRgb[index * 3] = code; });
    await sharp(ownerRgb, { raw: { width: scene.spec.canvas.width, height: scene.spec.canvas.height, channels: 3 } }).png().toFile(join(packRoot, "navigation", "ownership.png"));
    await json(join(packRoot, "navigation", "manifest.json"), navigation);
    const qa = report(checks);
    await json(qaPath, qa);
    await json(join(packRoot, "qa", "qa.json"), qa);
    if (!qa.passed) throw new SceneGateError(qa, qaPath);
    await json(join(packRoot, "manifest.json"), {
      engineVersion: SCENE_ENGINE_VERSION, visualFamilyId: job.visualFamilyId,
      status: "RENDERED_AWAITING_VISUAL_REVIEW", customerReady: false,
      sourceHash: job.hero.sha256, sceneHash: scene.sceneHash,
      renderMode: "REGISTERED_COMPONENT_LAYERS", studioStyle: "DETERMINISTIC_SURFACE_TREATMENT_NOT_3D_RECONSTRUCTION",
      fps: job.fps, frames, timeline: TIMELINE, sampling: { minimumFrames: job.frameCount, actualFrames: samples.length, policy: "ADAPTIVE_INBETWEENS_FIXED_CHOREOGRAPHY" },
      states: { hero: "states/hero.webp", studio: "states/studio-surface.webp", lineArt: "states/line-art.webp", exploded: "states/exploded.webp" },
      navigation: "navigation/manifest.json", qa: "qa/qa.json", sourceScene: "component-scene.json", layers: "layers/manifest.json",
      provenance: job.provenance ?? {},
      productionBlockers: ["INDEPENDENT_VISUAL_REVIEW_PENDING", ...(!job.provenance ? ["SOURCE_PROVENANCE_REQUIRED"] : []), ...(!job.catalog ? ["CATALOG_INJECTION_PENDING"] : []), "STUDIO_SURFACE_RENDER_IS_NOT_RECONSTRUCTED_3D_CGI"],
      customerBehavior: { trigger: "VEHICLE_SEARCH_COMMITTED", showProgress: false, showStageBar: false, replayUnchangedVehicle: false, returnState: "SETTLED_EXPLODED", reducedMotion: "SETTLED_EXPLODED" },
    });
    await json(join(packRoot, "qa", "visual-review.json"), {
      status: "PENDING", boundToSceneHash: scene.sceneHash, reviewer: null,
      required: ["exact-model-appearance", "correct-foreground-mask", "complete-component-reconstruction", "hidden-mechanical-reference-validity", "one-tyre-per-position-throughout-motion", "desktop-and-mobile-visual-quality"],
      note: "Geometric checks do not prove semantic vehicle recognition or unseen OEM structure. No catalog activation until these checks and exact fitment binding are complete.",
    });
    await emitFlowPack(packRoot, job, scene);
    await sealPack(packRoot);
    onEvent?.({ type: "guarded_render_complete", visualFamilyId: job.visualFamilyId });
    return { packRoot, status: "RENDERED_AWAITING_VISUAL_REVIEW", qa, productionPublishable: false };
  } catch (error) {
    const qa = error instanceof SceneGateError ? error.report : report([...checks, { gate: "INPUT_OR_RENDER_FAILURE", status: "FAIL", detail: error instanceof Error ? error.message : String(error) }]);
    await json(qaPath, qa);
    await json(join(packRoot, "qa", "qa.json"), qa);
    await json(join(packRoot, "rejected.json"), { status: "REJECTED", productionPublishable: false, reason: "A quality gate failed or was not measured", qa: "qa/quality-gates.json" });
    throw new SceneGateError(qa, qaPath);
  }
}
