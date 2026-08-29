import { VISUAL_CATEGORIES, type Hotspot, type VisualCategoryId, validateHotspots } from '../../contracts/src/index.js';

const shapes: Record<VisualCategoryId, number[][]> = {
  'VC-ENG': [[.60,.34],[.79,.27],[.84,.42],[.67,.53]],
  'VC-TRN': [[.43,.68],[.62,.69],[.64,.84],[.44,.83]],
  'VC-FBRK': [[.80,.62],[.92,.62],[.93,.78],[.80,.79]],
  'VC-RBRK': [[.07,.62],[.20,.62],[.20,.79],[.07,.78]],
  'VC-FSUS': [[.74,.72],[.86,.72],[.86,.88],[.73,.87]],
  'VC-RSUS': [[.14,.72],[.26,.72],[.27,.87],[.14,.88]],
  'VC-BODY': [[.24,.18],[.75,.18],[.78,.54],[.22,.54]],
};

export function buildHotspots(categories: VisualCategoryId[]): Hotspot[] {
  const hotspots = categories.map((visualCategoryId, priority) => {
    const polygon = shapes[visualCategoryId].map(([x,y]) => ({x,y}));
    const labelAnchor = polygon.reduce((a,p) => ({x:a.x+p.x/polygon.length,y:a.y+p.y/polygon.length}), {x:0,y:0});
    return { visualCategoryId, label: VISUAL_CATEGORIES[visualCategoryId], polygon, labelAnchor, priority };
  });
  const errors = validateHotspots(hotspots);
  if (errors.length) throw new Error(`Hotspot validation failed: ${errors.join('; ')}`);
  return hotspots;
}
