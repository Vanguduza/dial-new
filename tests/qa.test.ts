import { describe, expect, it } from 'vitest';
import { buildHotspots } from '../packages/hotspots/src/index.js';
import { runAutomatedQa } from '../packages/qa/src/index.js';

describe('identity QA', () => {
  it('blocks visible silhouette drift', () => {
    const result = runAutomatedQa(
      { silhouetteIoU: .80, wheelCentreDisplacement: 0, rooflineDisplacement: 0, lampDisplacement: 0, glazingDisplacement: 0, bodyBoundingBoxChange: 0 },
      buildHotspots(['VC-ENG']),
      { expectedWheelPositions: 4, tyresPerPosition: { frontLeft: 1, frontRight: 1, rearLeft: 1, rearRight: 1 }, looseSpareTyres: 0 },
    );
    expect(result.passed).toBe(false);
    expect(result.checks.silhouette).toBe(false);
  });

  it('blocks duplicate tyres at any exploded-view wheel position', () => {
    const result = runAutomatedQa(
      { silhouetteIoU: .99, wheelCentreDisplacement: 0, rooflineDisplacement: 0, lampDisplacement: 0, glazingDisplacement: 0, bodyBoundingBoxChange: 0 },
      buildHotspots(['VC-ENG']),
      { expectedWheelPositions: 4, tyresPerPosition: { frontLeft: 2, frontRight: 1, rearLeft: 1, rearRight: 2 }, looseSpareTyres: 0 },
    );
    expect(result.passed).toBe(false);
    expect(result.checks.wheelMultiplicity).toBe(false);
  });
});
