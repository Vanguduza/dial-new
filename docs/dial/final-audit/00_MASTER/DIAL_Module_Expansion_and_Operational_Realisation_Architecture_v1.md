# DIAL MODULE EXPANSION & OPERATIONAL REALISATION ARCHITECTURE

**Version:** 1.0  
**Date:** 30 August 2026  
**Status:** Canon-extension design package; implementation IDs must be allocated through the canonical DIAL feature registries before coding.  
**Purpose:** Expand DIAL modules that are already named or partially specified into production-usable operating systems at DIAL research, planning, technical-depth, failure-coverage, donor-assimilation and feature-realisation standards.

---

## 0. Authority, scope and non-negotiable locks

This document extends, and does not replace, the current DIAL authority stack:

1. `DIAL_Master_Product_Technical_Delivery_Architecture_vNext3.md`
2. `DIAL_MASTER_DEVELOPMENT_PLAN_AND_PROMPT_v1_6.md`
3. `DIAL_V2_IMPLEMENTATION_CLOSURE_CANON.md`
4. `FEATURE_REGISTRY.json`
5. `FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json`
6. `FEATURE_REALIZATION_MATRIX.md`
7. `DIAL_Business_Operating_Kernel_Strengthening_Architecture_v1.md`
8. `DIAL_COMMAND_CENTRE_360_CONTROL_ROOM_ARCHITECTURE_v1.md`
9. existing specialist division masters, especially Dial Health/ZHOTN.

Where this document adds detail without contradiction, the detail is additive. Where a later founder decision explicitly contradicts an older document, the later founder decision wins and must be recorded in the D-log/canon when merged.

### 0.1 Founder decisions already locked by the latest expansion work

The following decisions are treated as settled inputs:

- DIAL uses **one shared Communication Fabric** across business units.
- Customer communication channels are **System Inbox, official WhatsApp Cloud API/Flows, email, and Econet Enterprise/A2P SMS**.
- **Telerivet is removed from the target architecture.**
- Resend remains the preferred transactional-email adapter; Brevo remains the CRM/marketing-email candidate unless a later decision changes this.
- DIAL uses **one shared Logistics OS and one delivery application** across all delivery-enabled business units.
- Every delivery-enabled business unit has a **Logistics Manager/Handler** and business-unit logistics operating view.
- Drivers have a permanent/home business-unit employment assignment but may receive **temporary operational deployments** to another business unit.
- Logistics includes automatic preparation-task generation, preparation assignment, driver queue management, automatic delivery-job assignment, route optimisation, proof of delivery, COD handling, live internal maps and customer-facing real-time tracking.
- Customer live tracking is exposed only through a **customer-safe delivery projection**; other customers' identities, addresses and order details are never exposed.
- Recruitment is centrally governed from Command Centre.
- Employee onboarding includes business-unit/position assignment, employee number, professional company ID, secure account provisioning and role/permission assignment.
- Payroll is centrally governed but funded/accounted at the applicable business-unit level, with immutable payslip publication to employee self-service.
- Every business unit retains channel-specific finance journals plus an appropriate real treasury/master funding account; read-only combined projections must never be confused with spendable money.
- DIAL a Spare and DIAL Groceries use hybrid delivery pricing based on route burden and physical/handling characteristics rather than basket value as a transport proxy.
- Dial a Spare web/mobile includes a legally cleared, data-driven **car-make infinity carousel** sourced from the canonical VehicleMake catalogue.
- DIAL remains the system of record for identity, catalogue truth, fitment decisions, jobs, orders, delivery, money, tax, evidence, permissions, quality state and compliance state.

### 0.2 DIAL realisation standard

Every material software capability must become a Feature Realization Contract (FRC), not descriptive prose. At minimum, implementation planning must materially complete:

```yaml
feature_id:
name:
branch:
outcome:
actors:
permissions:
entry_points:
screens:
screen_states:
commands:
queries:
domain_owner:
entities:
state_machine:
business_rules:
pricing_or_money_rules:
api_contracts:
events:
long_running_workflows:
external_adapters:
admin_controls:
audit_events:
analytics_metrics:
notifications:
offline_behavior:
failure_behavior:
security_requirements:
donor_or_tool_sources:
frontend_reference:
acceptance_tests:
visual_acceptance:
current_gate:
evidence_refs:
```

No feature may be marked complete because a screen exists, TypeScript compiles, or one happy-path demo works.

### 0.3 Expansion work-package identifiers

This document uses `EXP-*` identifiers only as **planning work-package IDs**. They are not permanent DIAL Feature IDs. Before coding, the registry allocator must either:

1. map the work package into one or more existing Feature IDs; or
2. allocate new canonical Feature IDs and update:
   - `FEATURE_REGISTRY.json`;
   - `FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json`;
   - `FEATURE_REALIZATION_MATRIX.md`;
   - eventuality registry;
   - permission matrix;
   - route/surface registry;
   - donor/provenance registry;
   - evidence registry.

No engineer may invent an unregistered production Feature ID inside application code.

---

# 1. Why expansion is needed

DIAL already has unusually broad product coverage. The remaining risk is **shallow completeness**: a module may be named in the master plan but still lack the operator roles, work queues, automated assignments, authoritative aggregates, failure recovery, cross-business rules, economic treatment, admin controls, metrics and acceptance evidence necessary to operate it as real company software.

The goal of this programme is therefore:

> **Convert named modules into operator-ready systems that can run a real DIAL business day, survive exceptions, reconcile money and evidence, and expose deterministic commands rather than generic status fields.**

The highest-value gaps are horizontal: they affect several businesses simultaneously.

---

# 2. Expansion priority matrix

| Priority | Work package | Why now | Core dependency unlocked |
|---|---|---|---|
| P0 | EXP-CAT — Catalogue Factory & Fitment OS | Spare cannot be trusted without authoritative product/fitment truth | Spare, Vehicle Hub, Supplier OS, Search |
| P0 | EXP-ORD — Order & Fulfilment Orchestrator | Logistics now needs a deterministic upstream readiness engine | Spare, Groceries, Laundry, Health delivery |
| P0 | EXP-C360 — Customer 360 / Relationship / CRM | DIAL otherwise fragments one customer across businesses | CRM, support, loyalty, B2B, Care |
| P0 | EXP-SUP — Supplier OS | Marketplace quality depends on stock, confirmations and supplier operations | Spare, Grocery, procurement |
| P0 | EXP-RCE — Resolution / Claims / Guarantee / Trust | Every business has different failure modes but needs one remedy engine | Returns, warranty, rework, claims |
| P0 | EXP-TREAS — Treasury / FP&A / BU economics | Payroll and multi-BU operations require funding truth | Payroll, settlements, claims, growth |
| P1 | EXP-QUAL — Provider Quality OS + CAPA | DIAL must improve providers, not only rank or ban them | Tech, Supplier, Delivery, Laundry, Assist |
| P1 | EXP-NET — Network Capacity / Liquidity | DIAL must know whether it can promise service before accepting demand | Dispatch, branch activation, SLA |
| P1 | EXP-ACT — Branch/Zone Activation OS | Broad build needs precise commercial activation control | Launch, compliance, supply gating |
| P1 | EXP-B2B — DIAL Business Core | Enterprise customers need approvals, budgets and consolidated billing | Fleet, Projects, Spare, Tech, Laundry |
| P1 | EXP-TECH — Technician OS + Academy | Existing job features need deeper workforce operations | Tech quality, safety, scheduling |
| P1 | EXP-WMS — Procurement / Internal WMS / Assets | DIAL itself will operate stock, equipment and facilities | Logistics, corporate ops, projects |
| P1 | EXP-CARE — Subscription / Entitlement OS | Boolean membership logic will fail under real recurring plans | Care, Assist, Tech, Spare |
| P1 | EXP-ASST — Assist Control Room | Roadside response has higher real-time and safety requirements | Assist, Vehicle Hub, Care |
| P1 | EXP-PROJ — Projects OS | Larger jobs need WBS, progress valuation and controlled variations | B2B, Tech, Spare, Procurement |
| P2 | EXP-ENG — Engagement / Loyalty / Promotions | Communications now provides the transport foundation | CRM, repeat rate, cross-BU adoption |
| P2 | EXP-SUPP — Support OS | Support must see transaction truth rather than ask customers to repeat it | RCE, CRM, quality |
| P2 | EXP-COMP — Compliance / Partner / Continuity OS | External-provider dependence must be governed and recoverable | All divisions |
| P2 | EXP-FLEET — Fleet & Vehicle Operations expansion | Fleet is a B2B retention engine and logistics dependency | Delivery, Vehicle Hub, B2B |
| P2 | EXP-PRC — Pricing & Commercial Policy expansion | Multi-BU economics requires explainable deterministic pricing | All commerce/service branches |

Dial Health/ZHOTN is **not** generically re-specified here. It keeps its specialist master and receives only explicit shared-platform bridges.

---

# 3. Cross-cutting architecture for all expansions

## 3.1 Shared operating-system rule

When two divisions require the same horizontal capability, extend the shared capability rather than building another branch-specific system.

Examples:

```text
Spare return
Groceries issue
Laundry damage
Tech workmanship
Assist tow damage
Projects dispute
        ↓
branch-specific intake/evidence policy
        ↓
shared Resolution & Conflict Engine
        ↓
branch-specific remedy policy
        ↓
Money / replacement / rework / CAPA
```

The same pattern applies to:

- customer identity;
- supplier/provider relationship;
- delivery;
- notifications;
- evidence;
- payments;
- ledger;
- quality;
- claims;
- procurement;
- compliance;
- analytics.

## 3.2 State-transition rule

Every consequential state transition is a command:

```text
current state
+ actor
+ permission
+ policy
+ expected version
+ validation
→ event(s)
→ new state
→ audit
→ outbox
```

No generic `PATCH status = "approved"` endpoint may bypass domain commands.

## 3.3 Event and outbox rule

All cross-module reactions use durable domain events/outbox contracts.

Examples:

```text
OrderFulfilmentReady
SupplierConfirmationExpired
PreparationCompleted
CustomerRelationshipChanged
ProviderQualityStateChanged
GuaranteeClaimApproved
TreasuryLiquidityStateChanged
CapacityShortageDetected
BranchActivationChanged
ComplianceGateBlocked
```

Events are facts. They do not create a second writer for the originating aggregate.

## 3.4 Human-reference rule

Operators and customers use readable references such as:

- `ORD-...`
- `FUL-...`
- `DEL-...`
- `EMP-...`
- `SUP-...`
- `TECH-...`
- `CASE-...`
- `CLM-...`
- `PO-...`
- `PRJ-...`

UUIDs remain internal persistence keys.

## 3.5 Failure/degraded-state rule

Every operator surface requires:

- loading;
- empty;
- stale;
- partially available;
- permission denied;
- provider outage;
- offline where relevant;
- conflict;
- retryable failure;
- terminal failure;
- recovery action.

A dashboard that silently goes blank during provider failure is incomplete.

## 3.6 Money rule

- integer minor units;
- explicit currency;
- no floating-point money;
- no AI-generated binding payable amount;
- ledger is the only money SoR;
- business causes emit `AccountingEvent`;
- channel settlement and business fulfilment remain distinct;
- quote, payment, settlement, refund and payout are separate states.

## 3.7 Security classes

Suggested planning classes:

- **S1** — ordinary public/catalogue information;
- **S2** — authenticated customer/provider operational data;
- **S3** — sensitive finance, HR, precise location, claim/evidence, private provider data;
- **S4** — privileged/admin/security/legal/high-impact authority or health-specialist data.

Every FRC must declare data classification, retention, least privilege, audit, export controls and step-up authentication requirements where material.

---

# 4. EXP-CAT — Catalogue Factory & Fitment OS

## 4.1 Outcome

DIAL can ingest, normalize, validate, review, approve, publish, search and safely correct catalogue/fitment data while preserving provenance and preventing unverified external data from becoming catalogue truth.

## 4.2 Existing canon to extend

Existing features include fitment claims/confidence, supplier offers/stock, supplier portal, Catalogue Factory planning and Meilisearch projection. This package must extend those contracts rather than create a second product database.

## 4.3 Operators and roles

- Catalogue Director / Catalogue Manager
- Category Manager
- Fitment Reviewer
- Supplier Catalogue Operator
- Media/Asset Reviewer
- Data Quality Analyst
- Compliance Reviewer for restricted SKUs
- Command Centre read/exception roles

## 4.4 Core aggregates

```text
VehicleMake
VehicleModel
VehicleGeneration
VehicleVariant
EngineVariant
TransmissionVariant
PartMaster
PartBrand
PartAttributeSet
PartInterchange
PartSupersession
FitmentClaim
FitmentEvidence
SupplierProductMapping
CatalogueIngestBatch
CatalogueCandidate
CatalogueConflict
CataloguePublication
BrandAssetProvenance
RestrictedSkuRule
SearchDemandGap
```

## 4.5 Fitment authority

A fitment relationship is an evidence-weighted claim, not a free-text tag.

```text
FitmentClaim
- partMasterRef
- vehicleRef / vehicle selector
- fitment type
- source
- source version/date
- evidence ref
- confidence class
- reviewer
- review state
- effective period
- supersedes claim?
```

No LLM output may directly publish fitment.

## 4.6 Ingestion pipeline

```text
SOURCE
  ↓
quarantine
  ↓
schema/file/security validation
  ↓
normalisation
  ↓
vehicle/part identity resolution
  ↓
duplicate/interchange/conflict detection
  ↓
candidate creation
  ↓
automatic validation rules
  ↓
human review where required
  ↓
approval
  ↓
canonical catalogue write
  ↓
Meilisearch projection
  ↓
web/mobile/WhatsApp visibility
```

## 4.7 Commands

- `CreateCatalogueIngestBatch`
- `ValidateCatalogueIngestBatch`
- `NormalizeCatalogueIngestBatch`
- `ResolveCatalogueCandidate`
- `ApproveCatalogueCandidate`
- `RejectCatalogueCandidate`
- `CreateFitmentClaim`
- `VerifyFitmentClaim`
- `SupersedeFitmentClaim`
- `CreatePartInterchange`
- `ApprovePartInterchange`
- `MapSupplierProduct`
- `ApproveSupplierProductMapping`
- `QuarantineProduct`
- `PublishCatalogueVersion`
- `RollbackCataloguePublication`
- `ResolveCatalogueConflict`
- `CreateRestrictedSkuRule`

## 4.8 Queries

- product/part master;
- fitment by vehicle;
- vehicle applications by part;
- claim timeline;
- supplier mappings;
- unresolved conflicts;
- ingest quality;
- no-result demand gaps;
- restricted-SKU status;
- publication history;
- asset provenance.

## 4.9 API namespace

```text
/api/v1/catalogue/parts
/api/v1/catalogue/fitment-claims
/api/v1/catalogue/interchanges
/api/v1/catalogue/supplier-mappings
/api/v1/catalogue/ingest-batches
/api/v1/catalogue/conflicts
/api/v1/catalogue/publications
/api/v1/catalogue/restricted-sku-rules
/api/v1/catalogue/demand-gaps
```

All write actions use explicit `/commands/{command}` patterns or typed command endpoints.

## 4.10 Meilisearch boundary

Meilisearch is a rebuildable search projection only. It never becomes:

- fitment authority;
- stock authority;
- price authority;
- supplier authority;
- product approval authority.

## 4.11 Eventualities

At minimum:

- malformed import;
- duplicate part master;
- supplier maps to wrong canonical part;
- conflicting fitment claims;
- stale source version;
- OEM number collision;
- supersession cycle;
- interchange false positive;
- missing vehicle variant;
- asset without provenance;
- restricted SKU published accidentally;
- approved record fails search projection;
- Meili unavailable;
- publication partially fails;
- customer reports wrong fitment;
- supplier disputes mapping;
- product recalled/withdrawn;
- source licensing/provenance uncertain;
- batch reprocessed twice;
- AI candidate confidence high but evidence insufficient.

## 4.12 Donor/tool strategy

- **SandPIM** — REFERENCE / selective algorithm/schema port. MIT repository, useful for automotive Make-Model-Year/equipment fitment, digital assets, interchange and ACES/PIES-oriented concepts.
- **Akeneo PIM Community** — REFERENCE only unless legal/licence review approves another use; current community licence is OSL-3.0.
- **Pimcore** — REFERENCE only. Its current 2026 open-core licence imposes production/revenue and competing-product restrictions and should not be copied casually into DIAL.
- **Medusa Product/Commerce modules** — REFERENCE / selective MIT module logic for product/variant/price/fulfilment concepts, never catalogue SoR.
- **TableFlow** — ingestion UX/reference where licence and target integration remain compatible.
- **Meilisearch** — INTEGRATE-SERVICE projection.

## 4.13 Metrics

- ingest throughput;
- review SLA;
- fitment claim confidence distribution;
- unresolved conflicts;
- supplier mapping rejection rate;
- fitment-error complaint rate;
- no-result rate;
- demand-gap GMV estimate;
- search-to-cart conversion by catalogue completeness;
- stale-source count;
- restricted-SKU violations (target zero).

## 4.14 Acceptance gate

Catalogue cannot be feature-green until:

- import → approve → canonical record → Meili → customer search is proven;
- a rejected candidate never publishes;
- rollback does not destroy history;
- duplicate ingestion is idempotent;
- fitment conflict has deterministic review/recovery;
- customer-reported wrong fitment creates evidence and review work;
- restricted SKU policy can block listing/checkout;
- Meili can be rebuilt from canonical data;
- provenance is available for every consequential fitment assertion.

---

# 5. EXP-ORD — Order & Fulfilment Orchestrator

## 5.1 Outcome

Every order line has an explicit commercial, fulfilment and delivery state so multi-supplier, split, partial and exception-heavy orders can complete without hidden manual coordination.

## 5.2 Core aggregates

```text
Order
OrderLine
OrderGroup
SubOrder
FulfilmentPlan
FulfilmentLeg
FulfilmentReservation
SupplierFulfilment
PreparationTask
Shipment
CollectionInstruction
FulfilmentException
FulfilmentPromise
```

## 5.3 Separation of states

Never collapse these concepts:

```text
ORDER COMMERCIAL STATE
PAYMENT STATE
SUPPLIER CONFIRMATION STATE
FULFILMENT STATE
PREPARATION STATE
DELIVERY STATE
RETURN/CLAIM STATE
```

A paid order is not delivered. A delivered order is not necessarily claim-closed.

## 5.4 Canonical flow

```text
OrderPlaced
→ commercial validation
→ payment requirement satisfied / COD eligible
→ supplier/facility confirmation
→ reserve inventory/capacity
→ construct fulfilment plan
→ generate preparation tasks
→ preparation complete
→ create delivery/pickup legs
→ handoff
→ fulfilment complete
→ completion/settlement eligibility
```

## 5.5 Multi-supplier topology

Support:

- one supplier → one shipment;
- multiple suppliers → consolidated shipment;
- multiple suppliers → split deliveries;
- supplier → DIAL hub → customer;
- supplier → customer direct where policy permits;
- click-and-collect;
- partial pickup + partial delivery where commercially allowed.

Persist the selected topology in a versioned `FulfilmentPlan`.

## 5.6 Commands

- `CreateFulfilmentPlan`
- `ReserveFulfilment`
- `ConfirmSupplierFulfilment`
- `RejectSupplierFulfilment`
- `SubstituteFulfilmentSource`
- `SplitFulfilment`
- `ConsolidateFulfilment`
- `GeneratePreparationTasks`
- `MarkFulfilmentPrepared`
- `CreateDeliveryLeg`
- `CreatePickupLeg`
- `CancelUnfulfilledLine`
- `ApprovePartialFulfilment`
- `FailFulfilment`
- `CompleteFulfilment`

## 5.7 Eventualities

- supplier accepts then stock disappears;
- one line fails in multi-line order;
- one supplier times out;
- substitute differs by brand/quality;
- customer rejects substitute;
- customer changes address after plan creation;
- preparation capacity unavailable;
- customer requests cancellation mid-preparation;
- paid line cannot be fulfilled;
- one split shipment delivered, another lost;
- duplicate supplier confirmation;
- stale stock signal;
- cold-chain requirement discovered late;
- route capacity incompatible with item;
- pickup window missed;
- partial refund required;
- supplier change alters delivery quote materially;
- order line recalled before delivery;
- COD eligibility revoked after order creation.

## 5.8 Donor strategy

- Medusa core commerce modules — MIT core; use as REFERENCE / selective logic for order, fulfilment, inventory reservation and return patterns.
- Vendure — REFERENCE only unless licensing strategy explicitly accepts GPL/commercial terms.
- ERPNext — REFERENCE for document-to-stock/accounting workflow parity, not runtime SoR.

---

# 6. EXP-C360 — Customer 360, Relationship Graph & CRM

## 6.1 Outcome

DIAL recognises one customer/household/organisation across all business units while keeping specialist data boundaries, consent and least privilege intact.

## 6.2 Core aggregates

```text
Party
Person
Organisation
CustomerProfile
Household
Relationship
Delegation
Address
CommunicationPreferenceProfile
ConsentRecord
CustomerSegmentMembership
CustomerLifecycleState
CustomerTimelineEntry
CustomerRiskCaseRef
CustomerValueProjection
```

## 6.3 Relationship graph

Support explicit, effective-dated relationships:

- person ↔ household;
- guardian ↔ dependant where lawful;
- employee ↔ employer;
- customer ↔ organisation;
- vehicle owner ↔ vehicle;
- delegated buyer ↔ business;
- authorised receiver ↔ delivery;
- fleet manager ↔ fleet;
- project contact ↔ project.

No relationship is inferred into authority merely because data appears correlated.

## 6.4 Customer 360 screen

A privileged service agent should see a permission-filtered timeline:

```text
Identity
Addresses
Vehicles
Memberships
Orders
Jobs
Deliveries
Payments
Claims
Support conversations
Communication preferences
Consent
Open actions
```

Health information remains behind the Health boundary and is not casually exposed in a general CRM timeline.

## 6.5 Commands

- `CreateCustomerProfile`
- `VerifyCustomerContact`
- `AddCustomerAddress`
- `CreateRelationship`
- `EndRelationship`
- `GrantDelegation`
- `RevokeDelegation`
- `MergeCustomerProfiles`
- `UnmergeCustomerProfiles`
- `UpdateCommunicationPreferences`
- `RecordConsent`
- `WithdrawConsent`
- `RequestDataExport`
- `RequestAccountClosure`

## 6.6 Eventualities

- duplicate person;
- shared phone number;
- recycled phone number;
- changed email;
- family member leaves household;
- business buyer changes employer;
- customer requests deletion while statutory records must be retained;
- wrong profile merge;
- merge has downstream orders;
- consent withdrawal while marketing is queued;
- address shared by multiple customers;
- delegated buyer exceeds authority;
- compromised account;
- dormant account reactivated.

## 6.7 Donor strategy

- **Twenty CRM** — REFERENCE for CRM object/timeline/UI patterns only; current source is primarily AGPL with separately licensed enterprise files.
- **Chatwoot** — INTEGRATE-SERVICE for support conversations; core outside enterprise directories is MIT. DIAL customer/order/job identity remains authoritative.
- **Novu** — REFERENCE for inbox/preference/workflow UX only; MIT core with enterprise folders. DIAL Communication Fabric remains authoritative.

---

# 7. EXP-SUP — Supplier OS

## 7.1 Outcome

Suppliers operate through a full lifecycle with measurable catalogue accuracy, stock freshness, confirmation performance, fulfilment quality, financial settlement and corrective actions.

## 7.2 Lifecycle

```text
APPLICANT
→ DUE_DILIGENCE
→ APPROVED
→ PROBATION
→ ACTIVE
→ RESTRICTED
→ SUSPENDED
→ OFFBOARDED
```

Reinstatement requires explicit command and evidence.

## 7.3 Core aggregates

```text
Supplier
SupplierSite
SupplierAgreement
SupplierCredential
SupplierContact
SupplierOffer
StockSignal
SupplierCatalogueMapping
SupplierFulfilment
SupplierSettlement
SupplierQualityProfile
SupplierRestriction
SupplierCorrectiveActionRef
```

## 7.4 Operational roles

- BU Supplier Manager
- Supplier Account Manager
- Supplier Catalogue Operator
- Supplier Finance Reviewer
- Supplier Compliance Reviewer
- Quality Reviewer

## 7.5 Supplier dashboard

Required sections:

- pending orders;
- confirmation deadlines;
- stock heartbeat;
- catalogue issues;
- pickup readiness;
- returns;
- disputes;
- settlements;
- performance;
- credentials/expiry;
- corrective actions.

## 7.6 Commands

- `SubmitSupplierApplication`
- `ApproveSupplier`
- `ActivateSupplier`
- `RestrictSupplier`
- `SuspendSupplier`
- `ReinstateSupplier`
- `RecordStockSignal`
- `ConfirmSupplierOrder`
- `RejectSupplierOrder`
- `MarkReadyForPickup`
- `SubmitSupplierReturnResponse`
- `PublishSupplierOffer`
- `WithdrawSupplierOffer`
- `ApproveSupplierSettlement`
- `OpenSupplierCorrectiveAction`

## 7.7 Eventualities

- false stock;
- supplier confirms but cannot fulfil;
- price changes after customer checkout;
- supplier goes offline;
- credential expires;
- banking details change;
- duplicate supplier business;
- counterfeit report;
- late pickup readiness;
- repeated missing items;
- supplier employee leaves;
- partial supplier fulfilment;
- settlement dispute;
- supplier insolvency/closure;
- conflict of interest;
- supplier concentration risk.

---

# 8. EXP-TECH — Technician OS + DIAL Academy

## 8.1 Outcome

A technician can progress from recruitment to qualified operation, receive work safely, execute offline, generate evidence, manage availability and earnings, and improve through quality feedback and training.

## 8.2 Core aggregates

```text
TechnicianProfile
TradeCredential
Capability
ToolCapability
ServiceArea
TechnicianAvailability
TechnicianShift
TechnicianAssignment
JobExecution
SafetyPrerequisite
TrainingRecord
AcademyModule
AcademyCertification
TechnicianScore
TechnicianRestriction
ProviderSettlement
```

## 8.3 Lifecycle

```text
APPLICANT
→ DOCUMENT_REVIEW
→ PRACTICAL_REVIEW
→ PROBATION
→ VERIFIED
→ PREFERRED
```

Alternate:

```text
ANY ACTIVE STATE
→ RESTRICTED
→ SUSPENDED
→ REINSTATEMENT_REVIEW
```

## 8.4 Operational depth

Add:

- current workload;
- upcoming schedule;
- service radius;
- tools/equipment capability;
- transport capability;
- offline job packs;
- SOP/HIRA/PPE/LOTO requirements;
- evidence checklist;
- route/site navigation;
- team/helper management;
- variations;
- customer signoff;
- earnings;
- withholding;
- claim/rework obligations;
- training requirements;
- restrictions by trade/site/job class.

## 8.5 Academy

Training families:

- DIAL platform;
- customer conduct;
- evidence;
- privacy;
- safety;
- payment handling;
- dispute prevention;
- branch SOP;
- trade/job-specific refreshers.

DIAL Academy certificates never replace statutory trade or professional credentials.

## 8.6 Eventualities

- credential expires while job assigned;
- technician loses required tool;
- no network;
- customer unavailable;
- unsafe site;
- scope differs from intake;
- helper not registered;
- technician no-show;
- job overruns shift;
- evidence upload fails;
- variation denied;
- quality restriction applied while future jobs exist;
- payout blocked by compliance;
- customer raises claim during outcome window.

---

# 9. EXP-QUAL — Provider Quality OS + CAPA

## 9.1 Outcome

Quality failures create structured improvement actions, not arbitrary bans or opaque scores.

## 9.2 Shared lifecycle

```text
QualityFinding
→ Containment
→ RootCause
→ CorrectiveAction
→ PreventiveAction
→ Verification
→ Closure
```

## 9.3 Provider classes

- technicians;
- suppliers;
- drivers;
- laundry facilities;
- grocery merchants/fulfilment sites;
- tow/assist providers;
- project subcontractors;
- other DIAL-approved providers.

## 9.4 Quality contracts

Each provider class has a `QualityContract` defining:

- measurable dimensions;
- sample window;
- evidence sources;
- minimum sample before adverse automation;
- thresholds;
- severity;
- review cadence;
- response ladder;
- appeal/review mechanism.

## 9.5 Response ladder

Possible outcomes:

- coaching;
- checklist/SOP update;
- retraining;
- supervised probation;
- equipment requirement;
- category/trade/site restriction;
- reduced capacity;
- temporary suspension;
- termination/offboarding.

## 9.6 Anti-abuse rules

A score is not proof of misconduct. High-impact adverse action requires:

- deterministic reason code;
- evidence;
- policy;
- human review where required;
- audit;
- appeal route where appropriate.

## 9.7 Eventualities

- score computation bug;
- insufficient sample;
- fraudulent customer complaint;
- collusive positive reviews;
- duplicate finding;
- provider changes business identity;
- CAPA overdue;
- corrective action passes but recurrence happens;
- disputed root cause;
- one branch restriction should not imply global ban;
- critical safety finding requires immediate containment.

---

# 10. EXP-RCE — Resolution, Claims, Guarantee & Trust

## 10.1 Outcome

Every material customer/provider failure becomes an auditable case with evidence, liability reasoning, remedy, money effects and learning feedback.

## 10.2 Separation of responsibilities

```text
Trust & Abuse
  signals / investigation / control

Resolution Engine
  complaint / dispute / remedy decision

Guarantee & Claims
  funded remedy / reserve / insurer

Money
  refund / credit / payout execution

Quality / CAPA
  systemic improvement
```

## 10.3 Core aggregates

```text
ResolutionCase
CaseIssue
CaseParty
CaseEvidence
CaseDeadline
CaseDecision
CaseRemedy
Appeal
TrustSignal
TrustCase
GuaranteeProduct
GuaranteeClaim
GuaranteeReserve
ClaimRecovery
```

## 10.4 Branch-specific issue taxonomy

### Spare
- wrong item;
- wrong fitment;
- counterfeit;
- damaged;
- missing component;
- late fulfilment;
- warranty.

### Tech
- no-show;
- workmanship;
- property damage;
- incomplete job;
- unauthorised variation;
- safety breach.

### Groceries
- missing;
- wrong substitute;
- spoiled;
- damaged;
- cold-chain;
- weighted-item dispute.

### Laundry
- missing garment;
- count mismatch;
- shrinkage;
- colour bleed;
- damage;
- pre-existing-condition dispute.

### Delivery
- failed attempt;
- damage;
- wrong recipient;
- refusal;
- COD dispute.

### Assist
- tow damage;
- provider no-show;
- service failure;
- storage/custody issue.

### Projects
- milestone rejection;
- delay;
- material failure;
- quality defect;
- cost/variation dispute.

## 10.5 Canonical case flow

```text
OPEN
→ TRIAGED
→ EVIDENCE_REQUIRED
→ INVESTIGATING
→ DECISION_PENDING
→ DECIDED
→ REMEDY_IN_PROGRESS
→ RESOLVED
→ CLOSED
```

With:

```text
ANY NON-TERMINAL → ESCALATED
DECIDED → APPEALED → RECONSIDERATION
```

## 10.6 Remedies

- explanation/no remedy;
- rework;
- redelivery;
- replacement;
- partial refund;
- full refund;
- account credit;
- provider-funded recovery;
- guarantee-funded recovery;
- insurer claim;
- disciplinary/quality referral.

Resolution never writes the ledger directly; it emits an approved money instruction/accounting event.

## 10.7 Guarantee model

Every guarantee product defines:

- covered business;
- covered failure;
- eligibility;
- exclusions;
- evidence standard;
- maximum benefit;
- excess/deductible if applicable;
- funding source;
- reserve rule;
- insurer reference if applicable;
- claim workflow;
- expiry/outcome window.

Never market a product as insurance unless a valid underwriter/regulatory structure exists.

## 10.8 Eventualities

- evidence deleted/expired;
- parties disagree on facts;
- customer misses evidence deadline;
- provider unresponsive;
- partial liability;
- claim exceeds cap;
- reserve below minimum;
- refund provider unavailable;
- replacement unavailable;
- appeal after payout;
- duplicate claim;
- claim linked to fraud investigation;
- systemic issue affects many customers;
- class-wide recall;
- provider leaves platform during case;
- chargeback overlaps DIAL case.

---

# 11. EXP-TREAS — Treasury, FP&A & Business-Unit Economics

## 11.1 Outcome

DIAL can see, forecast and control liquidity while preserving one ledger and clear business-unit accountability.

## 11.2 Core aggregates/projections

```text
TreasuryAccount
BusinessUnitTreasuryAccount
BankAccount
PaymentChannelSettlementAccount
LiquidityPosition
PaymentBatch
FundingReservation
InterUnitTransfer
CashForecast
Budget
ForecastVersion
CostCentreBudget
ContributionProjection
GuaranteeReserveProjection
WorkingCapitalPosition
```

## 11.3 Required views

Per BU:

- cash available;
- restricted/committed cash;
- pending PSP settlement;
- refunds due;
- supplier payables;
- technician payables;
- payroll funding;
- petty cash;
- COD custody;
- tax obligations;
- guarantee reserves;
- working-capital forecast.

Global:

- group cash;
- BU surplus/deficit;
- settlement ageing;
- concentration by payment provider/bank;
- upcoming payroll;
- claims reserve pressure;
- inter-unit funding.

## 11.4 Treasury commands

- `CreateFundingReservation`
- `ApproveFundingReservation`
- `ReleaseFundingReservation`
- `CreatePaymentBatch`
- `ApprovePaymentBatch`
- `SubmitPaymentBatch`
- `ReconcilePaymentBatch`
- `CreateInterUnitTransfer`
- `ApproveInterUnitTransfer`
- `PostBankStatementMatch`
- `ApproveTreasuryForecast`

## 11.5 Business-unit contribution model

```text
GMV
→ DIAL recognised revenue
- provider/supplier economics
- delivery cost
- payment cost
- communication cost
- refunds
- guarantee/claim cost
- promotion subsidy
- support/ops variable cost
= CM1 / CM2 according to canonical definition
```

Never present GMV as revenue.

## 11.6 Eventualities

- PSP settlement delayed;
- bank statement missing;
- partial payment batch failure;
- duplicate bank line;
- payroll account underfunded;
- refund queue exceeds liquidity;
- COD cash not deposited;
- guarantee reserve below floor;
- wrong-currency funding;
- inter-unit transfer duplicated;
- bank details changed after approval;
- reconciliation mismatch;
- provider account frozen;
- FX rate stale.

## 11.7 Donor strategy

- ERPNext — REFERENCE for finance/procurement document flows; GPL-3.
- Formance Ledger — REFERENCE for programmable ledger/explorer concepts; current ledger repo is MIT.
- Apache Fineract — REFERENCE for branch/accounting/transaction control patterns; Apache-2.0. Do not import lending semantics unless relevant.
- Firefly III — UI/reporting reference only; AGPL and oriented to personal finance.
- DIAL Ledger remains the sole accounting SoR.

---

# 12. EXP-NET — Network Capacity & Marketplace Liquidity

## 12.1 Outcome

DIAL knows when it has enough supply, staff, equipment, provider coverage and logistics capacity to promise a service in a place/time window.

## 12.2 Network cell

```text
Business
→ country
→ city
→ zone
→ service/trade/category
→ time bucket
```

## 12.3 Capacity contracts

Examples:

```text
Tech:
qualified technician hours by trade/zone

Delivery:
vehicle-hours + stops/hour + payload constraints

Groceries:
picker lines/hour + packing + cold staging + courier capacity

Laundry:
kg/hour by process × machine uptime × shift

Supplier:
stock coverage + confirmation throughput + dispatch throughput
```

## 12.4 Liquidity states

```text
EMPTY
THIN
VIABLE
HEALTHY
SATURATED
```

These states inform, but do not silently override, branch activation policy.

## 12.5 Metrics

- request arrival rate;
- eligible supply;
- available supply;
- acceptance;
- fulfilment;
- p50/p90 accept time;
- p50/p90 ETA;
- queue depth;
- utilisation;
- cancellation;
- abandonment;
- stock coverage;
- courier coverage;
- capacity risk horizon.

## 12.6 Commands

- `RecordCapacityContract`
- `PublishCapacityForecast`
- `SetCapacityException`
- `AcknowledgeCapacityShortage`
- `CreateCapacityAction`
- `CloseCapacityAction`

Forecasts do not mutate orders/jobs.

## 12.7 Donor/tools

- OR-Tools — Apache-2.0; algorithm/reference for optimisation scenarios.
- SimPy/Pyomo — modelling tools for offline scenario work.
- Existing OSRM/VROOM — routing/vehicle optimisation where logistics-specific.

---

# 13. EXP-ACT — Branch, Zone & Capability Activation OS

## 13.1 Outcome

DIAL can build broadly and activate narrowly without using one unsafe `enabled` flag.

## 13.2 Distinct control semantics

```text
FEATURE FLAG
software exposure / experiment

CAPABILITY STATUS
configured capability technically available?

BRANCH ACTIVATION
business/zone customer-bookable?

PROVIDER ELIGIBILITY
may this supplier/technician/courier fulfil?

EMERGENCY CONTROL
temporary containment for safety/security/money?
```

## 13.3 Activation dimensions

- division;
- country;
- city;
- zone;
- product category;
- trade;
- service;
- payment method;
- delivery class;
- customer segment if policy permits.

## 13.4 Activation gates

Typical hard gates:

- legal/compliance;
- payments;
- tax/fiscal;
- support readiness;
- supply/provider density;
- logistics;
- safety;
- treasury/liquidity;
- catalogue coverage;
- security;
- production observability.

## 13.5 State

```text
DRAFT
→ READINESS_REVIEW
→ CERTIFIED_DORMANT
→ ACTIVE
→ RESTRICTED
→ PAUSED
→ RETIRED
```

## 13.6 Donor/tool strategy

- OpenFeature specification — Apache-2.0, vendor-neutral flag API reference.
- DIAL DB remains certification/activation SoR.
- Feature flags never substitute for compliance or money gates.

---

# 14. EXP-B2B — DIAL Business Core

## 14.1 Outcome

An organisation can purchase, approve, budget, receive, reconcile and audit DIAL services across business units.

## 14.2 Core aggregates

```text
BusinessAccount
OrganisationMembership
BusinessSite
CostCentre
BuyerRole
ApprovalPolicy
SpendLimit
PurchaseRequest
BusinessOrder
BusinessJobRequest
PurchaseOrder
ContractPriceAgreement
CreditAccount
BusinessInvoice
BusinessStatement
```

## 14.3 Key capabilities

- multi-site organisation;
- employee/buyer invitations;
- roles;
- budgets;
- approval thresholds;
- cost centres;
- PO requirement;
- quote-to-PO;
- consolidated statements;
- invoice terms where approved;
- contract pricing;
- fleet association;
- recurring orders/services;
- beneficiary orders;
- account suspension;
- audit export.

## 14.4 Approval model

```text
Requester
→ cost-centre policy
→ approver(s)
→ financial authority
→ DIAL commercial transaction
```

No user may approve their own request when SoD policy forbids it.

## 14.5 Eventualities

- buyer leaves employer;
- duplicate organisation;
- exhausted budget;
- approval expires;
- PO amount mismatches quote;
- cost centre closed;
- credit limit exceeded;
- overdue account;
- organisation disputes employee purchase;
- delegated authority revoked mid-order;
- multi-currency statement.

---

# 15. EXP-WMS — Procurement, Internal WMS, Assets & Facilities

## 15.1 Outcome

DIAL can buy, receive, inspect, store, move, issue, count and control its own operational stock/assets.

## 15.2 Procurement chain

```text
Requisition
→ approval
→ RFQ
→ supplier comparison
→ PO
→ receipt
→ quality inspection
→ GRV
→ invoice match
→ payment
```

## 15.3 Warehouse model

```text
Warehouse
→ zone
→ aisle
→ rack
→ bin
```

## 15.4 Stock capabilities

- barcode/QR;
- lots;
- serial numbers;
- expiry;
- quarantine;
- damaged stock;
- reservations;
- transfers;
- stock count;
- adjustment with reason;
- packing materials;
- consumables;
- vehicle stock;
- custody;
- valuation/accounting events.

## 15.5 Asset lifecycle

```text
PURCHASED
→ RECEIVED
→ IN_STOCK
→ ASSIGNED
→ IN_USE
→ REPAIR
→ RETURNED
→ RETIRED
→ DISPOSED
```

## 15.6 Donor strategy

- InvenTree — MIT; strong source-guided donor for location tree, stock movements, serial/lot, receiving and transfer patterns.
- ERPNext — REFERENCE for procurement/accounting/asset treatment.
- Snipe-IT — REFERENCE for asset custody/checkout.
- DIAL remains SoR.

---

# 16. EXP-CARE — Subscription, Billing & Entitlement OS

## 16.1 Outcome

Recurring DIAL plans have immutable entitlement accounting rather than fragile boolean membership fields.

## 16.2 Core aggregates

```text
Plan
PlanVersion
Membership
BillingSchedule
EntitlementAccount
EntitlementGrant
EntitlementConsumption
EntitlementReservation
RenewalAttempt
GracePeriod
PlanChange
PartnerBenefit
```

## 16.3 Entitlement ledger

Example:

```text
Plan grants:
2 roadside assists/year
1 inspection/6 months
10% eligible labour benefit up to cap
```

Each grant and consumption is recorded explicitly.

## 16.4 State

```text
PENDING
→ ACTIVE
→ GRACE
→ SUSPENDED
→ CANCELLED
→ EXPIRED
```

## 16.5 Commands

- `SubscribePlan`
- `RenewMembership`
- `ReserveEntitlement`
- `ConsumeEntitlement`
- `ReleaseEntitlementReservation`
- `UpgradePlan`
- `DowngradePlan`
- `SuspendMembership`
- `CancelMembership`

## 16.6 Eventualities

- renewal payment fails;
- benefit unavailable in zone;
- plan changes mid-period;
- entitlement reserved but job cancelled;
- duplicate consumption;
- partner benefit unavailable;
- grace period expires;
- customer sells vehicle;
- household member leaves;
- benefit abuse;
- refund after partial use.

## 16.7 Donor strategy

- Kill Bill — Apache-2.0; strong REFERENCE for subscription lifecycle, billing and extensibility.
- Lago — REFERENCE only unless AGPL strategy is explicitly accepted; useful for usage-based billing concepts.
- DIAL entitlement ledger and payment state remain authoritative.

---

# 17. EXP-ASST — Dial Assist Control Room

## 17.1 Outcome

Assist operates as a safety-aware real-time incident coordination product rather than a normal delivery/job queue.

## 17.2 Core aggregates

```text
AssistIncident
IncidentLocation
SafetyTriage
CoverageAssessment
AssistProviderOffer
AssistDispatch
TowInstruction
VehicleCustody
IncidentEvidence
EmergencyReferral
AssistSla
```

## 17.3 Control-room view

- incident map;
- severity;
- location confidence;
- stranded vehicle;
- provider offers;
- current responder;
- ETA;
- tow destination;
- active communication;
- escalation;
- provider status;
- case/claim linkage.

## 17.4 Safety triage

Deterministic initial questions:

- immediate injury?
- unsafe road position?
- fire/smoke?
- collision?
- vulnerable occupants?
- dangerous goods?
- vehicle blocking traffic?
- safe to remain with vehicle?

AI may help summarize but may not suppress emergency escalation.

## 17.5 Eventualities

- no GPS;
- low GPS confidence;
- no provider;
- provider accepts then cancels;
- responder loses connectivity;
- customer location changes;
- unsafe roadside position;
- crash requires emergency services;
- tow destination unavailable;
- vehicle damage during tow;
- customer cannot authenticate;
- Care entitlement uncertain;
- payment provider unavailable.

## 17.6 Donor strategy

- Traccar — Apache-2.0; REFERENCE for real-time tracking/geofencing/device-management concepts, not incident SoR.
- MapLibre/OSRM — shared map/routing.
- shared Communication and Logistics/dispatch primitives where semantically appropriate.

---

# 18. EXP-PROJ — Projects OS

## 18.1 Outcome

Large jobs can be planned, funded, executed, measured, varied, handed over and defended with project-grade evidence.

## 18.2 Core aggregates

```text
ProjectRequest
Assessment
ProjectScope
BoQ
Project
WorkBreakdownStructure
ProjectTeam
ProjectDependency
MaterialRequirement
ProjectBudget
Commitment
ProgressValuation
Milestone
VariationOrder
SiteDiary
QualityInspection
SnagItem
HandoverPack
DefectsLiabilityPeriod
```

## 18.3 Lifecycle

```text
REQUESTED
→ ASSESSMENT
→ PROPOSAL
→ APPROVED
→ MOBILISING
→ ACTIVE
→ HANDOVER
→ DEFECTS_PERIOD
→ CLOSED
```

## 18.4 Project controls

- WBS;
- dependencies/critical path;
- labour;
- materials;
- subcontractors;
- project manager;
- safety;
- site diary;
- budget;
- commitments;
- EAC;
- progressive funding;
- variation approval;
- milestone evidence;
- client visibility;
- snagging;
- handover;
- defects.

## 18.5 Money boundary

A project variation does not change payable money until:

```text
VariationProposal
→ customer/business approval
→ commercial validation
→ funding/payment rule
→ AccountingEvent / payment intent
```

## 18.6 Donor strategy

- OpenProject — REFERENCE only by default; GPL-3. Use work-package, dependency, Gantt, meeting and portfolio concepts without making it DIAL project SoR.
- ERPNext — REFERENCE for project costing/procurement links.

---

# 19. EXP-ENG — Engagement, Promotions, Loyalty & Referral

## 19.1 Outcome

DIAL can design measurable, consent-aware growth journeys without allowing marketing systems to mutate price or customer truth.

## 19.2 Core aggregates

```text
AudienceDefinition
Campaign
Journey
Offer
Coupon
ReferralProgram
Referral
Reward
LoyaltyAccount
PromotionBudget
Attribution
ExperimentRef
SuppressionRecord
```

## 19.3 Flow

```text
Audience
→ eligibility
→ offer
→ communication
→ conversion
→ attribution
→ contribution economics
```

## 19.4 Rules

- communication consent checked before send;
- promotion eligibility deterministic;
- pricing engine owns payable amount;
- marketing system cannot edit order/payment truth;
- supplier-funded promotion tracks funding responsibility;
- abuse checks before reward release;
- experiment holdout supported.

## 19.5 Eventualities

- coupon reused;
- referral self-abuse;
- promotion budget exhausted;
- campaign queued after consent withdrawn;
- order cancelled after reward;
- supplier funding unavailable;
- overlapping promotions conflict;
- reward issued twice.

---

# 20. EXP-SUPP — Support OS

## 20.1 Outcome

A support agent receives a complete, permission-filtered transaction context and can invoke controlled resolution commands without asking the customer to reconstruct the story.

## 20.2 Core aggregates

```text
SupportCase
SupportConversationLink
SupportAssignment
SupportSla
SupportEscalation
SupportKnowledgeArticle
SupportAction
```

## 20.3 Agent workspace

```text
Customer
Current issue
Order/job/delivery/payment
Timeline
Messages
Evidence
Previous cases
Open claims
Current owner
SLA
Allowed actions
```

## 20.4 Tiers

- self-service;
- automated guided support;
- Tier 1;
- specialist queue;
- Resolution/Claims;
- management escalation.

## 20.5 Chatwoot boundary

Chatwoot may own conversation UI/session mechanics. DIAL owns:

- customer identity;
- support case;
- order/job/delivery context;
- SLA;
- resolution state;
- money actions;
- evidence state.

---

# 21. EXP-COMP — Compliance, Partner & Continuity OS

## 21.1 Outcome

DIAL can prove licences, obligations, partner dependencies, outage plans and recovery actions rather than treating compliance as a document folder.

## 21.2 Core aggregates

```text
ComplianceObligation
ComplianceEvidence
LicenceCredential
ComplianceGate
Policy
PolicyVersion
Partner
PartnerContract
PartnerSla
PartnerRisk
ConcentrationRisk
ContinuityPlan
ContinuityExercise
Incident
RecoveryAction
```

## 21.3 Partner lifecycle

```text
PROPOSED
→ DUE_DILIGENCE
→ APPROVED
→ INTEGRATING
→ LIVE
→ WATCH
→ RENEWAL
→ EXIT
```

Each partner stores:

- contract;
- data access;
- security classification;
- SLA;
- outage history;
- concentration risk;
- termination plan;
- replacement route.

## 21.4 Continuity scenarios

Must be exercised for:

- payment provider outage;
- Econet SMS outage;
- WhatsApp outage;
- transactional email outage;
- routing/map outage;
- cloud/region outage;
- database restore;
- supplier outage;
- mass driver shortage;
- mass refund event;
- payroll failure;
- fraud spike;
- fiscalisation outage;
- critical third-party API credential expiry.

## 21.5 Policy engine

OPA may execute selected policy decisions, but:

- policy source/version remains DIAL-governed;
- policy-specific fail-open/fail-closed behaviour is defined;
- money/safety/compliance normally fail closed;
- OPA outage cannot create undefined authority.

## 21.6 Donor strategy and licence correction

- OPA — Apache-2.0; integrate where complexity justifies it.
- OpenFeature — Apache-2.0; feature-flag API reference.
- Eramba — **REFERENCE ONLY** unless an explicit current licence permits the intended use. Current Eramba Community terms publicly indicate restrictions on modification; therefore DIAL must not assume it is a code donor.
- OpenProject — REFERENCE for governance/portfolio patterns.
- DIAL stores authoritative compliance state.

---

# 22. EXP-FLEET — Fleet & Vehicle Operations expansion

## 22.1 Outcome

Dial Fleet becomes a real business operating system for organisations and also supports DIAL's own delivery fleet.

## 22.2 Existing capabilities to deepen

Existing registry features already include:

- fleet hierarchy;
- vehicle registry linkage;
- driver/custodian assignment;
- odometer/usage;
- maintenance schedules;
- defects;
- service/job orchestration.

Expansion adds:

- vehicle availability;
- dispatch compatibility;
- fuel/energy records;
- tyres;
- accident records;
- licence/insurance/permit clocks;
- daily inspection;
- defect severity;
- downtime;
- replacement vehicle;
- TCO;
- lifecycle replacement planning;
- driver behaviour inputs where lawfully sourced;
- optional telematics;
- vehicle-to-delivery capacity profile;
- internal fleet cost allocation.

## 22.3 Logistics bridge

`VehicleAssignment` remains fleet custody truth. `DriverDeployment` remains workforce/logistics operating truth. They are related but must never be conflated.

## 22.4 Telematics

Optional telemetry must be adapter-driven. Traccar may be studied or integrated for device tracking, but DIAL fleet identity, jobs and maintenance state remain authoritative.

---

# 23. EXP-PRC — Pricing & Commercial Policy expansion

## 23.1 Outcome

Every payable amount can be reconstructed from deterministic versioned inputs, while commercial teams can manage rules safely by BU/zone/customer class.

## 23.2 Core aggregates

```text
PricePolicy
PricePolicyVersion
RateCard
MarginRule
DeliveryPriceRule
PromotionRuleRef
ContractPrice
Quote
QuoteComponent
QuoteSnapshot
CommercialApproval
```

## 23.3 Price dimensions

- business unit;
- site/zone;
- product/service;
- supplier cost;
- customer class;
- contract;
- delivery burden;
- urgency/time window;
- promotion;
- tax;
- FX;
- effective date.

## 23.4 Rule governance

```text
DRAFT
→ REVIEW
→ APPROVED
→ ACTIVE
→ SUPERSEDED
→ RETIRED
```

No historical order is repriced because a policy was edited later.

## 23.5 Eventualities

- supplier cost stale;
- FX stale;
- promotion conflict;
- delivery profile missing;
- customer contract expired;
- quote expires during checkout;
- price changes after supplier failover;
- wrong policy activated;
- rollback required;
- negative margin below authority threshold.

---

# 24. Shared API namespace plan

The following top-level namespaces should remain coherent even where branch BFFs provide customer-specific projections:

```text
/api/v1/catalogue/*
/api/v1/orders/*
/api/v1/fulfilment/*
/api/v1/customers/*
/api/v1/relationships/*
/api/v1/suppliers/*
/api/v1/technicians/*
/api/v1/quality/*
/api/v1/resolution/*
/api/v1/claims/*
/api/v1/trust/*
/api/v1/treasury/*
/api/v1/network/*
/api/v1/activation/*
/api/v1/business/*
/api/v1/procurement/*
/api/v1/inventory/*
/api/v1/assets/*
/api/v1/care/*
/api/v1/assist/*
/api/v1/projects/*
/api/v1/engagement/*
/api/v1/support/*
/api/v1/compliance/*
/api/v1/partners/*
/api/v1/fleet/*
/api/v1/pricing/*
```

Business-unit or app BFF routes may exist for ergonomics but must call canonical application services rather than bypass them.

---

# 25. Cross-module event map

Minimum shared events to register/normalise:

```text
CatalogueCandidateApproved
FitmentClaimSuperseded
CataloguePublicationCompleted
SearchDemandGapRecorded

OrderPlaced
OrderCommerciallyConfirmed
FulfilmentPlanCreated
SupplierFulfilmentConfirmed
FulfilmentReady
PreparationCompleted
OrderReadyForDispatch
FulfilmentFailed

CustomerRelationshipChanged
CustomerConsentChanged
CustomerProfileMerged
CustomerProfileUnmerged

SupplierActivated
SupplierRestricted
SupplierStockStale
SupplierConfirmationExpired

TechnicianCredentialExpired
TechnicianQualityStateChanged
TechnicianRestrictionChanged

QualityFindingOpened
ProviderCorrectiveActionOpened
CorrectiveActionVerified

ResolutionCaseOpened
ResolutionDecisionRecorded
GuaranteeClaimOpened
GuaranteeClaimApproved
TrustCaseOpened

TreasuryLiquidityStateChanged
PaymentBatchFailed
InterUnitTransferCompleted

NetworkLiquidityStateChanged
CapacityShortageDetected

BranchActivationChanged
CapabilityStatusChanged
EmergencyControlActivated

BusinessApprovalRequested
BusinessApprovalCompleted

InventoryMovementRecorded
ProcurementReceiptCompleted
AssetCustodyChanged

MembershipActivated
EntitlementReserved
EntitlementConsumed
MembershipEnteredGrace

AssistIncidentOpened
AssistProviderAssigned
AssistIncidentClosed

ProjectVariationRequested
ProjectMilestoneAccepted
ProjectHandoverCompleted

CampaignStarted
RewardIssued

SupportCaseEscalated

ComplianceObligationDue
ComplianceGateBlocked
PartnerRiskStateChanged
ContinuityModeActivated

FleetVehicleUnavailable
FleetDefectRaised

CommercialPolicyPromoted
QuoteExpired
```

All event schemas must be versioned and carry correlation/causation IDs.

---

# 26. Cross-cutting eventuality catalogue

Every module must instantiate its own detailed eventuality rows, but the following classes are mandatory across the programme.

## 26.1 Identity/authority

- actor removed from role mid-workflow;
- permission changes during approval;
- stale session;
- duplicate/replayed command;
- wrong BU/site scope;
- delegation revoked;
- SoD violation.

## 26.2 Concurrency

- same aggregate edited by two operators;
- duplicate webhook;
- out-of-order event;
- replay after timeout;
- stale expected version;
- duplicate offline sync.

## 26.3 External-provider failure

- timeout;
- 429/rate limit;
- invalid signature;
- malformed response;
- provider claims success but query disagrees;
- callback never arrives;
- partial provider outage;
- credential expiry;
- provider account suspended.

## 26.4 Money

- amount/currency mismatch;
- partial settlement;
- duplicate payment;
- refund failure;
- chargeback overlaps internal case;
- insufficient BU funding;
- stale FX;
- wrong account mapping;
- reconciliation mismatch.

## 26.5 Offline/degraded operation

- device offline before command sync;
- device restarts;
- stale location;
- attachment queued but business command succeeds;
- local data conflict;
- map unavailable;
- notification provider unavailable.

## 26.6 Evidence

- upload interrupted;
- malware/invalid file;
- hash mismatch;
- evidence deleted under retention policy while case still open;
- duplicate evidence;
- evidence submitted after deadline;
- sensitive evidence exposed to wrong role.

## 26.7 Operational capacity

- queue spike;
- no eligible provider;
- staff absence;
- equipment failure;
- site unavailable;
- cold-chain/handling capability unavailable;
- delivery capacity shortage.

## 26.8 Compliance

- credential expiry;
- licence revoked;
- policy superseded;
- required disclosure not accepted;
- partner contract expires;
- restricted action attempted;
- compliance engine unavailable.

Every eventuality table row must state:

```text
condition
detected by
affected aggregate
state transition
money effect
inventory effect
delivery effect
access effect
notification
owner queue
SLA
required evidence
recovery command
terminal outcome
test fixture
```

No material row may remain `TBD` at Domain Green.

---

# 27. Operator roles and management hierarchy

The expansion programme requires named operational owners rather than one generic admin role.

Suggested roles:

| System | Operating owner |
|---|---|
| Catalogue/fitment | Catalogue Manager |
| Fulfilment | Fulfilment Manager / BU Operations Manager |
| Customer 360/CRM | Customer Operations / CRM Manager |
| Suppliers | BU Supplier Manager |
| Technician OS | Technician Operations Manager |
| Quality/CAPA | Quality Manager |
| Resolution/Claims | Resolution/Claims Manager |
| Treasury | Treasury Manager / Finance Controller |
| Network/Capacity | Network Operations Manager |
| Activation | Command Centre / Business Readiness authority |
| B2B | Business Accounts Manager |
| WMS/Procurement | Procurement Manager / Warehouse Manager |
| Care | Membership/Entitlement Manager |
| Assist | Assist Control Room Manager |
| Projects | Project Manager / Projects Operations Manager |
| Engagement | CRM/Engagement Manager |
| Support | Support Operations Manager |
| Compliance/Partners | Compliance/Partner Risk Manager |
| Fleet | Fleet Manager |
| Pricing | Commercial/Pricing Manager |

Roles map to Position/PermissionBundle objects and must not be hard-coded to named users.

---

# 28. Command Centre integration

The Command Centre should not become a second database. Each expansion registers:

- `MetricContract`s;
- exception queues;
- owned actions;
- drill-down routes;
- capability health;
- stale-data markers;
- business-unit comparison;
- Actual vs Simulated separation.

Seed enterprise cards:

```text
Catalogue
- unresolved fitment conflicts
- no-result demand gaps
- stale supplier mappings

Fulfilment
- supplier confirmation backlog
- preparation SLA risk
- failed fulfilments

Customer
- open high-severity cases
- consent/suppression anomalies
- retention/cross-branch adoption

Supply
- supplier confirmation rate
- stock freshness
- provider restrictions

Quality
- findings
- overdue CAPA
- repeat defects

Claims
- open exposure
- reserve adequacy
- ageing

Treasury
- liquidity by BU
- settlement ageing
- payroll funding
- refunds due

Network
- thin zones
- queue risk
- capacity shortages

Activation
- blocked branches/zones
- failing hard gates

B2B
- approval backlog
- receivable ageing
- credit exposure

Operations
- warehouse exceptions
- asset defects
- Assist incidents
- project milestones at risk
```

A red tile opens an owned action or case; it does not merely change colour.

---

# 29. Security, privacy and trust requirements

## 29.1 Least privilege

- customer agents do not get payroll;
- logistics does not edit price/ledger;
- supplier manager does not approve supplier payment they initiated where SoD forbids it;
- project manager cannot self-approve own financial variation above authority;
- marketing cannot export unrestricted customer data;
- quality score engine cannot silently suspend providers without policy.

## 29.2 Sensitive-data handling

Class S3/S4 includes:

- payroll;
- employee records;
- precise live location;
- customer claim evidence;
- provider bank details;
- trust investigations;
- privileged approval records;
- specialist health information.

Requirements:

- encryption at rest/in transit;
- purpose-scoped authorization;
- audit;
- signed object access;
- retention;
- export logging;
- secure deletion when legally permitted;
- step-up MFA for privileged high-impact actions.

## 29.3 AI restrictions

AI may:

- classify;
- summarize;
- propose;
- rank within deterministic eligibility boundaries;
- detect anomalies;
- draft CAPA/root-cause hypotheses;
- suggest catalogue mappings;
- forecast capacity.

AI may not:

- set binding payable money;
- waive compliance;
- waive credential requirements;
- alter ledger;
- approve claims autonomously where policy requires human authority;
- publish fitment without evidence/review;
- terminate employment;
- accuse a provider of fraud without evidence/process;
- expose private identity.

---

# 30. Donor research registry — current findings

Research checked against official project/repository sources on 30 August 2026.

| Donor/tool | Current licence posture | DIAL disposition |
|---|---|---|
| SandPIM — `autopartsource/sandpim` | MIT; automotive PIM/fitment concepts; project describes Make-Model-Year/equipment fitment, assets, interchange and ACES/PIES import/export | REFERENCE / selective schema-algorithm port |
| Medusa — `medusajs/medusa` | MIT core; enterprise features separately licensed/open-core | REFERENCE / selective MIT module logic |
| Vendure — `vendurehq/vendure` | GPLv3 core with commercial option/plugin exception | REFERENCE unless licence strategy changes |
| Akeneo Community — `akeneo/pim-community-standard` | OSL-3.0 | REFERENCE |
| Pimcore 2026 | Pimcore Open Core License with revenue/use restrictions and competing-product restrictions | REFERENCE only unless legal/commercial licence approved |
| Twenty — `twentyhq/twenty` | primarily AGPL with separately commercial enterprise files | REFERENCE |
| Chatwoot — `chatwoot/chatwoot` | MIT core outside enterprise paths | INTEGRATE-SERVICE, with enterprise-folder licence boundary respected |
| Novu — `novuhq/novu` | MIT core + commercial enterprise folders | REFERENCE for notification workflow/inbox patterns |
| ERPNext — `frappe/erpnext` | GPL-3.0 | REFERENCE / parity donor |
| InvenTree — `inventree/InvenTree` | MIT | REFERENCE / selective source-guided port where suitable |
| OpenProject — `opf/openproject` | GPL-3.0 | REFERENCE |
| OpenFeature — `open-feature/spec` | Apache-2.0 | SPEC/SDK integration |
| OPA — `open-policy-agent/opa` | Apache-2.0 | INTEGRATE-SERVICE where policy complexity merits it |
| OR-Tools — `google/or-tools` | Apache-2.0 | LIBRARY/algorithm |
| Kill Bill — `killbill/killbill` | Apache-2.0 | REFERENCE for recurring billing/subscription semantics |
| Lago — `getlago/lago` | AGPL-3.0 | REFERENCE unless explicit AGPL strategy accepted |
| Traccar — `traccar/traccar` | Apache-2.0 | REFERENCE / optional isolated integration for telemetry |
| Formance Ledger — `formancehq/ledger` | MIT | REFERENCE for ledger modelling/explorer concepts |
| Apache Fineract — `apache/fineract` | Apache-2.0 | REFERENCE for transaction/account/branch control patterns |
| Eramba Community | Current public terms indicate modification restrictions; official GitHub mainly exposes deployment helpers/templates | REFERENCE ONLY; do not treat as source-code donor without legal clearance |

### Official source URLs

- https://github.com/autopartsource/sandpim
- https://github.com/medusajs/medusa
- https://github.com/vendurehq/vendure
- https://github.com/akeneo/pim-community-standard
- https://github.com/pimcore/pimcore
- https://github.com/twentyhq/twenty
- https://github.com/chatwoot/chatwoot
- https://github.com/novuhq/novu
- https://github.com/frappe/erpnext
- https://github.com/inventree/InvenTree
- https://github.com/opf/openproject
- https://github.com/open-feature/spec
- https://github.com/open-policy-agent/opa
- https://github.com/google/or-tools
- https://github.com/killbill/killbill
- https://github.com/getlago/lago
- https://github.com/traccar/traccar
- https://github.com/formancehq/ledger
- https://github.com/apache/fineract
- https://www.eramba.org/

Licence/provenance must be re-checked at the exact pinned revision before code assimilation.

---

# 31. Research and validation backlog

The following are not safe to guess and must be resolved by evidence before Production Green where applicable:

1. exact Zimbabwe legal treatment for specific guarantee/insurance-like products;
2. exact regulated-product restrictions by DIAL category;
3. exact B2B credit/collection policy and tax treatment;
4. exact banking/payment-batch integration capabilities available to DIAL;
5. final Econet Enterprise/A2P API/authentication/DLR contract from the enterprise onboarding channel;
6. partner-specific SLA/continuity provisions;
7. ACES/PIES/Auto Care Association data licensing implications for the actual DIAL catalogue dataset, separate from the MIT licence of SandPIM code;
8. trademark/brand-use rights for vehicle-manufacturer logos and hero assets;
9. production telemetry/privacy policy for DIAL-owned fleet and driver devices;
10. statutory retention periods for HR/payroll/financial/support/claim evidence;
11. exact DIAL Care regulatory structure where benefits resemble insurance;
12. supplier/technician indemnity and insurance requirements by trade/category.

These are activation gates, not excuses to omit implementation-shaped adapters, fixtures, configuration models or UI states.

---

# 32. Build sequencing

## Train X0 — Registry and ownership closure

- allocate canonical Feature IDs;
- update owner matrix;
- update route/surface registry;
- update permission bundles;
- update event schemas;
- update eventuality registry;
- update donor/provenance registry.

## Train X1 — P0 horizontal truth

Build first:

- Catalogue/fitment;
- Fulfilment orchestration;
- Customer 360;
- Supplier OS;
- RCE/claims/guarantee;
- Treasury.

## Train X2 — Quality and capacity control

- Provider Quality/CAPA;
- Network Capacity;
- Branch Activation;
- B2B core.

## Train X3 — Deep operating systems

- Technician OS/Academy;
- Procurement/WMS/assets;
- Care entitlements;
- Assist control room;
- Projects.

## Train X4 — Growth/support/resilience

- Engagement/loyalty;
- Support OS;
- Compliance/partner/continuity;
- Fleet expansion;
- Commercial/pricing refinement.

Trains may execute in parallel only when canonical owners and contracts are stable enough to avoid duplicate SoRs.

---

# 33. Required per-work-package engineering artifacts

Every `EXP-*` package must produce:

```text
01_SCOPE_AND_AUTHORITY.md
02_FRC_REGISTRY.json
03_STATE_MACHINES.md
04_COMMAND_QUERY_CONTRACTS.md
05_API_OPENAPI.yaml
06_EVENT_SCHEMAS/
07_EVENTUALITY_TABLE.csv
08_PERMISSION_MATRIX.csv
09_DATA_MODEL.md
10_MONEY_EFFECTS.md
11_NOTIFICATION_MATRIX.md
12_OFFLINE_DEGRADED_BEHAVIOUR.md
13_DONOR_CAPABILITY_MAP.md
14_LICENCE_PROVENANCE.md
15_UI_FLOW_INVENTORY.md
16_FIGMA_REFERENCE.md
17_TEST_MATRIX.md
18_METRIC_CONTRACTS.json
19_RUNBOOK.md
20_EVIDENCE_INDEX.md
```

A module is not implementation-ready if these remain substantially blank.

---

# 34. Acceptance-gate model

The existing DIAL gate progression remains:

```text
PLANNED
→ THIN_SLICE_REQUIRED
→ THIN_SLICE_GREEN
→ INTEGRATION_GREEN
→ STAGING_GREEN
→ PRODUCTION_GREEN
→ CERTIFIED_DORMANT or ACTIVE
```

A thin slice proves architecture, not completeness.

## 34.1 Domain Green

Required:

- all FRC fields materially closed;
- states/commands/events implemented;
- authorization negative tests;
- concurrency/idempotency;
- eventuality recovery;
- audit;
- donor provenance;
- no placeholder business path.

## 34.2 Integration Green

Required:

- real DIAL services connected;
- canonical events/outbox;
- app surfaces call real application services;
- adapters production-shaped in fixture/sandbox;
- cross-module tests.

## 34.3 Staging Green

Required:

- deployed topology;
- real Postgres/Redis/Meili/Temporal etc. as applicable;
- E2E;
- failure-state testing;
- accessibility;
- security;
- backup/restore evidence;
- visual regression.

## 34.4 Production Green

Required:

- authorised live credentials;
- live callback/reconciliation proof;
- regulatory/partner prerequisites;
- observability;
- incident/runbook/rollback;
- no critical security findings;
- approved disclosures.

## 34.5 Certified Dormant

Use when the system is technically and operationally ready but not commercially activated.

---

# 35. Cross-domain certification scenarios

The following scenarios should become mandatory end-to-end regression packs.

## Scenario A — Spare catalogue to claim

```text
supplier import
→ catalogue mapping
→ fitment approval
→ search
→ offer
→ order
→ fulfilment
→ delivery
→ customer reports wrong fitment
→ RCE
→ refund/replacement
→ supplier quality finding
→ CAPA
→ catalogue claim review
```

## Scenario B — Grocery capacity shortage

```text
scheduled demand spike
→ capacity forecast
→ preparation queue
→ driver shortage
→ logistics cross-BU recommendation
→ temporary driver deployment
→ delivery
→ BU cost allocation
```

## Scenario C — Technician quality loop

```text
recruit
→ verify
→ job
→ evidence
→ customer outcome
→ comeback
→ quality finding
→ retraining
→ probation
→ verification
→ score recompute
```

## Scenario D — Business customer project

```text
organisation buyer
→ purchase request
→ approval
→ project assessment
→ BoQ/quote
→ PO
→ funding
→ project
→ material procurement
→ milestone
→ variation
→ approval
→ handover
→ consolidated invoice/statement
```

## Scenario E — Care entitlement

```text
membership
→ billing
→ entitlement grant
→ Assist invocation
→ entitlement reservation
→ incident completed
→ consume entitlement
→ renewal fails
→ grace
→ customer notification
```

## Scenario F — Treasury pressure

```text
PSP settlement delay
→ BU liquidity drops
→ payroll funding risk
→ treasury alert
→ inter-unit transfer request
→ approval
→ payroll funded
→ payment
→ reconciliation
```

---

# 36. Architecture fitness tests

Add automated rules:

- only Catalogue/approved Catalogue Factory paths mutate canonical product/fitment truth;
- Meilisearch cannot be imported as a write authority;
- fulfilment state cannot be inferred from payment state;
- only Ledger writes journal tables;
- only Treasury workflows authorize payment batches under appropriate policy;
- RCE cannot post money directly;
- Quality score alone cannot suspend provider without required policy;
- BranchActivation cannot be overridden by marketing/feature flags;
- Customer 360 cannot expose Health specialist data without explicit contract;
- B2B approval cannot bypass FinancialAuthority/SoD;
- Support UI cannot call privileged repositories directly;
- AI packages cannot write payable money or authoritative eligibility;
- donor repositories cannot become hidden SoRs;
- production UI cannot depend on unlicensed donor assets;
- precise live location cannot be exposed outside scoped logistics/assist/fleet contracts.

---

# 37. Definition of success

This expansion is successful when DIAL behaves like one coordinated operating company:

```text
Demand
  ↓
Customer 360 / B2B
  ↓
Catalogue / provider / capacity truth
  ↓
Pricing / commercial policy
  ↓
Order / Job / Project
  ↓
Fulfilment / Logistics / Evidence
  ↓
Money / Treasury
  ↓
Quality / Trust / Resolution / Claims
  ↓
Customer outcome
  ↓
CAPA / catalogue correction / training / capacity action
  ↓
Command Centre
  ↓
better next transaction
```

The objective is **not** to add administrative weight. The objective is to ensure that DIAL's broad business model is actually operable, auditable, safe, commercially measurable and technically coherent.

---

# 38. Immediate canon amendments required after approval

1. Add this document as a controlled canon-extension source.
2. Remove every remaining Telerivet reference from active target architecture.
3. Register Econet Enterprise/A2P as the SMS production adapter candidate, with exact live API binding as an activation blocker until enterprise documentation is obtained.
4. Add Logistics Manager/Handler roles and permissions to Position/PermissionBundle contracts.
5. Add customer-safe live delivery tracking projection to Delivery/Order FRCs.
6. Add automatic preparation-task generation and preparation assignment to fulfilment FRCs.
7. Add automatic driver assignment/queue management to Delivery FRCs.
8. Allocate canonical feature IDs for expansion work packages that do not already map cleanly to existing IDs.
9. Update the Eventuality Registry with the new failure classes.
10. Correct donor dispositions where current licence research differs from older assumptions, particularly Pimcore/Eramba/Twenty/OpenProject-style copyleft or restrictive sources.
11. Create the cross-domain certification scenarios in CI/E2E planning.
12. Run the DIAL plan-phase grill against every P0 package before scaffolding.
