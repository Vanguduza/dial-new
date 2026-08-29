# DIAL Human Operating System

Every material state that requires human intervention must resolve to:

`software state → queue → named role → SLA → procedure/runbook → evidence → escalation → terminal result`

"Ops handles it" is not an implementation.

## Queue requirements

A queue item contains:
- human ref;
- source Feature/aggregate;
- reason/trigger;
- severity;
- business unit/site;
- customer/provider refs where permitted;
- age/SLA;
- allowed actions;
- evidence completeness;
- assigned role/person;
- escalation path.

## Where the queues are defined

`OPERATIONAL_RESPONSIBILITY_REGISTRY.json` in this directory holds the 12 operational
responsibility records. Every Material eventuality's `owner_queue` must resolve to one of
them. Positions, permission bundles and financial authority are defined in
`../../18_FINANCE_PEOPLE/FINANCE_ROLE_AND_AUTHORITY_REGISTRY.json` and
`../../18_FINANCE_PEOPLE/POSITIONS_ROLE_CONTRACTS_PERMISSIONS_AND_ONBOARDING.md`.

## Role resolution

Use Position/PermissionBundle/FinancialAuthority rather than hard-coded individual emails.

If the assigned person is absent:
- delegation;
- queue owner fallback;
- escalation;
must be deterministic.

## Customer-visible cases

Customer sees:
- case ref;
- current state;
- requested evidence/action;
- expected next step/SLA where meaningful;
- human support entry.

They must not need to repeat the original transaction context.

## Operational certification

Before a branch becomes ACTIVE:
- each Material eventuality has a queue/owner;
- runbooks exist for critical/high cases;
- operators have permissions/training;
- test case reaches and closes the queue;
- Command Centre sees ageing/backlog/SLA breaches.
