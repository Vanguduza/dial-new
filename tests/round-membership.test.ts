import { describe, expect, it } from 'vitest';
import {
  applyDefault,
  evaluateJoin,
  exitMember,
  recordLapse,
  removeCreator,
  removeMember,
  type Applicant,
  type JoinContext,
  type Membership,
} from '../packages/round-membership/src/membership.js';

/**
 * GROC-F022 — Round membership & join control.
 *
 * Contract: 20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/GROC-F022_ACCEPTANCE_CONTRACT.md
 */

const context = (over: Partial<JoinContext> = {}): JoinContext => ({
  roundId: 'rnd-0001',
  roundState: 'OPEN_FOR_MEMBERS',
  membershipMode: 'OPEN',
  deliveryZoneId: 'zone-harare-central',
  maxMembers: 100,
  currentMemberCount: 40,
  joinCutoffPassed: false,
  ...over,
});

const applicant = (over: Partial<Applicant> = {}): Applicant => ({
  customerId: 'cus-0002',
  eligible: true,
  deliveryZoneId: 'zone-harare-central',
  hasAcceptedAgreement: true,
  ...over,
});

const member = (over: Partial<Membership> = {}): Membership => ({
  membershipId: 'mem-0001',
  roundId: 'rnd-0001',
  customerId: 'cus-0001',
  status: 'ACTIVE',
  isCreator: false,
  validPurchasesMinor: 30_000,
  joinedAt: '2026-09-01T00:00:00Z',
  ...over,
});

const rules = (r: { findings: Array<{ rule: string }> }): string[] => r.findings.map((f) => f.rule);

describe('the eight conditions', () => {
  it('admits an applicant who satisfies all of them', () => {
    const result = evaluateJoin(applicant(), context(), []);
    expect(result.findings).toEqual([]);
    expect(result.admitted).toBe(true);
  });

  it('criterion 1 — refuses a Round not open for members', () => {
    for (const state of ['DRAFT', 'ACTIVE', 'DELIVERY', 'COMPLETED']) {
      expect(rules(evaluateJoin(applicant(), context({ roundState: state }), [])), state).toContain('RMB-001');
    }
    expect(evaluateJoin(applicant(), context({ roundState: 'MINIMUM_REACHED' }), []).admitted).toBe(true);
  });

  it('criterion 2 — refuses a join after the cut-off', () => {
    expect(rules(evaluateJoin(applicant(), context({ joinCutoffPassed: true }), []))).toContain('RMB-002');
  });

  it('criterion 3 — the maximum is exact', () => {
    expect(
      rules(evaluateJoin(applicant(), context({ currentMemberCount: 100, maxMembers: 100 }), [])),
    ).toContain('RMB-003');
    expect(evaluateJoin(applicant(), context({ currentMemberCount: 99, maxMembers: 100 }), []).admitted).toBe(true);
  });

  it('criterion 4 — refuses a member who is already in', () => {
    const roster = [member({ customerId: 'cus-0002' })];
    expect(rules(evaluateJoin(applicant({ customerId: 'cus-0002' }), context(), roster))).toContain('RMB-004');
  });

  it('lets a previously exited member rejoin', () => {
    // Their old membership is settled; nothing about it forbids a fresh one.
    const roster = [member({ customerId: 'cus-0002', status: 'EXITED' })];
    expect(evaluateJoin(applicant({ customerId: 'cus-0002' }), context(), roster).admitted).toBe(true);
  });

  it('criterion 5 — refuses a join with no recorded agreement acceptance', () => {
    const result = evaluateJoin(applicant({ hasAcceptedAgreement: false }), context(), []);
    expect(rules(result)).toContain('RMB-005');
    expect(result.findings[0]!.remedy).toMatch(/GROC-F021/);
  });

  it('criterion 6 — refuses an ineligible applicant', () => {
    expect(rules(evaluateJoin(applicant({ eligible: false }), context(), []))).toContain('RMB-006');
  });

  it('criterion 7 — refuses an applicant outside the delivery zone', () => {
    expect(
      rules(evaluateJoin(applicant({ deliveryZoneId: 'zone-bulawayo' }), context(), [])),
    ).toContain('RMB-007');
  });

  it('criteria 8-9 — each mode has its own requirement', () => {
    const request = context({ membershipMode: 'REQUEST_TO_JOIN' });
    expect(rules(evaluateJoin(applicant(), request, []))).toContain('RMB-008');
    expect(evaluateJoin(applicant({ approvalRecorded: true }), request, []).admitted).toBe(true);

    const invite = context({ membershipMode: 'INVITATION' });
    expect(rules(evaluateJoin(applicant(), invite, []))).toContain('RMB-008');
    expect(evaluateJoin(applicant({ validInvitation: true }), invite, []).admitted).toBe(true);
  });

  it('criterion 16 — reports every failed condition, each naming itself', () => {
    // "Joining failed" is not something a member can act on.
    const result = evaluateJoin(
      applicant({ eligible: false, hasAcceptedAgreement: false, deliveryZoneId: 'elsewhere' }),
      context({ joinCutoffPassed: true, currentMemberCount: 100, maxMembers: 100 }),
      [],
    );
    expect(new Set(rules(result)).size).toBeGreaterThanOrEqual(5);
    for (const finding of result.findings) {
      expect(finding.severity).toBe('REFUSE');
      expect(finding.remedy.length).toBeGreaterThan(20);
    }
  });
});

describe('criteria 10-11 — a creator moderates, and does not remove', () => {
  it('refuses removal by the creator, citing §4', () => {
    const result = removeMember(member(), { kind: 'ROUND_CREATOR', id: 'cus-0009' }, 'disagreement');
    expect(rules(result)).toContain('RMB-009');
    expect(result.findings[0]!.remedy).toMatch(/§4/);
  });

  it('refuses removal by an ordinary member', () => {
    expect(rules(removeMember(member(), { kind: 'MEMBER', id: 'cus-0003' }, 'x'))).toContain('RMB-009');
  });

  it('allows platform governance to remove', () => {
    const result = removeMember(member(), { kind: 'PLATFORM_GOVERNANCE', id: 'gov-1' }, 'fraud review');
    expect(result.ok).toBe(true);
    expect(result.next!.status).toBe('REMOVED');
  });

  it('leaves valid purchases intact through removal', () => {
    // §10: a status change never reduces what was actually paid.
    const result = removeMember(member(), { kind: 'PLATFORM_GOVERNANCE', id: 'gov-1' }, 'review');
    expect(result.next!.validPurchasesMinor).toBe(30_000);
  });
});

describe('criterion 12 — a Round survives its creator', () => {
  const roster = [
    member({ membershipId: 'mem-c', customerId: 'cus-creator', isCreator: true, validPurchasesMinor: 10_000 }),
    member({ membershipId: 'mem-a', customerId: 'cus-a', validPurchasesMinor: 20_000 }),
    member({ membershipId: 'mem-b', customerId: 'cus-b', validPurchasesMinor: 25_000 }),
  ];

  it('removes the creator and changes nobody else', () => {
    const result = removeCreator(roster, { kind: 'PLATFORM_GOVERNANCE', id: 'gov-1' }, 'misconduct');
    expect(result.findings).toEqual([]);
    const others = result.roster.filter((m) => m.membershipId !== 'mem-c');
    expect(others).toEqual(roster.filter((m) => m.membershipId !== 'mem-c'));
  });

  it('strips creator standing and keeps their own purchases', () => {
    const result = removeCreator(roster, { kind: 'PLATFORM_GOVERNANCE', id: 'gov-1' }, 'misconduct');
    const former = result.roster.find((m) => m.membershipId === 'mem-c')!;
    expect(former.isCreator).toBe(false);
    expect(former.status).toBe('REMOVED');
    expect(former.validPurchasesMinor).toBe(10_000);
  });

  it('will not let a creator remove themselves to escape governance', () => {
    expect(rules(removeCreator(roster, { kind: 'ROUND_CREATOR', id: 'cus-creator' }, 'x'))).toContain('RMB-009');
  });
});

describe('criteria 13-14 — stopping preserves, and touches nobody else', () => {
  it('keeps valid purchases when a member lapses', () => {
    const result = recordLapse(member({ validPurchasesMinor: 30_000 }));
    expect(result.next!.status).toBe('LAPSED');
    expect(result.next!.validPurchasesMinor).toBe(30_000);
  });

  it('refuses to lapse a membership that is not active', () => {
    expect(rules(recordLapse(member({ status: 'EXITED' })))).toContain('RMB-010');
  });

  it('changes exactly one membership when a default is recorded', () => {
    const roster = [
      member({ membershipId: 'mem-a', customerId: 'cus-a', validPurchasesMinor: 20_000 }),
      member({ membershipId: 'mem-b', customerId: 'cus-b', validPurchasesMinor: 25_000 }),
      member({ membershipId: 'mem-c', customerId: 'cus-c', validPurchasesMinor: 30_000 }),
    ];
    const result = applyDefault(roster, 'cus-b');
    expect(result.findings).toEqual([]);

    const untouched = result.roster.filter((m) => m.customerId !== 'cus-b');
    expect(untouched).toEqual(roster.filter((m) => m.customerId !== 'cus-b'));

    const defaulted = result.roster.find((m) => m.customerId === 'cus-b')!;
    expect(defaulted.status).toBe('LAPSED');
    expect(defaulted.validPurchasesMinor).toBe(25_000);
  });

  it('refuses a default against a member who is not in the Round', () => {
    expect(rules(applyDefault([member()], 'cus-nobody'))).toContain('RMB-012');
  });
});

describe('criterion 15 — an exit settles in kind', () => {
  it('refuses a cash exit', () => {
    const result = exitMember(member(), 'CASH');
    expect(rules(result)).toContain('RMB-011');
    expect(result.findings[0]!.remedy).toMatch(/DEC-005/);
  });

  it('allows an in-kind exit and keeps the purchase record', () => {
    const result = exitMember(member({ validPurchasesMinor: 18_000 }), 'IN_KIND');
    expect(result.ok).toBe(true);
    expect(result.next!.status).toBe('EXITED');
    expect(result.next!.validPurchasesMinor).toBe(18_000);
  });

  it('is idempotent for a member who has already exited', () => {
    const result = exitMember(member({ status: 'EXITED' }), 'IN_KIND');
    expect(result.ok).toBe(true);
    expect(result.next!.status).toBe('EXITED');
  });
});
