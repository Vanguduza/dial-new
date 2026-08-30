import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sceneFixture } from "./helpers/scene-fixture.js";
import { produceBatch, verifySealedPack, type ReconstructionProvider } from "../packages/scene-engine/src/factory.js";
import { categoryMotion, MOTION_PROFILES, completedFlowFingerprint } from "../packages/contracts/src/index.js";
import { planExplosion } from "../packages/explosion/src/index.js";
import { createMotionPlan, motionSamples, TIMELINE, transformAt } from "../packages/scene-engine/src/motion.js";
import { prepareScene } from "../packages/scene-engine/src/prepare.js";
import { SceneRenderer } from "../packages/scene-engine/src/render.js";
import { displayMatrix, pickDisplayed, project, unproject } from "../packages/scene-engine/src/display.js";
import { runGuardedTransition, validateSceneJob } from "../packages/scene-engine/src/index.js";
import { resolveBoundCategory } from "../packages/scene-engine/src/routing.js";

const roots: string[] = [];
async function temporary() { const root = await mkdtemp(join(tmpdir(), "dial-production-test-")); roots.push(root); return root; }
const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));

describe("shared production contracts", () => {
  it("uses one canonical timeline and overlapping windows in both engines", () => {
    const groups = planExplosion(["VC-BODY", "VC-ENG", "VC-TRN", "VC-FBRK", "VC-RBRK", "VC-FSUS", "VC-RSUS"]);
    for (const group of groups) expect(group).toMatchObject(categoryMotion(group.visualCategoryId));
    expect(TIMELINE.explosionStart).toBe(MOTION_PROFILES["premium-v1"].segments.EXPLOSION[0]);
    expect(TIMELINE.explosionEnd).toBe(MOTION_PROFILES["premium-v1"].segments.EXPLOSION[1]);
    expect(groups[1].startProgress).toBeLessThan(groups[0].endProgress);
  });

  it("keeps visible ownership and 44px forgiving taps aligned after contain, cover and scaled placement", async () => {
    const input = await sceneFixture(await temporary()), scene = await prepareScene(input.job, input.root);
    const plan = createMotionPlan(scene), frame = await new SceneRenderer(scene, plan).frame(1);
    for (const progress of [0.6, 0.65, 0.7, 0.75, 0.8, 0.86]) {
      const scales = plan.tracks.map((track) => transformAt(track, progress).width / track.source.width);
      expect(Math.max(...scales) - Math.min(...scales)).toBeLessThan(1e-12);
    }
    for (const view of [{ width: 390, height: 400 }, { width: 1440, height: 810 }, { width: 600, height: 300, scale: 0.9, translateX: 0.01 }, { width: 700, height: 390, fit: "cover" as const }]) {
      const matrix = displayMatrix(frame.raster, view);
      for (const track of plan.tracks) {
        const box = transformAt(track, 1), x = (box.x + box.width / 2) / 640, y = (box.y + box.height / 2) / 360;
        const point = project(matrix, x, y), restored = unproject(matrix, point.x, point.y);
        expect(restored.x).toBeCloseTo(x, 12); expect(restored.y).toBeCloseTo(y, 12);
        expect(pickDisplayed(frame, view, point.x, point.y)?.id).toBe(track.id);
      }
    }
    expect(motionSamples(plan, 48).length).toBeGreaterThan(48);
  }, 30_000);

  it("packages real layers, portable evidence and family-only mappings with a runtime fingerprint recipe", async () => {
    const input = await sceneFixture(await temporary());
    input.job.catalog = { catalogReleaseId: "CAT-TEST", catalogFamilyId: "CF-TEST", familySlug: "test-coupe", make: "Test", model: "Coupe", generation: "Test", bodyStyle: "coupe", visualPhase: "test",
      coverage: [{ fitmentId: "FIT-A", variantId: "VAR-A", variantSlug: "a", expectedWheelPositions: 2 }, { fitmentId: "FIT-B", variantId: "VAR-B", variantSlug: "b", expectedWheelPositions: 2 }],
      categories: [{ visualCategoryId: "VC-BODY", sectionSlug: "body-exterior" }, { visualCategoryId: "VC-ENG", sectionSlug: "engine" }, { visualCategoryId: "VC-TRN", sectionSlug: "transmission-drivetrain" }, ...(["VC-FBRK", "VC-RBRK", "VC-FSUS", "VC-RSUS"] as const).map((visualCategoryId) => ({ visualCategoryId, sectionSlug: "chassis-systems" as const }))] };
    await input.persist();
    const active = { catalogReleaseId: "CAT-TEST", visualFamilyId: input.job.visualFamilyId, fitmentId: "FIT-A", variantId: "VAR-A" };
    expect(resolveBoundCategory(input.job.visualFamilyId, input.job.catalog, "VC-ENG", active)).toBe("/epc/vehicles/test-coupe/sections/engine?fitment=FIT-A&source=visual-transition");
    expect(resolveBoundCategory(input.job.visualFamilyId, input.job.catalog, "VC-ENG", { ...active, fitmentId: "FIT-FOREIGN" })).toBeNull();
    expect(resolveBoundCategory(input.job.visualFamilyId, input.job.catalog, "VC-ENG", { ...active, variantId: "VAR-B" })).toBeNull();
    expect(resolveBoundCategory(input.job.visualFamilyId, input.job.catalog, "VC-ENG", { ...active, catalogReleaseId: "CAT-STALE" })).toBeNull();
    const result = await runGuardedTransition(input.jobPath), root = result.packRoot;
    expect(await verifySealedPack(root)).toBe(true);
    const reuseEvents: string[] = [];
    const repeated = await runGuardedTransition(input.jobPath, (event) => reuseEvents.push(String(event.type)));
    expect(reuseEvents).toContain("frame_reused");
    expect(reuseEvents).not.toContain("frame_rendered");
    expect((await read(join(root, "asset-manifest.json"))).contentHash).toBe((await read(join(repeated.packRoot, "asset-manifest.json"))).contentHash);
    const layers = await read(join(root, "layers/manifest.json")); expect(layers.groups).toHaveLength(7);
    const portable = await validateSceneJob(join(root, "input-job.json")); expect(portable.qa.passed).toBe(true);
    const flow = await read(join(root, "navigation/hero-to-epc-flow-pack.json"));
    expect(flow.schemaVersion).toBe("1.3.0"); expect(flow.vehicle.fitmentId).toBeUndefined();
    expect(flow.coverage).toHaveLength(2); expect(flow.customerReady).toBe(false);
    expect(flow.visualIntegrity.explodedViewPolicy.humanVisualReview).toBe("PENDING");
    expect(flow.visualIntegrity.explodedViewPolicy.automatedPass).toBe(true);
    expect(flow.completionMemory.fingerprint).toBeUndefined();
    expect(flow.stages.map((stage: { id: string }) => stage.id)).not.toContain("TECHNICAL_SHADED");
    const map = await read(join(root, "navigation/manifest.json"));
    expect(map.coordinateSystem).toBe("NORMALIZED_0_1");
    expect(JSON.stringify(map)).not.toContain("FIT-A");
    expect(map.regions.find((region: { visualCategoryId: string }) => region.visualCategoryId === "VC-ENG").target.sectionSlug).toBe("engine");
    const fingerprint = (fitmentId: string, variantId: string) => completedFlowFingerprint({ ...flow.vehicle, flowPackId: flow.flowPackId, fitmentId, variantId });
    expect(fingerprint("FIT-A", "VAR-A")).not.toEqual(fingerprint("FIT-B", "VAR-B"));
    await writeFile(join(root, "states/exploded.webp"), "corrupt"); expect(await verifySealedPack(root)).toBe(false);
  }, 120_000);

  it("rejects category mappings that contradict the visible component", async () => {
    const input = await sceneFixture(await temporary());
    input.spec.components.find((part) => part.id === "engine")!.visualCategoryId = "VC-FBRK";
    await input.persist(); await expect(prepareScene(input.job, input.root)).rejects.toThrow("SEMANTIC_CATEGORY_BINDING");
  });
});

describe("self-repairing batch production", () => {
  it("repairs duplicate residual tyres, continues past unavailable models and resumes verified packs without rerendering", async () => {
    const root = await temporary(), bad = await sceneFixture(join(root, "bad"), "VF-TEST-PICKUP"), good = await sceneFixture(join(root, "good"), "VF-TEST-SEDAN", 100), missing = await sceneFixture(join(root, "missing"), "VF-TEST-VAN");
    const shell = bad.rasters.shell, wheel = bad.rasters["front-wheel"];
    for (let p = 0; p < shell.pixels.length; p += 4) if (wheel.pixels[p + 3]) wheel.pixels.copy(shell.pixels, p, p, p + 4);
    bad.spec.components.find((part) => part.id === "shell")!.asset = await bad.save("bad-shell.png", shell); await bad.persist();
    missing.job.sceneFile = null; await missing.persist();
    const path = join(root, "batch.json");
    await writeFile(path, JSON.stringify({ productionVersion: "1.0.0", concurrency: 2, jobs: [{ id: "pickup", job: "bad/job.json" }, { id: "van", job: "missing/job.json" }, { id: "sedan", job: "good/job.json" }] }));
    const first = await produceBatch(path);
    expect(first.built).toBe(2); expect(first.needsReconstruction).toBe(1); expect(first.customerReady).toBe(0);
    const repaired = first.jobs.find((job) => job.id === "pickup")!;
    expect(repaired.attempts.map((attempt) => attempt.status)).toEqual(["FAIL", "PASS"]);
    expect(repaired.attempts[1].action).toBe("REMOVE_DUPLICATED_SOURCE_OWNERSHIP");
    const failure = await read(join(root, "production-runs", repaired.attempts[0].qa));
    expect(failure.passed).toBe(false);
    expect(failure.checks.some((check: { gate: string; status: string }) => check.gate.startsWith("EXCLUSIVE_SOURCE_OWNERSHIP:") && check.status === "FAIL")).toBe(true);
    const events: string[] = [];
    const second = await produceBatch(path, [], (event) => events.push(String(event.type)));
    expect(second.built).toBe(2); expect(events.filter((event) => event === "pack_reused")).toHaveLength(2);
    expect(events).not.toContain("frame_rendered");
    expect(second.jobs.find((job) => job.id === "pickup")!.pack).toBe(repaired.pack);
  }, 180_000);

  it("tries another worker after a bad reconstruction and does not accept a foreign model", async () => {
    const root = await temporary(), source = await sceneFixture(join(root, "source"), "VF-TEST-SUV");
    source.job.sceneFile = null; await source.persist();
    const requests: Array<{ attempt: number; failures: string[] }> = [];
    const provider: ReconstructionProvider = { id: "test-provider", version: "test-1", async reconstruct(request) {
      requests.push({ attempt: request.attempt, failures: request.repairAdvice.map((item) => item.action) });
      const fixture = await sceneFixture(request.outputDirectory, request.attempt === 0 ? "VF-FOREIGN" : source.job.visualFamilyId);
      return fixture.jobPath;
    } };
    const path = join(root, "batch.json");
    await writeFile(path, JSON.stringify({ productionVersion: "1.0.0", maxCandidates: 2, jobs: [{ id: "suv", job: "source/job.json" }] }));
    const summary = await produceBatch(path, [provider]);
    expect(summary.built).toBe(1); expect(requests).toHaveLength(2);
    expect(requests[1].failures.length).toBeGreaterThan(0);
    expect(summary.jobs[0].attempts.map((attempt) => attempt.status)).toEqual(["FAIL", "PASS"]);
  }, 120_000);
});

afterAll(async () => { for (const root of roots) await rm(root, { recursive: true, force: true }); });
