# DIAL Claude Chat Control Bridge

Status: implemented control-plane architecture, subject to Oracle bootstrap/qualification before development authority is unblocked.

## Purpose

Claude chat is the human-facing DIAL operator console. It is not the process that keeps DIAL development alive.

The Oracle host owns persistence, task dispatch, runtime selection, recovery and continuation. Claude chat reads status and issues typed control requests to that persistent Oracle mission. If a Claude session ends, the Oracle mission remains authoritative and continues according to its state.

```text
Owner
  ↓
Claude chat / MCP client
  ↓
DIAL Chat Control Bridge
  ↓
Persistent DIAL root mission
  ↓
Mission Controller
  ↓
External Oracle Orchestrator
  ↓
GPT-5.6 Sol → exact Sonnet 5 fallback
  ↓
DIAL repository + deterministic gates
```

## Locked authority model

- DIAL repository and canonical registries remain product truth.
- Oracle mission state is orchestration continuity, not product truth.
- Claude chat is an operator/control surface only.
- The bridge exposes no generic shell or filesystem tool.
- The bridge is hard-bound to project slug `dial`.
- Other Hermes projects are not queryable or controllable through this bridge.
- Worker model output cannot advance DIAL feature gates without repository evidence and existing deterministic governance.

## Implemented modules

- `agent-system/orchestration/mission-control.mjs`
  - durable root mission;
  - pause/resume;
  - owner priority directive;
  - owner approvals/rejections;
  - mission packet projection;
  - fail-closed mission state.
- `agent-system/orchestration/mission-controller.mjs`
  - persistent continuation loop;
  - dispatches a fresh bounded manager turn when the mission is RUNNING and idle;
  - records completed/failed turns;
  - stops on explicit owner-blocker/completion signals;
  - pauses after repeated failures instead of hot-looping.
- `agent-system/orchestration/chat-control-bridge.mjs`
  - DIAL-only typed tools;
  - MCP-compatible JSON-RPC `POST /mcp` endpoint;
  - 256-bit bearer token stored outside Git;
  - cursor-based progress feed;
  - audit events for every tool call.
- `agent-system/orchestration/external-orchestrator.mjs`
  - mission-aware claim gate;
  - priority-aware queue ordering;
  - paused mission jobs are not claimed.

## Claude-facing tools

The bridge exposes:

- `dial_project_status`
- `dial_mission_status`
- `dial_submit_instruction`
- `dial_list_packets`
- `dial_packet_status`
- `dial_progress_since`
- `dial_pause_mission`
- `dial_resume_mission`
- `dial_reprioritize`
- `dial_approve_gate`
- `dial_reject_gate`
- `dial_verification_status`
- `dial_recent_failures`
- `dial_evidence`
- `dial_skill_status`
- `dial_engineering_knowledge_status`
- `dial_engineering_research_status`
- `dial_runtime_capacity_status`

There is intentionally no arbitrary command execution tool.

## Natural-language operator behaviour

A Claude chat connected to this bridge should translate normal instructions into typed tools.

Examples:

- “Resume” → `dial_resume_mission`
- “Pause after this packet” → `dial_pause_mission` after observing current packet completion
- “Status” → `dial_mission_status` + `dial_project_status`
- “What changed since last time?” → `dial_progress_since` using the last returned cursor
- “Prioritise GMPC canon closure” → `dial_reprioritize`
- “Approve GMPC-CANON-CLOSURE” → `dial_approve_gate`
- “Show the last failed packet” → `dial_recent_failures`
- “Has verification passed?” → `dial_verification_status`

Claude should report Oracle state, not infer state from chat history.

## Persistent root mission

Canonical mission ID:

```text
dial-development-root
```

Mission states:

```text
PAUSED
RUNNING
BLOCKED_OWNER
WAITING_RUNTIME
COMPLETE
```

The mission is created PAUSED. Development does not begin merely because the bridge is installed.

`dial_resume_mission` changes durable Oracle state to RUNNING. The mission controller then ensures that when the DIAL mission has no queued or processing packet, a new bounded manager turn is submitted to the external orchestrator.

Each generated turn tells the worker to execute one dependency-safe contract-first packet and return control to Oracle. The mission controller, not the chat session, dispatches the next turn.

## Owner blocker and completion signals

A manager worker may end its final response with one of these exact signals:

```text
DIAL_MISSION_SIGNAL:BLOCKED_OWNER::<reason>
DIAL_MISSION_SIGNAL:COMPLETE::<reason>
```

The mission controller converts these into persistent mission state.

Absent one of these signals, a successful packet does not stop the programme; the next turn may be dispatched when the queue becomes idle.

Repeated failed packets move the mission to `WAITING_RUNTIME` after the configured failure limit to avoid uncontrolled failure loops.

## Queue semantics

All chat-submitted work uses the existing persistent Oracle queue.

Chat control does not execute repository work directly.

Packets may carry:

```text
mission_id
mission_turn
priority
request_id
submitted_via
```

The external orchestrator orders queued work by priority, then queue time. Jobs belonging to a paused/non-running mission remain in the inbox and are not claimed.

## Progress feed

`dial_progress_since` combines bounded DIAL orchestration event streams and returns:

```json
{
  "events": [],
  "has_more": false,
  "next_cursor": "..."
}
```

The client should persist `next_cursor` and pass it on the next call. This lets a later Claude session reconstruct missed progress without relying on conversation memory.

Typical visible events include:

- mission created/resumed/paused;
- owner priority changes;
- gate approval/rejection;
- packet queued/started/completed/failed;
- runtime provenance/fallback;
- operations verification events;
- mission controller errors/blockers/completion.

## Authentication

The MCP endpoint is bearer-token protected.

Token location:

```text
/var/lib/dial-control/secrets/chat-control.token
```

Requirements:

- generated with 256 bits of entropy;
- file mode 0600;
- token material is never printed by normal status calls;
- only a fingerprint appears in heartbeat/status evidence.

Host-local endpoint:

```text
http://127.0.0.1:9130/mcp
```

The installer deliberately does not expose this endpoint to the public Internet.

For a remote Claude chat, place the endpoint behind an authenticated private tunnel / Cloudflare Access policy and configure the remote MCP client with the bearer token. Do not expose port 9130 directly.

## MCP protocol surface

The server supports the minimal Streamable-HTTP-style JSON-RPC surface required for tool use:

- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `tools/call`

The server does not provide prompts/resources or a generic proxy.

## Service model

Installer:

```bash
bash deploy/oracle/hermes-codex/install-chat-control-bridge.sh
```

Installed user services:

```text
dial-chat-control.service
dial-mission-controller.service
```

Use `--no-start` to install/enable the units without starting them during pre-bootstrap consolidation.

The DIAL operations plane includes both services in its DIAL service health/recovery projection.

## Session-limit behaviour

A Claude session ending is not a mission stop event.

```text
Claude session unavailable
        ↓
no control message received
        ↓
Oracle mission remains RUNNING
        ↓
mission controller/orchestrator continue
        ↓
events persist
        ↓
new Claude session calls dial_progress_since / dial_mission_status
```

The owner only needs to send “Resume” if the persistent mission state is actually PAUSED/BLOCKED and they intend to resume it.

## Security boundary

The bridge must never expose:

- generic shell;
- arbitrary filesystem operations;
- secrets;
- other project registries;
- any unrelated project control state;
- production customer/finance/Health application authority.

All write operations are logged with request/tool hashes and mission identity.

## Bootstrap dependency

This architecture does not bypass DIAL's existing external-Hermes qualification gate.

The bridge may be available for read/status/control before `PRODUCTION_GREEN`, but ordinary development execution remains blocked by `development-unblock.mjs` until the existing Oracle qualification sequence is satisfied.

Therefore the required order remains:

1. consolidated DIAL repository;
2. Oracle control-plane install/bootstrap;
3. service/runtime/project isolation verification;
4. live project-isolated control-plane qualification and DIAL-only continuity/failover soak;
5. `PRODUCTION_GREEN` (no shared-host reboot required);
6. resume persistent DIAL mission through the chat control surface;
7. Oracle continues development independently of chat session lifetime.

## Multi-project host qualification rule

A DIAL qualification must never reboot the shared Oracle host or kill a global/shared Hermes gateway as an ordinary DIAL development gate. Failure injection is scoped to processes provably owned by the DIAL control plane. DIAL continuity is certified through DIAL-only service restart, queue, mission and credential persistence. Whole-host reboot testing is optional platform maintenance evidence requiring explicit owner approval.

## VEKL observability

The DIAL-only chat control surface exposes read-only `dial_skill_status`, `dial_engineering_knowledge_status` and `dial_engineering_research_status`, and includes VEKL activation/outcome/research events in its cursor-based progress feed. It may show activation ID, policy version, exact selected skill/resource provenance, research forecast linkage and resolution state, but it has no generic skill-install/promote shell. Skill/capability qualification remains governed by `DEC-019`/`DEC-020` and the DIAL tooling/donor gates.

`dial_runtime_capacity_status` adds `DEC-022` observability without creating a model-control primitive. It reports current exact-Sol health, provider cooldown/retry boundary, fingerprint-bound identity-cache validity, the current ahead-of-work forecast and recent counts of live versus suppressed/reused Sol probes, operational turns and research forecasts. It cannot change model selection, clear a cooldown or manufacture healthy evidence.
## Claude local-client false-idle prevention

A Claude Code/desktop client may have a local DIAL checkout while autonomous execution lives on Oracle. Local absence of Claude sessions, local scheduled tasks, local task-list items, local agent processes, or a clean local worktree is therefore **not** evidence that DIAL is idle.

Oracle publishes a sanitized read-only runtime snapshot to the private `oracle-runtime-status` Git branch through `dial-operator-status-publisher.timer`. The publisher uses Git plumbing only and never checks out that branch or mutates the development index/worktree. It force-replaces a parentless status commit only when semantic state changes or when a bounded liveness refresh is due, so status history cannot become another source of truth.

The snapshot contains only DIAL development-control metadata: repository HEAD, mission/packet state, queue heartbeat, development-gate state, exact runtime health/cooldown summary and VEKL forecast provenance. It contains no control token, remote-MCP capability path, credential, customer/payment record, Health data, model prompt or unrelated-project state.

Claude receives this state through two independent read paths. `SessionStart` injects the latest Oracle snapshot, and a `UserPromptSubmit` hook refreshes it for run-state/steering questions. The checked-in `.mcp.json` also defines the read-only `dial-oracle-status` MCP server, which fetches the private status branch and exposes only `dial_oracle_status`. Project MCP trust may still require the normal one-time Claude client approval; the hook path does not depend on that approval.

If the mirror is stale or cannot be fetched, Claude must report that live Oracle state is unavailable from that client. It must never replace missing Oracle evidence with a claim that autonomous development is idle. Mutable steering remains on the separately authenticated typed `dial-oracle-control` surface; the status mirror is deliberately read-only.
