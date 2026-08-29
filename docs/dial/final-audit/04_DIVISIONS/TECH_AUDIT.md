# Dial a Tech — Final Feature & Eventuality Audit

**Planning status:** GREEN for repository FRC generation.  
**Implementation status:** must be proven feature-by-feature from code/evidence.

## Feature → software map

| Feature ID | Usable capability | Canonical domain/package owner | Primary aggregate |
|---|---|---|---|
| TECH-F001 | Trade & JobClass configuration | `trades/job-classes` | `JobClass` |
| TECH-F002 | Guided diagnostic intake | `tech-intake` | `JobRequest` |
| TECH-F003 | Direct booking & slot selection | `jobs/booking` | `BookingIntent` |
| TECH-F004 | Opportunity Marketplace post | `opportunity-marketplace` | `Opportunity` |
| TECH-F005 | Eligibility & matching | `matching/technicians` | `MatchSet` |
| TECH-F006 | Interest/proposal workflow | `opportunity-marketplace` | `Proposal` |
| TECH-F007 | Award & job convergence | `opportunity-marketplace/jobs` | `Award` |
| TECH-F008 | Diagnosis, quote & approval | `pricing/jobs` | `Quote` |
| TECH-F009 | Job Reserve / protected funds | `payments/ledger` | `JobReserve` |
| TECH-F010 | Scheduling & dispatch | `jobs/dispatch` | `JobDispatch` |
| TECH-F011 | Technician Android offline execution | `technician-android` | `JobExecution` |
| TECH-F012 | HIRA / PPE / LOTO / SOP | `job-safety` | `JobSafetyPack` |
| TECH-F013 | Check-in and evidence | `jobs/evidence` | `JobEvidence` |
| TECH-F014 | Scope variation | `jobs/pricing` | `Variation` |
| TECH-F015 | Team jobs/project handoff | `projects/jobs` | `TeamAssignment` |
| TECH-F016 | Completion / customer confirmation | `jobs` | `Job` |
| TECH-F017 | Payout / WHT / settlement | `ledger/tax/treasury` | `ProviderSettlement` |
| TECH-F018 | Workmanship protection / disputes | `claims/rce/guarantee` | `Claim` |
| TECH-F019 | Technician scoring & quality | `technician-scoring/provider-quality` | `TechnicianScore` |
| TECH-F020 | Anti-circumvention / trust | `trust` | `TrustSignal` |

## Material module-specific eventualities

- job cannot be classified
- unsafe request
- no eligible technician
- no slot
- technician declines/no-show
- multiple proposals race
- award expires/declined
- diagnosis changes job class
- customer rejects quote
- reserve funding fails
- technician offline
- safety gate fails
- LOTO unavailable
- evidence upload fails
- variation disputed
- team member unavailable
- customer unreachable at completion
- rework/comeback
- WHT data missing
- payout returned
- customer/tech dispute
- off-platform collusion signal
- credential expires mid-job
- callout-only completion

These extend the global Eventuality Standard and become concrete EV rows in implementation.

## Donor classification

FixItNow = **PORT-WHOLESALE, MIT-licensed production donor source: `Sachinrajawat/FixItNow`**. The earlier `AyanSujon/FixItNow` publication remains provenance/reference history but is not the source used to establish licensing. Pin the MIT publication commit and preserve its MIT notice. NearServe/Homezy remain secondary behavioral/UX references; Cal.com slot adapter; Now in Android architecture reference; Schedule-X; Formbricks.

## Mandatory weave

Identity/Party; Evidence/Audit; RCE/Claims; Money/Ledger/Tax where applicable; Customer360/Engagement where applicable; Delivery where fulfilment applies; Command Centre manifest/metrics/alerts/controls; Development evidence and gates.

## Software-complete rule

A feature is complete only when its FRC, state transitions, API/commands/queries, data, events, permissions/RLS, applicable eventuality tests, degraded behavior, UI states, Command Centre registration and evidence are implemented and verified.
