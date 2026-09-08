import { describe, expect, it } from 'vitest';
import {
  classifyForLedger,
  deriveStatus,
  generateSchedule,
  recordAttempt,
  type Instalment,
  type RecordedAttempt,
  type ScheduleConfig,
} from '../packages/round-purchase-schedule/src/purchase-schedule.js';

/**
 * GROC-F023 — Prepaid purchase schedule.
 *
 * Contract: 20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/GROC-F023_ACCEPTANCE_CONTRACT.md
 *
 * Two pure functions: a schedule from a Round's configuration, and a status from what
 * has actually been recorded against one of its instalments.
 */

const config = (over: Partial<ScheduleConfig> = {}): ScheduleConfig => ({
  roundId: 'rnd-0001',
  contributionMinor: 10_000,
  durationMonths: 6,
  startDate: '2026-01-15',
  contributionFrequency: 'MONTHLY',
  ...over,
});

const attempt = (over: Partial<RecordedAttempt> = {}): RecordedAttempt => ({
  attemptId: 'att-0001',
  kind: 'SUCCESS',
  amountMinor: 10_000,
  recordedAt: '2026-01-15T00:00:00.000Z',
  ...over,
});

describe('generateSchedule', () => {
  it('1. produces exactly durationMonths instalments, one calendar month apart starting at startDate', () => {
    const result = generateSchedule(config(), '2026-01-01');
    expect(result.ok).toBe(true);
    expect(result.instalments).toHaveLength(6);
    expect(result.instalments!.map((i) => i.dueDate)).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
      '2026-05-15',
      '2026-06-15',
    ]);
  });

  it('1b. clamps a month-end start date to the last day of a shorter target month, never skipping or colliding months', () => {
    const result = generateSchedule(config({ startDate: '2026-01-31', durationMonths: 6 }), '2026-01-01');
    expect(result.ok).toBe(true);
    expect(result.instalments!.map((i) => i.dueDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ]);
  });

  it('2. every instalment equals contributionMinor; the total equals contributionMinor × durationMonths exactly', () => {
    const result = generateSchedule(config(), '2026-01-01');
    expect(result.instalments!.every((i) => i.amountMinor === 10_000)).toBe(true);
    const total = result.instalments!.reduce((sum, i) => sum + i.amountMinor, 0);
    expect(total).toBe(10_000 * 6);
  });

  it('3. generateSchedule is deterministic: byte-identical output across repeated calls', () => {
    const a = generateSchedule(config(), '2026-01-01');
    const b = generateSchedule(config(), '2026-01-01');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('4. refuses a joinedAt after the Round\'s startDate', () => {
    const result = generateSchedule(config(), '2026-02-01');
    expect(result.ok).toBe(false);
    expect(result.findings[0]!.rule).toBe('RPS-002');
    expect(result.instalments).toBeUndefined();
  });

  it('refuses a non-YYYY-MM-DD startDate or joinedAt rather than parsing it ambiguously', () => {
    const result = generateSchedule(config({ startDate: '2026/01/15' }), '2026-01-01');
    expect(result.ok).toBe(false);
    expect(result.findings[0]!.rule).toBe('RPS-001');
  });

  it('refuses an impossible YYYY-MM-DD calendar date rather than allowing Date to normalize it', () => {
    const badStart = generateSchedule(config({ startDate: '2026-02-30' }), '2026-01-01');
    expect(badStart.ok).toBe(false);
    expect(badStart.findings[0]!.rule).toBe('RPS-001');

    const badJoin = generateSchedule(config(), '2026-02-30');
    expect(badJoin.ok).toBe(false);
    expect(badJoin.findings[0]!.rule).toBe('RPS-001');
  });

  it('refuses a non-positive durationMonths (RPS-003) and a non-positive contributionMinor (RPS-004)', () => {
    expect(generateSchedule(config({ durationMonths: 0 }), '2026-01-01').findings[0]!.rule).toBe('RPS-003');
    expect(generateSchedule(config({ contributionMinor: 0 }), '2026-01-01').findings[0]!.rule).toBe('RPS-004');
  });
});

describe('deriveStatus', () => {
  const instalment: Instalment = { index: 0, amountMinor: 10_000, dueDate: '2026-02-15' };

  it('5. before its due date, with nothing recorded, status is PENDING', () => {
    expect(deriveStatus(instalment, [], '2026-02-01')).toBe('PENDING');
  });

  it('6. on its due date, with nothing recorded, status is DUE', () => {
    expect(deriveStatus(instalment, [], '2026-02-15')).toBe('DUE');
  });

  it('7. after its due date, with nothing recorded, status is LATE', () => {
    expect(deriveStatus(instalment, [], '2026-02-16')).toBe('LATE');
  });

  it('8. after its due date, with a partial amount recorded, status is LATE, not PARTIAL', () => {
    const attempts = [attempt({ amountMinor: 4_000, recordedAt: '2026-02-10T00:00:00.000Z' })];
    expect(deriveStatus(instalment, attempts, '2026-02-16')).toBe('LATE');
  });

  it('9. before its due date, with a partial amount recorded, status is PARTIAL', () => {
    const attempts = [attempt({ amountMinor: 4_000, recordedAt: '2026-02-10T00:00:00.000Z' })];
    expect(deriveStatus(instalment, attempts, '2026-02-12')).toBe('PARTIAL');
  });

  it('10. full amountMinor recorded is PAID, regardless of whether the due date has passed', () => {
    const attempts = [attempt({ amountMinor: 10_000, recordedAt: '2026-02-10T00:00:00.000Z' })];
    expect(deriveStatus(instalment, attempts, '2026-02-12')).toBe('PAID');
    expect(deriveStatus(instalment, attempts, '2026-03-01')).toBe('PAID');
  });

  it('11. a failed attempt with nothing recorded since leaves the instalment FAILED', () => {
    const attempts = [attempt({ kind: 'FAILURE', amountMinor: 0, recordedAt: '2026-02-10T00:00:00.000Z' })];
    expect(deriveStatus(instalment, attempts, '2026-02-12')).toBe('FAILED');
  });

  it('12. a successful attempt recorded after a failed one supersedes it, never stuck at FAILED', () => {
    const attempts = [
      attempt({ attemptId: 'att-fail', kind: 'FAILURE', amountMinor: 0, recordedAt: '2026-02-10T00:00:00.000Z' }),
      attempt({ attemptId: 'att-ok', kind: 'SUCCESS', amountMinor: 4_000, recordedAt: '2026-02-11T00:00:00.000Z' }),
    ];
    expect(deriveStatus(instalment, attempts, '2026-02-12')).toBe('PARTIAL');

    const full = [
      attempt({ attemptId: 'att-fail', kind: 'FAILURE', amountMinor: 0, recordedAt: '2026-02-10T00:00:00.000Z' }),
      attempt({ attemptId: 'att-ok', kind: 'SUCCESS', amountMinor: 10_000, recordedAt: '2026-02-11T00:00:00.000Z' }),
    ];
    expect(deriveStatus(instalment, full, '2026-03-01')).toBe('PAID');
  });

  it("mostRecent orders by actual instant, not string comparison, across mixed UTC offsets", () => {
    const attempts = [
      attempt({ attemptId: 'att-processing', kind: 'PROCESSING', amountMinor: 0, recordedAt: '2026-02-11T08:00:00-05:00' }),
      attempt({ attemptId: 'att-fail', kind: 'FAILURE', amountMinor: 0, recordedAt: '2026-02-11T09:00:00.000Z' }),
    ];
    // att-processing is 13:00Z, genuinely after att-fail at 09:00Z, so the failure is not the most recent attempt.
    expect(deriveStatus(instalment, attempts, '2026-02-12')).not.toBe('FAILED');
  });

  it('throws rather than silently defaulting to PENDING when now or dueDate is unparseable', () => {
    expect(() => deriveStatus(instalment, [], 'not-a-date')).toThrow();
  });
});

describe('recordAttempt', () => {
  const instalment: Instalment = { index: 0, amountMinor: 10_000, dueDate: '2026-02-15' };

  it('13. an attempt that would take the recorded total past amountMinor is refused', () => {
    const existing = [attempt({ amountMinor: 8_000, recordedAt: '2026-02-01T00:00:00.000Z' })];
    const result = recordAttempt(instalment, existing, attempt({ attemptId: 'att-2', amountMinor: 5_000, recordedAt: '2026-02-05T00:00:00.000Z' }));
    expect(result.ok).toBe(false);
    expect(result.findings[0]!.rule).toBe('RPS-006');
  });

  it('14. an attempt recorded against an instalment already PAID is refused, naming the instalment', () => {
    const existing = [attempt({ amountMinor: 10_000, recordedAt: '2026-02-01T00:00:00.000Z' })];
    const result = recordAttempt(instalment, existing, attempt({ attemptId: 'att-2', amountMinor: 1_000, recordedAt: '2026-02-05T00:00:00.000Z' }));
    expect(result.ok).toBe(false);
    expect(result.findings[0]!.rule).toBe('RPS-005');
    expect(result.findings[0]!.remedy).toContain('instalment 0 due 2026-02-15');
  });

  it('an attempt within bounds is recorded', () => {
    const result = recordAttempt(instalment, [], attempt({ amountMinor: 4_000, recordedAt: '2026-02-01T00:00:00.000Z' }));
    expect(result.ok).toBe(true);
    expect(result.attempts).toHaveLength(1);
  });

  it('refuses a repeated attemptId rather than double-counting a retried payment callback', () => {
    const existing = [attempt({ attemptId: 'att-retry', amountMinor: 5_000, recordedAt: '2026-02-01T00:00:00.000Z' })];
    const result = recordAttempt(instalment, existing, attempt({ attemptId: 'att-retry', amountMinor: 5_000, recordedAt: '2026-02-02T00:00:00.000Z' }));
    expect(result.ok).toBe(false);
    expect(result.findings[0]!.rule).toBe('RPS-007');
    // The instalment must not have silently reached PAID via the duplicate.
    expect(deriveStatus(instalment, existing, '2026-02-02')).toBe('PARTIAL');
  });

  it('refuses a non-integer or negative amount before it can misstate a status', () => {
    const major = recordAttempt(instalment, [], attempt({ amountMinor: 100.5 }));
    expect(major.ok).toBe(false);
    expect(major.findings[0]!.rule).toBe('RPS-008');

    const negative = recordAttempt(instalment, [], attempt({ amountMinor: -5_000 }));
    expect(negative.ok).toBe(false);
    expect(negative.findings[0]!.rule).toBe('RPS-008');
  });

  it('refuses a non-zero amount on a PROCESSING or FAILURE attempt', () => {
    const result = recordAttempt(instalment, [], attempt({ kind: 'FAILURE', amountMinor: 1 }));
    expect(result.ok).toBe(false);
    expect(result.findings[0]!.rule).toBe('RPS-008');
  });
});

describe('classifyForLedger', () => {
  const instalment: Instalment = { index: 0, amountMinor: 10_000, dueDate: '2026-02-15' };

  it('15a. never returns purchase_paid for a partial amount', () => {
    const partialAttempt = attempt({ amountMinor: 4_000, recordedAt: '2026-02-10T00:00:00.000Z' });
    const attempts = [partialAttempt];
    const classification = classifyForLedger(instalment, attempts, '2026-02-10T00:00:00.000Z', partialAttempt);
    expect(classification?.kind).not.toBe('purchase_paid');
    expect(classification).toEqual({ kind: 'partial_purchase', amountMinor: 4_000 });
  });

  it('15b. never returns partial_purchase for the full amount', () => {
    const fullAttempt = attempt({ amountMinor: 10_000, recordedAt: '2026-02-10T00:00:00.000Z' });
    const attempts = [fullAttempt];
    const classification = classifyForLedger(instalment, attempts, '2026-02-10T00:00:00.000Z', fullAttempt);
    expect(classification?.kind).not.toBe('partial_purchase');
    expect(classification).toEqual({ kind: 'purchase_paid', amountMinor: 10_000 });
  });

  it('classifies a late success as partial_purchase (money moved) and composes to a non-zero ledger balance', () => {
    const lateAttempt = attempt({ amountMinor: 4_000, recordedAt: '2026-02-16T00:00:00.000Z' });
    const classification = classifyForLedger(instalment, [lateAttempt], '2026-02-16T00:00:00.000Z', lateAttempt);
    expect(classification).toEqual({ kind: 'partial_purchase', amountMinor: 4_000 });
  });

  it('classifies a late instalment with no attempt as late_purchase, naming the outstanding balance, and a failure as purchase_failed', () => {
    expect(classifyForLedger(instalment, [], '2026-02-16')).toEqual({ kind: 'late_purchase', amountMinor: 10_000 });

    const partial = attempt({ amountMinor: 4_000, recordedAt: '2026-02-10T00:00:00.000Z' });
    expect(classifyForLedger(instalment, [partial], '2026-02-16')).toEqual({ kind: 'late_purchase', amountMinor: 6_000 });

    const failure = attempt({ kind: 'FAILURE', amountMinor: 0, recordedAt: '2026-02-10T00:00:00.000Z' });
    expect(classifyForLedger(instalment, [failure], '2026-02-10T00:00:00.000Z', failure)).toEqual({
      kind: 'purchase_failed',
      amountMinor: 0,
    });
  });

  it('classifies a due instalment with no attempt as purchase_due, and pending as nothing to post', () => {
    expect(classifyForLedger(instalment, [], '2026-02-15')).toEqual({ kind: 'purchase_due', amountMinor: 10_000 });
    expect(classifyForLedger(instalment, [], '2026-02-01')).toBeNull();
  });

  it('cannot be spoofed into purchase_paid for money that was not actually recorded, because status is derived from attempts, not passed in', () => {
    const partialAttempt = attempt({ amountMinor: 4_000, recordedAt: '2026-02-10T00:00:00.000Z' });
    // Only the partial attempt is in the attempts history — the classification cannot claim PAID for it.
    const classification = classifyForLedger(instalment, [partialAttempt], '2026-02-10T00:00:00.000Z', partialAttempt);
    expect(classification!.kind).toBe('partial_purchase');
  });
});

describe('16. refusals name rule id, observed value and remedy', () => {
  it('every refusal produced by this module carries all three', () => {
    const lateJoin = generateSchedule(config(), '2026-02-01');
    const instalment: Instalment = { index: 0, amountMinor: 10_000, dueDate: '2026-02-15' };
    const paid = [attempt({ amountMinor: 10_000, recordedAt: '2026-02-01T00:00:00.000Z' })];
    const overpay = recordAttempt(
      instalment,
      [attempt({ amountMinor: 8_000, recordedAt: '2026-02-01T00:00:00.000Z' })],
      attempt({ attemptId: 'att-2', amountMinor: 5_000, recordedAt: '2026-02-05T00:00:00.000Z' }),
    );
    const doubleRecord = recordAttempt(instalment, paid, attempt({ attemptId: 'att-2', recordedAt: '2026-02-05T00:00:00.000Z' }));
    const duplicateId = recordAttempt(
      instalment,
      [attempt({ attemptId: 'att-dup', amountMinor: 1_000, recordedAt: '2026-02-01T00:00:00.000Z' })],
      attempt({ attemptId: 'att-dup', amountMinor: 1_000, recordedAt: '2026-02-02T00:00:00.000Z' }),
    );
    const badAmount = recordAttempt(instalment, [], attempt({ amountMinor: 1.5 }));

    for (const finding of [...lateJoin.findings, ...overpay.findings, ...doubleRecord.findings, ...duplicateId.findings, ...badAmount.findings]) {
      expect(finding.rule).toBeTruthy();
      expect(finding.observed).toBeTruthy();
      expect(finding.remedy).toBeTruthy();
    }
  });
});
