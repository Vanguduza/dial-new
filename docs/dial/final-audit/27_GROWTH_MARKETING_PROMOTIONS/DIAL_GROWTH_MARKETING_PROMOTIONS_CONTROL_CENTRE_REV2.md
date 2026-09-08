# DIAL GROWTH, MARKETING & PROMOTIONS CONTROL CENTRE
## Canonical Product, Commercial, AI, UX, Data, RAG & Technical Engineering Specification — Rev 2

**Document status:** ADOPTED DIAL CANON EXTENSION — integrated into the project source of truth on 2026-09-06  
**Platform:** Dial ecosystem  
**Scope:** Growth, marketing, promotions, social media, paid media, content, audience intelligence, customer journeys, sales growth, attribution, experimentation, budgets, supplier-funded campaigns, AI-assisted optimisation, commercial analytics, and the Commercial RAG & Knowledge Fabric  
**Out of scope:** DDE development-environment functionality. Dial and DDE are separate systems and MUST NOT be conflated.  
**Primary principle:** Optimise for profitable customer value, not vanity engagement.
**Machine allocation:** 65 `GMPC-F*` feature anchors and 195 atomic `A001..A195` controls are allocated into the canonical DIAL registries.
**Authority relationship:** GMPC consumes existing DIAL Finance, `PLAT-F014` pricing/margin, DKRF, Identity/Consent, Inventory, Delivery and business-unit sources of truth; it does not replace them.

---

# 0. DOCUMENT PURPOSE

This document translates the Dial Growth, Marketing & Promotions Control Centre (GMPC) from product intent into an implementation-ready system specification.

It is intended to prevent the common failure mode where a project has impressive planning documents but weak software closure. Every documented capability in this specification is therefore mapped through:

1. business intent;
2. canonical feature definition;
3. user-visible behaviour;
4. page/screen ownership;
5. backend service responsibility;
6. API/event contract;
7. data persistence;
8. permissions and approval rules;
9. AI/Hermes role;
10. failure behaviour;
11. observability;
12. testable acceptance criteria.

The GMPC is not merely a marketing dashboard. It is the commercial operating layer that closes the loop from market intelligence to profitable business outcome.

Rev 2 additionally establishes the **Dial Commercial RAG & Knowledge Fabric** as a first-class subsystem. RAG is not treated as a generic vector-search add-on. It is a governed retrieval architecture that combines structured operational facts, semantic knowledge, full-text evidence, entity relationships, time-series analytics, R2 artefacts, policies and historical commercial learning. Live financial/operational facts remain authoritative in their source systems; RAG provides evidence, historical learning and context rather than replacing transactional truth.

---

# 1. PRODUCT MISSION

GMPC shall connect:

**market intelligence → growth opportunity → strategy → campaign → promotion → content → social → paid media → customer journey → lead/quote/order/job/membership → fulfilment → revenue → contribution margin → retention → learning**

The system shall answer questions such as:

- Which campaigns created the most profitable customers?
- Which promotions increased conversion without destroying contribution margin?
- Which social posts should be amplified into paid campaigns?
- Which customer segments are most responsive by channel and timing?
- Which products or services should NOT be promoted because operations cannot fulfil incremental demand?
- Which suppliers should co-fund campaigns based on measurable demand?
- Which campaign spend should be paused or reallocated?
- What actually caused a sale: social, search, WhatsApp, promotion, salesperson, remarketing or organic demand?
- Which growth opportunities exist across Dial business units?
- What should Dial do next, within management-approved limits?

---

# 2. COMMERCIAL OPERATING PRINCIPLE

GMPC MUST optimise in this order:

```text
Business Profit
    ↑
Contribution Margin
    ↑
Gross Margin
    ↑
Revenue
    ↑
Conversions
    ↑
Qualified Demand
    ↑
Engagement
    ↑
Reach / Impressions
```

Vanity metrics may be displayed but MUST NOT be treated as ultimate success criteria.

---

# 3. DIAL-WIDE BUSINESS SCOPE

GMPC shall support the entire Dial commercial ecosystem:

| Business Unit / Domain | Representative Growth Objectives |
|---|---|
| Dial a Spare | Product sales, category discovery, repeat parts consumption, fitment conversion, supplier campaigns |
| Dial a Tech | Service bookings, technician utilisation, maintenance plans, service recall |
| Dial Groceries | Basket growth, repeat purchase, category campaigns, Rounds participation |
| Dial Care | Membership acquisition, asset coverage, upgrade, renewal, benefit utilisation |
| Dial Health | General marketing, provider awareness, member communication, compliant health education |
| Logistics | Delivery proposition, delivery service utilisation, commercial SLA positioning |
| B2B | Fleets, mines, farms, workshops, factories, institutions, corporates |
| Supplier Ecosystem | Sponsored campaigns, co-funded promotions, product launches, demand intelligence |

Campaigns MAY span one or multiple business units, subject to privacy, commercial and regulatory constraints.

---

# 4. NON-NEGOTIABLE DESIGN RULES

1. **Dial and DDE remain separate systems.**
2. **Promotions are deterministic.** AI may recommend but MUST NOT decide final transaction eligibility.
3. **No unrestricted AI access to customer data.**
4. **Sensitive health data may not be repurposed for ordinary commercial targeting without explicit lawful basis and policy approval.**
5. **No promotion may bypass margin floors.**
6. **No marketing spend may exceed approved budget boundaries.**
7. **No campaign may claim success before fulfilment and financial outcome are known.**
8. **External SaaS tools are execution surfaces, not sources of truth.**
9. **Campaign and promotion actions must be auditable.**
10. **Every external write action must be idempotent.**
11. **Every connector must support stale/degraded/error state visibility.**
12. **Marketing demand generation must be capacity-aware.**
13. **Supplier sponsorship must be visibly distinguishable from organic ranking.**
14. **Customer communication preferences and suppression rules override campaign preference.**
15. **AI autonomy is policy-bound, explainable and revocable.**
16. **RAG is not a source of truth for live transactional numbers.** Current spend, inventory, prices, campaign state, balances and operational capacity MUST come from authoritative structured systems.
17. **Retrieval is hybrid.** Vector similarity alone is insufficient for commercial decisioning.
18. **Every retrieved item MUST carry provenance, freshness, authority and sensitivity metadata.**
19. **RAG retrieval MUST be permission-, purpose- and business-unit-aware before context reaches any model.**
20. **Superseded knowledge MUST NOT outrank current policy or current source-of-truth facts.**
21. **Commercial learning MUST be outcome-linked.** Campaign memory is only promoted as reusable knowledge when the associated conversion, fulfilment and financial outcomes are known.

---


# 4A. CANONICAL REPOSITORY INTEGRATION LOCKS

This Rev 2 document is an adopted extension of the DIAL v2 source of truth. Its feature IDs are registered in the machine authority and therefore inherit the normal DIAL gate ladder, nine realization facets, security profiles, eventuality requirements and evidence rules.

1. **Pricing and margin:** `PLAT-F014` remains the single cross-division calculation authority defined by `../26_MARGIN_AND_PRICING/MARGIN_ENGINE_SPEC_v1.md`. GMPC consumes evidenced margin/contribution outputs for simulation, promotion guards and campaign profitability; it MUST NOT implement another margin engine or price setter.
2. **Money and settlement:** GMPC budgets, supplier-funding views and campaign spend are governed projections/controls over canonical Finance/Ledger records. GMPC never posts binding ledger truth directly.
3. **RAG/knowledge:** `DKRF-F001..F022` and `../23_KNOWLEDGE_RETRIEVAL_FABRIC/DKRF_ARCHITECTURE_v1.md` remain the horizontal knowledge/retrieval fabric. `GMPC-F200..F211` are the commercial domain profile and control surfaces **on DKRF**, not a parallel vector/RAG platform.
4. **External marketing platforms:** Metricool, Meta, Google, TikTok and other approved services are connector/execution surfaces behind the DIAL Tool Gateway. DIAL retains campaign, customer, consent, promotion, budget, attribution and commercial outcome truth.
5. **Customer and Health data:** Identity, consent and privacy policy are enforced before audience construction or model context assembly. Sensitive Dial Health information is not ordinary marketing segmentation material and remains inside the specialist Health authority unless an explicit lawful-purpose contract permits a narrowly scoped use.
6. **Operations:** inventory, supplier, technician, delivery and fulfilment capacity are read from their canonical DIAL domains. GMPC may suppress or limit demand generation but never invent capacity.
7. **AI/Hermes:** Hermes is a DIAL business intelligence/orchestration consumer of these contracts. It may propose and execute only inside configured autonomy boundaries; deterministic policy remains decisive for binding promotions, budgets and financial controls.

---

# 5. TOP-LEVEL ARCHITECTURE

```text
                         DIAL MANAGEMENT
                                │
                   Growth Strategy & Governance
                                │
                       ┌──────────────────┐
                       │       GMPC       │
                       └─────────┬────────┘
                                 │
                        Hermes Growth Layer
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
   Intelligence              Execution                Control
        │                        │                        │
 Opportunities              Campaigns                Budgets
 Audiences                  Promotions               Policies
 Market/Competitor          Content                  Approvals
 Attribution                Social                   Compliance
 Forecasting                Paid Media               Audit
 Investigations             CRM/Journeys             Autonomy
        │                        │                        │
        └────────────────────────┼────────────────────────┘
                                 │
                 Commercial RAG & Knowledge Fabric
                                 │
        ┌──────────────┬─────────┼──────────┬─────────────┐
        │              │         │          │             │
 Structured        Semantic   Full-text   Graph/Entity  Time-series
 Retrieval         Retrieval  Retrieval   Retrieval     Retrieval
        │              │         │          │             │
        └──────────────┴─────────┼──────────┴─────────────┘
                                 │
                         Evidence Normaliser
                                 │
                    Freshness / Authority / Policy
                                 │
                         Context Assembly
                                 │
                         Dial Tool Gateway
                                 │
       ┌──────────┬───────────┬───────────┬──────────┬──────────┐
       │ Metricool│ Meta      │ Google    │ TikTok   │ WhatsApp │
       └──────────┴───────────┴───────────┴──────────┴──────────┘
                                 │
                           Dial Event Fabric
                                 │
       ┌──────────┬──────────┬──────────┬──────────┬───────────┐
       │ Spare    │ Tech     │ Groceries│ Care     │ Health    │
       └──────────┴──────────┴──────────┴──────────┴───────────┘
                                 │
                           Dial Data Fabric
                                 │
 Operational DB + Analytics/Time-Series + Search + Graph + R2 + Memory
```

## 5.1 Source-of-truth routing rule

The query planner MUST route questions to the correct authority:

```text
Current transactional fact     → Operational DB / domain service
Current ad/social metric        → Connector-synchronised analytics store
Current inventory/capacity      → Operational domain service
Policy / approved rule          → Versioned policy store
Historical business outcome     → Analytics + Commercial Learning Store
Document / narrative knowledge  → Semantic + full-text RAG
Entity relationship             → Entity/graph retrieval
Large artefact / evidence pack  → R2
Long-term reusable AI insight   → Governed Hermes commercial memory
```

A semantic embedding result MUST NOT override a newer authoritative structured record.

# 6. DOMAIN BOUNDED CONTEXTS

The GMPC implementation SHALL be split into the following bounded domains:

1. Growth Command
2. Opportunity Intelligence
3. Campaign Management
4. Promotions
5. Audience & Customer Growth Intelligence
6. Customer Journeys
7. Content Studio
8. Social Media
9. Paid Media
10. SEO & Discovery
11. Sales Growth
12. Merchandising
13. Experiments
14. Attribution
15. Budgeting & Commercial Finance
16. Supplier/Partner Marketing
17. Brand Governance
18. Approvals
19. AI Agents & Autonomy
20. Integrations
21. Policies
22. Audit & Observability
23. Settings & Administration
24. Commercial RAG & Knowledge Fabric
25. Knowledge Sources & Ingestion
26. Commercial Learning & Memory
27. Retrieval Governance & Evidence Trace

Each domain MUST expose explicit contracts. A generic “marketing service” is prohibited as a monolith. A generic undifferentiated “vector database” abstraction is likewise insufficient for commercial decisioning; retrieval contracts MUST preserve source authority, provenance, sensitivity and temporal validity.

---

# 7. USER ROLES

| Role | Typical Access |
|---|---|
| Executive | Portfolio, profitability, approvals, policy, simulation |
| Growth Director | Full campaign/growth operations |
| Marketing Manager | Campaigns, content, channels, analytics |
| Social Media Manager | Social calendar, posts, social analytics |
| Paid Media Manager | Ad accounts, campaigns, budgets within limits |
| Content Creator | Draft content, asset variants |
| Brand Reviewer | Brand compliance approval |
| Compliance Reviewer | Claims, legal wording, sensitive segments |
| Finance Reviewer | Budget, margin, supplier funding approval |
| Sales Manager | Leads, pipeline, B2B campaigns |
| Supplier Manager | Supplier-funded campaigns and reporting |
| Business Unit Manager | BU-specific growth and approvals |
| Analyst | Read analytics, run simulations, experiments |
| AI Auditor | Agent runs, policies, model actions |
| System Administrator | Integrations, roles, settings, secrets management |
| Knowledge Steward | Source registration, freshness, indexing policy, supersession |
| RAG Auditor | Retrieval traces, evidence provenance, ranking and leakage review |

RBAC MUST be supplemented by capability-based permissions for high-impact actions.

---

# 8. CANONICAL NAVIGATION / PAGE CATALOG

## 8.1 Executive & Command

| Page ID | Page | Purpose |
|---|---|---|
| GMPC-P001 | Growth Command | Executive commercial cockpit |
| GMPC-P002 | Opportunity Feed | AI and analyst-discovered growth opportunities |
| GMPC-P003 | Commercial Health | Explainable commercial health score |
| GMPC-P004 | Executive Investigations | Evidence-based AI investigations |
| GMPC-P005 | Scenario Simulator | Forecast impact before campaign or promotion launch |

## 8.2 Campaigns & Promotions

| Page ID | Page | Purpose |
|---|---|---|
| GMPC-P010 | Campaign Portfolio | All campaigns and lifecycle state |
| GMPC-P011 | Campaign Builder | Create/edit campaign definition |
| GMPC-P012 | Campaign Detail | Full campaign operations and outcomes |
| GMPC-P013 | Campaign Timeline | Lifecycle, approvals, launches, changes |
| GMPC-P014 | Campaign Economics | Spend, revenue, margin, contribution |
| GMPC-P020 | Promotions Library | All promotions |
| GMPC-P021 | Promotion Builder | Deterministic rule builder |
| GMPC-P022 | Promotion Simulator | Evaluate financial and eligibility impact |
| GMPC-P023 | Promotion Detail | Rules, funding, usage, performance |
| GMPC-P024 | Promotion Conflict/Stacking | Stack, priority, exclusivity audit |

## 8.3 Audiences & Journeys

| Page ID | Page | Purpose |
|---|---|---|
| GMPC-P030 | Audience Library | Customer and prospect segments |
| GMPC-P031 | Audience Builder | Static/dynamic/predictive segment rules |
| GMPC-P032 | Audience Preview | Preview size, exclusions and sensitivity |
| GMPC-P033 | Customer Growth 360 | Commercial growth profile |
| GMPC-P040 | Journey Library | Lifecycle automations |
| GMPC-P041 | Journey Builder | Visual event-driven journey graph |
| GMPC-P042 | Journey Detail | Performance and live state |
| GMPC-P043 | Journey Run Explorer | Individual path and event trace |

## 8.4 Content & Brand

| Page ID | Page | Purpose |
|---|---|---|
| GMPC-P050 | Content Studio | Create and manage campaign assets |
| GMPC-P051 | Creative Generator | AI-assisted concept/copy/creative generation |
| GMPC-P052 | Asset Library | Canonical asset repository |
| GMPC-P053 | Creative Detail | Versions, channels, compliance, performance |
| GMPC-P054 | Brand Rules | Brand constraints by business unit |
| GMPC-P055 | Content Approval | Review queue |
| GMPC-P056 | Creative Performance | Compare variants |

## 8.5 Social & Paid Media

| Page ID | Page | Purpose |
|---|---|---|
| GMPC-P060 | Social Control Room | Multi-channel social overview |
| GMPC-P061 | Social Calendar | Cross-network planning calendar |
| GMPC-P062 | Social Composer | Compose/adapt posts |
| GMPC-P063 | Social Analytics | Organic social performance |
| GMPC-P064 | Competitor Social | Competitor content/engagement intelligence |
| GMPC-P070 | Paid Media Command | Paid media portfolio |
| GMPC-P071 | Ad Campaign Mapping | Map Dial campaign ↔ external campaign IDs |
| GMPC-P072 | Ad Performance | Spend, CPA, ROAS, contribution |
| GMPC-P073 | Budget Optimisation | Recommendations and bounded adjustments |
| GMPC-P074 | Ad Connector Health | API status, syncs, quotas, auth |

## 8.6 SEO, Sales, Merchandising

| Page ID | Page | Purpose |
|---|---|---|
| GMPC-P080 | SEO & Discovery | Search demand, rankings, indexing |
| GMPC-P081 | Search Opportunities | Keyword and content gaps |
| GMPC-P082 | Local Discovery | Business profiles/local posts/locations |
| GMPC-P090 | Sales Growth | Leads and opportunities |
| GMPC-P091 | Lead Detail | Fit, intent, activity, next action |
| GMPC-P092 | B2B Account Intelligence | Commercial account profile |
| GMPC-P093 | Pipeline | Sales stages and forecast |
| GMPC-P100 | Merchandising | Featured products/services and placements |
| GMPC-P101 | Recommendation Rules | Cross-sell/upsell merchandising rules |
| GMPC-P102 | Sponsored Placement | Supplier-sponsored merchandising |

## 8.7 Experimentation, Attribution, Finance

| Page ID | Page | Purpose |
|---|---|---|
| GMPC-P110 | Experiment Library | A/B and multivariate tests |
| GMPC-P111 | Experiment Builder | Hypothesis, variants, metric, sample rules |
| GMPC-P112 | Experiment Detail | Results and statistical confidence |
| GMPC-P120 | Attribution Overview | Journey and conversion attribution |
| GMPC-P121 | Touchpoint Explorer | Event-level customer journey |
| GMPC-P122 | Contribution Attribution | Revenue-to-profit attribution |
| GMPC-P123 | Incrementality | Holdouts and causal uplift |
| GMPC-P130 | Marketing Budgets | Budget hierarchy and spend |
| GMPC-P131 | Campaign Budget Detail | Allocation, commitment, spend, forecast |
| GMPC-P132 | Supplier Funding | MDF/co-funded campaign ledger |
| GMPC-P133 | Marketing Profitability | ROMI, contribution ROI, CAC/LTV |

## 8.8 Governance & Platform

| Page ID | Page | Purpose |
|---|---|---|
| GMPC-P140 | Approvals Inbox | Campaign, promotion, spend, creative approvals |
| GMPC-P141 | Approval Detail | Evidence, impact and decision trace |
| GMPC-P150 | AI Agents | Growth agent registry and state |
| GMPC-P151 | Agent Run Detail | Inputs, tools, outputs, costs, actions |
| GMPC-P152 | Autonomy Policies | AI action boundaries |
| GMPC-P160 | Integrations | External systems |
| GMPC-P161 | Integration Detail | Connector scopes, auth, health |
| GMPC-P170 | Policies | Marketing, budget, privacy, promotion rules |
| GMPC-P171 | Policy Detail | Versioned rules and enforcement |
| GMPC-P180 | Audit Log | Immutable activity history |
| GMPC-P181 | Observability | Service/connector/event health |
| GMPC-P190 | GMPC Settings | System-level configuration |

## 8.9 Commercial RAG & Knowledge

| Page ID | Page | Purpose |
|---|---|---|
| GMPC-P200 | Knowledge Command | Commercial knowledge health and source overview |
| GMPC-P201 | Knowledge Sources | Register, classify and manage structured/unstructured sources |
| GMPC-P202 | Commercial Memory | Outcome-linked reusable campaign/promotion/market learning |
| GMPC-P203 | Retrieval Trace | Inspect exactly what evidence Hermes retrieved and why |
| GMPC-P204 | Freshness & Drift | Stale, superseded, failed-ingestion and conflicting knowledge |
| GMPC-P205 | Knowledge Object Detail | View chunks, metadata, authority, versions and relationships |
| GMPC-P206 | Retrieval Policy | Purpose, role, business-unit and sensitivity retrieval controls |
| GMPC-P207 | Index & Pipeline Health | Ingestion, embedding, full-text, graph and analytics pipeline status |

---

# 9. FEATURE AUDIT — DOCUMENTED INTENT TO SOFTWARE-USABLE FEATURES

The following table converts the primary documented GMPC intentions into implementation-visible features.

| Feature ID | Documented Intent | Software-Usable Feature | Primary Page(s) | Backend Domain |
|---|---|---|---|---|
| GMPC-F001 | Executive commercial overview | Real-time KPI command cockpit | P001 | growth-command |
| GMPC-F002 | Find growth opportunities | Opportunity detection queue with evidence | P002 | opportunity-intelligence |
| GMPC-F003 | Commercial health | Explainable score with component drill-down | P003 | commercial-health |
| GMPC-F004 | Ask why performance changed | AI investigation with tool-backed evidence | P004 | investigations |
| GMPC-F005 | Simulate campaign impact | Scenario simulator with low/likely/high cases | P005 | simulation |
| GMPC-F010 | Manage campaigns | Campaign CRUD and lifecycle state machine | P010-P013 | campaigns |
| GMPC-F011 | Campaign economics | Contribution/margin view by campaign | P014 | campaign-finance |
| GMPC-F020 | Manage promotions | Promotion CRUD and deterministic rules | P020-P023 | promotions |
| GMPC-F021 | Prevent discount conflicts | Stacking/exclusivity engine | P024 | promotions |
| GMPC-F022 | Protect margin | Margin floor validation | P021-P024 | promotions-finance |
| GMPC-F023 | Supplier-funded offers | Funding source allocation and ledger | P023, P132 | supplier-funding |
| GMPC-F030 | Segment customers | Audience builder | P030-P032 | audiences |
| GMPC-F031 | Predictive audiences | AI-assisted segment proposals | P031 | audience-intelligence |
| GMPC-F032 | Customer growth profile | Commercial 360 view | P033 | customer-growth |
| GMPC-F040 | Lifecycle automation | Journey builder and runtime | P040-P043 | journeys |
| GMPC-F050 | Generate content | AI creative generation workflow | P050-P051 | content |
| GMPC-F051 | Store assets | Versioned asset library in R2 | P052-P053 | assets |
| GMPC-F052 | Brand governance | Business-unit brand rule engine | P054 | brand |
| GMPC-F053 | Human content approval | Approval queue and decision state | P055 | approvals |
| GMPC-F060 | Social management | Unified social control room | P060 | social |
| GMPC-F061 | Social scheduling | Cross-platform scheduling calendar | P061-P062 | social |
| GMPC-F062 | Metricool integration | Publish/read analytics via governed connector | P060-P064, P160 | integrations-social |
| GMPC-F063 | Social analytics | Organic performance analysis | P063 | social-analytics |
| GMPC-F064 | Competitor intelligence | Competitor post/performance analysis | P064 | market-intelligence |
| GMPC-F070 | Paid media management | Unified paid media portfolio | P070-P074 | paid-media |
| GMPC-F071 | External campaign mapping | Dial campaign ↔ ad platform IDs | P071 | paid-media |
| GMPC-F072 | Budget controls | Limits, pacing and approval thresholds | P073, P130-P131 | budgets |
| GMPC-F073 | Bounded AI optimisation | Policy-limited budget recommendations/actions | P073, P152 | ai-policy |
| GMPC-F080 | SEO & programmatic discovery | Search demand, deterministic indexability, structured data, sitemaps, landing-page and merchant-feed intelligence | P080-P081 | seo |
| GMPC-F081 | Local discovery | Business profile, location, service-area and review-signal operations | P082 | local-discovery |
| GMPC-F090 | Lead management | Lead list/detail/scoring | P090-P091 | sales-growth |
| GMPC-F091 | B2B account intelligence | Account 360 and opportunity estimate | P092 | sales-growth |
| GMPC-F092 | Pipeline management | Opportunity stages and forecast | P093 | sales-growth |
| GMPC-F100 | In-app merchandising | Featured and recommended placements | P100-P101 | merchandising |
| GMPC-F101 | Sponsored placement | Supplier-sponsored slots with disclosure | P102 | merchandising |
| GMPC-F110 | A/B experimentation | Experiment lifecycle and metrics | P110-P112 | experiments |
| GMPC-F120 | Attribution | Touchpoint and conversion attribution | P120-P122 | attribution |
| GMPC-F121 | Incrementality | Holdout/control causal lift analysis | P123 | incrementality |
| GMPC-F130 | Budget hierarchy | BU/channel/campaign budget tree | P130-P131 | budgets |
| GMPC-F131 | Marketing profitability | ROMI/contribution ROI dashboard | P133 | finance-analytics |
| GMPC-F140 | Approval governance | Approval inbox + decision trace | P140-P141 | approvals |
| GMPC-F150 | AI growth agents | Agent registry and run tracking | P150-P151 | hermes-growth |
| GMPC-F151 | AI autonomy controls | Action capability policies | P152 | ai-policy |
| GMPC-F160 | External integrations | Connector configuration/health | P160-P161 | integrations |
| GMPC-F170 | Policy governance | Versioned marketing/promotion/privacy rules | P170-P171 | policy |
| GMPC-F180 | Audit | Immutable user/AI/action log | P180 | audit |
| GMPC-F181 | Observability | Connector/service/event health | P181 | observability |
| GMPC-F190 | Capacity-aware marketing | Suppress/limit campaigns based on operations | P011, P014, P073 | capacity-gating |
| GMPC-F191 | Marketing fatigue protection | Frequency caps/suppression/quiet hours | P041, P170 | comms-policy |
| GMPC-F192 | Sensitive data firewall | Purpose limitation and field filtering | P031, P170 | privacy-policy |
| GMPC-F193 | Cross-business growth | Cross-unit offer and journey rules | P011, P041, P101 | cross-dial-growth |
| GMPC-F194 | Supplier marketing portal data | Campaign performance and funding summaries | P132, supplier portal | supplier-growth |
| GMPC-F195 | AI cost tracking | Tokens/model/cost/outcome per agent run | P151 | ai-finops |
| GMPC-F200 | Commercial hybrid retrieval | Query planner selects structured, vector, text, graph, time-series and artefact retrieval | P200, P203 | commercial-rag |
| GMPC-F201 | Knowledge source governance | Register source authority, sensitivity, owner, refresh and retention | P201 | knowledge-sources |
| GMPC-F202 | Outcome-linked commercial memory | Persist campaign/promotion/creative/experiment learning with verified outcomes | P202, P205 | commercial-memory |
| GMPC-F203 | Retrieval provenance | Show exact evidence, source, timestamp, rank and retrieval method used by Hermes | P203 | retrieval-trace |
| GMPC-F204 | Freshness and supersession | Detect stale, superseded, conflicting and failed knowledge | P204 | knowledge-freshness |
| GMPC-F205 | Purpose-aware retrieval policy | Enforce role, business-unit, purpose and sensitivity filtering before context assembly | P206 | retrieval-policy |
| GMPC-F206 | Index pipeline observability | Monitor ingestion, chunking, embeddings, full-text, entity and graph indexing | P207 | knowledge-pipeline |
| GMPC-F207 | Knowledge object inspection | Inspect canonical metadata, versions, relationships and source authority | P205 | knowledge-objects |
| GMPC-F208 | Authority-aware fact arbitration | Prevent historical/semantic evidence from overriding current authoritative facts | P203-P206 | evidence-arbitration |
| GMPC-F209 | Commercial knowledge products | Maintain campaign, promotion, creative, audience, supplier, experiment and playbook stores | P202 | commercial-memory |
| GMPC-F210 | RAG leakage controls | Redact/tokenise/deny protected fields before retrieval context reaches external models | P206 | retrieval-policy |
| GMPC-F211 | Retrieval quality analytics | Measure groundedness, hit quality, freshness, citation coverage and policy-denial rates | P200, P207 | rag-observability |

---

# 10. ATOMIC FEATURE-TO-PAGE MAPPING

This section defines the atomic, independently testable user-facing feature inventory.

## 10.1 Growth Command

| Atomic ID | Atomic Feature | Page | UI Element | Backend Contract |
|---|---|---|---|---|
| A001 | View revenue today/week/month | P001 | KPI cards | GET /growth/kpis |
| A002 | View gross profit | P001 | KPI card | GET /growth/kpis |
| A003 | View contribution margin | P001 | KPI card | GET /growth/kpis |
| A004 | View marketing spend | P001 | KPI card | GET /budgets/spend-summary |
| A005 | View CAC | P001 | KPI card | GET /growth/kpis |
| A006 | View ROMI | P001 | KPI card | GET /profitability/summary |
| A007 | View new/repeat customers | P001 | KPI card | GET /growth/customer-summary |
| A008 | View channel health | P001 | connector status strip | GET /integrations/health |
| A009 | View top opportunities | P001 | opportunity cards | GET /opportunities?priority=high |
| A010 | Open opportunity investigation | P001→P002 | action button | GET /opportunities/{id} |

## 10.2 Opportunity Intelligence

| Atomic ID | Atomic Feature | Page | UI Element | Backend Contract |
|---|---|---|---|---|
| A011 | List opportunities | P002 | table/feed | GET /opportunities |
| A012 | Filter by BU/category/geography | P002 | filters | GET /opportunities?... |
| A013 | View expected revenue | P002 | metric | opportunity projection |
| A014 | View expected contribution | P002 | metric | opportunity projection |
| A015 | View confidence | P002 | confidence badge | opportunity score |
| A016 | View evidence | P002 | evidence drawer | GET /opportunities/{id}/evidence |
| A017 | Simulate opportunity | P002→P005 | action | POST /simulations |
| A018 | Convert opportunity to campaign | P002→P011 | action | POST /campaigns/from-opportunity |
| A019 | Dismiss with reason | P002 | action | POST /opportunities/{id}/dismiss |
| A020 | Delegate investigation to Hermes | P002 | action | POST /agents/investigations |

## 10.3 Campaign Management

| Atomic ID | Atomic Feature | Page | UI Element | Backend Contract |
|---|---|---|---|---|
| A021 | Create campaign | P011 | create form | POST /campaigns |
| A022 | Set objective | P011 | selector | campaign objective enum |
| A023 | Select business units | P011 | multi-select | campaign_bu links |
| A024 | Select products/services | P011 | entity picker | campaign_items |
| A025 | Select audience | P011 | audience picker | audience_id |
| A026 | Select geography | P011 | geo picker | campaign_geographies |
| A027 | Set dates | P011 | date range | campaign window |
| A028 | Select channels | P011 | channel toggles | campaign_channels |
| A029 | Attach promotion | P011 | promotion picker | campaign_promotion |
| A030 | Set budget | P011 | budget editor | campaign_budget |
| A031 | Set KPI targets | P011 | KPI editor | campaign_targets |
| A032 | Set margin floor | P011 | financial guard | campaign_economics |
| A033 | Set capacity constraints | P011 | rules section | capacity policy |
| A034 | Save draft | P011 | action | PATCH /campaigns/{id} |
| A035 | Submit for approval | P011 | action | POST /campaigns/{id}/submit |
| A036 | Approve/reject | P141 | decision control | POST /approvals/{id}/decision |
| A037 | Schedule launch | P012 | action | POST /campaigns/{id}/schedule |
| A038 | Activate campaign | P012 | action | POST /campaigns/{id}/activate |
| A039 | Pause campaign | P012 | action | POST /campaigns/{id}/pause |
| A040 | Complete campaign | P012 | action | POST /campaigns/{id}/complete |
| A041 | View lifecycle timeline | P013 | timeline | GET /campaigns/{id}/timeline |
| A042 | View campaign economics | P014 | dashboard | GET /campaigns/{id}/economics |

## 10.4 Promotions

| Atomic ID | Atomic Feature | Page | UI Element | Backend Contract |
|---|---|---|---|---|
| A043 | Create promotion | P021 | builder | POST /promotions |
| A044 | Choose promotion type | P021 | selector | promotion_type |
| A045 | Add eligibility rule | P021 | rule builder | promotion_rules |
| A046 | Add action/benefit | P021 | benefit builder | promotion_actions |
| A047 | Set max redemptions | P021 | field | redemption_limit |
| A048 | Set per-customer limit | P021 | field | customer_limit |
| A049 | Set margin floor | P021 | field | margin_floor |
| A050 | Set stackability | P021 | toggle | stackable |
| A051 | Set priority | P021 | field | priority |
| A052 | Set exclusivity group | P021 | selector | exclusivity_group |
| A053 | Assign funding source | P021 | funding selector | promotion_funding |
| A054 | Simulate eligibility | P022 | simulator | POST /promotions/{id}/simulate |
| A055 | Simulate financial outcome | P022 | simulator | POST /promotions/{id}/economics |
| A056 | Activate promotion | P023 | action | POST /promotions/{id}/activate |
| A057 | Pause promotion | P023 | action | POST /promotions/{id}/pause |
| A058 | View redemption ledger | P023 | table | GET /promotions/{id}/redemptions |
| A059 | View stacking conflicts | P024 | conflict matrix | POST /promotions/conflict-check |
| A060 | Evaluate promotion at checkout | external checkout | service call | POST /promotions/evaluate |

## 10.5 Audiences

| Atomic ID | Atomic Feature | Page | UI Element | Backend Contract |
|---|---|---|---|---|
| A061 | Create static audience | P031 | builder | POST /audiences |
| A062 | Create dynamic audience | P031 | rule builder | audience_rules |
| A063 | Create predictive audience proposal | P031 | AI action | POST /audiences/predict |
| A064 | Preview audience size | P032 | count | POST /audiences/preview |
| A065 | View exclusions | P032 | exclusion panel | preview result |
| A066 | View sensitive-field warnings | P032 | policy warning | privacy policy engine |
| A067 | Save audience version | P031 | action | POST /audiences/{id}/versions |
| A068 | View customer growth 360 | P033 | profile | GET /customers/{id}/growth-profile |

## 10.6 Journeys

| Atomic ID | Atomic Feature | Page | UI Element | Backend Contract |
|---|---|---|---|---|
| A069 | Create journey | P041 | canvas | POST /journeys |
| A070 | Add trigger | P041 | node | journey_trigger |
| A071 | Add wait | P041 | node | wait_step |
| A072 | Add condition | P041 | node | condition_step |
| A073 | Add message | P041 | node | communication_step |
| A074 | Add promotion | P041 | node | promotion_step |
| A075 | Add audience update | P041 | node | audience_step |
| A076 | Set exit rule | P041 | rule | journey_exit |
| A077 | Set frequency cap | P041 | policy panel | messaging_policy |
| A078 | Activate journey | P042 | action | POST /journeys/{id}/activate |
| A079 | Pause journey | P042 | action | POST /journeys/{id}/pause |
| A080 | Inspect individual run | P043 | trace | GET /journeys/runs/{id} |

## 10.7 Content & Brand

| Atomic ID | Atomic Feature | Page | UI Element | Backend Contract |
|---|---|---|---|---|
| A081 | Create content brief | P050 | form | POST /content/briefs |
| A082 | Generate copy variants | P051 | AI generation | POST /content/generate-copy |
| A083 | Generate creative concepts | P051 | AI generation | POST /content/generate-concepts |
| A084 | Upload media | P052 | uploader | POST /assets |
| A085 | Store asset in R2 | backend | storage operation | asset service |
| A086 | Create channel variant | P053 | action | POST /assets/{id}/variants |
| A087 | Apply brand validation | P053 | validation | POST /brand/validate |
| A088 | Apply compliance validation | P053 | validation | POST /compliance/validate |
| A089 | Submit creative for approval | P055 | action | POST /approvals |
| A090 | Approve creative | P055 | action | approval decision |
| A091 | Compare creative performance | P056 | comparison chart | GET /creative/performance |

## 10.8 Social

| Atomic ID | Atomic Feature | Page | UI Element | Backend Contract |
|---|---|---|---|---|
| A092 | View connected social accounts | P060 | account list | GET /social/accounts |
| A093 | View scheduled posts | P061 | calendar | GET /social/posts |
| A094 | Compose post | P062 | composer | POST /social/posts |
| A095 | Adapt copy by network | P062 | AI action | POST /social/adapt |
| A096 | Attach media | P062 | media picker | asset link |
| A097 | Submit post for review | P062/P055 | action | POST /social/posts/{id}/review |
| A098 | Schedule post | P061/P062 | action | POST /social/posts/{id}/schedule |
| A099 | Publish via Metricool connector | backend | connector action | tool gateway |
| A100 | View social analytics | P063 | dashboard | GET /social/analytics |
| A101 | View best posting times | P063 | heatmap | connector analytics |
| A102 | Compare competitor activity | P064 | table | GET /social/competitors |

## 10.9 Paid Media

| Atomic ID | Atomic Feature | Page | UI Element | Backend Contract |
|---|---|---|---|---|
| A103 | Connect ad account | P160/P161 | connector | integrations service |
| A104 | Map external campaign | P071 | mapping form | POST /ads/mappings |
| A105 | View ad spend | P072 | KPI | GET /ads/performance |
| A106 | View CPA | P072 | KPI | performance service |
| A107 | View ROAS | P072 | KPI | performance service |
| A108 | View contribution after ad spend | P072 | KPI | attribution-finance |
| A109 | Recommend budget shift | P073 | AI recommendation | POST /ads/recommendations |
| A110 | Execute bounded budget shift | P073 | action | POST /ads/budgets/adjust |
| A111 | Reject AI change | P073 | action | policy decision |
| A112 | View connector health | P074 | health table | GET /integrations/health |

## 10.10 SEO, Sales & Merchandising

| Atomic ID | Atomic Feature | Page | UI Element | Backend Contract |
|---|---|---|---|---|
| A113 | View search demand and landing performance | P080 | query/landing table | GET /seo/queries |
| A114 | Detect content/programmatic landing opportunity | P081 | opportunity list | GET /seo/opportunities |
| A115 | View indexability/canonical/schema/sitemap/feed issues | P080 | issue list | GET /seo/issues |
| A116 | Manage local profile/location/service-area content | P082 | local discovery editor | /local-discovery |
| A117 | View leads | P090 | table | GET /leads |
| A118 | View explainable lead score | P091 | score panel | GET /leads/{id}/score |
| A119 | Update sales stage | P091/P093 | stage control | PATCH /opportunities/{id} |
| A120 | View B2B account potential | P092 | account insight | GET /accounts/{id}/growth |
| A121 | Configure featured placement | P100 | slot editor | POST /merchandising/placements |
| A122 | Configure cross-sell rule | P101 | rule builder | POST /merchandising/rules |
| A123 | Configure sponsored placement | P102 | sponsored slot | POST /merchandising/sponsored |

## 10.11 Experiments, Attribution & Finance

| Atomic ID | Atomic Feature | Page | UI Element | Backend Contract |
|---|---|---|---|---|
| A124 | Create experiment | P111 | builder | POST /experiments |
| A125 | Define hypothesis | P111 | field | experiment hypothesis |
| A126 | Define variants | P111 | variant editor | experiment_variants |
| A127 | Set success metric | P111 | metric selector | experiment_metric |
| A128 | Set sample rule | P111 | sample config | experiment sample |
| A129 | Start experiment | P112 | action | POST /experiments/{id}/start |
| A130 | View confidence | P112 | result panel | experiment stats |
| A131 | View attribution model | P120 | model selector | GET /attribution/models |
| A132 | Inspect touchpoints | P121 | timeline | GET /attribution/touchpoints |
| A133 | View contribution attribution | P122 | chart/table | GET /attribution/contribution |
| A134 | View incrementality | P123 | uplift panel | GET /incrementality |
| A135 | View budget tree | P130 | hierarchy | GET /budgets |
| A136 | View spend/commitment/forecast | P131 | budget panel | GET /budgets/{id} |
| A137 | View supplier funding ledger | P132 | ledger | GET /supplier-funding |
| A138 | View ROMI | P133 | KPI | GET /profitability/romi |
| A139 | View contribution ROI | P133 | KPI | GET /profitability/contribution-roi |

## 10.12 Governance, AI & Platform

| Atomic ID | Atomic Feature | Page | UI Element | Backend Contract |
|---|---|---|---|---|
| A140 | View approval queue | P140 | queue | GET /approvals |
| A141 | Review financial impact | P141 | evidence panel | approval payload |
| A142 | Approve | P141 | action | POST /approvals/{id}/approve |
| A143 | Reject with reason | P141 | action | POST /approvals/{id}/reject |
| A144 | View agent registry | P150 | table | GET /agents |
| A145 | View agent run | P151 | run trace | GET /agents/runs/{id} |
| A146 | View model/token/cost | P151 | finops panel | run metadata |
| A147 | Configure autonomy level | P152 | policy editor | PATCH /ai-policies |
| A148 | Configure capability permission | P152 | permissions matrix | capability service |
| A149 | View integrations | P160 | connector grid | GET /integrations |
| A150 | Configure connector scopes | P161 | scope editor | PATCH /integrations/{id} |
| A151 | View policies | P170 | policy list | GET /policies |
| A152 | Version policy | P171 | version control | POST /policies/{id}/versions |
| A153 | View audit log | P180 | log explorer | GET /audit |
| A154 | Filter human vs AI actions | P180 | filter | audit actor_type |
| A155 | View observability | P181 | health dashboard | GET /observability |
| A156 | Configure GMPC settings | P190 | settings | PATCH /settings/gmpc |

## 10.13 Commercial RAG & Knowledge Fabric

| Atomic ID | Atomic Feature | Page | UI Element | Backend Contract |
|---|---|---|---|---|
| A157 | View knowledge health score | P200 | KPI/health card | GET /knowledge/health |
| A158 | View source coverage by domain | P200 | coverage matrix | GET /knowledge/coverage |
| A159 | Register knowledge source | P201 | source form | POST /knowledge/sources |
| A160 | Set source authority | P201 | authority selector | PATCH /knowledge/sources/{id} |
| A161 | Set sensitivity classification | P201 | classification selector | PATCH /knowledge/sources/{id} |
| A162 | Set refresh/freshness SLA | P201 | freshness policy | PATCH /knowledge/sources/{id} |
| A163 | Trigger controlled reindex | P201/P207 | action | POST /knowledge/sources/{id}/reindex |
| A164 | View commercial learning objects | P202 | memory feed/table | GET /commercial-memory |
| A165 | Filter learning by BU/campaign/channel/outcome | P202 | filters | GET /commercial-memory?... |
| A166 | Promote verified learning to reusable memory | P202 | governed action | POST /commercial-memory/{id}/promote |
| A167 | Deprecate incorrect learning | P202 | action | POST /commercial-memory/{id}/deprecate |
| A168 | Inspect retrieval trace | P203 | trace graph | GET /retrieval-traces/{id} |
| A169 | View retrieval method per evidence item | P203 | evidence row | retrieval trace payload |
| A170 | View source authority/freshness | P203 | metadata badges | retrieval evidence metadata |
| A171 | View structured query used | P203 | query inspector | trace structured_plan |
| A172 | View semantic/full-text matches | P203 | result list | trace retrieval_results |
| A173 | View policy-filtered/denied evidence | P203 | policy panel | trace policy_decisions |
| A174 | View final context manifest | P203 | context manifest | GET /retrieval-traces/{id}/context |
| A175 | List stale knowledge | P204 | stale queue | GET /knowledge/drift?state=stale |
| A176 | List superseded knowledge | P204 | supersession queue | GET /knowledge/drift?state=superseded |
| A177 | Detect source conflicts | P204 | conflict queue | GET /knowledge/conflicts |
| A178 | Resolve canonical source precedence | P204/P205 | resolution action | POST /knowledge/conflicts/{id}/resolve |
| A179 | Inspect knowledge object metadata | P205 | detail panel | GET /knowledge/objects/{id} |
| A180 | View versions/validity interval | P205 | version timeline | GET /knowledge/objects/{id}/versions |
| A181 | View entity relationships | P205 | relationship graph | GET /knowledge/objects/{id}/relationships |
| A182 | Configure purpose policy | P206 | policy editor | POST /retrieval-policies |
| A183 | Configure role/BU access | P206 | access matrix | PATCH /retrieval-policies/{id} |
| A184 | Configure sensitive-field denial/redaction | P206 | field policy editor | PATCH /retrieval-policies/{id} |
| A185 | Test retrieval policy against sample query | P206 | policy simulator | POST /retrieval-policies/simulate |
| A186 | View ingestion jobs | P207 | job table | GET /knowledge/pipeline/jobs |
| A187 | View embedding/full-text/graph status | P207 | pipeline health | GET /knowledge/pipeline/health |
| A188 | Retry failed ingestion | P207 | action | POST /knowledge/pipeline/jobs/{id}/retry |
| A189 | View retrieval quality metrics | P207 | metrics dashboard | GET /knowledge/retrieval-quality |
| A190 | Run hybrid commercial query | P200/P203 | query action | POST /knowledge/query |
| A191 | Enforce live-fact routing | backend | query planner | knowledge query planner |
| A192 | Persist post-campaign learning package | backend/P202 | background workflow | POST /commercial-memory/from-campaign/{id} |
| A193 | Persist experiment learning package | backend/P202 | background workflow | POST /commercial-memory/from-experiment/{id} |
| A194 | Persist promotion learning package | backend/P202 | background workflow | POST /commercial-memory/from-promotion/{id} |
| A195 | Record evidence citations on AI output | P004/P203 | citations/evidence | response evidence manifest |

---

# 11. CAMPAIGN OBJECT MODEL

```text
Campaign
 ├─ id
 ├─ objective
 ├─ business_units[]
 ├─ owner
 ├─ opportunity_id?
 ├─ audience_id
 ├─ geographies[]
 ├─ start_at
 ├─ end_at
 ├─ products_services[]
 ├─ channels[]
 ├─ creative_set_id
 ├─ promotion_id?
 ├─ budget_id
 ├─ kpi_targets[]
 ├─ margin_floor
 ├─ capacity_policy
 ├─ approval_policy
 ├─ experiment_ids[]
 ├─ attribution_model
 ├─ ai_policy
 ├─ state
 ├─ external_campaign_mappings[]
 ├─ outcomes
 └─ post_campaign_review
```

Canonical states:

```text
DRAFT
PLANNING
AWAITING_APPROVAL
APPROVED
READY
SCHEDULED
LIVE
PAUSED
LIMITED
COMPLETED
CANCELLED
UNDER_REVIEW
ARCHIVED
```

State transitions MUST be validated server-side.

---

# 12. PROMOTIONS ENGINE

## 12.1 Supported Promotion Types

- percentage discount;
- fixed amount discount;
- product discount;
- category discount;
- bundle;
- BOGO;
- quantity break;
- free delivery;
- installation incentive;
- service bundle;
- voucher/coupon;
- referral;
- loyalty;
- membership benefit;
- first-order;
- reactivation;
- abandoned-cart;
- geographic;
- time-limited;
- flash campaign;
- supplier-funded;
- cross-business;
- threshold;
- personalised;
- progressive reward.

## 12.2 Rule Dimensions

Promotion eligibility may evaluate:

```text
customer.segment
customer.status
customer.first_order
customer.purchase_history
customer.membership
customer.location
product.id
product.brand
product.category
product.margin
product.supplier
cart.total
cart.quantity
service.type
date_time
inventory.available
delivery.zone
campaign.id
payment.method
```

Supported operators:

```text
AND
OR
NOT
IN
NOT_IN
=
!=
>
>=
<
<=
BETWEEN
EXISTS
```

## 12.3 Stacking

Each promotion MUST define:

```text
stackable
priority
exclusivity_group
maximum_discount
margin_floor
maximum_redemptions
maximum_per_customer
```

## 12.4 Deterministic Evaluation API

`POST /promotions/evaluate`

Representative request:

```json
{
  "customerId": "cust_123",
  "cartId": "cart_456",
  "locationId": "loc_harare",
  "channel": "web"
}
```

Representative response:

```json
{
  "eligiblePromotions": ["promo_1", "promo_2"],
  "appliedPromotions": ["promo_1"],
  "rejectedPromotions": [
    {"id":"promo_2","reason":"MARGIN_FLOOR"}
  ],
  "discountTotal": 12.50,
  "fundingAllocations": [
    {"source":"DIAL","amount":7.50},
    {"source":"SUPPLIER","amount":5.00}
  ],
  "grossMarginAfter": 0.28,
  "contributionMarginAfter": 0.21,
  "evaluationId": "peval_..."
}
```

Evaluation MUST be:
- deterministic;
- idempotent where appropriate;
- versioned by ruleset;
- auditable;
- fail-closed.

---

# 13. COMMERCIAL ECONOMICS

For every campaign and promotion:

```text
Attributed revenue
- product/supplier cost
- marketing spend
- promotion cost
- payment cost
- fulfilment subsidy
- logistics subsidy
- service subsidy
- refunds
- measurable variable operating cost
────────────────────────────────
Attributed contribution
```

Primary financial metrics:

- gross margin;
- contribution margin;
- CAC;
- ROAS;
- ROMI;
- contribution ROI;
- LTV:CAC;
- incremental contribution;
- promotion cost per incremental conversion.

---

# 14. CAPACITY-AWARE MARKETING

Before launch or scale-up, GMPC MUST query operational capacity:

- inventory availability;
- supplier availability;
- technician capacity;
- delivery capacity;
- fulfilment SLA;
- branch/location capacity;
- customer service backlog;
- payment health where relevant.

Examples:

```text
IF technician_utilisation > 90%
THEN block_service_campaign_scale = true
```

```text
IF available_stock < safety_stock
THEN suppress_product_promotion = true
```

Capacity checks MUST be part of simulation and live optimisation.

---

# 15. AUDIENCE & CUSTOMER GROWTH DATA

Commercial growth profile MAY include:

```text
identity_token
location
communication_preferences
owned_assets
orders
bookings
quotes
membership
engagement
campaign_exposures
promotion_history
service_history
customer_value
preferred_categories
channel_preference
consent
```

It MUST NOT automatically include sensitive health or personal fields merely because such data exists elsewhere in Dial.

---

# 16. SENSITIVE DATA FIREWALL

GMPC SHALL enforce:

- data classification;
- purpose limitation;
- consent state;
- business-unit isolation;
- role access;
- AI redaction/tokenisation;
- field-level denial;
- audit of sensitive-data access.

External model context SHOULD contain the minimum necessary data.

---

# 17. CUSTOMER JOURNEY RUNTIME

Journey node types:

- trigger;
- wait;
- condition;
- branch;
- audience membership;
- send message;
- create task;
- add promotion;
- stop;
- webhook;
- internal event;
- human approval;
- AI recommendation.

Runtime guarantees:

- event-driven;
- idempotent;
- resumable;
- auditable;
- deduplicated;
- suppression-aware;
- consent-aware;
- retry-safe.

---

# 18. CONTENT STUDIO

Content pipeline:

```text
Campaign brief
    ↓
Brand context
    ↓
Audience context
    ↓
Concept generation
    ↓
Copy generation
    ↓
Image/video generation
    ↓
Channel adaptation
    ↓
Brand validation
    ↓
Compliance validation
    ↓
Human review
    ↓
Publication
```

## 18.1 Creative Asset Object

```text
CreativeAsset
 ├─ id
 ├─ campaign_id
 ├─ business_unit
 ├─ asset_type
 ├─ language
 ├─ aspect_ratio
 ├─ audience_id
 ├─ message
 ├─ CTA
 ├─ source
 ├─ ai_generated
 ├─ storage_key
 ├─ brand_validation
 ├─ compliance_validation
 ├─ approval_state
 ├─ channels[]
 ├─ versions[]
 └─ performance
```

Heavy creative assets SHOULD be stored in R2 with structured metadata in the transactional database.

---

# 19. BRAND GOVERNANCE

Each Dial business unit SHALL define:

- logo rules;
- approved colours;
- typography;
- tone;
- approved terminology;
- prohibited terminology;
- imagery rules;
- CTA style;
- required disclaimers;
- legal claims;
- language/localisation;
- audience-specific constraints.

Brand validation MUST produce:
- PASS;
- WARNING;
- FAIL;
- human-review-required.

---

# 20. SOCIAL MEDIA EXECUTION

Metricool is an approved initial execution connector for social scheduling and analytics.

Dial remains the control plane.

GMPC SHOULD support:
- Facebook;
- Instagram;
- TikTok;
- LinkedIn;
- YouTube;
- X;
- Threads;
- Pinterest;
- Google Business Profile;
- other approved channels.

Canonical flow:

```text
Dial Campaign
  ↓
Content Asset
  ↓
Social Post Object
  ↓
Approval
  ↓
Dial Tool Gateway
  ↓
Metricool
  ↓
Social Network
  ↓
Analytics
  ↓
Dial Attribution
```

---

# 21. PAID MEDIA

Canonical ad connectors SHOULD support:
- Google Ads;
- Meta Ads;
- TikTok Ads;
- LinkedIn Ads where applicable.

Every external campaign MUST map to a Dial campaign.

```text
Dial campaign_id
↔ external_platform
↔ external_account_id
↔ external_campaign_id
↔ ad_group_id?
↔ creative_id?
```

AI MAY recommend:
- pause;
- budget shift;
- audience refinement;
- creative replacement;
- landing-page change.

AI execution MUST be bounded by policy.

---

# 22. SEO & DISCOVERY

SEO is a governed DIAL discovery system, not a collection of manually written pages or an unrestricted AI-content channel. It MUST convert real DIAL entity truth into crawlable, useful public discovery surfaces while preventing duplicate, thin, private, stale or misleading pages from entering search indexes.

## 22.1 SEO operating objectives

GMPC SHALL support:
- search query intelligence, impressions, clicks, click-through rate and rankings;
- landing-page performance linked through conversion, fulfilment, revenue and contribution margin;
- indexing, canonical, robots, sitemap and structured-data diagnostics;
- content and entity-demand gaps;
- programmatic landing-page opportunities backed by canonical DIAL truth;
- merchant/search-shopping feed health where an approved market/provider supports feeds;
- local discovery, business profiles, service areas, location information and review signals where integration permits;
- Core Web Vitals and crawlability health for every indexable public template;
- search opportunity learning through the governed Commercial RAG/Knowledge Fabric and Hermes.

Search success MUST NOT be reduced to rankings or traffic. The terminal commercial measures are qualified conversion, fulfilled demand, customer value and contribution margin, subject to brand, privacy and customer-experience constraints.

## 22.2 Eligible public surfaces and privacy boundary

SEO MAY apply to any DIAL business unit only where the route is deliberately public and useful without authentication. Eligible examples include verified vehicle/make/model/fitment and EPC information, product/category pages, public supplier or service listings, technician/service discovery, grocery catalogue/category pages, Care public plan/information pages, Logistics/B2B public service pages, real location/service-area pages and governed editorial/help content.

The following MUST NOT become indexable SEO inventory:
- account, identity, cart, checkout, order, payment, wallet/entitlement, case, internal admin, supplier-private or operational routes;
- private customer, vehicle-owner, technician, employee or supplier records;
- customer-specific price/eligibility or non-public contractual information;
- health-sensitive, clinical, member-specific or other protected data;
- internal search-result URLs, arbitrary filter combinations, tracking/session URLs or machine/debug routes unless deliberately promoted into a governed canonical landing page.

Public Health informational/provider content, if any, requires its own compliance and lawful-purpose gate and MUST never expose or derive from an individual's health context.

## 22.3 DIAL Search Landing Page Factory — programmatic SEO

`GMPC-F080` owns the governed **Search Landing Page Factory**. It MAY materialise public pages from verified DIAL entities such as:

```text
make/model/generation + component/category + fitment + market/location
product/category + verified offers/inventory + fulfilment geography
service + asset/vehicle applicability + real provider/service-area coverage
public plan/category + location + authoritative business rules
```

A programmatic page is eligible for publication only when it contains sufficient unique user value from authoritative data. Repeating a template while swapping a keyword, suburb, model or product name is not sufficient. Candidate value may come from verified fitment, EPC hierarchy, real inventory/offers, pricing/availability, service coverage, diagrams, technical facts, delivery/collection options, merchant/provider facts, genuine reviews or useful expert content.

The factory MUST maintain a deterministic `LandingPageCandidate` and `SeoQualityAssessment`. Hermes/SEO agents MAY discover demand, propose candidates, draft bounded copy and explain evidence; they MUST NOT override the publish/index decision, fabricate product/service coverage, manufacture reviews, invent locations, or turn missing data into claims.

## 22.4 Deterministic Indexability Policy

Every public route family MUST resolve an `IndexabilityDecision` before production promotion. The policy is deterministic and versioned. At minimum it records:

```text
route/entity identity
index_state = INDEX | NOINDEX | GONE
canonical_target
crawl_directive = ALLOW | DISALLOW
reason codes
policy version
data freshness/value score
last evaluated at
```

Rules:
1. `INDEX` requires a stable canonical route, useful server-rendered primary content and an allowlisted route template.
2. Internal search pages and arbitrary facets default to `NOINDEX`; only curated high-value combinations may be promoted to canonical landing pages.
3. Sort order, tracking, session, experiment and presentation-only parameters MUST NOT create separate index inventory.
4. Equivalent URLs canonicalise to one stable entity route. Redirects are used only where the replacement is genuinely equivalent.
5. Pagination uses stable crawlable page URLs when needed; each page is self-canonical unless a genuinely equivalent canonical representation exists.
6. Temporarily unavailable products/services SHOULD retain a useful canonical page when the entity remains valid, with accurate availability and alternatives. Permanently removed entities with no equivalent resolve `GONE`/410 after policy checks.
7. Private/authenticated surfaces are protected by authorization, not merely robots directives.
8. `robots.txt`, meta robots and canonical directives MUST NOT contradict one another. Blocking crawl is not a substitute for a required `noindex`/removal lifecycle.
9. Sitemap membership derives from `INDEX`; sitemap presence never grants indexability by itself.
10. An AI recommendation can trigger reevaluation but cannot mutate `IndexabilityDecision` outside the deterministic policy service.

## 22.5 Technical SEO contract

Every indexable template MUST provide:
- crawlable server-rendered or statically rendered primary content and crawlable internal links;
- one meaningful H1 and semantic document hierarchy;
- entity-derived title and description, not global prototype metadata;
- absolute canonical URL and correct status-code behaviour;
- Open Graph/social metadata where public sharing is appropriate;
- accessible descriptive media metadata for meaningful images;
- deterministic structured data generated from the same canonical entities visible to the customer;
- route-level performance budgets and realistic mobile Core Web Vitals verification;
- no requirement for client-side interaction before the primary entity/content can be understood by a crawler.

Cinematic transitions, 3D-style visuals, EPC interaction and rich app behaviour are enhancements. They MUST NOT replace the crawlable textual/entity representation or trap navigation inside non-crawlable client events.

## 22.6 Structured-data contracts

DIAL SHALL map canonical entities to applicable schema.org/search-engine supported structures, including where appropriate:
- `Product` with `Offer` or `AggregateOffer`;
- `BreadcrumbList`;
- `ItemList` for genuine list/category contexts;
- `Organization` and the applicable `LocalBusiness` subtype;
- `Service` and other applicable public entity semantics;
- review/rating properties only from genuine eligible review evidence.

Structured data MUST match visible page truth. Price, currency, availability, condition, seller, identifiers, shipping/collection and return information MUST come from canonical commerce/provider contracts. Fake ratings, invisible claims, unsupported eligibility or stale offer data are prohibited. Rich-result eligibility is treated as an external search-provider concern, not promised by DIAL.

## 22.7 Sitemap and crawl architecture

DIAL MUST generate a sitemap index from the Indexability Policy rather than maintain a manual monolith. Shards SHOULD be partitioned by useful entity/route families such as vehicles, parts/products, EPC, services, providers/technicians, locations, groceries, Care, B2B/logistics and editorial/help content, and rotated within search-engine protocol limits.

Each sitemap record carries the canonical URL and evidence-backed modification time. Deleted, redirected, `NOINDEX`, private or policy-failed URLs are removed automatically. Sitemap generation, submission and fetch errors are observable.

## 22.8 Merchant/search-shopping feeds

Where a target market and approved provider support merchant/search shopping feeds, DIAL SHALL generate them from canonical catalogue, pricing, inventory, seller, shipping and returns truth rather than maintain a second product database. Google Merchant Center/free-listing integration MAY be used where supported, behind the DIAL Tool Gateway.

Feed items MUST be reconciled against landing pages. Product identity, title, brand, identifiers (GTIN/MPN where legitimately known), image, price, currency, availability, condition, seller, destination URL and applicable shipping/returns fields MUST fail stale rather than silently diverge. Feed rejection, disapproval and mismatch reasons are ingested into `GMPC-P080` issues and never silently hidden.

## 22.9 Content quality, authority and anti-doorway controls

Every indexable page must serve a user purpose independent of search ranking. The SEO quality gate MUST reject:
- keyword-swapped doorway pages with no material entity/data difference;
- invented expertise, inventory, fitment, location, price, availability, review or performance claims;
- duplicate AI copy that adds no operational or technical value;
- pages whose authoritative data is below freshness/coverage thresholds;
- mass publication triggered solely by keyword volume.

Technical/editorial content MUST retain source/provenance and review metadata where expertise materially affects the claim. Vehicle/parts fitment claims remain subordinate to canonical fitment/EPC truth. Commercial claims remain subordinate to pricing, inventory, supplier, Care and fulfilment authorities.

## 22.10 Local discovery contract

`GMPC-F081` governs public local discovery. Location/service-area pages exist only for real supported operations or providers. Business name, address/service area, phone/contact channel, hours, fulfilment/service capability and profile identifiers are reconciled with canonical organisation/location truth. Duplicate local profiles are detected and resolved. Review signals may inform discovery only when obtained through an authorised integration and must retain source and freshness; DIAL never fabricates or rewrites customer sentiment as a review.

## 22.11 Hermes + GMPC SEO learning loop

The governed loop is:

```text
search/query + indexing + landing performance evidence
        -> GMPC opportunity detection
        -> entity/inventory/service/location coverage check
        -> Hermes evidence-backed candidate/recommendation
        -> deterministic quality + privacy + indexability gates
        -> approved publication/update
        -> sitemap/feed/structured-data propagation
        -> impressions/clicks/conversion/fulfilment/contribution measurement
        -> Commercial Learning Store
```

Hermes MUST receive the minimum necessary evidence through DKRF/GMPC retrieval controls. Search opportunity generation must never expose private customer or Health data to public-search tooling. Reusable SEO learning is promoted only after downstream business outcomes are known.

## 22.12 SEO observability and acceptance gates

Before `GMPC-F080` can advance beyond its specified planning state, its dedicated acceptance contract MUST prove at least:
1. every indexable route resolves a deterministic indexability decision;
2. arbitrary filter/query combinations cannot create unbounded index inventory;
3. canonical, robots, redirect/status and sitemap behaviour agree;
4. public primary content is server/static rendered and linked through crawlable navigation;
5. metadata is entity-derived and unique enough for the route purpose;
6. structured data validates and equals visible canonical truth;
7. sitemap shards contain only policy-approved canonical `INDEX` URLs;
8. merchant feeds, where enabled, reconcile against canonical product/offer pages;
9. stale price/inventory/location/fitment fails closed or degrades honestly;
10. programmatic pages pass unique-value and anti-doorway gates;
11. private/account/transaction/Health-sensitive routes are not index inventory;
12. Core Web Vitals/performance budgets are tested on realistic mobile profiles;
13. search/index/schema/feed failures are visible in P080/P081 and support/observability surfaces;
14. search outcomes link through conversion, fulfilment and contribution rather than stopping at ranking/traffic;
15. Hermes/AI cannot directly override indexability, canonical truth, review truth or public factual claims.

`GMPC-F081` additionally requires real-location/service-area provenance, local-profile reconciliation, duplicate detection, genuine review provenance, and explicit compliance boundaries for any public Health-adjacent information.

---

# 23. SALES GROWTH

## 23.1 Lead Score Components

```text
fit_score
+ intent_score
+ engagement_score
+ commercial_value
+ relationship_strength
+ timeliness
= priority_score
```

Scores MUST be explainable.

## 23.2 B2B Account Intelligence

Relevant account entities:
- organisation;
- industry;
- locations;
- assets;
- contacts;
- purchases;
- quotes;
- service jobs;
- payment behaviour;
- supplier relationships;
- estimated wallet;
- active opportunities;
- service issues.

---

# 24. MERCHANDISING

GMPC MUST be capable of influencing in-product discovery:

- homepage placements;
- search boosts;
- category highlights;
- related products;
- related services;
- cross-business recommendations;
- sponsored slots;
- seasonal placements.

Sponsored placements MUST be disclosed and MUST NOT silently alter organic relevance.

---

# 25. CROSS-BUSINESS GROWTH

Examples:

```text
Brake pads purchased
  ↓
Dial a Tech fitment offer
  ↓
Vehicle added to My Assets
  ↓
Dial Care maintenance recommendation
```

```text
Technician inspection
  ↓
Part need identified
  ↓
Dial a Spare quote
  ↓
Part ordered
  ↓
Installation booked
```

Cross-business journeys MUST respect consent, privacy and business-unit policy.

---

# 26. BUSINESS-UNIT-SPECIFIC GUARDS

## Dial Groceries
- preserve prepaid goods/entitlement framing for Rounds;
- do not imply savings/investment/deposit product;
- allow category promotions, supplier-funded campaigns and repeat-order journeys.

## Dial Care
- support acquisition, renewal, upgrade and asset onboarding;
- allow benefit reminders without misrepresenting coverage.

## Dial Health
- separate general marketing, member communication, provider communication and health education;
- ordinary marketing MUST NOT target users based on sensitive clinical inference without explicit lawful basis and policy approval.

---

# 27. SUPPLIER / PARTNER MARKETING

Supplier-funded campaigns SHALL support:

```text
fund_id
supplier_id
allocated
committed
spent
remaining
campaigns[]
redemptions[]
reconciliation_status
```

Supplier reporting MAY include:
- qualified impressions;
- product views;
- quote generation;
- conversion;
- attributed sales;
- geographic demand;
- segment summaries where privacy permits;
- campaign contribution;
- fund utilisation.

Do NOT expose unrestricted customer identities.

---

# 28. ATTRIBUTION

Supported models:
- first-touch;
- last-touch;
- linear;
- position-based;
- time-decay;
- data-driven.

Raw touchpoints MUST be retained so attribution models can be recalculated.

Touchpoint example:

```text
Instagram impression
→ Google search
→ product view
→ WhatsApp conversation
→ quote
→ purchase
→ fulfilment
```

---

# 29. INCREMENTALITY

GMPC SHALL support:
- control groups;
- holdout groups;
- audience splits;
- geographic tests;
- historical baseline models.

The platform SHOULD distinguish:
- attributed conversion;
- incremental conversion;
- incremental contribution.

---

# 30. EXPERIMENTATION

Experiment object:

```text
Experiment
 ├─ hypothesis
 ├─ control
 ├─ variants[]
 ├─ primary_metric
 ├─ secondary_metrics[]
 ├─ sample_requirement
 ├─ start_at
 ├─ end_at
 ├─ statistical_method
 ├─ confidence
 ├─ winner?
 └─ commercial_impact
```

AI MUST NOT declare winners without adequate sample/confidence rules.

---

# 31. BUDGET ENGINE

Budget hierarchy:

```text
Dial
 └─ Business Unit
      └─ Period
           └─ Channel
                └─ Campaign
                     └─ Ad Group / Creative
```

Budget fields:
- allocated;
- committed;
- spent;
- forecast;
- remaining;
- variance;
- approval threshold;
- hard limit.

---

# 32. APPROVAL ENGINE

Approval categories:
- campaign;
- promotion;
- budget;
- creative;
- compliance;
- brand;
- supplier funding;
- AI exceptional action.

Approval detail MUST show:
- proposed action;
- reason;
- before/after;
- financial impact;
- customer impact;
- privacy/compliance flags;
- evidence;
- AI rationale;
- policy invoked;
- approval history.

---

# 33. AI / HERMES GROWTH LAYER

Logical growth agents:

| Agent | Responsibilities |
|---|---|
| Growth Strategist | Identify and rank growth opportunities |
| Market Intelligence Agent | Market/competitor research |
| Campaign Planner | Build campaign structures |
| Audience Analyst | Segment design and audience insight |
| Promotion Analyst | Offer design and economics |
| Creative Director | Concepts and channel strategy |
| Content Agent | Copy and asset generation |
| Social Agent | Organic social analysis and scheduling proposals |
| Paid Media Agent | Paid-media analysis and optimisation |
| SEO Agent | Search discovery |
| Lifecycle Agent | Journey optimisation |
| Sales Intelligence Agent | Lead and B2B analysis |
| Merchandising Agent | Placement and cross-sell |
| Finance Analyst | Contribution and profitability |
| Attribution Agent | Attribution and incrementality |
| Compliance Agent | Policy validation |

These are Dial business agents only.

---

# 34. AI AUTONOMY LEVELS

| Level | Capability |
|---|---|
| A0 | Observe |
| A1 | Analyse |
| A2 | Recommend |
| A3 | Draft |
| A4 | Execute reversible action |
| A5 | Operate within explicit policy |

Example:
- analytics refresh: A5;
- draft copy: A4/A5;
- schedule approved post: A4/A5;
- increase ad budget within ±15% approved envelope: A4;
- create high-discount promotion: A2/A3;
- change payment pricing policy: human-only.

---

# 35. CAPABILITY PERMISSIONS

Examples:

```text
campaign.read
campaign.create
campaign.submit
campaign.activate
campaign.pause

promotion.read
promotion.simulate
promotion.create
promotion.activate

social.read
social.draft
social.schedule
social.publish

ads.read
ads.recommend_budget
ads.change_budget

customer.segment.read
customer.growth_profile.read

finance.margin.read
finance.marketing_budget.read

supplier.funding.read
supplier.funding.allocate
```

Permissions MUST be enforced at the tool gateway and service layer.

---

# 36. DIAL TOOL GATEWAY

Flow:

```text
Hermes / GMPC UI
   ↓
Tool Request
   ↓
Identity + Capability Check
   ↓
Policy Check
   ↓
Approval Check
   ↓
PII/PHI Filtering
   ↓
Rate Limit / Idempotency
   ↓
Connector
   ↓
External System
   ↓
Response Normalisation
   ↓
Audit + Telemetry
```

No agent should possess unrestricted long-lived credentials.

---

# 36A. COMMERCIAL RAG & KNOWLEDGE FABRIC

## 36A.1 Purpose

The Commercial RAG & Knowledge Fabric exists to give Hermes and GMPC users **grounded, governed and temporally correct commercial context**.

It MUST NOT be implemented as a single vector store that receives arbitrary business data. It is a retrieval orchestration layer over multiple evidence systems.

Primary responsibilities:

- understand the user's commercial question;
- classify intent, business unit, required freshness and sensitivity;
- route factual sub-questions to authoritative structured systems;
- retrieve historical/narrative context semantically and lexically;
- retrieve entity relationships where relevant;
- retrieve time-series performance from analytics;
- fetch large evidence artefacts from R2;
- enforce purpose/role/business-unit/sensitivity policy before model exposure;
- rank evidence by authority, freshness, relevance and outcome quality;
- assemble an evidence manifest for the model;
- preserve a retrieval trace for audit;
- capture verified commercial learning after outcomes are known.

## 36A.2 Hybrid Retrieval Architecture

```text
User / Hermes Query
        ↓
Query Classification
        ↓
Commercial Query Planner
        ↓
Purpose + Identity + BU + Sensitivity Policy
        ↓
┌─────────────────────────────────────────────────────────┐
│ 1. Structured retrieval      → SQL/domain APIs          │
│ 2. Semantic retrieval        → vector index             │
│ 3. Lexical retrieval         → full-text/search index   │
│ 4. Entity/relationship       → graph/entity projection  │
│ 5. Time-series retrieval     → analytics store          │
│ 6. Artefact retrieval        → R2 metadata/content      │
│ 7. Policy retrieval          → versioned policy store   │
└─────────────────────────────────────────────────────────┘
        ↓
Evidence Normalisation
        ↓
Authority + Freshness + Relevance + Outcome Scoring
        ↓
Conflict / Supersession Resolution
        ↓
Context Budgeting / Compression
        ↓
Evidence Manifest + Model Context
        ↓
Hermes / Model
        ↓
Grounded Response + Evidence References
        ↓
Retrieval Trace + Quality Telemetry
```

## 36A.3 Retrieval Modes

### Structured retrieval

Use for:
- current revenue;
- current advertising spend;
- current campaign state;
- current promotion rules;
- current budgets;
- inventory;
- technician/logistics capacity;
- supplier prices;
- customer transaction history;
- live KPI calculations.

Structured retrieval is authoritative for facts stored in operational systems.

### Semantic retrieval

Use for:
- campaign post-mortems;
- qualitative customer feedback;
- competitor observations;
- strategy reports;
- creative rationale;
- supplier meeting notes;
- historical commercial analysis;
- policy interpretation context where the policy store itself remains authoritative.

### Lexical/full-text retrieval

Use for:
- exact part/product terms;
- promotion codes;
- campaign names;
- policy clauses;
- supplier names;
- exact claims/messages;
- identifiers and acronyms where embeddings are unreliable.

### Entity/graph retrieval

Use for relationships such as:

```text
Customer → owns → Asset
Customer → responded_to → Campaign
Customer → redeemed → Promotion
Product → supplied_by → Supplier
Product → fits → Asset
Campaign → targets → Audience
Campaign → used → Creative
Campaign → generated → Orders
Campaign → funded_by → Supplier Fund
Experiment → evaluated → Creative Variant
```

### Time-series retrieval

Use for:
- spend curves;
- conversion trends;
- ROAS changes;
- social performance;
- search demand;
- budget pacing;
- channel decay;
- campaign-before/after comparisons.

### Artefact retrieval

Use R2 for:
- campaign evidence packs;
- generated reports;
- approved creatives;
- historical exports;
- competitor screenshots or permitted captures;
- supplier campaign packs;
- post-campaign reports.

Large artefacts MUST be referenced by metadata and fetched only when needed.

---

## 36A.4 Authority Hierarchy

Evidence arbitration MUST prefer:

```text
1. Current signed/approved policy and deterministic rule
2. Current domain source-of-truth record
3. Current connector-synchronised metric with freshness within SLA
4. Validated analytics aggregate
5. Verified outcome-linked commercial learning
6. Approved internal document
7. Trusted external market/competitor evidence
8. Historical narrative memory
9. Unverified AI-generated hypothesis
```

A lower-authority source may supplement but MUST NOT silently override a higher-authority source.

---

## 36A.5 Temporal Semantics

Every knowledge object SHOULD support:

```text
observed_at
ingested_at
valid_from
valid_to
source_updated_at
superseded_at
freshness_sla
freshness_state
```

Freshness states:

```text
FRESH
AGING
STALE
SUPERSEDED
UNKNOWN
FAILED_REFRESH
```

Questions containing terms such as `today`, `now`, `current`, `this week`, `latest`, `active`, `available`, `remaining`, or `live` MUST bias toward live structured retrieval and reject stale semantic answers as authoritative facts.

---

## 36A.6 Canonical Retrieval Metadata

Every retrievable item MUST carry, where applicable:

```text
knowledge_object_id
source_type
source_id
source_uri_or_key
source_authority
business_unit
entity_type
entity_id
campaign_id
promotion_id
supplier_id
audience_id
channel
geography
observed_at
valid_from
valid_to
ingested_at
freshness_state
version
sensitivity
purpose_scope
retention_class
content_hash
embedding_version
index_version
supersedes_id
outcome_verification_state
```

---

## 36A.7 Knowledge Namespaces

Commercial knowledge MUST be logically segmented into namespaces such as:

```text
growth.market_intelligence
growth.competitor_intelligence
growth.campaign_learning
growth.promotion_learning
growth.creative_learning
growth.audience_learning
growth.channel_learning
growth.social_learning
growth.paid_media_learning
growth.sales_learning
growth.supplier_learning
growth.experiment_learning
growth.attribution_learning
growth.commercial_playbooks
growth.brand_knowledge
growth.compliance_knowledge
growth.product_service_knowledge
```

Namespaces are a governance boundary, not only an indexing convenience.

---

## 36A.8 Commercial Knowledge Products

### Campaign Learning Store

A completed campaign SHOULD produce:

```text
campaign
objective
audience
geography
products_services
promotion
creatives
channels
budget
spend
conversion
fulfilment_result
revenue
gross_margin
contribution
incrementality
what_worked
what_failed
confidence
recommended_reuse
```

### Promotion Performance Memory

Store:
- eligibility design;
- redemption rate;
- incremental conversion;
- margin impact;
- stacking conflicts;
- customer fatigue;
- supplier funding performance.

### Creative Performance Memory

Store:
- concept;
- copy;
- image/video asset;
- audience;
- channel;
- engagement;
- conversion;
- contribution;
- creative fatigue;
- context in which it succeeded/failed.

### Audience Response Intelligence

Store aggregated, policy-safe learning about how segments respond to:
- channels;
- offers;
- timing;
- creative themes;
- products/services.

### Supplier Marketing Intelligence

Store:
- co-funded campaigns;
- product-level response;
- fulfilment quality;
- supplier price movements;
- campaign contribution;
- geography/category opportunity.

### Experiment Learning Store

Store:
- hypothesis;
- variants;
- sample;
- confidence;
- result;
- commercial effect;
- reuse constraints.

### Commercial Playbook Memory

Only high-confidence, verified patterns should become reusable playbook entries, for example:

> “For a defined product/category and geography, a specific channel/offer combination outperformed the control under these conditions.”

Playbook entries MUST preserve the conditions and confidence; they MUST NOT be generalised without evidence.

---

## 36A.9 Outcome Verification

Knowledge MUST NOT be automatically promoted to reusable commercial memory merely because a campaign generated clicks.

Learning promotion states:

```text
UNVERIFIED
PARTIALLY_VERIFIED
OUTCOME_VERIFIED
PROMOTED
DEPRECATED
REVOKED
```

For outcome verification, GMPC SHOULD wait for:
- conversion completion;
- payment status;
- fulfilment status;
- refund/cancellation window where material;
- contribution calculation;
- experiment confidence if applicable.

---

## 36A.10 Query Planning

The query planner SHOULD decompose questions.

Example:

> Why did Dial a Spare margin fall this week?

Planner:

```text
1. Structured: revenue, COGS, discounts, refunds, payment fees.
2. Structured: supplier price changes.
3. Structured: delivery subsidies.
4. Time-series: compare this week with baseline.
5. Semantic: retrieve campaign/promotion changes and prior investigations.
6. Policy: retrieve current pricing/promotion rules if relevant.
7. Assemble evidence.
8. Explain quantified drivers and uncertainty.
```

The model should not be asked to infer these facts from text chunks.

---

## 36A.11 Context Assembly and Token Management

The RAG layer SHALL control context size.

Priority order:
1. required live facts;
2. controlling policy;
3. high-authority directly relevant evidence;
4. verified historical learning;
5. supporting narrative evidence.

Context assembly SHOULD:
- deduplicate;
- collapse repeated facts;
- summarise long evidence with source links retained;
- cap evidence per source/domain;
- reserve tokens for model reasoning/answer;
- avoid shipping raw sensitive records when aggregates/tokens suffice.

---

## 36A.12 Retrieval Policy Enforcement

Policy evaluation occurs **before context assembly**.

Policy dimensions:
- requester role;
- business unit;
- purpose;
- customer consent;
- sensitivity;
- geography/legal scope;
- agent capability;
- model destination;
- internal vs external model;
- retention rule.

Possible decisions:

```text
ALLOW
ALLOW_REDACTED
ALLOW_AGGREGATED
DENY
REQUIRE_APPROVAL
```

A denied item MUST NOT be embedded into model context and merely “instructed not to reveal it.”

---

## 36A.13 PII/PHI Protection

Where external model processing is permitted, context SHOULD use:
- customer token instead of direct identity;
- age band rather than date of birth where sufficient;
- region rather than full address where sufficient;
- aggregated health/provider metrics rather than individual clinical data;
- product/service behaviour without unnecessary identity.

Rehydration of local identifiers, where required, occurs after model output inside Dial's trusted boundary.

---

## 36A.14 Ingestion Pipeline

```text
Source Change / Scheduled Refresh
        ↓
Source Adapter
        ↓
Schema Validation
        ↓
Classification
        ↓
PII/PHI Detection
        ↓
Normalisation
        ↓
Entity Resolution
        ↓
Version / Supersession Check
        ↓
Chunking where appropriate
        ↓
Embedding
        ↓
Full-text Index
        ↓
Graph Projection
        ↓
Metadata Persist
        ↓
Quality Check
        ↓
Publish Knowledge Object
```

Not every source should be embedded. Structured tables that are better queried directly SHOULD remain structured and only expose metadata/schema knowledge to RAG.

---

## 36A.15 Chunking Rules

Chunking MUST be source-aware.

Examples:
- campaign post-mortem: section-aware chunks;
- policy: clause/section-aware chunks with version;
- supplier report: table-aware plus narrative chunks;
- social post: one post as one object, not arbitrary token windows;
- creative asset: metadata + generated description + performance reference;
- customer conversation: bounded conversation summaries subject to consent/privacy;
- analytics tables: do not vectorise every row; query analytically.

---

## 36A.16 Embedding and Index Versioning

Store:
- embedding provider/model identifier;
- embedding version;
- generated_at;
- source content hash;
- chunking strategy version;
- index version.

When embedding models or chunking strategy change, support controlled reindexing without destroying the historical source object.

---

## 36A.17 Conflict and Supersession Handling

Examples:
- current promotion says 5% while an old campaign memo says 10%;
- supplier price changed after a post-campaign report;
- brand wording changed;
- competitor pricing observation is 90 days old.

The system MUST:
1. detect possible conflict;
2. rank current authority;
3. mark older evidence superseded or historical;
4. preserve history;
5. prevent stale context from being presented as current fact.

---

## 36A.18 Retrieval Trace

Every AI investigation or material recommendation MUST be capable of producing a trace containing:

```text
trace_id
query
actor
purpose
query_plan
retrievers_called[]
structured_queries[]
knowledge_objects_considered[]
knowledge_objects_selected[]
knowledge_objects_denied[]
policy_decisions[]
freshness_decisions[]
authority_decisions[]
context_manifest[]
model_used
response_id
latency
token_count
```

The user-facing UI need not expose raw secrets or hidden model reasoning. It SHOULD expose the evidence and retrieval decisions necessary to audit the answer.

---

## 36A.19 RAG Quality Metrics

Measure:
- retrieval precision proxy;
- grounded-answer rate;
- evidence citation coverage;
- stale-evidence rate;
- superseded-evidence leak rate;
- policy-denial rate;
- sensitive-data leak rate;
- retrieval latency;
- empty-retrieval rate;
- structured-vs-semantic routing accuracy;
- user correction rate;
- post-answer contradiction rate;
- verified-learning reuse success.

---

## 36A.20 Failure Behaviour

### Vector index unavailable
- structured/live facts remain available;
- semantic history marked unavailable;
- no fabricated memory.

### Full-text index unavailable
- semantic/structured paths continue;
- exact-term retrieval degraded.

### Graph projection unavailable
- entity relationship results marked degraded;
- do not infer missing relationships.

### Source stale
- show freshness warning;
- prefer fresher authority;
- require refresh for high-risk current decisions.

### Ingestion failure
- retain last known valid indexed version;
- mark current source refresh failed;
- never replace good knowledge with partial/failed output.

### Policy engine unavailable
- fail closed for protected retrieval;
- do not send potentially sensitive context to models.

### External model unavailable
- retain retrieval trace/evidence pack;
- deterministic GMPC operations remain available.

---

## 36A.21 RAG Security Threat Model

Controls MUST address:
- prompt injection embedded in documents;
- malicious supplier content;
- poisoned external competitor pages;
- cross-business data leakage;
- membership inference;
- indirect PII leakage through overly specific aggregates;
- stale policy retrieval;
- unauthorised source registration;
- tampered source artefacts;
- model/tool exfiltration attempts.

Retrieved content MUST be treated as untrusted evidence, not executable instruction.

---

## 36A.22 RAG Testing

### Retrieval unit tests
- metadata filtering;
- authority ranking;
- freshness ranking;
- supersession;
- namespace isolation;
- purpose/role policy.

### Golden-query tests
Maintain a set of representative commercial questions with expected source classes and evidence.

### Leakage tests
Verify protected Dial Health/customer data cannot enter ordinary marketing contexts.

### Temporal tests
Verify “current” queries reject stale/historical answers.

### Conflict tests
Verify authoritative current facts win against historical semantic evidence.

### Degradation tests
Disable vector/full-text/graph/policy components and validate defined failover/fail-closed behaviour.

### Outcome-learning tests
Verify unfulfilled/refunded/failed campaigns do not become positive reusable learning.

---

# 37. EVENT TAXONOMY

## Campaigns
```text
campaign.created
campaign.updated
campaign.submitted
campaign.approved
campaign.rejected
campaign.scheduled
campaign.launched
campaign.paused
campaign.completed
campaign.cancelled
```

## Promotions
```text
promotion.created
promotion.updated
promotion.activated
promotion.paused
promotion.evaluated
promotion.redeemed
promotion.exhausted
promotion.expired
```

## Content & Social
```text
content.created
content.generated
content.validated
content.approved
social.post.scheduled
social.post.published
social.post.failed
social.engagement.received
```

## Ads
```text
ad.campaign.mapped
ad.spend.updated
ad.budget.changed
ad.performance.updated
ad.connector.failed
```

## Sales
```text
lead.created
lead.qualified
lead.disqualified
opportunity.created
opportunity.stage_changed
quote.created
quote.expired
quote.accepted
```

## Commerce
```text
cart.abandoned
order.created
order.completed
order.cancelled
booking.created
booking.completed
membership.started
membership.renewed
membership.cancelled
```

## Growth
```text
growth.opportunity.detected
growth.recommendation.created
growth.recommendation.accepted
growth.recommendation.dismissed
```

## Commercial Knowledge / RAG
```text
knowledge.source.registered
knowledge.source.updated
knowledge.ingestion.started
knowledge.ingestion.completed
knowledge.ingestion.failed
knowledge.object.created
knowledge.object.superseded
knowledge.object.deprecated
knowledge.conflict.detected
knowledge.conflict.resolved
knowledge.freshness.changed
knowledge.reindex.started
knowledge.reindex.completed
retrieval.query.started
retrieval.query.completed
retrieval.policy.denied
retrieval.quality.warning
commercial_memory.created
commercial_memory.verified
commercial_memory.promoted
commercial_memory.deprecated
```

All events MUST have:
- event_id;
- occurred_at;
- actor;
- source;
- correlation_id;
- causation_id where applicable;
- payload schema version.

---

# 38. DATA MODEL — CORE TABLES

Recommended core relational entities:

```text
growth_campaigns
campaign_objectives
campaign_business_units
campaign_channels
campaign_products
campaign_geographies
campaign_targets
campaign_capacity_rules
campaign_external_mappings

promotions
promotion_rules
promotion_actions
promotion_exclusivity_groups
promotion_funding
promotion_redemptions
promotion_evaluations

audiences
audience_versions
audience_rules
audience_memberships

journeys
journey_versions
journey_nodes
journey_edges
journey_runs
journey_run_steps

creative_assets
creative_versions
creative_channel_variants
brand_rules
brand_validation_results
compliance_validation_results

social_accounts
social_posts
social_post_mappings
social_metrics_daily

ad_accounts
ad_campaign_mappings
ad_performance_daily
ad_budget_changes

seo_queries
seo_pages
seo_issues
seo_opportunities

leads
lead_scores
b2b_accounts
sales_opportunities
sales_activities

merchandising_placements
merchandising_rules
sponsored_placements

experiments
experiment_variants
experiment_assignments
experiment_results

customer_touchpoints
attribution_runs
attribution_results
incrementality_tests

marketing_budgets
marketing_spend
supplier_marketing_funds

approval_requests
approval_decisions

growth_opportunities
growth_recommendations

ai_agents
ai_agent_runs
ai_agent_actions
ai_agent_costs

integration_accounts
integration_sync_runs
integration_health

policies
policy_versions
policy_decisions

audit_events

knowledge_sources
knowledge_source_versions
knowledge_objects
knowledge_object_versions
knowledge_chunks
knowledge_embeddings
knowledge_fulltext_documents
knowledge_entity_links
knowledge_graph_edges
knowledge_freshness_status
knowledge_conflicts
knowledge_ingestion_jobs
knowledge_index_runs

retrieval_policies
retrieval_policy_versions
retrieval_traces
retrieval_trace_items
retrieval_policy_decisions
retrieval_quality_metrics

commercial_memory_objects
commercial_memory_versions
commercial_memory_evidence
commercial_memory_outcomes
commercial_playbooks
commercial_playbook_conditions
```

### 38.1 Storage responsibility

| Data Class | Canonical Store |
|---|---|
| Live campaign/promotion/budget/customer transaction facts | Operational relational DB/domain services |
| High-volume marketing/ad/social metrics | Analytics/time-series store |
| Searchable documents and narrative text | Full-text + semantic index with canonical metadata |
| Entity relationships | Graph projection/entity relation store |
| Heavy reports, creatives and evidence artefacts | R2 |
| RAG source/metadata/version/provenance | Relational knowledge metadata store |
| Reusable verified commercial learning | Commercial memory store + searchable projection |
| Policies and approvals | Versioned relational policy store |

---

# 39. API CATALOG

## Growth
```text
GET  /growth/kpis
GET  /growth/commercial-health
GET  /opportunities
GET  /opportunities/{id}
POST /opportunities/{id}/dismiss
POST /simulations
```

## Campaigns
```text
GET  /campaigns
POST /campaigns
GET  /campaigns/{id}
PATCH /campaigns/{id}
POST /campaigns/{id}/submit
POST /campaigns/{id}/schedule
POST /campaigns/{id}/activate
POST /campaigns/{id}/pause
POST /campaigns/{id}/complete
GET  /campaigns/{id}/timeline
GET  /campaigns/{id}/economics
```

## Promotions
```text
GET  /promotions
POST /promotions
GET  /promotions/{id}
PATCH /promotions/{id}
POST /promotions/{id}/simulate
POST /promotions/{id}/activate
POST /promotions/{id}/pause
POST /promotions/evaluate
POST /promotions/conflict-check
```

## Audiences
```text
GET  /audiences
POST /audiences
GET  /audiences/{id}
POST /audiences/preview
POST /audiences/predict
POST /audiences/{id}/versions
```

## Journeys
```text
GET  /journeys
POST /journeys
GET  /journeys/{id}
PATCH /journeys/{id}
POST /journeys/{id}/activate
POST /journeys/{id}/pause
GET  /journeys/runs/{id}
```

## Content
```text
POST /content/briefs
POST /content/generate-copy
POST /content/generate-concepts
POST /assets
GET  /assets/{id}
POST /assets/{id}/variants
POST /brand/validate
POST /compliance/validate
```

## Social
```text
GET  /social/accounts
GET  /social/posts
POST /social/posts
POST /social/posts/{id}/review
POST /social/posts/{id}/schedule
GET  /social/analytics
GET  /social/competitors
```

## Ads
```text
GET  /ads/accounts
POST /ads/mappings
GET  /ads/performance
POST /ads/recommendations
POST /ads/budgets/adjust
```

## Sales
```text
GET  /leads
GET  /leads/{id}
GET  /leads/{id}/score
GET  /accounts/{id}/growth
GET  /opportunities
PATCH /opportunities/{id}
```

## Attribution & Finance
```text
GET /attribution/models
GET /attribution/touchpoints
GET /attribution/contribution
GET /incrementality
GET /budgets
GET /profitability/romi
GET /profitability/contribution-roi
```

## Governance
```text
GET  /approvals
POST /approvals/{id}/approve
POST /approvals/{id}/reject
GET  /agents
GET  /agents/runs/{id}
GET  /integrations
GET  /integrations/health
GET  /policies
GET  /audit
GET  /observability
```

## Commercial RAG & Knowledge
```text
GET  /knowledge/health
GET  /knowledge/coverage

GET  /knowledge/sources
POST /knowledge/sources
GET  /knowledge/sources/{id}
PATCH /knowledge/sources/{id}
POST /knowledge/sources/{id}/reindex

POST /knowledge/query
GET  /knowledge/objects/{id}
GET  /knowledge/objects/{id}/versions
GET  /knowledge/objects/{id}/relationships

GET  /knowledge/drift
GET  /knowledge/conflicts
POST /knowledge/conflicts/{id}/resolve

GET  /knowledge/pipeline/jobs
POST /knowledge/pipeline/jobs/{id}/retry
GET  /knowledge/pipeline/health
GET  /knowledge/retrieval-quality

GET  /retrieval-traces/{id}
GET  /retrieval-traces/{id}/context

GET  /retrieval-policies
POST /retrieval-policies
PATCH /retrieval-policies/{id}
POST /retrieval-policies/simulate

GET  /commercial-memory
GET  /commercial-memory/{id}
POST /commercial-memory/{id}/promote
POST /commercial-memory/{id}/deprecate
POST /commercial-memory/from-campaign/{id}
POST /commercial-memory/from-experiment/{id}
POST /commercial-memory/from-promotion/{id}
```

---

# 40. EXTERNAL CONNECTORS

Initial recommended connectors:

| Capability | Connector |
|---|---|
| Social publishing & analytics | Metricool |
| Meta ads | Meta Ads API |
| Google ads | Google Ads API |
| Web analytics | Google Analytics |
| Search discovery | Search Console |
| TikTok paid media | TikTok Ads |
| WhatsApp | WhatsApp Business Platform |
| Email | Approved Dial provider |
| SMS | Approved Dial provider |
| R2 | Creative and report storage |
| Internal operations | Dial APIs/events |

External services MUST not become the canonical source of Dial commercial truth.

---

# 41. FAILURE MODES & REQUIRED BEHAVIOUR

## Metricool unavailable
- retain internal scheduled post state;
- mark connector degraded;
- retry with idempotency;
- never double-publish;
- surface explicit sync status.

## Ad platform unavailable
- preserve pending change locally;
- do not represent external campaign as changed until confirmed;
- alert on stale metrics.

## Analytics delayed
- display last-updated timestamp;
- AI must not present stale data as current.

## Promotion service unavailable
- fail closed;
- do not invent discount;
- preserve checkout integrity.

## AI provider unavailable
- core deterministic campaign/promotion operations continue;
- AI recommendations become unavailable/degraded;
- no data-loss.

## Event bus delay
- queue and replay safely;
- deduplicate by event_id.

## Commercial RAG vector index unavailable
- continue live structured retrieval;
- mark semantic history unavailable;
- do not synthesize missing historical evidence.

## Knowledge source stale
- expose freshness warning;
- prefer fresher authoritative sources;
- prevent stale evidence being described as current fact.

## Knowledge ingestion failed
- preserve last known valid version;
- mark refresh failure;
- do not publish partial objects as canonical.

## Retrieval policy service unavailable
- fail closed for protected retrieval;
- no protected customer/health context may be sent to external models.

## Conflicting knowledge
- invoke authority/supersession rules;
- show unresolved conflict if deterministic arbitration is not possible.

---

# 42. IDEMPOTENCY REQUIREMENTS

Required for:
- publish post;
- create external ad campaign;
- change external ad budget;
- redeem promotion;
- send marketing message;
- create approval request;
- activate campaign;
- process connector webhook.

Every write request SHOULD include:
- idempotency_key;
- correlation_id;
- actor;
- expected version where optimistic concurrency applies.

---

# 43. OBSERVABILITY

Every connector MUST expose:
- auth status;
- last successful sync;
- last failure;
- error code;
- quota/limit status;
- pending backlog;
- latency;
- stale-data age.

Every domain service SHOULD expose:
- request rate;
- error rate;
- latency;
- queue depth;
- retry count;
- DLQ size;
- saturation.

Commercial RAG observability MUST additionally expose:
- source freshness by domain;
- ingestion backlog;
- failed ingestion jobs;
- embedding/index version coverage;
- full-text index health;
- graph projection health;
- retrieval latency by retriever;
- policy-denied retrieval count;
- stale evidence selected count;
- superseded evidence selected count;
- empty retrieval rate;
- evidence citation coverage;
- retrieval-trace availability;
- commercial-memory verification backlog.

---

# 44. AUDIT REQUIREMENTS

Every important action MUST record:

```text
actor_type
actor_id
action
entity_type
entity_id
before
after
reason
source
correlation_id
approval_id?
agent_run_id?
external_reference?
timestamp
```

`actor_type` MUST distinguish:
- HUMAN;
- AI_AGENT;
- SYSTEM;
- EXTERNAL_CONNECTOR.

Material AI outputs MUST also link to a `retrieval_trace_id` so an auditor can reconstruct:
- which sources were consulted;
- which evidence was selected;
- which evidence was denied;
- what freshness/authority decisions applied;
- what context manifest was provided to the model.

---

# 45. MARKETING FATIGUE PROTECTION

Global and channel-specific controls SHALL support:
- max messages/day;
- max messages/week;
- quiet hours;
- channel frequency caps;
- suppression list;
- unsubscribe;
- campaign exclusion;
- post-purchase suppression;
- emergency disable.

Operational notifications MUST remain distinct from promotional communications.

---

# 46. CUSTOMER PREFERENCE CENTRE INTEGRATION

Customer communication preferences SHOULD include:
- promotions;
- new products;
- order updates;
- service reminders;
- membership communications;
- recurring service status;
- preferred channels.

GMPC MUST honour those preferences before sending optional marketing.

---

# 47. AI COST GOVERNANCE

Per agent run store:
- model;
- provider;
- tokens/input/output;
- execution time;
- external tool calls;
- estimated monetary cost;
- campaign/business unit;
- action/result;
- commercial outcome linkage.

KPIs:
- AI cost per campaign;
- AI cost per conversion;
- AI cost per incremental contribution;
- savings/revenue attributed to AI-supported actions.

---

# 48. SECURITY

Minimum controls:
- RBAC;
- capability permissions;
- MFA for high-impact actions;
- encrypted secrets;
- secrets rotation;
- signed webhooks;
- least privilege;
- PII minimisation;
- environment separation;
- audit;
- rate limits;
- session controls;
- anti-CSRF where applicable;
- input validation;
- output encoding;
- connector scope validation.

Agents MUST never store unrestricted platform credentials in prompt context or memory.

---

# 49. PERFORMANCE TARGETS

Initial production targets SHOULD include:

- page P95 read latency: < 2 s excluding third-party delays;
- write API P95: < 1.5 s for local operations;
- promotion evaluation P95: < 200 ms under normal load;
- promotion evaluation availability: ≥ 99.95%;
- event processing normal lag: < 60 s for marketing analytics events;
- critical operational event lag: < 10 s where used for capacity gating;
- external connector freshness target clearly defined per connector;
- knowledge query P95 target: < 2.5 s for ordinary hybrid retrieval excluding slow external refresh;
- retrieval policy evaluation P95: < 150 ms;
- retrieval trace persistence success: ≥ 99.9% for material AI investigations;
- stale-evidence-as-current critical defect target: 0;
- protected-data leakage into unauthorised model context target: 0.

Exact SLOs MAY be tightened after baseline telemetry.

---

# 50. TEST STRATEGY

## Unit
- promotion rule evaluation;
- stacking;
- margin guard;
- budget guard;
- state transitions;
- audience operators;
- suppression rules.

## Contract
- all public APIs;
- connector adapters;
- webhook schemas;
- event schemas.

## Integration
- campaign → approval → activation;
- promotion → checkout evaluation;
- social post → Metricool;
- ad mapping → analytics import;
- attribution → finance.

## End-to-End
- opportunity → campaign → promotion → content → approval → publish → conversion → attribution → contribution.

## Failure Injection
- connector outage;
- duplicate webhook;
- delayed event;
- stale analytics;
- AI provider outage;
- R2 unavailable;
- DB transient error.

## Security
- privilege escalation;
- sensitive-field access;
- connector scope abuse;
- replay attack;
- webhook spoofing;
- audit tampering.

## Commercial RAG
- structured-vs-semantic routing;
- authority precedence;
- freshness rejection;
- supersession;
- namespace/business-unit isolation;
- purpose limitation;
- PII/PHI redaction;
- prompt-injection resistance in retrieved content;
- malicious source handling;
- retrieval trace completeness;
- vector-index outage degradation;
- full-text outage degradation;
- policy-service fail-closed behaviour;
- outcome verification before learning promotion;
- golden commercial queries;
- contradiction regression suite.

---

# 51. GOLDEN END-TO-END FUNCTIONAL CLOSURE SCENARIO

Scenario:

> Dial detects rising demand for Toyota Hilux suspension parts in Harare.

Expected chain:

```text
1. Opportunity detector identifies demand increase.
2. Opportunity evidence includes searches, quotes and sales.
3. System checks stock and suppliers.
4. System checks Dial a Tech fitment capacity.
5. System checks logistics capacity.
6. Hermes proposes target audience and campaign objective.
7. Campaign Builder creates draft.
8. Promotion Analyst proposes optional offer.
9. Promotion Simulator verifies margin floor.
10. Campaign Simulator estimates low/likely/high outcomes.
11. Content Studio creates social and ad variants.
12. Brand and compliance validators run.
13. Human approval is requested.
14. Campaign is approved.
15. Social posts are scheduled through Metricool.
16. Paid campaigns are mapped to Google/Meta/TikTok.
17. Live performance is ingested.
18. Budget recommendation is generated.
19. Any AI budget change stays within policy.
20. Customer clicks are captured as touchpoints.
21. Purchases and fitment bookings are linked.
22. Fulfilment result is received.
23. Revenue and contribution are calculated.
24. Attribution runs.
25. Incrementality is estimated if a holdout exists.
26. Campaign post-mortem is produced.
27. Outcome-verification checks fulfilment, refund/cancellation and contribution.
28. A commercial learning package is created.
29. Verified learning is indexed into the appropriate commercial-memory namespaces.
30. Retrieval metadata records source, authority, validity, sensitivity and evidence.
31. Future Hermes investigations can retrieve the learning through hybrid RAG.
32. Retrieval trace proves which live facts and historical learning supported the next recommendation.
```

The GMPC implementation is not considered complete until this scenario is demonstrably green across UI, API, data, integrations, audit, observability and tests.

---

# 52. FEATURE COMPLETENESS GATES

A feature is GREEN only when all relevant layers are complete:

```text
Documented Intent
+
Page / UX
+
Backend API
+
Domain Logic
+
Data Persistence
+
Permissions
+
Validation
+
State Management
+
Failure Handling
+
Audit
+
Observability
+
Automated Tests
+
Operational Runbook
+
Knowledge/RAG Mapping where applicable
+
Retrieval Policy where applicable
+
Evidence Provenance where AI is used
```

A visible UI element without working backend closure MUST be marked incomplete. An AI-enabled feature without a defined source-of-truth route, retrieval policy and evidence trace MUST also be marked incomplete.

---

# 53. PAGE COMPLETENESS GATES

Every page MUST define:
- route;
- role access;
- read model;
- actions;
- empty state;
- loading state;
- stale-data state;
- degraded connector state;
- validation errors;
- permission-denied state;
- audit correlation;
- telemetry events;
- mobile/tablet behaviour where supported;
- knowledge source/freshness indicators where AI-derived evidence is shown;
- retrieval-trace/evidence access for material AI recommendations;
- policy-denied/degraded knowledge state where applicable.

---

# 54. IMPLEMENTATION PHASING

## Phase 1 — Foundations
- campaign domain;
- opportunity shell;
- audiences;
- budgets;
- approvals;
- policies;
- audit;
- event taxonomy.

## Phase 2 — Promotions
- rules;
- stacking;
- funding;
- margin controls;
- checkout evaluation;
- simulation.

## Phase 3 — Content & Social
- content studio;
- brand rules;
- R2 asset management;
- Metricool integration;
- social calendar;
- approvals;
- analytics.

## Phase 4 — Paid Media
- Google;
- Meta;
- TikTok;
- mapping;
- spend;
- performance;
- budget guardrails.

## Phase 5 — Journeys & Retention
- event-driven journey runtime;
- WhatsApp/email/SMS/in-app;
- suppression;
- consent.

## Phase 6 — Attribution & Finance
- touchpoints;
- contribution;
- ROMI;
- incremental lift;
- supplier funding.

## Phase 6A — Commercial RAG & Knowledge Fabric
- knowledge source registry;
- authority/freshness/sensitivity metadata;
- hybrid query planner;
- structured retrieval adapters;
- semantic and full-text indexes;
- entity/graph projection;
- R2 artefact retrieval;
- purpose-aware retrieval policies;
- retrieval trace;
- freshness/drift control;
- commercial learning store;
- post-campaign/promotion/experiment learning packages;
- RAG observability and quality tests.

## Phase 7 — Hermes Growth Intelligence
- opportunities;
- investigations;
- campaign planner;
- audience analyst;
- budget recommendations;
- commercial health;
- hybrid RAG-grounded investigations;
- evidence manifests and retrieval traces;
- authority/freshness-aware recommendations;
- retrieval quality monitoring.

## Phase 8 — Advanced Optimisation
- bounded autonomous optimisation;
- predictive audiences;
- supplier intelligence;
- cross-business growth;
- advanced incrementality.

---

# 55. DEFINITION OF DONE FOR REV 2

Rev 1 is structurally complete when:

- every documented GMPC capability is assigned a feature ID;
- every feature has a primary page owner;
- every page has a canonical purpose;
- every atomic feature is independently testable;
- every critical action has an API contract;
- promotion logic is deterministic and fail-closed;
- sensitive data boundaries are explicit;
- AI autonomy levels are policy-driven;
- external connectors remain subordinate to Dial source-of-truth data;
- campaign success can be traced through fulfilment into contribution;
- audit and observability are first-class;
- failure behaviour is defined;
- golden end-to-end closure is testable;
- RAG is hybrid rather than vector-only;
- current facts are routed to authoritative structured sources;
- every retrievable knowledge object has provenance, authority, freshness and sensitivity metadata;
- purpose-aware retrieval policy is enforced before model context assembly;
- commercial memory is outcome-linked and versioned;
- retrieval traces are available for material AI recommendations;
- stale/superseded/conflicting knowledge has explicit behaviour;
- RAG degradation and security failure modes are tested.

---

# 56. CANONICAL STRATEGIC END STATE

The target is not:

> “Dial has AI marketing.”

The target is:

> **Dial has a closed-loop commercial intelligence and execution platform that detects demand, identifies opportunities, plans campaigns, generates compliant content, manages promotions, coordinates social and paid media, respects operational capacity, converts customer intent into transactions, measures actual contribution, converts verified outcomes into governed commercial knowledge, retrieves that knowledge with authority/freshness/privacy controls, and continuously improves growth while management retains control over money, privacy, reputation and policy.**

That is the canonical operating standard for the Dial Growth, Marketing & Promotions Control Centre.
