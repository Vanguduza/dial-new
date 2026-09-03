# DIAL Hermes + Codex Control Plane

Status: **LOCKED TARGET DESIGN — QUALIFICATION REQUIRED BEFORE ACTIVATION**

This document defines the Oracle-hosted persistent control plane. It must be read with `DIAL_HERMES_AND_DEVELOPMENT_ORCHESTRATION_SEPARATION.md`.

## 1. Authority boundary

- **DIAL repository and registries are authoritative.**
- **Hermes is external persistent control:** gateway, sessions, memory, scheduling, remote/mobile access, runtime invocation and continuity.
- **DIAL development orchestration is a separate quality-first authority layer.**
- **Execution harnesses are replaceable runtimes:** Codex App Server/CLI, Claude Code, DeepSeek Harness, local/self-hosted and custom connections.
- **Hermes memory accelerates reconstruction but never overrides Git, canonical registries, tests or evidence.**

Critical invariant:

> A model powering Hermes does not receive DIAL Development Manager Chair authority merely because it is the active Hermes runtime.

## 2. Hermes runtime policy

Hermes runtime continuity is availability-first:

- primary runtime model: GPT-5.6 Sol via Codex App Server;
- fallback runtime model: Claude Sonnet 5 via official Claude Code/supported integration.

The persisted selection is `state/hermes-runtime.json` and always carries:

```text
authority = HERMES_RUNTIME_ONLY
```

Sonnet fallback keeps Hermes usable. It is not the DIAL development failover manager by default.

## 3. Development Manager Chair policy

DIAL development orchestration is quality-first.

Default Manager Chair quality families:

- Fable;
- Claude Opus;
- GPT Sol.

Actual available point versions are taken from the universal model registry rather than embedded as a static Fable/Opus list.

Sonnet, Terra, Luna and DeepSeek are not default Manager Chair families. They may be used for bounded work and remain directly user-selectable; they become Manager Chair candidates only through explicit user configuration.

If no qualified Manager Chair is available, complex development is checkpointed/preserved and enters `COMPLEX_WORK_PAUSED`. The system must not lower the quality floor merely to continue throughput.

## 4. Process topology

```text
Oracle Cloud host
  ├─ hermes-gateway.service
  ├─ dial-orchestrator.service
  ├─ Hermes sessions / memory / retrieval
  ├─ DIAL runtime health + model registry + development policy
  ├─ Codex App Server / Codex CLI
  ├─ Claude Code
  ├─ DeepSeek Harness / local/custom runtimes where configured
  └─ DIAL repo + isolated worktrees
```

No LLM process owns DIAL's ability to reconstruct state.

## 5. Persistent context and state

Runtime state lives outside Git under `/var/lib/dial-control` on persistent block storage.

```text
/var/lib/dial-control/
  state/
    control-plane.json
    hermes-runtime.json
    development-manager.json
    development-policy.json
    model-registry.json
    runtime-health.json
  checkpoints/
  capsules/
  memory/
    hot/
    warm/
    cold/
    features/
  sessions/
    hermes/
    codex/
    claude/
    deepseek/
  retrieval/
  evidence-cache/
  runtime-health/
  events/
```

Legacy `manager-lease.json` represents the earlier conflated design. During semantic migration an active legacy lease is expired; it is never reinterpreted as development authority.

### HOT memory
Current Feature ID, Development Manager assignment if any, atomic unit, dirty paths, last verified commit, current gate, recent decisions and next action.

### WARM memory
Feature-specific conclusions, review findings, rejected approaches, failure lessons, implementation summaries and session references.

### COLD memory
Archived sessions, superseded capsules, detailed logs and historical investigations. Cold memory is searched only on explicit need.

## 6. Source-of-truth order

1. DIAL canonical repository
2. machine registries and evidence
3. current Git/worktree state
4. DIAL orchestration checkpoint
5. handoff capsule
6. Feature-scoped Oracle memory
7. Hermes session/history retrieval
8. historical conversational material

A lower layer may never override a higher layer.

## 7. Universal model/runtime registry

The control plane distinguishes model from runtime/harness.

Examples:

- GPT-5.6 Sol → Codex App Server;
- Claude Opus → Claude Code;
- DeepSeek model → DeepSeek Harness.

The registry records models, runtimes, connections, bindings, capabilities, availability, health, context metadata where known, auth state and last probe.

Model availability states:

- `AVAILABLE`
- `LIMIT_REACHED`
- `RATE_LIMITED`
- `AUTH_REQUIRED`
- `UNAVAILABLE`
- `MODEL_DISABLED`
- `UNKNOWN`

Unavailable models remain visible. Every registered model remains in the development chat model-selector contract; model visibility and orchestration authority are separate.

## 8. Runtime health

Runtime health states remain:

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

A runtime hard pin requires requested/resolved model agreement and fresh evidence.

Runtime health controls Hermes availability routing. It does not by itself grant Development Manager Chair authority.

## 9. Development task authority

Complex/high-consequence work includes architecture, ambiguous requirements, source-of-truth changes, financial/security/data architecture, cross-system integration, complex debugging, large ambiguous refactors, orchestration decisions, task decomposition, conflicting evidence, high-risk migrations and acceptance/gate synthesis.

Unknown/ambiguous work defaults to complex.

Bounded work includes boilerplate, mechanical implementation, accepted-interface implementation, accepted-contract test expansion, formatting, static-analysis cleanup, repetitive migrations, batch catalog work, data transformation, bounded repository scans and documentation extraction.

Every worker packet carries objective, scope, allowed paths, forbidden paths where needed, acceptance criteria, evidence expectations, authority limit and Development Manager provenance. Recursive worker delegation is disabled by default.

## 10. DeepSeek Harness

DeepSeek Harness remains first-class for bounded implementation, repository analysis, repetitive transformations, test generation from accepted contracts, static analysis, bulk migration, lower-cost worker work, self-hosted/local execution and privacy-sensitive local workloads.

A DeepSeek model is not a default Manager Chair merely because it is available through DeepSeek Harness.

## 11. Instruction routing

Hermes carries instructions into DIAL development policy.

Required scenario:

```text
Sol unavailable
→ Hermes selects Sonnet fallback
→ complex DIAL instruction arrives
→ policy checks Manager Chair pool
→ Fable/Opus/Sol selected if qualified
→ otherwise COMPLEX_WORK_PAUSED
```

The Sonnet fallback runner can route/capture the complex instruction but must not execute the complex development merely because Sonnet is the active Hermes runtime.

## 12. Context broker and handoff

Before a Development Manager turn, the broker assembles bounded context from:

- `context-get.mjs <FEATURE_ID>`;
- active checkpoint;
- Git status/diff;
- handoff capsule;
- relevant Feature memory;
- selected historical session fragments only when needed.

Handoffs record operational facts without hidden chain-of-thought and use explicit `previous_development_manager` metadata. Their authority warning states that Hermes runtime identity is not development authority.

## 13. Security boundaries

- credentials/OAuth tokens are never committed;
- Codex/Claude credentials remain in their native secure locations;
- API/custom-provider credentials are referenced through secure storage, never persisted as values in registry state;
- Feature memory, handoffs, instruction-routing evidence and qualification evidence may not contain secrets;
- `:danger-no-sandbox` remains prohibited;
- DIAL gate advancement remains deterministic;
- destructive host commands require explicit allowlisting outside the model layer;
- model policy cannot override financial/security evidence or immutable product controls.

## 14. Qualification gates

### HERMES_RUNTIME_QUALIFICATION

Prove independently:

1. Sol healthy → Hermes uses Sol.
2. Sol unavailable → Hermes may use Sonnet 5.
3. requested/resolved identity is proven.
4. Hermes survives/reconstructs after runtime process death.
5. services recover after reboot.

### DEVELOPMENT_MANAGER_POLICY_QUALIFICATION

Prove independently:

1. Sonnet-powered Hermes plus Fable available → Fable gets Manager Chair for complex work.
2. Fable unavailable plus Opus available → Opus gets Manager Chair.
3. all approved Manager Chair models unavailable while Sonnet/Terra/DeepSeek are healthy → `NO_QUALIFIED_MANAGER` and `COMPLEX_WORK_PAUSED`.
4. bounded worker packets execute on eligible worker models.
5. lesser models cannot convert a bounded packet into architecture authority.
6. every registered model remains chat-visible.
7. changing Hermes runtime identity does not silently mutate the Development Manager identity.

Passing Hermes runtime failover does not imply Development Manager qualification.

## 15. Operational activation

Repository tests prove deterministic policy. Oracle must still provide live evidence for OAuth, installed runtime identity, process kill/recovery, Hermes fallback continuity, reboot, memory survival, a real bounded packet, safe recovery to Sol and the real provider-capacity soak where required.

Until all mandatory live gates are complete, PR #1 remains draft and the control plane remains in qualification mode.
