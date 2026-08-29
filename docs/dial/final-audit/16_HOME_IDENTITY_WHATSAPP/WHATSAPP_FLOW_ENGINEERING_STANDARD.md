# WhatsApp Flows Engineering Standard

## Primary technical donor

`WhatsApp/WhatsApp-Flows-Tools`  
Official WhatsApp organization repository  
MIT

Use it for:
- endpoint encryption/decryption mechanics;
- example endpoint/webhook behavior;
- Flow development tooling and conformance.

Its examples are prototypes, not production servers.

Secondary reference:
`fbsamples/whatsapp-api-examples` for Cloud API messages, webhooks, templates and ecommerce examples under its applicable Meta licence/policy.

## Repo layout

```text
packages/whatsapp-flows/
  src/contracts/
  src/registry/
  src/validation/
  src/endpoint/
flows/
  global/
  spare/
  tech/
  groceries/
  laundry/
  care/
  assist/
  projects/
  health/
  business/
```

## Every Flow record

- stable `flow_key`;
- branch;
- Flow JSON/API version;
- WABA/environment IDs;
- trigger;
- allowed domain state;
- flow token purpose;
- screen IDs;
- request/response schema;
- domain commands;
- templates launching it;
- expiry/resume rule;
- fallback;
- test fixtures;
- Meta publish/approval state.

## Flow token

A Flow token is not business authority.

It references:
- ChannelSession;
- customer/guest ref;
- purpose;
- branch;
- aggregate/draft;
- expiry;
- nonce.

Verify it server-side.

## Data exchange endpoint

May:
- query permitted read models;
- check eligibility;
- return screen data;
- execute explicitly mapped typed commands.

May not:
- post ledger entries directly;
- set paid state from client success;
- override policy;
- write arbitrary tables;
- change unrelated aggregates.

## Production hardening

- Meta webhook signature verification;
- endpoint encryption;
- key rotation/secret manager;
- rate limiting;
- idempotency/replay protection;
- strict schemas;
- structured logs with sensitive-data filtering;
- latency/timeout monitoring;
- staging WABA;
- rollback/version pinning.

## UX

- minimal screens;
- prefill verified known data;
- don't ask twice without a reason;
- explicit pending/confirmed/failed/unknown states;
- support/human option at material decision points;
- no fake "success" while payment/business command is still pending.

## Rich UI fallback

Complex EPC/visual, huge catalog, project-doc or clinical-record experiences deep-link to app/web with a signed context reference. WhatsApp receives completion/status afterward.
