# DIAL Hermes Full Commander / ChatGPT Control Plane

Status: OWNER-LOCKED — implementation target.

## Purpose

DIAL uses ChatGPT mobile as the owner's primary working hub. The normal control path is:

```text
ChatGPT mobile
  -> owner-facing online Desktop Commander
  -> dial-hermes-control
  -> Hermes
  -> Hermes-owned full local Desktop Commander
  -> persistent local ChatGPT/Codex work sessions and host tools
```

Hermes also owns a second full local Commander on `van-trading-core` over the private VCN. GitHub plus OCI Run Command is the independent recovery plane. `oracle-admin` is not a normal project execution venue.

## Authority model

The capability boundary and the authority boundary are deliberately separate.

- `dial_local_commander` exposes the complete pinned Desktop Commander MCP tool surface to Hermes. It is not read-only and it carries no tool allowlist.
- Hermes is the project authority. Commander is a subordinate actuator and never becomes a peer orchestrator.
- Owner-explicit instructions may authorize Hermes to use any Commander capability on a designated working host.
- Unattended use is allowed only through a named automation in `HERMES_COMMANDER_AUTOMATION_REGISTRY.json`.
- Host-role guards, VATI risk authority, repository governance, provider routing and recovery boundaries remain independently enforced. Full Commander capability does not weaken those controls.
- Claude Code and Codex continue to receive the typed `dial-oracle-control` MCP. They do not receive a direct Commander registration.

## Commander identities

```text
owner_remote_commander
  ChatGPT mobile -> dial-hermes-control
  purpose: owner ingress transport

dial_hermes_local_commander
  Hermes -> local stdio Desktop Commander
  purpose: full control of local sessions/processes/files/tools

van_trading_local_commander
  Hermes -> private SSH stdio -> van-trading-core Desktop Commander
  purpose: full control of Trading Core sessions/processes/files/tools

oracle_admin_commander
  recovery-only, normally cold
  purpose: emergency recovery only
```

The two Hermes subordinate Commanders are full-capability surfaces. Their use is governed by the instruction/automation authority layer above them, not by deleting Commander tools.

## Local ChatGPT work surface

The deterministic automatable ChatGPT-backed work surface is Codex/App Server authenticated through the owner's ChatGPT subscription. Hermes records each long-lived work session in `sessions/chatgpt/index.json` using `chatgpt-session-registry.mjs`. The registry stores project, workspace, host, Commander identity, process/session references, thread identity when available, checkpoint and heartbeat state.

A visual ChatGPT desktop process may coexist on a workstation host, but no completion claim is based on GUI presence alone. Hermes must have an observable Commander/Codex execution path and durable session evidence.

## Session lifecycle

```text
STARTING -> READY -> BUSY -> WAITING_FOR_OWNER -> READY
                      |             |
                      v             v
                   DEGRADED -> RECOVERING -> READY
READY/BUSY -> CLOSING -> CLOSED
```

Hermes reuses an eligible READY or WAITING_FOR_OWNER session when project, host, workspace and context fingerprint still match. A stale heartbeat marks a session DEGRADED. Recovery is then performed through the registered `LOCAL_RUNTIME_RECOVERY` automation or an explicit owner instruction.

Phone or mobile-app disconnection is not a task cancellation. Durable mission, session and checkpoint state lives on the Oracle control plane.

## Designed automations

The canonical registry is `agent-system/registries/HERMES_COMMANDER_AUTOMATION_REGISTRY.json`.

Initial automations:

- `CHATGPT_SESSION_LIFECYCLE` — start, interact with, inspect, stop and recover Hermes-managed ChatGPT/Codex sessions.
- `WORKSPACE_MAINTENANCE` — deterministic file/workspace operations inside an already-authorized mission.
- `LOCAL_RUNTIME_RECOVERY` — recover a failed local process/session.
- `COMMANDER_CONFIGURATION_CHANGE` — configuration mutation; owner approval is required.

Adding a new unattended use of Commander requires a registry change. Ad-hoc model initiative is not an automation authority.

## Installation on dial-hermes-control

```bash
bash deploy/oracle/hermes-codex/install-hermes-local-mcp-plane.sh --dry-run
bash deploy/oracle/hermes-codex/install-hermes-local-mcp-plane.sh
bash deploy/oracle/hermes-codex/install-owner-remote-commander.sh
sudo -u ubuntu dial-owner-commander-pair
bash deploy/oracle/hermes-codex/qualify-hermes-local-mcp-plane.sh
```

The local Commander runtime is installed from the exact repository package-lock at a fixed user-owned prefix. Hermes config points to a fixed wrapper, not a dynamic `npx @latest` path.

## Recovery independence

Normal:
```text
ChatGPT mobile -> online Commander -> Hermes -> full subordinate Commander
```

Recovery:
```text
ChatGPT -> GitHub workflow_dispatch -> GitHub-hosted runner -> OCI API -> OCI Run Command
```

The recovery workflow accepts enumerated target/action inputs only. It has no free-form shell input. Destructive or disruptive actions use the protected `oracle-recovery` GitHub environment.

`oracle-admin` remains available as a break-glass recovery host but is removed from the normal ChatGPT work path. Loss of `oracle-admin` must not stop ordinary Hermes work; loss of Hermes/Commander must not remove the GitHub/OCI recovery route.

## Qualification

The topology is GREEN only when:

1. Hermes owns the local Commander child process.
2. `tools/list` proves the required process, file-mutation, configuration, session and inspection tools exist.
3. No `tools.include` filter reduces Hermes' Commander surface.
4. Codex and Claude remain on the typed DIAL MCP and have no direct Commander bypass.
5. The owner-facing online Commander can coexist with the Hermes child Commander.
6. Session registry tests prove reuse, heartbeat degradation and checkpoint semantics.
7. `oracle-admin` remains excluded from normal project work.
8. GitHub recovery contains no arbitrary shell input and targets OCI Run Command.
