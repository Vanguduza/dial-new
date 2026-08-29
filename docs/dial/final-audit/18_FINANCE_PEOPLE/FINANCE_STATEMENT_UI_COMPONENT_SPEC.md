# Finance Accounts & Journals — UI Component Specification

## Shell

```text
Corporate → Finance → Accounts & Journals

[Business Unit ▼] [Currency ▼] [Date range ▼] [Search] [Export]

Tabs:
Combined | Cash | EcoCash | Paynow | ContiPay | PayPal | Petty Cash | Returns | Disputes
```

## Account header

Show:
- account/journal name;
- human ref;
- business unit;
- legal entity;
- currency;
- account type;
- opening balance;
- total debits;
- total credits;
- closing balance;
- unreconciled count;
- settlement ageing where relevant.

## Statement table

Required columns:

```text
Date/Time
Reference
Description / Counterparty
Debit
Credit
Balance
Status
```

Optional compact metadata:
- source ref;
- provider icon;
- reconciliation indicator.

Rules:
- right-align money;
- monospaced/tabular numerals;
- sticky header;
- no card-per-transaction;
- desktop dense table;
- mobile responsive rows with debit/credit/balance still visible.

## Row interaction

Click/tap opens:
- right-side drawer on desktop;
- full-screen sheet on mobile/tablet;
- `Open full page` deep link.

Sections:
1. Summary
2. Source transaction
3. Provider/payment
4. Ledger lines
5. Fees/tax/FX
6. Settlement/reconciliation
7. Approvals
8. Evidence/attachments
9. Audit/timeline

Actions are permission/state derived:
- Export transaction PDF
- Open source order/job/etc.
- Open reconciliation exception
- Request/approve adjustment
- Open refund/return/dispute
- Copy human refs

Never expose a direct "Edit transaction" action on posted/reconciled entries.

## PDF button

Account header:
`Export statement`

Modal:
- period;
- currency;
- current filters;
- include provider references? (permission-controlled);
- include reconciliation status?;
- output orientation/template;
- generate.

Transaction drawer:
`Export PDF`

## Empty/error states

- no transactions in period;
- account not configured;
- permission denied;
- projection stale;
- statement export queued;
- export failed;
- reconciliation provider unavailable.

Do not replace a stale financial balance with zero.

## Design language

Use the DIAL Command Design System:
- neutral professional surfaces;
- bank-statement clarity;
- restrained status colour;
- readable human refs;
- no finance-dashboard gimmicks;
- audit/reconciliation state visible without overwhelming the ledger table.
