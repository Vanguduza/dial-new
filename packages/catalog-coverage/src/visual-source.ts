export const REQUIRED_VISUAL_STAGES = [
  "HERO_PHOTOGRAPHY",
  "IDENTITY_LOCK",
  "STUDIO_CGI",
  "ENGINEERING_LINE_ART",
  "EXPLODED_SYSTEMS",
  "VISUAL_HIT_MAP",
  "EPC_SECTION_HANDOFF",
  "EPC_DIAGRAM_AND_PARTS",
] as const;

export const OPEN_LICENSE_POLICY = {
  acceptedFamilies: ["CC0", "PDM", "PUBLIC DOMAIN", "CC BY", "CC BY SA"],
  rejectedQualifiers: ["NC", "ND"],
  requireSourceLandingPage: true,
  requireCreatorAttributionRecord: true,
  requireHumanIdentityApproval: true,
  requireHumanLicenseApproval: false,
  allowCrossVehicleAssetReuse: false,
} as const;

export const VISUAL_CATEGORY_ROUTE_TEMPLATES = [
  {
    visualCategoryId: "VC-ENG",
    label: "Engine",
    sectionSlug: "engine",
    routeTemplate: "/epc/vehicles/{familySlug}/sections/engine?fitment={fitmentId}",
    hitPriority: 40,
  },
  {
    visualCategoryId: "VC-TRN",
    label: "Transmission & drivetrain",
    sectionSlug: "transmission-drivetrain",
    routeTemplate:
      "/epc/vehicles/{familySlug}/sections/transmission-drivetrain?fitment={fitmentId}",
    hitPriority: 30,
  },
  {
    visualCategoryId: "VC-FBRK",
    label: "Front brakes",
    sectionSlug: "chassis-systems",
    routeTemplate: "/epc/vehicles/{familySlug}/sections/chassis-systems?fitment={fitmentId}",
    hitPriority: 20,
  },
  {
    visualCategoryId: "VC-RBRK",
    label: "Rear brakes",
    sectionSlug: "chassis-systems",
    routeTemplate: "/epc/vehicles/{familySlug}/sections/chassis-systems?fitment={fitmentId}",
    hitPriority: 20,
  },
  {
    visualCategoryId: "VC-FSUS",
    label: "Front suspension",
    sectionSlug: "chassis-systems",
    routeTemplate: "/epc/vehicles/{familySlug}/sections/chassis-systems?fitment={fitmentId}",
    hitPriority: 20,
  },
  {
    visualCategoryId: "VC-RSUS",
    label: "Rear suspension",
    sectionSlug: "chassis-systems",
    routeTemplate: "/epc/vehicles/{familySlug}/sections/chassis-systems?fitment={fitmentId}",
    hitPriority: 20,
  },
  {
    visualCategoryId: "VC-BODY",
    label: "Body & exterior",
    sectionSlug: "body-exterior",
    routeTemplate: "/epc/vehicles/{familySlug}/sections/body-exterior?fitment={fitmentId}",
    hitPriority: 0,
  },
] as const;

interface UniverseModel {
  slug: string;
  name: string;
  familyName: string;
  sourceState: string;
  customerVisible: boolean;
  developmentFlowPackId: string | null;
}

interface UniverseMaker {
  slug: string;
  name: string;
  priority: string | null;
  models: UniverseModel[];
}

export interface VehicleUniverseInput {
  generatedAt: string;
  makers: UniverseMaker[];
}

function upperId(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

function sourceQueries(maker: UniverseMaker, model: UniverseModel): string[] {
  return [
    `${maker.name} ${model.name}`,
    `${maker.name} ${model.familyName}`,
    `${maker.name} ${model.name} automobile`,
  ].filter((value, index, values) => values.indexOf(value) === index);
}

export function isAcceptedOpenLicense(license: string): boolean {
  const normalized = license.toUpperCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  if (OPEN_LICENSE_POLICY.rejectedQualifiers.some((term) => normalized.includes(term))) {
    return false;
  }
  return OPEN_LICENSE_POLICY.acceptedFamilies.some((family) => normalized.startsWith(family));
}

export function buildVisualTransitionSourceQueue(universe: VehicleUniverseInput) {
  const vehicles = universe.makers.flatMap((maker) =>
    maker.models.map((model) => {
      const identity = upperId(`${maker.slug}-${model.slug}`);
      const isHiluxFixture =
        maker.slug === "toyota" && model.developmentFlowPackId?.includes("HILUX");
      return {
        vehicleKey: `${maker.slug}/${model.slug}`,
        makerSlug: maker.slug,
        makerName: maker.name,
        modelSlug: model.slug,
        modelName: model.name,
        familyName: model.familyName,
        sourceState: model.sourceState,
        catalogPriority: maker.priority,
        inclusionStatus: "MARKED_FOR_CATALOG",
        visualFamilyId: `VF-${identity}`,
        plannedFlowPackId: `H2E-${identity}-V1`,
        existingDevelopmentFixtureId: isHiluxFixture ? model.developmentFlowPackId : null,
        sourceDiscovery: {
          status: "PENDING",
          queries: sourceQueries(maker, model),
          providers: [
            {
              id: "WIKIMEDIA_COMMONS",
              role: "PRIMARY_FILE_AND_LICENSE_AUTHORITY",
              api: "https://commons.wikimedia.org/w/api.php",
            },
            {
              id: "OPENVERSE",
              role: "SECONDARY_DISCOVERY_INDEX",
              api: "https://api.openverse.org/v1/images/",
            },
          ],
          selectedHeroSource: null,
          identityApprovalRequired: true,
          licenseApprovalMode: "AUTOMATED_ALLOWLIST",
        },
        visualAssets: {
          hero: "AWAITING_OPEN_LICENSE_SOURCE",
          studioCgi: "WAITING_FOR_APPROVED_HERO",
          engineeringLineArt: "WAITING_FOR_IDENTITY_LOCK",
          explodedSystems: "WAITING_FOR_PART_SEPARATION_PLAN",
          visualHitMap: "WAITING_FOR_EXPLODED_SYSTEMS",
        },
        transition: {
          status: "QUEUED",
          requiredStages: REQUIRED_VISUAL_STAGES,
          automaticAfterVehicleSearch: true,
          settledExplodedReturnWithoutReplay: true,
          technicalStageVisible: false,
          wheelMultiplicityRule: "EXACTLY_ONE_TYRE_PER_PHYSICAL_WHEEL_POSITION",
        },
        catalogBinding: {
          status: "AWAITING_EXACT_FITMENT_AND_FAMILY_IDS",
          familySlug: null,
          fitmentId: null,
          categoryMappings: VISUAL_CATEGORY_ROUTE_TEMPLATES,
        },
        readiness: {
          customerReady: false,
          firstBlocker: "OPEN_LICENSE_HERO_NOT_APPROVED",
          blockers: [
            "A vehicle-specific open-license hero has not been approved",
            "Exact generation/body identity has not been visually verified",
            "Derived CGI, line art, exploded systems and hit map have not passed QA",
            "Catalog family and fitment IDs have not been injected",
          ],
        },
      };
    }),
  );

  return {
    schemaVersion: "1.0.0",
    generatedAt: universe.generatedAt,
    scope: "EVERY_VEHICLE_MARKED_FOR_CATALOG",
    sourceStrategy: {
      primary: "WIKIMEDIA_COMMONS",
      secondary: "OPENVERSE",
      policy: OPEN_LICENSE_POLICY,
      attributionMustShipWithAsset: true,
      sourceImageMustMatchExactVehicle: true,
      hiluxFixtureMayNotSeedOtherVehicles: true,
    },
    counts: {
      vehicles: vehicles.length,
      sourceDiscoveryPending: vehicles.filter(
        (vehicle) => vehicle.sourceDiscovery.status === "PENDING",
      ).length,
      customerReady: 0,
    },
    vehicles,
  };
}
