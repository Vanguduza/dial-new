import type { Hotspot } from '../../contracts/src/index.js';
import { validateHotspots } from '../../contracts/src/index.js';
import type { IdentityMetrics } from '../../identity-lock/src/index.js';

export const QA_THRESHOLDS = { minSilhouetteIoU: .95, maxWheelCentreDisplacement: .015, maxRooflineDisplacement: .015, maxLampDisplacement: .02, maxGlazingDisplacement: .02, maxBodyBoundingBoxChange: .02 };

export function runAutomatedQa(metrics: IdentityMetrics, hotspots: Hotspot[]) {
  const checks = {
    silhouette: metrics.silhouetteIoU >= QA_THRESHOLDS.minSilhouetteIoU,
    wheels: metrics.wheelCentreDisplacement <= QA_THRESHOLDS.maxWheelCentreDisplacement,
    roofline: metrics.rooflineDisplacement <= QA_THRESHOLDS.maxRooflineDisplacement,
    lamps: metrics.lampDisplacement <= QA_THRESHOLDS.maxLampDisplacement,
    glazing: metrics.glazingDisplacement <= QA_THRESHOLDS.maxGlazingDisplacement,
    boundingBox: metrics.bodyBoundingBoxChange <= QA_THRESHOLDS.maxBodyBoundingBoxChange,
    hotspots: validateHotspots(hotspots).length === 0,
  };
  return { passed: Object.values(checks).every(Boolean), checks, metrics, thresholds: QA_THRESHOLDS, hotspotErrors: validateHotspots(hotspots), note: 'Development fixture metrics are exact because every state is derived from one locked vector geometry.' };
}
