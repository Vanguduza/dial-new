import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { confinedExisting } from "./assets.js";
import { writeEvidence } from "./package.js";
import type { ReconstructionProvider } from "./factory.js";

const workerSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), version: z.string().min(1),
  executable: z.string().min(1), args: z.array(z.string()),
  timeoutMs: z.number().int().min(1000).max(3_600_000).default(600_000),
}).strict();

/** Explicit operator configuration, not data supplied by a catalog or image provider.
 * The engine never evals job content, installs models, or launches a shell.
 */
export async function loadReconstructionWorkers(configPath: string): Promise<ReconstructionProvider[]> {
  const config = z.object({ workers: z.array(workerSchema).max(8) }).strict().parse(JSON.parse(await readFile(configPath, "utf8")));
  if (new Set(config.workers.map((worker) => worker.id)).size !== config.workers.length) throw new Error("Worker IDs must be unique");
  return config.workers.map((worker) => {
    if (!isAbsolute(worker.executable)) throw new Error("Worker executable must be an explicit absolute path");
    return { id: worker.id, version: worker.version, async reconstruct(request) {
      const requestPath = join(request.outputDirectory, "request.json"), responsePath = join(request.outputDirectory, "response.json");
      await writeEvidence(requestPath, { protocolVersion: "1.0.0", ...request, rules: {
        preserveHeroAndVisualFamily: true, preserveCatalogAuthority: true,
        output: "SELF_CONTAINED_REGISTERED_COMPONENT_SCENE_JOB", independentStageImagesAllowed: false,
        humanReview: "PENDING", exactDrivetrainClaimsAllowed: false,
      } });
      const args = worker.args.map((arg) => arg.replaceAll("{request}", requestPath).replaceAll("{response}", responsePath));
      await new Promise<void>((resolvePromise, reject) => {
        const child = spawn(worker.executable, args, { cwd: request.outputDirectory, shell: false, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
        // Bound memory; do not persist arbitrary provider output or credentials into a pack.
        child.stderr.on("data", () => {});
        const timer = setTimeout(() => { child.kill(); reject(new Error(`Reconstruction worker ${worker.id} timed out`)); }, worker.timeoutMs);
        child.on("error", (error) => { clearTimeout(timer); reject(error); });
        child.on("exit", (code) => { clearTimeout(timer); code === 0 ? resolvePromise() : reject(new Error(`Reconstruction worker ${worker.id} exited with code ${code}`)); });
      });
      const response = z.object({ job: z.string().min(1).nullable() }).strict().parse(JSON.parse(await readFile(responsePath, "utf8")));
      return response.job ? confinedExisting(request.outputDirectory, response.job) : null;
    } };
  });
}
