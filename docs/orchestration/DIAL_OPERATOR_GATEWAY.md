# DIAL Unified Operator Gateway

Status: implemented repository architecture. Oracle activation is qualified independently from channel enrollment. Development owner WhatsApp is fail-closed until the dedicated Dial Hermes Control account is paired and the single owner allowlist is configured. Meta WhatsApp Cloud is not a development owner-control transport.

## Purpose

DIAL has one development-control authority and multiple owner-facing adapters.

```text
Owner
  |
  +-- Claude Code / Claude chat ----+
  +-- Codex ------------------------+--> typed dial_* controls
  +-- Dial Hermes Control WhatsApp -+          v
                                      DIAL operator gateway
                                              |
                                      persistent Oracle mission
                                              |
                                      external Oracle orchestrator
                                              |
                                  GPT-5.6 Sol -> exact Sonnet 5
                                              |
                                  DIAL repository + deterministic gates
```

Claude, Codex and WhatsApp are not independent orchestrators. They share one owner-control authority. Normal autonomous work remains mission/queue driven. Current owner **actions** enter the hybrid Hermes steering broker: they are acknowledged immediately, become current owner direction, allow an already-active repository writer to reach a safe boundary, block later autonomous claims, and then execute before autonomous work resumes. Read-only owner questions remain immediate live turns. The locked runtime chain, VEKL process governance for material action, repository evidence, security/credential boundaries and deterministic verification authority remain unchanged.

## Authority and security locks

- Project slug is hard-bound to `dial`.
- The gateway exposes only named `dial_*` operations; there is no arbitrary shell, command execution, filesystem proxy or generic MCP proxy.
- Every write uses a required idempotency `request_id`.
- Every tool call is audited with operator channel, actor, transport, argument hash and result hash.
- Operator channels never receive control-plane secrets through status calls.
- A channel ending or disconnecting never changes the persistent Oracle mission state.
- Worker output cannot advance a feature/gate without normal repository evidence.
- The dedicated, authenticated Dial Hermes Control WhatsApp account supports normal conversational questions, full-text steering and supported uploads. Action prose enters `dial_owner_steer`; it is not inserted into the ordinary autonomous mission queue.
- `owner-steering-broker.mjs` persists owner steers, acknowledges them immediately, blocks subsequent autonomous claims, lets any existing repository writer reach its safe boundary, then executes the owner steer through `owner-live-control.mjs`. Query turns are read-only and do not serialize repository writes.
- Supported owner document/image uploads are copied out of the Hermes media cache into a mode-0600, content-addressed DIAL control-root intake before the owner-steering broker references them. Executable/macro media is not an accepted steering attachment.
- xKiro/HAIF may receive only coarse PUBLIC steering metadata (scope tags, urgency, active-writer count, mission state, overlap and attachment count) as non-authoritative advisory evidence. Raw owner text, repository content and restricted/private material are not sent under the current `PUBLIC_ONLY` governance state.
- Important mission and steering events are pushed automatically to the verified owner chat through a persisted outbox. Cursor advancement and durable enqueue happen together; successful delivery is evidenced by returned WhatsApp message IDs, and send failures remain retryable instead of silently losing the update.

## Shared typed tools

The shared surface is implemented by `agent-system/orchestration/chat-control-bridge.mjs` and includes:

- `dial_project_status`
- `dial_mission_status`
- `dial_submit_instruction` — explicitly background/queued work only
- `dial_owner_steer` — normal current-owner action lane; hybrid safe-boundary steering used by Claude, Codex and WhatsApp
- `dial_owner_live_turn` — immediate read-only owner questions; explicit action-mode calls are redirected to `dial_owner_steer`
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
- `dial_operator_channels`

## Claude

Claude retains the project-scoped read-only `dial-oracle-status` mirror for false-idle prevention. Mutable owner steering is enrolled locally as `dial-oracle-control` through `operator-control-stdio.mjs`.

The mutable MCP process receives:

```text
DIAL_OPERATOR_CHANNEL=claude
DIAL_OPERATOR_ACTOR=owner
DIAL_REPO_DIR=<canonical checkout>
DIAL_CONTROL_HOME=/var/lib/dial-control
```

It calls the shared typed functions directly and therefore does not copy the HTTP bearer token into Claude configuration. Normal owner actions that should influence current development use `dial_owner_steer`; read-only questions may use `dial_owner_live_turn`. `dial_submit_instruction` is reserved for deliberately backgrounded work.

## Codex

Codex is enrolled with the same stdio MCP server and `DIAL_OPERATOR_CHANNEL=codex`. This is separate from Codex App Server's role as the GPT-5.6 Sol runtime used by Hermes. A Codex user session is an operator surface; the Oracle Codex App Server runtime is an execution slot. Current owner actions use the same `dial_owner_steer` contract as paired WhatsApp; read-only questions may use `dial_owner_live_turn`. Neither role creates a second mission authority.

Codex repository guidance is in root `AGENTS.md` so status questions use Oracle evidence instead of local-session inference.

## ChatGPT direct MCP owner adapter

ChatGPT is also an authenticated first-class owner adapter to the same typed DIAL operator authority. The dedicated localhost route is `/mcp/chatgpt`; the server fixes provenance to `channel=chatgpt`, `actor=owner`, and `transport=chatgpt_http_mcp` rather than trusting caller-supplied channel headers. It exposes the same named `dial_*` surface, Project Truth, idempotency, audit and safe-boundary owner-steering rules as Claude, Codex and the owner WhatsApp adapter. It does not create a second orchestrator or generic shell/filesystem proxy.

Repository activation uses `deploy/oracle/hermes-codex/install-chatgpt-mcp-adapter.sh` and `qualify-chatgpt-mcp.sh`. Port 9130 remains loopback-only; remote ChatGPT enrollment requires an authenticated private HTTPS ingress to only the dedicated MCP path. The bearer credential remains outside Git with mode 0600. ChatGPT product enrollment is an external live gate and must not be falsely claimed by repository qualification.

This direct typed adapter and the owner-facing Desktop Commander transport are complementary ingress options into Hermes. Neither bypasses Hermes authority or the governed execution fabric.

## WhatsApp: Dial Hermes Control dedicated account

`whatsapp-hermes-operator.mjs` is the sole development-owner WhatsApp adapter. It uses the existing Hermes/Baileys bridge with a dedicated WhatsApp account so the owner has a normal one-to-one conversation with **Dial Hermes Control**, rather than messaging themselves. The legacy paired self-chat development-control route is retired. There is no WhatsApp fallback while the dedicated account is awaiting configuration/pairing.

Security and delivery are defense in depth:

1. The bridge runs in `WHATSAPP_MODE=bot` with `WHATSAPP_DM_POLICY=closed`.
2. Exactly one owner phone identity is configured locally in `/var/lib/dial-control/secrets/hermes-whatsapp-control.env` (mode `0600`); repository evidence stores only a hash-derived owner fingerprint.
3. Groups, status traffic, strangers and any sender outside that allowlist are rejected before DIAL owner-control routing. LID/phone aliases are resolved only from the protected pairing session.
4. The dedicated Hermes account uses a separate protected session at `~/.hermes/whatsapp/dial-hermes-control/session`; no legacy self-chat session is enrolled or consulted.
5. Message IDs are hashed/deduplicated. Authenticated owner rate pressure is audited but does **not** silently discard the instruction.
6. Normal authenticated action prose enters `dial_owner_steer`; questions use the read-only `dial_owner_live_turn`. Neither path exposes shell/filesystem authority.
7. The steering broker persists owner direction, blocks later autonomous claims, lets any active repository writer reach a safe boundary, then applies the steer through the locked manager chain.
8. Supported PDFs, office/text/data documents and images are copied content-addressed into the mode-0600 DIAL control-root intake; executable/macro formats are rejected.
9. Outbound command replies and important notifications first enter a bounded persistent outbox. The item is removed only after the Hermes bridge returns a successful WhatsApp message-ID receipt. Failed sends stay queued with attempt/error evidence and retry on later ticks.
10. Every development-control reply is headed `Dial Hermes Control` with no former icon or separator underline.
11. Pairing remains deterministic and integrity-pinned through the vendored Baileys runtime. Missing pairing or owner configuration fails closed.

Configure the owner allowlist locally, then pair the **dedicated Hermes WhatsApp account**:

```bash
bash deploy/oracle/hermes-codex/configure-hermes-whatsapp-control.sh
bash deploy/oracle/hermes-codex/pair-hermes-whatsapp.sh --foreground
```

The pairing helper is singleton, uses only the dedicated session, clears only incomplete state in that session, and starts the dedicated bridge only after valid credentials are written. The retired self-chat route is not restored or consulted.

The Meta Cloud adapter source may remain available for customer/business product integrations, but it is **not enrolled, installed or qualified as a development-owner control channel**. Product/customer WhatsApp remains governed by the canonical official Meta Cloud API + Flows lock in Project Truth.

## WhatsApp command grammar

Commands are case-insensitive and may optionally start with `DIAL` or `/`:

```text
HELP
STATUS
MISSION
PROGRESS
VERIFY
FAILURES [n]
PACKETS [n]
CAPACITY
RESEARCH
KNOWLEDGE
CHANNELS
RESUME [reason]
PAUSE [reason]
PRIORITY <directive>
APPROVE <gate-id> [rationale]
REJECT <gate-id> [rationale]
INSTRUCTION <bounded development instruction>
```

`INSTRUCT` and `REPRIORITISE` are accepted aliases for `INSTRUCTION` and `PRIORITY` where supported by the parser. In the dedicated Dial Hermes Control owner chat, `INSTRUCTION ...` and normal non-question prose are registered through `dial_owner_steer`, not ordinary queue submissions. The broker immediately tells the owner whether the steer is next or waiting for an active writer to reach a safe boundary. Question-like prose is an explicit read-only live turn. Neither lane is a shell escape: both preserve truthful evidence, security/credential boundaries and deterministic verification.

## WhatsApp owner documents and automatic notifications

The dedicated Dial Hermes Control chat accepts supported document/image steering material in addition to text. Current document extensions are PDF, DOCX, TXT/Markdown/RTF/ODT, CSV/XLSX and JSON/YAML; images are PNG/JPEG/WebP. Macro-enabled/executable formats are not accepted. Each file is limited to 25 MiB, each message to 8 attachments and 50 MiB total. Files are SHA-256 addressed, copied with mode 0600 into the DIAL control root, and referenced from the hybrid owner-steer record. The executing manager must inspect the material before acting, reconcile durable owner decisions into canonical Project Truth, and treat embedded binaries/macros as non-executable data.

The owner chat also receives automatic important notifications for failed/completed mission packets, owner blockers, mission-controller errors, pause/resume, mission completion, owner-steer execution start, completion/failure and supersession. Notifications are durably enqueued before cursor advancement and require a WhatsApp message-ID receipt before leaving the outbox, preventing loss across transient send failures or restarts.

## Hybrid owner-steering execution semantics

`owner-steering-broker.mjs` is the canonical normal owner-action path. An authenticated owner action is durably stored under `/var/lib/dial-control/operator-steering/` with a monotonic sequence and request identity. During intake, `state/owner-steering-intake.json` closes the claim race. Pending/active steering state blocks `external-orchestrator.mjs` and `mission-controller.mjs` from starting later autonomous work.

If a repository-writing packet is already active, the broker **does not kill or race it**. It records `WAITING_SAFE_BOUNDARY`, keeps subsequent autonomous dispatch blocked, and executes the owner steer immediately after the current writer finishes its packet. If no writer is active, the steer is next. Explicit replacement/correction language may supersede the latest still-pending steer while preserving audit history. Broker restart during an active steer is fail-closed as an uncertain outcome rather than blindly replaying repository mutations.

Execution delegates to `owner-live-control.mjs`, which runs through the locked GPT-5.6 Sol → exact Sonnet 5 Hermes chain and updates the owner priority directive. The authenticated channel provenance is preserved on the steer and live turn. Immediately after the safe boundary and before material owner mutation, the live turn records the owner authority root and supersedes/revokes affected AEF envelopes and leases so late worker results cannot race or overwrite the steer. A durable owner decision must be reconciled into repository Project Truth. Read-only questions also use `owner-live-control.mjs`, but they do **not** acquire the repository-write interrupt and therefore can answer while development continues. `dial_owner_live_turn` remains the query surface. If an authenticated owner explicitly submits it with `mode=instruction`, the control bridge redirects that request into `dial_owner_steer`; writable action execution therefore always occurs in the broker service with the safe-boundary contract.

xKiro/HAIF is advisory only. The broker may submit a `CLASSIFY` auxiliary task containing coarse PUBLIC metadata such as scope tags, overlap, urgency, mission state, active-writer count and attachment count. It does not send raw owner prose, repository text, uploaded document content, secrets or restricted/private information while provider governance is `PUBLIC_ONLY`. xKiro output cannot authorize writes, change owner intent, alter mission authority or bypass deterministic gates. If xKiro is unavailable/unqualified, deterministic local steering policy continues without weakening the boundary.

A steer does **not** silently resume a `BLOCKED_OWNER`/`PAUSED` mission. The steer itself may repair the condition or update Project Truth, while mission-state transitions remain explicit through `RESUME`, `PAUSE`, approvals or subsequent verified reconciliation.

## Persistence and idempotency

Write-tool idempotency is stored under:

```text
/var/lib/dial-control/chat-control/idempotency/<tool>/<request-id>.json
```

WhatsApp derives the write request ID from the channel plus immutable inbound message ID. The dedicated Hermes adapter records the development action once, persists its reply in the durable outbox, and retries delivery without repeating the action.

WhatsApp progress cursors are persisted per owner/sender, so `PROGRESS` can report changes since the prior request rather than replaying the whole event history.

## Service model

Canonical installer:

```bash
bash deploy/oracle/hermes-codex/install-operator-gateway.sh
```

It installs/enables:

```text
dial-chat-control.service
dial-mission-controller.service
dial-owner-steering.service
dial-hermes-whatsapp-bridge.path
dial-hermes-whatsapp-operator.service
```

and enrolls `dial-oracle-control` in locally installed Claude and Codex clients when those CLIs are available.

The Hermes WhatsApp bridge service is path-triggered after dedicated pairing credentials exist. The owner operator can run before pairing but cannot report READY until the dedicated account is paired, the bridge is connected and exactly one owner is configured.

## Qualification

Repository qualification proves the gateway without requiring external WhatsApp enrollment:

- source modules exist and syntax-check;
- operator tests pass;
- chat-control bearer token remains mode 0600;
- typed tool list includes status, VEKL, `dial_owner_steer`, instruction and channel-health tools;
- no shell/exec/filesystem generic tool exists;
- Codex and Claude mutable MCPs are enrolled;
- `dial-owner-steering.service` and `dial-hermes-whatsapp-operator.service` are active;
- the dedicated Hermes WhatsApp status is `READY`, `mode=bot`, `paired=true`, `owner_count=1`, and the bridge is connected;
- the live channel completes a benign owner round-trip and returns a WhatsApp message-ID receipt;
- DIAL-only continuity soak restarts and recovers the owner-steering broker and Hermes owner operator;
- normal mission/development-gate requirements remain unchanged.

Real development-owner WhatsApp delivery is activated only after the dedicated Hermes account is paired and owner-only configuration is present. Qualification must never manufacture or bypass that pairing boundary.

## Failure behavior

- Claude/Codex disconnect: Oracle continues; reconnect and read status/progress.
- Dedicated Hermes account unpaired/misconfigured: `NOT_READY`; no GREEN owner-control path.
- Bridge/send outage: completed owner actions are not repeated; their replies/important updates remain in the persistent outbox until a message-ID receipt is obtained.
- Unauthorized WhatsApp sender: audited hash only; no command or reply.
- Duplicate message: no duplicate typed write.
- Reply delivery failure after completed command: persisted result may be replied on retry without rerunning the command.
- Oracle mission paused/blocked: autonomous packets stay paused/blocked. Read-only owner questions still run immediately, and an authenticated owner steer can repair the blocked state or apply new Project Truth without entering the autonomous queue. It does not silently mark the autonomous mission resumed; `RESUME` remains an explicit mission-state action.
- Both Sol and Sonnet unavailable: execution fails closed under the existing runtime policy.

## Compatibility

`DIAL_CLAUDE_CHAT_CONTROL_BRIDGE.md` remains historical/Claude-specific detail. This document is the canonical multi-channel operator architecture. `DEC-025` retains the typed DIAL-only gateway/authentication/no-shell foundation; `DEC-030` retains the locked hybrid safe-boundary owner-steering semantics; `DEC-034` locks the dedicated Dial Hermes Control WhatsApp transport and completely retires DEC-030's prior self-chat transport path while preserving DEC-030's hybrid steering semantics.
