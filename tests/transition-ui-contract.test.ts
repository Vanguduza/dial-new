import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('customer transition UI contract', () => {
  it('keeps the visual window free of progress chrome, stage labels and visible hotspots', async () => {
    const source = await readFile('apps/preview-player/components/dvtg-preview.tsx', 'utf8');
    for (const removedText of [
      'Interactive vehicle view',
      'Current view',
      'Automatic vehicle transformation',
      'Select a system',
      'What are you working on?',
      'Hero · CGI',
    ]) {
      expect(source).not.toContain(removedText);
    }
    expect(source).toContain('Know your {vehicleFamily.make} {vehicleFamily.model} {vehicleFamily.generation}.');
    expect(source).toContain('Exploded vehicle category map');
    expect(source).toContain("getCategoryFamilyHref('VC-BODY')");
    expect(source).toContain('clipPath: layer.clipPath');
  });

  it('publishes the shortened transition and invisible hit-map stages', async () => {
    const flow = JSON.parse(await readFile(
      'apps/preview-player/public/packs/VF-TOYOTA-HILUX-AN130-DC-FL/v1/navigation/hero-to-epc-flow-pack.json',
      'utf8',
    ));
    const ids = flow.stages.map((stage: { id: string }) => stage.id);
    expect(ids).not.toContain('TECHNICAL_SHADED');
    expect(ids).not.toContain('VISUAL_HOTSPOTS');
    expect(ids).toContain('VISUAL_HIT_MAP');
    expect(flow.autoplay.userPlayControl).toBe(false);
  });
});
