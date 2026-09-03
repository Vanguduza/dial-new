# DIAL Hermes External Runtime Control Plane

This directory contains deterministic infrastructure for DIAL's Oracle-hosted Hermes continuity layer.

## Locked runtime policy

- **Primary Hermes runtime:** GPT-5.6 Sol through Codex App Server.
- **Fallback Hermes runtime:** Claude Sonnet 5 through official Claude Code / supported subscription authentication.
- Runtime selection is an **availability mechanism only**.
- If neither hard-pinned runtime is healthy, authenticated, identity-proven and usable, selection returns `NO_HERMES_RUNTIME_AVAILABLE` and existing checkpoints remain available for recovery.
- Hermes runtime provenance never changes DIAL Feature IDs, FRCs, gate state, canonical source hierarchy, security policy or evidence requirements.

The DIAL repository and its existing deterministic governance remain authoritative. HOT/WARM/COLD memory, checkpoints, handoff capsules and Hermes history exist only to reconstruct bounded context efficiently.

## Modules

- `state-store.mjs` — private atomic persistence under `/var/lib/dial-control`.
- `runtime-health.mjs` — runtime health, freshness and requested/resolved model identity.
- `hermes-runtime-router.mjs` — Sol-first, Sonnet-fallback runtime selection.
- `codex-app-server-probe.mjs` — direct Codex App Server / Sol provenance probe.
- `claude-code-probe.mjs` — official Claude Code / Sonnet provenance probe.
- `claude-fallback-runner.mjs` — read-only installed-runtime fallback qualification.
- `checkpoint-store.mjs` — repository-observable checkpoints and HOT mirror.
- `handoff-builder.mjs` — bounded handoff capsules without hidden reasoning.
- `feature-memory.mjs` — non-authoritative Feature-scoped WARM memory with secret rejection.
- `memory-maintenance.mjs` — Feature compaction plus transaction-consistent Hermes `state.db` backup.
- `context-broker.mjs` — bounded DIAL context assembly using the repository source hierarchy.
- `supervisor.mjs` — runtime health, selection, checkpoints, heartbeat and recovery coordination.

Generalized model-management UI, universal provider catalogs, development worker pools and arbitrary execution-harness marketplaces are outside this DIAL branch.
