#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { appendJsonl, ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';

export const SCREEN_FACTORY_AUTHORITY = 'DIAL_HEALTH_SCREEN_FACTORY_CONTROL_PLANE';
export const SCREEN_FACTORY_GENERATOR_MODE = 'CHATGPT_ASSISTED';
export const SCREEN_FACTORY_GENERATOR_AUTHORITY = 'CHATGPT';
export const SCREEN_FACTORY_STATES = Object.freeze([
  'STOPPED', 'RUNNING', 'PAUSING', 'PAUSED', 'WAITING_FOR_CHATGPT',
  'IMPORTING', 'QA', 'FAILED', 'COMPLETE',
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
  fs.mkdirSync(requestRoot(root), { recursive: true, mode: 0o700 });
  const current = readJson(CONTROL_REL, null, root);
  if (!current) writeJsonAtomic(CONTROL_REL, defaultControl(), root);
  else if (current.generator_mode !== SCREEN_FACTORY_GENERATOR_MODE || current.generator_authority !== SCREEN_FACTORY_GENERATOR_AUTHORITY) {
    writeJsonAtomic(CONTROL_REL, { ...current, ...defaultControl(), state: 'STOPPED', requested_state: 'STOPPED' }, root);
  }
  if (!readJson(MANIFEST_REL, null, root)) {
    writeJsonAtomic(MANIFEST_REL, { schema_version: 3, source: null, tasks: [], batches: [], updated_at: now() }, root);
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
  const seen = new Set();
  const tasks = source.tasks.map((input, index) => {
    const taskId = String(input.task_id || `${input.screen_id}::${input.platform}`);
    if (!input.screen_id || !input.platform || seen.has(taskId)) throw new Error(`invalid/duplicate task at index ${index}: ${taskId}`);
    seen.add(taskId);
    return {
      ...input, task_id: taskId, platform_policy: input.platform_policy || 'REQUIRED',
      status: 'NOT_GENERATED', generation_attempts: Number(input.generation_attempts || 0),
      basic_qa: 'NOT_RUN', visual_qa: 'NOT_RUN', implementation_ready: false,
      approved: false, asset_path: null, bundle_dir: null, generator_provenance: null,
      lease: null, updated_at: now(),
    };
  }).sort(taskOrder);
  const manifest = {
    schema_version: 3, source: path.resolve(sourcePath), registry_source: source.registry_source || source.source || null,
    design_version: source.design_version || null, tasks, batches: [], updated_at: now(),
  };
  writeJsonAtomic(MANIFEST_REL, manifest, root);
  appendJsonl('events/screen-factory.jsonl', { event: 'SCREEN_FACTORY_MANIFEST_IMPORTED', tasks: tasks.length, source: manifest.source, at: now() }, root);
  return screenFactoryStatus(root);
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
    design_version: task.design_version || null,
  };
}
function currentRequest(root) { return readJson(REQUEST_REL, null, root); }
export function prepareChatGPTBatch(root) {
  ensureScreenFactory(root);
  const manifest = readJson(MANIFEST_REL, { tasks: [], batches: [] }, root);
  const batch = nextBatch(manifest);
  if (!batch) return null;
  const tasks = batch.task_ids.map((id) => manifest.tasks.find((task) => task.task_id === id)).filter(Boolean);
  const request = {
    schema_version: 1, authority: SCREEN_FACTORY_AUTHORITY,
    generator_mode: SCREEN_FACTORY_GENERATOR_MODE, generator_authority: SCREEN_FACTORY_GENERATOR_AUTHORITY,
    hermes_role: 'CONTROL_HEARTBEAT_QUEUE_QA_PACKAGING_ONLY', openrouter_role: 'OPTIONAL_AUXILIARY_ONLY',
    batch_id: batch.batch_id, business_unit: batch.business_unit, platform: batch.platform,
    expected_count: batch.expected_count,
    instruction: 'Generate each task as one separate standalone high-quality application screen image. Never create a board/collage. Preserve the locked Dial Health visual system. Return an implementation_spec for each image so the visual can be reconstructed as a functional application screen.',
    tasks: tasks.map(taskContract), prepared_at: now(),
  };
  writeJsonAtomic(REQUEST_REL, request, root);
  for (const task of tasks) if (!completedTask(task)) { task.status = 'AWAITING_CHATGPT'; task.updated_at = now(); }
  writeJsonAtomic(MANIFEST_REL, { ...manifest, updated_at: now() }, root);
  appendJsonl('events/screen-factory.jsonl', { event: 'SCREEN_FACTORY_CHATGPT_BATCH_PREPARED', batch_id: batch.batch_id, count: tasks.length, at: now() }, root);
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
    schema_version: 3, authority: SCREEN_FACTORY_AUTHORITY,
    generator_mode: SCREEN_FACTORY_GENERATOR_MODE, generator_authority: SCREEN_FACTORY_GENERATOR_AUTHORITY,
    hermes_role: 'CONTROL_HEARTBEAT_QUEUE_QA_PACKAGING_ONLY', openrouter_role: 'OPTIONAL_AUXILIARY_ONLY',
    state: control.state, requested_state: control.requested_state,
    active_task_id: control.active_task_id, active_batch_id: control.active_batch_id,
    last_error: control.last_error, required_total: required.length, complete: complete.length,
    implementation_ready: implementationReady.length, remaining: required.length - complete.length,
    failed: failed.length, materialized: materialized.length, percent: required.length ? Number(((complete.length / required.length) * 100).toFixed(2)) : 0,
    next_task: next ? { task_id: next.task_id, screen_id: next.screen_id, title: next.title, business_unit: next.business_unit, platform: next.platform } : null,
    current_request: request ? { batch_id: request.batch_id, expected_count: request.expected_count, prepared_at: request.prepared_at } : null,
    by_business_unit: progressBreakdown(manifest.tasks, 'business_unit'),
    by_platform: progressBreakdown(manifest.tasks, 'platform'), batches: manifest.batches || [], updated_at: now(),
  };
}

function zipBatch(batch, manifest, root) {
  const tasks = batch.task_ids.map((id) => manifest.tasks.find((task) => task.task_id === id));
  if (!tasks.every(completedTask)) return null;
  const target = path.join(packageRoot(root), `${batch.batch_id}.zip`);
  const dirs = tasks.map((task) => task.bundle_dir);
  const py = [
    'import os,sys,zipfile', 'target=sys.argv[1]; roots=sys.argv[2:]', 'tmp=target+".partial"',
    'os.makedirs(os.path.dirname(target),exist_ok=True)', 'z=zipfile.ZipFile(tmp,"w",zipfile.ZIP_DEFLATED)',
    '[(z.write(os.path.join(r,f),os.path.relpath(os.path.join(r,f),os.path.dirname(r)))) for r in roots for _,_,fs in os.walk(r) for f in fs]',
    'z.close(); os.replace(tmp,target)',
  ].join(';');
  execFileSync('python3', ['-c', py, target, ...dirs], { timeout: 120000 });
  return target;
}
function reconcileBatch(manifest, task, root) {
  const batch = batchForTask(manifest, task);
  const previous = (manifest.batches || []).find((item) => item.batch_id === batch.batch_id);
  const completeCount = batch.task_ids.filter((id) => completedTask(manifest.tasks.find((item) => item.task_id === id))).length;
  let zipPath = previous?.zip_path ?? null;
  if (completeCount === batch.expected_count && (!zipPath || !fs.existsSync(zipPath))) zipPath = zipBatch(batch, manifest, root);
  const record = { ...batch, complete_count: completeCount,
    state: completeCount === batch.expected_count ? 'COMPLETE' : 'IN_PROGRESS',
    zip_path: zipPath, downloadable: Boolean(zipPath && fs.existsSync(zipPath)), updated_at: now() };
  manifest.batches = [...(manifest.batches || []).filter((item) => item.batch_id !== batch.batch_id), record]
    .sort((a, b) => a.batch_id.localeCompare(b.batch_id));
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
    const received = materializeChatGPTEntry(entry, task, root);
    const sourceImage = received.sourceImage;
    setControl(root, { state: 'QA', active_task_id: task.task_id, active_batch_id: batchForTask(manifest, task).batch_id });
    const qa = await imageQa(task, sourceImage);
    const bundle = path.join(outputRoot(root), safeName(task.task_id));
    fs.mkdirSync(bundle, { recursive: true, mode: 0o700 });
    const ext = qa.metadata.format === 'jpeg' ? 'jpg' : qa.metadata.format;
    const targetImage = path.join(bundle, `${task.screen_id}__${task.platform}.${ext}`);
    fs.copyFileSync(sourceImage, targetImage);
    writeJsonAtomic(path.relative(resolveControlPath('.', root), path.join(bundle, `${task.screen_id}__${task.platform}.contract.json`)), taskContract(task), root);
    let implementationReady = false;
    if (entry.implementation_spec && typeof entry.implementation_spec === 'object') {
      fs.writeFileSync(path.join(bundle, `${task.screen_id}__${task.platform}.implementation.json`), `${JSON.stringify(entry.implementation_spec, null, 2)}\n`, { mode: 0o600 });
      implementationReady = Boolean(entry.implementation_spec.layout && entry.implementation_spec.interactions && entry.implementation_spec.states);
    }
    fs.writeFileSync(path.join(bundle, `${task.screen_id}__${task.platform}.qa.json`), `${JSON.stringify(qa, null, 2)}\n`, { mode: 0o600 });
    task.asset_path = targetImage; task.bundle_dir = bundle; task.basic_qa = qa.pass ? 'PASS' : 'FAIL';
    task.visual_qa = entry.visual_qa === 'PASS' ? 'PASS' : 'NOT_RUN'; task.approved = false;
    task.implementation_ready = implementationReady; task.status = qa.pass ? 'COMPLETE' : 'FAILED';
    task.last_error = qa.pass ? null : qa.failures.join(','); task.lease = null; task.updated_at = now();
    task.generator_provenance = {
      authority: 'CHATGPT', generator: 'CHATGPT_BUILTIN_IMAGE_GENERATION',
      orchestration_model: 'GPT-5.6 Sol', hermes_generated_pixels: false,
      openrouter_generated_pixels: false, transport: received.transport, received_at: now(),
    };
    if (received.cleanup) { try { fs.rmSync(sourceImage, { force: true }); } catch {} }
    reconcileBatch(manifest, task, root);
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

export async function runScreenFactoryTick({ root } = {}) {
  ensureScreenFactory(root);
  const control = readJson(CONTROL_REL, defaultControl(), root);
  if (control.requested_state === 'STOPPED') { setControl(root, { state: 'STOPPED' }); heartbeat(root, { state: 'STOPPED' }); return screenFactoryStatus(root); }
  if (control.requested_state === 'PAUSED') { setControl(root, { state: 'PAUSED' }); heartbeat(root, { state: 'PAUSED' }); return screenFactoryStatus(root); }
  const manifest = readJson(MANIFEST_REL, { tasks: [], batches: [] }, root);
  const incomplete = manifest.tasks.filter((item) => requiredTask(item) && !completedTask(item));
  if (!incomplete.length) {
    setControl(root, { state: 'COMPLETE', requested_state: 'STOPPED', active_task_id: null, active_batch_id: null });
    heartbeat(root, { state: 'COMPLETE', complete: manifest.tasks.filter(completedTask).length });
    return screenFactoryStatus(root);
  }
  if (control.state === 'WAITING_FOR_CHATGPT' && control.active_batch_id) {
    const active = (manifest.batches || []).find((item) => item.batch_id === control.active_batch_id);
    if (!active || active.state !== 'COMPLETE') {
      heartbeat(root, { state: 'WAITING_FOR_CHATGPT', active_batch_id: control.active_batch_id, next_task: screenFactoryStatus(root).next_task });
      return screenFactoryStatus(root);
    }
    setControl(root, { state: 'RUNNING', active_batch_id: null, active_task_id: null });
  }
  const request = prepareChatGPTBatch(root);
  if (!request) return screenFactoryStatus(root);
  setControl(root, { state: 'WAITING_FOR_CHATGPT', active_batch_id: request.batch_id, active_task_id: null, last_error: null });
  heartbeat(root, { state: 'WAITING_FOR_CHATGPT', active_batch_id: request.batch_id, expected_count: request.expected_count });
  return screenFactoryStatus(root);
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
  if (command === 'import-existing') { const source = process.argv[3]; if (!source) throw new Error('screen factory import-existing requires evidence path'); return console.log(JSON.stringify(importExternalScreenEvidence(source), null, 2)); }
  if (command === 'prepare' || command === 'request') return console.log(JSON.stringify(prepareChatGPTBatch(), null, 2));
  if (command === 'ingest') { const receipt = process.argv[3]; if (!receipt) throw new Error('screen factory ingest requires receipt path'); return console.log(JSON.stringify(await ingestChatGPTReceipt(receipt), null, 2)); }
  if (['play', 'resume', 'pause', 'stop'].includes(command)) return console.log(JSON.stringify(controlScreenFactory(command), null, 2));
  if (command === 'tick') return console.log(JSON.stringify(await runScreenFactoryTick({}), null, 2));
  if (command === 'daemon') return runScreenFactoryDaemon({});
  throw new Error(`unknown screen factory command: ${command}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
