# Branch Activation Technical Standard

Deployment is not activation.

A dormant division may have complete code, schemas and Command Centre rooms while customer transactions remain disabled.

Activation controls:
- Home/navigation visibility;
- customer eligibility;
- transaction creation;
- payment methods;
- provider matching/dispatch;
- scheduled jobs;
- WhatsApp Flows/templates;
- support queue;
- notifications;
- promotions;
- partner integrations.

## Existing transactions

Deactivation never makes active transactions disappear.

Use modes:
- `NO_NEW_TRANSACTIONS`;
- `FULFIL_EXISTING_ONLY`;
- `SUPPORT_ONLY`;
- `FULLY_ACTIVE`.

## Gate

`ACTIVE` requires:
- Feature certification for activated scope;
- NFR/SLO green;
- security green;
- operational queues/runbooks staffed;
- provider/network readiness;
- activation blockers green;
- monitoring and rollback;
- commercial approval.

Feature flags cannot bypass domain authorization.
