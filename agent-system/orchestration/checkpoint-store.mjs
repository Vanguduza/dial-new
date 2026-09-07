import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { archiveJson, readJson, writeJsonAtomic } from './state-store.mjs';

function git(repoDir, args) {
  try {
    return execFileSync('git', args, {
      cwd: repoDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

export function captureGitState(repoDir) {
  const status = git(repoDir, ['status', '--porcelain=v1']);
  return {
    repo_dir: path.resolve(repoDir),
    commit: git(repoDir, ['rev-parse', 'HEAD']) || null,
    branch: git(repoDir, ['branch', '--show-current']) || null,
    dirty: Boolean(status),
    dirty_paths: status
      ? status.split('\n').filter(Boolean).map((line) => line.slice(3).trim()).filter(Boolean)
      : [],
    observed_at: new Date().toISOString(),
  };
}

export function loadRepoActiveWork(repoDir) {
  const target = path.join(repoDir, 'agent-system/registries/ACTIVE_WORK.json');
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    return { feature_id: null, worktree: null, target_gate: null };
  }
}

export function featureExists(repoDir, featureId) {
  if (!featureId) return false;
  const target = path.join(repoDir, 'agent-system/registries/FEATURE_REGISTRY.json');
  try {
    const raw = fs.readFileSync(target, 'utf8');
    const parsed = JSON.parse(raw);
    const stack = Array.isArray(parsed) ? parsed : Object.values(parsed ?? {});
    return JSON.stringify(stack).includes(`"${featureId}"`);
  } catch {
    return false;
  }
}

export function buildCheckpoint(repoDir, overrides = {}) {
  const repoActive = loadRepoActiveWork(repoDir);
  const featureId = overrides.feature_id ?? repoActive.feature_id ?? null;
  if (featureId && !featureExists(repoDir, featureId)) {
    throw new Error(`unknown Feature ID: ${featureId}`);
  }

  const gitState = captureGitState(overrides.worktree || repoActive.worktree || repoDir);
  return {
    schema_version: 4,
    feature_id: featureId,
    worktree: overrides.worktree ?? repoActive.worktree ?? gitState.repo_dir,
    target_gate: overrides.target_gate ?? repoActive.target_gate ?? null,
    runtime_provenance: overrides.runtime_provenance ?? null,
    skill_activation: overrides.skill_activation ?? null,
    execution: {
      phase: overrides.phase ?? null,
      atomic_unit: overrides.atomic_unit ?? null,
      last_completed_unit: overrides.last_completed_unit ?? null,
      next_unit: overrides.next_unit ?? null,
    },
    repository: gitState,
    gates: {
      last_green: overrides.last_green ?? null,
      next: overrides.target_gate ?? repoActive.target_gate ?? null,
    },
    handoff: overrides.handoff ?? null,
    updated_at: new Date().toISOString(),
  };
}

function activeName(featureId) {
  return featureId ? `${featureId}.json` : 'unscoped.json';
}

export function saveCheckpoint(checkpoint, root) {
  const name = activeName(checkpoint.feature_id);
  const activeRel = `checkpoints/active/${name}`;
  archiveJson(activeRel, `checkpoints/archive/${checkpoint.feature_id || 'unscoped'}`, root);
  writeJsonAtomic(activeRel, checkpoint, root);
  writeJsonAtomic(`memory/hot/${name}`, {
    ...checkpoint,
    authority: 'NON_AUTHORITATIVE_CONTEXT',
    source_checkpoint: activeRel,
  }, root);
  writeJsonAtomic('state/active-checkpoint.json', {
    feature_id: checkpoint.feature_id,
    path: activeRel,
    updated_at: checkpoint.updated_at,
  }, root);
  return checkpoint;
}

export function loadCheckpoint(featureId = null, root) {
  if (featureId) return readJson(`checkpoints/active/${activeName(featureId)}`, null, root);
  const pointer = readJson('state/active-checkpoint.json', null, root);
  return pointer?.path ? readJson(pointer.path, null, root) : null;
}
