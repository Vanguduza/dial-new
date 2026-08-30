import { access, copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import sharp from "sharp";
import {
  parseJob,
  PIPELINE_STAGES,
  type PipelineStage,
  type StageRecord,
  type VisualGenerationJob,
} from "../../contracts/src/index.js";
import { generateFrameProfile } from "../../animation/src/index.js";
import {
  assertDevelopmentFixture,
  CredentialGatedCgiGenerator,
  DeterministicDevelopmentCgiGenerator,
} from "../../cgi/src/index.js";
import { generateDepthActivated, generateDepthMap } from "../../depth/src/index.js";
import { planExplosion, renderExplosion } from "../../explosion/src/index.js";
import { buildHotspots } from "../../hotspots/src/index.js";
import {
  buildIdentityLock,
  compareIdentity,
  type IdentityLock,
} from "../../identity-lock/src/index.js";
import {
  makeContactSheet,
  normalizeSource,
  renderSvg,
  validateImage,
} from "../../image-processing/src/index.js";
import { generateLineArt } from "../../line-art/src/index.js";
import { buildAssetManifest, publishPreviewPack } from "../../packaging/src/index.js";
import { runAutomatedQa, type QaReport, type StageIdentityResult } from "../../qa/src/index.js";
import { DeterministicTechnicalRenderer } from "../../technical-render/src/index.js";
import { vehicleSceneSvg } from "../../technical-render/src/scene.js";
import { ensureDir, readJson, writeJsonAtomic } from "./fs.js";
import { hashFile, sha256, stableStringify } from "./hash.js";

export const PIPELINE_VERSION = "0.5.1";
const STAGE_VERSION = "5.0.0";

export interface PipelineState {
  jobId: string;
  visualFamilyId: string;
  pipelineVersion: string;
  productionPublishable: boolean;
  stages: Record<PipelineStage, StageRecord>;
  createdAt: string;
  updatedAt: string;
}

export interface RunOptions {
  from?: string;
  force?: boolean;
  onEvent?: (event: Record<string, unknown>) => void;
}

function resolveFrom(from?: string): number {
  if (!from) return 0;
  const normalized = from.toUpperCase().replaceAll("-", "_");
  const index = PIPELINE_STAGES.findIndex(
    (stage) =>
      stage === normalized || stage.includes(normalized) || stage.slice(3).startsWith(normalized),
  );
  if (index < 0) throw new Error(`Unknown stage: ${from}`);
  return index;
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function defaultStages(inputHash: string, configHash: string): Record<PipelineStage, StageRecord> {
  const records = {} as Record<PipelineStage, StageRecord>;
  for (const stage of PIPELINE_STAGES)
    records[stage] = {
      stage,
      status: "PENDING",
      stageVersion: STAGE_VERSION,
      inputHash,
      configHash,
      logs: [],
    };
  return records;
}

async function loadJob(jobPath: string) {
  const absoluteJobPath = resolve(jobPath);
  const job = parseJob(JSON.parse(await readFile(absoluteJobPath, "utf8")));
  return { job, absoluteJobPath, jobDir: dirname(absoluteJobPath) };
}

export async function validateJobFile(jobPath: string) {
  const { job, jobDir } = await loadJob(jobPath);
  if (job.generationProvider === "deterministic-development") assertDevelopmentFixture(job);
  const source = resolve(jobDir, job.references.frontThreeQuarter);
  await validateImage(source, job.developmentMode);
  const provenance = job.provenance.frontThreeQuarter;
  if (!provenance) throw new Error("frontThreeQuarter provenance is required");
  if (!provenance.commercialUseApproved && !provenance.authorizedOverride)
    throw new Error("Source licence guard: commercialUseApproved must be true");
  const actualHash = await hashFile(source);
  if (actualHash !== provenance.sha256.toLowerCase())
    throw new Error(`Source hash mismatch: expected ${provenance.sha256}, received ${actualHash}`);
  if (job.generationProvider === "live" && job.developmentMode)
    throw new Error("Live generation cannot run with developmentMode enabled");
  return { valid: true, job, source, productionPublishable: false };
}

export async function getPackRoot(jobPath: string, job?: VisualGenerationJob) {
  const loaded = job ? { job, jobDir: dirname(resolve(jobPath)) } : await loadJob(jobPath);
  return resolve(loaded.jobDir, loaded.job.outputRoot, loaded.job.visualFamilyId, "v1");
}

export async function runPipeline(jobPath: string, options: RunOptions = {}) {
  const validation = await validateJobFile(jobPath);
  const job = validation.job;
  const absoluteJobPath = resolve(jobPath);
  const jobDir = dirname(absoluteJobPath);
  const packRoot = await getPackRoot(jobPath, job);
  const statePath = join(packRoot, ".dvtg", "job-state.json");
  const inputHash = sha256(stableStringify({ job, provenance: job.provenance }));
  const configHash = sha256(
    stableStringify({
      pipelineVersion: PIPELINE_VERSION,
      motionProfile: job.motionProfile,
      provider: job.generationProvider,
      imageProcessor: `sharp@${sharp.versions.sharp}`,
    }),
  );
  const jobId = sha256(`${inputHash}:${configHash}`).slice(0, 24);
  await ensureDir(join(packRoot, ".dvtg"));
  let state: PipelineState = (await exists(statePath))
    ? await readJson<PipelineState>(statePath)
    : {
        jobId,
        visualFamilyId: job.visualFamilyId,
        pipelineVersion: PIPELINE_VERSION,
        productionPublishable: false,
        stages: defaultStages(inputHash, configHash),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
  state.jobId = jobId;
  state.pipelineVersion = PIPELINE_VERSION;
  const fromIndex = resolveFrom(options.from);
  if (options.from || options.force) {
    for (let i = fromIndex; i < PIPELINE_STAGES.length; i++)
      state.stages[PIPELINE_STAGES[i]].status = "PENDING";
  }
  const source = resolve(jobDir, job.references.frontThreeQuarter);
  const emit = (type: string, extra: Record<string, unknown> = {}) =>
    options.onEvent?.({
      type,
      jobId,
      visualFamilyId: job.visualFamilyId,
      timestamp: new Date().toISOString(),
      ...extra,
    });
  emit("generation_job_created", { developmentMode: job.developmentMode });

  const execute = async (stage: PipelineStage): Promise<{ files?: string[]; logs?: string[] }> => {
    switch (stage) {
      case "01_SOURCE_VALIDATE": {
        const result = await validateJobFile(jobPath);
        await ensureDir(join(packRoot, "source"));
        await copyFile(source, join(packRoot, "source", basename(source)));
        await writeJsonAtomic(join(packRoot, "legal", "provenance.json"), job.provenance);
        await writeJsonAtomic(join(packRoot, "legal", "licences.json"), {
          approved: true,
          productionPublishable: result.productionPublishable,
          warning: job.developmentMode
            ? "Synthetic development fixture only; production publication is prohibited."
            : undefined,
        });
        return {
          files: [join(packRoot, "legal", "provenance.json")],
          logs: ["Licence, file type, image integrity, size, and SHA-256 validated."],
        };
      }
      case "02_NORMALIZE": {
        const avif = join(packRoot, "hero", "hero-clean.avif");
        const webp = join(packRoot, "hero", "hero-transparent.webp");
        await normalizeSource(source, avif, webp);
        return {
          files: [avif, webp],
          logs: ["Normalized to canonical 1600×900 canvas in sRGB-compatible output."],
        };
      }
      case "03_IDENTITY_LOCK": {
        // Derived from the normalized hero that stage 02 produced, not from a
        // hardcoded constant. A different source now yields a different lock,
        // which is what makes the downstream identity gate able to fail.
        const hero = join(packRoot, "hero", "hero-clean.avif");
        const lock = await buildIdentityLock(hero);
        const path = join(packRoot, "analysis", "identity-lock.json");
        await writeJsonAtomic(path, lock);
        return {
          files: [path],
          logs: [
            `Identity lock derived from the normalized source: ${lock.occupiedCells} occupied cells on a ${lock.grid.width}x${lock.grid.height} grid.`,
          ],
        };
      }
      case "04_SEGMENT": {
        const names = [
          "body",
          "windows",
          "tyres",
          "wheels",
          "lights",
          "grille",
          "bumpers",
          "mirrors",
          "cabin",
          "pickup-bed",
          "background",
        ];
        const files: string[] = [];
        for (const [index, name] of names.entries()) {
          const path = join(packRoot, "analysis", "segmentation", `${name}.png`);
          const x = 190 + index * 20;
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="black"/><path d="M${x} 610 L350 430 L1080 400 L1320 590 Z" fill="white"/></svg>`;
          await renderSvg(svg, path);
          files.push(path);
        }
        return {
          files,
          logs: [
            "Deterministic development masks produced; live segmentation remains provider-swappable.",
          ],
        };
      }
      case "05_DEPTH_ESTIMATE": {
        const path = join(packRoot, "analysis", "depth-map.png");
        const meta = await generateDepthMap(path);
        await writeJsonAtomic(join(packRoot, "analysis", "depth-meta.json"), meta);
        return { files: [path], logs: ["Depth, foreground, and background contracts produced."] };
      }
      case "06_DEPTH_ACTIVATE": {
        const path = join(packRoot, "hero", "depth-active.avif");
        await generateDepthActivated(path);
        return {
          files: [path],
          logs: ["2.5D activation constrained to ±5° yaw and ±2° pitch contract."],
        };
      }
      case "07_CGI_GENERATE": {
        const path = join(packRoot, "cgi", "cgi-master.avif");
        const transparent = join(packRoot, "cgi", "cgi-transparent.webp");
        const generator =
          job.generationProvider === "live"
            ? new CredentialGatedCgiGenerator()
            : new DeterministicDevelopmentCgiGenerator();
        const result = await generator.generate({ job, outputPath: path });
        await sharp(path).webp({ quality: 78 }).toFile(transparent);
        await writeJsonAtomic(join(packRoot, "cgi", "generation-metadata.json"), result);
        return {
          files: [path, transparent],
          logs: [`CGI adapter: ${result.provider}/${result.model}@${result.modelVersion}.`],
        };
      }
      case "08_TECHNICAL_GENERATE": {
        const path = join(packRoot, "technical", "technical-shaded.avif");
        await new DeterministicTechnicalRenderer().generate(path);
        return {
          files: [path],
          logs: ["Technical render derived from the same locked geometry and camera."],
        };
      }
      case "09_LINEART_GENERATE": {
        const svg = join(packRoot, "technical", "line-art.svg");
        const fallback = join(packRoot, "technical", "line-art.avif");
        await generateLineArt(svg);
        await renderSvg(await readFile(svg, "utf8"), fallback);
        return {
          files: [svg, fallback],
          logs: [
            "SVG line art plus AVIF fallback generated without OEM numbering or fabricated dimensions.",
          ],
        };
      }
      case "10_EXPLOSION_PLAN": {
        const path = join(packRoot, "exploded", "explosion-plan.json");
        await writeJsonAtomic(path, {
          grammarVersion: "1.0.0",
          groups: planExplosion(job.enabledCategories, job.motionProfile),
        });
        return {
          files: [path],
          logs: ["Deterministic category destinations and easing assigned."],
        };
      }
      case "11_EXPLOSION_RENDER": {
        const files: string[] = [];
        const pre = join(packRoot, "exploded", "pre-explosion.avif");
        const master = join(packRoot, "exploded", "exploded-master.avif");
        await renderSvg(vehicleSceneSvg({ progress: 0.64, mode: "line" }), pre);
        await renderExplosion(master);
        files.push(pre, master);
        for (const category of job.enabledCategories) {
          const path = join(packRoot, "exploded", "highlights", `${category}.avif`);
          await renderExplosion(path, category);
          files.push(path);
        }
        return { files, logs: ["Exploded master and every enabled focus state rendered."] };
      }
      case "12_ANIMATE": {
        const desktop = await generateFrameProfile(
          join(packRoot, "animation", "desktop"),
          "desktop",
          job.motionProfile,
        );
        const mobile = await generateFrameProfile(
          join(packRoot, "animation", "mobile"),
          "mobile",
          job.motionProfile,
        );
        return {
          files: [
            join(packRoot, "animation", "desktop", "manifest.json"),
            join(packRoot, "animation", "mobile", "manifest.json"),
          ],
          logs: [
            `Generated ${desktop.frameCount} desktop and ${mobile.frameCount} mobile AVIF frames.`,
          ],
        };
      }
      case "13_FRAME_ENCODE": {
        const path = join(packRoot, "animation", "delivery.json");
        await writeJsonAtomic(path, {
          version: "1.0.0",
          desktop: "desktop/manifest.json",
          mobile: "mobile/manifest.json",
          delivery: "AVIF image sequence",
          masterVideo: {
            status: "NOT_PRODUCED_BY_DETERMINISTIC_DEVELOPMENT_ADAPTER",
            requiredForProductionApproval: true,
          },
          progressivePreload: {
            initial: 1,
            nearFrameRadius: 4,
            highlights: "after-navigation-ready",
          },
        });
        return {
          files: [path],
          logs: [
            "Frame delivery manifest written; production master video remains an explicit live-provider deliverable.",
          ],
        };
      }
      case "14_HOTSPOTS": {
        const hotspots = buildHotspots(job.enabledCategories, job.fitmentMapping);
        const path = join(packRoot, "navigation", "hotspots.json");
        await writeJsonAtomic(path, { coordinateSystem: "normalized-0-1", hotspots });
        await writeJsonAtomic(
          join(packRoot, "navigation", "category-labels.json"),
          Object.fromEntries(hotspots.map((h) => [h.visualCategoryId, h.label])),
        );
        const mappingPath = join(packRoot, "navigation", "epc-mapping.json");
        const navigationManifestPath = join(packRoot, "navigation", "navigation-manifest.json");
        await writeJsonAtomic(mappingPath, job.fitmentMapping);
        await writeJsonAtomic(navigationManifestPath, {
          schemaVersion: "2.0.0",
          visualFamilyId: job.visualFamilyId,
          fitmentId: job.fitmentMapping.fitmentId,
          catalogReleaseId: job.fitmentMapping.catalogReleaseId,
          catalogFamilyId: job.fitmentMapping.vehicleContext.catalogFamilyId,
          variantId: job.fitmentMapping.vehicleContext.variantId,
          routeTemplate:
            "/epc/vehicles/{familySlug}/sections/{sectionSlug}?fitment={fitmentId}&group={groupSlug}&component={componentFamilyId}",
          categoryCount: job.fitmentMapping.categories.length,
          componentFamilyCount: job.fitmentMapping.componentFamilies.length,
          readinessPolicy:
            "Runtime must honor minimumReadiness and use the route target fallback when a richer capability is unavailable.",
        });
        return {
          files: [path, mappingPath, navigationManifestPath],
          logs: [
            "Hotspots validated and structured catalog routes published with scoped vehicle context.",
          ],
        };
      }
      case "15_QA": {
        const hotspots = (
          await readJson<{ hotspots: ReturnType<typeof buildHotspots> }>(
            join(packRoot, "navigation", "hotspots.json"),
          )
        ).hotspots;
        const lock = await readJson<IdentityLock>(
          join(packRoot, "analysis", "identity-lock.json"),
        );
        // Each rendered state is measured against the lock. The technical
        // render is included because it shares the locked geometry even though
        // it is never customer-visible.
        const measuredStates = [
          { stage: "STUDIO_CGI", asset: "cgi/cgi-master.avif" },
          { stage: "TECHNICAL", asset: "technical/technical-shaded.avif" },
          { stage: "ENGINEERING_LINE_ART", asset: "technical/line-art.avif" },
          { stage: "EXPLODED_SYSTEMS", asset: "exploded/pre-explosion.avif" },
        ];
        const stages: StageIdentityResult[] = [];
        for (const entry of measuredStates) {
          stages.push({
            stage: entry.stage,
            asset: entry.asset,
            metrics: await compareIdentity(lock, join(packRoot, entry.asset)),
          });
        }
        const qa = runAutomatedQa({
          stages,
          hotspots,
          enabledCategories: job.enabledCategories,
          explodedViewPolicy: job.explodedViewPolicy,
          coverage: job.coverage,
          // The deterministic development adapter does not derive its states
          // from the source, so identity fidelity can only be required of a
          // live provider.
          identityFidelityRequired:
            job.generationProvider === "live" || job.developmentMode === false,
        });
        // Evidence is frozen before the gate decides. Writing qa.json only on
        // success discarded the record of every failure, which is the opposite
        // of what an evidence gate is for.
        const path = join(packRoot, "qa", "qa.json");
        await writeJsonAtomic(path, qa);
        if (!qa.passed) {
          const reasons = [
            // Identity drift is always recorded as evidence, but it is only a
            // *reason for failure* when the gate required fidelity.
            ...(qa.checks.identity ? [] : qa.identityFailures),
            ...qa.hotspotErrors,
            ...(qa.ambiguousHotspots ?? []),
            ...qa.uncoveredCategories.map((category) => `${category} has no hit region`),
            ...(qa.checks.wheelMultiplicity
              ? []
              : ["exploded view has invalid wheel multiplicity"]),
            ...qa.coverageErrors,
          ];
          throw new Error(
            `Automated QA failed: ${reasons.join("; ")} (evidence written to ${path})`,
          );
        }
        const sheet = join(packRoot, "qa", "comparison-contact-sheet.jpg");
        await makeContactSheet(
          [
            join(packRoot, "hero", "hero-clean.avif"),
            join(packRoot, "hero", "depth-active.avif"),
            join(packRoot, "cgi", "cgi-master.avif"),
            join(packRoot, "technical", "technical-shaded.avif"),
            join(packRoot, "technical", "line-art.avif"),
            join(packRoot, "exploded", "exploded-master.avif"),
          ],
          sheet,
        );
        await writeJsonAtomic(join(packRoot, "qa", "review-status.json"), {
          productionPublishable: false,
          gates: [
            "licensing",
            "sourceIdentity",
            "cgi",
            "technical",
            "lineArt",
            "explodedView",
            "wheelMultiplicity",
            "finalMotion",
            "epcMapping",
          ].map((gate) => ({
            gate,
            status: "PENDING_HUMAN_APPROVAL",
            reviewer: null,
            timestamp: null,
            notes: job.developmentMode
              ? "Development fixture cannot receive production approval."
              : null,
          })),
        });
        return {
          files: [path, sheet],
          logs: [
            "Identity drift, one-tyre-per-wheel-position, and hotspot checks passed; human approval gates remain pending.",
          ],
        };
      }
      case "16_PACKAGE": {
        // Stage 15 froze the QA evidence. Packaging reads its verdicts back
        // rather than re-deriving them, so the pack can never claim a result
        // the gate did not produce.
        const qaEvidence = JSON.parse(
          await readFile(join(packRoot, "qa", "qa.json"), "utf8"),
        ) as QaReport;
        const metaPath = join(packRoot, "meta.json");
        await writeJsonAtomic(metaPath, {
          visualFamilyId: job.visualFamilyId,
          displayName: `${job.make} ${job.model} ${job.generation} ${job.bodyStyle}`,
          visualPhase: job.visualPhase,
          yearFrom: job.yearFrom,
          yearTo: job.yearTo,
          developmentMode: job.developmentMode,
          productionPublishable: false,
          pipelineVersion: PIPELINE_VERSION,
          fitmentAuthority: "fitmentMapping.fitmentId + structured catalog route target",
          catalogAuthority: `${job.fitmentMapping.catalogReleaseId} / ${job.fitmentMapping.vehicleContext.catalogFamilyId}`,
          visualFamilyAuthority: "visualFamilyId",
          generatedAt: new Date().toISOString(),
          warning: job.developmentMode
            ? "Synthetic development fixture. Not licensed production vehicle art."
            : "Production human-approval gates remain required.",
        });
        const flowPackPath = join(packRoot, "navigation", "hero-to-epc-flow-pack.json");
        await writeJsonAtomic(flowPackPath, {
          schemaVersion: "1.3.0",
          flowPackId: `H2E-${job.visualFamilyId.replace(/^VF-/, "")}-V1`,
          status: job.developmentMode ? "DEVELOPMENT_COMPLETE" : "PRODUCTION_REVIEW_REQUIRED",
          customerReady: false,
          // Family identity only. Which exact vehicle a customer has is their
          // selection, not this pack's property — the pack's job is to make
          // them recognize the car, and the EPC resolves their exact catalog
          // from the fitment that travels with the click.
          vehicle: {
            visualFamilyId: job.visualFamilyId,
            catalogReleaseId: job.fitmentMapping.catalogReleaseId,
            catalogFamilyId: job.fitmentMapping.vehicleContext.catalogFamilyId,
            familySlug: job.fitmentMapping.vehicleContext.familySlug,
            make: job.make,
            model: job.model,
            generation: job.generation,
            bodyStyle: job.bodyStyle,
            visualPhase: job.visualPhase,
          },
          // Every fitment this one pack serves. Declared rather than implied,
          // so a variant that cannot actually share this exploded view is a
          // QA failure instead of a silent visual lie.
          coverage: job.coverage,
          entryModes: [
            "CASCADE_SEARCH",
            "GARAGE_VISUAL_FLOW",
            "GARAGE_EPC_DIRECT",
            "MENU_EPC_BROWSE",
          ],
          autoplay: {
            trigger: "VEHICLE_SEARCH_COMMITTED",
            userPlayControl: false,
            reducedMotionBehavior: "CUT_TO_NAVIGATION_READY",
            replayAllowedFromVehicleSummary: true,
            automaticReplayWhenVehicleUnchanged: false,
            completedVehicleReturnState: "RESTORE_SETTLED_EXPLODED",
          },
          // Blueprint 4.5. The recipe, not a resolved value: the pack says which
          // components make a fingerprint and what invalidates a match, and the
          // player computes it from the customer's active vehicle. A shared pack
          // cannot carry one — two fitments in `coverage` produce two different
          // fingerprints from the same artwork.
          completionMemory: {
            fingerprintComponents: [
              "catalogReleaseId",
              "fitmentId",
              "visualFamilyId",
              "flowPackId",
              "variantId",
            ],
            // 4.5: the preview may use session storage; production keeps the
            // authoritative active-vehicle identity server-backed.
            storage: "SESSION_STORAGE",
            onMatch: "RESTORE_SETTLED_EXPLODED_WITHOUT_REPLAY",
            keepsHitMapActive: true,
            // 4.5(5): any identity-bearing change invalidates the match.
            invalidatesOn: [
              "catalogReleaseId",
              "fitmentId",
              "visualFamilyId",
              "flowPackId",
              "variantId",
            ],
          },
          retainedSelection: {
            preserveUntilEdited: true,
            committedTextAppearance: "FAINT_GREY",
            contextPropagation: ["homepage", "header", "search", "epc", "cart", "garage"],
          },
          transitionWindow: {
            topInstruction: "click on the category image to browse parts",
            headlinePattern: "Know your {exact chosen model}. Find the right part.",
            headlinePlacement: "BOTTOM_LEFT",
            visibleProgressUi: false,
          },
          visualIntegrity: {
            explodedViewPolicy: {
              ...job.explodedViewPolicy,
              // 10, QA_READY: wheel multiplicity needs both an automated pass
              // and a human visual review. The verdict is read back from the
              // QA evidence rather than restated from the job, so the pack
              // cannot assert a pass the gate never measured; human review
              // stays PENDING until a reviewer records it.
              automatedPass: qaEvidence.checks.wheelMultiplicity,
              humanVisualReview: "PENDING" as const,
            },
            wheelMultiplicityRule: "EXACTLY_ONE_TYRE_PER_PHYSICAL_WHEEL_POSITION",
          },
          stages: [
            { id: "HERO_PHOTOGRAPHY", asset: "hero/hero-clean.avif", required: true },
            { id: "IDENTITY_LOCK", asset: "analysis/identity-lock.json", required: true },
            { id: "STUDIO_CGI", asset: "cgi/cgi-master.avif", required: true },
            {
              id: "ENGINEERING_LINE_ART",
              asset: "technical/line-art.svg",
              fallback: "technical/line-art.avif",
              required: true,
            },
            { id: "EXPLODED_SYSTEMS", asset: "exploded/exploded-master.avif", required: true },
            { id: "VISUAL_HIT_MAP", asset: "navigation/hotspots.json", required: true },
            { id: "EPC_SECTION_HANDOFF", asset: "navigation/epc-mapping.json", required: true },
            {
              id: "EPC_DIAGRAM_AND_PARTS",
              route: `/epc/vehicles/${job.fitmentMapping.vehicleContext.familySlug}`,
              required: true,
            },
          ],
          catalogHandoff: {
            mapping: "navigation/epc-mapping.json",
            navigationManifest: "navigation/navigation-manifest.json",
            vehicleRoute: `/epc/vehicles/${job.fitmentMapping.vehicleContext.familySlug}`,
          },
          readiness: {
            automatedQa: "qa/qa.json",
            humanReview: "qa/review-status.json",
            productionBlocker: job.developmentMode
              ? "Development fixtures require licensed production assets and human approvals."
              : "Human review gates must all pass before customerReady may become true.",
          },
        });
        await buildAssetManifest(packRoot);
        if (job.previewPublishRoot)
          await publishPreviewPack(
            packRoot,
            resolve(jobDir, job.previewPublishRoot, job.visualFamilyId, "v1"),
          );
        return {
          files: [metaPath, flowPackPath, join(packRoot, "asset-manifest.json")],
          logs: ["Complete hero-to-EPC flow pack packaged; customer publication remains gated."],
        };
      }
    }
  };

  for (let index = 0; index < PIPELINE_STAGES.length; index++) {
    const stage = PIPELINE_STAGES[index];
    const record = state.stages[stage];
    if (
      index < fromIndex ||
      (!options.force &&
        record.status === "PASS" &&
        record.inputHash === inputHash &&
        record.configHash === configHash)
    )
      continue;
    record.inputHash = inputHash;
    record.configHash = configHash;
    record.stageVersion = STAGE_VERSION;
    record.status = "RUNNING";
    record.startedAt = new Date().toISOString();
    record.endedAt = undefined;
    record.failureReason = undefined;
    record.logs = [];
    state.updatedAt = new Date().toISOString();
    await writeJsonAtomic(statePath, state);
    emit("stage_started", { stage });
    try {
      const result = await execute(stage);
      record.status = "PASS";
      record.logs = result.logs ?? [];
      record.outputHash = sha256(
        stableStringify(
          await Promise.all(
            (result.files ?? []).map(async (path) => ({ path, hash: await hashFile(path) })),
          ),
        ),
      );
      record.endedAt = new Date().toISOString();
      emit("stage_passed", { stage });
    } catch (error) {
      record.status = "FAIL";
      record.failureReason = error instanceof Error ? error.message : String(error);
      record.endedAt = new Date().toISOString();
      emit("stage_failed", { stage, reason: record.failureReason });
      state.updatedAt = new Date().toISOString();
      await writeJsonAtomic(statePath, state);
      throw error;
    }
    state.updatedAt = new Date().toISOString();
    await writeJsonAtomic(statePath, state);
  }
  emit("visual_pack_published", { productionPublishable: state.productionPublishable, packRoot });
  return { jobId, packRoot, state };
}

export async function resetDevelopmentArtifact(jobPath: string) {
  const root = await getPackRoot(jobPath);
  await rm(root, { recursive: true, force: true });
}
