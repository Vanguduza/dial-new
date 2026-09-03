# DIAL Hermes Runtime Boundary

Status: **LOCKED DIAL RUNTIME ARCHITECTURE — QUALIFICATION REQUIRED**

This document defines the boundary between the external Hermes runtime layer and DIAL's existing repository governance. It does not modify product canon or customer functionality.

## Core architecture

```text
ORACLE
  │
  ▼
HERMES
  │
  ├── primary runtime
  │     Codex App Server / GPT-5.6 Sol
  │
  └── fallback runtime
        Claude Code / Claude Sonnet 5
  │
  ▼
DIAL CONTEXT / CHECKPOINT / MEMORY BRIDGE
  │
  ▼
DIAL REPOSITORY + EXISTING AGENT GOVERNANCE
```

## Locked invariants

> **Hermes is an external persistent runtime layer for DIAL development operations.**

> **GPT-5.6 Sol is the preferred Hermes runtime through Codex App Server.**

> **Claude Sonnet 5 is Hermes' operational fallback runtime when Sol is unavailable.**

> **Hermes runtime fallback is an availability mechanism, not a redefinition of DIAL development authority.**

> **DIAL repository canon, Feature IDs, FRCs, gates, evidence and deterministic controls remain authoritative.**

> **The Hermes context/memory system exists to reconstruct work efficiently, not to become a second source of truth.**

> **DDE's Windows Model Registry, Manager Chair configuration, Lesser Task Pool, chat model selector, custom API settings and DeepSeek Harness architecture belong to DDE and must not be implemented in DIAL Main merely because the systems interact.**

The final invariant above is an explicit exclusion boundary, not a DIAL implementation contract for those DDE capabilities.

## Runtime eligibility

A configured Hermes runtime candidate is eligible only when all of these are true:

1. the runtime is `HEALTHY`;
2. authentication is valid as demonstrated by the native runtime probe;
3. the requested model is known;
4. the resolved model is known;
5. requested and resolved model are identical for a hard pin;
6. no unexpected provider/model reroute was observed;
7. the probe demonstrated a usable toolchain;
8. runtime evidence is fresh.

Policy order is fixed:

```text
healthy Codex App Server / gpt-5.6-sol
  → select Sol

else healthy Claude Code / claude-sonnet-5
  → select Sonnet

else
  → NO_HERMES_RUNTIME_AVAILABLE
  → preserve checkpoints/memory
  → wait for runtime recovery
```

There is no third fallback in this branch.

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

## Authentication boundary

- Codex uses ChatGPT subscription OAuth.
- Claude Code uses Claude subscription authentication.
- Ambient `OPENAI_API_KEY`, `CODEX_API_KEY` or `ANTHROPIC_API_KEY` values are rejected by the Oracle installer/qualification path when the subscription route is expected.
- This branch does not add a custom OpenAI API-key configuration surface.

## Governance boundary

Hermes may carry instructions, recover context, maintain checkpoints, invoke approved runtime tooling and preserve continuity. It does not replace DIAL's Feature-ID rules, FRC rules, gate ladder, source-of-truth rules, security profiles, specialist review, CI or acceptance evidence.

A runtime switch must not mutate repository gate state. Repository state changes only through DIAL's existing governed development process.

## Qualification boundary

Repository tests prove deterministic runtime routing, identity rejection, auth rejection, memory persistence, secret rejection, context ordering and the invariant that runtime selection does not modify DIAL gate state.

Oracle qualification separately proves installed binaries/authentication, Sol and Sonnet requested/resolved identity, primary selection, controlled fallback, total runtime loss behavior, service recovery and memory persistence.

Real provider quota exhaustion is not manufactured:

```text
REAL_QUOTA_SOAK = PENDING
```

A simulated account/rate/model failure proves only the router.
