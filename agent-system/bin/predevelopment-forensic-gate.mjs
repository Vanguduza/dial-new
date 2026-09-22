#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONTROL_HOME, readJson } from '../orchestration/state-store.mjs';
import { getProject } from '../orchestration/project-registry.mjs';
import { evaluateDevelopmentPackGates } from '../orchestration/development-pack-gates.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SYSTEM_REPO = path.resolve(here, '../..');
export const STANDARD_REL = 'agent-system/registries/FORENSIC_DEVELOPMENT_STANDARD.json';

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}
function validProjectSlug(value) {
  const slug = String(value || '').trim();
  if (!/^[a-z0-9][a-z0-9._:-]{0,220}$/.test(slug)) throw new Error(`INVALID_PROJECT_SLUG:${value}`);
  return slug;
}
function gitHead(repoDir) {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).trim(); }
  catch { return null; }
}
function gitBlob(repoDir, rel) {
  try { return execFileSync('git', ['rev-parse', `HEAD:${rel}`], { cwd: repoDir, encoding: 'utf8' }).trim(); }
  catch { return null; }
}
function loadStandard(systemRepoDir) {
  const file = path.join(systemRepoDir, STANDARD_REL);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}
function projectPackRel(slug) {
  return `projects/${validProjectSlug(slug)}/development-pack/pack.json`;
}

export function evaluatePredevelopmentForensicReadiness({
  projectSlug = process.env.DIAL_PROJECT_SLUG || 'dial',
  root = process.env.DIAL_CONTROL_HOME || DEFAULT_CONTROL_HOME,
  systemRepoDir = process.env.DIAL_SYSTEM_REPO || DEFAULT_SYSTEM_REPO,
} = {}) {
  const slug = validProjectSlug(projectSlug);
  const reasons = [];
  const standard = loadStandard(systemRepoDir);
  if (!standard) {
    return { ok: false, state: 'FORENSIC_BUILD_BLOCKED', project_slug: slug, reasons: ['STANDARD_MISSING'], certificate: null };
  }
  if (standard.status !== 'LOCKED') reasons.push('STANDARD_NOT_LOCKED');

  let project;
  try { project = getProject(slug, root); }
  catch (error) {
    return { ok: false, state: 'FORENSIC_BUILD_BLOCKED', project_slug: slug, reasons: [`PROJECT_NOT_REGISTERED:${error.message}`], certificate: null };
  }

  const pack = readJson(projectPackRel(slug), null, root);
  if (!pack) {
    return {
      ok: false,
      state: 'FORENSIC_BUILD_BLOCKED',
      project_slug: slug,
      project_id: project.project_id || project.slug,
      reasons: ['PROJECT_PACK_MISSING'],
      certificate: null,
    };
  }

  const projectId = project.project_id || project.slug;
  if (pack.project?.project_id !== projectId) reasons.push('PROJECT_IDENTITY_MISMATCH');

  const observedHead = gitHead(project.repo_dir);
  const expectedHead = pack.artifacts?.baseline?.repository_sha || null;
  const baselineCurrent = Boolean(observedHead && expectedHead && observedHead === expectedHead);
  if (!baselineCurrent) reasons.push('PROJECT_BASELINE_STALE');

  for (const rel of standard.governing_docs || []) {
    if (!fs.existsSync(path.join(systemRepoDir, rel))) reasons.push(`GOVERNING_DOC_MISSING:${rel}`);
  }

  const evaluation = evaluateDevelopmentPackGates(pack);
  const forensicGates = evaluation.forensic_gates || evaluation.gates.filter((gate) => gate.gate_id?.startsWith('F'));
  const gateById = new Map(forensicGates.map((gate) => [gate.gate_id, gate]));
  for (const required of standard.required_gates || []) {
    const gate = gateById.get(required.id);
    if (!gate) reasons.push(`REQUIRED_GATE_MISSING:${required.id}`);
    else if (gate.applicable && gate.state !== 'PASS') reasons.push(`REQUIRED_GATE_BLOCKED:${required.id}`);
  }
  if (!evaluation.forensic_ready) reasons.push('FORENSIC_GATES_NOT_READY');

  const packHash = sha256(pack);
  const standardBlob = gitBlob(systemRepoDir, STANDARD_REL);
  const certificateCore = {
    schema_version: 2,
    certificate_id: `ffdrm:${projectId}:${pack.pack_id || pack.revision || 'unversioned'}`,
    project_id: projectId,
    project_slug: slug,
    project_classification: project.classification || pack.project?.classification || null,
    standard_id: standard.standard_id,
    standard_version: standard.standard_version,
    method_id: standard.method_id,
    pack_revision: standard.pack_revision,
    status: reasons.length === 0 ? 'FORENSIC_BUILD_READY' : 'FORENSIC_BUILD_BLOCKED',
    repository: {
      repo_dir: project.repo_dir,
      expected_sha: expectedHead,
      observed_sha: observedHead,
      baseline_current: baselineCurrent,
    },
    development_pack: {
      pack_id: pack.pack_id || null,
      revision: pack.revision || null,
      content_sha256: packHash,
    },
    standard_blob: standardBlob,
    gates: forensicGates.map((gate) => ({
      id: gate.gate_id,
      status: gate.state,
      applicable: gate.applicable,
      reasons: gate.reasons || [],
      evidence_refs: gate.evidence_refs || [],
    })),
    preparation_blockers: Array.isArray(pack.artifacts?.forensic_predevelopment?.preparation_blockers)
      ? pack.artifacts.forensic_predevelopment.preparation_blockers.filter(Boolean)
      : [],
    runtime_qualification: {
      separate_from_predevelopment_readiness: pack.artifacts?.forensic_predevelopment?.runtime_qualification_separated === true,
      repository_readiness_does_not_imply_runtime_qualification: true,
    },
  };
  const fingerprint = sha256(certificateCore);
  const certificate = { ...certificateCore, fingerprint };

  return {
    ok: reasons.length === 0,
    state: certificate.status,
    project_slug: slug,
    project_id: projectId,
    standard_id: standard.standard_id,
    standard_version: standard.standard_version,
    certificate,
    certificate_hash: fingerprint,
    pack_hash: packHash,
    evaluation,
    reasons: [...new Set(reasons)],
  };
}

export function assertPredevelopmentForensicReady(options = {}) {
  const result = evaluatePredevelopmentForensicReadiness(options);
  if (!result.ok) {
    const error = new Error(`FORENSIC_BUILD_READY_REQUIRED:${result.project_slug}:${result.reasons.join(',')}`);
    error.forensic_gate = result;
    throw error;
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--project');
  const projectSlug = i >= 0 ? process.argv[i + 1] : (process.env.DIAL_PROJECT_SLUG || 'dial');
  const result = evaluatePredevelopmentForensicReadiness({ projectSlug });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 2;
}
