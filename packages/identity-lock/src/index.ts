import sharp from 'sharp';

/**
 * Identity lock.
 *
 * Previously this module exported two frozen literals: a hardcoded Hilux
 * landmark set written to every pack regardless of source, and a metrics object
 * fixed at silhouette IoU 0.99 with zero displacement on every landmark. Stage
 * 15 scored that literal. The QA gate was therefore structurally incapable of
 * failing on identity drift, while reporting that it had passed.
 *
 * The lock is now derived from the normalized source, and drift is measured
 * against the rendered artifacts. Metrics that this deterministic implementation
 * cannot honestly compute are reported as NOT_MEASURED rather than as zero.
 */

const GRID_WIDTH = 160;
const GRID_HEIGHT = 90;

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IdentityLock {
  version: string;
  coordinateSystem: 'normalized-0-1';
  derivedFrom: string;
  grid: { width: number; height: number };
  /** Row-major occupancy bitmask over the grid, base64-encoded. */
  silhouetteMask: string;
  occupiedCells: number;
  boundingBox: BoundingBox;
  centroid: Point;
  aspectRatio: number;
  /** Column-wise upper and lower silhouette extents, normalized. */
  upperProfile: number[];
  lowerProfile: number[];
  source: 'derived-from-normalized-source';
  productionApproval: false;
}

export type MetricValue = number | 'NOT_MEASURED';

export interface IdentityMetrics {
  silhouetteIoU: number;
  boundingBoxChange: number;
  centroidDisplacement: number;
  aspectRatioChange: number;
  upperProfileDeviation: number;
  lowerProfileDeviation: number;
  /**
   * Per-landmark drift requires feature detection (wheel hubs, lamp centres,
   * glazing boundaries). The deterministic development provider does not
   * perform it. These are NOT_MEASURED, never 0.
   */
  wheelCentreDisplacement: MetricValue;
  rooflineDisplacement: MetricValue;
  lampDisplacement: MetricValue;
  glazingDisplacement: MetricValue;
  measuredBy: string;
}

/** Downsample to the grid and threshold against the darkest-corner background. */
async function occupancy(path: string): Promise<Uint8Array> {
  const { data } = await sharp(path)
    .removeAlpha()
    .greyscale()
    .resize(GRID_WIDTH, GRID_HEIGHT, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // The pipeline composites onto a flat dark background, so the corner sample is
  // a reliable background reference. Threshold is a fixed offset above it.
  const corners = [
    data[0],
    data[GRID_WIDTH - 1],
    data[(GRID_HEIGHT - 1) * GRID_WIDTH],
    data[GRID_HEIGHT * GRID_WIDTH - 1],
  ];
  const background = corners.reduce((a, b) => a + b, 0) / corners.length;
  const threshold = background + 18;

  const mask = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i] > threshold ? 1 : 0;
  return mask;
}

function pack(mask: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(mask.length / 8));
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) bytes[i >> 3] |= 0x80 >> (i & 7);
  }
  return Buffer.from(bytes).toString('base64');
}

function unpack(encoded: string, length: number): Uint8Array {
  const bytes = Buffer.from(encoded, 'base64');
  const mask = new Uint8Array(length);
  for (let i = 0; i < length; i++) mask[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
  return mask;
}

function describe(mask: Uint8Array) {
  let minX = GRID_WIDTH;
  let maxX = -1;
  let minY = GRID_HEIGHT;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  const upper = new Array<number>(GRID_WIDTH).fill(1);
  const lower = new Array<number>(GRID_WIDTH).fill(0);

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (!mask[y * GRID_WIDTH + x]) continue;
      count += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const ny = y / GRID_HEIGHT;
      if (ny < upper[x]) upper[x] = ny;
      if (ny > lower[x]) lower[x] = ny;
    }
  }

  if (count === 0) {
    throw new Error('Identity lock: source silhouette is empty after thresholding');
  }

  const boundingBox: BoundingBox = {
    x: minX / GRID_WIDTH,
    y: minY / GRID_HEIGHT,
    width: (maxX - minX + 1) / GRID_WIDTH,
    height: (maxY - minY + 1) / GRID_HEIGHT,
  };

  return {
    count,
    boundingBox,
    centroid: { x: sumX / count / GRID_WIDTH, y: sumY / count / GRID_HEIGHT },
    aspectRatio: boundingBox.width / boundingBox.height,
    upperProfile: upper.map((v, x) => (lower[x] === 0 && v === 1 ? 0 : v)),
    lowerProfile: lower,
  };
}

export async function buildIdentityLock(normalizedSourcePath: string): Promise<IdentityLock> {
  const mask = await occupancy(normalizedSourcePath);
  const described = describe(mask);
  return {
    version: '2.0.0',
    coordinateSystem: 'normalized-0-1',
    derivedFrom: normalizedSourcePath.replaceAll('\\', '/').split('/').slice(-2).join('/'),
    grid: { width: GRID_WIDTH, height: GRID_HEIGHT },
    silhouetteMask: pack(mask),
    occupiedCells: described.count,
    boundingBox: described.boundingBox,
    centroid: described.centroid,
    aspectRatio: described.aspectRatio,
    upperProfile: described.upperProfile,
    lowerProfile: described.lowerProfile,
    source: 'derived-from-normalized-source',
    productionApproval: false,
  };
}

function meanAbsolute(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}

export async function compareIdentity(
  lock: IdentityLock,
  candidatePath: string,
): Promise<IdentityMetrics> {
  const candidate = await occupancy(candidatePath);
  const locked = unpack(lock.silhouetteMask, lock.grid.width * lock.grid.height);

  let intersection = 0;
  let union = 0;
  for (let i = 0; i < locked.length; i++) {
    const a = locked[i];
    const b = candidate[i];
    if (a || b) union += 1;
    if (a && b) intersection += 1;
  }

  const described = describe(candidate);
  const box = lock.boundingBox;
  const boundingBoxChange =
    (Math.abs(described.boundingBox.x - box.x) +
      Math.abs(described.boundingBox.y - box.y) +
      Math.abs(described.boundingBox.width - box.width) +
      Math.abs(described.boundingBox.height - box.height)) /
    4;

  return {
    silhouetteIoU: union === 0 ? 0 : intersection / union,
    boundingBoxChange,
    centroidDisplacement: Math.hypot(
      described.centroid.x - lock.centroid.x,
      described.centroid.y - lock.centroid.y,
    ),
    aspectRatioChange: Math.abs(described.aspectRatio - lock.aspectRatio),
    upperProfileDeviation: meanAbsolute(described.upperProfile, lock.upperProfile),
    lowerProfileDeviation: meanAbsolute(described.lowerProfile, lock.lowerProfile),
    wheelCentreDisplacement: 'NOT_MEASURED',
    rooflineDisplacement: 'NOT_MEASURED',
    lampDisplacement: 'NOT_MEASURED',
    glazingDisplacement: 'NOT_MEASURED',
    measuredBy: 'deterministic-silhouette-v2',
  };
}
