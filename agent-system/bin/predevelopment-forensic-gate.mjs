#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO = path.resolve(here, '../..');
export const STANDARD_REL = 'agent-system/registries/FORENSIC_DEVELOPMENT_STANDARD.json';
export const CERTIFICATE_REL = 'agent-system/registries/PREDEVELOPMENT_FORENSIC_CERTIFICATE.json';
export const PROJECT_POLICY_REL = 'agent-system/registries/UNIT_BOUNDARY_POLICY.json';

function readJson(repoDir, rel) {
  return JSON.parse(fs.readFileSync(path.join(repoDir, rel), 'utf8'));
}

function gitBlob(repoDir, rel) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${rel}`], { cwd: repoDir, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function projectKindRequiresSymbiotic(certificate, gate) {
  const kind = String(certificate?.project_kind || '').toUpperCase();
  return (gate?.applies_when || []).some((token) => kind.includes(String(token).toUpperCase()));
}

export function validateForensicReadiness({
  standard,
  certificate,
  projectIdentity,
  currentBlobs = {},
  evidenceExists = () => true,
  governingDocsExist = () => true,
  standardBlob = null,
  certificateBlob = null,
} = {}) {
  const structuralReasons = [];
  const readinessReasons = [];
  if (!standard) structuralReasons.push('STANDARD_MISSING');
  if (!certificate) structuralReasons.push('CERTIFICATE_MISSING');
  if (structuralReasons.length) return { ok: false, certificate_valid: false, state: 'FORENSIC_BUILD_BLOCKED', reasons: structuralReasons, structural_reasons: structuralReasons, readiness_reasons: readinessReasons, fingerprint: null };

  if (standard.status !== 'LOCKED') structuralReasons.push('STANDARD_NOT_LOCKED');
  if (certificate.status !== standard.certificate_status) readinessReasons.push('CERTIFICATE_NOT_BUILD_READY');
  if (certificate.standard_id !== standard.standard_id) structuralReasons.push('STANDARD_ID_MISMATCH');
  if (certificate.standard_version !== standard.standard_version) structuralReasons.push('STANDARD_VERSION_MISMATCH');
  if (projectIdentity && certificate.project_identity !== projectIdentity) structuralReasons.push('PROJECT_IDENTITY_MISMATCH');

  for (const rel of standard.governing_docs || []) {
    if (!governingDocsExist(rel)) structuralReasons.push(`GOVERNING_DOC_MISSING:${rel}`);
  }

  const gateById = new Map((certificate.gates || []).map((g) => [g.id, g]));
  for (const required of standard.required_gates || []) {
    const row = gateById.get(required.id);
    if (!row) {
      structuralReasons.push(`REQUIRED_GATE_MISSING:${required.id}`);
      continue;
    }
    const symbioticRequired = required.id === 'F12_SYMBIOTIC_LOOP' && projectKindRequiresSymbiotic(certificate, required);
    const allowed = new Set(standard.ready_statuses || ['PASS', 'NOT_APPLICABLE']);
    if (!allowed.has(row.status)) readinessReasons.push(`GATE_NOT_READY:${required.id}:${row.status}`);
    if (symbioticRequired && row.status === 'NOT_APPLICABLE') readinessReasons.push('SYMBIOTIC_LOOP_REQUIRED');
    for (const evidence of row.evidence || []) {
      if (!evidenceExists(evidence)) structuralReasons.push(`EVIDENCE_MISSING:${required.id}:${evidence}`);
    }
  }

  for (const binding of certificate.authority_bindings || []) {
    const current = currentBlobs[binding.path] ?? null;
    if (!current) structuralReasons.push(`AUTHORITY_BINDING_MISSING:${binding.path}`);
    else if (current !== binding.git_blob) structuralReasons.push(`AUTHORITY_BINDING_STALE:${binding.path}`);
  }

  if ((certificate.preparation_blockers || []).length) readinessReasons.push('PREPARATION_BLOCKERS_OPEN');
  if (certificate.runtime_qualification?.separate_from_predevelopment_readiness !== true) {
    structuralReasons.push('RUNTIME_QUALIFICATION_NOT_SEPARATE');
  }

  const fingerprintInput = {
    standard_id: standard.standard_id,
    standard_version: standard.standard_version,
    project_identity: certificate.project_identity,
    standard_blob: standardBlob,
    certificate_blob: certificateBlob,
    authority_bindings: (certificate.authority_bindings || []).map((b) => ({
      path: b.path,
      expected: b.git_blob,
      current: currentBlobs[b.path] ?? null,
    })).sort((a, b) => a.path.localeCompare(b.path)),
  };
  const fingerprint = sha256(JSON.stringify(fingerprintInput));
  const reasons = [...structuralReasons, ...readinessReasons];
  return {
    ok: reasons.length === 0,
    certificate_valid: structuralReasons.length === 0,
    state: reasons.length ? 'FORENSIC_BUILD_BLOCKED' : 'FORENSIC_BUILD_READY',
    reasons,
    structural_reasons: structuralReasons,
    readiness_reasons: readinessReasons,
    standard_id: standard.standard_id,
    standard_version: standard.standard_version,
    certificate_id: certificate.certificate_id,
    certificate_blob: certificateBlob,
    fingerprint,
  };
}

export function evaluatePredevelopmentForensicReadiness({
  repoDir = DEFAULT_REPO,
  projectIdentity = null,
} = {}) {
  let standard;
  let certificate;
  try { standard = readJson(repoDir, STANDARD_REL); } catch { standard = null; }
  try { certificate = readJson(repoDir, CERTIFICATE_REL); } catch { certificate = null; }

  let resolvedProjectIdentity = projectIdentity;
  if (!resolvedProjectIdentity) {
    try { resolvedProjectIdentity = readJson(repoDir, PROJECT_POLICY_REL).project_identity || null; } catch {}
  }

  const currentBlobs = {};
  for (const binding of certificate?.authority_bindings || []) {
    currentBlobs[binding.path] = gitBlob(repoDir, binding.path);
  }

  return validateForensicReadiness({
    standard,
    certificate,
    projectIdentity: resolvedProjectIdentity,
    currentBlobs,
    evidenceExists: (rel) => fs.existsSync(path.join(repoDir, rel)),
    governingDocsExist: (rel) => fs.existsSync(path.join(repoDir, rel)),
    standardBlob: gitBlob(repoDir, STANDARD_REL),
    certificateBlob: gitBlob(repoDir, CERTIFICATE_REL),
  });
}

export function assertPredevelopmentForensicReady(options = {}) {
  const result = evaluatePredevelopmentForensicReadiness(options);
  if (!result.ok) {
    const error = new Error(`FORENSIC_BUILD_READY_REQUIRED: ${result.reasons.join(', ')}`);
    error.forensic_gate = result;
    throw error;
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoDir = process.env.DIAL_REPO_DIR || DEFAULT_REPO;
  const result = evaluatePredevelopmentForensicReadiness({ repoDir });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (process.argv.includes('--validate')) {
    if (!result.certificate_valid) process.exitCode = 2;
  } else if (!result.ok) process.exitCode = 2;
}
