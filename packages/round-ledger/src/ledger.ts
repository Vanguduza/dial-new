/**
 * GROC-F024 — Round ledger and accounting.
 *
 * Contract: `20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/GROC-F024_ACCEPTANCE_CONTRACT.md`
 *
 * §9 gives fourteen event names, a separation list, and one sentence that is the
 * whole feature:
 *
 * > Customer grocery obligations must never be confused with free corporate cash
 * > or operating profit.
 *
 * That is DEC-004 written before DEC-004 existed. Money arriving for groceries not
 * yet delivered is a contract liability; it becomes revenue when the groceries
 * transfer, never when the cash does. Get it wrong and the accounts report
 * unearned profit, income tax is paid on it, and management is told the float is
 * spendable margin — which is review finding B2's failure mode arriving through
 * the ledger rather than through bad luck.
 *
 * This is a **projection, not a second ledger.** §9 requires reuse of Dial's
 * canonical accounting kernel and CLAUDE.md forbids a second money authority, so
 * what follows computes postings and owns none of them.
 */

import { allocatePayment, type RoundCreditConfiguration } from '@dial/round-credit/src/credit-model.js';

/** §9.3's separated balances. Distinct, and independently derivable. */
export type Balance =
  | 'CUSTOMER_PREPAID_OBLIGATION'
  | 'COLLECTED_PURCHASE_VALUE'
  | 'VAT_OUTPUT_PAYABLE'
  | 'PROCUREMENT_COST'
  | 'ALLOCATED_INVENTORY'
  | 'DELIVERED_FULFILMENT'
  | 'REVENUE'
  | 'REFUNDS'
  | 'INSURER_RECOVERIES'
  | 'SUPPLIER_RECOVERIES'
  | 'LOGISTICS_COST'
  | 'SUPPLIER_REBATES'
  | 'REALISED_MARGIN';

/** §9.2's event names, unchanged. */
export type LedgerEventKind =
  | 'purchase_due'
  | 'purchase_processing'
  | 'purchase_paid'
  | 'purchase_failed'
  | 'partial_purchase'
  | 'late_purchase'
  | 'reversal'
  | 'refund'
  | 'procurement_commitment'
  | 'goods_received'
  | 'allocation_created'
  | 'goods_delivered'
  | 'insurance_recovery'
  | 'supplier_recovery';

export interface LedgerFinding {
  rule: string;
  severity: 'REFUSE';
  statement: string;
  observed?: string;
  remedy: string;
}

export interface Movement {
  balance: Balance;
  /** Signed minor units. Every event's movements sum to zero. */
  amountMinor: number;
}

export interface LedgerEvent {
  eventId: string;
  roundId: string;
  memberId?: string;
  kind: LedgerEventKind;
  amountMinor: number;
  occurredAt: string;
  /** Set on a reversal: the event being negated. */
  reversesEventId?: string;
  movements: Movement[];
}

const refuse = (
  rule: string,
  statement: string,
  remedy: string,
  observed?: string,
): LedgerFinding => ({ rule, severity: 'REFUSE', statement, remedy, ...(observed ? { observed } : {}) });

// `-0` is a real value in JavaScript, survives JSON, and compares unequal to `0`
// under Object.is. A ledger that can hold negative zero will eventually show one
// to somebody, and they will reasonably wonder what it means. Normalise here so
// no posting can carry one.
const move = (balance: Balance, amountMinor: number): Movement => ({
  balance,
  amountMinor: amountMinor === 0 ? 0 : amountMinor,
});

/**
 * R2/R3 — what each §9.2 event does to the separated balances.
 *
 * The line that matters is `purchase_paid`, and it is the shortest one here: cash
 * in, obligation up, revenue untouched.
 */
function movementsFor(kind: LedgerEventKind, amountMinor: number, vatMinor: number): Movement[] | null {
  switch (kind) {
    // Intentions and failures move no money. They are timeline, not ledger.
    case 'purchase_due':
    case 'purchase_processing':
    case 'purchase_failed':
    case 'late_purchase':
      return [];

    case 'purchase_paid':
    case 'partial_purchase': {
      // The member's money arrives. What Dial owes them rises by the net; the VAT
      // that was only ever passing through is separated immediately so it cannot
      // be mistaken for either obligation or margin.
      const net = amountMinor - vatMinor;
      return [
        move('COLLECTED_PURCHASE_VALUE', amountMinor),
        move('CUSTOMER_PREPAID_OBLIGATION', -net),
        move('VAT_OUTPUT_PAYABLE', -vatMinor),
      ];
    }

    case 'procurement_commitment':
      return [move('PROCUREMENT_COST', amountMinor), move('COLLECTED_PURCHASE_VALUE', -amountMinor)];

    case 'goods_received':
      return [move('ALLOCATED_INVENTORY', amountMinor), move('PROCUREMENT_COST', -amountMinor)];

    case 'allocation_created':
      // Earmarking stock for members moves nothing: nobody has received anything.
      return [];

    case 'goods_delivered':
      // The only event that earns. The obligation discharges and becomes revenue.
      return [
        move('CUSTOMER_PREPAID_OBLIGATION', amountMinor),
        move('DELIVERED_FULFILMENT', amountMinor),
        move('REVENUE', -amountMinor),
        move('ALLOCATED_INVENTORY', -amountMinor),
      ];

    case 'insurance_recovery':
      return [move('INSURER_RECOVERIES', amountMinor), move('REALISED_MARGIN', -amountMinor)];

    case 'supplier_recovery':
      return [move('SUPPLIER_RECOVERIES', amountMinor), move('REALISED_MARGIN', -amountMinor)];

    case 'reversal':
      // Built by reverseEvent, which negates the original's movements.
      return null;

    default:
      return null;
  }
}

export interface AppendResult {
  ok: boolean;
  findings: LedgerFinding[];
  log?: LedgerEvent[];
  event?: LedgerEvent;
}

/**
 * R1/R8 — append an event. Returns a new log; the input is never touched.
 *
 * There is deliberately no update or delete anywhere in this module. §9 says
 * corrections become reversals and no settled purchase record is deleted, and the
 * cheapest way to honour that is to give the module no way to break it.
 */
export function appendEvent(
  log: readonly LedgerEvent[],
  input: Omit<LedgerEvent, 'movements'> & { vatMinor?: number },
): AppendResult {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 0) {
    return {
      ok: false,
      findings: [
        refuse(
          'RLG-008',
          'Ledger amounts are whole, non-negative minor units.',
          'Express the amount in minor units. A negative amount is a reversal, which is its own event kind with its own approval.',
          String(input.amountMinor),
        ),
      ],
    };
  }

  if (log.some((e) => e.eventId === input.eventId)) {
    return {
      ok: false,
      findings: [
        refuse(
          'RLG-001',
          'This event is already in the log.',
          'Use a fresh event id. Re-appending an existing id would double-count a payment.',
          input.eventId,
        ),
      ],
    };
  }

  // §9.2 lists a `refund` event and DEC-005 forbids returning money. The event is
  // not renamed here — renaming an event in a locked plan is a product decision —
  // but it has no cash posting, and saying so at the point of use is better than a
  // rule buried in a document. Same finding as the lifecycle's REFUNDING state.
  if (input.kind === 'refund') {
    return {
      ok: false,
      findings: [
        refuse(
          'RLG-009',
          'A Round does not post a cash refund. §9.2 names the event; DEC-005 forbids the movement.',
          'Settle in kind and record it: goods_delivered for groceries taken at standard retail, or carry the credit into the next Round. RCM-002 — credits are not redeemable in money in any circumstance, and a ledger that can post a refund is a ledger that will.',
          input.kind,
        ),
      ],
    };
  }

  const movements = movementsFor(input.kind, input.amountMinor, input.vatMinor ?? 0);
  if (movements === null) {
    return {
      ok: false,
      findings: [
        refuse(
          'RLG-002',
          `No posting rule exists for event kind ${input.kind}.`,
          'Add a posting rule, or use reverseEvent for a correction. An event with no rule is refused rather than recorded as a no-op, because a no-op is indistinguishable from a rule somebody forgot.',
          input.kind,
        ),
      ],
    };
  }

  const event: LedgerEvent = { ...input, movements };
  const imbalance = movements.reduce((sum, m) => sum + m.amountMinor, 0);
  if (imbalance !== 0) {
    return {
      ok: false,
      findings: [
        refuse(
          'RLG-003',
          'An event’s movements sum to zero across the separated balances.',
          'Correct the posting rule. A posting that does not balance creates money, and it will be found later by someone who cannot tell where.',
          `${imbalance} minor units out`,
        ),
      ],
    };
  }

  return { ok: true, findings: [], log: [...log, event], event };
}

/** R1 — a correction is a reversal that negates the original exactly. */
export function reverseEvent(
  log: readonly LedgerEvent[],
  eventId: string,
  reversal: { eventId: string; occurredAt: string },
): AppendResult {
  const original = log.find((e) => e.eventId === eventId);
  if (!original) {
    return {
      ok: false,
      findings: [
        refuse(
          'RLG-004',
          'There is no such event to reverse.',
          'Check the event id. Reversing an event that was never recorded would invent a movement.',
          eventId,
        ),
      ],
    };
  }
  if (log.some((e) => e.reversesEventId === eventId)) {
    return {
      ok: false,
      findings: [
        refuse(
          'RLG-005',
          'This event has already been reversed.',
          'Reverse it once. A second reversal restores the original movement and reads as a correction, which is how a reconciliation becomes unexplainable.',
          eventId,
        ),
      ],
    };
  }

  const event: LedgerEvent = {
    eventId: reversal.eventId,
    roundId: original.roundId,
    ...(original.memberId ? { memberId: original.memberId } : {}),
    kind: 'reversal',
    amountMinor: original.amountMinor,
    occurredAt: reversal.occurredAt,
    reversesEventId: eventId,
    movements: original.movements.map((m) => move(m.balance, -m.amountMinor)),
  };

  return { ok: true, findings: [], log: [...log, event], event };
}

/** R4/R7/R10 — every balance derived from the log, with nothing stored. */
export function deriveBalances(log: readonly LedgerEvent[]): Record<Balance, number> {
  const balances = {} as Record<Balance, number>;
  for (const event of log) {
    for (const m of event.movements) {
      balances[m.balance] = (balances[m.balance] ?? 0) + m.amountMinor;
    }
  }
  return balances;
}

export interface MemberPosition {
  memberId: string;
  paidMinor: number;
  vatMinor: number;
  deliveredMinor: number;
  /** What Dial still owes this member, in credit value. */
  outstandingMinor: number;
}

/** R7 — a member's position, computed rather than looked up. */
export function memberPosition(log: readonly LedgerEvent[], memberId: string): MemberPosition {
  let paid = 0;
  let vat = 0;
  let delivered = 0;

  for (const event of log) {
    if (event.memberId !== memberId) continue;
    for (const m of event.movements) {
      // Reversal movements are already negated, so a plain sum is correct and a
      // sign correction here would double-count them.
      if (m.balance === 'COLLECTED_PURCHASE_VALUE') paid += m.amountMinor;
      if (m.balance === 'VAT_OUTPUT_PAYABLE') vat += -m.amountMinor;
      if (m.balance === 'DELIVERED_FULFILMENT') delivered += m.amountMinor;
    }
  }

  return {
    memberId,
    paidMinor: paid,
    vatMinor: vat,
    deliveredMinor: delivered,
    outstandingMinor: paid - vat - delivered,
  };
}

/**
 * R5 — RCM-010 at the ledger.
 *
 * The obligation is derived from the postings; the unsettled credit value is
 * supplied by the credit register. They are two independent derivations of one
 * number, and agreeing by construction would prove nothing.
 */
export function assertLedgerInvariant(
  log: readonly LedgerEvent[],
  unsettledCreditValueMinor: number,
): LedgerFinding[] {
  const balances = deriveBalances(log);
  // The obligation balance is carried negative (a liability), so flip it to compare.
  const obligation = -(balances.CUSTOMER_PREPAID_OBLIGATION ?? 0);
  if (obligation !== unsettledCreditValueMinor) {
    return [
      refuse(
        'RLG-006',
        'The customer prepaid obligation does not equal unsettled credit value.',
        'Stop and find which derivation is wrong before funding any settlement from this Round. RCM-010: one of the two is incorrect, and until it is known which, the Round cannot be trusted to know what it owes.',
        `ledger ${obligation}, credits ${unsettledCreditValueMinor}`,
      ),
    ];
  }
  return [];
}

/**
 * R6 — record a member's payment, split across pools with VAT extracted per pool.
 *
 * Returns one event per pool rather than one aggregate, so the tax character of
 * every cent is visible in the log rather than reconstructed from a ratio later.
 */
export function recordPayment(
  log: readonly LedgerEvent[],
  config: RoundCreditConfiguration,
  payment: { eventIdPrefix: string; roundId: string; memberId: string; grossMinor: number; occurredAt: string },
  memberSplit?: Record<string, number>,
): AppendResult {
  const allocation = allocatePayment(config, payment.grossMinor, memberSplit);
  let working: LedgerEvent[] = [...log];
  const appended: LedgerEvent[] = [];

  for (const pool of allocation.pools) {
    const result = appendEvent(working, {
      eventId: `${payment.eventIdPrefix}:${pool.poolId}`,
      roundId: payment.roundId,
      memberId: payment.memberId,
      kind: 'purchase_paid',
      amountMinor: pool.grossMinor,
      vatMinor: pool.vatMinor,
      occurredAt: payment.occurredAt,
    });
    if (!result.ok) return result;
    working = result.log!;
    appended.push(result.event!);
  }

  return { ok: true, findings: [], log: working, event: appended[0] };
}
