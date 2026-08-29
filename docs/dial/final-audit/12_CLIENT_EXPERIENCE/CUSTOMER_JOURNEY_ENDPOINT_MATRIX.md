# Customer Journey Endpoint Coverage Matrix

This is a generated planning coverage summary. The JSON registry is the machine authority.

| Module | Customer/B2B top-level endpoints mapped | App family |
|---|---:|---|
| ASSIST | 16 | DIAL_CONSUMER, DIAL_WEB, WHATSAPP |
| CARE | 14 | DIAL_CONSUMER, DIAL_WEB |
| FLEET | 15 | DIAL_BUSINESS, DIAL_BUSINESS_WEB |
| GROCERIES | 18 | DIAL_CONSUMER, DIAL_WEB, WHATSAPP |
| HEALTH | 18 | DIAL_HEALTH, DIAL_HEALTH_WEB, WHATSAPP_HEALTH |
| LAUNDRY | 18 | DIAL_CONSUMER, DIAL_WEB, WHATSAPP |
| PROJECTS | 16 | DIAL_CONSUMER, DIAL_BUSINESS, DIAL_WEB, DIAL_BUSINESS_WEB |
| SPARE | 17 | DIAL_CONSUMER, DIAL_WEB, WHATSAPP |
| TECH | 20 | DIAL_CONSUMER, DIAL_WEB, WHATSAPP |
| VHUB | 14 | DIAL_CONSUMER, DIAL_BUSINESS, DIAL_WEB |

## Required endpoint classes

- branch entry/discovery;
- aggregate detail/timeline;
- state-driven allowed actions;
- approvals/rejections;
- cancellation/reschedule where policy allows;
- evidence upload;
- issue report;
- support conversation;
- human escalation;
- case/claim tracker;
- final receipt/history;
- safe degraded/offline state.

## Online start-to-finish rule

A physical service may occur offline, but the customer's digital control/visibility must not end at checkout or booking. Every exception state needs a customer-visible status or support route.
