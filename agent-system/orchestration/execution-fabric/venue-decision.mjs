import crypto from 'node:crypto';
import { FABRIC_ID, FABRIC_REVISION } from './constants.mjs';
import { canonicalJson } from './canonical-json.mjs';

export function generateVenueSigningKeyPair() {
  return crypto.generateKeyPairSync('ed25519');
}

export function serializePrivateKey(keyObject) {
  return keyObject.export({ type: 'pkcs8', format: 'pem' });
}

export function serializePublicKey(keyObject) {
  return keyObject.export({ type: 'spki', format: 'pem' });
}

export function loadPrivateKey(pem) {
  return crypto.createPrivateKey(pem);
}

export function loadPublicKey(pem) {
  return crypto.createPublicKey(pem);
}

export function unsignedVenueDecision({ route, issuedAt = new Date().toISOString() }) {
  if (!route) throw new Error('route is required');
  return {
    v: 1,
    fabric: FABRIC_ID,
    revision: FABRIC_REVISION,
    unit_id: route.unit_id,
    requested_by: route.requested_by,
    venue: route.venue,
    venue_basis: route.venue_basis,
    action: route.action,
    forbid_oracle: Boolean(route.forbid_oracle),
    evidence: route.evidence || {},
    issued_at: issuedAt,
    issued_by: 'control_plane',
    model_selection: 'UNCHANGED',
  };
}

export function signVenueDecision({ route, privateKey, issuedAt }) {
  const body = unsignedVenueDecision({ route, issuedAt });
  const payload = canonicalJson(body);
  const key = typeof privateKey === 'string' ? loadPrivateKey(privateKey) : privateKey;
  const signature = crypto.sign(null, Buffer.from(payload), key).toString('base64');
  return { ...body, signature };
}

export function verifyVenueSignature(decision, publicKey) {
  if (!decision || typeof decision !== 'object') return { ok: false, reason: 'MISSING_DECISION' };
  if (!decision.signature) return { ok: false, reason: 'UNSIGNED' };
  const { signature, ...body } = decision;
  const payload = canonicalJson(body);
  const key = typeof publicKey === 'string' ? loadPublicKey(publicKey) : publicKey;
  const ok = crypto.verify(null, Buffer.from(payload), key, Buffer.from(signature, 'base64'));
  return ok ? { ok: true, reason: null } : { ok: false, reason: 'SIGNATURE_INVALID' };
}
