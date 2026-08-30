import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseJob, polygonArea, validateHotspots, MOTION_PROFILES } from '../packages/contracts/src/index.js';
import type { VisualCategoryId, VisualEpcMapping } from "../packages/contracts/src/index.js";
import { buildHotspots } from '../packages/hotspots/src/index.js';
import { sha256, stableStringify } from '../packages/pipeline-core/src/hash.js';

// Minimal mapping fixture. buildHotspots now takes the catalog targets from the
// VisualEpcMapping rather than inventing them, per Catalog Agent section 8.
function mappingFor(categories: VisualCategoryId[]): VisualEpcMapping {
  return {
    schemaVersion: "2.0.0",
    mappingId: "VEM-TEST",
    catalogReleaseId: "CAT-TEST",
    fitmentId: "FIT-TEST",
    visualFamilyId: "VF-TEST",
    vehicleContext: {
      makerSlug: "test",
      catalogFamilyId: "CF-TEST",
      familySlug: "test",
      variantId: null,
      variantSlug: null,
      chassisCodes: [],
      engineCodes: [],
      market: null,
      attributes: {},
    },
    categories: categories.map((visualCategoryId) => ({
      visualCategoryId,
      componentFamilyId: `VCF-${visualCategoryId.replace("VC-", "")}`,
      label: visualCategoryId,
      target: {
        sectionSlug:
          visualCategoryId === "VC-ENG"
            ? "engine"
            : visualCategoryId === "VC-TRN"
              ? "transmission-drivetrain"
              : visualCategoryId === "VC-BODY"
                ? "body-exterior"
                : "chassis-systems",
        groupId: null,
        groupSlug: null,
        defaultDiagramId: null,
        fallbackQuery: null,
        selectionMode: "SECTION" as const,
        minimumReadiness: "BROWSE_READY" as const,
      },
    })),
    componentFamilies: [],
    provenance: {
      authority: "CATALOG" as const,
      source: "test",
      sourceVersion: "1",
      confidence: 1,
      reviewedAt: null,
    },
  };
}

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
    const hotspots = buildHotspots(['VC-ENG', 'VC-TRN', 'VC-BODY'], mappingFor(['VC-ENG', 'VC-TRN', 'VC-BODY']));
    expect(validateHotspots(hotspots)).toEqual([]);
    expect(hotspots.every((hotspot) => polygonArea(hotspot.polygon) > 0)).toBe(true);
  });

  it('keeps the motion sequence centralized and within the desktop frame budget', () => {
    expect(MOTION_PROFILES['premium-v1'].desktopFrames).toBeLessThanOrEqual(120);
    expect(MOTION_PROFILES['premium-v1'].segments.NAVIGATION).toEqual([.94, 1]);
    expect('TECHNICAL' in MOTION_PROFILES['premium-v1'].segments).toBe(false);
  });
});
