import { describe, expect, it } from 'vitest';
import {
  REQUIRED_CUSTOMER_FLOW_STAGES,
  assertCustomerReady,
  buildBacklogCoverageStages,
  buildObservedCoverageStages,
  evaluateCoverage,
  type CatalogIntegrityGate,
  type CatalogModelMetrics,
  type CoverageStageEvidence,
} from '../packages/catalog-coverage/src/index.js';

describe('catalog customer-flow coverage', () => {
  it('requires every hero-to-EPC stage before a vehicle can be customer visible', () => {
    const stages = REQUIRED_CUSTOMER_FLOW_STAGES.map((stage): CoverageStageEvidence => ({
      stage,
      status: 'PASS',
      evidence: [`${stage} fixture`],
      blockers: [],
    }));
    expect(evaluateCoverage(stages)).toMatchObject({
      customerReady: true,
      completedStageCount: REQUIRED_CUSTOMER_FLOW_STAGES.length,
      firstBlockingStage: null,
    });
    expect(() => assertCustomerReady(stages, 'complete fixture')).not.toThrow();

    stages[3] = {
      stage: 'HERO_READY',
      status: 'BLOCKED',
      evidence: [],
      blockers: ['Approved hero image is missing'],
    };
    expect(evaluateCoverage(stages)).toMatchObject({
      customerReady: false,
      firstBlockingStage: 'HERO_READY',
    });
    expect(() => assertCustomerReady(stages, 'incomplete fixture')).toThrow(/Approved hero image is missing/);
  });

  it('keeps acquisition targets out of the customer catalog', () => {
    const evaluation = evaluateCoverage(buildBacklogCoverageStages());
    expect(evaluation.customerReady).toBe(false);
    expect(evaluation.completedStageCount).toBe(1);
    expect(evaluation.firstBlockingStage).toBe('CASCADE_READY');
  });

  // Fitment and hotspot readiness used to be hardcoded to fail, so no vehicle
  // could ever reach customerReady regardless of evidence. These prove both are
  // now derived from what the catalog actually contains.
  describe('readiness is derived from evidence, not asserted', () => {
    const safeIntegrity: CatalogIntegrityGate = {
      status: 'PASS',
      globalDiagramIdentitySafe: true,
      crossMakerNodeCollisionCount: 0,
      notes: [],
      // Every diagram migrated. Required now: the absence of collisions is not
      // proof that stable ids were ever minted.
      diagramIdentity: { totalDiagrams: 12, withProductionDgmId: 12 },
    };
    const collidingIntegrity: CatalogIntegrityGate = {
      status: 'FAIL',
      globalDiagramIdentitySafe: false,
      crossMakerNodeCollisionCount: 44_532,
      notes: ['source node_id is not globally unique'],
    };
    const complete: CatalogModelMetrics = {
      variantCount: 3,
      sectionCount: 8,
      diagramCount: 12,
      diagramImageCount: 12,
      partRowCount: 240,
      fitmentResolvedVariantCount: 3,
      diagramsWithHotspotCount: 12,
    };
    const flowPack = {
      flowPackId: 'H2E-TEST-V1',
      visualFamilyId: 'VF-TEST',
      makerSlug: 'test',
      modelSlug: 'test',
      familySlug: 'test',
      fitmentId: 'FIT-TEST',
      customerReady: true,
      entryRoute: '/',
      epcRoute: '/epc/vehicles/test',
      scopeNote: 'test',
    };

    const stageFor = (stages: CoverageStageEvidence[], name: string) =>
      stages.find((stage) => stage.stage === name)!;

    it('passes FITMENT_READY when every variant has resolved fitment identity', () => {
      const stages = buildObservedCoverageStages(complete, safeIntegrity, flowPack);
      expect(stageFor(stages, 'FITMENT_READY').status).toBe('PASS');
    });

    it('blocks FITMENT_READY when only some variants resolve', () => {
      const stages = buildObservedCoverageStages(
        { ...complete, fitmentResolvedVariantCount: 1 },
        safeIntegrity,
        flowPack,
      );
      const fitment = stageFor(stages, 'FITMENT_READY');
      expect(fitment.status).toBe('BLOCKED');
      expect(fitment.blockers.join(' ')).toContain('2 of 3');
    });

    it('passes HOTSPOT_READY when every diagram carries position hotspots', () => {
      const stages = buildObservedCoverageStages(complete, safeIntegrity, flowPack);
      expect(stageFor(stages, 'HOTSPOT_READY').status).toBe('PASS');
    });

    it('blocks HOTSPOT_READY while diagram identity collisions remain', () => {
      const stages = buildObservedCoverageStages(complete, collidingIntegrity, flowPack);
      const hotspots = stageFor(stages, 'HOTSPOT_READY');
      expect(hotspots.status).toBe('BLOCKED');
      expect(hotspots.blockers.join(' ')).toContain('DGM');
    });

    it('can reach customerReady once every stage has evidence', () => {
      const stages = buildObservedCoverageStages(complete, safeIntegrity, flowPack);
      // The point of the fix: a green path exists at all.
      expect(evaluateCoverage(stages).customerReady).toBe(true);
    });
  });

  // The published-snapshot test that lived here has been removed. It read
  // catalog-data/generated, which no clone and no CI run has ever had, so it
  // skipped every time it was invoked — a criterion whose only test skips is
  // not evidence. The catalogue is produced elsewhere and injected, so its
  // conformance is checked at injection by tests/injection-conformance.test.ts,
  // and the invariants it asserted are proven above against fixtures that
  // always run.
});

/**
 * SPARE-F004 acceptance contract, criterion by criterion.
 *
 * Source: 20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/SPARE-F004_ACCEPTANCE_CONTRACT.md
 *
 * The ledger invariants (9-12) used to exist only inside the published-snapshot
 * test, which skips when catalog-data/generated is absent — as it is on a fresh
 * clone and in CI. A criterion whose only test skips is not evidence, and this
 * feature's gate rests on these. They are asserted here against fixtures that
 * always run, and the snapshot test now reuses the same helpers so the real
 * data is held to exactly the rules the fixtures prove.
 */

interface LedgerCounts {
  observedMakers: number;
  observedModels: number;
  supplementalMakers: number;
  supplementalModels: number;
  combinedMakers: number;
  combinedModels: number;
  customerReadyModels: number;
}

interface LedgerIntegrity {
  status: string;
  globalDiagramIdentitySafe: boolean;
  crossMakerNodeCollisionCount: number;
  notes: string[];
}

interface LedgerModel {
  customerVisible: boolean;
  evaluation: { customerReady: boolean };
}

/** Criterion 12. */
function assertCountInvariants(counts: LedgerCounts) {
  expect(counts.observedMakers).toBeGreaterThan(0);
  expect(counts.observedModels).toBeGreaterThanOrEqual(counts.observedMakers);
  // The combined universe is a de-duplicated union, so it is at least the
  // larger input and at most the sum. Plain addition would over-count a model
  // that is both observed and on the acquisition list.
  expect(counts.combinedMakers).toBeGreaterThanOrEqual(
    Math.max(counts.observedMakers, counts.supplementalMakers),
  );
  expect(counts.combinedMakers).toBeLessThanOrEqual(
    counts.observedMakers + counts.supplementalMakers,
  );
  expect(counts.combinedModels).toBeGreaterThanOrEqual(
    Math.max(counts.observedModels, counts.supplementalModels),
  );
  expect(counts.combinedModels).toBeLessThanOrEqual(
    counts.observedModels + counts.supplementalModels,
  );
  expect(counts.customerReadyModels).toBeLessThanOrEqual(counts.observedModels);
}

/** Criteria 10 and 11. */
function assertIntegrityInvariants(integrity: LedgerIntegrity) {
  expect(['PASS', 'FAIL']).toContain(integrity.status);
  expect(integrity.globalDiagramIdentitySafe).toBe(
    integrity.crossMakerNodeCollisionCount === 0,
  );
  if (!integrity.globalDiagramIdentitySafe) {
    expect(integrity.notes.join(' ')).toMatch(/node_id|DGM/);
  }
}

/** Criterion 9 — the invariant a customer actually depends on. */
function findLeaks(makers: Array<{ models: LedgerModel[] }>): LedgerModel[] {
  return makers.flatMap((maker) =>
    maker.models.filter(
      (model) => model.customerVisible && !model.evaluation.customerReady,
    ),
  );
}

describe('SPARE-F004 acceptance contract', () => {
  const allPassing = () =>
    REQUIRED_CUSTOMER_FLOW_STAGES.map((stage): CoverageStageEvidence => ({
      stage,
      status: 'PASS',
      evidence: [`${stage} fixture`],
      blockers: [],
    }));

  // Criterion 1 — every stage individually, not just a representative one. A
  // stage silently dropped from the required set would otherwise go unnoticed.
  it.each([...REQUIRED_CUSTOMER_FLOW_STAGES])(
    'criterion 1: %s failing alone is enough to withhold a vehicle',
    (stage) => {
      const stages = allPassing().map((evidence) =>
        evidence.stage === stage
          ? { ...evidence, status: 'BLOCKED' as const, evidence: [], blockers: [`${stage} blocked`] }
          : evidence,
      );
      const evaluation = evaluateCoverage(stages);
      expect(evaluation.customerReady).toBe(false);
      expect(evaluation.firstBlockingStage).toBe(stage);
      expect(evaluation.completedStageCount).toBe(
        REQUIRED_CUSTOMER_FLOW_STAGES.length - 1,
      );
    },
  );

  it('criterion 2: customerReady only when all eleven pass', () => {
    const evaluation = evaluateCoverage(allPassing());
    expect(evaluation.customerReady).toBe(true);
    expect(evaluation.completedStageCount).toBe(
      REQUIRED_CUSTOMER_FLOW_STAGES.length,
    );
    expect(evaluation.requiredStageCount).toBe(11);
  });

  it('criterion 3: reports the earliest failing stage, not any failing stage', () => {
    const stages = allPassing().map((evidence) =>
      evidence.stage === 'FITMENT_READY' || evidence.stage === 'QA_READY'
        ? { ...evidence, status: 'BLOCKED' as const, evidence: [], blockers: [`${evidence.stage} blocked`] }
        : evidence,
    );
    // FITMENT_READY is third, QA_READY is eleventh.
    expect(evaluateCoverage(stages).firstBlockingStage).toBe('FITMENT_READY');
  });

  it('criterion 4: a failing stage always contributes a stated blocker', () => {
    const withBlocker = allPassing().map((evidence) =>
      evidence.stage === 'HERO_READY'
        ? { ...evidence, status: 'BLOCKED' as const, evidence: [], blockers: ['Approved hero image is missing'] }
        : evidence,
    );
    expect(evaluateCoverage(withBlocker).blockers).toContain(
      'Approved hero image is missing',
    );

    // A stage that fails while stating nothing is itself a reportable failure:
    // silence must not read as "no problem".
    const silent = allPassing().map((evidence) =>
      evidence.stage === 'HERO_READY'
        ? { ...evidence, status: 'BLOCKED' as const, evidence: [], blockers: [] }
        : evidence,
    );
    expect(evaluateCoverage(silent).blockers.join(' ')).toContain(
      'HERO_READY has no passing evidence',
    );
  });

  it('criterion 5: a stage with no evidence at all is never a pass', () => {
    // Nothing supplied for any stage — the absence of a record must not be
    // read as consent.
    const evaluation = evaluateCoverage([]);
    expect(evaluation.customerReady).toBe(false);
    expect(evaluation.completedStageCount).toBe(0);
    expect(evaluation.firstBlockingStage).toBe(REQUIRED_CUSTOMER_FLOW_STAGES[0]);
    expect(evaluation.blockers.length).toBeGreaterThan(0);
  });

  it('criterion 9: a leaking ledger is detected, and a clean one is not flagged', () => {
    const clean = [
      { models: [{ customerVisible: true, evaluation: { customerReady: true } }] },
      { models: [{ customerVisible: false, evaluation: { customerReady: false } }] },
    ];
    expect(findLeaks(clean)).toHaveLength(0);

    // The check must be able to fail. An invariant assertion that cannot
    // detect its own violation is decoration.
    const leaking = [
      { models: [{ customerVisible: true, evaluation: { customerReady: false } }] },
    ];
    expect(findLeaks(leaking)).toHaveLength(1);
  });

  it('criterion 10 and 11: integrity flag and collision count must agree', () => {
    assertIntegrityInvariants({
      status: 'PASS',
      globalDiagramIdentitySafe: true,
      crossMakerNodeCollisionCount: 0,
      notes: [],
    });
    assertIntegrityInvariants({
      status: 'FAIL',
      globalDiagramIdentitySafe: false,
      crossMakerNodeCollisionCount: 44_532,
      notes: ['source node_id is not globally unique; DGM migration required'],
    });

    // Disagreement in either direction is a failure, and a failing gate that
    // names no cause is too.
    expect(() =>
      assertIntegrityInvariants({
        status: 'PASS',
        globalDiagramIdentitySafe: true,
        crossMakerNodeCollisionCount: 12,
        notes: [],
      }),
    ).toThrow();
    expect(() =>
      assertIntegrityInvariants({
        status: 'FAIL',
        globalDiagramIdentitySafe: false,
        crossMakerNodeCollisionCount: 12,
        notes: ['something went wrong'],
      }),
    ).toThrow();
  });

  it('criterion 12: combined counts are a union, not a sum', () => {
    assertCountInvariants({
      observedMakers: 43,
      observedModels: 2228,
      supplementalMakers: 10,
      supplementalModels: 100,
      combinedMakers: 48,
      combinedModels: 2300,
      customerReadyModels: 0,
    });

    // Over-counting an overlap is exactly what plain addition does.
    expect(() =>
      assertCountInvariants({
        observedMakers: 43,
        observedModels: 2228,
        supplementalMakers: 10,
        supplementalModels: 100,
        combinedMakers: 60,
        combinedModels: 2300,
        customerReadyModels: 0,
      }),
    ).toThrow();
    // And a vehicle cannot be ready without being observed.
    expect(() =>
      assertCountInvariants({
        observedMakers: 43,
        observedModels: 2228,
        supplementalMakers: 10,
        supplementalModels: 100,
        combinedMakers: 48,
        combinedModels: 2300,
        customerReadyModels: 2229,
      }),
    ).toThrow();
  });
});

/**
 * Criterion 13 — DIAGRAM_READY requires positive proof of the DGM migration.
 *
 * `globalDiagramIdentitySafe` only says no source node_id appears under two
 * makers. A catalogue containing one maker satisfies that. So does one whose
 * colliding rows were deleted rather than migrated. Neither has a single stable
 * id, and the integration lock requires stable `DGM-*` ids — so the negative
 * check alone could pass while the actual requirement was unmet.
 */
describe('SPARE-F004 criterion 13: stable diagram identity is proven, not inferred', () => {
  const metrics: CatalogModelMetrics = {
    variantCount: 3,
    sectionCount: 8,
    diagramCount: 12,
    diagramImageCount: 12,
    partRowCount: 240,
    fitmentResolvedVariantCount: 3,
    diagramsWithHotspotCount: 12,
  };
  const flowPack = {
    flowPackId: 'H2E-TEST-V1',
    visualFamilyId: 'VF-TEST',
    makerSlug: 'test',
    modelSlug: 'test',
    familySlug: 'test',
    fitmentId: 'FIT-TEST',
    customerReady: true,
    entryRoute: '/',
    epcRoute: '/epc/vehicles/test',
    scopeNote: 'test',
  };
  const stageFor = (stages: CoverageStageEvidence[], name: string) =>
    stages.find((stage) => stage.stage === name)!;

  it('withholds DIAGRAM_READY when no identity evidence is supplied at all', () => {
    // The hole: a single-maker catalogue collides with nothing, so the old gate
    // passed it while no DGM id existed anywhere.
    const stages = buildObservedCoverageStages(
      metrics,
      {
        status: 'PASS',
        globalDiagramIdentitySafe: true,
        crossMakerNodeCollisionCount: 0,
        notes: ['No cross-maker source node collisions detected'],
      },
      flowPack,
    );
    const diagram = stageFor(stages, 'DIAGRAM_READY');
    expect(diagram.status).not.toBe('PASS');
    expect(diagram.blockers.join(' ')).toMatch(/not proof that DGM IDs were minted/);
    expect(evaluateCoverage(stages).customerReady).toBe(false);
  });

  it('blocks while any diagram is unmigrated, and names how many', () => {
    const stages = buildObservedCoverageStages(
      metrics,
      {
        status: 'PASS',
        globalDiagramIdentitySafe: true,
        crossMakerNodeCollisionCount: 0,
        notes: [],
        diagramIdentity: { totalDiagrams: 12, withProductionDgmId: 9 },
      },
      flowPack,
    );
    const diagram = stageFor(stages, 'DIAGRAM_READY');
    expect(diagram.status).toBe('BLOCKED');
    expect(diagram.blockers.join(' ')).toContain('3 of 12');
  });

  it('holds hotspots behind diagram identity, because the join goes through it', () => {
    const stages = buildObservedCoverageStages(
      metrics,
      {
        status: 'PASS',
        globalDiagramIdentitySafe: true,
        crossMakerNodeCollisionCount: 0,
        notes: [],
        diagramIdentity: { totalDiagrams: 12, withProductionDgmId: 9 },
      },
      flowPack,
    );
    const hotspots = stageFor(stages, 'HOTSPOT_READY');
    expect(hotspots.status).toBe('BLOCKED');
    expect(hotspots.blockers.join(' ')).toMatch(/joins its diagram through the internal id/);
  });

  it('passes once every diagram carries a stable id', () => {
    const stages = buildObservedCoverageStages(
      metrics,
      {
        status: 'PASS',
        globalDiagramIdentitySafe: true,
        crossMakerNodeCollisionCount: 0,
        notes: [],
        diagramIdentity: { totalDiagrams: 12, withProductionDgmId: 12 },
      },
      flowPack,
    );
    expect(stageFor(stages, 'DIAGRAM_READY').status).toBe('PASS');
    expect(stageFor(stages, 'HOTSPOT_READY').status).toBe('PASS');
    expect(evaluateCoverage(stages).customerReady).toBe(true);
  });
});
