# DIAL Orchestration Control Plane

This directory contains deterministic orchestration infrastructure for the Hermes + Codex control-plane qualification branch.

No module in this directory is allowed to treat model prose, Hermes memory, or a previous session transcript as authoritative DIAL state.

## Modules

- `state-store.mjs` — atomic JSON state persistence outside Git.
- `checkpoint-store.mjs` — durable active-work checkpoints.
- `handoff-builder.mjs` — compact, non-chain-of-thought manager handoff capsules.
- `runtime-health.mjs` — runtime/model/account health vocabulary and transitions.
- `manager-router.mjs` — deterministic manager eligibility and lease selection.
- `context-broker.mjs` — bounded context packet assembly.
- `supervisor.mjs` — process-independent orchestration coordinator.

Runtime root defaults to `/var/lib/dial-control` and can be overridden with `DIAL_CONTROL_HOME` for local qualification.
