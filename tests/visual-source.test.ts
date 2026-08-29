import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  buildVisualTransitionSourceQueue,
  isAcceptedOpenLicense,
  VISUAL_CATEGORY_ROUTE_TEMPLATES,
} from "../packages/catalog-coverage/src/visual-source.js";

describe("catalog-wide visual source and transition queue", () => {
  it("creates one identity-safe transition contract for every marked vehicle", async () => {
    const universe = JSON.parse(
      await readFile("catalog-data/generated/vehicle-universe.json", "utf8"),
    );
    const queue = buildVisualTransitionSourceQueue(universe);
    const expectedCount = universe.makers.reduce(
      (total: number, maker: { models: unknown[] }) => total + maker.models.length,
      0,
    );

    expect(queue.counts.vehicles).toBe(expectedCount);
    expect(queue.vehicles).toHaveLength(expectedCount);
    expect(new Set(queue.vehicles.map((vehicle) => vehicle.vehicleKey)).size).toBe(expectedCount);
    expect(new Set(queue.vehicles.map((vehicle) => vehicle.plannedFlowPackId)).size).toBe(
      expectedCount,
    );
  });

  it("never assigns the Hilux development fixture to another vehicle", async () => {
    const universe = JSON.parse(
      await readFile("catalog-data/generated/vehicle-universe.json", "utf8"),
    );
    const queue = buildVisualTransitionSourceQueue(universe);
    const fixtures = queue.vehicles.filter(
      (vehicle) => vehicle.existingDevelopmentFixtureId !== null,
    );

    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].vehicleKey).toMatch(/^toyota\/hilux/);
    expect(
      queue.vehicles
        .filter((vehicle) => vehicle.vehicleKey !== fixtures[0].vehicleKey)
        .every((vehicle) => vehicle.existingDevelopmentFixtureId === null),
    ).toBe(true);
  });

  it("prepares complete canonical category mappings before EPC IDs are injected", () => {
    expect(VISUAL_CATEGORY_ROUTE_TEMPLATES).toHaveLength(7);
    expect(
      VISUAL_CATEGORY_ROUTE_TEMPLATES.find((mapping) => mapping.visualCategoryId === "VC-ENG")
        ?.sectionSlug,
    ).toBe("engine");
    expect(
      VISUAL_CATEGORY_ROUTE_TEMPLATES.find((mapping) => mapping.visualCategoryId === "VC-BODY")
        ?.sectionSlug,
    ).toBe("body-exterior");
  });

  it("accepts commercial open licenses and rejects NC or ND derivatives", () => {
    expect(isAcceptedOpenLicense("CC0 1.0")).toBe(true);
    expect(isAcceptedOpenLicense("Public Domain Mark 1.0")).toBe(true);
    expect(isAcceptedOpenLicense("CC BY 4.0")).toBe(true);
    expect(isAcceptedOpenLicense("CC BY-SA 4.0")).toBe(true);
    expect(isAcceptedOpenLicense("CC BY-NC 4.0")).toBe(false);
    expect(isAcceptedOpenLicense("CC BY-ND 4.0")).toBe(false);
  });

  it("automates allowlisted license handling and reserves review for vehicle identity", async () => {
    const universe = JSON.parse(
      await readFile("catalog-data/generated/vehicle-universe.json", "utf8"),
    );
    const queue = buildVisualTransitionSourceQueue(universe);

    expect(queue.sourceStrategy.policy.requireHumanLicenseApproval).toBe(false);
    expect(queue.sourceStrategy.policy.requireHumanIdentityApproval).toBe(true);
    expect(
      queue.vehicles.every(
        (vehicle) =>
          vehicle.sourceDiscovery.licenseApprovalMode === "AUTOMATED_ALLOWLIST" &&
          vehicle.sourceDiscovery.identityApprovalRequired,
      ),
    ).toBe(true);
  });
});
