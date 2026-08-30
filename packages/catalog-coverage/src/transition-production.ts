import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { isAcceptedOpenLicense, VISUAL_CATEGORY_ROUTE_TEMPLATES } from "./visual-source.js";

const assetSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
});
const reviewSchema = z.object({
  status: z.enum(["PENDING", "PASS", "FAIL"]),
  notes: z.string().min(1),
});
const pointSchema = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
const sectionSchema = z.enum(["engine", "transmission-drivetrain", "chassis-systems", "body-exterior"]);
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

// Receipts are evidence of generated media, NOT jobs or assertions of completion.
// This is deliberately independent of catalog IDs: media can be ready before injection.
export const transitionReceiptSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  vehicleKey: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
  visualFamilyId: z.string().regex(/^VF-[A-Z0-9-]+$/),
  plannedFlowPackId: z.string().regex(/^H2E-[A-Z0-9-]+$/),
  appearanceScope: z.object({ generation: z.string().min(1), bodyStyle: z.string().min(1), notes: z.string().min(1) }),
  source: assetSchema.extend({
    provider: z.literal("WIKIMEDIA_COMMONS"),
    sourceLandingPage: z.url(),
    originalUrl: z.url(),
    creator: z.string().min(1),
    license: z.string().min(1),
    licenseUrl: z.url().nullable(),
  }),
  generation: z.object({ mode: z.literal("BUILT_IN_IMAGEGEN"), promptsPath: z.string().min(1) }),
  assets: z.object({
    studioCgi: assetSchema.optional(),
    lineArt: assetSchema.optional(),
    exploded: assetSchema.optional(),
  }),
  hitMap: z.object({
    coordinateSystem: z.literal("NORMALIZED_TO_EXPLODED_ASSET"),
    visible: z.literal(false),
    regions: z.array(z.object({
      id: z.string().min(1),
      sectionSlug: sectionSchema,
      priority: z.number().int().min(0),
      polygon: z.array(pointSchema).min(3),
    })),
  }),
  // A real continuous render and its source scene are required. Stills alone never pass.
  motion: z.object({
    origin: z.literal("PART_BASED_SCENE"),
    scene: assetSchema,
    fps: z.number().int().min(24).max(60),
    frames: z.array(assetSchema).min(24),
  }).nullable(),
  reviews: z.object({
    identity: reviewSchema,
    componentGeometry: reviewSchema,
    wheelMultiplicity: reviewSchema,
    continuousMotion: reviewSchema,
    hitMap: reviewSchema,
  }),
  catalogBinding: z.object({
    familySlug: slugSchema,
    fitmentId: z.string().min(1),
    catalogReleaseId: z.string().min(1),
    verified: z.boolean(),
  }).nullable(),
});

export type TransitionReceipt = z.infer<typeof transitionReceiptSchema>;
export type SectionSlug = z.infer<typeof sectionSchema>;
export interface QueueIdentity { vehicleKey: string; visualFamilyId: string; plannedFlowPackId: string }

function within(root: string, target: string) {
  const path = relative(root, target);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function assetPath(workspace: string, visualFamilyId: string, path: string) {
  // Reject foreign-family paths, URLs, traversal and symlink/junction escapes.
  const prefix = `output/vehicle-transitions/${visualFamilyId}/`;
  if (!path.startsWith(prefix) || path.includes("\\") || path.split("/").includes("..")) {
    throw new Error("Asset must belong to this vehicle's workspace output directory");
  }
  const root = await realpath(resolve(workspace, prefix));
  const outputRoot = await realpath(resolve(workspace, "output/vehicle-transitions"));
  const workspaceRoot = await realpath(workspace);
  const target = await realpath(resolve(workspace, path));
  if (!within(workspaceRoot, outputRoot) || !within(outputRoot, root) || !within(root, target)) throw new Error("Asset escapes its vehicle directory");
  return target;
}

export async function verifyTransitionAsset(
  workspace: string, visualFamilyId: string, asset: z.infer<typeof assetSchema>, image = true,
) {
  try {
    const path = await assetPath(workspace, visualFamilyId, asset.path);
    const bytes = await readFile(path);
    if (!bytes.length) throw new Error("Asset is empty");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== asset.sha256.toLowerCase()) throw new Error("Asset checksum does not match receipt");
    if (image) {
      const metadata = await sharp(bytes).metadata();
      if (!["jpeg", "png", "webp", "avif", "heif"].includes(metadata.format ?? "")) throw new Error("Not a raster asset");
      if (!metadata.width || !metadata.height || metadata.width < 640 || metadata.height < 360) throw new Error("Image resolution is too small");
      return { valid: true, path: asset.path, sha256, width: metadata.width, height: metadata.height, error: null };
    }
    return { valid: true, path: asset.path, sha256, error: null };
  } catch (error) {
    return { valid: false, path: asset.path, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function inspectTransitionReceipt(workspace: string, expected: QueueIdentity, input: unknown) {
  const receipt = transitionReceiptSchema.parse(input);
  for (const key of ["vehicleKey", "visualFamilyId", "plannedFlowPackId"] as const) {
    if (receipt[key] !== expected[key]) throw new Error(`Receipt ${key} does not match queue identity`);
  }
  const assets = {
    hero: await verifyTransitionAsset(workspace, receipt.visualFamilyId, receipt.source),
    studioCgi: receipt.assets.studioCgi ? await verifyTransitionAsset(workspace, receipt.visualFamilyId, receipt.assets.studioCgi) : null,
    lineArt: receipt.assets.lineArt ? await verifyTransitionAsset(workspace, receipt.visualFamilyId, receipt.assets.lineArt) : null,
    exploded: receipt.assets.exploded ? await verifyTransitionAsset(workspace, receipt.visualFamilyId, receipt.assets.exploded) : null,
  };
  const blockers: string[] = [];
  // Legacy independent-state receipts are inventories, not proof that these
  // images derive from the same scene. Manual PASS flags cannot waive this.
  blockers.push("SHARED_SCENE_ENGINE_EVIDENCE_REQUIRED");
  if (!isAcceptedOpenLicense(receipt.source.license)) blockers.push("SOURCE_LICENSE_NOT_ALLOWLISTED");
  if (!receipt.source.licenseUrl && !/^(public domain|pdm|cc0)/i.test(receipt.source.license)) blockers.push("ATTRIBUTION_LICENSE_URL_MISSING");
  for (const [name, asset] of Object.entries(assets)) {
    if (!asset) blockers.push(`${name.toUpperCase()}_MISSING`);
    else if (!asset.valid) blockers.push(`${name.toUpperCase()}_INVALID: ${asset.error}`);
  }
  const derived = [assets.studioCgi, assets.lineArt, assets.exploded].filter((asset) => asset?.valid);
  if (new Set(derived.map((asset) => asset?.sha256)).size !== derived.length) blockers.push("DUPLICATE_STAGE_IMAGE");
  for (const [name, review] of Object.entries(receipt.reviews)) {
    if (review.status !== "PASS") blockers.push(`REVIEW_${name.toUpperCase()}_${review.status}`);
  }
  const sections = new Set(receipt.hitMap.regions.map((region) => region.sectionSlug));
  if (VISUAL_CATEGORY_ROUTE_TEMPLATES.some((target) => !sections.has(target.sectionSlug))) blockers.push("CATEGORY_COVERAGE_INCOMPLETE");
  if (new Set(receipt.hitMap.regions.map((region) => region.id)).size !== receipt.hitMap.regions.length) blockers.push("DUPLICATE_HIT_REGION_ID");
  if (!receipt.motion) blockers.push("CONTINUOUS_PART_BASED_RENDER_MISSING");
  else {
    const scene = await verifyTransitionAsset(workspace, receipt.visualFamilyId, receipt.motion.scene, false);
    if (!scene.valid) blockers.push(`SCENE_INVALID: ${scene.error}`);
    const frames = await Promise.all(receipt.motion.frames.map((frame) => verifyTransitionAsset(workspace, receipt.visualFamilyId, frame)));
    if (frames.some((frame) => !frame.valid)) blockers.push("MOTION_FRAME_INVALID");
    if (new Set(receipt.motion.frames.map((frame) => frame.sha256.toLowerCase())).size < 24) blockers.push("MOTION_HAS_TOO_FEW_DISTINCT_FRAMES");
    if (new Set(frames.map((frame) => `${frame.width}x${frame.height}`)).size !== 1) blockers.push("MOTION_FRAME_DIMENSIONS_MISMATCH");
  }
  const transitionReady = blockers.length === 0;
  const customerReady = transitionReady && receipt.catalogBinding?.verified === true;
  return {
    ...expected,
    status: Object.values(receipt.reviews).some((review) => review.status === "FAIL") ? "REJECTED" : customerReady ? "CUSTOMER_READY" : transitionReady ? "READY_FOR_CATALOG_INJECTION" : "DRAFT_ASSETS",
    appearanceScope: receipt.appearanceScope,
    assets,
    assetStagesPresent: Object.values(assets).filter((asset) => asset?.valid).length,
    transitionReady,
    customerReady,
    blockers,
    catalogStatus: receipt.catalogBinding?.verified ? "BOUND" : "AWAITING_EXACT_FITMENT_BINDING",
  };
}

export function sectionAtPoint(receipt: TransitionReceipt, x: number, y: number): SectionSlug | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  for (const region of [...receipt.hitMap.regions].sort((a, b) => b.priority - a.priority)) {
    let inside = false;
    const points = region.polygon;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      // Include boundary points in the generously sized invisible regions.
      const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
      if (Math.abs(cross) < 1e-9 && x >= Math.min(xi, xj) && x <= Math.max(xi, xj) && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) return region.sectionSlug;
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return region.sectionSlug;
  }
  return null;
}

export function boundSectionHref(receipt: TransitionReceipt, section: SectionSlug): string | null {
  if (!sectionSchema.safeParse(section).success || !receipt.catalogBinding?.verified) return null;
  const query = new URLSearchParams({ fitment: receipt.catalogBinding.fitmentId });
  return `/epc/vehicles/${encodeURIComponent(receipt.catalogBinding.familySlug)}/sections/${section}?${query}`;
}
