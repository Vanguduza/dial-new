import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCheckpoint, captureGitState } from '../agent-system/orchestration/checkpoint-store.mjs';
import { appendFeatureMemory } from '../agent-system/orchestration/feature-memory.mjs';
import { buildHandoffCapsule } from '../agent-system/orchestration/handoff-builder.mjs';
import { issueManagerLease, recordRuntimeHealth, selectManager } from '../agent-system/orchestration/manager-router.mjs';
import { managerEligible } from '../agent-system/orchestration/runtime-health.mjs';
import { ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from '../agent-system/orchestration/state-store.mjs';
import { resolveFeatureId } from '../agent-system/orchestration/context-broker.mjs';

function temp(name) {
  return mkdtempSync(path.join(tmpdir(), `${name}-`));
}

function makeRepo() {
  const repo = temp('dial-orchestration-repo');
  mkdirSync(path.join(repo, 'agent-system/registries'), { recursive: true });
  mkdirSync(path.join(repo, 'agent-system/bin'), { recursive: true });
  writeFileSync(path.join(repo, 'agent-system/registries/FEATURE_REGISTRY.json'), JSON.stringify([{ feature_id: 'GROC-F025' }]));
  writeFileSync(path.join(repo, 'agent-system/registries/ACTIVE_WORK.json'), JSON.stringify({ feature_id: 'GROC-F025', worktree: null, target_gate: 'DOMAIN_TESTED' }));
  writeFileSync(path.join(repo, 'package.json'), '{}');
  execFileSync('git', ['init'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'ci@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'CI'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repo });
  return repo;
}

describe('orchestration state store', () => {
  it('creates the persistent memory layout and writes private JSON atomically', () => {
    const root = temp('dial-control');
    ensureControlLayout(root);
    const target = writeJsonAtomic('state/test.json', { ok: true }, root);
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual({ ok: true });
    expect(readJson('state/test.json', null, root)).toEqual({ ok: true });
  });

  it('refuses path traversal outside the control root', () => {
    const root = temp('dial-control');
    expect(() => resolveControlPath('../escape.json', root)).toThrow(/escapes control root/);
  });
});

describe('manager health and lease routing', () => {
  it('requires HEALTHY state, fresh evidence and requested/resolved model identity for a hard-pinned manager', () => {
    const observedAt = new Date().toISOString();
    expect(managerEligible({ state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at: observedAt })).toBe(true);
    expect(managerEligible({ state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-luna', observed_at: observedAt })).toBe(false);
    expect(managerEligible({ state: 'MODEL_LIMITED', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol', observed_at: observedAt })).toBe(false);
    expect(managerEligible({ state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol' })).toBe(false);
  });

  it('rejects stale HEALTHY evidence for a new manager election', () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    expect(managerEligible({
      state: 'HEALTHY',
      requested_model: 'gpt-5.6-sol',
      resolved_model: 'gpt-5.6-sol',
      observed_at: stale,
    })).toBe(false);
  });

  it('elects Codex first and falls back to Claude only when Codex is ineligible', () => {
    const root = temp('dial-control');
    recordRuntimeHealth('codex_app_server', { state: 'HEALTHY', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol' }, root);
    recordRuntimeHealth('claude_code', { state: 'HEALTHY', requested_model: 'claude-sonnet-5', resolved_model: 'claude-sonnet-5' }, root);
    let selected = selectManager(readJson('state/model-availability.json', null, root));
    expect(selected?.runtime).toBe('codex_app_server');

    recordRuntimeHealth('codex_app_server', { state: 'ACCOUNT_LIMITED', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol' }, root);
    selected = selectManager(readJson('state/model-availability.json', null, root));
    expect(selected?.runtime).toBe('claude_code');

    const lease = issueManagerLease({ candidate: selected, feature_id: 'GROC-F025', worktree: '/srv/dial', atomic_unit: 'projection' }, root);
    expect(lease.runtime).toBe('claude_code');
    expect(lease.status).toBe('ACTIVE');
  });
});

describe('checkpoint and handoff continuity', () => {
  it('captures real Git state and refuses an unknown Feature ID', () => {
    const repo = makeRepo();
    const checkpoint = buildCheckpoint(repo);
    expect(checkpoint.feature_id).toBe('GROC-F025');
    expect(checkpoint.repository.dirty).toBe(false);
    expect(checkpoint.repository.commit).toMatch(/^[0-9a-f]{40}$/);
    writeFileSync(path.join(repo, 'dirty.txt'), 'x');
    expect(captureGitState(repo).dirty).toBe(true);
    expect(() => buildCheckpoint(repo, { feature_id: 'GROC-F999' })).toThrow(/unknown Feature ID/);
  });

  it('builds a bounded, explicitly non-authoritative handoff capsule', () => {
    const repo = makeRepo();
    const checkpoint = buildCheckpoint(repo, { atomic_unit: 'projection-tests' });
    const capsule = buildHandoffCapsule(checkpoint, {
      objective: 'Finish Round voting projection',
      completed: ['contract', 'state-machine'],
      next_action: 'Run integration tests',
    });
    expect(capsule.feature_id).toBe('GROC-F025');
    expect(capsule.active_unit).toBe('projection-tests');
    expect(capsule.authority_warning).toMatch(/Verify it against DIAL canon/);
  });

  it('rejects secret material before it can enter Feature memory or a handoff capsule', () => {
    const root = temp('dial-control');
    expect(() => appendFeatureMemory('GROC-F025', {
      text: 'safe note',
      refs: ['access_token=super-secret-token-value'],
    }, root)).toThrow(/possible secret material/);

    const repo = makeRepo();
    const checkpoint = buildCheckpoint(repo);
    expect(() => buildHandoffCapsule(checkpoint, {
      objective: '-----BEGIN PRIVATE KEY----- do not persist',
    })).toThrow(/possible secret material/);
  });
});

describe('feature resolution', () => {
  it('prefers an explicit Feature ID in the incoming turn', () => {
    const repo = makeRepo();
    expect(resolveFeatureId({ userMessage: 'continue GROC-F025 please', repoDir: repo })).toBe('GROC-F025');
  });
});
