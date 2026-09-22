import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_CONTROL_HOME, readJson, writeJsonAtomic } from './state-store.mjs';
import { captureGitState } from './checkpoint-store.mjs';
import { hashObject, projectTruthHash, writeContentAddressedJson } from './knowledge-graph-core.mjs';
import { buildImpactEnvelope, loadCurrentStructuralSnapshot } from './structural-reality.mjs';

function now() { return new Date().toISOString(); }
function projectSlug(project) {
  const value = String(project || 'dial').toLowerCase().replace(/[^a-z0-9._:-]+/g, '-');
  if (!/^[a-z0-9][a-z0-9._:-]{0,220}$/.test(value)) throw new Error(`invalid project: ${project}`);
  return value;
}
function git(repoDir, args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 }).trim();
  } catch {
    return fallback;
  }
}
function currentGraph(root) {
  const graph = readJson('knowledge/graph/current.json', null, root);
  const structural = readJson('knowledge/structural/current.json', null, root);
  return {
    graph_generation_id: graph?.graph_generation_id ?? null,
    graph_revision_hash: graph?.graph_revision_hash ?? null,
    structural_snapshot_hash: structural?.snapshot_hash ?? null,
    structural_graph_hash: structural?.normalized_graph_hash ?? null,
    structural_repo_sha: structural?.repo_sha ?? null,
  };
}
function registryFingerprint(repoDir) {
  const rels = [
    'agent-system/registries/FEATURE_REGISTRY.json',
    'agent-system/registries/DECISION_LOG.json',
    'agent-system/registries/DEVELOPMENT_UNIT_REGISTRY.json',
    'agent-system/registries/ACTIVE_WORK.json',
  ];
  const rows = [];
  for (const rel of rels) {
    const file = path.join(repoDir, rel);
    if (!fs.existsSync(file)) continue;
    rows.push([rel, hashObject(fs.readFileSync(file, 'utf8'))]);
  }
  return hashObject(rows);
}

export function buildRepositoryUnderstandingSnapshot({
  project = 'dial',
  repoDir,
  root = DEFAULT_CONTROL_HOME,
  featureId = null,
} = {}) {
  if (!repoDir) throw new Error('repoDir is required');
  const repository = captureGitState(repoDir);
  const graph = currentGraph(root);
  const body = {
    schema_version: 1,
    project: projectSlug(project),
    feature_id: featureId ?? null,
    repository_sha: repository.commit,
    branch: repository.branch,
    dirty: repository.dirty,
    dirty_paths: repository.dirty_paths,
    project_truth_hash: projectTruthHash(repoDir),
    registry_fingerprint: registryFingerprint(repoDir),
    graph_generation_id: graph.graph_generation_id,
    graph_revision_hash: graph.graph_revision_hash,
    structural_snapshot_hash: graph.structural_snapshot_hash,
    structural_graph_hash: graph.structural_graph_hash,
    structural_repo_sha: graph.structural_repo_sha,
    created_at: now(),
  };
  const identity = { ...body, created_at: null };
  const understandingHash = hashObject(identity);
  const record = { ...body, understanding_hash: understandingHash };
  const stored = writeContentAddressedJson(`repository-understanding/snapshots/${projectSlug(project)}`, record, {
    root,
    prefix: 'repo-understanding',
  });
  writeJsonAtomic(`repository-understanding/${projectSlug(project)}-current.json`, {
    schema_version: 1,
    project: projectSlug(project),
    understanding_hash: understandingHash,
    object_rel: stored.rel,
    repository_sha: repository.commit,
    project_truth_hash: body.project_truth_hash,
    graph_revision_hash: body.graph_revision_hash,
    updated_at: body.created_at,
  }, root);
  return { ...record, object_rel: stored.rel, object_hash: stored.hash };
}

export function loadRepositoryUnderstandingSnapshot(project = 'dial', root = DEFAULT_CONTROL_HOME) {
  const pointer = readJson(`repository-understanding/${projectSlug(project)}-current.json`, null, root);
  return pointer?.object_rel ? readJson(pointer.object_rel, null, root) : null;
}

function changedFiles(repoDir, fromSha, toSha) {
  if (!fromSha || !toSha || fromSha === toSha) return [];
  const out = git(repoDir, ['diff', '--name-only', '--diff-filter=ACDMRTUXB', `${fromSha}..${toSha}`], '');
  return out ? out.split('\n').map((x) => x.trim()).filter(Boolean) : [];
}
function changedStats(repoDir, fromSha, toSha) {
  if (!fromSha || !toSha || fromSha === toSha) return [];
  const out = git(repoDir, ['diff', '--numstat', `${fromSha}..${toSha}`], '');
  return out ? out.split('\n').filter(Boolean).map((line) => {
    const [added, deleted, ...fileParts] = line.split('\t');
    return { path: fileParts.join('\t'), added: added === '-' ? null : Number(added), deleted: deleted === '-' ? null : Number(deleted) };
  }) : [];
}
function isAncestor(repoDir, fromSha, toSha) {
  if (!fromSha || !toSha) return false;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', fromSha, toSha], { cwd: repoDir, stdio: 'ignore' });
    return true;
  } catch { return false; }
}

export function buildRepositoryUnderstandingDelta({
  project = 'dial',
  repoDir,
  root = DEFAULT_CONTROL_HOME,
  fromSnapshot,
  toSnapshot = null,
} = {}) {
  if (!repoDir || !fromSnapshot) throw new Error('repoDir and fromSnapshot are required');
  const current = toSnapshot || buildRepositoryUnderstandingSnapshot({ project, repoDir, root, featureId: fromSnapshot.feature_id });
  const files = changedFiles(repoDir, fromSnapshot.repository_sha, current.repository_sha);
  const structural = loadCurrentStructuralSnapshot(root);
  const impact = buildImpactEnvelope({ snapshot: structural, changedPaths: files });
  const changedNodeSet = new Set(
    (structural?.nodes || [])
      .filter((node) => files.includes(node.source_path))
      .map((node) => node.node_ref),
  );
  const changedSymbols = (structural?.nodes || [])
    .filter((node) => changedNodeSet.has(node.node_ref))
    .map((node) => ({
      node_ref: node.node_ref,
      qualified_name: node.qualified_name,
      source_path: node.source_path,
      symbol_kind: node.symbol_kind,
    }))
    .slice(0, 300);

  const authorityChanged = fromSnapshot.project_truth_hash !== current.project_truth_hash
    || fromSnapshot.registry_fingerprint !== current.registry_fingerprint;
  const graphChanged = fromSnapshot.graph_revision_hash !== current.graph_revision_hash
    || fromSnapshot.structural_snapshot_hash !== current.structural_snapshot_hash;
  const linear = isAncestor(repoDir, fromSnapshot.repository_sha, current.repository_sha);
  const mode = !fromSnapshot.repository_sha
    ? 'FULL_REDISCOVERY_REQUIRED'
    : !linear
      ? 'FULL_REDISCOVERY_REQUIRED'
      : authorityChanged
        ? 'DELTA_WITH_AUTHORITY_REFRESH'
        : 'DELTA';

  const delta = {
    schema_version: 1,
    project: projectSlug(project),
    feature_id: current.feature_id ?? fromSnapshot.feature_id ?? null,
    mode,
    from_understanding_hash: fromSnapshot.understanding_hash,
    to_understanding_hash: current.understanding_hash,
    from_repository_sha: fromSnapshot.repository_sha,
    to_repository_sha: current.repository_sha,
    changed_files: files,
    file_stats: changedStats(repoDir, fromSnapshot.repository_sha, current.repository_sha),
    changed_symbols: changedSymbols,
    impact,
    authority_changed: authorityChanged,
    graph_changed: graphChanged,
    linear_history: linear,
    validity: {
      project_truth: authorityChanged ? 'DIRTY' : 'VALID',
      repository: files.length ? 'DIRTY' : 'VALID',
      structural_graph: graphChanged ? 'DIRTY' : 'VALID',
      prior_understanding: mode === 'FULL_REDISCOVERY_REQUIRED' ? 'STALE' : 'REUSABLE_WITH_DELTA',
    },
    created_at: now(),
  };
  const deltaHash = hashObject({ ...delta, created_at: null });
  const record = { ...delta, delta_hash: deltaHash };
  const stored = writeContentAddressedJson(`repository-understanding/deltas/${projectSlug(project)}`, record, {
    root,
    prefix: 'repo-delta',
  });
  return { ...record, object_rel: stored.rel, object_hash: stored.hash };
}

export function evaluateRepositoryUnderstanding({
  project = 'dial',
  repoDir,
  root = DEFAULT_CONTROL_HOME,
  previousSnapshot = null,
} = {}) {
  const previous = previousSnapshot || loadRepositoryUnderstandingSnapshot(project, root);
  const current = buildRepositoryUnderstandingSnapshot({ project, repoDir, root, featureId: previous?.feature_id ?? null });
  if (!previous) {
    return {
      mode: 'BOOTSTRAP',
      current,
      previous: null,
      delta: null,
      full_repository_read_expected: true,
    };
  }
  if (previous.understanding_hash === current.understanding_hash) {
    return {
      mode: 'REUSE',
      current,
      previous,
      delta: null,
      full_repository_read_expected: false,
    };
  }
  const delta = buildRepositoryUnderstandingDelta({ project, repoDir, root, fromSnapshot: previous, toSnapshot: current });
  return {
    mode: delta.mode,
    current,
    previous,
    delta,
    full_repository_read_expected: delta.mode === 'FULL_REDISCOVERY_REQUIRED',
  };
}
