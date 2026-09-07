# DIAL Hermes External Orchestration — Implementation State

Last updated: 2026-09-04

This record tracks DIAL's Oracle-hosted Hermes orchestration branch only. It does not advance DIAL product Feature gates and it is not DDE model-management architecture.

## Current state

```text
REPOSITORY_EXTERNAL_ORCHESTRATION_IMPLEMENTED
REPOSITORY_AUXILIARY_OPERATIONS_PLANE_IMPLEMENTED
AUXILIARY_API_CONFIGURATION_IMPLEMENTED
MULTI_PROJECT_OPERATIONS_ISOLATION_IMPLEMENTED
RUNTIME_POLICY_LOCKED_SOL_THEN_SONNET
ORACLE_HOST_PREVIOUSLY_PROVISIONED
ORACLE_BOOTSTRAP_PREVIOUSLY_COMPLETE
SUBSCRIPTION_AUTH_PREVIOUSLY_PRESENT
LIVE_AUXILIARY_OPERATIONS_PLANE_DEPLOYED
LIVE_BOUNDED_SERVICE_RECOVERY_PROVEN
LIVE_EXTERNAL_QUEUE_HEALTH_GREEN
LIVE_READ_ONLY_SCHEDULED_VERIFY_GREEN
LIVE_CHECKPOINT_AND_HERMES_BACKUP_GREEN
CURRENT_HEAD_DETERMINISTIC_ORACLE_VERIFY_GREEN
LIVE_CURRENT_HEAD_RUNTIME_QUALIFICATION_REQUIRED
PROCESS_SOAK_REQUIRED
EXTERNAL_QUEUE_FAILOVER_SOAK_REQUIRED
REBOOT_SOAK_REQUIRED
FINAL_SECURITY_GATE_REQUIRED
DEVELOPMENT_BLOCKED
PRODUCTION_GREEN_NOT_REACHED
```

**DIAL product development must not resume yet.**

## Live Oracle auxiliary-operations evidence — 2026-09-04

The auxiliary operations implementation has been installed on the Oracle control host without invoking either model runtime. Live evidence currently proves:

- `dial-hermes-operations.service` is active and running;
- operations authority is `NON_AUTHORITATIVE_CONTROL_PLANE_OPERATIONS`;
- the operations service has `NoNewPrivileges=yes`;
- `/home/ubuntu/dial-new` is read-only to the operations service;
- `/var/lib/dial-control` is its only configured write path;
- default schedules are active with API use disabled;
- service-health, bounded service-recovery, external-queue-health, repository-integrity, deterministic-verification, evidence-preparation and backup-verification jobs execute deterministically;
- the first scheduled `deterministic_verify` completed `npm run verify` successfully from inside the read-only operations-service sandbox with 21 test files and 361/361 tests passing and `model_runtime_used=false`;
- external queue health is green with a fresh `EXTERNAL_ORACLE_ORCHESTRATOR` heartbeat, no queued/processing jobs and no stale-processing jobs;
- a controlled live fault injection stopped only `hermes-dial-dashboard.service`; the operations plane restarted exactly that allowlisted service, confirmed recovery, and kept `dial-hermes-operations.service` explicitly excluded from recovery;
- a transaction-consistent Hermes `state.db` backup was created through the existing memory-maintenance mechanism, mode `0600`, and subsequent checkpoint/backup verification is green;
- supervisor state migrated to schema 5 with the auxiliary-operations boundary recorded;
- auxiliary API status is currently unconfigured/disabled and exposes no key material;
- Hermes runtime, external orchestrator and operations service environments contain no ambient OpenAI/Codex/Anthropic API-key assignments;
- an ordinary external development negative-control job still fails with `DEVELOPMENT_BLOCKED`, with no runtime/model selected.

Repository deterministic verification for the expanded operations implementation passed with 21 test files and 361 tests. The live operations evidence packet at commit `a17723294703533e8707d262ecac2ba84a2071ce` reports a clean repository, healthy services, healthy external queue, green deterministic verification and green backup/checkpoint evidence. Live Sol/Sonnet qualification and the mandatory process/external/reboot soaks remain pending.

The only mechanism permitted to change that state is the installed-host finalizer:

```bash
bash deploy/oracle/hermes-codex/finalize-control-plane.sh
```

It creates `PRODUCTION_GREEN` only when every required live evidence artifact is valid for the qualified Hermes control-plane implementation.

## Locked runtime policy

Exactly this chain is executable:

```text
GPT-5.6 Sol / Hermes -> Codex App Server
  -> Claude Sonnet 5 / official Claude Code CLI
  -> NO_HERMES_RUNTIME_AVAILABLE
```

No additional Codex plan model, Sonnet-class alias/model, Fable, Opus, Haiku or generic provider is an executable Hermes fallback.

Plan-model discovery remains available for observability only. Exact `gpt-5.6-sol` and exact `claude-sonnet-5` are the only models classified as Hermes-executable.

Hermes' built-in Anthropic fallback remains disabled so the Claude fallback cannot silently become Anthropic API billing. Both runtime paths are intended to use supported subscription authentication.

## Outside-project orchestration implementation

Repository implementation now includes a persistent Oracle-side execution path independent of an initiating project-local development session:

- `dial-hermes-orchestrator.service`
- `/var/lib/dial-control/work-queue/{inbox,processing,completed,failed}`
- `dial-hermes-submit`
- `dial-hermes-job`
- atomic queue claim and persistent job state
- runtime/model provenance on completed/failed jobs
- external-orchestrator heartbeat
- fail-closed development gate
- fixed read-only/no-tools pre-green qualification canary

Ordinary queued work is refused until `state/external-orchestration-gate.json` is `PRODUCTION_GREEN`.

After qualification, the canonical development entrypoint is:

```bash
dial-hermes-submit "<development instruction>"
```

Direct ad-hoc project-session development is not the canonical production path.

## Durable qualification boundary

The production gate is not tied to every future DIAL product commit. It is tied to a cryptographic fingerprint of:

- `agent-system/orchestration`
- `deploy/oracle/hermes-codex`

Therefore:

- normal product commits do not force Hermes requalification;
- any change to the Hermes orchestration implementation or Oracle deployment invalidates the gate and requires requalification/soak.

## Repository implementation present

The branch currently contains:

- Oracle ARM64 bootstrap;
- subscription-auth safeguards;
- Hermes configuration locked to `openai-codex`, `gpt-5.6-sol`, `codex_app_server`;
- exact Sol provenance probe;
- exact Sonnet 5 provenance probe;
- exact Sol -> exact Sonnet operational failover;
- no executable third model;
- checkpoint-before-fallback protection against blind replay;
- bounded DIAL context rehydration for fallback;
- persistent runtime supervisor;
- persistent external Oracle orchestrator queue/service;
- non-authoritative auxiliary operations scheduler/service;
- deterministic repo/service/evidence/backup verification jobs;
- optional API summarisation using a file-scoped secret outside Git;
- OpenAI-compatible and Anthropic auxiliary API protocols;
- strict per-project operations registry/state isolation;
- external development gate and control-plane fingerprinting;
- HOT/WARM/COLD and Feature-scoped memory;
- checkpoint and handoff capsules;
- transaction-consistent Hermes `state.db` backup;
- process-death soak harness;
- external queued-turn failover soak harness;
- actual reboot persistence harness;
- final installed-host security/production gate;
- deterministic repository qualification tests.

Repository implementation does **not** imply installed-host qualification.

## Previously recorded Oracle host baseline

The branch previously recorded successful host provisioning on an Oracle Always Free Ampere host in Johannesburg with Ubuntu 24.04 ARM64, Codex ChatGPT OAuth, Claude subscription authentication, Hermes activation, and persistent Hermes services.

That evidence establishes that the infrastructure was provisioned, but it does not automatically qualify the new current control-plane implementation. The branch must be pulled/deployed and all current live gates rerun.

Sensitive operational details such as public IP addresses and account identifiers are intentionally omitted from this summary.

## Naturally observed provider-capacity block

The last recorded real subscription observations were:

```text
Codex / GPT-5.6 Sol weekly reset: not before 2026-09-07 02:42 UTC
Claude / Sonnet 5 weekly reset:    not before 2026-09-07 03:00 UTC
```

Those were naturally observed limits, not manufactured test states. Current live capacity must be re-probed when qualification is executed; do not assume either provider is healthy before the probe and do not deliberately exhaust subscriptions to create quota evidence.

Because the current date is 2026-09-04, the recorded reset times are still in the future. Live exact-runtime qualification therefore remains potentially quota-blocked until those reset windows unless provider state changes independently.

## Mandatory live qualification sequence

On the Oracle host after pulling the current branch and running the current installer:

```bash
bash deploy/oracle/hermes-codex/install-control-plane.sh
```

Then, when real subscription capacity is available:

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

### Installed-runtime qualification must prove

- `dial-hermes-operations.service` is active and reports non-authoritative/no-development authority;
- optional auxiliary API key material, when configured, remains outside all Hermes runtime service environments and is mode `0600`;

- current repository verification passes;
- exact `gpt-5.6-sol` identity is HEALTHY;
- exact `claude-sonnet-5` identity is HEALTHY;
- `dial-hermes` primary path completes through exact Sol;
- fixed external qualification canary is queued outside the project process and executed by `dial-hermes-orchestrator.service` through exact Sol;
- Sol-unavailable routing selects exact Sonnet 5 immediately;
- exact Sonnet 5 can execute through official Claude Code;
- total loss produces `NO_HERMES_RUNTIME_AVAILABLE`;
- Sol regains preference after recovery;
- Hermes session backup succeeds.

### Process soak must prove

- actual Codex App Server SIGKILL;
- exact Sonnet 5 fallback;
- safe return to exact Sol;
- runtime-supervisor SIGKILL/restart;
- Hermes gateway SIGKILL/restart.

### External queue failover soak must prove

- a real externally queued qualification job is claimed by the Oracle orchestrator;
- the actual Codex App Server process is SIGKILLed while that job is executing;
- the **same queued job** continues and completes through exact Sonnet 5;
- exact Sol regains preference after Codex recovery.

### Reboot soak must prove

- changed Linux boot ID;
- persistent service recovery;
- checkpoint persistence;
- HOT/WARM/COLD persistence;
- Hermes `state.db` backup persistence;
- post-reboot exact Sol preference.

### Finalizer must prove

- all evidence is GREEN for the qualified control-plane implementation;
- external orchestrator heartbeat is fresh;
- subscription-only Hermes runtime configuration contains no ambient OpenAI/Codex/Anthropic API-key material;
- auxiliary API configuration, if present, is isolated to the operations secret file and cannot authorize development;
- Hermes built-in provider fallback is still disabled;
- the current Hermes control-plane fingerprint matches the qualified fingerprint.

Only then may it write:

```text
EXTERNAL_HERMES_ORCHESTRATION=PRODUCTION_GREEN
DEVELOPMENT_RESUMABLE_THROUGH_EXTERNAL_HERMES
```

## CI evidence rule

A prior green commit is not inherited after control-plane changes. Current repository verification must be run against the present branch state.

If GitHub Actions creates jobs without a runner and executes zero steps, classify that as **CI EXECUTION UNAVAILABLE / NOT VERIFIED**, not as a test failure and not as a green result.

## Architecture contamination boundary

This DIAL branch does not implement DDE's Manager Chair, Lesser Task Pool, generalized model registry, Settings -> Models UI, DeepSeek Harness configuration, custom provider marketplace, or generalized development-model routing.

Hermes on Oracle is DIAL's external orchestration infrastructure. DDE remains a separate system.
## Claude chat control bridge and persistent DIAL mission

Implemented in the consolidated DIAL repository, but **not yet production-qualified after the current control-plane changes**:

- `mission-control.mjs` persists the DIAL-only `dial-development-root` mission outside Git;
- `mission-controller.mjs` dispatches the next bounded manager turn only when the mission is `RUNNING`, the queue is idle and the external-Hermes development gate is green;
- `chat-control-bridge.mjs` exposes a bearer-token-protected, DIAL-only MCP/JSON-RPC surface on host-local `127.0.0.1:9130/mcp`;
- the bridge exposes typed status/progress/pause/resume/reprioritisation/approval/instruction tools and no generic shell/filesystem primitive;
- `external-orchestrator.mjs` now respects mission pause state and priority ordering;
- cursor-based progress survives Claude session loss;
- the chat-control token is stored outside Git at `/var/lib/dial-control/secrets/chat-control.token` with mode `0600`;
- installer units are `dial-chat-control.service` and `dial-mission-controller.service`;
- qualification/finalization/reboot-soak scripts now require the new services and DIAL-only chat-control boundary before `PRODUCTION_GREEN`.

Target authority model:

```text
Claude chat = operator/control surface
Oracle mission controller = continuity + next-turn dispatch
External Oracle orchestrator = execution queue
Sol/Sonnet = bounded workers
Repository/tests/gates = implementation truth
```

Current evidence is limited to local module/HTTP smoke tests and unit/integration tests. A remote Claude chat connection, authenticated private tunnel/Access policy, live Sol/Sonnet qualification, DIAL-owned process-failover soak and DIAL-only service-continuity soak remain required before claiming the chat-control path production-green. A shared-host reboot is explicitly not a DIAL gate.


## Shared multi-project Oracle host safety correction

DIAL qualification is now project-isolated. The earlier host-reboot/global-Hermes-gateway soak requirement was unsafe on a shared Hermes host because it could disrupt independent projects. The mandatory DIAL gate now proves persistence through DIAL-specific runtime/orchestrator/operations/chat-control/mission-controller restarts. The process failover soak kills only a Codex App Server process proven to be owned by the DIAL probe/orchestrator process tree. Whole-host reboot testing remains available only as optional explicitly approved platform maintenance evidence.

## 2026-09-07 — VEKL integration

`DEC-019` adopts the DIAL Versioned Engineering Knowledge Layer. Repository schemas/registries, deterministic resolver, activation manifest/hash store, Oracle queue integration, Sol/Sonnet provenance continuity, non-authoritative outcome telemetry, learned-skill staging boundary and chat-control observability are implemented and covered by `tests/orchestration-vekl.test.mjs`.

The current VEKL registry contains 19 records. Four exact Android vendor skills are approved and immutable at `android/skills@bac232fd02b0855df9275281a2a7a47643768719`: Adaptive Compose, Navigation 3, Edge-to-edge and Android Intent Security. Their activation constraints are persisted into each manifest and carried identically to Sol and Sonnet; Intent Security additionally retains an independent-specialist-review requirement. The upstream Android CLI is quarantined because its pinned skill contains a blocked curl-pipe-shell install instruction, and upstream Testing Setup is not directly approved after independent manager review; DIAL-safe wrappers are staged for those two procedures. `google/skills` remains research-reference-only.
