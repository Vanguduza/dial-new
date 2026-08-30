/**
 * Hit-map geometry (§5.1, §5.4).
 *
 * Pure functions, deliberately free of React and of any catalogue import, so
 * the rule that keeps a broad Body region off the engine can be tested on its
 * own rather than inferred by reading the component's source for a sort call.
 *
 * A published hotspot is a polygon in normalised stage coordinates. Turning it
 * into something clickable has two requirements that are easy to get wrong:
 *
 *   1. The element's box must be the polygon's own bounding box. Full-bleed
 *      overlays distinguished only by clip-path all share one box, so every
 *      region reports the same centre and the same bounds. A pointer test can
 *      then only ever reach whichever sits on top, and §5.4's coordinate probes
 *      cannot tell the regions apart at all.
 *
 *   2. Broad regions must sit underneath specific ones. Priority ascends from
 *      the most specific (engine, 0) to the broadest (body), so painting in
 *      descending priority leaves the specific regions on top — which is what
 *      §5.1 means by a Body region never capturing a point visibly occupied by
 *      the engine.
 */

export interface Point {
  x: number;
  y: number;
}

export interface HotspotLike<Id extends string = string> {
  visualCategoryId: Id;
  label: string;
  polygon: Point[];
  priority?: number;
}

export interface HitRegion<Id extends string = string> {
  visualCategoryId: Id;
  label: string;
  /** Percentages of the stage, ready for CSS positioning. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** The polygon, expressed relative to the region's own box. */
  clipPath: string;
  priority: number;
}

export function toHitRegion<Id extends string>(
  hotspot: HotspotLike<Id>,
): HitRegion<Id> | null {
  const points = hotspot.polygon ?? [];
  if (points.length < 3) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;
  if (!(width > 0) || !(height > 0)) return null;

  const clip = points
    .map(
      (point) =>
        `${(((point.x - left) / width) * 100).toFixed(3)}% ${(((point.y - top) / height) * 100).toFixed(3)}%`,
    )
    .join(', ');

  return {
    visualCategoryId: hotspot.visualCategoryId,
    label: hotspot.label,
    left: left * 100,
    top: top * 100,
    width: width * 100,
    height: height * 100,
    clipPath: `polygon(${clip})`,
    priority: hotspot.priority ?? 0,
  };
}

/** Paint order: broadest first, so the most specific region ends up on top. */
export function deriveHitRegions<Id extends string>(
  hotspots: ReadonlyArray<HotspotLike<Id>>,
): Array<HitRegion<Id>> {
  return hotspots
    .map(toHitRegion)
    .filter((region): region is HitRegion<Id> => region !== null)
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Whether a point lies inside a polygon (ray casting).
 *
 * Used by the tests: §5.4 probes click the centre of a region's box, so a
 * published polygon whose bounding-box centre falls outside the shape is
 * unclickable at exactly the point the contract aims at.
 */
export function containsPoint(polygon: Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const straddles = a.y > point.y !== b.y > point.y;
    if (
      straddles &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}
