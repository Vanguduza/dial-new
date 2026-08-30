/**
 * Grocery Round credits — the decision of `25_GROCERY_ROUNDS/ROUND_CREDIT_MODEL_v1.md`
 * in executable form.
 *
 * A subscription payment buys credits. Credits are not money: not redeemable in
 * money, not a means of paying anyone, not transferable. The issue of a credit is
 * therefore a supply of goods rather than the taking of a repayable sum, which is
 * what keeps Grocery Rounds out of `ACT-REG-001`'s money-holding apparatus
 * altogether rather than adding a second way of holding money to it.
 *
 * That position is only as true as the code makes it. A term in a contract that
 * the code does not enforce is a term the code will eventually contradict — one
 * cash refund made kindly by a support agent is evidence that credits are
 * repayable, and one credit spendable on a spare part turns a single-purpose
 * prepayment into a general means of payment. So every clause of the decision
 * that can be checked is checked here.
 *
 * Findings are refusals, following `catalog-coverage/src/injection.ts`: a
 * validator that returns warnings invites a judgement call at exactly the moment
 * nobody wants to make one.
 *
 * Money is in integer minor units throughout. Nothing about a contract liability
 * should ever be expressed as a float.
 */

/** The only scope a Round credit may carry. Deliberately a one-member union. */
export type CreditScope = 'GROCERY_FULFILMENT';

/**
 * The tax character of a Round's basket, fixed when the Round is created.
 *
 * The vote chooses within a class and never across it. If the class could still
 * change at the maturity vote, the tax rate of the supply would be decided after
 * its tax point — see ROUND_CREDIT_MODEL_v1 §C3, which is the condition the whole
 * taxable-supply answer rests on.
 */
export type BasketTaxClass = 'ZERO_RATED_STAPLES' | 'STANDARD_RATED_MIXED';

/** Goods-denominated credits fix quantity at purchase; currency-denominated do not. */
export type CreditDenomination = 'GOODS' | 'CURRENCY';

/**
 * How the supply is fiscalised, which follows from where the tax point is.
 *
 * Taxing at issue is one receipt per subscription payment. Taxing at collection
 * makes every delivery a fiscalised sale, itemised per line, per member — a
 * materially heavier obligation at 38,420 members, and the price of deferring
 * the VAT.
 */
export type FiscalisationModel = 'SINGLE_RECEIPT_AT_ISSUE' | 'PER_LINE_AT_COLLECTION';

/** What a leaving member's credits buy. Standard retail, without Round benefits. */
export type ExitPricing = 'STANDARD_RETAIL' | 'ROUND_PRICING';

/**
 * The protection charge collected alongside a credit purchase.
 *
 * Held apart from credit value deliberately: a member paying 5,200 for 5,000 of
 * credit has bought 5,000 of groceries and paid 200 towards the guarantee that
 * backs the promise. Netting the charge out of the credit would sell 5,200 of
 * groceries and deliver 5,000.
 */
export interface ProtectionLevy {
  /** Basis points on credit value. 400 bp = 4%: 200 on 5,000 of credit. */
  basisPoints: number;
  /** Shown to the member as part of the price rather than buried in it. */
  separatelyDeclared: boolean;
  /** Must be false. The levy rides on top of credit value; it never reduces it. */
  deductedFromCreditValue: boolean;
  /**
   * Must be false. Charging a member an identified premium and arranging cover in
   * which they are the beneficiary is insurance intermediation, and Dial is not
   * registered to do it — see ACT-REG-007 and §16.5's "never present itself as
   * the insurer". Disclosing that a share of the price funds protection is not
   * the same act as selling the member a policy.
   */
  presentedAsMemberPremium: boolean;
  /** Indicative broker pricing. Until this exists the rate is an assumption (review finding H2). */
  brokerQuoteRef: string | null;
}

/** Every exit a member may take. None of them is cash, by construction. */
export type ExitOutcome =
  | 'IMMEDIATE_GROCERY_ORDER'
  | 'CARRY_TO_NEXT_ROUND'
  | 'STEP_IN_FULFILMENT';

export interface CreditFinding {
  rule: string;
  severity: 'REFUSE';
  statement: string;
  observed?: string;
  remedy: string;
}

export interface CreditModelResult {
  conformant: boolean;
  findings: CreditFinding[];
  checked: number;
}

/**
 * A Round product's credit posture.
 *
 * Every field is something the decision record commits to. They are stated as
 * configuration rather than constants because Rounds are configurable by
 * §2 of the master plan — which is exactly why they need validating.
 */
export interface RoundCreditConfiguration {
  roundProductId: string;
  /** Must be GROCERY_FULFILMENT. Typed loosely so a bad value is refused, not un-compilable. */
  creditScope: string;
  /**
   * Null means undeclared. Required only when the tax point is at issue: a
   * single-purpose credit needs a knowable rate on the day it is sold, and a
   * multi-purpose one is rated when the goods are handed over.
   */
  basketTaxClass: BasketTaxClass | null;
  taxPoint: 'CREDIT_ISSUE' | 'SETTLEMENT';
  fiscalisationModel: FiscalisationModel;
  denomination: CreditDenomination;
  exitPricing: ExitPricing;
  exitIncludesRoundBenefits: boolean;
  protectionLevy: ProtectionLevy | null;
  /** Required when denomination is CURRENCY: the member carries the price risk and must be told. */
  priceRiskDisclosureVersion: string | null;
  consentGatewayVersion: string | null;
  consentCoversCreditConstruct: boolean;
  transferable: boolean;
  redeemableForMoney: boolean;
  /** Everything a credit may settle. Anything beyond grocery fulfilment reopens ACT-REG-001. */
  settlementTargets: string[];
  collectionModel: 'AUTHORISED_COLLECTION' | 'CREDIT_TRANSFER';
  exitOutcomes: ExitOutcome[];
  exitRequiresGroupVote: boolean;
  creditOwnership: 'MEMBER' | 'ROUND';
  revenueRecognisedAt: 'CREDIT_ISSUE' | 'SETTLEMENT';
  /** Percentage of unsettled credit value held in committed stock or forward contracts. May be 0; may not be undeclared. */
  procurementReservePercent: number | null;
  ballotOptions: Array<{ optionId: string; taxClass: BasketTaxClass }>;
}

const refuse = (
  rule: string,
  statement: string,
  remedy: string,
  observed?: string,
): CreditFinding => ({ rule, severity: 'REFUSE', statement, remedy, ...(observed ? { observed } : {}) });

/**
 * RCM-001..016. A Round product that produces any finding does not open.
 */
export function validateRoundCreditModel(config: RoundCreditConfiguration): CreditModelResult {
  const findings: CreditFinding[] = [];

  // --- C1: closed loop -------------------------------------------------------

  if (config.creditScope !== 'GROCERY_FULFILMENT') {
    findings.push(
      refuse(
        'RCM-001',
        'A Round credit carries scope GROCERY_FULFILMENT and no other.',
        'Set creditScope to GROCERY_FULFILMENT. A credit with a wider scope is a general means of payment, whatever the terms call it.',
        config.creditScope,
      ),
    );
  }

  if (config.redeemableForMoney) {
    findings.push(
      refuse(
        'RCM-002',
        'Credits are not redeemable in money, in any circumstance including goodwill and exception handling.',
        'Set redeemableForMoney to false and route every exception through an in-kind outcome (RCM-011). One cash refund is evidence that credits are repayable.',
      ),
    );
  }

  const strayTargets = config.settlementTargets.filter((t) => t !== 'GROCERY_FULFILMENT');
  if (config.settlementTargets.length === 0 || strayTargets.length > 0) {
    findings.push(
      refuse(
        'RCM-015',
        'Credits settle grocery fulfilment and nothing else — not spares, not provider jobs, not laundry, not another member.',
        'Reduce settlementTargets to exactly ["GROCERY_FULFILMENT"]. Dial is a multi-trade marketplace, and a credit spendable across trades is a payment instrument.',
        config.settlementTargets.length === 0 ? '(none declared)' : strayTargets.join(', '),
      ),
    );
  }

  // --- C2: non-transferability ----------------------------------------------

  if (config.transferable) {
    findings.push(
      refuse(
        'RCM-003',
        'Credits are not transferable between members or to third parties.',
        'Set transferable to false.',
      ),
    );
  }

  if (config.collectionModel !== 'AUTHORISED_COLLECTION') {
    findings.push(
      refuse(
        'RCM-004',
        'Household sharing is modelled as authorised collection on the delivery, never as a change of credit ownership.',
        'Set collectionModel to AUTHORISED_COLLECTION. Moving credits between accounts builds a transfer rail while the terms deny one.',
        config.collectionModel,
      ),
    );
  }

  // --- C3: the tax rate must be determinate at the tax point -----------------

  // A credit is single-purpose when its rate is knowable on the day it is sold,
  // and multi-purpose when it is not. That distinction, not the wording of the
  // terms, is what decides where the tax point falls — so the two must agree, and
  // RCM-005/006 are obligations only on the single-purpose route.
  if (config.taxPoint === 'CREDIT_ISSUE') {
    if (config.basketTaxClass === null) {
      findings.push(
        refuse(
          'RCM-005',
          'A Round taxed at issue declares its basket tax class when it is created.',
          'Declare basketTaxClass, or move the tax point to SETTLEMENT. Without one of the two, the rate of the supply is decided by a vote held after the supply was taxed.',
        ),
      );
    }

    const offClass = config.ballotOptions.filter((o) => o.taxClass !== config.basketTaxClass);
    if (offClass.length > 0) {
      findings.push(
        refuse(
          'RCM-006',
          'A Round taxed at issue confines its basket vote to the declared tax class.',
          'Remove the options outside the declared class from the ballot, or run them as a separate Round product.',
          offClass.map((o) => `${o.optionId}:${o.taxClass}`).join(', '),
        ),
      );
    }
  }

  const expectedFiscalisation: FiscalisationModel =
    config.taxPoint === 'CREDIT_ISSUE' ? 'SINGLE_RECEIPT_AT_ISSUE' : 'PER_LINE_AT_COLLECTION';
  if (config.fiscalisationModel !== expectedFiscalisation) {
    findings.push(
      refuse(
        'RCM-020',
        'Fiscalisation follows the tax point: one receipt per payment when taxed at issue, an itemised sale per delivery when taxed at collection.',
        `Set fiscalisationModel to ${expectedFiscalisation}. Deferring the VAT is not free — it moves fiscalisation to every delivery, per line, per member, and the payment still needs a non-VAT document at the time it is taken.`,
        config.fiscalisationModel,
      ),
    );
  }

  if (config.taxPoint === 'SETTLEMENT' && config.basketTaxClass !== null) {
    findings.push(
      refuse(
        'RCM-007',
        'A Round cannot be taxed at collection and also claim a rate fixed at issue. If the rate is knowable on day one the supply is taxable on day one.',
        'Either clear basketTaxClass and accept the credit is multi-purpose, or move taxPoint to CREDIT_ISSUE. Holding both positions gives the tax authority the choice of which one to apply, and it will not pick ours.',
        `taxPoint=${config.taxPoint}, basketTaxClass=${config.basketTaxClass}`,
      ),
    );
  }

  // --- C4: the tax point is not revenue recognition --------------------------

  if (config.revenueRecognisedAt !== 'SETTLEMENT') {
    findings.push(
      refuse(
        'RCM-008',
        'Consideration for an unsettled credit is a contract liability, not revenue. VAT arising at issue does not make the cash earned.',
        'Set revenueRecognisedAt to SETTLEMENT. Booking it at issue reports unearned profit, pays income tax on it, and tells management the float is spendable margin — which is review finding B2’s failure mode, arrived at through the ledger.',
        config.revenueRecognisedAt,
      ),
    );
  }

  // --- C5: an exit that is real, and is not cash -----------------------------

  if (config.exitOutcomes.length === 0) {
    findings.push(
      refuse(
        'RCM-011',
        'A member may leave, and the exit is in kind.',
        'Declare at least one of IMMEDIATE_GROCERY_ORDER, CARRY_TO_NEXT_ROUND, STEP_IN_FULFILMENT. Permanent forfeiture is the term most exposed to being read down as unfair — and an ordered cash refund is a repayable sum.',
      ),
    );
  }

  if (config.exitRequiresGroupVote || config.creditOwnership !== 'MEMBER') {
    findings.push(
      refuse(
        'RCM-012',
        'Credits are owned individually. The vote decides when the Round procures, not whether a member may leave.',
        'Set exitRequiresGroupVote to false and creditOwnership to MEMBER. Otherwise strangers in a public Round can strand one member’s value for twelve months.',
        `exitRequiresGroupVote=${String(config.exitRequiresGroupVote)}, ownership=${config.creditOwnership}`,
      ),
    );
  }

  if (config.exitPricing !== 'STANDARD_RETAIL' || config.exitIncludesRoundBenefits) {
    findings.push(
      refuse(
        'RCM-017',
        'A leaving member receives groceries to the value of their credits at standard retail prices, without Round pricing, free delivery or any other Round benefit.',
        'Set exitPricing to STANDARD_RETAIL and exitIncludesRoundBenefits to false. The member keeps their value; the benefits were earned by staying to procurement, and handing them to a leaver prices the Round for everyone who did stay.',
        `exitPricing=${config.exitPricing}, includesBenefits=${String(config.exitIncludesRoundBenefits)}`,
      ),
    );
  }

  // --- C6: denomination ------------------------------------------------------

  if (config.denomination === 'CURRENCY' && !config.priceRiskDisclosureVersion) {
    findings.push(
      refuse(
        'RCM-013',
        'Currency-denominated credits leave food inflation with the member, so the member is told so before buying.',
        'Record priceRiskDisclosureVersion, or denominate in GOODS and carry the price risk on forward supply agreements. What is not available is currency denomination with goods-denominated marketing.',
      ),
    );
  }

  // --- C7: consent and the reserve -------------------------------------------

  if (!config.consentGatewayVersion || !config.consentCoversCreditConstruct) {
    findings.push(
      refuse(
        'RCM-014',
        'The consent gateway states, in the member’s words, that payments buy credits, that credits cannot be exchanged for money, and that Dial is not holding their money.',
        'Publish a gateway version covering the credit construct and record it. The disclosure of the exposure is what makes the rest of the disclosure credible.',
        config.consentGatewayVersion ?? '(no version)',
      ),
    );
  }

  const levy = config.protectionLevy;
  if (levy === null) {
    findings.push(
      refuse(
        'RCM-018',
        'The protection charge carried in the price is declared, so it can be checked against what protection actually costs.',
        'Declare protectionLevy, including zero basis points if protection is funded from margin instead. §13.2 allocated 1.5% and review finding H2 put the real figure nearer 4–6%; an undeclared charge cannot be reconciled with either.',
      ),
    );
  } else {
    if (!Number.isInteger(levy.basisPoints) || levy.basisPoints < 0 || levy.basisPoints > 2_000) {
      findings.push(
        refuse(
          'RCM-018',
          'The protection charge is a whole number of basis points between 0 and 2,000.',
          'Express the charge in basis points on credit value — 400 bp is 4%, or 200 on 5,000 of credit.',
          String(levy.basisPoints),
        ),
      );
    }
    if (levy.deductedFromCreditValue || !levy.separatelyDeclared) {
      findings.push(
        refuse(
          'RCM-018',
          'The charge rides on top of credit value and is shown as part of the price. It never reduces the credits bought.',
          'Set deductedFromCreditValue false and separatelyDeclared true. Netting it out sells 5,200 of groceries and delivers 5,000.',
          `deducted=${String(levy.deductedFromCreditValue)}, declared=${String(levy.separatelyDeclared)}`,
        ),
      );
    }
    if (levy.presentedAsMemberPremium) {
      findings.push(
        refuse(
          'RCM-019',
          'The charge funds cover Dial holds. It is not a premium the member pays to an insurer, and must not be presented as one.',
          'Set presentedAsMemberPremium false and clear the wording with the ACT-REG-007 owner. Collecting an identified premium and arranging cover in which the member is the beneficiary is insurance intermediation, which Dial is not registered for — and §16.5 already forbids presenting as the insurer. Disclosing that part of the price funds protection is a different act and stays available.',
        ),
      );
    }
    if (levy.basisPoints > 0 && !levy.brokerQuoteRef) {
      findings.push(
        refuse(
          'RCM-019',
          'A non-zero protection charge is priced against an indicative broker quote before tiers are published.',
          'Record brokerQuoteRef. Advance-payment and performance guarantee cover for an unrated startup principal is where review finding H2 expects 4–6%; publishing a tier on an assumed rate anchors pricing that may not hold.',
        ),
      );
    }
  }

  const reserve = config.procurementReservePercent;
  if (reserve === null || !Number.isFinite(reserve) || reserve < 0 || reserve > 100) {
    findings.push(
      refuse(
        'RCM-016',
        'The procurement reserve is a declared number between 0 and 100, because a taxable supply leaves the member an unsecured creditor and someone must own that.',
        'Declare procurementReservePercent — zero is an allowed answer, an absent one is not. This is a Dial treasury policy, not a customer reserve account, and does not disturb the tax position.',
        reserve === null ? '(undeclared)' : String(reserve),
      ),
    );
  }

  // Eighteen of the twenty rules are decidable from configuration. RCM-009 and
  // RCM-010 are properties of a ledger in motion and are enforced by
  // projectCreditLedger and assertContractLiabilityInvariant below.
  return { conformant: findings.length === 0, findings, checked: 18 };
}

// ---------------------------------------------------------------------------
// Ledger
// ---------------------------------------------------------------------------

export type CreditLedgerEvent =
  | { kind: 'credit_issued'; creditId: string; memberId: string; valueMinor: number; vatOutputMinor: number }
  | { kind: 'credit_settled'; creditId: string; valueMinor: number }
  | { kind: 'credit_carried_out'; creditId: string; valueMinor: number }
  | { kind: 'credit_reversed'; creditId: string; valueMinor: number; vatOutputMinor: number };

export type CreditState = 'UNSETTLED' | 'SETTLED' | 'CARRIED_OUT' | 'REVERSED';

export interface CreditPosition {
  /** Derived from the money: issued less everything that has discharged it. */
  liabilityMinor: number;
  /** Only settlement earns revenue. RCM-008/009. */
  revenueMinor: number;
  vatOutputMinor: number;
  credits: Map<string, { state: CreditState; valueMinor: number }>;
}

/**
 * Fold a credit ledger. Append-only, per §9's kernel: corrections are reversals.
 *
 * `credit_issued` contributes nothing to revenue. That single line is the whole
 * of RCM-009, and it is the line most likely to be quietly wrong in an
 * implementation, because the cash is real and present on the day it arrives.
 */
export function projectCreditLedger(events: readonly CreditLedgerEvent[]): CreditPosition {
  const credits = new Map<string, { state: CreditState; valueMinor: number }>();
  let liabilityMinor = 0;
  let revenueMinor = 0;
  let vatOutputMinor = 0;

  for (const event of events) {
    if (!Number.isInteger(event.valueMinor) || event.valueMinor < 0) {
      throw new Error(
        `Credit ledger: ${event.kind} for ${event.creditId} carries a non-integer or negative value (${event.valueMinor}). Money is in minor units.`,
      );
    }

    if (event.kind === 'credit_issued') {
      if (credits.has(event.creditId)) {
        throw new Error(`Credit ledger: ${event.creditId} issued twice.`);
      }
      credits.set(event.creditId, { state: 'UNSETTLED', valueMinor: event.valueMinor });
      liabilityMinor += event.valueMinor;
      vatOutputMinor += event.vatOutputMinor;
      continue;
    }

    const held = credits.get(event.creditId);
    if (!held) {
      throw new Error(`Credit ledger: ${event.kind} for ${event.creditId}, which was never issued.`);
    }
    if (held.state !== 'UNSETTLED') {
      throw new Error(
        `Credit ledger: ${event.kind} for ${event.creditId}, already ${held.state}. Corrections are reversals, not repeats.`,
      );
    }
    if (event.valueMinor !== held.valueMinor) {
      throw new Error(
        `Credit ledger: ${event.kind} for ${event.creditId} at ${event.valueMinor}, issued at ${held.valueMinor}.`,
      );
    }

    liabilityMinor -= event.valueMinor;
    if (event.kind === 'credit_settled') {
      held.state = 'SETTLED';
      revenueMinor += event.valueMinor;
    } else if (event.kind === 'credit_carried_out') {
      held.state = 'CARRIED_OUT';
    } else {
      held.state = 'REVERSED';
      vatOutputMinor -= event.vatOutputMinor;
    }
  }

  return { liabilityMinor, revenueMinor, vatOutputMinor, credits };
}

/**
 * RCM-010 — the contract liability equals the value of unsettled credits.
 *
 * Deliberately two derivations of the same number: one folded from the money,
 * one summed from the credit register. Agreeing by construction would prove
 * nothing; the check exists so that a divergence surfaces at the close rather
 * than at the settlement nobody can fund.
 */
export function assertContractLiabilityInvariant(position: CreditPosition): void {
  let unsettled = 0;
  for (const credit of position.credits.values()) {
    if (credit.state === 'UNSETTLED') unsettled += credit.valueMinor;
  }
  if (unsettled !== position.liabilityMinor) {
    throw new Error(
      `RCM-010: contract liability ${position.liabilityMinor} does not equal unsettled credit value ${unsettled}. ` +
        'One of the two is wrong, and until it is known which, no settlement may be funded from this Round.',
    );
  }
}

/**
 * RCM-001/015 at the point of use. The scope check has to live where a credit is
 * spent, not only where a Round is configured, because the Round that opens
 * correctly is not the thing that later pays for a spare part.
 */
export function assertCreditSpend(target: { scope: string; division: string }): void {
  if (target.scope !== 'GROCERY_FULFILMENT' || target.division !== 'GROCERIES') {
    throw new Error(
      `RCM-015: a Round credit cannot settle ${target.division}/${target.scope}. ` +
        'Credits settle grocery fulfilment and nothing else; a credit spendable across trades is a payment instrument.',
    );
  }
}

/**
 * RCM-011/012 at the point of use — a member leaving.
 *
 * Returns the outcome rather than a boolean, so the caller cannot resolve an
 * exit without naming what the member actually receives.
 */
export function resolveExit(
  config: RoundCreditConfiguration,
  request: { preferred: ExitOutcome },
): ExitOutcome {
  if (config.exitRequiresGroupVote) {
    throw new Error(
      'RCM-012: a member exit cannot be conditioned on a group vote. The vote decides when the Round procures.',
    );
  }
  if (!config.exitOutcomes.includes(request.preferred)) {
    const available = config.exitOutcomes.join(', ') || '(none)';
    throw new Error(
      `RCM-011: ${request.preferred} is not offered by this Round product. Available: ${available}.`,
    );
  }
  return request.preferred;
}
