import crypto from 'node:crypto';

export type PomelliReviewType =
  | 'product_fidelity'
  | 'brand_conformance'
  | 'claims'
  | 'rights'
  | 'commercial_binding';
export type ReviewDecision = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'NOT_APPLICABLE';
export type PomelliAssetState = 'QUARANTINED' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'EXPIRED';

export interface BusinessDnaInput {
  brandName: string;
  brandPromise?: string;
  audiences?: string[];
  tone?: string[];
  visualPrinciples?: string[];
  productFamilies?: string[];
  prohibitedClaims?: string[];
  [key: string]: unknown;
}

export interface SanitizedBusinessDna {
  schemaVersion: 1;
  brandName: string;
  brandPromise: string;
  audiences: string[];
  tone: string[];
  visualPrinciples: string[];
  productFamilies: string[];
  prohibitedClaims: string[];
  sourceClass: 'SANITIZED_NON_CUSTOMER_BRAND_CONTEXT';
  sha256: string;
}
export interface CommercialBinding {
  productRef?: string;
  promotionRef?: string;
  snapshotSha256: string;
  boundAt: string;
}

export interface CreativeAssetManifest {
  schemaVersion: 1;
  assetId: string;
  provider: 'google-pomelli';
  sourceMode: 'GOVERNED_MANUAL_EXPORT';
  contentSha256: string;
  byteLength: number;
  mediaType: string;
  createdAt: string;
  expiresAt?: string;
  containsCommercialClaim: boolean;
  state: PomelliAssetState;
  reviews: Record<PomelliReviewType, ReviewDecision>;
  reviewEvidence: Partial<Record<PomelliReviewType, string>>;
  commercialBinding?: CommercialBinding;
  publishable: boolean;
  revokedAt?: string;
  revocationReason?: string;
}

export interface PublicationEligibility {
  allowed: boolean;
  reasons: string[];
}

const FORBIDDEN_KEY = /(customer|user|patient|claimant|email|phone|address|diagnosis|payment|card|account|password|token|secret|api.?key|private.?key|session|cookie)/i;
const FORBIDDEN_VALUE = /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\+?\d[\d\s-]{7,}|(?:api[_-]?key|token|secret|password)\s*[:=])/i;
const SHA256 = /^[0-9a-f]{64}$/i;

function hash(value: Buffer | string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function scanForbidden(value: unknown, path = 'root'): string[] {
  const findings: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...scanForbidden(item, `${path}[${index}]`)));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const location = `${path}.${key}`;
      if (FORBIDDEN_KEY.test(key)) findings.push(`FORBIDDEN_KEY:${location}`);
      findings.push(...scanForbidden(item, location));
    }
  } else if (typeof value === 'string' && FORBIDDEN_VALUE.test(value)) {
    findings.push(`FORBIDDEN_VALUE:${path}`);
  }
  return findings;
}

function cleanList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
}

export function buildSanitizedBusinessDna(input: BusinessDnaInput): SanitizedBusinessDna {
  const findings = scanForbidden(input);
  if (findings.length) throw new Error(`GMPC_BUSINESS_DNA_FORBIDDEN_DATA:${findings.join(',')}`);
  const base = {
    schemaVersion: 1 as const,
    brandName: String(input.brandName || 'DIAL').trim(),
    brandPromise: String(input.brandPromise || '').trim(),
    audiences: cleanList(input.audiences),
    tone: cleanList(input.tone),
    visualPrinciples: cleanList(input.visualPrinciples),
    productFamilies: cleanList(input.productFamilies),
    prohibitedClaims: cleanList(input.prohibitedClaims),
    sourceClass: 'SANITIZED_NON_CUSTOMER_BRAND_CONTEXT' as const,
  };
  return { ...base, sha256: hash(JSON.stringify(base)) };
}
export function createPomelliAssetManifest(input: {
  bytes: Buffer;
  mediaType: string;
  createdAt?: string;
  expiresAt?: string;
  containsCommercialClaim?: boolean;
}): CreativeAssetManifest {
  const createdAt = input.createdAt || new Date().toISOString();
  const contentSha256 = hash(input.bytes);
  return {
    schemaVersion: 1,
    assetId: `POMELLI-${contentSha256.slice(0, 24)}`,
    provider: 'google-pomelli',
    sourceMode: 'GOVERNED_MANUAL_EXPORT',
    contentSha256,
    byteLength: input.bytes.byteLength,
    mediaType: String(input.mediaType || 'application/octet-stream'),
    createdAt,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    containsCommercialClaim: input.containsCommercialClaim === true,
    state: 'QUARANTINED',
    reviews: {
      product_fidelity: 'PENDING',
      brand_conformance: 'PENDING',
      claims: 'PENDING',
      rights: 'PENDING',
      commercial_binding: 'PENDING',
    },
    reviewEvidence: {},
    publishable: false,
  };
}

function cloneManifest(manifest: CreativeAssetManifest): CreativeAssetManifest {
  return structuredClone(manifest);
}

function acceptedOrNA(value: ReviewDecision): boolean {
  return value === 'ACCEPTED' || value === 'NOT_APPLICABLE';
}
export function applyPomelliReview(
  manifest: CreativeAssetManifest,
  review: PomelliReviewType,
  decision: Exclude<ReviewDecision, 'PENDING'>,
  evidenceRef: string,
): CreativeAssetManifest {
  if (!evidenceRef.trim()) throw new Error('GMPC_POMELLI_REVIEW_EVIDENCE_REQUIRED');
  if (manifest.state === 'REVOKED' || manifest.state === 'EXPIRED') {
    throw new Error('GMPC_POMELLI_ASSET_NOT_REVIEWABLE');
  }
  const next = cloneManifest(manifest);
  next.reviews[review] = decision;
  next.reviewEvidence[review] = evidenceRef.trim();
  if (Object.values(next.reviews).some((value) => value === 'REJECTED')) {
    next.state = 'REJECTED';
    next.publishable = false;
  } else {
    next.state = 'QUARANTINED';
    next.publishable = false;
  }
  return next;
}

export function bindPomelliCommercialSnapshot(
  manifest: CreativeAssetManifest,
  input: { productRef?: string; promotionRef?: string; snapshotSha256: string; boundAt?: string },
): CreativeAssetManifest {
  if (!SHA256.test(input.snapshotSha256)) throw new Error('GMPC_COMMERCIAL_SNAPSHOT_HASH_INVALID');
  if (!input.productRef && !input.promotionRef) throw new Error('GMPC_COMMERCIAL_BINDING_TARGET_REQUIRED');
  const next = cloneManifest(manifest);
  next.commercialBinding = {
    ...(input.productRef ? { productRef: input.productRef } : {}),
    ...(input.promotionRef ? { promotionRef: input.promotionRef } : {}),
    snapshotSha256: input.snapshotSha256.toLowerCase(),
    boundAt: input.boundAt || new Date().toISOString(),
  };
  next.reviews.commercial_binding = 'ACCEPTED';
  next.reviewEvidence.commercial_binding = `snapshot:${next.commercialBinding.snapshotSha256}`;
  return next;
}
export function pomelliPublicationEligibility(
  manifest: CreativeAssetManifest,
  at = new Date(),
): PublicationEligibility {
  const reasons: string[] = [];
  if (manifest.state === 'REVOKED') reasons.push('ASSET_REVOKED');
  if (manifest.state === 'REJECTED') reasons.push('ASSET_REJECTED');
  if (manifest.expiresAt && new Date(manifest.expiresAt).getTime() <= at.getTime()) reasons.push('ASSET_EXPIRED');
  for (const [review, decision] of Object.entries(manifest.reviews) as [PomelliReviewType, ReviewDecision][]) {
    if (!acceptedOrNA(decision)) reasons.push(`REVIEW_NOT_ACCEPTED:${review}:${decision}`);
  }
  if (manifest.containsCommercialClaim && !manifest.commercialBinding) {
    reasons.push('COMMERCIAL_CLAIM_WITHOUT_CANONICAL_SNAPSHOT');
  }
  if (manifest.containsCommercialClaim && manifest.reviews.commercial_binding !== 'ACCEPTED') {
    reasons.push('COMMERCIAL_BINDING_REVIEW_NOT_ACCEPTED');
  }
  return { allowed: reasons.length === 0, reasons };
}

export function approvePomelliAsset(
  manifest: CreativeAssetManifest,
  approvedAt = new Date(),
): CreativeAssetManifest {
  const check = pomelliPublicationEligibility(manifest, approvedAt);
  if (!check.allowed) throw new Error(`GMPC_POMELLI_APPROVAL_REFUSED:${check.reasons.join(',')}`);
  const next = cloneManifest(manifest);
  next.state = 'APPROVED';
  next.publishable = true;
  return next;
}

export function revokePomelliAsset(
  manifest: CreativeAssetManifest,
  reason: string,
  revokedAt = new Date().toISOString(),
): CreativeAssetManifest {
  if (!reason.trim()) throw new Error('GMPC_POMELLI_REVOCATION_REASON_REQUIRED');
  const next = cloneManifest(manifest);
  next.state = 'REVOKED';
  next.publishable = false;
  next.revokedAt = revokedAt;
  next.revocationReason = reason.trim();
  return next;
}
