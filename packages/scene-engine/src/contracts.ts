import { z } from "zod";
import { sourceProvenanceSchema, VISUAL_CATEGORIES, type VisualCategoryId } from "../../contracts/src/index.js";

export const SCENE_ENGINE_VERSION = "1.1.1";
export const SCENE_GATES = Object.freeze({
  minSourceSilhouetteIoU: 0.97,
  maxSourceColourError: 0.08,
  maxWheelResidualOverlap: 0.04,
  minExplodedScale: 0.25,
  minVisiblePartPixels: 24,
  maxMotionStep: 0.045,
  hitSlopPixels: 18,
  alphaThreshold: 24,
});

export const assetSchema = z.object({
  file: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const roleSchema = z.enum(["body-shell", "body-part", "engine", "transmission", "wheel", "brakes", "suspension"]);
export const categorySchema = z.enum(Object.keys(VISUAL_CATEGORIES) as [VisualCategoryId, ...VisualCategoryId[]]);
export type ComponentRole = z.infer<typeof roleSchema>;
export type Section = "body-exterior" | "engine" | "transmission-drivetrain" | "chassis-systems";
export const SECTION_BY_ROLE: Record<ComponentRole, Section> = {
  "body-shell": "body-exterior", "body-part": "body-exterior", engine: "engine",
  transmission: "transmission-drivetrain", wheel: "chassis-systems", brakes: "chassis-systems", suspension: "chassis-systems",
};

// No independently generated CGI/line-art/exploded image or per-stage camera is accepted.
// Every layer is a registered RGBA part on this ONE assembled canvas.
export const componentSceneSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  visualFamilyId: z.string().regex(/^VF-[A-Z0-9-]+$/),
  heroSha256: z.string().regex(/^[a-f0-9]{64}$/),
  canvas: z.object({ width: z.number().int().min(128).max(1920), height: z.number().int().min(72).max(1080) }).strict(),
  camera: z.literal("LOCKED_REGISTERED_HERO_CAMERA"),
  foregroundMask: assetSchema,
  expectedWheelPositions: z.array(z.string().min(1)).min(2).max(12),
  requiredSections: z.array(z.enum(["body-exterior", "engine", "transmission-drivetrain", "chassis-systems"])).min(1),
  components: z.array(z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    role: roleSchema,
    visualCategoryId: categorySchema.optional(),
    asset: assetSchema,
    depth: z.number().int().min(-100).max(100),
    wheelPosition: z.string().min(1).nullable(),
    evidence: z.enum(["HERO_VISIBLE_PIXELS", "VERIFIED_REFERENCE", "CATEGORY_ILLUSTRATION"]),
    reference: assetSchema.nullable(),
  }).strict()).min(3).max(32),
}).strict();
export type ComponentScene = z.infer<typeof componentSceneSchema>;
export type SceneComponent = ComponentScene["components"][number];

export function categoryOf(part: SceneComponent): VisualCategoryId {
  if (part.visualCategoryId) return part.visualCategoryId;
  if (part.role === "engine") return "VC-ENG";
  if (part.role === "transmission") return "VC-TRN";
  if (part.role === "body-shell" || part.role === "body-part") return "VC-BODY";
  // Legacy wheel positions are explicit physical positions, never inferred from camera X.
  if (part.role === "wheel" && part.wheelPosition?.startsWith("front")) return "VC-FBRK";
  if (part.role === "wheel" && part.wheelPosition?.startsWith("rear")) return "VC-RBRK";
  throw new Error(`Component ${part.id} needs an explicit visualCategoryId`);
}

export const catalogBindingSchema = z.object({
  catalogReleaseId: z.string().regex(/^CAT-[A-Z0-9-]+$/),
  catalogFamilyId: z.string().regex(/^CF-[A-Z0-9-]+$/),
  familySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  make: z.string().min(1), model: z.string().min(1), generation: z.string().min(1),
  bodyStyle: z.string().min(1), visualPhase: z.string().min(1),
  coverage: z.array(z.object({
    fitmentId: z.string().min(1), variantId: z.string().min(1).nullable(),
    variantSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    expectedWheelPositions: z.number().int().min(2).max(12),
  }).strict()).min(1),
  categories: z.array(z.object({
    visualCategoryId: categorySchema,
    sectionSlug: z.enum(["body-exterior", "engine", "transmission-drivetrain", "chassis-systems"]),
  }).strict()).min(1),
}).strict();

export const sceneJobSchema = z.object({
  sceneEngineVersion: z.enum(["1.0.0", "1.1.0", "1.1.1"]),
  visualFamilyId: z.string().regex(/^VF-[A-Z0-9-]+$/),
  hero: assetSchema,
  sceneFile: z.string().min(1).nullable(),
  outputRoot: z.string().min(1).default("guarded-artifacts"),
  frameCount: z.number().int().min(48).max(120).default(96),
  fps: z.number().int().min(24).max(60).default(30),
  catalog: catalogBindingSchema.optional(),
  provenance: z.record(z.string(), sourceProvenanceSchema).optional(),
}).strict();
export type SceneJob = z.infer<typeof sceneJobSchema>;

export interface GateCheck {
  gate: string;
  status: "PASS" | "FAIL" | "NOT_MEASURED";
  actual?: number | string;
  limit?: number;
  detail: string;
}
export interface GateReport {
  engineVersion: string;
  passed: boolean;
  checks: GateCheck[];
  productionPublishable: false;
}
export function report(checks: GateCheck[]): GateReport {
  return { engineVersion: SCENE_ENGINE_VERSION, passed: checks.length > 0 && checks.every((check) => check.status === "PASS"), checks, productionPublishable: false };
}
export class SceneGateError extends Error {
  constructor(readonly report: GateReport, readonly reportPath?: string) {
    super(report.checks.filter((check) => check.status !== "PASS").map((check) => `${check.gate}: ${check.detail}`).join("; "));
    this.name = "SceneGateError";
  }
}
