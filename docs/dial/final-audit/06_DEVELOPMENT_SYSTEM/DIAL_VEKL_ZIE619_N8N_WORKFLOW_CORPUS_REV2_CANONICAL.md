# DIAL VEKL × Zie619/n8n-workflows Corpus Integration — Canonical Rev 2

Status: **CANONICAL under DEC-029**
Adopted: 2026-09-10
Repository: `Vanguduza/dial-new`
Authority: additive development-knowledge canon beneath Project Truth, VEKL 2.2 and AEF Rev 2.

## 1. Decision

DIAL may use exact-pinned, sanitized, non-executable examples from `Zie619/n8n-workflows` as bounded engineering knowledge. The corpus is not an automation runtime, manager, domain source of truth, credential source, provider authority or Project Truth authority.

The canonical flow is:

`exact-pinned corpus -> ephemeral quarantine -> deterministic sanitizer/analyzer -> compact pattern descriptors -> existing engineering resource registry -> existing Development Knowledge Graph -> existing GraphRAG/minimal coalition -> existing Activation Manifest -> existing KnowledgeResolutionTrace -> existing worker delivery -> AEF Task Execution Envelope -> implementation -> existing verification`.

No second automation database, graph, activation manifest, evidence ledger, manager runtime or Hermes plane is created.

## 2. Source authority

`official.n8n` is a separate `T1_OFFICIAL` source family for current n8n documentation, repository facts, release notes and security advisories.

`community.zie619.n8n_workflows` is `T3_COMMUNITY_CORROBORATION`. It is admitted only as `REPOSITORY` / `EXAMPLE_REFERENCE` knowledge and must use `COMMUNITY_SIGNAL_ONLY` + `CORROBORATION_ONLY` activation semantics. The descriptor itself remains reference-only and non-executable. Upstream claims such as “production ready” or “import success” are not DIAL qualification evidence.

The production corpus generation is exact-pinned to commit `94007c1445d9258a7da116646b79473e7c7c3282`. A newer upstream commit is a candidate generation only until separately ingested, scanned, compared and promoted. The pinned tree contains 2,061 workflow JSON files under the declared `workflows/**/*.json` corpus scope; JSON files outside that workflow tree are not silently treated as corpus workflows.

## 3. Raw-source isolation

Raw upstream workflow bytes are ephemeral quarantine input only. They must never be executed, imported into production n8n, embedded, placed in worker context, stored in searchable knowledge state, used as credentials, or treated as instructions.

Persistent DIAL knowledge may contain hashes, source paths, sanitized structural evidence, security findings, pattern descriptors and generation metadata. Raw bytes are discarded after deterministic analysis unless a separately authorized forensic need requires retention.

Any comments, prompts, node text or workflow descriptions are untrusted external data. Prompt-like text cannot alter Project Truth, providers, runtime ownership, owner authority or model/tool routing.

## 4. Deterministic sanitizer and security analysis

The sanitizer must bound workflow size/depth/value counts and remove or replace secret-bearing fields and values. Analysis covers at least credential bindings, hard-coded tokens/keys, prompt injection, unauthenticated webhook posture, arbitrary code, shell execution, filesystem access, SSH, MCP clients, AI-to-shell, AI-to-network, AI-to-database, destructive SQL, unknown/community nodes and dynamic network destinations.

Network classification must detect loopback, RFC1918/private ranges, link-local, cloud metadata targets, blocked schemes, dynamic host interpolation and unresolved/dynamic targets. Upstream destinations are candidate evidence only; DIAL implementations still require approved egress/purpose/provider controls.

High/critical-risk or community-node workflows cannot become positive implementation guidance. They may contribute bounded `ANTI_PATTERN` knowledge.

## 5. Compatibility is explicit and fail-closed

A pattern must expose `source_n8n_version`, observed node types/versions, unknown/community-node count, compatibility state and runtime compatibility evidence.

Unknown source/runtime compatibility is never represented as compatible. Current promoted corpus descriptors use `UNKNOWN_SOURCE_N8N_VERSION` and `runtime_compatible=false` unless later official evidence proves an exact supported range.

A pattern can remain useful as structural reference while being runtime-incompatible.

## 6. Pattern identity and compression

DIAL does not register thousands of workflow files as first-class VEKL competitors. The corpus is compressed into a small diverse set of reusable pattern lineages plus anti-patterns.

`pattern_lineage_id` is derived from canonical intent/archetype, normalized control-flow structure and semantic capability class. It does not depend on upstream workflow UUID, filename, commit SHA or task ID.

`pattern_revision_hash` is immutable over the lineage plus exact support set, source hashes, compatibility, analyzer/sanitizer/extractor versions, security/control findings and schema version.

Multiple workflows supporting the same conceptual pattern are merged under one lineage with content-addressed source-support provenance.

## 7. Incremental generation semantics

Every upstream file is content-hashed. A subsequent ingest may reuse prior **sanitized analysis only** when raw hash and sanitizer/analyzer policy fingerprints match. New/changed files are rescanned. Removed files disappear from the next generation.

Corpus generation identity depends only on source/tree identity, selected sanitized pattern set and deterministic policy/version fingerprints. Cache hit counts, scan timing and prior-generation state are run evidence and must not change generation identity.

`freshness_ttl_hours` means check for a newer generation. It does not automatically invalidate an exact-pinned approved generation. Promotion, revocation, security-policy incompatibility or an explicit refresh changes active knowledge.

## 8. Existing task taxonomy only

No synthetic `N8N_AUTOMATION_REFERENCE` task class is introduced. Pattern resources map only to existing canonical classes such as `WEBHOOK_SECURITY`, `RELIABILITY`, `MESSAGING`, `DATABASE`, `AI_SECURITY`, `SECURITY` and `EXTERNAL_RESEARCH` where supported by their descriptor.

Hard eligibility runs before scoring. Community resources require task-specific lexical/technology relevance and can never outrank incompatible canon or policy.

## 9. Closed graph ontology

Phase 1 introduces zero new Knowledge Graph node or edge types. Promoted patterns project through the existing `ENGINEERING_RESOURCE` node type and existing relationships. `WorkflowPattern`, `AutomationCapability`, `AutomationControl` or equivalent ontology additions require a separate measured retrieval-deficiency case and graph-schema revision.

The GraphRAG determinism envelope includes source registry, resource registry, workflow-pattern registry, capability-map and security-rule fingerprints.

## 10. Minimal-coalition retrieval

Pattern knowledge participates in the existing graph-first VEKL resolver only when the Unit concern neighbourhood makes it relevant. It does not become an always-bound global corpus.

The canonical selection sequence remains hard eligibility -> selection purpose -> selection role -> peer competition -> deterministic tie-break -> context budget.

Descriptor-only delivery is the default. The worker receives pattern structure, controls, risks, selection reason and provenance—not raw workflow JSON.

For consequential n8n implementation work, official n8n evidence should accompany community structure where relevant. Official evidence answers what n8n supports; community evidence shows how examples were structured.

## 11. KnowledgeResolutionTrace and AEF

Selected corpus resources preserve source commit, corpus generation, pattern lineage/revision and source-support hash into the existing Activation Manifest, context capsules and `KnowledgeResolutionTrace`.

Material execution remains `Unit -> VEKL resolution -> activation -> KRT -> AEF Task Execution Envelope -> worker`. A worker cannot browse or select a different raw workflow after the envelope is created. Materially changed evidence requires invalidation, re-resolution, a new KRT and a new envelope.

The manager-runtime chain remains `GPT-5.6 Sol -> Claude Sonnet 5 -> no runtime`. The corpus does not add a manager, model router or execution fallback.

## 12. Runtime ownership remains canonical

Retrieval of an n8n example never implies `runtime_target=n8n`.

Temporal retains durable long-lived business workflow/reconciliation ownership. BullMQ retains bounded asynchronous jobs. n8n remains operator/integration visual glue where Technical Cohesion says it fits. DIAL domain services retain business invariants and transactional truth. Hermes retains owner/development orchestration. CI retains CI mechanics.

`runtime_candidates` in a descriptor are advisory structure only and cannot select runtime ownership.

## 13. Money, WhatsApp and Health boundaries

Corpus knowledge cannot own PaymentIntent, PaymentEvent, ledger, settlement, pricing, beneficiary allocation, eligibility, refund authority or gross-payment custody.

Current official WhatsApp Cloud API / Flows authority is unchanged. Examples using unofficial WhatsApp transports are ineligible for positive runtime guidance; only reusable topology may survive after replacing transport with the approved DIAL gateway.

Specialist Dial Health Units (`HEALTH-*` / Health module) fail closed against the generic Zie619 community corpus. Public/community patterns never receive raw identifiable Health data. Official n8n platform/security references remain independently eligible when relevant and do not weaken clinical/privacy authority.

## 14. Licensing and provenance

Repository-level MIT metadata is recorded for provenance, but DIAL does not infer unrestricted standalone rights for every aggregated third-party workflow. Default use is pattern-learning/reference rather than redistribution of workflow bodies. Each descriptor keeps source repository, commit, path and source hash.

## 15. Promotion boundary

Ingestion writes only a candidate generation under `DIAL_CONTROL_HOME`. It cannot mutate the active engineering-resource registry.

Promotion is an explicit repository mutation after candidate review. The promoter may emit only sanitized `EXAMPLE_REFERENCE` resources, never raw workflows or executable `WORKFLOW_LOOP` entries. Promoted resources remain non-authoritative and non-executable.

## 16. Acceptance gates

The corpus feature is green only when all 25 gates pass:

- `N8N-VEKL-G01` official and community sources are registered separately.
- `N8N-VEKL-G02` exact reviewed corpus commit is pinned.
- `N8N-VEKL-G03` descriptor and source-support hashes are reproducible.
- `N8N-VEKL-G04` raw workflow execution is impossible by registry/policy.
- `N8N-VEKL-G05` committed descriptors contain no credential material.
- `N8N-VEKL-G06` unsafe/community-node workflows do not become positive guidance.
- `N8N-VEKL-G07` stable lineage and immutable revision are deterministic.
- `N8N-VEKL-G08` graph rebuild remains deterministic.
- `N8N-VEKL-G09` corpus/source/resource fingerprints are in the determinism envelope.
- `N8N-VEKL-G10` graph-first eligibility is preserved.
- `N8N-VEKL-G11` the existing minimal-coalition law is preserved.
- `N8N-VEKL-G12` KRT records pattern lineage/provenance.
- `N8N-VEKL-G13` stale-binding refusal remains active.
- `N8N-VEKL-G14` Sol/Sonnet worker-delivery provenance remains symmetric.
- `N8N-VEKL-G15` AEF envelopes remain bound to current KRT evidence.
- `N8N-VEKL-G16` Temporal/BullMQ/n8n/domain-service ownership is unchanged.
- `N8N-VEKL-G17` official WhatsApp authority is unchanged.
- `N8N-VEKL-G18` money authority is unchanged.
- `N8N-VEKL-G19` specialist Health privacy/authority is unchanged.
- `N8N-VEKL-G20` corpus pilot/retrieval regression suite is present and green.
- `N8N-VEKL-G21` raw bytes never enter embeddings, worker context or persistent searchable state before sanitization.
- `N8N-VEKL-G22` every selected pattern has explicit compatibility state; unknown is never runtime-compatible.
- `N8N-VEKL-G23` Phase 1 adds zero graph ontology types.
- `N8N-VEKL-G24` current engineering resource registries validate.
- `N8N-VEKL-G25` official/community trust tiers remain distinct.

## 17. Required real-Unit pilots

At least three representative real Development Units must exercise fresh end-to-end retrieval evidence:

1. Scheduled operational exception/alert Unit: selects bounded positive scheduled-watch structure plus applicable official/security evidence.
2. Human approval Unit: may select negative/anti-pattern knowledge for nonce/expiry/decision/audit controls without granting community authority.
3. Non-clinical operational-health/continuity Unit: scheduled exception monitoring may use scheduled-watch structure while runtime ownership remains unresolved by the corpus.

A specialist Dial Health control case must additionally prove community-corpus exclusion.

## 18. No-silent-thinning rule

If a source pattern conflicts with DIAL canon, preserve the DIAL requirement and transform or reject the example. Never remove a canonical requirement merely to make the external workflow easier to reuse.

## 19. Completion

This integration is complete only when existing VEKL architecture remains 30/30 green, AEF remains 25/25 green, this corpus layer is 25/25 green, all corpus tests and real-Unit pilots are green, the canonical final-audit pack is current, Project Truth authority verifies, the full repository verification passes, and the exact promoted commit passes protected-branch CI and post-merge verification.
