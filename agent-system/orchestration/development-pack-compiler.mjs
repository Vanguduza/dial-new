#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  appendJsonl,
  DEFAULT_CONTROL_HOME,
  readJson,
  resolveControlPath,
  writeJsonAtomic,
} from './state-store.mjs';
import { getProject } from './project-registry.mjs';
import { evaluateDevelopmentPackGates } from './development-pack-gates.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const ARTIFACT_TYPES = new Set([
  'baseline',
  'product_truth',
  'development_units',
  'feature_graph',
  'screen_registry',
  'screen_feature_proof',
  'research',
  'architecture',
  'failure_recovery',
  'implementation',
  'verification',
  'closure',
  'operations',
  'system_independence',
  'forensic_predevelopment',
]);

function now() { return new Date().toISOString(); }
function hash(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}
function validProjectId(value) {
  const id = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9._:-]{0,220}$/.test(id)) throw new Error(`INVALID_PROJECT_ID:${value}`);
  return id;
}
function packRel(project) { return `projects/${validProjectId(project)}/development-pack/pack.json`; }
function historyRel(project, revision) {
  return `projects/${validProjectId(project)}/development-pack/history/${String(revision).padStart(6, '0')}.json`;
}
function git(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 8 * 1024 * 1024,
    }).trim();
  } catch {
    return '';
  }
}
function origin(cwd) {
  let value = git(cwd, ['remote', 'get-url', 'origin']);
  if (/^git@github\.com:/.test(value)) value = `https://github.com/${value.slice('git@github.com:'.length)}`;
  if (value && !value.endsWith('.git')) value += '.git';
  return value || 'LOCAL_REPOSITORY';
}
function dirty(cwd) {
  return Boolean(git(cwd, ['status', '--porcelain=v1']));
}
function withLock(project, root, fn) {
  const lock = resolveControlPath(`projects/${validProjectId(project)}/development-pack/.lock`, root);
  fs.mkdirSync(path.dirname(lock), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 3000;
  for (;;) {
    try { fs.mkdirSync(lock, { mode: 0o700 }); break; }
    catch (error) {
      if (error?.code !== 'EEXIST' || Date.now() > deadline) throw new Error(`DEVELOPMENT_PACK_LOCK_UNAVAILABLE:${project}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try { return fn(); }
  finally { try { fs.rmdirSync(lock); } catch {} }
}

function baselineFor(project) {
  const repoDir = project.repo_dir;
  const sha = git(repoDir, ['rev-parse', 'HEAD']);
  const branch = git(repoDir, ['branch', '--show-current']) || 'DETACHED';
  if (!sha) throw new Error(`PROJECT_BASELINE_UNAVAILABLE:${project.slug}`);
  return {
    project_id: project.project_id || project.slug,
    repository_sha: sha,
    branch,
    origin_url: origin(repoDir),
    dirty: dirty(repoDir),
    captured_at: now(),
    evidence_refs: [`git:${sha}`],
  };
}

function initialArtifacts(project) {
  return {
    baseline: baselineFor(project),
    product_truth: null,
    development_units: null,
    feature_graph: null,
    screen_registry: null,
    screen_feature_proof: null,
    research: null,
    architecture: null,
    failure_recovery: null,
    implementation: null,
    verification: null,
    closure: null,
    operations: null,
    forensic_predevelopment: null,
    system_independence: project.classification === 'DEVELOPMENT_SYSTEM' ? {
      applicable: true,
      owns_complete_e2e_pipeline: project.owns_complete_e2e_pipeline === true,
      dde_runtime_dependency: project.runtime_dependency_on_dde === true,
      dde_authority_dependency: project.authority_dependency_on_dde === true,
      arbitrary_project_conformance: false,
      evidence_refs: ['agent-system/registries/UNIVERSAL_PROJECT_REGISTRY.json'],
    } : { applicable: false, evidence_refs: [] },
  };
}

export function seedDevelopmentPack({ projectSlug, root = DEFAULT_CONTROL_HOME } = {}) {
  const slug = validProjectId(projectSlug);
  return withLock(slug, root, () => {
    const existing = readJson(packRel(slug), null, root);
    if (existing) return { created: false, pack: existing, evaluation: evaluateDevelopmentPackGates(existing) };
    const project = getProject(slug, root);
    const pack = {
      schema_version: 1,
      pack_id: `DP-${slug}-000001`,
      project: {
        project_id: project.project_id || project.slug,
        project_slug: project.slug,
        display_name: project.name,
        classification: project.classification || 'APPLICATION_PROJECT',
        project_kind: project.project_kind || 'software',
        ui_bearing: typeof project.ui_bearing === 'boolean' ? project.ui_bearing : null,
        repository_mode: project.repository_mode || 'DEDICATED_REPOSITORY',
        scope_selector: project.scope_selector || null,
      },
      revision: 1,
      maturity_state: 'DRAFT',
      build_ready: false,
      artifacts: initialArtifacts(project),
      blockers: [],
      created_at: now(),
      updated_at: now(),
    };
    const evaluation = evaluateDevelopmentPackGates(pack);
    pack.maturity_state = evaluation.maturity_state;
    pack.build_ready = evaluation.build_ready;
    pack.blockers = evaluation.blockers;
    pack.evaluation = evaluation;
    writeJsonAtomic(packRel(slug), pack, root);
    writeJsonAtomic(historyRel(slug, pack.revision), pack, root);
    appendJsonl('events/development-pack.jsonl', {
      event: 'DEVELOPMENT_PACK_SEEDED',
      project: slug,
      pack_id: pack.pack_id,
      repository_sha: pack.artifacts.baseline.repository_sha,
      build_ready: false,
      at: now(),
    }, root);
    return { created: true, pack, evaluation };
  });
}

function validateEvidenceRefs(value) {
  if (!Array.isArray(value) || !value.filter(Boolean).length) throw new Error('DEVELOPMENT_PACK_ARTIFACT_EVIDENCE_REQUIRED');
  return value.map(String).slice(0, 100);
}

export function recordDevelopmentPackArtifact({
  projectSlug,
  artifactType,
  artifact,
  root = DEFAULT_CONTROL_HOME,
} = {}) {
  const slug = validProjectId(projectSlug);
  if (!ARTIFACT_TYPES.has(artifactType)) throw new Error(`UNSUPPORTED_DEVELOPMENT_PACK_ARTIFACT:${artifactType}`);
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) throw new Error('DEVELOPMENT_PACK_ARTIFACT_OBJECT_REQUIRED');
  return withLock(slug, root, () => {
    const current = readJson(packRel(slug), null, root);
    if (!current) throw new Error(`DEVELOPMENT_PACK_NOT_SEEDED:${slug}`);
    if (current.maturity_state === 'INVALIDATED' || current.invalidation) throw new Error(`DEVELOPMENT_PACK_INVALIDATED:${slug}`);
    if (artifactType === 'baseline') throw new Error('USE_REBASELINE_FOR_BASELINE_CHANGE');
    const project = getProject(slug, root);
    const observedSha = git(project.repo_dir, ['rev-parse', 'HEAD']);
    const expectedSha = current.artifacts?.baseline?.repository_sha;
    if (!expectedSha || observedSha !== expectedSha) throw new Error(`DEVELOPMENT_PACK_BASELINE_STALE:${slug}`);
    const evidenceRefs = validateEvidenceRefs(artifact.evidence_refs);
    const revision = Number(current.revision || 0) + 1;
    const normalized = {
      ...artifact,
      project_id: current.project.project_id,
      artifact_type: artifactType,
      evidence_refs: evidenceRefs,
      content_sha256: hash({ ...artifact, evidence_refs: evidenceRefs }),
      recorded_at: now(),
    };
    const next = {
      ...current,
      revision,
      pack_id: `DP-${slug}-${String(revision).padStart(6, '0')}`,
      artifacts: { ...current.artifacts, [artifactType]: normalized },
      updated_at: now(),
    };
    const evaluation = evaluateDevelopmentPackGates(next);
    next.maturity_state = evaluation.maturity_state;
    next.build_ready = evaluation.build_ready;
    next.blockers = evaluation.blockers;
    next.evaluation = evaluation;
    writeJsonAtomic(packRel(slug), next, root);
    writeJsonAtomic(historyRel(slug, revision), next, root);
    appendJsonl('events/development-pack.jsonl', {
      event: 'DEVELOPMENT_PACK_ARTIFACT_RECORDED',
      project: slug,
      pack_id: next.pack_id,
      revision,
      artifact_type: artifactType,
      content_sha256: normalized.content_sha256,
      build_ready: next.build_ready,
      at: now(),
    }, root);
    return { pack: next, artifact: normalized, evaluation };
  });
}

export function rebaselineDevelopmentPack({ projectSlug, root = DEFAULT_CONTROL_HOME } = {}) {
  const slug = validProjectId(projectSlug);
  return withLock(slug, root, () => {
    const current = readJson(packRel(slug), null, root);
    if (!current) throw new Error(`DEVELOPMENT_PACK_NOT_SEEDED:${slug}`);
    const project = getProject(slug, root);
    const revision = Number(current.revision || 0) + 1;
    const next = {
      ...current,
      revision,
      pack_id: `DP-${slug}-${String(revision).padStart(6, '0')}`,
      project: {
        ...current.project,
        project_id: project.project_id || project.slug,
        display_name: project.name,
        classification: project.classification || current.project.classification,
        project_kind: project.project_kind || current.project.project_kind,
        ui_bearing: typeof project.ui_bearing === 'boolean' ? project.ui_bearing : current.project.ui_bearing,
        repository_mode: project.repository_mode || current.project.repository_mode,
        scope_selector: project.scope_selector || current.project.scope_selector,
      },
      artifacts: initialArtifacts(project),
      maturity_state: 'DRAFT',
      build_ready: false,
      blockers: [],
      invalidation: null,
      updated_at: now(),
    };
    const evaluation = evaluateDevelopmentPackGates(next);
    next.maturity_state = evaluation.maturity_state;
    next.build_ready = false;
    next.blockers = evaluation.blockers;
    next.evaluation = evaluation;
    writeJsonAtomic(packRel(slug), next, root);
    writeJsonAtomic(historyRel(slug, revision), next, root);
    appendJsonl('events/development-pack.jsonl', {
      event: 'DEVELOPMENT_PACK_REBASELINED',
      project: slug,
      pack_id: next.pack_id,
      repository_sha: next.artifacts.baseline.repository_sha,
      at: now(),
    }, root);
    return { pack: next, evaluation };
  });
}

export function developmentPackStatus(projectSlug, root = DEFAULT_CONTROL_HOME) {
  const slug = validProjectId(projectSlug);
  const pack = readJson(packRel(slug), null, root);
  if (!pack) return { project: slug, state: 'NOT_SEEDED', build_ready: false };
  const evaluation = evaluateDevelopmentPackGates(pack);
  const project = getProject(slug, root);
  const observedSha = git(project.repo_dir, ['rev-parse', 'HEAD']);
  const expectedSha = pack.artifacts?.baseline?.repository_sha ?? null;
  const baselineCurrent = Boolean(expectedSha && observedSha === expectedSha);
  const driftBlocker = { gate_id: 'GATE-00', reasons: ['REPOSITORY_DRIFT'] };
  return {
    project: slug,
    pack_id: pack.pack_id,
    revision: pack.revision,
    maturity_state: baselineCurrent ? evaluation.maturity_state : 'INVALIDATED',
    build_ready: baselineCurrent && evaluation.build_ready,
    baseline_state: baselineCurrent ? 'CURRENT' : 'STALE',
    blockers: baselineCurrent ? evaluation.blockers : [driftBlocker, ...evaluation.blockers.filter((x) => x.gate_id !== 'GATE-00')],
    gates: evaluation.gates,
    repository_sha: expectedSha,
    observed_repository_sha: observedSha || null,
    updated_at: pack.updated_at,
  };
}

export function invalidateDevelopmentPack({
  projectSlug,
  reason,
  evidenceRefs = [],
  root = DEFAULT_CONTROL_HOME,
} = {}) {
  const slug = validProjectId(projectSlug);
  if (!String(reason || '').trim()) throw new Error('DEVELOPMENT_PACK_INVALIDATION_REASON_REQUIRED');
  return withLock(slug, root, () => {
    const current = readJson(packRel(slug), null, root);
    if (!current) throw new Error(`DEVELOPMENT_PACK_NOT_SEEDED:${slug}`);
    const revision = Number(current.revision || 0) + 1;
    const next = {
      ...current,
      revision,
      pack_id: `DP-${slug}-${String(revision).padStart(6, '0')}`,
      maturity_state: 'INVALIDATED',
      build_ready: false,
      invalidation: {
        reason: String(reason).slice(0, 4000),
        evidence_refs: Array.isArray(evidenceRefs) ? evidenceRefs.map(String).slice(0, 100) : [],
        at: now(),
      },
      updated_at: now(),
    };
    writeJsonAtomic(packRel(slug), next, root);
    writeJsonAtomic(historyRel(slug, revision), next, root);
    appendJsonl('events/development-pack.jsonl', {
      event: 'DEVELOPMENT_PACK_INVALIDATED',
      project: slug,
      pack_id: next.pack_id,
      reason: next.invalidation.reason,
      at: now(),
    }, root);
    return next;
  });
}

export function checkDevelopmentPackBaseline(projectSlug, root = DEFAULT_CONTROL_HOME) {
  const slug = validProjectId(projectSlug);
  const pack = readJson(packRel(slug), null, root);
  if (!pack) return { current: false, reason: 'NOT_SEEDED' };
  const project = getProject(slug, root);
  const observed = git(project.repo_dir, ['rev-parse', 'HEAD']);
  const expected = pack.artifacts?.baseline?.repository_sha ?? null;
  return {
    current: Boolean(expected && observed === expected),
    expected_sha: expected,
    observed_sha: observed || null,
    reason: expected && observed === expected ? 'CURRENT' : 'REPOSITORY_DRIFT',
  };
}

function arg(args, name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

async function main() {
  const command = process.argv[2] || 'status';
  const args = process.argv.slice(3);
  const root = process.env.DIAL_CONTROL_HOME || DEFAULT_CONTROL_HOME;
  const projectSlug = arg(args, '--project', 'dial');
  if (command === 'seed') return console.log(JSON.stringify(seedDevelopmentPack({ projectSlug, root }), null, 2));
  if (command === 'status') return console.log(JSON.stringify(developmentPackStatus(projectSlug, root), null, 2));
  if (command === 'baseline') return console.log(JSON.stringify(checkDevelopmentPackBaseline(projectSlug, root), null, 2));
  if (command === 'rebaseline') return console.log(JSON.stringify(rebaselineDevelopmentPack({ projectSlug, root }), null, 2));
  if (command === 'invalidate') {
    return console.log(JSON.stringify(invalidateDevelopmentPack({
      projectSlug,
      reason: arg(args, '--reason'),
      evidenceRefs: arg(args, '--evidence') ? [arg(args, '--evidence')] : [],
      root,
    }), null, 2));
  }
  if (command === 'record') {
    const type = arg(args, '--artifact');
    const file = arg(args, '--file');
    if (!file) throw new Error('--file is required');
    const artifact = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    return console.log(JSON.stringify(recordDevelopmentPackArtifact({ projectSlug, artifactType: type, artifact, root }), null, 2));
  }
  throw new Error(`unknown development-pack command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
