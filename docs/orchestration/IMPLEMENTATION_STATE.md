# DIAL Hermes External Runtime Implementation State

Last updated: 2026-09-03

This record tracks the Hermes/Oracle qualification branch only. It does not advance DIAL product Feature gates.

## Current state

```text
REPOSITORY_IMPLEMENTED
ORACLE_NOT_DEPLOYED
RUNTIME_NOT_QUALIFIED
SOAK_NOT_COMPLETE
```

`PRODUCTION_GREEN` has not been reached.

## Repository implementation present

The qualification branch contains:

- Oracle ARM64 bootstrap;
- Hermes installation/configuration path;
- Codex App Server / GPT-5.6 Sol primary-runtime probe;
- Claude Code / Sonnet 5 fallback-runtime probe;
- exact requested/resolved model provenance;
- subscription-auth safeguards;
- explicit Sol → Sonnet Hermes runtime router;
- `NO_HERMES_RUNTIME_AVAILABLE` total-loss behavior;
- runtime-health persistence;
- HOT/WARM/COLD and Feature-scoped memory;
- checkpoints and handoff capsules;
- DIAL context broker and Hermes pre/post-turn hooks;
- transaction-consistent Hermes `state.db` backup with bounded retention;
- deterministic supervisor/systemd recovery path;
- repository qualification tests and CI gate.

Repository implementation does not imply Oracle deployment or installed-runtime qualification.

## Corrective architecture state

The mistaken generalized model-management implementation has been removed from this DIAL branch. This branch does not claim a DIAL model-settings UI, generalized model catalog, development model pool or arbitrary worker-harness architecture.

Hermes runtime selection is availability/provenance only. DIAL repository canon, Feature IDs, FRCs, gates, evidence and existing deterministic governance remain authoritative.

## CI evidence rule

Do not reuse a prior green head after a corrective commit. Repository verification is valid only for the current PR head.

Required current-head checks:

```text
npm ci
npm run typecheck
npm run agent:orchestration:qualify
npm run verify
git diff --check
```

GitHub Actions is the authoritative Linux CI evidence when local command execution is unavailable.

## Oracle/runtime evidence still required

No item below may be marked complete from simulation or documentation alone:

- Oracle host provisioned and confirmed on the intended free allocation;
- repository deployed to the host;
- ChatGPT subscription OAuth for Codex;
- Hermes supported Codex App Server activation;
- Claude subscription authentication;
- installed-runtime Sol probe;
- installed-runtime Sonnet probe;
- actual Codex process-death test;
- actual Hermes process-death/restart;
- actual supervisor process-death/restart;
- full Oracle reboot recovery;
- checkpoint/HOT/WARM/COLD persistence across takeover/reboot;
- safe return to Sol after recovery;
- final secret/security audit;
- final independent architecture-contamination review.

## Real provider capacity gate

```text
REAL_QUOTA_SOAK = PENDING
```

Controlled `ACCOUNT_LIMITED`, `MODEL_LIMITED`, `RATE_LIMITED`, auth and process-failure states are deterministic routing evidence only. Subscription usage must not be deliberately exhausted to manufacture this event.

PR #1 remains draft until the required Oracle/runtime gates are genuinely complete.
