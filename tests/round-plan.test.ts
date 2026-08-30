import { describe, expect, it } from 'vitest';
import {
  composeCreditProduct,
  monthsBetween,
  validateRoundConfiguration,
  validateRoundProduct,
  type RoundConfiguration,
  type RoundPlan,
} from '../packages/round-plan/src/plan.js';

/**
 * GROC-F019 — Round plans & configuration.
 *
 * Contract: 20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/GROC-F019_ACCEPTANCE_CONTRACT.md
 *
 * The thing under test is a sentence: a Round configuration is a choice inside a
 * plan's bounds, never a free-form document. Most of these prove a refusal.
 */

const plan = (over: Partial<RoundPlan> = {}): RoundPlan => ({
  planId: 'household-6m',
  family: 'HOUSEHOLD',
  contributionFrequency: 'MONTHLY',
  contributionMinorMin: 5_000,
  contributionMinorMax: 10_000,
  durationMonthsMin: 6,
  durationMonthsMax: 6,
  memberFloor: 10,
  memberCeiling: 200,
  votingThresholdBasisPointsMin: 5_001,
  votingThresholdBasisPointsMax: 7_500,
  allowedBasketModes: ['GROUP_VOTE', 'GUIDED_STAPLES'],
  creditPosture: {
    creditScope: 'GROCERY_FULFILMENT',
    pools: [
      {
        poolId: 'staples',
        taxClass: 'EXEMPT_BASIC_FOODSTUFFS',
        allocationBasisPoints: 7_000,
        minAllocationBasisPoints: 5_000,
        maxAllocationBasisPoints: 10_000,
        catalogue: [{ itemId: 'mealie-meal-10kg', taxClass: 'EXEMPT_BASIC_FOODSTUFFS' }],
      },
      {
        poolId: 'household',
        taxClass: 'STANDARD_RATED_MIXED',
        allocationBasisPoints: 3_000,
        minAllocationBasisPoints: 0,
        maxAllocationBasisPoints: 5_000,
        catalogue: [{ itemId: 'washing-powder-1kg', taxClass: 'STANDARD_RATED_MIXED' }],
      },
    ],
    allocationFixedAtPayment: true,
    poolsAuthoredBy: 'DIAL',
    memberSplitPolicy: 'MEMBER_CHOSEN',
    votingWeightBasis: 'POOL_CREDITS',
    standardRateBasisPoints: 1_550,
    taxPoint: 'CREDIT_ISSUE',
    deferralRulingRef: null,
    fiscalisationModel: 'SINGLE_RECEIPT_AT_ISSUE',
    inputTaxApportionmentMethod: 'DIRECT_ATTRIBUTION',
    transferTaxBasisPoints: 200,
    taxScheduleRef: 'zw-vat-2026-01',
    denomination: 'CURRENCY',
    exitPricing: 'STANDARD_RETAIL',
    exitIncludesRoundBenefits: false,
    protectionLevy: {
      basisPoints: 400,
      separatelyDeclared: true,
      deductedFromCreditValue: false,
      presentedAsMemberPremium: false,
      rateBasis: { kind: 'RESEARCHED_POSITION', ref: 'protection-legal-research-v1' },
      coverBoundRef: 'pol-2026-nd-0117',
      scopeDisclosureVersion: 'cover-scope-2026-08-1',
    },
    priceRiskDisclosureVersion: 'pr-2026-08-1',
    consentGatewayVersion: 'gw-2026-08-1',
    consentCoversCreditConstruct: true,
    transferable: false,
    redeemableForMoney: false,
    settlementTargets: ['GROCERY_FULFILMENT'],
    collectionModel: 'AUTHORISED_COLLECTION',
    exitOutcomes: ['IMMEDIATE_GROCERY_ORDER', 'CARRY_TO_NEXT_ROUND'],
    exitRequiresGroupVote: false,
    creditOwnership: 'MEMBER',
    revenueRecognisedAt: 'SETTLEMENT',
    procurementReservePercent: 0,
    commercialStage: 'DEVELOPMENT',
  },
  ...over,
});

const config = (over: Partial<RoundConfiguration> = {}): RoundConfiguration => ({
  roundId: 'rnd-0001',
  planId: 'household-6m',
  name: 'Mbare Family Round',
  contributionMinor: 5_000,
  durationMonths: 6,
  startDate: '2026-09-01',
  maturityDate: '2027-03-01',
  joinCutoffDate: '2026-10-01',
  minMembers: 20,
  maxMembers: 100,
  visibility: 'PUBLIC',
  membershipMode: 'REQUEST_TO_JOIN',
  deliveryZoneId: 'zone-harare-central',
  basketMode: 'GROUP_VOTE',
  votingThresholdBasisPoints: 6_000,
  ...over,
});

const rules = (r: { findings: Array<{ rule: string }> }): string[] => r.findings.map((f) => f.rule);

describe('a configuration inside every bound', () => {
  it('opens', () => {
    const result = validateRoundConfiguration(config(), plan());
    expect(result.findings).toEqual([]);
    expect(result.conformant).toBe(true);
  });

  it('reports every problem at once, not the first', () => {
    // A creator should fix one form once, rather than discover four times that
    // their configuration is wrong.
    const result = validateRoundConfiguration(
      config({ contributionMinor: 1, durationMonths: 99, minMembers: 500, deliveryZoneId: '' }),
      plan(),
    );
    expect(result.findings.length).toBeGreaterThanOrEqual(4);
    for (const finding of result.findings) {
      expect(finding.severity).toBe('REFUSE');
      expect(finding.remedy.length).toBeGreaterThan(20);
    }
  });

  it('refuses a configuration validated against the wrong plan', () => {
    expect(rules(validateRoundConfiguration(config({ planId: 'starter-3m' }), plan()))).toContain('RPL-001');
  });
});

describe('criteria 1-3 — contribution and duration', () => {
  it('refuses a contribution below the plan minimum, naming the bound', () => {
    const result = validateRoundConfiguration(config({ contributionMinor: 4_999 }), plan());
    expect(rules(result)).toContain('RPL-003');
    expect(result.findings.find((f) => f.rule === 'RPL-003')!.remedy).toContain('5000');
  });

  it('refuses a contribution above the plan maximum', () => {
    expect(rules(validateRoundConfiguration(config({ contributionMinor: 10_001 }), plan()))).toContain('RPL-003');
  });

  it('accepts both ends of the band', () => {
    expect(validateRoundConfiguration(config({ contributionMinor: 5_000 }), plan()).conformant).toBe(true);
    expect(validateRoundConfiguration(config({ contributionMinor: 10_000 }), plan()).conformant).toBe(true);
  });

  it('refuses a duration outside the allowed product range', () => {
    expect(
      rules(
        validateRoundConfiguration(
          config({ durationMonths: 9, maturityDate: '2027-06-01' }),
          plan(),
        ),
      ),
    ).toContain('RPL-004');
  });
});

describe('criterion 4 — dates must fit the cadence', () => {
  it('counts whole months only', () => {
    expect(monthsBetween('2026-09-01', '2027-03-01')).toBe(6);
    // Started on the 20th, maturing on the 14th: the last cycle has not run.
    expect(monthsBetween('2026-09-20', '2027-03-14')).toBe(5);
    expect(monthsBetween('not-a-date', '2027-03-01')).toBeNull();
  });

  it('refuses a maturity that leaves no room for the last instalment', () => {
    const result = validateRoundConfiguration(config({ maturityDate: '2027-02-01' }), plan());
    expect(rules(result)).toContain('RPL-005');
    expect(result.findings.find((f) => f.rule === 'RPL-005')!.observed).toContain('5 between');
  });

  it('refuses an unparseable date', () => {
    expect(rules(validateRoundConfiguration(config({ maturityDate: 'soon' }), plan()))).toContain('RPL-005');
  });
});

describe('criteria 5-6 — the join cut-off', () => {
  it('refuses a cut-off at or after maturity', () => {
    // §5.4's cut-off exists to prevent late-join entitlement ambiguity.
    expect(rules(validateRoundConfiguration(config({ joinCutoffDate: '2027-03-01' }), plan()))).toContain('RPL-006');
    expect(rules(validateRoundConfiguration(config({ joinCutoffDate: '2027-04-01' }), plan()))).toContain('RPL-006');
  });

  it('refuses a cut-off before the Round opens', () => {
    expect(rules(validateRoundConfiguration(config({ joinCutoffDate: '2026-08-01' }), plan()))).toContain('RPL-006');
  });

  it('accepts a cut-off on the start date', () => {
    expect(validateRoundConfiguration(config({ joinCutoffDate: '2026-09-01' }), plan()).conformant).toBe(true);
  });
});

describe('criteria 7-8 — membership bounds', () => {
  it('refuses a minimum above the maximum', () => {
    expect(rules(validateRoundConfiguration(config({ minMembers: 120, maxMembers: 100 }), plan()))).toContain('RPL-007');
  });

  it('refuses bounds outside the plan’s floor and ceiling', () => {
    expect(rules(validateRoundConfiguration(config({ minMembers: 5 }), plan()))).toContain('RPL-008');
    expect(rules(validateRoundConfiguration(config({ maxMembers: 500 }), plan()))).toContain('RPL-008');
  });
});

describe('criterion 9 — a creator configures commerce, never tax', () => {
  it('refuses a configuration carrying pools, a tax class or a catalogue', () => {
    // Silently ignoring these is how a creator believes they set something they
    // did not, and then a VAT return is wrong with nobody aware.
    const result = validateRoundConfiguration(
      config({ basketTaxClass: 'STANDARD_RATED_MIXED', catalogue: [{ itemId: 'soft-drinks' }] }),
      plan(),
    );
    expect(rules(result)).toContain('RPL-009');
    const finding = result.findings.find((f) => f.rule === 'RPL-009')!;
    expect(finding.observed).toContain('basketTaxClass');
    expect(finding.observed).toContain('catalogue');
    expect(finding.remedy).toMatch(/RCM-026/);
  });

  it('accepts a configuration that declares none of them', () => {
    expect(validateRoundConfiguration(config(), plan()).conformant).toBe(true);
  });
});

describe('criterion 10 — voting thresholds are centrally bounded', () => {
  it('refuses a threshold below the governance floor', () => {
    // Review finding M4: otherwise a minority is configured into binding the majority.
    expect(rules(validateRoundConfiguration(config({ votingThresholdBasisPoints: 3_000 }), plan()))).toContain('RPL-010');
  });

  it('refuses a threshold above the ceiling', () => {
    expect(rules(validateRoundConfiguration(config({ votingThresholdBasisPoints: 9_000 }), plan()))).toContain('RPL-010');
  });

  it('accepts a simple majority inside the band', () => {
    expect(validateRoundConfiguration(config({ votingThresholdBasisPoints: 5_001 }), plan()).conformant).toBe(true);
  });
});

describe('criteria 11-12 — coherence', () => {
  it('refuses a private Round that anyone may join', () => {
    expect(
      rules(validateRoundConfiguration(config({ visibility: 'PRIVATE', membershipMode: 'OPEN' }), plan())),
    ).toContain('RPL-011');
  });

  it('accepts a private Round joined by invitation', () => {
    expect(
      validateRoundConfiguration(config({ visibility: 'PRIVATE', membershipMode: 'INVITATION' }), plan()).conformant,
    ).toBe(true);
  });

  it('refuses a Round with no delivery zone', () => {
    expect(rules(validateRoundConfiguration(config({ deliveryZoneId: '  ' }), plan()))).toContain('RPL-012');
  });

  it('refuses a basket mode the plan does not allow', () => {
    expect(rules(validateRoundConfiguration(config({ basketMode: 'CURATED_TEMPLATE' }), plan()))).toContain('RPL-013');
  });
});

describe('criteria 13-14 — the configuration must compose to a conformant Round', () => {
  it('takes the instalment count from the duration', () => {
    // Two fields that must agree are one field with extra steps, and RCM-022
    // needs it to price transfer tax.
    expect(composeCreditProduct(config({ durationMonths: 6 }), plan()).instalmentCount).toBe(6);
  });

  it('opens when the composed credit product is conformant', () => {
    const result = validateRoundProduct(config(), plan());
    expect(result.findings).toEqual([]);
    expect(result.conformant).toBe(true);
  });

  it('surfaces the credit model’s own findings rather than summarising them', () => {
    // A creator told "your Round is invalid" cannot act. One told which rule and
    // what to do can.
    const broken = plan({
      creditPosture: { ...plan().creditPosture, redeemableForMoney: true, transferable: true },
    });
    const result = validateRoundProduct(config(), broken);
    expect(rules(result)).toContain('RCM-002');
    expect(rules(result)).toContain('RCM-003');
    expect(result.conformant).toBe(false);
  });

  it('refuses a plan whose posture would let a credit leave groceries', () => {
    const leaky = plan({
      creditPosture: { ...plan().creditPosture, settlementTargets: ['GROCERY_FULFILMENT', 'SPARES'] },
    });
    expect(rules(validateRoundProduct(config(), leaky))).toContain('RCM-015');
  });

  it('carries both its own findings and the credit model’s together', () => {
    const leaky = plan({
      creditPosture: { ...plan().creditPosture, settlementTargets: [] },
    });
    const result = validateRoundProduct(config({ deliveryZoneId: '' }), leaky);
    expect(rules(result)).toContain('RPL-012');
    expect(rules(result)).toContain('RCM-015');
  });
});
