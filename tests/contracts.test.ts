import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseJob, polygonArea, validateHotspots, MOTION_PROFILES } from '../packages/contracts/src/index.js';
import { buildHotspots } from '../packages/hotspots/src/index.js';
import { sha256, stableStringify } from '../packages/pipeline-core/src/hash.js';

describe('DVTG contracts', () => {
  it('accepts the development vertical-slice job and keeps identities separate', async () => {
    const job = parseJob(JSON.parse(await readFile('examples/hilux-an130/job.json', 'utf8')));
    expect(job.visualFamilyId).toBe('VF-TOYOTA-HILUX-AN130-DC-FL');
    expect(job.fitmentMapping.fitmentId).not.toBe(job.visualFamilyId);
    expect(job.fitmentMapping.visualFamilyId).toBe(job.visualFamilyId);
    expect(job.fitmentMapping.schemaVersion).toBe('2.0.0');
    expect(job.fitmentMapping.vehicleContext.catalogFamilyId).toBe('CF-TOYOTA-HILUX-AN120-AN130');
    expect(job.fitmentMapping.vehicleContext.variantId).toMatch(/^CV-/);
    expect(job.fitmentMapping.componentFamilies.every((route) => route.target.sectionSlug.length > 0)).toBe(true);
  });

  it('creates stable hashes independent of object key order', () => {
    expect(sha256(stableStringify({ b: 2, a: 1 }))).toBe(sha256(stableStringify({ a: 1, b: 2 })));
  });

  it('validates normalized hotspot geometry', () => {
    const hotspots = buildHotspots(['VC-ENG', 'VC-TRN', 'VC-BODY']);
    expect(validateHotspots(hotspots)).toEqual([]);
    expect(hotspots.every((hotspot) => polygonArea(hotspot.polygon) > 0)).toBe(true);
  });

  it('keeps the motion sequence centralized and within the desktop frame budget', () => {
    expect(MOTION_PROFILES['premium-v1'].desktopFrames).toBeLessThanOrEqual(120);
    expect(MOTION_PROFILES['premium-v1'].segments.NAVIGATION).toEqual([.94, 1]);
    expect('TECHNICAL' in MOTION_PROFILES['premium-v1'].segments).toBe(false);
  });
});
