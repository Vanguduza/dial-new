# Vehicle Hub — Final Feature & Eventuality Audit

**Planning status:** GREEN for repository FRC generation.  
**Implementation status:** must be proven feature-by-feature from code/evidence.

## Feature → software map

| Feature ID | Usable capability | Canonical domain/package owner | Primary aggregate |
|---|---|---|---|
| VHUB-F001 | Vehicle canonical identity | `vehicle-hub` | `Vehicle` |
| VHUB-F002 | VIN/chassis/model facts | `vehicle-hub` | `VehicleIdentityClaim` |
| VHUB-F003 | Ownership/organisation relationship | `vehicle-hub/party` | `VehicleRelationship` |
| VHUB-F004 | Registration/licence/insurance docs | `vehicle-hub/records` | `VehicleDocument` |
| VHUB-F005 | Mileage history | `vehicle-hub` | `MileageReading` |
| VHUB-F006 | Service history | `vehicle-hub` | `ServiceHistoryEntry` |
| VHUB-F007 | Spare/order history | `vehicle-hub` | `PartHistoryEntry` |
| VHUB-F008 | Assist/incident history | `vehicle-hub` | `IncidentHistoryEntry` |
| VHUB-F009 | Maintenance reminders | `vehicle-hub/engagement` | `VehicleReminder` |
| VHUB-F010 | Document expiry reminders | `vehicle-hub/engagement` | `ExpiryReminder` |
| VHUB-F011 | Care eligibility | `care/vehicle-hub` | `EligibilityAssessment` |
| VHUB-F012 | Record conflict/merge | `vehicle-hub/rce` | `VehicleConflict` |
| VHUB-F013 | Vehicle sharing/delegation | `vehicle-hub/identity` | `VehicleAccessGrant` |
| VHUB-F014 | Export/history package | `vehicle-hub/records` | `VehicleHistoryPackage` |

## Material module-specific eventualities

- duplicate VIN/chassis
- grey-import identity uncertainty
- plate change
- ownership transfer
- shared/fleet vehicle
- document conflict/expiry
- odometer rollback
- service entry disputed
- wrong part/job linked
- vehicle sold/scrapped/stolen
- account deletion vs legal history
- wrong merge
- eligibility changes
- partner unavailable
- stale reminder
- access revoked

These extend the global Eventuality Standard and become concrete EV rows in implementation.

## Donor classification

LubeLogger and ServiceMyRide reference/selected schema-workflow for service history, reminders, documents and mileage; DIAL vehicle/fitment authority remains canonical.

## Mandatory weave

Identity/Party; Evidence/Audit; RCE/Claims; Money/Ledger/Tax where applicable; Customer360/Engagement where applicable; Delivery where fulfilment applies; Command Centre manifest/metrics/alerts/controls; Development evidence and gates.

## Software-complete rule

A feature is complete only when its FRC, state transitions, API/commands/queries, data, events, permissions/RLS, applicable eventuality tests, degraded behavior, UI states, Command Centre registration and evidence are implemented and verified.
