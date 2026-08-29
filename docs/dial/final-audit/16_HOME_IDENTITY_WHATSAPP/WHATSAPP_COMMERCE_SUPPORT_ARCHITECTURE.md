# DIAL WhatsApp Commerce, Payments & Support Architecture

## Core decision

DIAL owns the official WhatsApp Business Platform integration using **WhatsApp Cloud API + WhatsApp Flows**.

Chatwoot is the human-support console behind DIAL, connected through an API-channel bridge.

```text
Meta WhatsApp Cloud API
           │
           ▼
 DIAL WhatsApp Gateway
 signature validation
 dedupe/correlation
 identity/channel mapping
           │
      ┌────┴─────────────┐
      │                  │
Transactional        Support
orchestration        Orchestrator
      │                  │
Flows/domain         AI first line
commands             │
      │               ├─ resolved
      │               └─ human required
      │                      │
      │                      ▼
      │              Chatwoot API Inbox
      │                      │
      └──────── outbound through DIAL Gateway
```

## Why DIAL owns Meta ingress

Meta exposes the official channel; DIAL must preserve transaction, Flow, payment, template and support context under one channel authority.

Chatwoot can directly connect to WhatsApp Cloud API, but DIAL uses Chatwoot's API Channel for the human support layer so support does not become the owner of transactional Flow orchestration.

## Packages/services

```text
packages/whatsapp-contracts
packages/whatsapp-identity
packages/whatsapp-flows
packages/whatsapp-templates
packages/whatsapp-payments
packages/whatsapp-support-bridge
workers/whatsapp-ingress
workers/whatsapp-outbound
apps/whatsapp-flow-endpoint
```

## Inbound envelope

```ts
type WhatsAppInbound = {
  messageId: string
  waId: string
  phoneNumberId: string
  receivedAt: string
  kind:
    | "TEXT"
    | "INTERACTIVE"
    | "FLOW_RESPONSE"
    | "MEDIA"
    | "LOCATION"
    | "STATUS"
  replyToMessageId?: string
  flowToken?: string
  payload: unknown
  correlationId: string
}
```

Store/dedupe by message/event ID.

## Flow endpoint

Use the official MIT `WhatsApp/WhatsApp-Flows-Tools` repo as the endpoint/conformance donor.

Production requirements:
- encrypted endpoint request/response handling;
- private key in secret manager;
- Flow token validation;
- idempotency;
- replay protection;
- schema validation;
- low-latency endpoint;
- typed domain commands only;
- correlation IDs;
- metrics/tracing;
- no arbitrary direct database mutation.

## ChannelSession

The LLM is not the state machine.

```text
ChannelSession
- wa identity / customer ref
- branch
- active aggregate/draft
- active flow
- current state
- correlation ID
- expiry
```

AI can interpret free text into candidate intents; deterministic routing verifies the permitted branch/action.

## Channel primitives

### WhatsApp Flows
Structured order/booking forms, approvals, payment selection, issue intake.

### Interactive messages
Short menus/actions.

### Product/catalog messages
Use only when Meta catalog integration is operationally appropriate. DIAL Catalogue remains authoritative.

### Media/location
Evidence and incident/service location.

### secure `open_url` / deep links
For complex rich experiences:
- EPC diagrams;
- hero/CGI/exploded parts navigation;
- very large grocery catalog browsing;
- complex project documents;
- sensitive health records;
- hosted payment pages.

The channel context remains intact.

## Support

Every material transaction state exposes `Help / Talk to DIAL`.

Support Orchestrator:
1. identifies current DIAL customer/channel/session;
2. loads permitted transaction context;
3. AI answers when safe;
4. safe deterministic self-service commands may be called;
5. human handoff to Chatwoot when required;
6. formal dispute/liability → RCE/Claim.

## Templates / conversation windows

Maintain a DIAL WhatsApp Template Registry:
- branch;
- language;
- category;
- Meta template ID;
- approval status;
- variables;
- fallback.

Use approved templates whenever WhatsApp policy requires them for outbound/re-engagement messaging.

## Failure handling

- duplicate webhook → idempotent discard;
- Flow endpoint unavailable → clear fallback and secure app/web link;
- Flow expires → reconstruct from canonical draft;
- Chatwoot unavailable → transactions still work; queue human handoff;
- AI unavailable → deterministic help + human queue;
- send failure → retry and retain status;
- payment result message fails → payment state remains canonical and can be queried later;
- customer phone changes → unlink/reverify channel identity.
