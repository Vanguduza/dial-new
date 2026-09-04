# DIAL Hermes Auxiliary Operations Plane

Status: repository implementation specification for the Oracle-hosted DIAL Hermes control plane.

## Purpose

The Auxiliary Operations Plane keeps useful work running while the high-authority reasoning runtimes are unavailable or should not be consumed. It is part of DIAL's Oracle control plane, not DDE, and it does not change the locked development runtime policy.

The development reasoning chain remains exactly:

```text
GPT-5.6 Sol / Codex App Server / ChatGPT subscription
  -> Claude Sonnet 5 / official Claude Code / Claude subscription
  -> NO_HERMES_RUNTIME_AVAILABLE
```

The auxiliary plane is a separate, lower-authority path for deterministic operations and optional evidence summarisation.

## Hard authority boundary

The Auxiliary Operations Plane has authority label `NON_AUTHORITATIVE_CONTROL_PLANE_OPERATIONS`.

It may:

- run fixed deterministic repository-integrity and repository verification checks;
- inspect fixed systemd service health and recover only a hard-coded DIAL service allowlist;
- inspect persistent external-queue health without exposing queued instructions;
- prepare bounded evidence bundles for a future manager-model turn;
- verify checkpoint/Hermes backup presence and permissions;
- persist scheduled operational evidence outside Git;
- maintain a registry of separately isolated projects;
- optionally send already-sanitised deterministic evidence to a configured API model for summarisation/classification.

It may not:

- execute DIAL product-development instructions;
- call `executeHermesInstruction` or bypass `assertDevelopmentUnblocked`;
- alter or satisfy `PRODUCTION_GREEN`;
- select, replace or extend the Sol -> Sonnet runtime chain;
- edit monitored repositories;
- execute commands supplied by an API model;
- restart arbitrary services or restart `dial-hermes-operations.service` itself;
- treat API output as canonical truth, security authority, deployment authority, money authority or product authority.

API output is evidence commentary only and must always carry `NON_AUTHORITATIVE_AUXILIARY_OPERATIONS_ONLY`.

## Persistent Oracle components

```text
dial-hermes-operations.service
  -> operations-plane.mjs
     -> fixed job whitelist
     -> project registry
     -> schedule registry
     -> evidence store
     -> optional operations-api.mjs summariser
```

State is stored beneath `/var/lib/dial-control/operations/`. Project-specific outputs are isolated under:

```text
/var/lib/dial-control/operations/projects/<project-slug>/
```

The API secret is outside Git at:

```text
/var/lib/dial-control/secrets/operations-api.key
```

It must be mode `0600`. The public configuration contains provider/model/base URL only; key material is never written into JSON status, event logs, checkpoints, handoff capsules, Git, or systemd environment variables.

## API configuration

Supported auxiliary API protocols:

- `openai-compatible` using an HTTPS `/chat/completions` endpoint;
- `anthropic` using the HTTPS `/messages` endpoint.

The API key is accepted only on stdin so it does not appear as a command-line argument.

OpenAI-compatible example:

```bash
printf '%s' "$OPS_API_KEY" | dial-hermes-ops-config configure \
  --provider openai-compatible \
  --base-url https://api.example.com/v1 \
  --model MODEL_NAME \
  --api-key-stdin
```

Anthropic example:

```bash
printf '%s' "$OPS_API_KEY" | dial-hermes-ops-config configure \
  --provider anthropic \
  --model MODEL_NAME \
  --api-key-stdin
```

`anthropic` defaults to `https://api.anthropic.com/v1`. All configured endpoints must use HTTPS and may not embed credentials in URLs.

Configuration commands:

```bash
dial-hermes-ops-config status
dial-hermes-ops-config disable
dial-hermes-ops-config clear
```

Configuring a key does not automatically enable API use on schedules. API use is opt-in per operational run/schedule to avoid accidental spend.

## Fixed deterministic jobs

Current whitelist:

- `service_health`
- `service_recovery`
- `queue_health`
- `repo_integrity`
- `deterministic_verify`
- `evidence_prepare`
- `backup_verify`

There is no arbitrary-shell job type.

`service_recovery` may restart only `dial-hermes-runtime.service`, `hermes-gateway.service`, `hermes-dial-dashboard.service`, and `dial-hermes-orchestrator.service`, and only when one is observed unhealthy. It cannot restart the operations service itself and cannot alter repository state or the production gate.

`queue_health` reads queue counts, external-orchestrator heartbeat freshness, and stale-processing age without loading or exporting job instructions. `deterministic_verify` runs the repository-owned fixed `npm run verify` chain and records bounded output evidence; it invokes no model runtime.

`repo_integrity` uses Git with `GIT_OPTIONAL_LOCKS=0` and the systemd service mounts monitored repositories read-only. `evidence_prepare` aggregates repository/service/queue/latest-verification/backup/control-plane evidence without mutating the project. `backup_verify` verifies existing checkpoint/Hermes state backup evidence; it does not fabricate backup success.

Default DIAL schedules are conservative and API-disabled:

- service health every 5 minutes;
- bounded service recovery every 5 minutes;
- external queue health every 5 minutes;
- repo integrity every 30 minutes;
- deterministic repository verification every 6 hours;
- evidence preparation every 6 hours;
- backup verification every 6 hours.

Operators can change schedules with:

```bash
dial-hermes-ops schedule-set --project dial --job evidence_prepare \
  --interval-minutes 720 --enabled true --use-api true
```

## Project isolation

`project-registry.mjs` provides explicit project registration. DIAL is registered with its own locked manager policy. Other repositories may be registered, but each receives a separate project slug/state namespace and its own manager-policy label.

Example:

```bash
dial-hermes-projects register \
  --slug project-x \
  --name "Project X" \
  --repo /srv/project-x/repo \
  --manager-policy PROJECT_X_LOCKED_POLICY
```

Registering another project never imports DIAL's product truth or grants it DIAL development authority. DDE must remain a separately registered project with a distinct policy if it is ever supervised from the same Oracle host.

## Security invariants

1. `OPENAI_API_KEY`, `CODEX_API_KEY` and `ANTHROPIC_API_KEY` remain unset in the Hermes runtime, external orchestrator and operations systemd environments.
2. Auxiliary API secrets are file-scoped, outside Git, mode `0600`.
3. Evidence is sanitised for bearer tokens, API keys, tokens, secrets and passwords before API transmission.
4. API responses are never executed.
5. The operations service has read-only access to the DIAL repository and write access only to the control state root.
6. API configuration is optional; deterministic operations continue without it.
7. The final production gate checks the operations service boundary but does not require an API key.

## Operator commands

```bash
dial-hermes-ops status
dial-hermes-ops run repo_integrity --project dial
dial-hermes-ops run queue_health --project dial
dial-hermes-ops run service_recovery --project dial
dial-hermes-ops run deterministic_verify --project dial
dial-hermes-ops prepare --project dial
dial-hermes-ops run evidence_prepare --project dial --use-api
dial-hermes-ops schedules
dial-hermes-projects list
dial-hermes-ops-config status
```

The auxiliary plane complements the persistent Hermes development orchestrator; it never replaces it.
