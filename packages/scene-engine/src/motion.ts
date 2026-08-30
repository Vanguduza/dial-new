import type { Bounds } from "./assets.js";
import { MOTION_PROFILES, categoryMotion, type VisualCategoryId } from "../../contracts/src/index.js";
import { categoryOf, report, SceneGateError, SCENE_GATES, SECTION_BY_ROLE, type GateCheck } from "./contracts.js";
import type { PreparedScene } from "./prepare.js";

const segments = MOTION_PROFILES["premium-v1"].segments;
// Derived aliases only: no second numerical timeline.
export const TIMELINE = Object.freeze({ heroEnd: segments.HERO[1], studioEnd: segments.CGI[1], lineEnd: segments.LINE_ART[1], explosionStart: segments.EXPLOSION[0], explosionEnd: segments.EXPLOSION[1], settled: segments.SETTLE[1] });
export const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * t * (t * (t * 6 - 15) + 10); };
export const phase = (p: number, start: number, end: number) => smooth((p - start) / (end - start));
export interface PartTrack {
  id: string; visualCategoryId: VisualCategoryId; layerAssetId: string;
  source: Bounds; destination: { x: number; y: number }; scale: number;
  depth: number; startProgress: number; endProgress: number; easing: string;
}
export interface MotionPlan { tracks: PartTrack[]; checks: GateCheck[]; canvas: { width: number; height: number } }

function cells(box: Bounds, count: number, horizontal = false): Bounds[] {
  return Array.from({ length: count }, (_, index) => horizontal
    ? { x: box.x + box.width * index / count, y: box.y, width: box.width / count, height: box.height }
    : { x: box.x, y: box.y + box.height * index / count, width: box.width, height: box.height / count });
}

function fitCells(box: Bounds, parts: PreparedScene["components"], canvas: { width: number; height: number }, horizontal: boolean) {
  if (!parts.length) return [];
  let selected = cells(box, parts.length, horizontal), best = 0;
  // Solve grid density from the actual part bounds, not from model-specific positions.
  for (let rows = 1; rows <= parts.length; rows++) {
    const columns = Math.ceil(parts.length / rows);
    const candidate = parts.map((_, index) => ({ x: box.x + box.width * (index % columns) / columns, y: box.y + box.height * Math.floor(index / columns) / rows, width: box.width / columns, height: box.height / rows }));
    const score = Math.min(...candidate.map((slot, index) => Math.min(slot.width * canvas.width / parts[index].bounds.width, slot.height * canvas.height / parts[index].bounds.height)));
    if (score > best) { best = score; selected = candidate; }
  }
  return selected;
}

export function createMotionPlan(scene: PreparedScene): MotionPlan {
  const { width, height } = scene.spec.canvas;
  const boxes = new Map<string, Bounds>();
  const shell = scene.components.find((part) => part.spec.role === "body-shell")!;
  const set = (parts: typeof scene.components, box: Bounds, horizontal = false) => {
    const slots = fitCells(box, parts, { width, height }, horizontal);
    parts.forEach((part, index) => boxes.set(part.spec.id, slots[index]));
  };
  // Family bands reserve clear negative space and forbid engine/chassis overlap.
  boxes.set(shell.spec.id, { x: 0.27, y: 0.30, width: 0.46, height: 0.32 });
  set(scene.components.filter((part) => part.spec.role === "body-part"), { x: 0.12, y: 0.08, width: 0.76, height: 0.17 }, true);
  set(scene.components.filter((part) => part.spec.role === "engine"), { x: 0.77, y: 0.29, width: 0.20, height: 0.34 });
  set(scene.components.filter((part) => part.spec.role === "transmission"), { x: 0.03, y: 0.29, width: 0.20, height: 0.34 });
  // Keep left-to-right source ordering for axle/wheel groups, independently of input array order.
  const chassis = scene.components.filter((part) => SECTION_BY_ROLE[part.spec.role] === "chassis-systems")
    .sort((a, b) => a.bounds.x - b.bounds.x || a.spec.id.localeCompare(b.spec.id));
  set(chassis, { x: 0.09, y: 0.70, width: 0.82, height: 0.23 }, true);
  let scale = 1;
  for (const component of scene.components) {
    const box = boxes.get(component.spec.id)!;
    scale = Math.min(scale, box.width * width * 0.85 / component.bounds.width, box.height * height * 0.85 / component.bounds.height);
  }
  // One global scale preserves all relative proportions; no engine/wheel resizing hacks.
  const tracks = scene.components.map((part) => {
    const box = boxes.get(part.spec.id)!;
    const visualCategoryId = categoryOf(part.spec);
    return { id: part.spec.id, visualCategoryId, ...categoryMotion(visualCategoryId), depth: part.spec.depth, source: part.bounds, destination: { x: (box.x + box.width / 2) * width, y: (box.y + box.height / 2) * height }, scale };
  });
  const checks: GateCheck[] = [{ gate: "UNIFORM_EXPLOSION_SCALE", status: scale >= SCENE_GATES.minExplodedScale ? "PASS" : "FAIL", actual: scale, limit: SCENE_GATES.minExplodedScale, detail: "All components retain relative proportions. Excessively crowded scenes must be regrouped, not silently miniaturized." }];
  for (const track of tracks) {
    const size = Math.min(track.source.width, track.source.height) * scale;
    checks.push({ gate: `SELECTABLE_SIZE:${track.id}`, status: size >= SCENE_GATES.minVisiblePartPixels ? "PASS" : "FAIL", actual: size, limit: SCENE_GATES.minVisiblePartPixels, detail: "A category part must remain large enough to see and select, with additional invisible hit padding." });
  }
  return { tracks, checks, canvas: { width, height } };
}

export function transformAt(track: PartTrack, progress: number): Bounds {
  if (!Number.isFinite(progress)) throw new Error("Progress must be finite");
  const t = phase(progress, track.startProgress, track.endProgress);
  // Stagger translation, not relative proportions: every part shares the same
  // scale at every instant, including groups whose outward movement starts later.
  const scale = 1 + (track.scale - 1) * phase(progress, TIMELINE.explosionStart, TIMELINE.explosionEnd);
  const startX = track.source.x + track.source.width / 2, startY = track.source.y + track.source.height / 2;
  const cx = startX + (track.destination.x - startX) * t, cy = startY + (track.destination.y - startY) * t;
  const width = track.source.width * scale, height = track.source.height * scale;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/** Add in-between frames where a shared staggered movement would otherwise jump.
 * The curve, endpoints and threshold stay unchanged. 96/48 are sampling floors,
 * not permission to ship a coarse sequence. No vehicle-specific authored timing.
 */
export function motionSamples(plan: MotionPlan, minimumFrames: number): number[] {
  const canvas = plan.canvas;
  const result: number[] = [0];
  const tooFar = (a: number, b: number) => plan.tracks.some((track) => {
    const A = transformAt(track, a), B = transformAt(track, b);
    return Math.max(Math.hypot((B.x - A.x) / canvas.width, (B.y - A.y) / canvas.height), Math.abs(B.width - A.width) / canvas.width) > SCENE_GATES.maxMotionStep;
  });
  const insert = (a: number, b: number, depth = 0) => {
    if (tooFar(a, b) && depth < 8) { const mid = (a + b) / 2; insert(a, mid, depth + 1); insert(mid, b, depth + 1); }
    else result.push(b);
  };
  for (let index = 1; index < minimumFrames; index++) insert((index - 1) / (minimumFrames - 1), index / (minimumFrames - 1));
  if (result.length > 512) throw new SceneGateError(report([{ gate: "MOTION_SAMPLING_BUDGET", status: "FAIL", actual: result.length, limit: 512, detail: "Trajectory requires excessive in-between frames; relayout or regroup without relaxing motion thresholds." }]));
  return result;
}

export function validateMotion(scene: PreparedScene, plan: MotionPlan, frameCount: number): GateCheck[] {
  const { width, height } = scene.spec.canvas;
  const checks = [...plan.checks];
  const samples = motionSamples(plan, frameCount);
  checks.push({ gate: "ADAPTIVE_FRAME_SAMPLING", status: "PASS", actual: samples.length, detail: `${frameCount} baseline samples expanded only where needed to preserve the unchanged per-frame motion bound.` });
  for (const track of plan.tracks) {
    let maxStep = 0, inBounds = true;
    let previous = transformAt(track, 0);
    for (const progress of samples) {
      const current = transformAt(track, progress);
      inBounds &&= current.x >= 0 && current.y >= 0 && current.x + current.width <= width && current.y + current.height <= height;
      maxStep = Math.max(maxStep, Math.hypot((current.x - previous.x) / width, (current.y - previous.y) / height), Math.abs(current.width - previous.width) / width);
      previous = current;
    }
    checks.push({ gate: `NO_CLIPPING:${track.id}`, status: inBounds ? "PASS" : "FAIL", detail: "No part may leave the frame at any sampled step." });
    checks.push({ gate: `CONTINUOUS_MOTION:${track.id}`, status: maxStep <= SCENE_GATES.maxMotionStep ? "PASS" : "FAIL", actual: maxStep, limit: SCENE_GATES.maxMotionStep, detail: "One persistent component follows a continuous eased transform with a bounded per-frame displacement." });
  }
  let collisions = 0;
  for (let a = 0; a < plan.tracks.length; a++) for (let b = a + 1; b < plan.tracks.length; b++) {
    const A = transformAt(plan.tracks[a], 1), B = transformAt(plan.tracks[b], 1);
    if (Math.min(A.x + A.width, B.x + B.width) > Math.max(A.x, B.x) && Math.min(A.y + A.height, B.y + B.height) > Math.max(A.y, B.y)) collisions++;
  }
  checks.push({ gate: "EXPLODED_SELECTION_SEPARATION", status: collisions === 0 ? "PASS" : "FAIL", actual: collisions, limit: 0, detail: "Final component bounds must not overlap; category selection cannot depend on guessed hotspot priority." });
  if (checks.some((check) => check.status !== "PASS")) throw new SceneGateError(report([...scene.checks, ...checks]));
  return checks;
}
