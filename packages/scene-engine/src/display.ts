import { HIT_REGION_PRIORITY } from "../../contracts/src/index.js";
import type { Frame } from "./render.js";

export interface DisplaySpec {
  width: number; height: number;
  fit?: "contain" | "cover";
  scale?: number; translateX?: number; translateY?: number;
}
/** Maps NORMALIZED image coordinates to CSS pixels. Both artwork and picking use this matrix. */
export function displayMatrix(source: { width: number; height: number }, view: DisplaySpec) {
  const scale = view.scale ?? 1, tx = view.translateX ?? 0, ty = view.translateY ?? 0;
  if (![source.width, source.height, view.width, view.height, scale].every((n) => Number.isFinite(n) && n > 0) || ![tx, ty].every(Number.isFinite)) throw new Error("Invalid display dimensions");
  const fit = (view.fit ?? "contain") === "contain" ? Math.min : Math.max;
  const unit = fit(view.width / source.width, view.height / source.height) * scale;
  const w = source.width * unit, h = source.height * unit;
  return [w, 0, 0, h, (view.width - w) / 2 + tx * view.width, (view.height - h) / 2 + ty * view.height] as const;
}
export type DisplayMatrix = ReturnType<typeof displayMatrix>;
export const project = (m: DisplayMatrix, x: number, y: number) => ({ x: x * m[0] + m[4], y: y * m[3] + m[5] });
export const unproject = (m: DisplayMatrix, x: number, y: number) => ({ x: (x - m[4]) / m[0], y: (y - m[5]) / m[3] });

/** Exact visible ownership wins before forgiving CSS-pixel padding. Device pixel ratio is irrelevant. */
export function pickDisplayed(frame: Frame, view: DisplaySpec, x: number, y: number, paddingCss = 22) {
  if (![x, y, paddingCss].every(Number.isFinite) || x < 0 || y < 0 || x >= view.width || y >= view.height) return null;
  const m = displayMatrix(frame.raster, view), point = unproject(m, x, y);
  const { width, height } = frame.raster;
  const px = Math.floor(point.x * width), py = Math.floor(point.y * height);
  const parts = new Map(frame.parts.map((part) => [part.code, part]));
  if (px >= 0 && py >= 0 && px < width && py < height) {
    const exact = parts.get(frame.owners[py * width + px]);
    if (exact) return exact;
  }
  const padding = Math.max(0, Math.min(44, paddingCss));
  const rx = Math.ceil(padding * width / m[0]), ry = Math.ceil(padding * height / m[3]);
  let best = padding * padding + 1, selected: Frame["parts"][number] | null = null, ambiguous = false;
  for (let yy = Math.max(0, py - ry); yy <= Math.min(height - 1, py + ry); yy++) {
    for (let xx = Math.max(0, px - rx); xx <= Math.min(width - 1, px + rx); xx++) {
      const part = parts.get(frame.owners[yy * width + xx]);
      if (!part) continue;
      const p = project(m, (xx + 0.5) / width, (yy + 0.5) / height);
      if (p.x < 0 || p.y < 0 || p.x >= view.width || p.y >= view.height) continue;
      const distance = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (distance > padding ** 2 || distance > best + 1e-7) continue;
      if (distance < best - 1e-7) { selected = part; best = distance; ambiguous = false; }
      else if (selected && selected.section !== part.section) {
        const priority = HIT_REGION_PRIORITY[part.visualCategoryId] - HIT_REGION_PRIORITY[selected.visualCategoryId];
        if (priority > 0) { selected = part; ambiguous = false; }
        else if (priority === 0) ambiguous = true;
      }
    }
  }
  return ambiguous ? null : selected;
}

export function displayProbeChecks(frame: Frame) {
  const views: DisplaySpec[] = [
    { width: 1440, height: 810 }, { width: 390, height: 400 },
    { width: 768, height: 480, scale: 0.88, translateX: 0.02, translateY: -0.01 },
  ];
  const counts = new Map<number, number>();
  frame.owners.forEach((code) => { if (code) counts.set(code, (counts.get(code) ?? 0) + 1); });
  return views.map((view) => {
    const matrix = displayMatrix(frame.raster, view);
    let failures = 0, probes = 0;
    const sampled = new Map<number, number>();
    frame.owners.forEach((code, pixel) => {
      if (!code) return;
      const ordinal = (sampled.get(code) ?? 0) + 1; sampled.set(code, ordinal);
      const stride = Math.max(1, Math.floor((counts.get(code) ?? 1) / 16));
      if (ordinal % stride !== 0) return;
      const expected = frame.parts.find((part) => part.code === code)!;
      const point = project(matrix, (pixel % frame.raster.width + 0.5) / frame.raster.width, (Math.floor(pixel / frame.raster.width) + 0.5) / frame.raster.height);
      probes++;
      if (pickDisplayed(frame, view, point.x, point.y)?.id !== expected.id) failures++;
    });
    return { gate: `DISPLAY_PICK_ALIGNMENT:${view.width}x${view.height}`, status: failures === 0 && probes > 0 ? "PASS" as const : "FAIL" as const, actual: failures, limit: 0, detail: `${probes} visible-part probes use the identical artwork matrix and inverse across desktop/mobile layouts.` };
  });
}
