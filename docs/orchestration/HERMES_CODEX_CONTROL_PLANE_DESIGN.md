# DIAL Hermes External Runtime Control Plane

Status: **IMPLEMENTED IN REPOSITORY — LIVE PRODUCTION QUALIFICATION REQUIRED**

See `DIAL_HERMES_RUNTIME_BOUNDARY.md` for the non-negotiable authority boundary and `IMPLEMENTATION_STATE.md` for current evidence state.

## Purpose

Give DIAL a persistent Oracle-hosted orchestration layer that can receive development work independently of an initiating project session, reconstruct current DIAL state, execute through the locked model chain, survive runtime/process/host interruption, and fail closed without becoming a second product authority.

## Locked runtime chain

```text
1. Hermes -> Codex App Server -> exact gpt-5.6-sol
2. official Claude Code -> exact claude-sonnet-5
3. NO_HERMES_RUNTIME_AVAILABLE
```

Model discovery is retained only for diagnostics. No discovered model is an executable fallback unless it is one of the two exact locked identities above.

## Process topology

```text
Oracle host
  |
  +-- /var/lib/dial-control
  |     +-- work-queue/inbox
  |     +-- work-queue/processing
  |     +-- work-queue/completed
  |     +-- work-queue/failed
  |     +-- state / checkpoints / capsules / memory / evidence / events
  |
  +-- dial-hermes-orchestrator.service
  |     +-- atomically claims persisted work
  |     +-- checks development-unblock gate
  |     +-- invokes hermes-runtime-executor.mjs
  |
  +-- dial-hermes-runtime.service
  |     +-- low-frequency health/provenance supervisor
  |
  +-- Hermes gateway + optional localhost dashboard
  +-- Codex App Server / Codex CLI
  +-- Claude Code
  +-- /home/ubuntu/dial-new
```

No LLM process owns the ability to reconstruct control state. The persistent queue and evidence live outside the Git worktree.

## Development gating

Ordinary work may be submitted/executed only through the external Oracle queue after either (a) `finalize-control-plane.sh` creates full `PRODUCTION_GREEN`, or (b) `DEC-021`'s `finalize-development-readiness.sh` creates a development-only `DEVELOPMENT_READY_FALLBACK` gate while exact Sol is temporarily provider-limited and exact Sonnet/VEKL/queue/continuity evidence is live-green. The latter is not production certification.

Before green, the queue accepts no development bypass. The sole exception is an exact fixed qualification canary whose instruction is read-only/no-tools and cannot be replaced with arbitrary work.

The production gate binds qualification to a cryptographic fingerprint of:

- `agent-system/orchestration`
- `agent-system/engineering-knowledge`
- `deploy/oracle/hermes-codex`

This means normal product changes can proceed without requalifying Hermes, but any control-plane/deployment change automatically blocks future queued work until requalification.

## Runtime health

Health states include `HEALTHY`, `RATE_LIMITED`, `MODEL_LIMITED`, `ACCOUNT_LIMITED`, `AUTH_FAILED`, `PROCESS_FAILED`, `STALLED`, `TOOLCHAIN_DEGRADED` and `UNKNOWN`.

An executable runtime requires:

- fresh `HEALTHY` evidence;
- `toolchain_usable=true`;
- exact requested/resolved model match;
- intended subscription authentication;
- exact locked model identity.

Codex qualification rejects rerouting. Claude qualification derives resolved identity from structured model-usage output.

### Capacity-preserving runtime evidence (`DEC-022`)

Sol inference is not a heartbeat. The control plane must exhaust deterministic evidence before issuing a model turn. Exact Codex identity is cached only after a live identity-proven Sol interaction and is bound to a fingerprint covering the Codex executable/version, ChatGPT OAuth route, Hermes executable/version/config and the identity/routing control code. The cache expires after seven days by default and becomes invalid immediately when that fingerprint changes.

A supervisor or DIAL service restart preserves fresh runtime evidence rather than rewriting it to `UNKNOWN`. Restart also anchors the next background probe to the oldest persisted runtime observation instead of probing immediately; only a true bootstrap with no evidence performs an immediate refresh. Background refresh reuses fresh health; a live Codex probe is required only when the normal cadence makes evidence due/stale, a provider retry boundary has elapsed, an operator explicitly forces it, or a production-certification contract requires it.

When Sol returns `ACCOUNT_LIMITED`, `RATE_LIMITED` or `MODEL_LIMITED`, Oracle persists `retry_after` when the provider supplies one and otherwise applies a bounded state-specific cooldown. During the active cooldown:

- ordinary packets do not invoke Sol and continue through exact Sonnet 5;
- VEKL ahead-of-work research skips Sol and uses exact Sonnet 5;
- background health refresh does not issue a Sol inference probe;
- repeated probe attempts are recorded as suppressed/reused evidence rather than charged model turns.

`AUTH_FAILED` remains fail-closed until an external authentication change. A process/toolchain failure is never relabelled as a quota state merely to unlock fallback. `dial_runtime_capacity_status` / `npm run agent:runtime:capacity-status` expose the current decision, retry boundary, identity-cache validity and recent live-versus-suppressed call counts.

Fallback-readiness finalization also reuses a current semantic Sonnet ahead-of-work forecast when a preceding full-qualification attempt already produced it after discovering a Sol capacity boundary. It refreshes only when that forecast is stale or semantically invalid, avoiding a second identical fallback research turn.

## Operational execution

A queued instruction first executes through exact Sol. The executor verifies provider/model provenance from the actual turn.

If Sol fails with a classified availability/auth/process/toolchain failure:

1. record the primary failure;
2. capture current observable DIAL repository/checkpoint state;
3. prove exact Sonnet 5 is eligible;
4. rebuild bounded DIAL context from current repository authority;
5. continue the same original instruction through official Claude Code / exact Sonnet 5;
6. require Sonnet to inspect current worktree state before edits because Sol may have completed partial tool actions.

There is no intermediate Codex model and no third fallback. If exact Sonnet 5 cannot be proven, execution stops with `NO_HERMES_RUNTIME_AVAILABLE`.

## Authentication/billing

- Codex uses supported ChatGPT subscription OAuth.
- Claude uses supported Claude subscription auth via official Claude Code.
- Hermes built-in Anthropic fallback is cleared.
- ambient `OPENAI_API_KEY`, `CODEX_API_KEY` and `ANTHROPIC_API_KEY` are rejected by the subscription-only install/finalization path.

## Persistent continuity

The control plane preserves:

- observable repository checkpoints;
- HOT active-state mirror;
- WARM Feature-scoped summaries/handoffs;
- COLD archive;
- handoff capsules;
- selected runtime provenance;
- external job lifecycle/evidence;
- transaction-consistent Hermes `state.db` backups.

All memory is non-authoritative. Repository canon, machine registries, Git state, tests and evidence remain above memory/history.

## Operator commands

Install/update:

```bash
bash deploy/oracle/hermes-codex/install-control-plane.sh
```

After either valid development-ready gate, submit work externally:

```bash
dial-hermes-submit "<development instruction>"
dial-hermes-job [job-id]
```

`dial-hermes` remains a runtime diagnostic/qualification entrypoint; it is not the canonical post-green development ingress.

## Qualification contract

Repository validation includes typecheck, orchestration tests, full DIAL verification, JavaScript/shell syntax and diff checks.

Installed-runtime qualification must prove exact Sol, exact Sonnet 5 and an external queue canary.

Process soak must prove real Codex App Server SIGKILL, exact Sonnet 5 fallback, Sol recovery, runtime-supervisor recovery and Hermes gateway recovery.

External orchestration soak must prove the same externally queued job survives a real Codex App Server SIGKILL and finishes on exact Sonnet 5 before Sol regains preference.

Reboot soak must prove a changed Linux boot ID plus service/checkpoint/HOT/WARM/COLD/Hermes-backup persistence.

Finalization must validate all evidence, service health, fresh external heartbeat, subscription-only security and the qualified control-plane fingerprint before writing `PRODUCTION_GREEN`.

Deliberate quota exhaustion is prohibited. Live provider capacity must be observed naturally.

Full production qualification is allowed to force the minimum live Sol identity/operational proof required after a control-plane fingerprint change. Project-aware VEKL forecasting follows its normal `Sol → Sonnet` research policy and a current exact-Sonnet forecast remains valid research evidence if Sol research times out or is provider-limited; full production still separately requires successful exact-Sol execution through the VEKL primary path and external Oracle queue. Qualification reuses live proofs wherever possible: the VEKL live Sol path can satisfy the operational-primary proof, deterministic routing tests replace live state mutation/support-model calls, and no extra recovery probe is issued solely to restate evidence already proven in the same qualification run. External-queue/process failover soaks remain live because they prove different failure semantics.


## Shared-host isolation

The Oracle machine is a shared infrastructure host for independent Hermes projects. DIAL qualification MUST NOT restart a global Hermes gateway, reboot the host, or target an unscoped Codex/Claude process. DIAL failure injection is limited to DIAL-owned process descendants and DIAL-specific services. Whole-host maintenance tests are outside the DIAL development-unblock gate.


## Development-only capacity fallback gate

`DEVELOPMENT_READY_FALLBACK` exists so a temporary Sol subscription/provider capacity boundary does not unnecessarily stop contract-first repository development when the already-locked exact Sonnet 5 fallback is fully healthy. It is fail-closed: Sol must still resolve as exact `gpt-5.6-sol`; only `ACCOUNT_LIMITED`, `RATE_LIMITED` or `MODEL_LIMITED` qualifies; exact `claude-sonnet-5` must be healthy; the actual external queue must complete a fallback canary; VEKL v2 must prove the exact fallback activation and a project-aware ahead-of-work forecast; full repository verification and DIAL-only continuity must be green; and the gate is bound to the current control-plane Git-tree fingerprint.

`AUTH_FAILED`, `PROCESS_FAILED`, wrong-model identity, stale heartbeat, dirty/uncommitted control-plane code or missing evidence block the gate. Once Sol is healthy, normal routing prefers Sol automatically. Full `PRODUCTION_GREEN` still requires the existing live Sol primary, real process death, same-job failover and Sol-recovery soaks; the fallback gate cannot satisfy those production-certification claims.

## VEKL engineering-knowledge plane

The DIAL control plane includes a project-scoped Versioned Engineering Knowledge Layer (`DEC-019`). It does not change runtime-model authority or repository truth. Each ordinary external queue packet resolves a persisted skill activation after Feature/JIT context. Hermes/Sol sees only the packet-scoped approved external-skill directory via `${DIAL_SKILL_ACTIVATION_DIR}`; Sonnet fallback receives the exact pinned bodies rendered from that same manifest. A mutable Google/Android checkout is never made the active skill directory.

VEKL state is stored under `/var/lib/dial-control/knowledge` and is subject to the same shared-host project-isolation law as the work queue. Approved vendor snapshots are read-only and exact-hash checked; learned DIAL wrappers stage separately and cannot promote themselves or mutate product/architecture truth.
