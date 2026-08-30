/**
 * Grocery Round credits — the decision of `25_GROCERY_ROUNDS/ROUND_CREDIT_MODEL_v1.md`
 * in executable form.
 *
 * A subscription payment buys credits. Credits are not money: not redeemable in
 * money, not a means of paying anyone, not transferable. The payment is therefore
 * consideration for a supply of goods rather than the taking of a repayable sum,
 * which is what keeps Grocery Rounds out of `ACT-REG-001`'s money-holding
 * apparatus altogether rather than adding a second way of holding money to it.
 *
 * Rev 3 settles the tax point at payment, per section 8 of the VAT Act, unless a
 * written ZIMRA ruling says otherwise. The rules that follow are shaped by that.
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
 * The vote chooses within a class and never across it. Section 8 of the VAT Act
 * puts the time of supply at the earlier of invoice or payment, so a Round whose
 * rate is settled by a later vote is taxed before anyone knows the rate — see
 * ROUND_CREDIT_MODEL_v1 condition C3.
 */
export type BasketTaxClass =
  /**
   * Maize meal, bread, milk, sugar, cooking oil and salt are **exempt**, not
   * zero-rated — SI 248 of 2023, effective 1 January 2024. No output VAT arises
   * on either side of the tax point, and input VAT attributable to these supplies
   * is irrecoverable, which is a permanent margin cost rather than a timing one.
   */
  | 'EXEMPT_BASIC_FOODSTUFFS'
  | 'ZERO_RATED_STAPLES'
  | 'STANDARD_RATED_MIXED';

/** Goods-denominated credits fix quantity at purchase; currency-denominated do not. */
export type CreditDenomination = 'GOODS' | 'CURRENCY';

/**
 * How the supply is fiscalised, which follows from where the tax point is.
 *
 * Taxing at payment is one receipt per instalment. Taxing at collection makes
 * every delivery a fiscalised, itemised sale per member — fewer documents per
 * Round, but all of them landing in the settlement window.
 */
export type FiscalisationModel = 'SINGLE_RECEIPT_AT_ISSUE' | 'PER_LINE_AT_COLLECTION';

/**
 * A credit pool — one tax character, one catalogue, one share of every payment.
 *
 * This exists because of a real objection: at the moment a member pays, nobody
 * knows which items will settle the credit. The basket is chosen by vote months
 * later, and the member picks brands and quantities after that.
 *
 * The answer is that we do not need to know the items. We need to know the
 * **class**. A pool fixes the menu the vote may choose from, and every item on
 * that menu carries the same VAT treatment, so the rate is determined at payment
 * even though the shopping list is not. The vote stays entirely real — 10kg or
 * 20kg, this brand or that — it simply cannot cross a tax boundary.
 *
 * A member wanting both staples and household goods subscribes once and the
 * payment splits across two pools at a ratio they choose. One subscription, one
 * debit order, one Round Room, two tax characters.
 */
export interface CreditPool {
  poolId: string;
  taxClass: BasketTaxClass;
  /** The Round's default share of every payment, in basis points. Defaults must sum to 10,000. */
  allocationBasisPoints: number;
  /** The band a member may move within, when the Round allows it. */
  minAllocationBasisPoints: number;
  maxAllocationBasisPoints: number;
  /** Everything the vote may choose from. Every item shares the pool's tax class. */
  catalogue: Array<{ itemId: string; taxClass: BasketTaxClass }>;
}

/** One member's chosen split, in basis points per pool. */
export type MemberSplit = Record<string, number>;

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
  /**
   * The policy actually bound, naming insurer and period.
   *
   * Required once the member is told any part of the price funds protection.
   * Saying so while nothing is bound is a misrepresentation regardless of intent,
   * and it is the kind that surfaces at the moment of a claim.
   */
  coverBoundRef: string | null;
  /**
   * The published statement of what the cover does and does not reach.
   *
   * §16.5 already requires accurate disclosure of insurer, scope, limits,
   * exclusions and eligibility. Telling a member that part of their money buys
   * protection, without telling them protection does not reach ordinary
   * commercial shortfall (review finding B2), is true and misleading at once.
   */
  scopeDisclosureVersion: string | null;
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
   * One pool per tax character. Empty is the refusal: without a pool there is no
   * menu, and without a menu the rate is unknown when the money arrives.
   */
  pools: CreditPool[];
  /**
   * Must be true. A member may change the split for future payments, never for
   * money already taken — moving value between pools after the fact would
   * restate the VAT on a return already filed.
   */
  allocationFixedAtPayment: boolean;
  /**
   * Who authored the pools and their catalogues. Must be DIAL.
   *
   * A Round creator configuring their own tax classes is the failure RCM-006
   * exists to refuse, arriving through the product rather than the data — a
   * creator who puts a crate of soft drinks on a "staples" menu has mis-stated a
   * VAT return, and they will never know they did it. Creators configure money,
   * duration, membership and city. They do not configure tax.
   */
  poolsAuthoredBy: 'DIAL' | 'ROUND_CREATOR';
  /** Whether members may vary their own split, or all take the Round's default. */
  memberSplitPolicy: 'ROUND_FIXED' | 'MEMBER_CHOSEN';
  /**
   * Must be POOL_CREDITS. A member votes on a pool's basket in proportion to what
   * they hold in that pool — someone with nothing in the household pool has no
   * say in what it buys. Weighting by total Round credits would let members who
   * bear none of a pool's cost decide how it is spent.
   */
  votingWeightBasis: 'POOL_CREDITS' | 'ROUND_CREDITS';
  /** The standard rate in basis points, from the dated schedule. 1550 = 15.5%. */
  standardRateBasisPoints: number;
  taxPoint: 'CREDIT_ISSUE' | 'SETTLEMENT';
  /**
   * A written ZIMRA ruling permitting the tax point to fall at collection.
   * Section 8 of the VAT Act fixes time of supply at the earlier of invoice or
   * payment, and no monetary-voucher exception has been confirmed, so deferral is
   * available only on a ruling — never on an assumption.
   */
  deferralRulingRef: string | null;
  fiscalisationModel: FiscalisationModel;
  /** Required where the Round supplies exempt goods: input VAT is then irrecoverable and must be apportioned. */
  inputTaxApportionmentMethod: 'DIRECT_ATTRIBUTION' | 'TURNOVER' | 'NOT_APPLICABLE';
  /** How many times the member pays. Every collection is a separate transfer-tax event. */
  instalmentCount: number;
  /** IMTT on each collection, in basis points. 200 = 2% (USD); 150 = 1.5% (ZiG, from 2026). */
  transferTaxBasisPoints: number | null;
  /** The dated rate schedule rates resolve against. VAT moved 15% → 15.5% on 1 Jan 2026. */
  taxScheduleRef: string | null;
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

  // Rev 3. Section 8 of the VAT Act fixes the time of supply at the earlier of
  // invoice or payment, so a rate has to be applied on the day the money arrives.
  // Nobody knows the items then — the vote is months away — so the Round fixes
  // the menu instead. Each pool is one tax character, and a payment splits across
  // pools at a ratio fixed when it is taken.
  if (config.pools.length === 0) {
    findings.push(
      refuse(
        'RCM-005',
        'A Round declares at least one credit pool, each with a single tax class.',
        'Declare pools. Without a menu there is no way to know the rate when the money arrives, and the vote would be setting the rate of a supply already taxed.',
      ),
    );
  }

  const seenPools = new Set<string>();
  for (const pool of config.pools) {
    if (seenPools.has(pool.poolId)) {
      findings.push(
        refuse(
          'RCM-005',
          'Each credit pool has a distinct id.',
          'Rename the duplicate pool.',
          pool.poolId,
        ),
      );
    }
    seenPools.add(pool.poolId);

    const offClass = pool.catalogue.filter((item) => item.taxClass !== pool.taxClass);
    if (offClass.length > 0) {
      findings.push(
        refuse(
          'RCM-006',
          `Every item the vote may choose in pool ${pool.poolId} carries that pool\u2019s tax class.`,
          'Move the offending items to a pool of their own class. The vote may choose quantity, brand and mix freely; what it may not do is cross a tax boundary, because that would change the rate of a supply already taxed.',
          offClass.map((i) => `${i.itemId}:${i.taxClass}`).join(', '),
        ),
      );
    }
    if (pool.catalogue.length === 0) {
      findings.push(
        refuse(
          'RCM-006',
          `Pool ${pool.poolId} has an empty catalogue, so there is nothing its credits can settle.`,
          'Populate the pool catalogue, or remove the pool.',
        ),
      );
    }
  }

  const allocation = config.pools.reduce((sum, p) => sum + p.allocationBasisPoints, 0);
  if (config.pools.length > 0 && allocation !== 10_000) {
    findings.push(
      refuse(
        'RCM-024',
        'Pool allocations account for the whole payment, to the basis point.',
        'Adjust allocationBasisPoints so the pools sum to 10,000. An unallocated remainder is money taken with no tax character.',
        `${allocation} bp`,
      ),
    );
  }
  if (config.pools.some((p) => !Number.isInteger(p.allocationBasisPoints) || p.allocationBasisPoints < 1)) {
    findings.push(
      refuse(
        'RCM-024',
        'Each pool takes a positive whole-basis-point share of every payment.',
        'Give every pool at least 1 basis point, or remove it.',
      ),
    );
  }
  for (const pool of config.pools) {
    const { poolId, minAllocationBasisPoints: lo, maxAllocationBasisPoints: hi } = pool;
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi > 10_000 || lo > hi) {
      findings.push(
        refuse(
          'RCM-025',
          `Pool ${poolId} declares a coherent band a member may move within.`,
          'Set minAllocationBasisPoints and maxAllocationBasisPoints between 0 and 10,000, with the minimum no greater than the maximum.',
          `${lo}..${hi} bp`,
        ),
      );
    } else if (pool.allocationBasisPoints < lo || pool.allocationBasisPoints > hi) {
      findings.push(
        refuse(
          'RCM-025',
          `Pool ${poolId}\u2019s default share sits inside the band members may choose from.`,
          'Move the default inside the band, or widen the band. A default a member cannot themselves select is a rule nobody can satisfy.',
          `default ${pool.allocationBasisPoints} bp, band ${lo}..${hi}`,
        ),
      );
    }
  }

  if (config.pools.length > 0) {
    const minSum = config.pools.reduce((n, p) => n + p.minAllocationBasisPoints, 0);
    const maxSum = config.pools.reduce((n, p) => n + p.maxAllocationBasisPoints, 0);
    if (minSum > 10_000 || maxSum < 10_000) {
      findings.push(
        refuse(
          'RCM-025',
          'The pool bands admit at least one split that accounts for a whole payment.',
          'Widen the bands. As set, no combination a member may choose adds up to 100% of their payment.',
          `minima sum to ${minSum} bp, maxima to ${maxSum} bp`,
        ),
      );
    }
  }

  if (config.poolsAuthoredBy !== 'DIAL') {
    findings.push(
      refuse(
        'RCM-026',
        'Pools and their catalogues are authored by Dial. A Round creator configures money, duration, membership and city \u2014 never tax.',
        'Set poolsAuthoredBy to DIAL and remove tax configuration from the creator surface. A creator who puts a crate of soft drinks on a "staples" menu has mis-stated a VAT return and will never know they did it.',
        config.poolsAuthoredBy,
      ),
    );
  }

  if (config.votingWeightBasis !== 'POOL_CREDITS') {
    findings.push(
      refuse(
        'RCM-027',
        'A member votes on a pool\u2019s basket in proportion to what they hold in that pool.',
        'Set votingWeightBasis to POOL_CREDITS. Weighting by total Round credits lets members who bear none of a pool\u2019s cost decide how it is spent, which is review finding M4 in a new place.',
        config.votingWeightBasis,
      ),
    );
  }

  if (!config.allocationFixedAtPayment) {
    findings.push(
      refuse(
        'RCM-024',
        'The split between pools is fixed when a payment is taken. A member may change it for future payments, never for money already collected.',
        'Set allocationFixedAtPayment to true. Moving value between pools after the fact restates the VAT on a return already filed.',
      ),
    );
  }

  if (config.taxPoint === 'SETTLEMENT' && !config.deferralRulingRef) {
    findings.push(
      refuse(
        'RCM-007',
        'Deferring the tax point to collection requires a written ZIMRA ruling. It is not a treatment Dial may elect.',
        'Set taxPoint to CREDIT_ISSUE, or record deferralRulingRef once a ruling is held. Building the payment architecture on an unconfirmed deferral risks retrospective output VAT and penalties across the whole float \u2014 and on an exempt staples pool there is no output VAT to defer in the first place.',
      ),
    );
  }

  const expectedFiscalisation: FiscalisationModel =
    config.taxPoint === 'CREDIT_ISSUE' ? 'SINGLE_RECEIPT_AT_ISSUE' : 'PER_LINE_AT_COLLECTION';
  if (config.fiscalisationModel !== expectedFiscalisation) {
    findings.push(
      refuse(
        'RCM-020',
        'Fiscalisation follows the tax point: one receipt per payment when taxed at payment, an itemised sale per delivery when taxed at collection.',
        `Set fiscalisationModel to ${expectedFiscalisation}.`,
        config.fiscalisationModel,
      ),
    );
  }

  const suppliesExempt = config.pools.some((p) => p.taxClass === 'EXEMPT_BASIC_FOODSTUFFS');
  if (suppliesExempt && config.inputTaxApportionmentMethod === 'NOT_APPLICABLE') {
    findings.push(
      refuse(
        'RCM-021',
        'A Round with an exempt pool cannot recover the input VAT attributable to it, so it declares how input tax is apportioned.',
        'Set inputTaxApportionmentMethod to DIRECT_ATTRIBUTION or TURNOVER. Exempt is not zero-rated: SI 248 of 2023 moved maize meal, bread, milk, sugar, cooking oil and salt to exempt from 1 January 2024, and the VAT on logistics, packaging, warehousing and platform costs attributable to them becomes a permanent cost. This is larger than any tax-point choice and no tax-point choice touches it.',
      ),
    );
  }

  if (!Number.isInteger(config.instalmentCount) || config.instalmentCount < 1) {
    findings.push(
      refuse(
        'RCM-022',
        'A Round declares how many times the member pays.',
        'Set instalmentCount to a positive whole number.',
        String(config.instalmentCount),
      ),
    );
  } else if (config.transferTaxBasisPoints === null) {
    findings.push(
      refuse(
        'RCM-022',
        'Every collection is a separate transfer-tax event, so the charge is modelled rather than discovered.',
        'Declare transferTaxBasisPoints \u2014 200 for IMTT on USD, 150 for ZiG from 2026, or 0 where the rail does not attract it. Six instalments cost six times what one does, and \u00a713.2\u2019s unit economics do not mention it.',
      ),
    );
  } else if (
    !Number.isFinite(config.transferTaxBasisPoints) ||
    config.transferTaxBasisPoints < 0 ||
    config.transferTaxBasisPoints > 1_000
  ) {
    findings.push(
      refuse(
        'RCM-022',
        'The transfer-tax rate is between 0 and 1,000 basis points.',
        'Correct transferTaxBasisPoints.',
        String(config.transferTaxBasisPoints),
      ),
    );
  }

  const usesStandardRate = config.pools.some((p) => p.taxClass === 'STANDARD_RATED_MIXED');
  if (
    usesStandardRate &&
    (!Number.isInteger(config.standardRateBasisPoints) ||
      config.standardRateBasisPoints < 0 ||
      config.standardRateBasisPoints > 5_000)
  ) {
    findings.push(
      refuse(
        'RCM-023',
        'A Round with a standard-rated pool carries the rate it will charge, in basis points.',
        'Set standardRateBasisPoints from the dated schedule \u2014 1550 for 15.5% from 1 January 2026.',
        String(config.standardRateBasisPoints),
      ),
    );
  }

  if (!config.taxScheduleRef) {
    findings.push(
      refuse(
        'RCM-023',
        'Rates resolve against a dated schedule, never a constant in the code.',
        'Record taxScheduleRef. The standard rate moved from 15% to 15.5% on 1 January 2026 and the exempt schedule has been amended twice since 2023; a Round sold before a change and collected after it must resolve the rate in force on the day it applies.',
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
    if (levy.basisPoints > 0 && levy.separatelyDeclared) {
      if (!levy.coverBoundRef) {
        findings.push(
          refuse(
            'RCM-019',
            'A member may be told part of the price funds protection only once that protection is actually bound.',
            'Record coverBoundRef, or stop disclosing the protection element until cover is in force. Disclosure is lawful and generally encouraged; disclosure of cover that does not yet exist is a misrepresentation, and it surfaces at the moment of a claim.',
          ),
        );
      }
      if (!levy.scopeDisclosureVersion) {
        findings.push(
          refuse(
            'RCM-019',
            'Disclosing the protection element obliges Dial to state what it covers and what it does not.',
            'Record scopeDisclosureVersion, stating insurer, scope, limits, exclusions and eligibility per \u00a716.5 \u2014 including that cover does not reach ordinary commercial shortfall (review finding B2). "Part of this funds protection" without that is true and misleading at the same time.',
          ),
        );
      }
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

  // Twenty-five of the twenty-seven rules are decidable from configuration. RCM-009 and
  // RCM-010 are properties of a ledger in motion and are enforced by
  // projectCreditLedger and assertContractLiabilityInvariant below.
  return { conformant: findings.length === 0, findings, checked: 25 };
}

// ---------------------------------------------------------------------------
// Payment allocation
// ---------------------------------------------------------------------------

export interface PoolAllocation {
  poolId: string;
  taxClass: BasketTaxClass;
  /** What the member paid into this pool, VAT inclusive. */
  grossMinor: number;
  /** The part of it that belongs to ZIMRA. Zero for exempt and zero-rated pools. */
  vatMinor: number;
  /** What Dial keeps against its obligation to deliver. */
  netMinor: number;
}

export interface PaymentAllocation {
  grossMinor: number;
  totalVatMinor: number;
  pools: PoolAllocation[];
}

/**
 * Split one payment across a Round's pools and work out the VAT on it.
 *
 * Shop prices in Zimbabwe are VAT inclusive, so the tax is extracted from the
 * payment rather than added to it: on a standard-rated pool at 15.5%, the VAT in
 * a gross amount is `gross x 1550 / 11550`.
 *
 * Allocation uses largest-remainder so the pool amounts sum to the payment
 * exactly. Dropping a cent here would put the credit ledger and the bank a cent
 * apart every month, per member, which is how a reconciliation becomes a project.
 */
export function assertMemberSplit(config: RoundCreditConfiguration, split: MemberSplit): void {
  if (config.memberSplitPolicy === 'ROUND_FIXED') {
    throw new Error(
      `RCM-025: ${config.roundProductId} takes the Round default split; members may not set their own.`,
    );
  }
  const declared = new Set(config.pools.map((p) => p.poolId));
  for (const poolId of Object.keys(split)) {
    if (!declared.has(poolId)) {
      throw new Error(`RCM-025: split names pool ${poolId}, which this Round does not have.`);
    }
  }
  let total = 0;
  for (const pool of config.pools) {
    const share = split[pool.poolId] ?? 0;
    if (!Number.isInteger(share) || share < 0) {
      throw new Error(`RCM-025: share for ${pool.poolId} is ${share}; shares are whole basis points.`);
    }
    if (share < pool.minAllocationBasisPoints || share > pool.maxAllocationBasisPoints) {
      throw new Error(
        `RCM-025: ${share} bp for ${pool.poolId} is outside the band ${pool.minAllocationBasisPoints}..${pool.maxAllocationBasisPoints}.`,
      );
    }
    total += share;
  }
  if (total !== 10_000) {
    throw new Error(`RCM-024: member split sums to ${total} bp, not 10,000.`);
  }
}

export function allocatePayment(
  config: RoundCreditConfiguration,
  grossMinor: number,
  memberSplit?: MemberSplit,
): PaymentAllocation {
  if (!Number.isInteger(grossMinor) || grossMinor < 0) {
    throw new Error(`Payment allocation: ${grossMinor} is not a whole number of minor units.`);
  }
  if (config.pools.length === 0) {
    throw new Error('Payment allocation: the Round declares no pools, so the payment has no tax character.');
  }
  if (memberSplit) assertMemberSplit(config, memberSplit);
  const shareOf = (pool: CreditPool): number => memberSplit?.[pool.poolId] ?? pool.allocationBasisPoints;

  const totalBp = config.pools.reduce((sum, p) => sum + shareOf(p), 0);
  if (totalBp !== 10_000) {
    throw new Error(`Payment allocation: pool shares sum to ${totalBp} bp, not 10,000 (RCM-024).`);
  }

  const exact = config.pools.map((pool) => (grossMinor * shareOf(pool)) / 10_000);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = grossMinor - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - floors[index]! }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index] = floors[index]! + 1;
    remainder -= 1;
  }

  const pools: PoolAllocation[] = config.pools.map((pool, index) => {
    const gross = floors[index]!;
    const rate = pool.taxClass === 'STANDARD_RATED_MIXED' ? config.standardRateBasisPoints : 0;
    // Exempt and zero-rated both charge nothing. They differ in what Dial can
    // reclaim on its own costs, which is an input-tax question, not this one.
    const vat = rate === 0 ? 0 : Math.round((gross * rate) / (10_000 + rate));
    return { poolId: pool.poolId, taxClass: pool.taxClass, grossMinor: gross, vatMinor: vat, netMinor: gross - vat };
  });

  return {
    grossMinor,
    totalVatMinor: pools.reduce((sum, p) => sum + p.vatMinor, 0),
    pools,
  };
}

// ---------------------------------------------------------------------------
// Pool economics
// ---------------------------------------------------------------------------

export interface EconomicAssumptions {
  /** Cost of goods as a share of the pool's net revenue, in basis points. */
  cogsBasisPoints: number;
  /** Attributable overhead — fuel, packaging, warehousing, platform — as a share of net revenue, in basis points. */
  overheadBasisPoints: number;
}

export interface PoolEconomics {
  poolId: string;
  taxClass: BasketTaxClass;
  /** What the member paid into this pool. */
  grossMinor: number;
  /** Collected from the member and remitted. Never Dial's money, and never Dial's cost. */
  outputVatMinor: number;
  /** Gross less the tax that was only ever passing through. Margin is measured against this. */
  netRevenueMinor: number;
  cogsMinor: number;
  overheadMinor: number;
  /**
   * The VAT on this pool's overhead that Dial cannot reclaim.
   *
   * Zero on a standard-rated pool, where it is recoverable. On an exempt pool it
   * is a real, permanent cost — and it is the only part of the tax that Dial
   * actually bears.
   */
  irrecoverableInputVatMinor: number;
  contributionMinor: number;
  /** Contribution as a share of net revenue, in basis points. The comparable number. */
  contributionOnNetBasisPoints: number;
}

/**
 * What a payment is worth to Dial, pool by pool.
 *
 * This exists to settle an intuition that is natural and wrong: that a
 * household-heavy split costs Dial more because it "attracts more VAT".
 *
 * Output VAT is not a cost. It is collected from the member, who would pay the
 * same tax buying the same goods in any formal shop, and remitted; Dial reclaims
 * the input VAT on what it bought to fulfil it, and the margin is untouched. That
 * is why margin has to be measured on **net revenue**, not on the payment —
 * compare on gross and every standard-rated pool looks unprofitable for a reason
 * that is pure arithmetic illusion.
 *
 * The tax Dial does bear runs the other way. On an exempt pool the VAT on fuel,
 * packaging, warehousing and platform costs cannot be reclaimed at all, so the
 * **staples** pool is the one carrying an unrecoverable tax cost, not the
 * household pool.
 */
export function poolEconomics(
  config: RoundCreditConfiguration,
  grossMinor: number,
  assumptions: EconomicAssumptions,
  memberSplit?: MemberSplit,
): { pools: PoolEconomics[]; contributionMinor: number; irrecoverableInputVatMinor: number } {
  for (const [name, bp] of Object.entries(assumptions)) {
    if (!Number.isInteger(bp) || bp < 0 || bp > 10_000) {
      throw new Error(`Pool economics: ${name} is ${bp}; expected whole basis points between 0 and 10,000.`);
    }
  }
  const allocation = allocatePayment(config, grossMinor, memberSplit);
  const rate = config.standardRateBasisPoints;

  const pools = allocation.pools.map((share): PoolEconomics => {
    const netRevenueMinor = share.netMinor;
    const cogsMinor = Math.round((netRevenueMinor * assumptions.cogsBasisPoints) / 10_000);
    const overheadMinor = Math.round((netRevenueMinor * assumptions.overheadBasisPoints) / 10_000);
    // Recoverable on a taxable supply, lost on an exempt one. This is the whole
    // difference between "exempt" and "zero-rated", in one line.
    const irrecoverableInputVatMinor =
      share.taxClass === 'EXEMPT_BASIC_FOODSTUFFS' ? Math.round((overheadMinor * rate) / 10_000) : 0;
    const contributionMinor = netRevenueMinor - cogsMinor - overheadMinor - irrecoverableInputVatMinor;
    return {
      poolId: share.poolId,
      taxClass: share.taxClass,
      grossMinor: share.grossMinor,
      outputVatMinor: share.vatMinor,
      netRevenueMinor,
      cogsMinor,
      overheadMinor,
      irrecoverableInputVatMinor,
      contributionMinor,
      contributionOnNetBasisPoints:
        netRevenueMinor === 0 ? 0 : Math.round((contributionMinor * 10_000) / netRevenueMinor),
    };
  });

  return {
    pools,
    contributionMinor: pools.reduce((sum, p) => sum + p.contributionMinor, 0),
    irrecoverableInputVatMinor: pools.reduce((sum, p) => sum + p.irrecoverableInputVatMinor, 0),
  };
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
