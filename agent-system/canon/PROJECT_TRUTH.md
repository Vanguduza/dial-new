# DIAL Project Truth — Compact Development Entry Point

## Product
One operating platform that instantiates multiple business divisions and operates DIAL the company.

## Required DIAL business divisions
Spare, Tech, Groceries, Laundry, Fleet, Vehicle Hub, Care, Assist, Projects, **Dial Health/ZHOTN**.

## Corporate
Corporate Management OS is first-class and horizontal to the business divisions.

## Dial Health
Dial Health/ZHOTN is a **required standalone division**, not a portfolio candidate. Health-specific clinical/pharmacy/funder/emergency/safety authorities remain inside the Dial Health architecture while shared DIAL capabilities are consumed through explicit contracts.

### Dial Health source-of-truth lock — v6.1
The current singular specialist authority is:

`Dial_Health_ZHOTN_v6.1_Singular_Source_of_Truth_Master.md`

Reference date: **6 September 2026**.

It supersedes v6.0 and all earlier independent Health masters/closure packs for implementation intent. Main-DIAL `docs/dial/final-audit/04_DIVISIONS/HEALTH_AUDIT.md` is a compact bridge into that specialist source; it is not a replacement for the Health master.

`HEALTH-F014` now includes the incorporated **Claims Control Centre + Real-Time Financial Clearance + Shortfall Prevention + Claims Policy Studio + synchronous/deferred adjudication + Funding Stack/COB + claim preflight + coding/validation registry + rule-driven human review + payment/remittance/reconciliation + local/private Hermes claims intelligence** closure.

The former standalone claims Rev 3 document is provenance/history only after incorporation into v6.1. Development must not treat it, an AI research note, UI board or donor reference as an independent competing source of truth.

For claims implementation, the v6.1 master maps **330 atomic features to 113 canonical claims-related pages with zero orphan pages**. `MAPPED / SPEC-COMPLETE` is not implementation evidence.

## Non-negotiable
- DIAL domains remain SoR; donors never own canonical money/jobs/orders/delivery/auth/compliance.
- agency-only Spare; no discarded D-51 owned-stock principal.
- official WhatsApp Cloud API/Flows only.
- Delivery SoR + locked maps/routing stack.
- AI never determines binding payable values or posts/releases money.
- simulation cannot mutate production.
- human-readable operator refs.
- generic AI UI prohibited.
- FixItNow = `PORT-WHOLESALE`; canonical licensed publication for import is `Sachinrajawat/FixItNow` under MIT, pinned to an exact revision with notice/provenance preserved.
- changed-tree gate inheritance requires migration regression revalidation.
- E6a Command Centre has no automatic historical green.
- Command Centre target is full.
- Corporate donor assimilation follows Corporate OS v1.1.


## Growth, marketing & promotions lock
DIAL Growth, Marketing & Promotions Control Centre (GMPC) is a first-class horizontal Corporate commercial operating layer across DIAL divisions.
- Optimise for verified profitable contribution/customer value, not vanity engagement.
- Promotions and binding transaction eligibility are deterministic; Hermes/AI may recommend, simulate, draft and act only inside approved autonomy/budget/policy envelopes.
- `PLAT-F014` remains the one cross-division margin/pricing calculation authority; Finance/Ledger remains the money authority.
- External social/ad/marketing platforms are adapters/execution surfaces, never canonical DIAL campaign/customer/promotion/money truth.
- Capacity-aware growth reads Inventory, Supplier, Tech and Delivery truth; it does not invent fulfilment capacity.
- `GMPC-F200..F211` consume `DKRF-F001..F022` as the commercial retrieval profile; no second RAG/vector source of truth.
- Sensitive Dial Health information is excluded from ordinary commercial targeting unless an explicit lawful-purpose contract permits the narrowly scoped use.
Canonical specification: `docs/dial/final-audit/27_GROWTH_MARKETING_PROMOTIONS/DIAL_GROWTH_MARKETING_PROMOTIONS_CONTROL_CENTRE_REV2.md`.

## Development
Resolve a Feature ID first. Use JIT context. Completion claims require fresh evidence.

### Versioned Engineering Knowledge Layer (VEKL) lock
DIAL VEKL Rev 2, with the `DEC-024` **VEKL 2.1 resolver amendment**, is the governed federated engineering knowledge and capability layer. Agent Skills are one resource class alongside official docs, repositories, releases, maintainer issues/discussions, package registries, security advisories, qualified tools/plugins/MCPs, DIAL rules/hooks/loops and bounded community corroboration. Every material Oracle packet resolves one persisted Engineering Knowledge Activation Manifest after Feature/JIT context. Hard eligibility is resolved before ranking; Skills have one exact-pin selection owner; optional resources compete only within deterministic `(selection_purpose, selection_role)` slots; complementary roles may coexist; selected resource registry identity is fingerprinted; and descriptor-only context is the default unless a directly relevant authority excerpt is explicitly required. Input order may not change selected resource identities. The same manifest provenance follows Sol→Sonnet failover.

The Oracle research scheduler uses exact project-aware GPT-5.6 Sol, falling back to exact Claude Sonnet 5, to presearch the next 3–5 dependency-safe packets implied by current Project Truth, Development Plan and mission state; this research is read-only, non-authoritative and cannot reprioritise the programme. Executable external capabilities still require exact-version donor/security/conflict/eval/manager qualification; community sources are corroboration/discovery only. No public research receives secrets, payment/customer records or identifiable Health data. Learned wrappers may improve procedure/selection but may not create product requirements, authority, money/Health policy, source-of-truth changes or gate claims. Canon/FRC/security/current code/evidence always win. Active canon: `docs/dial/final-audit/06_DEVELOPMENT_SYSTEM/DIAL_VERSIONED_ENGINEERING_KNOWLEDGE_LAYER_FEDERATED_RESOURCES_HERMES_v2.md` (`DEC-020`, amended by `DEC-024`); Rev 1 remains provenance for the immutable-skill foundation (`DEC-019`).

### Technical cohesion + product telemetry lock
`DEC-024` makes **one canonical authority per concern** a machine-checkable DIAL law. `agent-system/registries/TECHNICAL_COHESION_AUTHORITY_REGISTRY.json` is only an enforcement projection of canon, never an independent source of truth. Supporting tools may observe, execute or present through typed contracts but may not silently promote themselves into business authority.

PostHog is adopted through the DIAL-owned `@dial/product-telemetry` boundary for product/web analytics, privacy-gated replay/heatmaps, bounded staff/dogfood/progressive exposure and GMPC-owned experiment assignment/measurement. DIAL versioned domain events and event taxonomy remain the truth for what happened, while DIAL database activation/certification gates remain above every PostHog flag. PostHog failure is non-transaction-critical and cannot block checkout, payment, booking, dispatch, fulfilment, support or authorization. PostHog must not become money/pricing/promotion-value/eligibility/compliance/Health/claims/BI/survey/AI-observability/AI-evaluation/technical-observability/workflow authority; Formbricks, Langfuse, Promptfoo, OpenTelemetry/Prometheus/Loki/Tempo/Grafana, Metabase, Command Centre and Temporal/BullMQ/n8n retain their distinct canonical roles.

### Oracle development-readiness fallback lock
`DEC-021` preserves the exact runtime order **GPT-5.6 Sol → Claude Sonnet 5 → no runtime**. If exact Sol identity is proven but its provider is temporarily account/rate/model limited, DIAL may become development-ready through exact Sonnet 5 only after a clean/current repository verification, real external-queue fallback canary, live VEKL v2 fallback activation, live 3–5-packet project-aware research forecast, DIAL-only continuity soak and current control-plane fingerprint all pass. This state is `DEVELOPMENT_READY_FALLBACK`: it authorizes development only through the persistent Oracle orchestrator and is explicitly not `PRODUCTION_GREEN`. Authentication/process failure is not an eligible capacity fallback. Full production-green dual-runtime/process/recovery certification remains mandatory once Sol is healthy.

### Sol capacity-preservation lock
`DEC-022` reserves GPT-5.6 Sol inference for meaningful manager/complex engineering work and the irreducible live proofs required by control-plane certification. Deterministic process/auth/config checks, fresh runtime health and a fingerprint-bound exact-identity cache run before any Sol inference. Supervisor/service restart alone does not invalidate still-valid identity evidence. When Sol reports an account/rate/model capacity boundary, its retry/reset boundary is persisted and ordinary packet attempts, health probes and VEKL Sol presearch are suppressed until that boundary; exact Sonnet 5 carries work under the existing locked fallback policy. Ahead-of-work research invalidates on semantic project truth, plan, priority or active-feature/gate change, not volatile mission turn/packet/state transitions. Full `PRODUCTION_GREEN` may force the minimum live proofs after a control-plane change, but duplicate fixed-token/recovery calls are prohibited where the same live evidence already satisfies the contract.

### Hermes xKiro Auxiliary Intelligence Fabric lock
`DEC-023` admits xKiro only as Hermes' non-authoritative Auxiliary Intelligence Fabric (HAIF). It is never a DIAL manager runtime, development fallback, source of truth, repository writer, deployment authority, money authority or Health authority; the manager chain remains exactly **GPT-5.6 Sol → Claude Sonnet 5 → no runtime**. DIAL and DDE use separate xKiro accounts, credentials, control roots, queues, evidence, usage/quota ledgers and control tokens even when one versioned HAIF runtime implementation is deployed on the shared Oracle host. HAIF v1 is hard `FREE_ONLY`, uses only the benchmarked elite free-model set, requires account-specific execution proof, and routes `PUBLIC` data only until a time-bounded provider-governance gate explicitly authorizes sanitized internal data. Raw restricted/secret/customer/payment/identifiable Health data never enters xKiro. HAIF results are provenance-carrying auxiliary evidence; conflicts may emit only a typed premium-adjudication candidate for the existing authorized project router. See `docs/orchestration/HERMES_XKIRO_HAIF.md`.

## Final realization layer
The 309 top-level features are anchors, not the completeness boundary.
Every feature must implement its 9 realization facets, applicable supporting capabilities, eventuality playbooks, customer/operator endpoints where exposed, donor/source transformation and support/escalation requirements.
The 65 `GMPC-F*` anchors are the adopted Growth, Marketing & Promotions Control Centre extension; their 195 atomic feature-to-page mappings remain the lower-level implementation completeness boundary in the GMPC canon.

For Dial Health high-consequence domains, the specialist v6.1 atomic feature/page contracts and Health-specific security, clinical-safety, claims, money, privacy and regulatory gates additionally apply.

## Client app lock
- DIAL Consumer: unified modular super-app for non-health consumer branches.
- Dial Health/My Health: standalone specialist app/web.
- DIAL Business: B2B workspace.
- Operational/provider apps remain separate.

## Customer service lock
DIAL Support OS is horizontal. Automated support must be grounded/tool-scoped and hand off to human Chatwoot agents with full context. Formal disputes/liability/compensation escalate to RCE.

Health claims/clinical/pharmacy support cannot expose or resolve protected specialist matters through a generic Main-DIAL support path; it must respect the Dial Health privacy, role, purpose and escalation architecture.

## EPC/visual lock
The parallel EPC/hero transformation specialist specification must integrate through DIAL Vehicle Hub, Catalogue/Fitment, VisualAssetRegistry and EPC adapter contracts. Generated assets are navigation content, never catalogue truth.

## Home / identity lock
`/` is a public service-router home, not an auth wall.
One DIAL Identity credential realm serves all customer-facing divisions. Permissions/relationships/consents remain scoped.

## WhatsApp lock
DIAL owns the official Cloud API/Flows gateway.
Chatwoot is a bridged human-support console through the Support architecture, not the canonical Meta/business-state owner.
WhatsApp must support structured branch transactions, eligible payment initiation/status, fulfilment issues, automated support and human escalation. Paynow/ContiPay always use DIAL PaymentIntent and authoritative provider confirmation.

Health WhatsApp/AI interactions remain behind Dial Health's specialist gateway/privacy/tool boundaries. Identifiable health/claim data is not shipped to general external AI by default.

## DIAL Home visual lock
DIAL Home final art direction is `Premium Solutions Environment`.
The shadcn landing donor is a structural/component source only; the final experience must exude solutions, professionalism, trust and modern premium restraint.

## Security lock
Security is a mandatory ninth realization facet for every top-level Feature ID.
Use the feature Security Profile and Security Control Registry. Functional completion without applicable security evidence cannot advance to production-green.
Supabase publishable key may be client-side; secret/service-role keys never are.
RLS is mandatory on exposed tables.
Server authorization + RLS + typed commands + negative tests are required.

Health additionally applies sensitive-health-data, purpose, authority, local-data-plane, AI-egress and regulatory controls from the v6.1 specialist master.

## Payment channels lock — v1.6
DIAL accepts Cash, EcoCash Direct USSD Push, Paynow, ContiPay and PayPal through one canonical PaymentIntent/PaymentEvent/Ledger architecture.
Provider/customer action is not settlement.
Each BU has dedicated channel accounts/journals plus a non-posting combined control/journal view, Petty Cash and Returns journal.
No division/payment provider owns a second ledger.

Health funding-stack/claim settlement may consume shared payment rails through explicit contracts, but ClaimsService/Funding Stack/Health funder logic does not become a competing DIAL ledger.

## Finance UI lock — v1.6
Finance accounts/journals use bank-statement-style rows:
Date/Time | Ref | Description | Debit | Credit | Running Balance | Status.
Transactions open full permission-filtered detail and support single-transaction PDF export.
Selected date ranges support server-generated statement PDF export with opening/closing balances and separate balances per currency.

## Petty cash lock — v1.6
Each BU Petty Cash is funded through Requisition → Approval → Release → Custodian acknowledgement from an eligible settled same-BU source account by default.
Request/approve/release/custody authority derives from Position/FinancialAuthority with DoA/SoD.

## Position/onboarding lock — v1.6
CompanyPosition is versioned and includes role-based contract template, permission bundles, financial authority, job description, compensation defaults, SHEQ/training/assets/PPE requirements.
Onboarding captures employee photo via image picker/camera and processes it through private secure upload.
Signed employment contracts are immutable snapshots; position template changes do not rewrite history.


### VEKL 2.2 knowledge-graph and truth-evolution lock

DIAL VEKL 2.2 REV 2 (`DEC-026`) is the canonical development-knowledge topology over VEKL 2.1. The graph is a rebuildable projection, not authority; Development Units have stable lineage plus immutable revisions; graph-first retrieval and a pinned determinism envelope bound all material knowledge resolution; every material dispatch emits immutable `KnowledgeResolutionTrace` evidence; UI-bearing units require the Product Experience route; stale execution-knowledge bindings fail closed; research conflicts may enter deterministic challenge review but remain withheld from ordinary execution; and canon evolution is owner-only, exact-delta, supersession/revision based.
