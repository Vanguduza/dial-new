# Corporate Management OS — Final Feature & Eventuality Audit

**Planning status:** GREEN for repository FRC generation.  
**Implementation status:** must be proven feature-by-feature from code/evidence.

## Feature → software map

| Feature ID | Usable capability | Canonical domain/package owner | Primary aggregate |
|---|---|---|---|
| CORP-F001 | Organisation/positions/cost centres | `organisation` | `OrgStructure` |
| CORP-F002 | Recruitment | `recruitment` | `RecruitmentRequisition` |
| CORP-F003 | Onboarding/JML | `people/corporate-iam` | `Employment` |
| CORP-F004 | Attendance/shifts/timesheets | `workforce` | `AttendanceRecord` |
| CORP-F005 | Leave | `leave` | `LeaveRequest` |
| CORP-F006 | Performance/learning | `performance/learning` | `PerformanceCycle` |
| CORP-F007 | Compensation/payroll | `payroll` | `PayrollRun` |
| CORP-F008 | Zimbabwe statutory rules | `statutory-rules` | `StatutoryRuleSet` |
| CORP-F009 | Corporate accounting/AP/AR | `corporate-finance/ledger` | `AccountingEvent` |
| CORP-F010 | FP&A/budget/forecast | `fpa` | `BudgetVersion` |
| CORP-F011 | Treasury/bank | `treasury` | `PaymentBatch` |
| CORP-F012 | Procurement/vendors | `procurement` | `PurchaseOrder` |
| CORP-F013 | Internal inventory/WMS | `inventory` | `InventoryMovement` |
| CORP-F014 | Assets/facilities | `assets/facilities` | `Asset` |
| CORP-F015 | Corporate IT/ITSM | `corporate-it` | `ITCase` |
| CORP-F016 | Contracts/e-sign/records | `contracts/records` | `Contract` |
| CORP-F017 | GRC/internal audit | `grc/internal-audit` | `CorporateRisk` |
| CORP-F018 | Strategy/board/portfolio | `strategy` | `InternalInitiative` |
| CORP-F019 | SHEQ/continuity | `corporate-sheq` | `CorporateIncident` |
| CORP-F020 | DoA/SoD/access review | `corporate-iam/approvals` | `ApprovalPolicy` |

## Material module-specific eventualities

- joiner/mover/leaver edges
- retroactive pay
- failed payroll payment
- closed-period correction
- vendor bank fraud
- PO/receipt/invoice mismatch
- stock count variance
- asset outstanding at exit
- e-sign failure
- legal hold
- control test failure
- auditor conflict
- budget overrun
- delegation expiry
- self-approval conflict
- privileged-access abuse
- site outage
- statutory rule change
- sensitive HR access
- reconciliation mismatch
- intercompany/currency

These extend the global Eventuality Standard and become concrete EV rows in implementation.

## Donor classification

Corporate OS v1.1 locked assimilation: Frappe HR, ERPNext, InvenTree, Snipe-IT, GLPI/Agent, Paperless patterns, OCRmyPDF/Tesseract/Tika, Documenso, Eramba, OpenProject, OPA.

## Mandatory weave

Identity/Party; Evidence/Audit; RCE/Claims; Money/Ledger/Tax where applicable; Customer360/Engagement where applicable; Delivery where fulfilment applies; Command Centre manifest/metrics/alerts/controls; Development evidence and gates.

## Software-complete rule

A feature is complete only when its FRC, state transitions, API/commands/queries, data, events, permissions/RLS, applicable eventuality tests, degraded behavior, UI states, Command Centre registration and evidence are implemented and verified.

## v1.6 finance / positions / onboarding expansion

### CORP-F001 — Organisation/positions

`CompanyPosition` is now a first-class, versioned object containing:
- legal entity / BU / department / team / cost centre / site;
- grade and reports-to position;
- job description / responsibilities / KPIs / qualifications;
- compensation defaults;
- role-based employment contract template;
- PermissionBundles;
- FinancialAuthority thresholds;
- DoA/SoD conflicts;
- SHEQ/training/PPE/assets/onboarding requirements.

### CORP-F003 — Onboarding/JML

Onboarding now explicitly includes:
- position/version assignment;
- role-based contract snapshot and e-sign;
- employee photo through image picker/camera;
- payroll/bank/statutory readiness;
- position-based permissions and financial authority;
- assets/PPE/training/SHEQ;
- activation readiness gate.

Mover recalculates and revokes old permissions. Leaver revokes sessions/financial authority immediately and must settle assigned petty cash/cash custody.

### CORP-F009 / F011 — Finance/Treasury

Every business unit receives dedicated:
- Cash account/journal;
- EcoCash Direct account/journal;
- Paynow account/journal;
- ContiPay account/journal;
- PayPal account/journal;
- non-posting Combined Collections parent + combined journal projection;
- Petty Cash account/journal;
- Returns & Refunds journal;
- Disputes/Chargebacks journal.

All remain views/source journals within the single DIAL Ledger.

Finance UI is bank-statement style:
`Date | Ref | Description | Debit | Credit | Running Balance | Status`

Every row opens full transaction details and can export a transaction PDF. Any account can export a selected-date-range PDF statement with opening/closing balances and separate currency sections.

### Petty cash

Funding is:
`Requisition → Policy/Budget → Approval → Release from eligible same-BU settled account → Custodian acknowledgement`.

Central treasury may fund a BU only through an explicit authorized inter-unit/treasury transfer, never by silently borrowing another BU's account.

Positions/assignments define:
- requester;
- approver;
- release authority;
- custodian;
- thresholds;
- effective dates;
- SoD.

