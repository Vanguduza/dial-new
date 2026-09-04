# DIAL Hermes External Runtime Control Plane

This directory implements DIAL's persistent Oracle-hosted Hermes orchestration layer. It is DIAL infrastructure, not DDE infrastructure.

## Locked runtime policy

There are exactly two executable runtime slots:

1. **Primary:** Hermes → Codex App Server → exact `gpt-5.6-sol`, authenticated through the supported ChatGPT subscription route.
2. **Fallback:** official Claude Code CLI → exact `claude-sonnet-5`, authenticated through the supported Claude subscription route.
3. If neither exact slot is healthy, execution fails closed with `NO_HERMES_RUNTIME_AVAILABLE`.

Discovered Codex or Claude plan models are **informational only**. No other Codex model, Sonnet alias/class member, Fable, Opus, Haiku or arbitrary provider may be inserted between the locked slots.

Hermes' built-in Anthropic provider fallback is intentionally disabled. The Sonnet route must remain the official Claude Code subscription route and must never silently become API billing.

Runtime selection is an availability/provenance mechanism only. It never changes DIAL Feature IDs, FRCs, canonical product decisions, gates, security policy, tests or evidence requirements.

## Outside-project orchestration

DIAL development is not considered resumable merely because `dial-hermes` works inside a project shell.

The production development path is a persistent Oracle-side service:

- systemd service: `dial-hermes-orchestrator.service`
- state root: `/var/lib/dial-control`
- work queue: `/var/lib/dial-control/work-queue`
- submission command after qualification: `dial-hermes-submit "<development instruction>"`
- job/status command: `dial-hermes-job [job-id]`

A submitted instruction is persisted outside the Git worktree, atomically claimed by the external service, executed against DIAL through the locked Hermes runtime chain, and finalized with runtime/model provenance.

Ordinary queued development is rejected until `/var/lib/dial-control/state/external-orchestration-gate.json` is `PRODUCTION_GREEN`. Before that gate exists, the only permitted queue bypass is one fixed read-only/no-tools qualification canary.

The development gate is pinned to a cryptographic fingerprint of:

- `agent-system/orchestration`
- `deploy/oracle/hermes-codex`

Normal product commits therefore do not invalidate Hermes qualification, while any change to the Hermes control plane or Oracle deployment automatically invalidates the gate and requires requalification.

## Operational failover

For each queued development instruction:

1. attempt exact GPT-5.6 Sol;
2. verify provider/model provenance;
3. on a classified runtime failure, record failure and capture observable repository/checkpoint state;
4. rehydrate bounded DIAL context from current repository state;
5. continue the same instruction through exact Claude Sonnet 5;
6. tell Sonnet to inspect current state before editing, because the failed Sol attempt may already have completed tool actions;
7. if exact Sonnet 5 is unavailable or identity cannot be proven, fail closed.

There is no third model and no blind replay. DIAL's repository state, tests, gates and evidence remain the arbiter of what completed.

## Modules

- `state-store.mjs` — private atomic persistence plus external queue layout under `/var/lib/dial-control`.
- `runtime-health.mjs` — runtime health, freshness, toolchain proof and exact requested/resolved identity.
- `hermes-plan-models.mjs` — plan-model discovery evidence; only the two exact locked models are executable.
- `hermes-runtime-router.mjs` — exact Sol → exact Sonnet → fail-closed selection.
- `hermes-runtime-executor.mjs` — operational execution, checkpoint-before-fallback and exact identity enforcement.
- `external-orchestrator.mjs` — persistent outside-project queue/worker and hard development gate.
- `development-unblock.mjs` — verifies `PRODUCTION_GREEN`, external heartbeat and qualified control-plane fingerprint.
- `codex-app-server-probe.mjs` — exact Sol provenance probe plus informational model discovery.
- `claude-code-probe.mjs` — exact Sonnet 5 provenance probe plus informational model discovery.
- `claude-fallback-runner.mjs` — exact Sonnet 5 read-only qualification and operational fallback execution.
- `checkpoint-store.mjs` — repository-observable checkpoints and HOT mirror.
- `handoff-builder.mjs` — bounded handoff capsules without hidden reasoning.
- `feature-memory.mjs` — non-authoritative Feature-scoped WARM memory with secret rejection.
- `memory-maintenance.mjs` — memory compaction plus transaction-consistent Hermes `state.db` backup.
- `context-broker.mjs` — bounded DIAL context assembly from repository authority.
- `supervisor.mjs` — persistent runtime health, selection, checkpoints, heartbeat and qualification status.

## Install

On the Oracle host, `install-control-plane.sh` installs both the runtime supervisor and the external orchestrator:

```bash
bash deploy/oracle/hermes-codex/install-control-plane.sh
```

This does **not** unlock development.

## Mandatory qualification sequence

When real subscription capacity is available, run in order:

```bash
bash deploy/oracle/hermes-codex/qualify-control-plane.sh
bash deploy/oracle/hermes-codex/soak-control-plane.sh process
bash deploy/oracle/hermes-codex/soak-external-orchestrator.sh
bash deploy/oracle/hermes-codex/soak-control-plane.sh reboot-pre
sudo reboot
# reconnect
bash deploy/oracle/hermes-codex/soak-control-plane.sh reboot-post
bash deploy/oracle/hermes-codex/finalize-control-plane.sh
```

The evidence must prove:

- installed exact Sol identity;
- installed exact Sonnet 5 identity;
- external queue canary execution;
- actual Codex App Server SIGKILL and recovery;
- exact Sonnet 5 fallback;
- the **same externally queued job** surviving Codex process death and completing on Sonnet 5;
- Sol regaining preference;
- supervisor/gateway process recovery;
- an actual host reboot proven by changed Linux boot ID;
- checkpoint, HOT/WARM/COLD and Hermes `state.db` persistence;
- service recovery after reboot;
- subscription-only auth and secret/config security checks.

Only `finalize-control-plane.sh` may create `PRODUCTION_GREEN`. Until it succeeds, DIAL development remains `DEVELOPMENT_BLOCKED`.

After green, the canonical development entrypoint is:

```bash
dial-hermes-submit "<development instruction>"
```

Do not deliberately exhaust subscription quota to manufacture provider failure evidence.

Generalized development model registries, Manager Chair controls, worker pools, DeepSeek Harness settings and DDE model-management UI are outside this DIAL Hermes implementation.
