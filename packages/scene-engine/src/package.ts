import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import sharp from "sharp";
import { CATEGORY_MOTION, HIT_REGION_PRIORITY, MOTION_PROFILES } from "../../contracts/src/index.js";
import { stableStringify } from "../../pipeline-core/src/hash.js";
import { digest, encodePng, readAsset } from "./assets.js";
import { categoryOf, SCENE_ENGINE_VERSION, type GateReport, type SceneJob } from "./contracts.js";
import { compositeRegistered, type PreparedScene } from "./prepare.js";
import { transformAt, type MotionPlan } from "./motion.js";

export async function writeEvidence(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${stableStringify(value)}\n`, "utf8");
}

/** Copy the complete source closure. A pack must rebuild after its authoring directory disappears. */
export async function archiveScene(root: string, job: SceneJob, sceneRoot: string, scene: PreparedScene, packRoot: string, motion: MotionPlan) {
  const copy = async (base: string, asset: { file: string; sha256: string }, folder: string) => {
    const bytes = await readAsset(base, asset);
    const file = `${folder}/${asset.sha256}${extname(asset.file).toLowerCase() || ".bin"}`;
    await mkdir(join(packRoot, folder), { recursive: true });
    await writeFile(join(packRoot, file), bytes);
    return { file, sha256: digest(bytes) };
  };
  const hero = await copy(root, job.hero, "source");
  const spec = structuredClone(scene.spec);
  spec.foregroundMask = await copy(sceneRoot, spec.foregroundMask, "source");
  for (const component of spec.components) {
    component.asset = await copy(sceneRoot, component.asset, "layers");
    if (component.reference) component.reference = await copy(sceneRoot, component.reference, "source");
  }
  await writeEvidence(join(packRoot, "component-scene.json"), spec);
  await writeEvidence(join(packRoot, "input-job.json"), { ...job, hero, sceneFile: "component-scene.json", outputRoot: "rebuilt-packs" });
  const groups = [];
  for (const category of Object.keys(CATEGORY_MOTION) as Array<keyof typeof CATEGORY_MOTION>) {
    const members = scene.components.filter((part) => categoryOf(part.spec) === category);
    if (!members.length) continue;
    const file = `layers/${CATEGORY_MOTION[category].layerAssetId}.png`;
    const bytes = await encodePng(compositeRegistered(members, scene.spec.canvas.width, scene.spec.canvas.height));
    await writeFile(join(packRoot, file), bytes);
    groups.push({ visualCategoryId: category, layerAssetId: CATEGORY_MOTION[category].layerAssetId, file, sha256: digest(bytes), components: spec.components.filter((part) => categoryOf(part) === category).map((part) => ({ id: part.id, asset: part.asset })) });
  }
  await writeEvidence(join(packRoot, "layers", "manifest.json"), { schemaVersion: "1.0.0", groups });
  const { width, height } = scene.spec.canvas;
  await writeEvidence(join(packRoot, "scene", "motion-plan.json"), {
    schemaVersion: "1.1.0", profile: MOTION_PROFILES["premium-v1"], coordinateSystem: "NORMALIZED_0_1",
    tracks: motion.tracks.map((track) => {
      const origin = { x: (track.source.x + track.source.width / 2) / width, y: (track.source.y + track.source.height / 2) / height };
      const destination = { x: track.destination.x / width, y: track.destination.y / height };
      return { componentId: track.id, visualCategoryId: track.visualCategoryId, layerAssetId: track.layerAssetId,
        componentAsset: spec.components.find((part) => part.id === track.id)!.asset.file,
        origin, destination, explosionVector: { x: destination.x - origin.x, y: destination.y - origin.y },
        sourceBounds: { x: track.source.x / width, y: track.source.y / height, width: track.source.width / width, height: track.source.height / height },
        scale: track.scale, depth: track.depth, startProgress: track.startProgress, endProgress: track.endProgress, easing: track.easing };
    }),
  });
  return groups;
}

export function navigationRegions(job: SceneJob, scene: PreparedScene, motion: MotionPlan) {
  const { width, height } = scene.spec.canvas;
  return motion.tracks.map((track) => {
    const box = transformAt(track, 1), mapping = job.catalog?.categories.find((entry) => entry.visualCategoryId === track.visualCategoryId);
    return { hitRegionId: `HR-${track.id.toUpperCase()}`, componentId: track.id, visualCategoryId: track.visualCategoryId,
      layerAssetId: track.layerAssetId, geometryType: "POLYGON", geometry: [[box.x / width, box.y / height], [(box.x + box.width) / width, box.y / height], [(box.x + box.width) / width, (box.y + box.height) / height], [box.x / width, (box.y + box.height) / height]],
      priority: HIT_REGION_PRIORITY[track.visualCategoryId],
      target: mapping && job.catalog ? { catalogFamilyId: job.catalog.catalogFamilyId, sectionSlug: mapping.sectionSlug } : null,
      fallbackSectionSlug: "body-exterior" };
  });
}

export async function emitFlowPack(packRoot: string, job: SceneJob, scene: PreparedScene) {
  if (!job.catalog) return null; // No invented catalog IDs before injection.
  const { coverage, categories, ...vehicle } = job.catalog;
  const qa = JSON.parse(await readFile(join(packRoot, "qa", "qa.json"), "utf8")) as GateReport;
  const wheelChecks = qa.checks.filter((check) => check.gate === "WHEEL_OWNERSHIP" || check.gate.startsWith("EXCLUSIVE_SOURCE_OWNERSHIP:"));
  const fingerprintComponents = ["catalogReleaseId", "fitmentId", "visualFamilyId", "flowPackId", "variantId"];
  const flow = {
    schemaVersion: "1.3.0", flowPackId: `H2E-${job.visualFamilyId.slice(3)}-V1`, status: "PRODUCTION_REVIEW_REQUIRED", customerReady: false,
    vehicle: { visualFamilyId: job.visualFamilyId, ...vehicle }, coverage,
    entryModes: ["CASCADE_SEARCH", "GARAGE_VISUAL_FLOW", "GARAGE_EPC_DIRECT", "MENU_EPC_BROWSE"],
    autoplay: { trigger: "VEHICLE_SEARCH_COMMITTED", userPlayControl: false, reducedMotionBehavior: "CUT_TO_NAVIGATION_READY", replayAllowedFromVehicleSummary: false, automaticReplayWhenVehicleUnchanged: false, completedVehicleReturnState: "RESTORE_SETTLED_EXPLODED" },
    completionMemory: { fingerprintComponents, storage: "SESSION_STORAGE", onMatch: "RESTORE_SETTLED_EXPLODED_WITHOUT_REPLAY", keepsHitMapActive: true, invalidatesOn: fingerprintComponents },
    retainedSelection: { preserveUntilEdited: true, committedTextAppearance: "FAINT_GREY", contextPropagation: ["homepage", "epc", "garage"] },
    transitionWindow: { topInstruction: "click on the category image to browse parts", headlinePattern: "Know your {exact chosen model}. Find the right part.", headlinePlacement: "BOTTOM_LEFT", visibleProgressUi: false },
    visualIntegrity: { explodedViewPolicy: { expectedWheelPositions: scene.spec.expectedWheelPositions.length, tyresPerPosition: Object.fromEntries(scene.spec.expectedWheelPositions.map((id) => [id, 1])), looseSpareTyres: 0, automatedPass: wheelChecks.length > 0 && wheelChecks.every((check) => check.status === "PASS"), humanVisualReview: "PENDING" }, wheelMultiplicityRule: "EXACTLY_ONE_TYRE_PER_PHYSICAL_WHEEL_POSITION" },
    stages: [
      { id: "HERO_PHOTOGRAPHY", asset: "states/hero.webp", required: true },
      { id: "IDENTITY_LOCK", asset: "component-scene.json", required: true },
      { id: "STUDIO_CGI", asset: "states/studio-surface.webp", required: true },
      { id: "ENGINEERING_LINE_ART", asset: "states/line-art.webp", required: true },
      { id: "EXPLODED_SYSTEMS", asset: "states/exploded.webp", required: true },
      { id: "VISUAL_HIT_MAP", asset: "navigation/manifest.json", required: true },
      { id: "EPC_SECTION_HANDOFF", asset: "navigation/epc-mapping.json", required: true },
      { id: "EPC_DIAGRAM_AND_PARTS", route: `/epc/vehicles/${vehicle.familySlug}`, required: true },
    ],
    catalogHandoff: { mapping: "navigation/epc-mapping.json", navigationManifest: "navigation/manifest.json", vehicleRoute: `/epc/vehicles/${vehicle.familySlug}` },
    readiness: { automatedQa: "qa/qa.json", humanReview: "qa/visual-review.json", productionBlocker: "Source provenance must pass automated policy; visual review and catalog readiness remain pending. Raster surface treatment is not reconstructed 3D CGI." },
  };
  await writeEvidence(join(packRoot, "navigation", "epc-mapping.json"), { visualFamilyId: job.visualFamilyId, catalogReleaseId: vehicle.catalogReleaseId, catalogFamilyId: vehicle.catalogFamilyId, categories });
  await writeEvidence(join(packRoot, "navigation", "hero-to-epc-flow-pack.json"), flow);
  return flow;
}

export async function sealPack(packRoot: string) {
  const assets: Array<{ file: string; sha256: string; bytes: number }> = [];
  const walk = async (prefix = "") => {
    for (const entry of await readdir(join(packRoot, prefix), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("Pack cannot contain symbolic links");
      const file = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(file);
      else if (file !== "asset-manifest.json") {
        const bytes = await readFile(join(packRoot, file)); assets.push({ file, sha256: digest(bytes), bytes: bytes.length });
      }
    }
  };
  await walk(); assets.sort((a, b) => a.file.localeCompare(b.file));
  const manifest = { engineVersion: SCENE_ENGINE_VERSION, encoder: sharp.versions, contentHash: digest(stableStringify(assets)), assets };
  await writeEvidence(join(packRoot, "asset-manifest.json"), manifest);
  return manifest;
}
