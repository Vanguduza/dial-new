# DIAL Data Classification, Encryption & Retention Standard

## Classification

### D0 — Public
Marketing/site content, published help, public catalogue data where licensed.

### D1 — Internal
Non-sensitive operational metadata not intended for public disclosure.

### D2 — Confidential Customer/Business
Addresses, order/job history, provider/customer communications, vehicle records, organization information.

### D3 — Restricted
Identity documents, bank/payment account metadata, payroll, disciplinary records, highly sensitive HR, location history, claim evidence, private contracts.

### D4 — Health / Critical Restricted
Clinical/medicine data, prescription records, health consent/delegation, emergency/clinical evidence and other specialist protected health information.

## Default handling

| Class | Client exposure | Logs | Analytics | Encryption | Access |
|---|---|---|---|---|---|
| D0 | public | allowed | allowed | platform | public |
| D1 | authenticated/internal | minimized | allowed if needed | platform | role/scope |
| D2 | purpose-limited | redacted | pseudonymized/minimized | platform + field where risk requires | relationship/RLS |
| D3 | minimum only | strongly redacted | normally excluded or aggregated | platform + selected envelope encryption | explicit restricted scope |
| D4 | dedicated Health surfaces only | minimal metadata | health-approved only | strongest specialist profile | consent/purpose/role + audit |

## Encryption decision

Application-level encryption is appropriate when:
- DB read access alone should not reveal the value;
- administrators/support staff should not see plaintext;
- backup compromise risk justifies separate key control.

Do not encrypt fields blindly if it destroys required indexing/search/accounting without reducing a meaningful risk.

Use envelope encryption:
`data key → encrypt field → data key encrypted by KMS/master key`.

Never put the master key beside the encrypted value in the same database row/config.

## Tokenization / masking

Use masked representations for:
- bank accounts;
- provider refs;
- payment method identifiers;
- identity document refs.

Customer/support UI gets only the minimum masked form.

## Location

Distinguish:
- saved service address;
- active delivery/service location;
- incident-scoped precise location;
- historical route/telemetry.

Precise location retention must be tied to operational/legal purpose rather than retained forever.

## Health

D4 rules are defined further by the Health specialist architecture.

General DIAL analytics/support/AI cannot automatically ingest Health content merely because the user uses the same DIAL identity.

## Retention

Every data family needs:
- purpose;
- retention clock start;
- default period;
- legal/statutory override;
- litigation/legal hold;
- deletion/de-identification behavior;
- backup expiry behavior.

Deletion requests propagate by Party/Identity but do not illegally erase records that must be retained for accounting, claims, health or legal obligations.

## Test

Security/privacy certification must sample each D2-D4 class and verify:
- access;
- API response;
- logs;
- support exposure;
- AI/tool exposure;
- backup/retention rule.
