import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  registerAndroidBuildCompletion,
  registerResource,
  markResourceGcEligible,
  markTaskResourcesAdmitted,
  getResource,
} from '../agent-system/orchestration/resource-lifecycle-registry.mjs';
import { collectResource, evaluateResource } from '../agent-system/orchestration/housekeeping-gc.mjs';
import { issueWorktreeLease, closeWorktreeLease } from '../agent-system/orchestration/worker-lease-manager.mjs';
import { registerProject, markProjectComplete } from '../agent-system/orchestration/project-registry.mjs';

function tmp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function git(dir, ...args) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim(); }
function initRepo(dir) {
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'housekeeping@example.invalid');
  git(dir, 'config', 'user.name', 'Housekeeping Test');
  fs.writeFileSync(path.join(dir, 'README.md'), 'seed\n');
  git(dir, 'add', 'README.md');
  git(dir, 'commit', '-qm', 'seed');
}

describe('Hermes state-aware housekeeping', () => {
  const roots = [];
  beforeEach(() => { process.env.DIAL_HOUSEKEEPING_HOST = 'dial-control'; });
  afterEach(() => {
    delete process.env.DIAL_HOUSEKEEPING_HOST;
    while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true });
  });

  it('never makes FOUNDATION resources automatically GC eligible', () => {
    const root = tmp('dial-hk-state-'); roots.push(root);
    const target = tmp('dial-hk-foundation-'); roots.push(target);
    const resource = registerResource({
      root,
      project: 'van',
      type: 'ANDROID_SDK',
      path: target,
      resourceClass: 'FOUNDATION',
      reconstructability: 'PINNED_INSTALLER',
      retentionTrigger: 'NEVER',
    });
    expect(() => markResourceGcEligible({ root, resourceId: resource.resource_id, reason: 'test' }))
      .toThrow(/protected resource class/i);
    expect(fs.existsSync(target)).toBe(true);
  });

  it('deletes an Android build tree immediately after build/test evidence is sealed', () => {
    const root = tmp('dial-hk-state-'); roots.push(root);
    const build = tmp('dial-hk-android-'); roots.push(build);
    fs.writeFileSync(path.join(build, 'classes.dex'), 'derived');
    const resource = registerAndroidBuildCompletion({
      root,
      project: 'van',
      taskId: 'VAN-ANDROID-1',
      buildPath: build,
      evidenceRef: 'test-receipt:abc',
      artifactRef: 'apk:sha256:def',
    });
    expect(resource.state).toBe('GC_ELIGIBLE');
    const receipt = collectResource(resource.resource_id, { root, processProbe: false });
    expect(receipt.result).toBe('DELETED');
    expect(fs.existsSync(build)).toBe(false);
    roots.splice(roots.indexOf(build), 1);
  });

  it('blocks linked-worktree deletion while an AEF lease is active and allows it after admission plus release', () => {
    const root = tmp('dial-hk-state-'); roots.push(root);
    const parent = tmp('dial-hk-worktree-parent-'); roots.push(parent);
    const repo = path.join(parent, 'main');
    const worktree = path.join(parent, 'worker');
    fs.mkdirSync(repo);
    initRepo(repo);
    git(repo, 'worktree', 'add', '-q', '-b', 'worker-branch', worktree);
    const lease = issueWorktreeLease({
      root,
      repositoryId: 'van',
      taskId: 'task-1',
      workerId: 'worker-1',
      worktreePath: worktree,
      baseCommit: git(repo, 'rev-parse', 'HEAD'),
      writePaths: ['src/**'],
    }).lease;
    markTaskResourcesAdmitted({
      root,
      taskId: 'task-1',
      evidenceRefs: ['execution-receipt:1'],
      integration: { receipt_hash: '1' },
    });
    const resource = Object.values(JSON.parse(fs.readFileSync(path.join(root, 'housekeeping/resources.json'), 'utf8')).resources)
      .find((r) => r.lease_id === lease.lease_id);
    expect(resource.type).toBe('GIT_WORKTREE');
    expect(resource.state).toBe('GC_ELIGIBLE');
    expect(evaluateResource(resource, { root, processProbe: false }).reasons).toContain('ACTIVE_AEF_LEASE');

    closeWorktreeLease({ root, leaseId: lease.lease_id, state: 'RELEASED', reason: 'INTEGRATION_ADMITTED' });
    const after = getResource(resource.resource_id, root);
    const decision = evaluateResource(after, { root, processProbe: false });
    expect(decision.safe).toBe(true);
  });

  it('classifies a primary checkout leased by AEF as persistent operational state', () => {
    const root = tmp('dial-hk-state-'); roots.push(root);
    const repo = tmp('dial-hk-primary-'); roots.push(repo);
    initRepo(repo);
    const lease = issueWorktreeLease({
      root,
      repositoryId: 'van',
      taskId: 'task-primary',
      workerId: 'worker-1',
      worktreePath: repo,
      baseCommit: git(repo, 'rev-parse', 'HEAD'),
      writePaths: ['src/**'],
    }).lease;
    markTaskResourcesAdmitted({
      root,
      taskId: 'task-primary',
      evidenceRefs: ['execution-receipt:primary'],
      integration: { receipt_hash: 'primary' },
    });
    const resource = Object.values(JSON.parse(fs.readFileSync(path.join(root, 'housekeeping/resources.json'), 'utf8')).resources)
      .find((r) => r.lease_id === lease.lease_id);
    expect(resource.type).toBe('GIT_PRIMARY_CHECKOUT');
    expect(resource.resource_class).toBe('PERSISTENT_OPERATIONAL');
    expect(resource.state).toBe('ACTIVE');
    expect(evaluateResource(resource, { root, processProbe: false }).safe).toBe(false);
  });

  it('marks an opted-in completed project clone eligible but refuses deletion until GitHub equivalence is proven', () => {
    const root = tmp('dial-hk-state-'); roots.push(root);
    const repo = tmp('dial-hk-project-'); roots.push(repo);
    initRepo(repo);
    git(repo, 'remote', 'add', 'origin', 'https://github.com/example/example.git');

    registerProject({
      slug: 'sample',
      name: 'Sample',
      repoDir: repo,
      deleteLocalRepoWhenComplete: true,
    }, root);
    markProjectComplete({ slug: 'sample', evidenceRefs: ['project-truth:complete'] }, root);

    const resource = Object.values(JSON.parse(fs.readFileSync(path.join(root, 'housekeeping/resources.json'), 'utf8')).resources)
      .find((r) => r.project === 'sample' && r.type === 'GIT_REPOSITORY');
    expect(resource.state).toBe('GC_ELIGIBLE');

    fs.writeFileSync(path.join(repo, 'untracked.txt'), 'do not lose me');
    const decision = evaluateResource(resource, { root, processProbe: false });
    expect(decision.safe).toBe(false);
    expect(decision.reasons).toContain('WORKTREE_DIRTY');
    expect(fs.existsSync(repo)).toBe(true);
  });

  it('ships event-triggered cleanup with a timer only as reconciliation fallback', () => {
    const rootDir = path.resolve(import.meta.dirname, '..');
    const policy = JSON.parse(fs.readFileSync(path.join(rootDir, 'agent-system/registries/HOUSEKEEPING_POLICY.json'), 'utf8'));
    expect(policy.principle).toBe('DELETE_BY_LIFECYCLE_STATE_NOT_BY_AGE');
    expect(policy.reconciliation.event_driven_primary).toBe(true);
    expect(policy.reconciliation.fallback_timer_minutes).toBe(30);

    const pathUnit = fs.readFileSync(path.join(rootDir, 'deploy/oracle/hermes-codex/systemd/dial-housekeeping.path'), 'utf8');
    const timerUnit = fs.readFileSync(path.join(rootDir, 'deploy/oracle/hermes-codex/systemd/dial-housekeeping.timer'), 'utf8');
    expect(pathUnit).toContain('PathExists=@@TRIGGER_PATH@@');
    expect(timerUnit).toContain('OnUnitActiveSec=30min');
  });
});
