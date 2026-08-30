export {
  validateCatalogueInjection,
  type CatalogueInjectionManifest,
  type ConformanceFinding,
  type ConformanceResult,
} from './injection.js';

export {
  canonicalScopeKey,
  dgmIdFor,
  isProductionDgmId,
  planDiagramIdentityMigration,
  assertMigrationApplicable,
  PRODUCTION_DGM_ID,
  type SourceDiagramScope,
  type DiagramIdentityAssignment,
  type DiagramIdentityMigrationPlan,
} from './diagram-identity.js';

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
  /** Variants carrying a resolved fitment identity (chassis, engine, market). */
  fitmentResolvedVariantCount?: number;
  /** Diagrams carrying position hotspots joined through the internal diagram id. */
  diagramsWithHotspotCount?: number;
}

export interface CatalogIntegrityGate {
  status: 'PASS' | 'FAIL';
  globalDiagramIdentitySafe: boolean;
  crossMakerNodeCollisionCount: number;
  notes: string[];
  /**
   * Positive evidence that the DGM migration has actually been applied.
   *
   * `globalDiagramIdentitySafe` is a negative check: it says no source node_id
   * appears under two makers. That can be satisfied without minting a single
   * stable id — by importing one maker, or by dropping the colliding rows — so
   * on its own it cannot distinguish "migrated" from "not yet collided". The
   * integration lock requires stable `DGM-*` ids, and this is the evidence that
   * they exist.
   *
   * Optional so a caller that cannot yet measure it is not forced to assert it;
   * when absent, DIAGRAM_READY reports the absence rather than assuming a pass.
   */
  diagramIdentity?: {
    totalDiagrams: number;
    /** Diagrams carrying an id that satisfies isProductionDgmId. */
    withProductionDgmId: number;
  };
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
  // Derived from evidence rather than hardcoded. The previous implementation
  // returned a fixed 'missing' regardless of input, so no vehicle could ever
  // reach customerReady without editing this function — the gate reported an
  // honest zero by accident rather than by measurement.
  const fitmentResolved = metrics.fitmentResolvedVariantCount ?? 0;
  const fitment = fitmentResolved === 0
    ? missing('FITMENT_READY', 'No variant carries a resolved chassis, engine and market fitment identity')
    : fitmentResolved < metrics.variantCount
      ? blocked(
          'FITMENT_READY',
          `${metrics.variantCount - fitmentResolved} of ${metrics.variantCount} variant(s) have unresolved fitment identity`,
          [`${fitmentResolved} variant(s) passed the fitment gate`],
        )
      : pass('FITMENT_READY', [`${fitmentResolved} variant(s) with resolved fitment identity`]);
  const hero = flowPack?.customerReady
    ? pass('HERO_READY', [flowPack.visualFamilyId])
    : missing('HERO_READY', 'No approved hero and identity-lock asset pack');
  const transition = flowPack?.customerReady
    ? pass('TRANSITION_READY', [flowPack.flowPackId])
    : missing('TRANSITION_READY', 'No complete hero-to-exploded transition pack');
  const hierarchy = metrics.sectionCount > 0 && metrics.diagramCount > 0
    ? pass('EPC_HIERARCHY_READY', [`${metrics.sectionCount} sections`, `${metrics.diagramCount} diagrams`])
    : missing('EPC_HIERARCHY_READY', 'No complete section, group and diagram hierarchy');
  // Identity is two conditions, not one. The absence of collisions says nothing
  // about whether stable ids exist, so a catalogue that never collided — or one
  // whose colliding rows were deleted rather than migrated — must not read as
  // migrated.
  const identityEvidence = integrity.diagramIdentity;
  const dgmAssigned = identityEvidence?.withProductionDgmId ?? 0;
  const dgmTotal = identityEvidence?.totalDiagrams ?? 0;
  const diagram = !integrity.globalDiagramIdentitySafe
    ? blocked(
        'DIAGRAM_READY',
        'Global diagram identity gate failed; source node_id collisions must be migrated to stable DGM IDs',
        [`${metrics.diagramImageCount} image-linked diagram row(s) observed`],
      )
    : !identityEvidence
      ? missing(
          'DIAGRAM_READY',
          'No stable diagram identity evidence; absence of node_id collisions is not proof that DGM IDs were minted',
        )
      : dgmAssigned < dgmTotal
        ? blocked(
            'DIAGRAM_READY',
            `${dgmTotal - dgmAssigned} of ${dgmTotal} diagram(s) carry no stable DGM ID`,
            [`${dgmAssigned} diagram(s) migrated to stable DGM IDs`],
          )
        : metrics.diagramCount > 0 && metrics.diagramImageCount === metrics.diagramCount
          ? pass('DIAGRAM_READY', [
              `${metrics.diagramImageCount} verified diagram images`,
              `${dgmAssigned} stable DGM ID(s)`,
            ])
          : missing('DIAGRAM_READY', 'Every diagram requires a verified image and globally unique internal diagram ID');
  // Hotspots depend on diagram identity being safe, because a position row is
  // joined to its diagram through the internal id. Below that they are measured,
  // not asserted.
  const diagramsWithHotspots = metrics.diagramsWithHotspotCount ?? 0;
  const hotspots = !integrity.globalDiagramIdentitySafe
    ? blocked(
        'HOTSPOT_READY',
        'Hotspots cannot be trusted until source node_id collisions are migrated to stable DGM IDs',
        [`${diagramsWithHotspots} diagram(s) currently carry position hotspots`],
      )
    : !identityEvidence || dgmAssigned < dgmTotal
      ? blocked(
          'HOTSPOT_READY',
          'A hotspot joins its diagram through the internal id, so hotspots cannot be trusted before every diagram carries a stable DGM ID',
          [`${diagramsWithHotspots} diagram(s) currently carry position hotspots`],
        )
    : diagramsWithHotspots === 0
      ? missing('HOTSPOT_READY', 'No diagram carries position hotspots')
      : diagramsWithHotspots < metrics.diagramCount
        ? blocked(
            'HOTSPOT_READY',
            `${metrics.diagramCount - diagramsWithHotspots} of ${metrics.diagramCount} diagram(s) have no position hotspots`,
            [`${diagramsWithHotspots} diagram(s) with hotspots`],
          )
        : pass('HOTSPOT_READY', [`${diagramsWithHotspots} diagram(s) with verified position hotspots`]);
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
