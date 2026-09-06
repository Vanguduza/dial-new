# Dial Health / ZHOTN — Standalone Division Feature & Eventuality Audit

**Division status:** REQUIRED STANDALONE DIAL DIVISION  
**Authoritative specialist architecture:** `Dial_Health_ZHOTN_v6.1_Singular_Source_of_Truth_Master.md`  
**Authority date:** 6 September 2026  
**Relationship to DIAL:** peer business division consuming selected shared DIAL capabilities through explicit contracts.  
**Claims closure status:** `HEALTH-F014` now includes the incorporated Claims Control Centre / Real-Time Financial Clearance / Shortfall Prevention / Policy Studio / Sovereign AI closure from the former Rev 3 claims architecture. The former standalone claims document is provenance only; it is not an independent source of truth.

## Source-of-truth lock

Dial Health/ZHOTN has its own singular specialist source of truth. Main DIAL must not reconstruct Health product or claims behavior from this compact bridge alone.

For Health work the authority order is:

1. `Dial_Health_ZHOTN_v6.1_Singular_Source_of_Truth_Master.md`;
2. machine registries generated from that master;
3. this `HEALTH_AUDIT.md` bridge for Main-DIAL feature discovery;
4. older Health masters/closure packs only as historical research evidence.

A standalone feature paper, research note, UI board, donor document or claims addendum must never silently become a competing Health source of truth.

## Top-level feature → software map

This index does not replace the deeper Health singular master. It gives Main DIAL a stable registry/Command Centre bridge into that specialist architecture.

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
| HEALTH-F014 | Medical-aid / claims / real-time financial clearance / shortfall / adjudication / funder operations | `health/claims-network` | `HealthClaim` |
| HEALTH-F015 | Appointments/referrals/queueing | `health/care-coordination` | `CareEncounter` |
| HEALTH-F016 | Medicine delivery integration | `health/delivery` | `MedicineDelivery` |
| HEALTH-F017 | Clinical/pharmacy/claims safety, compliance & audit | `health/safety-compliance` | `HealthSafetyCase` |
| HEALTH-F018 | Dial Health Command Centre & certification | `health/command-centre` | `HealthDivisionState` |

## HEALTH-F014 — canonical claims-control expansion

`HEALTH-F014` is the parent feature family for the v6.1 Claims Control Centre closure. It is no longer satisfied by generic claim submission/status screens.

The v6.1 singular master contains **330 atomic claims-control features mapped to 113 canonical page IDs with zero orphan pages**. `MAPPED / SPEC-COMPLETE` is a specification state only; repository implementation must still advance through implementation/test/evidence gates.

### Required claims subdomains

| Subdomain | Canonical responsibility |
|---|---|
| Member / Eligibility | digital/member identity, dependant resolution, active coverage, waiting periods, exclusions, multiple coverage discovery |
| Provider / Site | provider identity, site eligibility, network status, contract, speciality/service privileges, effective-dated status |
| Financial Clearance | pre-service coverage/cost transaction, provider quote, expected payer share, expected member share, estimate confidence/validity |
| Shortfall | decomposed shortfall causes, preventability, lower-shortfall alternatives, estimate-vs-final accuracy, residual collection |
| Claim Preflight | schema, identity, provider, coding, authorization, evidence, dates, duplicate, tariff and claim-line validation before adjudication |
| Authorization | synchronous/deferred PA, advanced payer-initiated authorization, standing/episode auth, emergency retrospective review, benefit reservations |
| Coding & Validation | jurisdiction-aware code systems, diagnosis/procedure/provider rules, bundling/unbundling, quantity and evidence rules |
| Tariffs | reference/contract tariffs, modifiers, effective dates, currencies/FX, immutable pricing snapshots |
| Benefits | benefit mapping, individual/family/global/sub-limits, frequency, percentage cover, copay/deductible, reservations |
| Claims | draft, submit, normalize, version, line adjudication, synchronous/deferred decisions, approve/partial/decline/reject/need-info/escalate/hold/correct/reverse/reprocess |
| Policy Studio | Quick/Guided/Expert builders, presets, broad filters, canonical DSL, test cases, simulation, shadow, canary, maker-checker, lifecycle |
| Conflict / Legal Gate | authority tiers, precedence, explicit conflict resolution, automation ceilings, jurisdiction-specific automated-decision gate |
| Human Review | skills/authority/SLA routing, work inventory, load balancing, reviewer workspace, override/rework controls |
| Integrity | duplicates, upcoding, unbundling, utilization/provider anomalies, investigation cases; risk signals do not equal proven fraud |
| Transaction Fabric | synchronous/deferred exchange, durable queue, store-and-forward, webhook, status, polling, idempotency, retry, cancel/nullify, batch, DLQ |
| Funding / COB | primary/secondary/gap/employer/savings ordered funding, patient residual, tokenized mandates |
| Payment / Remittance | payment instructions, failures, refunds/reversals, remittance, settlement, reconciliation, multi-currency |
| Appeals | submit, evidence, route, review, uphold/overturn, notify, analytics |
| Analytics | claims, provider, package, employer, shortfall, preflight, policy, workload, estimate accuracy, automation opportunities |
| Hermes / AI Privacy | local Hermes, reviewer summaries, policy drafting assistance, task minimization, PII/PHI filtering, rarity checks, privacy capsules, fail-closed egress |
| Regulatory / Security | jurisdiction profiles, RBAC/ABAC/authority, field privacy, access audit, retention, breach, emergency and evidence controls |

### Claims implementation non-negotiables

- Claims originate from rendered-service evidence; eligibility, financial clearance or authorization never prove that care occurred.
- Funder benefit/adjudication truth remains with the funder unless Dial Health is explicitly contracted to operate that funder platform.
- Real-time and deferred adjudication are both first-class protocols.
- Technical rejection, contractual decline, need-information, hold and human escalation are distinct states.
- A payer/dependency outage never becomes a false decline or false zero shortfall.
- Every claim, claim line, financial clearance, authorization, transaction, payment, remittance, settlement, appeal, policy and integrity case has a durable identifier and dedicated drill-through surface where required.
- Every automated decision must preserve exact coverage/benefit/tariff/policy/configuration versions used.
- Policy conflicts fail to explicit conflict handling/human routing rather than arbitrary rule order.
- Auto-decline is more constrained than auto-approval and is subject to legal/jurisdiction gates.
- Payment failure does not rewrite correct claim adjudication truth.
- Hermes/AI is advisory/intelligence infrastructure; deterministic domain services and qualified humans retain claims/clinical/money authority.
- Enterprise AI uses local Hermes and a fail-closed privacy firewall by default; personal/health information is minimized, redacted/tokenized/aggregated locally before any explicitly permitted external-model call.

## Claims page / screen audit requirement

The v6.1 claims catalogue is implementation authority for the Health screen factory and feature audit. It covers Funder/Claims, Provider, Member, Employer and Enterprise Admin surfaces.

Every claims page must be auditable in both directions:

`documented feature → page → component/action → API → service → data → event → permission/privacy → failure/recovery → acceptance evidence`

and:

`page → all atomic features expected on that page`.

A page cannot be marked green because the route exists. Page coverage is:

`implemented mapped atomic features / required mapped atomic features`.

It is green only at 100% unless the remainder is explicitly evidenced `BLOCKED_INFRA` or `BLOCKED_POLICY`.

## Health-specific eventuality classes

In addition to the DIAL global eventuality standard, Health must explicitly cover:

- patient/guardian/delegated-agent identity ambiguity;
- consent scope/revocation;
- clinical data provenance/conflict;
- prescription validity, expiry, cancellation and duplicate dispensing;
- medicine availability, batch, expiry, substitution and recall;
- pharmacist/prescriber/provider credential expiry;
- medical-aid eligibility, coverage uncertainty, shortfall change, claim rejection/decline/need-information/reversal/appeal;
- payer/funder outage during financial clearance, authorization, claim, remittance or reconciliation;
- policy conflict, effective-date conflict and regulatory automation restriction;
- funding-stack/coordination-of-benefits partial or out-of-order response;
- duplicate/retried/late claim, authorization, callback, webhook or payment transaction;
- emergency coverage gaps and responder unavailability;
- health-service outage with safe fallback;
- medication/delivery cold-chain or custody where applicable;
- patient communication/language/accessibility failure;
- privacy, retention, break-glass access and full break-glass review;
- AI privacy/DLP/model-routing failure with fail-closed external egress;
- clinical/pharmacy/claims safety incident and CAPA;
- regulatory integration outage;
- interoperability version/schema mismatch;
- external provider becomes unavailable mid-journey;
- health-specific business continuity and disaster recovery.

## Donor strategy

Dial Health keeps its existing **QDRS reference-reimplementation / conformance / retained commodity infrastructure** doctrine. Donors never become hidden healthcare-domain authorities.

International claims systems may inform protocols, operational mechanics and test scenarios, but their market-specific bank, terminal, national-switch, clearinghouse or payer-core business models do not automatically become Dial Health architecture.

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

Shared use is through versioned anti-corruption contracts. Health data, clinical safety, funder policy, claim adjudication, health privacy and healthcare transaction authorities remain Health-owned.

## Command Centre requirement

Dial Health is included in `requiredControlRooms` as a division room, with specialized subrooms/sections for:
patient/customer, provider/facility, pharmacy/medicine, **claims/financial-clearance/policy/review/shortfall/funder transactions**, emergency, safety/compliance, money, development, infrastructure, AI/privacy, audit and controls.

## Certification

A Health feature may not inherit ordinary Main DIAL readiness where health-specific safety, clinical, pharmacy, funder, claims, money, privacy or regulatory certification is required.

For `HEALTH-F014`, certification must additionally prove:

- claim preflight correctness;
- deterministic calculation reproducibility;
- real-time/deferred transaction resilience;
- idempotency and duplicate safety;
- coverage/benefit/tariff snapshot replay;
- policy simulation/shadow/canary behavior;
- human authority routing;
- shortfall estimate accuracy controls;
- payment/remittance/reconciliation closure;
- privacy-safe Hermes operation and blocked unsafe egress;
- page-to-feature and feature-to-page coverage at the required gate.
