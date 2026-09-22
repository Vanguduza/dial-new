import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_CONTROL_HOME,
  appendJsonl,
  ensureControlLayout,
  readJson,
  resolveControlPath,
  writeJsonAtomic,
} from './state-store.mjs';

export const RESOURCE_CLASSES = Object.freeze([
  'FOUNDATION',
  'CANONICAL',
  'PERSISTENT_OPERATIONAL',
  'DERIVED',
  'EPHEMERAL',
  'CACHE',
]);

export const RESOURCE_STATES = Object.freeze([
  'ACTIVE',
  'WAITING_ADMISSION',
  'GC_ELIGIBLE',
  'QUARANTINED',
  'DELETED',
  'RETAINED',
]);

const INDEX_REL = 'housekeeping/resources.json';
const EVENT_REL = 'events/housekeeping.jsonl';
const TRIGGER_REL = 'housekeeping/trigger';

function now() { return new Date().toISOString(); }
function clean(v, max = 2000) { return String(v ?? '').trim().slice(0, max); }
function absPath(value) {
  const p = path.resolve(String(value || ''));
  if (!path.isAbsolute(p) || p === path.parse(p).root) throw new Error('resource path must be a non-root absolute path');
  return p;
}
function makeId({ host, type, path: p, project, taskId, missionId }) {
  return 'res_' + crypto.createHash('sha256')
    .update([host || '', type || '', p || '', project || '', taskId || '', missionId || ''].join('|'))
    .digest('hex').slice(0, 24);
}
function loadIndex(root = DEFAULT_CONTROL_HOME) {
  return readJson(INDEX_REL, { schema_version: 1, resources: {}, updated_at: null }, root);
}
function saveIndex(index, root = DEFAULT_CONTROL_HOME) {
  index.updated_at = now();
  writeJsonAtomic(INDEX_REL, index, root);
  return index;
}
function assertClass(resourceClass) {
  if (!RESOURCE_CLASSES.includes(resourceClass)) throw new Error('invalid resource class');
}
function assertState(state) {
  if (!RESOURCE_STATES.includes(state)) throw new Error('invalid resource state');
}
function emit(root, event, resource, extra = {}) {
  appendJsonl(EVENT_REL, {
    event,
    resource_id: resource?.resource_id ?? null,
    type: resource?.type ?? null,
    project: resource?.project ?? null,
    mission_id: resource?.mission_id ?? null,
    task_id: resource?.task_id ?? null,
    host: resource?.host ?? null,
    at: now(),
    ...extra,
  }, root);
}

export function requestHousekeepingSweep(root = DEFAULT_CONTROL_HOME, reason = 'STATE_CHANGED') {
  ensureControlLayout(root);
  const target = resolveControlPath(TRIGGER_REL, root);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, JSON.stringify({ reason: clean(reason, 200), requested_at: now(), nonce: crypto.randomUUID() }) + '\n', { mode: 0o600 });
  return target;
}

export function registerResource({
  root = DEFAULT_CONTROL_HOME,
  resourceId = null,
  project = 'dial',
  missionId = null,
  taskId = null,
  leaseId = null,
  host = process.env.DIAL_FABRIC_HOST_ID || process.env.DIAL_HERMES_HOST_ID || process.env.HOSTNAME || 'unknown',
  type,
  path: resourcePath,
  locator = null,
  resourceClass = 'DERIVED',
  reconstructability = 'UNKNOWN',
  retentionTrigger = 'EXPLICIT',
  evidenceRefs = [],
  metadata = {},
  state = 'ACTIVE',
} = {}) {
  if (!type) throw new Error('resource type required');
  assertClass(resourceClass);
  assertState(state);
  const normalizedPath = resourcePath ? absPath(resourcePath) : null;
  if (!normalizedPath && !locator) throw new Error('resource path or locator required');
  const index = loadIndex(root);
  const id = resourceId || makeId({ host, type, path: normalizedPath || locator, project, taskId, missionId });
  const prior = index.resources[id] || null;
  const resource = {
    schema_version: 1,
    resource_id: id,
    project: clean(project, 120) || null,
    mission_id: clean(missionId, 160) || null,
    task_id: clean(taskId, 160) || null,
    lease_id: clean(leaseId, 160) || null,
    host: clean(host, 160),
    type: clean(type, 120),
    path: normalizedPath,
    locator: locator ? clean(locator, 1000) : null,
    resource_class: resourceClass,
    reconstructability: clean(reconstructability, 120),
    retention_trigger: clean(retentionTrigger, 160),
    evidence_refs: [...new Set([...(prior?.evidence_refs || []), ...evidenceRefs.map((x) => clean(x, 1000)).filter(Boolean)])],
    metadata: { ...(prior?.metadata || {}), ...metadata },
    state,
    created_at: prior?.created_at || now(),
    updated_at: now(),
    gc_eligible_at: state === 'GC_ELIGIBLE' ? (prior?.gc_eligible_at || now()) : prior?.gc_eligible_at || null,
    deleted_at: prior?.deleted_at || null,
  };
  index.resources[id] = resource;
  saveIndex(index, root);
  emit(root, prior ? 'RESOURCE_UPDATED' : 'RESOURCE_REGISTERED', resource);
  if (state === 'GC_ELIGIBLE') requestHousekeepingSweep(root, 'RESOURCE_GC_ELIGIBLE');
  return resource;
}

export function getResource(resourceId, root = DEFAULT_CONTROL_HOME) {
  return loadIndex(root).resources[resourceId] || null;
}

export function listResources({ root = DEFAULT_CONTROL_HOME, states = null, project = null, host = null } = {}) {
  let values = Object.values(loadIndex(root).resources);
  if (states) {
    const allowed = new Set(Array.isArray(states) ? states : [states]);
    values = values.filter((r) => allowed.has(r.state));
  }
  if (project) values = values.filter((r) => r.project === project);
  if (host) values = values.filter((r) => r.host === host);
  return values.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

export function updateResource(resourceId, patch = {}, root = DEFAULT_CONTROL_HOME, event = 'RESOURCE_UPDATED') {
  const index = loadIndex(root);
  const prior = index.resources[resourceId];
  if (!prior) throw new Error('resource not found');
  if (patch.resource_class) assertClass(patch.resource_class);
  if (patch.state) assertState(patch.state);
  const resource = {
    ...prior,
    ...patch,
    metadata: { ...(prior.metadata || {}), ...(patch.metadata || {}) },
    evidence_refs: patch.evidence_refs
      ? [...new Set([...(prior.evidence_refs || []), ...patch.evidence_refs.map(String)])]
      : prior.evidence_refs || [],
    updated_at: now(),
  };
  if (resource.state === 'GC_ELIGIBLE' && !resource.gc_eligible_at) resource.gc_eligible_at = now();
  if (resource.state === 'DELETED' && !resource.deleted_at) resource.deleted_at = now();
  index.resources[resourceId] = resource;
  saveIndex(index, root);
  emit(root, event, resource, { reason: patch.reason || null });
  if (resource.state === 'GC_ELIGIBLE') requestHousekeepingSweep(root, event);
  return resource;
}

export function markResourceGcEligible({ root = DEFAULT_CONTROL_HOME, resourceId, reason, evidenceRefs = [], metadata = {} } = {}) {
  const resource = getResource(resourceId, root);
  if (!resource) throw new Error('resource not found');
  if (['FOUNDATION', 'CANONICAL', 'PERSISTENT_OPERATIONAL'].includes(resource.resource_class)) {
    throw new Error('protected resource class cannot become GC eligible');
  }
  return updateResource(resourceId, {
    state: 'GC_ELIGIBLE',
    gc_reason: clean(reason || 'LIFECYCLE_COMPLETE', 500),
    evidence_refs: evidenceRefs,
    metadata,
  }, root, 'RESOURCE_GC_ELIGIBLE');
}

export function markResourceDeleted({ root = DEFAULT_CONTROL_HOME, resourceId, receipt = {} } = {}) {
  return updateResource(resourceId, {
    state: 'DELETED',
    deletion_receipt: receipt,
    deleted_at: now(),
  }, root, 'RESOURCE_DELETED');
}

export function markResourceQuarantined({ root = DEFAULT_CONTROL_HOME, resourceId, reason } = {}) {
  return updateResource(resourceId, {
    state: 'QUARANTINED',
    quarantine_reason: clean(reason, 1000),
  }, root, 'RESOURCE_QUARANTINED');
}

export function registerLeaseWorktree({ root = DEFAULT_CONTROL_HOME, lease } = {}) {
  if (!lease?.worktree_path) return null;
  let linkedWorktree = false;
  try { linkedWorktree = fs.statSync(path.join(lease.worktree_path, '.git')).isFile(); } catch {}
  return registerResource({
    root,
    project: lease.repository_id || 'dial-new',
    taskId: lease.task_id,
    leaseId: lease.lease_id,
    type: linkedWorktree ? 'GIT_WORKTREE' : 'GIT_PRIMARY_CHECKOUT',
    path: lease.worktree_path,
    resourceClass: linkedWorktree ? 'DERIVED' : 'PERSISTENT_OPERATIONAL',
    reconstructability: linkedWorktree ? 'GIT_REMOTE_PLUS_ADMITTED_COMMIT' : 'PROJECT_LIFECYCLE_REQUIRED',
    retentionTrigger: linkedWorktree ? 'INTEGRATION_ADMITTED' : 'PROJECT_COMPLETE',
    metadata: {
      repository_id: lease.repository_id,
      base_commit: lease.base_commit || null,
      integration_admitted: false,
      fencing_token: lease.fencing_token,
      linked_worktree: linkedWorktree,
    },
  });
}

export function markLeaseResourceClosed({ root = DEFAULT_CONTROL_HOME, lease, state, reason = null } = {}) {
  if (!lease?.worktree_path) return null;
  const resource = listResources({ root }).find((r) => r.lease_id === lease.lease_id);
  if (!resource) return null;
  if (resource.type === 'GIT_PRIMARY_CHECKOUT' || resource.resource_class === 'PERSISTENT_OPERATIONAL') {
    return updateResource(resource.resource_id, {
      state: 'ACTIVE',
      metadata: { lease_closed: true, lease_close_state: state, lease_close_reason: reason || null },
    }, root, 'PRIMARY_CHECKOUT_LEASE_CLOSED');
  }
  if (state === 'REVOKED' || state === 'EXPIRED') {
    return markResourceQuarantined({ root, resourceId: resource.resource_id, reason: reason || state });
  }
  if (resource.state === 'GC_ELIGIBLE' || resource.metadata?.integration_admitted === true) {
    return updateResource(resource.resource_id, { state: 'GC_ELIGIBLE', metadata: { lease_closed: true } }, root, 'RESOURCE_GC_ELIGIBLE_AFTER_LEASE_RELEASE');
  }
  return updateResource(resource.resource_id, { state: 'WAITING_ADMISSION', metadata: { lease_closed: true } }, root, 'RESOURCE_WAITING_ADMISSION');
}

export function markTaskResourcesAdmitted({ root = DEFAULT_CONTROL_HOME, taskId, evidenceRefs = [], integration = {} } = {}) {
  const touched = [];
  for (const resource of listResources({ root })) {
    if (resource.task_id !== taskId) continue;
    if (!['DERIVED', 'EPHEMERAL', 'CACHE'].includes(resource.resource_class)) continue;
    if (!['INTEGRATION_ADMITTED', 'TASK_ADMITTED'].includes(resource.retention_trigger)) continue;
    touched.push(markResourceGcEligible({
      root,
      resourceId: resource.resource_id,
      reason: 'INTEGRATION_ADMITTED',
      evidenceRefs,
      metadata: { integration_admitted: true, ...integration },
    }));
  }
  return touched;
}

export function markMissionResourcesEligible({ root = DEFAULT_CONTROL_HOME, missionId, reason = 'MISSION_COMPLETE', evidenceRefs = [] } = {}) {
  const touched = [];
  for (const resource of listResources({ root })) {
    if (resource.mission_id !== missionId) continue;
    if (!['DERIVED', 'EPHEMERAL', 'CACHE'].includes(resource.resource_class)) continue;
    if (!['MISSION_COMPLETE', 'PROJECT_COMPLETE'].includes(resource.retention_trigger)) continue;
    touched.push(markResourceGcEligible({ root, resourceId: resource.resource_id, reason, evidenceRefs, metadata: { mission_complete: true } }));
  }
  return touched;
}

export function registerAndroidBuildCompletion({
  root = DEFAULT_CONTROL_HOME,
  project,
  missionId = null,
  taskId = null,
  buildPath,
  evidenceRef,
  artifactRef = null,
  host = null,
} = {}) {
  if (!evidenceRef) throw new Error('Android build completion requires evidenceRef');
  const resource = registerResource({
    root,
    project,
    missionId,
    taskId,
    host: host || undefined,
    type: 'ANDROID_BUILD_TREE',
    path: buildPath,
    resourceClass: 'DERIVED',
    reconstructability: 'SOURCE_PLUS_PINNED_TOOLCHAIN',
    retentionTrigger: 'TEST_EVIDENCE_SEALED',
    evidenceRefs: [evidenceRef, artifactRef].filter(Boolean),
    metadata: {
      build_complete: true,
      test_evidence_sealed: true,
      retained_artifact_ref: artifactRef || null,
    },
    state: 'ACTIVE',
  });
  return markResourceGcEligible({
    root,
    resourceId: resource.resource_id,
    reason: 'ANDROID_BUILD_AND_TEST_COMPLETE',
    evidenceRefs: [evidenceRef, artifactRef].filter(Boolean),
  });
}

function argValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
function cliMain() {
  const command = process.argv[2] || 'list';
  const args = process.argv.slice(3);
  if (command === 'list') return console.log(JSON.stringify(listResources({}), null, 2));
  if (command === 'register') {
    return console.log(JSON.stringify(registerResource({
      project: argValue(args, '--project') || 'dial',
      missionId: argValue(args, '--mission'),
      taskId: argValue(args, '--task'),
      type: argValue(args, '--type'),
      path: argValue(args, '--path'),
      resourceClass: argValue(args, '--class') || 'DERIVED',
      reconstructability: argValue(args, '--reconstructability') || 'UNKNOWN',
      retentionTrigger: argValue(args, '--trigger') || 'EXPLICIT',
    }), null, 2));
  }
  if (command === 'eligible') {
    return console.log(JSON.stringify(markResourceGcEligible({
      resourceId: args[0] || argValue(args, '--resource'),
      reason: argValue(args, '--reason') || 'EXPLICIT_LIFECYCLE_CLOSURE',
      evidenceRefs: args.filter((x, i) => args[i - 1] === '--evidence'),
    }), null, 2));
  }
  if (command === 'android-complete') {
    return console.log(JSON.stringify(registerAndroidBuildCompletion({
      project: argValue(args, '--project') || 'unknown',
      missionId: argValue(args, '--mission'),
      taskId: argValue(args, '--task'),
      buildPath: argValue(args, '--build-path'),
      evidenceRef: argValue(args, '--evidence'),
      artifactRef: argValue(args, '--artifact'),
    }), null, 2));
  }
  if (command === 'trigger') return console.log(requestHousekeepingSweep(DEFAULT_CONTROL_HOME, argValue(args, '--reason') || 'RESOURCE_CLI'));
  throw new Error('unknown resource lifecycle command');
}
if (import.meta.url === `file://${process.argv[1]}`) {
  try { cliMain(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
