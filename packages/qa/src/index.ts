import type { Hotspot } from "../../contracts/src/index.js";
import { validateHotspots } from "../../contracts/src/index.js";
import type { IdentityMetrics } from "../../identity-lock/src/index.js";

export const QA_THRESHOLDS = {
  minSilhouetteIoU: 0.95,
  maxWheelCentreDisplacement: 0.015,
  maxRooflineDisplacement: 0.015,
  maxLampDisplacement: 0.02,
  maxGlazingDisplacement: 0.02,
  maxBodyBoundingBoxChange: 0.02,
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

export function runAutomatedQa(
  metrics: IdentityMetrics,
  hotspots: Hotspot[],
  explodedViewPolicy: ExplodedViewPolicy,
) {
  const checks = {
    silhouette: metrics.silhouetteIoU >= QA_THRESHOLDS.minSilhouetteIoU,
    wheels: metrics.wheelCentreDisplacement <= QA_THRESHOLDS.maxWheelCentreDisplacement,
    roofline: metrics.rooflineDisplacement <= QA_THRESHOLDS.maxRooflineDisplacement,
    lamps: metrics.lampDisplacement <= QA_THRESHOLDS.maxLampDisplacement,
    glazing: metrics.glazingDisplacement <= QA_THRESHOLDS.maxGlazingDisplacement,
    boundingBox: metrics.bodyBoundingBoxChange <= QA_THRESHOLDS.maxBodyBoundingBoxChange,
    hotspots: validateHotspots(hotspots).length === 0,
    wheelMultiplicity: validateWheelMultiplicity(explodedViewPolicy),
  };
  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    metrics,
    thresholds: QA_THRESHOLDS,
    explodedViewPolicy,
    hotspotErrors: validateHotspots(hotspots),
    note: "Every road-wheel position must contain exactly one tyre. The structured audit blocks invalid packs; production imagery also requires human wheel-multiplicity approval.",
  };
}
