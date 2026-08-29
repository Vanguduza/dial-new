import { describe, expect, it } from 'vitest';
import { buildHotspots } from '../packages/hotspots/src/index.js';
import { runAutomatedQa } from '../packages/qa/src/index.js';

describe('identity QA', () => {
  it('blocks visible silhouette drift', () => {
    const result = runAutomatedQa({ silhouetteIoU: .80, wheelCentreDisplacement: 0, rooflineDisplacement: 0, lampDisplacement: 0, glazingDisplacement: 0, bodyBoundingBoxChange: 0 }, buildHotspots(['VC-ENG']));
    expect(result.passed).toBe(false);
    expect(result.checks.silhouette).toBe(false);
  });
});
