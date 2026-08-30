import { describe, expect, it } from 'vitest';
import {
  validateCatalogueInjection,
  type CatalogueInjectionManifest,
} from '../packages/catalog-coverage/src/injection.js';
import { dgmIdFor } from '../packages/catalog-coverage/src/diagram-identity.js';

/**
 * Catalogue injection conformance.
 *
 * The catalogue is produced elsewhere and injected here when it is finished, so
 * this repository does not audit the catalogue — it states the contract and
 * checks a bundle against it at the moment of injection. These tests exercise
 * the contract, not any catalogue.
 */

const conformant = (): CatalogueInjectionManifest => ({
  bundleId: 'CAT-BUNDLE-2026-09-01',
  sourceSystem: '7zap',
  producedAt: '2026-09-01T00:00:00.000Z',
  catalogReleaseId: 'CAT-REL-2026-09',
  counts: {
    makers: 43,
    models: 2228,
    variants: 8912,
    sections: 17_824,
    diagrams: 96_000,
    diagramParts: 1_920_000,
    placements: 2_400_000,
  },
  diagramIdentity: {
    totalDiagrams: 96_000,
    withProductionDgmId: 96_000,
    crossMakerNodeCollisions: 0,
    sampleDgmIds: [
      dgmIdFor({
        sourceSystem: '7zap',
        makerSlug: 'toyota',
        modelSlug: 'hilux',
        variantSlug: null,
        sectionSlug: 'engine',
        nodeId: '10401',
      }),
    ],
  },
  fitment: { totalVariants: 8912, withResolvedFitment: 8912 },
  hotspots: { totalDiagrams: 96_000, withPositionHotspots: 96_000 },
  images: { totalDiagrams: 96_000, withVerifiedImage: 96_000 },
  provenance: {
    sources: [{ name: '7zap', licence: 'commercial-agreement-2026', rightsCleared: true }],
  },
});

describe('catalogue injection conformance', () => {
  it('accepts a conformant bundle', () => {
    const result = validateCatalogueInjection(conformant());
    expect(result.findings).toEqual([]);
    expect(result.conformant).toBe(true);
    expect(result.checked).toBeGreaterThan(10);
  });

  it('refuses the collision the migration exists to remove', () => {
    const m = conformant();
    m.diagramIdentity.crossMakerNodeCollisions = 44_532;
    const result = validateCatalogueInjection(m);
    expect(result.conformant).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('CAT-INJ-011');
    expect(result.findings.find((f) => f.rule === 'CAT-INJ-011')?.observed).toContain('44532');
  });

  it('refuses a catalogue that never collided but was never migrated', () => {
    // The hole a negative-only check leaves: one maker collides with nothing.
    const m = conformant();
    m.diagramIdentity.crossMakerNodeCollisions = 0;
    m.diagramIdentity.withProductionDgmId = 0;
    const result = validateCatalogueInjection(m);
    expect(result.findings.map((f) => f.rule)).toContain('CAT-INJ-012');
  });

  it('refuses hand-authored development ids', () => {
    const m = conformant();
    m.diagramIdentity.sampleDgmIds = ['DGM-HILUX-ENG-001'];
    const result = validateCatalogueInjection(m);
    expect(result.findings.map((f) => f.rule)).toContain('CAT-INJ-014');
  });

  it('treats absent evidence as a refusal, never as zero or as fine', () => {
    const m = conformant() as unknown as Record<string, unknown>;
    delete m.fitment;
    delete m.hotspots;
    delete m.images;
    const result = validateCatalogueInjection(m as unknown as CatalogueInjectionManifest);
    const rules = result.findings.map((f) => f.rule);
    expect(rules).toContain('CAT-INJ-020');
    expect(rules).toContain('CAT-INJ-021');
    expect(rules).toContain('CAT-INJ-022');
  });

  it('refuses a bundle whose sources have no cleared rights', () => {
    // ACT-REG-011 is open; this is where it bites, and it is far cheaper here
    // than after the data is in.
    const m = conformant();
    m.provenance.sources = [{ name: 'scraped-oem', licence: '', rightsCleared: false }];
    const result = validateCatalogueInjection(m);
    const rules = result.findings.map((f) => f.rule);
    expect(rules).toContain('CAT-INJ-031');
    expect(rules).toContain('CAT-INJ-032');
  });

  it('refuses a release with no identity or timestamp', () => {
    const m = conformant();
    m.catalogReleaseId = '';
    m.producedAt = 'whenever';
    const result = validateCatalogueInjection(m);
    const rules = result.findings.map((f) => f.rule);
    expect(rules).toContain('CAT-INJ-003');
    expect(rules).toContain('CAT-INJ-004');
  });

  it('states a remedy on every finding', () => {
    // A refusal that does not say what to do next is a wall, not a gate.
    const m = conformant();
    m.diagramIdentity.crossMakerNodeCollisions = 5;
    m.fitment.withResolvedFitment = 1;
    const result = validateCatalogueInjection(m);
    expect(result.findings.length).toBeGreaterThan(1);
    for (const finding of result.findings) {
      expect(finding.remedy.length, finding.rule).toBeGreaterThan(20);
      expect(finding.severity).toBe('REFUSE');
    }
  });
});
