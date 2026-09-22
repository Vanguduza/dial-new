import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  evaluatePredevelopmentForensicReadiness,
  validateForensicReadiness,
} from '../agent-system/bin/predevelopment-forensic-gate.mjs';

const ROOT = process.cwd();
const standard = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-system/registries/FORENSIC_DEVELOPMENT_STANDARD.json'), 'utf8'));
const certificate = JSON.parse(fs.readFileSync(path.join(ROOT, 'agent-system/registries/PREDEVELOPMENT_FORENSIC_CERTIFICATE.json'), 'utf8'));

function synthetic(overrides = {}) {
  const currentBlobs = Object.fromEntries(certificate.authority_bindings.map((b) => [b.path, b.git_blob]));
  const ready = {
    ...certificate,
    status: standard.certificate_status,
    preparation_blockers: [],
    gates: certificate.gates.map((g) => ({ ...g, status: g.id === 'F12_SYMBIOTIC_LOOP' ? 'PASS' : 'PASS' })),
    ...overrides,
  };
  return validateForensicReadiness({
    standard,
    certificate: ready,
    projectIdentity: certificate.project_identity,
    currentBlobs,
    evidenceExists: () => true,
    governingDocsExist: () => true,
    standardBlob: 'standard-blob',
    certificateBlob: 'certificate-blob',
  });
}

describe('Fable forensic predevelopment gate', () => {
  it('reports the current DIAL certificate as structurally valid but honestly build-blocked', () => {
    const result = evaluatePredevelopmentForensicReadiness({ repoDir: ROOT });
    expect(result.certificate_valid).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.state).toBe('FORENSIC_BUILD_BLOCKED');
    expect(result.readiness_reasons).toContain('CERTIFICATE_NOT_BUILD_READY');
    expect(result.readiness_reasons).toContain('PREPARATION_BLOCKERS_OPEN');
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails closed when an authority binding changes', () => {
    const currentBlobs = Object.fromEntries(certificate.authority_bindings.map((b) => [b.path, b.git_blob]));
    currentBlobs[certificate.authority_bindings[0].path] = 'deadbeef';
    const result = validateForensicReadiness({
      standard,
      certificate: { ...certificate, status: standard.certificate_status, preparation_blockers: [], gates: certificate.gates.map((g) => ({ ...g, status: 'PASS' })) },
      projectIdentity: certificate.project_identity,
      currentBlobs,
      evidenceExists: () => true,
      governingDocsExist: () => true,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.startsWith('AUTHORITY_BINDING_STALE:'))).toBe(true);
  });

  it('fails when a required forensic gate is no longer PASS/NOT_APPLICABLE', () => {
    const changed = {
      ...certificate,
      status: standard.certificate_status,
      preparation_blockers: [],
      gates: certificate.gates.map((g) => ({ ...g, status: g.id === 'F5_CAUSAL_PATHS' ? 'OPEN' : 'PASS' })),
    };
    const currentBlobs = Object.fromEntries(certificate.authority_bindings.map((b) => [b.path, b.git_blob]));
    const result = validateForensicReadiness({
      standard,
      certificate: changed,
      projectIdentity: certificate.project_identity,
      currentBlobs,
      evidenceExists: () => true,
      governingDocsExist: () => true,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('GATE_NOT_READY:F5_CAUSAL_PATHS:OPEN');
  });

  it('does not allow an agentic project to mark the symbiotic-loop gate not applicable', () => {
    const changed = {
      ...certificate,
      status: standard.certificate_status,
      preparation_blockers: [],
      gates: certificate.gates.map((g) => ({ ...g, status: g.id === 'F12_SYMBIOTIC_LOOP' ? 'NOT_APPLICABLE' : 'PASS' })),
    };
    const currentBlobs = Object.fromEntries(certificate.authority_bindings.map((b) => [b.path, b.git_blob]));
    const result = validateForensicReadiness({
      standard,
      certificate: changed,
      projectIdentity: certificate.project_identity,
      currentBlobs,
      evidenceExists: () => true,
      governingDocsExist: () => true,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('SYMBIOTIC_LOOP_REQUIRED');
  });

  it('fails when the standard version changes without certificate reconciliation', () => {
    const result = synthetic({ standard_version: '0.0.0-stale' });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('STANDARD_VERSION_MISMATCH');
  });
});
