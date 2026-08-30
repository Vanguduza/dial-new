import { z } from "zod";

export const VISUAL_CATEGORIES = {
  "VC-ENG": "Engine",
  "VC-TRN": "Transmission",
  "VC-FBRK": "Front Brakes",
  "VC-RBRK": "Rear Brakes",
  "VC-FSUS": "Front Suspension",
  "VC-RSUS": "Rear Suspension",
  "VC-BODY": "Body & Exterior",
} as const;

export type VisualCategoryId = keyof typeof VISUAL_CATEGORIES;

export const catalogReadinessSchema = z.enum([
  "BROWSE_READY",
  "SEARCH_READY",
  "DIAGRAM_READY",
  "HOTSPOT_READY",
  "FITMENT_READY",
  "SELL_READY",
]);

export const epcRouteTargetSchema = z.object({
  sectionSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  groupId: z.string().min(1).nullable(),
  groupSlug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .nullable(),
  defaultDiagramId: z
    .string()
    .regex(/^DGM-[A-Z0-9-]+$/)
    .nullable(),
  fallbackQuery: z.string().min(1).nullable(),
  selectionMode: z.enum(["SECTION", "GROUP", "DIAGRAM", "SEARCH"]),
  minimumReadiness: catalogReadinessSchema,
});

export const catalogVehicleContextSchema = z.object({
  makerSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  catalogFamilyId: z.string().regex(/^CF-[A-Z0-9-]+$/),
  familySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  variantId: z
    .string()
    .regex(/^CV-[A-Z0-9-]+$/)
    .nullable(),
  variantSlug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .nullable(),
  chassisCodes: z.array(z.string().min(1)),
  engineCodes: z.array(z.string().min(1)),
  market: z.string().min(1).nullable(),
  attributes: z.record(z.string(), z.string()),
});

export const epcCategoryBindingSchema = z.object({
  visualCategoryId: z.enum(
    Object.keys(VISUAL_CATEGORIES) as [VisualCategoryId, ...VisualCategoryId[]],
  ),
  componentFamilyId: z.string().regex(/^VCF-[A-Z0-9-]+$/),
  label: z.string().min(1),
  target: epcRouteTargetSchema,
});

export const componentFamilyRouteSchema = z.object({
  componentFamilyId: z.string().regex(/^VCF-[A-Z0-9-]+$/),
  visualCategoryId: z.enum(
    Object.keys(VISUAL_CATEGORIES) as [VisualCategoryId, ...VisualCategoryId[]],
  ),
  label: z.string().min(1),
  aliases: z.array(z.string().min(1)).min(1),
  target: epcRouteTargetSchema,
});

export const visualEpcMappingSchema = z.object({
  schemaVersion: z.literal("2.0.0"),
  mappingId: z.string().regex(/^VEM-[A-Z0-9-]+$/),
  catalogReleaseId: z.string().regex(/^CAT-[A-Z0-9-]+$/),
  fitmentId: z.string().min(1),
  visualFamilyId: z.string().regex(/^VF-[A-Z0-9-]+$/),
  vehicleContext: catalogVehicleContextSchema,
  categories: z.array(epcCategoryBindingSchema).min(1),
  componentFamilies: z.array(componentFamilyRouteSchema),
  provenance: z.object({
    authority: z.literal("CATALOG"),
    source: z.string().min(1),
    sourceVersion: z.string().min(1),
    confidence: z.number().min(0).max(1),
    reviewedAt: z.string().min(1).nullable(),
  }),
});

export type CatalogReadiness = z.infer<typeof catalogReadinessSchema>;
export type EpcRouteTarget = z.infer<typeof epcRouteTargetSchema>;
export type CatalogVehicleContext = z.infer<typeof catalogVehicleContextSchema>;
export type VisualEpcMapping = z.infer<typeof visualEpcMappingSchema>;

export const PIPELINE_STAGES = [
  "01_SOURCE_VALIDATE",
  "02_NORMALIZE",
  "03_IDENTITY_LOCK",
  "04_SEGMENT",
  "05_DEPTH_ESTIMATE",
  "06_DEPTH_ACTIVATE",
  "07_CGI_GENERATE",
  "08_TECHNICAL_GENERATE",
  "09_LINEART_GENERATE",
  "10_EXPLOSION_PLAN",
  "11_EXPLOSION_RENDER",
  "12_ANIMATE",
  "13_FRAME_ENCODE",
  "14_HOTSPOTS",
  "15_QA",
  "16_PACKAGE",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type StageStatus = "PENDING" | "RUNNING" | "PASS" | "FAIL" | "SKIPPED";

export const sourceProvenanceSchema = z.object({
  assetId: z.string().min(1),
  sourceUrl: z.string().min(1),
  author: z.string().min(1),
  licence: z.string().min(1),
  licenceUrl: z.string().min(1),
  attribution: z.string().min(1),
  downloadedAt: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  commercialUseApproved: z.boolean(),
  authorizedOverride: z
    .object({ reviewer: z.string(), reason: z.string(), timestamp: z.string() })
    .optional(),
});

export const visualGenerationJobSchema = z.object({
  visualFamilyId: z.string().regex(/^VF-[A-Z0-9-]+$/),
  make: z.string().min(1),
  model: z.string().min(1),
  generation: z.string().min(1),
  bodyStyle: z.string().min(1),
  visualPhase: z.string().min(1),
  yearFrom: z.number().int().min(1900).max(2200),
  yearTo: z.number().int().min(1900).max(2200).nullable(),
  references: z.object({
    frontThreeQuarter: z.string().min(1),
    front: z.string().optional(),
    side: z.string().optional(),
    rearThreeQuarter: z.string().optional(),
    rear: z.string().optional(),
  }),
  provenance: z.record(z.string(), sourceProvenanceSchema),
  enabledCategories: z
    .array(z.enum(Object.keys(VISUAL_CATEGORIES) as [VisualCategoryId, ...VisualCategoryId[]]))
    .min(1),
  fitmentMapping: visualEpcMappingSchema,
  explodedViewPolicy: z.object({
    expectedWheelPositions: z.number().int().min(2).max(12),
    tyresPerPosition: z.record(z.string().min(1), z.number().int().min(0).max(2)),
    looseSpareTyres: z.number().int().min(0).default(0),
  }),
  developmentMode: z.boolean().default(false),
  outputRoot: z.string().default("artifacts"),
  previewPublishRoot: z.string().optional(),
  motionProfile: z.string().default("premium-v1"),
  generationProvider: z
    .enum(["deterministic-development", "live"])
    .default("deterministic-development"),
});

export type VisualGenerationJob = z.infer<typeof visualGenerationJobSchema>;
export type SourceProvenance = z.infer<typeof sourceProvenanceSchema>;

export interface StageRecord {
  stage: PipelineStage;
  status: StageStatus;
  stageVersion: string;
  inputHash: string;
  configHash: string;
  outputHash?: string;
  startedAt?: string;
  endedAt?: string;
  logs: string[];
  failureReason?: string;
}

export interface Point {
  x: number;
  y: number;
}
/**
 * Blueprint 5.1 fixes the precedence of overlapping hit regions: precise Engine
 * and Transmission regions sit above broad Chassis and Body coverage, and a
 * broad region must never capture a point visibly occupied by the engine or
 * transmission. Higher number wins.
 */
export const HIT_REGION_PRIORITY: Record<VisualCategoryId, number> = {
  "VC-ENG": 90,
  "VC-TRN": 80,
  "VC-FBRK": 60,
  "VC-RBRK": 60,
  "VC-FSUS": 50,
  "VC-RSUS": 50,
  // Body & Exterior is the fallback layer beneath everything else (5.2).
  "VC-BODY": 10,
};

/** Categories that must never be overridden by a broad fallback region. */
export const PRECISE_CATEGORIES: readonly VisualCategoryId[] = ["VC-ENG", "VC-TRN"];
/** Broad coverage regions that may sit beneath a precise one. */
export const BROAD_CATEGORIES: readonly VisualCategoryId[] = ["VC-BODY", "VC-FBRK", "VC-RBRK"];

export interface Hotspot {
  /** Stable identity for the region, per Blueprint 5.3. */
  hitRegionId: string;
  visualCategoryId: VisualCategoryId;
  /** Optional finer component target; the category family is the guaranteed landing. */
  componentFamilyId: string | null;
  label: string;
  geometryType: "POLYGON";
  polygon: Point[];
  labelAnchor: Point;
  /** From HIT_REGION_PRIORITY. Higher wins where forgiving edges overlap. */
  priority: number;
  target: {
    catalogFamilyId: string;
    sectionSlug: string;
  };
  /** Safe vehicle-scoped fallback, normally body-exterior. */
  fallbackSectionSlug: string;
}

/**
 * Blueprint 4.3 minimum explosion-plan record.
 *
 * layerAssetId, startProgress and endProgress are required: the motion engine
 * must produce component or group LAYERS interpolated from their assembled
 * transform to their explosion transform. v2.2 states outright that "cropping
 * pieces from an already-exploded still and sliding those crops into view is
 * not an acceptable production method", so a plan without a layer asset per
 * group cannot describe a compliant transition.
 */
export interface ExplosionGroup {
  visualCategoryId: VisualCategoryId;
  /** The separately rendered layer or named mesh this group moves. */
  layerAssetId: string;
  origin: Point;
  destination: Point;
  explosionVector: Point;
  depth: number;
  labelAnchor: Point;
  order: number;
  /** Normalized transition progress at which this group starts moving. */
  startProgress: number;
  /** Normalized transition progress at which it settles. */
  endProgress: number;
  /**
   * Named easing curve. The key is `easing`, not `easingProfile`, because the
   * Blueprint's minimum explosion-plan record spells it that way and that
   * record is frozen — a consumer reading the Blueprint would find the key
   * absent if we renamed it here.
   */
  easing: string;
}

/**
 * Blueprint 4.3 and 9: at most one tyre per physical wheel position, and no
 * attached tyre shown alongside a separated duplicate for the same position.
 * The flow pack must declare this audit and its human-review state before the
 * catalog may mark the combined flow customer-ready.
 */
export interface WheelPositionAudit {
  expectedWheelPositions: number;
  tyresPerPosition: Record<string, number>;
  looseSpareTyres: number;
  /** Automated metadata validation result. */
  automatedPass: boolean;
  /** Blueprint 10: QA_READY also requires human visual review of multiplicity. */
  humanVisualReview: "PENDING" | "PASS" | "FAIL";
}

/**
 * Blueprint 4.5 completion memory. Returning to the homepage with an unchanged
 * vehicle restores the settled exploded view instead of replaying.
 */
export function completedFlowFingerprint(input: {
  catalogReleaseId: string;
  fitmentId: string;
  visualFamilyId: string;
  flowPackId: string;
  variantId: string | null;
}): string {
  // Identity-bearing values only. Labels are explicitly not sufficient.
  return [
    input.catalogReleaseId,
    input.fitmentId,
    input.visualFamilyId,
    input.flowPackId,
    input.variantId ?? "NULL",
  ].join("|");
}

export const MOTION_PROFILES = {
  "premium-v1": {
    version: "2.0.0",
    desktopFrames: 96,
    mobileFrames: 48,
    segments: {
      HERO: [0, 0.18],
      CGI: [0.18, 0.42],
      LINE_ART: [0.42, 0.6],
      EXPLOSION: [0.6, 0.86],
      SETTLE: [0.86, 0.94],
      NAVIGATION: [0.94, 1],
    },
  },
  "test-v1": {
    version: "2.0.0-test",
    desktopFrames: 4,
    mobileFrames: 2,
    segments: {
      HERO: [0, 0.18],
      CGI: [0.18, 0.42],
      LINE_ART: [0.42, 0.6],
      EXPLOSION: [0.6, 0.86],
      SETTLE: [0.86, 0.94],
      NAVIGATION: [0.94, 1],
    },
  },
} as const;

export function parseJob(input: unknown): VisualGenerationJob {
  const job = visualGenerationJobSchema.parse(input);
  if (job.fitmentMapping.visualFamilyId !== job.visualFamilyId) {
    throw new Error("fitmentMapping.visualFamilyId must match visualFamilyId");
  }
  const enabled = new Set(job.enabledCategories);
  const mapped = new Set<VisualCategoryId>();
  for (const mapping of job.fitmentMapping.categories) {
    if (!enabled.has(mapping.visualCategoryId))
      throw new Error(`EPC mapping ${mapping.visualCategoryId} is not enabled`);
    if (mapped.has(mapping.visualCategoryId))
      throw new Error(`Duplicate EPC mapping for ${mapping.visualCategoryId}`);
    mapped.add(mapping.visualCategoryId);
  }
  for (const category of enabled) {
    if (!mapped.has(category)) throw new Error(`Enabled category ${category} has no EPC mapping`);
  }
  const componentIds = new Set<string>();
  for (const component of job.fitmentMapping.componentFamilies) {
    if (!enabled.has(component.visualCategoryId))
      throw new Error(
        `Component family ${component.componentFamilyId} references disabled category ${component.visualCategoryId}`,
      );
    if (componentIds.has(component.componentFamilyId))
      throw new Error(`Duplicate component family ${component.componentFamilyId}`);
    componentIds.add(component.componentFamilyId);
  }
  return job;
}

export function polygonArea(points: Point[]): number {
  return Math.abs(
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2,
  );
}

function orientation(a: Point, b: Point, c: Point) {
  return Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y));
}

function intersects(a: Point, b: Point, c: Point, d: Point) {
  return (
    orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b)
  );
}

export function validateHotspots(hotspots: Hotspot[]): string[] {
  const errors: string[] = [];
  for (const hotspot of hotspots) {
    if (hotspot.polygon.length < 3)
      errors.push(`${hotspot.visualCategoryId}: polygon needs at least 3 points`);
    if (hotspot.polygon.some((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1))
      errors.push(`${hotspot.visualCategoryId}: point out of bounds`);
    if (polygonArea(hotspot.polygon) < 0.001)
      errors.push(`${hotspot.visualCategoryId}: polygon area is too small`);
    for (let i = 0; i < hotspot.polygon.length; i++) {
      for (let j = i + 2; j < hotspot.polygon.length; j++) {
        if (i === 0 && j === hotspot.polygon.length - 1) continue;
        const a = hotspot.polygon[i],
          b = hotspot.polygon[(i + 1) % hotspot.polygon.length];
        const c = hotspot.polygon[j],
          d = hotspot.polygon[(j + 1) % hotspot.polygon.length];
        if (intersects(a, b, c, d))
          errors.push(`${hotspot.visualCategoryId}: polygon self-intersects`);
      }
    }
  }
  return errors;
}
