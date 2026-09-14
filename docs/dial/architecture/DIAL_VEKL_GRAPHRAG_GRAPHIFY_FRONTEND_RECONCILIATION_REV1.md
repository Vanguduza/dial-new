# DIAL VEKL / GraphRAG × Graphify — Frontend-Aware Structural Reality Integration Rev 1

**Date:** 2026-09-14
**Status:** Implemented repository architecture; Graphify live provider remains fail-closed until host qualification
**Repository baseline:** `Vanguduza/dial-new@df8772ba8b09fea4d34f34a2f19abb43a817afd0`
**Owner instruction:** fully integrate the existing Graphify S2–S8 work with the canonical frontend Product Experience changes and promote through protected `master`.

## 1. Purpose

This revision reconciles the previously completed off-host Graphify S2–S8 implementation with the frontend Product Experience system merged by PR #28. It does **not** create a second VEKL, Project Truth, design authority, GraphRAG resolver, mission lifecycle, execution lifecycle, or frontend certification authority.

The integration preserves the governing relationship:

```text
OWNER / PROJECT TRUTH
        ↓
VEKL canonical engineering knowledge
        ↓
Development Unit + GraphRAG
        ├── G_PX   Product Experience / FDEP / VRDE
        └── G_IMPL Structural Reality Plane
                    ├── deterministic TypeScript structural provider
                    └── Graphify 0.9.58 provider (fail-closed until qualified)
```

Graphify reports **what implementation exists**. VEKL decides whether that observation is relevant, current, legitimate and admissible. Existing frontend certification decides whether frontend implementation is acceptable.

## 2. Authority invariants

The following are non-negotiable and machine represented in `STRUCTURAL_REALITY_POLICY.json`:

1. Graphify cannot mutate Project Truth.
2. Graphify cannot redefine a Development Unit.
3. Graphify cannot change engineering-resource eligibility.
4. Provider inference is lower authority than explicit structural evidence.
5. Structural evidence is lower authority than verified runtime evidence and all canonical authority.
6. Frontend design/code parity remains owned by the existing frontend certification system.
7. Missing structural evidence in SHADOW rollout is advisory; a **bound** stale structural snapshot is not silently accepted.
8. Live Graphify execution is disabled until exact-version, no-egress, source-tree-immutability, parser and schema evidence all exist.

## 3. Why the frontend merge changes the integration

The current Unit Knowledge Map now includes a deterministic frontend Product Experience projection containing product profile, surface/state information, design authority, frontend graph projection, renderer/presentation decisions and render determinism. Material frontend work is additionally bound through FDEP and VRDE in the Task Execution Envelope.

The old Graphify overlay therefore cannot replace `unit-knowledge-map-builder.mjs`. This revision semantically composes structural reality into the frontend-aware builder instead.

The resulting Unit model is:

```text
UnitKnowledgeMap
├── authority_map
├── dependency_map
├── implementation_map
├── resource_map
├── product_experience_map        # G_PX
├── structural_reality_map        # G_IMPL evidence, subordinate
├── risk_eventuality_map
└── verification_map
```

## 4. Stable canonical identity vs observed structural identity

`unit_lineage_id` remains the conceptual Unit identity. `unit_revision_hash` remains the canonical knowledge/configuration identity.

Observed code topology is carried separately as:

```text
unit_structural_fingerprint = SHA256(
  sorted(member_structural_ids)
  + sorted(internal_edge_refs)
  + sorted(boundary_edge_refs)
  + structural_schema_version
)
```

This prevents implementation observations from silently rewriting canonical Unit history while still making code topology first-class evidence.

## 5. S2 — source ownership and freshness

`structural-source-manifest.mjs` deterministically hashes the source declarations owned by a Unit. Identity includes both membership and bytes. Directory/glob membership changes, file edits, additions, deletions and renames therefore change the manifest identity.

Safety properties:

- path escape is refused;
- symlinks are hashed as links and never followed outside the repository;
- known dependency/build trees are excluded by policy;
- overlapping declarations preserve all owners without double-counting a file;
- a missing declaration is represented explicitly;
- ordinary source files are not hidden merely because their name contains a word such as `generated`.

Two freshness scopes are deliberately separate:

```text
snapshot_source_manifest_hash = source set used to build the structural snapshot
unit_source_manifest_hash     = source set currently owned by this Development Unit
```

A whole-repository Graphify snapshot is therefore not incorrectly compared with a Unit-only subset.

## 6. S4 — StructuralCodeGraphProvider

The integration exposes two structural providers behind one conceptual contract.

### 6.1 TypeScript structural provider

`TypeScriptStructuralCodeGraphProvider` provides a deterministic, dependency-free baseline used for local structural extraction and provider-independent tests. It extracts modules, declarations and import edges from JavaScript/TypeScript-family files and passes them through the same normalization model.

It is evidence, not authority.

### 6.2 Graphify provider

`GraphifyStructuralCodeGraphProvider` is pinned to **0.9.58** and refuses execution unless qualification proves:

- exact version;
- no-egress operation;
- source-tree immutability;
- parser-version evidence;
- schema-sample evidence.

The provider receives an injected runner rather than scattering Graphify CLI calls across Hermes/VEKL.

`graphify-qualification.mjs` is the repository-side qualification runner. A live host must additionally supply the no-egress proof before the qualification state can become green.

## 7. Normalization firewall

Raw Graphify output is never ingested directly into canonical VEKL state.

```text
Graphify raw graph
      ↓
provider adapter
      ↓
schema checks
      ↓
identity normalization
      ↓
path/secret admission checks
      ↓
edge authority classification
      ↓
normalized Structural Evidence Graph
      ↓
VEKL structural reconciliation
```

Normalized symbol identity is provider independent. Graphify IDs remain provenance only.

Inferred edges are converted to `GRAPHIFY_INFERRED_LINK`, carry lower confidence/authority, and require review. Secret-bearing or repository-external nodes are rejected.

## 8. Structural graph layers

The frontend merge requires an explicit separation between semantic frontend knowledge and observed implementation structure:

```text
G_CANON      Project Truth / Decisions / FRCs / contracts
G_UNIT       canonical Development Units
G_KNOWLEDGE  skills, tools, references, patterns and anti-patterns
G_PX         Product Experience / frontend semantics / donor projection
G_IMPL       observed structural implementation evidence
```

These layers are reconciled by VEKL; they are not flattened into one authority graph.

## 9. S5 — canon ↔ implementation reconciliation

`structural-reality.mjs` derives per-Unit structural membership, cross-boundary edges, orphan candidates, hotspots and graph-based test reachability.

The structural plane can identify:

- implementation observed for a Unit;
- code with no declared Unit ownership;
- cross-Unit coupling;
- high-degree/god-node candidates;
- test reachability gaps;
- source/snapshot drift.

The output is evidence for VEKL and existing verification. It does not rewrite canon.

## 10. S6 — bounded structural retrieval

Structural traversal is graph-first:

1. Seed with structurally observed nodes whose source paths belong to the current Unit.
2. Traverse only admitted weighted structural relationships.
3. Enforce `max_hops` and `max_nodes` before semantic ranking.
4. Apply semantic similarity only to rerank already eligible structural nodes.

The relationship weights are the locked integration values:

```text
AUTHORISED_BY           1.00
BELONGS_TO_UNIT         1.00
IMPLEMENTS              0.95
TESTED_BY               0.95
CALLS                   0.90
USES_SCHEMA             0.90
HANDLES_EVENT           0.90
IMPORTS                 0.70
SAME_COMMUNITY          0.55
SIMILAR_STRUCTURE       0.40
GRAPHIFY_INFERRED_LINK  0.35
SEMANTIC_SIMILARITY     rerank only
```

This traversal **does not add engineering resources** and therefore cannot bypass the existing graph-first GraphRAG resource eligibility path.

## 11. Frontend-aware structural retrieval

For a frontend-bearing Unit, structural evidence is bound to the current Product Experience projection hash. The structural map therefore knows which frontend semantic projection it was reconciled against without promoting code observation into design authority.

Example flow:

```text
FDEP / G_PX expectation
       ↓
Development Unit
       ↓
G_IMPL structural seeds
       ↓
bounded structural expansion
       ↓
actual implementation evidence
       ↓
existing DesignCodeParity / Frontend Certification
```

Graphify is an evidence supplier to the existing parity/certification path, not a replacement for it.

## 12. Existing seven-capsule model preserved

No eighth “Graphify authority capsule” is introduced. `structural_reality_map` is embedded in the existing **IMPLEMENTATION** capsule. The capsule count and role-based projection model remain unchanged.

Frontend workers already receive the mandatory frontend execution packet/design brief through existing role-context logic; structural implementation evidence augments that existing context.

## 13. KnowledgeResolutionTrace extension

The immutable KRT now records:

```text
structural_graph.provider
structural_graph.snapshot_hash
structural_graph.normalized_hash
structural_graph.repo_sha
structural_graph.source_manifest_hash
structural_graph.unit_structural_fingerprint
structural_graph.frontend_projection_hash
structural_graph.seed_nodes
structural_graph.visited_nodes
structural_graph.visited_edges
structural_graph.excluded_edges
structural_graph.max_hops
structural_graph.authority
```

A packet can therefore be replayed from canonical knowledge through GraphRAG and into the structural evidence that supported implementation reasoning.

## 14. Admission and stale-context refusal

The execution knowledge binding now carries a structural binding:

```text
snapshot_hash
normalized_graph_hash
unit source manifest hash
unit structural fingerprint
frontend projection hash
```

If a binding references a structural snapshot and that snapshot changes/disappears, execution is refused as stale. Unit source or frontend projection drift also refuses the bound packet.

During SHADOW rollout, a Unit with no structural snapshot is allowed to continue with an explicit advisory state. This preserves current production behaviour while ensuring that once structural evidence is bound it cannot silently go stale.

## 15. Task Execution Envelope integration

The AEF Task Execution Envelope now additionally binds:

- frontend Product Experience projection hash;
- structural snapshot hash;
- normalized structural graph hash;
- Unit source-manifest hash;
- Unit structural fingerprint.

Existing FDEP, presentation-decision and VRDE bindings remain intact.

A material frontend task therefore becomes reproducibly bound to both the expected Product Experience semantics and the implementation topology used to reason about it.

## 16. S7 — expected vs observed structural delta

`compareExpectedObservedDelta` compares pre-change and post-change edge identities against the expected change set and emits `STRUCTURAL_DELTA_MISMATCH` for:

- undeclared additions;
- undeclared removals;
- expected additions that did not occur;
- expected removals that did not occur.

The Task Execution Envelope and FDEP define the authoritative expected work; Graphify/structural providers only measure the observed result. Development Execution Receipts retain the resulting structural snapshot/fingerprint/delta hashes in a subordinate `structural` evidence field.

## 17. Impact analysis and merge-conflict intelligence

`buildImpactEnvelope` walks incoming structural dependencies from changed paths to produce a bounded blast radius before dispatch/review.

`structuralMergeConflictRisk` compares structural node overlap between concurrent changes. It remains advisory. It may inform Hermes serialization or reviewer attention after calibration, but does not independently reject work.

## 18. Structural contracts

The five original contracts are retained exactly and default to ADVISORY:

1. No UI package imports settlement persistence.
2. All payment mutation flows pass through PaymentOrchestrator.
3. No worker invokes canonical mutation APIs directly.
4. WhatsApp owner control cannot bypass Hermes authority mediation.
5. Canonical challenge acceptance only enters through owner decision path.

Only high-signal contracts may later be promoted to hard gates under owner/canonical authority.

## 19. S8 — outage, freshness and deterministic certification

A current approved snapshot may be reused during provider outage. A stale snapshot may not. Structural extraction also has an explicit reservation/settlement record with node/time limits; budget pressure can require review but can never waive mandatory review.

Repository certification requires two clean structural rebuilds from the same exact inputs to agree on:

- provider and provider version;
- repository SHA;
- source-manifest hash;
- normalized graph hash.

The replay bundle hashes Unit map, structural map, source manifest, fingerprint, frontend projection and execution evidence pointers. Tampering changes the replay identity.

## 20. Shell-effect hardening

The pre-tool guard now delegates shell classification to `shell-effect-classifier.mjs`.

Read-only status/inspection commands remain read-only. The following are material regardless of a read-only prefix:

- command chaining;
- pipes;
- redirection;
- command substitution;
- `find` mutating actions;
- branch creation or other mutating Git commands.

This closes the old prefix-only classifier hole without changing the VEKL/AEF authority model.

## 21. Activation state

At merge time the intended state is:

```text
Structural Reality architecture      ACTIVE
TypeScript structural baseline       AVAILABLE
Graphify adapter                     AVAILABLE
Graphify provider execution          DISABLED
Graphify live qualification          REQUIRED
GraphRAG resource eligibility impact NONE
Structural rollout                   SHADOW
Structural hard contracts            ADVISORY
```

This is intentionally not a false claim that Graphify has been proven no-egress on `dial-hermes-control`.

## 22. Production activation gate

Graphify may become `qualified=true`, `activation_ready=true` or `execution_enabled=true` only after live evidence from the approved development host proves:

1. `graphify --version` resolves exactly to 0.9.58;
2. parser/help/schema evidence is captured and hashed;
3. Graphify has no egress during extraction;
4. source-tree hash is identical before and after extraction;
5. a real DIAL structural extraction succeeds;
6. two clean rebuilds on the same SHA have identical normalized identity;
7. golden structural retrieval passes;
8. induced contract violations are detected;
9. full repository `npm run verify` is green;
10. protected-branch CI is green.

## 23. Acceptance criteria for this reconciliation

This repository integration is complete when:

- frontend Product Experience remains intact;
- Graphify cannot overwrite frontend or canonical authority;
- G_PX and G_IMPL are distinct;
- Unit revision identity remains canonical while structural fingerprint is observational;
- Unit source freshness is bound separately from global snapshot freshness;
- KRT contains structural traversal evidence;
- AEF envelope binds frontend + structural identities;
- stale bound structural evidence fails closed;
- structural context stays inside the existing seven-capsule model;
- shell inspection classification cannot be bypassed with shell composition;
- Graphify exact-version qualification remains fail-closed;
- structural architecture gate is 16/16 green;
- repository-native test suite and protected CI are green.

## 24. Final architecture

```text
                         OWNER
                           │
                    PROJECT TRUTH
                           │
                 ┌─────────┴─────────┐
                 │                   │
             CANON / FRCs        Design authority
                 │                   │
                 └─────────┬─────────┘
                           ▼
                         VEKL
                           │
                 Development Unit
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
     GraphRAG             G_PX               G_IMPL
engineering knowledge  Product Experience  Structural Reality
        │             FDEP / VRDE            │
        │                  │        ┌─────────┴─────────┐
        │                  │        │                   │
        │                  │   TypeScript          Graphify
        │                  │   baseline            0.9.58
        │                  │                         │
        └──────────┬───────┴───────────────┬─────────┘
                   ▼                       ▼
             context capsules      structural evidence
                   │                       │
                   └───────────┬───────────┘
                               ▼
                        Task Execution Envelope
                               │
                               ▼
                           HCX worker
                               │
                               ▼
                     expected vs observed delta
                               │
                               ▼
                    existing verification system
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
             Frontend Certification   CI / merge gates
```

The result is one cohesive VEKL system: Project Truth defines intended reality; Product Experience defines frontend intent; Graphify measures implementation reality; GraphRAG supplies bounded engineering evidence; VEKL reconciles them; AEF binds the exact evidence used; existing certification remains the acceptance authority.
