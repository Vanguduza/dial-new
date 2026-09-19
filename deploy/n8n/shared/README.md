# DIAL n8n runtime fabric — deployment

Two estates, never one. `DIAL_N8N_DEV` runs on Hermes with its PostgreSQL
database native on vekl-worker; this repository does not alter the PROD
placement. The estates do not share a database, an encryption key, a
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
deploy/n8n/dev/bootstrap.sh           DEV-only convergent Hermes bootstrap
deploy/n8n/dev/verify.sh              live health and worker database proof
deploy/n8n/dev/systemd/               persistent DEV service templates
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

DEV pins both n8n and its external task runner to `2.39.7`. Upgrading either is
a deliberate change with a fresh qualification run, not a `:latest` drift.

## Standing an estate up

Bringing an estate up is an owner-authorized operator action. The DEV bootstrap
is inert until explicitly invoked and its details are in `../dev/README.md`.
`agent:n8n-dev:qualification` and
`agent:n8n-prod:qualification` qualify the **contract** — node policy projection,
release identity, event verification, idempotency, isolation declarations. They
report the live estate as `UNVERIFIED_FROM_REPOSITORY` unless handed a
deployment descriptor, and they never claim an estate is running.

After the estates exist, record their real identifiers in a descriptor shaped
like `estate-descriptor.example.json` and pass it to the qualification command.
