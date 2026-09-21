import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureGitState } from './checkpoint-store.mjs';
import { loadHandoffCapsule } from './handoff-builder.mjs';
import { resolveFeatureId } from './context-broker.mjs';
import { projectTruthHash } from './knowledge-graph-core.mjs';
import {
  buildContextCacheIdentity,
  composeContextDelta,
  getCachedContext,
  putCachedContext,
} from './project-context-cache.mjs';
import {
  buildRepositoryUnderstandingSnapshot,
  loadRepositoryUnderstandingSnapshot,
  buildRepositoryUnderstandingDelta,
} from './repository-understanding-snapshot.mjs';
import { searchSharedMemory, sharedMemoryCursor } from './shared-project-memory.mjs';
import { readJson, writeJsonAtomic } from './state-store.mjs';
import { reviewCheckpointStatus } from './review-fabric.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');

function run(repoDir, command, args) {
  try {
    return execFileSync(command, args, {
      cwd: repoDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 8 * 1024 * 1024,
    }).trim();
  } catch {
    return '';
  }
}
function bounded(value, max) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2);
  return text.length > max ? `${text.slice(0, max)}\n…[bounded]` : text;
}
function contextProfile(value) {
  const profile = String(value || 'IMPLEMENTATION').toUpperCase();
  if (!['REVIEW', 'IMPLEMENTATION', 'ARCHITECTURE', 'DEEP_AUDIT'].includes(profile)) {
    throw new Error(`unsupported context profile: ${value}`);
  }
  return profile;
}
function projectSlug(value) {
  const project = String(value || 'dial').toLowerCase().replace(/[^a-z0-9._:-]+/g, '-');
  if (!/^[a-z0-9][a-z0-9._:-]{0,220}$/.test(project)) throw new Error(`invalid project: ${value}`);
  return project;
}
function harnessPointerRel(project, harnessId) {
  const safe = String(harnessId || 'unknown').replace(/[^A-Za-z0-9._:-]+/g, '-');
  return `context-cache/harness/${projectSlug(project)}/${safe}.json`;
}
function canonicalFeatureContext(repoDir, featureId) {
  if (!featureId) return '';
  return run(repoDir, 'node', ['agent-system/bin/context-get.mjs', featureId]);
}
function currentGraph(root) {
  const graph = readJson('knowledge/graph/current.json', null, root);
  return {
    generation_id: graph?.graph_generation_id ?? null,
    revision_hash: graph?.graph_revision_hash ?? null,
  };
}
function activeReview(project, root) {
  const cursor = readJson(`review/cursor-${projectSlug(project)}.json`, null, root);
  if (!cursor?.checkpoint_id) return null;
  return reviewCheckpointStatus(cursor.checkpoint_id, root);
}
function projectMemoryQuery(userMessage, featureId) {
  return [featureId, String(userMessage || '').slice(0, 600)].filter(Boolean).join(' ');
}
function renderSections(sections) {
  const order = [
    'authority',
    'repository_understanding',
    'repository_delta',
    'canonical_feature_context',
    'handoff',
    'shared_memory',
    'review_state',
    'vekl_graph',
    'instruction',
  ];
  const out = ['DIAL SHARED PROJECT MEMORY CONTEXT'];
  for (const key of order) {
    const value = sections[key];
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;
    out.push('', `--- ${key.toUpperCase()} ---`, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  }
  return out.join('\n');
}

export function loadHarnessContextPointer({ project = 'dial', harnessId } = {}, root) {
  return readJson(harnessPointerRel(project, harnessId), null, root);
}

export async function resolveSharedProjectContext({
  project = 'dial',
  repoDir = DEFAULT_REPO,
  root,
  harnessId,
  userMessage = '',
  featureId = null,
  contextProfile: requestedProfile = 'IMPLEMENTATION',
  skillActivationHash = null,
  updateHarnessPointer = true,
} = {}) {
  if (!harnessId) throw new Error('harnessId is required');
  const profile = contextProfile(requestedProfile);
  const projectId = projectSlug(project);
  const git = captureGitState(repoDir);
  const resolvedFeature = featureId || resolveFeatureId({ userMessage, repoDir }) || null;
  const truthHash = projectTruthHash(repoDir);
  const graph = currentGraph(root);
  const memoryCursor = sharedMemoryCursor(projectId, root);

  const priorUnderstanding = loadRepositoryUnderstandingSnapshot(projectId, root);
  const understanding = buildRepositoryUnderstandingSnapshot({
    project: projectId,
    repoDir,
    root,
    featureId: resolvedFeature,
  });
  const repoDelta = priorUnderstanding && priorUnderstanding.understanding_hash !== understanding.understanding_hash
    ? buildRepositoryUnderstandingDelta({
        project: projectId,
        repoDir,
        root,
        fromSnapshot: priorUnderstanding,
        toSnapshot: understanding,
      })
    : null;

  const handoff = loadHandoffCapsule(resolvedFeature, root);
  const memory = searchSharedMemory({
    project: projectId,
    query: projectMemoryQuery(userMessage, resolvedFeature),
    featureId: resolvedFeature,
    tiers: profile === 'REVIEW' ? ['HOT', 'WARM'] : ['HOT', 'WARM', 'COLD'],
    admittedOnly: true,
    limit: profile === 'DEEP_AUDIT' ? 40 : profile === 'ARCHITECTURE' ? 28 : 20,
  }, root);
  const reviewState = activeReview(projectId, root);
  const canonical = canonicalFeatureContext(repoDir, resolvedFeature);

  const identity = buildContextCacheIdentity({
    project: projectId,
    featureId: resolvedFeature,
    projectTruthHash: truthHash,
    repositorySha: git.commit,
    graphRevisionHash: graph.revision_hash,
    memoryCursor: memoryCursor.sequence,
    contextProfile: profile,
    skillActivationHash,
    repositoryUnderstandingHash: understanding.understanding_hash,
  });

  let current = getCachedContext({
    project: projectId,
    contextFingerprint: identity.context_fingerprint,
  }, root);

  if (!current) {
    const sections = {
      authority: {
        project: projectId,
        project_truth_hash: truthHash,
        source_of_truth_order: [
          'canonical repository and Project Truth',
          'machine registries/evidence',
          'current Git/worktree',
          'VEKL admitted knowledge',
          'checkpoint/handoff',
          'admitted shared project memory',
          'harness-native session/account memory',
        ],
        invariant: 'Lower layers never override higher layers. Shared memory is continuity context, not project authority.',
      },
      repository_understanding: {
        understanding_hash: understanding.understanding_hash,
        repository_sha: understanding.repository_sha,
        branch: understanding.branch,
        project_truth_hash: understanding.project_truth_hash,
        registry_fingerprint: understanding.registry_fingerprint,
        graph_revision_hash: understanding.graph_revision_hash,
        structural_snapshot_hash: understanding.structural_snapshot_hash,
        validity: repoDelta?.validity ?? {
          project_truth: 'VALID',
          repository: 'VALID',
          structural_graph: 'VALID',
          prior_understanding: priorUnderstanding ? 'REUSABLE' : 'BOOTSTRAP',
        },
      },
      repository_delta: repoDelta ? {
        mode: repoDelta.mode,
        from_repository_sha: repoDelta.from_repository_sha,
        to_repository_sha: repoDelta.to_repository_sha,
        changed_files: repoDelta.changed_files,
        file_stats: repoDelta.file_stats,
        changed_symbols: repoDelta.changed_symbols,
        impacted_paths: repoDelta.impact?.impacted_paths ?? [],
        impact_hash: repoDelta.impact?.impact_hash ?? null,
        delta_hash: repoDelta.delta_hash,
      } : null,
      canonical_feature_context: canonical ? bounded(canonical, profile === 'DEEP_AUDIT' ? 32000 : 18000) : '',
      handoff: handoff ? {
        ...handoff,
        authority_warning: 'Continuity only; verify against current repository evidence.',
      } : null,
      shared_memory: {
        cursor: memory.cursor,
        results: memory.results.map((item) => ({
          sequence: item.sequence,
          memory_id: item.memory_id,
          tier: item.tier,
          type: item.type,
          feature_id: item.feature_id,
          source_harness: item.source_harness,
          recorded_at: item.recorded_at,
          text: item.record.text,
          refs: item.record.refs,
        })),
      },
      review_state: reviewState ? {
        checkpoint_id: reviewState.checkpoint_id,
        repository_sha: reviewState.repository_sha,
        state: reviewState.state,
        required_reviews: reviewState.required_reviews,
        completed_reviews: reviewState.completed_reviews,
        provider_families: reviewState.provider_families,
        blocking_findings: reviewState.blocking_findings,
        receipts: reviewState.receipts.map((receipt) => ({
          reviewer_harness: receipt.reviewer_harness,
          verdict: receipt.verdict,
          summary: receipt.summary,
          findings: receipt.findings,
          receipt_hash: receipt.review_receipt_hash,
        })),
      } : null,
      vekl_graph: graph,
      instruction: String(userMessage || ''),
    };
    current = putCachedContext({
      identity,
      sections,
      rendered: renderSections(sections),
    }, root);
  }

  const previousPointer = loadHarnessContextPointer({ project: projectId, harnessId }, root);
  const previous = previousPointer?.context_fingerprint
    ? getCachedContext({ project: projectId, contextFingerprint: previousPointer.context_fingerprint }, root)
    : null;
  const delivery = composeContextDelta({ current, previous }, root);

  if (updateHarnessPointer) {
    writeJsonAtomic(harnessPointerRel(projectId, harnessId), {
      schema_version: 1,
      project: projectId,
      harness_id: harnessId,
      context_fingerprint: current.context_fingerprint,
      repository_sha: git.commit,
      feature_id: resolvedFeature,
      memory_cursor: memoryCursor.sequence,
      understanding_hash: understanding.understanding_hash,
      delivered_mode: delivery.mode,
      delivered_at: new Date().toISOString(),
    }, root);
  }

  return {
    project: projectId,
    harness_id: harnessId,
    feature_id: resolvedFeature,
    repository_sha: git.commit,
    context_fingerprint: current.context_fingerprint,
    understanding_hash: understanding.understanding_hash,
    repository_delta_hash: repoDelta?.delta_hash ?? null,
    memory_cursor: memoryCursor,
    delivery,
    cache_object_rel: current.object_rel,
  };
}

async function readStdinJson() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) return {};
  try { return JSON.parse(input); } catch { return {}; }
}

async function main() {
  const args = process.argv.slice(2);
  const hook = args.includes('--hook');
  const get = (name, fallback = null) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const payload = hook ? await readStdinJson() : {};
  const result = await resolveSharedProjectContext({
    project: get('--project', process.env.DIAL_PROJECT_ID || 'dial'),
    repoDir: get('--repo', process.env.DIAL_REPO_DIR || DEFAULT_REPO),
    root: process.env.DIAL_CONTROL_HOME,
    harnessId: get('--harness', process.env.DIAL_HARNESS_ID || payload.harness_id || 'chatgpt-hermes'),
    userMessage: get('--message', payload.user_message ?? payload.message ?? process.env.DIAL_USER_MESSAGE ?? ''),
    featureId: get('--feature', payload.feature_id ?? process.env.DIAL_FEATURE_ID ?? null),
    contextProfile: get('--profile', process.env.DIAL_CONTEXT_PROFILE || 'IMPLEMENTATION'),
  });
  if (hook) process.stdout.write(`${JSON.stringify({ context: result.delivery.rendered, context_fingerprint: result.context_fingerprint, delivery_mode: result.delivery.mode })}\n`);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
}
