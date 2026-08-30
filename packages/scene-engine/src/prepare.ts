import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { alphaBounds, confinedExisting, cropRaster, decodeRgba, digest, readAsset, type Bounds, type Raster } from "./assets.js";
import { categoryOf, componentSceneSchema, report, SceneGateError, SCENE_GATES, SECTION_BY_ROLE, type ComponentScene, type GateCheck, type SceneComponent, type SceneJob } from "./contracts.js";

export interface PreparedComponent {
  spec: SceneComponent;
  registered: Raster;
  sprite: Raster;
  bounds: Bounds;
}
export interface PreparedScene {
  spec: ComponentScene;
  sceneHash: string;
  hero: Raster;
  foregroundMask: Uint8Array;
  components: PreparedComponent[];
  checks: GateCheck[];
}

export function compositeRegistered(components: PreparedComponent[], width: number, height: number): Raster {
  const pixels = Buffer.alloc(width * height * 4);
  for (const component of [...components].sort((a, b) => a.spec.depth - b.spec.depth || a.spec.id.localeCompare(b.spec.id))) {
    const source = component.registered.pixels;
    for (let p = 0; p < pixels.length; p += 4) {
      const a = source[p + 3] / 255, b = pixels[p + 3] / 255;
      const out = a + b * (1 - a);
      if (!out) continue;
      for (let c = 0; c < 3; c++) pixels[p + c] = Math.round((source[p + c] * a + pixels[p + c] * b * (1 - a)) / out);
      pixels[p + 3] = Math.round(out * 255);
    }
  }
  return { pixels, width, height };
}

export function sceneStructureChecks(spec: ComponentScene): GateCheck[] {
  const checks: GateCheck[] = [];
  const add = (gate: string, passed: boolean, detail: string) => checks.push({ gate, status: passed ? "PASS" : "FAIL", detail });
  add("COMPONENT_IDS", new Set(spec.components.map((part) => part.id)).size === spec.components.length, "Component IDs must be unique and persist throughout the entire transition.");
  add("SINGLE_BODY_SHELL", spec.components.filter((part) => part.role === "body-shell").length === 1, "Exactly one residual body shell is required.");
  add("UNIQUE_LAYER_CONTENT", new Set(spec.components.map((part) => part.asset.sha256)).size === spec.components.length, "A layer cannot be duplicated under another component name.");
  const wheelPositions = spec.components.filter((part) => part.role === "wheel").map((part) => part.wheelPosition);
  add("WHEEL_OWNERSHIP", new Set(spec.expectedWheelPositions).size === spec.expectedWheelPositions.length &&
    wheelPositions.length === spec.expectedWheelPositions.length &&
    spec.expectedWheelPositions.every((position) => wheelPositions.filter((candidate) => candidate === position).length === 1) &&
    spec.components.every((part) => part.role === "wheel" ? part.wheelPosition !== null : part.wheelPosition === null),
  "Every declared physical wheel position must have exactly one tyre component. Non-wheel components cannot own wheel positions.");
  const sections = new Set(spec.components.map((part) => SECTION_BY_ROLE[part.role]));
  add("CATEGORY_COVERAGE", spec.requiredSections.every((section) => sections.has(section)), "All required EPC sections must have actual component geometry; mappings alone do not count.");
  add("HIDDEN_COMPONENT_EVIDENCE", spec.components.every((part) => part.evidence === "HERO_VISIBLE_PIXELS" || part.reference !== null), "Hidden parts need traceable reference assets. CATEGORY_ILLUSTRATION is recognition-only, never exact drivetrain evidence.");
  const sectionByCategory = { "VC-BODY": "body-exterior", "VC-ENG": "engine", "VC-TRN": "transmission-drivetrain", "VC-FBRK": "chassis-systems", "VC-RBRK": "chassis-systems", "VC-FSUS": "chassis-systems", "VC-RSUS": "chassis-systems" };
  add("SEMANTIC_CATEGORY_BINDING", spec.components.every((part) => {
    try { return sectionByCategory[categoryOf(part)] === SECTION_BY_ROLE[part.role]; } catch { return false; }
  }), "Component roles and canonical categories must agree; engine pixels cannot be labelled chassis.");
  return checks;
}

export async function prepareScene(job: SceneJob, jobRoot: string): Promise<PreparedScene> {
  const checks: GateCheck[] = [];
  if (!job.sceneFile) throw new SceneGateError(report([{ gate: "COMPONENT_SCENE_REQUIRED", status: "NOT_MEASURED", detail: "Hero accepted as an input, but segmentation/reconstruction must supply a registered component scene before any transition can render. No synthetic vehicle or independent-state fallback is allowed." }]));
  const scenePath = await confinedExisting(jobRoot, job.sceneFile);
  const sceneBytes = await readFile(scenePath);
  const parsed = componentSceneSchema.safeParse(JSON.parse(sceneBytes.toString("utf8")));
  if (!parsed.success) throw new SceneGateError(report([{ gate: "SCENE_CONTRACT", status: "FAIL", detail: parsed.error.message }]));
  const spec = parsed.data;
  checks.push(...sceneStructureChecks(spec));
  checks.push({ gate: "SOURCE_LINEAGE", status: spec.visualFamilyId === job.visualFamilyId && spec.heroSha256 === job.hero.sha256 ? "PASS" : "FAIL", detail: "Scene identity and source fingerprint must match this exact hero job." });
  if (job.catalog) {
    const catalog = job.catalog;
    const available = new Set(spec.components.map(categoryOf));
    checks.push({ gate: "DECLARED_FITMENT_COVERAGE", status: new Set(catalog.coverage.map((entry) => entry.fitmentId)).size === catalog.coverage.length && catalog.coverage.every((entry) => entry.expectedWheelPositions === spec.expectedWheelPositions.length) ? "PASS" : "FAIL", detail: "Each covered fitment is unique and must share this scene's physical wheel topology." });
    checks.push({ gate: "CATALOG_CATEGORY_GEOMETRY", status: new Set(catalog.categories.map((entry) => entry.visualCategoryId)).size === catalog.categories.length && catalog.categories.every((entry) => available.has(entry.visualCategoryId)) && spec.components.every((part) => catalog.categories.some((entry) => entry.visualCategoryId === categoryOf(part) && entry.sectionSlug === SECTION_BY_ROLE[part.role])) ? "PASS" : "FAIL", detail: "Every enabled catalog category needs real geometry, and every part needs a catalog-supplied family binding." });
  }
  if (checks.some((check) => check.status !== "PASS")) throw new SceneGateError(report(checks));
  const hero = await decodeRgba(await readAsset(jobRoot, job.hero));
  const sceneRoot = dirname(scenePath);
  const maskRaster = await decodeRgba(await readAsset(sceneRoot, spec.foregroundMask));
  const { width, height } = spec.canvas;
  if ([hero, maskRaster].some((raster) => raster.width !== width || raster.height !== height)) throw new SceneGateError(report([...checks, { gate: "CAMERA_REGISTRATION", status: "FAIL", detail: "Hero, foreground mask and all component layers must share the same registered canvas dimensions. No stretching or independently reframed views." }]));
  const foregroundMask = new Uint8Array(width * height);
  for (let p = 0; p < foregroundMask.length; p++) foregroundMask[p] = maskRaster.pixels[p * 4] >= 128 ? 1 : 0;
  const foregroundCount = foregroundMask.reduce((total, value) => total + value, 0);
  checks.push({ gate: "EXPLICIT_FOREGROUND_MASK", status: foregroundCount > 64 && foregroundCount < width * height * 0.98 ? "PASS" : "FAIL", detail: "Foreground must be an explicit, nonempty vehicle mask, not a luminance guess or a full-frame rectangle." });
  const components: PreparedComponent[] = [];
  for (const part of spec.components) {
    const registered = await decodeRgba(await readAsset(sceneRoot, part.asset));
    if (registered.width !== width || registered.height !== height) throw new SceneGateError(report([...checks, { gate: "CAMERA_REGISTRATION", status: "FAIL", detail: `${part.id} is not on the registered hero canvas.` }]));
    const bounds = alphaBounds(registered);
    if (!bounds) throw new SceneGateError(report([...checks, { gate: "EMPTY_COMPONENT", status: "FAIL", detail: `${part.id} has no visible geometry.` }]));
    let transparent = 0;
    for (let p = 3; p < registered.pixels.length; p += 4) if (registered.pixels[p] < SCENE_GATES.alphaThreshold) transparent++;
    checks.push({ gate: `ISOLATED_PART:${part.id}`, status: transparent > width * height * 0.01 ? "PASS" : "FAIL", detail: "Each part must have genuine transparency; a flattened scene is not a component layer." });
    if (part.reference) await readAsset(sceneRoot, part.reference);
    components.push({ spec: part, registered, sprite: cropRaster(registered, bounds), bounds });
  }
  // Detect a tyre/panel copied out of a still while its original remains in the body.
  const visible = components.filter((part) => part.spec.evidence === "HERO_VISIBLE_PIXELS");
  for (let a = 0; a < visible.length; a++) for (let b = a + 1; b < visible.length; b++) {
    let overlap = 0, countA = 0, countB = 0;
    for (let p = 3; p < width * height * 4; p += 4) {
      const inA = visible[a].registered.pixels[p] >= 128, inB = visible[b].registered.pixels[p] >= 128;
      if (inA) countA++; if (inB) countB++; if (inA && inB) overlap++;
    }
    const ratio = overlap / Math.max(1, Math.min(countA, countB));
    checks.push({ gate: `EXCLUSIVE_SOURCE_OWNERSHIP:${visible[a].spec.id}:${visible[b].spec.id}`, status: ratio <= SCENE_GATES.maxWheelResidualOverlap ? "PASS" : "FAIL", actual: ratio, limit: SCENE_GATES.maxWheelResidualOverlap, detail: "Visible source pixels must belong to one component. A detached part cannot remain painted into another layer." });
  }
  const assembled = compositeRegistered(components, width, height);
  let intersection = 0, union = 0, colourError = 0, colourCount = 0;
  for (let p = 0; p < foregroundMask.length; p++) {
    const a = foregroundMask[p], b = assembled.pixels[p * 4 + 3] >= SCENE_GATES.alphaThreshold ? 1 : 0;
    if (a && b) intersection++;
    if (a || b) union++;
    if (a && b) for (let channel = 0; channel < 3; channel++) {
      colourError += Math.abs(hero.pixels[p * 4 + channel] - assembled.pixels[p * 4 + channel]) / 255;
      colourCount++;
    }
  }
  const iou = intersection / Math.max(1, union), error = colourError / Math.max(1, colourCount);
  checks.push({ gate: "ASSEMBLED_SOURCE_SILHOUETTE", status: iou >= SCENE_GATES.minSourceSilhouetteIoU ? "PASS" : "FAIL", actual: iou, limit: SCENE_GATES.minSourceSilhouetteIoU, detail: "Reassembling the layers must reproduce the explicit hero silhouette in the same camera." });
  checks.push({ gate: "ASSEMBLED_SOURCE_APPEARANCE", status: error <= SCENE_GATES.maxSourceColourError ? "PASS" : "FAIL", actual: error, limit: SCENE_GATES.maxSourceColourError, detail: "Reassembled visible surfaces must match the source hero; unrelated independently generated views cannot substitute." });
  if (checks.some((check) => check.status !== "PASS")) throw new SceneGateError(report(checks));
  return { spec, hero, foregroundMask, components, checks, sceneHash: digest(sceneBytes) };
}
