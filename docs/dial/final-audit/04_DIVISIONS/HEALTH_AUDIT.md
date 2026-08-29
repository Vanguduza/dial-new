# Dial Health / ZHOTN — Standalone Division Feature & Eventuality Audit

**Division status:** REQUIRED STANDALONE DIAL DIVISION  
**Authoritative specialist architecture:** existing Dial Health/ZHOTN v4.x engineering master  
**Relationship to DIAL:** peer business division consuming selected shared DIAL capabilities through explicit contracts.

## Top-level feature → software map

This index does not replace the much deeper health engineering master. It gives Main DIAL a stable registry/Command Centre bridge into that specialist architecture.

| Feature ID | Division capability | Canonical health owner | Representative aggregate |
|---|---|---|---|
| HEALTH-F001 | My Health patient/family consumer hub | `health/my-health` | `PatientAccount` |
| HEALTH-F002 | Practice OS | `health/practice-os` | `Practice` |
| HEALTH-F003 | Pharmacy OS | `health/pharmacy-os` | `Pharmacy` |
| HEALTH-F004 | Hospital OS | `health/hospital-os` | `Facility` |
| HEALTH-F005 | Healthcare Transaction Network | `health/transaction-network` | `HealthTransaction` |
| HEALTH-F006 | Pharma Cloud / supply network | `health/pharma-cloud` | `PharmaSupplyRecord` |
| HEALTH-F007 | Emergency Network | `health/emergency-network` | `HealthEmergencyIncident` |
| HEALTH-F008 | Communication Gateway | `health/communications` | `HealthChannelSession` |
| HEALTH-F009 | Developer Platform / integration APIs | `health/developer-platform` | `HealthIntegration` |
| HEALTH-F010 | Patient identity, consent & delegation | `health/identity-consent` | `HealthIdentity` |
| HEALTH-F011 | Clinical/interoperability record exchange | `health/interoperability` | `ClinicalExchange` |
| HEALTH-F012 | Prescription lifecycle | `health/prescriptions` | `Prescription` |
| HEALTH-F013 | Medicine catalogue/availability/dispensing | `health/medicines` | `MedicineFulfilment` |
| HEALTH-F014 | Medical-aid / claims transaction handling | `health/claims-network` | `HealthClaim` |
| HEALTH-F015 | Appointments/referrals/queueing | `health/care-coordination` | `CareEncounter` |
| HEALTH-F016 | Medicine delivery integration | `health/delivery` | `MedicineDelivery` |
| HEALTH-F017 | Clinical/pharmacy safety, compliance & audit | `health/safety-compliance` | `HealthSafetyCase` |
| HEALTH-F018 | Dial Health Command Centre & certification | `health/command-centre` | `HealthDivisionState` |

## Health-specific eventuality classes

In addition to the DIAL global eventuality standard, Health must explicitly cover:

- patient/guardian/delegated-agent identity ambiguity;
- consent scope/revocation;
- clinical data provenance/conflict;
- prescription validity, expiry, cancellation and duplicate dispensing;
- medicine availability, batch, expiry, substitution and recall;
- pharmacist/prescriber/provider credential expiry;
- medical-aid eligibility/claim denial/reversal;
- emergency coverage gaps and responder unavailability;
- health-service outage with safe fallback;
- medication/delivery cold-chain or custody where applicable;
- patient communication/language/accessibility failure;
- privacy, retention, break-glass access and full break-glass review;
- clinical/pharmacy safety incident and CAPA;
- regulatory integration outage;
- interoperability version/schema mismatch;
- external provider becomes unavailable mid-journey;
- health-specific business continuity and disaster recovery.

## Donor strategy

Dial Health keeps its existing **QDRS reference-reimplementation / conformance / retained commodity infrastructure** doctrine. Donors never become hidden healthcare-domain authorities.

## Shared DIAL contracts

Potentially shared:
- Party/Identity primitives;
- Money/Payments/Ledger rails;
- Procurement/Inventory primitives;
- Delivery;
- Communications;
- Evidence/Audit;
- Infrastructure/Observability;
- Command Centre development telemetry.

Shared use is through versioned anti-corruption contracts. Health data/safety/clinical authorities remain health-owned.

## Command Centre requirement

Dial Health is included in `requiredControlRooms` as a division room, with specialized subrooms/sections for:
patient/customer, provider/facility, pharmacy/medicine, transactions/claims, emergency, safety/compliance, money, development, infrastructure, AI, audit and controls.

## Certification

A health feature may not inherit ordinary Main DIAL readiness where health-specific safety, clinical, pharmacy, funder or regulatory certification is required.
