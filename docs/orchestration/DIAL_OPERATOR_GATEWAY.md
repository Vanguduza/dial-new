# DIAL Unified Operator Gateway

Status: implemented repository architecture. Oracle activation is qualified independently from channel enrollment. WhatsApp delivery is fail-closed until an owner pairing or official Meta Cloud configuration exists.

## Purpose

DIAL has one development-control authority and multiple owner-facing adapters.

```text
Owner
  |
  +-- Claude Code / Claude chat ----+
  +-- Codex ------------------------+--> typed dial_* controls
  +-- WhatsApp owner self-chat -----+          |
  +-- WhatsApp Cloud API -----------+          v
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

Claude, Codex and WhatsApp are not independent orchestrators. They cannot bypass repository truth, the persistent mission, the external queue, runtime policy, VEKL, verification or development gates.

## Authority and security locks

- Project slug is hard-bound to `dial`.
- The gateway exposes only named `dial_*` operations; there is no arbitrary shell, command execution, filesystem proxy or generic MCP proxy.
- Every write uses a required idempotency `request_id`.
- Every tool call is audited with operator channel, actor, transport, argument hash and result hash.
- Operator channels never receive control-plane secrets through status calls.
- A channel ending or disconnecting never changes the persistent Oracle mission state.
- Worker output cannot advance a feature/gate without normal repository evidence.
- Authenticated owner WhatsApp supports normal full-text development steering. Recognized shortcut commands retain their typed semantics; other owner prose is converted only into `dial_submit_instruction` and never into direct shell/filesystem execution.
- Supported owner document/image uploads are copied out of the Hermes media cache into a mode-0600, content-addressed DIAL control-root intake before they are referenced by a queued instruction. Executable/macro media is not an accepted steering attachment.
- Important mission events are pushed automatically to the verified owner self-chat with a persisted event cursor so service restarts do not replay historical notifications.

## Shared typed tools

The shared surface is implemented by `agent-system/orchestration/chat-control-bridge.mjs` and includes:

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

It calls the shared typed functions directly and therefore does not copy the HTTP bearer token into Claude configuration.

## Codex

Codex is enrolled with the same stdio MCP server and `DIAL_OPERATOR_CHANNEL=codex`. This is separate from Codex App Server's role as the GPT-5.6 Sol runtime used by Hermes. A Codex user session is an operator surface; the Oracle Codex App Server runtime is an execution slot. Neither role creates a second mission authority.

Codex repository guidance is in root `AGENTS.md` so status questions use Oracle evidence instead of local-session inference.

## WhatsApp: Hermes owner self-chat

`whatsapp-hermes-operator.mjs` is the preferred zero-extra-provider path when the owner elects to pair the existing Hermes WhatsApp bridge.

Security is defense in depth:

1. Hermes bridge runs in `WHATSAPP_MODE=self-chat` with closed DM policy.
2. The bridge rejects non-self chats, groups and status traffic before queueing.
3. The DIAL adapter independently reads the paired identity and rejects any queued message whose chat ID is not the paired owner self-chat.
4. Message IDs are hashed and deduplicated.
5. The text router preserves recognized shortcuts and maps normal owner prose only to the bounded `dial_submit_instruction` tool.
6. Supported PDFs, office/text/data documents and images are persisted content-addressed under `/var/lib/dial-control/operator-channels/whatsapp/uploads/`; source cache paths are validated before copy and executable/macro formats are rejected.
7. Automatic notifications are generated only from important persisted mission transitions and are cursor-deduplicated.
8. Replies and notifications are sent back only to the verified self-chat.
9. Pairing state is outside Git under the Hermes session directory.

If no pairing credentials exist, the operator service remains healthy in `WAITING_PAIRING`. On Oracle, use `bash deploy/oracle/hermes-codex/pair-hermes-whatsapp.sh --foreground` (or `--background` when an authenticated operator surface will render the protected event stream). The helper enforces a singleton pairer, clears only incomplete unpaired state, pauses the live bridge during enrollment, and restores the normal bridge after valid credentials are written. Missing pairing never falls back to an open inbound channel.

The pairing helper uses an **isolated, deploy-only compatibility runtime** because the Hermes-pinned Baileys 7.0.0-rc13 QR flow can accept a phone scan and still fail before `pair-success` when WhatsApp sends `companion_reg_refresh`. The runtime pins the upstream fix head for WhiskeySockets/Baileys PR #2765 and applies the pre-login ACK safety change from PR #2749. This exception exists only for owner development-control enrollment; it does not alter DIAL's customer/business WhatsApp lock, which remains official Meta Cloud API + Flows only.

## WhatsApp: official Cloud API

`whatsapp-operator-adapter.mjs` provides a first-party Meta Cloud API path when a WhatsApp Business deployment is desired.

It is bound to `127.0.0.1:9132`; port 9132 must never be exposed directly. A public HTTPS ingress, if configured, may route only the webhook path `/whatsapp/operator/webhook` to this local listener.

Inbound requirements:

- GET verification requires the configured verify token.
- POST requires `X-Hub-Signature-256` HMAC SHA-256 validation against the raw body with the Meta app secret.
- Sender must exactly match an owner entry in `allowed_senders` after digits-only normalization.
- Unauthorized senders receive no command response.
- Duplicate webhook message IDs cannot repeat a write.

Outbound replies use the configured Graph API version and phone-number ID. All Meta secrets live only in `/var/lib/dial-control/secrets/whatsapp-operator.json` with mode `0600`.

The service may be installed before credentials exist. Its health state is then `UNCONFIGURED`; that is an explicit channel activation state, not a development failure.

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

`INSTRUCT` and `REPRIORITISE` are accepted aliases for `INSTRUCTION` and `PRIORITY` where supported by the parser. On an authenticated owner WhatsApp channel, normal prose that is not a recognized shortcut is accepted as a development instruction and queued through `dial_submit_instruction`. This is instruction convenience, not a shell escape: all normal Oracle mission, repository-truth, runtime and verification gates still apply.

## WhatsApp owner documents and automatic notifications

The paired Hermes owner self-chat accepts supported document/image steering material in addition to text. Current document extensions are PDF, DOCX, TXT/Markdown/RTF/ODT, CSV/XLSX and JSON/YAML; images are PNG/JPEG/WebP. Macro-enabled/executable formats are not accepted. Each file is limited to 25 MiB, each message to 8 attachments and 50 MiB total. Files are SHA-256 addressed, copied with mode 0600 into the DIAL control root, and referenced from the queued owner instruction. The manager must inspect the material before acting, reconcile durable decisions into canonical project truth, and treat embedded binaries/macros as non-executable data.

The owner self-chat also receives automatic important notifications for completed/failed mission packets, owner blockers, mission-controller errors, pause/resume and mission completion. Runtime-waiting and completion mission-state attention remains active. A persisted mission-event cursor prevents replaying old events after restart.

## Persistence and idempotency

Write-tool idempotency is stored under:

```text
/var/lib/dial-control/chat-control/idempotency/<tool>/<request-id>.json
```

WhatsApp derives the write request ID from the channel plus immutable inbound message ID. The Cloud adapter also persists processed webhook state before sending its outbound reply so a delivery retry can recover a failed reply without repeating the development action.

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
dial-hermes-whatsapp-bridge.path
dial-hermes-whatsapp-operator.service
dial-whatsapp-cloud-operator.service
```

and enrolls `dial-oracle-control` in locally installed Claude and Codex clients when those CLIs are available.

The Hermes WhatsApp bridge service itself starts only after pairing credentials exist. The owner operator service may run before pairing and reports `WAITING_PAIRING`. The Cloud operator may run before Meta configuration and reports `UNCONFIGURED`.

## Cloud API configuration

Run interactively on the Oracle host:

```bash
bash deploy/oracle/hermes-codex/configure-whatsapp-cloud-operator.sh
```

The script prompts locally (secrets are not arguments or repository content), writes a mode-0600 config, and restarts the adapter. A public authenticated/restricted HTTPS ingress is a separate infrastructure activation step because it depends on the owner's domain/tunnel/account configuration.

## Qualification

Repository qualification proves the gateway without requiring external WhatsApp enrollment:

- source modules exist and syntax-check;
- operator tests pass;
- chat-control bearer token remains mode 0600;
- typed tool list includes status, VEKL, instruction and channel-health tools;
- no shell/exec/filesystem generic tool exists;
- Codex and Claude mutable MCPs are enrolled;
- both WhatsApp operator services are active;
- Cloud adapter health is `UNCONFIGURED`, `DISABLED` or `READY` and exposes no secret fields;
- Hermes WhatsApp status is structurally valid whether paired or unpaired;
- DIAL-only continuity soak restarts and recovers both operator services;
- normal mission/development-gate requirements remain unchanged.

Real WhatsApp delivery is separately activated only after normal owner pairing or valid Meta credentials. Qualification must never manufacture or bypass either credential boundary.

## Failure behavior

- Claude/Codex disconnect: Oracle continues; reconnect and read status/progress.
- WhatsApp unpaired: `WAITING_PAIRING`; no inbound command path.
- Meta config absent/disabled: `UNCONFIGURED`/`DISABLED`; webhook rejects processing.
- Invalid Meta signature: HTTP 401; no command execution.
- Unauthorized WhatsApp sender: audited hash only; no command or reply.
- Duplicate message: no duplicate typed write.
- Reply delivery failure after completed command: persisted result may be replied on retry without rerunning the command.
- Oracle mission paused/blocked: queued instructions remain governed by existing mission/development gates.
- Both Sol and Sonnet unavailable: execution fails closed under the existing runtime policy.

## Compatibility

`DIAL_CLAUDE_CHAT_CONTROL_BRIDGE.md` remains historical/Claude-specific detail. This document is the canonical multi-channel operator architecture and `DEC-025` is the locked decision record.
