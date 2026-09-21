import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  admitMemoryCandidate,
  searchSharedMemory,
  sharedMemoryCursor,
  writeMemoryCandidate,
} from '../agent-system/orchestration/shared-project-memory.mjs';
import {
  buildContextCacheIdentity,
  composeContextDelta,
  putCachedContext,
  readContextCacheStats,
} from '../agent-system/orchestration/project-context-cache.mjs';
import {
  buildRepositoryUnderstandingDelta,
  buildRepositoryUnderstandingSnapshot,
} from '../agent-system/orchestration/repository-understanding-snapshot.mjs';
import {
  claimReviewJob,
  publishReviewCheckpoint,
  reviewCheckpointStatus,
  submitReviewReceipt,
} from '../agent-system/orchestration/review-fabric.mjs';

function tempRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function makeRepo() {
  const repo = tempRoot('spmrf-repo-');
  fs.mkdirSync(path.join(repo, 'agent-system/registries'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'agent-system/registries/SHARED_PROJECT_MEMORY_FABRIC.json'), JSON.stringify({
    review_policy: {
      critical_domains: ['SECURITY', 'TRADING'],
      routine_min_independent_reviews: 1,
      material_min_independent_reviews: 2,
      critical_requires_provider_diversity: true,
    },
    harnesses: [
      { harness_id: 'chatgpt-hermes', provider_family: 'openai', roles: ['AUTHOR', 'REVIEWER'], enabled: true },
      { harness_id: 'chatgpt-trading', provider_family: 'openai', roles: ['AUTHOR', 'REVIEWER'], enabled: true },
      { harness_id: 'claude-hermes', provider_family: 'anthropic', roles: ['AUTHOR', 'REVIEWER'], enabled: true },
    ],
  }, null, 2));
  fs.writeFileSync(path.join(repo, 'agent-system/registries/FEATURE_REGISTRY.json'), '[]\n');
  fs.writeFileSync(path.join(repo, 'agent-system/registries/DECISION_LOG.json'), '{}\n');
  fs.writeFileSync(path.join(repo, 'agent-system/registries/DEVELOPMENT_UNIT_REGISTRY.json'), '{"units":[]}\n');
  fs.writeFileSync(path.join(repo, 'agent-system/registries/ACTIVE_WORK.json'), '{"feature_id":null}\n');
  fs.writeFileSync(path.join(repo, 'README.md'), 'one\n');
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.name', 'SPMRF Test']);
  git(repo, ['config', 'user.email', 'spmrf@example.invalid']);
  git(repo, ['add', '.']);
  git(repo, ['commit', '-qm', 'initial']);
  return repo;
}

describe('shared project memory fabric', () => {
  it('keeps harness memory non-authoritative and admits only through explicit reconciliation', () => {
    const root = tempRoot('spmrf-memory-');
    try {
      const candidate = writeMemoryCandidate({
        project: 'van',
        tier: 'HOT',
        type: 'IMPLEMENTATION_NOTE',
        text: 'Trading review checkpoint is waiting for an independent reviewer.',
        sourceHarness: 'chatgpt-trading',
        repositorySha: 'a'.repeat(40),
      }, root);
      expect(candidate.admission_state).toBe('CANDIDATE');
      expect(searchSharedMemory({ project: 'van', query: 'Trading review' }, root).results).toHaveLength(0);

      const admitted = admitMemoryCandidate({
        project: 'van',
        candidateRel: candidate.object_rel,
        admissionAuthority: 'HERMES_RECONCILED',
        evidenceRefs: ['git:a'.concat('a'.repeat(39))],
        reconciliation: 'Checked against current Git evidence.',
      }, root);
      expect(admitted.project_authority).toBe('NON_AUTHORITATIVE_CONTEXT');
      const found = searchSharedMemory({ project: 'van', query: 'Trading review' }, root);
      expect(found.results[0].record.text).toContain('independent reviewer');
      expect(sharedMemoryCursor('van', root).sequence).toBe(2);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects secret-bearing shared memory', () => {
    const root = tempRoot('spmrf-secret-');
    try {
      expect(() => writeMemoryCandidate({
        project: 'dial',
        text: 'api_key="1234567890-secret-value"',
        sourceHarness: 'chatgpt-hermes',
      }, root)).toThrow();
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('reuses stable context and delivers changed sections as a token-saving delta', () => {
    const root = tempRoot('spmrf-cache-');
    try {
      const firstIdentity = buildContextCacheIdentity({
        project: 'dial',
        featureId: 'DIAL-TEST',
        projectTruthHash: 'truth-1',
        repositorySha: 'a'.repeat(40),
        graphRevisionHash: 'graph-1',
        memoryCursor: 1,
        contextProfile: 'IMPLEMENTATION',
        repositoryUnderstandingHash: 'understanding-1',
      });
      const first = putCachedContext({
        identity: firstIdentity,
        sections: { canon: 'A'.repeat(12000), task: 'first', stable: 'B'.repeat(12000) },
        rendered: 'A'.repeat(12000) + 'first' + 'B'.repeat(12000),
      }, root);

      const secondIdentity = buildContextCacheIdentity({
        project: 'dial',
        featureId: 'DIAL-TEST',
        projectTruthHash: 'truth-1',
        repositorySha: 'b'.repeat(40),
        graphRevisionHash: 'graph-1',
        memoryCursor: 2,
        contextProfile: 'IMPLEMENTATION',
        repositoryUnderstandingHash: 'understanding-2',
      });
      const second = putCachedContext({
        identity: secondIdentity,
        sections: { canon: 'A'.repeat(12000), task: 'second', stable: 'B'.repeat(12000) },
        rendered: 'A'.repeat(12000) + 'second' + 'B'.repeat(12000),
      }, root);
      const delta = composeContextDelta({ current: second, previous: first }, root);
      expect(delta.mode).toBe('DELTA');
      expect(Object.keys(delta.changed_sections)).toEqual(['task']);
      expect(delta.estimated_tokens_saved).toBeGreaterThan(1000);
      expect(readContextCacheStats('dial', root).delta_deliveries).toBe(1);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('turns repository changes into snapshot-plus-delta instead of full rediscovery', () => {
    const repo = makeRepo();
    const root = tempRoot('spmrf-understanding-');
    try {
      const first = buildRepositoryUnderstandingSnapshot({ project: 'dial', repoDir: repo, root });
      fs.writeFileSync(path.join(repo, 'README.md'), 'one\ntwo\n');
      fs.writeFileSync(path.join(repo, 'new.mjs'), 'export function added(){ return 2; }\n');
      git(repo, ['add', '.']);
      git(repo, ['commit', '-qm', 'change']);
      const second = buildRepositoryUnderstandingSnapshot({ project: 'dial', repoDir: repo, root });
      const delta = buildRepositoryUnderstandingDelta({ project: 'dial', repoDir: repo, root, fromSnapshot: first, toSnapshot: second });
      expect(delta.mode).toMatch(/^DELTA/);
      expect(delta.changed_files).toEqual(expect.arrayContaining(['README.md', 'new.mjs']));
      expect(delta.validity.prior_understanding).toBe('REUSABLE_WITH_DELTA');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('publishes immutable checkpoints to every eligible reviewer except the author and records structured receipts', () => {
    const repo = makeRepo();
    const root = tempRoot('spmrf-review-');
    try {
      const published = publishReviewCheckpoint({
        project: 'dial',
        repoDir: repo,
        root,
        authorHarness: 'chatgpt-hermes',
        summary: 'Initial implementation checkpoint',
        claims: ['README remains coherent'],
      });
      expect(published.published).toBe(true);
      expect(published.jobs.map((j) => j.reviewer_harness).sort()).toEqual(['chatgpt-trading', 'claude-hermes']);
      const job = published.jobs.find((j) => j.reviewer_harness === 'claude-hermes');
      claimReviewJob({ reviewJobId: job.review_job_id, reviewerHarness: 'claude-hermes' }, root);
      submitReviewReceipt({
        reviewJobId: job.review_job_id,
        reviewerHarness: 'claude-hermes',
        verdict: 'PASS',
        summary: 'No blocking gap found.',
        findings: [],
        reviewedRepositorySha: published.checkpoint.repository_sha,
        modelProvenance: { provider_family: 'anthropic', resolved_model: 'claude-sonnet-5' },
      }, root);
      const status = reviewCheckpointStatus(published.checkpoint.checkpoint_id, root);
      expect(status.quorum_met).toBe(true);
      expect(status.state).toBe('REVIEWED');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses dirty worktrees as immutable review checkpoints', () => {
    const repo = makeRepo();
    const root = tempRoot('spmrf-dirty-');
    try {
      fs.appendFileSync(path.join(repo, 'README.md'), 'dirty\n');
      const result = publishReviewCheckpoint({
        project: 'dial',
        repoDir: repo,
        root,
        authorHarness: 'chatgpt-hermes',
      });
      expect(result).toMatchObject({ published: false, reason: 'DIRTY_REPOSITORY_NOT_IMMUTABLE' });
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
