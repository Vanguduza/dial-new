# DIAL Customer Service OS — Automated + Human, Division-Specialized

## Purpose

Customer service is a first-class horizontal product.

Every customer journey has:
- self-service status/actions;
- automated support;
- a human escalation path;
- formal resolution/claim escalation where necessary.

A customer must not reach a dead end because a workflow moved into an exception state.

## Architecture

```text
DIAL Consumer / Business / Health / Web / WhatsApp / Email
                         │
                  Support Gateway
                         │
       identity + branch + transaction context
                         │
              DIAL Support Orchestrator
          ┌──────────────┴───────────────┐
          │                              │
 DIAL Support Agent                Human routing
 LiteLLM / grounded tools          Chatwoot inbox
          │                              │
    typed Support Tool Gateway            │
          │                              │
 Domain read models / safe commands       │
          └──────────────┬───────────────┘
                         │
                   SupportCase
                         │
      simple resolve ────┼──── formal dispute/liability
                         │
                         ▼
                       RCE
                 Claims / Guarantee
```

## Chatwoot role

Use self-hosted Chatwoot as:
- human omnichannel inbox;
- web/in-app chat substrate where suitable;
- branch-specific help-center portal manager;
- agent collaboration interface;
- webhook/API integration.

Chatwoot does **not** become:
- customer SoR;
- order/job/delivery SoR;
- refund/claim authority;
- RCE;
- AI business authority.

## Automated DIAL Support Agent

The DIAL Support Agent runs through the existing AI gateway rather than creating a second uncontrolled AI platform.

It receives:
- authenticated customer/context;
- current branch;
- transaction reference;
- approved knowledge;
- safe tool allowlist;
- branch support policy;
- escalation rules.

### Tool classes

**READ:** status, timeline, delivery ETA, policy, entitlement, receipt, known outage.  
**SAFE_SELF_SERVICE:** deterministic reschedule/cancel/update instructions where policy/state already allows.  
**REQUEST_ONLY:** create refund request, claim, fitment review, human callback, formal dispute.  
**HUMAN_ONLY:** liability, discretionary compensation, permanent adverse action, sensitive health/clinical judgment.  
**PROHIBITED:** arbitrary DB queries, ledger posting, payout release, policy override.

## Human handoff

A handoff carries:

```yaml
customer:
branch:
transaction_refs:
conversation_summary:
customer_request:
detected_intent:
sentiment_or_urgency:
risk_flags:
actions_already_attempted:
tool_results:
knowledge_sources:
attachments:
open_eventuality:
recommended_queue:
sla:
```

The customer stays in the same conversation.

## Escalation triggers

Immediate or priority human escalation:

- customer asks for a human;
- injury/safety concern;
- roadside danger;
- health/medical concern requiring clinical judgment;
- property damage;
- high-value damage/loss;
- conflicting evidence;
- fraud/identity concern;
- payment/charge dispute outside deterministic self-service;
- legal/regulatory complaint;
- repeated failed automated action;
- low confidence / missing authoritative data.

## Formal RCE boundary

Not every support conversation is a dispute.

Use:

`SupportConversation → SupportCase → RCECase`

RCE is created when facts/rights/liability/remedy require a formal decision or appeal path.

## Knowledge architecture

Each division has an approved support pack:

- FAQs;
- workflow explanations;
- policy/version;
- troubleshooting;
- evidence instructions;
- compensation/claim process descriptions;
- escalation rules;
- known incidents/outages.

Human corrections do not train the bot automatically. They create reviewed knowledge/product-improvement candidates.

## Proactive support

Events may trigger proactive support before the customer complains:

- delivery materially delayed;
- supplier cancels;
- technician no-show risk;
- laundry facility delay;
- grocery substitution unresolved near cutoff;
- payment stuck unknown;
- Assist provider cancellation;
- medicine/health fulfilment issue.

## Metrics

- self-service completion;
- AI containment/resolution;
- handoff rate;
- handoff accuracy;
- first-contact resolution;
- reopen rate;
- SLA attainment;
- CSAT;
- response time;
- human handling time;
- AI tool failure;
- knowledge-gap frequency;
- escalation to RCE;
- remedy/claim cycle time;
- support-driven product defect/CAPA count.

## Privacy

Support tools receive only data needed for the current case.

Health, payroll, bank, identity and legal evidence require stronger scopes. Chatwoot transcripts must not become an uncontrolled copy of every sensitive domain record.

## WhatsApp / Chatwoot routing — v1.4

For WhatsApp, DIAL owns Meta Cloud API/Flows ingress and egress.

Chatwoot connects through a DIAL-managed API-channel bridge for human support.

Human replies written in Chatwoot are relayed through the DIAL WhatsApp Gateway, preserving WhatsApp message IDs, template/window policy, customer identity, transaction context and audit.

This prevents transactional commerce/Flow state from becoming dependent on the support platform.

