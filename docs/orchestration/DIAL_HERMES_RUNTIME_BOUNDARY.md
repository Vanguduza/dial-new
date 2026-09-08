# DIAL Hermes Runtime Boundary

Status: **LOCKED DIAL RUNTIME ARCHITECTURE — LIVE QUALIFICATION REQUIRED**

This document defines the boundary between DIAL's Oracle-hosted Hermes orchestration layer and DIAL repository governance. It does not define DDE model-management architecture.

## Core architecture

```text
EXTERNAL ORACLE CONTROL PLANE
  |
  +-- /var/lib/dial-control/work-queue
  |     |
  |     v
  +-- dial-hermes-orchestrator.service
          |
          v
      Hermes runtime executor
          |
          +-- exact primary: Codex App Server / gpt-5.6-sol
          |
          +-- exact fallback: official Claude Code / claude-sonnet-5
          |
          +-- otherwise: NO_HERMES_RUNTIME_AVAILABLE
          |
          v
      DIAL context/checkpoint/memory bridge
          |
          v
      DIAL repository + deterministic governance
```

## Locked invariants

> Hermes on Oracle is DIAL infrastructure.

> Exact `gpt-5.6-sol` through Codex App Server is the primary runtime.

> Exact `claude-sonnet-5` through the official Claude Code CLI is the only fallback runtime.

> No other Codex plan model or Claude model/alias is an executable Hermes fallback.

> Plan-model discovery is informational only.

> If neither exact runtime is available with fresh identity/toolchain evidence, execution returns `NO_HERMES_RUNTIME_AVAILABLE`.

> Hermes built-in Anthropic API fallback is disabled; the Sonnet fallback must stay on the supported Claude Code subscription route.

> Runtime selection is availability/provenance only and never changes DIAL product authority, Feature IDs, FRCs, gates, security policy, tests or evidence requirements.

> Ordinary DIAL development remains blocked until the external Oracle orchestrator is either full `PRODUCTION_GREEN` or the `DEC-021` development-only `DEVELOPMENT_READY_FALLBACK` gate is valid. Both require external-queue execution; fallback-ready is explicitly not production certification.

> After green, the canonical development entrypoint is `dial-hermes-submit`, not an ad-hoc project-local model session.

> DDE Manager Chair, Lesser Task Pool, model registry/settings and DeepSeek Harness configuration are outside this DIAL runtime boundary.

## Runtime eligibility

A runtime is executable only when all are true:

1. state is `HEALTHY`;
2. toolchain usability is proven;
3. authentication is valid through the intended subscription route;
4. requested and resolved model identity are exact;
5. evidence is fresh;
6. the exact model is one of the two locked runtime slots.

### Sol capacity-preservation boundary (`DEC-022`)

Runtime **identity**, **health**, and **capacity** are distinct evidence. A valid identity proof may outlive an individual health observation, but it is usable only while its runtime fingerprint remains unchanged. That fingerprint covers the Codex/Hermes executables and versions, ChatGPT OAuth route, Hermes configuration and identity-critical DIAL orchestration code. A service restart by itself is not an identity change and must not spend a new model turn.

For a proven provider capacity state (`ACCOUNT_LIMITED`, `RATE_LIMITED`, `MODEL_LIMITED`), Oracle persists the provider reset/retry boundary where available and suppresses primary inference until it expires. This suppression is an availability decision, not a synthetic `HEALTHY` state. Ordinary work continues through exact Sonnet 5 only if the existing fallback eligibility/gate rules are satisfied. `AUTH_FAILED` requires external intervention; process/toolchain failures retain their real classifications.

The same rule applies to project-aware VEKL research: a current semantic forecast is reused until Project Truth, the active plan, the owner priority directive or the active Feature/gate meaningfully changes or its TTL expires. Mission turn IDs, packet IDs, RUNNING/BLOCKED transitions and checkpoint timestamps do not by themselves justify another manager-model forecast.

The complete policy is:

```text
healthy exact Codex App Server / gpt-5.6-sol
  -> execute with Sol

else healthy exact official Claude Code / claude-sonnet-5
  -> checkpoint observable state
  -> rebuild bounded DIAL context
  -> continue with Sonnet 5

else
  -> NO_HERMES_RUNTIME_AVAILABLE
  -> preserve checkpoint/memory
  -> do not invent a third fallback
```

## Outside-project execution boundary

The external orchestrator persists instructions under `/var/lib/dial-control`, outside the Git worktree. It atomically claims jobs, invokes the locked runtime executor against DIAL, and writes completed/failed records carrying runtime/model provenance.

Before either accepted development-ready gate, ordinary jobs are rejected as `DEVELOPMENT_BLOCKED`. The only bypass is the exact fixed read-only/no-tools qualification canary. `DEVELOPMENT_READY_FALLBACK` may be issued only from real exact-Sol temporary capacity evidence plus exact-Sonnet/VEKL/research/queue/continuity proof; arbitrary text or synthetic health injection cannot create it.

The development gate is cryptographically pinned to the Git tree objects for:

- `agent-system/orchestration`
- `agent-system/engineering-knowledge`
- `deploy/oracle/hermes-codex`

Product-only commits therefore do not invalidate qualification. Any Hermes/deployment change does.

## Failover continuation boundary

A failed Sol turn may already have performed tool actions. Failover must therefore never blindly replay the original instruction.

Before Sonnet continuation the executor records the Sol failure and captures current observable repository/checkpoint state. Sonnet receives the original instruction plus current bounded DIAL context and is explicitly told to inspect current repository/worktree state before editing.

This is continuity protection, not rollback semantics. Existing DIAL tests/evidence controls remain responsible for external side effects that are not represented in repository state.

## Runtime provenance

`state/hermes-runtime.json` is availability/provenance state only. A valid active selection records the locked policy plus exact requested/resolved identity, for example:

```json
{
  "authority": "HERMES_RUNTIME_ONLY",
  "policy": "LOCKED_SOL_THEN_SONNET",
  "runtime": "codex_app_server",
  "requested_model": "gpt-5.6-sol",
  "selected_model": "gpt-5.6-sol",
  "resolved_model": "gpt-5.6-sol",
  "in_plan_fallback": false,
  "status": "ACTIVE"
}
```

There is no valid `in_plan_fallback=true` state under the locked policy.

## Source and memory order

The context bridge resolves authority in this order:

1. DIAL canonical repository;
2. machine registries/evidence;
3. current Git/worktree state;
4. orchestration checkpoint;
5. handoff capsule;
6. Feature-scoped Oracle memory;
7. Hermes session/history retrieval.

Lower layers never override higher layers.

HOT/WARM/COLD memory is `NON_AUTHORITATIVE_CONTEXT`. Hidden chain-of-thought is not persisted. Credential-like material is rejected. Hermes `state.db` is backed up transaction-consistently without copying OAuth/API/SSH secrets.

## Authentication boundary

- Codex: ChatGPT subscription OAuth.
- Claude: supported Claude subscription authentication through official Claude Code.
- Ambient `OPENAI_API_KEY`, `CODEX_API_KEY` and `ANTHROPIC_API_KEY` are rejected from the subscription-only service path.
- Hermes provider fallback remains empty/disabled.

## Qualification boundary

Repository tests must prove deterministic exact routing, alternate-model rejection, total-loss fail-closed behavior, safe continuation semantics, external queue persistence, hard development blocking and the fixed qualification-canary restriction.

Installed Oracle qualification must prove exact Sol and Sonnet identities and an externally queued canary.

Process soak must prove real Codex App Server process death, exact Sonnet fallback, Sol recovery, supervisor recovery and gateway recovery.

External queue failover soak must prove that the **same externally queued job** survives a real Codex process death and completes through exact Sonnet 5 before Sol regains preference.

Reboot soak must prove a changed Linux boot ID plus service/checkpoint/HOT/WARM/COLD/Hermes-backup persistence.

The finalizer must pass the security audit, validate all evidence, validate a fresh external-orchestrator heartbeat and bind `PRODUCTION_GREEN` to the qualified control-plane fingerprint.

Real provider quota exhaustion is never deliberately manufactured.
