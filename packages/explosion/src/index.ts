import type { ExplosionGroup, VisualCategoryId } from '../../contracts/src/index.js';
import { MOTION_PROFILES, categoryMotion } from '../../contracts/src/index.js';
import { renderSvg } from '../../image-processing/src/index.js';
import { vehicleSceneSvg } from '../../technical-render/src/index.js';

/**
 * Blueprint 4.3 minimum explosion-plan record.
 *
 * Each group names the layer asset it moves and the progress window over which
 * it travels from its assembled position to its explosion position. The body
 * shell lifts first and the fine assemblies follow, so a customer can follow
 * each group visually rather than seeing everything separate at once.
 *
 * v2.2 is explicit that cropping pieces out of an already-exploded still and
 * sliding those crops into view is not an acceptable production method. These
 * records describe per-group layers; a renderer that cannot honour them is not
 * compliant regardless of how the result looks in a single frame.
 */
const plans: Record<VisualCategoryId, Omit<ExplosionGroup, 'visualCategoryId' | 'startProgress' | 'endProgress'>> = {
  'VC-BODY': {
    layerAssetId: 'LAYER-BODY-SHELL',
    origin: { x: 0.5, y: 0.5 },
    destination: { x: 0.5, y: 0.34 },
    explosionVector: { x: 0, y: -0.16 },
    depth: 6,
    labelAnchor: { x: 0.5, y: 0.21 },
    order: 2,
    easing: 'shell-lift',
  },
  'VC-ENG': {
    layerAssetId: 'LAYER-ENGINE',
    origin: { x: 0.62, y: 0.55 },
    destination: { x: 0.78, y: 0.35 },
    explosionVector: { x: 0.16, y: -0.2 },
    depth: 5,
    labelAnchor: { x: 0.82, y: 0.29 },
    order: 3,
    easing: 'mechanical-out',
  },
  'VC-TRN': {
    layerAssetId: 'LAYER-TRANSMISSION',
    origin: { x: 0.5, y: 0.62 },
    destination: { x: 0.52, y: 0.8 },
    explosionVector: { x: 0.02, y: 0.18 },
    depth: 3,
    labelAnchor: { x: 0.54, y: 0.84 },
    order: 4,
    easing: 'mechanical-out',
  },
  'VC-FBRK': {
    layerAssetId: 'LAYER-BRAKE-FRONT',
    origin: { x: 0.72, y: 0.67 },
    destination: { x: 0.88, y: 0.7 },
    explosionVector: { x: 0.16, y: 0.03 },
    depth: 4,
    labelAnchor: { x: 0.89, y: 0.64 },
    order: 5,
    easing: 'radial-out',
  },
  'VC-RBRK': {
    layerAssetId: 'LAYER-BRAKE-REAR',
    origin: { x: 0.27, y: 0.67 },
    destination: { x: 0.12, y: 0.7 },
    explosionVector: { x: -0.15, y: 0.03 },
    depth: 4,
    labelAnchor: { x: 0.11, y: 0.64 },
    order: 5,
    easing: 'radial-out',
  },
  'VC-FSUS': {
    layerAssetId: 'LAYER-SUSPENSION-FRONT',
    origin: { x: 0.72, y: 0.61 },
    destination: { x: 0.82, y: 0.76 },
    explosionVector: { x: 0.1, y: 0.15 },
    depth: 2,
    labelAnchor: { x: 0.8, y: 0.84 },
    order: 6,
    easing: 'mechanical-out',
  },
  'VC-RSUS': {
    layerAssetId: 'LAYER-SUSPENSION-REAR',
    origin: { x: 0.27, y: 0.61 },
    destination: { x: 0.17, y: 0.76 },
    explosionVector: { x: -0.1, y: 0.15 },
    depth: 2,
    labelAnchor: { x: 0.18, y: 0.84 },
    order: 6,
    easing: 'mechanical-out',
  },
};

export function planExplosion(
  categories: VisualCategoryId[],
  motionProfile = 'premium-v1',
): ExplosionGroup[] {
  const config = MOTION_PROFILES[motionProfile as keyof typeof MOTION_PROFILES];
  if (!config) throw new Error(`Unknown motion profile: ${motionProfile}`);
  const selected = categories
    .map((visualCategoryId) => ({ visualCategoryId, ...plans[visualCategoryId] }))
    .sort((a, b) => a.order - b.order);

  // Stagger each group across the EXPLOSION segment by its order, with an
  // overlap so movement is continuous rather than a sequence of discrete steps
  // (4.3: "continuous interpolation with no frame jump").
  return selected.map((group) => {
    return { ...group, ...categoryMotion(group.visualCategoryId, motionProfile as keyof typeof MOTION_PROFILES) };
  });
}

export async function renderExplosion(outputPath: string, selected?: VisualCategoryId) {
  await renderSvg(vehicleSceneSvg({ progress: 1, mode: 'exploded', selected }), outputPath);
  return outputPath;
}
