# DIAL VEKL Union Alpha Research Harvest Architecture — Revision 1

Status: repository-side implementation; provider execution blocked. Union Alpha (`stealth/union-alpha`) is no longer free and was revealed as paid Pareto. Paid inference and provider/model fallback are prohibited.

## Authority and boundaries

The harvest produces non-authoritative engineering evidence. Project Truth, feature/FRC/security/product-experience contracts, development ordering, and repository admission gates remain authoritative. Provider egress is `PUBLIC_RESEARCH_ONLY`; private source, secrets, customer/payment/health data and production identifiers are prohibited. Unit bindings stay local and are not serialized into provider packets.

`dial-hermes-control` owns typed control and credentials. `vekl-worker` coordinates durable background work over the private MCP binding. `oracle-admin` is recovery-only and must not run the harvest. The exact provider lineage is OpenRouter `stealth/union-alpha`; fallback and paid requests fail closed.

## Contracts and flow

`vekl-research-contracts.mjs` defines validators for `ResearchCoverageManifest`, `ResearchMission`, `ResearchArtifact`, and `SharedResearchArtifact`, plus the canonical dimension statuses and research polarities. Coverage binds the repository SHA, Project Truth fingerprint, graph generation, 309-unit inventory, and feature/FRC/security/product-experience hashes.

The deterministic flow is: mission packet → public source qualification → exact free-window qualification → inference → schema/citation validation → quarantined artifact → verification → explicit admission → shared corpus → deterministic unit applicability → admitted graph projection → fresh unit capsule. Raw, malformed, rejected, stale, or merely synthesized artifacts never enter GraphRAG or capsules. Contradictions are retained; admission never rewrites them away.

All 18 owner-named roles are mandatory. Mission packets bind explicit questions, public source requirements, prohibited data classes, output schema, retry and deadline policy, freshness, evidence, contradiction and provider identity.

## Durability and safety

The worker persists manifest, state, completed result files, failure categories, usage counters and events atomically. Restart resumes from completed batch IDs. `FREE_WINDOW_CLOSED` is blocking and survives restart. Rate limits and outages are retryable; authentication, exact-model mismatch, invalid output, fabricated citations, stale repository/unit bindings and provider closure are blocking.

Only a fully verified mission may be admitted. Admission preserves provider/model/request/source/response hashes, timestamps, versions, applicability, alternatives, trade-offs, failure modes, anti-patterns, contradiction/unresolved fields, freshness/invalidation, data class, egress, validation, verification, evidence and polarity. Knowledge resolution must reject a stale graph, unit revision, Project Truth fingerprint or corpus generation.

## Operations surfaces

`vekl-research-controller.mjs` exposes `create`, `start`, `pause`, `resume`, `status`, `retry`, `coverage`, `verify`, `admit`, `graph-compile`, `capsule-build`, and `certify` JSON operations. In the current blocked state, graph/capsule operations refuse because there is no verified admitted research.

