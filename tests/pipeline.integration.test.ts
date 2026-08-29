import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPipeline, validateJobFile } from '../packages/pipeline-core/src/index.js';
import { sha256 } from '../packages/pipeline-core/src/hash.js';

const roots: string[] = [];
const source = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#182630"/></svg>';

async function fixture(commercialUseApproved = true) {
  const root = await mkdtemp(join(tmpdir(), 'dvtg-test-')); roots.push(root);
  const sourcePath = join(root, 'source.svg'); await writeFile(sourcePath, source);
  const job = {
    visualFamilyId: 'VF-TEST-PICKUP-DC', make: 'Test', model: 'Pickup', generation: 'One', bodyStyle: 'Double Cab', visualPhase: 'Original', yearFrom: 2026, yearTo: null,
    references: { frontThreeQuarter: 'source.svg' },
    provenance: { frontThreeQuarter: { assetId: 'TEST', sourceUrl: 'test://fixture', author: 'Test', licence: 'Original test fixture', licenceUrl: 'test://licence', attribution: 'Test', downloadedAt: new Date(0).toISOString(), sha256: sha256(source), commercialUseApproved } },
    enabledCategories: ['VC-ENG','VC-TRN','VC-BODY'],
    fitmentMapping: {
      schemaVersion: '2.0.0', mappingId: 'VEM-TEST-PICKUP-ONE', catalogReleaseId: 'CAT-TEST-V2', fitmentId: 'FIT-TEST-ONE', visualFamilyId: 'VF-TEST-PICKUP-DC',
      vehicleContext: { makerSlug: 'test', catalogFamilyId: 'CF-TEST-PICKUP', familySlug: 'test-pickup', variantId: 'CV-TEST-PICKUP-ONE', variantSlug: 'test-pickup-one', chassisCodes: ['TEST-1'], engineCodes: [], market: null, attributes: { bodyStyle: 'double-cab' } },
      categories: [
        { visualCategoryId:'VC-ENG', componentFamilyId:'VCF-TEST-ENGINE', label:'Engine', target:{ sectionSlug:'engine', groupId:'GRP-TEST-ENGINE', groupSlug:'engine', defaultDiagramId:'DGM-TEST-ENG-001', fallbackQuery:'engine', selectionMode:'GROUP', minimumReadiness:'BROWSE_READY' } },
        { visualCategoryId:'VC-TRN', componentFamilyId:'VCF-TEST-TRANSMISSION', label:'Transmission', target:{ sectionSlug:'transmission-drivetrain', groupId:'GRP-TEST-TRANSMISSION', groupSlug:'transmission', defaultDiagramId:'DGM-TEST-TRN-001', fallbackQuery:'transmission', selectionMode:'GROUP', minimumReadiness:'BROWSE_READY' } },
        { visualCategoryId:'VC-BODY', componentFamilyId:'VCF-TEST-BODY', label:'Body', target:{ sectionSlug:'body-exterior', groupId:null, groupSlug:null, defaultDiagramId:null, fallbackQuery:'body', selectionMode:'SECTION', minimumReadiness:'BROWSE_READY' } }
      ],
      componentFamilies: [],
      provenance: { authority:'CATALOG', source:'test fixture', sourceVersion:'1', confidence:1, reviewedAt:null }
    },
    developmentMode: true, outputRoot: 'artifacts', motionProfile: 'test-v1', generationProvider: 'deterministic-development'
  };
  const jobPath = join(root, 'job.json'); await writeFile(jobPath, JSON.stringify(job)); return jobPath;
}

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('pipeline integration', () => {
  it('blocks an unapproved source before processing', async () => { await expect(validateJobFile(await fixture(false))).rejects.toThrow(/commercialUseApproved/); });

  it('runs every stage and resumes unchanged successful work idempotently', async () => {
    const jobPath = await fixture();
    const first = await runPipeline(jobPath);
    expect(Object.values(first.state.stages).every((stage) => stage.status === 'PASS')).toBe(true);
    const endedAt = first.state.stages['12_ANIMATE'].endedAt;
    const second = await runPipeline(jobPath);
    expect(second.jobId).toBe(first.jobId);
    expect(second.state.stages['12_ANIMATE'].endedAt).toBe(endedAt);
    const meta = JSON.parse(await readFile(join(second.packRoot, 'meta.json'), 'utf8'));
    expect(meta.productionPublishable).toBe(false);
    const flowPack = JSON.parse(await readFile(join(second.packRoot, 'navigation', 'hero-to-epc-flow-pack.json'), 'utf8'));
    expect(flowPack.customerReady).toBe(false);
    expect(flowPack.entryModes).toEqual(expect.arrayContaining(['CASCADE_SEARCH', 'GARAGE_VISUAL_FLOW', 'GARAGE_EPC_DIRECT', 'MENU_EPC_BROWSE']));
    expect(flowPack.autoplay).toMatchObject({ trigger: 'VEHICLE_SEARCH_COMMITTED', userPlayControl: false });
    expect(flowPack.retainedSelection).toMatchObject({ preserveUntilEdited: true, committedTextAppearance: 'FAINT_GREY' });
    expect(flowPack.stages.map((stage: { id: string }) => stage.id)).toEqual(expect.arrayContaining(['HERO_PHOTOGRAPHY', 'EXPLODED_SYSTEMS', 'EPC_DIAGRAM_AND_PARTS']));
    expect(flowPack.stages.map((stage: { id: string }) => stage.id)).not.toContain('TECHNICAL_SHADED');
    expect(flowPack.stages.map((stage: { id: string }) => stage.id)).toContain('VISUAL_HIT_MAP');
  }, 60_000);
});
