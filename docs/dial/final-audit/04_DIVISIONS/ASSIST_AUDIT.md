# Dial Assist — Final Feature & Eventuality Audit

**Planning status:** GREEN for repository FRC generation.  
**Implementation status:** must be proven feature-by-feature from code/evidence.

## Feature → software map

| Feature ID | Usable capability | Canonical domain/package owner | Primary aggregate |
|---|---|---|---|
| ASST-F001 | Incident intake | `assist` | `AssistIncident` |
| ASST-F002 | Incident-scoped location | `assist/location` | `IncidentLocation` |
| ASST-F003 | Coverage/eligibility | `assist/network` | `AssistCoverage` |
| ASST-F004 | Safety triage | `assist/safety` | `SafetyAssessment` |
| ASST-F005 | Roadside provider matching | `matching/assist` | `AssistMatchSet` |
| ASST-F006 | Tow partner dispatch | `assist/delivery` | `AssistDispatch` |
| ASST-F007 | ETA/routing | `delivery/maps` | `AssistRoute` |
| ASST-F008 | Emergency referral | `assist/safety` | `EmergencyReferral` |
| ASST-F009 | Provider arrival/check-in | `assist/evidence` | `AssistCheckIn` |
| ASST-F010 | Service/tow proof | `assist/evidence` | `AssistServiceEvidence` |
| ASST-F011 | Payment/entitlement | `care/payments/assist` | `AssistCharge` |
| ASST-F012 | Failed assistance fallback | `assist/rce` | `AssistFailure` |
| ASST-F013 | Damage/claim | `claims/rce` | `AssistClaim` |
| ASST-F014 | Partner SLA/quality | `provider-quality/assist` | `AssistPartnerQuality` |
| ASST-F015 | Degraded communications | `assist/notifications` | `AssistCommsState` |
| ASST-F016 | Vehicle Hub incident history | `vehicle-hub` | `IncidentHistoryEntry` |

## Material module-specific eventualities

- no coverage
- no provider accepts
- unsafe waiting location
- collision/medical emergency
- location inaccurate/unavailable
- poor connectivity
- provider cancels/no-show
- ETA breach
- wrong tow capability
- vehicle inaccessible
- customer unreachable
- entitlement uncertain
- payment unavailable
- tow damage
- failed repair
- repeat incident
- partner compliance expires
- maps outage
- incident beyond DIAL capability
- privacy vs legal hold

These extend the global Eventuality Standard and become concrete EV rows in implementation.

## Donor classification

Reuse DIAL Delivery dispatch/maps; AWS Last Mile Hyperlocal algorithm port where applicable; roadside/towing systems behavioral reference only until separately qualified.

## Mandatory weave

Identity/Party; Evidence/Audit; RCE/Claims; Money/Ledger/Tax where applicable; Customer360/Engagement where applicable; Delivery where fulfilment applies; Command Centre manifest/metrics/alerts/controls; Development evidence and gates.

## Software-complete rule

A feature is complete only when its FRC, state transitions, API/commands/queries, data, events, permissions/RLS, applicable eventuality tests, degraded behavior, UI states, Command Centre registration and evidence are implemented and verified.
