# DIAL Petty Cash — Requisition, Approval, Custody & Reconciliation

## 1. Lock

Every DIAL business unit has its own:

- Petty Cash asset account;
- Petty Cash journal;
- assigned requester(s);
- assigned approver(s);
- assigned custodian(s);
- funding-source rules;
- thresholds and SoD.

Petty cash is not a free-form expense wallet.

## 2. Funding flow

```text
Petty Cash Requisition
        ↓
Requester
        ↓
budget / policy / source-account check
        ↓
Approver(s)
        ↓
Finance/Treasury release
        ↓
source account transfer / authorized cash issue
        ↓
Petty Cash Custodian acknowledgement
        ↓
Petty Cash balance increases
```

Accounting:
`Dr BU Petty Cash`
`Cr authorized source liquid account`

This is an internal balance-sheet transfer, not an expense.

The exact source must be:
- owned by the same BU/legal entity or an authorized central treasury transfer;
- actually liquid/settled;
- permitted by policy.

A provider clearing balance that has not settled cannot be treated as immediately spendable petty cash merely because its statement shows money.

## 3. Requisition states

```text
DRAFT
SUBMITTED
POLICY_CHECK
PENDING_APPROVAL
APPROVED
PENDING_RELEASE
RELEASED
CUSTODIAN_ACKNOWLEDGED
CLOSED

REJECTED
CANCELLED
EXPIRED
EXCEPTION
```

## 4. Requisition fields

```yaml
requisition_ref:
business_unit:
legal_entity:
site:
requester:
requested_amount:
currency:
purpose:
required_by:
funding_source_preference:
cost_centre:
project_ref_optional:
attachments:
policy_version:
approvers:
release_authority:
custodian:
```

## 5. Roles

### `PETTY_CASH_REQUESTER`
Can create/submit within assigned BU/site/cost-centre scope.

### `PETTY_CASH_APPROVER`
Can approve within assigned BU, currency and amount threshold.

### `PETTY_CASH_RELEASE`
Can execute funding after approvals.

### `PETTY_CASH_CUSTODIAN`
Takes custody, records vouchers and performs counts.

### `PETTY_CASH_AUDITOR`
Read/count/reconciliation access; cannot alter ordinary transactions.

## 6. Assignment

Authority comes from:

`Position → PermissionBundle / FinancialAuthority → Employee Position Assignment`

Individual overrides:
- explicit;
- approved;
- time-bound;
- audited.

Temporary delegation:
- start/end;
- amount limit;
- BU/site scope;
- reason;
- cannot violate SoD.

## 7. SoD

Default prohibitions:
- requester cannot be final approver of own requisition;
- approver cannot release above configured thresholds when four-eyes applies;
- custodian cannot approve unexplained own variance;
- user cannot create, approve, release and reconcile the same material transaction.

Small-organization exceptions require explicit policy and stronger retrospective review, never silent bypass.

## 8. Petty cash spending

Each disbursement creates a voucher:

```text
PettyCashVoucher
- voucher ref
- BU
- date
- amount/currency
- payee
- expense category
- purpose
- cost centre/project
- receipt/evidence
- requester/custodian
- approval if threshold/policy requires
- accounting event
```

Accounting:
`Dr expense/asset/prepayment/etc.`
`Cr Petty Cash`

Expense account is determined by approved accounting mapping, not user-entered free text.

## 9. Receipt/image capture

Employee/custodian can:
- camera;
- image picker;
- PDF upload.

Upload passes:
quarantine → file/type limits → scan → safe storage → evidence ref.

OCR may propose merchant/date/amount, but user confirms and deterministic rules control accounting.

## 10. Replenishment

Replenishment is not "set balance back to X" by editing.

```text
approved vouchers
→ current physical/ledger balance
→ target float policy
→ replenishment requisition
→ approvals
→ release
→ custody acknowledgement
```

## 11. Return of unused cash

Unused/closing float:

`Dr source cash/bank account`
`Cr Petty Cash`

with custody handover/count evidence.

## 12. Cash count

Support:
- scheduled count;
- surprise count;
- handover count;
- period-close count.

Count record:
- expected balance;
- physical balance;
- variance;
- denominations optional;
- counters;
- witness if required;
- photos/evidence optional;
- resolution.

## 13. Variance

Over/short:
- never silently edit balance;
- create `PettyCashVariance`;
- investigate;
- approved adjustment journal;
- CAPA/provider/employee action if needed.

## 14. Eventualities

- requisition exceeds requester limit;
- missing approver;
- approver on leave;
- same person requests and approves;
- funding account insufficient/unsettled;
- funding transfer fails;
- custodian refuses/does not acknowledge;
- lost/stolen petty cash;
- missing receipt;
- duplicate voucher;
- receipt amount differs;
- wrong currency;
- cash count over/short;
- employee leaves while holding float;
- site closes;
- late expense submission;
- disputed expense;
- policy changes while requisition pending.

## 15. APIs

- `POST /api/v1/finance/petty-cash/requisitions`
- `GET /api/v1/finance/petty-cash/requisitions/{ref}`
- `POST /api/v1/finance/petty-cash/requisitions/{ref}/submit`
- `POST /api/v1/finance/petty-cash/requisitions/{ref}/approve`
- `POST /api/v1/finance/petty-cash/requisitions/{ref}/reject`
- `POST /api/v1/finance/petty-cash/requisitions/{ref}/release`
- `POST /api/v1/finance/petty-cash/requisitions/{ref}/acknowledge`
- `POST /api/v1/finance/petty-cash/vouchers`
- `POST /api/v1/finance/petty-cash/counts`
- `POST /api/v1/finance/petty-cash/variances/{ref}/resolve`
- `POST /api/v1/finance/petty-cash/returns`

Every state transition is permission/state/SoD checked server-side.
