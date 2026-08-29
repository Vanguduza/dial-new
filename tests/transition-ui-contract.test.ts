import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("customer transition UI contract", () => {
  it("keeps the visual window free of progress chrome, stage labels and visible hotspots", async () => {
    const source = await readFile("apps/preview-player/components/dvtg-preview.tsx", "utf8");
    for (const removedText of [
      "Interactive vehicle view",
      "Current view",
      "Automatic vehicle transformation",
      "Select a system",
      "What are you working on?",
      "Hero · CGI",
    ]) {
      expect(source).not.toContain(removedText);
    }
    expect(source).toContain(
      "Know your {vehicleFamily.make} {vehicleFamily.model} {vehicleFamily.generation}.",
    );
    expect(source).toContain("click on the category image to browse parts");
    expect(source).toContain("absolute bottom-5 left-5");
    expect(source).toContain("Exploded vehicle category map");
    expect(source).toContain("getCategoryFamilyHref('VC-BODY')");
    expect(source).toContain("clipPath: layer.clipPath");
  });

  it("moves actual exploded part layers continuously and restores an unchanged completed vehicle", async () => {
    const source = await readFile("apps/preview-player/components/dvtg-preview.tsx", "utf8");
    expect(source).toContain("explosionVisualLayers.map");
    expect(source).toContain("mixBlendMode: 'screen'");
    expect(source).toContain("layer.fromScale + (1 - layer.fromScale) * partProgress");
    expect(source).toContain("const completedFlowStorageKey = 'dial:completed-visual-flow:v1'");
    expect(source).toContain("readCompletedVehicle() === vehicleFingerprint(selection)");
    expect(source).toContain("setProgress(1)");
    expect(source).toContain("clearCompletedVehicle()");
    expect(source).toContain("exploded-single-wheel-v2.avif");
  });

  it("publishes the shortened transition and invisible hit-map stages", async () => {
    const flow = JSON.parse(
      await readFile(
        "apps/preview-player/public/packs/VF-TOYOTA-HILUX-AN130-DC-FL/v1/navigation/hero-to-epc-flow-pack.json",
        "utf8",
      ),
    );
    const ids = flow.stages.map((stage: { id: string }) => stage.id);
    expect(ids).not.toContain("TECHNICAL_SHADED");
    expect(ids).not.toContain("VISUAL_HOTSPOTS");
    expect(ids).toContain("VISUAL_HIT_MAP");
    expect(flow.autoplay.userPlayControl).toBe(false);
    expect(flow.autoplay.automaticReplayWhenVehicleUnchanged).toBe(false);
    expect(flow.autoplay.completedVehicleReturnState).toBe("RESTORE_SETTLED_EXPLODED");
    expect(flow.visualIntegrity.wheelMultiplicityRule).toBe(
      "EXACTLY_ONE_TYRE_PER_PHYSICAL_WHEEL_POSITION",
    );
  });
});
