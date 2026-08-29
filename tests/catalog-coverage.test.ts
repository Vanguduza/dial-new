import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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

  // The published snapshot is asserted on its invariants rather than on today's
  // census figures. The previous version pinned observedMakers to 43,
  // observedModels to 2228 and integrity.status to 'FAIL', which meant that
  // fixing the 44,532 diagram-identity collisions — the catalog's first job —
  // would break the test suite.
  it('publishes a snapshot whose invariants hold regardless of catalog size', async ({ skip }) => {
    // These are build outputs of `npm run catalog:coverage`, not committed
    // source. Skip cleanly on a fresh clone rather than failing.
    const read = async (name: string) => {
      try {
        return JSON.parse(await readFile(resolve(`catalog-data/generated/${name}`), 'utf8'));
      } catch {
        return null;
      }
    };
    const summary = await read('catalog-coverage-summary.json');
    const universe = await read('vehicle-universe.json');
    const ledger = await read('catalog-coverage-ledger.json');
    if (!summary || !universe || !ledger) {
      skip('catalog-data/generated is absent; run `npm run catalog:coverage` first');
      return;
    }

    const counts = summary.counts;

    // Internal consistency, not fixed values.
    expect(counts.observedMakers).toBeGreaterThan(0);
    expect(counts.observedModels).toBeGreaterThanOrEqual(counts.observedMakers);
    // The combined universe is a de-duplicated union. A maker or model that is
    // already observed may also appear in the supplemental acquisition list,
    // so simple addition can over-count it.
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
    expect(universe.makers.length).toBeGreaterThanOrEqual(counts.observedMakers);

    // Integrity is reported, never swallowed. Collisions and the safety flag
    // must agree with each other in either direction, so this assertion holds
    // before and after the DGM migration.
    expect(['PASS', 'FAIL']).toContain(summary.integrity.status);
    expect(summary.integrity.globalDiagramIdentitySafe).toBe(
      summary.integrity.crossMakerNodeCollisionCount === 0,
    );
    if (!summary.integrity.globalDiagramIdentitySafe) {
      expect(summary.integrity.notes.join(' ')).toMatch(/node_id|DGM/);
    }

    // The invariant that actually protects customers: nothing incomplete is
    // ever visible, whatever the catalog contains.
    const leaked = ledger.observedMakers.flatMap(
      (maker: {
        models: Array<{ customerVisible: boolean; evaluation: { customerReady: boolean } }>;
      }) => maker.models.filter((model) => model.customerVisible && !model.evaluation.customerReady),
    );
    expect(leaked).toHaveLength(0);
  });
});
