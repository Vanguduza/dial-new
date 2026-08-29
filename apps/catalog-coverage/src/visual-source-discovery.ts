#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isAcceptedOpenLicense } from "../../../packages/catalog-coverage/src/visual-source.js";

interface QueueVehicle {
  vehicleKey: string;
  makerName: string;
  modelName: string;
  familyName: string;
  visualFamilyId: string;
  plannedFlowPackId: string;
  sourceDiscovery: { queries: string[] };
}

interface SourceQueue {
  schemaVersion: string;
  vehicles: QueueVehicle[];
}

interface SourceCandidate {
  provider: "WIKIMEDIA_COMMONS" | "OPENVERSE";
  title: string;
  creator: string | null;
  license: string;
  licenseUrl: string | null;
  sourceLandingPage: string;
  originalUrl: string;
  width: number | null;
  height: number | null;
  identityScore: number;
  licenseAccepted: boolean;
  humanIdentityApprovalRequired: true;
  humanLicenseApprovalRequired: false;
}

interface DiscoveryResult {
  vehicleKey: string;
  visualFamilyId: string;
  plannedFlowPackId: string;
  status: "CANDIDATES_FOUND" | "NO_CANDIDATE_FOUND" | "DISCOVERY_ERROR";
  queryUsed: string;
  candidates: SourceCandidate[];
  error?: string;
}

const DEFAULT_QUEUE = "catalog-data/generated/visual-transition-source-queue.json";
const DEFAULT_OUTPUT = "catalog-data/generated/visual-source-discovery.json";
const USER_AGENT =
  "DIAL-Visual-Catalog/0.1 (open-license vehicle image discovery; local development)";

function option(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function text(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function identityScore(
  vehicle: QueueVehicle,
  candidateText: string,
  width: number,
  height: number,
) {
  const haystack = new Set(tokens(candidateText));
  const makerTokens = tokens(vehicle.makerName);
  const modelTokens = tokens(vehicle.modelName);
  const familyTokens = tokens(vehicle.familyName);
  const matchedMaker = makerTokens.filter((token) => haystack.has(token)).length;
  const matchedModel = modelTokens.filter((token) => haystack.has(token)).length;
  const matchedFamily = familyTokens.filter((token) => haystack.has(token)).length;
  const landscape = width > height ? 8 : 0;
  const resolution = width >= 1600 && height >= 900 ? 8 : 0;
  return matchedMaker * 15 + matchedModel * 8 + matchedFamily * 4 + landscape + resolution;
}

function metaValue(metadata: Record<string, { value?: string }> | undefined, key: string) {
  return text(metadata?.[key]?.value);
}

async function commonsCandidates(vehicle: QueueVehicle, query: string): Promise<SourceCandidate[]> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: "8",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiextmetadatafilter:
      "LicenseShortName|LicenseUrl|Artist|Credit|AttributionRequired|UsageTerms|ImageDescription|Categories",
    format: "json",
    origin: "*",
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Commons returned HTTP ${response.status}`);
  const payload = (await response.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          title: string;
          imageinfo?: Array<{
            url?: string;
            descriptionurl?: string;
            width?: number;
            height?: number;
            mime?: string;
            extmetadata?: Record<string, { value?: string }>;
          }>;
        }
      >;
    };
  };

  return Object.values(payload.query?.pages ?? {})
    .flatMap((page) => {
      const info = page.imageinfo?.[0];
      if (!info?.url || !info.descriptionurl) return [];
      const license = metaValue(info.extmetadata, "LicenseShortName");
      const width = Number(info.width ?? 0);
      const height = Number(info.height ?? 0);
      const description = metaValue(info.extmetadata, "ImageDescription");
      const candidate: SourceCandidate = {
        provider: "WIKIMEDIA_COMMONS",
        title: text(page.title.replace(/^File:/, "")),
        creator: metaValue(info.extmetadata, "Artist") || null,
        license,
        licenseUrl: metaValue(info.extmetadata, "LicenseUrl") || null,
        sourceLandingPage: info.descriptionurl,
        originalUrl: info.url,
        width: width || null,
        height: height || null,
        identityScore: identityScore(vehicle, `${page.title} ${description}`, width, height),
        licenseAccepted: isAcceptedOpenLicense(license),
        humanIdentityApprovalRequired: true,
        humanLicenseApprovalRequired: false,
      };
      return [candidate];
    })
    .filter(
      (candidate) =>
        candidate.licenseAccepted &&
        (candidate.width ?? 0) >= 1200 &&
        (candidate.height ?? 0) >= 700,
    )
    .sort((a, b) => b.identityScore - a.identityScore);
}

async function openverseCandidates(
  vehicle: QueueVehicle,
  query: string,
): Promise<SourceCandidate[]> {
  const params = new URLSearchParams({
    q: query,
    license_type: "commercial",
    extension: "jpg",
    page_size: "8",
  });
  const response = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Openverse returned HTTP ${response.status}`);
  const payload = (await response.json()) as {
    results?: Array<{
      title?: string;
      creator?: string;
      license?: string;
      license_version?: string;
      license_url?: string;
      foreign_landing_url?: string;
      url?: string;
      width?: number;
      height?: number;
      provider?: string;
      source?: string;
    }>;
  };
  return (payload.results ?? [])
    .flatMap((result) => {
      if (!result.url || !result.foreign_landing_url) return [];
      const shortLicense = `${result.license ?? ""} ${result.license_version ?? ""}`.trim();
      const license = /^(by|by-sa)$/i.test(result.license ?? "")
        ? `CC ${shortLicense}`
        : shortLicense;
      const width = Number(result.width ?? 0);
      const height = Number(result.height ?? 0);
      const candidate: SourceCandidate = {
        provider: "OPENVERSE",
        title: text(result.title),
        creator: text(result.creator) || null,
        license,
        licenseUrl: result.license_url ?? null,
        sourceLandingPage: result.foreign_landing_url,
        originalUrl: result.url,
        width: width || null,
        height: height || null,
        identityScore: identityScore(vehicle, result.title ?? "", width, height),
        licenseAccepted: isAcceptedOpenLicense(license),
        humanIdentityApprovalRequired: true,
        humanLicenseApprovalRequired: false,
      };
      return [candidate];
    })
    .filter((candidate) => candidate.licenseAccepted)
    .sort((a, b) => b.identityScore - a.identityScore);
}

async function discover(vehicle: QueueVehicle): Promise<DiscoveryResult> {
  const query = vehicle.sourceDiscovery.queries[0];
  try {
    const commons = await commonsCandidates(vehicle, query);
    const candidates = commons.length ? commons : await openverseCandidates(vehicle, query);
    return {
      vehicleKey: vehicle.vehicleKey,
      visualFamilyId: vehicle.visualFamilyId,
      plannedFlowPackId: vehicle.plannedFlowPackId,
      status: candidates.length ? "CANDIDATES_FOUND" : "NO_CANDIDATE_FOUND",
      queryUsed: query,
      candidates: candidates.slice(0, 5),
    };
  } catch (error) {
    return {
      vehicleKey: vehicle.vehicleKey,
      visualFamilyId: vehicle.visualFamilyId,
      plannedFlowPackId: vehicle.plannedFlowPackId,
      status: "DISCOVERY_ERROR",
      queryUsed: query,
      candidates: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function delay(milliseconds: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function main() {
  const queuePath = resolve(option("--queue", DEFAULT_QUEUE)!);
  const outputPath = resolve(option("--output", DEFAULT_OUTPUT)!);
  const limit = Number(option("--limit", "25"));
  const offset = Number(option("--offset", "0"));
  const waitMs = Number(option("--wait-ms", "300"));
  const queue = JSON.parse(await readFile(queuePath, "utf8")) as SourceQueue;
  let previous: { results: DiscoveryResult[] } = { results: [] };
  try {
    previous = JSON.parse(await readFile(outputPath, "utf8")) as typeof previous;
  } catch {
    // A missing discovery file means this is the first resumable run.
  }
  previous.results = previous.results.map((result) => ({
    ...result,
    candidates: result.candidates.map((candidate) => ({
      ...candidate,
      humanLicenseApprovalRequired: false,
    })),
  }));
  const byVehicle = new Map(previous.results.map((result) => [result.vehicleKey, result]));
  const selected = queue.vehicles
    .slice(offset, Number.isFinite(limit) ? offset + limit : undefined)
    .filter((vehicle) => !byVehicle.has(vehicle.vehicleKey));

  for (const [index, vehicle] of selected.entries()) {
    const result = await discover(vehicle);
    byVehicle.set(vehicle.vehicleKey, result);
    if ((index + 1) % 10 === 0 || index === selected.length - 1) {
      const results = [...byVehicle.values()].sort((a, b) =>
        a.vehicleKey.localeCompare(b.vehicleKey),
      );
      await writeFile(
        outputPath,
        `${JSON.stringify(
          {
            schemaVersion: "1.0.0",
            generatedAt: new Date().toISOString(),
            policy: {
              automaticApproval: false,
              automaticLicenseApproval: true,
              manualReviewScope: "EXACT_VEHICLE_IDENTITY_ONLY",
              downloadBeforeApproval: false,
              attributionRequired: true,
            },
            counts: {
              processed: results.length,
              candidatesFound: results.filter((entry) => entry.status === "CANDIDATES_FOUND")
                .length,
              noCandidateFound: results.filter((entry) => entry.status === "NO_CANDIDATE_FOUND")
                .length,
              errors: results.filter((entry) => entry.status === "DISCOVERY_ERROR").length,
            },
            results,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    }
    if (index < selected.length - 1) await delay(waitMs);
  }

  process.stdout.write(
    `Visual-source discovery processed ${selected.length} new vehicle(s); results saved to ${outputPath}.\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
