# Dial Care — Final Feature & Eventuality Audit

**Planning status:** GREEN for repository FRC generation.  
**Implementation status:** must be proven feature-by-feature from code/evidence.

## Feature → software map

| Feature ID | Usable capability | Canonical domain/package owner | Primary aggregate |
|---|---|---|---|
| CARE-F001 | Plan catalogue/versioning | `care` | `CarePlan` |
| CARE-F002 | Vehicle/customer eligibility | `care` | `CareEligibility` |
| CARE-F003 | Membership/subscription | `care` | `CareMembership` |
| CARE-F004 | Recurring payment mandate | `payments/care` | `CareBillingAgreement` |
| CARE-F005 | Entitlement ledger | `care` | `Entitlement` |
| CARE-F006 | Maintenance reminders | `engagement/care` | `CareReminder` |
| CARE-F007 | Tech benefit invocation | `care/jobs` | `BenefitUse` |
| CARE-F008 | Assist benefit invocation | `care/assist` | `AssistEntitlementUse` |
| CARE-F009 | Spare discount/benefit | `care/pricing` | `CarePricingBenefit` |
| CARE-F010 | Grace/retry/suspension | `care/payments` | `MembershipBillingState` |
| CARE-F011 | Renewal/cancellation | `care` | `CareMembership` |
| CARE-F012 | Abuse/limit controls | `trust/care` | `BenefitAbuseCase` |
| CARE-F013 | Benefit economics/contribution | `care/finance` | `CareEconomicsProjection` |
| CARE-F014 | Partner benefits | `partners/care` | `PartnerBenefit` |

## Material module-specific eventualities

- ineligible vehicle/customer
- plan changes after purchase
- payment fails/retries
- mandate revoked
- entitlement already consumed
- limit reached
- grace at incident time
- cancelled mid-job
- provider unavailable
- entitlement dispute
- abuse/overuse
- vehicle sold/changed
- delegated user benefit
- chargeback after use
- partner benefit unavailable
- renewal price change
- outage during validation

These extend the global Eventuality Standard and become concrete EV rows in implementation.

## Donor classification

DIAL-native reference-led build. PostHog retention analytics; selected mature subscription/entitlement concepts may be schema references, but no external subscription SoR.

## Mandatory weave

Identity/Party; Evidence/Audit; RCE/Claims; Money/Ledger/Tax where applicable; Customer360/Engagement where applicable; Delivery where fulfilment applies; Command Centre manifest/metrics/alerts/controls; Development evidence and gates.

## Software-complete rule

A feature is complete only when its FRC, state transitions, API/commands/queries, data, events, permissions/RLS, applicable eventuality tests, degraded behavior, UI states, Command Centre registration and evidence are implemented and verified.
