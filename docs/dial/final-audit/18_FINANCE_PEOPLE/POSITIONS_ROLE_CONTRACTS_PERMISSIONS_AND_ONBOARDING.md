# DIAL Positions, Role-Based Contracts, Permissions & Employee Onboarding

## 1. Lock

A DIAL employee is not just a user account.

The canonical relationship is:

```text
Person
→ Employee
→ Employment
→ Position Assignment
→ Position Version
→ Contract Snapshot
→ Permission/Authority Grants
→ Assets/PPE/Training
```

A Position is a first-class corporate object.

## 2. Position model

`CompanyPosition`

Fields:

### Identity
- position ref/code;
- title;
- legal entity;
- business unit;
- department;
- team;
- cost centre;
- site/location;
- employment type;
- grade/band;
- reports-to position.

### Job
- purpose;
- responsibilities;
- KPIs/outcomes;
- minimum qualifications;
- experience;
- licences/certifications;
- working schedule;
- travel/field requirement.

### Compensation defaults
- salary/pay band;
- allowances;
- benefit eligibility;
- overtime category;
- payroll frequency;
- currency rules.

These are policy/defaults, not permission to alter a signed employee contract without a controlled variation.

### Contract
- contract template/version;
- probation;
- working hours;
- leave basis;
- notice period;
- confidentiality;
- IP;
- data protection;
- restraint/role-specific clauses where lawful;
- SHEQ obligations;
- termination conditions;
- annexures.

### Permissions / authority
- application roles;
- PermissionBundles;
- data scope;
- business unit/site scope;
- approval authority;
- financial thresholds;
- DoA;
- SoD incompatibilities;
- privileged/MFA requirements.

### Operational requirements
- onboarding checklist;
- training;
- PPE;
- assets/equipment;
- medical/fitness requirement only when lawful/role-relevant;
- required documents.

## 3. Position versions

Positions are effective-dated/versioned.

Never edit history so a past employee appears to have held today's position terms.

```text
Position
 ├─ Version 1: 2026-01-01...
 └─ Version 2: 2027-01-01...
```

New assignments reference the active version.

Existing contracts change only through:
- contract variation;
- move/promotion;
- reappointment;
- lawful policy process.

## 4. Role-based contract templates

`EmploymentContractTemplate`

Contains:
- legal entity;
- position family/grade;
- employment type;
- jurisdiction;
- effective dates;
- clause set;
- variable fields;
- annexures;
- required approvals;
- signature roles.

On hiring:

```text
Position Version
+ approved compensation
+ person/employment details
+ site/schedule
+ lawful role clauses
→ immutable Contract Snapshot
→ approval
→ Documenso e-sign ceremony
→ signed copy into DIAL Records
```

The third-party e-sign service handles ceremony. DIAL owns:
- template;
- version;
- approval;
- contract state;
- signed evidence;
- employment relationship.

## 5. Permission bundles

Permissions attach primarily to Position, not ad-hoc to each employee.

Example:

```yaml
permission_bundle: FIN_TECH_PETTY_CASH_APPROVER
scope:
  business_unit: TECH
permissions:
  - petty_cash.requisition.read
  - petty_cash.requisition.approve
constraints:
  max_amount:
    USD: 500
  cannot_approve_own: true
  step_up_above:
    USD: 250
```

Bundles can cover:
- requester;
- approver;
- Finance Controller;
- Returns Reviewer;
- payroll;
- HR;
- warehouse;
- supplier management;
- technician ops;
- Command Centre.

## 6. FinancialAuthority

Separate from general RBAC:

```ts
type FinancialAuthority = {
  authorityRef: string
  positionRef: string
  businessUnit?: string
  legalEntity: string
  action:
    | "PETTY_CASH_REQUEST"
    | "PETTY_CASH_APPROVE"
    | "PETTY_CASH_RELEASE"
    | "REFUND_APPROVE"
    | "JOURNAL_APPROVE"
    | "PAYMENT_ADJUSTMENT"
  currency?: string
  maxAmount?: Money
  siteScope?: string[]
  effectiveFrom: string
  effectiveTo?: string
}
```

Authorization becomes:
`Identity → active Employment → active PositionAssignment → PermissionBundle → FinancialAuthority → SoD → current state`.

## 7. Onboarding workflow

```text
Candidate accepted
      ↓
Create/verify Person
      ↓
Employee record
      ↓
Employment
      ↓
Select Position + active Position Version
      ↓
Business unit / department / cost centre / site / manager
      ↓
Capture employee photo
      ↓
Compensation/payroll/bank/statutory inputs
      ↓
Generate role-based contract snapshot
      ↓
Contract approval
      ↓
Employee signs
      ↓
Identity/account provisioning
      ↓
Permission bundles / finance authority
      ↓
Assets / PPE / training
      ↓
Required acknowledgements
      ↓
Manager/HR readiness review
      ↓
Activate employment/access on effective date
```

## 8. Employee photo

Onboarding explicitly includes employee picture capture.

### Client UX

Web:
- image picker;
- drag/drop;
- camera capture where browser/device supports it.

Android:
- Android Photo Picker;
- optional CameraX capture.

iOS:
- PhotosPicker;
- camera capture where included.

### Processing

```text
selected/captured image
→ preview/crop
→ client-side basic dimension feedback
→ signed upload intent
→ quarantine
→ type/magic-byte/size validation
→ decode + re-encode
→ strip unnecessary metadata
→ malware/content pipeline
→ private employee-photo storage
→ thumbnail/avatar variants
→ EmployeePhoto record
```

Suggested accepted inputs:
- JPEG;
- PNG;
- HEIC/HEIF where processing stack supports reliable conversion.

Do not store arbitrary original metadata if not needed.

### Security/privacy

- employee photo is private D2/D3 personnel data depending use;
- not public;
- access limited to legitimate staff/identity workflows;
- no facial-recognition/biometric inference by default;
- replacing a photo preserves audit/history;
- deletion/retention follows employment/records policy.

## 9. Onboarding fields

### Person
- legal/preferred names;
- DOB only where required;
- national ID/passport;
- contact;
- address;
- emergency contact.

### Employment
- employee number;
- legal entity;
- start date;
- employment type;
- position;
- manager;
- BU/department/team;
- cost centre;
- site.

### Payroll
- compensation;
- bank/payment details;
- tax/statutory fields;
- payroll currency.

### Access
- DIAL Identity;
- position permission bundles;
- financial authorities;
- special/temporary grants;
- MFA requirement.

### Operational
- assets;
- PPE;
- training;
- licences;
- inductions;
- policies/acknowledgements.

## 10. Activation gate

Employee cannot be considered fully onboarded if mandatory dependencies are incomplete.

Example:

```text
HR_COMPLETE
CONTRACT_SIGNED
IDENTITY_VERIFIED
PAYROLL_READY
ACCESS_APPROVED
ASSETS_READY
TRAINING_READY
SHEQ_READY
MANAGER_READY
→ ACTIVE
```

Some roles may activate with approved conditional exceptions.

## 11. Mover workflow

Position/BU/site/manager change triggers:

- old permission diff;
- new Position Version;
- new/changed FinancialAuthority;
- salary/contract variation if required;
- cost centre;
- assets;
- training/PPE;
- access re-certification.

Do not simply add new permissions while leaving old ones.

## 12. Leaver workflow

At effective termination:
- revoke access/session;
- remove financial authority;
- recover assets/PPE;
- settle petty cash/cash custody;
- final payroll;
- preserve records;
- transfer open approvals/work;
- revoke delegated authority.

Access revocation cannot wait for final payroll.

## 13. Position Management UI

`Corporate → People → Organisation → Positions`

List:
- Position ref;
- title;
- BU/department;
- grade;
- reports to;
- headcount;
- active assignments;
- contract template;
- permission bundle;
- approval authority;
- status/effective date.

Position detail tabs:

```text
Overview
Job Description
Contract
Compensation
Permissions
Financial Authority
SHEQ / Training
Assets / PPE
Onboarding
Assignments
History / Audit
```

## 14. Contract Builder

Controlled builder:
- approved clause library;
- role/grade/jurisdiction clauses;
- variables;
- preview;
- approval;
- version;
- effective dating.

Do not allow an AI agent to silently create binding employment terms.

AI may:
- draft wording;
- compare versions;
- identify missing clauses;
but HR/legal approval owns the template.

## 15. APIs

Positions:
- `POST /api/v1/corporate/positions`
- `GET /api/v1/corporate/positions`
- `GET /api/v1/corporate/positions/{ref}`
- `POST /api/v1/corporate/positions/{ref}/versions`
- `POST /api/v1/corporate/positions/{ref}/permission-bundles`
- `POST /api/v1/corporate/positions/{ref}/financial-authorities`

Contracts:
- `POST /api/v1/corporate/contract-templates`
- `POST /api/v1/corporate/contract-templates/{ref}/versions`
- `POST /api/v1/corporate/employments/{ref}/contract-snapshots`
- `POST /api/v1/corporate/contracts/{ref}/approve`
- `POST /api/v1/corporate/contracts/{ref}/send-for-signature`

Onboarding:
- `POST /api/v1/corporate/onboarding`
- `GET /api/v1/corporate/onboarding/{ref}`
- `POST /api/v1/corporate/onboarding/{ref}/employee-photo`
- `POST /api/v1/corporate/onboarding/{ref}/complete-step`
- `POST /api/v1/corporate/onboarding/{ref}/activate`

## 16. Eventualities

- position is abolished while offer pending;
- position version changes before signing;
- candidate changes start date;
- duplicate Person/Employee;
- contract signature refused/expired;
- photo upload/camera unavailable;
- low-quality/corrupt image;
- employee has no email but has mobile;
- bank/payroll details pending;
- mandatory licence missing;
- permission bundle conflicts with SoD;
- financial approver threshold conflicts;
- manager not assigned;
- employee is rehired;
- employee holds two positions;
- temporary secondment;
- employee changes BU;
- leaver owns pending approvals;
- leaver holds petty cash;
- privileged access not revoked;
- contract template later changes.

Every case has state/recovery rather than ad-hoc manual database edits.
