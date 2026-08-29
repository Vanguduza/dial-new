# API, Event & Workflow Versioning Canon

Multiple agents/worktrees cannot safely evolve DIAL unless shared contracts have compatibility rules.

## API

- public/external APIs use explicit major version (`/api/v1`);
- additive response fields are normally backward compatible;
- removing/renaming required fields or changing semantics requires version/migration;
- clients ignore unknown optional fields;
- server validates request versions;
- deprecated versions have owner, usage telemetry and retirement date.

## Commands

Internal command names are stable business contracts.

A breaking command payload change:
- creates a new schema version;
- keeps old consumer compatibility during migration or migrates all atomic callers together;
- updates idempotency fingerprint rules.

## Events

Every event envelope includes:
- event type;
- schema version;
- aggregate ref/version;
- occurred/recorded time;
- producer;
- correlation/causation IDs;
- idempotency/event ID.

Consumers:
- must tolerate additive optional fields;
- never infer a new meaning from an old event name;
- use upcasters/adapters when event schema evolves;
- keep replay tests.

## Temporal workflows

Workflow code changes must preserve deterministic replay.

Use:
- workflow versioning/patching strategy;
- activity boundaries for external I/O;
- explicit migration for long-running workflow instances;
- replay tests against stored histories/fixtures.

Do not deploy a workflow change merely because unit tests pass.

## Database

Use expand/contract and effective-dated business data where semantics change.

## Mobile

Mobile API compatibility must account for clients that do not update immediately.

Define:
- minimum supported app version;
- server feature compatibility;
- forced update only for security/critical incompatibility;
- deep-link version handling.

## WhatsApp Flows

Flows have explicit IDs/versions/environments.

A Flow version is immutable after production use except through provider-supported update semantics; DIAL keeps transaction compatibility during rollout.

## Donor upgrades

Upstream donor changes never bypass DIAL contract tests.

## Contract registry

Each shared contract records:
- owner;
- current version;
- consumers;
- compatibility policy;
- fixtures;
- deprecation state;
- migration task.
