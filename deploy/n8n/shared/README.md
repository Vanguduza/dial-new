# DIAL n8n runtime fabric — deployment

Two estates, never one. `DIAL_N8N_DEV` and `DIAL_N8N_PROD` may sit on the same
physical VM at first, but they do not share a database, an encryption key, a
credential store, a webhook domain, a service account or a backup target. The
list is enforced by `assertEstateIsolation` in
`agent-system/orchestration/n8n-runtime-release.mjs`, against
`isolation_requirements` in `agent-system/registries/N8N_RUNTIME_POLICY.json`.

These descriptors are **not** the VEKL n8n corpus. The corpus is knowledge about
workflows and lives under `agent-system/engineering-knowledge/automation/`; it
never executes anything. These estates execute qualified workflows and never
become the corpus's authority. Confusing the two is the specific failure the
naming in `N8N_RUNTIME_POLICY.json` exists to prevent.

## What is here

```
deploy/n8n/dev/docker-compose.yml     DIAL_N8N_DEV
deploy/n8n/dev/.env.example           dev variable names — no values
deploy/n8n/prod/docker-compose.yml    DIAL_N8N_PROD
deploy/n8n/prod/.env.example          prod variable names — no values
deploy/n8n/shared/estate-descriptor.example.json
```

## Secrets

No secret is committed here, and none belongs in a workflow definition either
(`secrets.embedded_secrets_forbidden`). The `.env.example` files name variables
and nothing else; real values are supplied by the operator at deploy time and
held in each estate's own credential store. `buildWorkflowRelease` refuses a
release whose workflow JSON carries an inline credential, using the same secret
patterns the VEKL corpus check already enforces.

Production credentials are never available to `DIAL_N8N_DEV`. That is checked,
not merely asked for: a dev estate declaring `has_production_credentials: true`,
or sharing a credential id with prod, fails qualification.

## Version pinning

Both estates pin the same n8n image tag. Upgrading is a deliberate change to
these files with a fresh qualification run, not a `:latest` drift.

## Standing an estate up

Bringing an estate up is an Oracle/owner action, not something this repository
performs or can observe. `agent:n8n-dev:qualification` and
`agent:n8n-prod:qualification` qualify the **contract** — node policy projection,
release identity, event verification, idempotency, isolation declarations. They
report the live estate as `UNVERIFIED_FROM_REPOSITORY` unless handed a
deployment descriptor, and they never claim an estate is running.

After the estates exist, record their real identifiers in a descriptor shaped
like `estate-descriptor.example.json` and pass it to the qualification command.
