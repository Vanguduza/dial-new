# DIAL Adaptive Multi-Harness Execution Fabric — Reconciled Rev 2
## VEKL 2.2 Adaptive Execution Fabric Extension
### Deterministic Triage + Worker-Only HCX + Compute Governance + Donor Transformation + Provider-Neutral Design Admission + Immutable Execution Evidence

**Prepared:** 2026-09-10
**Target repository:** `Vanguduza/dial-new`
**Audit baseline:** protected `master` after VEKL 2.2 Rev2 closure; baseline commit observed during reconciliation: `e9bfb64ef2e5f77f9aabdc11c63ec2138a81facd`
**Source proposal superseded for implementation planning:** `DIAL_VEKL_Multi_Harness_Stitch_Donor_Integration_Engineering_Spec_v1_1.md`
**Status:** **CANONICAL under DEC-028. Adopted through the existing DIAL Project Truth authority process.**
**Authority rule:** all transient SHAs, counts, paths, model health observations and provider capabilities in this document are audit-baseline evidence, not immutable architecture law. Runtime admission must bind to current hashes, current Unit revisions, current graph generations, current owner authority and current provider/tool health.

---

# 0. Executive architecture decision

DIAL should adopt an **adaptive execution fabric beneath the already-canonical VEKL 2.2 knowledge/authority layer**.

This revision does **not** create a second VEKL, second Project Truth system, second mission controller, second durable development-state authority, second design authority or second model-manager hierarchy.

The reconciled architecture is:

```text
Owner instruction / owner steer
        ↓
Typed DIAL owner-control gateway
        ↓
Persistent Oracle DIAL mission controller
        ↓
DIAL Dev Manager
        ↓
CURRENT VEKL 2.2
  ├─ stable Development Unit lineage
  ├─ immutable Unit revision
  ├─ Project Truth / Decision / FRC binding
  ├─ Unit Knowledge Map
  ├─ deterministic GraphRAG envelope
  ├─ VEKL 2.1 hard eligibility + minimal coalition
  ├─ seven content-addressed context capsules
  ├─ immutable KnowledgeResolutionTrace
  └─ transactional stale-knowledge admission
        ↓
Deterministic Task Triage
        ↓
Task Execution Envelope
        ↓
Compute Governor
        ↓
HCX — worker-only Harness Capability Exchange
        ↓
Minimum Useful Execution Topology
        ↓
Role Context Projections over existing VEKL capsules
        ↓
Repository-wide Worktree Lease + Fencing Token
        ↓
Bounded worker/provider execution
        ↓
Typed artifacts + deterministic verification
        ↓
Targeted independent review where required
        ↓
Existing Product Experience / Security / FRC / Unit Completion gates
        ↓
Immutable Development Execution Receipt
        ↓
Candidate integration
```

The governing principles are:

1. **VEKL remains upstream of execution selection.**
2. **HCX selects workers, never managers.**
3. **The existing Sol → Sonnet manager chain remains unchanged unless separately superseded by owner authority.**
4. **Hard eligibility precedes empirical ranking.**
5. **One worker is the default; multi-worker topologies are evidence-driven escalation mechanisms.**
6. **Compute limits may restrict or block execution, but may never waive mandatory safety, security, review or acceptance gates.**
7. **Role context is projected from existing VEKL evidence; it is not independently authored truth.**
8. **Every repository writer must hold a current repository-wide path lease and fencing token.**
9. **Superseded worker output cannot be integrated even if the worker later reports success.**
10. **Donor, Stitch and other provider outputs are development inputs/candidates only; DIAL authority, DIAL design, DIAL SoRs and DIAL acceptance remain canonical.**
11. **A Development Execution Receipt explains why an execution strategy was selected and why the result was admitted; it does not replace the KnowledgeResolutionTrace.**
12. **External provider outage must degrade development safely without affecting DIAL runtime.**

---

# 1. Reconciliation basis

The original v1.1 proposal contained a strong adaptive-fabric idea, but it was authored against an older repository topology and assumed that DIAL still needed to reconcile a richer non-canonical branch into an older canonical development substrate.

That premise is now obsolete.

Current DIAL already contains and has promoted the following VEKL 2.2 capabilities:

- stable `unit_lineage_id`;
- immutable `unit_revision_hash`;
- deterministic Unit membership ordering;
- Project Truth / locked Decision / FRC / stack / contract / route-policy revision binding;
- generated Development Unit registry;
- closed graph node/edge vocabularies;
- deterministic graph compilation and rebuild verification;
- graph-bounded retrieval before semantic ranking;
- pinned GraphRAG determinism envelope;
- VEKL 2.1 hard eligibility and deterministic purpose/role minimal-coalition selection;
- Unit Knowledge Maps;
- Product Experience knowledge route for UI-bearing work;
- seven content-addressed context capsule types;
- packet-scoped Engineering Knowledge Activation Manifests;
- immutable KnowledgeResolutionTrace;
- transactional stale-knowledge admission at dispatch, harness preflight, worker start, fallback worker start and consequential tool boundaries;
- graph invalidation;
- owner-only Project Truth evolution and deterministic canon challenge review;
- explicit knowledge exemptions for narrowly bounded non-material archetypes;
- fresh implementation/verification evidence and downstream coherence requirements for Unit completion.

Therefore, the original proposal's Unit identity, generic Knowledge Capsule, GraphRAG, KRT, stale-context and Project Truth evolution work is **SATISFIED_BY_VEKL_2_2** and must not be rebuilt under a new `packages/vekl`, `.dial/state`, or parallel orchestration tree.

The genuinely additive execution-layer capabilities are:

```text
DETERMINISTIC_TASK_TRIAGE
TASK_EXECUTION_ENVELOPE
WORKER_ONLY_HCX
TRANSACTIONAL_COMPUTE_GOVERNOR
MINIMUM_USEFUL_EXECUTION_TOPOLOGY
ROLE_CONTEXT_PROJECTION
REPOSITORY_WIDE_WRITE_LEASE_AND_FENCING
EXECUTION_BLACKBOARD
DONOR_APPLICABILITY_PROJECTION
PROVIDER_NEUTRAL_DESIGN_ROUTING
STITCH_QUARANTINE_AND_DESIGN_ADMISSION
DEVELOPMENT_EXECUTION_RECEIPT
EMPIRICAL_WORKER_ROUTING
```

---

# 2. Normative authority hierarchy

This extension must obey the existing DIAL authority ordering.

For development execution, the effective precedence is:

```text
Owner-authenticated Project Truth authority
    >
Project Truth / locked Decisions / specialist canon
    >
Feature / FRC / Security / Product Experience authorities
    >
current Development Unit revision
    >
current Unit Knowledge Map / GraphRAG / KRT / activation binding
    >
deterministic task triage
    >
Task Execution Envelope
    >
hard worker eligibility
    >
compute budget
    >
topology policy
    >
empirical routing
    >
provider/worker preference
    >
worker confidence
    >
speed
```

No HCX score, provider capability, worker confidence, benchmark result, cost saving, quota state or multi-agent consensus may override higher authority.

---

# 3. Scope

Rev 2 introduces a governed **development execution fabric** for DIAL.

It covers:

- deterministic execution-task classification;
- worker capability representation;
- current-health / current-tool / current-quota admission;
- empirical quality-per-cost routing after hard filtering;
- compute reservation and settlement;
- execution topology selection;
- worker roles;
- role-specific context projections;
- durable execution task state;
- repository worktree ownership;
- repository-wide path leases;
- fencing tokens;
- typed worker artifacts;
- donor applicability;
- donor slicing and sanitization;
- provider-neutral design strategy selection;
- Stitch as one optional design provider;
- design candidate quarantine/admission;
- deterministic verification before AI review;
- targeted independent review;
- owner steer invalidation;
- execution telemetry;
- immutable execution receipts;
- safe provider outage behavior;
- phased rollout and acceptance.

---

# 4. Non-goals

This revision does **not**:

- replace VEKL 2.2;
- redefine Development Unit identity;
- move Project Truth;
- create a new feature/FRC authority;
- create a second GraphRAG/vector source of truth;
- create a second mission controller;
- change the existing Sol → Sonnet manager chain;
- promote xKiro HAIF into a repository-writing development worker;
- turn Stitch into runtime infrastructure;
- make any external provider mandatory for DIAL production;
- create a second production AI SoR;
- make Temporal authoritative beside the current Oracle controller;
- make A2A task state authoritative;
- make donor code, donor auth, donor money, donor workflow or donor storage authoritative;
- make worker confidence an acceptance criterion;
- allow multi-agent execution by default;
- permit budget shortage to weaken a required review topology.

---

# 5. Core roles

## 5.1 Owner / Project Truth authority

The owner is the sole source of owner-originated Project Truth authority.

The existing authority classes remain:

```text
OWNER_EXPLICIT
OWNER_DERIVED
OWNER_DELEGATED_AUTONOMY
NO_AUTHORITY
```

HCX, Stitch, coding harnesses, reviewers and empirical routers cannot self-authorize Project Truth change.

## 5.2 Persistent Oracle DIAL mission controller

Remains the durable DIAL development continuity authority.

It owns:

- mission state;
- continuation;
- durable owner priorities;
- packet sequencing;
- queueing;
- recovery;
- mission blocking;
- mission completion signaling.

No new `.dial/state` tree may become a second mission state.

## 5.3 DIAL Dev Manager

The manager remains responsible for:

- selecting the next dependency-safe Unit/task;
- reconciling owner steer;
- interpreting repository evidence;
- determining when ambiguity requires owner input;
- triggering VEKL re-resolution;
- initiating execution triage;
- approving safe execution topology within existing policy;
- interpreting verification evidence;
- promotion readiness.

## 5.4 VEKL 2.2

VEKL remains the knowledge compiler and execution-knowledge admission authority.

It owns:

- Unit lineage/revision;
- authority binding;
- graph compilation;
- graph retrieval;
- hard engineering-resource eligibility;
- Unit Knowledge Map;
- Product Experience knowledge;
- context capsules;
- KRT;
- stale knowledge refusal;
- challenge withholding;
- Unit completion prerequisites.

## 5.5 HCX — Harness Capability Exchange

HCX is a **worker-only provider-neutral execution broker**.

It may select:

- coding workers;
- reviewers;
- design providers;
- browser/visual workers;
- specialist development workers;
- future approved A2A workers.

HCX may **not** select or replace DIAL manager runtime slots.

## 5.6 Hermes manager runtime

The existing DIAL manager-runtime chain remains:

```text
GPT-5.6 Sol
→ exact Claude Sonnet 5
→ no runtime
```

unless separately superseded through Project Truth authority.

HCX is downstream of a manager turn.

## 5.7 HAIF / xKiro

HAIF remains:

```text
NON_AUTHORITATIVE_AUXILIARY
FREE_ONLY
NO_TOOLS
NO_REPOSITORY_WRITES
NO_MANAGER_AUTHORITY
```

HAIF may provide evidence, preprocessing, critique, comparison or auxiliary inference according to its own approved archetypes.

HCX may reuse implementation patterns from HAIF—performance ledgers, quota reservations, diversity metadata, resumable attempts—but **must not broaden HAIF authority**.

## 5.8 Stitch

Stitch is one optional provider of development-time design capabilities.

Potential roles:

- donor code-to-design conversion;
- design-system extraction;
- donor adaptation candidate generation;
- donor-free frontend generation;
- bounded design variants;
- visual critique;
- locked-design enhancement candidates.

Stitch is never:

- Project Truth;
- DIAL design authority;
- a production runtime dependency;
- a DIAL SoR;
- a direct repository writer unless explicitly mediated as an approved worker under HCX and the same lease/tool rules;
- automatically selected because work is frontend-related.

---

# 6. Repository and control-root mapping

The original v1.1 repository structure is superseded.

Do not introduce:

```text
packages/vekl/
packages/dev-orchestrator/
.dial/state/
.dial/tasks/
.dial/worktrees/
```

as parallel authorities.

Use the current development-plane structure.

Recommended additive modules:

```text
agent-system/orchestration/
  task-triage.mjs
  task-execution-envelope.mjs
  harness-capability-exchange.mjs
  harness-capability-registry.mjs
  harness-performance-ledger.mjs
  compute-governor.mjs
  execution-topology.mjs
  role-context-projector.mjs
  execution-blackboard.mjs
  worker-lease-manager.mjs
  worker-result-normalizer.mjs
  execution-receipt.mjs
  donor-applicability.mjs
  donor-slice-compiler.mjs
  donor-egress-guard.mjs
  design-provider-router.mjs
  design-authority-projector.mjs
  design-candidate-admission.mjs
  stitch-adapter.mjs

agent-system/registries/
  TASK_ARCHETYPE_REGISTRY.json
  HARNESS_CAPABILITY_REGISTRY.json
  EXECUTION_TOPOLOGY_POLICY.json
  COMPUTE_BUDGET_POLICY.json
  WORKER_ROLE_POLICY.json
  DONOR_APPLICABILITY_REGISTRY.json
  DESIGN_PROVIDER_POLICY.json

agent-system/evals/
  harness-capability-evals.json
  topology-evals.json
  routing-evals.json
  donor-design-evals.json
```

Durable runtime execution state belongs under the existing DIAL control root:

```text
$DIAL_CONTROL_HOME/
  execution/
    tasks/<task-id>/
      envelope.json
      state.json
      triage.json
      routing.json
      compute.json
      role-projections/
      artifacts/
      findings/
      evidence/
      leases/
      handoff/
      receipt-pointer.json

    leases/
      index.json
      active/
      history/

    performance/
      worker-routes.json
      worker-routes.jsonl

    providers/
      health/
      quota/
      attempts/

    design/
      quarantine/
      candidates/
      accepted/

    donors/
      slices/
      sanitized/
      evidence/
```

This state is operational evidence, not Project Truth.

---

# 7. v1.1 → Rev 2 reconciliation map

The implementing agent must classify every original v1.1 concept as one of:

```text
RETAIN
RETAIN_WITH_CORRECTION
SATISFIED_BY_VEKL_2_2
REPLACE_WITH_CURRENT_DIAL_PRIMITIVE
DEFER
REJECT_DUPLICATE_AUTHORITY
```

The mandatory mapping is:

| v1.1 area | Rev 2 disposition |
|---|---|
| adaptive fabric | RETAIN |
| old branch authority reconciliation | REPLACE_WITH_CURRENT_MASTER_BASELINE |
| separate Unit lineage/revision implementation | SATISFIED_BY_VEKL_2_2 |
| generic monolithic DevelopmentKnowledgeCapsule | REPLACE_WITH_CURRENT_7_CAPSULES + ROLE PROJECTION |
| stale capsule refusal | SATISFIED_BY_VEKL_2_2 / EXTEND TO EXECUTION ENVELOPE |
| deterministic triage | RETAIN_WITH_CORRECTION |
| Harness Capability Registry | RETAIN / WORKER-ONLY |
| empirical performance ledger | RETAIN_WITH_STATISTICAL_HARDENING |
| eligibility filter | RETAIN / HARD FILTER FIRST |
| compute governor | RETAIN / TRANSACTIONAL RESERVATION |
| topology selector | RETAIN_WITH_PRECEDENCE_FIX |
| role-specific VEKL context | RETAIN AS PROJECTION |
| Task Envelope | RETAIN / STRONGLY REBOUND TO CURRENT VEKL HASHES |
| Worker Result | RETAIN |
| Artifact-first collaboration | RETAIN |
| `.dial/tasks` blackboard | REPLACE_WITH_CONTROL_ROOT EXECUTION BLACKBOARD |
| worktree isolation | RETAIN_WITH_REPOSITORY-WIDE LEASE/FENCING |
| donor applicability | RETAIN AS DERIVED ENFORCEMENT PROJECTION |
| donor design modes | RETAIN |
| donor transformation contract | RETAIN |
| donor slice compiler | RETAIN |
| sanitization | RETAIN + EGRESS CLASSIFICATION |
| canonical design authority | REPLACE WITH CURRENT DIAL DESIGN AUTHORITIES |
| DESIGN.md | RETAIN AS DERIVED PROVIDER PROJECTION |
| Stitch provider boundary | RETAIN |
| Stitch quarantine | RETAIN + SECURITY HARDENING |
| design manifest/admission | RETAIN |
| GraphRAG determinism envelope | SATISFIED_BY_VEKL_2_2 |
| KnowledgeResolutionTrace | SATISFIED_BY_VEKL_2_2 |
| context budget optimizer | RETAIN WITH P0 MANDATORY-PACK ALGORITHM |
| Temporal workflow | DEFER |
| topologies | RETAIN |
| deterministic verification before AI | RETAIN |
| reviewer capsule | RETAIN AS ROLE PROJECTION |
| quality-per-token | RETAIN |
| exploration | RETAIN WITH HIGH-RISK EXCLUSIONS |
| A2A | DEFER |
| MCP minimization | RETAIN |
| tool authorization | EXTEND EXISTING PRE-TOOL GUARD |
| owner steer | RETAIN / MAP TO EXISTING OWNER GATEWAY |
| envelope invalidation | RETAIN + LEASE/FENCING CASCADE |
| Execution Receipt | RETAIN / EXPAND |
| AI UI drift gate | REPLACE WITH EXTENSION OF EXISTING PRODUCT EXPERIENCE GATE |
| new parallel VEKL feature IDs | REJECT UNTIL OWNER DECIDES WHETHER DEVELOPMENT-SYSTEM FEATURES NEED NEW IDs |
| 268-item backlog | REBASE; DO NOT REIMPLEMENT SATISFIED ITEMS |

---

# 8. Stable Development Unit identity remains canonical

The current Unit lineage algorithm remains authoritative.

HCX/task decomposition must **not** alter it.

Conceptually:

```text
unit_lineage_id =
hash(
  project_identity,
  canonical_feature_membership,
  canonical_realization_facet_membership,
  canonical_unit_boundary_policy_id
)
```

Execution-task decomposition belongs below the Unit.

A task-graph change must produce:

```text
task_graph_revision_hash
execution_plan_revision_hash
triage_revision_hash
```

not a new conceptual Unit lineage unless the canonical Unit boundary itself legitimately changes.

Mandatory invariant:

```text
execution decomposition churn
≠
Unit lineage churn
```

---

# 9. Task Execution Envelope

Every material worker execution must be governed by an immutable Task Execution Envelope.

Recommended schema:

```ts
export interface TaskExecutionEnvelope {
  schemaVersion: 1;

  identity: {
    taskId: string;
    packetId: string;
    missionId?: string;
    taskRevisionHash: string;
    parentTaskId?: string;
  };

  unit: {
    unitLineageId: string;
    unitRevisionHash: string;
    unitMapHash: string;
  };

  authority: {
    projectTruthHash: string;
    applicableTruthSliceHash: string;
    applicableDecisionHashes: string[];
    contractFingerprints: string[];
    technicalStackFingerprint: string;
    ownerAuthorityRef?: string;
  };

  knowledge: {
    graphGenerationId: string;
    graphRevisionHash: string;
    graphNeighbourhoodHash: string;
    determinismEnvelopeHash: string;
    activationManifestHash: string;
    knowledgeResolutionTraceHash: string;
    contextCapsuleHashes: Record<string,string>;
  };

  triage: {
    triageResultHash: string;
    triagePolicyHash: string;
    archetype: string;
    riskClass: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL";
  };

  execution: {
    allowedPaths: string[];
    deniedPaths: string[];
    toolGrants: string[];
    networkAllowlist: string[];
    requiredCapabilities: string[];
    prohibitedCapabilities: string[];
    mandatoryGates: string[];
    mandatoryReviewClasses: string[];
  };

  compute: {
    budgetId: string;
    budgetHash: string;
    reservationId?: string;
  };

  lease?: {
    leaseId: string;
    fencingToken: number;
    allowedWritePaths: string[];
    baseCommit: string;
  };

  lifecycle: {
    state:
      | "CREATED"
      | "READY"
      | "RUNNING"
      | "VERIFYING"
      | "BLOCKED"
      | "SUPERSEDED"
      | "COMPLETED"
      | "REJECTED";
    createdAt: string;
    expiresAt?: string;
  };
}
```

The envelope hash must be content-addressed.

The worker must never receive mutable “current assumptions” not represented by the envelope or its referenced projections.

---

# 10. Task envelope freshness

Before each material boundary, validate:

```text
Project Truth hash
Unit revision
Unit map hash
graph revision
GraphRAG determinism envelope
contract fingerprints
stack fingerprint
activation manifest
KRT
triage policy
compute reservation
lease/fencing token where writing
owner authority where required
```

Required boundaries:

```text
ROUTING_ADMISSION
WORKER_ASSIGNMENT
HARNESS_PREFLIGHT
WORKER_START
CONSEQUENTIAL_TOOL_USE
WRITE_OPERATION
WORKER_RESULT_ADMISSION
INTEGRATION_ADMISSION
```

If any required binding changed:

```text
REFUSED_STALE_EXECUTION_ENVELOPE
```

Then:

1. mark envelope `SUPERSEDED`;
2. revoke leases;
3. request worker cancellation;
4. reject late results;
5. re-resolve VEKL if authority/knowledge changed;
6. re-triage;
7. create a new envelope.

---

# 11. Deterministic task triage

Triage must remain rule-first.

Recommended archetypes:

```ts
export type TaskArchetype =
  | "ROUTINE_CODE_CHANGE"
  | "BUG_LOCALIZATION"
  | "ARCHITECTURE_CHANGE"
  | "MONEY_PATH_CHANGE"
  | "AUTHORIZATION_CHANGE"
  | "DONOR_ASSIMILATION"
  | "DONOR_ADAPTATION"
  | "LOCKED_DESIGN_ENHANCEMENT"
  | "VISUAL_REGRESSION"
  | "NEW_FRONTEND_DESIGN"
  | "DATABASE_MIGRATION"
  | "SECURITY_REVIEW"
  | "INFRASTRUCTURE_CHANGE"
  | "DEPENDENCY_UPGRADE"
  | "TEST_REPAIR"
  | "EVIDENCE_RECONCILIATION"
  | "RESEARCH"
  | "DOCUMENTATION"
  | "AMBIGUOUS";
```

Risk classes:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

Deterministic sources include:

- Unit knowledge routes;
- Feature/FRC domain owner;
- Security Profile;
- code paths;
- money/payment/ledger authorities;
- auth/identity/RLS indicators;
- infrastructure/production paths;
- migration markers;
- donor refs;
- Product Experience applicability;
- locked design state;
- current gate;
- eventualities;
- required reviewer classes.

Examples:

```text
money / payment / ledger contract
→ MONEY_PATH_CHANGE / HIGH or CRITICAL

auth / identity / RLS / role authority
→ AUTHORIZATION_CHANGE / HIGH

production infrastructure mutation
→ INFRASTRUCTURE_CHANGE / HIGH or CRITICAL

locked UI + visual-only delta
→ LOCKED_DESIGN_ENHANCEMENT

donor ref + UI route
→ DONOR_ADAPTATION

architecture authority or cross-domain source-of-truth boundary
→ ARCHITECTURE_CHANGE / CRITICAL
```

LLM semantic classification is allowed only when deterministic triage returns `AMBIGUOUS`.

If semantic adjudication is used, persist:

```text
classifier_used = true
classifier_model_identity
classifier_input_hash
classifier_output_hash
ambiguity_reason
adjudication_result
```

Semantic classification still cannot lower a deterministic risk floor.

---

# 12. Triage output

```ts
export interface TriageResult {
  schemaVersion: 1;
  archetype: TaskArchetype;
  riskClass: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL";

  requiredCapabilities: string[];
  prohibitedCapabilities: string[];

  mandatoryGates: string[];
  mandatoryReviewClasses: string[];

  mandatoryIndependentReview: boolean;
  mandatoryCompetitiveReview: boolean;

  parallelizableDimensions: {
    dimensionId: string;
    allowedWritePaths: string[];
    requiredCapabilities: string[];
  }[];

  deterministicRulesFired: string[];
  ambiguityReason?: string;

  suggestedTopology:
    | "SOLO"
    | "WORKER_VERIFIER"
    | "PIPELINE"
    | "PARALLEL_CELL"
    | "COMPETITIVE_CELL";

  policyVersion: string;
  inputHash: string;
  triageResultHash: string;
}
```

The triage result is evidence, not Project Truth.

---

# 13. Harness Capability Registry

Each worker identity must be explicit.

```ts
export interface HarnessCard {
  schemaVersion: 2;

  harnessId: string;
  provider: string;
  harnessFamily: string;
  harnessVersion: string;

  model: {
    modelId: string;
    modelRevision?: string;
    modelLineageId?: string;
    providerFamily: string;
  };

  identity: {
    workerIdentityHash: string;
    independenceClass: string;
    toolchainFingerprint: string;
  };

  capabilities: {
    coding: boolean;
    repositoryRead: boolean;
    repositoryWrite: boolean;
    browser: boolean;
    visualReasoning: boolean;
    designGeneration: boolean;
    designTransformation: boolean;
    longContext: boolean;
    toolUse: boolean;
    structuredOutput: boolean;
    parallelWorkerCompatible: boolean;
  };

  limits: {
    contextLength: number;
    maxOutputTokens?: number;
    supportedFileBytes?: number;
  };

  safety: {
    allowedRiskClasses: string[];
    prohibitedDomains: string[];
    allowedDataClasses: string[];
    allowedToolProfiles: string[];
  };

  qualification: {
    state:
      | "DISCOVERED"
      | "CANARY"
      | "QUALIFIED"
      | "APPROVED"
      | "DEGRADED"
      | "QUARANTINED"
      | "REMOVED";
    evidenceHash?: string;
    benchmarkProfileVersion?: string;
    validUntil?: string;
  };

  operational: {
    healthState: string;
    healthSnapshotHash?: string;
    quotaState?: string;
    quotaSnapshotHash?: string;
    observedAt?: string;
  };
}
```

A provider label alone is never a worker identity.

Worker performance history is bound to:

```text
provider
+ model revision
+ harness version
+ toolchain fingerprint
+ policy profile
```

Material identity change means old performance is prior evidence, not directly inherited score.

---

# 14. HCX authority boundary

HCX must expose an API conceptually similar to:

```ts
selectWorkers({
  taskEnvelope,
  triage,
  capabilityRegistrySnapshot,
  computeBudget,
  topologyPolicy,
  performanceLedger,
  currentHealth
})
```

It may return:

```text
eligible workers
ineligible workers + reason codes
selected workers
role assignments
selection evidence
frontier metrics
```

It must never:

- change the Unit;
- change Project Truth;
- change FRCs;
- select manager runtime;
- create owner authority;
- waive gates;
- mutate risk class downward;
- reinterpret an explicit prohibited capability.

---

# 15. Hard eligibility before empirical ranking

Eligibility is a conjunction:

```text
registered
AND qualified
AND approved for role
AND current health admissible
AND current quota admissible
AND risk allowed
AND data class allowed
AND required capability set satisfied
AND prohibited capability/domain absent
AND context capacity sufficient
AND tool grants available
AND provider policy satisfied
AND independence requirement satisfied
```

Only eligible workers reach ranking.

Example:

```ts
function eligible(card, task, role) {
  if (!isQualified(card)) return false;
  if (!isHealthyEnough(card)) return false;
  if (!riskAllowed(card, task.riskClass)) return false;
  if (!dataAllowed(card, task.dataClass)) return false;
  if (!hasCapabilities(card, task.requiredCapabilitiesForRole(role))) return false;
  if (violatesProhibitions(card, task)) return false;
  if (!contextFits(card, task.contextFloor)) return false;
  return true;
}
```

No historical success score may override an eligibility failure.

---

# 16. Empirical routing

The original simple weighted scalar score is superseded.

Rev 2 should use:

1. hard eligibility;
2. uncertainty-aware empirical estimates;
3. Pareto frontier;
4. deterministic policy selection.

Primary empirical dimensions:

```text
first-pass acceptance
final acceptance
escaped-defect rate
rework ratio
verification failure rate
provider failure rate
timeout rate
latency
input tokens
output tokens
cached tokens
tool-call count
review overturn rate
task-archetype similarity
project familiarity
```

For small sample sizes, use conservative shrinkage toward a prior.

Conceptually:

```text
posterior_acceptance
=
(weight_prior * prior_rate + successes)
/
(weight_prior + samples)
```

A 1/1 worker must not outrank a well-proven worker solely because its observed raw rate is 100%.

Performance decays when:

- model revision changes;
- harness version changes;
- toolchain fingerprint changes;
- benchmark policy changes;
- evidence is stale.

---

# 17. Multi-objective worker frontier

HCX should optimize:

```text
verified quality
escaped-defect risk
rework
latency
availability
inference cost
```

Do not collapse everything into one opaque score before filtering.

Recommended process:

```text
eligible candidates
↓
normalize comparable metrics
↓
remove dominated candidates
↓
deterministic policy choose from Pareto frontier
↓
stable tie break by canonical worker identity
```

An optional semantic tie adjudicator may only act on an already hard-eligible, non-dominated close tie and must emit evidence. It may not introduce a new candidate.

---

# 18. Compute governor

The compute governor must be transactional.

Budget hierarchy:

```text
programme budget
    ↓
Unit budget
    ↓
task budget
    ↓
topology reservation
    ↓
worker reservation
```

Recommended schema:

```ts
export interface ComputeBudget {
  schemaVersion: 1;
  budgetId: string;
  budgetClass: "XS"|"S"|"M"|"L"|"XL";

  maxFrontierInvocations: number;
  maxConcurrentWorkers: number;

  maxInputTokensTotal: number;
  maxOutputTokensTotal: number;
  maxCachedTokensTotal?: number;

  maxInputTokensPerWorker: number;
  maxOutputTokensPerWorker?: number;

  maxToolCallsTotal?: number;
  maxWallTimeMs?: number;
  maxPremiumModelCalls?: number;

  escalationAllowed: boolean;
  escalationReasons: string[];

  mandatorySafetyReserve: {
    verifierTokens: number;
    reviewerTokens: number;
  };

  policyHash: string;
}
```

Reservation state:

```text
REQUESTED
RESERVED
PARTIALLY_SETTLED
SETTLED
RELEASED
EXHAUSTED
```

Worker start requires a valid reservation.

On completion:

```text
reserved capacity
- actual usage
→ unused capacity returned
```

---

# 19. Compute safety invariants

The compute governor may:

- choose a cheaper eligible worker;
- serialize work;
- defer optional review;
- avoid redundant variants;
- block an optional experiment;
- block execution when mandatory evidence cannot be afforded.

It may not:

- downgrade `CRITICAL` to `HIGH`;
- remove mandatory security review;
- remove mandatory independent review;
- remove required Product Experience evidence;
- permit a smaller-context worker by dropping mandatory authority context;
- turn a required competitive cell into SOLO;
- allow an unqualified provider because quota is abundant.

If mandatory safe execution exceeds budget:

```text
BUDGET_BLOCKED_REQUIRED_TOPOLOGY
```

not “best effort.”

---

# 20. Minimum useful execution topology

Supported topologies:

```text
SOLO
WORKER_VERIFIER
PIPELINE
PARALLEL_CELL
COMPETITIVE_CELL
```

Correct precedence is safety-first.

```ts
export function selectTopology({ triage, budget, policy }) {
  if (
    triage.riskClass === "CRITICAL" ||
    triage.archetype === "ARCHITECTURE_CHANGE" ||
    triage.mandatoryCompetitiveReview === true
  ) {
    if (!policy.competitiveEnabled)
      return blocked("REQUIRED_COMPETITIVE_TOPOLOGY_DISABLED");
    if (!budgetSupportsCompetitive(budget))
      return blocked("BUDGET_BLOCKED_REQUIRED_TOPOLOGY");
    return "COMPETITIVE_CELL";
  }

  if (triage.mandatoryIndependentReview === true) {
    if (!budgetSupportsVerifier(budget))
      return blocked("BUDGET_BLOCKED_REQUIRED_REVIEW");
    return "WORKER_VERIFIER";
  }

  if (
    triage.parallelizableDimensions.length >= 2 &&
    disjointWriteScopesProven(triage.parallelizableDimensions) &&
    budget.maxConcurrentWorkers >= 2
  ) {
    return "PARALLEL_CELL";
  }

  if (
    triage.riskClass === "LOW" &&
    triage.parallelizableDimensions.length === 0
  ) return "SOLO";

  return "PIPELINE";
}
```

The original selector ordering that could return `PARALLEL_CELL` before considering `CRITICAL`/`ARCHITECTURE_CHANGE` is forbidden.

---

# 21. Topology semantics

## 21.1 SOLO

One worker.

Use for:

- bounded low-risk fixes;
- narrow deterministic refactors;
- documentation;
- low-risk tests;
- already-understood small implementation work.

Still subject to all deterministic gates.

## 21.2 WORKER_VERIFIER

One implementation worker plus an independent verifier/reviewer.

Use for:

- medium-risk donor adaptation;
- security-sensitive but bounded change;
- visual implementation needing independent visual review;
- high-reversal-cost changes below competitive threshold.

## 21.3 PIPELINE

Sequential specialist stages.

Example:

```text
design candidate
→ builder
→ deterministic tests
→ visual verifier
→ integrator
```

Use when roles require different capabilities but not competing solutions.

## 21.4 PARALLEL_CELL

Multiple workers operate on **provably disjoint write scopes** or read-only parallel investigations.

Examples:

- independent read-only research dimensions;
- test authoring and visual review;
- disjoint packages with no overlapping generated files.

Parallelism is forbidden unless conflict scope is statically known or all but one participant are read-only.

## 21.5 COMPETITIVE_CELL

Two or more genuinely independent workers produce competing recommendations/solutions for critical work.

Required for configured high-risk/high-reversal-cost archetypes.

The final decision remains evidence- and authority-bound; majority vote is not authority.

---

# 22. Independence

“Different session” is not sufficient independence.

Each worker route must carry:

```text
provider_family
model_lineage_id
harness_family
toolchain_family
context_origin
independence_class
```

For required independent review, policy may require:

```text
reviewer.worker_identity_hash != builder.worker_identity_hash
AND
independence_score >= threshold
```

For critical competitive cells, prefer differences in:

```text
provider family
model lineage
harness family
```

where qualified options exist.

If strong independence is required but unavailable:

```text
INDEPENDENCE_REQUIREMENT_BLOCKED
```

Do not falsely label same-lineage replicas as strong independent evidence.

---

# 23. Role-specific context projection

Do not create another master Knowledge Capsule.

Current VEKL 2.2 already produces:

```text
CANON
UNIT
IMPLEMENTATION
PRODUCT_EXPERIENCE
INTEGRATION
VERIFICATION
RESOURCE_MANIFEST
```

Rev 2 introduces:

```text
RoleContextProjection
```

A projection references the current immutable capsule/KRT evidence.

```ts
export interface RoleContextProjection {
  schemaVersion: 1;
  taskId: string;
  role: WorkerRole;

  unitLineageId: string;
  unitRevisionHash: string;

  parentKnowledgeResolutionTraceHash: string;
  activationManifestHash: string;

  includedRefs: {
    ref: string;
    contentHash: string;
    reason: string;
    priority: "P0"|"P1"|"P2"|"P3";
  }[];

  omittedRefs: {
    ref: string;
    reason: string;
  }[];

  targetTokens: number;
  observedTokens: number;

  projectionPolicyHash: string;
  projectionHash: string;
}
```

Worker roles may include:

```text
ARCHITECT
BUILDER
FRONTEND_BUILDER
DESIGNER
TESTER
SECURITY_REVIEWER
VISUAL_REVIEWER
DONOR_REVIEWER
MIGRATION_REVIEWER
INTEGRATOR
```

---

# 24. Context priority

Priority classes:

```text
P0 — mandatory authority/safety
P1 — task-critical implementation/contract context
P2 — useful supporting context
P3 — optional reference/examples
```

P0 examples:

- Project Truth slice;
- applicable locked Decisions;
- security authority;
- money/authorization constraints;
- Unit identity/revision;
- FRC contract fingerprints;
- explicit owner instruction relevant to scope;
- write/tool constraints.

P0 content is never dropped for fit.

---

# 25. Correct context budget algorithm

The original “rank all items then pack” algorithm is superseded.

Correct process:

```text
1. collect all P0
2. verify P0 integrity
3. compute P0 token floor
4. if P0 exceeds worker safe context:
       worker is ineligible
       or task must be re-partitioned
5. reserve response/tool headroom
6. rank P1
7. add P1 until target
8. rank/add P2
9. add P3 only if remaining capacity is useful
10. persist all omissions and reasons
```

Never summarize away an authority requirement merely to fit a smaller model.

Failure state:

```text
CONTEXT_BUDGET_UNSATISFIABLE
```

---

# 26. Stable prompt prefix

Where provider caching supports it, keep a stable, content-hashed system prefix for:

- DIAL authority hierarchy;
- no-silent-thinning;
- worker role boundary;
- evidence/acceptance rules;
- tool safety;
- provider non-authority.

Task-specific context follows after the stable prefix.

The cacheable prefix hash must be persisted in the execution receipt when materially relevant to token accounting.

---

# 27. Execution blackboard

Durable task coordination belongs under `$DIAL_CONTROL_HOME/execution/tasks`.

The blackboard stores typed artifacts, not unconstrained agent transcripts.

Suggested artifact classes:

```text
ARCHITECTURE_DECISION_CANDIDATE
DESIGN_CANDIDATE_MANIFEST
ACCEPTED_DESIGN_MANIFEST
IMPLEMENTATION_PATCH_MANIFEST
TEST_RESULT_ARTIFACT
VISUAL_EVIDENCE_ARTIFACT
SECURITY_FINDING_ARTIFACT
DONOR_TRANSFORMATION_ARTIFACT
MIGRATION_EVIDENCE_ARTIFACT
REVIEW_FINDING_ARTIFACT
INTEGRATION_DECISION_ARTIFACT
COMPUTE_SETTLEMENT_ARTIFACT
```

Each artifact must carry:

```text
artifact_id
artifact_type
task_id
worker_identity_hash
role
input_envelope_hash
content_hash
created_at
authority = NON_AUTHORITATIVE_WORKER_ARTIFACT or VERIFIED_EVIDENCE as appropriate
```

---

# 28. Worktree isolation

Every repository-writing worker receives a dedicated worktree or an equivalent isolated write surface.

Workers never write directly to protected `master`.

Each worktree binds to:

```text
task_id
worker_id
base_commit
lease_id
fencing_token
allowed_paths
denied_paths
created_at
expires_at
```

---

# 29. Repository-wide write leases

The original task-local overlap check is forbidden.

Write ownership must be enforced repository-wide.

A lease conflicts when:

```text
same repository
AND active lease
AND overlapping canonical path set
AND different current fencing ownership
```

regardless of task ID.

Recommended lease:

```ts
export interface WorktreeLease {
  schemaVersion: 1;
  leaseId: string;
  repositoryId: string;
  taskId: string;
  workerId: string;
  worktreePath: string;
  baseCommit: string;

  writePaths: string[];
  deniedPaths: string[];

  fencingToken: number;
  state: "ACTIVE"|"REVOKED"|"EXPIRED"|"RELEASED";

  issuedAt: string;
  expiresAt: string;
}
```

Path overlap must use normalized repository-relative path semantics and understand:

- exact files;
- directories;
- globs;
- generated shared files;
- lockfiles;
- manifests;
- registries.

---

# 30. Fencing

Fencing protects both **write time** and **integration time**.

Worker environment:

```text
DIAL_PACKET_ID
DIAL_TASK_ID
DIAL_WORKER_ID
DIAL_WORKTREE_LEASE_ID
DIAL_FENCING_TOKEN
DIAL_UNIT_LINEAGE_ID
DIAL_UNIT_REVISION_HASH
DIAL_EXECUTION_ENVELOPE_HASH
```

At consequential write/tool use:

```text
lease exists
AND lease ACTIVE
AND fencing token current
AND envelope current
AND knowledge binding current
AND path allowed
```

At integration:

```text
result fencing token == current authoritative token
AND envelope still current
AND Unit revision still current
AND base still admissible
AND owner steer has not superseded task
```

A stale worker result may remain for forensic evidence but is `NON_ADMISSIBLE`.

---

# 31. Lease revocation

On task supersession, owner steer, knowledge invalidation, conflict discovery or worker failure:

```text
envelope → SUPERSEDED
lease → REVOKED
worker → CANCEL_REQUESTED
late writes → denied
late result → NON_ADMISSIBLE
```

Lease revocation must be durable and atomic before replacement lease issuance for overlapping paths.

---

# 32. Worker result contract

```ts
export interface WorkerResult {
  schemaVersion: 1;

  taskId: string;
  workerId: string;
  workerIdentityHash: string;
  role: WorkerRole;

  envelopeHash: string;
  unitRevisionHash: string;

  leaseId?: string;
  fencingToken?: number;

  resultState:
    | "COMPLETED"
    | "FAILED"
    | "BLOCKED"
    | "CANCELLED"
    | "SUPERSEDED";

  summary: string;

  artifactRefs: string[];
  changedPaths: string[];
  testRefs: string[];
  evidenceRefs: string[];

  confidence?: number;

  usage: {
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    toolCalls?: number;
    wallTimeMs?: number;
  };

  resultHash: string;
}
```

Confidence is routing metadata only.

It may trigger review/escalation.

It cannot clear acceptance.

---

# 33. Deterministic verification before AI review

Always perform cheap deterministic verification first where applicable:

```text
typecheck
lint
schema checks
unit tests
integration tests
security policy
SAST/SCA
manifest integrity
migration dry run
contract checks
route checks
visual snapshot/diff
accessibility automation
build
package integrity
changed-tree gate inheritance
```

Only unresolved semantic risk should consume a reviewer model.

Examples:

```text
deterministic fail
→ no reviewer required yet
→ targeted repair

deterministic green + architectural ambiguity
→ reviewer

deterministic green + critical security boundary
→ mandatory independent security reviewer
```

---

# 34. Reviewer projection

Reviewer context should emphasize:

```text
Unit authority
task goal
claimed changes
diff
verification evidence
known risk/eventualities
acceptance contract
specific review question
```

It should omit unrelated implementation narrative and long worker chat history.

Reviewers receive artifacts and evidence, not the builder's entire transcript.

---

# 35. Donor authority model

DIAL already has canonical donor transformation and import standards.

Rev 2 must compile a machine-readable **Donor Applicability Registry** from existing donor authorities rather than create an independent donor truth source.

The registry is:

```text
DERIVED_ENFORCEMENT_PROJECTION
```

not:

```text
PROJECT_TRUTH
```

---

# 36. Donor Applicability Record

Recommended projection:

```ts
export interface DonorApplicabilityRecord {
  schemaVersion: 1;

  donorId: string;

  authorityRefs: string[];
  applicableFeatureIds: string[];

  upstream: {
    repository?: string;
    canonicalUrl?: string;
    pinnedRevision?: string;
    release?: string;
  };

  license: {
    status: "UNRESOLVED"|"VERIFIED"|"NOT_REQUIRED";
    licenseId?: string;
    licenseFileHash?: string;
    attributionRefs?: string[];
  };

  adoptionMode: string;

  sourceSlices: string[];

  transformation: {
    preserve: string[];
    adapt: string[];
    replace: string[];
    enhance: string[];
    forbid: string[];
  };

  sourceOfTruthExclusions: string[];

  sanitizationPolicyId: string;
  egressPolicyId: string;
  upgradePolicy: string;

  authority: "DERIVED_ENFORCEMENT_PROJECTION";
  projectionHash: string;
}
```

---

# 37. Donor applicability compiler

Inputs may include:

- canonical donor assimilation registry;
- donor import/assimilation gate;
- donor UX transformation standard;
- division donor customization playbooks;
- Feature donor refs;
- FRC donor refs;
- license evidence;
- pin evidence.

Output:

```text
agent-system/registries/DONOR_APPLICABILITY_REGISTRY.json
```

The current empty top-level donor registry is not sufficient as rich donor authority.

The compiler should fail if a referenced donor cannot be resolved to an authorized donor record when material donor import is attempted.

---

# 38. Donor design modes

Recommended modes:

```text
DONOR_PRESERVE
DONOR_ADAPT
LOCKED_ENHANCE
REGRESSION_REPAIR
NEW_DIAL_DESIGN
NO_DESIGN_PROVIDER_REQUIRED
```

Semantics:

### DONOR_PRESERVE
Maintain donor task order/interaction structure where explicitly approved, while replacing DIAL-forbidden authorities and applying DIAL design.

### DONOR_ADAPT
Preserve useful donor mental model/workflow but substantially transform composition, branding, hierarchy and implementation into DIAL.

### LOCKED_ENHANCE
Preserve an accepted DIAL baseline and improve only explicitly open dimensions.

### REGRESSION_REPAIR
Restore an already-approved visual/interaction baseline; invention is minimized.

### NEW_DIAL_DESIGN
No donor is authoritative for composition; provider may generate candidates under DIAL design authority.

---

# 39. Donor Transformation Contract

Before any donor-derived implementation:

```ts
export interface DonorTransformationContract {
  donorId: string;
  featureId: string;
  unitLineageId: string;
  unitRevisionHash: string;

  donorApplicabilityHash: string;

  preserve: string[];
  adapt: string[];
  replace: string[];
  enhance: string[];
  forbid: string[];

  boundaryReplacement: {
    auth: string;
    persistence: string;
    money: string;
    workflow: string;
    evidence: string;
    events: string;
    notifications: string;
    search: string;
    providerAuthority: string;
  };

  allowedSourceSlices: string[];

  designMode: string;
  designAuthorityHash: string;

  requiredEvidence: string[];
  contractHash: string;
}
```

No donor import starts without this contract when donor handling is material.

---

# 40. Donor slice compiler

Never send or import the whole donor repo merely because it is convenient.

The slice compiler should resolve:

```text
exact source paths
dependency closure
required assets
relevant tests
design semantics
license/notices
```

and explicitly exclude unrelated:

```text
auth
payments
analytics
backend authority
secrets
environment files
customer data
provider credentials
irrelevant business logic
```

unless those files are needed solely to understand and explicitly replace a boundary.

---

# 41. Donor sanitization and egress classification

Sanitization is not enough.

Before external provider use:

```text
donor slice
↓
secret scan
↓
data classification
↓
provider-specific egress policy
↓
allowed sanitized package
```

Data classes:

```text
PUBLIC
INTERNAL_SAFE_FOR_APPROVED_PROVIDER
RESTRICTED
SECRET
```

Default:

```text
SECRET → DENY
RESTRICTED → DENY
INTERNAL_SAFE_FOR_APPROVED_PROVIDER → policy-gated
PUBLIC → allowed
```

Sanitization removes:

- secrets;
- credentials;
- tokens;
- personal data;
- customer/payment data;
- production URLs not needed;
- analytics IDs;
- private supplier terms;
- internal comments that disclose sensitive plans;
- hidden environment config.

---

# 42. Canonical DIAL design authority

Do not create `DESIGN.md` as a new design truth.

Current DIAL design authorities remain canonical, including the applicable Product Experience authority and any locked design baseline.

The design provider receives a **derived design projection**.

Conceptual flow:

```text
current DIAL design authority
+ applicable Product Experience knowledge
+ locked design evidence if any
+ donor transformation contract if any
↓
DesignAuthorityProjection
↓
provider-specific DESIGN.md / prompt / token projection
```

---

# 43. Design Authority Projection

```ts
export interface DesignAuthorityProjection {
  schemaVersion: 1;

  unitLineageId: string;
  unitRevisionHash: string;

  authorityRefs: string[];
  productExperienceKnowledgeHash: string;

  identity: {
    branchId?: string;
    appFamily?: string;
    designMode: string;
  };

  visualRules: {
    atmosphere: string[];
    typography: string[];
    colorRoles: string[];
    layout: string[];
    componentRules: string[];
    motion: string[];
    media: string[];
    accessibility: string[];
  };

  prohibitedPatterns: string[];

  lockedBaseline?: {
    baselineId: string;
    baselineHash: string;
    openDimensions: string[];
    closedDimensions: string[];
  };

  projectionHash: string;
  authority: "DERIVED_DESIGN_PROJECTION";
}
```

---

# 44. DESIGN.md compiler

Where Stitch or another provider benefits from a `DESIGN.md`-style artifact, compile it from the Design Authority Projection.

`DESIGN.md` must carry:

```text
Generated from DIAL canonical authority
Do not edit as authority
Projection hash
Unit lineage/revision
Applicable design authority refs
```

No reverse-write from provider output into DIAL authority.

---

# 45. Provider-neutral frontend strategy selector

For frontend work, strategy selection must compare eligible methods.

Possible strategies:

```text
DIRECT_DIAL_IMPLEMENTATION
DIRECT_DONOR_PORT_AND_TRANSFORM
STITCH_CODE_TO_DESIGN_THEN_BUILD
STITCH_NEW_DESIGN_THEN_BUILD
OTHER_APPROVED_DESIGN_PROVIDER
LOCKED_BASELINE_REPAIR
```

Selection depends on:

```text
task archetype
design mode
donor applicability
current accepted baseline
provider capability
provider health
provider egress policy
estimated token/cost budget
need for design exploration
need for deterministic preservation
expected verification quality
```

Stitch is eligible, not mandatory.

---

# 46. Stitch provider boundary

Stitch must be behind an adapter.

Conceptual interface:

```ts
export interface DesignProviderAdapter {
  providerId: string;

  health(): Promise<ProviderHealth>;

  transformDonor?(input: DonorDesignInput): Promise<RawProviderArtifact>;
  generateDesign?(input: NewDesignInput): Promise<RawProviderArtifact>;
  critique?(input: DesignCritiqueInput): Promise<RawProviderArtifact>;
}
```

Provider-specific credentials, project IDs, API details and transport must not leak into canonical design logic.

---

# 47. Secret injection

Credentials must be injected at provider execution time.

Never:

- store provider secrets in Project Truth;
- include them in Task Envelopes;
- include them in Execution Receipts;
- send them to workers unnecessarily;
- write them into generated frontend code;
- log raw tokens.

Receipt/attempt evidence stores only:

```text
provider credential profile id
provider account scope id
redacted auth method
request hash
response hash
```

---

# 48. Stitch/provider project mapping

Map provider projects to DIAL development scope using opaque IDs.

Do not make the provider project itself authoritative.

Provider state can be recreated from:

```text
Task Envelope
Design Authority Projection
donor slice
provider adapter
execution evidence
```

---

# 49. External design-output quarantine

All external generated design output is untrusted data until admitted.

Pipeline:

```text
raw provider response
↓
content hash
↓
size/type validation
↓
archive traversal defense
↓
secret scan
↓
HTML/CSS/SVG/JS static scan
↓
external-network/reference scan
↓
dependency scan
↓
design authority validation
↓
candidate manifest
↓
visual/functional acceptance
```

Scan at minimum for:

```text
<script>
inline event handlers
javascript: URLs
eval / new Function
dynamic import()
service worker registration
WebSocket/EventSource
iframe/object/embed
form action targets
meta refresh
base href
CSS @import
CSS url()
srcset
SVG scripts/events
SVG external hrefs
remote fonts
remote assets
data: payloads
manifest/service-worker links
source maps
package/dependency additions
unexpected network endpoints
```

---

# 50. Design Candidate Manifest

```ts
export interface DesignCandidateManifest {
  schemaVersion: 1;

  candidateId: string;
  taskId: string;

  providerId: string;
  providerRouteHash: string;

  unitLineageId: string;
  unitRevisionHash: string;

  designAuthorityProjectionHash: string;
  donorTransformationContractHash?: string;

  rawArtifactHash: string;
  quarantineEvidenceHash: string;

  screenRefs: string[];
  componentRefs: string[];

  visualEvidenceRefs: string[];

  securityState: "PASS"|"FAIL"|"REVIEW_REQUIRED";
  authorityState: "CONFORMS"|"DRIFT"|"REVIEW_REQUIRED";

  candidateHash: string;

  authority: "NON_AUTHORITATIVE_DESIGN_CANDIDATE";
}
```

---

# 51. Locked-design enhancement

Do not use an undefined `maxStructuralChangePercent`.

For locked designs, represent explicit dimensions.

Example:

```json
{
  "closedDimensions": [
    "primary navigation",
    "information hierarchy",
    "core hero composition",
    "customer task order"
  ],
  "openDimensions": [
    "spacing refinement",
    "microinteraction quality",
    "responsive adaptation",
    "accessibility improvements",
    "minor typography calibration"
  ]
}
```

If a deterministic structural-distance metric is later introduced, its exact measurement definition must be versioned and tested before numerical thresholds are authoritative.

---

# 52. Design admission

A design candidate is admitted only if:

```text
quarantine PASS
design authority conforms
required donor semantics preserved
forbidden donor authority removed
no fake implementation affordances
required UI states represented
accessibility plan credible
responsive plan credible
locked baseline respected
```

Admission creates:

```text
AcceptedDesignManifest
```

This means only:

> accepted design input for implementation.

It does **not** mean:

- screen implemented;
- feature green;
- Unit complete.

---

# 53. Accepted Design Manifest

```ts
export interface AcceptedDesignManifest {
  schemaVersion: 1;

  acceptedDesignId: string;
  candidateId: string;
  candidateHash: string;

  unitLineageId: string;
  unitRevisionHash: string;

  designAuthorityProjectionHash: string;
  donorTransformationContractHash?: string;

  acceptedScreenRefs: string[];
  requiredImplementationStates: string[];

  admissionEvidenceRefs: string[];
  acceptedAt: string;

  manifestHash: string;
}
```

---

# 54. Design → builder handoff

Builder receives:

```text
Task Execution Envelope
BUILDER RoleContextProjection
AcceptedDesignManifest
donor transformation contract if applicable
implementation contracts
allowed paths
tool grants
lease/fencing token
```

The builder does not need the Stitch conversation.

---

# 55. Frontend verification loop

```text
accepted design
↓
implementation
↓
build/typecheck
↓
functional Playwright
↓
required viewport captures
↓
visual diff/oracle
↓
accessibility
↓
interaction-state verification
↓
security checks
↓
Product Experience hard gate
↓
Product Experience qualitative gate
↓
targeted review if required
```

The existing Unit completion gate remains final.

---

# 56. Visual evidence

Visual evidence should be content-addressed and identify:

```text
screen/journey
viewport
state
theme
locale if relevant
data fixture
render commit/tree
capture hash
visual oracle/rubric
comparison baseline
```

No generic “looks good” evidence.

---

# 57. Generic AI UI drift

Do not create a competing acceptance authority.

Extend the existing Product Experience gate/evidence to detect:

- fake data;
- fake metrics;
- placeholder helper text;
- dead controls;
- decorative dashboards unrelated to customer/operator tasks;
- arbitrary gradients;
- homogeneous rounded-card filler;
- generic CTA copy;
- meaningless icon grids;
- excessive explanatory text on product screens;
- missing states;
- donor collage appearance;
- visible raw technical IDs where human-readable refs are required.

AI/UI drift evidence feeds the existing Product Experience hard and qualitative gates.

---

# 58. Execution artifact collaboration

Workers exchange typed artifacts.

Do not replay full transcripts across agents.

Preferred pattern:

```text
Architect
→ ArchitectureDecisionCandidate

Designer
→ DesignCandidateManifest

Builder
→ ImplementationPatchManifest

Tester
→ TestResultArtifact

Security Reviewer
→ SecurityFindingArtifact

Visual Reviewer
→ VisualEvidenceArtifact

Integrator
→ IntegrationDecisionArtifact
```

Each next role receives only required artifacts plus its role projection.

---

# 59. Worker tool minimization

Role policy example:

```text
DESIGNER
  read-files
  read-design-authority
  provider-design capability
  no repo write by default

BUILDER
  repository read/write
  build/test runner
  dependency install only when explicitly granted
  bounded network

FRONTEND_BUILDER
  repository read/write
  Playwright
  build/test
  bounded browser

SECURITY_REVIEWER
  git read
  diff read
  SAST/SCA read
  test read
  no write by default

INTEGRATOR
  git read
  candidate apply in isolated integration worktree
  verification
  no direct protected-branch push
```

Do not expose all MCPs/plugins/tools to every worker.

---

# 60. Extend the existing PreToolUse guard

The current consequential-action guard should be extended, not replaced.

For a material worker tool call, validate:

```text
current packet activation
current knowledge binding
current Task Execution Envelope
role tool grant
allowed path
denied path
network allowlist
active lease if writing
current fencing token
compute reservation
task not superseded
```

Prefer structured/argv-level mediation over ever-growing shell regexes where practical.

---

# 61. Network authorization

Workers need explicit network classes.

Example:

```text
NONE
PACKAGE_REGISTRY_ONLY
APPROVED_DOCS_ONLY
PROVIDER_ENDPOINTS_ONLY
BOUNDED_PUBLIC_RESEARCH
FULL_PUBLIC_RESEARCH
```

High-risk tasks should default narrower.

Network access must not implicitly permit secret egress.

---

# 62. Owner steer

Existing owner channels remain first-class:

```text
Claude
Codex
WhatsApp
other authenticated owner adapter
↓
one typed DIAL Oracle owner gateway
```

Owner steer categories:

```text
INFORMATIONAL
PRIORITY_UPDATE
TASK_SCOPE_MUTATION
PROJECT_TRUTH_CANDIDATE
APPROVAL
REJECTION
PAUSE
EMERGENCY_STOP
```

A material scope change triggers deterministic invalidation.

---

# 63. Owner-steer invalidation cascade

```text
owner steer
↓
does it affect current task/Unit/authority?
        ↓ yes
mark current envelope SUPERSEDED
↓
revoke all affected write leases
↓
increment fencing generations
↓
request active worker cancellation
↓
reject late worker results
↓
invalidate VEKL knowledge if underlying authority changed
↓
re-resolve Unit map/KRT as necessary
↓
re-triage
↓
new Task Execution Envelope
↓
new HCX selection
```

No queue ordering may delay the authority effect of a current owner steer merely because autonomous work was already in progress.

The manager may choose safe atomic completion where the steer does not materially conflict, but that decision must be evidence-based and immediately acknowledged to the owner.

---

# 64. Envelope invalidation causes

At minimum:

```text
OWNER_STEER
PROJECT_TRUTH_CHANGED
LOCKED_DECISION_CHANGED
UNIT_REVISION_CHANGED
FRC_CHANGED
STACK_FINGERPRINT_CHANGED
KNOWLEDGE_ROUTE_POLICY_CHANGED
GRAPH_REVISION_CHANGED
ACTIVATION_INVALIDATED
PROVIDER_POLICY_CHANGED
SECURITY_POLICY_CHANGED
WRITE_SCOPE_CHANGED
COMPUTE_POLICY_CHANGED_MATERIALLY
```

---

# 65. Development Execution Receipt

The Development Execution Receipt is the highest-value new evidence object in Rev 2.

It answers:

> Why was this execution topology selected, which workers were eligible, what did each worker see and have permission to do, what did they produce, what did deterministic verification prove, and why was the result admitted?

It does **not** replace the KRT.

---

# 66. KRT vs Execution Receipt

```text
KnowledgeResolutionTrace
=
why this knowledge reached the worker

DevelopmentExecutionReceipt
=
why this execution strategy and output were accepted
```

Chain:

```text
KRT
↓
Task Execution Envelope
↓
Role Context Projection
↓
Worker execution
↓
Verification/review
↓
Development Execution Receipt
```

---

# 67. Development Execution Receipt schema

```ts
export interface DevelopmentExecutionReceipt {
  schemaVersion: 1;
  receiptVersion: string;

  receiptId: string;

  task: {
    taskId: string;
    packetId: string;
    missionId?: string;
    envelopeHash: string;
    triageResultHash: string;
    triagePolicyHash: string;
  };

  unit: {
    unitLineageId: string;
    unitRevisionHash: string;
    unitMapHash: string;
  };

  authority: {
    projectTruthHash: string;
    knowledgeResolutionTraceHash: string;
    activationManifestHash: string;
    ownerAuthorityRef?: string;
  };

  routing: {
    hcxRegistryHash: string;
    healthSnapshotHash: string;
    eligibleCandidates: string[];
    excludedCandidates: {
      workerIdentityHash: string;
      reasonCodes: string[];
    }[];
    selectedWorkers: {
      workerIdentityHash: string;
      role: string;
      routeReason: string;
      empiricalEvidenceRef?: string;
    }[];
  };

  compute: {
    budgetHash: string;
    reservationIds: string[];
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number;
    toolCalls?: number;
    wallTimeMs?: number;
  };

  topology: {
    topology: string;
    topologyPolicyHash: string;
    independenceEvidence?: string;
  };

  context: {
    roleProjectionHashes: Record<string,string>;
  };

  leases: {
    leaseId: string;
    workerId: string;
    fencingToken: number;
    writePaths: string[];
    finalState: string;
  }[];

  results: {
    workerId: string;
    resultHash: string;
    artifactRefs: string[];
  }[];

  verification: {
    deterministicEvidenceRefs: string[];
    reviewEvidenceRefs: string[];
    productExperienceEvidenceRef?: string;
    securityEvidenceRefs: string[];
    downstreamCoherenceHash?: string;
  };

  gates: {
    id: string;
    status: "PASS"|"FAIL"|"OPEN";
    evidenceRefs: string[];
  }[];

  integration: {
    admitted: boolean;
    admittedTree?: string;
    admittedCommit?: string;
    rejectionReason?: string;
  };

  createdAt: string;
  receiptHash: string;
}
```

Receipt must be immutable/content-addressed.

---

# 68. Receipt admission

Do not emit a “successful” receipt merely because a worker finished.

Receipt state should distinguish:

```text
EXECUTION_COMPLETED
VERIFICATION_FAILED
REVIEW_BLOCKED
SUPERSEDED
INTEGRATION_REJECTED
INTEGRATED
```

Only `INTEGRATED` may contain an admitted commit/tree.

---

# 69. Quality-per-token objective

Optimize:

```text
VerifiedAcceptedQuality / TotalInferenceCost
```

not tokens alone.

A capable worker using more tokens once may be more efficient than a cheaper worker requiring several repair cycles.

Quality metrics must include escaped-defect/rework penalties so cheap-but-wrong workers do not dominate.

---

# 70. Empirical learning guardrails

Routing learning is process telemetry.

It cannot mutate:

- Project Truth;
- risk class;
- required gates;
- manager runtime;
- security policy;
- donor authority;
- provider egress rules.

Model performance outcomes must be tied to verified evidence.

Avoid model self-praise metrics.

---

# 71. Exploration policy

Exploration is allowed only among already-eligible routes.

Never use an exploratory route as the sole authoritative worker/reviewer for:

```text
money paths
authorization/RLS
clinical/Health
legal/compliance
production infrastructure
destructive migration
owner authority
critical security
```

unless the stable proven route remains responsible for authoritative execution/review.

Exploration may be:

```text
shadow read-only
second reviewer
non-admitted alternate candidate
low-risk task
```

---

# 72. A2A interoperability

A2A is deferred from the minimum production implementation.

Future mapping:

```text
DIAL Task Execution Envelope
↓
A2A adapter
↓
external task
↓
external artifact
↓
DIAL artifact normalizer
↓
normal DIAL admission
```

A2A remains transport.

DIAL Task Envelope, lease, fencing, KRT, verification and receipt remain authoritative.

---

# 73. Temporal

Temporal is also deferred.

DIAL already has a persistent Oracle mission controller and external orchestrator.

Do not run Temporal as a second orchestration authority.

If adopted later:

```text
existing DIAL orchestration interface
↓
Temporal implementation backend
```

with one controlled migration.

LLM/API/tool operations would be Temporal Activities; deterministic orchestration would be Workflow code.

Temporal adoption requires its own owner-authorized architecture decision, migration evidence and no-dual-authority proof.

---

# 74. Provider outage independence

No development provider may become required for DIAL runtime.

Failure behavior:

```text
Stitch unavailable
→ next eligible design strategy
→ or task waits

coding worker unavailable
→ next eligible HCX route

HCX unavailable
→ bounded locked safe worker policy if task permits
→ otherwise WAITING_RUNTIME

multi-harness disabled
→ safe smaller topology only if all mandatory review invariants still hold

required competitive review unavailable
→ BLOCKED_CAPABILITY
```

Production customer/payment/job/catalogue/delivery/Health flows remain unaffected.

---

# 75. Kill switches

Recommended:

```env
DIAL_DEV_HCX_ENABLED=false
DIAL_DEV_MULTI_HARNESS_ENABLED=false
DIAL_STITCH_ENABLED=false
DIAL_STITCH_LIVE_TESTS_ENABLED=false
DIAL_EMPIRICAL_ROUTING_ENABLED=false
DIAL_COMPETITIVE_CELL_ENABLED=false
DIAL_PARALLEL_CELL_ENABLED=false
```

A kill switch must never cause silent safety downgrade.

Examples:

```text
competitive disabled + task requires competition
→ BLOCKED_CAPABILITY

Stitch disabled
→ alternate eligible design strategy
→ not "skip design"

empirical routing disabled
→ deterministic static preference among hard-eligible workers
```

---

# 76. Failure semantics

Normative states:

```text
WORKER_UNAVAILABLE
→ next eligible worker

WORKER_IDENTITY_UNPROVEN
→ ineligible

QUOTA_EXHAUSTED
→ next eligible within policy / WAITING_RUNTIME

CONTEXT_BUDGET_UNSATISFIABLE
→ larger-context eligible worker / repartition / block

REFUSED_STALE_KNOWLEDGE
→ VEKL re-resolution

REFUSED_STALE_EXECUTION_ENVELOPE
→ supersede/rebuild envelope

WRITE_LEASE_CONFLICT
→ serialize or repartition

FENCING_TOKEN_STALE
→ deny write/integration

INDEPENDENCE_REQUIREMENT_BLOCKED
→ block mandatory independent topology

BUDGET_BLOCKED_REQUIRED_REVIEW
→ block, never downgrade

STITCH_UNAVAILABLE
→ alternate eligible design strategy

PROVIDER_OUTPUT_INVALID
→ quarantine/reject

DONOR_LICENSE_UNRESOLVED
→ block import

DONOR_SOR_LEAKAGE
→ reject candidate

MANDATORY_GATE_FAIL
→ targeted repair/escalation

PROJECT_TRUTH_CONFLICT
→ challenge/owner authority path

OWNER_STEER_SUPERSEDED
→ cancel/revoke/re-resolve
```

---

# 77. Observability

Per task:

```text
task_id
packet_id
unit_lineage_id
unit_revision_hash
envelope_hash
archetype
risk_class
topology
selected_workers
eligible_worker_count
excluded_worker_reason_counts
compute_budget
compute_reserved
input_tokens
output_tokens
cached_tokens
tool_calls
worker_duration
verification_duration
rework_rounds
gate_results
final_acceptance
receipt_hash
```

Per worker identity:

```text
qualification state
health
quota
first-pass acceptance
final acceptance
escaped defect rate
review overturn rate
rework
median/p95 tokens
median/p95 latency
timeout rate
provider error rate
task-archetype distribution
sample count
confidence interval/posterior confidence
```

Per execution fabric:

```text
SOLO share
WORKER_VERIFIER share
PIPELINE share
PARALLEL share
COMPETITIVE share
average workers/task
context duplication reduction
lease conflicts
stale-result rejection
fencing denials
owner-steer cancellations
budget blocks
```

Per design provider:

```text
candidate count
candidate acceptance
quarantine failures
design-authority failures
donor leakage failures
post-implementation visual rework
tokens/candidate
accepted quality/cost
```

---

# 78. Security requirements

At minimum:

1. no provider secret in source or receipts;
2. no worker direct protected-branch push;
3. no worker authority over Project Truth;
4. no external provider raw access to restricted DIAL data;
5. no design output execution before quarantine;
6. no unscanned imported donor package;
7. no donor auth/payment/storage/workflow SoR leakage;
8. no multi-writer path overlap;
9. no stale fencing integration;
10. no task without current VEKL binding;
11. no role with unbounded MCP/tool surface;
12. no network access beyond task grant;
13. no hidden generated dependency addition;
14. no worker result accepted after owner-steer supersession;
15. no receipt containing secret values.

---

# 79. Recommended policy/Semgrep rules

Suggested IDs:

```text
dial.no-stitch-runtime-import
dial.no-stitch-key-client-bundle
dial.no-external-tool-project-truth-write
dial.no-donor-payment-authority
dial.no-donor-auth-authority
dial.no-unvalidated-provider-html-render
dial.no-worker-direct-master-push
dial.no-task-without-current-execution-envelope
dial.no-harness-secret-in-receipt
dial.no-multi-writer-overlap
dial.no-write-without-fencing-token
dial.no-integration-with-stale-fencing-token
dial.no-required-review-downgrade
dial.no-role-unbounded-tools
dial.no-provider-output-direct-exec
dial.no-design-projection-as-authority
```

---

# 80. CI additions

Required CI checks should include:

```text
task-archetype-registry schema
harness-capability-registry schema
hard-eligibility deterministic test
routing input-order determinism
topology precedence matrix
critical topology downgrade prevention
compute reservation accounting
mandatory review budget blocking
role projection reconstruction
P0 context non-drop test
worktree lease overlap tests
cross-task overlap tests
fencing stale-write tests
fencing stale-integration tests
owner-steer supersession tests
donor applicability compiler tests
donor license gate tests
donor SoR leakage tests
design projection directionality tests
provider quarantine security corpus
AcceptedDesignManifest tests
execution receipt reconstruction
receipt secret scan
kill-switch safe-degradation tests
provider outage tests
```

---

# 81. Architecture Green criteria relationship

The existing VEKL 2.2 **30 Architecture Green criteria remain mandatory and unchanged**.

Rev 2 adds an execution-fabric extension gate.

No execution-fabric `GREEN` may be claimed if VEKL 2.2 is not currently green.

---

# 82. Additional Execution Fabric Green criteria

The extension is green only when all of the following pass:

### EF-01 Worker-only HCX
HCX cannot select or replace DIAL manager runtime.

### EF-02 Stable Unit identity
Task decomposition does not alter Unit lineage.

### EF-03 Deterministic triage
Non-ambiguous tasks classify without LLM dependence.

### EF-04 Risk floor
Semantic adjudication cannot reduce deterministic risk floor.

### EF-05 Hard eligibility first
Empirical routing sees only hard-eligible candidates.

### EF-06 P0 context guarantee
Mandatory authority context cannot be omitted to fit a worker.

### EF-07 Role projection provenance
Every role projection reconstructs from current KRT/capsule evidence.

### EF-08 Current Task Envelope
Every material worker has a valid current Task Execution Envelope.

### EF-09 Repository-wide lease
Every writer holds a non-conflicting repository-wide path lease.

### EF-10 Consequential fencing
Every material write validates current fencing token.

### EF-11 Integration fencing
Stale fencing token results cannot be integrated.

### EF-12 Owner steer revocation
Relevant owner steer supersedes envelopes and revokes leases.

### EF-13 Required topology cannot degrade
Budget/kill switches cannot weaken mandatory review/competition.

### EF-14 Genuine independence
Mandatory independent review proves configured independence.

### EF-15 Transactional compute
Reservations reconcile to actual usage and unused capacity is released.

### EF-16 Donor projection
Donor applicability derives from canonical DIAL donor authority.

### EF-17 Provider egress classification
External provider inputs pass deterministic data classification.

### EF-18 Design provider non-authority
Stitch/other providers create candidates only.

### EF-19 Provider quarantine
Generated output cannot execute before admission.

### EF-20 Execution Receipt reconstruction
Receipt reconstructs routing, budget, context, writes, evidence and admission.

### EF-21 Runtime independence
Provider outage cannot break DIAL production runtime.

### EF-22 No second orchestration truth
Blackboard/HCX/provider state does not become Project Truth or mission authority.

### EF-23 Deterministic routing replay
Same eligible snapshot/policy/performance input yields same selected route absent explicit exploration mode.

### EF-24 Exploration containment
Exploration never becomes sole high-risk authority.

### EF-25 Product Experience continuity
UI work still requires existing Product Experience hard/qualitative completion evidence.

---

# 83. Authority hygiene prerequisite

Before owner adoption of a new architecture Decision, reconcile any current Decision-ID/document-reference drift discovered during implementation review.

In particular, the compact Project Truth must not reference a Decision ID for one architecture when the actual Decision Log uses that ID for a different locked decision.

This is a pre-adoption authority-hygiene task because HCX/VEKL bindings increasingly rely on exact Decision identifiers.

Do not silently renumber locked Decisions; use the existing supersession/revision mechanism and owner authority.

---

# 84. Proposed Project Truth additions after owner adoption

These are **proposed** and must not be treated as adopted merely because they appear in this document.

## M-EF-01 External harnesses are workers

External coding/design/review harnesses execute bounded tasks beneath Hermes/VEKL. They never become Project Truth, production SoR, sole durable memory or DIAL manager authority.

## M-EF-02 VEKL precedes material execution triage

Material execution routing requires a current VEKL Unit/KRT/binding, except narrowly permitted deterministic knowledge exemptions already governed by VEKL.

## M-EF-03 HCX is worker-only

HCX selects approved execution workers and providers after hard eligibility. It cannot alter the locked DIAL manager-runtime policy.

## M-EF-04 Minimum useful topology

DIAL uses the smallest topology that satisfies required risk/review confidence. Multi-worker cells are escalation mechanisms.

## M-EF-05 Compute cannot waive safety

Compute governance may block or reroute work but cannot waive mandatory security, independent review, Product Experience or other acceptance requirements.

## M-EF-06 Repository-wide write isolation

Every repository writer must hold a current path-scoped worktree lease and fencing token. Overlapping active write scopes across tasks are forbidden.

## M-EF-07 Stale results are non-admissible

Superseded envelopes or fencing tokens make late worker output non-admissible even when the worker itself reports success.

## M-EF-08 Governed donor transformation

Approved donors are handled through explicit preserve/adapt/replace/enhance/forbid semantics. Donor SoRs are never inherited.

## M-EF-09 DIAL design authority remains canonical

External design providers create candidates only. Provider-specific design artifacts are derived projections, not design authority.

## M-EF-10 Evidence-accounted execution

Every admitted material execution produces an immutable Development Execution Receipt linked to its KRT, Task Envelope, worker routes, compute, leases, verification and admitted tree/commit.

---

# 85. Feature-registry treatment

Do not automatically add the original proposed pseudo-features:

```text
DEV-HCX
VEKL-DEV-CAPSULE
VEKL-DETERMINISTIC-TRIAGE
DEV-EXECUTION-CELL
DESIGN-STITCH
DESIGN-DONOR-TRANSFORMATION
DEV-HARNESS-EMPIRICAL-ROUTER
DEV-COMPUTE-GOVERNOR
```

because DIAL Feature IDs are product/development completeness authorities and many VEKL capabilities are already implemented.

During adoption, decide whether these belong as:

```text
existing development-system Feature realization
supporting capabilities
architecture control IDs
new Feature IDs
```

using current Feature/FRC rules.

No duplicate Feature ID layer should be created for already-existing VEKL 2.2 behavior.

---

# 86. Rollout

## R0 — Reconciliation and authority hygiene

Work:

- adopt this Rev 2 as the replacement integration proposal;
- confirm current protected `master`;
- verify existing 30/30 VEKL architecture;
- reconcile Decision reference drift;
- map existing source files to Rev 2 responsibilities;
- classify v1.1 backlog items as satisfied/replaced/new/deferred.

Exit:

```text
one current Project Truth
one current VEKL
one current mission authority
zero duplicate implementation plans
```

## R1 — Deterministic triage + Task Execution Envelope

Implement:

- task archetype registry;
- deterministic classifier;
- risk-floor rules;
- ambiguity path;
- envelope schema;
- envelope hashing;
- envelope freshness checks.

Exit:

- replayable classification;
- stale envelope refusal;
- current VEKL binding required.

## R2 — Worker-only HCX

Implement:

- Harness Card v2;
- worker identity hashing;
- qualification evidence;
- current health/quota snapshots;
- hard eligibility;
- manager-runtime exclusion tests.

Exit:

- exact eligible/ineligible reason traces;
- HCX provably cannot route manager runtime.

## R3 — Compute governor

Implement:

- budget policy;
- reservations;
- hierarchical accounting;
- settlement;
- safety reserve;
- mandatory-review budget block.

Exit:

- no over-reservation;
- no silent topology downgrade.

## R4 — Role context projections

Implement:

- role policy;
- P0/P1/P2/P3 prioritization;
- KRT/capsule projection;
- context-floor eligibility;
- projection hashing.

Exit:

- exact reconstruction;
- mandatory P0 never dropped.

## R5 — Worktree leases and fencing

Implement:

- execution blackboard;
- worktree lifecycle;
- repository-wide normalized path leases;
- cross-task overlap prevention;
- fencing generations;
- PreToolUse integration;
- integration-time fencing.

Exit:

- stale writes denied;
- stale result cannot integrate;
- owner-steer revocation proven.

## R6 — Development Execution Receipt

Implement:

- receipt schema;
- immutable content addressing;
- KRT/envelope/routing/compute/lease/result/evidence links;
- receipt reconstruction test;
- secret redaction/scan.

Exit:

- full execution can be reconstructed without worker transcript.

## R7 — Donor applicability

Implement:

- donor authority compiler;
- donor applicability registry;
- license/pin gates;
- donor transformation contracts;
- donor slice compiler;
- egress classification.

Exit:

- material donor work cannot proceed from unresolved donor authority.

## R8 — Design provider substrate

Implement:

- Design Authority Projection;
- provider adapter;
- Stitch adapter;
- provider-neutral strategy selector;
- quarantine;
- Design Candidate Manifest;
- Accepted Design Manifest.

Exit:

- Stitch optional;
- no provider output executes directly;
- no reverse authority flow.

## R9 — First thin slice

Recommended: one Dial-a-Tech screen derived from the locked FixItNow donor relationship.

Acceptance:

1. current Unit resolved;
2. current KRT exists;
3. deterministic triage classifies donor adaptation;
4. donor applicability resolves exact allowed mode;
5. donor pin/license current;
6. minimal donor slice compiled;
7. egress classification passes;
8. Design Authority Projection compiled;
9. HCX compares eligible strategy routes;
10. Stitch is chosen only if it wins policy/evidence;
11. provider output quarantined;
12. candidate admission passes;
13. coding worker receives builder projection;
14. worker holds lease/fencing;
15. implementation passes functional/visual/accessibility/security gates;
16. Product Experience evidence passes;
17. donor SoR leakage review passes;
18. Execution Receipt reconstructs the entire decision path.

## R10 — Empirical routing

After sufficient accepted task evidence:

- posterior metrics;
- Pareto routing;
- quality-per-token;
- model/harness identity decay;
- deterministic tie-break.

No learning before clean evidence exists.

## R11 — Parallel cells

Enable only after:

- write-scope disjointness;
- cross-task overlap tests;
- worktree isolation;
- deterministic merge/integration sequence.

## R12 — Competitive cells

Enable only after:

- independence metadata;
- required review policy;
- conflict artifact schema;
- integrator evidence;
- compute reservation proof.

## Later — A2A

Only after a real cross-vendor interoperability need.

## Later — Temporal

Only after a separate decision that current durable orchestration should migrate to a Temporal backend.

---

# 87. Recommended first vertical slice: Dial a Tech / FixItNow

The first vertical slice should use a real donor relationship already required by DIAL rather than an artificial demo.

Suggested target:

```text
one high-value Dial a Tech customer/provider screen
derived from approved FixItNow donor behavior
transformed into DIAL design and DIAL contracts
```

The test should exercise both design routes where practical:

```text
Route A:
donor slice
→ direct DIAL transformation by coding/frontend worker

Route B:
donor slice
→ Stitch code-to-design/design adaptation
→ quarantine
→ AcceptedDesignManifest
→ separate builder
```

HCX selects based on actual eligibility/quality/cost evidence.

The goal is not to prove Stitch is best.

The goal is to prove DIAL can safely choose whether Stitch is useful.

---

# 88. Token-efficiency strategy

Primary savings:

1. VEKL compiles once and projects many.
2. Role projections reuse existing capsule hashes.
3. P0 authority is shared via stable hashed prefix where provider caching permits.
4. Full repo is not reread by every worker.
5. Donor slices are minimal.
6. Typed artifacts replace transcript replay.
7. Deterministic verification happens before model review.
8. SOLO is default.
9. Review is risk/evidence-triggered.
10. Exploration is bounded.
11. Provider-specific design is invoked only when capabilities justify it.
12. Compute reservations prevent runaway concurrent inference.
13. Empirical routing learns verified rework cost.
14. Stale work is killed before further expensive execution where possible.
15. Owner steer invalidates early rather than allowing doomed workers to finish.

---

# 89. Definition of done

This Rev 2 integration is complete only when DIAL can deterministically take a material development task and:

1. resolve its current VEKL Unit;
2. prove current KRT/binding;
3. classify task/risk deterministically;
4. create an immutable current Task Execution Envelope;
5. resolve required worker capabilities;
6. exclude ineligible workers with reason codes;
7. reserve compute;
8. choose the minimum required topology;
9. compile exact role context projections;
10. acquire non-conflicting repository-wide leases;
11. fence every writer;
12. execute workers through bounded tools/network;
13. exchange typed artifacts;
14. reject stale/superseded results;
15. use Stitch only when eligible/selected;
16. quarantine all external design output;
17. admit design candidates only through DIAL design authority;
18. implement accepted design through DIAL code/contracts;
19. run deterministic verification before targeted model review;
20. prove mandatory reviewer independence;
21. pass existing Product Experience/security/FRC/Unit completion gates;
22. settle compute usage;
23. create immutable Execution Receipt;
24. integrate only current fenced evidence;
25. safely survive provider outage;
26. immediately honor owner steer;
27. preserve all DIAL SoRs;
28. preserve existing VEKL 2.2 30/30 architecture;
29. avoid any second mission/Project Truth/design authority;
30. remain reconstructable without conversation-memory dependency.

---

# 90. Quantum implementation backlog

The v1.1 268-item backlog must not be copied mechanically. Items already satisfied by VEKL 2.2 should be linked to existing evidence and closed as `SATISFIED_BY_VEKL_2_2`.

The following backlog is the reconciled additive work.

## R0 — Authority/reconciliation

- **EF-001** Snapshot current protected master and verification state.
- **EF-002** Map every v1.1 subsystem to current DIAL module/registry.
- **EF-003** Produce v1.1 disposition registry.
- **EF-004** Reconcile Decision-ID reference drift.
- **EF-005** Confirm no duplicate `.dial` runtime state will be introduced.
- **EF-006** Confirm no duplicate `packages/vekl` implementation.
- **EF-007** Confirm current manager-runtime lock remains unchanged.
- **EF-008** Define owner adoption Decision proposal.
- **EF-009** Define Project Truth amendment proposal.
- **EF-010** Add architecture extension criteria without changing existing 30.

## R1 — Triage

- **EF-011** Add task archetype registry.
- **EF-012** Define deterministic money-path rules.
- **EF-013** Define authorization/RLS rules.
- **EF-014** Define architecture-change rules.
- **EF-015** Define infrastructure risk rules.
- **EF-016** Define migration rules.
- **EF-017** Define donor-adaptation rules.
- **EF-018** Define locked-design rules.
- **EF-019** Define visual regression rules.
- **EF-020** Define dependency-upgrade rules.
- **EF-021** Define security review rules.
- **EF-022** Define risk-floor rules.
- **EF-023** Define `AMBIGUOUS` semantic adjudication contract.
- **EF-024** Persist deterministic rules fired.
- **EF-025** Add input-order determinism tests.
- **EF-026** Add semantic adjudicator cannot lower risk test.

## R1 — Task Execution Envelope

- **EF-027** Add envelope schema.
- **EF-028** Bind Unit lineage/revision.
- **EF-029** Bind Unit map hash.
- **EF-030** Bind Project Truth hash.
- **EF-031** Bind locked Decision hashes.
- **EF-032** Bind contract fingerprints.
- **EF-033** Bind stack fingerprint.
- **EF-034** Bind graph generation/revision.
- **EF-035** Bind determinism envelope.
- **EF-036** Bind activation manifest.
- **EF-037** Bind KRT hash.
- **EF-038** Bind triage hash/policy.
- **EF-039** Bind tool/network grants.
- **EF-040** Bind compute budget.
- **EF-041** Bind owner authority when material.
- **EF-042** Implement envelope hash.
- **EF-043** Implement envelope lifecycle.
- **EF-044** Implement stale envelope refusal.
- **EF-045** Add integration-admission freshness check.

## R2 — HCX

- **EF-046** Create Harness Card v2 schema.
- **EF-047** Define worker identity hash.
- **EF-048** Define provider/model/harness/toolchain identity components.
- **EF-049** Define capability vocabulary.
- **EF-050** Define role capability requirements.
- **EF-051** Add qualification evidence fields.
- **EF-052** Add health snapshot binding.
- **EF-053** Add quota snapshot binding.
- **EF-054** Define risk eligibility.
- **EF-055** Define data-class eligibility.
- **EF-056** Define context-size eligibility.
- **EF-057** Define network/tool profile eligibility.
- **EF-058** Hard-filter API.
- **EF-059** Ineligibility reason codes.
- **EF-060** Explicitly reject manager-runtime selection.
- **EF-061** Test Sol/Sonnet manager chain cannot be mutated by HCX.
- **EF-062** Add stable eligibility ordering.
- **EF-063** Add registry fingerprint.

## R3 — Empirical routing

- **EF-064** Create worker performance ledger.
- **EF-065** Track sample count.
- **EF-066** Track first-pass acceptance.
- **EF-067** Track final acceptance.
- **EF-068** Track escaped defects.
- **EF-069** Track rework ratio.
- **EF-070** Track reviewer overturn.
- **EF-071** Track tokens.
- **EF-072** Track latency.
- **EF-073** Track provider failures/timeouts.
- **EF-074** Implement conservative prior/shrinkage.
- **EF-075** Reset/decay by worker identity change.
- **EF-076** Add task-archetype similarity.
- **EF-077** Build Pareto frontier.
- **EF-078** Add deterministic frontier selector.
- **EF-079** Add stable tie break.
- **EF-080** Add exploration flag.
- **EF-081** Prohibit exploration as sole high-risk path.

## R3 — Compute governor

- **EF-082** Define budget classes.
- **EF-083** Programme budget ledger.
- **EF-084** Unit budget ledger.
- **EF-085** Task reservation.
- **EF-086** Worker reservation.
- **EF-087** Token reservation.
- **EF-088** Concurrency reservation.
- **EF-089** Tool-call budget.
- **EF-090** Wall-time budget.
- **EF-091** Premium-call budget.
- **EF-092** Safety review reserve.
- **EF-093** Settlement.
- **EF-094** Release unused reservation.
- **EF-095** Recover abandoned reservations.
- **EF-096** Mandatory review cannot be budget-downgraded test.

## R4 — Topology

- **EF-097** Topology policy registry.
- **EF-098** Critical/architecture precedence.
- **EF-099** Mandatory independent reviewer precedence.
- **EF-100** Parallel disjointness requirement.
- **EF-101** SOLO default.
- **EF-102** Pipeline role sequencing.
- **EF-103** Competitive cell policy.
- **EF-104** Kill-switch safe-block semantics.
- **EF-105** Topology matrix tests.
- **EF-106** Critical parallelization regression test.

## R4 — Role projections

- **EF-107** Worker role registry.
- **EF-108** P0 authority set.
- **EF-109** P1 task-critical set.
- **EF-110** P2/P3 optional sets.
- **EF-111** P0 token-floor algorithm.
- **EF-112** Context-fit worker eligibility.
- **EF-113** Builder projection.
- **EF-114** Designer projection.
- **EF-115** Security reviewer projection.
- **EF-116** Visual reviewer projection.
- **EF-117** Integrator projection.
- **EF-118** Projection hash.
- **EF-119** Reconstruction from KRT/capsules.
- **EF-120** Mandatory context non-drop tests.

## R5 — Blackboard/artifacts

- **EF-121** Add control-root execution task tree.
- **EF-122** Define typed artifact registry.
- **EF-123** Architecture candidate artifact.
- **EF-124** Implementation patch manifest.
- **EF-125** Test result artifact.
- **EF-126** Security finding artifact.
- **EF-127** Visual evidence artifact.
- **EF-128** Integration decision artifact.
- **EF-129** Artifact content addressing.
- **EF-130** No transcript dependency test.

## R5 — Worktrees/leasing/fencing

- **EF-131** Worktree lease schema.
- **EF-132** Normalize repository-relative paths.
- **EF-133** Exact-file overlap.
- **EF-134** Directory overlap.
- **EF-135** Glob overlap.
- **EF-136** Generated shared-file overlap.
- **EF-137** Cross-task overlap check.
- **EF-138** Atomic lease issue.
- **EF-139** Lease expiry.
- **EF-140** Lease renewal.
- **EF-141** Lease revocation.
- **EF-142** Fencing generation counter.
- **EF-143** Inject fencing env.
- **EF-144** PreToolUse write fencing.
- **EF-145** Integration fencing.
- **EF-146** Late worker result rejection.
- **EF-147** Owner-steer revocation.
- **EF-148** Worker-loss recovery.
- **EF-149** No direct master write.
- **EF-150** Concurrency stress test.

## R6 — Execution receipt

- **EF-151** Receipt schema.
- **EF-152** Link KRT.
- **EF-153** Link envelope.
- **EF-154** Link triage.
- **EF-155** Link HCX snapshot.
- **EF-156** Capture eligible/excluded routes.
- **EF-157** Capture selected role routes.
- **EF-158** Capture compute reservations.
- **EF-159** Capture actual usage.
- **EF-160** Capture role projections.
- **EF-161** Capture leases/fencing.
- **EF-162** Capture worker results.
- **EF-163** Capture deterministic evidence.
- **EF-164** Capture reviewer evidence.
- **EF-165** Capture Product Experience evidence.
- **EF-166** Capture security evidence.
- **EF-167** Capture integration tree/commit.
- **EF-168** Content-address receipt.
- **EF-169** Receipt secret scanner.
- **EF-170** Receipt reconstruction test.

## R7 — Donor substrate

- **EF-171** Compile donor authority sources.
- **EF-172** Populate Donor Applicability Registry.
- **EF-173** Verify donor pin at first import.
- **EF-174** Verify license hash.
- **EF-175** Persist attribution.
- **EF-176** Define preserve/adapt/replace/enhance/forbid.
- **EF-177** Define SoR exclusion list.
- **EF-178** Donor Transformation Contract.
- **EF-179** Slice dependency closure.
- **EF-180** Slice hash.
- **EF-181** Secret scan.
- **EF-182** Data classification.
- **EF-183** Provider egress policy.
- **EF-184** Donor SoR leakage test.
- **EF-185** Donor upgrade policy.
- **EF-186** Reject unresolved donor registry.

## R8 — Design provider/Stitch

- **EF-187** Design Authority Projection.
- **EF-188** Generated DESIGN.md projection.
- **EF-189** Mark DESIGN.md derived.
- **EF-190** Provider adapter contract.
- **EF-191** Stitch adapter.
- **EF-192** Provider health.
- **EF-193** Provider project mapping.
- **EF-194** Secret-safe auth injection.
- **EF-195** Provider-neutral strategy selector.
- **EF-196** Donor-backed Stitch path.
- **EF-197** Donor-free Stitch path.
- **EF-198** Direct non-Stitch donor path.
- **EF-199** Raw artifact quarantine.
- **EF-200** HTML/CSS/SVG/JS scanner.
- **EF-201** External endpoint scanner.
- **EF-202** Dependency scanner.
- **EF-203** Design Candidate Manifest.
- **EF-204** Locked baseline open/closed dimensions.
- **EF-205** Design admission.
- **EF-206** Accepted Design Manifest.
- **EF-207** No reverse authority flow test.
- **EF-208** Stitch outage fallback test.

## R9 — Verification/Product Experience

- **EF-209** Deterministic verification ordering.
- **EF-210** Playwright state/viewport matrix.
- **EF-211** Accessibility automation.
- **EF-212** Visual evidence hashing.
- **EF-213** Generic AI UI drift evidence.
- **EF-214** Existing Product Experience hard-gate integration.
- **EF-215** Existing qualitative oracle integration.
- **EF-216** Donor visual parity/assimilation check.
- **EF-217** No fake implementation affordance check.
- **EF-218** Existing Unit completion integration.

## R10 — Owner steering

- **EF-219** Task scope mutation classifier.
- **EF-220** Envelope supersession.
- **EF-221** Lease revoke.
- **EF-222** Fencing increment.
- **EF-223** Worker cancel request.
- **EF-224** Late result rejection.
- **EF-225** VEKL invalidation trigger.
- **EF-226** Re-triage.
- **EF-227** New envelope issue.
- **EF-228** Immediate owner acknowledgement evidence.

## R11 — Multi-worker maturity

- **EF-229** Independence metadata.
- **EF-230** Independence score.
- **EF-231** Strong/weak independence labels.
- **EF-232** Required-independence blocker.
- **EF-233** Parallel cell artifact merge.
- **EF-234** Competitive candidate comparison.
- **EF-235** Integrator role.
- **EF-236** Majority-vote non-authority test.
- **EF-237** Multi-worker compute settlement.
- **EF-238** Multi-worker provider outage recovery.

## R12 — CI/operations

- **EF-239** Architecture extension checker.
- **EF-240** EF-01..EF-25 machine-readable evidence.
- **EF-241** Full verify integration.
- **EF-242** Post-merge topology-safe test.
- **EF-243** Lease/fencing chaos test.
- **EF-244** Provider failure injection.
- **EF-245** Owner-steer chaos test.
- **EF-246** Kill-switch matrix.
- **EF-247** Receipt retention policy.
- **EF-248** Control-root cleanup policy.
- **EF-249** Performance ledger compaction.
- **EF-250** Operator status projection.
- **EF-251** Hermes doctor checks.
- **EF-252** DIAL doctor parent checks.

## Deferred

- **EF-D01** A2A interoperability only after concrete need.
- **EF-D02** Temporal only through separate orchestration migration decision.
- **EF-D03** New provider classes only after qualification/evals.
- **EF-D04** Automated structural design-distance percentage only after exact metric definition.

---

# 91. Verification matrix

| Area | Unit | Integration | Failure injection | Evidence |
|---|---:|---:|---:|---:|
| triage | required | required | ambiguity/risk-floor | triage hash |
| envelope | required | required | stale binding | envelope hash |
| HCX | required | required | health/quota/capability | route trace |
| compute | required | required | exhaustion/reservation loss | settlement |
| topology | required | required | kill switch/budget | topology evidence |
| projections | required | required | context overflow | projection hash |
| leases | required | required | overlap/expiry/revoke | lease history |
| fencing | required | required | stale write/result | denial event |
| donor | required | required | license/SoR leak | donor evidence |
| provider | required | required | outage/invalid output | quarantine |
| design | required | required | authority drift | accepted manifest |
| frontend | required | required | visual/a11y regression | Product Experience |
| receipt | required | required | missing/secret/stale refs | receipt hash |
| owner steer | required | required | in-flight mutation | supersession trace |

---

# 92. Promotion policy

The extension may progress through:

```text
PLANNED
SCHEMA_GREEN
DETERMINISTIC_CORE_GREEN
SOLO_EXECUTION_GREEN
WORKER_VERIFIER_GREEN
DONOR_SLICE_GREEN
DESIGN_PROVIDER_GREEN
EMPIRICAL_ROUTING_GREEN
PARALLEL_CELL_GREEN
COMPETITIVE_CELL_GREEN
EXECUTION_FABRIC_GREEN
```

No later level may be claimed from documentation alone.

Each requires fresh implementation/test/evidence.

---

# 93. No-silent-thinning rule

If a provider, account, tool, plugin, API or environment is unavailable:

- retain the required feature;
- use the documented fallback;
- defer only the provider-dependent proof;
- do not delete the capability;
- do not reduce a mandatory gate;
- record the blocker honestly.

Examples:

```text
Stitch unavailable
≠ remove provider-neutral design routing

second independent worker unavailable
≠ downgrade critical competitive review to SOLO

small context model only
≠ drop P0 authority

write conflict
≠ allow both workers to proceed
```

---

# 94. Recommended implementation acceptance test

A single end-to-end acceptance scenario should prove:

```text
owner instructs Dial-a-Tech donor-backed UI work
↓
mission manager resolves current Feature/Unit
↓
VEKL 2.2 generates current Unit Map/KRT
↓
deterministic triage = DONOR_ADAPTATION
↓
Task Execution Envelope issued
↓
donor applicability resolves FixItNow
↓
donor license/pin verified
↓
minimal donor slice sanitized
↓
Design Authority Projection generated
↓
HCX hard-filters design/build workers
↓
compute reservation succeeds
↓
minimum useful topology selected
↓
designer receives role projection
↓
if Stitch selected: output quarantined
↓
AcceptedDesignManifest
↓
builder worktree lease/fencing
↓
implementation
↓
Playwright/a11y/security/visual evidence
↓
independent donor/visual review
↓
existing Product Experience and Unit completion gate
↓
compute settlement
↓
immutable Development Execution Receipt
↓
candidate commit admitted
```

During this scenario inject:

1. provider outage;
2. owner steer mid-task;
3. stale Unit revision;
4. path-overlap lease request;
5. stale fencing result;
6. low remaining compute budget.

All must fail/degrade exactly as specified.

---

# 95. Final engineering position

DIAL does not need a second development brain.

VEKL 2.2 already provides the knowledge and authority substrate.

The missing capability is an execution fabric that can answer, reproducibly:

> Given this current Development Unit, current knowledge trace, current owner authority, current risk and current compute constraints, what is the smallest safe execution topology, which qualified worker capabilities should fill it, what exact context should each role receive, what may each worker touch, and what evidence is required before any result becomes admissible?

Rev 2 answers that question while preserving the architecture already made green.

The intended system is therefore:

```text
CURRENT VEKL 2.2
        ↓
deterministic execution triage
        ↓
immutable Task Execution Envelope
        ↓
hard compute reservation
        ↓
worker-only HCX
        ↓
minimum useful topology
        ↓
role projections
        ↓
repository-wide lease + fencing
        ↓
bounded workers/providers
        ↓
typed artifacts
        ↓
deterministic verification
        ↓
targeted independent review
        ↓
existing DIAL completion authority
        ↓
immutable Development Execution Receipt
```

For design/donor work:

```text
canonical DIAL donor/design authority
        ↓
derived donor applicability + transformation contract
        ↓
derived Design Authority Projection
        ↓
provider-neutral design strategy
        ↓
Stitch only when eligible and selected
        ↓
quarantine
        ↓
AcceptedDesignManifest
        ↓
builder
        ↓
existing Product Experience + verification + Unit completion
```

This architecture preserves:

- one Project Truth;
- one VEKL;
- one mission authority;
- one manager runtime policy;
- one authority per concern;
- deterministic stale refusal;
- owner-first steering;
- provider replaceability;
- token discipline;
- no-silent-thinning;
- no stale worker integration;
- no donor SoR leakage;
- no external design authority;
- complete reconstructability.

That is the recommended DIAL adaptive multi-harness execution architecture.

---

# 96. Adoption note

This document is intentionally **implementation-ready but non-authoritative until owner adoption**.

Recommended adoption sequence:

1. resolve the Decision-ID/document-reference hygiene issue;
2. create one additive locked architecture Decision for this execution-fabric extension;
3. add the minimum Project Truth lock statements in §84;
4. derive supporting registries;
5. implement R1 onward without rebuilding VEKL 2.2;
6. keep the existing 30/30 VEKL checker mandatory;
7. add EF-01..EF-25 as the additive execution-fabric gate;
8. promote only through the existing owner authorization, Project Truth ledger, PR CI and protected-master flow.
