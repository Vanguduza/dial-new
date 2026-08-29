import type { ExplosionGroup, VisualCategoryId } from '../../contracts/src/index.js';
import { renderSvg } from '../../image-processing/src/index.js';
import { vehicleSceneSvg } from '../../technical-render/src/scene.js';

const plans: Record<VisualCategoryId, Omit<ExplosionGroup, 'visualCategoryId'>> = {
  'VC-ENG': { origin: {x:.62,y:.55}, destination:{x:.78,y:.35}, explosionVector:{x:.16,y:-.20}, depth:5, labelAnchor:{x:.82,y:.29}, order:3, easingProfile:'mechanical-out' },
  'VC-TRN': { origin:{x:.50,y:.62}, destination:{x:.52,y:.80}, explosionVector:{x:.02,y:.18}, depth:3, labelAnchor:{x:.54,y:.84}, order:4, easingProfile:'mechanical-out' },
  'VC-FBRK': { origin:{x:.72,y:.67}, destination:{x:.88,y:.70}, explosionVector:{x:.16,y:.03}, depth:4, labelAnchor:{x:.89,y:.64}, order:5, easingProfile:'radial-out' },
  'VC-RBRK': { origin:{x:.27,y:.67}, destination:{x:.12,y:.70}, explosionVector:{x:-.15,y:.03}, depth:4, labelAnchor:{x:.11,y:.64}, order:5, easingProfile:'radial-out' },
  'VC-FSUS': { origin:{x:.72,y:.61}, destination:{x:.82,y:.76}, explosionVector:{x:.10,y:.15}, depth:2, labelAnchor:{x:.80,y:.84}, order:6, easingProfile:'mechanical-out' },
  'VC-RSUS': { origin:{x:.27,y:.61}, destination:{x:.17,y:.76}, explosionVector:{x:-.10,y:.15}, depth:2, labelAnchor:{x:.18,y:.84}, order:6, easingProfile:'mechanical-out' },
  'VC-BODY': { origin:{x:.5,y:.5}, destination:{x:.5,y:.34}, explosionVector:{x:0,y:-.16}, depth:6, labelAnchor:{x:.50,y:.21}, order:2, easingProfile:'shell-lift' },
};

export function planExplosion(categories: VisualCategoryId[]): ExplosionGroup[] { return categories.map((visualCategoryId) => ({ visualCategoryId, ...plans[visualCategoryId] })).sort((a,b) => a.order-b.order); }
export async function renderExplosion(outputPath: string, selected?: VisualCategoryId) { await renderSvg(vehicleSceneSvg({ progress: 1, mode: 'exploded', selected }), outputPath); return outputPath; }
