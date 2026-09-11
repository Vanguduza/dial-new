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

Ordinary autonomous/queued development is rejected until `/var/lib/dial-control/state/external-orchestration-gate.json` is `PRODUCTION_GREEN`. Before that gate exists, the only normal queue bypass is one fixed read-only/no-tools qualification canary. Separately, an authenticated current-owner live turn may run outside the queue to answer a question, repair a blocked/degraded state, or apply new owner direction; it remains bound by runtime identity, VEKL where material, security/credential boundaries and truthful verification.

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
- `hermes-native-doctor.mjs` — bounded subordinate `hermes doctor` execution, sanitised summary/hash evidence and fail-closed diagnostic integration; it never requests `--fix` or `--live`.
- `operations-plane.mjs` — deterministic health, bounded service recovery, queue inspection, verification, evidence preparation and scheduling.
- `operations-api.mjs` — optional API-key-backed non-authoritative evidence summarisation; secret never enters Hermes runtime.
- `project-registry.mjs` — strict per-project operations-state isolation.
- `mission-control.mjs` — durable DIAL root-mission state, pause/resume, owner priority and gate decisions.
- `mission-controller.mjs` — persistent continuation loop that dispatches the next bounded manager turn when the DIAL mission is RUNNING and idle.
- `chat-control-bridge.mjs` — shared DIAL-only typed operator authority for Claude, Codex and authenticated owner WhatsApp while Oracle owns execution.
- `operator-control-stdio.mjs` — local Claude/Codex MCP adapter over the shared typed tools.
- `operator-text-router.mjs` — deterministic shortcut grammar for status/mission/pause/resume/priority/approval/background submission controls.
- `owner-steering-broker.mjs` — canonical hybrid owner-action lane. It acknowledges owner direction immediately, persists it outside the autonomous inbox, blocks later autonomous claims, lets any current repository writer finish safely, then executes the steer before autonomous work resumes; optional xKiro advice is limited to coarse PUBLIC metadata and is non-authoritative.
- `owner-live-control.mjs` — direct Hermes owner-turn executor used by the steering broker plus read-only/exceptional live turns; read-only questions do not serialize repository writers.
- `whatsapp-hermes-operator.mjs` — owner self-chat adapter over the existing Hermes WhatsApp bridge, with natural-language hybrid steering, immediate status/questions, bounded document/image ingestion and automatic mission/steer lifecycle notifications.
- `whatsapp-owner-input.mjs` — content-addressed owner attachment persistence, safe steering-instruction construction and deduplicated mission/owner-steering event notification mapping.
- `whatsapp-operator-adapter.mjs` — official Meta Cloud API adapter with HMAC verification, sender allowlisting and replay protection.

## Install

On the Oracle host, `install-control-plane.sh` installs the runtime supervisor, external orchestrator and non-authoritative auxiliary operations service:

```bash
bash deploy/oracle/hermes-codex/install-control-plane.sh
```

This does **not** unlock development.

The installer exposes `dial doctor` (with `dial-doctor` as its direct helper). It is the top-level DIAL diagnostic command. It runs DIAL control-plane checks and then executes native `hermes doctor` as a subordinate diagnostic provider. Hermes findings are evidence only: they cannot alter DIAL runtime/model policy, Project Truth or gates. The subordinate command is always non-mutating (`hermes doctor`, never `--fix`) and does not request the optional `--live` backend probes. Its sanitised structured summary is persisted under the DIAL control root; raw Hermes Doctor output is not persisted.


## Auxiliary operations plane

The Oracle host also runs `dial-hermes-operations.service`. It performs fixed deterministic health/integrity/evidence jobs even when Sol/Sonnet are unavailable. An optional API key may be configured for evidence summarisation only; API output has no development authority and cannot execute tools or satisfy the production gate.

Secrets are stored outside Git under `/var/lib/dial-control/secrets/` and are not exported to the Hermes runtime. API use is disabled on default schedules until explicitly enabled. See `docs/orchestration/HERMES_AUXILIARY_OPERATIONS_PLANE.md`.

## Unified owner operator gateway

DIAL development remains resident on Oracle while Claude, Codex and authenticated owner WhatsApp act as thin operator consoles over one DIAL-only control authority. Current owner actions use `dial_owner_steer`; read-only questions use `dial_owner_live_turn`; deliberately backgrounded work may still use `dial_submit_instruction`. The gateway also exposes status, progress, pause/resume, reprioritisation and approval tools, and never exposes a generic shell/filesystem proxy. See `docs/orchestration/DIAL_OPERATOR_GATEWAY.md`.

Install the gateway, persistent mission controller, local Claude/Codex MCP enrollment and fail-closed WhatsApp services with:

```bash
bash deploy/oracle/hermes-codex/install-operator-gateway.sh
```

The HTTP MCP remains bound to `127.0.0.1:9130` and bearer-token protected. The optional WhatsApp Cloud webhook adapter remains bound to `127.0.0.1:9132`. Neither port is opened publicly by the installer. Hermes owner self-chat and official Meta Cloud API activation require their normal external credential/pairing boundaries.

## Owner-authorized Project Truth

The Oracle control plane persists owner-instruction provenance on submitted work. `project-truth-authority.mjs` can issue a bounded repository authorization only from an authenticated owner-originated instruction (or a manager packet inheriting a valid derived/delegated owner root). It does not accept a generic manual/self-authorization path. Project Truth is generated on the authorized PR branch and verified after merge without mutating protected `master`.

Recommended blocker/gap fixes are `OWNER_DERIVED`; explicit autonomous/until-green steering is `OWNER_DELEGATED_AUTONOMY`; read-only/audit/research requests are `NO_AUTHORITY`. Material scope expansion always requires explicit owner authority.

## Mandatory qualification sequence

When real subscription capacity is available, run in order:

```bash
bash deploy/oracle/hermes-codex/qualify-control-plane.sh
bash deploy/oracle/hermes-codex/soak-control-plane.sh process
bash deploy/oracle/hermes-codex/soak-external-orchestrator.sh
bash deploy/oracle/hermes-codex/soak-control-plane.sh continuity
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
- DIAL runtime-supervisor recovery without restarting the shared Hermes gateway;
- DIAL-only service continuity across runtime/orchestrator/operations/chat-control/mission-controller/operator-channel restarts;
- persistent mission and chat-control credential continuity;
- no unrelated project service or process is targeted by a DIAL soak;
- subscription-only auth and secret/config security checks.

Only `finalize-control-plane.sh` may create `PRODUCTION_GREEN`. Until it succeeds, DIAL development remains `DEVELOPMENT_BLOCKED`.

### Shared-host reboot qualification

The Oracle host can carry multiple independent Hermes projects. Therefore a host reboot and a global Hermes gateway SIGKILL are **not** DIAL development-gate actions. The DIAL soak is project-scoped. Optional whole-host reboot evidence may be collected only in an explicitly approved maintenance window and is not required for DIAL `PRODUCTION_GREEN`.

After green, the canonical development entrypoint is:

```bash
dial-hermes-submit "<development instruction>"
```

Do not deliberately exhaust subscription quota to manufacture provider failure evidence.

Generalized development model registries, Manager Chair controls, worker pools, DeepSeek Harness settings and DDE model-management UI are outside this DIAL Hermes implementation.

## Versioned Engineering Knowledge Layer (VEKL Rev 2 + 2.1 deterministic resolver)

`DEC-020` extends the `DEC-019` immutable-Skill foundation into a federated engineering knowledge/capability gate. `DEC-024` hardens packet selection to hard-eligibility-first deterministic purpose+role minimal-coalition resolution; Skills have one exact-pin selection owner; selected resource registry identity is fingerprinted; and descriptor-only context is the default. Canon/FRC/security/current implementation evidence are resolved first. The external orchestrator persists one packet Engineering Knowledge Activation Manifest containing relevant skills plus registered docs/repos/releases/issues/advisories/tools/rules/hooks/loops/community corroboration as applicable. A zero-external-resource result remains valid.

VEKL modules:
- `skill-registry.mjs` — machine registry/approval invariants;
- `skill-resolver.mjs` — deterministic task classification, policy filters and evidence-aware ranking;
- `engineering-resource-resolver.mjs` — hard eligibility + deterministic purpose/role minimal-coalition resource selection;
- `skill-activation-store.mjs` — exact-hash immutable Skill activation plus resource fingerprint/provenance verification;
- `engineering-knowledge-broker.mjs` — queue/Feature resolution gate;
- `skill-outcome-recorder.mjs` — non-authoritative observable outcome telemetry;
- `learned-skill-curator.mjs` — proposal-only DIAL procedural learning boundary.

The primary Hermes/Sol process receives `DIAL_SKILL_ACTIVATION_DIR` and may use Hermes native progressive skill loading. The direct Claude Code/Sonnet fallback receives the exact same selected `SKILL.md` bodies rendered from the persisted activation. Runtime failover therefore preserves skill provenance without requiring the two runtimes to use the same loading mechanism.


Ahead-of-work research is handled by `engineering-research-manager.mjs` + `engineering-presearch.mjs`. Exact project-aware Sol (Codex App Server) is primary and exact Sonnet 5 is fallback. It reads current Project Truth, Development Plan and DIAL mission/checkpoint context in read-only mode, forecasts the next 3–5 dependency-safe packets, and pre-caches registered allowlisted references. `dial-engineering-research.timer` provides periodic refresh and `dial-engineering-research.path` reacts to truth/plan/mission/checkpoint changes. Research cannot reprioritise DIAL or carry sensitive production data.

Research-reference Google/Android versions are not executable pins. No vendor skill may activate until its registry record is `APPROVED`/`ACTIVE` with exact production pin, content hash, immutable snapshot and completed donor/security/conflict/eval qualification.


## Adaptive Execution Fabric Rev 2

`DEC-028` adds a worker-only execution fabric below VEKL 2.2. `task-triage.mjs` classifies risk deterministically; `task-execution-envelope.mjs` binds material worker execution to the current Unit/KRT/activation; `harness-capability-exchange.mjs` hard-filters qualified execution workers and cannot select the Hermes manager runtime; `compute-governor.mjs` reserves/settles inference capacity; `execution-topology.mjs` chooses the minimum safe topology; `role-context-projector.mjs` projects the existing VEKL capsules; `worker-lease-manager.mjs` enforces repository-wide write scopes and fencing; and `execution-receipt.mjs` records immutable admitted-execution evidence.

Durable AEF state lives under `$DIAL_CONTROL_HOME/execution`. Authenticated material owner steer through the typed operator gateway waits for any current repository writer to reach its safe boundary, then supersedes affected AEF envelopes and revokes their leases immediately before the direct owner turn executes; normal owner steering is not placed in the autonomous inbox. Provider/design output remains non-authoritative and is quarantined before admission. Stitch is optional development tooling and is disabled unless its explicit provider policy/credentials/health gates are satisfied.
