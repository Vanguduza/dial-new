# DIAL Hermes + Codex Orchestration Control Plane

Status: **LOCKED TARGET DESIGN — QUALIFICATION REQUIRED BEFORE ACTIVATION**

This document defines the target architecture for running the DIAL development orchestration control plane on an Oracle Cloud Linux host using Hermes as the persistent shell/session/memory host and Codex App Server as the preferred agent runtime.

## 1. Authority boundary

- **DIAL repository and registries are authoritative.**
- **DIAL deterministic supervisor owns orchestration continuity, manager leases, runtime health, checkpoints and failover policy.**
- **Hermes owns persistent sessions, memory services, gateway/scheduling and runtime hosting.**
- **Codex App Server owns Codex model execution, shell, edits, sandbox, MCP and thread/turn lifecycle.**
- **GPT-5.6 Sol is the preferred DIAL manager when available.**
- **Claude Code / Sonnet 5 is the cross-provider failover manager.**
- **Opus and Fable are high-value specialist/review tiers, not continuity owners.**
- **Hermes memory accelerates reconstruction but never overrides Git, canonical registries, tests or evidence.**

## 2. Process topology

```text
Oracle Cloud host
  ├─ hermes-gateway.service
  ├─ dial-orchestrator.service
  ├─ Hermes sessions / memory / retrieval
  ├─ Codex App Server runtime
  │    └─ preferred model: gpt-5.6-sol
  ├─ Claude Code runtime (failover/specialists)
  └─ DIAL repo + isolated worktrees
```

No LLM process is allowed to own DIAL's ability to continue operating.

## 3. Persistent Context & Memory Fabric

Runtime state lives outside Git under `/var/lib/dial-control` on Oracle persistent block storage.

```text
/var/lib/dial-control/
  state/
  checkpoints/
  capsules/
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

### HOT memory
Current Feature ID, manager lease, atomic unit, dirty paths, last verified commit, current gate, recent decisions, active specialists and next action.

### WARM memory
Feature-specific historical conclusions, review findings, rejected approaches, failure lessons, implementation summaries and session references.

### COLD memory
Archived raw sessions, superseded capsules, detailed logs and historical investigations. Cold memory is searched only on explicit need.

## 4. Source-of-truth order

1. DIAL canonical repository
2. Machine registries and evidence
3. Current Git/worktree state
4. DIAL orchestration checkpoint
5. Handoff capsule
6. Hermes retrieved memory
7. Historical conversational material

A lower layer may never override a higher layer.

## 5. Manager lease

The manager role is represented by a renewable lease, not by conversational convention.

Required fields:
- lease id
- runtime
- requested model
- resolved model
- Feature ID
- worktree
- atomic unit
- acquired timestamp
- health state
- expiry/renewal boundary

A lease is invalid if the resolved model differs from the requested model when a hard model pin is required.

## 6. Preferred manager policy

Initial policy:

- primary manager: Codex App Server / `gpt-5.6-sol`
- failover manager: official Claude Code / Sonnet 5
- deep specialist: Claude Opus
- exceptional specialist/reviewer: Fable
- high-volume Codex work: lower-cost Codex tiers where policy permits

The supervisor selects by availability, quota, task criticality, security class, money/health sensitivity, context requirements, independent-review constraints and current continuity.

## 7. Context Broker

Before a manager turn, the broker assembles a bounded packet from:
- `context-get.mjs <FEATURE_ID>` output
- active checkpoint
- current Git status/diff
- handoff capsule
- relevant Feature-scoped memory
- selected historical session fragments only when needed

The full historical transcript is never the default takeover mechanism.

## 8. Handoff capsule

Capsules record operational reasoning without attempting to preserve hidden chain-of-thought.

They contain:
- objective
- completed units
- active unit
- remaining units
- important decisions and evidence
- rejected approaches worth retaining
- known risks/failures
- last green gate
- next action
- session references

A replacement manager must verify the capsule against repository state before continuing.

## 9. Runtime health states

Minimum state vocabulary:

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

Runtime health and model/account capacity are separate dimensions.

## 10. Failover

On manager failure:

1. freeze/expire current lease;
2. persist current observable worktree state;
3. classify failure;
4. preserve/update checkpoint and capsule;
5. select an eligible alternate runtime;
6. construct a bounded takeover packet;
7. start the replacement runtime;
8. verify model identity and full tool envelope;
9. verify Git/Feature/gate state;
10. issue a new manager lease;
11. continue from the next safe atomic boundary.

The outgoing model is not required to be alive for recovery.

When a preferred runtime becomes available again, mark it `ELIGIBLE`; do not interrupt an active atomic unit. Re-election happens at a safe manager boundary.

## 11. Hermes/Codex runtime constraints

Hermes Codex App Server runtime is the preferred integration because it already provides:
- ChatGPT subscription authentication via Codex CLI;
- Codex shell/apply-patch/update-plan/view-image/web-search tools;
- Codex sandboxing;
- thread/turn lifecycle;
- Hermes event projection/session persistence;
- Hermes tool callbacks via MCP.

Known runtime limitation: Hermes `memory`, `session_search`, `delegate_task` and Hermes `todo` are not directly callable from the stateless Codex MCP callback. DIAL therefore performs memory retrieval and context preparation in the supervisor/context-broker stage before the Codex turn.

## 12. Oracle role

Oracle is the persistent control-plane host and memory/storage host. It does not run a large local model.

The control plane should be provisioned on ARM64 Linux where available and sized within the user's Always Free entitlement. Persistent block storage carries Hermes sessions, DIAL runtime state, feature memories, capsules, checkpoints and retrieval indexes.

## 13. Security boundaries

- secrets/OAuth tokens are never committed;
- Codex and Claude credentials live only in their native home/config locations;
- runtime state directories must be private to the service account;
- `:danger-no-sandbox` is prohibited;
- initial Codex workspace permission profile is `:workspace`;
- DIAL gate advancement remains deterministic and cannot be asserted by model text;
- memory/capsules may not contain secrets;
- destructive host commands require explicit allowlisting outside the model layer.

## 14. Qualification gates

The system is not active until all are demonstrated:

1. Hermes survives Codex process termination.
2. requested and resolved Codex model identity are recorded and agree.
3. Codex can read/write/test inside a disposable DIAL worktree.
4. Codex turns persist into Hermes history.
5. a fresh Codex thread can reconstruct work from checkpoint + capsule without full transcript replay.
6. Codex manager failure triggers a Sonnet manager lease.
7. Sonnet takeover verifies repository truth before editing.
8. Claude/Fable exhaustion does not stop Codex-led orchestration.
9. Codex capacity exhaustion preserves a resumable state and selects Claude only if Claude capacity is actually available.
10. stale/corrupted memory cannot override repository truth.
11. control-plane services recover after reboot.
12. secrets are absent from Git and memory artifacts.

Until this suite is green, the branch remains qualification-only and must not replace the existing development entry path.
