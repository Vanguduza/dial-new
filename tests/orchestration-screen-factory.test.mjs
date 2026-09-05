import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  assertAuxiliaryPayload, configureOpenRouterAux, refreshOpenRouterCatalog,
  selectOpenRouterAuxModels, OPENROUTER_DATA_CLASS,
} from '../agent-system/orchestration/auxiliary-openrouter.mjs';
import { renderScreenBundle } from '../agent-system/orchestration/screen-factory-renderer.mjs';
import {
  controlScreenFactory, importScreenFactoryManifest, importExternalScreenEvidence, ingestChatGPTReceipt,
  prepareChatGPTBatch, reconcileLocalScreenArtifacts, resetScreenFactory, runScreenFactoryTick, screenFactoryStatus, validateChatGPTTransport,
} from '../agent-system/orchestration/screen-factory.mjs';
import { readJson } from '../agent-system/orchestration/state-store.mjs';

function temp(name) { return mkdtempSync(path.join(tmpdir(), `${name}-`)); }
function tasks(count = 11) {
  return Array.from({ length: count }, (_, i) => ({
    task_id: `MH-S${String(i + 1).padStart(3, '0')}::ios_mobile`,
    screen_id: `MH-S${String(i + 1).padStart(3, '0')}`,
    title: `Screen ${i + 1}`, business_unit: 'My Health', platform: 'ios_mobile',
    platform_policy: 'REQUIRED', purpose: 'Test purpose', features: 'A; B', interaction: 'Open; Continue',
    next_routes: '/next', required_variants: 'LOADING; POPULATED; EMPTY', archetype: 'Focused Task',
    evidence_basis: ['TEST-CANONICAL-CONTRACT'], ux_profile: 'MY_HEALTH_WARM_PROGRESSIVE_DISCLOSURE',
  }));
}

async function makeImage(target) {
  await sharp({ create: { width: 1024, height: 1536, channels: 3, background: '#f8fafc' } }).png().toFile(target);
}
function implementationSpec() {
  return {
    layout: { viewport: 'mobile', regions: [{ id: 'content', role: 'main' }] },
    interactions: [{ id: 'primary', action: 'route' }],
    states: [{ state: 'POPULATED', visible: ['content'] }],
    data_bindings: [{ region: 'content', source: 'screen_read_model' }],
  };
}

describe('OpenRouter auxiliary isolation', () => {
  it('admits only curated zero-price reasoning models and never openrouter/free', async () => {
    const root = temp('openrouter-aux');
    const fetchImpl = async () => ({ ok: true, async json() { return { data: [
      { id: 'z-ai/glm-5.2:free', name: 'GLM', context_length: 256000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['reasoning','response_format','structured_outputs'] },
      { id: 'openrouter/free', name: 'Random', context_length: 1000000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['reasoning'] },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Super', context_length: 262144, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['reasoning','response_format'] },
      { id: 'z-ai/glm-5.2', name: 'Paid GLM', context_length: 1000000, pricing: { prompt: '0.1', completion: '0.2' }, supported_parameters: ['reasoning'] },
    ] }; } });
    const catalog = await refreshOpenRouterCatalog({ root, fetchImpl });
    expect(catalog.models.map((m) => m.id)).toEqual(['z-ai/glm-5.2:free','nvidia/nemotron-3-super-120b-a12b:free']);
    expect(selectOpenRouterAuxModels('contract_lint', catalog)[0]).toBe('z-ai/glm-5.2:free');
    expect(JSON.stringify(catalog)).not.toContain('openrouter/free');
  });
  it('cannot become Screen Factory manager or runtime fallback', () => {
    const root = temp('openrouter-config');
    const status = configureOpenRouterAux({ apiKey: 'sk-test-openrouter-auxiliary-123456789' }, root);
    expect(status.manager_eligible).toBe(false);
    expect(status.runtime_fallback_eligible).toBe(false);
    expect(status.key_file_mode).toBe('600');
    expect(JSON.stringify(status)).not.toContain('sk-test-openrouter');
    expect(() => assertAuxiliaryPayload({ content: 'safe', dataClassification: 'PHI' })).toThrow(/SYNTHETIC_NON_SENSITIVE/);
    expect(() => assertAuxiliaryPayload({ content: 'api_key=secretsecretsecret', dataClassification: OPENROUTER_DATA_CLASS })).toThrow(/secret/);
  });
});

describe('implementation-convertible renderer utility', () => {
  it('produces PNG plus implementation/layout artifacts at high-DPI', async () => {
    const out = temp('screen-render');
    const task = tasks(1)[0];
    const packet = {
      screen_id: task.screen_id, title: task.title, platform: task.platform,
      semantic_html: '<main data-ui="screen"><section class="dh-card"><h1>Today</h1><button data-action="open-care">Find care</button></section></main>',
      css: 'main{padding:20px}.dh-card{padding:20px}button{border:0;border-radius:12px}',
      interaction_map: [{ element_id: 'primary-action', action_id: 'open-care', action_type: 'route', target_route: '/care' }],
      data_bindings: [], state_map: [{ state: 'POPULATED', trigger: 'load', visible_change: 'summary shown' }],
      feature_coverage: [{ feature: 'Need care', element_id: 'primary-action', realization: 'button', evidence: 'TEST-CANONICAL-CONTRACT' }],
      evidence_map: [{ feature: 'Need care', source: 'TEST-CANONICAL-CONTRACT' }], additional_features: [],
      component_contracts: [{ component_id: 'content', type: 'card', data_owner: 'screen_read_model' }],
      experience_profile: { information_density: 'LOW_TO_MODERATE', progressive_disclosure: true },
    };
    const result = await renderScreenBundle({ task, packet, outputRoot: out });
    expect(result.qa.pass).toBe(true);
    expect(existsSync(result.png_path)).toBe(true);
    expect(existsSync(result.html_path)).toBe(true);
    expect(result.viewport.dpr).toBe(3);
  });
});

describe('ChatGPT transport isolation', () => {
  it('accepts only the fixed private-repo Git blob bridge with hash verification metadata', () => {
    const valid = validateChatGPTTransport({
      type: 'github_blob', repository: 'Vanguduza/dial-new',
      blob_sha: 'a'.repeat(40), sha256: 'b'.repeat(64), filename: 'MH-S001.png',
    });
    expect(valid.repository).toBe('Vanguduza/dial-new');
    expect(valid.type).toBe('github_blob');
    expect(() => validateChatGPTTransport({ ...valid, repository: 'other/repo' })).toThrow(/allowlisted/);
    expect(() => validateChatGPTTransport({ ...valid, blob_sha: '../bad' })).toThrow(/40-character/);
    expect(() => validateChatGPTTransport({ ...valid, filename: 'payload.sh' })).toThrow(/PNG, JPEG or WEBP/);
  });
});

describe('ChatGPT-powered persistent Screen Factory controller', () => {
  it('prepares only incomplete contract-ready tasks without generating pixels', () => {
    const root = temp('screen-factory-wait');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(11) }));
    importScreenFactoryManifest(source, root);
    const request = prepareChatGPTBatch(root);
    const status = screenFactoryStatus(root);
    expect(status.state).toBe('STOPPED');
    expect(status.generator_authority).toBe('GPT-5.6_SOL_PRIMARY');
    expect(status.complete).toBe(0);
    expect(request.generator_authority).toBe('GPT-5.6_SOL_PRIMARY');
    expect(request.tasks).toHaveLength(10);
    expect(request.instruction).toContain('one separate standalone');
    expect(request.design_policy_version).toBe('DIAL_HEALTH_SCREEN_FACTORY_UX_REV2');
    expect(readJson('screen-factory/manifest.json', null, root).tasks[0].bundle_dir).toBe(null);
  });

  it('accepts a ChatGPT-authored implementation packet and renders it deterministically on Oracle', async () => {
    const root = temp('screen-factory-impl-packet');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(1) }));
    importScreenFactoryManifest(source, root);
    prepareChatGPTBatch(root);
    const receipt = path.join(root, 'receipt-impl.json');
    writeFileSync(receipt, JSON.stringify({ entries: [{
      task_id: 'MH-S001::ios_mobile',
      implementation_packet: {
        screen_id: 'MH-S001', platform: 'ios_mobile',
        semantic_html: '<main data-ui="screen"><section class="dh-card" data-ui="summary"><h1>Today</h1><button data-action="open-care">Find care</button></section></main>',
        css: 'main{padding:20px}.dh-card{padding:20px}button{padding:12px 16px;border:0;border-radius:12px}',
        interaction_map: [{ element_id: 'open-care', action_id: 'open-care', action_type: 'route', target_route: '/care' }],
        data_bindings: [], state_map: [{ state: 'POPULATED', trigger: 'load', visible_change: 'summary shown' }],
        feature_coverage: [{ feature: 'Need care', element_id: 'open-care', realization: 'button', evidence: 'TEST-CANONICAL-CONTRACT' }],
        evidence_map: [{ feature: 'Need care', source: 'TEST-CANONICAL-CONTRACT' }], additional_features: [],
        component_contracts: [{ component_id: 'summary', type: 'card', data_owner: 'screen_read_model' }],
        experience_profile: { information_density: 'LOW_TO_MODERATE', progressive_disclosure: true },
      },
    }] }));
    const result = await ingestChatGPTReceipt(receipt, root);
    expect(result.status.complete).toBe(1);
    expect(result.status.implementation_ready).toBe(1);
    expect(result.status.materialized).toBe(1);
    const task = readJson('screen-factory/manifest.json', null, root).tasks[0];
    expect(task.generator_provenance.generator).toBe('CHATGPT_IMPLEMENTATION_PACKET');
    expect(task.generator_provenance.deterministic_renderer).toBe('PLAYWRIGHT_CHROMIUM');
    expect(existsSync(task.asset_path)).toBe(true);
    expect(existsSync(path.join(task.bundle_dir, 'MH-S001__ios_mobile.implementation.json'))).toBe(true);
  });

  it('never creates batch ZIPs and creates one platform ZIP only when the platform is complete', async () => {
    const root = temp('screen-factory-control');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(11) }));
    importScreenFactoryManifest(source, root);
    const request = prepareChatGPTBatch(root);
    const entries = [];
    for (const task of request.tasks) {
      const image = path.join(root, `${task.screen_id}.png`); await makeImage(image);
      entries.push({ task_id: task.task_id, image_path: image, implementation_spec: implementationSpec() });
    }
    const receipt = path.join(root, 'receipt-1.json'); writeFileSync(receipt, JSON.stringify({ entries }));
    await ingestChatGPTReceipt(receipt, root);
    let status = screenFactoryStatus(root);
    expect(status.complete).toBe(10); expect(status.implementation_ready).toBe(10);
    const batch = status.batches.find((item) => item.number === 1);
    expect(batch.state).toBe('COMPLETE'); expect(batch.downloadable).toBe(false); expect(batch.zip_path).toBe(null);
    let platform = status.platform_packages.find((item) => item.platform === 'ios_mobile');
    expect(platform.state).toBe('IN_PROGRESS'); expect(platform.downloadable).toBe(false);
    const second = prepareChatGPTBatch(root); expect(second.tasks).toHaveLength(1); expect(second.tasks[0].screen_id).toBe('MH-S011');
    const lastImage = path.join(root, 'MH-S011.png'); await makeImage(lastImage);
    const receipt2 = path.join(root, 'receipt-2.json'); writeFileSync(receipt2, JSON.stringify({ entries: [{ task_id: second.tasks[0].task_id, image_path: lastImage, implementation_spec: implementationSpec() }] }));
    await ingestChatGPTReceipt(receipt2, root); status = screenFactoryStatus(root);
    platform = status.platform_packages.find((item) => item.platform === 'ios_mobile');
    expect(platform.state).toBe('COMPLETE'); expect(platform.downloadable).toBe(true); expect(existsSync(platform.zip_path)).toBe(true);
    expect(existsSync(path.join(platform.stage_dir, 'IMPLEMENTATION_HANDOFF.md'))).toBe(true);
    expect(existsSync(path.join(platform.stage_dir, 'ADDITIONAL_FEATURES_INTEGRATION.md'))).toBe(true);
  });

  it('counts verified historical ChatGPT images without pretending they are materialized on Oracle', () => {
    const root = temp('screen-factory-existing');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(2) }));
    importScreenFactoryManifest(source, root);
    const evidence = path.join(root, 'evidence.json');
    writeFileSync(evidence, JSON.stringify({ verified_count: 1, assets: [{
      task_id: 'MH-S001::ios_mobile', screen_id: 'MH-S001', platform: 'ios_mobile',
      filename: 'historical.png', sha256: 'a'.repeat(64), byte_size: 1234, width: 1024, height: 1536,
      format: 'PNG', verified: true, evidence_source: 'CHATGPT_CONVERSATION_GENERATED_ASSET',
      generator: 'CHATGPT_IMAGE_GEN', visual_qa: 'ACCEPTED_STYLE_REFERENCE', implementation_ready: false,
    }] }));
    const imported = importExternalScreenEvidence(evidence, root);
    expect(imported.imported).toBe(1);
    expect(imported.status.complete).toBe(1);
    expect(imported.status.materialized).toBe(0);
    expect(imported.status.implementation_ready).toBe(0);
    expect(imported.status.next_task.screen_id).toBe('MH-S002');
    const task = readJson('screen-factory/manifest.json', null, root).tasks[0];
    expect(task.status).toBe('EXTERNAL_COMPLETE');
    expect(task.external_evidence.materialized).toBe(false);
    expect(task.generator_provenance.hermes_generated_pixels).toBe(false);
  });

  it('recovers local implementation artifacts after manifest state loss', async () => {
    const root = temp('screen-factory-reconcile');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(1) }));
    importScreenFactoryManifest(source, root);
    prepareChatGPTBatch(root);
    const receipt = path.join(root, 'receipt.json');
    writeFileSync(receipt, JSON.stringify({ entries: [{
      task_id: 'MH-S001::ios_mobile',
      implementation_packet: {
        screen_id: 'MH-S001', platform: 'ios_mobile', semantic_html: '<main data-ui="screen"><button data-action="go">Go</button></main>',
        css: 'button{min-width:44px;min-height:44px}', interaction_map: [{ element_id: 'go', action_id: 'go', action_type: 'route', target_route: '/next' }], data_bindings: [],
        state_map: [{ state: 'POPULATED' }], feature_coverage: [{ feature: 'A', element_id: 'screen', realization: 'main', evidence: 'TEST-CANONICAL-CONTRACT' }],
        evidence_map: [{ feature: 'A', source: 'TEST-CANONICAL-CONTRACT' }], additional_features: [],
        component_contracts: [{ component_id: 'screen', type: 'main', data_owner: 'screen_read_model' }],
        experience_profile: { information_density: 'LOW', progressive_disclosure: true },
      },
    }] }));
    await ingestChatGPTReceipt(receipt, root);
    expect(screenFactoryStatus(root).complete).toBe(1);
    const manifest = readJson('screen-factory/manifest.json', null, root);
    manifest.tasks[0].status = 'NOT_GENERATED'; manifest.tasks[0].basic_qa = 'NOT_RUN';
    manifest.tasks[0].asset_path = null; manifest.tasks[0].bundle_dir = null; manifest.tasks[0].implementation_ready = false;
    writeFileSync(path.join(root, 'screen-factory', 'manifest.json'), JSON.stringify(manifest));
    const recovered = reconcileLocalScreenArtifacts(root);
    expect(recovered.recovered).toBe(1);
    expect(recovered.status.complete).toBe(1);
    expect(recovered.status.implementation_ready).toBe(1);
  });

  it('preserves completed task evidence when the canonical queue is re-imported', async () => {
    const root = temp('screen-factory-reimport');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(1) }));
    importScreenFactoryManifest(source, root);
    const evidence = path.join(root, 'evidence.json');
    writeFileSync(evidence, JSON.stringify({ verified_count: 1, assets: [{
      task_id: 'MH-S001::ios_mobile', screen_id: 'MH-S001', platform: 'ios_mobile', filename: 'historical.png',
      sha256: 'a'.repeat(64), byte_size: 1234, width: 1024, height: 1536, format: 'PNG', verified: true,
      evidence_source: 'CHATGPT_CONVERSATION_GENERATED_ASSET', generator: 'CHATGPT_IMAGE_GEN', visual_qa: 'ACCEPTED_STYLE_REFERENCE',
    }] }));
    importExternalScreenEvidence(evidence, root);
    expect(screenFactoryStatus(root).complete).toBe(1);
    const reimported = importScreenFactoryManifest(source, root);
    expect(reimported.complete).toBe(1);
    expect(readJson('screen-factory/manifest.json', null, root).tasks[0].status).toBe('EXTERNAL_COMPLETE');
  });

  it('fails closed at the canonical contract gate before invoking a compiler', async () => {
    const root = temp('screen-factory-contract-block');
    const source = path.join(root, 'source.json');
    const bad = tasks(1)[0]; delete bad.purpose; delete bad.evidence_basis;
    writeFileSync(source, JSON.stringify({ tasks: [bad] }));
    importScreenFactoryManifest(source, root);
    controlScreenFactory('play', root);
    let invoked = false;
    const status = await runScreenFactoryTick({ root, compiler: async () => { invoked = true; throw new Error('must not run'); } });
    expect(invoked).toBe(false);
    expect(status.state).toBe('CONTRACT_BLOCKED');
    expect(status.requested_state).toBe('PAUSED');
    expect(status.complete).toBe(0);
    expect(status.next_task.contract_readiness.ready).toBe(false);
  });

  it('resets generated evidence to zero while preserving the canonical queue', async () => {
    const root = temp('screen-factory-reset');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ design_version: 'DH-UI-CANONICAL-2.0', design_policy_version: 'DIAL_HEALTH_SCREEN_FACTORY_UX_REV2', tasks: tasks(1) }));
    importScreenFactoryManifest(source, root);
    const junk = path.join(root, 'screen-factory', 'outputs', 'obsolete.png');
    writeFileSync(junk, 'obsolete');
    const status = resetScreenFactory(source, root);
    expect(status.state).toBe('STOPPED');
    expect(status.complete).toBe(0); expect(status.materialized).toBe(0); expect(status.implementation_ready).toBe(0); expect(status.failed).toBe(0);
    expect(existsSync(junk)).toBe(false);
    const manifest = readJson('screen-factory/manifest.json', null, root);
    expect(manifest.design_version).toBe('DH-UI-CANONICAL-2.0');
    expect(manifest.tasks[0].status).toBe('NOT_GENERATED');
    expect(manifest.batches).toEqual([]); expect(manifest.platform_packages).toEqual([]);
  });

  it('implements pause and stop as persisted controller state', () => {
    const root = temp('screen-factory-controls');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(1) }));
    importScreenFactoryManifest(source, root);
    expect(controlScreenFactory('play', root).requested_state).toBe('RUNNING');
    expect(controlScreenFactory('pause', root).state).toBe('PAUSED');
    expect(controlScreenFactory('resume', root).requested_state).toBe('RUNNING');
    expect(controlScreenFactory('stop', root).requested_state).toBe('STOPPED');
  });
});
