import fs from 'node:fs';
import path from 'node:path';
import {
  now,
  persistCapabilityEvidence,
  sha256,
} from './external-capability-core.mjs';

export const POMELLI_CAPABILITY_ID = 'CREATIVE-POMELLI';
export const POMELLI_GMPC_FEATURES = Object.freeze([
  'GMPC-F050', 'GMPC-F051', 'GMPC-F052', 'GMPC-F053',
  'GMPC-F060', 'GMPC-F061', 'GMPC-F062', 'GMPC-F140',
  'GMPC-F170', 'GMPC-F180', 'GMPC-F181', 'GMPC-F202', 'GMPC-F209',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.mp4', '.txt', '.md', '.html', '.pdf',
]);
const FORBIDDEN_DNA_KEYS = /(customer|user|patient|claimant|email|phone|address|diagnosis|payment|card|account|password|token|secret|api.?key|private.?key|session|cookie)/i;
const FORBIDDEN_DNA_VALUE = /\b(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s-]{7,}|(?:api[_-]?key|token|secret|password)\s*[:=])/i;

function envBool(name, fallback = false) {
  const value = process.env[name];
  return value == null ? fallback : /^(1|true|yes|on)$/i.test(value);
}
function scanForbidden(value, prefix = '') {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...scanForbidden(item, `${prefix}[${index}]`)));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const location = prefix ? `${prefix}.${key}` : key;
      if (FORBIDDEN_DNA_KEYS.test(key)) findings.push(`FORBIDDEN_KEY:${location}`);
      findings.push(...scanForbidden(item, location));
    }
  } else if (typeof value === 'string' && FORBIDDEN_DNA_VALUE.test(value)) {
    findings.push(`FORBIDDEN_VALUE:${prefix || 'root'}`);
  }
  return findings;
}

export function buildSanitizedBusinessDna(input) {
  const findings = scanForbidden(input);
  if (findings.length) return { ok: false, findings, business_dna: null };
  const source = input && typeof input === 'object' ? input : {};
  const businessDna = {
    schema_version: 1,
    brand_name: String(source.brand_name || 'DIAL').trim(),
    brand_promise: String(source.brand_promise || '').trim(),
    audiences: Array.isArray(source.audiences) ? source.audiences.map(String) : [],
    tone: Array.isArray(source.tone) ? source.tone.map(String) : [],
    visual_principles: Array.isArray(source.visual_principles) ? source.visual_principles.map(String) : [],
    product_families: Array.isArray(source.product_families) ? source.product_families.map(String) : [],
    prohibited_claims: Array.isArray(source.prohibited_claims) ? source.prohibited_claims.map(String) : [],
    source_class: 'SANITIZED_NON_CUSTOMER_BRAND_CONTEXT',
    gmpc_owner: true,
  };
  return { ok: true, findings: [], business_dna: businessDna, business_dna_hash: sha256(businessDna) };
}
function quarantineDir(root) {
  return path.join(root, 'operations', 'external-capabilities', 'creative-pomelli', 'quarantine');
}

export function ingestPomelliExport({
  filePath,
  root,
  sourceUrl = null,
  actor = 'owner',
  containsCommercialClaim = false,
  maxBytes = 25_000_000,
} = {}) {
  if (!envBool('DIAL_POMELLI_INGEST_ENABLED', false)) throw new Error('POMELLI_INGEST_DISABLED');
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('POMELLI_EXPORT_NOT_FILE');
  if (stat.size > maxBytes) throw new Error('POMELLI_EXPORT_TOO_LARGE');
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error('POMELLI_EXPORT_TYPE_DENIED');
  const bytes = fs.readFileSync(filePath);
  const contentHash = sha256(bytes);
  const assetId = `POMELLI-${contentHash.slice(0, 24)}`;
  const dir = quarantineDir(root);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const artifactPath = path.join(dir, `${assetId}${ext}`);
  fs.writeFileSync(artifactPath, bytes, { mode: 0o600 });
  const manifest = {
    schema_version: 1,
    asset_id: assetId,
    provider: 'google-pomelli',
    source_mode: 'GOVERNED_MANUAL_EXPORT',
    source_url_hash: sourceUrl ? sha256(sourceUrl) : null,
    content_sha256: contentHash,
    extension: ext,
    byte_length: bytes.byteLength,
    contains_commercial_claim: containsCommercialClaim === true,
    ingested_by: String(actor),
    ingested_at: now(),
    state: 'QUARANTINED',
    gmpc_feature_refs: POMELLI_GMPC_FEATURES,
    lifecycle_authority: 'GMPC',
    publishable: false,
  };
  fs.writeFileSync(
    path.join(dir, `${assetId}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  return manifest;
}

export function recordPomelliHumanSessionAttestation({ root, actor = 'owner' } = {}) {
  const artifact = {
    provider: 'google-pomelli',
    observed_at: now(),
    authentication: {
      mode: 'HUMAN_GOOGLE_ACCOUNT_SESSION',
      verified_by_dial: false,
      owner_attested: true,
      session_material_stored: false,
      actor: String(actor),
    },
    live_qualification: { passed: false },
    orchestrated_use: { passed: false },
    definition_of_done: { passed: false, missing: ['staging_creative_slice'] },
    status: 'AUTHENTICATED',
    functional_owner: 'GMPC',
  };
  return persistCapabilityEvidence(root, POMELLI_CAPABILITY_ID, artifact);
}

export function qualifyPomelliWorkstation({ root } = {}) {
  const enabled = envBool('DIAL_POMELLI_INGEST_ENABLED', false);
  const futureApiEnabled = envBool('DIAL_POMELLI_API_ENABLED', false);
  if (futureApiEnabled) throw new Error('POMELLI_API_NOT_ADMITTED');
  return persistCapabilityEvidence(root, POMELLI_CAPABILITY_ID, {
    provider: 'google-pomelli',
    observed_at: now(),
    implementation: {
      manual_workstation_mode: true,
      ingest_enabled: enabled,
      browser_cookie_automation: false,
      ui_scraping_as_api: false,
      gmpc_owner: true,
    },
    authentication: {
      mode: 'HUMAN_GOOGLE_ACCOUNT_SESSION',
      verified_by_dial: false,
      session_material_stored: false,
    },
    live_qualification: { passed: false },
    orchestrated_use: { passed: false },
    definition_of_done: { passed: false, missing: ['owner_session_attestation', 'staging_creative_slice'] },
    status: enabled ? 'AUTH_REQUIRED' : 'IMPLEMENTED',
    functional_owner: 'GMPC',
  });
}
