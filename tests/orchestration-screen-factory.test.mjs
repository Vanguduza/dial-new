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
  runScreenFactoryTick, screenFactoryStatus, validateChatGPTTransport,
} from '../agent-system/orchestration/screen-factory.mjs';
import { readJson } from '../agent-system/orchestration/state-store.mjs';

function temp(name) { return mkdtempSync(path.join(tmpdir(), `${name}-`)); }
function tasks(count = 11) {
  return Array.from({ length: count }, (_, i) => ({
    task_id: `MH-S${String(i + 1).padStart(3, '0')}::ios_mobile`,
    screen_id: `MH-S${String(i + 1).padStart(3, '0')}`,
    title: `Screen ${i + 1}`, business_unit: 'My Health', platform: 'ios_mobile',
    platform_policy: 'REQUIRED', purpose: 'Test purpose', features: 'A; B', interaction: 'Open; Continue',
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
      feature_coverage: [{ feature: 'Need care', element_id: 'primary-action', realization: 'button' }],
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
  it('Hermes prepares groups and waits for ChatGPT instead of generating pixels', async () => {
    const root = temp('screen-factory-wait');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(11) }));
    importScreenFactoryManifest(source, root);
    controlScreenFactory('play', root);
    const status = await runScreenFactoryTick({ root });
    expect(status.state).toBe('WAITING_FOR_CHATGPT');
    expect(status.generator_authority).toBe('CHATGPT');
    expect(status.hermes_role).toBe('CONTROL_HEARTBEAT_QUEUE_QA_PACKAGING_ONLY');
    expect(status.active_batch_id).toContain('B001');
    expect(status.complete).toBe(0);
    const request = readJson('screen-factory/requests/current.json', null, root);
    expect(request.generator_authority).toBe('CHATGPT');
    expect(request.tasks).toHaveLength(10);
    expect(request.instruction).toContain('one separate standalone');
    expect(readJson('screen-factory/manifest.json', null, root).tasks[0].bundle_dir).toBe(null);
  });

  it('zips every ten and immediately prepares the next ChatGPT group without stopping', async () => {
    const root = temp('screen-factory-control');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(11) }));
    importScreenFactoryManifest(source, root);
    controlScreenFactory('play', root);
    await runScreenFactoryTick({ root });
    const request = readJson('screen-factory/requests/current.json', null, root);
    const entries = [];
    for (const task of request.tasks) {
      const image = path.join(root, `${task.screen_id}.png`);
      await makeImage(image);
      entries.push({ task_id: task.task_id, image_path: image, implementation_spec: implementationSpec() });
    }
    const receipt = path.join(root, 'receipt-1.json');
    writeFileSync(receipt, JSON.stringify({ entries }));
    await ingestChatGPTReceipt(receipt, root);
    let status = screenFactoryStatus(root);
    expect(status.complete).toBe(10);
    expect(status.implementation_ready).toBe(10);
    const batch = status.batches.find((item) => item.number === 1);
    expect(batch.state).toBe('COMPLETE');
    expect(batch.downloadable).toBe(true);
    expect(existsSync(batch.zip_path)).toBe(true);

    status = await runScreenFactoryTick({ root });
    expect(status.state).toBe('WAITING_FOR_CHATGPT');
    expect(status.next_task.screen_id).toBe('MH-S011');
    const second = readJson('screen-factory/requests/current.json', null, root);
    expect(second.tasks).toHaveLength(1);
    expect(second.tasks[0].screen_id).toBe('MH-S011');
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
