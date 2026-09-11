import { describe, expect, it } from 'vitest';
import {
  applyPomelliReview,
  approvePomelliAsset,
  bindPomelliCommercialSnapshot,
  buildSanitizedBusinessDna,
  createPomelliAssetManifest,
  pomelliPublicationEligibility,
  revokePomelliAsset,
} from '../packages/gmpc-creative-providers/src/pomelli.js';

describe('GMPC Pomelli production creative boundary', () => {
  it('builds only sanitized non-customer Business DNA', () => {
    const dna = buildSanitizedBusinessDna({
      brandName: 'DIAL',
      brandPromise: 'Convenient access to help',
      audiences: ['motorists', 'households'],
      tone: ['clear', 'helpful'],
    });
    expect(dna.sourceClass).toBe('SANITIZED_NON_CUSTOMER_BRAND_CONTEXT');
    expect(dna.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses customer or secret-shaped data in Business DNA', () => {
    expect(() => buildSanitizedBusinessDna({ brandName: 'DIAL', customerEmail: 'a@example.com' }))
      .toThrow(/GMPC_BUSINESS_DNA_FORBIDDEN_DATA/);
  });
  it('keeps a new provider asset quarantined and non-publishable', () => {
    const manifest = createPomelliAssetManifest({
      bytes: Buffer.from('creative'),
      mediaType: 'image/png',
    });
    expect(manifest.provider).toBe('google-pomelli');
    expect(manifest.state).toBe('QUARANTINED');
    expect(manifest.publishable).toBe(false);
  });

  it('requires every review before a non-commercial asset can publish', () => {
    let manifest = createPomelliAssetManifest({ bytes: Buffer.from('creative'), mediaType: 'image/png' });
    manifest = applyPomelliReview(manifest, 'product_fidelity', 'ACCEPTED', 'EV-FIDELITY');
    manifest = applyPomelliReview(manifest, 'brand_conformance', 'ACCEPTED', 'EV-BRAND');
    manifest = applyPomelliReview(manifest, 'claims', 'NOT_APPLICABLE', 'EV-NO-CLAIMS');
    manifest = applyPomelliReview(manifest, 'rights', 'ACCEPTED', 'EV-RIGHTS');
    manifest = applyPomelliReview(manifest, 'commercial_binding', 'NOT_APPLICABLE', 'EV-NO-COMMERCIAL');
    expect(pomelliPublicationEligibility(manifest).allowed).toBe(true);
    const approved = approvePomelliAsset(manifest);
    expect(approved.state).toBe('APPROVED');
    expect(approved.publishable).toBe(true);
  });
  it('refuses a commercial creative until it binds a canonical GMPC snapshot', () => {
    let manifest = createPomelliAssetManifest({
      bytes: Buffer.from('sale creative'),
      mediaType: 'image/png',
      containsCommercialClaim: true,
    });
    manifest = applyPomelliReview(manifest, 'product_fidelity', 'ACCEPTED', 'EV-FIDELITY');
    manifest = applyPomelliReview(manifest, 'brand_conformance', 'ACCEPTED', 'EV-BRAND');
    manifest = applyPomelliReview(manifest, 'claims', 'ACCEPTED', 'EV-CLAIMS');
    manifest = applyPomelliReview(manifest, 'rights', 'ACCEPTED', 'EV-RIGHTS');
    expect(pomelliPublicationEligibility(manifest).reasons)
      .toContain('COMMERCIAL_CLAIM_WITHOUT_CANONICAL_SNAPSHOT');
    manifest = bindPomelliCommercialSnapshot(manifest, {
      promotionRef: 'GMPC-PROMO-001',
      snapshotSha256: 'a'.repeat(64),
    });
    expect(pomelliPublicationEligibility(manifest).allowed).toBe(true);
  });

  it('makes revocation override previous approval without deleting provenance', () => {
    let manifest = createPomelliAssetManifest({ bytes: Buffer.from('creative'), mediaType: 'image/png' });
    for (const review of ['product_fidelity', 'brand_conformance', 'rights'] as const) {
      manifest = applyPomelliReview(manifest, review, 'ACCEPTED', `EV-${review}`);
    }
    manifest = applyPomelliReview(manifest, 'claims', 'NOT_APPLICABLE', 'EV-NO-CLAIMS');
    manifest = applyPomelliReview(manifest, 'commercial_binding', 'NOT_APPLICABLE', 'EV-NO-COMMERCIAL');
    const approved = approvePomelliAsset(manifest);
    const revoked = revokePomelliAsset(approved, 'campaign withdrawn');
    expect(revoked.publishable).toBe(false);
    expect(revoked.state).toBe('REVOKED');
    expect(revoked.contentSha256).toBe(approved.contentSha256);
  });
});
