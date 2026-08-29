# DIAL Projects — Final Feature & Eventuality Audit

**Planning status:** GREEN for repository FRC generation.  
**Implementation status:** must be proven feature-by-feature from code/evidence.

## Feature → software map

| Feature ID | Usable capability | Canonical domain/package owner | Primary aggregate |
|---|---|---|---|
| PROJ-F001 | Project request/intake | `projects` | `ProjectRequest` |
| PROJ-F002 | Assessment/site visit | `projects/jobs` | `ProjectAssessment` |
| PROJ-F003 | Scope/BoQ/quote | `projects/pricing` | `ProjectQuote` |
| PROJ-F004 | Project creation | `projects` | `Project` |
| PROJ-F005 | Team/project manager | `projects/technicians` | `ProjectTeam` |
| PROJ-F006 | Milestones | `projects` | `Milestone` |
| PROJ-F007 | Dependencies/critical path | `projects` | `ProjectDependency` |
| PROJ-F008 | Materials/Spare dependencies | `projects/spare` | `MaterialRequirement` |
| PROJ-F009 | Budget/commitment/EAC | `projects/finance` | `ProjectBudget` |
| PROJ-F010 | Progressive funding | `payments/ledger/projects` | `ProjectFunding` |
| PROJ-F011 | Variations | `projects/pricing` | `ProjectVariation` |
| PROJ-F012 | Safety/quality packs | `projects/job-safety` | `ProjectSafetyQuality` |
| PROJ-F013 | Evidence/progress reporting | `projects/evidence` | `ProgressEvidence` |
| PROJ-F014 | Client visibility | `projects` | `ClientProjectView` |
| PROJ-F015 | Completion/handover | `projects` | `Project` |
| PROJ-F016 | Claims/disputes | `rce/claims/projects` | `ProjectCase` |

## Material module-specific eventualities

- scope uncertain
- site inaccessible
- assessment-fee-only outcome
- quote expiry
- team unavailable
- PM change
- dependency delay
- material unavailable/wrong
- milestone partial/rejected
- client approval delay
- budget overrun
- EAC deterioration
- funding failure
- variation dispute
- safety stop
- quality rework
- contractor no-show
- weather/site interruption
- client pause/cancel
- handover snag
- retention/guarantee claim
- cross-period accounting
- evidence conflict

These extend the global Eventuality Standard and become concrete EV rows in implementation.

## Donor classification

OpenProject schema/workflow/UX reference for work packages, dependencies, Gantt and meetings; reuse Tech Job/Opportunity patterns; Schedule-X.

## Mandatory weave

Identity/Party; Evidence/Audit; RCE/Claims; Money/Ledger/Tax where applicable; Customer360/Engagement where applicable; Delivery where fulfilment applies; Command Centre manifest/metrics/alerts/controls; Development evidence and gates.

## Software-complete rule

A feature is complete only when its FRC, state transitions, API/commands/queries, data, events, permissions/RLS, applicable eventuality tests, degraded behavior, UI states, Command Centre registration and evidence are implemented and verified.
