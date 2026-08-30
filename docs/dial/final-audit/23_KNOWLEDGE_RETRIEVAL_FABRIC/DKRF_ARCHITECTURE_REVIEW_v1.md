# DKRF Architecture Review — v1

**Reviews:** `DKRF_ARCHITECTURE_v1.md` (DIAL Knowledge & Retrieval Fabric, 30 Aug 2026)
**Verdict:** Architecture is sound and should proceed. Four findings block build, eight are design gaps to close before R1, six are corrections. The rollout order must change.

---

## 0. What is right, and worth protecting

Most RAG designs fail by letting retrieval become an authority. This one does not, and the discipline is worth naming so it survives editing.

- **Structured truth + RAG, not pure RAG** (§21) with an explicit list of what RAG may never author — price, payment state, ledger, stock, fitment, eligibility, dispatch, payroll, entitlement, claim approval, branch activation. This is the correct architecture for an ERP and most teams get it wrong.
- **Query classification routes `STRUCTURED_FACT` to APIs** (§10), so "has ORD-10041 been paid?" never reaches a language model. This single decision removes the most common production RAG failure in commerce systems.
- **Trust classes K-A..K-D with a stated dominance rule** (§6), and a knowledge lifecycle that is a real state machine with `REVOKED`/`SUPERSEDED` and revocation propagation (§7, §55).
- **Server-side citation mapping** (§43) — the model emits `[KCTX:12]`, never a URL. Correct, and rare.
- **Refusing a managed vector SaaS as system of record** (§0, §33), and refusing to embed the ERP (§67).
- **The failure matrix** (§54). Almost no RAG design has one.

The findings below are about making these properties actually hold under load, permissions and audit — not about redirecting the design.

---

## 1. Blocking findings

### B1 — The plan inherits two decisions that DIAL canon does not contain

§1 states the existing masters "already require PostgreSQL + pgvector as the initial semantic layer", and §18/§69.11 build on a "DIAL Intelligence Factory" as an established loop.

Checked against the governed pack (`docs/dial/final-audit/`):

| Claimed inheritance | Files in canon |
|---|---|
| `LiteLLM` | 10 |
| `Promptfoo` | 5 |
| "AI Gateway" | 3 |
| **`pgvector`** | **0** |
| **"Intelligence Factory"** | **0** |
| `RetrievalProfile`, `Docling`, `Presidio` | 0 (expected — new) |

Three of the five are genuinely inherited. Two are new decisions presented as settled ones. This is the exact failure mode this repository has already paid for once: three gate ladders lived simultaneously, each asserting continuity with the others, and it took a dedicated check to settle
(`20_IMPLEMENTATION_CLOSURE/13_GATE_LADDER/GATE_LADDER_CANON.md`).

**Required:** adopt pgvector as an explicit new architectural decision with its own record, and either locate the Intelligence Factory canon or define it before §18 depends on it. Do not carry either as inherited.

**Also reconcile:** the mode-locked donor is `SERVICE-LITELLM-SUPPORT` — "LiteLLM + Promptfoo + **Langfuse**" (`03_DONOR_CLOSURE/DONOR_QUALIFICATION_STATUS.json`). The plan specifies OpenTelemetry for tracing (§46) and never mentions Langfuse. Either is defensible; silently diverging from a locked donor is not.

### B2 — The flagship use case is gated on an open activation blocker the plan never cites

R1 is Technician Diagnostic RAG (§22, §64). Its named sources are "approved service manuals" and, under K-A, "OEM/manufacturer service information **that DIAL is licensed to use**" (§6).

`20_IMPLEMENTATION_CLOSURE/06_ACTIVATION/ACTIVATION_BLOCKER_REGISTRY.json` carries:

- **ACT-REG-011 — EPC/catalogue/image rights and provenance** (open)
- **ACT-REG-005 — data controller/DPO/processor/cross-border compliance readiness** (open)

ACT-REG-011 is precisely the rights question that decides whether OEM service content may be ingested at all. ACT-REG-005 governs whether personal data may cross a border to a model provider, which is what §30's egress policy operationalises. Neither appears anywhere in the plan.

**Required:**
1. R1 is scoped to knowledge **DIAL owns outright** — DIAL SOPs, safety procedures, HIRA/PPE, internal policies, approved diagnostic checklists. That corpus is real, is the higher-frequency technician need, and is unblocked.
2. OEM/manufacturer content sits behind ACT-REG-011 and enters as a separate source class activation, not as part of R1.
3. Every DKRF FRC that touches external content or model egress carries the blocker reference, so the closure check can see it. A capability with open blockers may not be reported at or above `DOMAIN_TESTED` (`v2-closure-check`); that rule should bind DKRF too.

This is not a delay. It is the difference between R1 shipping and R1 waiting on a legal negotiation nobody scheduled.

### B3 — The Feature IDs are invalid, and the allocation has a cost the plan does not own

`RAG-EXP-01`..`RAG-EXP-22` (§59) fail `FEATURE_REGISTRY.schema.json`, which requires `^[A-Z]+-F[0-9]{3}$`. Correct form: `DKRF-F001`..`DKRF-F022`.

Allocation is not one registry edit. `v2-closure-check` enforces set equality across the feature, FRC and realization registries and exactly nine facets per feature, so 22 features means 22 FRC rows, 22 realization rows and **198 subfeature facets**.

It also moves CT-7 from 23 acceptance contracts / 206 features to **23 / 228**. The metric is measuring the right thing — contracts specific enough to test — and 22 more generic contracts makes it read worse because it *is* worse. Allocate anyway (hiding planned capability from the registry to protect a ratio is gaming it), but state the effect and commit to per-feature contracts as each package enters implementation, starting with DKRF-F001.

### B4 — The chunk ACL model contradicts the ingestion design and will not scale

§5 specifies "Chunk ACL inheritance". §12 then models `knowledge_chunk_acl(chunk_id, principal_type, principal_ref, permission, …)` — materialised grants per chunk.

A 500-page manual is thousands of chunks. Multiply by every role, BU, team, supplier, technician and project principal and the grant table dominates the database. Worse, an ACL change becomes O(chunks) writes, and §31's "stale permissions" threat becomes a race with a long-running update rather than a predicate evaluated at query time.

**Required:** authorization is a **predicate**, not a materialised grant.
- Security label and owner scope live on `knowledge_document_versions`; chunks inherit by foreign key and carry only overrides.
- RLS evaluates the requesting principal's scope against those labels at query time — one policy, no fan-out, ACL changes take effect immediately because nothing was denormalised.
- Keep `knowledge_chunk_acl` only for genuine per-chunk exceptions (a redacted clause inside an otherwise shared document), which are rare and worth the row.

---

## 2. High-severity gaps to close before R1

### H1 — Filtered vector search: the hardest problem here, and it is unaddressed

§13 correctly forbids "retrieve broadly, filter afterwards". It does not say how the permitted path performs.

HNSW walks a proximity graph. Apply a highly selective predicate — one supplier's private documents, one project's ACL — and the walk returns mostly rows the filter discards, so you either lose recall badly or the planner abandons the index for a sequential scan. This is the central engineering tension of permission-aware pgvector: **the security property and the quality property fight, and quality loses silently** because nothing in the plan measures recall *under* a filter.

**Required:**
- `hnsw.iterative_scan` (pgvector ≥ 0.8) in `relaxed_order` for ranked retrieval, with `hnsw.max_scan_tuples` tuned per profile and recorded in the RetrievalProfile.
- Partition or partially index by the coarsest stable partition key — security class, and BU/organisation where tenancy is real — so the common query hits a small dense index instead of filtering a global one.
- Add **Recall@k under ACL** to §40's retrieval metrics. The current Recall@k is measured without the predicate that production always applies, so it will read healthy while production degrades.

### H2 — Authority is enforced as a filter, so §6's dominance rule does not actually hold

§6: "A semantically similar K-D chunk must never outrank an applicable K-A policy merely because the embedding score is higher."

§14 applies authority at **Stage 7 — after fusion and reranking** — as an exclusion. Excluding K-D does not make K-A outrank K-C. Nothing in the ranking function knows about trust class.

**Required:** trust class is a ranking term, not a post-filter. Order lexicographically by (trust tier, fused score), or apply a benchmarked per-tier prior. Then make "authority correctness" in §40 a real assertion: for a query with an applicable K-A policy, the K-A chunk ranks above any K-C/K-D chunk regardless of similarity.

### H3 — Nothing enforces that a citation resolves to retrieved evidence

§63 sets "fabricated citation = 0". §43 maps `[KCTX:n]` server-side. But no component is specified that **rejects** an answer whose citation ID is not in this run's `retrieval_results`.

**Required:** the output verifier fails closed when any citation ID is absent from the run's retrieved set, or when a `facts[]` entry carries no citation. This is a dozen lines against `retrieval_runs`/`retrieval_results`, and it converts the highest-stakes target in §63 from an aspiration into an invariant. It is the cheapest control in the whole design; specify it explicitly.

### H4 — No storage or index sizing

`vector(1024)` is 4 KB per row before the HNSW graph. One million chunks is ~4 GB of vectors plus index, and HNSW build on a table that size is long and disruptive.

**Required in the design:** `halfvec(1024)` (pgvector ≥ 0.7) halves storage at negligible recall cost and should be the default unless benchmarks say otherwise; binary quantization with full-precision rescoring for the candidate stage where corpus size justifies it; `CREATE INDEX CONCURRENTLY`; and partitioning by `embedding_profile_id` so a model migration builds a new partition rather than rewriting a live one. §47 already treats migration correctly — the physical layout should make it cheap.

### H5 — No latency budget, for a product used in the field

`bge-reranker-v2-m3` over 20–50 candidates on CPU is a multi-second operation. §22's user is a technician standing at a vehicle, often on a poor connection.

**Required:** p95 budget per capability; reranking declared optional under budget pressure with the degradation stated (§54 already allows "fused retrieval fallback if allowed" — make it a budget rule, not only a failure rule); and an explicit decision on GPU vs ONNX/int8 CPU, because that choice determines whether the reranker is affordable at all.

### H6 — Shona and Ndebele are not served by the named models

§50 is the right instinct, and §13's model candidates will not deliver it. BGE-M3 and multilingual-e5 have thin coverage of low-resource southern African languages; neither should be expected to retrieve Shona or Ndebele competently.

**Required:** state the expected outcome rather than implying it is solved. Practical path — English-primary retrieval with query normalisation and translation at the edge, trade-vocabulary and spelling-variant lexicons (which help lexical retrieval far more than embeddings do here), and a measured gap published before any multilingual claim is made to users. §50's eval sets should exist to *prove* the gap, not to confirm a hope.

### H7 — K-B validated outcomes carry personal data into the vector store

K-B is "completed jobs with validated outcome" (§6). §24 forbids globally embedding customer timelines and §15 asks for structured outcome summaries — but nothing *requires* de-identification on the K-B promotion path.

An embedded job outcome naming a customer or vehicle is a deletion problem spanning vectors, caches and any provider that saw it, under ACT-REG-005 and erasure obligations.

**Required:** de-identification is a gate on `KnowledgeCandidate → K-B`, not a style guide. Re-identification keys live outside the corpus. §61's "deletion failure" eventuality should name the vector store, the cache and the provider log as three separate propagation targets.

### H8 — Offline knowledge packs ship an ACL snapshot with no revocation story

§22 and §53 are the strongest differentiator in the document — Zimbabwe connectivity makes offline the difference between used and unused. They are also an unmodelled exfiltration surface.

A downloaded pack is **permissions frozen at download time**. §31 lists "stale permissions" as a threat and never connects it to packs.

**Required:** key custody and per-device key derivation; pack TTL with hard expiry; revocation on ACL change, job reassignment and employment termination; remote wipe; and a rule that pack contents may never exceed the job's own scope. Also state what a pack may never contain — customer personal data beyond the job, pricing, other technicians' jobs.

---

## 3. Corrections

- **M1 — The 2,750-case bootstrap corpus (§41) is unowned and unrealistic.** Start at ~50 gold cases per capability plus adversarial, grow from production traces. Define who labels, and what "the correct chunk" means when several are acceptable — otherwise Recall@k is unmeasurable in practice.
- **M2 — `retrieval_runs` / `retrieval_results` are a PII store.** They hold query text. Give them a retention class and redaction rule in the data model, not only §56's general statement.
- **M3 — Docling, Presidio, the BGE models and any Meilisearch embedder are new donors.** §69.4 defers Docling to "after final deployment review". DIAL's Donor Assimilation Gate is a **precondition** of first import: pinned commit/tag, licence file and hash, source paths, SBOM/SCA, parity tests, upgrade strategy. Model weights need the same treatment as code, including licence terms for commercial use.
- **M4 — Query-embedding cache keys must include the embedding profile and model version** (§45), or a model promotion silently serves vectors from the previous model.
- **M5 — `conflicts[]` (§19) has no detection rule.** Minimum viable: same entity, overlapping effective dates, differing normative statement → flag. Without a rule, "DIAL surfaces the conflict" is unimplementable.
- **M6 — "Cost per verified answer" (§45, §58) needs a definition of "verified".** Cited and accepted by the operator? Outcome-confirmed later? These differ by an order of magnitude and the metric is otherwise unfalsifiable.

---

## 4. Required rollout change

The plan's R0 → R6 is right in shape and wrong in one place: R1 depends on rights DIAL does not hold.

```text
R0  foundation — unchanged, plus B4's predicate ACL and H1's filtered-search work
R1  Technician + Academy, restricted to DIAL-OWNED knowledge
    SOPs, safety procedures, HIRA/PPE, internal policies, approved checklists
    (OEM/manufacturer content deferred behind ACT-REG-011)
R2  Support + RCE — policy corpus is DIAL-owned, so unblocked
R3  Spare semantic discovery — Meilisearch boundary already canon
R4  Supplier + Projects + Corporate
R5  Command Centre explanation
R6  controlled learning factory — gated on H7's de-identification
```

Nothing else in §64 changes.

---

## 5. Integration performed

- `DKRF_ARCHITECTURE_v1.md` moved from the repository root into this section. At the root it sat outside `docs/dial/final-audit/`, so `MANIFEST_v2_2.json` did not declare it and no check could detect drift — the same defect as the ungoverned `ref/` copies, eight of ten of which had drifted before they were replaced with pointers. It is now declared by hash.
- Feature IDs allocated as `DKRF-F001`..`DKRF-F022` at `SPECIFIED`, with FRC, realization and facet rows, per B3.
- Anchor index updated.

## 6. Not done here, and needing a decision

- The pgvector adoption record (B1). It is an architectural decision, not a review finding.
- Locating or defining the Intelligence Factory canon (B1).
- Langfuse vs OpenTelemetry against the locked donor (B1).
- Whether ACT-REG-011 negotiation is scheduled, which decides when OEM content can enter K-A at all (B2).
