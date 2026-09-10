# DIAL VEKL 2.2 REV 2 — Canonical Implementation Addendum

Status: LOCKED by product-owner instruction on 2026-09-10.
Source architecture SHA-256: `94d3547d4d4c6a1da290111de73fc6b2ecf3475b89d62d805ca723d67949707f`.
Relationship: additive extension of DEC-020 / DEC-024. It does not replace Project Truth, Feature/FRC, Security, current repository evidence, or VEKL 2.1 activation provenance.

## Binding architecture
DIAL development knowledge is compiled into a rebuildable Development Knowledge Graph. Dependency-safe Development Units have stable conceptual `unit_lineage_id` and immutable `unit_revision_hash`; truth/stack/contract changes revise a lineage rather than create identity churn. Every material unit receives a Unit Knowledge Map or an explicit `EXEMPT_BY_POLICY` result.

Graph retrieval is graph-first. Semantic similarity may rank only inside an already eligible graph neighbourhood. Every classifier, route, chunking, embedding, index, reranker, fusion, candidate limit and tie-break input is pinned in a `GraphRAGDeterminismEnvelope`; stochastic components, if ever admitted, must distinguish replayable inputs from bitwise deterministic outputs. VEKL 2.1 hard eligibility and purpose/role minimal-coalition resolution remain the single activation path. Resource role/purpose are packet-specific bindings, not intrinsic canonical meaning.

Every material dispatch emits immutable `KnowledgeResolutionTrace` evidence covering traversal, exclusions, ranking environment, winners, withheld conflicts, activation, capsules and worker-delivery hash. Context delivery is bounded to Canon, Unit, Implementation, Product Experience, Integration and Verification capsules plus exact resource manifest. UI-bearing units automatically activate Product Experience knowledge and must satisfy both deterministic hard gates and DIAL-specific qualitative gates.

Research is read-only and produces structured findings. Strong conflicting evidence can enter the deterministic canon-challenge prefilter. Conflicting evidence is withheld from ordinary execution guidance until canon changes. Challenge acceptance is owner-only via `DIAL_CANON_CHALLENGE_DECISION`, bound to current truth hash and exact delta hash, never standing/batch approved. Locked decisions evolve only by additive revision/supersession, never destructive edit. Critical challenges set knowledge readiness `BLOCKED` with a typed reason and use existing Hermes mission/packet control rather than inventing a second execution-state ledger.

Knowledge readiness is separate from execution lifecycle: `UNMAPPED`, `MAPPING`, `READY`, `BLOCKED`, `STALE`, `EXEMPT_BY_POLICY`. `IMPLEMENTATION_READY` requires READY or an allowed exemption, persisted capsules/activation where required, current graph/unit/contract/stack/route fingerprints and transactional admission binding. Freshness is rechecked at packet admission, immediately before worker invocation, worker/harness preflight and consequential external-effect boundaries; stale bindings fail closed as `REFUSED_STALE_KNOWLEDGE` and trigger audited re-resolution.

The graph is a derived projection, not a second authority. Deleting and rebuilding from identical canonical inputs and compiler/policy versions must produce equivalent graph content identities. Initial persistence is deterministic JSON/JSONL + adjacency indexes under `/var/lib/dial-control/knowledge/`; no graph database is required. Any future Postgres/pgvector implementation must retain authority references, project/tenant isolation, RLS, active-generation semantics and tombstone exclusion.

The canonical node/edge vocabulary, Unit boundary policy, route registry, challenge policy and determinism policy are machine-readable in `agent-system/registries/`. The implementation modules under `agent-system/orchestration/` own graph compilation, unit planning/maps, graph retrieval, capsules, challenges, invalidation, admission and immutable resolution traces.
