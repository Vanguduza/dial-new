# DIAL Hermes Runtime vs Development Orchestration Separation

Status: **LOCKED DEVELOPMENT-SYSTEM ARCHITECTURE — QUALIFICATION REQUIRED**

This document is non-product-canon orchestration infrastructure. It does not change Grocery Rounds, payments, Care, Health, Spare, Tech, customer features, Feature IDs, FRCs, gate ladders or DIAL financial/security controls.

## 1. Core invariant

> **Hermes runtime orchestration and software-development orchestration are separate systems.**

Hermes is availability-first. DIAL development orchestration is quality-first.

A model powering Hermes has no development-management authority merely because it is keeping the persistent shell alive.

In particular:

> **Hermes fallback to Claude Sonnet 5 MUST NOT silently make Sonnet the DIAL Development Manager.**

## 2. Three-layer architecture

```text
┌──────────────────────────────────────────────┐
│         EXTERNAL PERSISTENT CONTROL          │
│                                              │
│                  HERMES                      │
│                                              │
│ Primary runtime: GPT-5.6 Sol                 │
│ Fallback runtime: Sonnet 5                   │
│                                              │
│ Gateway / memory / sessions / scheduling     │
│ remote access / runtime continuity           │
└────────────────────┬─────────────────────────┘
                     │ instructions/control
                     ▼
┌──────────────────────────────────────────────┐
│      DIAL DEVELOPMENT ORCHESTRATION          │
│                                              │
│ mission state / quality classification       │
│ Manager Chair / delegation / verification    │
│ evidence / policy / independent review       │
└────────────────────┬─────────────────────────┘
                     │ bounded delegation
                     ▼
┌──────────────────────────────────────────────┐
│           EXECUTION HARNESSES                │
│                                              │
│ Codex App Server / Codex CLI                 │
│ Claude Code                                  │
│ DeepSeek Harness                             │
│ local/self-hosted runtimes                   │
│ custom API runtimes                          │
└──────────────────────────────────────────────┘
```

## 3. Hermes runtime policy

Locked runtime order:

1. **Primary Hermes runtime model:** GPT-5.6 Sol via Codex App Server.
2. **Fallback Hermes runtime model:** Claude Sonnet 5 via official Claude Code / supported integration.

This route exists to keep Hermes capable when the preferred runtime is unavailable. It is encoded by `hermes-runtime-router.mjs` and persisted as `state/hermes-runtime.json` with:

```text
authority = HERMES_RUNTIME_ONLY
```

Runtime health vocabulary remains:

- `HEALTHY`
- `DRAINING`
- `RATE_LIMITED`
- `MODEL_LIMITED`
- `ACCOUNT_LIMITED`
- `AUTH_FAILED`
- `PROCESS_FAILED`
- `STALLED`
- `TOOLCHAIN_DEGRADED`
- `UNKNOWN`

Runtime evidence must be fresh and must prove requested/resolved identity where a hard pin applies.

## 4. Development Manager Chair

Complex DIAL software-development work requires **Manager Chair** authority.

A Manager Chair may:

- interpret ambiguous requirements;
- reason about architecture;
- make significant implementation decisions;
- decompose complex missions;
- design execution plans;
- delegate bounded packets;
- perform complex implementation;
- evaluate conflicting evidence;
- perform complex debugging;
- synthesize worker results;
- decide remediation;
- coordinate specialist reviews.

Default approved quality families are discovered dynamically from the universal model registry:

- Fable family;
- Claude Opus family;
- GPT Sol family.

The implementation deliberately uses model-family classification rather than pinning a stale Fable/Opus point version. A discovered `Fable 5.x` or `Opus 5.x` can therefore enter the default quality pool without code changes.

Sonnet, Terra, Luna and DeepSeek families are **not** default Manager Chair families. They enter the Manager Chair only through explicit user policy configuration.

## 5. No automatic quality downgrade

Complex work follows:

```text
complex request
  → classify development consequence
  → evaluate Manager Chair pool
  → Fable / Opus / Sol available?
       yes → assign Development Manager Chair
       no  → checkpoint / preserve mission / COMPLEX_WORK_PAUSED
```

Healthy lower-tier models do not change this outcome.

A healthy Sonnet powering Hermes can capture and route the instruction, but it cannot execute complex development through runtime inheritance.

## 6. Model and harness are different entities

Examples:

```text
Model: GPT-5.6 Sol
Runtime/Harness: Codex App Server
```

```text
Model: Claude Opus
Runtime/Harness: Claude Code
```

```text
Model: DeepSeek model
Runtime/Harness: DeepSeek Harness
```

The implementation separates:

- **ModelRegistry** — all discovered/registered models;
- **RuntimeRegistry** — execution runtimes/harnesses;
- **ModelBinding** — a model available through a runtime/connection;
- **RuntimeCapability** — chat/tools/repository/shell/discovery/local/worker capabilities.

A model may have multiple runtime bindings.

## 7. Universal Model Registry

`model-registry.mjs` persists `state/model-registry.json` outside Git.

Each model records at minimum:

- `model_id`
- `display_name`
- `provider`
- runtime bindings
- connection
- availability
- health
- capabilities
- context metadata if known
- last probe
- auth state
- chat visibility

Supported model availability states:

- `AVAILABLE`
- `LIMIT_REACHED`
- `RATE_LIMITED`
- `AUTH_REQUIRED`
- `UNAVAILABLE`
- `MODEL_DISABLED`
- `UNKNOWN`

Unavailable models remain in the registry. They are not deleted merely because a provider is temporarily unhealthy.

### Chat visibility invariant

Every registered model remains directly visible/selectable in the DDE/DIAL development chat model selector contract.

There is no hidden `HARNESS_ONLY` model class.

**Visibility and authority are independent dimensions.**

## 8. Connections contract

Supported conceptual connection types:

- Claude Code subscription;
- Codex / ChatGPT subscription;
- OpenAI API;
- DeepSeek Harness;
- custom API provider;
- local runtime.

Persisted connection metadata may contain names, base URLs, project/organisation metadata, discovery capability and a **secure secret reference**.

Credential values are prohibited from registry state. Keys such as API keys, access tokens, refresh tokens, passwords, cookies and authorization headers are rejected by persistence boundaries. Actual secrets must live in the platform credential/keychain/native runtime mechanism.

Secrets must never enter Git, orchestration events, Feature memory, handoff capsules or qualification evidence.

## 9. Settings → Models projection contract

The development infrastructure exposes enough state for a DDE/VS-Code-derived UI to project:

```text
Settings
└── Models
    ├── Connections
    ├── Available Models
    ├── Manager Chair
    ├── Lesser Task Pool
    ├── Harness Assignments
    ├── Routing Policy
    └── Health & Capacity
```

This branch implements the underlying contracts/state rather than a fake placeholder product UI.

Manager Chair selections and Lesser Task Pool selections are independent user-controlled policies over the populated universal model registry.

## 10. Development task classification

Complex/high-consequence kinds include:

- architecture;
- requirements interpretation;
- source-of-truth change;
- financial logic;
- security architecture;
- data architecture;
- cross-system integration;
- complex debugging;
- large ambiguous refactor;
- orchestration decision;
- task decomposition;
- conflicting evidence;
- high-risk migration;
- acceptance/gate synthesis.

Bounded worker kinds include:

- boilerplate;
- mechanical implementation;
- defined-interface implementation;
- accepted-contract test expansion;
- formatting;
- static-analysis cleanup;
- repetitive migration;
- batch catalog work;
- data transformation;
- bounded repository scan;
- documentation extraction.

Unknown/ambiguous work defaults to `COMPLEX`; the router fails toward the quality floor instead of toward throughput.

## 11. Direct chat vs authority

Direct user selection is never removed.

A user may select Sonnet, Terra, Luna, DeepSeek or a custom model for conversation. If that selected model is not a configured Manager Chair and the task classifies as complex, the system returns an authority conflict instead of silently granting authority.

The routing result must disclose any available Manager Chair. The selected conversational model is not silently rewritten.

Explicit user override can be represented separately where product policy permits.

## 12. Auto mode

`Auto` means the DIAL/DDE development router selects according to policy, not “use any available model.”

Order of constraints:

1. task complexity/consequence;
2. Manager Chair eligibility;
3. Lesser Task Pool eligibility;
4. runtime health/provider capacity;
5. independent-review requirements;
6. only then cost/throughput considerations.

## 13. Worker packets and delegation

Only a Manager Chair may initiate substantial delegation of complex work by default.

Every worker packet must contain:

- objective;
- scope;
- allowed paths;
- forbidden paths where required;
- acceptance criteria;
- expected evidence;
- authority limit;
- manager provenance;
- bounded task kind.

Recursive worker delegation is disabled by default.

A worker cannot convert a bounded packet into architecture/requirements/financial/security authority.

## 14. DeepSeek Harness

DeepSeek Harness remains a first-class execution harness.

Primary uses:

- bounded implementation;
- repository analysis;
- repetitive transformations;
- accepted-contract test generation;
- static analysis;
- bulk migration;
- lower-cost worker packets;
- self-hosted/local execution;
- privacy-sensitive local workloads;
- deterministic high-volume engineering work.

`execution-harnesses.mjs` registers DeepSeek Harness as a first-class runtime, supports discovered DeepSeek models, keeps them chat-visible and executes only validated bounded worker packets unless the user has separately promoted a specific model into the Manager Chair policy.

## 15. Independent review

Manager Chair authority does not imply self-certification.

High-consequence work should preserve cross-model review patterns such as:

```text
Sol Manager Chair
  → worker implementation
  → Opus independent review
  → deterministic tests
```

or:

```text
Opus Manager Chair
  → DeepSeek bounded implementation
  → Sol independent review
  → deterministic tests
```

Financial/security/architecture work may not be declared complete solely because one model both produced and approved it.

## 16. DIAL deterministic controls remain stronger than model policy

No model — Fable, Opus, Sol or otherwise — may infer binding payable values, post/release money, advance financial state from prose, override immutable checkout allocations, override ledger evidence, bypass Feature/gate governance or self-certify security gates.

Existing DIAL deterministic product controls remain authoritative.

## 17. Persistent memory and source order

The existing HOT/WARM/COLD memory, checkpoints, handoff capsules, context broker and Hermes session persistence remain valid.

Memory role names are corrected:

- `hermes-runtime.json` = external runtime selection only;
- `development-manager.json` = complex-development authority;
- `runtime-health.json` = runtime health/provenance;
- `model-registry.json` = models, runtimes, bindings and connections.

Legacy `manager-lease.json` is expired during semantic migration and is not reinterpreted as a Development Manager assignment.

Source-of-truth order remains:

1. DIAL canonical repository;
2. machine registries/evidence;
3. Git/worktree state;
4. checkpoint;
5. handoff capsule;
6. feature-scoped Oracle memory;
7. Hermes session/history;
8. historical conversation.

## 18. Qualification invariant

Repository tests must prove:

```text
Sol unavailable
→ Hermes runtime = Sonnet
→ complex DIAL task arrives
→ Sonnet does not inherit Manager Chair
→ Fable/Opus/Sol Manager Chair is selected if available
→ otherwise complex work pauses
```

Oracle qualification must separately prove:

1. **HERMES_RUNTIME_QUALIFICATION** — Sol failure can leave Hermes alive via Sonnet.
2. **DEVELOPMENT_MANAGER_POLICY_QUALIFICATION** — complex development is routed only to a configured Manager Chair and pauses when none is qualified.

Passing the first gate never implies passing the second.
