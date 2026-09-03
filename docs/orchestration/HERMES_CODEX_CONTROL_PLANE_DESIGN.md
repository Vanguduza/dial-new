# DIAL Hermes External Runtime Control Plane

Status: **LOCKED TARGET DESIGN — QUALIFICATION REQUIRED BEFORE ACTIVATION**

See `DIAL_HERMES_RUNTIME_BOUNDARY.md` for the non-negotiable authority boundary.

## Purpose

Provide DIAL Main with a persistent external Hermes runtime on Oracle that can reconstruct and continue work after a model, session, process or host interruption without becoming a second source of truth.

The runtime order is fixed:

1. Hermes → Codex App Server / GPT-5.6 Sol — preferred.
2. Official Claude Code CLI / Claude Sonnet 5 — fallback.
3. No eligible runtime — `NO_HERMES_RUNTIME_AVAILABLE`, preserve state and wait.

## Process topology

```text
Oracle host
  ├─ dial-hermes operational entrypoint
  │    └─ hermes-runtime-executor.mjs
  │         ├─ primary: Hermes → Codex App Server → GPT-5.6 Sol
  │         └─ fallback: official Claude Code → Claude Sonnet 5
  ├─ Hermes gateway
  ├─ dial-hermes-runtime.service
  ├─ Hermes localhost dashboard/session search (optional)
  ├─ Codex App Server / Codex CLI
  ├─ Claude Code
  ├─ /var/lib/dial-control
  └─ /srv/dial/repo
```

No LLM process owns DIAL's ability to reconstruct state.

## Persistent state

`/var/lib/dial-control` is private persistent storage:

```text
state/
  control-plane.json
  hermes-runtime.json
  runtime-health.json
  active-checkpoint.json
  active-capsule.json
checkpoints/
  active/
  archive/
capsules/
  active/
  archive/
memory/
  hot/
  warm/
  cold/
  features/
sessions/
  hermes/
  codex/
  claude/
retrieval/
evidence-cache/
  soak/
runtime-health/
events/
```

`state/hermes-runtime.json` is a Hermes runtime selection, never a development-authority lease.

## Runtime health and hard pins

Health vocabulary:

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

Hard-pinned eligibility requires fresh `HEALTHY` evidence, explicit `toolchain_usable=true`, and exact requested/resolved model agreement.

Codex qualification additionally rejects a `model/rerouted` event. Claude qualification derives the resolved model from Claude Code's structured model-usage output.

Direct probes consume subscription capacity. The idle supervisor therefore uses a bounded low-frequency refresh cadence by default, while real operational turns refresh runtime health from the observed turn result and trigger immediate failover when necessary.

## Runtime router

`hermes-runtime-router.mjs` evaluates only the two configured runtime candidates. It does not discover arbitrary provider/model catalogs.

The selection record carries runtime, requested/resolved model, runtime session where available, health state/observation time, `HERMES_RUNTIME_ONLY` authority marker, active/expired lifecycle and previous selection link.

When neither runtime is eligible, an active selection is expired and the router returns `NO_HERMES_RUNTIME_AVAILABLE`. Checkpoints and memory remain intact.

## Operational runtime executor

`hermes-runtime-executor.mjs` is the DIAL operational entrypoint and is installed as `dial-hermes` on Oracle.

Primary execution:

```text
instruction
  → hermes -z
  → openai-codex provider
  → codex_app_server
  → gpt-5.6-sol
  → exact usage/provider/model provenance check
```

If the primary turn completes with exact Sol provenance, the result is returned and runtime health is refreshed from the actual operational turn.

If the primary fails with a classified availability, authentication, process or toolchain failure, the executor does not blindly replay the instruction. It first captures a checkpoint containing the observable repository state and primary runtime failure. It then proves Claude Code/Sonnet eligibility, rebuilds bounded DIAL context from the current repository and continues the original instruction through official Claude Code.

The fallback prompt explicitly warns that the primary turn may already have completed some tool actions and requires inspection of current repository/worktree state before editing. This reduces duplicate side effects but is not a transaction/rollback mechanism. DIAL's repository state, tests, gates and evidence remain authoritative.

If Claude Code/Sonnet cannot be proven eligible, execution stops with `NO_HERMES_RUNTIME_AVAILABLE` and preserves continuity state.

## Subscription fallback boundary

Hermes' built-in Anthropic provider fallback is intentionally disabled in the Oracle configuration for this design. The fallback route is not "Anthropic API using credentials obtained from Claude Code"; it is execution of the official `claude` CLI itself with the hard-pinned `claude-sonnet-5` model.

This keeps the locked subscription route explicit and prevents an upstream Hermes fallback change or stale configuration from silently converting DIAL's fallback into metered API usage.

## Supervisor

The deterministic supervisor owns low-frequency runtime health refresh, runtime selection, checkpoint capture, runtime provenance capture, handoff creation, heartbeat and recovery coordination.

It exposes explicit operations:

```text
init
doctor
status
refresh
select-runtime
capture
handoff
health
daemon
```

It does not implement a generalized development mission/model policy.

A supervisor restart invalidates previously cached runtime-health evidence and requires fresh probes before active runtime selection. Systemd restarts the supervisor after process failure.

## Context broker

Before a fallback continuation, and for Hermes hook context, the broker assembles bounded DIAL context from the repository, machine evidence, current Git state, checkpoint, handoff capsule, Feature memory and selected Hermes history, in that order.

The broker calls the existing `context-get.mjs <FEATURE_ID>` path. Feature memory and Hermes history are labeled non-authoritative and cannot advance a gate.

## Checkpoints and handoffs

A checkpoint captures observable facts: Feature ID where resolved, worktree, target/last-green gate, branch/commit/dirty paths, atomic execution position and active Hermes runtime provenance.

The HOT-memory mirror is generated from the checkpoint.

A handoff capsule contains compact operational facts, risks, evidence references and next action. It does not store hidden reasoning. When Feature-scoped, the handoff is also appended to WARM memory.

## Hermes native session backup

`memory-maintenance.mjs` uses SQLite `.backup` against `~/.hermes/state.db` so the copy is transaction-consistent while Hermes uses WAL mode.

Retention is bounded. The backup job never copies provider OAuth files, environment-secret files, SSH keys or API credentials.

## Oracle authentication and installation

The installer requires Node 22+, current Codex CLI, Hermes, Claude Code, Codex `Logged in using ChatGPT`, Claude subscription authentication and no ambient API-key billing route for the subscription runtimes.

Hermes is configured for `openai-codex`, `gpt-5.6-sol` and `codex_app_server`; built-in provider fallback is cleared. The supported one-time Hermes `/codex-runtime codex_app_server` migration remains an operator action.

The installer creates `dial-hermes`, keeps the deterministic runtime supervisor persistent with systemd, and adds restart-on-failure hardening to the discovered Hermes gateway user service. The optional Hermes session-search dashboard remains localhost-only.

## Qualification

Repository qualification:

- `npm ci`
- `npm run typecheck`
- `npm run agent:orchestration:qualify`
- `npm run verify`
- `node --check` for orchestration modules
- `bash -n` for Oracle scripts/hooks
- `git diff --check` against the PR base
- final contamination/secret review

Installed-runtime qualification proves host/tooling, subscription auth, Sol/Sonnet requested-resolved identity, the `dial-hermes` Sol primary path, deterministic fallback selection, total runtime loss, recovery to Sol, memory backup and persistent supervisor service.

Operational process soak is automated by:

```bash
bash deploy/oracle/hermes-codex/soak-control-plane.sh process
```

It must prove an actual Codex App Server SIGKILL, executable Sonnet fallback, return to Sol, supervisor SIGKILL/restart and Hermes gateway SIGKILL/restart.

Reboot soak is staged so a service restart cannot masquerade as a host reboot:

```bash
bash deploy/oracle/hermes-codex/soak-control-plane.sh reboot-pre
sudo reboot
# reconnect
bash deploy/oracle/hermes-codex/soak-control-plane.sh reboot-post
```

The post-reboot stage requires a changed Linux boot ID and verifies service recovery, immutable checkpoint evidence, HOT/WARM/COLD persistence, Hermes `state.db` backup persistence and fresh Sol preference.

Deliberate subscription exhaustion is prohibited. `REAL_QUOTA_SOAK = PENDING` until naturally observed evidence exists. Until the live gates pass, the PR remains draft.
