# DIAL Final 360° Ecosystem Audit & Development System — v1.6

**Status:** Final audited target architecture, feature-realization, customer-channel and secure-development baseline — v1.6  
**Audit date:** 2026-08-29  
**Repository audited:** `Vanguduza/dial` at commit `8945b57200612b119712ceccadb03a3784e85322`

## 0. Audit conclusion

DIAL is architecturally mature enough to proceed into repository-level engineering, but the planning corpus is substantially more mature than the current implementation repository. The repository has a strong T0 foundation and mature Cursor-oriented agent hygiene; most business capability remains specified rather than implemented.

The final system therefore treats product documents as **requirements/provenance**, and marks features implemented only when code and evidence prove them.

```text
                                      DIAL
                                       │
                         ┌─────────────┴──────────────┐
                         │                            │
                  DIAL BUSINESS OS             DIAL CORPORATE OS
                         │                            │
      ┌──────────────────┼─────────────────┐          │
      │                  │                 │          │
    Commerce          Services        Lifecycle      │
      │                  │                 │          │
 Spare/Groceries      Tech/Projects    Fleet/Hub     │
 Laundry              Assist           Care          │
      └──────────────────┼─────────────────┘          │
                         └─────────────┬──────────────┘
                                       │
                                 DIAL KERNEL
                                       │
 Party · Identity · Organisation · Catalogue · Pricing · Money/Ledger
 Jobs · Orders · Delivery · Evidence · Resolution · Trust · Compliance
 Events · Workflow · Notifications · Search · Analytics · AI · Simulation
                                       │
                                       ▼
                              DIAL COMMAND CENTRE
                       development + market + company control
```

## 1. Scope

Required Main DIAL business divisions:

1. Dial a Spare
2. Dial a Tech
3. Dial Groceries
4. Dial Laundry
5. Dial Fleet
6. Vehicle Hub
7. Dial Care
8. Dial Assist
9. DIAL Projects
10. **Dial Health / ZHOTN**
11. Corporate Management OS

Shared systems audited include Gateway/Identity/Party, Customer 360, Engagement, Supplier OS, Technician OS, Delivery, Catalogue/Fitment, Pricing/Promotions, Money/Ledger/Tax/FX, Treasury, RCE, Claims, Provider Quality, Trust/Guarantee, Network/Liquidity, Compliance, Partners, Evidence/Documents, Search, Notifications/WhatsApp, Development, Infrastructure/Observability, AI, Simulation, Experiments, CAPA and Command Centre.

## 2. Critical findings

### RED

**AUD-RED-01 — Claude Code-native setup is absent.**  
The repo has `AGENTS.md`, `.cursor/rules` and `.cursor/skills`, but no root `CLAUDE.md`, no `.claude/settings.json`, and no project `.mcp.json`.

**AUD-RED-02 — stale architecture instructions remain.**  
Older agent/planning material still references the discarded D-51 dual-capacity/owned-stock concept. Agency-only Spare is the locked direction. Stale instructions must be superseded and drift-tested.

**AUD-RESOLVED-03 — FixItNow licence classification corrected.**  
The previously selected `AyanSujon/FixItNow` publication had an unclear/missing licence at the studied revision, but the same FixItNow codebase was subsequently located under **`Sachinrajawat/FixItNow` with an MIT licence**. DIAL therefore classifies FixItNow as **`PORT-WHOLESALE`**, using the MIT-licensed publication as the pinned code/provenance source. Normal commit pinning, notice preservation, SBOM/security scanning and DIAL boundary replacement still apply; there is no longer a special licence quarantine solely because the AyanSujon publication lacked a clear licence.

**AUD-RED-04 — historical evidence inheritance needs migration regression revalidation.**  
Historical artifacts remain provenance; changed-tree gate inheritance requires applicable regression. E6a Command Centre has no located valid historical sign-off and cannot silently inherit green.

### AMBER

- Current code implementation is mostly T0; a feature registry must distinguish specified from built/tested.
- Groceries, Laundry and Corporate Management postdate older package/control-room plans and must be fused into the repo registry.
- Fleet, Vehicle Hub, Care, Assist and Projects had less dossier depth; this pack supplies planning-level feature/eventuality maps.
- Main DIAL and Corporate donor vocabularies were inconsistent; this plan creates one global classification.
- repeated donor/web research wastes context; research records now require freshness, triggers and budgets.
- Cursor and Claude instruction sets require a single neutral canon to prevent divergence.

### Division correction

**HEALTH-DIVISION-001:** **Dial Health / ZHOTN is a required standalone DIAL business division.** It is not an optional portfolio candidate and must not be absorbed into another DIAL branch or Corporate Management. Its product family, clinical/health-data authorities, regulatory controls and safety certification remain specialized, while shared DIAL capabilities are consumed through explicit anti-corruption contracts. Dial Health receives its own Command Centre division room and development/certification inventory.

## 3. Source-of-truth rule

Every aggregate has one canonical writer.

| Truth | Owner |
|---|---|
| person/account | Party + Identity |
| customer relationship | Customer 360 |
| vehicle | Vehicle Hub/Vehicles |
| product/fitment claim | Catalogue/Fitment |
| supplier offer | Supplier OS |
| customer order | Orders/branch order aggregate |
| job | Jobs |
| project | Projects |
| delivery job | Delivery |
| payable price | deterministic Pricing |
| payment state | Payments |
| journal | Ledger |
| tax/fiscal event | Tax |
| employee/employment | Corporate People |
| payroll result | Payroll |
| internal corporate stock | Corporate Inventory |
| resolution case | RCE |
| Command Centre metric | projection only |
| AI insight | Intelligence projection only |

## 4. Feature Realization Contract

No material feature enters implementation without:

```yaml
feature_id:
module:
user_outcome:
actors:
entry_points:
screens:
domain_owner:
aggregate:
state_machine:
commands:
queries:
data:
events:
permissions:
approval_or_policy:
money_effect:
inventory_effect:
delivery_effect:
integrations:
offline_degraded:
security_privacy:
eventualities:
observability:
command_centre:
ai_authority:
donor_records:
tests:
evidence:
current_gate:
```

## 5. Global eventuality completeness

Every material workflow considers where applicable:

missing/invalid input; wrong identity/permission; ineligible actor/item/location; duplicates/replays; stale/concurrent mutation; capacity shortage; partial completion; timeouts; cancellation; substitution; quantity/weight/scope/price variance; payment failures/refunds; no-shows; safety/compliance holds; fraud/trust signals; missing/conflicting evidence; provider outages; offline/degraded operation; delivery failure; claims/appeals; tax/accounting/reconciliation; data correction/merge; operator repair; privacy/retention/legal hold; continuity/deactivation.

## 6. Donor adoption vocabulary

`PORT-WHOLESALE-QUARANTINE`, `PORT-WHOLESALE`, `PORT-SELECTED-MODULE`, `PORT-ALGORITHM-ENGINE`, `PORT-SCHEMA-WORKFLOW`, `PORT-UX-UI`, `LIBRARY`, `INTEGRATE-SERVICE`, `EXTERNAL-ADAPTER`, `REFERENCE`, `CONFORMANCE-REFERENCE`, `QUARANTINE-PENDING-LICENCE`.

Licence state is tracked separately.

## 7. Coherence locks

- One Party/Identity graph.
- One DIAL Ledger.
- One Delivery SoR.
- One RCE case model.
- One Customer 360.
- One supplier/provider relationship graph.
- One Catalogue/fitment authority.
- One event envelope/outbox model.
- One evidence/audit model.
- One capability/branch activation model.
- AI never determines binding payable amounts or writes/releases money.
- Simulation never mutates production.
- Official WhatsApp Cloud API/Flows only.
- MapLibre/Nominatim/OSRM/VROOM; Delivery owns dispatch truth.
- Human-readable refs in operator UI.
- Generic AI-generated production UI prohibited.
- Donor code requires provenance and DIAL boundary replacement.
- explicit scope subtraction allowed; silent feature loss prohibited.
- changed-tree evidence inheritance requires migration regression revalidation.

## 8. Development dependencies

```text
PROJECT TRUTH / REGISTRIES
        ↓
KERNEL CONTRACTS
        ↓
IDENTITY / PERMISSIONS / AUDIT
        ↓
EVENTS / OUTBOX / WORKFLOW
        ↓
MONEY / DELIVERY / CATALOGUE / JOB CORE
        ↓
BUSINESS + CORPORATE DOMAINS IN PARALLEL
        ↓
COMMAND CENTRE PROJECTIONS + CONTROLS
        ↓
AI / SIMULATION / EXPERIMENTATION
        ↓
CROSS-DOMAIN CERTIFICATION
```

This is dependency order, not reduced product scope.

## 9. Development harness doctrine

The repo must answer without rereading a giant master:
1. What Feature ID is changing?
2. Which locked decisions constrain it?
3. Which code/data/events own it?
4. What evidence proves correctness?

Use compact committed Project Truth, machine-readable registries, JIT context, skills and subagents.

## 10. Completion

DIAL is certified only when all required division/platform rooms exist, all material FRCs have eventuality coverage, ownership is architecture-tested, money/stock/job/delivery single-writer invariants pass, donor provenance/parity is proven, security/degraded paths pass, migration revalidation is green, and Command Centre development state reflects code evidence rather than planning claims.

---

## 11. Canonical development execution document

The concise dependency plan is not the development-agent contract.

The canonical full execution document is:

`07_IMPLEMENTATION/DIAL_MASTER_DEVELOPMENT_PLAN_AND_PROMPT_v1_2.md`

It contains the repository bootstrap, scope, technical platform, Feature-ID/FRC loop, donor protocol, division/corporate/health implementation rules, Command Centre strategy, Claude Code execution model, testing/security/resilience gates, initial backlog, completion contract and a directly copy-pasteable Master Development Invocation.

---

## 12. Final Feature Realization Layer — v1.3

The 186 top-level Feature IDs are now backed by:
- 186 realization records;
- 1,674 mandatory realization facets;
- 62 supporting capabilities;
- 6 eventuality playbooks;
- 166 customer endpoint mappings.

The authoritative execution layer is under `11_FEATURE_REALIZATION/`, `12_CLIENT_EXPERIENCE/`, `13_CUSTOMER_SERVICE/`, `14_CATALOG_VISUAL_EPC/` and `15_CERTIFICATION/`.

Client strategy is locked to:
**DIAL Consumer super-app + standalone Dial Health/My Health + DIAL Business**, with separate operational/provider apps.

---

## 13. Public Home / Universal Identity / WhatsApp Channel — v1.4

- `/` is a polished public DIAL service router; authentication is no longer the landing product.
- `nobruf/shadcn-landing-page` (MIT) is the primary selected-module/UX donor.
- customer credentials are universal through one canonical DIAL Identity/Auth realm; authorization, Health consent and Business/staff relationships remain scoped.
- DIAL owns official WhatsApp Cloud API/Flows.
- Chatwoot is integrated as the human support console through a DIAL API-channel bridge.
- WhatsApp covers service routing, branch ordering/booking, approvals, payment initiation/status, fulfilment issues, evidence, automated support and human escalation.
- Paynow and ContiPay remain server-side DIAL payment adapters; authoritative provider state and reconciliation determine payment outcome.

---

## 14. Premium Solutions Environment & Security — v1.5

DIAL Home visual direction is now locked as the **Premium Solutions Environment**: clean, modern, professional, solution-rich and restrained. The selected MIT shadcn landing repo is an engineering donor only, not the final design.

Security is now a ninth mandatory realization facet for all 186 top-level Feature IDs.

The v1.5 security layer contains:
- 105 required security controls;
- 186 Feature Security Profiles;
- 1,674 total mandatory realization facets;
- ASVS/API/MASVS/SSDF-aligned release gates;
- complete mapping of the 20 security measures supplied by the user;
- web/API/mobile/data/upload/payment/WhatsApp/support/AI/donor security;
- security toolchain and CI;
- vulnerability/incident/restore/rotation requirements.

Canonical security entry:
`17_SECURITY/DIAL_SECURITY_MASTER_ARCHITECTURE_v1.md`

---

## 15. Payment Channels, Finance Books, Positions & Onboarding — v1.6

DIAL now has a complete five-channel payment architecture:
Cash, EcoCash Direct USSD Push, Paynow, ContiPay and PayPal.

All use canonical PaymentIntent/PaymentEvent/Ledger authority. Browser returns, WhatsApp completion and unverified callbacks cannot mark a transaction paid.

Every DIAL business unit receives:
- dedicated Cash/EcoCash/Paynow/ContiPay/PayPal accounts and journals;
- non-posting Combined Collections control + combined journal projection;
- Petty Cash account/journal;
- Returns & Refunds journal;
- Disputes/Chargebacks journal.

Finance statements use clean Debit/Credit/Balance presentation and support full transaction detail plus server-generated PDF exports.

Petty cash is funded through controlled same-BU requisition/approval/release/custody by default.

Company Positions now own role-based contract templates, PermissionBundles, FinancialAuthority and onboarding requirements. Employee onboarding includes image-picker/camera photo capture, contract snapshot/e-sign, payroll/access/assets/training/SHEQ readiness.

Canonical v1.6 chapter:
`18_FINANCE_PEOPLE/`.

