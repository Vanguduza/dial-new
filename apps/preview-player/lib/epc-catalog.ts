export const VISUAL_FAMILY_ID = 'VF-TOYOTA-HILUX-AN130-DC-FL';
export const FITMENT_ID = 'FIT-DEMO-ZA-HILUX-AN130-2020-2GD-6MT';
export const CATALOG_RELEASE_ID = 'CAT-DEVELOPMENT-HILUX-V2';

export type VisualCategoryId =
  | 'VC-ENG'
  | 'VC-TRN'
  | 'VC-FBRK'
  | 'VC-RBRK'
  | 'VC-FSUS'
  | 'VC-RSUS'
  | 'VC-BODY';

export type CatalogReadiness =
  | 'BROWSE_READY'
  | 'SEARCH_READY'
  | 'DIAGRAM_READY'
  | 'HOTSPOT_READY'
  | 'FITMENT_READY'
  | 'SELL_READY';

export interface EpcRouteTarget {
  sectionSlug: string;
  groupId: string | null;
  groupSlug: string | null;
  defaultDiagramId: string | null;
  fallbackQuery: string | null;
  selectionMode: 'SECTION' | 'GROUP' | 'DIAGRAM' | 'SEARCH';
  minimumReadiness: CatalogReadiness;
}

export interface EpcCategoryBinding {
  visualCategoryId: VisualCategoryId;
  componentFamilyId: string;
  label: string;
  target: EpcRouteTarget;
}

export interface ComponentFamilyRoute {
  componentFamilyId: string;
  visualCategoryId: VisualCategoryId;
  label: string;
  aliases: string[];
  target: EpcRouteTarget;
  preferredPosition?: string;
}

export interface EpcPart {
  position: string;
  partCode: string;
  oemPartNumber: string | null;
  pncCode: string | null;
  title: string;
  applicability: string;
  quantity: number | null;
  commercialState: 'catalog_only' | 'available' | 'request_quote';
}

export interface EpcHotspot {
  hotspotId: string;
  position: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EpcDiagram {
  diagramId: string;
  sourceDiagramKey: string;
  sectionSlug: string;
  groupSlug: string;
  title: string;
  applicability: string;
  imageSrc: string | null;
  imageAlt: string;
  readiness: CatalogReadiness[];
  parts: EpcPart[];
  hotspots: EpcHotspot[];
}

export interface EpcGroup {
  groupId: string;
  slug: string;
  title: string;
  description: string;
  diagramIds: string[];
}

export interface EpcSection {
  slug: string;
  title: string;
  description: string;
  visualCategoryIds: VisualCategoryId[];
  thumbnailSrc: string;
  groups: EpcGroup[];
}

export const vehicleFamily = {
  visualFamilyId: VISUAL_FAMILY_ID,
  fitmentId: FITMENT_ID,
  catalogReleaseId: CATALOG_RELEASE_ID,
  catalogFamilyId: 'CF-TOYOTA-HILUX-AN120-AN130',
  makerSlug: 'toyota',
  familySlug: 'hilux-an120-an130',
  variantId: 'CV-TOYOTA-HILUX-AN130-DC-2GD-6MT',
  variantSlug: 'hilux-an130-double-cab-2gd-6mt',
  make: 'Toyota',
  model: 'Hilux',
  generation: 'AN120/AN130',
  bodyStyle: 'Double Cab',
  visualPhase: '2020 Facelift',
  chassisCodes: ['GUN125', 'GUN126'],
  engineCodes: ['2GD-FTV'],
  market: 'ZA',
} as const;

const group = (
  groupId: string,
  slug: string,
  title: string,
  description: string,
  diagramId: string,
): EpcGroup => ({ groupId, slug, title, description, diagramIds: [diagramId] });

export const epcSections: EpcSection[] = [
  {
    slug: 'engine',
    title: 'Engine',
    description:
      'Engine mechanical, cooling, lubrication, air and fuel assemblies.',
    visualCategoryIds: ['VC-ENG'],
    thumbnailSrc: '/actual-demo/technical.avif',
    groups: [
      group(
        'GRP-HILUX-ENGINE-MECHANICAL',
        'engine-mechanical',
        'Engine mechanical',
        'Block, cylinder head, timing and mounting assemblies.',
        'DGM-HILUX-ENG-001',
      ),
      group(
        'GRP-HILUX-ENGINE-COOLING',
        'cooling-system',
        'Cooling system',
        'Radiator, fan, pump, thermostat, hoses and associated brackets.',
        'DGM-HILUX-ENG-002',
      ),
      group(
        'GRP-HILUX-ENGINE-FUEL',
        'air-fuel-intake',
        'Air, fuel & intake',
        'Air cleaner, intake, fuel supply and injection families.',
        'DGM-HILUX-ENG-003',
      ),
      group(
        'GRP-HILUX-ENGINE-LUBE',
        'lubrication',
        'Lubrication',
        'Oil pump, sump, filter, cooler and oil-line families.',
        'DGM-HILUX-ENG-004',
      ),
    ],
  },
  {
    slug: 'transmission-drivetrain',
    title: 'Transmission & drivetrain',
    description:
      'Clutch, transmission, transfer, propeller shaft and final-drive assemblies.',
    visualCategoryIds: ['VC-TRN'],
    thumbnailSrc: '/actual-demo/technical.avif',
    groups: [
      group(
        'GRP-HILUX-TRANSMISSION',
        'transmission',
        'Transmission',
        'Cases, geartrain, controls, seals and transmission mountings.',
        'DGM-HILUX-TRN-001',
      ),
      group(
        'GRP-HILUX-CLUTCH',
        'clutch-flywheel',
        'Clutch & flywheel',
        'Clutch, flywheel, release system and pedal-linked components.',
        'DGM-HILUX-TRN-002',
      ),
      group(
        'GRP-HILUX-DRIVELINE',
        'transfer-driveline',
        'Transfer & driveline',
        'Transfer case, propeller shafts, differentials and axle shafts.',
        'DGM-HILUX-TRN-003',
      ),
    ],
  },
  {
    slug: 'chassis-systems',
    title: 'Chassis systems',
    description:
      'Braking, suspension, steering, wheels, hubs and axle-adjacent assemblies.',
    visualCategoryIds: ['VC-FBRK', 'VC-RBRK', 'VC-FSUS', 'VC-RSUS'],
    thumbnailSrc: '/actual-demo/exploded-single-wheel-v2.avif',
    groups: [
      group(
        'GRP-HILUX-FRONT-BRAKES',
        'front-brakes',
        'Front brakes',
        'Front calipers, discs, pads, hoses and fitting hardware.',
        'DGM-HILUX-CHS-001',
      ),
      group(
        'GRP-HILUX-REAR-BRAKES',
        'rear-brakes',
        'Rear brakes',
        'Rear service-brake and parking-brake assemblies.',
        'DGM-HILUX-CHS-002',
      ),
      group(
        'GRP-HILUX-FRONT-SUSPENSION',
        'front-suspension',
        'Front suspension',
        'Control arms, dampers, springs, knuckles and mountings.',
        'DGM-HILUX-CHS-003',
      ),
      group(
        'GRP-HILUX-REAR-SUSPENSION',
        'rear-suspension',
        'Rear suspension',
        'Leaf springs, dampers, shackles and axle mountings.',
        'DGM-HILUX-CHS-004',
      ),
      group(
        'GRP-HILUX-STEERING',
        'steering',
        'Steering',
        'Steering gear, column, linkages and power-assist components.',
        'DGM-HILUX-CHS-005',
      ),
      group(
        'GRP-HILUX-WHEELS',
        'wheels-hubs',
        'Wheels & hubs',
        'Road wheels, hubs, bearings and related fasteners.',
        'DGM-HILUX-CHS-006',
      ),
    ],
  },
  {
    slug: 'body-exterior',
    title: 'Body & exterior',
    description:
      'Panels, bumpers, lamps, closures, glass-adjacent hardware and exterior trim.',
    visualCategoryIds: ['VC-BODY'],
    thumbnailSrc: '/actual-demo/exploded-single-wheel-v2.avif',
    groups: [
      group(
        'GRP-HILUX-BODY-BUMPERS',
        'bumpers-exterior-trim',
        'Bumpers, grille & trim',
        'Front and rear bumpers, reinforcements, grille, mouldings and clips.',
        'DGM-HILUX-BODY-001',
      ),
      group(
        'GRP-HILUX-BODY-LAMPS',
        'lamps-exterior',
        'Exterior lamps',
        'Headlamps, rear combination lamps, brackets and adjusters.',
        'DGM-HILUX-BODY-002',
      ),
      group(
        'GRP-HILUX-BODY-PANELS',
        'body-panels',
        'Body panels',
        'Hood, fenders, roof and body-shell panel families.',
        'DGM-HILUX-BODY-003',
      ),
      group(
        'GRP-HILUX-BODY-DOORS',
        'doors-closures',
        'Doors, mirrors & closures',
        'Door shells, hinges, handles, latches, checks, seals and mirrors.',
        'DGM-HILUX-BODY-004',
      ),
      group(
        'GRP-HILUX-BODY-CARGO',
        'cargo-bed-tailgate',
        'Cargo bed & tailgate',
        'Pickup bed, side panels, tailgate, cables, latches and protectors.',
        'DGM-HILUX-BODY-005',
      ),
      group(
        'GRP-HILUX-BODY-GLASS',
        'glass-seals',
        'Glass & seals',
        'Windscreen, door glass, rear glass, runs, seals and weatherstrips.',
        'DGM-HILUX-BODY-006',
      ),
    ],
  },
  {
    slug: 'interior-safety',
    title: 'Interior & safety',
    description:
      'Cabin trim, seating, restraints, controls and occupant-safety assemblies.',
    visualCategoryIds: [],
    thumbnailSrc: '/actual-demo/line-art.avif',
    groups: [
      group(
        'GRP-HILUX-INTERIOR-TRIM',
        'cabin-trim',
        'Cabin trim & controls',
        'Instrument panel, console, trim, controls and cabin fittings.',
        'DGM-HILUX-INT-001',
      ),
      group(
        'GRP-HILUX-SEATS',
        'seats-restraints',
        'Seats & restraints',
        'Seats, belts, anchors and restraint-adjacent components.',
        'DGM-HILUX-INT-002',
      ),
    ],
  },
  {
    slug: 'electrical-electronic',
    title: 'Electrical & electronic',
    description:
      'Starting, charging, wiring, switches, modules, HVAC and electrical controls.',
    visualCategoryIds: [],
    thumbnailSrc: '/actual-demo/line-art.avif',
    groups: [
      group(
        'GRP-HILUX-STARTING',
        'starting-charging',
        'Starting & charging',
        'Starter, alternator, battery mounting and related wiring.',
        'DGM-HILUX-ELE-001',
      ),
      group(
        'GRP-HILUX-WIRING',
        'wiring-controls',
        'Wiring & controls',
        'Harnesses, switches, relays, modules and electrical connectors.',
        'DGM-HILUX-ELE-002',
      ),
      group(
        'GRP-HILUX-HVAC',
        'hvac',
        'Heating & air conditioning',
        'Heater, evaporator, blower, ducts and climate controls.',
        'DGM-HILUX-ELE-003',
      ),
    ],
  },
];

const partTemplates: Record<string, Array<[string, string, string]>> = {
  'bumpers-exterior-trim': [
    ['Bumper cover', 'Front', 'All selected body grades'],
    ['Reinforcement assembly', 'Front', 'Market specification applies'],
    ['Side retainer', 'LH / RH', 'Position-specific'],
    ['Radiator grille assembly', 'Front', 'Grade and trim apply'],
    ['Bumper step assembly', 'Rear', 'Double Cab pickup'],
  ],
  'lamps-exterior': [
    ['Headlamp assembly', 'LH', 'Lamp specification applies'],
    ['Headlamp assembly', 'RH', 'Lamp specification applies'],
    ['Headlamp mounting bracket', 'Front', 'Position-specific'],
    ['Rear combination lamp', 'LH / RH', 'Double Cab pickup'],
  ],
  'body-panels': [
    ['Hood panel', 'Front', '2020 facelift visual family'],
    ['Hood hinge', 'LH / RH', 'Position-specific'],
    ['Front fender panel', 'LH / RH', 'Position-specific'],
    ['Fender splash shield', 'LH / RH', 'Position-specific'],
  ],
  'doors-closures': [
    ['Front door shell', 'LH / RH', 'Double Cab'],
    ['Rear door shell', 'LH / RH', 'Double Cab'],
    ['Door hinge', 'Upper / lower', 'Position-specific'],
    ['Door mirror assembly', 'LH / RH', 'Electrical grade applies'],
    ['Door latch assembly', 'Front / rear', 'Position-specific'],
  ],
  'cargo-bed-tailgate': [
    ['Cargo bed assembly', 'Rear body', 'Double Cab pickup'],
    ['Tailgate panel', 'Rear', 'Double Cab pickup'],
    ['Tailgate hinge', 'LH / RH', 'Position-specific'],
    ['Tailgate handle & latch', 'Centre', 'Market specification applies'],
  ],
};

function buildParts(groupSlug: string, title: string): EpcPart[] {
  const templates = partTemplates[groupSlug] ?? [
    [`${title} assembly`, 'Primary', 'Exact variant confirmation required'],
    [`${title} mounting`, 'Mounting', 'Position and market apply'],
    [`${title} service components`, 'Service', 'Diagram applicability applies'],
  ];
  return templates.map(([partTitle, partCode, applicability], index) => ({
    position: String(index + 1).padStart(2, '0'),
    partCode,
    oemPartNumber: null,
    pncCode: null,
    title: partTitle,
    applicability,
    quantity: index === 0 ? 1 : null,
    commercialState: 'catalog_only',
  }));
}

function buildHotspots(parts: EpcPart[]): EpcHotspot[] {
  const positions = [
    { x: 0.66, y: 0.39 },
    { x: 0.76, y: 0.48 },
    { x: 0.56, y: 0.58 },
    { x: 0.43, y: 0.38 },
    { x: 0.27, y: 0.55 },
  ];
  return parts.map((part, index) => ({
    hotspotId: `HS-${part.position}`,
    position: part.position,
    x: positions[index % positions.length].x,
    y: positions[index % positions.length].y,
    width: 0.075,
    height: 0.075,
  }));
}

export const epcDiagrams: EpcDiagram[] = epcSections.flatMap((section) =>
  section.groups.flatMap((assemblyGroup) =>
    assemblyGroup.diagramIds.map((diagramId) => {
      const parts = buildParts(assemblyGroup.slug, assemblyGroup.title);
      return {
        diagramId,
        sourceDiagramKey: `dial-development:${vehicleFamily.makerSlug}:${vehicleFamily.familySlug}:${vehicleFamily.variantSlug}:${section.slug}:${diagramId}`,
        sectionSlug: section.slug,
        groupSlug: assemblyGroup.slug,
        title: assemblyGroup.title,
        applicability: `${vehicleFamily.generation} · ${vehicleFamily.bodyStyle} · ${vehicleFamily.market}`,
        imageSrc: '/actual-demo/exploded-single-wheel-v2.avif',
        imageAlt: `${vehicleFamily.make} ${vehicleFamily.model} ${assemblyGroup.title} development diagram`,
        readiness: [
          'BROWSE_READY',
          'DIAGRAM_READY',
          'HOTSPOT_READY',
        ] as CatalogReadiness[],
        parts,
        hotspots: buildHotspots(parts),
      };
    }),
  ),
);

const target = (
  sectionSlug: string,
  groupId: string | null,
  groupSlug: string | null,
  defaultDiagramId: string | null,
  fallbackQuery: string,
  selectionMode: EpcRouteTarget['selectionMode'] = groupSlug
    ? 'GROUP'
    : 'SECTION',
): EpcRouteTarget => ({
  sectionSlug,
  groupId,
  groupSlug,
  defaultDiagramId,
  fallbackQuery,
  selectionMode,
  minimumReadiness: 'BROWSE_READY',
});

export const categoryBindings: EpcCategoryBinding[] = [
  {
    visualCategoryId: 'VC-ENG',
    componentFamilyId: 'VCF-ENGINE',
    label: 'Engine',
    target: target(
      'engine',
      'GRP-HILUX-ENGINE-MECHANICAL',
      'engine-mechanical',
      'DGM-HILUX-ENG-001',
      'engine',
    ),
  },
  {
    visualCategoryId: 'VC-TRN',
    componentFamilyId: 'VCF-TRANSMISSION',
    label: 'Transmission',
    target: target(
      'transmission-drivetrain',
      'GRP-HILUX-TRANSMISSION',
      'transmission',
      'DGM-HILUX-TRN-001',
      'transmission',
    ),
  },
  {
    visualCategoryId: 'VC-FBRK',
    componentFamilyId: 'VCF-FRONT-BRAKES',
    label: 'Front brakes',
    target: target(
      'chassis-systems',
      'GRP-HILUX-FRONT-BRAKES',
      'front-brakes',
      'DGM-HILUX-CHS-001',
      'front brake',
    ),
  },
  {
    visualCategoryId: 'VC-RBRK',
    componentFamilyId: 'VCF-REAR-BRAKES',
    label: 'Rear brakes',
    target: target(
      'chassis-systems',
      'GRP-HILUX-REAR-BRAKES',
      'rear-brakes',
      'DGM-HILUX-CHS-002',
      'rear brake',
    ),
  },
  {
    visualCategoryId: 'VC-FSUS',
    componentFamilyId: 'VCF-FRONT-SUSPENSION',
    label: 'Front suspension',
    target: target(
      'chassis-systems',
      'GRP-HILUX-FRONT-SUSPENSION',
      'front-suspension',
      'DGM-HILUX-CHS-003',
      'front suspension',
    ),
  },
  {
    visualCategoryId: 'VC-RSUS',
    componentFamilyId: 'VCF-REAR-SUSPENSION',
    label: 'Rear suspension',
    target: target(
      'chassis-systems',
      'GRP-HILUX-REAR-SUSPENSION',
      'rear-suspension',
      'DGM-HILUX-CHS-004',
      'rear suspension',
    ),
  },
  {
    visualCategoryId: 'VC-BODY',
    componentFamilyId: 'VCF-BODY-EXTERIOR',
    label: 'Body & exterior',
    target: target(
      'body-exterior',
      null,
      null,
      null,
      'body exterior',
      'SECTION',
    ),
  },
];

export const componentFamilyRoutes: ComponentFamilyRoute[] = [
  {
    componentFamilyId: 'VCF-BODY-FRONT-BUMPER',
    visualCategoryId: 'VC-BODY',
    label: 'Front bumper',
    aliases: ['front bumper', 'bumper cover', 'bumper reinforcement'],
    target: target(
      'body-exterior',
      'GRP-HILUX-BODY-BUMPERS',
      'bumpers-exterior-trim',
      'DGM-HILUX-BODY-001',
      'front bumper',
    ),
    preferredPosition: '01',
  },
  {
    componentFamilyId: 'VCF-BODY-HEADLAMPS',
    visualCategoryId: 'VC-BODY',
    label: 'Headlamps',
    aliases: ['headlamp', 'headlight', 'front lamp'],
    target: target(
      'body-exterior',
      'GRP-HILUX-BODY-LAMPS',
      'lamps-exterior',
      'DGM-HILUX-BODY-002',
      'headlamp',
    ),
    preferredPosition: '01',
  },
  {
    componentFamilyId: 'VCF-BODY-GRILLE',
    visualCategoryId: 'VC-BODY',
    label: 'Grille',
    aliases: ['grille', 'front grille', 'radiator grille'],
    target: target(
      'body-exterior',
      'GRP-HILUX-BODY-BUMPERS',
      'bumpers-exterior-trim',
      'DGM-HILUX-BODY-001',
      'grille',
    ),
    preferredPosition: '04',
  },
  {
    componentFamilyId: 'VCF-BODY-HOOD',
    visualCategoryId: 'VC-BODY',
    label: 'Hood',
    aliases: ['hood', 'bonnet', 'hood latch'],
    target: target(
      'body-exterior',
      'GRP-HILUX-BODY-PANELS',
      'body-panels',
      'DGM-HILUX-BODY-003',
      'hood bonnet',
    ),
    preferredPosition: '01',
  },
  {
    componentFamilyId: 'VCF-BODY-FENDERS',
    visualCategoryId: 'VC-BODY',
    label: 'Front fenders',
    aliases: ['front fender', 'wing', 'wheel arch'],
    target: target(
      'body-exterior',
      'GRP-HILUX-BODY-PANELS',
      'body-panels',
      'DGM-HILUX-BODY-003',
      'front fender',
    ),
    preferredPosition: '03',
  },
  {
    componentFamilyId: 'VCF-BODY-FRONT-DOORS',
    visualCategoryId: 'VC-BODY',
    label: 'Front doors',
    aliases: ['front door', 'door shell', 'door handle'],
    target: target(
      'body-exterior',
      'GRP-HILUX-BODY-DOORS',
      'doors-closures',
      'DGM-HILUX-BODY-004',
      'front door',
    ),
    preferredPosition: '01',
  },
  {
    componentFamilyId: 'VCF-BODY-REAR-DOORS',
    visualCategoryId: 'VC-BODY',
    label: 'Rear doors',
    aliases: ['rear door', 'door shell', 'door handle'],
    target: target(
      'body-exterior',
      'GRP-HILUX-BODY-DOORS',
      'doors-closures',
      'DGM-HILUX-BODY-004',
      'rear door',
    ),
    preferredPosition: '02',
  },
  {
    componentFamilyId: 'VCF-BODY-MIRRORS',
    visualCategoryId: 'VC-BODY',
    label: 'Door mirrors',
    aliases: ['door mirror', 'wing mirror', 'side mirror'],
    target: target(
      'body-exterior',
      'GRP-HILUX-BODY-DOORS',
      'doors-closures',
      'DGM-HILUX-BODY-004',
      'door mirror',
    ),
    preferredPosition: '04',
  },
  {
    componentFamilyId: 'VCF-BODY-CARGO-BED',
    visualCategoryId: 'VC-BODY',
    label: 'Cargo bed',
    aliases: ['cargo bed', 'pickup bed', 'load box'],
    target: target(
      'body-exterior',
      'GRP-HILUX-BODY-CARGO',
      'cargo-bed-tailgate',
      'DGM-HILUX-BODY-005',
      'cargo bed',
    ),
    preferredPosition: '01',
  },
  {
    componentFamilyId: 'VCF-BODY-TAILGATE',
    visualCategoryId: 'VC-BODY',
    label: 'Tailgate',
    aliases: ['tailgate', 'tail gate', 'rear gate'],
    target: target(
      'body-exterior',
      'GRP-HILUX-BODY-CARGO',
      'cargo-bed-tailgate',
      'DGM-HILUX-BODY-005',
      'tailgate',
    ),
    preferredPosition: '02',
  },
  {
    componentFamilyId: 'VCF-BODY-REAR-BUMPER',
    visualCategoryId: 'VC-BODY',
    label: 'Rear bumper',
    aliases: ['rear bumper', 'step bumper', 'bumper bracket'],
    target: target(
      'body-exterior',
      'GRP-HILUX-BODY-BUMPERS',
      'bumpers-exterior-trim',
      'DGM-HILUX-BODY-001',
      'rear bumper',
    ),
    preferredPosition: '05',
  },
];

export const EPC_VEHICLE_BASE = `/epc/vehicles/${vehicleFamily.familySlug}`;

export interface EpcNavigationContext {
  familySlug?: string;
  fitmentId?: string;
}

export function getEpcSection(slug: string) {
  return epcSections.find((section) => section.slug === slug);
}

export function getEpcGroup(sectionSlug: string, groupSlug: string) {
  return getEpcSection(sectionSlug)?.groups.find(
    (assemblyGroup) => assemblyGroup.slug === groupSlug,
  );
}

export function getEpcDiagram(diagramId: string) {
  return epcDiagrams.find((diagram) => diagram.diagramId === diagramId);
}

export function getCategoryBinding(visualCategoryId: VisualCategoryId) {
  return categoryBindings.find(
    (binding) => binding.visualCategoryId === visualCategoryId,
  );
}

export function getComponentFamily(componentFamilyId: string) {
  return componentFamilyRoutes.find(
    (route) => route.componentFamilyId === componentFamilyId,
  );
}

export function sectionHref(
  sectionSlug: string,
  groupSlug?: string | null,
  componentFamilyId?: string | null,
  context: EpcNavigationContext = {},
) {
  const params = new URLSearchParams({
    fitment: context.fitmentId ?? FITMENT_ID,
  });
  if (groupSlug) params.set('group', groupSlug);
  if (componentFamilyId) params.set('component', componentFamilyId);
  const vehicleBase = `/epc/vehicles/${context.familySlug ?? vehicleFamily.familySlug}`;
  return `${vehicleBase}/sections/${sectionSlug}?${params.toString()}`;
}

export function targetHref(
  targetRoute: EpcRouteTarget,
  componentFamilyId?: string | null,
  context: EpcNavigationContext = {},
) {
  return sectionHref(
    targetRoute.sectionSlug,
    targetRoute.groupSlug,
    componentFamilyId,
    context,
  );
}

export function categoryHref(
  visualCategoryId: VisualCategoryId,
  componentFamilyId?: string,
  context: EpcNavigationContext = {},
) {
  const component = componentFamilyId
    ? getComponentFamily(componentFamilyId)
    : undefined;
  if (component)
    return targetHref(component.target, component.componentFamilyId, context);
  const category = getCategoryBinding(visualCategoryId);
  return category
    ? targetHref(category.target, undefined, context)
    : `/epc/vehicles/${context.familySlug ?? vehicleFamily.familySlug}`;
}

export function diagramHref(
  diagramId: string,
  position?: string | null,
  context: EpcNavigationContext = {},
) {
  const params = new URLSearchParams({
    fitment: context.fitmentId ?? FITMENT_ID,
  });
  if (position) params.set('position', position);
  return `/epc/vehicles/${context.familySlug ?? vehicleFamily.familySlug}/diagrams/${diagramId}?${params.toString()}`;
}

// Redirect metadata only. These names preserve already-shared v1 URLs while all
// new navigation is generated from the structured v2 route targets above.
export const legacyCategoryRoutes = [
  { slug: 'engine', sectionSlug: 'engine', groupSlug: 'engine-mechanical' },
  {
    slug: 'transmission',
    sectionSlug: 'transmission-drivetrain',
    groupSlug: 'transmission',
  },
  {
    slug: 'front-brakes',
    sectionSlug: 'chassis-systems',
    groupSlug: 'front-brakes',
  },
  {
    slug: 'rear-brakes',
    sectionSlug: 'chassis-systems',
    groupSlug: 'rear-brakes',
  },
  {
    slug: 'front-suspension',
    sectionSlug: 'chassis-systems',
    groupSlug: 'front-suspension',
  },
  {
    slug: 'rear-suspension',
    sectionSlug: 'chassis-systems',
    groupSlug: 'rear-suspension',
  },
  { slug: 'body-exterior', sectionSlug: 'body-exterior', groupSlug: null },
] as const;

export function getLegacyCategoryRoute(slug: string) {
  return legacyCategoryRoutes.find((route) => route.slug === slug);
}
