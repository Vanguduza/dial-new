import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  REQUIRED_CUSTOMER_FLOW_STAGES,
  assertCustomerReady,
  buildBacklogCoverageStages,
  evaluateCoverage,
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

  it('publishes an honest snapshot of the attached catalog and missing priority vehicles', async () => {
    const summary = JSON.parse(await readFile(resolve('catalog-data/generated/catalog-coverage-summary.json'), 'utf8'));
    const universe = JSON.parse(await readFile(resolve('catalog-data/generated/vehicle-universe.json'), 'utf8'));
    const ledger = JSON.parse(await readFile(resolve('catalog-data/generated/catalog-coverage-ledger.json'), 'utf8'));
    const makerSlugs = new Set(universe.makers.map((maker: { slug: string }) => maker.slug));

    expect(summary.counts.observedMakers).toBe(43);
    expect(summary.counts.observedModels).toBe(2228);
    expect(summary.counts.supplementalModels).toBeGreaterThanOrEqual(355);
    expect(summary.counts.customerReadyModels).toBe(0);
    expect(summary.integrity.status).toBe('FAIL');
    expect(summary.integrity.crossMakerNodeCollisionCount).toBeGreaterThan(0);
    for (const requiredMaker of ['toyota', 'honda', 'isuzu', 'nissan', 'chery', 'gwm', 'byd', 'geely', 'omoda', 'jaecoo']) {
      expect(makerSlugs.has(requiredMaker), `${requiredMaker} should be represented`).toBe(true);
    }

    const leaked = ledger.observedMakers.flatMap((maker: { models: Array<{ customerVisible: boolean; evaluation: { customerReady: boolean } }> }) =>
      maker.models.filter((model) => model.customerVisible && !model.evaluation.customerReady),
    );
    expect(leaked).toHaveLength(0);
  });
});
