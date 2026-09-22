#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_CONTROL_HOME,
  appendJsonl,
  ensureControlLayout,
  readJson,
  resolveControlPath,
  writeJsonAtomic,
} from './state-store.mjs';
import {
  getResource,
  listResources,
  markResourceDeleted,
  markResourceQuarantined,
  requestHousekeepingSweep,
} from './resource-lifecycle-registry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '../..');
const POLICY_PATH = process.env.DIAL_HOUSEKEEPING_POLICY
  || path.join(REPO_ROOT, 'agent-system/registries/HOUSEKEEPING_POLICY.json');

function now() { return new Date().toISOString(); }
function realOrResolved(p) {
  const resolved = path.resolve(String(p || ''));
  try { return fs.realpathSync(resolved); } catch { return resolved; }
}
function run(cmd, args = [], opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: opts.timeout ?? 20000,
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env || {}) },
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}
function loadPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
}
function hostIdentity() {
  const roleFile = '/etc/dial/host-role';
  let role = '';
  try {
    const text = fs.readFileSync(roleFile, 'utf8');
    role = (text.match(/^ROLE=(.+)$/m)?.[1] || text.match(/^HOSTNAME=(.+)$/m)?.[1] || '').trim();
  } catch {}
  const physical = os.hostname();
  if (physical === 'dial-control') return 'dial-control';
  if (physical === 'oracle-admin') return 'oracle-admin';
  if (physical === 'vekl-worker') return 'vekl-worker';
  if (physical === 'van-trading-core') return 'van-trading-core';
  if (role === 'CONTROL_AUTHORITY' || role === 'dial-hermes-control') return 'dial-hermes-control';
  return process.env.DIAL_HOUSEKEEPING_HOST || physical;
}
function pathWithin(candidate, prefix) {
  const c = realOrResolved(candidate);
  const p = realOrResolved(prefix);
  return c === p || c.startsWith(p + path.sep);
}
function protectedPathReason(resource, policy) {
  if (!resource.path) return null;
  const target = realOrResolved(resource.path);
  const repo = process.env.DIAL_REPO_DIR ? realOrResolved(process.env.DIAL_REPO_DIR) : null;
  if (repo && target === repo) return 'ACTIVE_DIAL_REPOSITORY';
  for (const prefix of policy.protected_absolute_prefixes || []) {
    const expanded = prefix.startsWith('~/') ? path.join(os.homedir(), prefix.slice(2)) : prefix;
    if (pathWithin(target, expanded)) return 'PROTECTED_PREFIX';
  }
  if (target === '/' || target === os.homedir()) return 'PROTECTED_ROOT';
  return null;
}
function activeLeaseReason(resource, root) {
  const idx = readJson('execution/leases/index.json', { leases: {} }, root);
  for (const lease of Object.values(idx.leases || {})) {
    if (lease.state !== 'ACTIVE') continue;
    if (resource.lease_id && lease.lease_id === resource.lease_id) return 'ACTIVE_AEF_LEASE';
    if (resource.path && lease.worktree_path && pathWithin(resource.path, lease.worktree_path)) return 'ACTIVE_AEF_LEASE';
  }
  return null;
}
function processUseReason(resource) {
  if (!resource.path || !fs.existsSync(resource.path)) return null;
  const present = run('sh', ['-lc', 'command -v lsof >/dev/null 2>&1']);
  if (!present.ok) return 'PROCESS_PROBE_UNAVAILABLE';
  const probe = run('lsof', ['-t', '+D', resource.path], { timeout: 7000 });
  if (probe.status === 0 && probe.stdout) return 'ACTIVE_PROCESS_USE';
  if (probe.status === 1 && !probe.stdout) return null;
  return 'PROCESS_PROBE_FAILED';
}
function git(resourcePath, args) {
  return run('git', ['-C', resourcePath, ...args], { timeout: 30000 });
}
function gitClean(resourcePath) {
  const status = git(resourcePath, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (!status.ok) return { ok: false, reason: 'NOT_A_GIT_WORKTREE' };
  if (status.stdout) return { ok: false, reason: 'WORKTREE_DIRTY' };
  const stash = git(resourcePath, ['stash', 'list']);
  if (!stash.ok) return { ok: false, reason: 'STASH_CHECK_FAILED' };
  if (stash.stdout) return { ok: false, reason: 'STASH_PRESENT' };
  return { ok: true };
}
function originIsGitHub(resourcePath) {
  const r = git(resourcePath, ['remote', 'get-url', 'origin']);
  if (!r.ok || !r.stdout) return { ok: false, reason: 'ORIGIN_MISSING' };
  const url = r.stdout;
  const good = /(^git@github\.com:|^https:\/\/github\.com\/|^ssh:\/\/git@github\.com\/)/i.test(url);
  return good ? { ok: true, origin: url } : { ok: false, reason: 'ORIGIN_NOT_GITHUB', origin: url };
}
function remoteEquivalence(resourcePath) {
  const clean = gitClean(resourcePath);
  if (!clean.ok) return clean;
  const origin = originIsGitHub(resourcePath);
  if (!origin.ok) return origin;
  const fetch = git(resourcePath, ['fetch', '--prune', '--quiet', 'origin']);
  if (!fetch.ok) return { ok: false, reason: 'ORIGIN_FETCH_FAILED', detail: fetch.stderr };
  const worktrees = git(resourcePath, ['worktree', 'list', '--porcelain']);
  if (!worktrees.ok) return { ok: false, reason: 'WORKTREE_LIST_FAILED' };
  const worktreeCount = worktrees.stdout.split('\n').filter((line) => line.startsWith('worktree ')).length;
  if (worktreeCount > 1) return { ok: false, reason: 'ADDITIONAL_WORKTREES_PRESENT', worktree_count: worktreeCount };
  const refs = git(resourcePath, ['for-each-ref', '--format=%(refname)', 'refs/heads']);
  if (!refs.ok) return { ok: false, reason: 'LOCAL_BRANCH_ENUMERATION_FAILED' };
  for (const ref of refs.stdout.split('\n').map((x) => x.trim()).filter(Boolean)) {
    const branches = git(resourcePath, ['branch', '-r', '--contains', ref]);
    if (!branches.ok || !branches.stdout.split('\n').some((x) => x.trim().startsWith('origin/'))) {
      return { ok: false, reason: 'LOCAL_BRANCH_NOT_REACHABLE_FROM_ORIGIN', ref };
    }
  }
  return { ok: true, origin: origin.origin };
}
function worktreeEquivalence(resourcePath, resource) {
  const clean = gitClean(resourcePath);
  if (!clean.ok) return clean;
  if (resource.metadata?.integration_admitted !== true) return { ok: false, reason: 'INTEGRATION_NOT_ADMITTED' };
  return { ok: true };
}
function lifecycleReason(resource) {
  if (resource.state !== 'GC_ELIGIBLE') return 'NOT_GC_ELIGIBLE';
  if (resource.resource_class === 'DERIVED' && !(resource.evidence_refs || []).length) return 'DERIVED_EVIDENCE_MISSING';
  if (resource.type === 'ANDROID_BUILD_TREE' || resource.type === 'ANDROID_TEST_OUTPUT') {
    if (resource.metadata?.build_complete !== true) return 'ANDROID_BUILD_NOT_COMPLETE';
    if (resource.metadata?.test_evidence_sealed !== true) return 'ANDROID_TEST_EVIDENCE_NOT_SEALED';
  }
  if (resource.type === 'GIT_REPOSITORY') {
    if (resource.metadata?.delete_after_project_complete !== true) return 'PROJECT_REPO_DELETE_NOT_ENABLED';
    if (resource.metadata?.project_complete !== true && resource.metadata?.mission_complete !== true) return 'PROJECT_NOT_COMPLETE';
  }
  return null;
}
export function evaluateResource(resource, {
  root = DEFAULT_CONTROL_HOME,
  policy = loadPolicy(),
  host = hostIdentity(),
  processProbe = true,
} = {}) {
  const profile = policy.host_profiles?.[host] || policy.host_profiles?.['dial-hermes-control'];
  const reasons = [];
  if (!profile) reasons.push('HOST_PROFILE_MISSING');
  if (!profile?.allow_classes?.includes(resource.resource_class)) reasons.push('CLASS_NOT_ALLOWED_ON_HOST');
  if (['FOUNDATION', 'CANONICAL', 'PERSISTENT_OPERATIONAL'].includes(resource.resource_class)) reasons.push('PROTECTED_RESOURCE_CLASS');
  if ((profile?.protected_semantics || []).includes(resource.metadata?.semantic)) reasons.push('PROTECTED_HOST_SEMANTIC');
  const life = lifecycleReason(resource); if (life) reasons.push(life);
  const protectedReason = protectedPathReason(resource, policy); if (protectedReason) reasons.push(protectedReason);
  const leaseReason = activeLeaseReason(resource, root); if (leaseReason) reasons.push(leaseReason);
  if (processProbe) {
    const p = processUseReason(resource); if (p) reasons.push(p);
  }
  if (resource.path && !fs.existsSync(resource.path)) {
    return { safe: true, already_absent: true, reasons: [], host, profile: profile?.mode || null };
  }
  if (resource.type === 'GIT_REPOSITORY' && resource.path && reasons.length === 0) {
    const proof = remoteEquivalence(resource.path);
    if (!proof.ok) reasons.push(proof.reason);
  }
  if (resource.type === 'GIT_WORKTREE' && resource.path && reasons.length === 0) {
    const proof = worktreeEquivalence(resource.path, resource);
    if (!proof.ok) reasons.push(proof.reason);
  }
  return { safe: reasons.length === 0, already_absent: false, reasons: [...new Set(reasons)], host, profile: profile?.mode || null };
}
function bytesAt(target) {
  if (!target || !fs.existsSync(target)) return 0;
  try {
    const r = execFileSync('du', ['-sb', target], { encoding: 'utf8', timeout: 30000 });
    return Number(String(r).trim().split(/\s+/)[0] || 0);
  } catch { return 0; }
}
function deletePathResource(resource) {
  if (!resource.path) throw new Error('PATH_RESOURCE_REQUIRED');
  const before = bytesAt(resource.path);
  if (!fs.existsSync(resource.path)) return { before_bytes: 0, deleted_bytes: 0, already_absent: true };
  if (resource.type === 'GIT_WORKTREE') {
    const common = git(resource.path, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    const root = resource.metadata?.repository_root || null;
    fs.rmSync(resource.path, { recursive: true, force: true, maxRetries: 2 });
    if (root && fs.existsSync(root)) run('git', ['-C', root, 'worktree', 'prune', '--expire', 'now'], { timeout: 30000 });
    else if (common.ok) run('git', ['--git-dir', common.stdout, 'worktree', 'prune', '--expire', 'now'], { timeout: 30000 });
  } else {
    fs.rmSync(resource.path, { recursive: true, force: true, maxRetries: 2 });
  }
  return { before_bytes: before, deleted_bytes: before, already_absent: false };
}
function receiptId(resource) {
  return 'gc_' + crypto.createHash('sha256').update(resource.resource_id + '|' + now()).digest('hex').slice(0, 24);
}
export function collectResource(resourceId, {
  root = DEFAULT_CONTROL_HOME,
  dryRun = false,
  processProbe = true,
} = {}) {
  ensureControlLayout(root);
  const resource = getResource(resourceId, root);
  if (!resource) throw new Error('resource not found');
  const evaluation = evaluateResource(resource, { root, processProbe });
  const base = {
    schema_version: 1,
    receipt_id: receiptId(resource),
    resource_id: resource.resource_id,
    host: hostIdentity(),
    type: resource.type,
    resource_class: resource.resource_class,
    path: resource.path || null,
    evaluated_at: now(),
    safe: evaluation.safe,
    reasons: evaluation.reasons,
    dry_run: Boolean(dryRun),
  };
  if (!evaluation.safe) {
    appendJsonl('housekeeping/receipts.jsonl', { ...base, result: 'RETAINED' }, root);
    return { ...base, result: 'RETAINED' };
  }
  if (dryRun) {
    appendJsonl('housekeeping/receipts.jsonl', { ...base, result: 'WOULD_DELETE' }, root);
    return { ...base, result: 'WOULD_DELETE' };
  }
  try {
    const deletion = resource.path ? deletePathResource(resource) : { deleted_bytes: 0, already_absent: true };
    const receipt = { ...base, result: 'DELETED', ...deletion, deleted_at: now() };
    writeJsonAtomic(`housekeeping/receipts/${base.receipt_id}.json`, receipt, root);
    appendJsonl('housekeeping/receipts.jsonl', receipt, root);
    markResourceDeleted({ root, resourceId, receipt });
    return receipt;
  } catch (error) {
    const reason = String(error?.message || error).slice(0, 1000);
    markResourceQuarantined({ root, resourceId, reason: 'GC_EXECUTION_FAILED:' + reason });
    const receipt = { ...base, result: 'QUARANTINED', error: reason };
    appendJsonl('housekeeping/receipts.jsonl', receipt, root);
    return receipt;
  }
}
export function sweep({
  root = DEFAULT_CONTROL_HOME,
  dryRun = false,
  limit = 200,
  processProbe = true,
} = {}) {
  ensureControlLayout(root);
  const resources = listResources({ root, states: 'GC_ELIGIBLE' }).slice(0, Math.max(1, Math.min(1000, Number(limit) || 200)));
  const before = fs.statfsSync ? fs.statfsSync(root) : null;
  const receipts = resources.map((r) => collectResource(r.resource_id, { root, dryRun, processProbe }));
  const summary = {
    schema_version: 1,
    host: hostIdentity(),
    ran_at: now(),
    dry_run: Boolean(dryRun),
    candidates: resources.length,
    deleted: receipts.filter((x) => x.result === 'DELETED').length,
    retained: receipts.filter((x) => x.result === 'RETAINED').length,
    quarantined: receipts.filter((x) => x.result === 'QUARANTINED').length,
    deleted_bytes: receipts.reduce((n, x) => n + Number(x.deleted_bytes || 0), 0),
    fs_before: before ? { blocks: Number(before.blocks), bfree: Number(before.bfree), bsize: Number(before.bsize) } : null,
  };
  writeJsonAtomic('housekeeping/last-sweep.json', summary, root);
  appendJsonl('events/housekeeping.jsonl', { event: 'HOUSEKEEPING_SWEEP_COMPLETED', ...summary }, root);
  try { fs.rmSync(resolveControlPath('housekeeping/trigger', root), { force: true }); } catch {}
  return { ...summary, receipts };
}
function main() {
  const command = process.argv[2] || 'sweep';
  const dryRun = process.argv.includes('--dry-run');
  if (command === 'sweep') return console.log(JSON.stringify(sweep({ dryRun }), null, 2));
  if (command === 'evaluate') {
    const id = process.argv[3]; if (!id) throw new Error('resource id required');
    const resource = getResource(id); if (!resource) throw new Error('resource not found');
    return console.log(JSON.stringify(evaluateResource(resource), null, 2));
  }
  if (command === 'collect') {
    const id = process.argv[3]; if (!id) throw new Error('resource id required');
    return console.log(JSON.stringify(collectResource(id, { dryRun }), null, 2));
  }
  if (command === 'trigger') {
    return console.log(requestHousekeepingSweep(DEFAULT_CONTROL_HOME, process.argv.slice(3).join(' ') || 'CLI_TRIGGER'));
  }
  if (command === 'status') {
    return console.log(JSON.stringify({
      host: hostIdentity(),
      policy_id: loadPolicy().policy_id,
      last_sweep: readJson('housekeeping/last-sweep.json', null),
      eligible: listResources({ states: 'GC_ELIGIBLE' }).length,
      quarantined: listResources({ states: 'QUARANTINED' }).length,
    }, null, 2));
  }
  throw new Error('unknown housekeeping command');
}
if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
