# Dial Fleet — Final Feature & Eventuality Audit

**Planning status:** GREEN for repository FRC generation.  
**Implementation status:** must be proven feature-by-feature from code/evidence.

## Feature → software map

| Feature ID | Usable capability | Canonical domain/package owner | Primary aggregate |
|---|---|---|---|
| FLEET-F001 | Organisation/fleet hierarchy | `fleet` | `Fleet` |
| FLEET-F002 | Vehicle registry linkage | `fleet/vehicle-hub` | `FleetVehicle` |
| FLEET-F003 | Driver/custodian assignments | `fleet` | `VehicleAssignment` |
| FLEET-F004 | Odometer/usage capture | `fleet/vehicle-hub` | `UsageReading` |
| FLEET-F005 | Maintenance schedules | `fleet/maintenance` | `MaintenancePlan` |
| FLEET-F006 | Defect reporting | `fleet/defects` | `Defect` |
| FLEET-F007 | Service/job orchestration | `fleet/jobs` | `FleetWorkOrder` |
| FLEET-F008 | Parts/order orchestration | `fleet/spare` | `FleetPartDemand` |
| FLEET-F009 | Inspections | `fleet/compliance` | `VehicleInspection` |
| FLEET-F010 | Licence/insurance/permit expiry | `vehicle-hub/compliance` | `VehicleDocument` |
| FLEET-F011 | Downtime & availability | `fleet` | `VehicleAvailability` |
| FLEET-F012 | Spend/TCO/cost centres | `fleet/finance` | `FleetCost` |
| FLEET-F013 | Supplier/tech performance | `provider-quality/fleet` | `FleetProviderScore` |
| FLEET-F014 | Optional telematics | `fleet/telemetry` | `TelemetryObservation` |
| FLEET-F015 | B2B reports/controls | `fleet` | `FleetReport` |

## Material module-specific eventualities

- duplicate vehicle/VIN
- vehicle transfers org/site
- odometer rollback/error
- time vs mileage due conflict
- safety-critical defect
- vehicle unavailable after booking
- parts delay
- technician no-show
- inspection failure
- expired docs
- vehicle sold/scrapped
- assignment overlap
- ambiguous cost attribution
- telemetry stale/spoofed/offline
- accident/Assist incident
- repeat repair
- downtime SLA breach
- telematics provider outage
- historical correction

These extend the global Eventuality Standard and become concrete EV rows in implementation.

## Donor classification

LubeLogger (MIT) schema/workflow/UX reference; Tracktor UX/reference; OpenRemote Fleet candidate INTEGRATE-SERVICE for telematics observations only.

## Mandatory weave

Identity/Party; Evidence/Audit; RCE/Claims; Money/Ledger/Tax where applicable; Customer360/Engagement where applicable; Delivery where fulfilment applies; Command Centre manifest/metrics/alerts/controls; Development evidence and gates.

## Software-complete rule

A feature is complete only when its FRC, state transitions, API/commands/queries, data, events, permissions/RLS, applicable eventuality tests, degraded behavior, UI states, Command Centre registration and evidence are implemented and verified.
