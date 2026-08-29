export const REQUIRED_CUSTOMER_FLOW_STAGES = [
  'IDENTITY_READY',
  'CASCADE_READY',
  'FITMENT_READY',
  'HERO_READY',
  'TRANSITION_READY',
  'EPC_HIERARCHY_READY',
  'DIAGRAM_READY',
  'HOTSPOT_READY',
  'PART_DATA_READY',
  'ROUTING_READY',
  'QA_READY',
] as const;

export type CustomerFlowStage = (typeof REQUIRED_CUSTOMER_FLOW_STAGES)[number];
export type CoverageStageStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_STARTED';

export interface CoverageStageEvidence {
  stage: CustomerFlowStage;
  status: CoverageStageStatus;
  evidence: string[];
  blockers: string[];
}

export interface CoverageEvaluation {
  customerReady: boolean;
  completedStageCount: number;
  requiredStageCount: number;
  firstBlockingStage: CustomerFlowStage | null;
  blockers: string[];
}

export interface CatalogModelMetrics {
  variantCount: number;
  sectionCount: number;
  diagramCount: number;
  diagramImageCount: number;
  partRowCount: number;
}

export interface CatalogIntegrityGate {
  status: 'PASS' | 'FAIL';
  globalDiagramIdentitySafe: boolean;
  crossMakerNodeCollisionCount: number;
  notes: string[];
}

export interface FlowPackReference {
  flowPackId: string;
  visualFamilyId: string;
  makerSlug: string;
  modelSlug: string;
  familySlug: string;
  fitmentId: string;
  customerReady: boolean;
  entryRoute: string;
  epcRoute: string;
  scopeNote: string;
}

export function evaluateCoverage(stages: CoverageStageEvidence[]): CoverageEvaluation {
  const byStage = new Map(stages.map((stage) => [stage.stage, stage]));
  const blockers: string[] = [];
  let firstBlockingStage: CustomerFlowStage | null = null;
  let completedStageCount = 0;

  for (const requiredStage of REQUIRED_CUSTOMER_FLOW_STAGES) {
    const evidence = byStage.get(requiredStage);
    if (evidence?.status === 'PASS') {
      completedStageCount += 1;
      continue;
    }
    if (!firstBlockingStage) firstBlockingStage = requiredStage;
    blockers.push(...(evidence?.blockers.length ? evidence.blockers : [`${requiredStage} has no passing evidence`]));
  }

  return {
    customerReady: completedStageCount === REQUIRED_CUSTOMER_FLOW_STAGES.length,
    completedStageCount,
    requiredStageCount: REQUIRED_CUSTOMER_FLOW_STAGES.length,
    firstBlockingStage,
    blockers: [...new Set(blockers)],
  };
}

export function buildObservedCoverageStages(
  metrics: CatalogModelMetrics,
  integrity: CatalogIntegrityGate,
  flowPack: FlowPackReference | null,
): CoverageStageEvidence[] {
  const pass = (stage: CustomerFlowStage, evidence: string[]): CoverageStageEvidence => ({
    stage,
    status: 'PASS',
    evidence,
    blockers: [],
  });
  const missing = (stage: CustomerFlowStage, blocker: string): CoverageStageEvidence => ({
    stage,
    status: 'NOT_STARTED',
    evidence: [],
    blockers: [blocker],
  });
  const blocked = (stage: CustomerFlowStage, blocker: string, evidence: string[] = []): CoverageStageEvidence => ({
    stage,
    status: 'BLOCKED',
    evidence,
    blockers: [blocker],
  });

  const identity = pass('IDENTITY_READY', ['Observed maker and model identity in the shared catalog bundle']);
  const cascade = metrics.variantCount > 0
    ? pass('CASCADE_READY', [`${metrics.variantCount} catalog variant record(s)`])
    : missing('CASCADE_READY', 'No catalog variant record');
  const fitment = missing('FITMENT_READY', 'Exact variant, market and engine fitment identity has not passed the v2 fitment gate');
  const hero = flowPack?.customerReady
    ? pass('HERO_READY', [flowPack.visualFamilyId])
    : missing('HERO_READY', 'No approved hero and identity-lock asset pack');
  const transition = flowPack?.customerReady
    ? pass('TRANSITION_READY', [flowPack.flowPackId])
    : missing('TRANSITION_READY', 'No complete hero-to-exploded transition pack');
  const hierarchy = metrics.sectionCount > 0 && metrics.diagramCount > 0
    ? pass('EPC_HIERARCHY_READY', [`${metrics.sectionCount} sections`, `${metrics.diagramCount} diagrams`])
    : missing('EPC_HIERARCHY_READY', 'No complete section, group and diagram hierarchy');
  const diagram = !integrity.globalDiagramIdentitySafe
    ? blocked(
        'DIAGRAM_READY',
        'Global diagram identity gate failed; source node_id collisions must be migrated to stable DGM IDs',
        [`${metrics.diagramImageCount} image-linked diagram row(s) observed`],
      )
    : metrics.diagramCount > 0 && metrics.diagramImageCount === metrics.diagramCount
      ? pass('DIAGRAM_READY', [`${metrics.diagramImageCount} verified diagram images`])
      : missing('DIAGRAM_READY', 'Every diagram requires a verified image and globally unique internal diagram ID');
  const hotspots = blocked('HOTSPOT_READY', 'Hotspots cannot be trusted until diagram identity collisions are corrected');
  const parts = metrics.partRowCount > 0
    ? pass('PART_DATA_READY', [`${metrics.partRowCount} diagram part rows`])
    : missing('PART_DATA_READY', 'No diagram part rows');
  const routing = flowPack?.customerReady
    ? pass('ROUTING_READY', [flowPack.epcRoute])
    : missing('ROUTING_READY', 'No validated visual-component-to-EPC routing map');
  const qa = integrity.status === 'PASS' && flowPack?.customerReady
    ? pass('QA_READY', ['Catalog integrity and flow pack acceptance tests passed'])
    : blocked('QA_READY', 'Catalog integrity and end-to-end customer-flow acceptance gates have not all passed');

  return [identity, cascade, fitment, hero, transition, hierarchy, diagram, hotspots, parts, routing, qa];
}

export function buildBacklogCoverageStages(): CoverageStageEvidence[] {
  return REQUIRED_CUSTOMER_FLOW_STAGES.map((stage, index) => ({
    stage,
    status: index === 0 ? 'PASS' : 'NOT_STARTED',
    evidence: index === 0 ? ['Editorial acquisition target with normalized maker/model identity'] : [],
    blockers: index === 0 ? [] : [`${stage} begins after licensed catalog acquisition`],
  }));
}

export function assertCustomerReady(stages: CoverageStageEvidence[], label: string): void {
  const result = evaluateCoverage(stages);
  if (!result.customerReady) {
    throw new Error(`${label} is not customer-ready: ${result.blockers.join('; ')}`);
  }
}
