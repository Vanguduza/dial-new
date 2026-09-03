# DIAL Hermes External Runtime Control Plane

Status: **LOCKED TARGET DESIGN — QUALIFICATION REQUIRED BEFORE ACTIVATION**

See `DIAL_HERMES_RUNTIME_BOUNDARY.md` for the non-negotiable authority boundary.

## Purpose

Provide DIAL Main with a persistent external Hermes runtime on Oracle that can reconstruct work after a model, session, process or host interruption without becoming a second source of truth.

The runtime order is fixed:

1. Codex App Server / GPT-5.6 Sol — preferred.
2. Claude Code / Claude Sonnet 5 — fallback.
3. No eligible runtime — `NO_HERMES_RUNTIME_AVAILABLE`, preserve state and wait.

## Process topology

```text
Oracle host
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

Hard-pinned eligibility requires fresh `HEALTHY` evidence and exact requested/resolved model agreement.

Codex qualification additionally rejects a `model/rerouted` event. Claude qualification derives the resolved model from Claude Code's structured model-usage output.

## Runtime router

`hermes-runtime-router.mjs` evaluates only the two configured runtime candidates. It does not discover arbitrary provider/model catalogs.

The selection record carries runtime, requested/resolved model, runtime session where available, health state/observation time, `HERMES_RUNTIME_ONLY` authority marker, active/expired lifecycle and previous selection link.

When neither runtime is eligible, an active selection is expired and the router returns `NO_HERMES_RUNTIME_AVAILABLE`. Checkpoints and memory remain intact.

## Supervisor

The deterministic supervisor owns runtime health refresh, runtime selection, checkpoint capture, runtime provenance capture, handoff creation, heartbeat and periodic recovery checks.

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

A supervisor restart invalidates previously cached runtime-health evidence and requires fresh probes before active runtime selection.

## Context broker

Before a Hermes turn, the broker assembles bounded DIAL context from the repository, machine evidence, current Git state, checkpoint, handoff capsule, Feature memory and selected Hermes history, in that order.

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

Hermes is configured for `openai-codex`, `gpt-5.6-sol` and `codex_app_server`. The supported one-time Hermes `/codex-runtime codex_app_server` migration remains an operator action.

Systemd keeps the deterministic runtime supervisor and optional Hermes session-search dashboard persistent across SSH disconnects. Hermes' own gateway service remains managed by Hermes.

## Qualification

Repository qualification:

- `npm ci`
- `npm run typecheck`
- `npm run agent:orchestration:qualify`
- `npm run verify`
- `git diff --check`
- final contamination/secret review

Installed-runtime qualification proves host/tooling, Hermes/Codex/Claude installation and auth, Sol/Sonnet requested-resolved identity, Sol preference, controlled fallback, total runtime loss, recovery to Sol, memory/checkpoint persistence and persistent supervisor service.

Operational soak before production proves actual Codex process death/recovery, Hermes death/restart, supervisor death/restart, Oracle reboot and checkpoint/memory survival.

Deliberate subscription exhaustion is prohibited. `REAL_QUOTA_SOAK = PENDING` until naturally observed evidence exists. Until the live gates pass, the PR remains draft.
