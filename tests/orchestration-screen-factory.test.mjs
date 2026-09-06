import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  assertAuxiliaryPayload, configureOpenRouterAux, refreshOpenRouterCatalog,
  selectOpenRouterAuxModels, OPENROUTER_DATA_CLASS,
} from '../agent-system/orchestration/auxiliary-openrouter.mjs';
import {
  configureOpenRouterScreenGenerator, refreshOpenRouterScreenCatalog,
  selectOpenRouterScreenModels, PREFERRED_SCREEN_MODELS, callOpenRouterScreenCompiler,
} from '../agent-system/orchestration/screen-factory-openrouter-generator.mjs';
import { renderScreenBundle } from '../agent-system/orchestration/screen-factory-renderer.mjs';
import { compileScreenPacket } from '../agent-system/orchestration/screen-factory-model-generator.mjs';
import { compileCompositionToPacket, SCREEN_COMPOSITION_DSL_VERSION } from '../agent-system/orchestration/screen-factory-composition-dsl.mjs';
import { compositionPipelineStatus } from '../agent-system/orchestration/screen-factory-batch-composer.mjs';
import {
  controlScreenFactory, importScreenFactoryManifest, importExternalScreenEvidence, ingestChatGPTReceipt,
  prepareChatGPTBatch, reconcileLocalScreenArtifacts, recoverInterruptedGeneration, resetScreenFactory, runScreenFactoryTick, screenFactoryStatus, validateChatGPTTransport,
} from '../agent-system/orchestration/screen-factory.mjs';
import { readJson } from '../agent-system/orchestration/state-store.mjs';
import { experiencePolicy } from '../agent-system/orchestration/screen-factory-design-policy.mjs';
import { ensureStorageConfig, storagePressure, storageStatus } from '../agent-system/orchestration/screen-factory-storage.mjs';
import { beginGoogleOauth, configureGoogleOauthClient, googleOauthStatus, GOOGLE_DRIVE_REDIRECT_URI } from '../agent-system/orchestration/screen-factory-google-oauth.mjs';

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

describe('OpenRouter Screen Factory generation isolation', () => {
  it('uses a dedicated generation-only secret and the preferred three-model pool', () => {
    const root = temp('openrouter-screen-generation');
    const status = configureOpenRouterScreenGenerator({ apiKey: 'sk-test-openrouter-screen-generation-123456789' }, root);
    expect(status.enabled).toBe(true);
    expect(status.scope).toBe('SCREEN_FACTORY_COMPOSITION_GENERATION_ONLY');
    expect(status.key_file_mode).toBe('600');
    expect(status.key_material_exposed).toBe(false);
    expect(status.preferred_models).toEqual(PREFERRED_SCREEN_MODELS);
  });

  it('treats the free daily allowance as one account-wide quota and does not probe every model after exhaustion', async () => {
    const root = temp('openrouter-account-quota');
    configureOpenRouterScreenGenerator({ apiKey: 'sk-test-openrouter-account-quota-123456789' }, root);
    await refreshOpenRouterScreenCatalog({ root, fetchImpl: async () => ({ ok:true, async json(){ return { data:[
      { id:'z-ai/glm-5.2:free', name:'GLM', context_length:256000, pricing:{prompt:'0',completion:'0'}, supported_parameters:['reasoning','max_tokens','response_format'] },
      { id:'minimax/minimax-m3:free', name:'M3', context_length:1048576, pricing:{prompt:'0',completion:'0'}, supported_parameters:['reasoning','max_tokens','response_format'] },
      { id:'nvidia/nemotron-3-ultra-550b-a55b:free', name:'Ultra', context_length:1000000, pricing:{prompt:'0',completion:'0'}, supported_parameters:['reasoning','max_tokens'] },
    ] }; } }) });
    let calls=0; const reset=Date.now()+60*60*1000;
    const fetchImpl=async()=>{calls++;return {ok:false,status:429,async text(){return JSON.stringify({error:{message:'Rate limit exceeded: free-models-per-day',metadata:{headers:{'X-RateLimit-Reset':String(reset)},limit_source:'openrouter_free_tier_daily'}}});}};};
    await expect(callOpenRouterScreenCompiler({content:'synthetic',root,taskKey:'quota-1',role:'batch_composer',fetchImpl,maxOutputTokens:1200})).rejects.toThrow(/account quota blocked/i);
    await expect(callOpenRouterScreenCompiler({content:'synthetic',root,taskKey:'quota-2',role:'batch_composer',fetchImpl,maxOutputTokens:1200})).rejects.toThrow(/account quota blocked/i);
    expect(calls).toBe(1);
  });

  it('replaces a retired preferred model with the next highest curated suitable free model', async () => {
    const root = temp('openrouter-screen-retirement');
    const fetchImpl = async () => ({ ok: true, async json() { return { data: [
      { id: 'z-ai/glm-5.2:free', name: 'GLM', context_length: 256000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['reasoning','max_tokens','response_format','structured_outputs'] },
      { id: 'minimax/minimax-m3:free', name: 'M3', context_length: 1048576, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['reasoning','max_tokens','response_format'] },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Super', context_length: 262144, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['reasoning','max_tokens','response_format','structured_outputs'] },
      { id: 'openrouter/free', name: 'Random', context_length: 1000000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['reasoning','max_tokens'] },
    ] }; } });
    const catalog = await refreshOpenRouterScreenCatalog({ root, fetchImpl });
    const selection = selectOpenRouterScreenModels(catalog, root);
    expect(selection.active_models).toEqual([
      'z-ai/glm-5.2:free', 'minimax/minimax-m3:free', 'nvidia/nemotron-3-super-120b-a12b:free',
    ]);
    expect(selection.retired_or_unavailable).toContain('nvidia/nemotron-3-ultra-550b-a55b:free');
    expect(selection.replacements[0].replacement).toBe('nvidia/nemotron-3-super-120b-a12b:free');
    expect(JSON.stringify(selection)).not.toContain('openrouter/free');
  });

  it('permits free-provider training only for synthetic Screen Factory contracts and skips malformed JSON without consuming the task', async () => {
    const root = temp('openrouter-screen-malformed-fallback');
    configureOpenRouterScreenGenerator({ apiKey: 'sk-test-openrouter-screen-generation-123456789' }, root);
    const calls = [];
    const models = [
      { id: 'z-ai/glm-5.2:free', name: 'GLM', context_length: 256000, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['reasoning','max_tokens','response_format','structured_outputs'] },
      { id: 'minimax/minimax-m3:free', name: 'M3', context_length: 1048576, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['reasoning','max_tokens','response_format'] },
    ];
    const fetchImpl = async (url, options = {}) => {
      if (String(url).endsWith('/models')) return { ok: true, async json() { return { data: models }; } };
      const body = JSON.parse(options.body); calls.push(body);
      const content = body.model === 'z-ai/glm-5.2:free' ? '{"broken":' : '{"ok":true}';
      return { ok: true, async json() { return { model: body.model, choices: [{ message: { content } }] }; } };
    };
    const result = await callOpenRouterScreenCompiler({ content: 'synthetic contract', root, taskKey: 'test', fetchImpl, maxOutputTokens: 4096 });
    expect(result.model).toBe('minimax/minimax-m3:free');
    expect(calls[0].provider.data_collection).toBe('allow');
    expect(calls[0].reasoning.enabled).toBe(false);
    expect(calls[0].reasoning.exclude).toBe(true);
    expect(calls[0].messages[0].content).toContain('synthetic product contract');
  });
});


describe('compact batch composition pipeline', () => {
  it('uses the locked My Health reference family with zero provider requests', async () => {
    const root=temp('locked-my-health-zero-provider');
    const task={
      task_id:'MH-S001::android_mobile',screen_id:'MH-S001',title:'Home / Today',business_unit:'My Health',platform:'android_mobile',platform_policy:'REQUIRED',
      purpose:'Give the member a calm, personalised starting point showing only what needs attention now and clear routes to care, medicines, cover and records.',
      features:'greeting/context; next appointment summary; one health/cover attention card when relevant; recent result/record teaser; primary shortcuts to Need Care, Need Medicine, Medical Aid and Records; notifications badge',
      interaction:'Open focused module; open next appointment; open recent result; dismiss non-critical teaser; view all for collections',
      next_routes:'/my-health/need-care; /my-health/appointments; /my-health/records; /my-health/medical-aid',required_variants:'LOADING; POPULATED; EMPTY',archetype:'Consumer Home',
      evidence_basis:['TEST-CANONICAL-CONTRACT'],ux_profile:'MY_HEALTH_WARM_PROGRESSIVE_DISCLOSURE',design_version:'DH-UI-CANONICAL-3.0',design_policy_version:'DIAL_HEALTH_SCREEN_FACTORY_UX_REV3',generation_attempts:0,
    };
    let calls=0; const modelCaller=async()=>{calls+=1;throw new Error('provider should not be called')};
    const result=await compileScreenPacket({task,root,modelCaller});
    expect(calls).toBe(0);
    expect(result.runtime).toBe('dial_locked_canonical_composition');
    expect(result.model).toBe('LOCAL_DIAL_DESIGN_SYSTEM');
    expect(result.model_selection.provider_requests).toBe(0);
    expect(result.packet.semantic_html).toContain('dh-home-screen');
  });

  it('generates 27 screen compositions in one model request and compiles implementation locally', async () => {
    const root = temp('compact-batch-27');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(27) }));
    importScreenFactoryManifest(source, root);
    const manifest = readJson('screen-factory/manifest.json', null, root);
    const calls = [];
    const modelCaller = async (args) => {
      calls.push(args);
      const heroVariants = ['summary','split','soft','compact'];
      const listVariants = ['rich','cards','compact'];
      const contracts = manifest.tasks.map((task, index) => ({ screen_id: task.screen_id, archetype: 'focused-task', regions: [
        { type: 'hero', feature_refs: [0], action_refs: [0], prominence: 'primary', variant: heroVariants[index % heroVariants.length] },
        { type: 'list', feature_refs: [1], action_refs: [1], prominence: 'secondary', variant: listVariants[Math.floor(index / heroVariants.length) % listVariants.length] },
      ] }));
      return { runtime: 'test-openrouter', model: 'minimax/minimax-m3:free', selection: { active_models: ['m3'] }, response: JSON.stringify({ dsl_version: SCREEN_COMPOSITION_DSL_VERSION, screens: contracts }), usage: { prompt_tokens: 1000, completion_tokens: 3000, total_tokens: 4000 } };
    };
    const first = await compileScreenPacket({ task: manifest.tasks[0], root, modelCaller });
    const second = await compileScreenPacket({ task: manifest.tasks[1], root, modelCaller });
    expect(calls).toHaveLength(1);
    expect(calls[0].role).toBe('batch_composer');
    expect(first.model_selection.batch_size).toBe(27);
    expect(first.packet.semantic_html).toContain('dh-screen');
    expect(first.packet.css.length).toBeGreaterThan(100);
    expect(first.packet.interaction_map).toHaveLength(3);
    expect(second.model_selection.batch_size).toBe(27);
    expect(compositionPipelineStatus(root).target_batch_size).toBe(27);
  });

  it('normalizes duplicate and overfull action placement without spending another model request', () => {
    const task = tasks(1)[0];
    task.features = 'greeting/context; next appointment summary; primary shortcuts to Need Care, Need Medicine, Medical Aid and Records';
    task.interaction = 'Open focused module; open next appointment; open recent result; dismiss non-critical teaser; view all for collections';
    task.next_routes = '/my-health/need-care; /my-health/appointments; /my-health/records; /my-health/medical-aid';
    task.archetype = 'Consumer Home';
    const result = compileCompositionToPacket(task, { screen_id: task.screen_id, archetype:'consumer-home', regions:[
      {type:'hero',feature_refs:[0],action_refs:[0,5],prominence:'primary',variant:'split'},
      {type:'action_grid',feature_refs:[2],action_refs:[5,6,7,8,9,0],prominence:'primary',variant:'tiles'},
      {type:'highlight',feature_refs:[1],action_refs:[1,5],prominence:'secondary',variant:'featured'},
      {type:'list',feature_refs:[0],action_refs:[2,3,4],prominence:'quiet',variant:'compact'},
    ]});
    const refs = result.composition.regions.flatMap((r)=>r.action_refs);
    const grid = result.composition.regions.find((r)=>r.type==='action_grid');
    expect(grid.action_refs).toHaveLength(4);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs.length).toBeLessThanOrEqual(10);
  });

  it('targets one stubborn invalid composition after a family batch instead of regenerating valid siblings', async () => {
    const root = temp('compact-targeted-invalid');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(2) }));
    importScreenFactoryManifest(source, root);
    const manifest = readJson('screen-factory/manifest.json', null, root);
    const calls = [];
    const valid = (task) => ({ screen_id:task.screen_id, archetype:'focused-task', regions:[
      {type:'hero',feature_refs:[0],action_refs:[0],prominence:'primary',variant:'summary'},
      {type:'list',feature_refs:[1],action_refs:[1],prominence:'secondary',variant:'compact'},
    ]});
    const invalid = (task) => ({ screen_id:task.screen_id, archetype:'focused-task', regions:[
      {type:'unsupported',feature_refs:[0],action_refs:[0],prominence:'primary',variant:'default'},
      {type:'list',feature_refs:[1],action_refs:[1],prominence:'secondary',variant:'compact'},
    ]});
    const modelCaller = async (args) => {
      calls.push(args);
      if(calls.length===1) return {runtime:'test',model:'minimax/minimax-m3:free',selection:{},response:JSON.stringify({screens:[invalid(manifest.tasks[0]),valid(manifest.tasks[1])]})};
      if(calls.length===2) return {runtime:'test',model:'nvidia/nemotron-3-ultra-550b-a55b:free',selection:{},response:JSON.stringify({screens:[invalid(manifest.tasks[0])]})};
      return {runtime:'test',model:'z-ai/glm-5.2:free',selection:{},response:JSON.stringify(valid(manifest.tasks[0]))};
    };
    const first = await compileScreenPacket({task:manifest.tasks[0],root,modelCaller});
    const second = await compileScreenPacket({task:manifest.tasks[1],root,modelCaller});
    expect(calls.map((x)=>x.role)).toEqual(['batch_composer','batch_composer','composition_repair']);
    expect(first.quality_review.repaired).toBe(true);
    expect(second.packet.semantic_html).toContain('dh-screen');
    expect(calls).toHaveLength(3);
  });

  it('repairs only the failed composition instead of regenerating the full implementation', async () => {
    const root = temp('compact-repair');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(1) }));
    importScreenFactoryManifest(source, root);
    const task = readJson('screen-factory/manifest.json', null, root).tasks[0];
    const calls = [];
    const base = { screen_id: task.screen_id, archetype: 'focused-task', regions: [
      { type: 'hero', feature_refs: [0], action_refs: [0], prominence: 'primary', variant: 'calm' },
      { type: 'list', feature_refs: [1], action_refs: [1], prominence: 'secondary', variant: 'compact' },
    ] };
    const modelCaller = async (args) => { calls.push(args); return { runtime:'test-openrouter', model:calls.length===1?'minimax/minimax-m3:free':'z-ai/glm-5.2:free', selection:{}, response: args.role==='batch_composer'?JSON.stringify({dsl_version:SCREEN_COMPOSITION_DSL_VERSION,screens:[base]}):JSON.stringify({...base,regions:[base.regions[0],{...base.regions[1],type:'highlight'}]}) }; };
    await compileScreenPacket({ task, root, modelCaller });
    task.generation_attempts = 2; task.last_error = 'HORIZONTAL_OVERFLOW';
    const repaired = await compileScreenPacket({ task, root, modelCaller });
    expect(calls.map((x)=>x.role)).toEqual(['batch_composer','composition_repair']);
    expect(repaired.quality_review.repaired).toBe(true);
    expect(repaired.packet.semantic_html).toContain('dh-featured');
  });

  it('compiles state, evidence and bindings deterministically from the canonical contract', () => {
    const task = tasks(1)[0];
    const result = compileCompositionToPacket(task, { screen_id: task.screen_id, archetype:'focused-task', regions:[
      {type:'hero',feature_refs:[0],action_refs:[0],prominence:'primary',variant:'calm'},
      {type:'list',feature_refs:[1],action_refs:[1],prominence:'secondary',variant:'compact'},
    ]});
    expect(result.packet.state_map.map((x)=>x.state)).toEqual(['LOADING','POPULATED','EMPTY']);
    expect(result.packet.feature_coverage).toHaveLength(2);
    expect(result.packet.data_bindings).toHaveLength(2);
    expect(result.packet.additional_features).toEqual([]);
  });
});

describe('implementation-convertible renderer utility', () => {
  it('produces PNG plus implementation/layout artifacts at high-DPI', async () => {
    const out = temp('screen-render');
    const task = tasks(1)[0];
    const packet = {
      screen_id: task.screen_id, title: task.title, platform: task.platform,
      semantic_html: '<main data-ui="screen"><section class="dh-card"><h1>Today</h1><button data-action="open-care">Find care</button><button hidden data-action="retry-hidden-state">Retry</button></section></main>',
      css: 'main{padding:20px}.dh-card{padding:20px}button{border:0;border-radius:12px}',
      interaction_map: [{ element_id: 'primary-action', action_id: 'open-care', action_type: 'route', target_route: '/care' }, { element_id: 'hidden-retry', action_id: 'retry-hidden-state', action_type: 'retry' }],
      data_bindings: [], state_map: [{ state: 'POPULATED', trigger: 'load', visible_change: 'summary shown' }],
      feature_coverage: [{ feature: 'Need care', element_id: 'primary-action', realization: 'button', evidence: 'TEST-CANONICAL-CONTRACT' }],
      evidence_map: [{ feature: 'Need care', source: 'TEST-CANONICAL-CONTRACT' }], additional_features: [],
      component_contracts: [{ component_id: 'content', type: 'card', data_owner: 'screen_read_model' }],
      experience_profile: { information_density: 'LOW_TO_MODERATE', progressive_disclosure: true },
    };
    const result = await renderScreenBundle({ task, packet, outputRoot: out });
    expect(result.qa.pass).toBe(true);
    expect(result.qa.counts.actionable).toBe(2);
    expect(result.qa.counts.visible_actionable).toBe(1);
    expect(result.qa.counts.tiny_targets).toBe(0);
    expect(existsSync(result.png_path)).toBe(true);
    expect(existsSync(result.html_path)).toBe(true);
    expect(result.viewport.dpr).toBe(3);
  });
});



describe('Rev 3 premium viewport discipline', () => {
  it('fails an excessively long My Health consumer screen instead of accepting full-page sprawl', async () => {
    const out = temp('screen-render-long');
    const task = tasks(1)[0]; task.platform = 'android_mobile'; task.task_id = 'MH-S001::android_mobile'; task.design_policy_version = 'DIAL_HEALTH_SCREEN_FACTORY_UX_REV3'; task.design_version = 'DH-UI-CANONICAL-3.0';
    const packet = {
      screen_id: task.screen_id, title: task.title, platform: task.platform,
      semantic_html: '<main class="dh-screen" data-ui="screen" style="min-height:1900px;padding:20px"><section data-ui="primary-card"><h1>Today</h1><button data-action="open-care">Find care</button></section></main>',
      css: '.dh-card{border-radius:18px}',
      interaction_map: [{ element_id: 'open-care', action_id: 'open-care', action_type: 'route', target_route: '/care' }],
      data_bindings: [], state_map: [{ state: 'POPULATED', trigger: 'load', visible_change: 'summary shown' }],
      feature_coverage: [{ feature: 'Need care', element_id: 'open-care', realization: 'button', evidence: 'TEST-CANONICAL-CONTRACT' }],
      evidence_map: [{ feature: 'Need care', source: 'TEST-CANONICAL-CONTRACT' }], additional_features: [],
      component_contracts: [{ component_id: 'primary-card', type: 'card', data_owner: 'screen_read_model' }],
      experience_profile: { information_density: 'LOW_TO_MODERATE', progressive_disclosure: true },
    };
    const result = await renderScreenBundle({ task, packet, outputRoot: out });
    expect(result.qa.pass).toBe(false);
    expect(result.qa.failures).toContain('MY_HEALTH_EXCESSIVE_SCROLL_DEPTH');
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
    expect(status.generator_authority).toBe('OPENROUTER_COMPACT_BATCH_COMPOSITION_POOL');
    expect(status.complete).toBe(0);
    expect(request.generator_authority).toBe('OPENROUTER_COMPACT_BATCH_COMPOSITION_POOL');
    expect(request.ping_type).toBe('FUNCTION_ONLY_SCREEN_GENERATION_PING');
    expect(request.calibration_profile.design_system).toBe('DIAL_HEALTH_UI_CANONICAL_3_0');
    expect(request.calibration_profile.design_policy).toBe('DIAL_HEALTH_SCREEN_FACTORY_UX_REV3');
    expect(request.calibration_profile.premium_visual_standard).toBe('DIAL_HEALTH_PREMIUM_SCREEN_QUALITY_REV3');
    expect(request.tasks).toHaveLength(11);
    expect(request.instruction).toContain('functional requirements');
    expect(request.functional_message).toContain('Required functions: A; B');
    expect(request.functional_message).toContain('Required user actions: Open; Continue');
    expect(request.functional_message).toContain('Hermes supplies FUNCTIONAL REQUIREMENTS ONLY');
    expect(request.design_boundary.hermes_is_design_authority).toBe(false);
    expect(request.tasks[0].required_functions).toEqual(['A','B']);
    expect(request.tasks[0].required_user_actions).toEqual(['Open','Continue']);
    expect(request.tasks[0].routes_and_handoffs).toEqual(['/next']);
    expect(request.tasks[0]).not.toHaveProperty('ux_profile');
    expect(request.tasks[0]).not.toHaveProperty('archetype');
    expect(request).not.toHaveProperty('design_version');
    expect(request).not.toHaveProperty('design_policy_version');
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
    writeFileSync(source, JSON.stringify({ tasks: tasks(41) }));
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
    expect(status.complete).toBe(40); expect(status.implementation_ready).toBe(40);
    const batch = status.batches.find((item) => item.number === 1);
    expect(batch.state).toBe('COMPLETE'); expect(batch.downloadable).toBe(false); expect(batch.zip_path).toBe(null);
    let platform = status.platform_packages.find((item) => item.platform === 'ios_mobile');
    expect(platform.state).toBe('IN_PROGRESS'); expect(platform.downloadable).toBe(false);
    const second = prepareChatGPTBatch(root); expect(second.tasks).toHaveLength(1); expect(second.tasks[0].screen_id).toBe('MH-S041');
    const lastImage = path.join(root, 'MH-S041.png'); await makeImage(lastImage);
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
    expect(status.requested_state).toBe('RUNNING');
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


  it('keeps the autonomous run latched at a contract gate and rechecks without requiring Resume', async () => {
    const root = temp('screen-factory-contract-autonomy');
    const source = path.join(root, 'source.json');
    const blocked = tasks(1); blocked[0].purpose = '';
    writeFileSync(source, JSON.stringify({ tasks: blocked }));
    importScreenFactoryManifest(source, root);
    controlScreenFactory('play', root);
    const status = await runScreenFactoryTick({ root, compiler: async () => { throw new Error('compiler must not run'); } });
    expect(status.state).toBe('CONTRACT_BLOCKED');
    expect(status.requested_state).toBe('RUNNING');
    expect(status.execution_policy.autonomous_run_latched).toBe(true);
    expect(status.execution_policy.batch_boundary_stops).toBe(false);
    expect(status.execution_policy.platform_boundary_stops).toBe(false);
    expect(status.execution_policy.contract_blocked_auto_recheck_ms).toBeGreaterThanOrEqual(1000);
  });

  it('keeps the autonomous run latched across transient runtime blockage for automatic retry', async () => {
    const root = temp('screen-factory-runtime-autonomy');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(1) }));
    importScreenFactoryManifest(source, root);
    controlScreenFactory('play', root);
    const status = await runScreenFactoryTick({ root, compiler: async () => { throw new Error('OpenRouter Screen Factory generation unavailable across curated free pool: HTTP 429'); } });
    expect(status.state).toBe('RUNTIME_BLOCKED');
    expect(status.requested_state).toBe('RUNNING');
    expect(status.execution_policy.autonomous_run_latched).toBe(true);
    expect(status.execution_policy.runtime_blocked_auto_retry_ms).toBeGreaterThanOrEqual(1000);
    expect(readJson('screen-factory/manifest.json', null, root).tasks[0].generation_attempts).toBe(0);
  });

  it('recovers an interrupted atomic screen so a later Play can retry instead of deadlocking', () => {
    const root = temp('screen-factory-interrupted');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(1) }));
    importScreenFactoryManifest(source, root);
    const manifest = readJson('screen-factory/manifest.json', null, root);
    manifest.tasks[0].status = 'GENERATING'; manifest.tasks[0].generation_attempts = 1; manifest.tasks[0].lease = { pid: 999999, lease_id: 'stale' };
    writeFileSync(path.join(root, 'screen-factory', 'manifest.json'), JSON.stringify(manifest));
    expect(recoverInterruptedGeneration(root)).toBe(1);
    const recovered = readJson('screen-factory/manifest.json', null, root).tasks[0];
    expect(recovered.status).toBe('NOT_GENERATED');
    expect(recovered.generation_attempts).toBe(0);
    expect(recovered.lease).toBe(null);
  });

  it('treats OpenRouter generation transport failure as runtime blockage without consuming retries', async () => {
    const root = temp('screen-factory-cli-enoent');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(1) }));
    importScreenFactoryManifest(source, root);
    controlScreenFactory('play', root);
    const status = await runScreenFactoryTick({ root, compiler: async () => { throw new Error('OpenRouter Screen Factory generation unavailable across curated free pool: HTTP 503'); } });
    expect(status.state).toBe('RUNTIME_BLOCKED');
    expect(status.requested_state).toBe('RUNNING');
    const task = readJson('screen-factory/manifest.json', null, root).tasks[0];
    expect(task.status).toBe('NOT_GENERATED');
    expect(task.generation_attempts).toBe(0);
    expect(task.last_error).toBe(null);
  });

  it('never skips an exhausted earlier required screen to process a later screen', async () => {
    const root = temp('screen-factory-sequential-fail-closed');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(2) }));
    importScreenFactoryManifest(source, root);
    const manifest = readJson('screen-factory/manifest.json', null, root);
    manifest.tasks[0].status = 'FAILED'; manifest.tasks[0].generation_attempts = 3; manifest.tasks[0].last_error = 'persistent render defect';
    writeFileSync(path.join(root, 'screen-factory', 'manifest.json'), JSON.stringify(manifest));
    controlScreenFactory('play', root);
    let invoked = false;
    const status = await runScreenFactoryTick({ root, compiler: async () => { invoked = true; throw new Error('must not process later task'); } });
    expect(invoked).toBe(false);
    expect(status.state).toBe('FAILED');
    expect(status.next_task.task_id).toBe('MH-S001::ios_mobile');
    expect(readJson('screen-factory/manifest.json', null, root).tasks[1].status).toBe('NOT_GENERATED');
  });


  it('requires export on the contracted focused detail screen, not on a home/list teaser', () => {
    const home = { ...tasks(1)[0], title: 'Home / Today', archetype: 'Consumer Home', features: 'recent result/record teaser', interaction: 'open recent result; view all' };
    const detail = { ...tasks(1)[0], title: 'Claim Detail', archetype: 'Transaction Detail', features: 'claim record', interaction: 'download claim; share claim' };
    expect(experiencePolicy(home).record_detail_required).toBe(true);
    expect(experiencePolicy(home).export_action_required_on_this_screen).toBe(false);
    expect(experiencePolicy(detail).export_action_required_on_this_screen).toBe(true);
  });

});

describe('Screen Factory bounded storage plane', () => {
  it('uses a 2 GB local cache target with an 8 GB Oracle disk reserve by default', () => {
    const root = temp('screen-factory-storage-defaults');
    const cfg = ensureStorageConfig(root);
    const status = storageStatus(root);
    expect(cfg.local_limit_bytes).toBe(2 * 1024 ** 3);
    expect(cfg.disk_reserve_bytes).toBe(8 * 1024 ** 3);
    expect(status.policy).toBe('R2_PRIMARY_DRIVE_ARCHIVE_LOCAL_BOUNDED_CACHE_V1');
  });

  it('enters STORAGE_BLOCKED before generation when the local cache limit is crossed', async () => {
    const root = temp('screen-factory-storage-block');
    const source = path.join(root, 'source.json');
    writeFileSync(source, JSON.stringify({ tasks: tasks(1) }));
    importScreenFactoryManifest(source, root);
    const cfgPath = path.join(root, 'screen-factory', 'storage-config.json');
    writeFileSync(cfgPath, JSON.stringify({ local_limit_bytes: 1, disk_reserve_bytes: 1 }));
    const out = path.join(root, 'screen-factory', 'outputs');
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, 'pressure.bin'), '0123456789');
    controlScreenFactory('play', root);
    let invoked = false;
    const status = await runScreenFactoryTick({ root, compiler: async () => { invoked = true; throw new Error('must not run'); } });
    expect(invoked).toBe(false);
    expect(status.state).toBe('STORAGE_BLOCKED');
    expect(status.requested_state).toBe('RUNNING');
    expect(readJson('screen-factory/manifest.json', null, root).tasks[0].generation_attempts).toBe(0);
  });
});

describe('Screen Factory Google Drive OAuth bootstrap', () => {
  it('fails closed until a dedicated Google OAuth client is configured', () => {
    const root = temp('google-oauth-unconfigured');
    ensureStorageConfig(root);
    const status = googleOauthStatus(root);
    expect(status.state).toBe('SETUP_REQUIRED');
    expect(status.authenticated).toBe(false);
    expect(() => beginGoogleOauth({ root })).toThrow(/SETUP_REQUIRED/);
  });

  it('creates a PKCE offline authorization request pinned to the canonical callback', () => {
    const root = temp('google-oauth-configured');
    ensureStorageConfig(root);
    configureGoogleOauthClient({ clientId: '1234567890-test.apps.googleusercontent.com', clientSecret: 'example-client-secret-123', root });
    const started = beginGoogleOauth({ root, forceConsent: true });
    const url = new URL(started.authorization_url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe(GOOGLE_DRIVE_REDIRECT_URI);
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/drive');
    expect(url.searchParams.get('prompt')).toContain('consent');
  });
});
