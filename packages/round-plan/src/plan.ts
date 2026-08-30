/**
 * GROC-F019 — Round plans and configuration.
 *
 * Contract: `20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/GROC-F019_ACCEPTANCE_CONTRACT.md`
 *
 * Master plan §5 publishes ready-made plan families and lets a customer configure
 * a custom Round. The phrase that matters appears four times in §5.4 and is
 * enforced nowhere: *within Dial-approved min/max*, *within allowed product
 * range*, *within governance bounds*.
 *
 * So the model here is one sentence: **a Round configuration is a choice inside a
 * plan's bounds, never a free-form document.** The plan is the authority and the
 * creator picks within it. That makes three separate governance problems into one
 * — RCM-026's rule that creators do not author tax, review finding M4's rule that
 * voting thresholds need central bounds, and §5.4's own repeated bounding.
 *
 * It is also where a Round product becomes a credit product: a configuration is
 * not valid unless what it composes to is conformant under
 * `validateRoundCreditModel`. That is how DEC-001..007 reach a real Round instead
 * of remaining a document somebody read once.
 */

import {
  validateRoundCreditModel,
  type CreditPool,
  type RoundCreditConfiguration,
} from '@dial/round-credit/src/credit-model.js';

export type ContributionFrequency = 'MONTHLY';
export type Visibility = 'PUBLIC' | 'PRIVATE';
export type MembershipMode = 'OPEN' | 'REQUEST_TO_JOIN' | 'INVITATION';
export type BasketMode = 'GROUP_VOTE' | 'GUIDED_STAPLES' | 'CURATED_TEMPLATE' | 'MIXED';

export interface PlanFinding {
  rule: string;
  severity: 'REFUSE';
  statement: string;
  observed?: string;
  remedy: string;
}

/**
 * A Dial-published plan family — §5.1.
 *
 * Everything a creator may choose is a band here. The plan also carries the
 * credit posture, because that is the part a creator may not touch.
 */
export interface RoundPlan {
  planId: string;
  family: 'STARTER' | 'HOUSEHOLD' | 'EXTENDED' | 'ANNUAL_FESTIVE' | 'CAMPAIGN';
  contributionFrequency: ContributionFrequency;
  contributionMinorMin: number;
  contributionMinorMax: number;
  durationMonthsMin: number;
  durationMonthsMax: number;
  memberFloor: number;
  memberCeiling: number;
  /** The band a creator's voting threshold must sit inside — review finding M4. */
  votingThresholdBasisPointsMin: number;
  votingThresholdBasisPointsMax: number;
  allowedBasketModes: BasketMode[];
  /**
   * The credit posture, authored by Dial. RCM-026: a creator configures money,
   * duration, membership and city — never tax.
   */
  creditPosture: Omit<RoundCreditConfiguration, 'roundProductId' | 'instalmentCount'>;
}

/** What a creator sets — §5.4. Deliberately carries no tax field at all. */
export interface RoundConfiguration {
  roundId: string;
  planId: string;
  name: string;
  contributionMinor: number;
  durationMonths: number;
  /** ISO date, the first contribution. */
  startDate: string;
  /** ISO date, when the Round procures. */
  maturityDate: string;
  /** ISO date, after which nobody may join. */
  joinCutoffDate: string;
  minMembers: number;
  maxMembers: number;
  visibility: Visibility;
  membershipMode: MembershipMode;
  deliveryZoneId: string;
  basketMode: BasketMode;
  votingThresholdBasisPoints: number;
  /**
   * Present only so a creator attempting to set tax is refused rather than
   * silently ignored. Silently ignoring it is how someone believes they
   * configured something they did not.
   */
  pools?: CreditPool[];
  basketTaxClass?: string;
  catalogue?: unknown[];
}

const refuse = (
  rule: string,
  statement: string,
  remedy: string,
  observed?: string,
): PlanFinding => ({ rule, severity: 'REFUSE', statement, remedy, ...(observed ? { observed } : {}) });

/** Whole months between two ISO dates, or null when either is unparseable. */
export function monthsBetween(from: string, to: string): number | null {
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  // A partial month does not count: a Round maturing on the 14th when it started
  // on the 20th has not run its last cycle.
  return b.getUTCDate() >= a.getUTCDate() ? months : months - 1;
}

/**
 * RPL-001..014 — the bounds.
 *
 * Returns every finding rather than the first, so a creator fixes one form once
 * instead of discovering their configuration is wrong four times.
 */
export function validateRoundConfiguration(
  config: RoundConfiguration,
  plan: RoundPlan,
): { conformant: boolean; findings: PlanFinding[] } {
  const findings: PlanFinding[] = [];

  if (config.planId !== plan.planId) {
    findings.push(
      refuse(
        'RPL-001',
        'A configuration is validated against the plan it names.',
        'Validate against the named plan, or correct planId.',
        `config ${config.planId}, plan ${plan.planId}`,
      ),
    );
    return { conformant: false, findings };
  }

  if (!config.name?.trim() || config.name.trim().length > 80) {
    findings.push(
      refuse(
        'RPL-002',
        'A Round has a name between 1 and 80 characters.',
        'Set a name. Moderation and profanity checks are §5.4’s and are not performed here — this refuses an absent or oversized name and claims nothing more.',
        `${config.name?.trim().length ?? 0} characters`,
      ),
    );
  }

  // --- contribution and duration ---------------------------------------------

  if (
    !Number.isInteger(config.contributionMinor) ||
    config.contributionMinor < plan.contributionMinorMin ||
    config.contributionMinor > plan.contributionMinorMax
  ) {
    findings.push(
      refuse(
        'RPL-003',
        'The contribution sits inside the plan’s approved band.',
        `Choose a whole-minor-unit contribution between ${plan.contributionMinorMin} and ${plan.contributionMinorMax}, or configure against a plan whose band contains it.`,
        String(config.contributionMinor),
      ),
    );
  }

  if (
    !Number.isInteger(config.durationMonths) ||
    config.durationMonths < plan.durationMonthsMin ||
    config.durationMonths > plan.durationMonthsMax
  ) {
    findings.push(
      refuse(
        'RPL-004',
        'The duration sits inside the plan’s allowed product range.',
        `Choose a whole number of months between ${plan.durationMonthsMin} and ${plan.durationMonthsMax}.`,
        String(config.durationMonths),
      ),
    );
  }

  // --- dates ------------------------------------------------------------------

  const span = monthsBetween(config.startDate, config.maturityDate);
  if (span === null) {
    findings.push(
      refuse(
        'RPL-005',
        'Start and maturity are valid dates.',
        'Provide ISO-8601 dates for startDate and maturityDate.',
        `${config.startDate} → ${config.maturityDate}`,
      ),
    );
  } else if (span !== config.durationMonths) {
    findings.push(
      refuse(
        'RPL-005',
        'Maturity is the start date advanced by the duration at the contribution cadence.',
        'Move maturityDate so the Round has room for every instalment. A six-month monthly Round maturing in five cannot collect its sixth, and month five is far too late to find that out.',
        `${config.durationMonths} months configured, ${span} between the dates`,
      ),
    );
  }

  const cutoff = new Date(config.joinCutoffDate).getTime();
  const start = new Date(config.startDate).getTime();
  const maturity = new Date(config.maturityDate).getTime();
  if (Number.isNaN(cutoff)) {
    findings.push(
      refuse('RPL-006', 'The join cut-off is a valid date.', 'Provide an ISO-8601 joinCutoffDate.', config.joinCutoffDate),
    );
  } else {
    if (!Number.isNaN(maturity) && cutoff >= maturity) {
      findings.push(
        refuse(
          'RPL-006',
          'The join cut-off falls before maturity.',
          'Move joinCutoffDate earlier. §5.4’s cut-off exists to prevent late-join entitlement ambiguity, and a cut-off at or after maturity prevents nothing.',
          `${config.joinCutoffDate} against maturity ${config.maturityDate}`,
        ),
      );
    }
    if (!Number.isNaN(start) && cutoff < start) {
      findings.push(
        refuse(
          'RPL-006',
          'The join cut-off falls on or after the start date, so at least one instalment is possible.',
          'Move joinCutoffDate to the start date or later. A cut-off before the Round opens admits nobody.',
          `${config.joinCutoffDate} against start ${config.startDate}`,
        ),
      );
    }
  }

  // --- membership -------------------------------------------------------------

  if (!Number.isInteger(config.minMembers) || !Number.isInteger(config.maxMembers)) {
    findings.push(
      refuse('RPL-007', 'Member bounds are whole numbers.', 'Correct minMembers and maxMembers.', `${config.minMembers}..${config.maxMembers}`),
    );
  } else {
    if (config.minMembers > config.maxMembers) {
      findings.push(
        refuse(
          'RPL-007',
          'The member minimum is no greater than the maximum.',
          'Correct the bounds so the Round can reach its minimum without exceeding its maximum.',
          `${config.minMembers}..${config.maxMembers}`,
        ),
      );
    }
    if (config.minMembers < plan.memberFloor || config.maxMembers > plan.memberCeiling) {
      findings.push(
        refuse(
          'RPL-008',
          'Member bounds sit inside the plan’s, because economics and fulfilment depend on them.',
          `Choose bounds inside ${plan.memberFloor}..${plan.memberCeiling}.`,
          `${config.minMembers}..${config.maxMembers}`,
        ),
      );
    }
  }

  // --- what a creator may not set ---------------------------------------------

  const taxAttempts: string[] = [];
  if (config.pools !== undefined) taxAttempts.push('pools');
  if (config.basketTaxClass !== undefined) taxAttempts.push('basketTaxClass');
  if (config.catalogue !== undefined) taxAttempts.push('catalogue');
  if (taxAttempts.length > 0) {
    findings.push(
      refuse(
        'RPL-009',
        'A Round configuration does not carry credit pools, tax classes or catalogues. Those are the plan’s.',
        'Remove them from the configuration and choose a plan whose posture is right. RCM-026: a creator who puts a standard-rated item on a menu labelled staples has mis-stated a VAT return and would never find out.',
        taxAttempts.join(', '),
      ),
    );
  }

  if (
    !Number.isInteger(config.votingThresholdBasisPoints) ||
    config.votingThresholdBasisPoints < plan.votingThresholdBasisPointsMin ||
    config.votingThresholdBasisPoints > plan.votingThresholdBasisPointsMax
  ) {
    findings.push(
      refuse(
        'RPL-010',
        'The voting threshold sits inside central governance bounds.',
        `Choose a threshold between ${plan.votingThresholdBasisPointsMin} and ${plan.votingThresholdBasisPointsMax} basis points. Review finding M4: an unbounded threshold lets a minority be configured into binding the majority.`,
        String(config.votingThresholdBasisPoints),
      ),
    );
  }

  // --- coherence --------------------------------------------------------------

  if (config.visibility === 'PRIVATE' && config.membershipMode === 'OPEN') {
    findings.push(
      refuse(
        'RPL-011',
        'A private Round is not openly joinable.',
        'Choose REQUEST_TO_JOIN or INVITATION for a private Round, or make it public. §5.3’s private Rounds exist for families, workplaces and existing mukandos — an open join mode contradicts the reason they are private.',
        `${config.visibility}/${config.membershipMode}`,
      ),
    );
  }

  if (!config.deliveryZoneId?.trim()) {
    findings.push(
      refuse(
        'RPL-012',
        'A Round names its delivery zone.',
        'Set deliveryZoneId. Free delivery inside supported zones is a locked §2 decision, and its economics are per-zone, so a Round without one has an unpriced promise in it.',
      ),
    );
  }

  if (!plan.allowedBasketModes.includes(config.basketMode)) {
    findings.push(
      refuse(
        'RPL-013',
        'The basket mode is one the plan allows.',
        `Choose one of: ${plan.allowedBasketModes.join(', ')}.`,
        config.basketMode,
      ),
    );
  }

  return { conformant: findings.length === 0, findings };
}

/**
 * Compose a configuration with its plan into the credit product it becomes.
 *
 * The instalment count comes from the duration rather than being set separately:
 * two fields that must agree are one field with extra steps, and RCM-022 needs it
 * to price transfer tax.
 */
export function composeCreditProduct(
  config: RoundConfiguration,
  plan: RoundPlan,
): RoundCreditConfiguration {
  return {
    ...plan.creditPosture,
    roundProductId: `${plan.planId}:${config.roundId}`,
    instalmentCount: config.durationMonths,
  };
}

/**
 * RPL-014 — a configuration is only valid if the Round it produces is.
 *
 * The credit model's own findings are surfaced rather than summarised, because a
 * creator told "your Round is invalid" cannot act, and one told which rule and
 * what to do can.
 */
export function validateRoundProduct(
  config: RoundConfiguration,
  plan: RoundPlan,
): { conformant: boolean; findings: PlanFinding[] } {
  const own = validateRoundConfiguration(config, plan);
  const credit = validateRoundCreditModel(composeCreditProduct(config, plan));

  const carried: PlanFinding[] = credit.findings.map((f) => ({
    rule: f.rule,
    severity: 'REFUSE',
    statement: f.statement,
    remedy: f.remedy,
    ...(f.observed ? { observed: f.observed } : {}),
  }));

  const findings = [...own.findings, ...carried];
  return { conformant: findings.length === 0, findings };
}
