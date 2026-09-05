#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { renderScreenBundle } from './screen-factory-renderer.mjs';
import { compileScreenPacket, SCREEN_GENERATOR_POLICY } from './screen-factory-model-generator.mjs';
import { callOpenRouterAux, OPENROUTER_DATA_CLASS } from './auxiliary-openrouter.mjs';
import { appendJsonl, ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';
import { assertTaskContractReady, contractReadiness, validateDesignPacket, additionalFeaturesMarkdown, implementationHandoffMarkdown, readPacketFromBundle, SCREEN_FACTORY_DESIGN_POLICY, SCREEN_FACTORY_DESIGN_SYSTEM } from './screen-factory-design-policy.mjs';

export const SCREEN_FACTORY_AUTHORITY = 'DIAL_HEALTH_SCREEN_FACTORY_CONTROL_PLANE';
export const SCREEN_FACTORY_GENERATOR_MODE = 'MODEL_RUNTIME_AUTONOMOUS';
export const SCREEN_FACTORY_GENERATOR_AUTHORITY = 'GPT-5.6_SOL_PRIMARY';
export const SCREEN_FACTORY_STATES = Object.freeze([
  'STOPPED', 'RUNNING', 'PAUSING', 'PAUSED', 'GENERATING', 'RENDERING',
  'IMPORTING', 'QA', 'CONTRACT_BLOCKED', 'RUNTIME_BLOCKED', 'FAILED', 'COMPLETE', 'WAITING_FOR_CHATGPT',
]);
const MANIFEST_REL = 'screen-factory/manifest.json';
const CONTROL_REL = 'screen-factory/control.json';
const HEARTBEAT_REL = 'screen-factory/heartbeat.json';
const REQUEST_REL = 'screen-factory/requests/current.json';
const BATCH_SIZE = 10;
const CHATGPT_TRANSPORT_REPOSITORY = 'Vanguduza/dial-new';
const CHATGPT_TRANSPORT_TYPE = 'github_blob';


function now() { return new Date().toISOString(); }
function outputRoot(root) { return resolveControlPath('screen-factory/outputs', root); }
function packageRoot(root) { return resolveControlPath('screen-factory/packages', root); }
function platformPackRoot(root) { return resolveControlPath('screen-factory/platform-packs', root); }
function requestRoot(root) { return resolveControlPath('screen-factory/requests', root); }
function safeName(value) { return String(value).replace(/[^a-zA-Z0-9_.-]/g, '_'); }
function defaultControl() {
  return {
    schema_version: 2, authority: SCREEN_FACTORY_AUTHORITY,
    generator_mode: SCREEN_FACTORY_GENERATOR_MODE,
    generator_authority: SCREEN_FACTORY_GENERATOR_AUTHORITY,
    hermes_role: 'CONTROL_HEARTBEAT_QUEUE_QA_PACKAGING_ONLY',
    state: 'STOPPED', requested_state: 'STOPPED', active_task_id: null,
    active_batch_id: null, last_error: null, updated_at: now(),
  };
}

export function ensureScreenFactory(root) {
  ensureControlLayout(root);
  fs.mkdirSync(outputRoot(root), { recursive: true, mode: 0o700 });
  fs.mkdirSync(packageRoot(root), { recursive: true, mode: 0o700 });
  fs.mkdirSync(platformPackRoot(root), { recursive: true, mode: 0o700 });
  fs.mkdirSync(requestRoot(root), { recursive: true, mode: 0o700 });
  const current = readJson(CONTROL_REL, null, root);
  if (!current) writeJsonAtomic(CONTROL_REL, defaultControl(), root);
  else if (current.generator_mode !== SCREEN_FACTORY_GENERATOR_MODE || current.generator_authority !== SCREEN_FACTORY_GENERATOR_AUTHORITY) {
    writeJsonAtomic(CONTROL_REL, { ...current, ...defaultControl(), state: 'STOPPED', requested_state: 'STOPPED' }, root);
  }
  if (!readJson(MANIFEST_REL, null, root)) {
    writeJsonAtomic(MANIFEST_REL, { schema_version: 4, source: null, design_version: SCREEN_FACTORY_DESIGN_SYSTEM, design_policy_version: SCREEN_FACTORY_DESIGN_POLICY, tasks: [], batches: [], platform_packages: [], updated_at: now() }, root);
  }
  return screenFactoryStatus(root);
}

function requiredTask(task) { return String(task?.platform_policy || 'REQUIRED') === 'REQUIRED'; }
function assetExists(task) { return Boolean(task?.asset_path && fs.existsSync(task.asset_path)); }
function localCompletedTask(task) {
  return task?.status === 'COMPLETE' && task?.basic_qa === 'PASS'
    && Boolean(task?.bundle_dir && fs.existsSync(task.bundle_dir)) && assetExists(task);
}
function externalCompletedTask(task) {
  return task?.status === 'EXTERNAL_COMPLETE' && task?.basic_qa === 'PASS'
    && task?.external_evidence?.verified === true;
}
function completedTask(task) { return localCompletedTask(task) || externalCompletedTask(task); }

const BUSINESS_UNIT_ORDER = [
  'My Health', 'Practice OS', 'Pharmacy OS', 'Diagnostics', 'Hospital/Clinic Enterprise',
  'Medical Aid/Funder', 'Healthcare Transaction Network', 'Pharma Cloud', 'Supply Chain',
  'Customer Service', 'Emergency', 'Logistics', 'Communications', 'Developer Platform',
  'Shared ERP', 'Shared ERP & Data', 'Platform Operations', 'Security/Privacy', 'Clinical Safety',
  'Risk/Fraud', 'Analytics & Intelligence', 'Migration/Onboarding', 'Offline/Reconciliation',
  'AI / Knowledge', 'Interoperability', 'Trust/Identity', 'Document Vault', 'Finance/Payments',
  'Shared Shell', 'Platform Administration', 'Network Extensions',
];
const PLATFORM_ORDER = [
  'android_mobile', 'ios_mobile', 'responsive_web', 'desktop_web', 'tablet',
  'pos_terminal', 'wallboard', 'mobile_approval', 'cross_platform',
];
function orderIndex(list, value) { const i = list.indexOf(value); return i < 0 ? list.length : i; }
function taskOrder(a, b) {
  const bu = orderIndex(BUSINESS_UNIT_ORDER, a.business_unit) - orderIndex(BUSINESS_UNIT_ORDER, b.business_unit);
  if (bu) return bu;
  const platform = orderIndex(PLATFORM_ORDER, a.platform) - orderIndex(PLATFORM_ORDER, b.platform);
  if (platform) return platform;
  return String(a.screen_id || '').localeCompare(String(b.screen_id || ''), undefined, { numeric: true });
}

export function importScreenFactoryManifest(sourcePath, root) {
  ensureScreenFactory(root);
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  if (!Array.isArray(source?.tasks)) throw new Error('screen factory import requires JSON with tasks[]');
  const previous = readJson(MANIFEST_REL, { tasks: [], batches: [] }, root);
  const previousById = new Map((previous.tasks || []).map((task) => [String(task.task_id), task]));
  const seen = new Set();
  const tasks = source.tasks.map((input, index) => {
    const taskId = String(input.task_id || `${input.screen_id}::${input.platform}`);
    if (!input.screen_id || !input.platform || seen.has(taskId)) throw new Error(`invalid/duplicate task at index ${index}: ${taskId}`);
    seen.add(taskId);
    const externalComplete = input.status === 'EXTERNAL_COMPLETE' && input.basic_qa === 'PASS' && input.external_evidence?.verified === true;
    const conditional = String(input.platform_policy || 'REQUIRED') !== 'REQUIRED';
    const task = {
      ...input, task_id: taskId, platform_policy: input.platform_policy || 'REQUIRED',
      status: externalComplete ? 'EXTERNAL_COMPLETE' : (conditional ? 'CONDITIONAL_NOT_QUEUED' : 'NOT_GENERATED'),
      generation_attempts: Number(input.generation_attempts || 0),
      basic_qa: externalComplete ? 'PASS' : 'NOT_RUN',
      visual_qa: externalComplete ? (input.visual_qa || 'NOT_RUN') : 'NOT_RUN',
      implementation_ready: externalComplete ? Boolean(input.implementation_ready) : false,
      approved: false, asset_path: null, bundle_dir: null, generator_provenance: null,
      external_evidence: externalComplete ? input.external_evidence : null,
      lease: null, updated_at: now(),
    };
    const prior = previousById.get(taskId);
    if (prior && String(prior.screen_id) === String(input.screen_id) && String(prior.platform) === String(input.platform) && completedTask(prior)) {
      Object.assign(task, {
        status: prior.status, generation_attempts: Number(prior.generation_attempts || 0), basic_qa: prior.basic_qa,
        visual_qa: prior.visual_qa || 'NOT_RUN', implementation_ready: prior.implementation_ready === true,
        approved: false, asset_path: prior.asset_path || null, bundle_dir: prior.bundle_dir || null,
        generator_provenance: prior.generator_provenance || null, external_evidence: prior.external_evidence || null,
        last_error: null, lease: null,
      });
    }
    return task;
  }).sort(taskOrder);
  const manifest = {
    schema_version: 4, source: path.resolve(sourcePath), registry_source: source.registry_source || source.source || null,
    design_version: source.design_version || SCREEN_FACTORY_DESIGN_SYSTEM, design_policy_version: source.design_policy_version || SCREEN_FACTORY_DESIGN_POLICY,
    tasks, batches: previous.batches || [], platform_packages: previous.platform_packages || [], updated_at: now(),
  };
  writeJsonAtomic(MANIFEST_REL, manifest, root);
  const recovered = reconcileLocalScreenArtifacts(root);
  writeJsonAtomic(REQUEST_REL, null, root);
  setControl(root, { state: 'STOPPED', requested_state: 'STOPPED', active_task_id: null, active_batch_id: null, last_error: null });
  appendJsonl('events/screen-factory.jsonl', {
    event: 'SCREEN_FACTORY_MANIFEST_IMPORTED', tasks: tasks.length, source: manifest.source,
    preserved_complete: tasks.filter(completedTask).length, recovered_local: recovered.recovered, at: now(),
  }, root);
  return screenFactoryStatus(root);
}


export function resetScreenFactory(sourcePath, root) {
  ensureControlLayout(root);
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  if (!Array.isArray(source?.tasks)) throw new Error('screen factory reset requires JSON with tasks[]');
  for (const rel of ['screen-factory/outputs','screen-factory/packages','screen-factory/platform-packs','screen-factory/model-workspace','screen-factory/incoming','screen-factory/evidence']) {
    const target = resolveControlPath(rel, root); fs.rmSync(target, { recursive: true, force: true }); fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  }
  fs.mkdirSync(requestRoot(root), { recursive: true, mode: 0o700 });
  const seen = new Set();
  const tasks = source.tasks.map((input, index) => {
    const taskId = String(input.task_id || `${input.screen_id}::${input.platform}`);
    if (!input.screen_id || !input.platform || seen.has(taskId)) throw new Error(`invalid/duplicate reset task at index ${index}: ${taskId}`);
    seen.add(taskId); const conditional = String(input.platform_policy || 'REQUIRED') !== 'REQUIRED';
    const clean = { ...input };
    for (const key of ['status','basic_qa','visual_qa','external_evidence','asset_path','bundle_dir','generator_provenance','auxiliary_review','lease','last_error','approved','implementation_ready','generation_attempts']) delete clean[key];
    return { ...clean, task_id: taskId, platform_policy: input.platform_policy || 'REQUIRED',
      design_version: source.design_version || SCREEN_FACTORY_DESIGN_SYSTEM,
      design_policy_version: source.design_policy_version || SCREEN_FACTORY_DESIGN_POLICY,
      status: conditional ? 'CONDITIONAL_NOT_QUEUED' : 'NOT_GENERATED', generation_attempts: 0,
      basic_qa: 'NOT_RUN', visual_qa: 'NOT_RUN', implementation_ready: false, approved: false,
      asset_path: null, bundle_dir: null, external_evidence: null, generator_provenance: null,
      auxiliary_review: null, lease: null, last_error: null, updated_at: now() };
  }).sort(taskOrder);
  const manifest = { schema_version: 4, source: path.resolve(sourcePath), registry_source: source.registry_source || source.source || null,
    design_version: source.design_version || SCREEN_FACTORY_DESIGN_SYSTEM, design_policy_version: source.design_policy_version || SCREEN_FACTORY_DESIGN_POLICY,
    tasks, batches: [], platform_packages: [], reset_at: now(), updated_at: now() };
  writeJsonAtomic(MANIFEST_REL, manifest, root); writeJsonAtomic(REQUEST_REL, null, root);
  writeJsonAtomic(CONTROL_REL, { ...defaultControl(), schema_version: 4, state: 'STOPPED', requested_state: 'STOPPED', last_error: null, updated_at: now() }, root);
  appendJsonl('events/screen-factory.jsonl', { event: 'SCREEN_FACTORY_DESIGN_EVIDENCE_RESET', source: manifest.source,
    tasks: tasks.length, design_version: manifest.design_version, design_policy_version: manifest.design_policy_version, generated_artifacts_deleted: true, at: now() }, root);
  return screenFactoryStatus(root);
}

export function reconcileLocalScreenArtifacts(root) {
  ensureControlLayout(root);
  const manifest = readJson(MANIFEST_REL, { tasks: [], batches: [] }, root);
  let recovered = 0;
  for (const task of manifest.tasks || []) {
    const bundleName = safeName(`${task.screen_id}__${task.platform}`);
    const bundle = path.join(outputRoot(root), bundleName);
    if (!fs.existsSync(bundle)) continue;
    const qaPath = path.join(bundle, `${bundleName}.qa.json`);
    const htmlPath = path.join(bundle, `${bundleName}.html`);
    const contractPath = path.join(bundle, `${bundleName}.contract.json`);
    const layoutPath = path.join(bundle, `${bundleName}.layout.json`);
    const interactionsPath = path.join(bundle, `${bundleName}.interactions.json`);
    if (!fs.existsSync(qaPath)) continue;
    let qa;
    try { qa = JSON.parse(fs.readFileSync(qaPath, 'utf8')); } catch { continue; }
    if (qa?.pass !== true || String(qa.screen_id) !== String(task.screen_id) || String(qa.platform) !== String(task.platform)) continue;
    const image = ['png','jpg','jpeg','webp'].map((ext) => path.join(bundle, `${bundleName}.${ext}`)).find((candidate) => fs.existsSync(candidate));
    if (!image) continue;
    const wasComplete = completedTask(task);
    task.status = 'COMPLETE'; task.basic_qa = 'PASS'; task.asset_path = image; task.bundle_dir = bundle;
    task.implementation_ready = [htmlPath, contractPath, layoutPath, interactionsPath].every((candidate) => fs.existsSync(candidate));
    task.approved = false; task.last_error = null; task.lease = null; task.updated_at = now();
    task.generator_provenance = task.generator_provenance || {
      authority: 'CHATGPT', generator: 'CHATGPT_IMPLEMENTATION_ARTIFACT_RECOVERY',
      hermes_generated_pixels: false, openrouter_generated_pixels: false,
      deterministic_renderer: 'PLAYWRIGHT_CHROMIUM', recovered_from_persistent_artifact: true,
    };
    if (!wasComplete) recovered += 1;
  }
  writeJsonAtomic(MANIFEST_REL, { ...manifest, updated_at: now() }, root);
  const control = readJson(CONTROL_REL, defaultControl(), root);
  const expectedBatch = nextBatch(manifest);
  const request = currentRequest(root);
  const staleBatch = Boolean(control.active_batch_id && control.active_batch_id !== expectedBatch?.batch_id);
  const staleRequest = Boolean(request?.batch_id && request.batch_id !== expectedBatch?.batch_id);
  if (staleRequest) writeJsonAtomic(REQUEST_REL, null, root);
  if (staleBatch) {
    const desired = control.requested_state === 'RUNNING' ? 'RUNNING' : (control.requested_state === 'PAUSED' ? 'PAUSED' : 'STOPPED');
    setControl(root, { state: desired, active_task_id: null, active_batch_id: null, last_error: null });
  }
  if (recovered || staleBatch || staleRequest) appendJsonl('events/screen-factory.jsonl', {
    event: 'SCREEN_FACTORY_LOCAL_ARTIFACTS_RECONCILED', recovered, stale_batch_cleared: staleBatch,
    stale_request_cleared: staleRequest, next_batch_id: expectedBatch?.batch_id || null, at: now(),
  }, root);
  return { recovered, stale_batch_cleared: staleBatch, stale_request_cleared: staleRequest, status: screenFactoryStatus(root) };
}

export function importExternalScreenEvidence(evidencePath, root) {
  ensureScreenFactory(root);
  const evidenceBytes = fs.readFileSync(evidencePath);
  const evidence = JSON.parse(evidenceBytes.toString('utf8'));
  if (!Array.isArray(evidence?.assets) || evidence.assets.length === 0) throw new Error('external screen evidence requires assets[]');
  if (Number(evidence.verified_count ?? evidence.assets.length) !== evidence.assets.length) throw new Error('external screen evidence verified_count mismatch');
  const manifest = readJson(MANIFEST_REL, { tasks: [], batches: [] }, root);
  const seen = new Set();
  const imported = [];
  for (const asset of evidence.assets) {
    const taskId = String(asset?.task_id || '');
    if (!taskId || seen.has(taskId)) throw new Error(`invalid/duplicate external evidence task: ${taskId || 'missing'}`);
    seen.add(taskId);
    if (asset.verified !== true) throw new Error(`external evidence is not verified: ${taskId}`);
    if (!/^[0-9a-f]{64}$/i.test(String(asset.sha256 || ''))) throw new Error(`external evidence sha256 invalid: ${taskId}`);
    const task = manifest.tasks.find((item) => item.task_id === taskId);
    if (!task) throw new Error(`external evidence references unknown task: ${taskId}`);
    if (localCompletedTask(task)) throw new Error(`refusing to replace locally materialized screen with external evidence: ${taskId}`);
    if (String(task.screen_id) !== String(asset.screen_id) || String(task.platform) !== String(asset.platform)) {
      throw new Error(`external evidence identity mismatch: ${taskId}`);
    }
    task.status = 'EXTERNAL_COMPLETE'; task.basic_qa = 'PASS';
    task.visual_qa = asset.visual_qa || 'NOT_RUN'; task.implementation_ready = false; task.approved = false;
    task.asset_path = null; task.bundle_dir = null; task.last_error = null; task.lease = null; task.updated_at = now();
    task.external_evidence = {
      verified: true, materialized: false, evidence_source: asset.evidence_source || 'EXTERNAL_VERIFIED_EVIDENCE',
      filename: asset.filename || null, source_relpath: asset.source_relpath || null, sha256: String(asset.sha256).toLowerCase(),
      byte_size: Number(asset.byte_size || 0), width: Number(asset.width || 0), height: Number(asset.height || 0),
      format: asset.format || null, generator: asset.generator || null, imported_at: now(),
    };
    task.generator_provenance = {
      authority: 'CHATGPT', generator: asset.generator || 'CHATGPT_IMAGE_GEN', evidence_only: true,
      hermes_generated_pixels: false, openrouter_generated_pixels: false,
    };
    imported.push(taskId);
  }
  writeJsonAtomic(MANIFEST_REL, { ...manifest, updated_at: now() }, root);
  const evidenceSha256 = crypto.createHash('sha256').update(evidenceBytes).digest('hex');
  appendJsonl('events/screen-factory.jsonl', {
    event: 'SCREEN_FACTORY_EXTERNAL_EVIDENCE_IMPORTED', count: imported.length, tasks: imported, evidence_sha256: evidenceSha256, at: now(),
  }, root);
  return { imported: imported.length, evidence_sha256: evidenceSha256, status: screenFactoryStatus(root) };
}


export function importScreenContracts(contractPath, root) {
  ensureScreenFactory(root);
  const sourceBytes = fs.readFileSync(contractPath);
  const source = JSON.parse(sourceBytes.toString('utf8'));
  const contracts = Array.isArray(source?.screens) ? source.screens : (Array.isArray(source?.contracts) ? source.contracts : null);
  if (!contracts?.length) throw new Error('screen contract import requires screens[] or contracts[]');
  const byScreen = new Map();
  for (const contract of contracts) {
    const screenId = String(contract?.screen_id || '');
    if (!screenId || byScreen.has(screenId)) throw new Error(`invalid/duplicate screen contract: ${screenId || 'missing'}`);
    byScreen.set(screenId, contract);
  }
  const manifest = readJson(MANIFEST_REL, { tasks: [], batches: [] }, root);
  let matched = 0;
  for (const task of manifest.tasks) {
    const contract = byScreen.get(String(task.screen_id));
    if (!contract) continue;
    for (const key of ['title','surface','roles','definition_status','purpose','features','interaction','next_routes','required_variants','archetype','ux_profile','detail_policy','export_policy','evidence_basis']) {
      if (contract[key] != null) task[key] = contract[key];
    }
    task.contract_evidence = {
      source: path.resolve(contractPath), source_screen_id: contract.screen_id,
      interaction_contract_status: contract.interaction_contract_status || null,
      ux_green_status: contract.ux_green_status || null,
      imported_at: now(),
    };
    task.updated_at = now(); matched += 1;
  }
  if (!matched) throw new Error('screen contract import matched zero manifest tasks');
  writeJsonAtomic(MANIFEST_REL, { ...manifest, updated_at: now() }, root);
  const sourceSha256 = crypto.createHash('sha256').update(sourceBytes).digest('hex');
  appendJsonl('events/screen-factory.jsonl', {
    event: 'SCREEN_FACTORY_CONTRACTS_IMPORTED', contracts: contracts.length,
    matched_tasks: matched, source_sha256: sourceSha256, at: now(),
  }, root);
  return { contracts: contracts.length, matched_tasks: matched, source_sha256: sourceSha256, status: screenFactoryStatus(root) };
}

function progressBreakdown(tasks, key) {
  const groups = new Map();
  for (const task of tasks.filter(requiredTask)) {
    const name = String(task[key] || 'unknown');
    const entry = groups.get(name) || { total: 0, complete: 0, failed: 0, implementation_ready: 0 };
    entry.total += 1;
    if (completedTask(task)) entry.complete += 1;
    if (task.status === 'FAILED') entry.failed += 1;
    if (task.implementation_ready === true) entry.implementation_ready += 1;
    groups.set(name, entry);
  }
  return Object.fromEntries([...groups.entries()].map(([name, value]) => [name, {
    ...value, percent: value.total ? Number(((value.complete / value.total) * 100).toFixed(2)) : 0,
  }]));
}
function batchForTask(manifest, task) {
  const peers = manifest.tasks.filter((item) => requiredTask(item)
    && item.business_unit === task.business_unit && item.platform === task.platform).sort(taskOrder);
  const index = peers.findIndex((item) => item.task_id === task.task_id);
  if (index < 0) throw new Error(`task not found in platform group: ${task.task_id}`);
  const number = Math.floor(index / BATCH_SIZE) + 1;
  const tasks = peers.slice((number - 1) * BATCH_SIZE, number * BATCH_SIZE);
  return {
    batch_id: `${safeName(task.business_unit)}__${task.platform}__B${String(number).padStart(3, '0')}`,
    business_unit: task.business_unit, platform: task.platform, number,
    task_ids: tasks.map((item) => item.task_id), expected_count: tasks.length,
  };
}
function nextBatch(manifest) {
  const next = manifest.tasks.filter((task) => requiredTask(task) && !completedTask(task))
    .sort(taskOrder)[0] || null;
  if (!next) return null;
  return batchForTask(manifest, next);
}
function taskContract(task) {
  return {
    task_id: task.task_id, screen_id: task.screen_id, title: task.title,
    surface: task.surface || null, business_unit: task.business_unit, platform: task.platform,
    roles: task.roles || null, definition_status: task.definition_status || null,
    purpose: task.purpose || null, features: task.features || null,
    interaction: task.interaction || null, next_routes: task.next_routes || null,
    required_variants: task.required_variants || null, archetype: task.archetype || null,
    ux_profile: task.ux_profile || null, detail_policy: task.detail_policy || null, export_policy: task.export_policy || null,
    evidence_basis: task.evidence_basis || null, contract_readiness: contractReadiness(task),
    design_version: task.design_version || SCREEN_FACTORY_DESIGN_SYSTEM, design_policy_version: SCREEN_FACTORY_DESIGN_POLICY,
  };
}
function currentRequest(root) { return readJson(REQUEST_REL, null, root); }
export function prepareChatGPTBatch(root) {
  ensureScreenFactory(root);
  const manifest = readJson(MANIFEST_REL, { tasks: [], batches: [] }, root);
  const batch = nextBatch(manifest);
  if (!batch) return null;
  const candidates = batch.task_ids.map((id) => manifest.tasks.find((task) => task.task_id === id)).filter(Boolean).filter((task) => !completedTask(task));
  const tasks = [];
  for (const task of candidates) { if (!contractReadiness(task).ready) break; tasks.push(task); if (tasks.length >= BATCH_SIZE) break; }
  if (!tasks.length) { const blocked = candidates[0]; throw new Error(`SCREEN_CONTRACT_NOT_READY ${blocked?.task_id || batch.batch_id}: ${contractReadiness(blocked || {}).reason}`); }
  const request = {
    schema_version: 2, authority: SCREEN_FACTORY_AUTHORITY,
    generator_mode: SCREEN_FACTORY_GENERATOR_MODE, generator_authority: SCREEN_FACTORY_GENERATOR_AUTHORITY,
    design_version: SCREEN_FACTORY_DESIGN_SYSTEM, design_policy_version: SCREEN_FACTORY_DESIGN_POLICY,
    hermes_role: 'CONTROL_HEARTBEAT_QUEUE_QA_PACKAGING_ONLY', openrouter_role: 'OPTIONAL_AUXILIARY_ONLY',
    batch_id: batch.batch_id, business_unit: batch.business_unit, platform: batch.platform,
    expected_count: tasks.length,
    instruction: 'Compile only these incomplete contract-ready tasks, one separate standalone screen per task. Use progressive disclosure on My Health, map every control to real software behaviour, open records/transactions into focused full detail, provide permitted export flows, document all additional features with integration plans, and never infer missing product truth. Batch boundaries are orchestration only; ZIP packaging is per completed business-unit/platform.',
    tasks: tasks.map(taskContract), prepared_at: now(),
  };
  // Queue preparation is control-plane only. Do not mutate manifest task state here:
  // ChatGPT receipt ingestion is the sole writer of generation completion state. This
  // prevents a daemon tick holding a stale manifest from overwriting a concurrent receipt.
  writeJsonAtomic(REQUEST_REL, request, root);
  appendJsonl('events/screen-factory.jsonl', { event: 'SCREEN_FACTORY_GENERATOR_BATCH_PREPARED', batch_id: batch.batch_id, count: tasks.length, at: now() }, root);
  return request;
}

export function screenFactoryStatus(root) {
  ensureControlLayout(root);
  const control = readJson(CONTROL_REL, defaultControl(), root);
  const manifest = readJson(MANIFEST_REL, { tasks: [], batches: [] }, root);
  const required = manifest.tasks.filter(requiredTask);
  const complete = required.filter(completedTask);
  const failed = required.filter((task) => task.status === 'FAILED');
  const implementationReady = required.filter((task) => task.implementation_ready === true && completedTask(task));
  const materialized = required.filter(localCompletedTask);
  const next = required.filter((task) => !completedTask(task)).sort(taskOrder)[0] || null;
  const request = currentRequest(root);
  return {
    schema_version: 4, authority: SCREEN_FACTORY_AUTHORITY,
    generator_mode: SCREEN_FACTORY_GENERATOR_MODE, generator_authority: SCREEN_FACTORY_GENERATOR_AUTHORITY,
    hermes_role: 'CONTROL_HEARTBEAT_QUEUE_QA_PACKAGING_ONLY', openrouter_role: 'OPTIONAL_AUXILIARY_ONLY',
    state: control.state, requested_state: control.requested_state,
    active_task_id: control.active_task_id, active_batch_id: control.active_batch_id,
    last_error: control.last_error, required_total: required.length, complete: complete.length,
    implementation_ready: implementationReady.length, remaining: required.length - complete.length,
    failed: failed.length, materialized: materialized.length, percent: required.length ? Number(((complete.length / required.length) * 100).toFixed(2)) : 0,
    contract_ready: required.filter((task) => contractReadiness(task).ready).length,
    contract_blocked: required.filter((task) => !contractReadiness(task).ready).length,
    design_version: manifest.design_version || SCREEN_FACTORY_DESIGN_SYSTEM, design_policy_version: manifest.design_policy_version || SCREEN_FACTORY_DESIGN_POLICY,
    next_task: next ? { task_id: next.task_id, screen_id: next.screen_id, title: next.title, business_unit: next.business_unit, platform: next.platform, contract_readiness: contractReadiness(next) } : null,
    current_request: request ? { batch_id: request.batch_id, expected_count: request.expected_count, prepared_at: request.prepared_at } : null,
    by_business_unit: progressBreakdown(manifest.tasks, 'business_unit'),
    by_platform: progressBreakdown(manifest.tasks, 'platform'), batches: manifest.batches || [], platform_packages: manifest.platform_packages || [], updated_at: now(),
  };
}

function platformGroupForTask(manifest, task) {
  const tasks = manifest.tasks.filter((item) => requiredTask(item)
    && item.business_unit === task.business_unit && item.platform === task.platform).sort(taskOrder);
  return {
    package_id: `${safeName(task.business_unit)}__${task.platform}`,
    business_unit: task.business_unit, platform: task.platform,
    task_ids: tasks.map((item) => item.task_id), expected_count: tasks.length,
  };
}
function writePlatformPack(group, manifest, root) {
  const tasks = group.task_ids.map((id) => manifest.tasks.find((task) => task.task_id === id)).filter(Boolean);
  if (!tasks.length || !tasks.every(completedTask)) return null;
  const stage = path.join(platformPackRoot(root), group.package_id);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(path.join(stage, 'screens'), { recursive: true, mode: 0o700 });
  const packetByTask = new Map();
  for (const task of tasks) {
    if (!task.bundle_dir || !fs.existsSync(task.bundle_dir)) throw new Error(`platform package missing bundle: ${task.task_id}`);
    const target = path.join(stage, 'screens', safeName(`${task.screen_id}__${task.platform}`));
    fs.cpSync(task.bundle_dir, target, { recursive: true });
    packetByTask.set(task.task_id, readPacketFromBundle(task));
  }
  fs.writeFileSync(path.join(stage, 'IMPLEMENTATION_HANDOFF.md'), implementationHandoffMarkdown({ businessUnit: group.business_unit, platform: group.platform, tasks }));
  fs.writeFileSync(path.join(stage, 'ADDITIONAL_FEATURES_INTEGRATION.md'), additionalFeaturesMarkdown({ businessUnit: group.business_unit, platform: group.platform, tasks, packetByTask }));
  if (group.business_unit === 'My Health') {
    const canonical = path.join(process.env.DIAL_REPO_DIR || '/srv/dial/repo', 'docs/dial/health/MY_HEALTH_ADDITIONAL_FEATURES_INTEGRATION_REV2.md');
    if (fs.existsSync(canonical)) fs.copyFileSync(canonical, path.join(stage, 'MY_HEALTH_ADDITIONAL_FEATURES_INTEGRATION_REV2.md'));
  }
  const target = path.join(packageRoot(root), `${group.package_id}.zip`);
  const py = ['import os,sys,zipfile','root,target=sys.argv[1:3]','tmp=target+".partial"','os.makedirs(os.path.dirname(target),exist_ok=True)','z=zipfile.ZipFile(tmp,"w",zipfile.ZIP_DEFLATED)','[(z.write(os.path.join(dp,f),os.path.relpath(os.path.join(dp,f),root))) for dp,_,fs in os.walk(root) for f in fs]','z.close();os.replace(tmp,target)'].join(';');
  execFileSync('python3', ['-c', py, stage, target], { timeout: 120000 });
  return { stage, zip_path: target };
}
function reconcileBatch(manifest, task) {
  const batch = batchForTask(manifest, task);
  const completeCount = batch.task_ids.filter((id) => completedTask(manifest.tasks.find((item) => item.task_id === id))).length;
  const record = { ...batch, complete_count: completeCount,
    state: completeCount === batch.expected_count ? 'COMPLETE' : 'IN_PROGRESS',
    zip_path: null, downloadable: false, packaging_policy: 'NO_BATCH_ZIPS', updated_at: now() };
  manifest.batches = [...(manifest.batches || []).filter((item) => item.batch_id !== batch.batch_id), record]
    .sort((a, b) => a.batch_id.localeCompare(b.batch_id));
  return record;
}
function reconcilePlatformPackage(manifest, task, root) {
  const group = platformGroupForTask(manifest, task);
  const completeCount = group.task_ids.filter((id) => completedTask(manifest.tasks.find((item) => item.task_id === id))).length;
  const previous = (manifest.platform_packages || []).find((item) => item.package_id === group.package_id);
  let stage = previous?.stage_dir || null, zipPath = previous?.zip_path || null;
  if (completeCount === group.expected_count && (!zipPath || !fs.existsSync(zipPath))) {
    const built = writePlatformPack(group, manifest, root); stage = built?.stage || null; zipPath = built?.zip_path || null;
  }
  const record = { ...group, complete_count: completeCount,
    state: completeCount === group.expected_count ? 'COMPLETE' : 'IN_PROGRESS',
    stage_dir: stage, zip_path: zipPath, downloadable: Boolean(zipPath && fs.existsSync(zipPath)), updated_at: now() };
  manifest.platform_packages = [...(manifest.platform_packages || []).filter((item) => item.package_id !== group.package_id), record]
    .sort((a, b) => a.package_id.localeCompare(b.package_id));
  return record;
}
function setControl(root, patch) {
  const control = { ...readJson(CONTROL_REL, defaultControl(), root), ...patch,
    generator_mode: SCREEN_FACTORY_GENERATOR_MODE, generator_authority: SCREEN_FACTORY_GENERATOR_AUTHORITY,
    hermes_role: 'CONTROL_HEARTBEAT_QUEUE_QA_PACKAGING_ONLY', updated_at: now() };
  writeJsonAtomic(CONTROL_REL, control, root); return control;
}
export function controlScreenFactory(action, root) {
  ensureScreenFactory(root);
  const normalized = String(action || '').toLowerCase();
  const current = readJson(CONTROL_REL, defaultControl(), root);
  if (['play', 'resume'].includes(normalized)) setControl(root, { requested_state: 'RUNNING', state: current.state === 'WAITING_FOR_CHATGPT' ? current.state : 'RUNNING', last_error: null });
  else if (normalized === 'pause') setControl(root, { requested_state: 'PAUSED', state: 'PAUSED' });
  else if (normalized === 'stop') setControl(root, { requested_state: 'STOPPED', state: 'STOPPED', active_task_id: null, active_batch_id: null });
  else throw new Error(`unsupported screen factory control action: ${action}`);
  appendJsonl('events/screen-factory.jsonl', { event: 'SCREEN_FACTORY_CONTROL', action: normalized.toUpperCase(), at: now() }, root);
  return screenFactoryStatus(root);
}
function heartbeat(root, extra = {}) {
  return writeJsonAtomic(HEARTBEAT_REL, { schema_version: 2, service: 'dial-health-screen-factory',
    authority: SCREEN_FACTORY_AUTHORITY, generator_mode: SCREEN_FACTORY_GENERATOR_MODE,
    hermes_role: 'CONTROL_HEARTBEAT_QUEUE_QA_PACKAGING_ONLY', pid: process.pid, observed_at: now(), ...extra }, root);
}

export function validateChatGPTTransport(transport = {}) {
  if (transport.type !== CHATGPT_TRANSPORT_TYPE) throw new Error(`unsupported ChatGPT transport: ${transport.type || 'missing'}`);
  if (transport.repository !== CHATGPT_TRANSPORT_REPOSITORY) throw new Error('ChatGPT transport repository is not allowlisted');
  if (!/^[0-9a-f]{40}$/.test(String(transport.blob_sha || ''))) throw new Error('ChatGPT transport blob_sha must be a 40-character Git SHA');
  if (!/^[0-9a-f]{64}$/.test(String(transport.sha256 || ''))) throw new Error('ChatGPT transport sha256 must be a 64-character SHA-256');
  const filename = safeName(transport.filename || 'screen.png');
  if (!/\.(png|jpe?g|webp)$/i.test(filename)) throw new Error('ChatGPT transport filename must be PNG, JPEG or WEBP');
  return { type: CHATGPT_TRANSPORT_TYPE, repository: CHATGPT_TRANSPORT_REPOSITORY, blob_sha: transport.blob_sha, sha256: transport.sha256, filename };
}
function fetchGitHubBlobTransport(transport) {
  const t = validateChatGPTTransport(transport);
  const content = execFileSync('gh', ['api', `repos/${t.repository}/git/blobs/${t.blob_sha}`, '--jq', '.content'], { encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  const bytes = Buffer.from(String(content).replace(/\s/g, ''), 'base64');
  if (!bytes.length) throw new Error('ChatGPT GitHub blob transport returned empty content');
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== t.sha256) throw new Error(`ChatGPT transport SHA-256 mismatch: expected ${t.sha256}, got ${actual}`);
  return { ...t, bytes };
}
function materializeChatGPTEntry(entry, task, root) {
  if (entry.transport) {
    const fetched = fetchGitHubBlobTransport(entry.transport);
    const incoming = resolveControlPath('screen-factory/incoming', root);
    fs.mkdirSync(incoming, { recursive: true, mode: 0o700 });
    const target = path.join(incoming, `${safeName(task.task_id)}__${fetched.blob_sha.slice(0, 12)}__${fetched.filename}`);
    const partial = `${target}.partial`;
    fs.writeFileSync(partial, fetched.bytes, { mode: 0o600 });
    fs.renameSync(partial, target);
    return { sourceImage: target, cleanup: true, transport: { type: fetched.type, repository: fetched.repository, blob_sha: fetched.blob_sha, sha256: fetched.sha256 } };
  }
  const sourceImage = path.resolve(String(entry.image_path || ''));
  if (!fs.existsSync(sourceImage)) throw new Error(`ChatGPT image not found: ${sourceImage}`);
  return { sourceImage, cleanup: false, transport: { type: 'local_path' } };
}

function validateChatGPTImplementationPacket(packet, task) {
  if (!packet || typeof packet !== 'object') throw new Error(`implementation packet missing: ${task.task_id}`);
  if (String(packet.screen_id || '') !== String(task.screen_id)) throw new Error(`implementation packet screen_id mismatch: ${task.task_id}`);
  if (String(packet.platform || '') !== String(task.platform)) throw new Error(`implementation packet platform mismatch: ${task.task_id}`);
  if (!String(packet.semantic_html || '').trim()) throw new Error(`implementation packet semantic_html missing: ${task.task_id}`);
  validateDesignPacket(packet, task);
  return packet;
}

async function imageQa(task, sourceImage) {
  const meta = await sharp(sourceImage).metadata();
  const width = Number(meta.width || 0), height = Number(meta.height || 0);
  const mobile = ['android_mobile', 'ios_mobile', 'mobile_approval'].includes(task.platform);
  const desktop = ['desktop_web', 'responsive_web', 'wallboard', 'pos_terminal'].includes(task.platform);
  const failures = [];
  if (!['png', 'jpeg', 'webp'].includes(meta.format || '')) failures.push('UNSUPPORTED_IMAGE_FORMAT');
  if (mobile && (width < 900 || height < 1200 || height <= width)) failures.push('MOBILE_RESOLUTION_OR_ORIENTATION');
  if (desktop && (width < 1200 || height < 700)) failures.push('DESKTOP_RESOLUTION');
  if (!mobile && !desktop && (width < 900 || height < 900)) failures.push('INSUFFICIENT_RESOLUTION');
  return { pass: failures.length === 0, failures, metadata: { format: meta.format, width, height, density: meta.density || null } };
}
export async function ingestChatGPTReceipt(receiptPath, root) {
  ensureScreenFactory(root);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  if (!Array.isArray(receipt?.entries) || receipt.entries.length === 0) throw new Error('ChatGPT receipt requires entries[]');
  const manifest = readJson(MANIFEST_REL, { tasks: [], batches: [] }, root);
  setControl(root, { state: 'IMPORTING' });
  const results = [];
  for (const entry of receipt.entries) {
    const task = manifest.tasks.find((item) => item.task_id === entry.task_id);
    if (!task) throw new Error(`unknown screen factory task: ${entry.task_id}`);
    setControl(root, { state: 'QA', active_task_id: task.task_id, active_batch_id: batchForTask(manifest, task).batch_id });

    let qa, bundle, targetImage, implementationReady = false, transport = null;
    if (entry.implementation_packet) {
      const packet = validateChatGPTImplementationPacket(entry.implementation_packet, task);
      const rendered = await renderScreenBundle({ task, packet, outputRoot: outputRoot(root) });
      qa = rendered.qa; bundle = rendered.bundle_dir; targetImage = rendered.png_path;
      implementationReady = true;
      transport = { type: 'chatgpt_implementation_packet', renderer: 'PLAYWRIGHT_CHROMIUM_DETERMINISTIC' };
      fs.writeFileSync(path.join(bundle, `${task.screen_id}__${task.platform}.implementation.json`), `${JSON.stringify({
        schema_version: 1, authority: 'CHATGPT', screen_id: task.screen_id, platform: task.platform,
        layout: { semantic_html: packet.semantic_html, css: packet.css || '' },
        interactions: packet.interaction_map, states: packet.state_map,
        data_bindings: packet.data_bindings, feature_coverage: packet.feature_coverage, evidence_map: packet.evidence_map,
        additional_features: packet.additional_features, component_contracts: packet.component_contracts, experience_profile: packet.experience_profile,
        design_policy_version: SCREEN_FACTORY_DESIGN_POLICY, design_system: SCREEN_FACTORY_DESIGN_SYSTEM,
      }, null, 2)}\n`, { mode: 0o600 });
    } else {
      const received = materializeChatGPTEntry(entry, task, root);
      const sourceImage = received.sourceImage;
      qa = await imageQa(task, sourceImage);
      bundle = path.join(outputRoot(root), safeName(task.task_id));
      fs.mkdirSync(bundle, { recursive: true, mode: 0o700 });
      const ext = qa.metadata.format === 'jpeg' ? 'jpg' : qa.metadata.format;
      targetImage = path.join(bundle, `${task.screen_id}__${task.platform}.${ext}`);
      fs.copyFileSync(sourceImage, targetImage);
      writeJsonAtomic(path.relative(resolveControlPath('.', root), path.join(bundle, `${task.screen_id}__${task.platform}.contract.json`)), taskContract(task), root);
      if (entry.implementation_spec && typeof entry.implementation_spec === 'object') {
        fs.writeFileSync(path.join(bundle, `${task.screen_id}__${task.platform}.implementation.json`), `${JSON.stringify(entry.implementation_spec, null, 2)}\n`, { mode: 0o600 });
        implementationReady = Boolean(entry.implementation_spec.layout && entry.implementation_spec.interactions && entry.implementation_spec.states);
      }
      fs.writeFileSync(path.join(bundle, `${task.screen_id}__${task.platform}.qa.json`), `${JSON.stringify(qa, null, 2)}\n`, { mode: 0o600 });
      transport = received.transport;
      if (received.cleanup) { try { fs.rmSync(sourceImage, { force: true }); } catch {} }
    }

    task.asset_path = targetImage; task.bundle_dir = bundle; task.basic_qa = qa.pass ? 'PASS' : 'FAIL';
    task.visual_qa = entry.visual_qa === 'PASS' ? 'PASS' : 'NOT_RUN'; task.approved = false;
    task.implementation_ready = implementationReady; task.status = qa.pass ? 'COMPLETE' : 'FAILED';
    task.last_error = qa.pass ? null : qa.failures.join(','); task.lease = null; task.updated_at = now();
    task.generator_provenance = {
      authority: 'CHATGPT',
      generator: entry.implementation_packet ? 'CHATGPT_IMPLEMENTATION_PACKET' : 'CHATGPT_BUILTIN_IMAGE_GENERATION',
      orchestration_model: 'GPT-5.6 Sol', hermes_generated_pixels: false,
      openrouter_generated_pixels: false, deterministic_renderer: entry.implementation_packet ? 'PLAYWRIGHT_CHROMIUM' : null,
      transport, received_at: now(),
    };
    reconcileBatch(manifest, task);
    reconcilePlatformPackage(manifest, task, root);
    results.push({ task_id: task.task_id, status: task.status, basic_qa: task.basic_qa, implementation_ready: implementationReady, asset_path: targetImage });
  }
  writeJsonAtomic(MANIFEST_REL, { ...manifest, updated_at: now() }, root);
  const active = readJson(CONTROL_REL, defaultControl(), root);
  const activeBatch = (manifest.batches || []).find((item) => item.batch_id === active.active_batch_id);
  if (active.requested_state === 'RUNNING' && activeBatch?.state === 'COMPLETE') {
    setControl(root, { state: 'RUNNING', active_task_id: null, active_batch_id: null, last_error: null });
  } else if (active.requested_state === 'PAUSED') setControl(root, { state: 'PAUSED', active_task_id: null });
  else if (active.requested_state === 'STOPPED') setControl(root, { state: 'STOPPED', active_task_id: null, active_batch_id: null });
  else setControl(root, { state: 'WAITING_FOR_CHATGPT', active_task_id: null });
  appendJsonl('events/screen-factory.jsonl', { event: 'SCREEN_FACTORY_CHATGPT_RECEIPT_INGESTED', count: results.length, tasks: results.map((r) => r.task_id), at: now() }, root);
  return { results, status: screenFactoryStatus(root) };
}

async function auxiliaryReview(task, packet, root) {
  try {
    return await callOpenRouterAux({
      purpose: 'contract_lint',
      content: JSON.stringify({ purpose: 'Advisory contract completeness check only. Do not redesign.', screen: taskContract(task), packet: { feature_coverage: packet.feature_coverage, interaction_map: packet.interaction_map, data_bindings: packet.data_bindings, state_map: packet.state_map } }),
      dataClassification: OPENROUTER_DATA_CLASS, root, structured: true, maxOutputTokens: 900,
    });
  } catch (error) { return { state: 'AUXILIARY_FAILED_NON_BLOCKING', reason: String(error?.message || error).slice(0,800) }; }
}

function claimNextTask(manifest) {
  const task = manifest.tasks.filter((item) => requiredTask(item) && !completedTask(item)
    && item.status !== 'GENERATING' && !(item.status === 'FAILED' && Number(item.generation_attempts || 0) >= 3)).sort(taskOrder)[0] || null;
  if (!task) return null;
  task.status = 'GENERATING'; task.generation_attempts = Number(task.generation_attempts || 0) + 1;
  task.lease = { lease_id: crypto.randomUUID(), pid: process.pid, claimed_at: now() }; task.updated_at = now();
  return task;
}

export async function runScreenFactoryTick({ root, compiler = compileScreenPacket, renderer = renderScreenBundle, auxiliary = auxiliaryReview } = {}) {
  ensureScreenFactory(root);
  const control = readJson(CONTROL_REL, defaultControl(), root);
  if (control.requested_state === 'STOPPED') { setControl(root,{state:'STOPPED',active_task_id:null,active_batch_id:null}); heartbeat(root,{state:'STOPPED'}); return screenFactoryStatus(root); }
  if (control.requested_state === 'PAUSED') { setControl(root,{state:'PAUSED',active_task_id:null}); heartbeat(root,{state:'PAUSED'}); return screenFactoryStatus(root); }
  const manifest = readJson(MANIFEST_REL,{tasks:[],batches:[]},root);
  const firstIncomplete = manifest.tasks.filter((item) => requiredTask(item) && !completedTask(item)).sort(taskOrder)[0] || null;
  if (firstIncomplete && !contractReadiness(firstIncomplete).ready) {
    const reason = `SCREEN_CONTRACT_NOT_READY ${firstIncomplete.task_id}: ${contractReadiness(firstIncomplete).reason}`;
    setControl(root,{state:'CONTRACT_BLOCKED',requested_state:'PAUSED',active_task_id:null,active_batch_id:null,last_error:reason});
    heartbeat(root,{state:'CONTRACT_BLOCKED',next_task:taskContract(firstIncomplete),reason});
    appendJsonl('events/screen-factory.jsonl',{event:'SCREEN_FACTORY_CONTRACT_BLOCKED',task_id:firstIncomplete.task_id,reason,at:now()},root);
    return screenFactoryStatus(root);
  }
  const task = claimNextTask(manifest);
  if (!task) {
    const incomplete = manifest.tasks.filter((item)=>requiredTask(item)&&!completedTask(item));
    const exhausted = incomplete.filter((item)=>item.status==='FAILED'&&Number(item.generation_attempts||0)>=3);
    const state = incomplete.length ? 'FAILED' : 'COMPLETE';
    setControl(root,{state,requested_state:state==='COMPLETE'?'STOPPED':control.requested_state,active_task_id:null,active_batch_id:null,last_error:exhausted.length?`${exhausted.length} task(s) exhausted retries`:null});
    heartbeat(root,{state,remaining:incomplete.length}); return screenFactoryStatus(root);
  }
  const batch=batchForTask(manifest,task);
  const queued=currentRequest(root); if(queued?.batch_id!==batch.batch_id) prepareChatGPTBatch(root);
  writeJsonAtomic(MANIFEST_REL,{...manifest,updated_at:now()},root);
  setControl(root,{state:'GENERATING',active_task_id:task.task_id,active_batch_id:batch.batch_id,last_error:null}); heartbeat(root,{state:'GENERATING',active_task_id:task.task_id,active_batch_id:batch.batch_id});
  try {
    const generated=await compiler({task,root});
    const aux=await auxiliary(task,generated.packet,root);
    setControl(root,{state:'RENDERING'}); heartbeat(root,{state:'RENDERING',active_task_id:task.task_id,active_batch_id:batch.batch_id});
    const rendered=await renderer({task,packet:generated.packet,outputRoot:outputRoot(root)});
    setControl(root,{state:'QA'});
    task.bundle_dir=rendered.bundle_dir; task.asset_path=rendered.png_path; task.basic_qa=rendered.qa.pass?'PASS':'FAIL'; task.visual_qa='NOT_RUN'; task.approved=false; task.implementation_ready=true;
    task.status=rendered.qa.pass?'COMPLETE':'FAILED'; task.last_error=rendered.qa.pass?null:rendered.qa.failures.join(','); task.lease=null; task.updated_at=now();
    task.generator_provenance={authority:'MODEL_RUNTIME',generator:'SCREEN_IMPLEMENTATION_COMPILER',policy:generated.policy||SCREEN_GENERATOR_POLICY,runtime:generated.runtime,model:generated.model,hermes_generated_pixels:false,openrouter_generated_pixels:false,deterministic_renderer:'PLAYWRIGHT_CHROMIUM'};
    task.auxiliary_review={authority:'NON_AUTHORITATIVE_AUXILIARY_ONLY',state:aux?.state||null,model:aux?.model||null};
    reconcileBatch(manifest,task); reconcilePlatformPackage(manifest,task,root); writeJsonAtomic(MANIFEST_REL,{...manifest,updated_at:now()},root);
    appendJsonl('events/screen-factory.jsonl',{event:task.status==='COMPLETE'?'SCREEN_FACTORY_TASK_COMPLETE':'SCREEN_FACTORY_TASK_QA_FAILED',task_id:task.task_id,screen_id:task.screen_id,platform:task.platform,model:generated.model,runtime:generated.runtime,basic_qa:task.basic_qa,at:now()},root);
  } catch(error) {
    const reason=String(error?.message||error).slice(0,2000);
    const runtimeBlocked=/NO_HERMES_RUNTIME_AVAILABLE|no authoritative model response|CLAUDE_SONNET_5_NOT_(?:HEALTHY|SELECTED)|usage limit|rate.?limit|HTTP 429/i.test(reason);
    if(runtimeBlocked){
      task.status='NOT_GENERATED'; task.generation_attempts=Math.max(0,Number(task.generation_attempts||1)-1); task.basic_qa='NOT_RUN'; task.visual_qa='NOT_RUN'; task.approved=false; task.implementation_ready=false; task.lease=null; task.last_error=null; task.updated_at=now();
      writeJsonAtomic(MANIFEST_REL,{...manifest,updated_at:now()},root);
      setControl(root,{state:'RUNTIME_BLOCKED',requested_state:'PAUSED',active_task_id:null,active_batch_id:batch.batch_id,last_error:reason});
      heartbeat(root,{state:'RUNTIME_BLOCKED',active_batch_id:batch.batch_id,next_task:taskContract(task),reason});
      appendJsonl('events/screen-factory.jsonl',{event:'SCREEN_FACTORY_RUNTIME_BLOCKED',task_id:task.task_id,batch_id:batch.batch_id,reason,at:now()},root);
      return screenFactoryStatus(root);
    }
    task.status='FAILED'; task.basic_qa=task.basic_qa==='PASS'?'PASS':'NOT_RUN'; task.visual_qa='NOT_RUN'; task.approved=false; task.implementation_ready=false; task.lease=null; task.last_error=reason; task.updated_at=now();
    writeJsonAtomic(MANIFEST_REL,{...manifest,updated_at:now()},root); appendJsonl('events/screen-factory.jsonl',{event:'SCREEN_FACTORY_TASK_FAILED',task_id:task.task_id,attempt:task.generation_attempts,reason:task.last_error,at:now()},root);
  }
  const latest=readJson(CONTROL_REL,defaultControl(),root);
  if(latest.requested_state==='PAUSED') setControl(root,{state:'PAUSED',active_task_id:null,active_batch_id:null});
  else if(latest.requested_state==='STOPPED') setControl(root,{state:'STOPPED',active_task_id:null,active_batch_id:null});
  else setControl(root,{state:'RUNNING',active_task_id:null,active_batch_id:null});
  const status=screenFactoryStatus(root); heartbeat(root,{state:status.state,complete:status.complete,required_total:status.required_total,next_task:status.next_task}); return status;
}

export async function runScreenFactoryDaemon({ root, pollMs = 1500 } = {}) {
  ensureScreenFactory(root);
  let stopping = false; const stop = () => { stopping = true; };
  process.on('SIGTERM', stop); process.on('SIGINT', stop); heartbeat(root, { state: 'STARTING' });
  while (!stopping) {
    const control = readJson(CONTROL_REL, defaultControl(), root);
    if (control.requested_state === 'RUNNING') await runScreenFactoryTick({ root });
    else { heartbeat(root, { state: control.requested_state === 'PAUSED' ? 'PAUSED' : 'STOPPED' }); await new Promise((resolve) => setTimeout(resolve, pollMs)); }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  setControl(root, { state: 'STOPPED', requested_state: 'STOPPED', active_task_id: null, active_batch_id: null }); heartbeat(root, { state: 'STOPPED' });
}
async function main() {
  const command = process.argv[2] || 'status';
  if (command === 'init') return console.log(JSON.stringify(ensureScreenFactory(), null, 2));
  if (command === 'status') return console.log(JSON.stringify(screenFactoryStatus(), null, 2));
  if (command === 'import') { const source = process.argv[3]; if (!source) throw new Error('screen factory import requires manifest path'); return console.log(JSON.stringify(importScreenFactoryManifest(source), null, 2)); }
  if (command === 'reset') { const source = process.argv[3]; if (!source) throw new Error('screen factory reset requires canonical queue path'); return console.log(JSON.stringify(resetScreenFactory(source), null, 2)); }
  if (command === 'import-existing') { const source = process.argv[3]; if (!source) throw new Error('screen factory import-existing requires evidence path'); return console.log(JSON.stringify(importExternalScreenEvidence(source), null, 2)); }
  if (command === 'import-contracts') { const source = process.argv[3]; if (!source) throw new Error('screen factory import-contracts requires contract path'); return console.log(JSON.stringify(importScreenContracts(source), null, 2)); }
  if (command === 'reconcile') return console.log(JSON.stringify(reconcileLocalScreenArtifacts(), null, 2));
  if (command === 'prepare' || command === 'request') return console.log(JSON.stringify(prepareChatGPTBatch(), null, 2));
  if (command === 'ingest') { const receipt = process.argv[3]; if (!receipt) throw new Error('screen factory ingest requires receipt path'); return console.log(JSON.stringify(await ingestChatGPTReceipt(receipt), null, 2)); }
  if (['play', 'resume', 'pause', 'stop'].includes(command)) return console.log(JSON.stringify(controlScreenFactory(command), null, 2));
  if (command === 'tick') return console.log(JSON.stringify(await runScreenFactoryTick({}), null, 2));
  if (command === 'daemon') return runScreenFactoryDaemon({});
  throw new Error(`unknown screen factory command: ${command}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
