# DIAL Orchestration Control Plane

This directory contains deterministic infrastructure for three separate concerns:

1. **Hermes external persistent control** — availability-first runtime continuity.
2. **DIAL development orchestration** — quality-first Manager Chair authority and bounded delegation.
3. **Execution harnesses** — Codex, Claude Code, DeepSeek Harness, local and custom runtimes.

No module in this directory may treat model prose, Hermes memory or a previous transcript as authoritative DIAL state.

## Locked separation

- Hermes primary runtime model: GPT-5.6 Sol via Codex App Server.
- Hermes fallback runtime model: Claude Sonnet 5.
- Hermes runtime selection carries `HERMES_RUNTIME_ONLY` authority.
- Development Manager Chair authority is independent and quality-governed.
- Default Manager Chair families are Fable, Claude Opus and GPT Sol.
- Sonnet/Terra/Luna/DeepSeek are not automatically promoted to Manager Chair.
- If no qualified Manager Chair exists, complex development pauses.
- Every registered model remains chat-selectable regardless of orchestration authority.

See `docs/orchestration/DIAL_HERMES_AND_DEVELOPMENT_ORCHESTRATION_SEPARATION.md`.

## Modules

- `state-store.mjs` — atomic private JSON state persistence outside Git.
- `runtime-health.mjs` — runtime/account health vocabulary, freshness and persisted runtime evidence.
- `hermes-runtime-router.mjs` — availability-first Sol → Sonnet Hermes runtime selection.
- `model-registry.mjs` — universal ModelRegistry / RuntimeRegistry / ModelBinding contracts.
- `development-policy.mjs` — quality-first task classification, Manager Chair and Lesser Task policy.
- `manager-router.mjs` — Development Manager Chair assignment only; no Hermes runtime routing.
- `instruction-router.mjs` — routes Hermes-carried instructions through development authority policy.
- `execution-harnesses.mjs` — first-class Codex/Claude/DeepSeek/local/custom harness contracts and bounded worker execution.
- `checkpoint-store.mjs` — durable active-work checkpoints with explicit `development_manager` metadata.
- `handoff-builder.mjs` — compact, non-chain-of-thought development handoff capsules.
- `context-broker.mjs` — bounded context packet assembly.
- `supervisor.mjs` — process-independent coordinator that automatically reconciles Hermes runtime continuity but does not auto-downgrade complex development authority.

Runtime root defaults to `/var/lib/dial-control` and can be overridden with `DIAL_CONTROL_HOME` for local qualification.
