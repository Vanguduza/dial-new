# Chatwoot ↔ DIAL WhatsApp Support Bridge

## Lock

Chatwoot is the human support operating console.

DIAL remains the canonical WhatsApp Cloud API/Flows gateway and business-state owner.

Use a Chatwoot **API Channel** for the DIAL-managed WhatsApp conversation bridge.

## Conversation mapping

```text
SupportConversation
- DIAL support ref
- DIAL identity ref?
- wa_id
- branch
- transaction refs
- Chatwoot account/inbox/conversation IDs
- status/owner/priority
```

## Inbound

```text
WhatsApp
→ DIAL Gateway
→ verify / dedupe
→ Support Orchestrator
→ safe AI/self-service?
  ├─ yes → reply through DIAL Gateway
  └─ no  → create/find Chatwoot API conversation
          → inject message/context
          → branch team
```

## Human outbound

```text
agent replies in Chatwoot
→ Chatwoot webhook
→ DIAL Support Bridge
→ validate/map
→ enforce WhatsApp template/window rules
→ DIAL WhatsApp Gateway
→ Cloud API
→ store message/status
```

## Safe Chatwoot attributes

Include:
- DIAL customer human ref;
- branch;
- order/job/delivery/case ref;
- issue category;
- urgency;
- support-case ref;
- Command Centre/support deep link.

Do not dump full health record, bank data, identity docs or unrestricted ledger data into Chatwoot.

## Teams

- Spare
- Tech
- Groceries
- Laundry
- Vehicle/Care
- Assist Urgent
- Projects/B2B
- Health Administrative
- Payments
- RCE/Claims

## Health

Administrative Health support may use a restricted support queue if the ZHOTN privacy/security architecture approves it.

Clinical, emergency or medication-safety matters follow specialist Health escalation and must not be resolved by the generic support bot.

## Outages

- Chatwoot down → transactions and safe automated support continue; human cases queue.
- Support AI down → Chatwoot human support continues.
- WhatsApp down → app/web/email support remain available.
