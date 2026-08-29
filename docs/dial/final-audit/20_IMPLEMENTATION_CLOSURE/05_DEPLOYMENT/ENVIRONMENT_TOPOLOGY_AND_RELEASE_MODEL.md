# DIAL Environment, Deployment & Release Model

## Locked environments

`LOCAL → CI → PREVIEW → INTEGRATION → STAGING → PRODUCTION`

`DR_RECOVERY` is a separate recovery environment/process.

## Environment isolation

Each environment receives independent:
- Supabase project/branch or isolated Postgres/auth configuration;
- Redis/BullMQ;
- Temporal namespace/environment;
- Meilisearch index namespace;
- object-storage buckets/prefixes;
- n8n credentials/workflows;
- Chatwoot integration config;
- observability environment labels;
- AI/provider credentials;
- payment-provider credentials;
- WhatsApp/WABA/test-number configuration.

Production secrets cannot be reused in CI/Preview.

## Build promotion

Preferred:
`commit → CI artifact → integration → staging → production promotion`

Do not rebuild different source for production after staging certification unless the build itself is deterministic and attested.

## Database migration

Use expand/contract:

1. additive compatible schema;
2. deploy code that can read old/new;
3. backfill with checkpoints;
4. switch reads/writes;
5. verify;
6. remove obsolete structure only after compatibility window.

Money/identity/health migrations require dedicated revalidation and rollback/forward-repair plan.

No agent runs destructive production SQL ad hoc.

## Feature/branch activation

Software deployment and business activation are separate.

A division can be:
- `BUILT`;
- `CERTIFIED_DORMANT`;
- `ACTIVE`.

Activation registry controls:
- public navigation;
- eligibility;
- provider adapters;
- queues/workflows;
- scheduled tasks;
- payment methods;
- WhatsApp flows/templates;
- support routing;
- Command Centre alerting.

Turning off a branch must not orphan existing orders/jobs/memberships/cases.

## Secrets

Use environment-specific secret management.

Provider secrets are referenced by secret name/config, never copied into Project Truth, prompts, git, Flow JSON or client bundles.

## Release

Every release records:
- git SHA;
- build artifact/ref;
- migrations;
- changed Feature IDs;
- donor changes;
- security/SCA/SBOM result;
- contract versions;
- feature flags;
- environment;
- approver;
- rollback/forward-repair;
- post-deploy verification.

## Production rollback

Stateful systems prefer forward repair over blindly rolling schema/data backward.

Application rollback is allowed only if:
- schema remains compatible;
- Temporal workflows remain compatible;
- events/API contracts remain understood.

## Disaster recovery

Critical domains have:
- backup/PITR;
- restore runbook;
- RPO/RTO;
- credential recovery;
- provider reconfiguration;
- DNS/domain recovery;
- evidence of periodic restore testing.
