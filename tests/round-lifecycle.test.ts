import { describe, expect, it } from 'vitest';
import {
  MAIN_LINE,
  TERMINAL_STATES,
  legalTransitionsFrom,
  resumeRound,
  transition,
  type RoundLifecycleState,
  type RoundState,
  type TransitionContext,
} from '../packages/round-lifecycle/src/lifecycle.js';

/**
 * GROC-F020 — Round lifecycle.
 *
 * Contract: 20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/GROC-F020_ACCEPTANCE_CONTRACT.md
 */

const at = (state: RoundState, priorState?: RoundState): RoundLifecycleState => ({
  roundId: 'rnd-0001',
  state,
  ...(priorState ? { priorState } : {}),
});

const ctx = (over: Partial<TransitionContext> = {}): TransitionContext => ({
  actor: 'ops:amina',
  reason: 'scheduled progression',
  occurredAt: '2026-09-01T08:00:00Z',
  memberCount: 40,
  minMembers: 20,
  allMembersAccepted: true,
  memberApprovalRecorded: true,
  goodsReceived: true,
  joinCutoffPassed: true,
  exitOutcome: 'IN_KIND',
  ...over,
});

const rules = (r: { findings: Array<{ rule: string }> }): string[] => r.findings.map((f) => f.rule);

describe('criterion 1 — the main line advances in order', () => {
  it('walks all sixteen steps end to end', () => {
    let state = at('DRAFT');
    for (let i = 0; i < MAIN_LINE.length - 1; i++) {
      const result = transition(state, MAIN_LINE[i + 1]!, ctx());
      expect(result.ok, `${MAIN_LINE[i]} → ${MAIN_LINE[i + 1]}`).toBe(true);
      state = result.next!;
    }
    expect(state.state).toBe('COMPLETED');
  });
});

describe('criteria 2-3 — skipping and reversing are refused', () => {
  it('refuses a skipped main-line state, naming what is reachable', () => {
    const result = transition(at('DRAFT'), 'OPEN_FOR_MEMBERS', ctx());
    expect(result.ok).toBe(false);
    expect(rules(result)).toContain('RLC-001');
    expect(result.findings[0]!.remedy).toContain('PENDING_APPROVAL');
  });

  it('refuses going backwards', () => {
    expect(transition(at('ACTIVE'), 'MINIMUM_REACHED', ctx()).ok).toBe(false);
  });
});

describe('criterion 4 — a transition returns an audit record', () => {
  it('carries from, to, actor, reason and the moment', () => {
    const result = transition(at('DRAFT'), 'PENDING_APPROVAL', ctx());
    expect(result.record).toEqual({
      roundId: 'rnd-0001',
      from: 'DRAFT',
      to: 'PENDING_APPROVAL',
      actor: 'ops:amina',
      reason: 'scheduled progression',
      occurredAt: '2026-09-01T08:00:00Z',
      idempotent: false,
    });
  });

  it('does not mutate the state it was given', () => {
    const before = at('DRAFT');
    const snapshot = { ...before };
    transition(before, 'PENDING_APPROVAL', ctx());
    expect(before).toEqual(snapshot);
  });
});

describe('criterion 5 — re-entry is an idempotent no-op', () => {
  it('succeeds and marks itself idempotent', () => {
    // A payment webhook arrives twice; the second must not fail or advance twice.
    const result = transition(at('CONTRIBUTION_PERIOD'), 'CONTRIBUTION_PERIOD', ctx());
    expect(result.ok).toBe(true);
    expect(result.record!.idempotent).toBe(true);
    expect(result.next!.state).toBe('CONTRIBUTION_PERIOD');
  });

  it('is idempotent even from a terminal state', () => {
    // A retry of the transition that completed the Round must not error.
    const result = transition(at('COMPLETED'), 'COMPLETED', ctx());
    expect(result.ok).toBe(true);
    expect(result.record!.idempotent).toBe(true);
  });
});

describe('criteria 6-9 — guarded transitions', () => {
  it('refuses MINIMUM_REACHED below the minimum, and allows it at the minimum', () => {
    const from = at('OPEN_FOR_MEMBERS');
    expect(rules(transition(from, 'MINIMUM_REACHED', ctx({ memberCount: 19, minMembers: 20 })))).toContain('RLC-004');
    expect(transition(from, 'MINIMUM_REACHED', ctx({ memberCount: 20, minMembers: 20 })).ok).toBe(true);
  });

  it('treats an absent member count as a refusal, not a pass', () => {
    const result = transition(at('OPEN_FOR_MEMBERS'), 'MINIMUM_REACHED', ctx({ memberCount: undefined }));
    expect(rules(result)).toContain('RLC-004');
    expect(result.findings[0]!.remedy).toMatch(/not a pass/);
  });

  it('refuses ACTIVE while any member has not accepted', () => {
    expect(
      rules(transition(at('MINIMUM_REACHED'), 'ACTIVE', ctx({ allMembersAccepted: false }))),
    ).toContain('RLC-005');
  });

  it('refuses PROCUREMENT_LOCKED without recorded member approval', () => {
    expect(
      rules(transition(at('MEMBER_APPROVAL'), 'PROCUREMENT_LOCKED', ctx({ memberApprovalRecorded: false }))),
    ).toContain('RLC-006');
  });

  it('refuses ALLOCATION before goods are received', () => {
    expect(rules(transition(at('RECEIVING'), 'ALLOCATION', ctx({ goodsReceived: false })))).toContain('RLC-007');
  });
});

describe('criteria 10-11 — FAILED_TO_FORM is narrow', () => {
  it('is unreachable from anywhere but OPEN_FOR_MEMBERS', () => {
    for (const state of ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'DELIVERY'] as RoundState[]) {
      expect(transition(at(state), 'FAILED_TO_FORM', ctx()).ok, state).toBe(false);
    }
    expect(transition(at('OPEN_FOR_MEMBERS'), 'FAILED_TO_FORM', ctx()).ok).toBe(true);
  });

  it('is refused before the join cut-off passes', () => {
    // A Round still open to joiners has not failed; it is not yet full.
    const result = transition(at('OPEN_FOR_MEMBERS'), 'FAILED_TO_FORM', ctx({ joinCutoffPassed: false }));
    expect(rules(result)).toContain('RLC-008');
  });
});

describe('criteria 12-13 — pausing remembers, resuming does not guess', () => {
  it('records where PAUSED came from and returns exactly there', () => {
    const paused = transition(at('CONTRIBUTION_PERIOD'), 'PAUSED', ctx());
    expect(paused.next!.priorState).toBe('CONTRIBUTION_PERIOD');

    const resumed = resumeRound(paused.next!, ctx());
    expect(resumed.ok).toBe(true);
    expect(resumed.next!.state).toBe('CONTRIBUTION_PERIOD');
    expect(resumed.record!.from).toBe('PAUSED');
  });

  it('does the same for UNDER_REVIEW', () => {
    const reviewed = transition(at('BASKET_PLANNING'), 'UNDER_REVIEW', ctx());
    expect(resumeRound(reviewed.next!, ctx()).next!.state).toBe('BASKET_PLANNING');
  });

  it('refuses to resume with no recorded prior state', () => {
    const result = resumeRound(at('PAUSED'), ctx());
    expect(rules(result)).toContain('RLC-012');
    expect(result.findings[0]!.remedy).toMatch(/Guessing/);
  });

  it('refuses to resume a Round that is not paused', () => {
    expect(rules(resumeRound(at('ACTIVE'), ctx()))).toContain('RLC-011');
  });
});

describe('criteria 14-15 — REFUNDING settles in kind, never in cash', () => {
  it('refuses a cash outcome, citing the locked decision', () => {
    const result = transition(at('CONTRIBUTION_PERIOD'), 'REFUNDING', ctx({ exitOutcome: 'CASH' }));
    expect(rules(result)).toContain('RLC-009');
    expect(result.findings[0]!.remedy).toMatch(/DEC-005/);
  });

  it('refuses an undeclared outcome rather than assuming the safe one', () => {
    // Leaving it undeclared is how the state comes to mean what its name suggests.
    expect(
      rules(transition(at('CONTRIBUTION_PERIOD'), 'REFUNDING', ctx({ exitOutcome: undefined }))),
    ).toContain('RLC-009');
  });

  it('allows an in-kind outcome', () => {
    expect(transition(at('CONTRIBUTION_PERIOD'), 'REFUNDING', ctx({ exitOutcome: 'IN_KIND' })).ok).toBe(true);
  });

  it('is unreachable before there is value at stake', () => {
    // Nothing to settle before a Round goes active.
    expect(transition(at('OPEN_FOR_MEMBERS'), 'REFUNDING', ctx()).ok).toBe(false);
  });
});

describe('criterion 16 — terminal states are terminal', () => {
  it('refuses every outbound transition from each of them', () => {
    for (const terminal of TERMINAL_STATES) {
      expect(legalTransitionsFrom(terminal), terminal).toEqual([]);
      for (const target of ['ACTIVE', 'PAUSED', 'CLOSED'] as RoundState[]) {
        if (target === terminal) continue;
        const result = transition(at(terminal), target, ctx());
        expect(result.ok, `${terminal} → ${target}`).toBe(false);
        expect(rules(result)).toContain('RLC-010');
      }
    }
  });
});

describe('exception routing', () => {
  it('lets a live Round pause, be reviewed, be cancelled or be disputed', () => {
    for (const target of ['PAUSED', 'UNDER_REVIEW', 'CANCELLED', 'DISPUTED'] as RoundState[]) {
      expect(transition(at('CONTRIBUTION_PERIOD'), target, ctx()).ok, target).toBe(true);
    }
  });

  it('opens the protection paths only once a Round is active', () => {
    expect(transition(at('DRAFT'), 'INSURANCE_EVENT', ctx()).ok).toBe(false);
    expect(transition(at('ORDERING'), 'INSURANCE_EVENT', ctx()).ok).toBe(true);
  });

  it('lets step-in fulfilment rejoin the main line at delivery', () => {
    // §16.4 prefers replacing the groceries over paying out.
    expect(transition(at('STEP_IN_FULFILMENT'), 'DELIVERY', ctx()).ok).toBe(true);
  });

  it('states a remedy on every refusal it can raise', () => {
    const refusals = [
      transition(at('DRAFT'), 'DELIVERY', ctx()),
      transition(at('OPEN_FOR_MEMBERS'), 'MINIMUM_REACHED', ctx({ memberCount: 0 })),
      transition(at('COMPLETED'), 'ACTIVE', ctx()),
      resumeRound(at('PAUSED'), ctx()),
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
