/**
 * GROC-F021 — Round agreement and consent gateway.
 *
 * Contract: `20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/GROC-F021_ACCEPTANCE_CONTRACT.md`
 *
 * The master plan's §6 is one sentence with teeth: no user may create a Round,
 * join a Round, or make a first purchase until the relevant agreement has been
 * explicitly accepted, and the application must block progression until
 * affirmative acceptance is recorded.
 *
 * So this is a gate, not a form. What it owns is an immutable, content-addressed
 * agreement version; an acceptance record bound to that exact version by hash; the
 * refusal of three protected actions without one; and fresh consent when a
 * material term changes.
 *
 * It is also where the locked decisions reach a customer. DEC-002 requires the
 * member to be told credits are a dollar amount and not a fixed shopping list.
 * DEC-005 requires the exit terms. DEC-006 requires the protection disclosure, and
 * DEC-011 makes that disclosure lawful only while it is accurate. An agreement
 * missing one of those is not a lesser agreement — it is a mis-selling exposure
 * with a signature attached, which is why publishing one is refused rather than
 * warned about.
 *
 * Findings are refusals, following `catalog-coverage/src/injection.ts` and
 * `round-credit/src/credit-model.ts`.
 */

import { createHash } from 'node:crypto';

/** The three actions §6 places behind the gate. */
export type GatedAction = 'CREATE_ROUND' | 'JOIN_ROUND' | 'FIRST_PURCHASE';

export interface AgreementFinding {
  rule: string;
  severity: 'REFUSE';
  statement: string;
  observed?: string;
  remedy: string;
}

/**
 * The disclosure versions an agreement must carry.
 *
 * Each is a locked decision made visible to the member. They are versions rather
 * than prose because this module can prove a disclosure is present and current;
 * it cannot prove the words are adequate, and pretending otherwise would be the
 * more dangerous claim.
 */
export interface AgreementDisclosures {
  /** §6.2 terms summary. */
  termsSummaryVersion: string;
  /** DEC-002 — credits are a dollar amount, not a fixed shopping list. */
  priceRiskVersion: string;
  /** DEC-005 — leaving gets groceries at standard retail, no Round benefits, never cash. */
  exitTermsVersion: string;
  /** DEC-006 and DEC-011 — what the protection charge funds, and what the cover does not reach. */
  protectionVersion: string;
  deliveryPolicyVersion: string;
  refundPolicyVersion: string;
}

export interface AgreementVersion {
  agreementId: string;
  agreementType: string;
  /** Monotonic within an agreementId. */
  version: number;
  /** The binding text. Hashed, never interpreted. */
  body: string;
  disclosures: AgreementDisclosures;
  /** Content address. Any drift between this and the content voids acceptances bound to it. */
  hash: string;
  publishedAt: string;
  /** Set when a later version supersedes this one. History is never rewritten. */
  supersededAt?: string;
}

export interface AcceptanceRecord {
  acceptanceId: string;
  customerId: string;
  roundId: string;
  agreementType: string;
  agreementVersion: number;
  /** Binds the acceptance to exact content, not to a row that may since have moved. */
  agreementHash: string;
  termsSummaryVersion: string;
  protectionDisclosureVersion: string;
  deliveryPolicyVersion: string;
  refundPolicyVersion: string;
  acceptedAt: string;
  sessionMetadata: { sessionId: string; deviceId: string; userAgent: string };
  locale: string;
  applicationVersion: string;
}

const refuse = (
  rule: string,
  statement: string,
  remedy: string,
  observed?: string,
): AgreementFinding => ({ rule, severity: 'REFUSE', statement, remedy, ...(observed ? { observed } : {}) });

/**
 * Length-prefixed canonical encoding, as `catalog-coverage`'s diagram identity does
 * it and for the same reason: a naive delimiter join lets two different agreements
 * collapse to one hash if a delimiter appears inside a field. Here that would mean
 * a member's acceptance verifying against terms they never saw.
 */
const canonicalAgreementKey = (
  input: Pick<AgreementVersion, 'agreementId' | 'agreementType' | 'version' | 'body' | 'disclosures'>,
): string => {
  const d = input.disclosures;
  const parts = [
    input.agreementId,
    input.agreementType,
    String(input.version),
    input.body,
    d.termsSummaryVersion,
    d.priceRiskVersion,
    d.exitTermsVersion,
    d.protectionVersion,
    d.deliveryPolicyVersion,
    d.refundPolicyVersion,
  ];
  return parts.map((c) => `${Buffer.byteLength(c, 'utf8')}:${c}`).join('|');
};

/** R2 — the hash is derived from content, so it moves whenever any of it moves. */
export function agreementHash(
  input: Pick<AgreementVersion, 'agreementId' | 'agreementType' | 'version' | 'body' | 'disclosures'>,
): string {
  return `AGR-${createHash('sha256').update(canonicalAgreementKey(input), 'utf8').digest('hex').slice(0, 32)}`;
}

const REQUIRED_DISCLOSURES: Array<{ key: keyof AgreementDisclosures; rule: string; why: string }> = [
  { key: 'termsSummaryVersion', rule: 'RAG-004', why: 'the §6.2 terms summary' },
  {
    key: 'priceRiskVersion',
    rule: 'RAG-005',
    why: 'DEC-002 — the member carries food inflation, and must be told credits are a dollar amount rather than a fixed shopping list',
  },
  {
    key: 'exitTermsVersion',
    rule: 'RAG-006',
    why: 'DEC-005 — leaving returns groceries at standard retail without Round benefits, and never cash',
  },
  {
    key: 'protectionVersion',
    rule: 'RAG-007',
    why: 'DEC-006 and DEC-011 — what the protection charge funds, and that cover does not reach ordinary commercial shortfall',
  },
  { key: 'deliveryPolicyVersion', rule: 'RAG-004', why: 'the delivery policy' },
  { key: 'refundPolicyVersion', rule: 'RAG-004', why: 'the refund and cancellation policy' },
];

/**
 * R4 — an agreement version may not be published without every locked decision
 * present, by version.
 */
export function validateAgreementVersion(version: AgreementVersion): AgreementFinding[] {
  const findings: AgreementFinding[] = [];

  for (const required of REQUIRED_DISCLOSURES) {
    if (!version.disclosures[required.key]?.trim()) {
      findings.push(
        refuse(
          required.rule,
          `An agreement version carries ${required.why}.`,
          `Record disclosures.${required.key} before publishing. Its presence is checkable here; whether the wording is adequate is legal/compliance's judgement and this module does not claim it.`,
        ),
      );
    }
  }

  if (!Number.isInteger(version.version) || version.version < 1) {
    findings.push(
      refuse(
        'RAG-008',
        'An agreement version is a whole number from 1 upwards.',
        'Set version to the next whole number after the version currently in force, or to 1 for a first publication. Version numbers are what an acceptance record names, so a gap or a repeat makes an acceptance ambiguous about what was agreed.',
        String(version.version),
      ),
    );
  }

  const expected = agreementHash(version);
  if (version.hash !== expected) {
    findings.push(
      refuse(
        'RAG-003',
        'An agreement version’s hash matches its content. A mismatch is tampering, not a typo.',
        'Re-derive the hash with agreementHash(). If the content changed deliberately, that is a new version under RAG-009, not an edit to this one.',
        version.hash,
      ),
    );
  }

  return findings;
}

/** Convenience: build a version whose hash is correct by construction. */
export function publishAgreementVersion(
  input: Omit<AgreementVersion, 'hash'>,
): { version: AgreementVersion; findings: AgreementFinding[] } {
  const version: AgreementVersion = { ...input, hash: agreementHash(input) };
  return { version, findings: validateAgreementVersion(version) };
}

/**
 * R5 — a material change produces a new version. It never edits an existing one.
 *
 * Returns the new version and leaves the prior object untouched; §6.2's rule is
 * that material terms are never retroactively overwritten, and the cheapest way to
 * honour that is to make the function incapable of doing it.
 */
export function supersedeAgreement(
  current: AgreementVersion,
  changes: { body?: string; disclosures?: Partial<AgreementDisclosures> },
  publishedAt: string,
): { previous: AgreementVersion; next: AgreementVersion; findings: AgreementFinding[] } {
  const nextInput: Omit<AgreementVersion, 'hash'> = {
    agreementId: current.agreementId,
    agreementType: current.agreementType,
    version: current.version + 1,
    body: changes.body ?? current.body,
    disclosures: { ...current.disclosures, ...changes.disclosures },
    publishedAt,
  };
  const { version: next, findings } = publishAgreementVersion(nextInput);
  // The previous version is returned as a copy carrying its supersession date. The
  // caller's original object is never mutated, so an acceptance already verified
  // against it stays verifiable — R6.
  const previous: AgreementVersion = { ...current, supersededAt: publishedAt };
  return { previous, next, findings };
}

const REQUIRED_ACCEPTANCE_FIELDS: Array<keyof AcceptanceRecord> = [
  'acceptanceId',
  'customerId',
  'roundId',
  'agreementType',
  'agreementHash',
  'termsSummaryVersion',
  'protectionDisclosureVersion',
  'deliveryPolicyVersion',
  'refundPolicyVersion',
  'acceptedAt',
  'locale',
  'applicationVersion',
];

/** R3 — every §6.2 field, or refusal naming what is missing. */
export function validateAcceptanceRecord(record: AcceptanceRecord): AgreementFinding[] {
  const findings: AgreementFinding[] = [];

  for (const field of REQUIRED_ACCEPTANCE_FIELDS) {
    const value = record[field];
    if (typeof value !== 'string' || !value.trim()) {
      findings.push(
        refuse(
          'RAG-002',
          `An acceptance record carries ${field}, per master plan §6.2.`,
          `Populate ${field}. A record missing a §6.2 field is refused rather than stored incomplete — an acceptance is evidence, and incomplete evidence is worth less than none because it looks like proof.`,
          `${field}=${String(value ?? '')}`,
        ),
      );
    }
  }

  if (!Number.isInteger(record.agreementVersion) || record.agreementVersion < 1) {
    findings.push(
      refuse(
        'RAG-002',
        'An acceptance record names the agreement version it accepted.',
        'Populate agreementVersion with the whole number of the version in force at acceptance.',
        String(record.agreementVersion),
      ),
    );
  }

  const session = record.sessionMetadata;
  if (!session?.sessionId?.trim() || !session?.deviceId?.trim() || !session?.userAgent?.trim()) {
    findings.push(
      refuse(
        'RAG-002',
        'An acceptance record carries session and device metadata, per master plan §6.2.',
        'Populate sessionMetadata.sessionId, deviceId and userAgent. This is what distinguishes a recorded act from an asserted one when the acceptance is later disputed.',
      ),
    );
  }

  return findings;
}

/**
 * R2/R6/R14 — is this acceptance still evidence of this version?
 *
 * Deliberately checks the acceptance against the version's *content*, not against
 * its stored hash field. A tampered version fails here even if its own hash was
 * updated to match the tampering, because the acceptance carries the hash of what
 * was actually shown to the member.
 */
export function verifyAcceptanceAgainst(
  record: AcceptanceRecord,
  version: AgreementVersion,
): AgreementFinding[] {
  const findings = validateAcceptanceRecord(record);
  const trueHash = agreementHash(version);

  if (record.agreementVersion !== version.version || record.agreementType !== version.agreementType) {
    findings.push(
      refuse(
        'RAG-010',
        'An acceptance is verified against the version it names, not another one.',
        'Verify against the version the record names.',
        `record ${record.agreementType} v${record.agreementVersion}, version ${version.agreementType} v${version.version}`,
      ),
    );
    return findings;
  }

  if (record.agreementHash !== trueHash) {
    findings.push(
      refuse(
        'RAG-003',
        'The acceptance is void: the agreement content no longer matches what the member accepted.',
        'Do not treat this acceptance as evidence. Either the version was edited in place — which §6.2 forbids and RAG-009 exists to prevent — or the record was altered. Establish which before anything else.',
        `accepted ${record.agreementHash}, content now ${trueHash}`,
      ),
    );
  }

  return findings;
}

/**
 * R1 — the gate itself.
 *
 * Returns findings rather than a boolean so a caller cannot proceed while ignoring
 * the reason. An empty array is the only thing that opens the action.
 */
export function assertGateOpen(input: {
  action: GatedAction;
  roundId: string;
  customerId: string;
  versionInForce: AgreementVersion;
  acceptance: AcceptanceRecord | null;
}): AgreementFinding[] {
  const { action, roundId, customerId, versionInForce, acceptance } = input;

  if (!acceptance) {
    return [
      refuse(
        'RAG-001',
        `${action} requires a recorded acceptance of the agreement in force. There is none.`,
        'Present the consent gateway and record an affirmative acceptance before this action. Master plan §6 admits no override, no operator bypass and no acceptance recorded outside the system.',
      ),
    ];
  }

  const findings: AgreementFinding[] = [];

  if (acceptance.customerId !== customerId || acceptance.roundId !== roundId) {
    findings.push(
      refuse(
        'RAG-001',
        'An acceptance opens the gate for the member and Round it was given for, and no other.',
        'Record an acceptance for this member and this Round.',
        `acceptance ${acceptance.customerId}/${acceptance.roundId}, action ${customerId}/${roundId}`,
      ),
    );
  }

  if (acceptance.agreementVersion !== versionInForce.version) {
    findings.push(
      refuse(
        'RAG-009',
        'A gated action requires acceptance of the version in force. This member accepted a superseded one.',
        'Present the current version and record fresh consent. The earlier acceptance stays valid evidence of what it accepted — it simply does not reach the new terms.',
        `accepted v${acceptance.agreementVersion}, in force v${versionInForce.version}`,
      ),
    );
    return findings;
  }

  findings.push(...verifyAcceptanceAgainst(acceptance, versionInForce));
  return findings;
}
