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
- `operations-plane.mjs` — deterministic health, bounded service recovery, queue inspection, verification, evidence preparation and scheduling.
- `operations-api.mjs` — optional API-key-backed non-authoritative evidence summarisation; secret never enters Hermes runtime.
- `project-registry.mjs` — strict per-project operations-state isolation.

## Install

On the Oracle host, `install-control-plane.sh` installs the runtime supervisor, external orchestrator and non-authoritative auxiliary operations service:

```bash
bash deploy/oracle/hermes-codex/install-control-plane.sh
```

This does **not** unlock development.


## Auxiliary operations plane

The Oracle host also runs `dial-hermes-operations.service`. It performs fixed deterministic health/integrity/evidence jobs even when Sol/Sonnet are unavailable. An optional API key may be configured for evidence summarisation only; API output has no development authority and cannot execute tools or satisfy the production gate.

Secrets are stored outside Git under `/var/lib/dial-control/secrets/` and are not exported to the Hermes runtime. API use is disabled on default schedules until explicitly enabled. See `docs/orchestration/HERMES_AUXILIARY_OPERATIONS_PLANE.md`.

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

## Dial Health Screen Factory

The Oracle Hermes host also supports a persistent Dial Health Screen Factory. This is infrastructure/control-plane functionality; it does not merge Dial Health product UI into DIAL/DDE product surfaces.

Authoritative Screen Factory compilation uses a dedicated OpenRouter **generation-only** free-model pool: `z-ai/glm-5.2:free`, `minimax/minimax-m3:free`, and `nvidia/nemotron-3-ultra-550b-a55b:free`. GPT-5.6 Sol and Claude Sonnet 5 are not wired into Screen Factory generation. The selected model produces an evidence-backed implementation packet; Playwright deterministically renders the standalone image from semantic HTML/CSS. Hermes remains the control-plane owner for heartbeat, canonical queue ordering, retries, deterministic QA, state persistence and packaging, but does not generate or design the screen.

The generation pool is resolved against OpenRouter's live catalog every 30 minutes. A model is admitted only while its exact `:free` endpoint remains zero-priced, reasoning-capable, and meets the minimum context/parameter gates. If a preferred model is retired, disappears, loses free pricing/capability, is policy-blocked, rate-limited, or becomes unhealthy, the factory fails over to the next highest-scored model in the curated replacement pool. The initial replacement candidates are Dots3-Note Preview, Nemotron 3 Super, Cohere North Mini Code, Poolside Laguna S, MiniMax M2.7 and Nemotron 3.5 Lightning; live catalog and capability scoring decide which replacement is admitted. Temporary faults are quarantined with bounded retry windows so the pipeline does not repeatedly stall on a known-bad endpoint.

The Screen Factory OpenRouter credential is isolated at `/var/lib/dial-control/secrets/openrouter-screen-generator.key` with mode `0600`. It is read only by the Screen Factory compiler path, is not exported as `OPENROUTER_API_KEY`, is not manager-eligible, is not a Hermes runtime credential, and is not eligible for the auxiliary OpenRouter layer. Screen prompts are limited to synthetic product contracts; real PHI, tenant secrets and credentials are prohibited.

Hermes also acts as the **functional-requirements courier** for each generation ping. Its ping contains the screen purpose, roles, required functions, required actions, routes/handoffs, required states, record/detail obligations, export obligations, evidence and software acceptance rules. Hermes is not the screen designer: it must not prescribe screen-specific layout, styling, colours, typography, component placement, visual density, framing or composition. The canonical Dial Health design authority applies visual/UX policy independently from the Hermes ping.

Every REQUIRED task is gated by `DIAL_HEALTH_SCREEN_FACTORY_UX_REV2`. Generation cannot begin until a durable screen contract documents purpose, visible features, interactions, routes, states/variants, archetype and evidence basis. The implementation packet must include interaction/data/state/feature coverage plus `evidence_map`, `component_contracts` and `additional_features`. Any design-discovered feature that is absent from the canonical contract must carry a complete integration plan instead of being silently invented. Every visible control maps to real software behaviour; a PNG never proves implementation or UX green.

My Health uses the consumer profile `DIAL_HEALTH_UI_CANONICAL_2_0`: warm clinical professionalism, low-to-moderate information density and progressive disclosure. Records and transactions open focused full-detail experiences; permitted detail experiences expose functional backend-owned export/download/share flows. Operations-dashboard density, fake controls and frontend-owned clinical/financial truth are prohibited.

The controller persists state under `/var/lib/dial-control/screen-factory` and processes canonical business-unit/platform/screen order. Ten-task groups are orchestration/retry boundaries only. **Batch ZIPs are prohibited.** One ZIP is created only when an entire REQUIRED business-unit/platform is complete, and it contains all standalone screen bundles plus `IMPLEMENTATION_HANDOFF.md` and `ADDITIONAL_FEATURES_INTEGRATION.md`. Play/Pause/Resume/Stop and live progress remain exposed through the dashboard. Play latches continuous autonomous execution across groups and platforms; Pause holds at the next safe atomic-screen boundary while keeping the worker alive; Resume continues; Stop cooperatively persists the active screen and exits the worker. Contract/runtime blocks keep the RUN latch and are rechecked/retried with bounded backoff rather than becoming manual Resume gates. The factory still fails closed at missing product truth and never skips ahead or invents requirements. See `docs/dial/health/SCREEN_FACTORY_AUTONOMOUS_CONTROL_POLICY.md`.

### OpenRouter auxiliary layer

OpenRouter is auxiliary only. Its fixed base URL is `https://openrouter.ai/api/v1`. `openrouter/free` is prohibited because it does not provide the curated model control required by DIAL. The auxiliary selector admits only explicitly approved `:free` models whose live catalog entry is zero-priced, reasoning-capable, and meets context/parameter gates. Auxiliary output has no development authority, manager eligibility, runtime-fallback eligibility, canonical-write permission, or gate authority.

OpenRouter inputs must be explicitly classified `SYNTHETIC_NON_SENSITIVE`; real PHI, credentials, tenant secrets and regulated records are prohibited. Provider routing requests deny data-collecting providers and fail closed rather than silently weakening the data policy. The API key is stored outside Git at `/var/lib/dial-control/secrets/openrouter-auxiliary.key` with mode `0600` and is never exported into Hermes runtime environment variables.

Install with `bash deploy/oracle/hermes-codex/install-screen-factory.sh`. Configure/rotate the dedicated Screen Factory generation credential with `dial-health-screen-factory-openrouter configure`. The separate `dial-hermes-openrouter configure` command remains auxiliary-only. Import an expanded canonical manifest with `dial-health-screen-factory import /path/to/generation_manifest.json`.

### ChatGPT → Oracle screen-artifact transport

The preferred Rev 2 path renders pixels deterministically from an exact-model implementation packet. The legacy/alternate external-artifact ingress remains available for verified ChatGPT-created binaries: ChatGPT may create an **unreferenced Git blob** in the allowlisted private repository `Vanguduza/dial-new`. No branch, tree, commit or source path is changed by this transport, and external imagery cannot bypass the Rev 2 contract/evidence/QA gates.

The Screen Factory receipt carries `type=github_blob`, the exact repository, Git blob SHA, expected SHA-256 and image filename. Oracle fetches the blob through its authenticated `gh` client, decodes it, verifies SHA-256 before QA, copies the verified image into `/var/lib/dial-control/screen-factory/outputs`, then removes the incoming temporary copy. Arbitrary repositories, malformed SHAs and non-image filenames are rejected.

This bridge is transport only. GitHub does not generate, review or approve the screen. Hermes continues to own queue/heartbeat/QA/packaging only. The dedicated OpenRouter Screen Factory compiler is the authoritative implementation-packet generator for autonomous renders; the separate auxiliary OpenRouter layer remains non-authoritative. Platform packaging follows the same one-ZIP-per-business-unit/platform rule regardless of transport source. The Oracle evidence file `screen-factory/evidence/chatgpt-github-blob-transport-probe.json` records a successful text and binary transport probe without a branch/tree mutation.
