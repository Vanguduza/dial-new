<!--
DIAL CANONICAL ADOPTION HEADER — do not remove.

Adopted under DEC-032 as the canonical DIAL adaptive harness/model routing and
model-specific execution architecture. The body below is the owner-supplied
document retained in full.

Relationship to existing canon — this EVOLVES DEC-028, it does not replace it:
  DEC-020  VEKL v2 remains the authoritative engineering-knowledge compiler and
           remains upstream of all routing. Pass 1 is model-neutral.
  DEC-028  Adaptive Execution Fabric Rev 2 keeps deterministic triage, the Task
           Execution Envelope, compute governance, execution topology, role
           projection, worktree leases, fencing and execution receipts. What
           changes is the worker abstraction: a pre-bound harness+model worker
           card becomes an independently selected harness x model PAIR.
           Existing worker cards are retained as Phase 1 compatibility shims
           (section 45) and are not deleted.
  DEC-031  Antigravity remains a worker-only harness; Stitch remains a
           non-authoritative design provider. This document places them in the
           correct layers -- Antigravity in the harness registry, Stitch in the
           specialist capability registry -- without granting either new
           authority.

Invariants that this document may not weaken, and does not:
  - VEKL resolves engineering truth BEFORE routing selects an execution pair.
  - Model adaptation happens AFTER model selection and changes behaviour
    guidance only, never engineering truth (section 51.3).
  - HCX selects workers, never the manager runtime (DEC-028 section 14).
  - Compute shortage may restrict execution but may never waive a mandatory
    safety, security, review or acceptance gate (DEC-028 section 19).
  - Retrieved external content never becomes authority (section 70).

Machine-readable authority:
  agent-system/registries/HARNESS_REGISTRY.json
  agent-system/registries/MODEL_REGISTRY.json
  agent-system/registries/HARNESS_MODEL_COMPATIBILITY.json
  agent-system/registries/SPECIALIST_CAPABILITY_REGISTRY.json
  agent-system/registries/MODEL_BEHAVIOR_RESOURCE_REGISTRY.json
  agent-system/registries/MODEL_TASK_PERFORMANCE_LEDGER.json
  agent-system/registries/ADAPTIVE_ROUTING_POLICY.json

Where this prose and those registries disagree, the registries are
authoritative and the prose is a defect to be corrected. Model availability in
particular is DISCOVERED from live authenticated subscriptions (section 37);
any model list committed to this repository is a seed and a qualification
record, never a permanent hard-coding.
-->

# DIAL Development System — Adaptive Harness, Model Routing, and VEKL Model-Specific Execution Architecture

**Status:** Target engineering architecture derived from current DIAL implementation audit and design discussion  
**Target repository:** `Vanguduza/dial-new`  
**Primary objective:** Upgrade DIAL development orchestration so that model and harness selection are dynamic, task-aware, subscription-aware, and token-efficient, while preserving VEKL as the authoritative knowledge-resolution layer and avoiding unnecessary prompt/context bloat.

---

## 1. Executive Summary

The current DIAL development system already has a strong execution foundation:

- VEKL 2.2 resolves development-unit knowledge before worker execution.
- Deterministic task triage classifies work.
- A Task Execution Envelope binds execution to current VEKL evidence.
- HCX performs worker eligibility filtering and routing.
- Compute governance, execution topology, role projections, leases/fencing, and execution receipts are already implemented.
- The manager runtime is separate from worker routing.

However, the current worker-routing abstraction is too rigid because workers are represented as **fixed harness + model bundles**, for example:

- Codex App Server + GPT-5.6 Sol
- Claude Code + Claude Sonnet 5

This prevents DIAL from dynamically using:

- Claude Code + any verified Claude subscription model
- Codex + any verified Codex subscription model
- manager-grade models as workers for sufficiently complex tasks
- model-specific execution guidance compiled by VEKL
- task-aware escalation from cheaper to stronger models
- specialist tools such as Stitch as composable capabilities rather than pretending they are model workers

The required architecture is therefore:

```text
Owner instruction / Project Truth
        ↓
Mission Controller / DIAL Dev Manager
        ↓
VEKL PASS 1 — model-neutral unit/task knowledge resolution
        ↓
Deterministic Task Triage
        ↓
Task Execution Envelope
        ↓
Harness Eligibility
        ↓
Model Eligibility
        ↓
Harness × Model Pair Selection
        ↓
VEKL PASS 2 — model-specific task execution projection
        ↓
Role/Tool Context Projection
        ↓
Execution
        ↓
Deterministic Verification
        ↓
Execution Evidence + Performance Feedback
```

The central design principle is:

> **VEKL resolves engineering truth first; routing chooses the execution pair second; VEKL then compiles the smallest task-specific guidance needed for the selected model.**

This provides better execution quality without unnecessary token burn.

---

# 2. Current DIAL State

## 2.1 Current execution order

The current DIAL architecture already places VEKL upstream of worker execution selection.

The effective worker path is:

```text
Owner instruction
    ↓
DIAL mission controller
    ↓
DIAL Dev Manager
    ↓
VEKL 2.2 resolution
    ↓
Task triage
    ↓
Task Execution Envelope
    ↓
Compute Governor
    ↓
HCX
    ↓
Execution topology
    ↓
Role context projection
    ↓
Worker execution
```

This ordering is fundamentally correct and should be preserved.

---

## 2.2 Manager selection is separate

The current manager path is not selected by HCX.

The manager runtime is resolved before worker routing and currently follows a separately governed manager-runtime chain.

Therefore, DIAL currently has two distinct selection paths:

```text
MANAGER PATH
manager-runtime policy
    ↓
manager selected
    ↓
manager invokes VEKL / orchestration
```

and:

```text
WORKER PATH
VEKL
    ↓
task triage
    ↓
HCX
    ↓
worker selected
```

This separation should remain.

---

## 2.3 Current HCX limitation

Current HCX worker definitions are static worker cards.

Conceptually:

```text
WORKER CARD
=
HARNESS
+
MODEL
+
PROVIDER
+
CAPABILITIES
+
ROLE ELIGIBILITY
+
RISK ELIGIBILITY
+
PERFORMANCE
```

Examples include:

```text
codex-sol-worker
  harness = codex-app-server
  model   = gpt-5.6-sol
```

and:

```text
claude-sonnet-worker
  harness = claude-code
  model   = claude-sonnet-5
```

This means worker selection currently chooses a pre-bound worker identity rather than independently selecting the harness and model.

That is the key architectural limitation to fix.

---

# 3. Required Architectural Correction

The correct abstraction is:

```text
HARNESS ≠ MODEL
```

A harness is an execution environment.

A model is a reasoning/coding capability.

These must be independently represented, discovered, qualified, and paired.

The target architecture is therefore:

```text
Task requirements
    ↓
Eligible harnesses
    ↓
Eligible models
    ↓
Compatible harness × model pairs
    ↓
Ranked execution pair
    ↓
Selected pair
```

---

# 4. Harness Layer

DIAL should maintain a dedicated **Harness Registry**.

Example harness classes:

```text
CLAUDE_CODE
CODEX
ANTIGRAVITY
OTHER_APPROVED_AGENTIC_HARNESS
```

Each harness record should describe:

```yaml
harness_id:
family:
version:
provider:
capabilities:
  repository_read:
  repository_write:
  browser:
  visual_reasoning:
  shell:
  structured_output:
  long_context:
  tool_use:
  mcp:
security:
  supported_data_classes:
  max_risk_class:
runtime:
  health_state:
  quota_state:
  authenticated:
compatibility:
  supported_model_families:
  supported_provider_routes:
```

The harness is responsible for describing what the execution environment can do.

It should not permanently bind itself to one model.

---

# 5. Model Layer

DIAL should maintain a separate **Model Registry**.

All models actually available within an authorized subscription or provider route should be discoverable and eligible for worker use, subject to capability and policy checks.

A model record should include:

```yaml
model_id:
provider:
family:
lineage:
subscription_source:
availability:
worker_eligible:
manager_eligible:
capabilities:
  coding:
  reasoning:
  visual_reasoning:
  long_context:
  structured_output:
  tool_reasoning:
  architecture:
  debugging:
  review:
cost_profile:
latency_profile:
reliability_profile:
context_window:
known_strengths:
known_failure_modes:
```

The critical rule is:

> **Manager eligibility does not exclude worker eligibility.**

A model may therefore be:

```text
manager_eligible = true
worker_eligible  = true
```

This is necessary for highly capable models such as Opus-class, Fable-class, GPT-SOL-class, or equivalent future models.

A strong manager model should still be selectable as a worker when the task itself justifies it.

---

# 6. Subscription-Wide Worker Eligibility

The intended DIAL policy is:

> **Every model actually available in an authorized Claude, Codex, or other approved subscription should be considered worker-eligible by default, unless explicitly disqualified by capability, policy, security, availability, or runtime evidence.**

This means DIAL should not manually encode only one Claude model or one Codex model.

Instead:

```text
Claude subscription
    ↓
discover available Claude models
    ↓
qualify them
    ↓
worker pool
```

and:

```text
Codex subscription
    ↓
discover available Codex models
    ↓
qualify them
    ↓
worker pool
```

Examples:

```text
Claude Code + economical Claude model
Claude Code + Sonnet-class model
Claude Code + Opus-class model
Claude Code + future Fable-class model
```

and:

```text
Codex + economical coding model
Codex + GPT-SOL-class model
Codex + future specialist model
```

The exact available list must be discovered from live authenticated subscriptions rather than hard-coded permanently.

---

# 7. Model Selection Must Follow VEKL Pass 1

VEKL must remain upstream of worker routing.

VEKL Pass 1 should be model-neutral and resolve:

- Development Unit identity
- current Unit revision
- Project Truth slice
- applicable decisions
- task dependencies
- stack fingerprint
- contracts
- architecture constraints
- risk profile
- relevant engineering resources
- design authority
- security authority
- evidence requirements
- task archetype
- required capabilities
- acceptance criteria

This produces a compact **Execution Knowledge Package**.

Example:

```yaml
task_id:
unit_lineage_id:
unit_revision_hash:
task_archetype: INFRA_RECOVERY
risk_class: HIGH
required_capabilities:
  - repositoryRead
  - shell
  - infrastructure_reasoning
  - structuredOutput
acceptance:
  - target_reachable
  - unrelated_systems_unchanged
constraints:
  - no_rebuild
  - preserve_production_host
```

This package is then consumed by routing.

---

# 8. Harness Selection vs Model Selection

The recommended target sequence is:

```text
VEKL PASS 1
    ↓
Task triage
    ↓
Harness eligibility
    ↓
Model eligibility
    ↓
Pair compatibility
    ↓
Pair ranking
```

Harness and model selection should therefore be logically separate, but may be evaluated in one combined routing operation.

The important rule is:

> **DIAL must not assume that selecting Claude Code implies selecting Sonnet, or that selecting Codex implies selecting GPT-SOL.**

Instead:

```text
Claude Code
    +
best eligible Claude model for this task
```

or:

```text
Codex
    +
best eligible Codex model for this task
```

---

# 9. Harness × Model Compatibility

Not every model can necessarily run through every harness.

Therefore DIAL needs a compatibility layer.

Conceptually:

```yaml
compatibility:
  claude-code:
    allowed_model_families:
      - claude
  codex:
    allowed_model_families:
      - openai-codex
      - gpt
  antigravity:
    allowed_model_families:
      - provider_native
      - explicitly_supported_external_routes
```

Compatibility must be determined from live technical support, not assumptions.

The system must not create fictional combinations such as:

```text
Stitch + Opus
```

unless Stitch itself genuinely supports that model execution path.

---

# 10. Antigravity

Antigravity should be treated as an **agentic harness**, not just a fixed model provider.

Its value can include:

- browser execution
- visual workflows
- tool orchestration
- agentic task execution
- repository interaction
- external service interaction
- provider-native model use
- potentially other models where technically supported by official or approved integration routes

DIAL should represent Antigravity in the Harness Registry.

Model compatibility should be discovered and qualified separately.

If an external model cannot literally run inside Antigravity, DIAL may still compose Antigravity into a multi-worker execution topology.

Example:

```text
Claude Opus worker
    ↓
reasoning / architecture
    ↓
Antigravity worker
    ↓
browser / visual / interactive execution
    ↓
artifact
    ↓
Claude/Codex verification
```

This is valid composition.

It is different from pretending the model is hosted inside Antigravity.

---

# 11. Stitch

Stitch should not be treated as a normal peer coding worker.

It is better represented as a **specialist design provider/tool capability**.

Stitch belongs in a registry such as:

```text
SPECIALIST_CAPABILITY_REGISTRY
```

or:

```text
TOOL_PROVIDER_REGISTRY
```

Its capabilities may include:

- design generation
- design transformation
- design project retrieval
- Design DNA extraction
- design tokens
- visual candidate generation
- MCP/API access
- structured design context

A model/harness pair may invoke Stitch as a tool.

Example:

```text
Claude Code + Opus
        ↓
Stitch MCP
        ↓
design candidate / Design DNA
        ↓
Claude Code implementation
```

or:

```text
Antigravity + selected model
        ↓
Stitch MCP
        ↓
design artifact
        ↓
browser validation
```

This is the correct composition model.

---

# 12. Worker Roles

DIAL should preserve role eligibility independently from model class.

Possible worker roles include:

```text
ARCHITECT
BUILDER
FRONTEND_BUILDER
TESTER
SECURITY_REVIEWER
VISUAL_REVIEWER
DONOR_REVIEWER
INTEGRATOR
DESIGNER
INFRA_RECOVERY
DATABASE_MIGRATION
RESEARCHER
```

A model may qualify for multiple roles.

Routing should consider both:

```text
model capability
+
harness capability
+
task role
```

---

# 13. Task-Based Model Escalation

DIAL should not always choose the strongest model.

It should choose the **least expensive model that is expected to meet the task’s quality and risk requirements**.

Conceptually:

```text
simple task
    ↓
economical capable model

moderate task
    ↓
strong general worker

complex task
    ↓
premium reasoning worker

highly complex / ambiguous / high-risk task
    ↓
Opus/Fable/GPT-SOL-class worker
```

The strongest model is justified when complexity, ambiguity, consequence, or expected rework cost makes it economical.

---

# 14. Pair Ranking

Routing should optimize for expected accepted output, not raw benchmark scores.

A conceptual score:

```text
expected_quality
× task_fit
× reliability
× first_pass_probability
──────────────────────────
token_cost + latency + expected_rework_cost
```

Hard constraints are applied before ranking.

Hard filters include:

- provider authentication
- model availability
- harness health
- quota
- data-class permission
- risk-class permission
- required tool support
- required capabilities
- role eligibility
- compatibility
- repository lease requirements
- security restrictions

Only eligible pairs should be ranked.

---

# 15. VEKL Pass 2 — Model-Specific Task Projection

After the harness × model pair is selected, VEKL should perform a second, lightweight projection.

This pass must not change engineering truth.

It only adapts execution guidance to the selected model.

The input is:

```text
selected harness
+
selected model
+
task archetype
+
risk profile
+
role
+
known model strengths/failure modes
+
relevant unit constraints
```

The output is a compact **Model Execution Profile**.

---

# 16. Model Execution Profile

Example schema:

```yaml
model_execution_profile:
  task_id:
  unit_revision_hash:
  harness_id:
  model_id:
  role:
  task_archetype:
  risk_class:

  rules:
    - ...

  activated_micro_skills:
    - ...

  suppressed_behaviors:
    - ...

  evidence_policy:
    - ...

  token_budget:
    max_behavioral_tokens:

  profile_hash:
```

This artifact should be immutable for that execution attempt.

---

# 17. Model-Specific Skill Composition

VEKL should not maintain one enormous prompt per model.

Instead, it should compose the profile from compact reusable resources:

```text
MODEL BASE PROFILE
        +
TASK ARCHETYPE PROFILE
        +
ROLE PROFILE
        +
RISK PROFILE
        +
UNIT-SPECIFIC RULES
        =
MODEL-SPECIFIC TASK PROFILE
```

Example:

```text
Claude Opus
+
INFRA_RECOVERY
+
BUILDER
+
HIGH_RISK
+
oracle-admin constraints
```

might compile to:

```text
- Verify only decision-critical runtime facts before mutation.
- Prefer direct observation over speculative repair.
- Reuse fresh authoritative evidence.
- Preserve unrelated infrastructure.
- Avoid exhaustive narration.
- Verify the required postcondition once and stop.
```

The model should receive only the compiled micro-profile, not all source documents.

---

# 18. Opus Optimization

The Opus-specific behavior discussed in this design should be implemented as a compact VEKL model-behavior resource.

Purpose:

- prevent premature action on assumptions
- reduce speculative debugging
- avoid unnecessary overthinking
- reduce context restatement
- preserve Opus for high-value reasoning
- verify decision-critical facts before consequential action
- reuse fresh evidence
- stop after acceptance is proven

Example compact profile:

```text
Use minimum sufficient reasoning.

Verify only currently uncertain facts whose falsity could materially change
the action, target, safety, or result.

Prefer cheap direct observation over speculation.

Reuse fresh authoritative evidence.

Scale reasoning depth to task risk.

Do not restate context or duplicate completed work.

Never claim success until the required postcondition is observed.

Stop when acceptance criteria are met.
```

This should only be activated when an Opus-family model is actually selected.

---

# 19. Minimum Sufficient Verification

The global verification rule should be:

> **Verify only facts that can materially change the selected action, target, safety, implementation, or expected result.**

Do not verify everything.

This avoids excessive tool use and token burn.

For each task, the model should effectively ask:

```text
Which uncertain fact, if wrong, would make me choose a different action?
```

Only those facts require pre-action verification.

---

# 20. Direct Observation Before Speculation

A core model-agnostic execution rule:

> **When a cheap observation can distinguish between competing causes, observe first.**

Bad pattern:

```text
failure
→ speculate
→ modify
→ retry
→ speculate
→ modify
```

Correct pattern:

```text
failure
→ discriminating observation
→ diagnose
→ smallest repair
→ verify
```

This should be a reusable VEKL micro-skill for debugging and recovery tasks.

---

# 21. Evidence Reuse

VEKL and the execution fabric should reuse fresh evidence.

Examples:

```text
repository identity
branch
HEAD
runtime host
deployment environment
Project Truth revision
migration head
model availability
harness health
```

Evidence should be represented compactly.

Example:

```yaml
repo: Vanguduza/dial-new
branch: master
head: abc123
verified_age_seconds: 20
```

Do not resend full logs or full command output when a compact verified summary is sufficient.

---

# 22. Risk-Adaptive Verification

Verification depth should scale with risk.

### Read-only
Minimal verification.

### Local reversible changes
Verify target and relevant file state.

### Repository mutation
Verify repository, branch, and relevant HEAD.

### Deployment / infrastructure
Verify environment, target, and critical preconditions.

### Destructive / security-sensitive work
Strong target verification, recovery implications, and independent corroboration where valuable.

Do not impose destructive-action scrutiny on routine edits.

---

# 23. Token Efficiency

The entire model-specific execution layer must be aggressively token-efficient.

The governing rule is:

> **Compile guidance; do not concatenate documents.**

VEKL may store large supporting skill resources internally, but the selected model should receive only the smallest useful projection.

Suggested behavioral-profile budgets:

```text
routine task       ≤ 100 tokens
moderate task      ≤ 200 tokens
complex task       ≤ 400 tokens
exceptional task   expandable only when justified
```

These limits apply only to model-specific behavioral guidance, not required engineering context.

---

# 24. Token-Benefit Gate

VEKL should inject a model-specific rule only when the expected benefit exceeds the prompt/context cost.

Conceptually:

```text
inject skill if:

expected reduction in failure
+
expected reduction in rework
+
expected reduction in wandering
+
expected quality improvement

>

context/token cost
```

If no model-specific adaptation is useful:

```text
ModelExecutionProfile = NONE
```

That is valid.

---

# 25. Minimal Skill Coalition

VEKL should apply its existing minimal-coalition philosophy to model-specific guidance.

Example:

```text
candidate skills = 14
directly relevant = 5
overlapping = 3
minimum useful coalition = 2
```

Only the two necessary skills are compiled into the execution profile.

This prevents context bloat.

---

# 26. Performance Feedback

Execution results should feed back into routing and skill selection.

Metrics should include:

- first-pass acceptance rate
- final acceptance rate
- escaped defect rate
- token consumption
- latency
- rework ratio
- retry count
- wrong-target incidents
- speculative-repair incidents
- premature-success incidents
- postcondition failure
- reviewer rejection rate

This enables DIAL to learn which:

```text
model
+
harness
+
task archetype
+
skill profile
```

combinations produce the best outcomes.

---

# 27. Adaptive Skill Pruning

If a rule or micro-skill consistently fails to improve outcomes, VEKL should stop activating it for that model/task combination.

Example:

```text
Opus + infra recovery
+ direct-observation rule

result:
tokens ↓
retries ↓
first-pass success ↑

KEEP
```

versus:

```text
Codex + mechanical refactor
+ long architecture preamble

result:
tokens ↑
quality unchanged

REMOVE
```

This turns the system into an empirical optimization loop.

---

# 28. Manager Models as Workers

A critical policy correction:

> **Manager-capable models remain eligible for worker execution.**

For example:

```text
model:
  manager_eligible: true
  worker_eligible: true
```

When assigned as a worker, the model receives worker-specific role guidance rather than manager behavior.

A high-end model should be selected as a worker when:

- task complexity is high
- ambiguity is high
- architecture risk is high
- failure/rework cost is high
- security sensitivity is high
- difficult debugging is required
- multi-system reasoning is required
- premium reasoning is expected to reduce total cost

---

# 29. Manager Optimization

When a high-end model acts as manager, VEKL or runtime policy should encourage:

- decomposition
- routing
- conflict resolution
- architecture
- acceptance judgement
- review
- synthesis
- delegation of mechanical work

It should avoid:

- repetitive file edits
- trivial generation
- mechanical renaming
- redundant audits
- micromanaging workers

This preserves premium reasoning capacity.

---

# 30. Worker Optimization

When the same model acts as a worker, the profile should change.

Preferred pattern:

```text
inspect
→ understand
→ implement
→ test
→ verify
→ stop
```

Not:

```text
inspect
→ narrate
→ restate
→ theorize
→ plan excessively
→ implement
```

Role context therefore matters as much as model identity.

---

# 31. Specialist Tool Attachment

Tools/providers should be attached only when relevant.

Example capabilities:

```text
STITCH
BROWSER
MCP
VISUAL_COMPARE
DATABASE
CLOUD
DESIGN_PROVIDER
RESEARCH_PROVIDER
```

The selected harness/model pair should receive only the tools needed for the task.

This reduces risk and context load.

---

# 32. Correct Role of Stitch

Stitch should be moved out of the generic worker pool and modeled as a specialist provider/tool.

Recommended registry:

```text
SPECIALIST_CAPABILITY_REGISTRY.json
```

Example:

```yaml
id: stitch
type: DESIGN_PROVIDER
access:
  api: true
  mcp: true
capabilities:
  design_generation: true
  design_transformation: true
  design_context: true
  design_dna: true
  code_execution: false
  repository_write: false
```

A Claude, Codex, or Antigravity worker can then invoke Stitch where needed.

---

# 33. Correct Role of Antigravity

Antigravity should remain in the harness layer.

It can participate as:

- browser worker
- visual worker
- interactive agent
- repository worker
- execution environment
- integration harness

Its compatible models must be discovered from actual supported routes.

Where model embedding is not supported, DIAL can compose Antigravity with another reasoning worker rather than fabricating unsupported pairings.

---

# 34. Multi-Worker Topologies

Single-worker execution should remain the default.

Multi-worker topologies should be used only when they materially improve quality or capability.

Examples:

### Design implementation

```text
Claude high-reasoning worker
    +
Stitch design provider
    +
Codex implementation worker
```

### Visual validation

```text
Codex builder
    +
Antigravity/browser visual worker
```

### High-risk architecture

```text
Opus/Fable-class architect
    +
Codex builder
    +
independent reviewer
```

The topology selector should choose the minimum safe useful topology.

---

# 35. Model-Specific Failure Modes

VEKL may maintain model-specific behavioral knowledge.

Examples:

```text
Opus:
- can overthink
- may prematurely act on plausible assumptions
- benefits from minimum-sufficient verification
- strong architecture/reasoning

Codex:
- strong implementation
- benefits from bounded task scope
- benefits from explicit postcondition testing

Other models:
- maintain their own observed strengths and failure modes
```

These profiles must be evidence-backed and versioned.

They should never become immutable stereotypes.

---

# 36. Skill Versioning

Model-specific skills should be versioned resources.

Example:

```text
model-behavior/
  claude-opus/
    minimum-sufficient-verification.v1
    concise-execution.v1
  codex/
    bounded-implementation.v1
    explicit-postcondition.v1
```

VEKL should reference exact versions in the execution profile.

---

# 37. Model Availability Discovery

The worker pool should not rely solely on static configuration.

DIAL should periodically discover:

- authenticated subscriptions
- available models
- model aliases
- provider health
- quota
- context capabilities
- current harness support
- account-specific availability

The discovered state should be normalized into the Model Registry.

---

# 38. Qualification vs Discovery

A discovered model/harness is not automatically production-qualified.

States should include:

```text
DISCOVERED
QUALIFYING
QUALIFIED
APPROVED
DEGRADED
BLOCKED
UNAVAILABLE
```

Worker routing should only use models/harnesses that meet the current qualification policy.

---

# 39. Dynamic Health

Eligibility should incorporate runtime health.

Examples:

```text
model reachable?
subscription authenticated?
quota available?
harness healthy?
toolchain available?
required MCP server reachable?
provider latency acceptable?
```

Routing should fail closed when required execution capability is unavailable.

---

# 40. Suggested Registries

The target design should separate the current monolithic worker-card concept into:

```text
HARNESS_REGISTRY.json
MODEL_REGISTRY.json
HARNESS_MODEL_COMPATIBILITY.json
SPECIALIST_CAPABILITY_REGISTRY.json
MODEL_BEHAVIOR_RESOURCE_REGISTRY.json
MODEL_TASK_PERFORMANCE_LEDGER.json
```

Existing HCX logic can then be evolved to consume these inputs.

---

# 41. Target Routing Algorithm

Conceptual flow:

```text
1. Receive VEKL Pass 1 package.
2. Read task triage.
3. Filter eligible harnesses.
4. Filter eligible models.
5. Generate compatible harness × model pairs.
6. Apply security/risk/data filters.
7. Apply health/quota filters.
8. Score task fit.
9. Score expected quality/cost/rework.
10. Select minimum sufficient pair.
11. Determine required specialist tools.
12. Run VEKL Pass 2.
13. Compile model-specific micro-profile.
14. Execute.
15. Verify.
16. Record execution evidence.
17. Update performance ledgers.
```

---

# 42. Target Architecture

```text
OWNER / PROJECT TRUTH
        ↓
MISSION CONTROLLER
        ↓
DIAL DEV MANAGER
        ↓
VEKL PASS 1
  - Unit identity
  - Unit revision
  - Project Truth slice
  - GraphRAG
  - engineering resources
  - task archetype
  - capabilities
  - acceptance
        ↓
TASK TRIAGE
        ↓
TASK EXECUTION ENVELOPE
        ↓
HARNESS FILTER
        ↓
MODEL FILTER
        ↓
HARNESS × MODEL COMPATIBILITY
        ↓
PAIR RANKING
        ↓
COMPUTE GOVERNOR
        ↓
TOPOLOGY SELECTION
        ↓
VEKL PASS 2
  - selected model
  - selected harness
  - task archetype
  - risk
  - role
  - model strengths/failure modes
        ↓
MINIMUM MODEL-SPECIFIC SKILL COALITION
        ↓
COMPACT MODEL EXECUTION PROFILE
        ↓
SPECIALIST TOOL ATTACHMENT
        ↓
ROLE CONTEXT PROJECTION
        ↓
LEASE + FENCING
        ↓
EXECUTION
        ↓
DETERMINISTIC VERIFICATION
        ↓
INDEPENDENT REVIEW WHERE REQUIRED
        ↓
EXECUTION RECEIPT
        ↓
PERFORMANCE FEEDBACK
```

---

# 43. Hard Invariants

The following rules should become explicit DIAL development invariants.

### VEKL authority

> VEKL remains the authoritative engineering-knowledge compiler.

### Routing order

> Model routing must consume VEKL-resolved task requirements.

### Harness/model separation

> Harness capability and model capability are independent routing dimensions.

### Worker eligibility

> Manager-capable models remain eligible for worker use.

### Subscription discovery

> Available subscription models must be dynamically discoverable and individually qualified.

### Model-specific guidance

> Model adaptation occurs after model selection.

### Token efficiency

> VEKL compiles guidance instead of concatenating skills.

### Verification

> Verify only decision-critical uncertainty before action.

### Direct observation

> Prefer cheap direct observation over speculative repair.

### Evidence reuse

> Reuse fresh authoritative evidence.

### Success claims

> Never claim success before the required postcondition is observed.

### Stop condition

> Stop once acceptance criteria are satisfied and no decision-relevant uncertainty remains.

---

# 44. Required Refactoring of Current HCX

The existing HCX should be evolved rather than discarded.

Current concept:

```text
selectHcxWorkers(worker_cards)
```

Target concept:

```text
selectExecutionPair(
  task_requirements,
  harnesses,
  models,
  compatibility,
  health,
  performance
)
```

The resulting selection object should include:

```yaml
selection:
  harness_id:
  model_id:
  provider:
  role:
  topology:
  specialist_tools:
  selection_reason:
  expected_quality:
  expected_token_cost:
  expected_rework:
  evidence_hash:
```

---

# 45. Migration Strategy

## Phase 1 — Separate data model

Introduce:

- Harness Registry
- Model Registry
- compatibility registry
- specialist capability registry

Keep current static worker cards as compatibility shims.

---

## Phase 2 — Dynamic pair generation

HCX generates candidate harness × model pairs.

Current workers remain supported while new routing is validated.

---

## Phase 3 — VEKL Pass 2

Add model-specific execution-profile compilation.

Start with:

- Opus
- Codex
- Sonnet
- GPT-SOL-class models

---

## Phase 4 — Skill feedback

Record skill-profile outcomes.

Enable empirical skill pruning and activation.

---

## Phase 5 — Specialist provider cleanup

Move Stitch from generic worker modeling to specialist provider/tool modeling.

Retain Antigravity in the harness layer.

---

## Phase 6 — Full adaptive routing

Retire hard-coded worker cards once dynamic routing has equivalent or better reliability.

---

# 46. Acceptance Criteria

The redesign is complete only when all of the following are true:

- Claude Code can route to multiple verified Claude models.
- Codex can route to multiple verified Codex models.
- Manager-grade models can be selected as workers.
- Model selection occurs after VEKL Pass 1.
- Model-specific execution guidance occurs after model selection.
- VEKL can return no behavioral profile for simple tasks.
- Behavioral profiles remain compact.
- Model-specific skill selection uses a minimal coalition.
- Stitch is represented as a specialist capability/provider.
- Antigravity is represented as a harness.
- unsupported harness/model combinations are blocked.
- runtime health and quota are enforced.
- worker routing records immutable evidence.
- performance feedback updates routing and skill selection.
- first-pass acceptance does not regress.
- total tokens per accepted task improve or remain neutral.
- speculative repair decreases.
- wrong-target actions decrease.
- premature success claims decrease.
- no Project Truth or VEKL authority is weakened.

---

# 47. Primary Optimization Metric

The system should optimize:

```text
Accepted Useful Work
────────────────────
Total Development Cost
```

where total cost includes:

- input tokens
- output tokens
- retries
- worker latency
- rework
- reviewer cost
- failed deployments
- recovery effort
- defect escape cost

The objective is not minimum prompt length.

The objective is:

> **Maximum accepted engineering value per unit of compute and development effort.**

---

# 48. Final Governing Principle

The target DIAL execution philosophy is:

> **VEKL first determines what the task actually requires.  
> DIAL then selects the best available harness and model for that task.  
> VEKL then supplies only the smallest model-specific execution guidance that improves the selected model’s performance.  
> The worker acts, verifies the result, records evidence, and stops.**

In compact form:

```text
UNDERSTAND
→ RESOLVE
→ SELECT
→ SPECIALIZE
→ EXECUTE
→ VERIFY
→ LEARN
```

This is the required evolution from the current static worker-card design to a truly adaptive DIAL development execution system.

---

# 49. Control-Plane Breadth vs Runtime Sparsity

The architecture may contain many safeguards, registries, qualification rules, observability controls, and recovery mechanisms.

These MUST NOT all be injected into every model invocation.

The system must distinguish:

```text
CONTROL PLANE
=
comprehensive architecture, policies, registries, qualification logic,
routing logic, observability, feedback, safeguards, and lifecycle rules

EXECUTION PLANE
=
only the minimum task truth, context, model-specific rules, tools,
and acceptance criteria needed for the current invocation
```

The governing principle is:

> **Keep the architecture comprehensive, but keep each invocation sparse.**

This is how DIAL gains stronger control without paying for every safeguard in every prompt.

---

# 50. Runtime Guidance Budget

Model-specific behavioral guidance should remain tightly bounded.

Recommended default budgets:

```text
simple task       0–50 tokens
normal task       50–120 tokens
complex task      120–250 tokens
high-risk task    250–400 tokens
```

Anything beyond these ranges should require explicit evidence that additional guidance materially reduces expected failure, rework, or risk.

A valid output is:

```text
ModelExecutionProfile = NONE
```

when the model already has enough task information and no model-specific adaptation is expected to improve the result.

---

# 51. Three-Layer VEKL Output Contract

VEKL should structurally separate engineering truth from task context and model behavior.

The required output layers are:

```text
1. AUTHORITATIVE TASK TRUTH
2. EXECUTION CONTEXT
3. MODEL BEHAVIOR PROFILE
```

## 51.1 Authoritative Task Truth

Contains facts that define what is correct and permitted.

Examples:

- Project Truth
- locked Decisions
- Development Unit identity
- Unit revision
- contracts
- security constraints
- acceptance criteria
- target identity
- immutable requirements

This layer MUST NOT be altered to suit a model.

---

## 51.2 Execution Context

Contains the engineering knowledge required to perform the task.

Examples:

- relevant code excerpts
- relevant architecture
- current runtime evidence
- relevant logs
- relevant design context
- selected VEKL resources
- relevant external evidence

This layer may be compressed, summarized, retrieved on demand, or referenced by content-addressed artifact.

---

## 51.3 Model Behavior Profile

Contains only execution guidance adapted to the selected model.

Examples:

- minimum-sufficient verification
- concise implementation behavior
- visual-fidelity emphasis
- debugging discipline
- known model-specific failure mitigation

This is the only layer that should vary because a different model was selected.

The invariant is:

> **Model optimization may change behavior guidance, never engineering truth.**

---

# 52. Mandatory Context Classes

To prevent information loss during compression, VEKL should classify resolved context as:

```text
MUST_INCLUDE
COMPRESSIBLE
ON_DEMAND
OPTIONAL
```

## MUST_INCLUDE

Facts that must be present in the execution context.

Examples:

- target repository
- current branch when mutation is allowed
- locked requirement
- security invariant
- acceptance criterion
- production protection guardrail

These may be represented compactly but must not be omitted.

## COMPRESSIBLE

Context that may be summarized without changing meaning.

Examples:

- architectural background
- historical implementation notes
- broad resource descriptions

## ON_DEMAND

Context retrievable only if the worker encounters the relevant condition.

Examples:

- rare subsystem documentation
- historical logs
- fallback provider instructions
- optional API details

## OPTIONAL

Useful but not required unless selected by the minimal-coalition logic.

This classification is essential because:

> **Compression must reduce tokens without deleting authority.**

---

# 53. Runtime Capability Proof

Registry declarations are not sufficient proof that a harness or model is currently usable.

DIAL should periodically perform lightweight qualification canaries for:

- authentication
- repository read
- repository write where permitted
- shell/tool use
- browser use
- MCP connectivity
- structured output
- model invocation
- context-window behavior
- provider health

The result should be stored as runtime evidence.

A routing decision should therefore consume:

```text
declared capability
+
qualification evidence
+
current health
```

not declared capability alone.

---

# 54. Model-Version Drift

Model aliases may change behavior without changing their friendly names.

Therefore model behavior profiles should bind to a capability/version fingerprint rather than only:

```text
claude-opus
```

A model identity should preferably include:

```yaml
provider:
model_id:
resolved_version:
capability_fingerprint:
qualification_epoch:
```

If the underlying model changes materially:

```text
invalidate stale performance assumptions
→ requalify
→ retest important micro-skills
```

This prevents stale optimization rules from being applied to a changed model.

---

# 55. Subscription-Aware Economics

The routing cost function must not assume all providers charge strictly per token.

Possible constraints include:

- flat-rate subscription access
- rolling quotas
- seat/session limits
- provider rate limits
- account-specific limits
- model-specific quotas
- latency
- queueing
- API credits
- free-tier ceilings

Therefore the cost model should normalize into:

```text
effective_execution_cost
```

rather than only:

```text
token_price
```

For subscription-backed models, scarcity pressure may matter more than nominal token price.

---

# 56. Context-Window Budgeting

Context must be explicitly budgeted before dispatch.

For each selected model:

```text
usable_context
-
system/runtime instructions
-
tool schemas
-
required task truth
-
required execution context
-
reserved output space
=
remaining optional context budget
```

VEKL should not simply fill the maximum context window.

The context allocator should prioritize:

```text
1. MUST_INCLUDE truth
2. acceptance criteria
3. task-critical execution context
4. model-specific micro-profile
5. optional resources
```

Optional resources should be dropped before critical task truth is compressed beyond safety.

---

# 57. Skill Conflict Detection

Micro-skills may conflict even when each is individually valid.

Example conflict:

```text
act decisively
vs
require secondary verification before destructive action
```

The skill composer should therefore perform:

```text
candidate selection
→ conflict detection
→ precedence resolution
→ deduplication
→ compression
```

Authority order should be:

```text
Project Truth / security / task safety
>
risk profile
>
role policy
>
model-specific optimization
>
preference-level guidance
```

A lower-level optimization skill may never weaken a higher-level requirement.

---

# 58. Negative Skill Activation

VEKL should support both:

```text
ACTIVATE behavior
```

and:

```text
SUPPRESS behavior
```

Examples:

For deterministic implementation:

```text
SUPPRESS:
- explore multiple alternatives
- rewrite unrelated code
```

For incident recovery:

```text
SUPPRESS:
- opportunistic refactor
- broad cleanup
```

For visual fidelity work:

```text
SUPPRESS:
- stylistic reinterpretation of locked design
```

Negative activation can often save more tokens than adding more positive instructions.

---

# 59. Model-Selection Hysteresis

Routing should avoid unnecessary model switching.

Once a model/harness pair is successfully executing a task, DIAL should retain it unless:

- capability failure occurs
- quota becomes unavailable
- owner steer invalidates the task
- execution evidence shows clear underperformance
- task complexity materially increases
- security/risk conditions change

Small routing-score changes should not cause mid-task churn.

The system should use:

```text
switch only when improvement exceeds meaningful threshold
```

not:

```text
always choose the current marginally highest score
```

---

# 60. Escalation and De-escalation

Model selection should not be a one-time irreversible decision.

DIAL should support:

```text
CONTINUE
ESCALATE
DE-ESCALATE
RE-ROUTE
BLOCK
```

Examples:

### Escalation

```text
economical worker
→ unresolved architecture ambiguity
→ escalate only the difficult subproblem to Opus/Fable/GPT-SOL-class worker
```

### De-escalation

```text
premium architect resolves design
→ mechanical implementation delegated to cheaper worker
```

This is often more efficient than assigning the strongest model to the entire task.

---

# 61. Adaptive Execution Plan Selection

The true optimization target is not:

> best single model for the task

It is:

> **best sequence of harnesses, models, tools, and reviews needed to reach an accepted result at the lowest expected total cost.**

Example:

```text
Sonnet-class model
→ initial analysis

Codex
→ implementation

Antigravity
→ browser/visual validation

Opus
→ only unresolved architectural ambiguity
```

This should become the long-term objective of the execution topology selector.

---

# 62. Partial-Failure Recovery

A failed worker should not force full task restart when useful work already exists.

Every task attempt should maintain a compact handoff state:

```yaml
completed_steps:
verified_evidence:
generated_artifacts:
open_findings:
invalidated_assumptions:
remaining_acceptance_criteria:
safe_resume_point:
```

A replacement worker receives this state instead of replaying the full history.

This reduces both tokens and recovery time.

---

# 63. Reviewer Independence

High-risk verification should avoid unnecessary reviewer contamination.

A reviewer should normally receive:

```text
task truth
acceptance criteria
artifact/result
verification evidence
```

before receiving:

```text
worker reasoning
worker confidence
worker self-assessment
```

This reduces anchoring bias.

Where independence matters, DIAL should prefer different model/provider families for builder and reviewer when the added cost is justified.

---

# 64. Performance-Ledger Integrity

The performance ledger must not accept worker self-reported success as authoritative.

Performance updates should derive from trusted outcomes such as:

- deterministic tests
- CI
- acceptance gates
- independent review
- deployment verification
- owner acceptance
- postcondition evidence
- defect escape evidence

The ledger should record confidence and evidence source for every performance update.

---

# 65. Cold-Start Model Qualification

Newly available models will not have task-history evidence.

DIAL should support controlled exploration.

A new model may be:

```text
DISCOVERED
→ QUALIFYING
→ SHADOW_TESTED
→ LIMITED_TRAFFIC
→ QUALIFIED
```

High-risk work should not become the first test of an unproven model.

---

# 66. Evaluation Rotation

Qualification canaries and skill-regression tests should not be permanently static.

DIAL should maintain rotating or versioned evaluation sets to reduce:

- benchmark overfitting
- memorized workflows
- stale capability assumptions
- accidental leakage

The exact qualification set need not be included in normal worker context.

---

# 67. Project- and Stack-Specific Performance

Model performance should be tracked at several granularities:

```text
global
project
stack
task archetype
role
risk class
harness
model version
skill profile
```

A model that performs well globally may still be poor for:

- Android
- infrastructure recovery
- frontend visual fidelity
- database migration
- security review

Routing should prefer the most relevant evidence available.

---

# 68. Data Sovereignty and Secrecy

Model eligibility must include information-class constraints.

Possible classes include:

```text
PUBLIC
INTERNAL
CONFIDENTIAL
RESTRICTED
LOCAL_ONLY
```

Routing must reject model/provider paths that are not authorized for the task's data class.

Model quality must never override data-handling policy.

---

# 69. Tool Authorization Is Separate from Model Intelligence

Selecting a powerful model must not automatically grant powerful tools.

Tool access should be task-scoped.

Example:

```text
model selected: Opus
allowed tools:
- repository read
- test runner

forbidden:
- production deployment
- secret rotation
```

until the task explicitly requires and authorizes those operations.

The required abstraction is:

```text
MODEL CAPABILITY
≠
TOOL AUTHORIZATION
```

---

# 70. Prompt-Injection Boundaries

External content must never become authority merely because VEKL retrieved it.

Untrusted sources include:

- donor repositories
- browser pages
- MCP resources
- Stitch output
- external documentation
- issue comments
- generated code
- model-generated plans

Each input should carry a trust class.

Prompt-like content from untrusted sources must not override:

- Project Truth
- owner authority
- routing policy
- security policy
- tool permissions
- acceptance criteria

---

# 71. Session Continuity

Harnesses may retain state differently.

DIAL should explicitly decide:

```text
CONTINUE_EXISTING_SESSION
START_FRESH_SESSION
```

A fresh session should be preferred when:

- role changes materially
- model changes
- reviewer independence is required
- stale hidden context may contaminate work
- Project Truth changed
- owner steer invalidated assumptions

Session continuity should be treated as an execution decision, not an accidental side effect.

---

# 72. Role Rebinding

A model acting as:

```text
MANAGER
```

should not automatically carry manager behavior when later used as:

```text
WORKER
```

Similarly, a worker becoming a reviewer may require a fresh role projection or fresh session.

Role identity should be rebound explicitly for every execution attempt.

---

# 73. Routing Determinism Envelope

Every material routing decision should be explainable.

The execution receipt should record:

```yaml
task_requirements_hash:
eligible_harnesses:
eligible_models:
excluded_candidates:
selected_pair:
selection_policy_version:
performance_snapshot_hash:
health_snapshot_hash:
model_execution_profile_hash:
reason_codes:
```

The system does not need perfect mathematical determinism, but it must be auditable enough to explain:

> why this pair was selected over alternatives.

---

# 74. Owner Overrides

The owner must be able to:

```text
force model
forbid model
force harness
forbid harness
force provider
forbid provider
force reviewer diversity
force premium reasoning
```

Owner overrides should apply to the current task or explicit scope only unless promoted into Project Truth.

Overrides must not silently rewrite learned routing performance.

---

# 75. Degraded Mode

DIAL needs explicit behavior when preferred models or harnesses are unavailable.

Possible responses:

```text
CONTINUE_WITH_FALLBACK
READ_ONLY
DEFER
BLOCK
```

The choice depends on:

- task risk
- required capability
- data class
- safety
- acceptance requirements

Example:

```text
simple documentation task:
fallback allowed

production credential rotation:
block if qualified route unavailable
```

---

# 76. Unit-Level Compute Budgeting

Optimization should not occur only per invocation.

DIAL should consider the expected cost of completing the whole Development Unit.

A locally cheaper model may be globally more expensive if it causes:

- extra reviews
- repeated retries
- architectural rework
- regression repair

The Compute Governor should therefore support:

```text
task budget
+
unit budget
+
mission budget
```

where appropriate.

---

# 77. Cross-Task Coordination

Adaptive routing does not replace dependency management.

Parallel workers must still obey:

- TaskGraph dependencies
- repository-wide path leases
- fencing tokens
- stale-context invalidation
- artifact ownership
- integration ordering
- shared-state constraints

A perfect model selection can still fail if two workers mutate incompatible state concurrently.

---

# 78. Owner Steer During Execution

When an owner instruction arrives mid-task, DIAL should classify its effect:

```text
NO_INVALIDATION
LOCAL_INVALIDATION
TASK_INVALIDATION
UNIT_INVALIDATION
MISSION_REPLAN
```

If the steer changes task truth or acceptance criteria:

```text
invalidate stale execution envelope
→ rerun VEKL Pass 1
→ re-evaluate routing
→ regenerate VEKL Pass 2
```

If the steer only changes priority, the active execution may continue safely where appropriate.

---

# 79. Skill Lifecycle

Model-specific micro-skills should have explicit lifecycle states:

```text
EXPERIMENTAL
QUALIFYING
ACTIVE
DEPRECATED
BLOCKED
```

Promotion should require evidence.

Rollback should be immediate if a skill causes:

- higher defect rate
- increased token usage without quality gain
- more retries
- harmful model behavior
- acceptance regression

---

# 80. Skill Regression Testing

Before broad activation, a new micro-skill should be tested against representative task archetypes.

Compare:

```text
baseline
vs
skill-enabled
```

using:

- accepted-result rate
- tokens
- latency
- rework
- tool calls
- premature actions
- postcondition failures

A skill should not be promoted merely because its wording appears sensible.

---

# 81. Execution Explainability

The execution receipt should capture not only:

```text
which model was selected
```

but also:

```text
which micro-skills were activated
which behaviors were suppressed
which context was MUST_INCLUDE
which optional context was omitted
which tools were granted
why escalation/de-escalation occurred
```

This makes behavior optimization auditable without exposing full hidden reasoning.

---

# 82. Sparse Runtime Contract

Despite the comprehensive architecture above, the runtime contract remains intentionally small.

A typical worker invocation should contain approximately:

```text
1. compact authoritative task truth
2. minimal execution context
3. acceptance criteria
4. 0–5 model-specific micro-rules
5. only required tool permissions
```

It should NOT contain:

- the full routing policy
- the full harness registry
- the full model registry
- historical performance tables
- every safety rule
- every model failure mode
- every skill definition
- the entire architecture document

Those remain in the control plane.

---

# 83. Sparse Runtime Example

A high-risk infrastructure task assigned to an Opus-class worker might receive only:

```text
Target: oracle-admin
Guardrail: do not modify protected production hosts
Goal: restore and certify required connectivity
Acceptance: SSH and required recovery path verified

Execution profile:
- verify decision-critical live state before mutation
- prefer direct observation over speculative repair
- preserve unrelated infrastructure
- reuse fresh evidence
- verify the required postcondition once and stop
```

The fact that DIAL internally has dozens of architectural safeguards does not mean those safeguards must be repeated in this prompt.

---

# 84. Updated Primary Optimization Objective

The primary objective should be:

```text
Accepted Useful Work
────────────────────
Total End-to-End Development Cost
```

where end-to-end cost includes:

- model usage
- subscription scarcity
- token usage
- retries
- tool usage
- latency
- review
- rework
- failed deployments
- defect escape
- recovery effort
- opportunity cost of consuming premium model capacity

This is the metric that should govern routing, model escalation, skill activation, and context allocation.

---

# 85. Updated Governing Principles

The full architecture should obey the following compact principles:

> **Resolve truth before routing.**

> **Separate harness capability from model capability.**

> **Allow every qualified subscription model to work, including manager-grade models.**

> **Adapt execution guidance only after model selection.**

> **Compile micro-guidance; never dump skill libraries into prompts.**

> **Verify only decision-critical uncertainty.**

> **Prefer direct observation over speculative repair.**

> **Use the cheapest capable execution path, but escalate when expected rework makes premium reasoning cheaper overall.**

> **Optimize execution plans, not merely individual model calls.**

> **Preserve engineering truth independently from model behavior.**

> **Keep the control plane comprehensive and the runtime sparse.**

---

# 86. Runtime Prompt Compiler

DIAL should introduce a dedicated **Runtime Prompt Compiler** between VEKL Pass 2 and model dispatch.

Its purpose is to turn all selected execution inputs into the smallest valid runtime context while preserving correctness, authority, and acceptance criteria.

Target flow:

```text
VEKL Pass 1
    ↓
Routing
    ↓
VEKL Pass 2
    ↓
Runtime Prompt Compiler
    ├─ preserve MUST_INCLUDE truth
    ├─ remove duplicate context
    ├─ merge overlapping guidance
    ├─ reject conflicting guidance
    ├─ enforce model-specific profile budget
    ├─ enforce total context budget
    ├─ reserve output tokens
    ├─ defer ON_DEMAND context
    └─ emit Prompt Manifest
    ↓
Dispatch
```

The compiler is an execution control mechanism, not a source of truth.

It may compress presentation, but it may not alter authoritative engineering meaning.

---

# 87. Hard Runtime Budgets

Behavioral guidance budgets should become enforceable limits rather than advisory targets.

Default limits:

```text
simple task       0–50 tokens
normal task       50–120 tokens
complex task      120–250 tokens
high-risk task    250–400 tokens
```

A task may exceed these limits only when:

```text
expected quality gain
or
expected risk reduction
or
expected rework reduction
```

is explicitly recorded in the execution plan.

The runtime should reject accidental prompt growth.

---

# 88. Duplicate-Context Elimination

The same fact must not be repeatedly transmitted through multiple channels.

Common duplication sources include:

- Project Truth slice
- Unit context
- role context
- task envelope
- model behavior profile
- historical conversation
- tool output summaries

Before dispatch, the Runtime Prompt Compiler should canonicalize repeated facts and retain one authoritative representation.

Example:

```text
repo = Vanguduza/dial-new
```

should not appear separately in:

```text
Project Truth
task instructions
role profile
worker skill
execution summary
```

unless each occurrence adds materially distinct meaning.

---

# 89. Prompt Source Accounting

Every material invocation should record approximate token contribution by source.

Example:

```yaml
prompt_manifest:
  authoritative_truth_tokens: 420
  execution_context_tokens: 1850
  model_profile_tokens: 84
  role_context_tokens: 120
  tool_schema_tokens: 610
  retained_history_tokens: 0
  output_reserve_tokens: 3000

  duplicate_context_removed_tokens: 730
  optional_context_deferred_tokens: 2400
  budget_status: PASS
```

This allows DIAL to identify where context bloat actually occurs.

---

# 90. Output Reservation

The context allocator must reserve sufficient space for useful completion output before adding optional context.

The priority order should be:

```text
1. MUST_INCLUDE truth
2. acceptance criteria
3. required execution context
4. required tool schemas
5. model-specific profile
6. output reserve
7. optional context
```

Optional context must never consume the space required for execution output.

---

# 91. Minimum Quality Floor Before Cost Ranking

DIAL must not choose a weaker model merely because it is cheaper.

Routing should apply a task-risk-specific minimum expected quality threshold before cost optimization.

Conceptually:

```text
hard eligibility
    ↓
minimum quality floor
    ↓
risk suitability
    ↓
expected total cost ranking
```

Not:

```text
lowest apparent token cost
    ↓
hope for acceptable quality
```

Example policy:

```yaml
LOW:
  minimum_expected_acceptance_probability: 0.80

MEDIUM:
  minimum_expected_acceptance_probability: 0.90

HIGH:
  minimum_expected_acceptance_probability: 0.96

CRITICAL:
  minimum_expected_acceptance_probability: 0.99
```

Exact values should be calibrated empirically.

---

# 92. Escalation Stop-Loss

Adaptive routing must not permit endless worker retries.

Each task should maintain an escalation budget.

Example:

```yaml
attempt_policy:
  max_similar_failures: 2
  max_total_worker_switches: 3
  max_premium_escalations: 1
```

If materially similar failures recur:

```text
STOP RETRYING SAME STRATEGY
→ re-resolve task evidence
→ escalate model or topology
→ block if no justified route remains
```

This prevents token burn through repetitive failure loops.

---

# 93. Similar-Failure Detection

DIAL should compare failed attempts using:

- same task
- same failure class
- same unresolved assumption
- same tool failure
- same rejected acceptance criterion
- same root-cause hypothesis

A retry that does not materially change the strategy should count against the stop-loss budget.

---

# 94. Empirical Skill Promotion

A model-specific micro-skill should not become globally active because its wording sounds good.

Lifecycle:

```text
EXPERIMENTAL
→ SHADOW_EVAL
→ LIMITED_TRAFFIC
→ ACTIVE
```

Promotion should require measurable improvement in one or more of:

- first-pass acceptance
- final acceptance
- token efficiency
- rework
- retry rate
- premature action rate
- wrong-target rate
- postcondition success
- reviewer acceptance

with no unacceptable regression elsewhere.

---

# 95. Skill Accretion Control

The system should actively remove low-value skills over time.

A skill should be reviewed for deprecation when:

```text
activation count is meaningful
AND
measurable benefit is negligible
```

or when:

```text
tokens ↑
quality unchanged
```

or:

```text
failure behavior worsens
```

The desired skill library should become more selective over time, not only larger.

---

# 96. Revalidation Before Dispatch

After routing selects a harness/model pair, DIAL should revalidate volatile facts immediately before execution where needed.

Examples:

- model still available
- harness still healthy
- quota still available
- selected tool provider reachable
- execution envelope still current
- Unit revision unchanged
- owner steer has not invalidated the task

If any material binding changed:

```text
REFUSE_STALE_DISPATCH
→ re-route or re-resolve
```

---

# 97. Conservative Routing Under Weak Telemetry

When DIAL lacks enough performance evidence to estimate quality precisely, it should not fabricate confidence.

Instead:

```text
weak evidence
→ conservative eligibility
→ proven model preference
→ limited exploration
```

Unknown models may still be tested under low-risk or shadow conditions, but not assumed equal to qualified routes.

---

# 98. End-to-End Task Economics

Routing should optimize whole-task cost, not only invocation cost.

Total cost should include:

```text
input tokens
output tokens
subscription scarcity
latency
tool calls
retries
worker switching
reviews
rework
failed builds
failed deployments
defect escape
recovery effort
premium-model opportunity cost
```

A premium worker may be cheaper overall if it substantially reduces rework.

---

# 99. First-Pass Quality as a Primary Signal

DIAL should explicitly track:

```text
FIRST_PASS_ACCEPTED
```

because first-pass success is one of the strongest indicators of both quality and token efficiency.

A model that uses fewer tokens but requires repeated correction may be more expensive than a stronger model that succeeds once.

Therefore routing should weight:

```text
first_pass_accept_rate
```

separately from:

```text
final_accept_rate
```

---

# 100. Prompt Compiler Failure Behavior

The Runtime Prompt Compiler should fail closed when:

- MUST_INCLUDE truth does not fit
- conflicting mandatory instructions remain unresolved
- output reserve cannot be guaranteed
- context provenance is ambiguous
- task authority is stale
- model-specific guidance exceeds permitted budget without justification

Possible outcomes:

```text
PASS
COMPRESS_MORE
DEFER_OPTIONAL_CONTEXT
RESELECT_MODEL_WITH_LARGER_CONTEXT
BLOCK
```

---

# 101. Runtime Prompt Manifest

Each dispatch should emit a compact immutable manifest.

Example:

```yaml
runtime_prompt_manifest:
  task_id:
  unit_revision_hash:
  harness_id:
  model_id:

  context:
    authoritative_truth_hash:
    execution_context_hash:
    model_profile_hash:
    role_projection_hash:

  token_budget:
    input_limit:
    output_reserve:
    behavior_profile_limit:

  accounting:
    authoritative_truth_tokens:
    execution_context_tokens:
    model_profile_tokens:
    tool_schema_tokens:
    history_tokens:
    duplicate_tokens_removed:
    deferred_tokens:

  verification:
    stale_check: PASS
    conflict_check: PASS
    budget_check: PASS

  manifest_hash:
```

The manifest should be referenced from the execution receipt.

---

# 102. Production Hardening Gate

The adaptive execution architecture should not be considered production-hardened until the following are enforced in code:

```text
✓ runtime prompt compiler exists
✓ hard context budgets enforced
✓ output reserve enforced
✓ duplicate-context elimination active
✓ skill conflict detection active
✓ quality floor applied before cost ranking
✓ volatile state revalidated before dispatch
✓ escalation stop-loss active
✓ similar-failure detection active
✓ empirical skill promotion active
✓ skill deprecation/pruning active
✓ conservative routing under weak telemetry
✓ first-pass quality tracked
✓ prompt manifest emitted
✓ execution receipt references prompt manifest
```

---

# 103. Final Hardened Runtime Loop

The complete hardened runtime path becomes:

```text
OWNER / PROJECT TRUTH
    ↓
MISSION CONTROLLER
    ↓
DIAL DEV MANAGER
    ↓
VEKL PASS 1
    ↓
TASK TRIAGE
    ↓
TASK EXECUTION ENVELOPE
    ↓
HARNESS FILTER
    ↓
MODEL FILTER
    ↓
HARNESS × MODEL PAIRING
    ↓
MINIMUM QUALITY FLOOR
    ↓
EXPECTED TOTAL COST RANKING
    ↓
COMPUTE / TOPOLOGY DECISION
    ↓
VEKL PASS 2
    ↓
MINIMUM MODEL-SPECIFIC SKILL COALITION
    ↓
RUNTIME PROMPT COMPILER
    ↓
REVALIDATE VOLATILE BINDINGS
    ↓
DISPATCH
    ↓
OBSERVE EXECUTION
    ↓
CONTINUE / ESCALATE / DE-ESCALATE / RE-ROUTE / BLOCK
    ↓
DETERMINISTIC VERIFICATION
    ↓
INDEPENDENT REVIEW WHERE REQUIRED
    ↓
EXECUTION RECEIPT
    ↓
PERFORMANCE + SKILL FEEDBACK
```

---

# 104. Final Optimization Rule

The final governing rule for quality and token efficiency is:

> **DIAL should spend tokens only when they are expected to buy measurable reduction in uncertainty, failure, rework, or acceptance risk. Everything else stays in the control plane.**

This rule applies to:

- model selection
- skill activation
- context inclusion
- verification
- escalation
- review
- tool use

The system is therefore optimized not for minimum prompt size, but for:

> **maximum accepted engineering quality at minimum end-to-end development cost.**

