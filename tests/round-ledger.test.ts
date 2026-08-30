import { describe, expect, it } from 'vitest';
import {
  appendEvent,
  assertLedgerInvariant,
  deriveBalances,
  memberPosition,
  recordPayment,
  reverseEvent,
  type LedgerEvent,
  type LedgerEventKind,
} from '../packages/round-ledger/src/ledger.js';
import type { RoundCreditConfiguration } from '../packages/round-credit/src/credit-model.js';

/**
 * GROC-F024 — Round ledger & accounting.
 *
 * Contract: 20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/GROC-F024_ACCEPTANCE_CONTRACT.md
 *
 * §9's load-bearing sentence: customer grocery obligations must never be confused
 * with free corporate cash or operating profit.
 */

const creditConfig: RoundCreditConfiguration = {
  roundProductId: 'household-6m:rnd-0001',
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
  instalmentCount: 6,
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
};

const paid = (id: string, amountMinor: number, vatMinor = 0, memberId = 'cus-a') => ({
  eventId: id,
  roundId: 'rnd-0001',
  memberId,
  kind: 'purchase_paid' as LedgerEventKind,
  amountMinor,
  vatMinor,
  occurredAt: '2026-09-01T00:00:00Z',
});

const rules = (r: { findings: Array<{ rule: string }> }): string[] => r.findings.map((f) => f.rule);

describe('criteria 1-2 — append-only', () => {
  it('returns a new log and leaves the input untouched', () => {
    const log: LedgerEvent[] = [];
    const result = appendEvent(log, paid('e1', 10_000));
    expect(result.ok).toBe(true);
    expect(log).toEqual([]);
    expect(result.log).toHaveLength(1);
  });

  it('exports no way to remove or edit an event', async () => {
    const module = await import('../packages/round-ledger/src/ledger.js');
    const names = Object.keys(module);
    expect(names.some((n) => /delete|remove|update|edit|mutate/i.test(n))).toBe(false);
  });

  it('refuses a duplicate event id, which would double-count a payment', () => {
    const first = appendEvent([], paid('e1', 10_000));
    expect(rules(appendEvent(first.log!, paid('e1', 10_000)))).toContain('RLG-001');
  });
});

describe('criteria 3-5 — reversals', () => {
  it('refuses a reversal of an unknown event', () => {
    expect(rules(reverseEvent([], 'ghost', { eventId: 'r1', occurredAt: 'x' }))).toContain('RLG-004');
  });

  it('refuses a second reversal of the same event', () => {
    const a = appendEvent([], paid('e1', 10_000));
    const b = reverseEvent(a.log!, 'e1', { eventId: 'r1', occurredAt: 'x' });
    expect(rules(reverseEvent(b.log!, 'e1', { eventId: 'r2', occurredAt: 'x' }))).toContain('RLG-005');
  });

  it('negates the original movements exactly', () => {
    const a = appendEvent([], paid('e1', 10_000, 1_500));
    const b = reverseEvent(a.log!, 'e1', { eventId: 'r1', occurredAt: 'x' });
    const balances = deriveBalances(b.log!);
    for (const value of Object.values(balances)) expect(value).toBe(0);
  });
});

describe('criteria 6-9 — posting rules', () => {
  it('refuses an event kind with no rule, naming the kind', () => {
    const result = appendEvent([], { ...paid('e1', 100), kind: 'not_a_kind' as LedgerEventKind });
    expect(rules(result)).toContain('RLG-002');
    expect(result.findings[0]!.observed).toBe('not_a_kind');
  });

  it('criterion 7 — a payment moves nothing into revenue', () => {
    // The sentence the whole feature exists for.
    const result = appendEvent([], paid('e1', 10_000, 1_500));
    const balances = deriveBalances(result.log!);
    expect(balances.REVENUE ?? 0).toBe(0);
    expect(balances.COLLECTED_PURCHASE_VALUE).toBe(10_000);
    expect(balances.CUSTOMER_PREPAID_OBLIGATION).toBe(-8_500);
    expect(balances.VAT_OUTPUT_PAYABLE).toBe(-1_500);
  });

  it('criterion 8 — delivery is the only event that earns', () => {
    const kinds: LedgerEventKind[] = [
      'purchase_due',
      'purchase_processing',
      'purchase_paid',
      'purchase_failed',
      'partial_purchase',
      'late_purchase',
      'procurement_commitment',
      'goods_received',
      'allocation_created',
      'insurance_recovery',
      'supplier_recovery',
    ];
    for (const kind of kinds) {
      const result = appendEvent([], { ...paid(`e-${kind}`, 5_000), kind });
      expect(result.ok, kind).toBe(true);
      const balances = deriveBalances(result.log!);
      expect(balances.REVENUE ?? 0, kind).toBe(0);
    }
    const delivered = appendEvent([], { ...paid('e-d', 5_000), kind: 'goods_delivered' });
    expect(deriveBalances(delivered.log!).REVENUE).toBe(-5_000);
  });

  it('criterion 9 — every event balances to zero', () => {
    const kinds: LedgerEventKind[] = [
      'purchase_paid',
      'partial_purchase',
      'procurement_commitment',
      'goods_received',
      'goods_delivered',
      'insurance_recovery',
      'supplier_recovery',
    ];
    for (const kind of kinds) {
      const result = appendEvent([], { ...paid(`e-${kind}`, 7_000, kind === 'purchase_paid' ? 1_000 : 0), kind });
      expect(result.ok, kind).toBe(true);
      const sum = result.event!.movements.reduce((s, m) => s + m.amountMinor, 0);
      expect(sum, kind).toBe(0);
    }
  });

  it('refuses a cash refund, because §9.2 names it and DEC-005 forbids it', () => {
    const result = appendEvent([], { ...paid('e1', 5_000), kind: 'refund' });
    expect(rules(result)).toContain('RLG-009');
    expect(result.findings[0]!.remedy).toMatch(/in kind/);
  });
});

describe('criteria 11-12 — the contract-liability invariant', () => {
  it('holds across a full Round: contributions, delivery, reversal', () => {
    let log: LedgerEvent[] = [];
    for (let i = 1; i <= 6; i++) {
      log = appendEvent(log, paid(`p${i}`, 5_000)).log!;
    }
    expect(assertLedgerInvariant(log, 30_000)).toEqual([]);

    log = reverseEvent(log, 'p6', { eventId: 'r6', occurredAt: 'x' }).log!;
    expect(assertLedgerInvariant(log, 25_000)).toEqual([]);

    log = appendEvent(log, { ...paid('d1', 25_000), kind: 'goods_delivered' }).log!;
    expect(assertLedgerInvariant(log, 0)).toEqual([]);
  });

  it('refuses when the two derivations disagree', () => {
    // Agreeing by construction would prove nothing; forcing them apart shows the
    // check would actually catch it.
    const log = appendEvent([], paid('p1', 5_000)).log!;
    const findings = assertLedgerInvariant(log, 4_000);
    expect(findings.map((f) => f.rule)).toContain('RLG-006');
    expect(findings[0]!.remedy).toMatch(/Stop and find which/);
  });
});

describe('criteria 13-14 — payments split by pool with VAT extracted', () => {
  it('splits a payment across pools and sums to the payment exactly', () => {
    const result = recordPayment([], creditConfig, {
      eventIdPrefix: 'pay-1',
      roundId: 'rnd-0001',
      memberId: 'cus-a',
      grossMinor: 5_200,
      occurredAt: '2026-09-01T00:00:00Z',
    });
    expect(result.ok).toBe(true);
    const collected = deriveBalances(result.log!).COLLECTED_PURCHASE_VALUE;
    expect(collected).toBe(5_200);
    expect(result.log).toHaveLength(2);
  });

  it('extracts VAT from the standard-rated share and none from the exempt one', () => {
    const result = recordPayment([], creditConfig, {
      eventIdPrefix: 'pay-1',
      roundId: 'rnd-0001',
      memberId: 'cus-a',
      grossMinor: 5_200,
      occurredAt: '2026-09-01T00:00:00Z',
    });
    const staples = result.log!.find((e) => e.eventId.endsWith(':staples'))!;
    const household = result.log!.find((e) => e.eventId.endsWith(':household'))!;

    expect(staples.amountMinor).toBe(3_640);
    expect(staples.movements.find((m) => m.balance === 'VAT_OUTPUT_PAYABLE')!.amountMinor).toBe(0);

    expect(household.amountMinor).toBe(1_560);
    expect(household.movements.find((m) => m.balance === 'VAT_OUTPUT_PAYABLE')!.amountMinor).toBe(-209);
    // Extracted from the price, not added to it.
    expect(household.movements.find((m) => m.balance === 'CUSTOMER_PREPAID_OBLIGATION')!.amountMinor).toBe(-1_351);
  });

  it('honours a member’s own split', () => {
    const result = recordPayment(
      [],
      creditConfig,
      { eventIdPrefix: 'pay-1', roundId: 'rnd-0001', memberId: 'cus-a', grossMinor: 5_200, occurredAt: 'x' },
      { staples: 10_000, household: 0 },
    );
    expect(deriveBalances(result.log!).VAT_OUTPUT_PAYABLE ?? 0).toBe(0);
  });
});

describe('criteria 10, 15-16 — derivation and hygiene', () => {
  it('derives a member position from events, with no stored balance', () => {
    let log = recordPayment([], creditConfig, {
      eventIdPrefix: 'pay-1',
      roundId: 'rnd-0001',
      memberId: 'cus-a',
      grossMinor: 5_200,
      occurredAt: 'x',
    }).log!;
    log = appendEvent(log, { ...paid('d1', 1_000), kind: 'goods_delivered' }).log!;

    const position = memberPosition(log, 'cus-a');
    expect(position.paidMinor).toBe(5_200);
    expect(position.vatMinor).toBe(209);
    expect(position.deliveredMinor).toBe(1_000);
    expect(position.outstandingMinor).toBe(5_200 - 209 - 1_000);
  });

  it('keeps one member’s position independent of another’s', () => {
    let log = appendEvent([], paid('a1', 5_000, 0, 'cus-a')).log!;
    log = appendEvent(log, paid('b1', 9_000, 0, 'cus-b')).log!;
    expect(memberPosition(log, 'cus-a').paidMinor).toBe(5_000);
    expect(memberPosition(log, 'cus-b').paidMinor).toBe(9_000);
  });

  it('reflects a reversal in the member position', () => {
    let log = appendEvent([], paid('a1', 5_000, 0, 'cus-a')).log!;
    log = reverseEvent(log, 'a1', { eventId: 'r1', occurredAt: 'x' }).log!;
    expect(memberPosition(log, 'cus-a').paidMinor).toBe(0);
  });

  it('refuses non-integer or negative money', () => {
    expect(rules(appendEvent([], paid('e1', 100.5)))).toContain('RLG-008');
    expect(rules(appendEvent([], paid('e2', -100)))).toContain('RLG-008');
  });

  it('states a remedy on every refusal it can raise', () => {
    const refusals = [
      appendEvent([], paid('e1', -1)),
      appendEvent([], { ...paid('e2', 10), kind: 'refund' }),
      reverseEvent([], 'ghost', { eventId: 'r', occurredAt: 'x' }),
    ];
    for (const result of refusals) {
      expect(result.ok).toBe(false);
      for (const finding of result.findings) {
        expect(finding.severity).toBe('REFUSE');
        expect(finding.remedy.length).toBeGreaterThan(20);
      }
    }
  });
});
