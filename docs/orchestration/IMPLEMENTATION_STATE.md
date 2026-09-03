# DIAL Hermes External Runtime Implementation State

Last updated: 2026-09-03

This record tracks the Hermes/Oracle qualification branch only. It does not advance DIAL product Feature gates.

## Current state

```text
REPOSITORY_IMPLEMENTED
CURRENT_HEAD_CI_GREEN
ORACLE_NOT_DEPLOYED
RUNTIME_NOT_QUALIFIED
SOAK_NOT_COMPLETE
```

`PRODUCTION_GREEN` has not been reached.

## Current-head CI evidence

GitHub Actions workflow `verify` is the live authority. A prior green SHA is not reused after a later commit.

Recorded 2026-09-03 against `bd2816d98573c367bec8ca9ebbda6ab01c35fde1`:

- GitHub Actions `verify` run [33786133089](https://github.com/Vanguduza/dial-new/actions/runs/33786133089): success
  - gates, types and unit suites: success
  - pipeline produces a conforming pack: success
  - customer transition contract: success
- Local re-verification on the same tree:
  - `npm ci`
  - `npm run typecheck`
  - `npm run agent:orchestration:qualify` — 14 passed
  - `npm run verify` — 343 passed
  - `node --check` for `agent-system/orchestration/*.mjs`
  - `bash -n` for `deploy/oracle/hermes-codex/*.sh` and hooks
  - `git diff --check origin/master...HEAD`

This evidence commit itself must keep `verify` green on the resulting PR head.

## Architecture-contamination review

Reviewed this branch against the locked exclusion boundary. The PR diff does not implement a DDE model registry, Command Centre model picker, Settings → Models UI, Manager Chair, Lesser Task Pool, DeepSeek Harness settings, custom API provider UI, or generalized development-model routing. Those names appear only as explicit exclusions in `DIAL_HERMES_RUNTIME_BOUNDARY.md`.

This review is repository-diff evidence only. It does not satisfy Oracle host, installed-runtime, soak, or secret-audit gates.

## Repository implementation present

The qualification branch contains:

- Oracle ARM64 bootstrap;
- Hermes installation/configuration path;
- Codex App Server / GPT-5.6 Sol primary-runtime probe;
- official Claude Code / Sonnet 5 fallback-runtime probe;
- exact requested/resolved model provenance and explicit toolchain-usability evidence;
- subscription-auth safeguards;
- explicit Sol → Sonnet Hermes runtime router;
- operational `hermes-runtime-executor.mjs` / `dial-hermes` entrypoint;
- automatic continuation through Claude Code when the primary runtime fails with an eligible runtime failure;
- checkpoint-before-fallback protection against blind replay after a partially completed primary turn;
- intentional disabling of Hermes' built-in Anthropic API fallback for this subscription-only design;
- `NO_HERMES_RUNTIME_AVAILABLE` total-loss behavior;
- bounded low-frequency background probing plus per-operational-turn health refresh;
- runtime-health persistence;
- HOT/WARM/COLD and Feature-scoped memory;
- checkpoints and handoff capsules;
- DIAL context broker and Hermes pre/post-turn hooks;
- transaction-consistent Hermes `state.db` backup with bounded retention;
- deterministic supervisor/systemd recovery path;
- automated Oracle process-death and reboot soak harness;
- repository qualification tests and CI gates, including JavaScript syntax, Oracle shell syntax and PR diff whitespace checks.

Repository implementation does not imply Oracle deployment or installed-runtime qualification.

## Corrective architecture state

The mistaken generalized model-management implementation has been removed from this DIAL branch. This branch does not claim a DIAL model-settings UI, generalized model catalog, development model pool or arbitrary worker-harness architecture.

Hermes runtime selection is availability/provenance only. DIAL repository canon, Feature IDs, FRCs, gates, evidence and existing deterministic governance remain authoritative.

## Runtime failover boundary

The locked fallback is the official Claude Code CLI with `claude-sonnet-5`. Hermes' own Anthropic-provider fallback is intentionally empty in the Oracle configuration so a future Hermes change cannot silently convert this route into API billing.

The operational executor attempts Hermes → Codex App Server → GPT-5.6 Sol first. On a classified runtime failure it records the failure, checkpoints observable repository state, rehydrates bounded DIAL context, proves Claude Code/Sonnet health and continues the original instruction through Claude Code. The fallback is instructed to inspect current state before editing because the failed primary runtime may already have completed tool actions.

This is a continuity mechanism, not a rollback/transaction layer. Repository state, tests and evidence determine what actually completed.

## CI evidence rule

Do not reuse a prior green head after a corrective commit. Repository verification is valid only for the current PR head.

Required current-head checks:

```text
npm ci
npm run typecheck
npm run agent:orchestration:qualify
npm run verify
node --check for orchestration modules
bash -n for Oracle scripts/hooks
git diff --check against the PR base
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
- installed `dial-hermes` primary path through exact Sol;
- `soak-control-plane.sh process` green evidence:
  - actual Codex App Server SIGKILL;
  - Sonnet fallback identity/execution;
  - safe return to Sol;
  - supervisor SIGKILL/restart;
  - Hermes gateway SIGKILL/restart;
- `soak-control-plane.sh reboot-pre` followed by an actual Oracle reboot;
- `soak-control-plane.sh reboot-post` green evidence:
  - changed Linux boot ID;
  - service recovery;
  - checkpoint persistence;
  - HOT/WARM/COLD persistence;
  - Hermes `state.db` backup persistence;
  - fresh return to Sol preference;
- final installed-host secret/security audit;
- final independent architecture-contamination review.

## Real provider capacity gate

```text
REAL_QUOTA_SOAK = PENDING
```

Controlled `ACCOUNT_LIMITED`, `MODEL_LIMITED`, `RATE_LIMITED`, auth and process-failure states and actual process-kill tests are routing/recovery evidence only. Subscription usage must not be deliberately exhausted to manufacture a provider quota event.

PR #1 remains draft until the required Oracle/runtime gates are genuinely complete.
