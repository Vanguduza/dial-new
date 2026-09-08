# DIAL VERSIONED ENGINEERING KNOWLEDGE LAYER (VEKL) — FEDERATED RESOURCES + PROJECT-AWARE HERMES RESEARCH

**Status:** ACTIVE DIAL DEVELOPMENT CANON — REV 2 + VEKL 2.1 RESOLVER AMENDMENT
**Decision:** `DEC-020`; deterministic resolver/cohesion amendment `DEC-024`
**Scope:** DIAL development system only. This is not DIAL business-runtime intelligence and is not DDE runtime architecture.  
**Supersedes for active VEKL intent:** `DIAL_VERSIONED_ENGINEERING_KNOWLEDGE_LAYER_GOOGLE_SKILLS_HERMES_v1.md`. Rev 1 remains provenance for the immutable-skill foundation.

---

## 1. Purpose

VEKL is DIAL's governed, versioned **engineering knowledge and capability layer**. It gives the Oracle-hosted Hermes development control plane selective access to the best relevant engineering knowledge for the work DIAL is actually about to perform.

VEKL is deliberately broader than Agent Skills. Skills are one resource class among many. A packet may benefit from official documentation, source repositories, release notes, maintainer issues, package metadata, security advisories, approved plugins/tools/MCPs, DIAL project rules, hooks, workflow loops, or bounded community evidence. VEKL decides what can be discovered, trusted, cached, activated, executed and remembered.

The durable operating principle is:

> **DIAL canon decides what must be built. Project-aware Hermes anticipates what engineering knowledge will be needed. VEKL qualifies and selects the smallest relevant resource set. Sol or Sonnet uses it under the same provenance. Verification decides whether the result is acceptable.**

VEKL must increase engineering quality without becoming a second architect, source of truth, development plan, model manager or memory authority.

---

## 2. Authority hierarchy

The hierarchy is binding:

1. DIAL Project Truth and locked decisions;
2. Feature/FRC/security/eventuality/current source-of-truth contracts;
3. current repository code, schemas, tests and fresh evidence;
4. DIAL development/tooling policy, project-local rules and approved process hooks;
5. approved packet Engineering Knowledge Activation Manifest;
6. official/maintainer engineering references selected by VEKL;
7. approved external executable capabilities such as skills/plugins/tools/MCPs;
8. community corroboration and issue/forum signals;
9. feature-scoped non-authoritative memory and prior outcomes;
10. model prior knowledge.

A lower layer may never silently override a higher layer.

VEKL research or a vendor resource may not:

- create product requirements;
- remove or thin an authoritative feature;
- create a second source of truth;
- change money, settlement, pricing, Health or privacy authority;
- replace Oracle/Cloudflare/Supabase/MapLibre or another locked provider/stack because external guidance prefers another provider;
- advance a DIAL implementation/security/NFR/release gate;
- install dependencies, plugins, hooks or system tooling outside the normal donor/tooling gate;
- self-certify specialist review;
- export secrets, customer records, payment data or identifiable Health data to public research services.

---

## 3. VEKL resource taxonomy

VEKL recognises these resource classes:

| Resource class | Typical use | Default posture |
|---|---|---|
| `OFFICIAL_DOC` | current API/platform guidance | reference-only |
| `REPOSITORY` | source examples, implementation details | reference-only until donor adoption |
| `RELEASE_NOTES` | version drift, migration and breaking changes | reference-only |
| `ISSUE_DISCUSSION` | maintainer-confirmed defects/workarounds | corroboration/reference |
| `FORUM_QA` | edge cases and real-world experience | corroboration/discovery only |
| `SECURITY_ADVISORY` | vulnerabilities and mitigations | reference-only + security review |
| `PACKAGE_REGISTRY` | current versions/metadata | reference-only; no automatic install |
| `SKILL` | procedural specialist knowledge | executable only after VEKL qualification |
| `PLUGIN` | packaged capability/tool integration | executable only after donor/security qualification |
| `TOOL` | bounded engineering action/research tool | policy-scoped; least privilege |
| `MCP_SERVER` | typed external capability | explicit tool contract + permissions |
| `RULESET` | DIAL project development policy | project-local process policy |
| `HOOK` | automatic process guard/context action | project-local or qualified executable capability |
| `WORKFLOW_LOOP` | persistent orchestration/review loop | project-local or qualified executable capability |
| `EXAMPLE_REFERENCE` | sample patterns/recipes | reference-only |

A resource being searchable does not make it executable. A resource being official does not make it authoritative over DIAL.

---

## 4. Source trust tiers

### T0 — DIAL project-local engineering policy

Examples:
- `TOOLING_USE_POLICY.md`;
- pre-tool guards;
- mission orchestration loop;
- DIAL-owned qualified wrappers.

These are part of DIAL's development process but still cannot supersede Project Truth or Feature contracts.

### T1 — official sources

Examples:
- official framework/service documentation;
- official repositories;
- official security advisories;
- official Android/Google Agent Skills.

Prefer T1 for API facts, version requirements, security behaviour and platform constraints.

### T2 — maintainer/community-primary sources

Examples:
- maintainer issue/discussion threads;
- package registry metadata;
- project release discussions.

Use for current defect clarification, compatibility and implementation nuance. Verify consequential claims against T1/current code.

### T3 — community corroboration

Example: Stack Overflow. Useful for hypotheses and edge-case corroboration. Never sufficient by itself for architecture, security, money, Health or provider decisions.

### T4 — community signal

Example: Reddit engineering discussions. Discovery signal only. It can tell Hermes what to investigate, not what DIAL should implement.

---

## 5. Initial federated source families

VEKL v2 registers DIAL-relevant sources rather than loading the internet indiscriminately. Current source families include:

- DIAL project-local policy/rules/hooks/loops;
- Next.js;
- React;
- TypeScript;
- Supabase;
- PostgreSQL;
- Playwright;
- Vitest;
- Zod;
- MapLibre;
- Nominatim;
- OSRM;
- VROOM;
- Meilisearch;
- OpenTelemetry;
- PostHog official engineering documentation for bounded product-analytics/rollout implementation;
- LiteLLM;
- Promptfoo;
- Chatwoot;
- Meta WhatsApp Cloud API / Flows;
- Cloudflare R2;
- Oracle Cloud Infrastructure;
- official Android Agent Skills;
- Google Agent Skills;
- GitHub issues/discussions;
- GitHub Advisory Database;
- npm metadata;
- Maven metadata;
- Stack Overflow corroboration;
- Reddit discovery signal.

This registry is intentionally extensible. A technology entering authoritative DIAL scope can add its official source family without making that technology a new source of DIAL product truth.

---

## 6. Two distinct VEKL paths

### 6.1 Passive engineering knowledge

Official docs, release notes, issues, advisory records, package metadata and forum evidence are **non-executable references**. They can be pre-researched and cached using read-only network requests subject to source allowlists, provenance and freshness rules.

Passive knowledge requires:

- source identity;
- trust tier;
- resource class;
- task-class mapping;
- retrieval mode;
- locator/URL/repository;
- freshness policy;
- fetched timestamp where cached;
- content hash where materialized;
- explicit authority classification;
- community corroboration flag where applicable.

### 6.2 Executable engineering capabilities

Skills, plugins, tools, MCP servers, third-party hooks and executable workflow components have a higher risk boundary. Discovery alone never activates them.

Before external executable capability activation, DIAL requires as applicable:

1. exact version/commit/artifact;
2. selected paths/components;
3. licence and provenance;
4. static/prompt/script/network review;
5. dependency/SCA/SBOM review where code executes;
6. DIAL conflict review;
7. deterministic task-domain evaluation;
8. security/specialist review where required;
9. Development Manager approval;
10. immutable snapshot/package or typed remote-tool contract;
11. runtime permission/capability restrictions;
12. rollback/revoke path.

No model may ad-hoc install a plugin or skill because it appears useful during a packet.

---

## 7. Ahead-of-work project-aware research

VEKL v2 adds a proactive research cycle driven by the persistent Oracle development mission.

Hermes does not wait for an implementation agent to become blocked before finding relevant engineering knowledge. It uses the **project-aware orchestration seat** to anticipate the next dependency-safe work defined by current DIAL truth.

### 7.1 Forecast authority inputs

The research manager reads, at minimum:

- `agent-system/canon/PROJECT_TRUTH.md`;
- the active consolidated development plan;
- `FEATURE_REGISTRY.json`;
- locked decisions;
- `ACTIVE_WORK.json` when present;
- the DIAL root mission state and priority directive;
- the latest project checkpoint pointer as continuity evidence.

Mission/checkpoint state is continuity only. It cannot override current repository canon.

### 7.2 Forecast model policy

Primary:

`Hermes → Codex App Server → exact GPT-5.6 Sol`

Fallback:

`official Claude Code → exact Claude Sonnet 5`

Both research modes are read-only against the repository. They may inspect canon/code, but may not edit, install, commit or mutate Git.

The model returns a structured forecast for the **next 3–5 dependency-safe packets**, including:

- probable Feature ID where known;
- objective;
- task classes;
- technologies;
- engineering unknowns/research questions;
- preferred registered source families;
- bounded search queries;
- risks and canon conflicts to avoid.

The model cannot invent a new work priority. It forecasts knowledge needs for the programme that DIAL already chose.

### 7.3 Refresh triggers

Ahead-of-work research refreshes when:

- Project Truth changes;
- the active Development Plan changes;
- the owner priority directive changes;
- the active Feature or target gate changes materially;
- the semantic research TTL expires;
- an operator explicitly requests a forced refresh.

The fingerprint is deliberately **semantic**. Mission turn numbers, packet IDs, RUNNING/BLOCKED transitions, repository commit churn unrelated to the forecast meaning and checkpoint timestamps do not by themselves invalidate an otherwise-current forecast. This prevents repeated manager-model calls after every orchestration cycle.

Under `DEC-022`, if Sol has a current proven account/rate/model cooldown, the research manager does not probe or invoke Sol again during that boundary. It records `ENGINEERING_RESEARCH_SOL_SKIPPED` and goes directly to exact Sonnet 5. If the current forecast fingerprint and TTL are still valid, neither model is invoked.

---

## 8. Research acquisition and cache

The research process writes only to project-scoped Oracle control state:

```text
/var/lib/dial-control/knowledge/research/
  current-forecast.json
  forecasts/<forecast-id>.json
  cache-index.json
  cache/<resource-cache-id>.json
```

The repository remains read-only during presearch.

Acquisition rules:

- allowlisted source hosts only;
- HTTP GET/read-only operations only for passive sources;
- no cookies or project credentials sent to public resources;
- bounded response size and timeouts;
- redirect host must remain allowlisted;
- text/JSON/XML-like content only by default;
- cache records store source, trust, URL, fetch time, content hash and authority;
- community results remain explicitly marked corroboration/discovery;
- cached research is `executable:false`;
- stale evidence may be used only as stale context and should be refreshed when material.

If Sol and Sonnet are unavailable or quota-limited, VEKL records `MODEL_UNAVAILABLE`. It does not invent a forecast from memory.

---

## 9. Packet-time deterministic selection — VEKL 2.1 law

A research cache is not injected wholesale into every development prompt. `DEC-024` replaces the former global top-N resource ranking with a hard-eligibility-first deterministic **minimal coalition**.

For each material packet:

1. resolve Feature/JIT canonical context;
2. classify the concrete engineering task and affected paths;
3. resolve approved Skills through the exact-pin Skill resolver — this is the only Skill-selection owner;
4. enumerate registered non-Skill engineering resources;
5. apply hard eligibility before any ranking: source admission, resource-class admission, lifecycle state, executable-source permission, required-tool availability and task-specific community evidence;
6. assign each eligible resource one stable `selection_role` and `selection_purpose`;
7. preserve explicitly mandatory project policy bindings;
8. make optional redundant peers compete only inside the same `(selection_purpose, selection_role)` slot;
9. keep complementary roles/purposes together until the explicit context budget is applied;
10. tie-break by stable resource identity so candidate input order cannot change selected identities;
11. persist the result, prune reasons and registry fingerprints in one Engineering Knowledge Activation Manifest;
12. supply the same manifest provenance to Sol and Sonnet.

Stable roles are `AUTHORITY`, `GUIDANCE`, `EXECUTOR`, `VERIFIER`, `POLICY`, `REUSE`, `DIAGNOSTIC` and `REFERENCE`. `AUTHORITY` here means official authority for the relevant **engineering reference fact** inside the selected knowledge coalition; it never outranks DIAL Project Truth, product/domain authority or release gates.

`maxResources` is a context budget, not a quality algorithm. It is applied after eligibility and slot competition. Descriptor-only delivery is the default; an external cached excerpt is injected eagerly only when the selection explicitly marks it directly relevant. Cached research remains non-executable.

Valid results include:

- approved exact-pin Skill + complementary passive references;
- passive references only;
- project-local policy only;
- no external resource required;
- relevant executable capability unavailable, which may fail closed for mandatory specialist task classes.

The generic resource resolver must never return a `SKILL`; duplicate Skill selection is a manifest invariant violation.

---

## 10. Engineering Knowledge Activation Manifest

The existing immutable Skill Activation Manifest is extended rather than replaced with a competing mechanism.

The manifest records:

- packet and mission IDs;
- Feature IDs;
- VEKL policy/resolver version;
- task classes;
- exact approved Skill IDs/commits/hashes/snapshot paths;
- selected resource IDs/classes/source IDs/trust tiers;
- each resource's deterministic `selection_role` and `selection_purpose`;
- selection reason and `context_delivery` mode;
- selected resource registry fingerprint;
- cached reference/content hashes where present;
- freshness state;
- activation mode;
- community corroboration requirement;
- current ahead-of-work research forecast ID;
- rejected/conflicting/redundant/budget-pruned resources;
- missing mandatory specialist classes;
- DIAL guard capsule;
- manifest hash;
- previous activation ID/re-resolution reason where applicable.

When current repository state is available, activation verification also checks that a selected resource is still registered, its source/class/state remains admitted, source trust has not silently changed and its registry fingerprint still matches. Any such drift requires audited re-resolution rather than silent reuse.

Resource selection is therefore reproducible and auditable rather than hidden in model browsing history.

---

## 11. Sol / Sonnet symmetry

VEKL runtime symmetry remains mandatory.

### Sol path

Hermes receives the packet-scoped approved skill directory plus Engineering Knowledge Activation Manifest metadata. Selected passive research evidence is rendered into the bounded context only when relevant.

### Sonnet fallback

Claude Code does not independently browse for different versions after failover. It receives the same manifest, skill bodies, constraints and cached resource evidence rendered from the persisted activation.

A failover cannot silently change:

- skill version;
- resource source;
- cached evidence hash;
- task constraints;
- research forecast identity.

If the task materially changes after failover or repository inspection, VEKL performs an explicit audited re-resolution and links the new activation to the previous activation.

---

## 12. Tools, plugins and MCPs

VEKL distinguishes *knowing a tool exists* from *having authority to execute it*.

Examples:

- Context7 is a policy-approved documentation resolver when available;
- Exa is a policy-approved external research connector when available;
- GitHub can provide repository/issue evidence through typed read actions;
- an MCP server is eligible only for its declared typed capabilities;
- generic shells are never introduced merely to make research convenient;
- third-party plugins remain donors and take their normal qualification gate.

Tool availability is part of packet resolution. A model must not pretend a connector was activated when it is not installed/authorized.

---

## 13. Rules, hooks and loops

DIAL's own development rules, hooks and persistent loops are first-class VEKL resources because they materially shape correct execution.

Examples:

- pre-tool guard;
- Feature/JIT context hook;
- mission-controller loop;
- checkpoint/handoff process;
- testing/security/reviewer routing rules.

These resources are normally `PROCESS_RULE`, not arbitrary prompt content. Their presence in the resource registry makes process provenance inspectable and permits future conflict analysis when vendor guidance contradicts a DIAL rule.

A third-party hook or workflow loop is not equivalent to a DIAL-owned process rule. External executable hooks/loops require qualification before use.

---

## 14. Community/forum policy

Community sources are useful precisely because official documentation does not capture every operational edge case. VEKL uses them without treating popularity as correctness.

Rules:

- community content can generate a hypothesis or candidate workaround;
- prefer recent, technically specific evidence;
- seek maintainer/official corroboration before consequential adoption;
- never copy credentials, opaque install scripts or unreviewed binary artifacts from forum answers;
- never let a forum answer change DIAL architecture or security policy;
- Reddit remains discovery signal only;
- Stack Overflow is corroboration only;
- GitHub maintainer issues/discussions may carry higher trust but still remain subordinate to current official docs/code and DIAL canon.

---

## 15. Security and privacy

Ahead-of-work research uses architectural/task descriptions and public code facts, not production data.

Forbidden external research payloads include:

- API keys/OAuth tokens/passwords;
- private SSH keys;
- Supabase service/secret keys;
- Meta/payment provider secrets;
- customer names/contact records where unnecessary;
- real payment/ledger contents;
- identifiable Health/claims/clinical records;
- proprietary supplier data not required for public technical research;
- private evidence packs whose contents are not necessary for the question.

Security-specific resources may inform a review but never self-certify the DIAL security gate.

---

## 16. Learning and outcome feedback

VEKL keeps two learning loops separate:

1. **resource-selection learning** — which sources/resources helped a task class;
2. **procedural wrapper learning** — safe reusable DIAL procedures derived from verified outcomes.

Observable outcomes may adjust future selection ranking. They are not project truth.

A learned wrapper remains staged until scan/eval/review/promotion. VEKL never rewrites an upstream vendor snapshot to “learn” from a packet.

---

## 17. Current Android slice

The qualified Android slice from Rev 1 remains valid inside VEKL v2:

- Adaptive Compose — approved constrained official skill;
- Navigation 3 — approved constrained official skill;
- Edge-to-edge — approved constrained official skill;
- Android Intent Security — approved constrained official skill + independent security review;
- DIAL Android Device Verification — approved safe wrapper;
- DIAL Android Testing Setup — approved safe wrapper.

The official Android CLI remains quarantined for a blocked installation pattern. The official Testing Setup skill remains barred from direct activation. The broader federated resource model does not weaken these decisions.

---

## 18. Example selection behaviours

### Grocery Rounds / Supabase RLS

Likely relevant:
- DIAL money/security/FRC policy;
- official Supabase RLS/Auth docs;
- PostgreSQL docs;
- current TypeScript/Vitest guidance;
- GitHub advisory data if dependencies are implicated;
- Stack Overflow only as corroboration for a concrete defect.

Not allowed:
- replacing Supabase because a forum recommends another backend;
- treating a successful test recipe as proof of money/security closure.

### Delivery mapping

Likely relevant:
- MapLibre;
- Nominatim;
- OSRM;
- VROOM;
- DIAL Delivery contracts.

Google Maps replacement remains blocked unless canon is explicitly reopened.

### WhatsApp support

Likely relevant:
- official Meta WhatsApp Cloud API/Flows docs;
- Chatwoot API-channel docs;
- DIAL WhatsApp/Support contracts;
- webhook security guidance.

Chatwoot never becomes the WhatsApp transaction or customer source of truth.

### DKRF / AI gateway

Likely relevant:
- LiteLLM;
- Promptfoo;
- OpenTelemetry;
- Supabase/Postgres/pgvector and Meilisearch official references;
- DIAL DKRF canon.

No retrieved resource may create a second RAG, model or business authority.

---

## 19. Repository implementation

Canonical registries:

```text
agent-system/engineering-knowledge/registries/
  ENGINEERING_SKILL_REGISTRY.json
  ENGINEERING_RESOURCE_SOURCE_REGISTRY.json
  ENGINEERING_RESOURCE_REGISTRY.json
  SKILL_CONFLICT_REGISTRY.json
  SKILL_BUNDLE_REGISTRY.json
  SKILL_PERFORMANCE_REGISTRY.json
```

Core modules:

```text
agent-system/orchestration/
  engineering-resource-registry.mjs
  engineering-resource-resolver.mjs
  engineering-research-manager.mjs
  engineering-presearch.mjs
  engineering-knowledge-broker.mjs
  skill-activation-store.mjs
  skill-resolver.mjs
  skill-outcome-recorder.mjs
  learned-skill-curator.mjs
```

Control CLIs:

```text
agent-system/bin/
  engineering-knowledge-check.mjs
  resources-resolve.mjs
  skills-check.mjs
  skills-resolve.mjs
  skills-qualify.mjs
  skills-eval.mjs
  skills-promote.mjs
  skills-revoke.mjs
```

Oracle scheduling:

```text
dial-engineering-research.service
dial-engineering-research.timer
dial-engineering-research.path
```

---

## 20. Acceptance requirements

VEKL Rev 2 with the VEKL 2.1 resolver amendment is repository-green only when tests prove at least:

1. official stack resources are preferred for matching tasks;
2. community evidence is marked corroboration/discovery only;
3. passive cached research remains non-executable;
4. unapproved executable resources do not activate;
5. resource source allowlists prevent arbitrary-host prefetch;
6. research operates read-only against the repository;
7. exact Sol is the project-aware research primary;
8. exact Sonnet is the project-aware research fallback;
9. model unavailability creates an explicit degraded state rather than fabricated forecast;
10. the forecast derives from current Project Truth/Development Plan/mission context;
11. forecasted research cannot reprioritize the programme;
12. hard eligibility runs before ranking and ineligible resources cannot be rescued by score;
13. redundant peers compete only inside deterministic purpose+role slots while complementary roles survive;
14. reversing candidate input order preserves the same selected resource identities;
15. Skills have one exact-pin selection owner and the generic resource resolver cannot select them;
16. selected resource registry identity is fingerprinted and current-state drift is detectable;
17. descriptor-only context is the default and eager external excerpts require explicit relevance;
18. one manifest preserves Skill and resource provenance;
19. Sol/Sonnet fallback retains the same activation provenance;
20. task refinement requires audited re-resolution;
21. Delivery map/provider locks still defeat conflicting external recommendations;
22. sensitive-data egress is prohibited;
23. resource-selection outcome telemetry remains separate from Feature/gate truth;
24. research scheduler is project-scoped and does not inspect unrelated Hermes projects;
25. `agent:cohesion-check` is green and confirms cross-tool one-authority boundaries;
26. full `npm run verify` remains green.

---

## 21. Production posture

VEKL has two independent health dimensions:

**Governance/runtime health:** registries, resolver, immutable activation, research scheduler, source controls, failover provenance and refusal paths are green.

**Resource coverage:** relevant resource families are progressively registered/qualified as the Development Plan approaches them.

VEKL does not need every internet resource pre-indexed to be green. It needs a trustworthy discovery/qualification/selection mechanism and sufficient qualified coverage for the work DIAL is actually approaching.

The desired steady state is:

```text
DIAL Project Truth + Development Plan
              │
              ▼
     Oracle persistent mission
              │
              ▼
   project-aware Sol → Sonnet
     ahead-of-work forecast
              │
              ▼
 official/maintainer/community
 resource discovery + safe cache
              │
              ▼
Feature/JIT packet classification
              │
              ▼
  VEKL deterministic resolution
 skills + docs + repos + issues
 tools + rules + hooks + loops
              │
              ▼
 Engineering Knowledge Manifest
 exact provenance / constraints
              │
       ┌──────┴──────┐
       ▼             ▼
 Hermes/Sol     Claude/Sonnet
       └──────┬──────┘
              ▼
 code/tests/reviews/evidence
              │
              ▼
       DIAL canonical gates
              │
              ▼
 non-authoritative outcomes
              │
              ▼
 better next resource selection
```

This makes Hermes progressively better prepared for DIAL's planned engineering work without surrendering the repository-first, evidence-first and quality-first development law.
