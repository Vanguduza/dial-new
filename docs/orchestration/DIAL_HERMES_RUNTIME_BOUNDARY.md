# DIAL Hermes Runtime Boundary

Status: **LOCKED DIAL RUNTIME ARCHITECTURE — QUALIFICATION REQUIRED**

This document defines the boundary between the external Hermes runtime layer and DIAL's existing repository governance. It does not modify product canon or customer functionality.

## Core architecture

```text
ORACLE
  │
  ▼
DIAL HERMES RUNTIME EXECUTOR
  │
  ├── primary runtime
  │     Hermes → Codex App Server / GPT-5.6 Sol
  │
  └── fallback runtime
        official Claude Code CLI / Claude Sonnet 5
  │
  ▼
DIAL CONTEXT / CHECKPOINT / MEMORY BRIDGE
  │
  ▼
DIAL REPOSITORY + EXISTING AGENT GOVERNANCE
```

Hermes remains the persistent primary runtime/control layer. The thin DIAL executor exists because runtime availability must survive a primary-provider/process failure while preserving the locked Claude Code subscription fallback route.

## Locked invariants

> **Hermes is an external persistent runtime layer for DIAL development operations.**

> **GPT-5.6 Sol is the preferred Hermes runtime through Codex App Server.**

> **Claude Sonnet 5 through the official Claude Code CLI is Hermes' operational fallback runtime when Sol is unavailable.**

> **Hermes runtime fallback is an availability mechanism, not a redefinition of DIAL development authority.**

> **DIAL repository canon, Feature IDs, FRCs, gates, evidence and deterministic controls remain authoritative.**

> **The Hermes context/memory system exists to reconstruct work efficiently, not to become a second source of truth.**

> **Hermes' built-in Anthropic API fallback is not the DIAL Sonnet fallback. The DIAL fallback must invoke the official Claude Code CLI.**

> **DDE's Windows Model Registry, Manager Chair configuration, Lesser Task Pool, chat model selector, custom API settings and DeepSeek Harness architecture belong to DDE and must not be implemented in DIAL Main merely because the systems interact.**

The final invariant above is an explicit exclusion boundary, not a DIAL implementation contract for those DDE capabilities.

## Runtime eligibility

A configured Hermes runtime candidate is eligible only when all of these are true:

1. the runtime is `HEALTHY`;
2. authentication is valid as demonstrated by the native runtime probe or successful operational turn;
3. the requested model is known;
4. the resolved model is known;
5. requested and resolved model are identical for a hard pin;
6. no unexpected provider/model reroute was observed;
7. explicit `toolchain_usable=true` evidence exists;
8. runtime evidence is fresh.

Policy order is fixed:

```text
healthy Hermes / Codex App Server / gpt-5.6-sol
  → execute with Sol

else healthy official Claude Code / claude-sonnet-5
  → checkpoint observable state
  → rebuild bounded DIAL context
  → continue with Sonnet

else
  → NO_HERMES_RUNTIME_AVAILABLE
  → preserve checkpoints/memory
  → wait for runtime recovery
```

There is no third fallback in this branch.

## Failover continuation boundary

The primary turn may have performed tool actions before its runtime failed. Automatic failover therefore must not blindly replay the original attempt.

Before operational Sonnet continuation the executor records the primary failure and captures current repository/checkpoint state. The fallback receives the original instruction plus current bounded DIAL context and is explicitly required to inspect observable repository/worktree state before editing.

This does not create rollback semantics. If a partially completed external side effect is not represented in repository-observable state, the existing DIAL integration/evidence controls remain responsible for identifying it. Runtime failover may never be treated as proof that a failed turn performed nothing.

## Runtime provenance

`state/hermes-runtime.json` records availability/provenance only:

```json
{
  "authority": "HERMES_RUNTIME_ONLY",
  "runtime": "codex_app_server",
  "requested_model": "gpt-5.6-sol",
  "resolved_model": "gpt-5.6-sol",
  "status": "ACTIVE"
}
```

Checkpoint and handoff records may carry the active runtime/model/session identifiers so later work can be reconstructed. Those fields are provenance, not a second authority hierarchy.

## DIAL source order

The context broker uses this order:

1. DIAL canonical repository;
2. machine registries and evidence;
3. current Git/worktree state;
4. orchestration checkpoint;
5. handoff capsule;
6. Feature-scoped Oracle memory;
7. selected Hermes session/history retrieval.

A lower layer may never override a higher layer.

## Memory boundary

- **HOT** — active observable work state mirrored from a checkpoint.
- **WARM** — Feature-scoped summaries, handoffs, findings and bounded decisions.
- **COLD** — archived Feature/session/provenance history.

Memory is explicitly `NON_AUTHORITATIVE_CONTEXT`. Hidden chain-of-thought is not persisted. Credential-like values are rejected from Feature memory and handoff capsules.

Hermes native session persistence is backed up from `~/.hermes/state.db` with SQLite's transaction-consistent backup command into private Oracle storage. OAuth files, API keys, SSH keys, `~/.hermes/.env` and provider credentials are not copied.

## Authentication and billing boundary

- Codex uses ChatGPT subscription OAuth.
- Claude Code uses Claude subscription authentication.
- Ambient `OPENAI_API_KEY`, `CODEX_API_KEY` or `ANTHROPIC_API_KEY` values are rejected by the Oracle installer/qualification path when the subscription route is expected.
- Hermes built-in provider fallback is cleared in the Oracle configuration so Sonnet fallback cannot silently become Anthropic API execution.
- This branch does not add a custom OpenAI/Anthropic API-key configuration surface.

## Governance boundary

Hermes may carry instructions, recover context, maintain checkpoints, invoke approved runtime tooling and preserve continuity. It does not replace DIAL's Feature-ID rules, FRC rules, gate ladder, source-of-truth rules, security profiles, specialist review, CI or acceptance evidence.

A runtime switch must not mutate repository gate state. Repository state changes only through DIAL's existing governed development process.

## Qualification boundary

Repository tests prove deterministic runtime routing, operational Sol-to-Sonnet continuation behavior, identity rejection, auth/toolchain rejection, memory persistence, secret rejection, context ordering and the invariant that runtime selection does not modify DIAL gate state.

Oracle qualification separately proves installed binaries/authentication, exact Sol and Sonnet identity, the operational Sol primary path, subscription-boundary configuration, total runtime loss behavior, memory backup and persistent services.

Live process soak must prove actual Codex App Server process death, executable Sonnet fallback, Sol recovery, supervisor recovery and Hermes gateway recovery. Reboot soak must prove a changed Linux boot ID plus checkpoint/HOT/WARM/COLD/state-backup survival and fresh post-reboot Sol preference.

Real provider quota exhaustion is not manufactured:

```text
REAL_QUOTA_SOAK = PENDING
```

Controlled quota-state simulation and process-death tests prove routing/recovery behavior; they do not count as real provider quota-exhaustion evidence.
