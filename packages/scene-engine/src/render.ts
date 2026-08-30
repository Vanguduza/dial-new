import sharp from "sharp";
import type { Raster } from "./assets.js";
import { categoryOf, SCENE_GATES, SECTION_BY_ROLE, type Section } from "./contracts.js";
import { HIT_REGION_PRIORITY, type VisualCategoryId } from "../../contracts/src/index.js";
import { phase, TIMELINE, transformAt, type MotionPlan } from "./motion.js";
import type { PreparedComponent, PreparedScene } from "./prepare.js";

export interface Frame {
  raster: Raster;
  owners: Uint16Array;
  parts: Array<{ code: number; id: string; section: Section; visualCategoryId: VisualCategoryId }>;
}

// This is a deterministic surface/line treatment, not a claim of 3D reconstruction.
// It cannot alter a lamp, roof, wheel, camera or panel boundary.
function lineStrength(sprite: Raster): Float32Array {
  const values = new Float32Array(sprite.width * sprite.height);
  const luminance = (offset: number) => (sprite.pixels[offset] * 0.2126 + sprite.pixels[offset + 1] * 0.7152 + sprite.pixels[offset + 2] * 0.0722) / 255;
  for (let y = 0; y < sprite.height; y++) for (let x = 0; x < sprite.width; x++) {
    const offset = (y * sprite.width + x) * 4;
    if (sprite.pixels[offset + 3] < SCENE_GATES.alphaThreshold) continue;
    let edge = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= sprite.width || ny >= sprite.height) { edge = 1; continue; }
      const neighbour = (ny * sprite.width + nx) * 4;
      edge = Math.max(edge, Math.abs(sprite.pixels[offset + 3] - sprite.pixels[neighbour + 3]) / 255, Math.min(1, Math.abs(luminance(offset) - luminance(neighbour)) * 4));
    }
    values[y * sprite.width + x] = edge;
  }
  return values;
}

export class SceneRenderer {
  private readonly lines = new Map<string, Float32Array>();
  constructor(readonly scene: PreparedScene, readonly plan: MotionPlan) {
    for (const part of scene.components) this.lines.set(part.spec.id, lineStrength(part.sprite));
  }

  private material(part: PreparedComponent, progress: number): Raster {
    const line = phase(progress, TIMELINE.studioEnd, TIMELINE.lineEnd) * (1 - phase(progress, TIMELINE.explosionEnd, TIMELINE.settled));
    const studio = phase(progress, TIMELINE.heroEnd, TIMELINE.studioEnd);
    const pixels = Buffer.from(part.sprite.pixels), edges = this.lines.get(part.spec.id)!;
    for (let p = 0; p < pixels.length; p += 4) {
      const grey = (pixels[p] + pixels[p + 1] + pixels[p + 2]) / 3;
      for (let c = 0; c < 3; c++) {
        const graded = Math.max(0, Math.min(255, pixels[p + c] * (1 - 0.12 * studio) + grey * 0.12 * studio));
        const contour = [225, 232, 236][c] * edges[p / 4] + 12 * (1 - edges[p / 4]);
        pixels[p + c] = Math.round(graded * (1 - line) + contour * line);
      }
      // Alpha/geometry is invariant under the material change.
    }
    return { ...part.sprite, pixels };
  }

  async frame(progress: number): Promise<Frame> {
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw new Error("Progress must be in [0,1]");
    const { width, height } = this.scene.spec.canvas;
    const pixels = Buffer.alloc(width * height * 4), owners = new Uint16Array(width * height);
    const studioBackground = phase(progress, TIMELINE.heroEnd, TIMELINE.studioEnd);
    for (let p = 0; p < pixels.length; p += 4) {
      for (let c = 0; c < 3; c++) pixels[p + c] = [8, 11, 14][c];
      pixels[p + 3] = 255;
    }
    const parts: Frame["parts"] = [];
    const sorted = [...this.scene.components].sort((a, b) => a.spec.depth - b.spec.depth || a.spec.id.localeCompare(b.spec.id));
    for (const [index, part] of sorted.entries()) {
      const code = index + 1;
      parts.push({ code, id: part.spec.id, section: SECTION_BY_ROLE[part.spec.role], visualCategoryId: categoryOf(part.spec) });
      const track = this.plan.tracks.find((candidate) => candidate.id === part.spec.id)!;
      const bounds = transformAt(track, progress);
      const w = Math.max(1, Math.round(bounds.width)), h = Math.max(1, Math.round(bounds.height));
      const left = Math.round(bounds.x), top = Math.round(bounds.y);
      const material = this.material(part, progress);
      const data = await sharp(material.pixels, { raw: { width: material.width, height: material.height, channels: 4 } })
        .resize(w, h, { kernel: "lanczos3" }).raw().toBuffer();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = left + x, dy = top + y;
        if (dx < 0 || dy < 0 || dx >= width || dy >= height) continue;
        const source = (y * w + x) * 4, target = (dy * width + dx) * 4;
        const alpha = data[source + 3] / 255;
        for (let c = 0; c < 3; c++) pixels[target + c] = Math.round(data[source + c] * alpha + pixels[target + c] * (1 - alpha));
        if (data[source + 3] >= SCENE_GATES.alphaThreshold) owners[dy * width + dx] = code;
      }
    }
    // The first state is the exact source. Fade its background only after the
    // registered reconstruction has passed the source-resemblance gates.
    if (studioBackground < 1) for (let p = 0; p < pixels.length; p += 4) {
      for (let c = 0; c < 3; c++) pixels[p + c] = Math.round(this.scene.hero.pixels[p + c] * (1 - studioBackground) + pixels[p + c] * studioBackground);
    }
    return { raster: { pixels, width, height }, owners, parts };
  }
}

export function pickComponent(frame: Frame, x: number, y: number, padding: number = SCENE_GATES.hitSlopPixels): Frame["parts"][number] | null {
  const { width, height } = frame.raster;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height) return null;
  padding = Math.max(0, Math.min(44, Math.round(Number.isFinite(padding) ? padding : 0)));
  const px = Math.floor(x), py = Math.floor(y), exact = frame.owners[py * width + px];
  if (exact) return frame.parts.find((part) => part.code === exact) ?? null;
  let best = padding * padding + 1, selected: Frame["parts"][number] | null = null, ambiguous = false;
  for (let dy = -padding; dy <= padding; dy++) for (let dx = -padding; dx <= padding; dx++) {
    const xx = px + dx, yy = py + dy, distance = dx * dx + dy * dy;
    if (xx < 0 || yy < 0 || xx >= width || yy >= height || distance > padding * padding || distance > best) continue;
    const code = frame.owners[yy * width + xx];
    if (!code) continue;
    const part = frame.parts.find((candidate) => candidate.code === code)!;
    if (distance < best) { best = distance; selected = part; ambiguous = false; }
    else if (selected?.section !== part.section) {
      const incoming = HIT_REGION_PRIORITY[part.visualCategoryId], current = selected ? HIT_REGION_PRIORITY[selected.visualCategoryId] : -1;
      if (incoming > current) { selected = part; ambiguous = false; }
      else if (incoming === current) ambiguous = true;
    }
  }
  return ambiguous ? null : selected;
}

export function categoryHref(section: Section, sceneFamilyId: string, context: { visualFamilyId: string; familySlug: string; fitmentId: string } | null) {
  if (!Object.values(SECTION_BY_ROLE).includes(section) || !context || context.visualFamilyId !== sceneFamilyId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(context.familySlug) || !context.fitmentId.trim()) return null;
  return `/epc/vehicles/${context.familySlug}/sections/${section}?${new URLSearchParams({ fitment: context.fitmentId })}`;
}
