# DIAL Hermes External Runtime Control Plane

Status: **IMPLEMENTED IN REPOSITORY — LIVE PRODUCTION QUALIFICATION REQUIRED**

See `DIAL_HERMES_RUNTIME_BOUNDARY.md` for the non-negotiable authority boundary and `IMPLEMENTATION_STATE.md` for current evidence state.

## Purpose

Give DIAL a persistent Oracle-hosted orchestration layer that can receive development work independently of an initiating project session, reconstruct current DIAL state, execute through the locked model chain, survive runtime/process/host interruption, and fail closed without becoming a second product authority.

## Locked runtime chain

```text
1. Hermes -> Codex App Server -> exact gpt-5.6-sol
2. official Claude Code -> exact claude-sonnet-5
3. NO_HERMES_RUNTIME_AVAILABLE
```

Model discovery is retained only for diagnostics. No discovered model is an executable fallback unless it is one of the two exact locked identities above.

## Process topology

```text
Oracle host
  |
  +-- /var/lib/dial-control
  |     +-- work-queue/inbox
  |     +-- work-queue/processing
  |     +-- work-queue/completed
  |     +-- work-queue/failed
  |     +-- state / checkpoints / capsules / memory / evidence / events
  |
  +-- dial-hermes-orchestrator.service
  |     +-- atomically claims persisted work
  |     +-- checks development-unblock gate
  |     +-- invokes hermes-runtime-executor.mjs
  |
  +-- dial-hermes-runtime.service
  |     +-- low-frequency health/provenance supervisor
  |
  +-- Hermes gateway + optional localhost dashboard
  +-- Codex App Server / Codex CLI
  +-- Claude Code
  +-- /home/ubuntu/dial-new
```

No LLM process owns the ability to reconstruct control state. The persistent queue and evidence live outside the Git worktree.

## Development gating

Ordinary work may be submitted/executed only after `finalize-control-plane.sh` creates a valid `PRODUCTION_GREEN` external-orchestration gate.

Before green, the queue accepts no development bypass. The sole exception is an exact fixed qualification canary whose instruction is read-only/no-tools and cannot be replaced with arbitrary work.

The production gate binds qualification to a cryptographic fingerprint of:

- `agent-system/orchestration`
- `deploy/oracle/hermes-codex`

This means normal product changes can proceed without requalifying Hermes, but any control-plane/deployment change automatically blocks future queued work until requalification.

## Runtime health

Health states include `HEALTHY`, `RATE_LIMITED`, `MODEL_LIMITED`, `ACCOUNT_LIMITED`, `AUTH_FAILED`, `PROCESS_FAILED`, `STALLED`, `TOOLCHAIN_DEGRADED` and `UNKNOWN`.

An executable runtime requires:

- fresh `HEALTHY` evidence;
- `toolchain_usable=true`;
- exact requested/resolved model match;
- intended subscription authentication;
- exact locked model identity.

Codex qualification rejects rerouting. Claude qualification derives resolved identity from structured model-usage output.

## Operational execution

A queued instruction first executes through exact Sol. The executor verifies provider/model provenance from the actual turn.

If Sol fails with a classified availability/auth/process/toolchain failure:

1. record the primary failure;
2. capture current observable DIAL repository/checkpoint state;
3. prove exact Sonnet 5 is eligible;
4. rebuild bounded DIAL context from current repository authority;
5. continue the same original instruction through official Claude Code / exact Sonnet 5;
6. require Sonnet to inspect current worktree state before edits because Sol may have completed partial tool actions.

There is no intermediate Codex model and no third fallback. If exact Sonnet 5 cannot be proven, execution stops with `NO_HERMES_RUNTIME_AVAILABLE`.

## Authentication/billing

- Codex uses supported ChatGPT subscription OAuth.
- Claude uses supported Claude subscription auth via official Claude Code.
- Hermes built-in Anthropic fallback is cleared.
- ambient `OPENAI_API_KEY`, `CODEX_API_KEY` and `ANTHROPIC_API_KEY` are rejected by the subscription-only install/finalization path.

## Persistent continuity

The control plane preserves:

- observable repository checkpoints;
- HOT active-state mirror;
- WARM Feature-scoped summaries/handoffs;
- COLD archive;
- handoff capsules;
- selected runtime provenance;
- external job lifecycle/evidence;
- transaction-consistent Hermes `state.db` backups.

All memory is non-authoritative. Repository canon, machine registries, Git state, tests and evidence remain above memory/history.

## Operator commands

Install/update:

```bash
bash deploy/oracle/hermes-codex/install-control-plane.sh
```

After `PRODUCTION_GREEN`, submit work externally:

```bash
dial-hermes-submit "<development instruction>"
dial-hermes-job [job-id]
```

`dial-hermes` remains a runtime diagnostic/qualification entrypoint; it is not the canonical post-green development ingress.

## Qualification contract

Repository validation includes typecheck, orchestration tests, full DIAL verification, JavaScript/shell syntax and diff checks.

Installed-runtime qualification must prove exact Sol, exact Sonnet 5 and an external queue canary.

Process soak must prove real Codex App Server SIGKILL, exact Sonnet 5 fallback, Sol recovery, runtime-supervisor recovery and Hermes gateway recovery.

External orchestration soak must prove the same externally queued job survives a real Codex App Server SIGKILL and finishes on exact Sonnet 5 before Sol regains preference.

Reboot soak must prove a changed Linux boot ID plus service/checkpoint/HOT/WARM/COLD/Hermes-backup persistence.

Finalization must validate all evidence, service health, fresh external heartbeat, subscription-only security and the qualified control-plane fingerprint before writing `PRODUCTION_GREEN`.

Deliberate quota exhaustion is prohibited. Live provider capacity must be observed naturally.


## Shared-host isolation

The Oracle machine is a shared infrastructure host for independent Hermes projects. DIAL qualification MUST NOT restart a global Hermes gateway, reboot the host, or target an unscoped Codex/Claude process. DIAL failure injection is limited to DIAL-owned process descendants and DIAL-specific services. Whole-host maintenance tests are outside the DIAL development-unblock gate.
