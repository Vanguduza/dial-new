import type { Hotspot, VisualCategoryId } from "../../contracts/src/index.js";
import { validateHotspots } from "../../contracts/src/index.js";
import type { IdentityMetrics, MetricValue } from "../../identity-lock/src/index.js";

export const QA_THRESHOLDS = {
  minSilhouetteIoU: 0.9,
  maxBoundingBoxChange: 0.04,
  maxCentroidDisplacement: 0.03,
  maxAspectRatioChange: 0.08,
  maxUpperProfileDeviation: 0.05,
  maxLowerProfileDeviation: 0.05,
  maxWheelCentreDisplacement: 0.015,
  maxRooflineDisplacement: 0.015,
  maxLampDisplacement: 0.02,
  maxGlazingDisplacement: 0.02,
};

export interface ExplodedViewPolicy {
  expectedWheelPositions: number;
  tyresPerPosition: Record<string, number>;
  looseSpareTyres: number;
}

export function validateWheelMultiplicity(policy: ExplodedViewPolicy) {
  const positions = Object.values(policy.tyresPerPosition);
  return (
    positions.length === policy.expectedWheelPositions &&
    positions.every((tyreCount) => tyreCount === 1) &&
    policy.looseSpareTyres === 0
  );
}

export interface StageIdentityResult {
  stage: string;
  asset: string;
  metrics: IdentityMetrics;
}

export type CheckOutcome = "PASS" | "FAIL" | "NOT_MEASURED";

function threshold(value: MetricValue, limit: number, mode: "min" | "max"): CheckOutcome {
  if (value === "NOT_MEASURED") return "NOT_MEASURED";
  return (mode === "min" ? value >= limit : value <= limit) ? "PASS" : "FAIL";
}

function evaluate(metrics: IdentityMetrics): Record<string, CheckOutcome> {
  return {
    silhouette: threshold(metrics.silhouetteIoU, QA_THRESHOLDS.minSilhouetteIoU, "min"),
    boundingBox: threshold(metrics.boundingBoxChange, QA_THRESHOLDS.maxBoundingBoxChange, "max"),
    centroid: threshold(metrics.centroidDisplacement, QA_THRESHOLDS.maxCentroidDisplacement, "max"),
    aspectRatio: threshold(metrics.aspectRatioChange, QA_THRESHOLDS.maxAspectRatioChange, "max"),
    upperProfile: threshold(
      metrics.upperProfileDeviation,
      QA_THRESHOLDS.maxUpperProfileDeviation,
      "max",
    ),
    lowerProfile: threshold(
      metrics.lowerProfileDeviation,
      QA_THRESHOLDS.maxLowerProfileDeviation,
      "max",
    ),
    wheelCentres: threshold(
      metrics.wheelCentreDisplacement,
      QA_THRESHOLDS.maxWheelCentreDisplacement,
      "max",
    ),
    roofline: threshold(
      metrics.rooflineDisplacement,
      QA_THRESHOLDS.maxRooflineDisplacement,
      "max",
    ),
    lamps: threshold(metrics.lampDisplacement, QA_THRESHOLDS.maxLampDisplacement, "max"),
    glazing: threshold(metrics.glazingDisplacement, QA_THRESHOLDS.maxGlazingDisplacement, "max"),
  };
}

export interface QaInput {
  stages: StageIdentityResult[];
  hotspots: Hotspot[];
  enabledCategories: VisualCategoryId[];
  explodedViewPolicy: ExplodedViewPolicy;
  /**
   * True when the generated states are expected to derive from the approved
   * source — that is, for any live provider or non-development job.
   *
   * The deterministic development adapter renders every state from a fixed
   * vector scene and never reads the source, so a development pack has no
   * identity relationship to its source to measure. Drift is still measured and
   * recorded; it is reported as WAIVED rather than silently passed, and the pack
   * is marked as not having proven identity fidelity.
   */
  identityFidelityRequired: boolean;
}

export function runAutomatedQa(input: QaInput) {
  const { stages, hotspots, enabledCategories, explodedViewPolicy, identityFidelityRequired } =
    input;

  if (stages.length === 0) {
    throw new Error("Automated QA requires at least one measured stage");
  }

  const identity = stages.map((stage) => ({
    stage: stage.stage,
    asset: stage.asset,
    checks: evaluate(stage.metrics),
    metrics: stage.metrics,
  }));

  const hotspotErrors = validateHotspots(hotspots);

  // Every enabled category needs a hit region, or a click has nowhere to route.
  const covered = new Set(hotspots.map((hotspot) => hotspot.visualCategoryId));
  const uncoveredCategories = enabledCategories.filter((category) => !covered.has(category));

  // Overlap is by design: the blueprint makes Body & Exterior the fallback
  // layer beneath specific category regions, and priority disambiguates. Routing
  // is only ambiguous when two overlapping regions share a priority, because
  // then the result depends on hit-test order.
  const ambiguousHotspots: string[] = [];
  for (let i = 0; i < hotspots.length; i++) {
    for (let j = i + 1; j < hotspots.length; j++) {
      if (
        hotspots[i].priority === hotspots[j].priority &&
        boundsOverlap(hotspots[i], hotspots[j])
      ) {
        ambiguousHotspots.push(
          `${hotspots[i].visualCategoryId} and ${hotspots[j].visualCategoryId} overlap at equal priority ${hotspots[i].priority}`,
        );
      }
    }
  }
  const duplicatePriorities = hotspots.length !== new Set(hotspots.map((h) => h.priority)).size;

  const wheelMultiplicity = validateWheelMultiplicity(explodedViewPolicy);

  const identityFailures = identity.flatMap((entry) =>
    Object.entries(entry.checks)
      .filter(([, outcome]) => outcome === "FAIL")
      .map(([check]) => `${entry.stage}: ${check}`),
  );

  const notMeasured = [
    ...new Set(
      identity.flatMap((entry) =>
        Object.entries(entry.checks)
          .filter(([, outcome]) => outcome === "NOT_MEASURED")
          .map(([check]) => check),
      ),
    ),
  ];

  const identityFidelityProven = identityFailures.length === 0;

  const checks = {
    identity: identityFidelityRequired ? identityFidelityProven : true,
    hotspots: hotspotErrors.length === 0,
    hotspotCoverage: uncoveredCategories.length === 0,
    hotspotRoutingDeterministic: ambiguousHotspots.length === 0 && !duplicatePriorities,
    wheelMultiplicity,
  };

  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    identity,
    identityFidelityRequired,
    identityFidelityProven,
    identityVerdict: identityFidelityRequired
      ? identityFidelityProven
        ? "PROVEN"
        : "FAILED"
      : "WAIVED_DEVELOPMENT_ADAPTER",
    identityFailures,
    hotspotErrors,
    uncoveredCategories,
    ambiguousHotspots,
    duplicatePriorities,
    explodedViewPolicy,
    thresholds: QA_THRESHOLDS,
    notMeasured,
    note:
      "Every road-wheel position must contain exactly one tyre. Identity drift is measured " +
      "against the lock derived from the normalized source. " +
      (identityFidelityRequired
        ? ""
        : "Identity fidelity is WAIVED for this pack: the deterministic development adapter " +
          "renders every state from a fixed vector scene and never reads the source, so there " +
          "is no source-to-state relationship to prove. The measured drift below is recorded " +
          "as evidence and blocks production approval. ") +
      (notMeasured.length > 0
        ? `${notMeasured.join(", ")} require a feature-detection provider and are reported ` +
          "NOT_MEASURED rather than passed; production approval must not treat them as green."
        : "All identity checks measured."),
  };
}

function boundsOverlap(a: Hotspot, b: Hotspot): boolean {
  const box = (hotspot: Hotspot) => {
    const xs = hotspot.polygon.map((point) => point.x);
    const ys = hotspot.polygon.map((point) => point.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  };
  const A = box(a);
  const B = box(b);
  const overlapX = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX);
  const overlapY = Math.min(A.maxY, B.maxY) - Math.max(A.minY, B.minY);
  if (overlapX <= 0 || overlapY <= 0) return false;
  // Tolerate a hairline shared edge; flag genuine area overlap.
  return overlapX * overlapY > 0.0005;
}
