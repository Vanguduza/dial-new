import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  buildBacklogCoverageStages,
  buildObservedCoverageStages,
  evaluateCoverage,
  type CatalogIntegrityGate,
  type CatalogModelMetrics,
  type FlowPackReference,
} from "../../../packages/catalog-coverage/src/index.js";
import { buildVisualTransitionSourceQueue } from "../../../packages/catalog-coverage/src/visual-source.js";

interface MakerRow {
  slug: string;
  name: string | null;
  source: string | null;
}

interface ModelRow {
  maker_slug: string;
  slug: string;
  display_name: string | null;
  source: string | null;
  variant_slug: string | null;
  chassis_code: string | null;
  variant_name: string | null;
}

interface MetricRow {
  maker_slug: string;
  model_slug: string;
  count: number;
}

interface DiagramMetricRow extends MetricRow {
  image_count: number;
}

interface SupplementalMaker {
  slug: string;
  name: string;
  country: string;
  priority: "P0" | "P1" | "P2";
  reason: string;
  models: string[];
}

interface SupplementalConfig {
  schemaVersion: string;
  purpose: string;
  marketFocus: string[];
  reviewedAt: string;
  sources: string[];
  makers: SupplementalMaker[];
}

const DEFAULT_CATALOG =
  "../nissan gtr auto/Nissan-Gtr-Auto/data-pipeline/data/dist/gtr_catalog_7zap_v1.sqlite";
const DEFAULT_SUPPLEMENT = "config/supplemental-vehicle-targets.json";
const DEFAULT_OUTPUT = "catalog-data/generated";
const DEFAULT_PUBLIC_OUTPUT = "apps/preview-player/public/catalog";

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function deriveFamilyName(displayName: string): string {
  const cleaned = displayName
    .replace(
      /\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s+generation.*$/i,
      "",
    )
    .replace(/\s+(?:\d+(?:st|nd|rd|th)\s+)?facelift.*$/i, "")
    .trim();
  const tokens = cleaned.split(/\s+/);
  const code = /^(?:[A-Z]{1,5}\d+[A-Z0-9/-]*|[A-Z]{1,5}\d*\/[A-Z0-9/-]+|[IVX]{1,4})$/i;
  const cutoff = tokens.findIndex((token, index) => index > 0 && code.test(token));
  return (cutoff > 0 ? tokens.slice(0, cutoff).join(" ") : cleaned) || displayName;
}

function metricMap(rows: MetricRow[]): Map<string, number> {
  return new Map(rows.map((row) => [`${row.maker_slug}/${row.model_slug}`, Number(row.count)]));
}

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function databaseUrl(path: string): URL {
  const url = pathToFileURL(resolve(path));
  url.searchParams.set("mode", "ro");
  url.searchParams.set("immutable", "1");
  return url;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function build(): Promise<void> {
  const catalogPath = option("--catalog", DEFAULT_CATALOG);
  const supplementalPath = resolve(option("--supplement", DEFAULT_SUPPLEMENT));
  const outputRoot = resolve(option("--output", DEFAULT_OUTPUT));
  const publicRoot = resolve(option("--public-output", DEFAULT_PUBLIC_OUTPUT));
  const supplemental = JSON.parse(await readFile(supplementalPath, "utf8")) as SupplementalConfig;
  const db = new DatabaseSync(databaseUrl(catalogPath), { readOnly: true });

  const meta = Object.fromEntries(
    (
      db.prepare("SELECT key, value FROM catalog_meta").all() as Array<{
        key: string;
        value: string;
      }>
    ).map((row) => [row.key, row.value]),
  );
  const makers = db
    .prepare("SELECT slug, name, source FROM makers ORDER BY lower(name), slug")
    .all() as unknown as MakerRow[];
  const models = db
    .prepare(`
    SELECT m.maker_slug, m.slug, m.display_name, m.source,
           v.slug AS variant_slug, v.chassis_code, v.name AS variant_name
    FROM models m
    LEFT JOIN variants v ON v.maker_slug=m.maker_slug AND v.model_slug=m.slug
    ORDER BY m.maker_slug, lower(COALESCE(m.display_name,m.slug)), m.slug
  `)
    .all() as unknown as ModelRow[];
  const sectionCounts = metricMap(
    db
      .prepare(
        "SELECT maker_slug, model_slug, COUNT(*) AS count FROM sections GROUP BY maker_slug, model_slug",
      )
      .all() as unknown as MetricRow[],
  );
  const diagramRows = db
    .prepare(`
    SELECT maker_slug, model_slug, COUNT(*) AS count,
           SUM(CASE WHEN image_path IS NOT NULL OR thumbnail_url IS NOT NULL THEN 1 ELSE 0 END) AS image_count
    FROM diagrams GROUP BY maker_slug, model_slug
  `)
    .all() as unknown as DiagramMetricRow[];
  const diagramCounts = metricMap(diagramRows);
  const diagramImageCounts = new Map(
    diagramRows.map((row) => [`${row.maker_slug}/${row.model_slug}`, Number(row.image_count)]),
  );
  const partCounts = metricMap(
    db
      .prepare(
        "SELECT maker_slug, model_slug, COUNT(*) AS count FROM diagram_parts GROUP BY maker_slug, model_slug",
      )
      .all() as unknown as MetricRow[],
  );
  const collision = db
    .prepare(`
    SELECT COUNT(*) AS count FROM (
      SELECT node_id FROM diagram_placements
      GROUP BY node_id HAVING COUNT(DISTINCT maker_slug) > 1
    )
  `)
    .get() as unknown as { count: number };

  // Positive evidence of the DGM migration. `dgm_id` does not exist until the
  // catalogue pipeline applies planDiagramIdentityMigration, so its absence is
  // reported as zero migrated rather than assumed to be irrelevant — the gate
  // then withholds DIAGRAM_READY instead of passing on the absence of
  // collisions alone.
  let diagramIdentity: { totalDiagrams: number; withProductionDgmId: number } | undefined;
  try {
    const identity = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN dgm_id IS NOT NULL AND dgm_id GLOB 'DGM-[0-9A-Z]*' THEN 1 ELSE 0 END) AS migrated
         FROM diagrams`,
      )
      .get() as unknown as { total: number; migrated: number | null };
    diagramIdentity = {
      totalDiagrams: Number(identity.total),
      withProductionDgmId: Number(identity.migrated ?? 0),
    };
  } catch {
    // No dgm_id column: the migration has not been applied to this catalogue.
    const total = db.prepare("SELECT COUNT(*) AS total FROM diagrams").get() as unknown as {
      total: number;
    };
    diagramIdentity = { totalDiagrams: Number(total.total), withProductionDgmId: 0 };
  }
  db.close();

  const integrity: CatalogIntegrityGate = {
    status: Number(collision.count) === 0 ? "PASS" : "FAIL",
    globalDiagramIdentitySafe: Number(collision.count) === 0,
    crossMakerNodeCollisionCount: Number(collision.count),
    diagramIdentity,
    notes:
      Number(collision.count) === 0
        ? ["No cross-maker source node collisions detected"]
        : [
            "Source node_id is not globally unique and cannot be an internal diagram key.",
            "Migrate to stable DGM IDs before diagram images, hotspots, parts or fitments can be customer-trusted.",
          ],
  };

  const developmentFlowPacks: FlowPackReference[] = [
    {
      flowPackId: "H2E-TOYOTA-HILUX-AN130-DC-FL-DEV-V1",
      visualFamilyId: "VF-TOYOTA-HILUX-AN130-DC-FL",
      makerSlug: "toyota",
      modelSlug: "hilux-an110-an120-an130",
      familySlug: "hilux-an120-an130",
      fitmentId: "FIT-DEMO-ZA-HILUX-AN130-2020-2GD-6MT",
      customerReady: false,
      entryRoute: "/?vehicle=hilux-an130&source=garage",
      epcRoute: "/epc/vehicles/hilux-an120-an130",
      scopeNote:
        "Complete development experience; production publication remains blocked on licensed assets and corrected catalog identities.",
    },
  ];

  const modelsByMaker = new Map<string, ModelRow[]>();
  for (const model of models) {
    const list = modelsByMaker.get(model.maker_slug) ?? [];
    list.push(model);
    modelsByMaker.set(model.maker_slug, list);
  }

  const observedMakers = makers.map((maker) => ({
    makerId: `MK-${slugify(maker.slug).toUpperCase()}`,
    slug: maker.slug,
    name: maker.name ?? maker.slug,
    sourceState: "OBSERVED_BUNDLE" as const,
    source: maker.source ?? "unknown",
    models: (modelsByMaker.get(maker.slug) ?? []).map((model) => {
      const key = `${model.maker_slug}/${model.slug}`;
      const metrics: CatalogModelMetrics = {
        variantCount: model.variant_slug ? 1 : 0,
        sectionCount: sectionCounts.get(key) ?? 0,
        diagramCount: diagramCounts.get(key) ?? 0,
        diagramImageCount: diagramImageCounts.get(key) ?? 0,
        partRowCount: partCounts.get(key) ?? 0,
      };
      const flowPack =
        developmentFlowPacks.find(
          (pack) => pack.makerSlug === maker.slug && pack.modelSlug === model.slug,
        ) ?? null;
      const stages = buildObservedCoverageStages(metrics, integrity, flowPack);
      const evaluation = evaluateCoverage(stages);
      const name = model.display_name ?? model.variant_name ?? model.slug;
      return {
        coverageId: `COV-${slugify(`${maker.slug}-${model.slug}`).toUpperCase()}`,
        modelId: `CM-${slugify(`${maker.slug}-${model.slug}`).toUpperCase()}`,
        slug: model.slug,
        name,
        familyName: deriveFamilyName(name),
        sourceState: "OBSERVED_BUNDLE" as const,
        source: model.source ?? "unknown",
        variant: {
          slug: model.variant_slug,
          name: model.variant_name,
          chassisCode: model.chassis_code,
          identityQuality:
            model.variant_slug === model.slug ? "SYNTHETIC_MODEL_DUPLICATE" : "SOURCE_VARIANT",
        },
        metrics,
        flowPack,
        stages,
        evaluation,
        customerVisible: evaluation.customerReady,
      };
    }),
  }));

  const observedModelKeys = new Set(models.map((model) => `${model.maker_slug}/${model.slug}`));
  const supplementalModels = supplemental.makers.flatMap((maker) =>
    maker.models
      .map((name) => ({ maker, name, slug: slugify(name) }))
      .filter((entry) => !observedModelKeys.has(`${entry.maker.slug}/${entry.slug}`))
      .map((entry) => {
        const stages = buildBacklogCoverageStages();
        return {
          coverageId: `COV-${slugify(`${entry.maker.slug}-${entry.slug}`).toUpperCase()}`,
          modelId: `CM-${slugify(`${entry.maker.slug}-${entry.slug}`).toUpperCase()}`,
          makerSlug: entry.maker.slug,
          makerName: entry.maker.name,
          makerCountry: entry.maker.country,
          priority: entry.maker.priority,
          reason: entry.maker.reason,
          slug: entry.slug,
          name: entry.name,
          familyName: deriveFamilyName(entry.name),
          sourceState: "ACQUISITION_BACKLOG" as const,
          stages,
          evaluation: evaluateCoverage(stages),
          customerVisible: false,
        };
      }),
  );

  const supplementalByMaker = new Map<string, typeof supplementalModels>();
  for (const model of supplementalModels) {
    const list = supplementalByMaker.get(model.makerSlug) ?? [];
    list.push(model);
    supplementalByMaker.set(model.makerSlug, list);
  }

  const universeMakerSlugs = [
    ...new Set([
      ...makers.map((maker) => maker.slug),
      ...supplemental.makers.map((maker) => maker.slug),
    ]),
  ];
  const makerInfo = new Map(supplemental.makers.map((maker) => [maker.slug, maker]));
  const observedBySlug = new Map(observedMakers.map((maker) => [maker.slug, maker]));
  const compactMakers = universeMakerSlugs
    .map((slug) => {
      const observed = observedBySlug.get(slug);
      const supplement = makerInfo.get(slug);
      const observedModels = observed?.models ?? [];
      const backlogModels = supplementalByMaker.get(slug) ?? [];
      return {
        slug,
        name: observed?.name ?? supplement?.name ?? slug,
        country: supplement?.country ?? null,
        priority: supplement?.priority ?? null,
        observedModelCount: observedModels.length,
        backlogModelCount: backlogModels.length,
        customerReadyModelCount: observedModels.filter((model) => model.customerVisible).length,
        models: [
          ...observedModels.map((model) => ({
            slug: model.slug,
            name: model.name,
            familyName: model.familyName,
            sourceState: model.sourceState,
            customerVisible: model.customerVisible,
            developmentFlowPackId: model.flowPack?.flowPackId ?? null,
          })),
          ...backlogModels.map((model) => ({
            slug: model.slug,
            name: model.name,
            familyName: model.familyName,
            sourceState: model.sourceState,
            customerVisible: false,
            developmentFlowPackId: null,
          })),
        ].sort((a, b) => a.name.localeCompare(b.name)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const summary = {
    schemaVersion: "1.0.0",
    catalogSchemaVersion: meta.schema_version ?? null,
    catalogBuiltAt: meta.built_at ?? null,
    generatedAt: new Date().toISOString(),
    integrity,
    counts: {
      observedMakers: observedMakers.length,
      observedModels: models.length,
      observedVariants: models.filter((model) => model.variant_slug).length,
      supplementalMakers: supplemental.makers.length,
      supplementalModels: supplementalModels.length,
      combinedMakers: compactMakers.length,
      combinedModels: models.length + supplementalModels.length,
      customerReadyModels: observedMakers
        .flatMap((maker) => maker.models)
        .filter((model) => model.customerVisible).length,
      developmentFlowPacks: developmentFlowPacks.length,
      plannedVisualTransitions: compactMakers.reduce(
        (total, maker) => total + maker.models.length,
        0,
      ),
    },
    publicationPolicy: {
      customerCascadeFilter: "customerVisible = true",
      garageBrowseFilter: "customerVisible = true and QA_READY = PASS",
      incompleteEntriesRemainInternal: true,
    },
    sourceBundle: meta.source_bundle ?? null,
    acquisitionSources: supplemental.sources,
  };
  const universe = {
    schemaVersion: "1.0.0",
    generatedAt: summary.generatedAt,
    marketFocus: supplemental.marketFocus,
    publicationPolicy: summary.publicationPolicy,
    counts: summary.counts,
    makers: compactMakers,
  };
  const ledger = {
    schemaVersion: "1.0.0",
    generatedAt: summary.generatedAt,
    catalogMeta: meta,
    integrity,
    publicationPolicy: summary.publicationPolicy,
    observedMakers,
    acquisitionBacklog: supplementalModels,
    developmentFlowPacks,
  };
  const flowPackIndex = {
    schemaVersion: "1.0.0",
    generatedAt: summary.generatedAt,
    requiredStageSequence: [
      "HERO_PHOTOGRAPHY",
      "IDENTITY_LOCK",
      "STUDIO_CGI",
      "ENGINEERING_LINE_ART",
      "EXPLODED_SYSTEMS",
      "VISUAL_HIT_MAP",
      "EPC_SECTION_HANDOFF",
      "EPC_DIAGRAM_AND_PARTS",
    ],
    packs: developmentFlowPacks,
    plannedTransitions: {
      count: summary.counts.plannedVisualTransitions,
      queuePath: "/catalog/visual-transition-source-queue.json",
      catalogBindingMode: "INJECT_FAMILY_AND_FITMENT_IDS_WHEN_AVAILABLE",
    },
  };
  const visualTransitionQueue = buildVisualTransitionSourceQueue(universe);

  await mkdir(outputRoot, { recursive: true });
  await mkdir(publicRoot, { recursive: true });
  await Promise.all([
    writeJson(resolve(outputRoot, "catalog-coverage-summary.json"), summary),
    writeJson(resolve(outputRoot, "vehicle-universe.json"), universe),
    writeJson(resolve(outputRoot, "catalog-coverage-ledger.json"), ledger),
    writeJson(resolve(outputRoot, "complete-flow-pack-index.json"), flowPackIndex),
    writeJson(resolve(outputRoot, "visual-transition-source-queue.json"), visualTransitionQueue),
    writeJson(resolve(publicRoot, "catalog-coverage-summary.json"), summary),
    writeJson(resolve(publicRoot, "vehicle-universe.json"), universe),
    writeJson(resolve(publicRoot, "complete-flow-pack-index.json"), flowPackIndex),
    writeJson(resolve(publicRoot, "visual-transition-source-queue.json"), visualTransitionQueue),
  ]);

  const csvRows: Array<Array<string | number | boolean>> = [
    [
      "maker_slug",
      "maker_name",
      "model_slug",
      "model_name",
      "family_name",
      "source_state",
      "priority",
      "customer_visible",
      "section_count",
      "diagram_count",
      "part_row_count",
      "first_blocking_stage",
    ],
  ];
  for (const maker of observedMakers) {
    for (const model of maker.models) {
      csvRows.push([
        maker.slug,
        maker.name,
        model.slug,
        model.name,
        model.familyName,
        model.sourceState,
        "",
        model.customerVisible,
        model.metrics.sectionCount,
        model.metrics.diagramCount,
        model.metrics.partRowCount,
        model.evaluation.firstBlockingStage ?? "",
      ]);
    }
  }
  for (const model of supplementalModels) {
    csvRows.push([
      model.makerSlug,
      model.makerName,
      model.slug,
      model.name,
      model.familyName,
      model.sourceState,
      model.priority,
      false,
      0,
      0,
      0,
      model.evaluation.firstBlockingStage ?? "",
    ]);
  }
  await writeFile(
    resolve(outputRoot, "all-makes-and-models.csv"),
    `${csvRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
    "utf8",
  );

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

async function check(): Promise<void> {
  const outputRoot = resolve(option("--output", DEFAULT_OUTPUT));
  const ledger = JSON.parse(
    await readFile(resolve(outputRoot, "catalog-coverage-ledger.json"), "utf8"),
  ) as {
    observedMakers: Array<{
      slug: string;
      models: Array<{ customerVisible: boolean; evaluation: { customerReady: boolean } }>;
    }>;
    acquisitionBacklog: Array<{
      makerSlug: string;
      customerVisible: boolean;
      evaluation: { customerReady: boolean };
    }>;
    developmentFlowPacks: FlowPackReference[];
  };
  const observedModels = ledger.observedMakers.flatMap((maker) => maker.models);
  const sourceQueue = JSON.parse(
    await readFile(resolve(outputRoot, "visual-transition-source-queue.json"), "utf8"),
  ) as {
    counts: { vehicles: number };
    vehicles: Array<{
      vehicleKey: string;
      plannedFlowPackId: string;
      existingDevelopmentFixtureId: string | null;
    }>;
  };
  const requiredMakers = ["toyota", "honda"];
  for (const maker of requiredMakers) {
    if (!ledger.observedMakers.some((entry) => entry.slug === maker))
      throw new Error(`Observed catalog is missing ${maker}`);
  }
  for (const maker of [
    "isuzu",
    "nissan",
    "chery",
    "gwm",
    "haval",
    "byd",
    "geely",
    "omoda",
    "jaecoo",
  ]) {
    if (!ledger.acquisitionBacklog.some((entry) => entry.makerSlug === maker))
      throw new Error(`Acquisition backlog is missing ${maker}`);
  }
  const leaked = [...observedModels, ...ledger.acquisitionBacklog].filter(
    (model) => model.customerVisible && !model.evaluation.customerReady,
  );
  if (leaked.length)
    throw new Error(
      `${leaked.length} incomplete vehicle(s) leaked into the customer-visible catalog`,
    );
  if (!ledger.developmentFlowPacks.length)
    throw new Error("No complete development flow pack is registered");
  const markedVehicleCount = observedModels.length + ledger.acquisitionBacklog.length;
  if (
    sourceQueue.counts.vehicles !== markedVehicleCount ||
    sourceQueue.vehicles.length !== markedVehicleCount
  ) {
    throw new Error("Visual transition source queue does not cover every marked vehicle");
  }
  if (
    new Set(sourceQueue.vehicles.map((vehicle) => vehicle.plannedFlowPackId)).size !==
    markedVehicleCount
  ) {
    throw new Error("Visual transition source queue contains duplicate planned flow-pack IDs");
  }
  const fixtureOwners = sourceQueue.vehicles.filter(
    (vehicle) => vehicle.existingDevelopmentFixtureId !== null,
  );
  if (fixtureOwners.length !== 1 || !fixtureOwners[0].vehicleKey.startsWith("toyota/hilux")) {
    throw new Error("The Hilux development fixture was assigned outside its vehicle identity");
  }
  process.stdout.write(
    `Coverage check passed: ${observedModels.length} observed models, ${ledger.acquisitionBacklog.length} acquisition targets, ${sourceQueue.vehicles.length} planned visual transitions, ${ledger.developmentFlowPacks.length} development flow pack(s).\n`,
  );
}

const command = process.argv[2] ?? "build";
if (command === "build") await build();
else if (command === "check") await check();
else throw new Error(`Unknown command ${command}; expected build or check`);
