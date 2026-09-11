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

Claude, Codex and WhatsApp are not independent orchestrators. They share one owner-control authority. Normal autonomous work remains mission/queue driven. Current owner **actions** enter the hybrid Hermes steering broker: they are acknowledged immediately, become current owner direction, allow an already-active repository writer to reach a safe boundary, block later autonomous claims, and then execute before autonomous work resumes. Read-only owner questions remain immediate live turns. The locked runtime chain, VEKL process governance for material action, repository evidence, security/credential boundaries and deterministic verification authority remain unchanged.

## Authority and security locks

- Project slug is hard-bound to `dial`.
- The gateway exposes only named `dial_*` operations; there is no arbitrary shell, command execution, filesystem proxy or generic MCP proxy.
- Every write uses a required idempotency `request_id`.
- Every tool call is audited with operator channel, actor, transport, argument hash and result hash.
- Operator channels never receive control-plane secrets through status calls.
- A channel ending or disconnecting never changes the persistent Oracle mission state.
- Worker output cannot advance a feature/gate without normal repository evidence.
- Authenticated paired-owner WhatsApp supports normal conversational questions, full-text steering and supported uploads. Action prose enters `dial_owner_steer`; it is not inserted into the ordinary autonomous mission queue.
- `owner-steering-broker.mjs` persists owner steers, acknowledges them immediately, blocks subsequent autonomous claims, lets any existing repository writer reach its safe boundary, then executes the owner steer through `owner-live-control.mjs`. Query turns are read-only and do not serialize repository writes.
- Supported owner document/image uploads are copied out of the Hermes media cache into a mode-0600, content-addressed DIAL control-root intake before the owner-steering broker references them. Executable/macro media is not an accepted steering attachment.
- xKiro/HAIF may receive only coarse PUBLIC steering metadata (scope tags, urgency, active-writer count, mission state, overlap and attachment count) as non-authoritative advisory evidence. Raw owner text, repository content and restricted/private material are not sent under the current `PUBLIC_ONLY` governance state.
- Important mission events are pushed automatically to the verified owner self-chat with a persisted event cursor so service restarts do not replay historical notifications.

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

## WhatsApp: Hermes owner self-chat

`whatsapp-hermes-operator.mjs` is the preferred zero-extra-provider path when the owner elects to pair the existing Hermes WhatsApp bridge.

Security is defense in depth:

1. Hermes bridge runs in `WHATSAPP_MODE=self-chat` with closed DM policy.
2. The bridge rejects non-self chats, groups and status traffic before queueing.
3. The DIAL adapter independently reads the paired identity and rejects any queued message whose chat ID is not the paired owner self-chat.
4. Message IDs are hashed and deduplicated.
5. The text router preserves recognized shortcuts; normal authenticated action prose enters `dial_owner_steer`, while question-like prose is a read-only `dial_owner_live_turn`. Neither path exposes a raw shell/filesystem proxy.
6. `owner-steering-broker.mjs` is the normal action serializer. It persists the steer, creates an intake guard, blocks new autonomous claims, waits for current repository writers to finish safely, then delegates execution to `owner-live-control.mjs`.
7. xKiro advisory processing is optional and non-authoritative. Under `PUBLIC_ONLY`, only coarse non-sensitive metadata is eligible; raw instructions, uploads and repository data stay local.
8. Supported PDFs, office/text/data documents and images are persisted content-addressed under `/var/lib/dial-control/operator-channels/whatsapp/uploads/`; source cache paths are validated before copy and executable/macro formats are rejected.
9. Automatic mission and owner-steer lifecycle notifications are cursor-deduplicated.
10. Replies and notifications are sent back only to the verified self-chat.
11. Pairing state is outside Git under the Hermes session directory.

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

`INSTRUCT` and `REPRIORITISE` are accepted aliases for `INSTRUCTION` and `PRIORITY` where supported by the parser. In the paired Hermes owner self-chat, `INSTRUCTION ...` and normal non-question prose are registered through `dial_owner_steer`, not ordinary queue submissions. The broker immediately tells the owner whether the steer is next or waiting for an active writer to reach a safe boundary. Question-like prose is an explicit read-only live turn. Neither lane is a shell escape: both preserve truthful evidence, security/credential boundaries and deterministic verification.

## WhatsApp owner documents and automatic notifications

The paired Hermes owner self-chat accepts supported document/image steering material in addition to text. Current document extensions are PDF, DOCX, TXT/Markdown/RTF/ODT, CSV/XLSX and JSON/YAML; images are PNG/JPEG/WebP. Macro-enabled/executable formats are not accepted. Each file is limited to 25 MiB, each message to 8 attachments and 50 MiB total. Files are SHA-256 addressed, copied with mode 0600 into the DIAL control root, and referenced from the hybrid owner-steer record. The executing manager must inspect the material before acting, reconcile durable owner decisions into canonical Project Truth, and treat embedded binaries/macros as non-executable data.

The owner self-chat also receives automatic important notifications for completed/failed mission packets, owner blockers, mission-controller errors, pause/resume, mission completion, owner-steer execution start, owner-steer completion/failure and supersession. Separate persisted cursors prevent replaying old mission or steering events after restart.

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
dial-owner-steering.service
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
- typed tool list includes status, VEKL, `dial_owner_steer`, instruction and channel-health tools;
- no shell/exec/filesystem generic tool exists;
- Codex and Claude mutable MCPs are enrolled;
- `dial-owner-steering.service` and both WhatsApp operator services are active;
- Cloud adapter health is `UNCONFIGURED`, `DISABLED` or `READY` and exposes no secret fields;
- Hermes WhatsApp status is structurally valid whether paired or unpaired;
- DIAL-only continuity soak restarts and recovers the owner-steering broker and both operator services;
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
- Oracle mission paused/blocked: autonomous packets stay paused/blocked. Read-only owner questions still run immediately, and an authenticated owner steer can repair the blocked state or apply new Project Truth without entering the autonomous queue. It does not silently mark the autonomous mission resumed; `RESUME` remains an explicit mission-state action.
- Both Sol and Sonnet unavailable: execution fails closed under the existing runtime policy.

## Compatibility

`DIAL_CLAUDE_CHAT_CONTROL_BRIDGE.md` remains historical/Claude-specific detail. This document is the canonical multi-channel operator architecture. `DEC-025` retains the typed DIAL-only gateway/authentication/no-shell foundation; `DEC-030` is the locked hybrid owner-steering supersession for normal owner-action semantics.
