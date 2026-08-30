import { readFile } from "node:fs/promises";
import { runGuardedTransition } from "../../scene-engine/src/index.js";
import { runPipeline, type RunOptions } from "./index.js";

/** Shared dispatcher used by the CLI, worker and API: never select a renderer by make/model. */
export async function generateVehicle(jobPath: string, options: RunOptions = {}) {
  const input = JSON.parse(await readFile(jobPath, "utf8"));
  if (input.sceneEngineVersion !== undefined) {
    if (options.from) throw new Error("Shared-scene jobs always revalidate the full source chain; stage skipping is not allowed.");
    const result = await runGuardedTransition(jobPath, options.onEvent);
    return { packRoot: result.packRoot, status: result.status, productionPublishable: false };
  }
  if (input.generationProvider === "live" || input.developmentMode !== true) {
    throw new Error("Independent-stage production jobs are disabled. Use a sceneEngineVersion 1.0.0 shared-component job; raw hero reconstruction must pass its quality gates first.");
  }
  const result = await runPipeline(jobPath, options);
  return { packRoot: result.packRoot, status: "DEVELOPMENT_FIXTURE_ONLY", productionPublishable: false };
}
