# Feature Implementation Contract Matrix

This matrix is generated from the machine-readable v2 registry. `FRC_CLOSED` means the design contract is concrete enough to implement; it does **not** claim code exists.

| Feature | Outcome | Aggregate | Archetype | Commands | States | Security |
|---|---|---|---|---:|---:|---|
| SPARE-F001 | Vehicle selection & garage | `VehicleProfile` | WORKFLOW | 9 | 7 | S2 |
| SPARE-F002 | Part/category search & browse | `SearchQuery` | WORKFLOW | 9 | 7 | S2 |
| SPARE-F003 | Fitment claims & confidence | `FitmentClaim` | CASE | 13 | 11 | S2 |
| SPARE-F004 | Catalogue ingest & normalization | `CatalogueIngestBatch` | MASTER | 5 | 4 | S2 |
| SPARE-F005 | Supplier offers & stock freshness | `SupplierOffer` | WORKFLOW | 9 | 7 | S2 |
| SPARE-F006 | Non-catalogue sourcing request | `SpareRequest` | REQUEST | 12 | 11 | S2 |
| SPARE-F007 | Offer comparison & selection | `OfferSelection` | WORKFLOW | 6 | 7 | S2 |
| SPARE-F008 | Cart, pricing & promotions | `PriceQuote` | QUOTE | 9 | 10 | S2 |
| SPARE-F009 | Checkout / FX / payment / fiscal | `SpareOrder` | MONEY | 11 | 15 | S3 |
| SPARE-F010 | Supplier acceptance & fulfilment prep | `SupplierFulfilment` | EXECUTION | 9 | 9 | S2 |
| SPARE-F011 | Delivery / pickup / POD | `DeliveryJob` | FULFILMENT | 11 | 11 | S2 |
| SPARE-F012 | Returns / warranty / refunds | `ReturnRequest` | WORKFLOW | 6 | 7 | S2 |
| SPARE-F013 | Counterfeit/wrong-fitment quality | `QualityCase` | CASE | 14 | 11 | S2 |
| SPARE-F014 | Supplier portal | `SupplierWorkspace` | WORKFLOW | 6 | 7 | S2 |
| SPARE-F015 | WhatsApp Spare journey | `ChannelSession` | WORKFLOW | 6 | 7 | S2 |
| SPARE-F016 | Vehicle purchase/service history | `VehicleHistoryEntry` | PROJECTION | 4 | 5 | S2 |
| SPARE-F017 | Spare AI assistance | `AIInsight` | WORKFLOW | 6 | 7 | S2 |
| TECH-F001 | Trade & JobClass configuration | `JobClass` | MASTER | 5 | 4 | S2 |
| TECH-F002 | Guided diagnostic intake | `JobRequest` | REQUEST | 9 | 11 | S2 |
| TECH-F003 | Direct booking & slot selection | `BookingIntent` | REQUEST | 9 | 11 | S2 |
| TECH-F004 | Opportunity Marketplace post | `Opportunity` | WORKFLOW | 6 | 7 | S2 |
| TECH-F005 | Eligibility & matching | `MatchSet` | ASSESSMENT | 8 | 8 | S2 |
| TECH-F006 | Interest/proposal workflow | `Proposal` | REQUEST | 9 | 11 | S2 |
| TECH-F007 | Award & job convergence | `Award` | REQUEST | 9 | 11 | S2 |
| TECH-F008 | Diagnosis, quote & approval | `Quote` | QUOTE | 9 | 10 | S3 |
| TECH-F009 | Job Reserve / protected funds | `JobReserve` | WORKFLOW | 6 | 7 | S3 |
| TECH-F010 | Scheduling & dispatch | `JobDispatch` | FULFILMENT | 11 | 11 | S2 |
| TECH-F011 | Technician Android offline execution | `JobExecution` | EXECUTION | 9 | 9 | S2 |
| TECH-F012 | HIRA / PPE / LOTO / SOP | `JobSafetyPack` | ASSESSMENT | 12 | 8 | S2 |
| TECH-F013 | Check-in and evidence | `JobEvidence` | EXECUTION | 9 | 9 | S2 |
| TECH-F014 | Scope variation | `Variation` | WORKFLOW | 9 | 7 | S2 |
| TECH-F015 | Team jobs/project handoff | `TeamAssignment` | FULFILMENT | 11 | 11 | S2 |
| TECH-F016 | Completion / customer confirmation | `Job` | EXECUTION | 9 | 9 | S2 |
| TECH-F017 | Payout / WHT / settlement | `ProviderSettlement` | MONEY | 14 | 15 | S3 |
| TECH-F018 | Workmanship protection / disputes | `Claim` | CASE | 11 | 11 | S2 |
| TECH-F019 | Technician scoring & quality | `TechnicianScore` | CASE | 11 | 11 | S2 |
| TECH-F020 | Anti-circumvention / trust | `TrustSignal` | WORKFLOW | 6 | 7 | S2 |
| GROC-F001 | Merchant/store catalogue projection | `StoreProduct` | MASTER | 5 | 4 | S2 |
| GROC-F002 | Store/zone/slot selection | `FulfilmentSlot` | WORKFLOW | 6 | 7 | S2 |
| GROC-F003 | Variable-measure goods | `MeasuredLine` | WORKFLOW | 8 | 7 | S2 |
| GROC-F004 | Order group / merchant suborders | `GroceryOrderGroup` | WORKFLOW | 6 | 7 | S2 |
| GROC-F005 | Merchant-pick fulfilment | `PickTask` | EXECUTION | 9 | 9 | S2 |
| GROC-F006 | DIAL shopper fulfilment | `ShopperTask` | ASSESSMENT | 8 | 8 | S2 |
| GROC-F007 | Substitutions | `SubstitutionDecision` | WORKFLOW | 9 | 7 | S2 |
| GROC-F008 | Produce preferences | `ProducePreference` | WORKFLOW | 6 | 7 | S2 |
| GROC-F009 | Final total / approval ceiling | `GroceryPriceFinalization` | QUOTE | 11 | 10 | S3 |
| GROC-F010 | Click & collect | `PickupHandoff` | WORKFLOW | 6 | 7 | S2 |
| GROC-F011 | Delivery / cold-chain evidence | `GroceryDelivery` | FULFILMENT | 11 | 11 | S2 |
| GROC-F012 | My Pantry stock model | `PantryItem` | WORKFLOW | 6 | 7 | S2 |
| GROC-F013 | Scheduled basket / route delivery | `ScheduledBasket` | FULFILMENT | 11 | 11 | S2 |
| GROC-F014 | Beneficiary/gift ordering | `BeneficiaryOrder` | WORKFLOW | 6 | 7 | S2 |
| GROC-F015 | Restricted goods policy | `RestrictionCheck` | WORKFLOW | 6 | 7 | S2 |
| GROC-F016 | Food safety / lot / recall | `FoodSafetyCase` | CASE | 11 | 11 | S2 |
| GROC-F017 | Grocery-specific resolution | `GroceryIssue` | CASE | 11 | 11 | S2 |
| GROC-F018 | Merchant operations/reconciliation | `MerchantSubOrder` | WORKFLOW | 6 | 7 | S2 |
| LAUN-F001 | Service catalogue & exclusions | `LaundryService` | MASTER | 5 | 4 | S2 |
| LAUN-F002 | Booking / estimate / max approval | `LaundryOrder` | REQUEST | 9 | 11 | S2 |
| LAUN-F003 | Pickup custody | `CustodyHandoff` | FULFILMENT | 11 | 11 | S2 |
| LAUN-F004 | Facility check-in | `FacilityIntake` | EXECUTION | 9 | 9 | S2 |
| LAUN-F005 | Weigh/itemize/inspect | `ItemizedLoad` | WORKFLOW | 6 | 7 | S2 |
| LAUN-F006 | Care label/risk/reclassification | `GarmentAssessment` | WORKFLOW | 6 | 7 | S2 |
| LAUN-F007 | Final price approval | `LaundryPriceFinal` | QUOTE | 9 | 10 | S3 |
| LAUN-F008 | Sort/load planning | `ProductionLoad` | WORKFLOW | 6 | 7 | S2 |
| LAUN-F009 | Machine/process execution | `ProductionRun` | EXECUTION | 9 | 9 | S2 |
| LAUN-F010 | QC / rewash | `LaundryQC` | WORKFLOW | 6 | 7 | S2 |
| LAUN-F011 | Assembly/rack/ready | `RackAssembly` | WORKFLOW | 6 | 7 | S2 |
| LAUN-F012 | Return delivery custody | `ReturnHandoff` | FULFILMENT | 11 | 11 | S2 |
| LAUN-F013 | Damage/missing/claim | `LaundryClaim` | CASE | 11 | 11 | S2 |
| LAUN-F014 | Subscriptions | `LaundryPlan` | LIFECYCLE | 8 | 9 | S2 |
| LAUN-F015 | Commercial manifests/contracts | `CommercialManifest` | WORKFLOW | 11 | 7 | S2 |
| LAUN-F016 | Healthcare segregation | `HealthcareLaundryBatch` | WORKFLOW | 6 | 7 | S2 |
| LAUN-F017 | Facility/machine capacity | `FacilityCapacity` | WORKFLOW | 6 | 7 | S2 |
| LAUN-F018 | Environmental/compliance | `LaundryCompliance` | ASSESSMENT | 8 | 8 | S2 |
| FLEET-F001 | Organisation/fleet hierarchy | `Fleet` | MASTER | 5 | 4 | S2 |
| FLEET-F002 | Vehicle registry linkage | `FleetVehicle` | MASTER | 5 | 4 | S2 |
| FLEET-F003 | Driver/custodian assignments | `VehicleAssignment` | WORKFLOW | 6 | 7 | S2 |
| FLEET-F004 | Odometer/usage capture | `UsageReading` | WORKFLOW | 6 | 7 | S2 |
| FLEET-F005 | Maintenance schedules | `MaintenancePlan` | WORKFLOW | 6 | 7 | S2 |
| FLEET-F006 | Defect reporting | `Defect` | PROJECTION | 4 | 5 | S2 |
| FLEET-F007 | Service/job orchestration | `FleetWorkOrder` | WORKFLOW | 6 | 7 | S2 |
| FLEET-F008 | Parts/order orchestration | `FleetPartDemand` | WORKFLOW | 6 | 7 | S2 |
| FLEET-F009 | Inspections | `VehicleInspection` | ASSESSMENT | 8 | 8 | S2 |
| FLEET-F010 | Licence/insurance/permit expiry | `VehicleDocument` | WORKFLOW | 6 | 7 | S2 |
| FLEET-F011 | Downtime & availability | `VehicleAvailability` | WORKFLOW | 6 | 7 | S2 |
| FLEET-F012 | Spend/TCO/cost centres | `FleetCost` | PROJECTION | 4 | 5 | S2 |
| FLEET-F013 | Supplier/tech performance | `FleetProviderScore` | WORKFLOW | 6 | 7 | S2 |
| FLEET-F014 | Optional telematics | `TelemetryObservation` | WORKFLOW | 6 | 7 | S2 |
| FLEET-F015 | B2B reports/controls | `FleetReport` | PROJECTION | 4 | 5 | S2 |
| VHUB-F001 | Vehicle canonical identity | `Vehicle` | WORKFLOW | 6 | 7 | S3 |
| VHUB-F002 | VIN/chassis/model facts | `VehicleIdentityClaim` | WORKFLOW | 6 | 7 | S2 |
| VHUB-F003 | Ownership/organisation relationship | `VehicleRelationship` | WORKFLOW | 6 | 7 | S2 |
| VHUB-F004 | Registration/licence/insurance docs | `VehicleDocument` | WORKFLOW | 6 | 7 | S2 |
| VHUB-F005 | Mileage history | `MileageReading` | PROJECTION | 4 | 5 | S2 |
| VHUB-F006 | Service history | `ServiceHistoryEntry` | PROJECTION | 4 | 5 | S2 |
| VHUB-F007 | Spare/order history | `PartHistoryEntry` | PROJECTION | 4 | 5 | S2 |
| VHUB-F008 | Assist/incident history | `IncidentHistoryEntry` | PROJECTION | 4 | 5 | S2 |
| VHUB-F009 | Maintenance reminders | `VehicleReminder` | WORKFLOW | 6 | 7 | S2 |
| VHUB-F010 | Document expiry reminders | `ExpiryReminder` | WORKFLOW | 6 | 7 | S2 |
| VHUB-F011 | Care eligibility | `EligibilityAssessment` | ASSESSMENT | 8 | 8 | S2 |
| VHUB-F012 | Record conflict/merge | `VehicleConflict` | CASE | 11 | 11 | S2 |
| VHUB-F013 | Vehicle sharing/delegation | `VehicleAccessGrant` | WORKFLOW | 6 | 7 | S3 |
| VHUB-F014 | Export/history package | `VehicleHistoryPackage` | PROJECTION | 4 | 5 | S2 |
| CARE-F001 | Plan catalogue/versioning | `CarePlan` | MASTER | 5 | 4 | S2 |
| CARE-F002 | Vehicle/customer eligibility | `CareEligibility` | ASSESSMENT | 8 | 8 | S2 |
| CARE-F003 | Membership/subscription | `CareMembership` | LIFECYCLE | 8 | 9 | S2 |
| CARE-F004 | Recurring payment mandate | `CareBillingAgreement` | MONEY | 11 | 15 | S3 |
| CARE-F005 | Entitlement ledger | `Entitlement` | LIFECYCLE | 8 | 9 | S2 |
| CARE-F006 | Maintenance reminders | `CareReminder` | WORKFLOW | 6 | 7 | S2 |
| CARE-F007 | Tech benefit invocation | `BenefitUse` | LIFECYCLE | 8 | 9 | S2 |
| CARE-F008 | Assist benefit invocation | `AssistEntitlementUse` | LIFECYCLE | 8 | 9 | S2 |
| CARE-F009 | Spare discount/benefit | `CarePricingBenefit` | LIFECYCLE | 8 | 9 | S2 |
| CARE-F010 | Grace/retry/suspension | `MembershipBillingState` | WORKFLOW | 6 | 7 | S3 |
| CARE-F011 | Renewal/cancellation | `CareMembership` | LIFECYCLE | 8 | 9 | S2 |
| CARE-F012 | Abuse/limit controls | `BenefitAbuseCase` | WORKFLOW | 6 | 7 | S2 |
| CARE-F013 | Benefit economics/contribution | `CareEconomicsProjection` | LIFECYCLE | 8 | 9 | S2 |
| CARE-F014 | Partner benefits | `PartnerBenefit` | LIFECYCLE | 8 | 9 | S2 |
| ASST-F001 | Incident intake | `AssistIncident` | REQUEST | 9 | 11 | S2 |
| ASST-F002 | Incident-scoped location | `IncidentLocation` | WORKFLOW | 6 | 7 | S2 |
| ASST-F003 | Coverage/eligibility | `AssistCoverage` | ASSESSMENT | 8 | 8 | S2 |
| ASST-F004 | Safety triage | `SafetyAssessment` | ASSESSMENT | 8 | 8 | S2 |
| ASST-F005 | Roadside provider matching | `AssistMatchSet` | ASSESSMENT | 8 | 8 | S2 |
| ASST-F006 | Tow partner dispatch | `AssistDispatch` | FULFILMENT | 11 | 11 | S2 |
| ASST-F007 | ETA/routing | `AssistRoute` | WORKFLOW | 6 | 7 | S2 |
| ASST-F008 | Emergency referral | `EmergencyReferral` | REQUEST | 13 | 11 | S2 |
| ASST-F009 | Provider arrival/check-in | `AssistCheckIn` | EXECUTION | 9 | 9 | S2 |
| ASST-F010 | Service/tow proof | `AssistServiceEvidence` | WORKFLOW | 6 | 7 | S2 |
| ASST-F011 | Payment/entitlement | `AssistCharge` | MONEY | 11 | 15 | S3 |
| ASST-F012 | Failed assistance fallback | `AssistFailure` | WORKFLOW | 6 | 7 | S2 |
| ASST-F013 | Damage/claim | `AssistClaim` | CASE | 11 | 11 | S2 |
| ASST-F014 | Partner SLA/quality | `AssistPartnerQuality` | CASE | 11 | 11 | S2 |
| ASST-F015 | Degraded communications | `AssistCommsState` | WORKFLOW | 6 | 7 | S2 |
| ASST-F016 | Vehicle Hub incident history | `IncidentHistoryEntry` | PROJECTION | 4 | 5 | S2 |
| PROJ-F001 | Project request/intake | `ProjectRequest` | REQUEST | 9 | 11 | S2 |
| PROJ-F002 | Assessment/site visit | `ProjectAssessment` | ASSESSMENT | 8 | 8 | S2 |
| PROJ-F003 | Scope/BoQ/quote | `ProjectQuote` | QUOTE | 9 | 10 | S3 |
| PROJ-F004 | Project creation | `Project` | WORKFLOW | 6 | 7 | S2 |
| PROJ-F005 | Team/project manager | `ProjectTeam` | WORKFLOW | 6 | 7 | S2 |
| PROJ-F006 | Milestones | `Milestone` | WORKFLOW | 6 | 7 | S2 |
| PROJ-F007 | Dependencies/critical path | `ProjectDependency` | WORKFLOW | 6 | 7 | S2 |
| PROJ-F008 | Materials/Spare dependencies | `MaterialRequirement` | WORKFLOW | 6 | 7 | S2 |
| PROJ-F009 | Budget/commitment/EAC | `ProjectBudget` | QUOTE | 9 | 10 | S2 |
| PROJ-F010 | Progressive funding | `ProjectFunding` | MONEY | 11 | 15 | S3 |
| PROJ-F011 | Variations | `ProjectVariation` | WORKFLOW | 6 | 7 | S2 |
| PROJ-F012 | Safety/quality packs | `ProjectSafetyQuality` | CASE | 11 | 11 | S2 |
| PROJ-F013 | Evidence/progress reporting | `ProgressEvidence` | PROJECTION | 4 | 5 | S2 |
| PROJ-F014 | Client visibility | `ClientProjectView` | PROJECTION | 4 | 5 | S2 |
| PROJ-F015 | Completion/handover | `Project` | EXECUTION | 9 | 9 | S2 |
| PROJ-F016 | Claims/disputes | `ProjectCase` | CASE | 11 | 11 | S2 |
| CORP-F001 | Organisation/positions/cost centres | `OrgStructure` | MASTER | 5 | 4 | S2 |
| CORP-F002 | Recruitment | `RecruitmentRequisition` | REQUEST | 9 | 11 | S2 |
| CORP-F003 | Onboarding/JML | `Employment` | WORKFLOW | 12 | 7 | S2 |
| CORP-F004 | Attendance/shifts/timesheets | `AttendanceRecord` | WORKFLOW | 9 | 7 | S2 |
| CORP-F005 | Leave | `LeaveRequest` | REQUEST | 9 | 11 | S2 |
| CORP-F006 | Performance/learning | `PerformanceCycle` | WORKFLOW | 6 | 7 | S2 |
| CORP-F007 | Compensation/payroll | `PayrollRun` | WORKFLOW | 12 | 7 | S3 |
| CORP-F008 | Zimbabwe statutory rules | `StatutoryRuleSet` | MASTER | 5 | 4 | S3 |
| CORP-F009 | Corporate accounting/AP/AR | `AccountingEvent` | WORKFLOW | 6 | 7 | S3 |
| CORP-F010 | FP&A/budget/forecast | `BudgetVersion` | QUOTE | 9 | 10 | S2 |
| CORP-F011 | Treasury/bank | `PaymentBatch` | MONEY | 11 | 15 | S3 |
| CORP-F012 | Procurement/vendors | `PurchaseOrder` | WORKFLOW | 11 | 7 | S2 |
| CORP-F013 | Internal inventory/WMS | `InventoryMovement` | WORKFLOW | 11 | 7 | S2 |
| CORP-F014 | Assets/facilities | `Asset` | WORKFLOW | 11 | 7 | S2 |
| CORP-F015 | Corporate IT/ITSM | `ITCase` | WORKFLOW | 6 | 7 | S2 |
| CORP-F016 | Contracts/e-sign/records | `Contract` | WORKFLOW | 11 | 7 | S2 |
| CORP-F017 | GRC/internal audit | `CorporateRisk` | WORKFLOW | 6 | 7 | S2 |
| CORP-F018 | Strategy/board/portfolio | `InternalInitiative` | WORKFLOW | 6 | 7 | S2 |
| CORP-F019 | SHEQ/continuity | `CorporateIncident` | WORKFLOW | 6 | 7 | S2 |
| CORP-F020 | DoA/SoD/access review | `ApprovalPolicy` | WORKFLOW | 10 | 7 | S3 |
| HEALTH-F001 | My Health patient/family consumer hub | `PatientAccount` | WORKFLOW | 6 | 7 | S3 |
| HEALTH-F002 | Practice OS | `Practice` | WORKFLOW | 6 | 7 | S3 |
| HEALTH-F003 | Pharmacy OS | `Pharmacy` | WORKFLOW | 6 | 7 | S3 |
| HEALTH-F004 | Hospital OS | `Facility` | WORKFLOW | 6 | 7 | S3 |
| HEALTH-F005 | Healthcare Transaction Network | `HealthTransaction` | WORKFLOW | 6 | 7 | S3 |
| HEALTH-F006 | Pharma Cloud / supply network | `PharmaSupplyRecord` | WORKFLOW | 6 | 7 | S3 |
| HEALTH-F007 | Emergency Network | `HealthEmergencyIncident` | WORKFLOW | 10 | 7 | S3 |
| HEALTH-F008 | Communication Gateway | `HealthChannelSession` | PIPELINE | 8 | 8 | S3 |
| HEALTH-F009 | Developer Platform / integration APIs | `HealthIntegration` | PIPELINE | 8 | 8 | S3 |
| HEALTH-F010 | Patient identity, consent & delegation | `HealthIdentity` | WORKFLOW | 6 | 7 | S3 |
| HEALTH-F011 | Clinical/interoperability record exchange | `ClinicalExchange` | PIPELINE | 8 | 8 | S3 |
| HEALTH-F012 | Prescription lifecycle | `Prescription` | WORKFLOW | 8 | 7 | S3 |
| HEALTH-F013 | Medicine catalogue/availability/dispensing | `MedicineFulfilment` | MASTER | 5 | 4 | S3 |
| HEALTH-F014 | Medical-aid / claims transaction handling | `HealthClaim` | CASE | 14 | 11 | S3 |
| HEALTH-F015 | Appointments/referrals/queueing | `CareEncounter` | REQUEST | 14 | 11 | S3 |
| HEALTH-F016 | Medicine delivery integration | `MedicineDelivery` | FULFILMENT | 11 | 11 | S3 |
| HEALTH-F017 | Clinical/pharmacy safety, compliance & audit | `HealthSafetyCase` | ASSESSMENT | 8 | 8 | S3 |
| HEALTH-F018 | Dial Health Command Centre & certification | `HealthDivisionState` | WORKFLOW | 6 | 7 | S3 |
