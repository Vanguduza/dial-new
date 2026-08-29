# Dial Laundry — Final Feature & Eventuality Audit

**Planning status:** GREEN for repository FRC generation.  
**Implementation status:** must be proven feature-by-feature from code/evidence.

## Feature → software map

| Feature ID | Usable capability | Canonical domain/package owner | Primary aggregate |
|---|---|---|---|
| LAUN-F001 | Service catalogue & exclusions | `laundry/catalogue` | `LaundryService` |
| LAUN-F002 | Booking / estimate / max approval | `laundry/orders/pricing` | `LaundryOrder` |
| LAUN-F003 | Pickup custody | `delivery/laundry-custody` | `CustodyHandoff` |
| LAUN-F004 | Facility check-in | `laundry/facility` | `FacilityIntake` |
| LAUN-F005 | Weigh/itemize/inspect | `laundry/intake` | `ItemizedLoad` |
| LAUN-F006 | Care label/risk/reclassification | `laundry/garments` | `GarmentAssessment` |
| LAUN-F007 | Final price approval | `laundry/pricing/payments` | `LaundryPriceFinal` |
| LAUN-F008 | Sort/load planning | `laundry/production` | `ProductionLoad` |
| LAUN-F009 | Machine/process execution | `laundry/production` | `ProductionRun` |
| LAUN-F010 | QC / rewash | `laundry/quality` | `LaundryQC` |
| LAUN-F011 | Assembly/rack/ready | `laundry/facility` | `RackAssembly` |
| LAUN-F012 | Return delivery custody | `delivery/laundry-custody` | `ReturnHandoff` |
| LAUN-F013 | Damage/missing/claim | `claims/rce` | `LaundryClaim` |
| LAUN-F014 | Subscriptions | `laundry/commercial` | `LaundryPlan` |
| LAUN-F015 | Commercial manifests/contracts | `laundry/b2b` | `CommercialManifest` |
| LAUN-F016 | Healthcare segregation | `laundry/healthcare` | `HealthcareLaundryBatch` |
| LAUN-F017 | Facility/machine capacity | `laundry/capacity` | `FacilityCapacity` |
| LAUN-F018 | Environmental/compliance | `compliance/laundry` | `LaundryCompliance` |

## Material module-specific eventualities

- pickup bag/count mismatch
- seal broken
- facility rejects order
- garment misclassified
- care label missing
- price change unapproved
- pre-existing stain dispute
- machine fails mid-cycle
- utility outage
- capacity overload
- facility closes
- garment lost/damaged/shrunk/color bleed
- QC fails/rewash
- rack mismatch
- return courier failure
- customer unavailable
- claim evidence conflict
- commercial manifest mismatch
- healthcare contamination/segregation breach
- effluent/compliance expiry
- duplicate custody scan

These extend the global Eventuality Standard and become concrete EV rows in implementation.

## Donor classification

Laundryheap/Rinse behavioral and UX references; CleanCloud/Cents operator workflow references; ISO 3758/CDC/EMA/consumer law conformance; no donor runtime authority.

## Mandatory weave

Identity/Party; Evidence/Audit; RCE/Claims; Money/Ledger/Tax where applicable; Customer360/Engagement where applicable; Delivery where fulfilment applies; Command Centre manifest/metrics/alerts/controls; Development evidence and gates.

## Software-complete rule

A feature is complete only when its FRC, state transitions, API/commands/queries, data, events, permissions/RLS, applicable eventuality tests, degraded behavior, UI states, Command Centre registration and evidence are implemented and verified.
