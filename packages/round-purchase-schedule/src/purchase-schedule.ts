/**
 * GROC-F023 — Prepaid purchase schedule.
 *
 * Contract: `20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/GROC-F023_ACCEPTANCE_CONTRACT.md`
 *
 * `round-ledger` already declares `purchase_due`/`purchase_processing`/`purchase_failed`/
 * `partial_purchase`/`late_purchase` as event kinds and posts zero movements for the
 * timeline ones, but nothing decides when a `purchase_due` becomes true or classifies a
 * recorded attempt against it. `round-ledger`'s own `recordPayment` hands it exactly one
 * kind, unconditionally: `purchase_paid`, in full. This module is the gap in front of
 * that — a pure schedule and a pure classifier, so a caller cannot mis-post a partial as
 * paid or a paid instalment as late. It posts nothing itself; `GROC-F024` owns every
 * movement.
 */

import type { LedgerEventKind } from '@dial/round-ledger/src/ledger.js';

export type InstalmentStatus = 'PENDING' | 'DUE' | 'PARTIAL' | 'LATE' | 'FAILED' | 'PAID';

export type AttemptKind = 'PROCESSING' | 'SUCCESS' | 'FAILURE';

export interface PurchaseScheduleFinding {
  rule: string;
  severity: 'REFUSE';
  statement: string;
  observed?: string;
  remedy: string;
}

/** One instalment of a prepaid schedule. §9.1's six-line table, one row. */
export interface Instalment {
  index: number;
  /** Whole minor-unit integer — `RPL-003` already guarantees this at the source. */
  amountMinor: number;
  /** ISO date, `YYYY-MM-DD`. */
  dueDate: string;
}

/** The slice of `RoundConfiguration` this feature needs — `GROC-F019`. */
export interface ScheduleConfig {
  roundId: string;
  contributionMinor: number;
  durationMonths: number;
  /** ISO date, `YYYY-MM-DD`. */
  startDate: string;
  /** `round-plan` currently declares only `'MONTHLY'`. */
  contributionFrequency: 'MONTHLY';
}

/** A recorded payment attempt against one instalment. Recording, not capturing — `ACT-REG-002`/`ACT-REG-003` own capture. */
export interface RecordedAttempt {
  attemptId: string;
  kind: AttemptKind;
  /** Minor units. `0` for `PROCESSING`/`FAILURE`, which move no money. */
  amountMinor: number;
  recordedAt: string;
}

export interface LedgerClassification {
  kind: LedgerEventKind;
  amountMinor: number;
}

const refuse = (
  rule: string,
  statement: string,
  remedy: string,
  observed?: string,
): PurchaseScheduleFinding => ({ rule, severity: 'REFUSE', statement, remedy, ...(observed ? { observed } : {}) });

const label = (instalment: Instalment): string => `instalment ${instalment.index} due ${instalment.dueDate}`;

const toISODate = (d: Date): string => d.toISOString().slice(0, 10);

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A date-only value must both have the canonical shape and survive UTC parsing unchanged. */
const isValidISODateOnly = (value: string): boolean => {
  if (!ISO_DATE_ONLY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && toISODate(parsed) === value;
};

/**
 * Whole calendar months added in UTC, clamped to the target month's last day.
 *
 * `Date.UTC` overflows a day that does not exist in the target month (31 Jan + 1 month
 * would silently become 3 Mar, skipping February and colliding two instalments into
 * March) rather than landing on the nearest valid date, so the clamp is computed
 * explicitly instead of trusted to the platform.
 */
const addMonthsUTC = (date: Date, months: number): Date => {
  const target = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDayOfMonth)));
};

/** Calendar-date comparison, ignoring time of day. `-1`/`0`/`1`, or `null` if either is unparseable. */
function compareDates(a: string, b: string): -1 | 0 | 1 | null {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  const ta = Date.UTC(da.getUTCFullYear(), da.getUTCMonth(), da.getUTCDate());
  const tb = Date.UTC(db.getUTCFullYear(), db.getUTCMonth(), db.getUTCDate());
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  return 0;
}

export interface GenerateScheduleResult {
  ok: boolean;
  findings: PurchaseScheduleFinding[];
  instalments?: Instalment[];
}

/**
 * R1/R2/R3 — the schedule is a pure function of configuration, accounts for the whole
 * contribution to the minor unit, and refuses a member who joined after `startDate`
 * rather than guessing an instalment policy the source never states.
 *
 * `startDate`/`joinedAt` are required to be `YYYY-MM-DD`, not just parseable: `Date`
 * parses a slashed date (`'2026/01/15'`) as local time rather than UTC, which would make
 * the first instalment's due date depend on the host's timezone and break criterion 3's
 * determinism on any machine west of UTC.
 */
export function generateSchedule(config: ScheduleConfig, joinedAt: string): GenerateScheduleResult {
  if (!isValidISODateOnly(config.startDate) || !isValidISODateOnly(joinedAt)) {
    return {
      ok: false,
      findings: [
        refuse(
          'RPS-001',
          'The Round start date and the member join date are YYYY-MM-DD dates.',
          'Provide startDate and joinedAt as YYYY-MM-DD. A locale- or timezone-dependent format is refused because it would make the schedule non-deterministic across hosts.',
          `${config.startDate} / ${joinedAt}`,
        ),
      ],
    };
  }

  const dateOrder = compareDates(joinedAt, config.startDate);
  if (dateOrder === null) {
    return {
      ok: false,
      findings: [
        refuse(
          'RPS-001',
          'The Round start date and the member join date are valid dates.',
          'Provide valid YYYY-MM-DD dates for startDate and joinedAt.',
          `${config.startDate} / ${joinedAt}`,
        ),
      ],
    };
  }

  if (dateOrder > 0) {
    return {
      ok: false,
      findings: [
        refuse(
          'RPS-002',
          'No instalment policy exists for a member who joins after the Round has started.',
          'Do not generate a schedule for a late joiner until product decides the late-join instalment policy. `RPL-006`/`RMB-002` permit the join; this feature does not yet know what they owe.',
          `joined ${joinedAt}, started ${config.startDate}`,
        ),
      ],
    };
  }

  if (!Number.isInteger(config.durationMonths) || config.durationMonths < 1) {
    return {
      ok: false,
      findings: [
        refuse(
          'RPS-003',
          'A schedule has at least one instalment.',
          'Correct durationMonths. `RPL-004` should already have refused this at plan validation.',
          String(config.durationMonths),
        ),
      ],
    };
  }

  if (!Number.isInteger(config.contributionMinor) || config.contributionMinor <= 0) {
    return {
      ok: false,
      findings: [
        refuse(
          'RPS-004',
          'An instalment is a positive whole minor-unit amount.',
          'Correct contributionMinor. `RPL-003` should already have refused this at plan validation.',
          String(config.contributionMinor),
        ),
      ],
    };
  }

  const start = new Date(config.startDate);
  const instalments: Instalment[] = Array.from({ length: config.durationMonths }, (_, index) => ({
    index,
    amountMinor: config.contributionMinor,
    dueDate: toISODate(addMonthsUTC(start, index)),
  }));

  return { ok: true, findings: [], instalments };
}

const successTotal = (attempts: readonly RecordedAttempt[]): number =>
  attempts.filter((a) => a.kind === 'SUCCESS').reduce((sum, a) => sum + a.amountMinor, 0);

const mostRecent = (attempts: readonly RecordedAttempt[]): RecordedAttempt | undefined =>
  [...attempts].sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()).at(-1);

/**
 * R4/R5/R6 — an instalment's status, derived, never stored.
 *
 * `PAID` wins outright (R5). Past that, `LATE` is checked before `PARTIAL`/`FAILED` so a
 * due date that has passed always reports `LATE` regardless of what was or wasn't
 * recorded against it (criterion 8) — including a `FAILED` instalment that nobody has
 * since retried, which is exactly the case R6 says must never present as stuck.
 *
 * `now` and `instalment.dueDate` are required to be comparable dates: an unparseable
 * clock is refused loudly rather than defaulting to `PENDING`, which would silently tell
 * an overdue member they are not late.
 */
export function deriveStatus(instalment: Instalment, attempts: readonly RecordedAttempt[], now: string): InstalmentStatus {
  const dueOrder = compareDates(now, instalment.dueDate);
  if (dueOrder === null) {
    throw new Error(`deriveStatus: '${now}' or '${instalment.dueDate}' is not a valid date`);
  }

  const total = successTotal(attempts);
  if (total >= instalment.amountMinor && instalment.amountMinor > 0) return 'PAID';

  if (dueOrder === 1) return 'LATE';
  if (total > 0) return 'PARTIAL';

  const last = mostRecent(attempts);
  if (last?.kind === 'FAILURE') return 'FAILED';

  return dueOrder === 0 ? 'DUE' : 'PENDING';
}

export interface RecordAttemptResult {
  ok: boolean;
  findings: PurchaseScheduleFinding[];
  attempts?: RecordedAttempt[];
}

/**
 * R7/R8 — refuse an overpayment or a second recording against a settled instalment,
 * rather than absorbing or silently ignoring either. Also refuses a non-integer or
 * negative amount (mirroring `round-ledger`'s `RLG-008`, since this module sits upstream
 * of that check and a member should not be told a wrong status before the ledger ever
 * gets a chance to refuse), and a repeated `attemptId` (mirroring `RLG-001`) — a payment
 * provider's callback is normally delivered at least once, not exactly once, and without
 * this an instalment can be pushed to `PAID` on a retried callback for half the money.
 */
export function recordAttempt(
  instalment: Instalment,
  existing: readonly RecordedAttempt[],
  attempt: RecordedAttempt,
): RecordAttemptResult {
  if (existing.some((a) => a.attemptId === attempt.attemptId)) {
    return {
      ok: false,
      findings: [
        refuse(
          'RPS-007',
          'This attempt is already recorded against this instalment.',
          'Use a fresh attempt id. Re-recording an existing id would double-count a payment provider callback that was delivered more than once.',
          attempt.attemptId,
        ),
      ],
    };
  }

  const expectedZero = attempt.kind === 'PROCESSING' || attempt.kind === 'FAILURE';
  if (!Number.isInteger(attempt.amountMinor) || attempt.amountMinor < 0 || (expectedZero && attempt.amountMinor !== 0)) {
    return {
      ok: false,
      findings: [
        refuse(
          'RPS-008',
          expectedZero
            ? `A ${attempt.kind} attempt carries no amount; it moves no money.`
            : 'An attempt amount is a whole, non-negative minor-unit integer.',
          expectedZero
            ? 'Record the attempt with amountMinor 0.'
            : 'Express the amount in minor units. A major-unit or negative value would misstate the instalment status before the ledger ever sees it.',
          String(attempt.amountMinor),
        ),
      ],
    };
  }

  if (deriveStatus(instalment, existing, attempt.recordedAt) === 'PAID') {
    return {
      ok: false,
      findings: [
        refuse(
          'RPS-005',
          'An attempt is not recorded against an instalment already paid in full.',
          `Check the instalment's status before recording. ${label(instalment)} is already PAID.`,
          attempt.attemptId,
        ),
      ],
    };
  }

  if (attempt.kind === 'SUCCESS') {
    const total = successTotal(existing) + attempt.amountMinor;
    if (total > instalment.amountMinor) {
      return {
        ok: false,
        findings: [
          refuse(
            'RPS-006',
            "An attempt's amount does not take an instalment's recorded total past its amountMinor.",
            `Record at most ${instalment.amountMinor - successTotal(existing)} minor units against ${label(instalment)}, or apply the excess elsewhere once product decides an overpayment policy.`,
            `${total} would be recorded against a ${instalment.amountMinor} instalment`,
          ),
        ],
      };
    }
  }

  return { ok: true, findings: [], attempts: [...existing, attempt] };
}

/**
 * R9 — one ledger event kind and amount, and only one, so a caller cannot mis-post a
 * partial as `purchase_paid` or a paid instalment as `late_purchase`.
 *
 * The resulting status is derived here from `attempts`/`now` rather than accepted as a
 * parameter, so a caller cannot desynchronise the classification from the status that
 * actually produced it. Pass `attempts` including `attempt` itself (the state
 * `recordAttempt` returns after accepting it) so the derivation reflects what is about to
 * be posted.
 *
 * `LATE` with a successful attempt still moves money — the member paid, just after the
 * due date — so it classifies as `partial_purchase` exactly like `PARTIAL` (R9: full
 * amount is `purchase_paid`, anything less is `partial_purchase`, regardless of date).
 * `late_purchase` is the zero-movement timeline fact that a due date passed with nothing
 * (or not enough) recorded, exactly like `purchase_due` is for `DUE` — both fire with no
 * attempt at all.
 */
export function classifyForLedger(
  instalment: Instalment,
  attempts: readonly RecordedAttempt[],
  now: string,
  attempt?: RecordedAttempt,
): LedgerClassification | null {
  const status = deriveStatus(instalment, attempts, now);

  if (!attempt) {
    // The outstanding balance, not the instalment's full amount: a partial payment
    // recorded before the due date and nothing since leaves less than the full amount
    // overdue when the due date passes, and the timeline event should say so.
    const outstanding = instalment.amountMinor - successTotal(attempts);
    if (status === 'DUE') return { kind: 'purchase_due', amountMinor: outstanding };
    if (status === 'LATE') return { kind: 'late_purchase', amountMinor: outstanding };
    return null;
  }

  if (attempt.kind === 'FAILURE') return { kind: 'purchase_failed', amountMinor: 0 };
  if (attempt.kind === 'PROCESSING') return { kind: 'purchase_processing', amountMinor: attempt.amountMinor };

  switch (status) {
    case 'PAID':
      return { kind: 'purchase_paid', amountMinor: attempt.amountMinor };
    case 'PARTIAL':
    case 'LATE':
      return { kind: 'partial_purchase', amountMinor: attempt.amountMinor };
    default:
      return null;
  }
}
