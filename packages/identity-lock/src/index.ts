export const HILUX_DEVELOPMENT_IDENTITY_LOCK = {
  version: '1.0.0',
  coordinateSystem: 'normalized-0-1',
  vehicleBoundingBox: { x: 0.17, y: 0.33, width: 0.67, height: 0.37 },
  silhouette: [[.17,.63],[.22,.49],[.32,.45],[.41,.34],[.62,.34],[.69,.45],[.82,.52],[.84,.64]],
  wheelCentres: [{ x: .274, y: .674 }, { x: .725, y: .674 }],
  wheelbaseRatio: .451,
  roofline: [[.41,.34],[.62,.34]],
  lampLandmarks: [{ x: .78, y: .54 }, { x: .22, y: .55 }],
  glazingBoundaries: [[.40,.36],[.61,.36],[.68,.45],[.35,.45]],
  panelLines: [[.50,.35],[.50,.62],[.68,.45],[.71,.61]],
  doorCount: 4,
  cabBedBoundary: { x: .70, yFrom: .45, yTo: .63 },
  source: 'synthetic-development-fixture',
  productionApproval: false,
} as const;

export interface IdentityMetrics { silhouetteIoU: number; wheelCentreDisplacement: number; rooflineDisplacement: number; lampDisplacement: number; glazingDisplacement: number; bodyBoundingBoxChange: number }
export const DEVELOPMENT_IDENTITY_METRICS: IdentityMetrics = { silhouetteIoU: .99, wheelCentreDisplacement: 0, rooflineDisplacement: 0, lampDisplacement: 0, glazingDisplacement: 0, bodyBoundingBoxChange: 0 };
