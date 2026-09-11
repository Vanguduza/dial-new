import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJsonAtomic } from '../../state-store.mjs';

export const CAPABILITY_REGISTRY_REL = 'agent-system/registries/EXTERNAL_CAPABILITY_REGISTRY.json';
export const CAPABILITY_EVIDENCE_ROOT = 'operations/external-capabilities';
export const MATURITY = Object.freeze({
  DISCOVERED: 0,
  IMPLEMENTED: 1,
  AUTH_REQUIRED: 2,
  AUTHENTICATED: 3,
  LIVE_QUALIFIED: 4,
  ORCHESTRATED: 5,
  INTEGRATED: 6,
  DEGRADED: 7,
  DISABLED: 8,
  QUARANTINED: 9,
});

export function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

export function now() { return new Date().toISOString(); }

export function loadExternalCapabilityRegistry(repoDir) {
  const file = path.join(repoDir, CAPABILITY_REGISTRY_REL);
  const registry = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(registry.capabilities) || registry.capabilities.length !== 3) throw new Error('external capability registry must contain Antigravity, Stitch and Pomelli');
  return registry;
}

export function capabilityRecord(repoDir, capabilityId) {
  const row = loadExternalCapabilityRegistry(repoDir).capabilities.find((item) => item.capability_id === capabilityId);
  if (!row) throw new Error(`unknown external capability ${capabilityId}`);
  return row;
}
export function evidenceRel(capabilityId) {
  return `${CAPABILITY_EVIDENCE_ROOT}/${String(capabilityId).toLowerCase()}/latest.json`;
}

export function readCapabilityEvidence(root, capabilityId) {
  return readJson(evidenceRel(capabilityId), null, root);
}

export function persistCapabilityEvidence(root, capabilityId, artifact, { history = true } = {}) {
  const normalized = {
    schema_version: 1,
    capability_id: capabilityId,
    ...artifact,
    material_exposed: false,
  };
  normalized.evidence_hash = sha256({ ...normalized, evidence_hash: undefined });
  writeJsonAtomic(evidenceRel(capabilityId), normalized, root);
  if (history) {
    const dir = path.join(root, CAPABILITY_EVIDENCE_ROOT, String(capabilityId).toLowerCase(), 'history');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const stamp = String(normalized.observed_at || normalized.completed_at || now()).replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(dir, `${stamp}.json`), `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  }
  return normalized;
}

export function safeSecretStatus(value, source = null) {
  const configured = typeof value === 'string' && value.trim().length >= 12;
  return { configured, source: configured ? source : null, material_exposed: false };
}

export function assertNoSecretMaterial(value) {
  const text = JSON.stringify(value ?? {});
  const patterns = [
    /AIza[0-9A-Za-z_-]{20,}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /(?:api[_-]?key|access[_-]?token|password|secret)\s*["']?\s*[:=]\s*["'][^"']{8,}["']/i,
  ];
  if (patterns.some((pattern) => pattern.test(text))) throw new Error('EXTERNAL_CAPABILITY_EVIDENCE_SECRET_DETECTED');
  return true;
}

export function integrationClaimAllowed(evidence) {
  return evidence?.status === 'INTEGRATED'
    && evidence?.definition_of_done?.passed === true
    && evidence?.live_qualification?.passed === true
    && evidence?.orchestrated_use?.passed === true;
}
