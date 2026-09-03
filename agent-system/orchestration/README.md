# DIAL Hermes External Runtime Control Plane

This directory contains deterministic infrastructure for DIAL's Oracle-hosted Hermes continuity layer.

## Locked runtime policy

- **Primary Hermes runtime:** GPT-5.6 Sol through Hermes → Codex App Server.
- **Codex in-plan fallback:** if Sol is unavailable, the next eligible model from the ChatGPT/Codex plan list on the same App Server runtime.
- **Fallback Hermes runtime:** Claude Sonnet 5 through the official Claude Code CLI / supported subscription authentication.
- **Claude in-plan fallback:** Sonnet-class Claude Code plan models only. Fable 5 / Fable 5.1 are not Hermes pins and are excluded from Hermes powering.
- Runtime selection is an **availability mechanism only**.
- If no eligible Codex plan model and no eligible Claude Hermes model remain, execution returns `NO_HERMES_RUNTIME_AVAILABLE` and existing checkpoints remain available for recovery.
- Hermes runtime provenance never changes DIAL Feature IDs, FRCs, gate state, canonical source hierarchy, security policy or evidence requirements.

The DIAL repository and its existing deterministic governance remain authoritative. HOT/WARM/COLD memory, checkpoints, handoff capsules and Hermes history exist only to reconstruct bounded context efficiently.

## Operational entrypoint

On the qualified Oracle host use:

```bash
dial-hermes "<instruction>"
```

or:

```bash
npm run agent:orchestration:run -- "<instruction>"
```

`hermes-runtime-executor.mjs` first executes the instruction through Hermes / Codex App Server / GPT-5.6 Sol and verifies the resulting provider/model provenance. If that runtime fails with a classified availability/auth/process/toolchain failure, the executor:

1. records the primary failure;
2. captures observable repository/checkpoint state;
3. tries the next eligible Codex App Server plan model (same runtime; no invented names);
4. verifies the official Claude Code / Sonnet 5 route only after no eligible Codex plan model remains;
5. rebuilds bounded DIAL context from the current repository state;
6. continues the original instruction through Claude Code;
7. tells the fallback runtime to inspect current state before editing because the failed primary turn may already have completed some tool actions.

This avoids blind replay of partially completed work. It is not a transaction rollback system; DIAL's existing tests, Git state, gates and evidence remain the arbiter of what actually completed.

Hermes' built-in Anthropic provider fallback is intentionally disabled for this deployment. The locked fallback must invoke the official Claude Code CLI rather than silently converting the Claude subscription route into an Anthropic API fallback.

## Modules

- `state-store.mjs` — private atomic persistence under `/var/lib/dial-control`.
- `runtime-health.mjs` — runtime health, freshness, toolchain proof and requested/resolved model identity.
- `hermes-plan-models.mjs` — in-plan model evidence, Claude Hermes eligibility (Sonnet-class only; Fable excluded) and deterministic injected lists.
- `hermes-runtime-router.mjs` — Sol-first, Codex in-plan, then Sonnet-fallback runtime selection.
- `hermes-runtime-executor.mjs` — operational Sol-first execution, Codex in-plan continuation, then official Claude Code continuation.
- `codex-app-server-probe.mjs` — direct Codex App Server / Sol provenance probe plus `model/list` plan discovery (no turn).
- `claude-code-probe.mjs` — official Claude Code / Sonnet provenance probe plus best-effort non-interactive list detection.
- `claude-fallback-runner.mjs` — read-only qualification and operational Sonnet fallback execution.
- `checkpoint-store.mjs` — repository-observable checkpoints and HOT mirror.
- `handoff-builder.mjs` — bounded handoff capsules without hidden reasoning.
- `feature-memory.mjs` — non-authoritative Feature-scoped WARM memory with secret rejection.
- `memory-maintenance.mjs` — Feature compaction plus transaction-consistent Hermes `state.db` backup.
- `context-broker.mjs` — bounded DIAL context assembly using the repository source hierarchy.
- `supervisor.mjs` — low-frequency runtime health refresh, selection, checkpoints, heartbeat and recovery coordination.

Direct model probes consume subscription capacity, so the idle supervisor probes at a bounded low frequency by default. Operational turns refresh their own runtime health and fail over immediately from observed failures.

## Oracle qualification and soak

Installed-runtime qualification:

```bash
bash deploy/oracle/hermes-codex/qualify-control-plane.sh
```

Live process recovery:

```bash
bash deploy/oracle/hermes-codex/soak-control-plane.sh process
```

Actual reboot persistence:

```bash
bash deploy/oracle/hermes-codex/soak-control-plane.sh reboot-pre
sudo reboot
# reconnect
bash deploy/oracle/hermes-codex/soak-control-plane.sh reboot-post
```

The reboot harness requires a changed Linux boot ID; restarting services is not accepted as reboot evidence. Real provider quota exhaustion is never manufactured and remains `REAL_QUOTA_SOAK=PENDING` until naturally observed.

Generalized model-management UI, universal provider catalogs, development worker pools and arbitrary execution-harness marketplaces are outside this DIAL branch.
