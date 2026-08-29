import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

interface Mapping {
  schemaVersion: string;
  catalogReleaseId: string;
  fitmentId: string;
  visualFamilyId: string;
  vehicleContext: { makerSlug: string; catalogFamilyId: string; familySlug: string; variantId: string | null; chassisCodes: string[] };
  categories: Array<{
    visualCategoryId: string;
    componentFamilyId: string;
    target: { sectionSlug: string; groupSlug: string | null; defaultDiagramId: string | null };
  }>;
  componentFamilies: Array<{
    componentFamilyId: string;
    visualCategoryId: string;
    target: { sectionSlug: string; groupSlug: string | null; defaultDiagramId: string | null };
  }>;
}

const familyId = 'VF-TOYOTA-HILUX-AN130-DC-FL';

async function loadMapping(relativePath: string): Promise<Mapping> {
  const text = await readFile(path.resolve(process.cwd(), relativePath), 'utf8');
  return JSON.parse(text) as Mapping;
}

describe('EPC visual-family navigation', () => {
  it('binds every visual category to a structured section target for the selected Hilux family', async () => {
    const mapping = await loadMapping('apps/preview-player/public/packs/VF-TOYOTA-HILUX-AN130-DC-FL/v1/navigation/epc-mapping.json');
    expect(mapping.schemaVersion).toBe('2.0.0');
    expect(mapping.visualFamilyId).toBe(familyId);
    expect(mapping.vehicleContext.catalogFamilyId).toBe('CF-TOYOTA-HILUX-AN120-AN130');
    expect(mapping.vehicleContext.variantId).not.toBeNull();
    expect(mapping.vehicleContext.chassisCodes).toContain('GUN126');
    expect(mapping.categories).toHaveLength(7);
    expect(mapping.categories.every((category) => category.target.sectionSlug.length > 0)).toBe(true);
    expect(mapping.categories.every((category) => !('landingSlug' in category))).toBe(true);
  });

  it('maps every exterior component hotspot to the shared Body & Exterior section and exact group', async () => {
    const mapping = await loadMapping('apps/preview-player/public/packs/VF-TOYOTA-HILUX-AN130-DC-FL/v1/navigation/epc-mapping.json');
    const body = mapping.categories.find((category) => category.visualCategoryId === 'VC-BODY');
    expect(body?.target.sectionSlug).toBe('body-exterior');
    const expected = ['VCF-BODY-FRONT-BUMPER', 'VCF-BODY-HEADLAMPS', 'VCF-BODY-FRONT-DOORS', 'VCF-BODY-REAR-DOORS', 'VCF-BODY-CARGO-BED', 'VCF-BODY-TAILGATE'];
    for (const componentFamilyId of expected) {
      const component = mapping.componentFamilies.find((item) => item.componentFamilyId === componentFamilyId);
      expect(component?.target.sectionSlug).toBe('body-exterior');
      expect(component?.target.groupSlug).toBeTruthy();
      expect(component?.target.defaultDiagramId).toMatch(/^DGM-/);
    }
  });

  it('keeps generated and published mappings identical', async () => {
    const [artifact, published] = await Promise.all([
      loadMapping('artifacts/VF-TOYOTA-HILUX-AN130-DC-FL/v1/navigation/epc-mapping.json'),
      loadMapping('apps/preview-player/public/packs/VF-TOYOTA-HILUX-AN130-DC-FL/v1/navigation/epc-mapping.json'),
    ]);
    expect(published).toEqual(artifact);
  });
});
