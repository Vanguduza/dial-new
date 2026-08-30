import { describe, expect, it } from 'vitest';
import {
  agreementHash,
  assertGateOpen,
  publishAgreementVersion,
  supersedeAgreement,
  validateAcceptanceRecord,
  validateAgreementVersion,
  verifyAcceptanceAgainst,
  type AcceptanceRecord,
  type AgreementVersion,
  type GatedAction,
} from '../packages/round-agreement/src/agreement.js';

/**
 * GROC-F021 — Round agreement & consent gateway.
 *
 * Contract: 20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/GROC-F021_ACCEPTANCE_CONTRACT.md
 *
 * Fourteen acceptance criteria, each with its test below. The feature is a gate,
 * so most of these prove a refusal rather than a capability.
 */

const disclosures = {
  termsSummaryVersion: 'terms-2026-08-1',
  priceRiskVersion: 'pr-2026-08-1',
  exitTermsVersion: 'exit-2026-08-1',
  protectionVersion: 'cover-scope-2026-08-1',
  deliveryPolicyVersion: 'delivery-2026-08-1',
  refundPolicyVersion: 'refund-2026-08-1',
};

const version = (over: Partial<AgreementVersion> = {}): AgreementVersion => {
  const base = {
    agreementId: 'round-agreement',
    agreementType: 'GROCERY_ROUND',
    version: 1,
    body: 'Your payments buy grocery credits. Credits are not money.',
    disclosures,
    publishedAt: '2026-08-30T00:00:00Z',
    ...over,
  };
  return { ...base, hash: over.hash ?? agreementHash(base) };
};

const acceptance = (
  v: AgreementVersion,
  over: Partial<AcceptanceRecord> = {},
): AcceptanceRecord => ({
  acceptanceId: 'acc-0001',
  customerId: 'cus-0001',
  roundId: 'rnd-0001',
  agreementType: v.agreementType,
  agreementVersion: v.version,
  agreementHash: v.hash,
  termsSummaryVersion: v.disclosures.termsSummaryVersion,
  protectionDisclosureVersion: v.disclosures.protectionVersion,
  deliveryPolicyVersion: v.disclosures.deliveryPolicyVersion,
  refundPolicyVersion: v.disclosures.refundPolicyVersion,
  acceptedAt: '2026-08-30T09:15:00Z',
  sessionMetadata: { sessionId: 'ses-1', deviceId: 'dev-1', userAgent: 'DialApp/1.4 Android' },
  locale: 'en-ZW',
  applicationVersion: '1.4.0',
  ...over,
});

const rules = (findings: Array<{ rule: string }>): string[] => findings.map((f) => f.rule);
const ACTIONS: GatedAction[] = ['CREATE_ROUND', 'JOIN_ROUND', 'FIRST_PURCHASE'];

describe('criteria 1-3 — the three gated actions refuse without an acceptance', () => {
  // Master plan §6 admits no override, no operator bypass, and no acceptance
  // recorded outside the system.
  for (const action of ACTIONS) {
    it(`refuses ${action} with no acceptance at all`, () => {
      const v = version();
      const findings = assertGateOpen({
        action,
        roundId: 'rnd-0001',
        customerId: 'cus-0001',
        versionInForce: v,
        acceptance: null,
      });
      expect(rules(findings)).toContain('RAG-001');
      expect(findings[0]!.statement).toContain(action);
    });
  }

  it('refuses an acceptance given by another member, or for another Round', () => {
    const v = version();
    expect(
      rules(
        assertGateOpen({
          action: 'JOIN_ROUND',
          roundId: 'rnd-0001',
          customerId: 'cus-9999',
          versionInForce: v,
          acceptance: acceptance(v),
        }),
      ),
    ).toContain('RAG-001');
    expect(
      rules(
        assertGateOpen({
          action: 'JOIN_ROUND',
          roundId: 'rnd-9999',
          customerId: 'cus-0001',
          versionInForce: v,
          acceptance: acceptance(v),
        }),
      ),
    ).toContain('RAG-001');
  });
});

describe('criterion 4 — a valid acceptance opens each action', () => {
  for (const action of ACTIONS) {
    it(`opens ${action}`, () => {
      const v = version();
      expect(
        assertGateOpen({
          action,
          roundId: 'rnd-0001',
          customerId: 'cus-0001',
          versionInForce: v,
          acceptance: acceptance(v),
        }),
      ).toEqual([]);
    });
  }
});

describe('criterion 5 — the hash is derived from content', () => {
  it('is deterministic, so the same agreement always hashes the same', () => {
    expect(agreementHash(version())).toBe(agreementHash(version()));
  });

  it('changes when the body changes', () => {
    expect(agreementHash(version({ body: 'different' }))).not.toBe(agreementHash(version()));
  });

  it('changes when any single disclosure version changes', () => {
    const base = agreementHash(version());
    for (const key of Object.keys(disclosures) as Array<keyof typeof disclosures>) {
      const changed = version({ disclosures: { ...disclosures, [key]: 'moved' } });
      expect(agreementHash(changed), key).not.toBe(base);
    }
  });

  it('cannot be forged by a delimiter inside a field', () => {
    // A naive join would let these collapse to one hash, which would mean an
    // acceptance verifying against terms the member never saw.
    const a = agreementHash(version({ agreementId: 'round|8:agreement', agreementType: 'X' }));
    const b = agreementHash(version({ agreementId: 'round', agreementType: '8:agreement|X' }));
    expect(a).not.toBe(b);
  });
});

describe('criterion 6 — a tampered version is refused and voids its acceptances', () => {
  it('refuses a version whose stored hash does not match its content', () => {
    const findings = validateAgreementVersion(version({ hash: 'AGR-not-the-real-hash' }));
    expect(rules(findings)).toContain('RAG-003');
    expect(findings.find((f) => f.rule === 'RAG-003')!.statement).toMatch(/tampering/);
  });

  it('voids an acceptance when the version content is edited underneath it', () => {
    // The member accepted v1. Someone then edits v1's body in place, which §6.2
    // forbids. The acceptance carries the hash of what was actually shown, so it
    // stops verifying — which is the point.
    const shown = version();
    const accepted = acceptance(shown);
    const editedInPlace: AgreementVersion = { ...shown, body: 'quietly different terms' };

    const findings = verifyAcceptanceAgainst(accepted, editedInPlace);
    expect(rules(findings)).toContain('RAG-003');
    expect(findings.find((f) => f.rule === 'RAG-003')!.remedy).toMatch(/Establish which/);
  });

  it('closes the gate when the version has been edited underneath the acceptance', () => {
    const shown = version();
    const accepted = acceptance(shown);
    const editedInPlace: AgreementVersion = { ...shown, body: 'quietly different terms' };
    expect(
      rules(
        assertGateOpen({
          action: 'FIRST_PURCHASE',
          roundId: 'rnd-0001',
          customerId: 'cus-0001',
          versionInForce: editedInPlace,
          acceptance: accepted,
        }),
      ),
    ).toContain('RAG-003');
  });
});

describe('criterion 7 — an incomplete acceptance record is refused, by field', () => {
  it('names each missing §6.2 field', () => {
    const v = version();
    const fields: Array<keyof AcceptanceRecord> = [
      'acceptanceId',
      'customerId',
      'roundId',
      'agreementType',
      'agreementHash',
      'termsSummaryVersion',
      'protectionDisclosureVersion',
      'deliveryPolicyVersion',
      'refundPolicyVersion',
      'acceptedAt',
      'locale',
      'applicationVersion',
    ];
    for (const field of fields) {
      const findings = validateAcceptanceRecord(acceptance(v, { [field]: '' } as Partial<AcceptanceRecord>));
      expect(rules(findings), field).toContain('RAG-002');
      expect(findings.some((f) => f.observed?.startsWith(`${field}=`)), field).toBe(true);
    }
  });

  it('refuses a record with no session or device metadata', () => {
    const v = version();
    const findings = validateAcceptanceRecord(
      acceptance(v, { sessionMetadata: { sessionId: '', deviceId: '', userAgent: '' } }),
    );
    expect(rules(findings)).toContain('RAG-002');
  });

  it('accepts a complete record', () => {
    expect(validateAcceptanceRecord(acceptance(version()))).toEqual([]);
  });
});

describe('criteria 8-10 — the locked decisions must be present, by version', () => {
  const cases: Array<[keyof typeof disclosures, string, RegExp]> = [
    ['priceRiskVersion', 'RAG-005', /DEC-002/],
    ['exitTermsVersion', 'RAG-006', /DEC-005/],
    ['protectionVersion', 'RAG-007', /DEC-006/],
  ];

  for (const [key, rule, why] of cases) {
    it(`refuses publishing without ${key}`, () => {
      const { findings } = publishAgreementVersion({
        agreementId: 'round-agreement',
        agreementType: 'GROCERY_ROUND',
        version: 1,
        body: 'text',
        disclosures: { ...disclosures, [key]: '' },
        publishedAt: '2026-08-30T00:00:00Z',
      });
      expect(rules(findings)).toContain(rule);
      expect(findings.find((f) => f.rule === rule)!.statement).toMatch(why);
    });
  }

  it('publishes cleanly when every disclosure is present', () => {
    const { version: published, findings } = publishAgreementVersion({
      agreementId: 'round-agreement',
      agreementType: 'GROCERY_ROUND',
      version: 1,
      body: 'text',
      disclosures,
      publishedAt: '2026-08-30T00:00:00Z',
    });
    expect(findings).toEqual([]);
    expect(published.hash).toBe(agreementHash(published));
  });

  it('states a remedy on every refusal it can raise', () => {
    const { findings } = publishAgreementVersion({
      agreementId: 'round-agreement',
      agreementType: 'GROCERY_ROUND',
      version: 0,
      body: 'text',
      disclosures: { ...disclosures, priceRiskVersion: '', exitTermsVersion: '' },
      publishedAt: '2026-08-30T00:00:00Z',
    });
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.severity).toBe('REFUSE');
      expect(finding.remedy.length).toBeGreaterThan(20);
    }
  });
});

describe('criteria 11-13 — supersession creates, it does not overwrite', () => {
  it('produces a new version with a different hash', () => {
    const v1 = version();
    const { next } = supersedeAgreement(v1, { body: 'revised terms' }, '2026-09-15T00:00:00Z');
    expect(next.version).toBe(2);
    expect(next.hash).not.toBe(v1.hash);
    expect(validateAgreementVersion(next)).toEqual([]);
  });

  it('leaves the prior version content untouched', () => {
    // §6.2: material terms must never be retroactively overwritten.
    const v1 = version();
    const before = { ...v1 };
    const { previous } = supersedeAgreement(v1, { body: 'revised terms' }, '2026-09-15T00:00:00Z');
    expect(v1).toEqual(before);
    expect(previous.body).toBe(before.body);
    expect(previous.hash).toBe(before.hash);
    expect(previous.supersededAt).toBe('2026-09-15T00:00:00Z');
  });

  it('closes the gate for a member holding only the superseded version', () => {
    const v1 = version();
    const accepted = acceptance(v1);
    const { next } = supersedeAgreement(v1, { body: 'revised terms' }, '2026-09-15T00:00:00Z');

    const findings = assertGateOpen({
      action: 'FIRST_PURCHASE',
      roundId: 'rnd-0001',
      customerId: 'cus-0001',
      versionInForce: next,
      acceptance: accepted,
    });
    expect(rules(findings)).toContain('RAG-009');
    expect(findings.find((f) => f.rule === 'RAG-009')!.observed).toContain('accepted v1');
  });

  it('keeps the old acceptance verifiable against the version it accepted', () => {
    // The member did agree to v1. Supersession does not unmake that.
    const v1 = version();
    const accepted = acceptance(v1);
    const { previous } = supersedeAgreement(v1, { body: 'revised terms' }, '2026-09-15T00:00:00Z');
    expect(verifyAcceptanceAgainst(accepted, previous)).toEqual([]);
  });

  it('reopens the gate once the member accepts the version in force', () => {
    const v1 = version();
    const { next } = supersedeAgreement(v1, { body: 'revised terms' }, '2026-09-15T00:00:00Z');
    expect(
      assertGateOpen({
        action: 'FIRST_PURCHASE',
        roundId: 'rnd-0001',
        customerId: 'cus-0001',
        versionInForce: next,
        acceptance: acceptance(next),
      }),
    ).toEqual([]);
  });
});

describe('criterion 14 — a mismatched hash voids an otherwise perfect record', () => {
  it('refuses when only the hash is wrong', () => {
    const v = version();
    const findings = verifyAcceptanceAgainst(acceptance(v, { agreementHash: agreementHash(version({ body: 'other' })) }), v);
    expect(rules(findings)).toContain('RAG-003');
  });

  it('refuses verification against a version the record does not name', () => {
    const v1 = version();
    const { next } = supersedeAgreement(v1, { body: 'revised' }, '2026-09-15T00:00:00Z');
    expect(rules(verifyAcceptanceAgainst(acceptance(v1), next))).toContain('RAG-010');
  });
});
