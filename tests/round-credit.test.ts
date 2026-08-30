import { describe, expect, it } from 'vitest';
import {
  assertContractLiabilityInvariant,
  assertCreditSpend,
  projectCreditLedger,
  resolveExit,
  validateRoundCreditModel,
  type CreditLedgerEvent,
  type RoundCreditConfiguration,
} from '../packages/round-credit/src/credit-model.js';

/**
 * The Round credit model — `25_GROCERY_ROUNDS/ROUND_CREDIT_MODEL_v1.md`.
 *
 * The decision is that a subscription buys credits which are not money, are not
 * redeemable in money, and are not transferable, making the issue a taxable
 * supply rather than a deposit. Everything here exists because that position
 * holds only while the code enforces it.
 */

const conformant = (over: Partial<RoundCreditConfiguration> = {}): RoundCreditConfiguration => ({
  roundProductId: 'staples-6m',
  creditScope: 'GROCERY_FULFILMENT',
  basketTaxClass: 'ZERO_RATED_STAPLES',
  taxPoint: 'CREDIT_ISSUE',
  denomination: 'GOODS',
  priceRiskDisclosureVersion: null,
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
  ballotOptions: [
    { optionId: 'mealie-meal-10kg', taxClass: 'ZERO_RATED_STAPLES' },
    { optionId: 'cooking-oil-2l', taxClass: 'ZERO_RATED_STAPLES' },
  ],
  ...over,
});

const rulesFrom = (config: RoundCreditConfiguration): string[] =>
  validateRoundCreditModel(config).findings.map((f) => f.rule);

describe('a conformant Round product', () => {
  it('opens', () => {
    const result = validateRoundCreditModel(conformant());
    expect(result.findings).toEqual([]);
    expect(result.conformant).toBe(true);
  });

  it('states a remedy on every refusal it can raise', () => {
    // A finding that names a problem without naming the fix gets argued about.
    const result = validateRoundCreditModel(
      conformant({
        creditScope: 'ANY',
        redeemableForMoney: true,
        transferable: true,
        basketTaxClass: null,
        procurementReservePercent: null,
      }),
    );
    expect(result.findings.length).toBeGreaterThan(0);
    for (const finding of result.findings) {
      expect(finding.severity).toBe('REFUSE');
      expect(finding.remedy.length).toBeGreaterThan(20);
      expect(finding.statement.length).toBeGreaterThan(20);
    }
  });
});

describe('closed loop', () => {
  it('refuses a credit that can settle another trade', () => {
    // Dial is a multi-trade marketplace. A grocery credit spendable on a spare
    // part is a general means of payment, and ACT-REG-001 reopens on worse facts.
    expect(rulesFrom(conformant({ settlementTargets: ['GROCERY_FULFILMENT', 'SPARES'] }))).toContain(
      'RCM-015',
    );
    expect(rulesFrom(conformant({ settlementTargets: [] }))).toContain('RCM-015');
  });

  it('refuses a scope other than grocery fulfilment', () => {
    expect(rulesFrom(conformant({ creditScope: 'WALLET' }))).toContain('RCM-001');
  });

  it('refuses redeemability in money', () => {
    expect(rulesFrom(conformant({ redeemableForMoney: true }))).toContain('RCM-002');
  });

  it('refuses a spend outside groceries at the point of use, not only at configuration', () => {
    // The Round that opens correctly is not the thing that later pays for a part.
    expect(() => assertCreditSpend({ scope: 'GROCERY_FULFILMENT', division: 'GROCERIES' })).not.toThrow();
    expect(() => assertCreditSpend({ scope: 'GROCERY_FULFILMENT', division: 'SPARES' })).toThrow(/RCM-015/);
    expect(() => assertCreditSpend({ scope: 'PAYMENT', division: 'GROCERIES' })).toThrow(
      /payment instrument/,
    );
  });
});

describe('non-transferability', () => {
  it('refuses transferable credits', () => {
    expect(rulesFrom(conformant({ transferable: true }))).toContain('RCM-003');
  });

  it('refuses household sharing implemented as a credit transfer', () => {
    // Otherwise Dial has built a transfer rail while its terms deny one.
    expect(rulesFrom(conformant({ collectionModel: 'CREDIT_TRANSFER' }))).toContain('RCM-004');
  });
});

describe('the tax rate is determinate at the tax point', () => {
  it('refuses a Round with no declared basket tax class', () => {
    expect(rulesFrom(conformant({ basketTaxClass: null }))).toContain('RCM-005');
  });

  it('refuses a ballot option outside the declared class', () => {
    // This is the defect that costs money: the rate of the supply decided by a
    // vote in month 5, after the supply was taxed in month 1.
    const rules = rulesFrom(
      conformant({
        basketTaxClass: 'ZERO_RATED_STAPLES',
        ballotOptions: [
          { optionId: 'mealie-meal-10kg', taxClass: 'ZERO_RATED_STAPLES' },
          { optionId: 'soft-drinks-crate', taxClass: 'STANDARD_RATED_MIXED' },
        ],
      }),
    );
    expect(rules).toContain('RCM-006');
  });

  it('names the offending option so the ballot can be fixed', () => {
    const finding = validateRoundCreditModel(
      conformant({
        ballotOptions: [{ optionId: 'soft-drinks-crate', taxClass: 'STANDARD_RATED_MIXED' }],
      }),
    ).findings.find((f) => f.rule === 'RCM-006');
    expect(finding?.observed).toContain('soft-drinks-crate');
  });

  it('accepts a standard-rated Round whose ballot is standard-rated throughout', () => {
    // Two Round products, not one ballot spanning both rates.
    const result = validateRoundCreditModel(
      conformant({
        roundProductId: 'mixed-6m',
        basketTaxClass: 'STANDARD_RATED_MIXED',
        ballotOptions: [{ optionId: 'household-mixed', taxClass: 'STANDARD_RATED_MIXED' }],
      }),
    );
    expect(result.conformant).toBe(true);
  });

  it('refuses a tax point at settlement, which is the deposit-shaped answer', () => {
    expect(rulesFrom(conformant({ taxPoint: 'SETTLEMENT' }))).toContain('RCM-007');
  });
});

describe('the tax point is not revenue recognition', () => {
  it('refuses revenue recognised at credit issue', () => {
    expect(rulesFrom(conformant({ revenueRecognisedAt: 'CREDIT_ISSUE' }))).toContain('RCM-008');
  });

  it('earns no revenue on issue, and the liability equals what was taken', () => {
    const events: CreditLedgerEvent[] = [
      { kind: 'credit_issued', creditId: 'c1', memberId: 'm1', valueMinor: 10_000, vatOutputMinor: 0 },
      { kind: 'credit_issued', creditId: 'c2', memberId: 'm2', valueMinor: 10_000, vatOutputMinor: 0 },
    ];
    const position = projectCreditLedger(events);
    expect(position.revenueMinor).toBe(0);
    expect(position.liabilityMinor).toBe(20_000);
    expect(() => assertContractLiabilityInvariant(position)).not.toThrow();
  });

  it('releases liability to revenue only at settlement', () => {
    const position = projectCreditLedger([
      { kind: 'credit_issued', creditId: 'c1', memberId: 'm1', valueMinor: 10_000, vatOutputMinor: 1_500 },
      { kind: 'credit_settled', creditId: 'c1', valueMinor: 10_000 },
    ]);
    expect(position.revenueMinor).toBe(10_000);
    expect(position.liabilityMinor).toBe(0);
    expect(position.vatOutputMinor).toBe(1_500);
    expect(() => assertContractLiabilityInvariant(position)).not.toThrow();
  });

  it('reverses VAT output with the credit it was charged on', () => {
    const position = projectCreditLedger([
      { kind: 'credit_issued', creditId: 'c1', memberId: 'm1', valueMinor: 10_000, vatOutputMinor: 1_500 },
      { kind: 'credit_reversed', creditId: 'c1', valueMinor: 10_000, vatOutputMinor: 1_500 },
    ]);
    expect(position.vatOutputMinor).toBe(0);
    expect(position.liabilityMinor).toBe(0);
    expect(position.revenueMinor).toBe(0);
  });

  it('carries an obligation out without earning it', () => {
    // A member moving credits into the next Round has not been delivered to.
    const position = projectCreditLedger([
      { kind: 'credit_issued', creditId: 'c1', memberId: 'm1', valueMinor: 10_000, vatOutputMinor: 0 },
      { kind: 'credit_carried_out', creditId: 'c1', valueMinor: 10_000 },
    ]);
    expect(position.revenueMinor).toBe(0);
    expect(position.liabilityMinor).toBe(0);
    expect(position.credits.get('c1')?.state).toBe('CARRIED_OUT');
  });
});

describe('the ledger refuses a stream that would silently diverge', () => {
  it('refuses settling a credit that was never issued', () => {
    expect(() =>
      projectCreditLedger([{ kind: 'credit_settled', creditId: 'ghost', valueMinor: 10_000 }]),
    ).toThrow(/never issued/);
  });

  it('refuses settling the same credit twice', () => {
    expect(() =>
      projectCreditLedger([
        { kind: 'credit_issued', creditId: 'c1', memberId: 'm1', valueMinor: 10_000, vatOutputMinor: 0 },
        { kind: 'credit_settled', creditId: 'c1', valueMinor: 10_000 },
        { kind: 'credit_settled', creditId: 'c1', valueMinor: 10_000 },
      ]),
    ).toThrow(/already SETTLED/);
  });

  it('refuses settling at a value the credit was not issued at', () => {
    expect(() =>
      projectCreditLedger([
        { kind: 'credit_issued', creditId: 'c1', memberId: 'm1', valueMinor: 10_000, vatOutputMinor: 0 },
        { kind: 'credit_settled', creditId: 'c1', valueMinor: 9_000 },
      ]),
    ).toThrow(/issued at 10000/);
  });

  it('refuses fractional money', () => {
    expect(() =>
      projectCreditLedger([
        { kind: 'credit_issued', creditId: 'c1', memberId: 'm1', valueMinor: 100.5, vatOutputMinor: 0 },
      ]),
    ).toThrow(/minor units/);
  });

  it('reports a liability that disagrees with the credit register', () => {
    // RCM-010 proves the two derivations agree. Forcing them apart shows the
    // check would actually catch it, rather than agreeing by construction.
    const position = projectCreditLedger([
      { kind: 'credit_issued', creditId: 'c1', memberId: 'm1', valueMinor: 10_000, vatOutputMinor: 0 },
    ]);
    position.liabilityMinor -= 2_500;
    expect(() => assertContractLiabilityInvariant(position)).toThrow(/RCM-010/);
    expect(() => assertContractLiabilityInvariant(position)).toThrow(/no settlement may be funded/);
  });

  it('holds the invariant across a mixed Round', () => {
    const events: CreditLedgerEvent[] = [];
    for (let i = 0; i < 100; i++) {
      events.push({
        kind: 'credit_issued',
        creditId: `c${i}`,
        memberId: `m${i % 20}`,
        valueMinor: 10_000,
        vatOutputMinor: 0,
      });
    }
    for (let i = 0; i < 40; i++) events.push({ kind: 'credit_settled', creditId: `c${i}`, valueMinor: 10_000 });
    for (let i = 40; i < 50; i++) events.push({ kind: 'credit_carried_out', creditId: `c${i}`, valueMinor: 10_000 });
    for (let i = 50; i < 55; i++)
      events.push({ kind: 'credit_reversed', creditId: `c${i}`, valueMinor: 10_000, vatOutputMinor: 0 });

    const position = projectCreditLedger(events);
    expect(position.revenueMinor).toBe(400_000);
    expect(position.liabilityMinor).toBe(450_000);
    expect(() => assertContractLiabilityInvariant(position)).not.toThrow();
  });
});

describe('exit', () => {
  it('refuses a product with no exit at all', () => {
    expect(rulesFrom(conformant({ exitOutcomes: [] }))).toContain('RCM-011');
  });

  it('refuses an exit conditioned on the group', () => {
    // Otherwise strangers in a public Round strand one member's value for a year.
    expect(rulesFrom(conformant({ exitRequiresGroupVote: true }))).toContain('RCM-012');
    expect(rulesFrom(conformant({ creditOwnership: 'ROUND' }))).toContain('RCM-012');
  });

  it('returns what the member receives, never a bare permission', () => {
    expect(resolveExit(conformant(), { preferred: 'IMMEDIATE_GROCERY_ORDER' })).toBe(
      'IMMEDIATE_GROCERY_ORDER',
    );
    expect(() =>
      resolveExit(conformant({ exitRequiresGroupVote: true }), { preferred: 'CARRY_TO_NEXT_ROUND' }),
    ).toThrow(/RCM-012/);
    expect(() =>
      resolveExit(conformant({ exitOutcomes: ['CARRY_TO_NEXT_ROUND'] }), {
        preferred: 'IMMEDIATE_GROCERY_ORDER',
      }),
    ).toThrow(/RCM-011/);
  });
});

describe('denomination and disclosure', () => {
  it('accepts goods denomination without a price-risk disclosure', () => {
    // Quantity is fixed at purchase, so there is no price risk to disclose.
    expect(validateRoundCreditModel(conformant({ denomination: 'GOODS' })).conformant).toBe(true);
  });

  it('refuses currency denomination with no price-risk disclosure', () => {
    expect(
      rulesFrom(conformant({ denomination: 'CURRENCY', priceRiskDisclosureVersion: null })),
    ).toContain('RCM-013');
  });

  it('accepts currency denomination once the member is told', () => {
    expect(
      validateRoundCreditModel(
        conformant({ denomination: 'CURRENCY', priceRiskDisclosureVersion: 'pr-2026-08-1' }),
      ).conformant,
    ).toBe(true);
  });

  it('requires a consent gateway that covers the credit construct', () => {
    expect(rulesFrom(conformant({ consentGatewayVersion: null }))).toContain('RCM-014');
    expect(rulesFrom(conformant({ consentCoversCreditConstruct: false }))).toContain('RCM-014');
  });
});

describe('procurement reserve', () => {
  it('accepts zero, which is a decision', () => {
    expect(validateRoundCreditModel(conformant({ procurementReservePercent: 0 })).conformant).toBe(true);
  });

  it('refuses an undeclared or impossible reserve', () => {
    // A taxable supply leaves the member an unsecured creditor. Someone owns that.
    expect(rulesFrom(conformant({ procurementReservePercent: null }))).toContain('RCM-016');
    expect(rulesFrom(conformant({ procurementReservePercent: 140 }))).toContain('RCM-016');
    expect(rulesFrom(conformant({ procurementReservePercent: -1 }))).toContain('RCM-016');
  });
});
