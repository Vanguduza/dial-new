# DIAL Business Unit Finance Books, Accounts & Journals

## 1. Objective

Every DIAL business unit receives a dedicated finance workspace without creating separate ledgers.

The canonical DIAL Ledger remains the only general ledger.

Each business unit gets:

```text
Business Unit Finance Book
├── Combined Collections Control / Combined Journal
├── Cash Account + Cash Journal
├── EcoCash Direct Account + Journal
├── Paynow Account + Journal
├── ContiPay Account + Journal
├── PayPal Account + Journal
├── Petty Cash Account + Journal
├── Returns & Refunds Journal
└── Disputes / Chargebacks Journal
```

## 2. Combined account is non-posting

To avoid double counting:

`BU Combined Collections Control` is a **non-posting parent/summary account**.

The Combined Journal is a **read-only projection** across its child channel journals.

No transaction is posted both to a channel account and again to the combined account.

This gives the requested combined financial view while preserving correct double-entry accounting.

## 3. Channel accounts

For each BU:
- Cash
- EcoCash Direct
- Paynow
- ContiPay
- PayPal

are dedicated posting/clearing accounts.

Digital providers are usually **clearing accounts** until settlement.

Cash may contain sub-custody states such as:
- counter/till;
- courier cash-in-transit;
- branch safe;
- deposit-in-transit.

Those subaccounts can roll up into the BU Cash account.

## 4. Multi-currency

Never show one running balance that arithmetically mixes USD and ZWG/other currencies.

The statement UI uses:
- currency tab/filter;
- separate opening/running/closing balance per currency.

A reporting-currency equivalent may be shown separately with:
- FX source;
- FX date/version;
- clear "reporting equivalent" label.

## 5. Statement-style UI

Route:

`Command Centre → Corporate → Finance → Business Unit → Accounts & Journals`

Business unit example:

```text
Dial a Tech
┌─────────────────────────────────────────────┐
│ Combined  Cash  EcoCash  Paynow  ContiPay │
│ PayPal    Petty Cash  Returns  Disputes    │
└─────────────────────────────────────────────┘

Account: Dial a Tech — EcoCash Direct
Currency: USD
Opening balance:  12,450.00
Debits:             8,320.00
Credits:            6,100.00
Closing balance:   14,670.00
Unreconciled:              3

Date/Time | Ref | Description | Debit | Credit | Balance | Status
------------------------------------------------------------------
29 Aug    | PAY... | Job reserve ... | 250.00 |        | 12,700 |
29 Aug    | SET... | Settlement      |        | 230.00 | 12,470 |
29 Aug    | FEE... | Provider fee    |        |  10.00 | 12,460 |
...
```

The Debit/Credit direction shown follows the ledger account.

Do not label all incoming customer payments "credits" merely because a bank statement might; DIAL's accounting UI should remain internally consistent with the account's ledger postings. A user-facing bank-style mode may optionally use "Money In / Money Out", but Finance mode retains Debit/Credit.

## 6. Filters

- date/time range;
- currency;
- transaction ref;
- source order/job/project;
- customer/provider;
- payment channel;
- transaction type;
- status;
- reconciliation state;
- branch/site;
- amount range;
- created/posted/reconciled date.

## 7. Transaction detail popup/page

Clicking any line opens a modal/drawer with a dedicated deep-linkable full page option.

Show:

### Identity
- transaction human ref;
- ledger journal entry ref;
- business unit;
- account/journal;
- date/time;
- currency.

### Source
- Order/Job/Project/Payroll/Petty Cash/Return ref;
- customer/provider/employee refs where authorized;
- source document/version.

### Payment/provider
- channel;
- PaymentIntent;
- provider ref;
- provider substate;
- confirmation event;
- settlement batch;
- safe masked payment instrument data if available/allowed.

### Accounting
- full balanced debit/credit lines;
- account names/refs;
- tax/fees/FX;
- posting rule/version;
- reversal/adjustment links.

### Workflow
- creator;
- approvers;
- reason;
- state timeline;
- idempotency/correlation IDs.

### Reconciliation
- matched/unmatched;
- provider statement/bank deposit;
- variance;
- resolver.

### Evidence
- receipt;
- return/refund docs;
- petty-cash receipt;
- approved PDF/document;
- audit events.

Sensitive fields remain permission-filtered.

## 8. PDF export

### Single transaction

From the transaction detail:
`Export → PDF`

The PDF includes:
- DIAL;
- business unit;
- account/journal;
- transaction reference;
- source reference;
- transaction date;
- debit/credit lines;
- total;
- provider/payment details safe for document;
- approvals;
- reconciliation state;
- generated timestamp;
- document hash/verification ref;
- page numbers.

### Date-range statement

From any account/journal:
1. select date range;
2. optional filters;
3. click `Export PDF`;
4. preview export parameters;
5. server generates immutable report.

Statement includes:
- account identity;
- business unit;
- currency;
- statement period;
- opening balance;
- row-by-row debit/credit/running balance;
- total debits;
- total credits;
- closing balance;
- filters;
- generation details.

If multiple currencies are requested, each currency receives a separate section with its own running balance.

### PDF implementation

Use a server-side `Reporting/PDF Worker`.

Preferred pattern:
typed report JSON → controlled React/HTML template → Playwright/Chromium print-to-PDF → Records/Object Storage.

This avoids trusting browser print state.

Export job:
- authorization checked server-side;
- query snapshot/reference recorded;
- generated file hashed;
- private signed download;
- audit event.

## 9. APIs

- `GET /api/v1/finance/business-units/{bu}/accounts`
- `GET /api/v1/finance/accounts/{accountRef}/statement`
- `GET /api/v1/finance/journals/{journalRef}/entries`
- `GET /api/v1/finance/transactions/{transactionRef}`
- `POST /api/v1/finance/transactions/{transactionRef}/exports/pdf`
- `POST /api/v1/finance/accounts/{accountRef}/statement-exports/pdf`
- `GET /api/v1/finance/exports/{exportRef}`

All APIs are server-authorized by business-unit/finance role.

## 10. Returns & refunds

Every BU has:
`JRN-<BU>-RETURNS`

The journal includes:
- original payment/order/job;
- return/claim/RCE decision;
- refund amount;
- original channel;
- actual refund channel;
- restocking/asset/inventory impact where applicable;
- customer/provider responsibility;
- accounting event;
- refund provider ref;
- reconciliation.

Do not edit the original sales/payment journal line.

## 11. Provider disputes/chargebacks

Use the separate disputes journal so:
- PayPal dispute;
- Paynow disputed transaction;
- provider reversal;
- suspected fraud

can be tracked without hiding them among ordinary returns.

A dispute can later produce:
- release;
- reversal;
- chargeback;
- recovery;
- provider/customer claim.

## 12. Access

Examples:
- Finance Viewer;
- BU Finance Analyst;
- BU Finance Controller;
- Treasury;
- Auditor;
- Returns Reviewer;
- Petty Cash Custodian.

Access is assigned via Positions/PermissionBundles and scoped to BU/legal entity/site.

## 13. Command Centre

Finance room shows:
- channel balances;
- provider unsettled;
- cash on hand/in transit;
- petty cash;
- refund/dispute value;
- unreconciled items;
- settlement ageing;
- provider fee trends;
- payment failure rate;
- cash variance;
- approval queues.
