# DIAL KNOWLEDGE & RETRIEVAL FABRIC
## Comprehensive Retrieval-Augmented Generation (RAG) Architecture

**Version:** 1.0  
**Date:** 30 August 2026  
**Status:** Canon-extension design package — proposed for registry allocation and plan-phase grill before implementation  
**Scope:** Shared DIAL Knowledge & Retrieval Fabric across DIAL business units, operator systems, AI capabilities and customer-safe experiences  
**Operating principle:** **Retrieve evidence; never replace authority.**

---

# 0. Executive decision

DIAL should adopt RAG as a **first-class horizontal platform capability**, but it should not be implemented as a generic chatbot or as a third-party RAG framework that becomes a hidden system of record.

The target is a broader platform named:

> **DIAL Knowledge & Retrieval Fabric (DKRF)**

DKRF combines permission-aware knowledge ingestion, provenance and document lifecycle, exact/lexical retrieval, semantic vector retrieval, hybrid retrieval, reranking, structured DIAL API retrieval, citation assembly, privacy-aware context construction, controlled model generation, abstention, evaluation, red-team testing, operational feedback and Intelligence Factory promotion.

RAG is one capability inside DKRF.

The core rule is:

```text
DIAL canonical systems
        ↓
authoritative facts / state
        ↓
structured APIs

Approved knowledge
        ↓
DKRF retrieval
        ↓
context

Structured truth + retrieved evidence
        ↓
DIAL AI Gateway
        ↓
fact / inference / recommendation
        ↓
customer or operator experience
```

RAG supplies context. It never becomes the authority for customer price, payment state, ledger balance, supplier stock truth, fitment compatibility, technician eligibility, delivery assignment, payroll, entitlement balance, claim approval, branch activation, compliance gates or clinical authority.

---

# 1. Existing DIAL decisions this architecture preserves

This design extends the current DIAL masters rather than reopening them. Existing DIAL material already requires PostgreSQL + pgvector as the initial semantic layer, embeddings for retrieval instead of repeatedly resending long documents, an AI Gateway/Orchestrator, provider/model abstraction, cost and token accounting, structured-output enforcement, audit, deterministic rules before AI, ERP records as authoritative, Meilisearch as a projection/search engine rather than catalogue truth, outcome-weighted AI evaluation, Promptfoo-based evaluation/promotion, model egress minimisation/pseudonymisation, no AI-written payable money, no AI auto-publication of catalogue/fitment facts, no silent self-modification, human review for consequential promotion, and public AI as capability-specific rather than one generic marketplace agent.

DKRF turns those existing principles into a complete production RAG subsystem.

---

# 2. Product goals

## 2.1 Operational intelligence

Give DIAL staff, technicians, support agents, supplier managers, project teams and control-room operators fast access to the correct approved knowledge in the context of the transaction they are handling.

## 2.2 Customer experience

Allow customers to express needs in natural language without weakening deterministic commercial, fitment, safety or eligibility rules.

## 2.3 Organisational learning

Turn validated operational outcomes into reusable knowledge through a controlled promotion loop.

## 2.4 Cost reduction

Reduce support handling time, manual document hunting, repeat diagnosis effort, poor catalogue searches, training lookup time, repeated model context transmission, avoidable returns and avoidable rework.

---

# 3. Explicit non-goals

DKRF is not a replacement for Postgres/Supabase, a second catalogue, a second CRM, a second ledger, a second job database, a second vector SaaS that owns DIAL data, an autonomous claims adjudicator, an autonomous compliance authority, a pricing engine, a hidden scoring engine, a mechanism for uploading arbitrary web content directly into trusted knowledge, a way to export all DIAL personal data to external model providers, or a generic agent with unrestricted tools.

---

# 4. High-level architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         DIAL APPLICATIONS                            │
│ Web · Android · iOS · WhatsApp · Technician · Supplier · Admin      │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                    capability-specific request
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    DIAL AI CAPABILITY API                            │
│ technicianAssist · supportAssist · catalogueAssist · academyAsk     │
│ projectAssist · supplierAssist · commandCentreExplain · etc.        │
└──────────────────────────────┬───────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    CONTEXT / QUERY PLANNER                           │
│ intent · actor · scope · authority need · risk · privacy · latency  │
└──────────────┬───────────────────┬───────────────────┬───────────────┘
               │                   │                   │
        STRUCTURED FACT         KNOWLEDGE          DISCOVERY
               │                   │                   │
               ▼                   ▼                   ▼
      DIAL DOMAIN READ APIs   DKRF RETRIEVAL      MEILISEARCH
      payment/order/job      Postgres + pgvector  hybrid catalogue
      fitment/eligibility    FTS + vector + ACL   search projection
      vehicle/customer              │                   │
               └──────────────┬─────┴───────────────────┘
                              ▼
                     CANDIDATE FUSION
                              │
                       exact rules first
                              │
                    hybrid rank / RRF
                              │
                         reranker
                              │
                   authority/freshness
                              │
                         top context
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   CONTEXT SECURITY GATE                              │
│ ACL · sensitivity · purpose · consent · egress · PII minimisation   │
└──────────────────────────────┬───────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      DIAL AI GATEWAY                                 │
│ LiteLLM/model routing · budgets · fallbacks · structured outputs     │
└──────────────────────────────┬───────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│              OUTPUT VERIFIER + CITATION BUILDER                      │
│ grounding · schema · citations · uncertainty · forbidden actions    │
└──────────────────────────────┬───────────────────────────────────────┘
                               ▼
                         USER EXPERIENCE
```

---

# 5. Separate ingestion architecture

```text
APPROVED SOURCE
     ↓
Source Registry
     ↓
Quarantine
     ├─ malware/file validation
     ├─ content-type validation
     ├─ source licence/provenance
     ├─ document hash
     └─ upload authority
     ↓
Document Parser
Docling / native structured adapters
     ↓
Structural Normalisation
headings · pages · tables · figures · sections
     ↓
Privacy / Security Classification
     ├─ PII detection
     ├─ secret detection
     ├─ trust class
     ├─ document ACL
     └─ prompt-injection scan
     ↓
Domain Enrichment
vehicle · trade · part · supplier · project · policy
     ↓
Chunking
hierarchical + structure-aware
     ↓
Chunk ACL inheritance
     ↓
Lexical Index
tsvector / exact identifiers
     ↓
Embedding Queue
     ↓
Embedding Service
     ↓
pgvector index
     ↓
Review / Publish
     ↓
ACTIVE KNOWLEDGE
```

No document becomes production-retrievable merely because it was successfully parsed.

---

# 6. Knowledge trust model

Every source and chunk must have an explicit trust class.

## K-A — authoritative external or approved normative knowledge

Examples: legislation/regulator publications, OEM/manufacturer service information that DIAL is licensed to use, signed supplier/manufacturer technical documentation, approved DIAL policies, approved DIAL SOPs and approved safety procedures.

## K-B — validated DIAL operational knowledge

Examples: completed jobs with validated outcome, technician troubleshooting outcomes, closed quality findings, approved CAPA lessons, resolved support/RCE patterns and approved project close-out lessons.

## K-C — controlled contextual material

Examples: supplier product descriptions, supplier installation notes, operator notes, approved internal guidance and non-authoritative historical case summaries.

## K-D — untrusted / candidate material

Examples: customer uploads, raw supplier uploads before review, web content, OCR output that failed confidence checks, AI-generated summaries, draft procedures and knowledge candidates.

K-D is never treated as normative production knowledge.

A semantically similar K-D chunk must never outrank an applicable K-A policy merely because the embedding score is higher.

---

# 7. Knowledge lifecycle

```text
PROPOSED
→ QUARANTINED
→ PARSED
→ CLASSIFIED
→ REVIEW_PENDING
→ APPROVED
→ INDEXING
→ ACTIVE
```

Alternate:

```text
ANY PRE-ACTIVE → REJECTED
ACTIVE → SUPERSEDED
ACTIVE → REVOKED
ACTIVE → EXPIRED
ACTIVE → QUARANTINED
INDEXING → INDEX_FAILED
```

Normal production retrieval excludes draft/proposed/rejected/revoked knowledge. Superseded knowledge is historical-only unless a RetrievalProfile explicitly allows it.

---

# 8. Knowledge source taxonomy by DIAL module

| Domain | Knowledge sources | Structured truth that remains API-based |
|---|---|---|
| Tech | manuals, SOPs, approved diagnostic checklists, validated prior outcomes | job state, technician eligibility, quote, payment |
| Spare | product descriptions, fitment evidence documents, manufacturer docs, interchange evidence | canonical part, FitmentClaim, supplier stock, price |
| Vehicle Hub | manuals, service guidance, vehicle-specific approved knowledge | vehicle identity, ownership, mileage, history |
| Support | policies, resolution guidance, product/process knowledge | customer/order/payment/delivery/job state |
| RCE/Claims | policies, remedy matrix, precedent summaries, evidence standards | case state, approved remedy, refund |
| Supplier OS | agreements, operating guides, catalogue guidance | supplier eligibility, stock, settlement |
| Academy | approved training, SOPs, policies | certification status, statutory credentials |
| Projects | specs, drawings, assessments, templates, handover docs | budget, milestone, variation, payment |
| Fleet | manuals, inspection criteria, maintenance knowledge | vehicle assignment, defects, work orders |
| Care | plan documentation, benefit guidance | membership and entitlement ledger |
| Assist | safety procedures, provider playbooks | incident, dispatch, entitlement, location |
| Corporate | policies, procurement procedures, HR guidance | payroll, employee state, financial authority |
| Command Centre | playbooks, definitions, root-cause knowledge | MetricContracts, alerts, money values |
| Health | specialist approved clinical/operational knowledge | Health master remains authority |

---

# 9. Four retrieval planes

## Plane A — governed internal knowledge

Technology: **Supabase/Postgres + pgvector + PostgreSQL FTS.**

Use for SOPs, manuals, internal policies, project documentation, validated historical knowledge, supplier/private documents, corporate knowledge and case-scoped approved evidence.

## Plane B — public/discovery search

Technology: **Meilisearch.**

Use for parts/product discovery, public catalogue, vehicle makes/models, service discovery and customer-safe public help content.

## Plane C — structured operational context

Technology: **DIAL domain read APIs.**

Use for current order/payment/delivery/job/vehicle/stock/entitlement/payroll/claim state.

This is not RAG. It is authoritative API context.

## Plane D — ephemeral case context

Use for high-sensitivity transaction-scoped context that should not become a broad reusable vector corpus, such as one support case, claim, customer order timeline, active technician job or project workspace.

---

# 10. Query classification and routing

Every capability request is classified into:

```text
STRUCTURED_FACT
KNOWLEDGE
DISCOVERY
HYBRID
UNSUPPORTED_OR_RESTRICTED
```

Examples:

- “Has ORD-10041 been paid?” → Payment/Order APIs.
- “What is the approved no-start procedure for a YD25?” → governed knowledge.
- “I need the cylinder above the clutch pedal.” → semantic discovery + canonical fitment.
- “Why was my technician job refunded?” → structured case truth + policy RAG.
- unauthorized/safety-critical unsupported requests → deny/abstain/escalate.

---

# 11. RetrievalProfile — central control primitive

Every capability uses a versioned `RetrievalProfile`.

```yaml
id: TECH_DIAGNOSTIC_V1
capability: technician_assist
allowed_source_classes: [K-A, K-B, K-C]
allowed_domains: [TECH, VEHICLE, SAFETY]
structured_context: [job, vehicle]
exact_identifier_routes: [diagnostic_code, part_number, vehicle_model_code]
lexical_search: true
semantic_search: true
semantic_ratio: benchmarked
candidate_k: 40
rerank_k: 20
final_context_k: 6
require_current_source: true
require_citations: true
answer_contract: fact_inference_recommendation
egress_policy: REDACTED_EXTERNAL_OR_LOCAL
max_context_tokens: configured
cache_scope: actor_and_case
actions_allowed: []
```

Profiles are promoted through evaluation like prompt/model changes.

---

# 12. Core data model

## `knowledge_sources`

```text
id
source_type
name
owner_domain
source_uri_ref
publisher
licence_class
provenance_status
trust_class
default_security_class
ingestion_mode
active
created_at
```

## `knowledge_documents`

```text
id
source_id
canonical_ref
title
domain
document_type
current_version_id
owner_org_id?
owner_bu_id?
security_class
retention_policy_id
created_at
```

## `knowledge_document_versions`

```text
id
document_id
version_label
content_hash
effective_from
effective_to
lifecycle_state
uploaded_by
approved_by
approved_at
supersedes_version_id?
raw_object_ref
parsed_object_ref
language
parser_profile
parse_quality
pii_classification
prompt_injection_scan_state
created_at
```

## `knowledge_chunks`

```text
id
document_version_id
parent_chunk_id?
chunk_index
page_start?
page_end?
section_path
heading
content
content_hash
token_count
language
security_class
trust_class
effective_from
effective_to
entity_metadata jsonb
lexical_vector tsvector
created_at
```

## `knowledge_chunk_acl`

```text
chunk_id
principal_type
principal_ref
permission
effective_from
effective_to
```

Principals can be public, authenticated, role, BU, organisation, team, customer/case, project member, supplier, technician or specific user.

## `knowledge_embeddings`

Initial production should use one active dimension per physical embedding index:

```text
chunk_id
embedding_profile_id
embedding vector(1024)
created_at
```

A dimension-changing model migration creates a new versioned embedding table/index.

## Other tables

```text
embedding_profiles
reranker_profiles
retrieval_profiles
retrieval_runs
retrieval_results
answer_citations
knowledge_feedback
knowledge_candidates
rag_eval_cases
rag_eval_runs
rag_security_findings
```

Raw personal operational histories are not globally embedded.

---

# 13. Postgres and pgvector design

Start with a **1024-dimensional multilingual embedding benchmark** to support English and future local-language use cases while keeping governed embeddings local where appropriate.

Benchmark candidates:

- `BAAI/bge-m3` — MIT, multilingual, long-input capable.
- `intfloat/multilingual-e5-large-instruct` — MIT, multilingual.

Initial reranker benchmark:

- `BAAI/bge-reranker-v2-m3` — Apache-2.0, multilingual.

Use HNSW with cosine similarity:

```sql
CREATE INDEX knowledge_embeddings_v1_hnsw
ON knowledge_embeddings_v1
USING hnsw (embedding vector_cosine_ops);
```

Vector queries always include lifecycle, domain, effective-date and authorization filters.

The user-facing retrieval path must not use a global service-role query that fetches broadly and filters permissions afterward.

---

# 14. Hybrid retrieval algorithm

DIAL should use exact + lexical + vector + reranking, not vector-only retrieval.

## Stage 0 — normalization

Normalize Unicode, whitespace, spelling, manufacturer aliases, trade vocabulary and abbreviations without destructively normalizing exact identifiers.

## Stage 1 — exact identifier extraction

Detect order/job/case refs, OEM/part numbers, VIN/chassis fragments, fault codes, employee numbers, policy IDs, SOP IDs and project refs.

## Stage 2 — query decomposition

Complex questions may be decomposed into structured facets using a constrained model.

## Stage 3 — lexical candidate generation

Use Postgres FTS/exact/trigram for governed documents and Meilisearch keyword retrieval for public catalogue.

## Stage 4 — vector candidate generation

Use pgvector HNSW.

## Stage 5 — fusion

Start with Reciprocal Rank Fusion and benchmark alternatives.

## Stage 6 — reranking

Rerank top 20–50 candidates where latency/quality justify it.

## Stage 7 — authority/freshness enforcement

Exclude revoked, unauthorized, expired (when disallowed), unapproved and inappropriate source classes.

## Stage 8 — diversity

Avoid six near-identical chunks from one section.

---

# 15. Chunking strategy

There is no universal “500-token chunk” rule.

### Manuals/SOPs
Use hierarchical section-aware chunks around 250–700 tokens, preserving warnings, tools, revision and figure references.

### Policies/contracts
Chunk by clause/heading with version, jurisdiction and effective date.

### Historical jobs
Create approved structured outcome summaries rather than globally embedding raw transcripts:
vehicle, symptoms, measurements, confirmed cause, repair, parts, verification, outcome window, comeback, quality state.

### Catalogue
Embed semantic discovery text only. Canonical product/fitment remains structured.

### Support/RCE
Use de-identified approved precedent summaries; do not retrieve unrelated customer narratives.

### Projects
Preserve work package, drawing/spec revision and project ACL.

### Tables
Preserve row/column structure; store both readable text and normalized structured representation where material.

---

# 16. Document parsing

Adopt **Docling** as the primary self-hosted parser/normalizer candidate.

Reasons:
- MIT;
- PDF, DOCX, PPTX, XLSX, HTML, Markdown and image support;
- layout/table understanding;
- unified representation;
- RAG chunk outputs;
- local processing.

OCR is invoked only when required. Original files remain immutable evidence in private object storage with hashes/provenance.

---

# 17. Ingestion workflows

### Manual upload

```text
authorized operator
→ upload
→ quarantine
→ parse
→ classify
→ preview
→ review
→ approve
→ index
```

### Managed source sync

```text
SourceSyncWorkflow
→ list changes
→ fetch
→ hash/diff
→ quarantine
→ parse
→ review policy
→ index
→ retire superseded versions
```

Use Temporal for long-running source sync/re-embedding/revocation workflows.

Validated operational outcomes emit `KnowledgeCandidateCreated`, never automatic publication.

---

# 18. Self-learning / Intelligence Factory loop

```text
Operational outcome
→ outcome quality window
→ validated evidence
→ KnowledgeCandidate
→ AI-assisted draft/normalization
→ human/domain review
→ eval
→ APPROVE
→ versioned knowledge
→ index
→ production retrieval
→ outcome measurement
```

No silent rewriting of procedures, fitment, eligibility, pricing, compliance or claims policy.

---

# 19. Context assembly

The model receives a structured context object, not a raw dump.

```json
{
  "query": "...",
  "structured_facts": [],
  "retrieved_evidence": [],
  "constraints": [],
  "conflicts": [],
  "citation_map": {},
  "answer_contract": "FACT_INFERENCE_RECOMMENDATION"
}
```

Every evidence item contains source ID, title, version, effective date, authority class, locator and content, and is explicitly marked as **data, not instructions**.

If authoritative sources conflict, DIAL surfaces the conflict rather than blending them into false certainty.

---

# 20. Generation contract

Internal response:

```json
{
  "answer": "...",
  "facts": [],
  "inferences": [],
  "recommendations": [],
  "uncertainties": [],
  "citations": [],
  "abstained": false,
  "abstention_reason": null,
  "suggested_next_actions": []
}
```

Consequential factual claims derived from knowledge require citations.

Facts, inferences and recommendations remain distinct.

Abstention is mandatory when evidence is insufficient, stale, conflicting or unauthorized.

---

# 21. Structured truth + RAG fusion

The highest-value DIAL architecture is **structured truth + RAG**, not pure RAG.

### Technician

```text
Vehicle Hub + Job + Safety APIs
        +
manuals/SOPs/validated cases
        ↓
facts + likely causes + next tests
```

### Support

```text
payment/job/delivery/RCE APIs
        +
applicable policy
        ↓
case explanation + permitted action
```

---

# 22. Technician Diagnostic RAG

**Priority: first production use case.**

Inputs:
- active job;
- vehicle;
- symptoms;
- technician measurements;
- structured media observations;
- job class/trade.

Sources:
- approved service manuals;
- DIAL diagnostic checklists;
- SOPs;
- safety procedures;
- validated historical outcome summaries;
- approved bulletins.

RAG may not set price, waive safety, mark completion, assert fitment or override eligibility.

Output:
- facts;
- likely causes with evidence;
- recommended next tests;
- safety prerequisites;
- source citations;
- uncertainty.

### Offline job knowledge pack

Before entering low-connectivity areas, download an encrypted pack with SOP, HIRA/PPE, checklist, vehicle facts, selected technical excerpts and diagrams. Android performs local Room/SQLite FTS.

Cloud RAG enhances but does not replace safety-critical offline material.

---

# 23. Dial a Spare Semantic Discovery

Customer natural-language discovery flows:

```text
saved/extracted vehicle
→ exact entity/identifier extraction
→ Meilisearch hybrid search
→ canonical product IDs
→ FitmentService
→ supplier offers
→ deterministic pricing
```

Semantic similarity never equals fitment.

Exact SKU/OEM queries strongly favor lexical search; natural-language component descriptions may use a higher semantic contribution. Ratios are benchmarked, not guessed.

---

# 24. Support RAG

Structured APIs provide customer/order/job/payment/delivery/communication/case truth.

RAG provides policy, process, remedy matrix and knowledge articles.

No global embedding of customer timelines.

Output:
- case summary;
- verified facts;
- applicable policy;
- open questions;
- permitted support actions;
- escalation conditions.

---

# 25. RCE / Claims Assist

Sources:
- current resolution policies;
- warranty rules;
- guarantee product rules;
- evidence standards;
- de-identified precedent summaries;
- relevant evidence.

Output:
- evidence completeness;
- applicable policy;
- comparable precedents;
- unresolved conflicts;
- candidate remedies allowed by policy.

The LLM does not approve or deny the claim.

---

# 26. Academy, Supplier, Project and Command Centre profiles

### Academy
Approved training, SOPs, safety, privacy and job-specific learning. No replacement of statutory credentials.

### Supplier
Supplier agreement questions, onboarding, catalogue guidance, dispatch/return procedures. Supplier-private ACL prevents competitor leakage.

### Projects
Project-scoped specs, drawings, assessments, site diaries and approved variations. Budget/milestone/payment remain structured.

### Command Centre
Structured MetricContracts and operational events + playbooks/CAPA/incident notes produce fact-based explanations and recommended investigation. AI cannot change pricing, payouts or branch activation.

---

# 27. Fleet, Vehicle Hub, Care and Assist

Fleet/Vehicle Hub use maintenance manuals, procedures and validated failure knowledge, while mileage, assignments, defects and history remain APIs.

Care uses RAG for plan explanation while the Entitlement Ledger decides actual benefits.

Assist uses safety/provider playbooks while incident, dispatch, entitlement and emergency escalation remain deterministic.

---

# 28. Corporate Knowledge

Use RAG for HR policies, procurement, finance procedures, IT support, compliance and SOPs.

Payroll and employee-specific data remain structured API retrieval with strong authorization.

---

# 29. Dial Health / ZHOTN boundary

Health may reuse ingestion, provenance, ACL, vector infrastructure and evaluation machinery, but clinical corpus, PHI access, patient scope, medical authority, clinical safety and regulated decision logic remain governed by the Health master.

Normal DIAL RAG certification does not certify a clinical RAG capability.

---

# 30. Privacy architecture

Retrieval authorization happens before retrieval.

Model egress is controlled by:

```text
LOCAL_ONLY
REDACTED_EXTERNAL
APPROVED_EXTERNAL
NO_GENERATION
```

Use Microsoft Presidio as a candidate local PII detection/anonymization component for text.

Pseudonymize identities where the model only needs consistent references.

Treat embeddings as sensitive derived data.

---

# 31. RAG security threat model

DKRF must explicitly defend against:

- document poisoning;
- indirect prompt injection;
- cross-tenant retrieval;
- stale permissions;
- cache leakage;
- vector manipulation/retrieval hijack;
- query probing;
- tool/action injection;
- deletion failures;
- output/citation tampering.

Controls:
- trusted source registry;
- quarantine;
- hashes/provenance;
- approval;
- per-chunk ACL/RLS;
- query-time authorization;
- scoped caching;
- data-only delimiters;
- injection scanning;
- no model-held privileged credentials;
- independent tool authorization;
- audit;
- red-team testing.

---

# 32. Query/context security pipeline

```text
USER QUERY
→ AuthN
→ capability permission
→ rate/abuse checks
→ scope derivation
→ RetrievalProfile
→ RLS/ACL retrieval
→ injection scan
→ sensitivity classification
→ egress policy
→ PII redaction/pseudonymisation
→ model
→ schema/output policy
→ citation/leakage checks
→ response
```

---

# 33. Framework strategy

Do not make LangChain, LlamaIndex or Haystack the central authority.

Implement RetrievalProfile, ACL, provenance and answer contracts natively.

- **LlamaIndex:** REFERENCE / selective component use.
- **Haystack:** REFERENCE / optional isolated component; Apache-2.0.
- **Vectara:** not default because DIAL already has controlled data/search infrastructure and strong privacy requirements.

---

# 34. AI Gateway integration

LiteLLM remains the provider abstraction for generation, external embeddings where permitted, model routing, retries/fallbacks and spend controls.

Local embedding/reranker services conform to DIAL adapters.

---

# 35. Package/service topology

```text
packages/
  knowledge-core/
  retrieval/
  knowledge-policy/
  ai/

services/
  knowledge-ingest-worker/
  knowledge-embedding-worker/
  knowledge-rerank-worker/
  knowledge-sync-worker/
  knowledge-eval-worker/
```

Admin surfaces:
```text
knowledge/
retrieval/
evaluation/
security/
```

---

# 36. Queues and workflows

BullMQ:
```text
rag.ingest
rag.parse
rag.embed
rag.reindex
rag.eval
rag.security-scan
```

Temporal:
- source synchronization;
- mass re-embedding;
- model migration;
- corpus activation;
- revoke/delete propagation;
- knowledge promotion;
- rollback.

---

# 37. API design

Client-facing capability APIs:

```text
POST /api/v1/ai/technician-assist
POST /api/v1/ai/support-assist
POST /api/v1/ai/catalogue-assist
POST /api/v1/ai/academy-ask
POST /api/v1/ai/project-assist
POST /api/v1/ai/supplier-assist
POST /api/v1/ai/command-centre-explain
```

Internal retrieval:
```text
POST /internal/v1/retrieval/query
POST /internal/v1/retrieval/explain
```

Knowledge admin:
```text
GET/POST /api/v1/admin/knowledge/sources
POST     /api/v1/admin/knowledge/documents
GET      /api/v1/admin/knowledge/documents/{ref}
POST     /api/v1/admin/knowledge/documents/{ref}/commands/approve
POST     /api/v1/admin/knowledge/documents/{ref}/commands/reject
POST     /api/v1/admin/knowledge/documents/{ref}/commands/revoke
POST     /api/v1/admin/knowledge/documents/{ref}/commands/supersede
POST     /api/v1/admin/knowledge/documents/{ref}/commands/reindex
GET/POST /api/v1/admin/knowledge/retrieval-profiles
POST     /api/v1/admin/knowledge/retrieval-profiles/{ref}/commands/promote
GET      /api/v1/admin/knowledge/eval-runs
GET      /api/v1/admin/knowledge/security-findings
```

---

# 38. Domain events

```text
KnowledgeSourceRegistered
KnowledgeDocumentUploaded
KnowledgeDocumentParsed
KnowledgeDocumentReviewRequired
KnowledgeDocumentApproved
KnowledgeDocumentRejected
KnowledgeDocumentActivated
KnowledgeDocumentSuperseded
KnowledgeDocumentRevoked
KnowledgeDocumentExpired
KnowledgeIndexRequested
KnowledgeIndexCompleted
KnowledgeIndexFailed
EmbeddingProfilePromoted
RerankerProfilePromoted
RetrievalProfilePromoted
KnowledgeCandidateCreated
KnowledgeCandidateApproved
KnowledgeCandidateRejected
RetrievalQualityDegraded
RagSecurityFindingOpened
RagPoisoningSuspected
KnowledgeAclChanged
KnowledgeDeletionCompleted
```

---

# 39. Knowledge admin console

### Sources
Source owner, trust class, licence/provenance, sync health, last ingestion, active document count, security class.

### Review Queue
Original, parsed version, chunk preview, extracted metadata, ACL, PII flags, injection flags, version/effective date.

### Retrieval Debugger
For authorized engineering/AI ops only:
query, profile, actor scope, exact matches, lexical candidates, vector candidates, fusion, reranking, exclusions, final context and citations.

### Quality dashboard
Recall@k, MRR, nDCG, context relevance/recall/faithfulness, citation correctness, abstention, unauthorized retrieval, stale retrieval, p50/p95 latency and cost/query.

---

# 40. Evaluation architecture

Promptfoo remains the canonical AI evaluation gate.

Evaluate retrieval and generation separately.

### Retrieval
- Recall@1/3/5/10;
- MRR;
- nDCG;
- exact-source hit;
- authority correctness;
- stale source rate;
- forbidden source retrieval;
- cross-tenant leakage;
- latency.

### Generation
- correctness;
- context faithfulness;
- answer relevance;
- citation correctness/completeness;
- unsupported claims;
- fact/inference separation;
- abstention quality;
- prohibited-action rate.

### Business outcome metrics

Tech:
- first-time-fix;
- diagnostic steps;
- comeback;
- unsafe suggestion rate.

Spare:
- search success;
- conversion;
- fitment return;
- no-result.

Support:
- handling time;
- first-contact resolution;
- policy error;
- escalation.

RCE:
- evidence completeness;
- decision turnaround;
- appeal/reversal;
- inconsistency.

---

# 41. Initial evaluation corpus

Suggested bootstrap target:

```text
Technician diagnostic       500
Spare semantic discovery    500
Support / policy            300
RCE / claim                 250
Academy                     250
Supplier                    150
Projects                    150
Corporate                   150
Security/adversarial        500+
```

High-risk corpora require stronger adversarial coverage than FAQ retrieval.

---

# 42. RAG red-team programme

CI/staging must test:

- direct prompt injection;
- retrieved prompt injection;
- document poisoning;
- hidden Unicode/invisible instructions;
- cross-tenant access;
- stale permission;
- deletion propagation;
- cache leakage;
- unauthorized tool invocation;
- source attribution tampering.

Promptfoo's RAG poisoning/red-team features are directly applicable.

---

# 43. Citation architecture

The model does not generate arbitrary source URLs.

Context contains internal evidence IDs:
```text
[KCTX:12]
[KCTX:17]
```

The server maps them after generation to trusted citations such as:
```text
DIAL SOP TECH-ELEC-021 · Rev 6 · §4.2
Nissan Service Manual · YD25 · Page 183
Validated DIAL case pattern · KO-00128
```

Sensitive source names remain permission-filtered.

---

# 44. Caching

Public catalogue/public knowledge may use broad caches.

Sensitive cache keys include:
```text
capability
retrieval profile
authorization scope
organisation/BU
case/project/customer scope
query fingerprint
knowledge version watermark
```

Invalidate on revoke, ACL change, supersession, profile promotion or scope changes.

---

# 45. Cost architecture

Controls:
- embed at ingestion;
- cache safe query embeddings;
- prefer local embeddings;
- exact/FTS before model;
- rerank only small candidate set;
- small model for rewrite;
- generation only when needed;
- direct structured answer where possible;
- context token caps;
- per-capability budgets;
- async heavy workflows.

Track embedding, reranking, generation, tokens, latency, cache savings and cost per verified answer.

---

# 46. Observability

Trace:
```text
request
→ capability
→ intent
→ domain API calls
→ lexical
→ vector
→ fusion
→ rerank
→ context filter
→ egress/redaction
→ model
→ output validation
→ citations
→ user outcome
```

Use OpenTelemetry-compatible tracing and avoid logging full sensitive prompts by default.

---

# 47. Model and index migration

Embedding model changes are data migrations:

```text
candidate profile
→ offline benchmark
→ privacy/security review
→ shadow dual-index
→ compare retrieval
→ promote
→ full rebuild
→ rollback-capable old index
→ retire
```

Do not overwrite vectors in place without rollback.

---

# 48. Meilisearch semantic strategy

Use Meilisearch semantic/hybrid retrieval primarily for public discovery.

Query-class examples:

- exact part/OEM identifier → lexical dominant;
- product name → lexical dominant with semantic assist;
- natural language component description → higher semantic contribution.

Benchmark semantic ratio per query class.

Meilisearch tenant tokens can support selected multi-tenant search, but highly sensitive internal knowledge stays in Postgres/RLS.

---

# 49. Postgres hybrid strategy

For governed knowledge:

```text
Postgres FTS
+
pgvector dense
↓
RRF
↓
reranker
```

This keeps permissions and retrieval inside the same trusted database boundary.

---

# 50. Multilingual strategy

Build evaluation sets for:
- English;
- Shona;
- Ndebele;
- mixed-language queries;
- local trade terminology;
- spelling variants.

Use multilingual embedding/reranker benchmarks from the start.

---

# 51. Knowledge graph enrichment

Do not start with a separate graph database.

Use Postgres relationships first:
vehicle, part, symptom, failure mode, procedure, job class, trade, supplier, policy and claim type.

Only add graph retrieval if benchmarks prove measurable improvement.

---

# 52. Multi-modal retrieval

Future retrieval can include:
- diagrams;
- exploded views;
- part photos;
- wiring diagrams;
- drawings;
- evidence images.

Start by linking images as evidence with captions/metadata.

Image similarity never asserts fitment or damage liability.

---

# 53. Offline/low-connectivity behavior

Technician Android gets precomputed encrypted job knowledge packs and local FTS.

Delivery does not need broad RAG; it remains structured logistics-first.

Cloud RAG degrades gracefully to structured facts and cached approved knowledge.

---

# 54. Failure behavior

| Failure | Required behavior |
|---|---|
| pgvector unavailable | structured APIs continue; RAG degrades |
| Meili unavailable | canonical catalogue APIs continue; exact/category fallback |
| embedder unavailable | queue indexing; existing vectors usable |
| reranker unavailable | fused retrieval fallback if allowed |
| generator unavailable | return structured facts/search results |
| parser fails | quarantine, no index |
| ACL path fails | sensitive retrieval fails closed |
| external model fails | LiteLLM fallback/local/no-generation |
| stale index | warn/abstain per profile |
| source conflict | disclose/escalate |
| poisoning suspected | quarantine source + invalidate cache |
| migration fails | retain old active index |

---

# 55. Source revocation

```text
RevokeKnowledgeDocument
→ lifecycle REVOKED
→ immediate retrieval block
→ cache invalidation
→ Meili removal if projected
→ vectors inaccessible
→ identify impacted retrieval runs
→ security/quality assessment
→ replacement version
```

---

# 56. Retention

Separate retention policies for source evidence, chunks, embeddings, traces, generated answers and feedback.

Do not retain raw sensitive RAG traces indefinitely.

---

# 57. Knowledge ownership

Every source records:
- business owner;
- domain owner;
- technical owner;
- review authority;
- review cadence.

AI team does not own business policy.

---

# 58. Command Centre metrics

Add a **Knowledge & Retrieval** control room.

Executive:
- queries/day;
- assisted transactions;
- support time saved;
- diagnostic adoption;
- search uplift;
- cost/verified answer.

Retrieval:
- Recall@k;
- MRR;
- nDCG;
- no-result;
- stale source.

Safety:
- unauthorized retrieval;
- poisoning findings;
- injection catches;
- PII egress blocks;
- citation failures.

Knowledge health:
- active/expired docs;
- review overdue;
- indexing backlog;
- sync failures;
- candidates awaiting promotion.

---

# 59. FRC work packages

Allocate canonical Feature IDs through the DIAL registry. Planning packages:

```text
RAG-EXP-01 Knowledge Source Registry
RAG-EXP-02 Document Ingestion & Quarantine
RAG-EXP-03 Parsing & Structural Normalisation
RAG-EXP-04 Knowledge Lifecycle & Approval
RAG-EXP-05 Chunking & Metadata
RAG-EXP-06 ACL / Permission-Aware Retrieval
RAG-EXP-07 Embedding & Vector Indexing
RAG-EXP-08 Lexical / Exact Retrieval
RAG-EXP-09 Hybrid Fusion & Reranking
RAG-EXP-10 Context Planner
RAG-EXP-11 Context Egress / Privacy
RAG-EXP-12 Answer Contract & Citations
RAG-EXP-13 Retrieval Evaluation
RAG-EXP-14 RAG Security / Red Team
RAG-EXP-15 Knowledge Candidate / Promotion
RAG-EXP-16 Knowledge Operations Console
RAG-EXP-17 Technician Diagnostic RAG
RAG-EXP-18 Support / RCE RAG
RAG-EXP-19 Spare Semantic Discovery
RAG-EXP-20 Academy / Corporate Knowledge
RAG-EXP-21 Project / Supplier Knowledge
RAG-EXP-22 Command Centre Explainability
```

Each gets a complete DIAL Feature Realization Contract.

---

# 60. Permission examples

### Technician
May retrieve assigned-job context and approved trade knowledge; may not retrieve unrelated customer/HR/claim data.

### Supplier
May retrieve own private material and public DIAL guidance; never competitor terms/performance.

### Support
May retrieve case-scoped context and applicable policy; no payroll or unrelated customer/trust data.

---

# 61. Eventuality matrix

Every RAG FRC must cover:

```text
malformed document
parser timeout
hash mismatch
unsupported format
malware
prompt injection
PII classification error
ACL inheritance missing
revoked-after-embedding
supersession
expiry
duplicate document/chunk
embedding retries
embedding model unavailable
dimension mismatch
HNSW unavailable
FTS zero results
vector zero results
lexical/vector conflict
reranker unavailable
authoritative source conflict
stale source
permission changes mid-run
cross-tenant attempt
cache-scope bug
generator timeout
fabricated citation
excluded-source citation
PII leakage
provider outage/rate limit
context overflow
query probing
poisoned retrieval
deletion failure
profile rollback
embedding migration rollback
offline operation
```

Each row must define detection, state, user behavior, owner queue, recovery, security impact, notification and test fixture.

---

# 62. Acceptance gates

### Thin Slice
```text
approved SOP upload
→ Docling parse
→ review
→ chunk
→ embed
→ RLS-protected retrieval
→ answer
→ correct citations
```

### Integration Green
Also prove structured API + RAG fusion, Meili discovery boundary, LiteLLM, Promptfoo, ACL negative tests, supersession, cache invalidation and provenance.

### Staging Green
Real deployed services, HNSW benchmark, representative corpus, p95 latency, permission attacks, poisoning/injection tests, deletion propagation, restore/recovery and cost controls.

### Production Green
Approved live sources, approved provider data terms, privacy/legal gates, real review process, observability, runbook and domain quality thresholds.

---

# 63. Initial hard safety targets

```text
Unauthorized retrieval          = 0
Revoked document retrieval      = 0
Fabricated citation             = 0
AI-authored fitment authority   = 0
AI-authored binding price       = 0
Safety-control waiver           = 0
Cross-tenant cache leak         = 0
```

Other quality thresholds are domain-specific.

---

# 64. Rollout sequence

## R0 — foundation
Source registry, lifecycle, Docling, chunking, pgvector, RLS, RetrievalProfile, citations, Promptfoo baseline, security tests.

## R1 — Technician + Academy
Highest knowledge value and strong internal feedback.

## R2 — Support + RCE
Fast measurable ROI.

## R3 — Spare semantic discovery
Meilisearch hybrid + canonical fitment.

## R4 — Supplier + Projects + Corporate
Private knowledge with strong ACL.

## R5 — Command Centre explanation
Structured metrics + approved knowledge.

## R6 — controlled learning factory
Scale validated outcome-to-knowledge promotion.

---

# 65. Initial infrastructure deployment

```text
Supabase/Postgres
  pgvector
  FTS
  RLS
  knowledge metadata

Object storage
  original + parsed derivatives

Meilisearch
  public/discovery hybrid search

Docling
  self-hosted parser

Embedding service
  local multilingual profile

Reranker service
  local multilingual reranker

BullMQ
  ingestion/index/eval

Temporal
  durable sync/migration/promotion

LiteLLM
  model gateway

Promptfoo
  retrieval/generation/security eval

OpenTelemetry
  traces/metrics
```

No new managed vector database is required initially.

---

# 66. Why this stack fits DIAL

Supabase currently documents pgvector, HNSW, hybrid FTS + vector search, permission-aware RAG with RLS and queued embedding patterns.

Meilisearch currently supports keyword, semantic and hybrid search, configurable semantic ratio, multiple embedders and tenant token/search-rule security.

Docling is MIT and supports rich parsing of PDF/Office/HTML/images and RAG chunk outputs.

LiteLLM provides model abstraction, retry/fallback and budget/spend control.

Promptfoo supports separate retrieval/generation RAG evaluation and poisoning/red-team workflows.

---

# 67. Why not embed the whole ERP

Embedding all operational rows would duplicate authoritative state, create stale information, increase privacy exposure, complicate deletion, create cross-tenant risk and encourage model answers where direct APIs are safer.

Operational truth remains structured.

Only reusable approved knowledge or ephemeral case context enters RAG.

---

# 68. Definition of success

DKRF succeeds when:

```text
technician asks question
→ DIAL knows job/vehicle
→ authorized current knowledge only
→ exact + semantic evidence
→ reranked context
→ cited answer
→ facts/inferences/recommendations separated
→ no money/safety authority changed
→ outcome measured
→ validated outcome may become reviewed knowledge candidate
→ future retrieval improves
```

and:

```text
customer asks support
→ real transaction state
→ correct policy retrieval
→ accurate explanation
→ authorized action only
→ lower support time
→ better resolution quality
```

The moat is not “DIAL has RAG”. It is a permission-aware, outcome-learning knowledge fabric integrated into DIAL's actual transactions, catalogue, technicians, suppliers, vehicles, support, quality and evidence while preserving deterministic business authority.

---

# 69. Canon amendments required after approval

1. Add **DIAL Knowledge & Retrieval Fabric** to Shared Platform Systems.
2. Allocate canonical Feature IDs for the RAG work packages.
3. Add `knowledge-core`, `retrieval` and `knowledge-policy` packages to the monorepo.
4. Add Docling to donor/tool registry after final deployment review.
5. Add BGE-M3, multilingual-e5 and BGE reranker as benchmark candidates, not model locks.
6. Add RAG-specific security tests to DIAL security toolchain.
7. Extend Promptfoo CI with retrieval and poisoning tests.
8. Add Knowledge/Retrieval metrics to Command Centre.
9. Add `ContextEgressPolicy` to AI capability contracts.
10. Add per-chunk ACL/RLS requirements.
11. Add `KnowledgeCandidate` promotion to Intelligence Factory.
12. Add technician offline knowledge packs.
13. Add Spare semantic-discovery profile.
14. Add Support/RCE context fusion.
15. Explicitly prohibit global vectorisation of raw customer/employee/claim histories.

---

# 70. Research anchors checked for this design

Current official/project sources checked on 30 August 2026:

- Supabase — RAG with permissions: https://supabase.com/docs/guides/ai/rag-with-permissions
- Supabase — Hybrid search: https://supabase.com/docs/guides/ai/hybrid-search
- Supabase — HNSW: https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes
- Supabase — Automatic embeddings: https://supabase.com/docs/guides/ai/automatic-embeddings
- pgvector: https://github.com/pgvector/pgvector
- Meilisearch hybrid search: https://www.meilisearch.com/docs/reference/api/search/search-with-post
- Meilisearch security/tenant tokens: https://www.meilisearch.com/docs/capabilities/security/overview
- Meilisearch local HF embeddings: https://www.meilisearch.com/docs/capabilities/hybrid_search/how_to/configure_huggingface_embedder
- Docling: https://github.com/docling-project/docling
- LiteLLM: https://docs.litellm.ai/
- Promptfoo RAG evaluation: https://www.promptfoo.dev/docs/guides/evaluate-rag/
- Promptfoo RAG poisoning: https://www.promptfoo.dev/docs/red-team/plugins/rag-poisoning/
- OWASP RAG Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html
- OWASP LLM01 Prompt Injection: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- OWASP LLM08 Vector & Embedding Weaknesses: https://genai.owasp.org/llmrisk/llm082025-vector-and-embedding-weaknesses/
- Microsoft Presidio: https://microsoft.github.io/presidio/
- BGE-M3: https://huggingface.co/BAAI/bge-m3
- BGE reranker v2 M3: https://huggingface.co/BAAI/bge-reranker-v2-m3
- multilingual-e5-large-instruct: https://huggingface.co/intfloat/multilingual-e5-large-instruct
- LlamaIndex: https://github.com/run-llama/llama_index
- Haystack: https://github.com/deepset-ai/haystack

All code/model licences and revisions must be pinned and re-verified at implementation time.

---

# 71. Final architecture lock recommendation

```text
DIAL Knowledge & Retrieval Fabric

Governed knowledge:
Supabase/Postgres
+ pgvector HNSW
+ Postgres FTS
+ per-chunk RLS/ACL

Public discovery:
Meilisearch hybrid search

Parsing:
self-hosted Docling

Embeddings:
local multilingual profile
benchmark BGE-M3 vs multilingual-e5

Reranking:
local multilingual reranker
benchmark BGE-reranker-v2-m3

Generation/model routing:
existing LiteLLM-based DIAL AI Gateway

Privacy:
ContextEgressPolicy
+ local PII minimisation / Presidio candidate

Evaluation:
Promptfoo
+ deterministic retrieval metrics
+ domain outcome metrics

Security:
DIAL AppSec
+ OWASP RAG threat model
+ Promptfoo poisoning/red-team suites

Learning:
DIAL Intelligence Factory
→ KnowledgeCandidate
→ human/domain review
→ evaluated promotion
→ versioned publication

Authority:
DIAL domain systems remain SoR
```

This gives DIAL high-value RAG without weakening the deterministic architecture already designed around money, fitment, jobs, delivery, identity, safety and compliance.
