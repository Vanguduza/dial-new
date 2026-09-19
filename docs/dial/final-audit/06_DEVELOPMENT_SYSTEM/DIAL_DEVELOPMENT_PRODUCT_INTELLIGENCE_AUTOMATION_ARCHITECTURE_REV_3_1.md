# DIAL DEVELOPMENT & PRODUCT INTELLIGENCE / AUTOMATION ARCHITECTURE
## Repository-Grounded Open-World VEKL, Guided Generative Frontend Evolution, and Self-Hosted n8n Automation Fabric

**Document:** Canonical Integration Blueprint
**Revision:** 3.1
**Status:** Proposed canonical architecture for owner approval and implementation
**Supersedes:** Rev 3.0 of this blueprint
**Scope:** DIAL development system and DIAL production products
**Repository baseline:** `Vanguduza/dial-new` current `master` as reviewed on 2026-09-18
**Applies to:** VEKL 2.x evolution, GraphRAG, Hermes, DIAL adaptive execution, frontend design authority, design-generation tools, donor workflows, CI/CD, self-hosted n8n, Dial a Spare, Dial a Tech, Dial Groceries, Dial Logistics, Dial Care, shared platform services
**Primary objective:** Extend the working DIAL control plane without creating second authorities, while materially increasing open-world discovery, professional frontend quality, and durable development/product automation.

---

# 0. REVISION 3.1 PURPOSE

Revision 3.1 corrects a critical weakness in Rev 3.0: the target architecture was directionally sound but was expressed too much as a greenfield design.

DIAL is not greenfield.

The repository already contains working and governed subsystems for:

- design-provider routing;
- design candidate quarantine and admission;
- design-authority projection;
- donor-preservation checks;
- adaptive model/harness routing;
- VEKL resource registries and trust tiers;
- GraphRAG retrieval controls;
- n8n workflow-pattern ingestion and security knowledge;
- decision evolution;
- orchestration qualification;
- cryptographic control-plane fingerprinting;
- owner authority and Project Truth evolution.

Rev 3.1 therefore adopts a strict rule:

> **No new subsystem defined here may create a parallel authority where a repository authority already exists. New capability must extend, compose with, or deliberately migrate the existing authority under explicit evidence and owner-authorized decision evolution.**

The three requested structural changes remain:

1. **VEKL Open-World Discovery and Qualification**
2. **Guided Generative Frontend Evolution**
3. **Self-Hosted n8n Automation Fabric for Development and Production**

But implementation is now defined as three independently shippable engineering programmes under one umbrella canon.

---

# 1. EXECUTIVE ARCHITECTURE DECISION

DIAL shall preserve one coherent architectural principle across knowledge, design, and automation:

> **Open exploration upstream; governed qualification and deterministic authority downstream.**

This principle is applied differently in each domain:

```text
KNOWLEDGE
discover broadly
    ↓
investigate
    ↓
qualify
    ↓
admit into existing VEKL trust/registry model
    ↓
retrieve with provenance and trust exposure

DESIGN
preserve product/donor truth
    ↓
explore multiple visual candidates
    ↓
critique and converge
    ↓
promote one accepted visual authority
    ↓
reconstruct and verify implementation

AUTOMATION
design/test workflows
    ↓
qualify workflow + node + secret + event contracts
    ↓
promote to controlled n8n runtime estate
    ↓
execute without becoming product authority
```

The architecture therefore becomes more adaptive without weakening source-of-truth boundaries.

---

# 2. EXISTING REPOSITORY AUTHORITIES THAT MUST BE PRESERVED

This section is normative. The implementation programme must begin by treating these existing mechanisms as active substrate.

## 2.1 Frontend/design authority substrate

Current repository components include:

- `agent-system/orchestration/design-provider-router.mjs`
- `agent-system/orchestration/design-candidate-admission.mjs`
- `agent-system/orchestration/design-authority-projector.mjs`
- `agent-system/registries/DESIGN_PROVIDER_POLICY.json`

Existing behaviour already includes:

- provider selection;
- Stitch qualification policy;
- quarantine of returned design artifacts;
- candidate manifests;
- design-authority conformance;
- required-state checks;
- donor-semantics preservation;
- normalization evidence;
- change-budget enforcement;
- Figma authority states;
- owner/design-authority promotion gates.

These are not to be replaced.

The guided generative system in this revision sits **upstream of candidate admission and downstream of Product Truth projection**, extending the candidate-generation and convergence process.

## 2.2 Existing VEKL engineering resource substrate

Current repository components include:

- `agent-system/engineering-knowledge/registries/ENGINEERING_RESOURCE_SOURCE_REGISTRY.json`
- `agent-system/engineering-knowledge/registries/ENGINEERING_RESOURCE_REGISTRY.json`
- associated VEKL schemas, evaluators, graph components, and orchestration code.

The existing source registry already uses trust tiers such as:

- `T0_DIAL_PROJECT`
- `T1_OFFICIAL`
- `T2_MAINTAINER_COMMUNITY`
- `T3_COMMUNITY_CORROBORATION`
- `T4_COMMUNITY_SIGNAL`

It also already carries concepts including:

- resource classes;
- task classes;
- retrieval adapters;
- freshness policy;
- executable-content permissions;
- sensitive-data permissions.

Rev 3.1 must extend this model, not create a second trust vocabulary.

## 2.3 Existing n8n knowledge/corpus substrate

DIAL already contains an n8n **knowledge corpus** under:

- `agent-system/engineering-knowledge/automation/N8N_WORKFLOW_PATTERN_REGISTRY.json`
- `agent-system/engineering-knowledge/automation/n8n-node-capability-map.json`
- `agent-system/engineering-knowledge/automation/n8n-pattern-archetypes.json`
- `agent-system/engineering-knowledge/automation/n8n-security-rules.json`
- `agent-system/engineering-knowledge/automation/n8n-workflow-pattern.schema.json`

and repository verification includes `agent:vekl:n8n-check`.

This is not the same thing as the new self-hosted n8n runtime fabric.

The names and boundaries must remain explicit:

```text
VEKL n8n Corpus Plane
    knowledge ABOUT workflows
    pattern ingestion
    sanitization
    archetype extraction
    security knowledge
    capability knowledge

DIAL n8n Runtime Fabric
    actual workflow EXECUTION
    n8n-dev
    n8n-prod
    durable orchestration
    governed integrations
```

The corpus may inform runtime workflow quality. The runtime must not overwrite or become the VEKL knowledge authority.

## 2.4 Existing decision authority

New decisions must use the live decision-evolution mechanism:

- `agent-system/registries/DECISION_LOG.json`
- `agent:decision-evolution:check`

Rev 3.1 shall not introduce a parallel `DIAL-ADR-*` namespace for these programme-level decisions.

Implementation should allocate the next valid `DEC-*` identifiers after inspecting the current log at implementation time.

## 2.5 Existing model/harness authority

Adaptive execution is governed by existing routing policy and compatibility registries, including:

- `agent-system/registries/ADAPTIVE_ROUTING_POLICY.json`
- `agent-system/registries/HARNESS_MODEL_COMPATIBILITY.json`
- `DEC-032`

The owner-facing Hermes runtime chain is separately governed and may be locked.

Rev 3.1 therefore distinguishes:

```text
adaptive model/harness discovery and selection
!=
Hermes locked owner-control runtime policy
```

No adaptive-routing improvement may silently supersede a locked Hermes chain.

## 2.6 Existing control-plane fingerprint

`agent-system/orchestration/development-unblock.mjs` fingerprints at least:

- `agent-system/orchestration`
- `agent-system/engineering-knowledge`
- `deploy/oracle/hermes-codex`

Rev 3.1 implementation necessarily touches fingerprinted paths.

Therefore:

> **Control-plane requalification is a mandatory phase of this programme, not an optional postscript.**

---

# 3. NON-NEGOTIABLE SOURCE-OF-TRUTH RULES

The following authorities remain singular.

## 3.1 Product Truth

Project Truth and owner-authorized canon remain superior to:

- research findings;
- model recommendations;
- donor implementations;
- VEKL community knowledge;
- n8n workflows;
- generated screens;
- design-provider output;
- runtime telemetry.

## 3.2 Money

n8n, VEKL, Hermes, frontend agents, or external tools shall not become a second money authority.

Authoritative payment state, pricing/allocation snapshots, entitlements, settlement, reconciliation state, credits, refunds, and product-specific monetary rules remain in DIAL domain services and governed stores.

## 3.3 Identity and authorization

No workflow engine or external provider becomes the primary identity authority.

## 3.4 Fulfilment and inventory

n8n may coordinate fulfilment, but domain services remain authoritative for order, inventory, delivery, and entitlement state.

## 3.5 Health/sensitive context

Any sensitive-data constraints already established by DIAL remain binding on new discovery and automation paths.

## 3.6 Design authority

Generated candidates are non-authoritative until promoted through the existing design admission/promotion mechanism.

---

# 4. PROGRAMME STRUCTURE

Rev 3.1 remains one umbrella architecture, but implementation is split into three independently gated workstreams.

```text
REV 3.1 UMBRELLA CANON
│
├── A. VEKL OPEN-WORLD DISCOVERY & QUALIFICATION
│
├── B. GUIDED GENERATIVE FRONTEND EVOLUTION
│
└── C. SELF-HOSTED N8N AUTOMATION FABRIC
```

Each workstream has its own:

- decision record;
- acceptance contract;
- implementation branch/packet;
- tests;
- rollback plan;
- evidence bundle;
- qualification gate.

A failure in one workstream must not unnecessarily block safe progress in another.

Cross-workstream integration occurs only through explicit contracts.

---

# 5. WORKSTREAM A — VEKL OPEN-WORLD DISCOVERY & QUALIFICATION

# 5.1 Goal

Enable VEKL to discover and investigate useful tools, repositories, prompts, frameworks, design resources, packages, model capabilities, security information, MCPs, browser systems, workflow resources, and engineering techniques that were not previously present in the admitted corpus.

Examples include future equivalents of:

- browser harnesses;
- prompts.chat-like prompt libraries;
- newly released repositories;
- new MCP servers;
- new AI coding/design tools;
- novel evaluation frameworks;
- new security guidance;
- new official platform capabilities.

The architecture must guarantee:

> **Unknown does not mean forbidden; unknown means untrusted and requires investigation.**

---

# 5.2 No second trust model

Rev 3.0 proposed discovery-state and trust fields too independently.

Rev 3.1 corrects this.

Two orthogonal dimensions are required:

## 5.2.1 Discovery lifecycle

```text
DISCOVERED
→ TRIAGED
→ INVESTIGATING
→ EXPERIMENTAL
→ QUALIFIED
→ ADMITTED
```

Alternative terminal or lifecycle states:

```text
REJECTED
SUPERSEDED
DEPRECATED
QUARANTINED
```

## 5.2.2 Existing VEKL trust tier

Admission must assign or preserve the existing source classification:

```text
T0_DIAL_PROJECT
T1_OFFICIAL
T2_MAINTAINER_COMMUNITY
T3_COMMUNITY_CORROBORATION
T4_COMMUNITY_SIGNAL
```

The two concepts answer different questions:

- **discovery state** = how far DIAL has evaluated this resource;
- **trust tier** = what authority class the resource actually belongs to.

A resource does not become official simply because DIAL tested it successfully.

---

# 5.3 Trust-tier assignment rules

## T0_DIAL_PROJECT

Reserved for authoritative DIAL Project Truth and DIAL-controlled canonical resources under existing rules.

Open-world discovery cannot create T0 material.

## T1_OFFICIAL

May be assigned only when provenance verifies that the source is official for the technology/product represented.

Examples:

- official vendor documentation;
- official vendor repository;
- official release notes;
- official security advisory;
- official package metadata where policy allows.

Successful experimentation alone can never promote community content to T1.

## T2_MAINTAINER_COMMUNITY

Used for maintainer-authored or strongly maintainer-linked technical material that is not equivalent to official product authority under existing VEKL rules.

## T3_COMMUNITY_CORROBORATION

Used for corroborated, useful community evidence requiring bounded use and validation.

## T4_COMMUNITY_SIGNAL

Used for weak-signal discovery, community discussion, emerging ideas, references, and leads.

A T4 source may cause a search to discover a T1 source, but does not inherit the T1 source's authority.

---

# 5.4 Discovery-plane architecture

The discovery plane is additive to the existing VEKL registry.

```text
Task / research need
        ↓
Gap detector
        ↓
Discovery query generator
        ↓
Source adapters
        ↓
Raw discovery candidates
        ↓
Deduplication + identity normalization
        ↓
Lifecycle registration
        ↓
Triage
        ↓
Investigation
        ↓
Qualification / rejection
        ↓
Existing source/resource registries
        ↓
Graph compilation
```

Discovery adapters may include, subject to policy:

- web search;
- GitHub search;
- package registries;
- official documentation indices;
- release feeds;
- issue/discussion sources;
- security advisory feeds;
- plugin/MCP directories;
- curated technical lists;
- design-resource sources;
- prompt-resource sources;
- community sources for signal only.

No adapter is authority by virtue of being searchable.

---

# 5.5 Discovery trigger classes

VEKL shall support both reactive and proactive discovery.

## Reactive discovery

Triggered by an explicit engineering task.

Example:

```text
Need: deterministic browser operation
Current VEKL coverage: insufficient
Action: search live ecosystem for browser-control technologies
```

## Gap-driven discovery

Triggered when VEKL detects low coverage, stale evidence, or missing resource classes.

## Freshness discovery

Triggered when admitted knowledge exceeds its freshness TTL or when a fast-moving domain requires periodic review.

## Competitive replacement discovery

Triggered when a known tool is costly, unreliable, deprecated, blocked, or underperforming.

## Horizon scanning

Bounded scheduled scans of high-velocity engineering domains.

Horizon scanning must not reprioritize DIAL development by itself.

---

# 5.6 Discovery candidate record

The existing registry should be extended with a discovery record or associated ledger entry rather than a new independent authority database.

Illustrative schema:

```yaml
discovery_record:
  candidate_id: DISC-...
  canonical_locator: ...
  discovered_at: ...
  discovered_by: ...
  originating_task: ...
  query_hash: ...
  source_adapter: ...
  lifecycle_state: DISCOVERED

  claimed_resource_classes:
    - TOOL
    - REPOSITORY

  claimed_task_classes:
    - BROWSER_AUTOMATION

  provisional_source_class: T4_COMMUNITY_SIGNAL

  provenance:
    publisher_identity: ...
    repository_url: ...
    exact_revision: null
    package_version: null
    release_tag: null

  safety:
    executable_content_detected: true
    sensitive_data_allowed: false
    network_trial_allowed: false

  evidence_refs: []
  disposition_reason: null
```

The record must be append-only or history-preserving for state transitions.

---

# 5.7 Discovery safety invariant

Discovery and reading are not activation.

This distinction is mandatory:

```text
DISCOVER
!=
TRUST
!=
EXECUTE
!=
ACTIVATE
```

A newly discovered executable repository shall not gain DIAL execution authority merely because it is relevant.

---

# 5.8 Experimental execution policy

The experimental plane is permitted only under a hardened interpretation:

> **Experimental execution is isolated evaluation, not DIAL activation.**

Any unknown executable trial must use:

- an exact fetched artifact or immutable commit once trial begins;
- ephemeral sandbox;
- no DIAL production secrets;
- no service-role keys;
- no payment/customer records;
- no identifiable sensitive data;
- no write path to Project Truth;
- no direct write path to DIAL production databases;
- no privileged Oracle/Hermes control credential;
- deny-by-default network access;
- explicit egress allowlist when network is needed;
- CPU, memory, disk, process, and time limits;
- filesystem containment;
- execution logs;
- artifact hashing;
- dependency inventory;
- trial result manifest.

The sandbox may reproduce an engineering scenario using synthetic fixtures.

Trial success is evidence, not authorization.

---

# 5.9 Executable admission pipeline

An executable resource must progress through:

```text
discovery
→ immutable identity resolution
→ exact revision/version pin
→ license review
→ source/provenance verification
→ static inspection
→ dependency/security review
→ isolated execution
→ task-specific evaluation
→ donor/security/eval provenance record
→ qualification
→ registry admission
→ governed activation eligibility
```

This pipeline reconciles open-world discovery with the existing rule that mutable research references cannot be activated directly.

---

# 5.10 Sensitive-data rule

Open-world research must preserve the current DIAL prohibition on leaking sensitive context to public research sources.

Discovery requests must be generated from sanitized engineering intent.

Forbidden outbound discovery payloads include:

- secrets;
- API keys;
- payment details;
- customer identifiers;
- private order data;
- identifiable Health information;
- owner private credentials;
- production database contents.

Where domain context is necessary, use abstracted/synthetic descriptions.

---

# 5.11 Two-graph knowledge architecture

This remains one of the strongest Rev 3 concepts and is retained.

The graph system shall distinguish:

```text
CANONICAL / ADMITTED GRAPH
    Project Truth
    admitted engineering knowledge
    qualified tools/resources
    accepted patterns
    versioned provenance

DISCOVERY / CANDIDATE GRAPH
    emerging sources
    unqualified claims
    rejected candidates
    experimental evidence
    unresolved contradictions
```

These need not be physically separate graph databases if the existing GraphRAG architecture can enforce the boundary deterministically.

The required property is logical separation and policy-aware traversal.

---

# 5.12 Graph retrieval contract

Every retrieved knowledge item must expose enough metadata for the resolver to determine:

```yaml
knowledge_result:
  resource_id: ...
  lifecycle_state: ADMITTED
  trust_tier: T1_OFFICIAL
  authority_role: AUTHORITY | CORROBORATION | SIGNAL
  exact_version: ...
  source_hash: ...
  admitted_at: ...
  freshness_state: CURRENT | STALE
  executable_eligibility: ...
  sensitive_data_eligibility: ...
  task_classes: [...]
```

Candidate graph material must never silently be presented as authority.

---

# 5.13 Integration with existing GraphRAG determinism

The implementation shall extend, not replace, the current graph retrieval router and GraphRAG determinism policies.

Required tests include:

- community material cannot override Project Truth;
- candidate material cannot masquerade as admitted;
- stale official knowledge is surfaced as stale;
- T4 signal cannot become authority through traversal;
- Health-sensitive retrieval obeys current restrictions;
- open Project Truth challenges remain withheld where current policy requires;
- deterministic same-input retrieval remains reproducible.

---

# 5.14 Continuous reassessment

Admitted resources may become:

```text
CURRENT
STALE
SUPERSEDED
DEPRECATED
REVOKED
```

Periodic reassessment may detect:

- new major releases;
- security advisories;
- repository archival;
- ownership change;
- license change;
- tool deprecation;
- better replacements;
- reduced maintenance;
- broken integration;
- performance regression.

Reassessment may recommend review but must not silently rewrite Project Truth or active programme priority.

---

# 6. WORKSTREAM B — GUIDED GENERATIVE FRONTEND EVOLUTION

# 6.1 Goal

Increase professional screen quality and design flair without weakening:

- Product Truth;
- donor semantics;
- required states;
- interaction correctness;
- visual-authority promotion;
- accessibility;
- production realism;
- implementation fidelity.

The system shall preserve the existing design authority pipeline and insert richer generative design intelligence before final admission.

---

# 6.2 Critical schema correction: separate two design axes

The existing repository uses `design_mode` for provenance/authority relationship.

The guided creative methodology uses EXPLORE/CONVERGE/RECONSTRUCT for iteration phase.

These are orthogonal.

Rev 3.1 requires two distinct fields.

## 6.2.1 Design provenance mode

Rename only if migration is safe; otherwise preserve current serialized field and introduce an explicit alias in new schemas.

Canonical semantic name:

```text
design_provenance_mode
```

Allowed existing values:

```text
NEW_DIAL_DESIGN
DONOR_ADAPT
DONOR_PRESERVE
LOCKED_BASELINE_REPAIR
```

## 6.2.2 Design iteration phase

New field:

```text
design_iteration_phase
```

Allowed values:

```text
EXPLORE
CONVERGE
RECONSTRUCT
```

Never overload `design_mode` with both meanings.

---

# 6.3 Combined design state example

```yaml
design_context:
  design_provenance_mode: DONOR_ADAPT
  design_iteration_phase: EXPLORE

  donor:
    applicability_ref: ...
    transformation_hash: ...
    semantics_must_be_preserved: true

  creative_freedom:
    composition: high
    spacing: high
    typography: medium
    illustration: high
    navigation_semantics: none
    business_logic: none
```

This allows broad visual exploration while retaining donor constraints.

---

# 6.4 Existing design authority pipeline remains intact

The revised pipeline must compose with:

```text
projectDesignAuthority()
        ↓
design packet enrichment
        ↓
guided multi-candidate generation
        ↓
quarantineDesignArtifact()
        ↓
critic/evaluation evidence
        ↓
admitDesignCandidate()
        ↓
promotion / visual authority
        ↓
implementation
        ↓
parity verification
```

No external design provider gains authority simply by producing an attractive result.

---

# 6.5 Product Truth packet

Every screen-generation mission begins from bounded product truth.

Required fields include:

```yaml
product_truth:
  feature_ids: [...]
  unit_lineage_id: ...
  unit_revision_hash: ...
  user_goal: ...
  required_actions: [...]
  required_states: [...]
  data_semantics: [...]
  navigation_semantics: [...]
  business_rules: [...]
  security_constraints: [...]
  legal_constraints: [...]
  donor_constraints: [...]
```

Product Truth is not editable by the design model.

---

# 6.6 Screen Quality Packet

The guided creative system shall build a machine-readable packet similar to:

```yaml
screen_quality_packet:
  schema_version: 1

  authority:
    unit_lineage_id: ...
    unit_revision_hash: ...
    design_authority_projection_hash: ...
    frontend_design_execution_packet_hash: ...
    design_brief_bundle_hash: ...

  intent:
    screen_type: HOME
    user_goal: ...
    primary_task: ...
    hierarchy:
      primary: [...]
      secondary: [...]
      tertiary: [...]

  design_state:
    design_provenance_mode: NEW_DIAL_DESIGN
    design_iteration_phase: EXPLORE

  design_grammar:
    typography: ...
    spacing: ...
    surfaces: ...
    radii: ...
    iconography: ...
    imagery: ...
    motion: ...
    brand_behavior: ...

  creative_direction:
    personality:
      - premium
      - precise
      - trustworthy
      - modern

  design_freedom:
    composition: high
    spacing: high
    typography: medium
    surface_strategy: high
    illustration: high
    information_architecture: low
    navigation_semantics: none
    business_logic: none

  references:
    golden_screens: [...]
    archetypes: [...]
    donor_visual_authority: [...]
    inspirational_refs: [...]

  prohibited_patterns:
    - FAKE_DATA
    - PLACEHOLDER_HELPER_TEXT
    - DEAD_CONTROLS
    - GENERIC_AI_UI
    - DONOR_BRAND_AUTHORITY
    - RAW_TECHNICAL_IDS
    - EXCESSIVE_CARD_NESTING
    - ARBITRARY_GRADIENTS
    - DUPLICATED_NAVIGATION
    - INVENTED_METRICS
    - UNSTRUCTURED_LONG_SCROLL

  candidate_policy:
    count: 3
    diversity_dimensions:
      - section_composition
      - imagery_position
      - surface_strategy
      - primary_action_emphasis

  critics:
    - product
    - donor
    - ux
    - visual
    - accessibility
    - responsive
    - implementation

  acceptance:
    product_correctness: required
    donor_semantics: required_when_applicable
    visual_quality: required
    accessibility: required
    responsive_realism: required
    implementation_feasibility: required
```

---

# 6.7 Anti-pattern handling

Rev 3.1 explicitly reuses the existing prohibited patterns from `design-authority-projector.mjs`.

New patterns are additive and should be versioned through a registry or design policy, not copied inconsistently into multiple prompts.

Minimum retained existing patterns:

- `FAKE_DATA`
- `PLACEHOLDER_HELPER_TEXT`
- `DEAD_CONTROLS`
- `GENERIC_AI_UI`
- `DONOR_BRAND_AUTHORITY`
- `RAW_TECHNICAL_IDS`

Recommended additional guided-design anti-patterns:

- `EXCESSIVE_CARD_NESTING`
- `ARBITRARY_GRADIENTS`
- `EXCESSIVE_PILLS`
- `VISUAL_CLUTTER`
- `DUPLICATED_NAVIGATION`
- `INVENTED_METRICS`
- `MEANINGLESS_HERO`
- `UNSTRUCTURED_LONG_SCROLL`
- `INCONSISTENT_RADII`
- `INCONSISTENT_ICON_WEIGHT`
- `DECORATIVE_ANALYTICS`
- `UNSUPPORTED_PROMOTIONAL_CONTENT`

---

# 6.8 Design modes as process phases

## EXPLORE

Purpose:

- search the design space;
- produce 2–4 materially different candidates;
- preserve all product and donor semantics;
- allow high compositional freedom.

The system may vary:

- grouping;
- hierarchy treatment;
- hero strategy;
- imagery;
- card/open-surface balance;
- proportions;
- type scale within bounds;
- contextual navigation presentation.

It may not vary:

- required actions;
- required states;
- business logic;
- navigation meaning;
- donor semantics;
- security behaviour.

## CONVERGE

Purpose:

- select or synthesize a coherent direction;
- reduce creative freedom;
- preserve major composition;
- improve weak areas.

A convergence packet must state:

```yaml
preserve: [...]
correct: [...]
improve: [...]
forbid: [...]
```

## RECONSTRUCT

Purpose:

- treat accepted visual authority as binding;
- build the production UI;
- allow only implementation-required adaptation;
- enforce parity evidence.

---

# 6.9 Candidate generation router evolution

`design-provider-router.mjs` should evolve rather than be replaced.

It should continue to decide provider eligibility and strategy, but receive richer inputs such as:

- design provenance mode;
- design iteration phase;
- provider capability;
- provider health;
- provider qualification evidence;
- candidate diversity requirement;
- required output type;
- donor requirement;
- visual-reference capability;
- design-model capability.

Provider routing must remain fail-closed.

Stitch, Figma, direct model generation, or future discovered design providers remain adapters behind the same authority contract.

---

# 6.10 Candidate provider policy

Every provider must declare:

```yaml
provider:
  provider_id: ...
  authority: NON_AUTHORITATIVE_CANDIDATE
  qualification_required: true
  supported_phases:
    - EXPLORE
    - CONVERGE
  supported_inputs:
    - structured_prompt
    - image_reference
    - donor_screen
  supported_outputs:
    - image
    - design_artifact
    - code
  network_boundary: ...
  retention_policy: ...
  sensitive_data_allowed: false
```

A provider unavailable at runtime must not block the system if another qualified route can preserve acceptance requirements.

---

# 6.11 Candidate diversity control

Candidate diversity must be bounded, not random.

```yaml
candidate_variation:
  allowed:
    - section_composition
    - imagery_position
    - surface_strategy
    - emphasis
    - typography_proportion

  fixed:
    - product_truth
    - required_content
    - navigation_semantics
    - donor_semantics
    - money_behavior
    - security_behavior
```

---

# 6.12 Critic architecture

Critics produce structured evidence.

## Product critic

Checks:

- required actions;
- required states;
- product truth;
- no invented capabilities;
- no fake data.

## Donor critic

When donor modes apply:

- preserves donor semantics;
- respects applicability registry;
- respects wholesale/partial donor boundaries;
- removes prohibited donor branding where required;
- does not silently reinterpret donor workflow.

## UX critic

Checks:

- primary task clarity;
- information scent;
- cognitive load;
- navigation clarity;
- discoverability;
- control placement.

## Visual critic

Checks:

- hierarchy;
- spacing;
- balance;
- typography;
- surface discipline;
- polish;
- coherence;
- originality;
- image treatment.

## Accessibility critic

Checks:

- contrast;
- target size;
- semantic grouping;
- state differentiation;
- text readability;
- focus behaviour.

## Responsive critic

Checks:

- hierarchy preservation;
- overflow;
- adaptation;
- mobile ergonomics;
- elimination of avoidable long-scroll dashboard structures.

## Implementation critic

Checks:

- component feasibility;
- state completeness;
- real data binding feasibility;
- performance implications;
- animation feasibility;
- platform consistency.

---

# 6.13 Synthesis without collage

The system may synthesize multiple candidates only when compatible.

Example:

```text
Candidate A: strongest hierarchy
Candidate B: strongest quick-action treatment
Candidate C: strongest hero balance
```

A synthesis pass may incorporate compatible strengths, but must regenerate one coherent whole.

It must not mechanically paste unrelated visual fragments.

---

# 6.14 Visual authority promotion

Existing promotion rules remain authoritative.

A promoted visual authority should additionally capture:

```yaml
visual_authority:
  candidate_id: ...
  candidate_hash: ...
  authority_projection_hash: ...
  composition_locked: true
  hierarchy_locked: true
  section_order_locked: true

  design_tokens:
    spacing: ...
    radii: ...
    typography: ...
    color_roles: ...
    elevations: ...

  component_relationships: [...]
  responsive_rules: [...]
  state_matrix: [...]
  motion_rules: [...]
  asset_refs: [...]
```

This prevents later implementation agents from "improving" the accepted design into a different screen.

---

# 6.15 Golden screen system

Accepted screens may become golden screens after explicit validation.

Golden screens define:

- quality floor;
- family resemblance;
- spacing maturity;
- typography quality;
- image quality;
- navigation treatment;
- responsive sophistication.

They do not force identical composition across DIAL products.

---

# 6.16 Design learning loop

Only accepted, evidenced work may teach reusable design knowledge.

The learning loop may extract:

- successful layout patterns;
- spacing relationships;
- typography ratios;
- component treatments;
- responsive strategies;
- hero patterns;
- navigation treatments;
- empty-state patterns;
- discovered anti-patterns.

Rejected candidate content must not enter reusable design knowledge by default.

---

# 7. WORKSTREAM C — SELF-HOSTED N8N AUTOMATION FABRIC

# 7.1 Goal

Use self-hosted n8n comprehensively for:

1. the DIAL development system; and
2. DIAL production business workflows.

n8n is an orchestration engine, not a domain authority.

---

# 7.2 Naming convention

To eliminate ambiguity:

```text
VEKL_N8N_CORPUS
    existing knowledge subsystem

DIAL_N8N_DEV
    self-hosted development workflow runtime

DIAL_N8N_PROD
    self-hosted production workflow runtime
```

Repository scripts and checks should use names that distinguish corpus qualification from runtime qualification.

For example:

```text
agent:vekl:n8n-corpus-check
agent:n8n-dev:qualification
agent:n8n-prod:qualification
```

Existing script names should be migrated compatibly if other automation depends on them.

---

# 7.3 Runtime authority boundary

n8n may:

- receive events;
- call governed APIs;
- wait;
- retry;
- route;
- enrich;
- notify;
- request approval;
- trigger external integrations;
- aggregate workflow evidence;
- schedule jobs;
- coordinate multi-system business processes.

n8n shall not independently author:

- price;
- money state;
- beneficiary allocation;
- account balance;
- grocery credit truth;
- inventory truth;
- final order truth;
- identity truth;
- access-control truth;
- Project Truth.

---

# 7.4 Runtime topology

Recommended logical topology:

```text
                         DIAL EVENT / COMMAND GATEWAY
                         /                         \
                        /                           \
              DIAL_N8N_DEV                    DIAL_N8N_PROD
                  |                                |
          Dev integrations                  Product integrations
                  |                                |
      VEKL / GitHub / design               suppliers / logistics /
      / CI / observability                 messaging / documents
                  |                                |
            DEV evidence                      PROD evidence
```

The two estates require independent credentials and data boundaries even if initially hosted on the same physical VM.

---

# 7.5 Development/production separation

Minimum isolation:

- separate n8n databases or strongly isolated schemas/users;
- separate encryption keys;
- separate credential stores;
- separate webhook domains/routes;
- separate service accounts;
- separate network policies;
- separate execution retention;
- separate role bindings;
- separate workflow promotion path;
- separate backups;
- separate audit streams.

Production credentials shall never be available to DIAL_N8N_DEV.

---

# 7.6 Reuse existing n8n security knowledge

The runtime programme must consume and reconcile with:

- `n8n-node-capability-map.json`
- `n8n-security-rules.json`
- `n8n-pattern-archetypes.json`

Do not create a second node-capability allowlist without mapping to the existing corpus.

If runtime requirements differ from corpus semantics, define an explicit projection such as:

```text
VEKL node capability knowledge
        ↓
runtime node policy compiler
        ↓
DEV node policy
PROD node policy
```

Production may be stricter than corpus knowledge.

---

# 7.7 Runtime node policy

Nodes should be classified at minimum:

```yaml
node_policy:
  capability_class: HTTP | DB | FILE | CODE | AI | MESSAGING | CLOUD | ...
  dev_allowed: true
  prod_allowed: false
  credentials_required: [...]
  outbound_network_class: ...
  filesystem_access: ...
  code_execution: ...
  risk_class: ...
  approval_required: ...
```

High-risk capabilities include:

- arbitrary shell;
- unrestricted code execution;
- filesystem traversal;
- arbitrary SQL write;
- arbitrary HTTP to unknown hosts;
- credential introspection;
- ungoverned AI nodes receiving sensitive context.

---

# 7.8 Event-driven integration contract

The preferred runtime contract is domain events, not polling tables.

Canonical event envelope:

```json
{
  "event_id": "evt_...",
  "event_type": "OrderPaid",
  "event_version": 1,
  "occurred_at": "2026-09-18T16:00:00Z",
  "producer": "dial-payments",
  "aggregate_type": "order",
  "aggregate_id": "ord_...",
  "correlation_id": "cor_...",
  "causation_id": "cmd_...",
  "tenant_id": null,
  "data_class": "BUSINESS",
  "payload": {},
  "signature": "..."
}
```

Required characteristics:

- globally unique event ID;
- schema version;
- producer identity;
- correlation/causation lineage;
- data classification;
- signature or trusted transport identity;
- replay-safe semantics.

---

# 7.9 Idempotency

Every externally visible side effect must have an idempotency strategy.

Example:

```text
workflow_effect_key =
hash(event_id + workflow_id + workflow_version + effect_name)
```

Side-effect adapters should refuse duplicate application unless explicitly designed as repeatable.

Examples:

- send one customer notification;
- create one supplier job;
- issue one document request;
- open one escalation;
- post one CRM activity.

---

# 7.10 Retry classes

Errors should be classified:

```text
TRANSIENT
RATE_LIMIT
AUTH_EXPIRED
DEPENDENCY_UNAVAILABLE
VALIDATION_FAILURE
POLICY_DENIED
PERMANENT_BUSINESS_FAILURE
UNKNOWN
```

Retry policy must depend on class.

Never blindly retry:

- invalid payment operations;
- policy-denied actions;
- malformed business commands;
- irreversible side effects without idempotency.

---

# 7.11 Dead-letter handling

Failed workflows must enter a governed exception path containing:

- execution ID;
- workflow version;
- triggering event;
- failure classification;
- retry count;
- last error;
- correlation ID;
- affected aggregate;
- whether business state was mutated;
- recommended operator action.

Production dead letters must generate operational alerts.

---

# 7.12 Workflow versioning

Every production workflow must have immutable release identity.

```yaml
workflow_release:
  workflow_id: ...
  semantic_version: ...
  content_hash: ...
  environment: PROD
  approved_by: ...
  promoted_from: ...
  test_evidence_hash: ...
  dependency_manifest_hash: ...
  node_policy_hash: ...
  secrets_contract_hash: ...
  rollback_version: ...
```

Editing a production workflow in-place without release evidence is forbidden.

---

# 7.13 Workflow promotion

```text
draft
→ static validation
→ corpus/security checks
→ dev execution
→ synthetic tests
→ failure-path tests
→ idempotency test
→ secret/network policy test
→ approval
→ signed/exported release
→ production import/promotion
→ canary
→ production active
```

---

# 7.14 Development-system workflows

DIAL_N8N_DEV should be fully utilized for high-value durable processes including:

## VEKL discovery

- scheduled horizon scans;
- source fetch;
- freshness checks;
- candidate triage queues;
- research evidence collection;
- stale-resource alerts.

VEKL remains decision authority.

## Research harvest

- build source batches;
- invoke approved research workers;
- collect outputs;
- normalize artifacts;
- trigger verification;
- persist evidence;
- notify Hermes.

## Frontend design

- assemble candidate-generation jobs;
- dispatch to eligible design providers;
- gather candidates;
- invoke critics;
- produce revision packets;
- surface candidate evidence;
- trigger owner/design-authority review.

n8n does not promote visual authority autonomously where owner/design-authority approval is required.

## CI/CD support

- workflow triggers from repository events;
- evidence gathering;
- artifact collection;
- release notifications;
- failed-gate escalation.

n8n must not bypass GitHub/CI branch protections.

## Operational control support

- schedule non-authoritative checks;
- notify Hermes;
- aggregate status;
- route approvals.

Hermes/Oracle remain control authorities.

---

# 7.15 Production product workflows

## Dial a Spare

Suitable n8n workflows:

- supplier catalogue synchronization;
- supplier quote request routing;
- catalogue enrichment jobs;
- image ingestion coordination;
- availability refresh;
- out-of-stock notifications;
- supplier exception escalation;
- order communication;
- post-purchase follow-up;
- warranty-document collection.

Authoritative price/order/payment/inventory state remains in DIAL services.

## Dial a Tech

Suitable workflows:

- technician notification;
- appointment coordination;
- parts-needed requests;
- job evidence collection;
- overdue-job escalation;
- customer status notifications;
- completion document routing.

## Dial Groceries

Suitable workflows:

- round reminders;
- supplier coordination;
- collection-window notifications;
- fulfilment exception handling;
- delivery coordination;
- member communication.

Grocery credits and entitlement logic remain authoritative outside n8n.

## Dial Logistics

Suitable workflows:

- delivery assignment notifications;
- ETA event propagation;
- failed-delivery recovery;
- proof-of-delivery processing;
- partner callbacks;
- exception escalation.

Routing/fulfilment truth remains domain-owned.

## Dial Care

Suitable workflows:

- service-due reminders;
- inspection requests;
- service-provider coordination;
- maintenance document collection;
- condition-event escalation;
- recurring schedule orchestration.

---

# 7.16 Human approval nodes

High-impact workflows must support human approval.

Examples:

- supplier onboarding;
- production workflow promotion;
- high-value exception handling;
- unusual refund-support processes;
- design-authority promotion;
- external campaign publication;
- privileged integration changes.

Approval identity, timestamp, decision, and object hash must be retained.

---

# 7.17 Secrets

Secrets must not be embedded in workflow JSON.

Required controls:

- n8n credential store;
- environment-specific secret identity;
- least privilege;
- rotation;
- no secret echo in execution logs;
- redaction;
- explicit credential ownership;
- separate dev/prod secrets.

---

# 7.18 Network policy

Production n8n should have deny-by-default outbound access where operationally practical.

Approved hosts/services should be declared by workflow/integration class.

Arbitrary runtime URL injection should be forbidden for privileged workflows unless mediated by a validated allowlist.

---

# 7.19 Database policy

n8n should prefer service APIs.

Direct DB access is permitted only when:

- read-only analytics/support use is justified; or
- an explicit administrative contract exists.

Direct authoritative table mutation by generic workflow nodes is forbidden.

---

# 8. CROSS-WORKSTREAM CONTRACTS

# 8.1 VEKL → frontend

VEKL may provide:

- design archetypes;
- qualified design resources;
- provider capability evidence;
- accepted prompt primitives;
- accessibility guidance;
- platform guidance;
- reusable patterns.

VEKL may not change screen Product Truth.

---

# 8.2 Frontend → VEKL

Accepted screens may yield:

- validated pattern descriptors;
- anti-pattern findings;
- component relationships;
- responsive strategies;
- prompt efficacy evidence.

Only accepted evidence enters admitted knowledge.

---

# 8.3 VEKL → n8n runtime

VEKL may provide:

- safe workflow patterns;
- node capability knowledge;
- security anti-patterns;
- integration guidance;
- version-specific implementation knowledge.

VEKL does not deploy production workflows directly.

---

# 8.4 n8n runtime → VEKL

Runtime evidence may produce candidate learning signals:

- workflow success rate;
- recurring failure mode;
- node reliability;
- retry behaviour;
- integration fragility;
- operational anti-patterns.

These signals enter the candidate/analysis path first and require qualification before becoming admitted knowledge.

---

# 8.5 Hermes → n8n

Hermes may request governed workflow actions through typed commands.

Hermes must not receive unrestricted shell or arbitrary workflow-admin power by default.

---

# 8.6 n8n → Hermes

n8n may send:

- alerts;
- approval requests;
- status summaries;
- exception reports;
- completion evidence.

Status must carry evidence references, not unsupported "success" prose.

---

# 9. MODEL AND HARNESS POLICY CLARIFICATION

Rev 3.1 corrects ambiguity in Rev 3.0.

## 9.1 Adaptive execution plane

The adaptive routing system may:

- discover models;
- qualify models;
- learn performance;
- route based on availability/capability;
- update candidate compatibility through governed evidence.

Model names must not become permanent architectural assumptions here.

## 9.2 Locked Hermes runtime policy

A locked owner-control chain remains locked until explicitly changed by owner-authorized Project Truth evolution.

Adaptive routing does not silently override it.

## 9.3 Harness compatibility

A model/harness pair absent from `HARNESS_MODEL_COMPATIBILITY.json` remains blocked until qualified.

Composition is preferred over fictional compatibility.

---

# 10. DECISION RECORDS

Implementation shall create three next-sequence `DEC-*` records after inspecting the live log.

Conceptual titles:

```text
DEC-NEW-1
VEKL Open-World Discovery Extends Existing Source Registry Without Creating a Second Trust Authority

DEC-NEW-2
Guided Generative Frontend Extends Existing Design Authority and Separates Provenance Mode from Iteration Phase

DEC-NEW-3
Self-Hosted n8n Runtime Fabric Is Adopted for Development and Production Orchestration Without Becoming Domain Authority
```

The actual IDs shall be the next available live IDs, not hard-coded by this document.

Each decision must include:

- owner authority;
- scope;
- superseded assumptions;
- consequences;
- enforcement points;
- evidence refs;
- reopen conditions.

---

# 11. REPOSITORY LAYOUT

Rev 3.1 does not introduce a new top-level `/platform/` hierarchy.

New work should fit the existing repository structure.

Illustrative additions:

```text
agent-system/
  orchestration/
    discovery-...
    design-...
    n8n-runtime-qualification-...

  engineering-knowledge/
    registries/
      ...
    automation/
      existing n8n corpus files
      ...

  registries/
    existing design/adaptive/decision policies
    ...

deploy/
  n8n/
    dev/
    prod/
    shared/

docs/
  dial/
    final-audit/
      06_DEVELOPMENT_SYSTEM/
        ...
```

Exact placement must be resolved against current repo conventions before implementation.

---

# 12. CONTROL-PLANE FINGERPRINT AND REQUALIFICATION

Because implementation touches fingerprinted control-plane paths, qualification is mandatory.

Required sequence:

```text
baseline fingerprint
        ↓
capture current external orchestration gate
        ↓
implement bounded changes
        ↓
unit/integration tests
        ↓
negative tests
        ↓
npm run verify
        ↓
orchestration qualification
        ↓
new control-plane fingerprint
        ↓
external gate requalification
        ↓
evidence commit
```

No agent may conclude "development ready" from tests alone if the external gate still rejects the changed fingerprint.

---

# 13. NEGATIVE TESTING REQUIREMENTS

DIAL's verification discipline requires proving gates fail.

The programme must intentionally test failure cases.

## VEKL examples

- community source attempts to claim T1;
- candidate graph item attempts authority retrieval;
- mutable repository attempts executable activation;
- sandbox attempts to access a production secret;
- stale source attempts silent use as current.

## Frontend examples

- candidate invents product feature;
- donor semantics removed;
- wrong iteration/provenance field used;
- fake metric introduced;
- rejected candidate attempts promotion;
- provider artifact violates quarantine.

## n8n examples

- duplicate event delivered twice;
- production workflow receives dev credential;
- unapproved node used;
- arbitrary host requested;
- direct money-state mutation attempted;
- workflow version changed without promotion;
- transient dependency fails;
- irreversible effect retried without idempotency key.

A gate that has never been induced to fail is not considered fully evidenced.

---

# 14. OBSERVABILITY

All three workstreams require structured observability.

## VEKL

Metrics:

- discoveries per domain;
- qualification rate;
- rejection reasons;
- time to admission;
- stale-resource count;
- replacement discoveries;
- trust-tier distribution.

## Frontend

Metrics:

- candidates per screen;
- critic rejection reasons;
- convergence count;
- visual-regression rate;
- donor-preservation failures;
- owner rejection rate;
- implementation parity failures.

## n8n

Metrics:

- workflow executions;
- success/failure rate;
- retry rate;
- dead letters;
- duplicate suppression;
- queue time;
- provider latency;
- workflow version;
- high-risk node usage;
- prod/dev separation violations.

---

# 15. SECURITY THREAT MODEL

Threats include:

- supply-chain compromise from discovered repos;
- prompt/resource poisoning;
- community-source authority escalation;
- malicious design-provider output;
- donor code authority leakage;
- workflow credential exfiltration;
- webhook forgery;
- event replay;
- workflow injection;
- unrestricted HTTP egress;
- arbitrary-code nodes;
- cross-environment credential leakage;
- unauthorized workflow promotion;
- GraphRAG trust confusion.

Primary controls:

- immutable provenance;
- trust tiers;
- candidate/admitted separation;
- sandbox isolation;
- quarantine;
- code/dependency review;
- signatures;
- event idempotency;
- network allowlists;
- environment separation;
- node policies;
- Project Truth authority checks;
- explicit promotion.

---

# 16. IMPLEMENTATION PHASES

# Phase 0 — Baseline and freeze

- inspect current master;
- record SHA;
- record current fingerprint;
- record current `npm run verify` state;
- inventory existing frontend files;
- inventory VEKL registries;
- inventory n8n corpus;
- inventory model-routing policies;
- identify current decision sequence.

Deliverable: `REV_3_1_BASELINE_EVIDENCE`.

---

# Phase 1 — Canon decisions

Create next-sequence decision records.

No implementation should assume proposed canonical status before owner-authorized decision evidence exists.

---

# Phase 2 — VEKL discovery lifecycle

Implement:

- discovery lifecycle state;
- candidate records;
- source identity normalization;
- tier-assignment rules;
- discovery audit history;
- sensitive-data policy;
- candidate/admitted graph separation or equivalent retrieval enforcement.

Do not yet enable executable trials.

---

# Phase 3 — VEKL sandbox qualification

Implement:

- immutable exact-artifact capture;
- sandbox runner;
- network/secret isolation;
- resource limits;
- trial evidence;
- executable-admission contract;
- negative tests.

---

# Phase 4 — Frontend schema reconciliation

Implement:

- `design_iteration_phase`;
- explicit provenance/iteration separation;
- backward compatibility for existing `design_mode`;
- donor compatibility;
- anti-pattern registry extension.

This phase must pass existing donor checks unchanged or intentionally evolved with evidence.

---

# Phase 5 — Guided candidate system

Implement:

- Screen Quality Packet;
- design-freedom budget;
- prompt assembler;
- candidate count/diversity;
- provider-router extensions;
- specialist critic manifests;
- synthesis/revision packets;
- convergence state.

---

# Phase 6 — Visual authority integration

Integrate the new candidate evidence with:

- quarantine;
- candidate manifests;
- admission;
- promotion;
- parity checks;
- visual-authority freeze.

Test with a real DIAL screen, preferably a high-value Dial a Spare Android home screen, using Stitch where live qualification is available.

---

# Phase 7 — n8n runtime infrastructure

Stand up:

```text
DIAL_N8N_DEV
DIAL_N8N_PROD
```

with:

- pinned version;
- database isolation;
- encrypted credentials;
- environment isolation;
- backups;
- TLS;
- audit logging;
- restricted management surface;
- network policies.

---

# Phase 8 — n8n runtime governance

Implement:

- runtime node policy projected from existing VEKL n8n knowledge;
- workflow release manifest;
- event envelope;
- idempotency library;
- retry policy;
- dead-letter contract;
- secret policy;
- promotion pipeline;
- runtime qualification scripts.

---

# Phase 9 — Development workflows

Start with high-value, lower-risk workflows:

1. VEKL freshness/discovery orchestration;
2. frontend candidate orchestration;
3. CI evidence aggregation;
4. research harvest tracking;
5. Hermes notifications.

Do not begin with payment or money-sensitive flows.

---

# Phase 10 — Production workflow pilots

Pilot one workflow per product domain with low authority risk.

Examples:

- Spare supplier availability notification;
- Tech appointment notification;
- Groceries reminder;
- Logistics delivery-status notification;
- Care service-due reminder.

Each pilot requires:

- synthetic test;
- duplicate delivery test;
- dependency outage test;
- rollback;
- audit evidence.

---

# Phase 11 — Control-plane requalification

After all fingerprinted code changes:

- run full verification;
- run orchestration qualification;
- compute new fingerprint;
- update external qualification evidence;
- verify owner control;
- verify no second authority was created.

---

# Phase 12 — Production certification

Certification requires evidence that all three workstreams satisfy their acceptance contracts independently.

---

# 17. ACCEPTANCE CRITERIA

# 17.1 VEKL open-world acceptance

Must prove:

- a resource not previously listed can be discovered;
- discovery does not imply trust;
- lifecycle state is persisted;
- trust tier uses existing vocabulary;
- official/community distinction is preserved;
- candidate material cannot override canon;
- executable content cannot activate directly from mutable discovery;
- sandbox has no DIAL credentials;
- exact-version provenance is required before activation;
- admitted material enters existing registry/GraphRAG path;
- stale/superseded resources are handled deterministically.

A concrete acceptance demonstration should discover and evaluate a previously unregistered real engineering resource.

---

# 17.2 Frontend acceptance

Must prove:

- existing design-provider policy remains valid;
- donor semantics remain enforced;
- `design_iteration_phase` does not collide with provenance mode;
- existing prohibited patterns remain active;
- Product Truth is identical across candidate generation;
- at least three candidates can be generated for an EXPLORE screen;
- candidates materially differ visually without semantic drift;
- critic outputs are structured;
- convergence preserves chosen direction;
- accepted visual authority is frozen;
- RECONSTRUCT implementation is compared to authority;
- functional correctness alone cannot pass a visually degraded screen.

A real Dial a Spare Android home-screen exercise should be used for certification.

---

# 17.3 n8n development acceptance

Must prove:

- DIAL_N8N_DEV is self-hosted;
- no production credentials are present;
- workflow releases are versioned;
- VEKL corpus and runtime meanings are unambiguous;
- existing node/security knowledge is reused;
- discovery/research/design workflows execute durably;
- retries and dead letters work;
- workflow status is observable;
- Hermes receives evidence-backed notifications.

---

# 17.4 n8n production acceptance

Must prove:

- DIAL_N8N_PROD is isolated from DEV;
- workflow promotion is controlled;
- event signature/trust is checked;
- duplicate events do not duplicate side effects;
- production workflow cannot mutate prohibited domain authority;
- secrets are not serialized into workflow definitions;
- rollback works;
- dead-letter paths work;
- audit trail identifies workflow version and triggering event.

---

# 18. MIGRATION COMPATIBILITY

Existing behaviour must continue during rollout.

Compatibility requirements:

- current VEKL resolution continues for admitted resources;
- current design routes continue when guided generation is not requested;
- existing donor checks continue;
- current Stitch policy remains fail-closed;
- current Figma promotion semantics continue;
- existing `agent:vekl:n8n-check` remains functional until explicitly renamed/migrated;
- Hermes owner-control chain remains unchanged unless separately authorized;
- external orchestration gate remains authoritative.

Feature flags should be used for new discovery and guided-design behaviour where rollback is useful.

---

# 19. ROLLBACK

## VEKL

Disable discovery adapters and continue admitted-registry retrieval.

Do not delete discovery evidence.

## Frontend

Disable guided multi-candidate orchestration and fall back to existing provider/candidate pipeline.

Do not delete accepted visual authority.

## n8n

Disable selected workflows at ingress/event subscription layer.

Authoritative domain services must continue to operate where business continuity requires.

n8n must never be the only place where core business truth exists.

---

# 20. IMPLEMENTATION FILE IMPACT MAP

Expected existing files likely to require extension or integration include:

```text
agent-system/orchestration/design-provider-router.mjs
agent-system/orchestration/design-candidate-admission.mjs
agent-system/orchestration/design-authority-projector.mjs
agent-system/registries/DESIGN_PROVIDER_POLICY.json

agent-system/engineering-knowledge/registries/ENGINEERING_RESOURCE_SOURCE_REGISTRY.json
agent-system/engineering-knowledge/registries/ENGINEERING_RESOURCE_REGISTRY.json

agent-system/engineering-knowledge/automation/N8N_WORKFLOW_PATTERN_REGISTRY.json
agent-system/engineering-knowledge/automation/n8n-node-capability-map.json
agent-system/engineering-knowledge/automation/n8n-pattern-archetypes.json
agent-system/engineering-knowledge/automation/n8n-security-rules.json

agent-system/registries/DECISION_LOG.json
agent-system/registries/ADAPTIVE_ROUTING_POLICY.json
agent-system/registries/HARNESS_MODEL_COMPATIBILITY.json

agent-system/orchestration/development-unblock.mjs
package.json
```

The exact list must be derived from live code inspection at implementation time.

---

# 21. REQUIRED NEW CONTRACTS / SCHEMAS

Recommended additions include:

```text
DiscoveryCandidateRecord
DiscoveryLifecycleTransition
ExecutableTrialManifest
ResourceQualificationManifest
GraphTrustProjection

ScreenQualityPacket
DesignIterationPhase
DesignFreedomBudget
DesignCriticReport
DesignRevisionPacket
DesignSynthesisManifest
GoldenScreenDescriptor

N8nWorkflowReleaseManifest
N8nRuntimeNodePolicy
DomainEventEnvelope
WorkflowEffectIdempotencyRecord
WorkflowDeadLetterRecord
WorkflowPromotionEvidence
```

All schemas require version fields and deterministic hashing where they participate in gates.

---

# 22. DETERMINISTIC HASHING AND PROVENANCE

Critical generated artifacts should carry:

- schema version;
- source identifiers;
- canonical serialization;
- content hash;
- upstream dependency hashes;
- creation timestamp where appropriate;
- producer identity;
- authority state.

Examples:

```text
ScreenQualityPacket hash
Candidate hash
Critic report hash
Visual authority hash
Workflow release hash
Discovery candidate hash
Trial evidence hash
Qualification manifest hash
```

Mutable timestamps should not contaminate identity hashes unless intentionally excluded through a canonical hashing rule.

---

# 23. OWNER AUTHORITY

The following require explicit owner or already-authorized governance paths, according to existing Project Truth policy:

- changing the requested architecture itself;
- redefining business or money semantics;
- changing locked providers where lock is material;
- promoting design authority where existing policy requires owner/design authority;
- changing production workflow powers;
- changing security boundaries.

Automated evidence may recommend.

It may not self-authorize canon.

---

# 24. WHY REV 3.1 IS STRUCTURALLY DIFFERENT FROM REV 3.0

Rev 3.0 said, in effect:

```text
build open-world VEKL
build guided frontend
build n8n fabric
```

Rev 3.1 says:

```text
EXTEND existing VEKL registry + GraphRAG authority
    with open-world discovery

EXTEND existing design provider/admission/donor authority
    with guided multi-candidate creative intelligence

ADD a runtime n8n fabric
    while explicitly reusing and distinguishing
    the existing VEKL n8n corpus
```

This eliminates the largest second-authority risks found in review.

---

# 25. FINAL CANONICAL PRINCIPLES

The revision is governed by the following principles.

## Principle 1 — Discover broadly, trust narrowly

VEKL may search beyond the admitted corpus, but authority still requires qualification.

## Principle 2 — Discovery state is not trust tier

Never conflate how much DIAL has evaluated something with who/what the source actually is.

## Principle 3 — Trial is not activation

Unknown executable resources may be sandboxed under policy, but activation requires exact-version provenance and qualification.

## Principle 4 — Product truth stays rigid; composition may explore

The design model receives freedom where professional judgment adds value, not where business semantics matter.

## Principle 5 — Provenance mode and creative phase are separate axes

`DONOR_ADAPT` and `EXPLORE` can both be true.

## Principle 6 — Preserve donor semantics

Guided creativity cannot erase donor-authority rules.

## Principle 7 — Generate candidates, then become deterministic

Creativity decreases from EXPLORE → CONVERGE → RECONSTRUCT.

## Principle 8 — n8n executes workflows, not business truth

Durable orchestration is powerful precisely because authority boundaries remain elsewhere.

## Principle 9 — The n8n corpus and n8n runtime are distinct but symbiotic

One learns workflow patterns; the other executes qualified workflows.

## Principle 10 — Adaptive routing does not supersede locked Hermes policy

Different control layers retain distinct authorities.

## Principle 11 — Existing repository gates remain superior

The architecture is not complete until current verification, donor checks, decision checks, and control-plane qualification pass.

## Principle 12 — Requalification is part of implementation

Changing fingerprinted control-plane code invalidates prior qualification until fresh evidence is produced.

---

# 26. TARGET END STATE

When Rev 3.1 is fully implemented:

DIAL development can encounter a newly released tool tomorrow, discover it without pre-registration, investigate it safely, pin and evaluate the exact artifact, classify it using the existing VEKL trust model, admit it with provenance if warranted, and make it available to future development without weakening canon.

DIAL frontend development can receive the same immutable product truth and donor constraints, generate several professional visual interpretations through Stitch, Figma, direct frontier models, or future qualified providers, critique them systematically, converge on the strongest coherent direction, freeze that direction into visual authority, and reconstruct production software against it.

DIAL development and production can use self-hosted n8n aggressively for durable automation while domain services, Project Truth, identity, money, and security remain singular authorities.

The system is therefore neither closed and rigid nor uncontrolled and generative.

It is:

> **adaptive in discovery, creative in exploration, deterministic in qualification, strict in authority, and evidence-driven in completion.**

---

# 27. IMPLEMENTATION MISSION DEFINITION

Rev 3.1 is complete only when all of the following are true:

```text
[ ] Repository baseline recorded
[ ] Owner-authorized DEC records created
[ ] Open-world discovery lifecycle implemented
[ ] Existing T0–T4 trust model preserved
[ ] Candidate/admitted graph boundary proven
[ ] Executable sandbox proven isolated
[ ] Exact-version executable admission proven
[ ] design provenance/iteration collision eliminated
[ ] donor checks remain green
[ ] existing prohibited patterns preserved
[ ] Screen Quality Packet implemented
[ ] multi-candidate design generation implemented
[ ] critics implemented
[ ] convergence implemented
[ ] visual authority promotion remains governed
[ ] real Dial a Spare home-screen certification performed
[ ] VEKL n8n corpus explicitly distinguished from runtime
[ ] DIAL_N8N_DEV running and qualified
[ ] DIAL_N8N_PROD running and qualified
[ ] node/security policies reuse existing n8n knowledge
[ ] event contract implemented
[ ] idempotency proven
[ ] retry/dead-letter behaviour proven
[ ] dev/prod secret isolation proven
[ ] low-risk product pilots passed
[ ] full npm verification green
[ ] negative tests evidenced
[ ] control-plane fingerprint requalified
[ ] external orchestration gate accepts new qualified state
[ ] implementation evidence committed
```

Passing only code tests is insufficient.

Passing only architectural review is insufficient.

Passing only visual acceptance is insufficient.

The complete revision requires authority, implementation, evidence, and requalification to agree.

---

# 28. DOCUMENT HIERARCHY RECOMMENDATION

This umbrella document should be accompanied by three subordinate implementation specifications:

1. **DIAL VEKL Open-World Discovery & Knowledge Qualification — Rev 1**
2. **DIAL Guided Creative Frontend Evolution — Rev 1**
3. **DIAL Self-Hosted n8n Automation Fabric — Rev 1**

Those documents may evolve at different rates, while this Rev 3.1 remains the cross-system architectural contract.

---

# 29. CLOSING ARCHITECTURE STATEMENT

DIAL shall not confuse determinism with predetermination.

Determinism means that DIAL can prove:

- what truth was authoritative;
- which resource was used;
- what version was used;
- what trust class applied;
- what model/provider/harness was eligible;
- what candidate was generated;
- what donor rules applied;
- what critic evidence existed;
- who promoted authority;
- what workflow version executed;
- what event caused it;
- what side effect occurred;
- what tests ran;
- and why the system considered the result acceptable.

It does **not** mean that DIAL may only use resources it already knows, may only generate layouts already prescribed, or must encode every future business workflow directly into application code.

That distinction is the architectural core of Revision 3.1.
