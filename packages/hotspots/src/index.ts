import {
  HIT_REGION_PRIORITY,
  VISUAL_CATEGORIES,
  validateHotspots,
  type Hotspot,
  type VisualCategoryId,
  type VisualEpcMapping,
} from '../../contracts/src/index.js';

/**
 * Normalized hit-region geometry.
 *
 * Catalog Agent §8 divides ownership: "The visual engine owns normalized
 * hit-region geometry and motion layers. The catalog owns the category-family
 * targets those regions resolve to." So the shapes live here and the targets
 * are injected from the VisualEpcMapping — never authored twice.
 */
const shapes: Record<VisualCategoryId, number[][]> = {
  'VC-ENG': [[0.6, 0.34], [0.79, 0.27], [0.84, 0.42], [0.67, 0.53]],
  'VC-TRN': [[0.43, 0.68], [0.62, 0.69], [0.64, 0.84], [0.44, 0.83]],
  'VC-FBRK': [[0.8, 0.62], [0.92, 0.62], [0.93, 0.78], [0.8, 0.79]],
  'VC-RBRK': [[0.07, 0.62], [0.2, 0.62], [0.2, 0.79], [0.07, 0.78]],
  'VC-FSUS': [[0.74, 0.72], [0.86, 0.72], [0.86, 0.88], [0.73, 0.87]],
  'VC-RSUS': [[0.14, 0.72], [0.26, 0.72], [0.27, 0.87], [0.14, 0.88]],
  'VC-BODY': [[0.24, 0.18], [0.75, 0.18], [0.78, 0.54], [0.22, 0.54]],
};

const FALLBACK_SECTION = 'body-exterior';

/**
 * Builds the invisible click map for the enabled categories.
 *
 * Every region carries its own stable id, its catalog target and a safe
 * fallback, per Blueprint §5.3. Priority comes from HIT_REGION_PRIORITY so that
 * precise Engine and Transmission regions always sit above broad Chassis and
 * Body coverage (§5.1) — a broad region may never capture a point visibly
 * occupied by the engine or transmission.
 */
export function buildHotspots(
  categories: VisualCategoryId[],
  mapping: VisualEpcMapping,
): Hotspot[] {
  const byCategory = new Map(mapping.categories.map((binding) => [binding.visualCategoryId, binding]));
  const { catalogFamilyId } = mapping.vehicleContext;

  const hotspots: Hotspot[] = categories.map((visualCategoryId) => {
    const binding = byCategory.get(visualCategoryId);
    if (!binding) {
      throw new Error(
        `Enabled category ${visualCategoryId} has no EPC mapping; a hit region cannot be given a target`,
      );
    }
    const polygon = shapes[visualCategoryId].map(([x, y]) => ({ x, y }));
    const labelAnchor = polygon.reduce(
      (accumulator, point) => ({
        x: accumulator.x + point.x / polygon.length,
        y: accumulator.y + point.y / polygon.length,
      }),
      { x: 0, y: 0 },
    );

    return {
      hitRegionId: `HR-${mapping.visualFamilyId.replace(/^VF-/, '')}-${visualCategoryId}`,
      visualCategoryId,
      componentFamilyId: binding.componentFamilyId ?? null,
      label: VISUAL_CATEGORIES[visualCategoryId],
      geometryType: 'POLYGON' as const,
      polygon,
      labelAnchor,
      priority: HIT_REGION_PRIORITY[visualCategoryId],
      target: {
        catalogFamilyId,
        sectionSlug: binding.target.sectionSlug,
      },
      fallbackSectionSlug: FALLBACK_SECTION,
    };
  });

  const errors = validateHotspots(hotspots);
  if (errors.length) throw new Error(`Hotspot validation failed: ${errors.join('; ')}`);

  // §5.1: a broad region must never sit above a precise one where they overlap.
  // Priorities are assigned from a fixed table, so a violation here means the
  // table was edited without re-reading the Blueprint.
  for (const hotspot of hotspots) {
    for (const other of hotspots) {
      if (hotspot === other) continue;
      const precise = HIT_REGION_PRIORITY[hotspot.visualCategoryId];
      const broad = HIT_REGION_PRIORITY[other.visualCategoryId];
      if (
        (hotspot.visualCategoryId === 'VC-ENG' || hotspot.visualCategoryId === 'VC-TRN') &&
        other.visualCategoryId === 'VC-BODY' &&
        precise <= broad
      ) {
        throw new Error(
          `Hit-region priority violates Blueprint 5.1: ${hotspot.visualCategoryId} (${precise}) must sit above ${other.visualCategoryId} (${broad})`,
        );
      }
    }
  }

  return hotspots;
}
