# Client / Support Architecture Research Note — 2026

## Unified super-app architecture

Grab's engineering documentation describes a single passenger super-app spanning multiple services and its migration from a monolithic app toward core modules, shared libraries, independent feature modules and "kit" bridge interfaces. DIAL adopts the architectural pattern, not Grab code.

Reference:
https://engineering.grab.com/app-modularisation-at-scale

## Support platform

Chatwoot currently provides self-hosted omnichannel support, APIs/webhooks and multi-portal Help Center capabilities. DIAL uses it for human support operations and help-center delivery, not as the business/RCE source of truth.

References:
https://www.chatwoot.com/
https://www.chatwoot.com/product/help-center
https://www.chatwoot.com/features

## AI→human handoff

Current Intercom/Fin guidance emphasizes specialized AI roles, explicit escalation rules and passing full context to humans when automation cannot safely resolve a conversation. DIAL adopts those design principles through its own Support Agent + Chatwoot + RCE architecture rather than adopting Intercom as runtime.

References:
https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules
https://www.intercom.com/learning-center/ai-human-collaboration-procedures-handoffs
