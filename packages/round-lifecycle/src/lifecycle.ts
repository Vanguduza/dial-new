/**
 * GROC-F020 — Round lifecycle.
 *
 * Contract: `20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/GROC-F020_ACCEPTANCE_CONTRACT.md`
 *
 * §7 draws seventeen states in a column with arrows between them, and nine
 * exception states in a list with no arrows at all. The column is the easy half.
 * The feature is the arrows nobody drew: which exception is reachable from where,
 * what a pause returns to, and what a transition requires before it is allowed.
 *
 * Two properties from §7 carry the weight. **Auditable** means a transition
 * returns a record rather than mutating an object — a state machine that changes a
 * field and returns void has thrown away the only artefact anyone wants during a
 * dispute. **Idempotent where appropriate** is a distributed-systems requirement in
 * product clothing: a payment webhook arrives twice, a retry re-drives the same
 * transition, and the second attempt must neither fail loudly nor advance twice.
 *
 * One finding is enforced here rather than left to a reader. §7 names an exception
 * state `REFUNDING`, and DEC-001/DEC-005 make credits non-redeemable in money in
 * every circumstance. The state is fine; the name is dangerous, because everyone
 * who sees it — support agents, dashboards, integrations — will read it as *money
 * back*, and RCM-002 exists because one kindly cash refund is evidence that credits
 * are repayable. So the state is permitted and the meaning refused: entering it
 * requires a declared in-kind outcome.
 */

/** The seventeen-state main line of §7, in order. */
export const MAIN_LINE = [
  'DRAFT',
  'PENDING_APPROVAL',
  'OPEN_FOR_MEMBERS',
  'MINIMUM_REACHED',
  'ACTIVE',
  'CONTRIBUTION_PERIOD',
  'BASKET_PLANNING',
  'PROCUREMENT_QUOTING',
  'MEMBER_APPROVAL',
  'PROCUREMENT_LOCKED',
  'ORDERING',
  'RECEIVING',
  'ALLOCATION',
  'DELIVERY',
  'RECONCILIATION',
  'COMPLETED',
] as const;

export const EXCEPTION_STATES = [
  'FAILED_TO_FORM',
  'PAUSED',
  'UNDER_REVIEW',
  'CANCELLED',
  'REFUNDING',
  'DISPUTED',
  'INSURANCE_EVENT',
  'STEP_IN_FULFILMENT',
  'CLOSED',
] as const;

export type MainLineState = (typeof MAIN_LINE)[number];
export type ExceptionState = (typeof EXCEPTION_STATES)[number];
export type RoundState = MainLineState | ExceptionState;

/** Nothing leaves these. R8. */
export const TERMINAL_STATES: readonly RoundState[] = [
  'COMPLETED',
  'CLOSED',
  'CANCELLED',
  'FAILED_TO_FORM',
];

export interface LifecycleFinding {
  rule: string;
  severity: 'REFUSE';
  statement: string;
  observed?: string;
  remedy: string;
}

export interface TransitionRecord {
  roundId: string;
  from: RoundState;
  to: RoundState;
  actor: string;
  reason: string;
  occurredAt: string;
  /** True when the transition was a no-op re-entry. R3. */
  idempotent: boolean;
}

export interface RoundLifecycleState {
  roundId: string;
  state: RoundState;
  /** Where PAUSED or UNDER_REVIEW was entered from, so resuming is not a guess. R6. */
  priorState?: RoundState;
}

/**
 * What a transition needs to know. Every field is supplied rather than read,
 * including the clock — a Round must not advance because a test ran slowly.
 */
export interface TransitionContext {
  actor: string;
  reason: string;
  occurredAt: string;
  memberCount?: number;
  minMembers?: number;
  allMembersAccepted?: boolean;
  memberApprovalRecorded?: boolean;
  goodsReceived?: boolean;
  joinCutoffPassed?: boolean;
  /** DEC-005: an exit returns groceries, never cash. R7. */
  exitOutcome?: 'IN_KIND' | 'CASH';
}

const refuse = (
  rule: string,
  statement: string,
  remedy: string,
  observed?: string,
): LifecycleFinding => ({ rule, severity: 'REFUSE', statement, remedy, ...(observed ? { observed } : {}) });

/** Exception states any live Round may enter. */
const FROM_ANY_LIVE: ExceptionState[] = ['PAUSED', 'UNDER_REVIEW', 'CANCELLED', 'DISPUTED'];

function mainLineIndex(state: RoundState): number {
  return (MAIN_LINE as readonly string[]).indexOf(state);
}

/** R1 — everything §7 permits, and nothing else. */
export function legalTransitionsFrom(state: RoundState): RoundState[] {
  if (TERMINAL_STATES.includes(state)) return [];

  const targets = new Set<RoundState>();
  const index = mainLineIndex(state);

  if (index >= 0 && index < MAIN_LINE.length - 1) {
    targets.add(MAIN_LINE[index + 1]!);
  }

  if (index >= 0) {
    for (const exception of FROM_ANY_LIVE) targets.add(exception);
    // A Round only fails to form while it is still gathering members.
    if (state === 'OPEN_FOR_MEMBERS') targets.add('FAILED_TO_FORM');
    // Protection paths open once there is value at stake, i.e. once contributions
    // can have been taken. Before ACTIVE there is nothing to insure or step into.
    if (index >= mainLineIndex('ACTIVE')) {
      targets.add('INSURANCE_EVENT');
      targets.add('STEP_IN_FULFILMENT');
      targets.add('REFUNDING');
    }
  }

  switch (state) {
    case 'PAUSED':
    case 'UNDER_REVIEW':
      // Resuming is handled by resumeRound, which restores priorState. The only
      // forward moves from here are ending the Round.
      targets.add('CANCELLED');
      targets.add('CLOSED');
      break;
    case 'REFUNDING':
      targets.add('CLOSED');
      break;
    case 'DISPUTED':
      targets.add('UNDER_REVIEW');
      targets.add('REFUNDING');
      targets.add('CLOSED');
      break;
    case 'INSURANCE_EVENT':
      targets.add('STEP_IN_FULFILMENT');
      targets.add('REFUNDING');
      targets.add('CLOSED');
      break;
    case 'STEP_IN_FULFILMENT':
      targets.add('DELIVERY');
      targets.add('CLOSED');
      break;
    default:
      break;
  }

  targets.delete(state);
  return [...targets];
}

/** R4/R5/R7 — what a transition requires beyond being drawn. */
function guard(to: RoundState, context: TransitionContext): LifecycleFinding[] {
  const findings: LifecycleFinding[] = [];

  if (to === 'MINIMUM_REACHED') {
    const have = context.memberCount ?? -1;
    const need = context.minMembers ?? Number.POSITIVE_INFINITY;
    if (have < need) {
      findings.push(
        refuse(
          'RLC-004',
          'A Round reaches its minimum when it has the members its configuration requires.',
          'Supply memberCount and minMembers, and transition once the count meets the minimum. An absent count is not a pass — the most expensive failures in this repository have been checks that passed for want of data.',
          `${have} of ${need}`,
        ),
      );
    }
  }

  if (to === 'ACTIVE' && context.allMembersAccepted !== true) {
    findings.push(
      refuse(
        'RLC-005',
        'A Round goes active only when every member has accepted the agreement.',
        'Record acceptance for every member through GROC-F021 first. Master plan §6 blocks progression until affirmative acceptance, and going active is the progression it means.',
        `allMembersAccepted=${String(context.allMembersAccepted)}`,
      ),
    );
  }

  if (to === 'PROCUREMENT_LOCKED' && context.memberApprovalRecorded !== true) {
    findings.push(
      refuse(
        'RLC-006',
        'Procurement locks only against recorded member approval.',
        'Record the §11.2 vote result before locking. Locking commits members’ value to a basket, and doing it without their recorded approval is the creator override §4 forbids arriving by another route.',
      ),
    );
  }

  if (to === 'ALLOCATION' && context.goodsReceived !== true) {
    findings.push(
      refuse(
        'RLC-007',
        'Goods are allocated after they are received, not before.',
        'Record goods receipt first. Allocating unreceived goods produces entitlements against stock that may never arrive.',
      ),
    );
  }

  if (to === 'FAILED_TO_FORM' && context.joinCutoffPassed !== true) {
    findings.push(
      refuse(
        'RLC-008',
        'A Round that is still open to joiners has not failed to form; it is not yet full.',
        'Wait for the join cut-off, then transition. Supply joinCutoffPassed.',
      ),
    );
  }

  if (to === 'REFUNDING') {
    if (context.exitOutcome === 'CASH') {
      findings.push(
        refuse(
          'RLC-009',
          'A Round settles an exit in groceries. It never returns cash.',
          'Set exitOutcome to IN_KIND. DEC-005 and RCM-002: credits are not redeemable in money in any circumstance, and this state’s name is the most likely place for that to be forgotten.',
          context.exitOutcome,
        ),
      );
    } else if (context.exitOutcome !== 'IN_KIND') {
      findings.push(
        refuse(
          'RLC-009',
          'Entering REFUNDING requires the outcome to be declared, and the only permitted outcome is in kind.',
          'Set exitOutcome to IN_KIND. The state is named REFUNDING in §7 and means settlement in groceries; leaving the outcome undeclared is how it comes to mean what its name suggests.',
          String(context.exitOutcome),
        ),
      );
    }
  }

  return findings;
}

export interface TransitionResult {
  ok: boolean;
  findings: LifecycleFinding[];
  next?: RoundLifecycleState;
  record?: TransitionRecord;
}

/**
 * R1–R9. Returns the next state and an audit record, or the reasons it refused.
 *
 * Never mutates its input. The caller receives a new state object, which is what
 * makes the audit record the thing that happened rather than a description of it.
 */
export function transition(
  current: RoundLifecycleState,
  to: RoundState,
  context: TransitionContext,
): TransitionResult {
  // R3 — idempotent re-entry. Checked before legality, because a retry of a
  // transition that already landed must succeed rather than be told it is illegal.
  if (current.state === to) {
    return {
      ok: true,
      findings: [],
      next: { ...current },
      record: {
        roundId: current.roundId,
        from: current.state,
        to,
        actor: context.actor,
        reason: context.reason,
        occurredAt: context.occurredAt,
        idempotent: true,
      },
    };
  }

  if (TERMINAL_STATES.includes(current.state)) {
    return {
      ok: false,
      findings: [
        refuse(
          'RLC-010',
          `${current.state} is terminal. A Round does not leave it.`,
          'Open a new Round. Reviving a completed, cancelled or closed Round would let its members’ settled position change after the fact.',
          `${current.state} → ${to}`,
        ),
      ],
    };
  }

  const legal = legalTransitionsFrom(current.state);
  if (!legal.includes(to)) {
    return {
      ok: false,
      findings: [
        refuse(
          'RLC-001',
          `${current.state} does not lead to ${to}.`,
          `Reachable from ${current.state}: ${legal.join(', ') || 'nothing'}. Use resumeRound to return from PAUSED or UNDER_REVIEW.`,
          `${current.state} → ${to}`,
        ),
      ],
    };
  }

  const findings = guard(to, context);
  if (findings.length > 0) return { ok: false, findings };

  const next: RoundLifecycleState = {
    roundId: current.roundId,
    state: to,
    // R6 — remember where a pause came from, so resuming is not a guess.
    ...(to === 'PAUSED' || to === 'UNDER_REVIEW' ? { priorState: current.state } : {}),
  };

  return {
    ok: true,
    findings: [],
    next,
    record: {
      roundId: current.roundId,
      from: current.state,
      to,
      actor: context.actor,
      reason: context.reason,
      occurredAt: context.occurredAt,
      idempotent: false,
    },
  };
}

/** R6 — return from PAUSED or UNDER_REVIEW to exactly where it came from. */
export function resumeRound(
  current: RoundLifecycleState,
  context: TransitionContext,
): TransitionResult {
  if (current.state !== 'PAUSED' && current.state !== 'UNDER_REVIEW') {
    return {
      ok: false,
      findings: [
        refuse(
          'RLC-011',
          'Only a paused or reviewed Round resumes.',
          'Use transition() for ordinary movement.',
          current.state,
        ),
      ],
    };
  }

  if (!current.priorState) {
    return {
      ok: false,
      findings: [
        refuse(
          'RLC-012',
          'A Round with no recorded prior state cannot be resumed.',
          'Establish where the Round was before it stopped and set it deliberately. Guessing puts a Round into a state nobody chose, which is worse than leaving it paused.',
        ),
      ],
    };
  }

  return {
    ok: true,
    findings: [],
    next: { roundId: current.roundId, state: current.priorState },
    record: {
      roundId: current.roundId,
      from: current.state,
      to: current.priorState,
      actor: context.actor,
      reason: context.reason,
      occurredAt: context.occurredAt,
      idempotent: false,
    },
  };
}
