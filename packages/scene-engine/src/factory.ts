import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { hostname } from "node:os";
import { z } from "zod";
import sharp from "sharp";
import { MOTION_PROFILES } from "../../contracts/src/index.js";
import { stableStringify } from "../../pipeline-core/src/hash.js";
import { confine, confinedExisting, digest, makeConfinedDirectory, readAsset } from "./assets.js";
import { componentSceneSchema, report, SceneGateError, SCENE_ENGINE_VERSION, SCENE_GATES, sceneJobSchema, type GateReport, type SceneJob } from "./contracts.js";
import { runGuardedTransition, validateSceneJob } from "./index.js";
import { writeEvidence } from "./package.js";
import { repairAdvice, repairResidualOwnership } from "./recovery.js";

export const FACTORY_VERSION = "1.0.0";
export const batchSchema = z.object({
  productionVersion: z.literal("1.0.0"), outputRoot: z.string().default("production-runs"),
  concurrency: z.number().int().min(1).max(8).default(2),
  maxCandidates: z.number().int().min(1).max(8).default(3),
  maxRepairsPerCandidate: z.number().int().min(0).max(3).default(1),
  jobs: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9-]+$/), job: z.string(), candidates: z.array(z.string()).default([]) }).strict()).min(1),
}).strict();

export interface ReconstructionRequest {
  jobPath: string; outputDirectory: string; attempt: number;
  previousQuality: GateReport | null; repairAdvice: ReturnType<typeof repairAdvice>;
}
export interface ReconstructionProvider {
  id: string; version: string;
  /** Return a self-contained scene JOB inside outputDirectory, or null when unavailable. */
  reconstruct(request: ReconstructionRequest): Promise<string | null>;
}
interface Attempt { candidate: number; repair: number; action: string; status: "PASS" | "FAIL"; qa: string; pack?: string }
interface JobState {
  id: string; inputKey: string; visualFamilyId: string;
  state: "PROCESSING" | "PACK_BUILT_REVIEW_PENDING" | "NEEDS_RECONSTRUCTION" | "REPAIR_EXHAUSTED";
  customerReady: false; attempts: Attempt[]; pack?: string; diagnostic?: string;
}

async function atomic(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeEvidence(temporary, value); await rename(temporary, path);
}

async function dependencyKey(jobPath: string) {
  const job = sceneJobSchema.parse(JSON.parse(await readFile(jobPath, "utf8"))), root = dirname(jobPath);
  await readAsset(root, job.hero);
  let scene: unknown = null;
  if (job.sceneFile) {
    const path = await confinedExisting(root, job.sceneFile);
    const bytes = await readFile(path);
    let parsedJson: unknown;
    try { parsedJson = JSON.parse(bytes.toString("utf8")); } catch { parsedJson = null; }
    const parsed = componentSceneSchema.safeParse(parsedJson), assets: unknown[] = [];
    if (parsed.success) for (const asset of [parsed.data.foregroundMask, ...parsed.data.components.flatMap((part) => [part.asset, ...(part.reference ? [part.reference] : [])])]) {
      try { assets.push({ file: asset.file, actualHash: digest(await readFile(await confinedExisting(dirname(path), asset.file))) }); }
      catch { assets.push({ file: asset.file, unavailable: true }); }
    }
    // Invalid candidates still get a reproducible key and can enter repair/replacement.
    scene = { documentHash: digest(bytes), assets };
  }
  const { outputRoot: _output, ...identity } = job;
  return { job, hash: digest(stableStringify({ job: identity, scene, engine: SCENE_ENGINE_VERSION, factory: FACTORY_VERSION, schema: "scene-1.0/flow-1.3", motion: MOTION_PROFILES, gates: SCENE_GATES, encoder: sharp.versions })) };
}

export async function verifySealedPack(packRoot: string) {
  try {
    const seal = JSON.parse(await readFile(join(packRoot, "asset-manifest.json"), "utf8"));
    if (seal.engineVersion !== SCENE_ENGINE_VERSION || !Array.isArray(seal.assets) || !seal.assets.length || digest(stableStringify(seal.assets)) !== seal.contentHash) return false;
    const files = new Set<string>();
    for (const asset of seal.assets) {
      if (files.has(asset.file)) return false; files.add(asset.file);
      const bytes = await readAsset(packRoot, asset);
      if (bytes.length !== asset.bytes) return false;
    }
    const qa = JSON.parse(await readFile(join(packRoot, "qa/qa.json"), "utf8"));
    return files.has("manifest.json") && files.has("component-scene.json") && files.has("qa/qa.json") && qa.passed === true && qa.checks.length > 0 && qa.checks.every((check: { status: string }) => check.status === "PASS");
  } catch { return false; }
}

function quality(error: unknown): GateReport {
  return error instanceof SceneGateError ? error.report : report([{ gate: "CANDIDATE_INPUT_FAILURE", status: "FAIL", detail: error instanceof Error ? error.message : String(error) }]);
}

/** Durable local batch worker. A bad vehicle never throws out of its own work item. */
export async function produceBatch(planPath: string, providers: ReconstructionProvider[] = [], onEvent: (event: Record<string, unknown>) => void = () => {}) {
  const root = await realpath(dirname(resolve(planPath)));
  const plan = batchSchema.parse(JSON.parse(await readFile(planPath, "utf8")));
  if (new Set(plan.jobs.map((job) => job.id)).size !== plan.jobs.length) throw new Error("Batch job IDs must be unique");
  const output = confine(root, plan.outputRoot);
  // Establish containment before any writes, including through existing junctions.
  let ancestor = output;
  for (;;) { try { const actual = await realpath(ancestor); const rel = relative(root, actual); if (rel === ".." || rel.startsWith(`..${sep}`) || /^[a-z]:/i.test(rel)) throw new Error("Batch output escapes root"); break; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; ancestor = dirname(ancestor); } }
  await mkdir(output, { recursive: true });
  const lockPath = join(output, "worker.lock");
  const takeLock = () => open(lockPath, "wx");
  let lock;
  try { lock = await takeLock(); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const owner = JSON.parse(await readFile(lockPath, "utf8"));
    if (owner.host !== hostname() || !Number.isSafeInteger(owner.pid) || owner.pid < 1) throw new Error("Batch lease belongs to another worker; refusing to steal it");
    let alive = true; try { process.kill(owner.pid, 0); } catch (probe) { if ((probe as NodeJS.ErrnoException).code === "ESRCH") alive = false; }
    if (alive) throw new Error("This batch is already running");
    await unlink(lockPath); lock = await takeLock();
  }
  await lock.writeFile(JSON.stringify({ host: hostname(), pid: process.pid }));
  const states: JobState[] = new Array(plan.jobs.length);
  const claimedFamilies = new Map<string, string>();
  let cursor = 0;
  const relativeOutput = (path: string) => relative(output, path).replaceAll("\\", "/");
  try {
    const work = async () => {
      for (;;) {
        const index = cursor++; if (index >= plan.jobs.length) return;
        const item = plan.jobs[index], statePath = join(output, `${item.id}.json`);
        let state: JobState = { id: item.id, inputKey: "", visualFamilyId: "UNKNOWN", state: "PROCESSING", customerReady: false, attempts: [] };
        try {
          const jobPath = await confinedExisting(root, item.job);
          const input = await dependencyKey(jobPath);
          const owner = claimedFamilies.get(input.job.visualFamilyId);
          if (owner) throw new Error(`Visual family already belongs to work item ${owner}; merge fitment coverage into one family job`);
          claimedFamilies.set(input.job.visualFamilyId, item.id);
          const candidatePaths = await Promise.all(item.candidates.map((file) => confinedExisting(root, file)));
          const candidateHashes = await Promise.all(candidatePaths.map(async (file) => { try { return (await dependencyKey(file)).hash; } catch { return digest(await readFile(file)); } }));
          state.inputKey = digest(stableStringify({ input: input.hash, candidateHashes, providers: providers.map(({ id, version }) => ({ id, version })), maxCandidates: plan.maxCandidates, maxRepairs: plan.maxRepairsPerCandidate }));
          state.visualFamilyId = input.job.visualFamilyId;
          try {
            const saved = JSON.parse(await readFile(statePath, "utf8")) as JobState;
            if (saved.inputKey === state.inputKey && saved.pack && await verifySealedPack(await confinedExisting(output, saved.pack))) {
              states[index] = saved; onEvent({ type: "pack_reused", id: item.id }); continue;
            }
          } catch { /* Missing/incomplete/corrupt checkpoints are rebuilt without trusting them. */ }
          const run = await makeConfinedDirectory(output, `${item.id}/${state.inputKey.slice(0, 16)}-${randomUUID().slice(0, 8)}`);
          await atomic(statePath, state);
          const sources = [...(input.job.sceneFile ? [jobPath] : []), ...candidatePaths];
          let lastQuality: GateReport | null = null;
          for (let candidate = 0; candidate < plan.maxCandidates && !state.pack; candidate++) {
            let candidatePath = sources[candidate];
            let action = "VALIDATE_SCENE_CANDIDATE";
            const candidateRoot = join(run, `candidate-${candidate}`); await mkdir(candidateRoot, { recursive: true });
            if (!candidatePath) {
              const provider = providers[(candidate - sources.length) % Math.max(1, providers.length)];
              if (!provider) break;
              action = `RECONSTRUCT:${provider.id}`;
              try {
                const supplied = await provider.reconstruct({ jobPath, outputDirectory: candidateRoot, attempt: candidate, previousQuality: lastQuality, repairAdvice: lastQuality ? repairAdvice(lastQuality) : [] });
                if (!supplied) throw new SceneGateError(report([{ gate: "RECONSTRUCTION_PROVIDER_AVAILABILITY", status: "NOT_MEASURED", detail: `Worker ${provider.id} supplied no scene candidate.` }]));
                candidatePath = await confinedExisting(candidateRoot, relative(candidateRoot, supplied).replaceAll("\\", "/"));
              } catch (error) {
                lastQuality = quality(error);
                const qaPath = join(candidateRoot, "provider-qa.json"); await writeEvidence(qaPath, lastQuality);
                state.attempts.push({ candidate, repair: 0, action, status: "FAIL", qa: relativeOutput(qaPath) });
                await atomic(statePath, state); continue;
              }
            }
            for (let repair = 0; repair <= plan.maxRepairsPerCandidate; repair++) {
              const attemptRoot = join(candidateRoot, `attempt-${repair}`); await mkdir(attemptRoot, { recursive: true });
              const qaPath = join(attemptRoot, "qa.json");
              try {
                const candidateJob = sceneJobSchema.parse(JSON.parse(await readFile(candidatePath, "utf8")));
                if (candidateJob.visualFamilyId !== input.job.visualFamilyId || candidateJob.hero.sha256 !== input.job.hero.sha256) throw new Error("Candidate changed the locked vehicle identity or normalized hero");
                if (stableStringify(candidateJob.catalog ?? null) !== stableStringify(input.job.catalog ?? null)) throw new Error("Reconstruction cannot change catalog authority or coverage");
                if (candidateJob.frameCount !== input.job.frameCount || candidateJob.fps !== input.job.fps) throw new Error("Reconstruction cannot change the shared delivery profile");
                const valid = await validateSceneJob(candidatePath);
                await writeEvidence(qaPath, valid.qa); // Persist before deciding to render.
                // Materialize under this run: output paths never come from a provider.
                const scenePath = await confinedExisting(dirname(candidatePath), candidateJob.sceneFile!);
                const { archiveScene } = await import("./package.js");
                const portable = join(attemptRoot, "input"); await mkdir(portable, { recursive: true });
                await archiveScene(dirname(candidatePath), candidateJob, dirname(scenePath), valid.scene, portable, valid.motion);
                const result = await runGuardedTransition(join(portable, "input-job.json"), onEvent);
                await writeEvidence(qaPath, result.qa);
                state.pack = relativeOutput(result.packRoot);
                state.state = "PACK_BUILT_REVIEW_PENDING";
                state.attempts.push({ candidate, repair, action, status: "PASS", qa: relativeOutput(qaPath), pack: state.pack });
                await atomic(statePath, state); break;
              } catch (error) {
                lastQuality = quality(error); await writeEvidence(qaPath, lastQuality);
                state.attempts.push({ candidate, repair, action, status: "FAIL", qa: relativeOutput(qaPath) });
                await atomic(statePath, state);
                onEvent({ type: "candidate_repair_needed", id: item.id, candidate, repair, advice: repairAdvice(lastQuality) });
                if (repair >= plan.maxRepairsPerCandidate) break;
                const repaired = await repairResidualOwnership(candidatePath, lastQuality, join(attemptRoot, "repaired")).catch(() => null);
                if (!repaired) break;
                candidatePath = repaired; action = "REMOVE_DUPLICATED_SOURCE_OWNERSHIP";
              }
            }
          }
          if (!state.pack) {
            state.state = !sources.length && !providers.length ? "NEEDS_RECONSTRUCTION" : "REPAIR_EXHAUSTED";
            state.diagnostic = lastQuality ? repairAdvice(lastQuality).map((item) => `${item.gate}: ${item.action}`).join("; ") : "No registered scene or configured reconstruction worker is available. Other vehicles continue.";
          }
        } catch (error) {
          state.state = "REPAIR_EXHAUSTED"; state.diagnostic = error instanceof Error ? error.message : String(error);
          await writeEvidence(join(output, `${item.id}-input-qa.json`), quality(error));
        }
        await atomic(statePath, state); states[index] = state;
        onEvent({ type: "vehicle_finished", id: item.id, state: state.state });
      }
    };
    await Promise.all(Array.from({ length: Math.min(plan.concurrency, plan.jobs.length) }, work));
    const summary = { factoryVersion: FACTORY_VERSION, total: states.length, built: states.filter((item) => item.state === "PACK_BUILT_REVIEW_PENDING").length, needsReconstruction: states.filter((item) => item.state === "NEEDS_RECONSTRUCTION").length, repairExhausted: states.filter((item) => item.state === "REPAIR_EXHAUSTED").length, customerReady: 0, jobs: states };
    await atomic(join(output, "batch-summary.json"), summary);
    return summary;
  } finally { await lock.close(); await unlink(lockPath); }
}
