/**
 * GROC-F022 — Round membership and join control.
 *
 * Contract: `20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/GROC-F022_ACCEPTANCE_CONTRACT.md`
 *
 * Joining looks like a button and is eight conditions holding at once. The more
 * interesting half is what happens when a member stops, because §10 is where a
 * Round either survives its worst member or punishes its best ones:
 *
 * > A member's failure to complete all planned instalments must not automatically
 * > reduce other members' entitlements.
 *
 * And one sentence from §4 that is usually read as being about money:
 *
 * > Round initiators may organise and moderate but may not withdraw, redirect,
 * > alter or privately control pooled purchase contributions.
 *
 * It is also about membership. A creator who can remove a member holding credits
 * has redirected pooled value by another route — the entitlement survives, but the
 * member's standing in the Round holding it does not. So a creator moderates and
 * cannot end a membership. Review finding H4 draws the same boundary around
 * representations; this is that boundary one step further in.
 */

export type MembershipMode = 'OPEN' | 'REQUEST_TO_JOIN' | 'INVITATION';

export type MembershipStatus =
  | 'ACTIVE'
  /** Stopped contributing. Valid purchases survive — §10. */
  | 'LAPSED'
  /** Left deliberately, settled in kind — DEC-005. */
  | 'EXITED'
  /** Removed by platform governance. Never by a creator. */
  | 'REMOVED';

export type Actor = { kind: 'MEMBER' | 'ROUND_CREATOR' | 'PLATFORM_GOVERNANCE'; id: string };

export interface MembershipFinding {
  rule: string;
  severity: 'REFUSE';
  statement: string;
  observed?: string;
  remedy: string;
}

export interface Membership {
  membershipId: string;
  roundId: string;
  customerId: string;
  status: MembershipStatus;
  isCreator: boolean;
  /** Minor units actually paid and valid. §10: this never falls because of a status change. */
  validPurchasesMinor: number;
  joinedAt: string;
}

/** What the Round looks like at the moment someone tries to join. */
export interface JoinContext {
  roundId: string;
  roundState: string;
  membershipMode: MembershipMode;
  deliveryZoneId: string;
  maxMembers: number;
  currentMemberCount: number;
  joinCutoffPassed: boolean;
}

export interface Applicant {
  customerId: string;
  eligible: boolean;
  deliveryZoneId: string;
  /** A recorded acceptance of the agreement in force — GROC-F021. */
  hasAcceptedAgreement: boolean;
  approvalRecorded?: boolean;
  validInvitation?: boolean;
}

const refuse = (
  rule: string,
  statement: string,
  remedy: string,
  observed?: string,
): MembershipFinding => ({ rule, severity: 'REFUSE', statement, remedy, ...(observed ? { observed } : {}) });

/** Only these states take new members: a Round gathers until it stops gathering. */
const ACCEPTING_STATES = ['OPEN_FOR_MEMBERS', 'MINIMUM_REACHED'];

/**
 * R1/R2/R8 — the eight conditions.
 *
 * Every failed condition is reported, and each names itself. "Joining failed" is
 * not an answer anybody can act on, and a member told which of eight things went
 * wrong can fix it without contacting support.
 */
export function evaluateJoin(
  applicant: Applicant,
  context: JoinContext,
  existing: readonly Membership[],
): { admitted: boolean; findings: MembershipFinding[] } {
  const findings: MembershipFinding[] = [];

  if (!ACCEPTING_STATES.includes(context.roundState)) {
    findings.push(
      refuse(
        'RMB-001',
        'This Round is not accepting members.',
        `A Round takes members while it is ${ACCEPTING_STATES.join(' or ')}. Wait for it to open, or join another Round.`,
        context.roundState,
      ),
    );
  }

  if (context.joinCutoffPassed) {
    findings.push(
      refuse(
        'RMB-002',
        'The join cut-off for this Round has passed.',
        'Join a Round that is still open. The cut-off exists so entitlement is unambiguous — a member joining late has contributed to fewer instalments than everyone else, and §5.4 closes that question rather than answering it per member.',
      ),
    );
  }

  if (context.currentMemberCount >= context.maxMembers) {
    findings.push(
      refuse(
        'RMB-003',
        'This Round is full.',
        'Join another Round. The maximum is a fulfilment and economics constraint from §5.4, not a soft target.',
        `${context.currentMemberCount} of ${context.maxMembers}`,
      ),
    );
  }

  if (existing.some((m) => m.customerId === applicant.customerId && m.status === 'ACTIVE')) {
    findings.push(
      refuse(
        'RMB-004',
        'This member is already in this Round.',
        'No action needed. A second membership would give one person two entitlements against one set of contributions.',
        applicant.customerId,
      ),
    );
  }

  if (!applicant.hasAcceptedAgreement) {
    findings.push(
      refuse(
        'RMB-005',
        'Joining requires a recorded acceptance of the agreement in force.',
        'Present the consent gateway and record acceptance through GROC-F021 first. Master plan §6 blocks progression until affirmative acceptance, and joining is one of the three actions it names.',
      ),
    );
  }

  if (!applicant.eligible) {
    findings.push(
      refuse(
        'RMB-006',
        'This applicant does not satisfy the Round’s eligibility requirements.',
        'Check §5.2 eligibility. This module takes eligibility as an input and does not assess it.',
      ),
    );
  }

  if (applicant.deliveryZoneId !== context.deliveryZoneId) {
    findings.push(
      refuse(
        'RMB-007',
        'A member joins a Round that delivers to their zone.',
        'Join a Round serving this zone. Free delivery is a locked §2 promise and its economics are per-zone, so a member outside the zone is an unpriced obligation.',
        `applicant ${applicant.deliveryZoneId}, round ${context.deliveryZoneId}`,
      ),
    );
  }

  if (context.membershipMode === 'REQUEST_TO_JOIN' && applicant.approvalRecorded !== true) {
    findings.push(
      refuse(
        'RMB-008',
        'This Round admits members by approved request, and no approval is recorded.',
        'Record the approval before joining.',
      ),
    );
  }

  if (context.membershipMode === 'INVITATION' && applicant.validInvitation !== true) {
    findings.push(
      refuse(
        'RMB-008',
        'This Round admits members by invitation, and no valid invitation was presented.',
        'Present a valid invitation. §5.3 private Rounds exist for families, workplaces and existing groups, and the invitation is what makes them private.',
      ),
    );
  }

  return { admitted: findings.length === 0, findings };
}

export interface MembershipChange {
  ok: boolean;
  findings: MembershipFinding[];
  next?: Membership;
}

/**
 * R3/R4 — a creator moderates; a creator does not remove.
 */
export function removeMember(
  membership: Membership,
  actor: Actor,
  reason: string,
): MembershipChange {
  if (actor.kind === 'ROUND_CREATOR') {
    return {
      ok: false,
      findings: [
        refuse(
          'RMB-009',
          'A Round creator may not end another member’s membership.',
          'Escalate to platform governance. §4 lets an initiator organise and moderate and forbids them to withdraw, redirect, alter or privately control pooled contributions — and removing a member holding credits redirects pooled value by another route.',
          `${actor.kind}:${actor.id}`,
        ),
      ],
    };
  }

  if (actor.kind !== 'PLATFORM_GOVERNANCE') {
    return {
      ok: false,
      findings: [
        refuse(
          'RMB-009',
          'Only platform governance removes a member.',
          'Escalate. Self-removal is an exit, not a removal — use exitMember so the settlement rules apply.',
          actor.kind,
        ),
      ],
    };
  }

  // §10: valid purchases survive a status change. Nothing here touches them.
  return {
    ok: true,
    findings: [],
    next: { ...membership, status: 'REMOVED' },
  };
}

/**
 * R5 — stopping preserves what was paid.
 *
 * §10's first sentence, made structural: the function that records a lapse cannot
 * reach validPurchasesMinor, so no future edit can quietly make it reduce them.
 */
export function recordLapse(membership: Membership): MembershipChange {
  if (membership.status !== 'ACTIVE') {
    return {
      ok: false,
      findings: [
        refuse(
          'RMB-010',
          'Only an active membership lapses.',
          'Check the membership status first.',
          membership.status,
        ),
      ],
    };
  }
  return { ok: true, findings: [], next: { ...membership, status: 'LAPSED' } };
}

/** R7 — an exit settles in groceries. DEC-005. */
export function exitMember(
  membership: Membership,
  outcome: 'IN_KIND' | 'CASH',
): MembershipChange {
  if (outcome === 'CASH') {
    return {
      ok: false,
      findings: [
        refuse(
          'RMB-011',
          'A member leaving takes groceries, not cash.',
          'Settle in kind: groceries to the value of their credits at standard retail without Round benefits, or carry-forward to the next Round. DEC-005 and RCM-002 — credits are not redeemable in money in any circumstance, and a single exception is evidence that they are.',
          outcome,
        ),
      ],
    };
  }
  if (membership.status === 'EXITED') {
    return { ok: true, findings: [], next: { ...membership } };
  }
  return { ok: true, findings: [], next: { ...membership, status: 'EXITED' } };
}

/**
 * R6 — one member's default changes exactly one membership.
 *
 * Returns the whole roster so the property is checkable rather than asserted: the
 * caller can compare every other row and find them identical.
 */
export function applyDefault(
  roster: readonly Membership[],
  customerId: string,
): { roster: Membership[]; findings: MembershipFinding[] } {
  const target = roster.find((m) => m.customerId === customerId);
  if (!target) {
    return {
      roster: [...roster],
      findings: [
        refuse(
          'RMB-012',
          'No membership for that member in this Round.',
          'Check the customer id.',
          customerId,
        ),
      ],
    };
  }
  const change = recordLapse(target);
  if (!change.ok) return { roster: [...roster], findings: change.findings };

  return {
    roster: roster.map((m) => (m.customerId === customerId ? change.next! : m)),
    findings: [],
  };
}

/**
 * R4 — the Round survives its creator.
 *
 * Returns the roster with the creator gone and every other membership byte-identical,
 * because §23's answer to creator misconduct is to remove their privileges and leave
 * the Round standing.
 */
export function removeCreator(
  roster: readonly Membership[],
  actor: Actor,
  reason: string,
): { roster: Membership[]; findings: MembershipFinding[] } {
  const creator = roster.find((m) => m.isCreator);
  if (!creator) {
    return {
      roster: [...roster],
      findings: [refuse('RMB-013', 'This Round has no creator membership.', 'Check the roster.')],
    };
  }
  const change = removeMember(creator, actor, reason);
  if (!change.ok) return { roster: [...roster], findings: change.findings };

  return {
    roster: roster.map((m) => (m.isCreator ? { ...change.next!, isCreator: false } : m)),
    findings: [],
  };
}
