# DIAL Hermes External Runtime Implementation State

Last updated: 2026-09-03 (in-plan Hermes availability fallback)

This record tracks the Hermes/Oracle qualification branch only. It does not advance DIAL product Feature gates.

## Current state

```text
REPOSITORY_IMPLEMENTED
CURRENT_HEAD_CI_REQUIRED
ORACLE_HOST_PROVISIONED
ORACLE_BOOTSTRAP_COMPLETE
REPO_DEPLOYED
SUBSCRIPTION_AUTH_PRESENT
HERMES_CODEX_RUNTIME_ACTIVATED
REAL_QUOTA_SOAK_OBSERVED
RUNTIME_NOT_QUALIFIED
SOAK_NOT_COMPLETE
```

`PRODUCTION_GREEN` has not been reached.

Installed-runtime Sol/Sonnet probes and live soak cannot be marked HEALTHY while both subscriptions are at a naturally observed weekly limit. Do not manufacture additional quota events.

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
- in-plan availability fallback: Sol first, then the next listed Codex App Server plan model, then Claude Sonnet 5;
- Claude Hermes eligibility limited to Sonnet-class plan models; Fable 5 / Fable 5.1 excluded (not a Hermes hard pin);
- injected plan-model lists for deterministic qualification while live subscriptions are quota-limited;
- subscription-auth safeguards;
- explicit Sol → Codex in-plan → Sonnet Hermes runtime router;
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

The operational executor attempts Hermes → Codex App Server → GPT-5.6 Sol first. On a classified runtime failure it records the failure, checkpoints observable repository state, then tries the next eligible Codex plan model on the same App Server runtime. Only when no eligible Codex plan model remains does it rehydrate bounded DIAL context, prove Claude Code/Sonnet health and continue the original instruction through Claude Code. The fallback is instructed to inspect current state before editing because the failed primary runtime may already have completed tool actions.

Plan models are never invented. Codex discovery uses App Server `model/list` (no turn). Official Claude Code has no non-interactive plan list; injected lists are the deterministic path while subscriptions are quota-limited. Fable is excluded from Hermes powering.

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

## Oracle host evidence

Recorded 2026-09-03 on the live Always Free host (not a simulation):

- Name: `dial-hermes-control`
- Region: South Africa Central (Johannesburg) / AD-1
- Shape: `VM.Standard.A1.Flex` 4 OCPU / 24 GB
- Image: Canonical Ubuntu 24.04 aarch64
- Public IPv4: `84.12.94.18`
- VCN/subnet: `dial-hermes-vcn` / `dial-hermes-public-subnet` (`10.0.0.0/24`)
- Ingress: TCP 22 only; egress all
- Bootstrap: `deploy/oracle/hermes-codex/bootstrap-host.sh` completed
- Repository: `/srv/dial/repo` on `chore/hermes-codex-control-plane`
- Codex CLI: ChatGPT OAuth (`Logged in using ChatGPT`), `codex-cli 0.153.1`
- Claude Code: `claude.ai` Max subscription (`guduzatapiwa@gmail.com`)
- Hermes: `openai-codex` OAuth stored; `model.provider=openai-codex`, `model.default=gpt-5.6-sol`, `model.openai_runtime=codex_app_server`; leftover OpenRouter `base_url` removed
- Services active: `dial-hermes-runtime.service`, `hermes-gateway.service`, `hermes-dial-dashboard.service`
- `bubblewrap` installed (`0.9.0`); `kernel.unprivileged_userns_clone=1`

Installer repairs applied after first host activation:

- strip leftover third-party `model.base_url` when locking the Codex App Server route
- dedupe `~/.codex/config.toml` `model` / `default_permissions` keys so Hermes migrate cannot leave a duplicate-key config that Codex App Server rejects

## Real provider capacity gate

```text
REAL_QUOTA_SOAK = OBSERVED_WEEKLY_LIMIT
RESET_NOT_BEFORE = 2026-09-07T02:42:00Z
```

Naturally observed on this host, not manufactured:

- Codex App Server / GPT-5.6 Sol: ChatGPT usage limit, retry after 2026-09-07 02:42 UTC
- official Claude Code / Claude Sonnet 5: weekly limit, resets 2026-09-07 03:00 UTC

After the Codex `config.toml` duplicate-key repair, the Sol probe must be re-run only after the reset. A second Claude probe must not be issued just to re-observe the same weekly limit.

## Oracle/runtime evidence still required

No item below may be marked complete from simulation or documentation alone:

- installed-runtime Sol probe HEALTHY with exact `gpt-5.6-sol` identity (blocked until quota reset);
- installed-runtime Sonnet probe HEALTHY with exact `claude-sonnet-5` identity (blocked until quota reset);
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

Controlled `ACCOUNT_LIMITED`, `MODEL_LIMITED`, `RATE_LIMITED`, auth and process-failure states and actual process-kill tests remain routing/recovery evidence only. Subscription usage must not be deliberately exhausted to manufacture a provider quota event. The 2026-09-03 weekly-limit observation is the first real provider-capacity evidence for this branch.

PR #1 remains draft until the required Oracle/runtime gates are genuinely complete.
