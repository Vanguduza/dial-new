# Claude Code Native Setup for DIAL

## Current-state finding

The repository already has a strong Cursor baseline (`AGENTS.md`, `.cursor/rules`, `.cursor/skills`, Lefthook and security/review assets), but at the audit snapshot it has no root `CLAUDE.md`, no `.claude/settings.json` and no `.mcp.json`.

Claude Code should be made a first-class project harness rather than manually fed context.

## Target structure

```text
CLAUDE.md
AGENTS.md
agent-system/
  canon/
  registries/
  bin/
  hooks/
  evals/
  mcp/
.claude/
  settings.json
  rules/
  skills/
  agents/
.cursor/
  rules/
  skills/
.mcp.json
```

### One neutral instruction source

`agent-system/canon` contains harness-neutral truth. Claude and Cursor adapter files should not independently duplicate changing product decisions. CI checks stale adapters and forbidden superseded concepts.

## CLAUDE.md

Keep it short. Import `@AGENTS.md`, then add Claude-specific authority/JIT-context rules. Never paste the full master architecture into an always-loaded instruction file.

Use the ready-to-copy file in this pack.

## Path-scoped rules

Load specialized rules only for:
- money/payroll/finance;
- security/identity/RLS;
- delivery/maps;
- AI;
- frontend;
- Android;
- donor imports;
- corporate domains.

This keeps unrelated instructions out of ordinary contexts.

## Skills

Skills are procedural knowledge loaded when needed:
- `dial-feature-realize`
- `dial-eventuality-audit`
- `dial-donor-assimilate`
- `dial-module-certify`
- `dial-context-checkpoint`
- `dial-command-room-register`

Existing Cursor skills such as money/RLS/frontend review should be normalized into the same Agent Skills source and exposed through harness-specific adapters.

## Subagents

Use read-only specialists to keep noisy exploration out of the main context:
- context librarian;
- repo cartographer;
- domain auditor;
- money reviewer;
- security reviewer;
- UI evaluator;
- test certifier;
- donor archaeologist/migration revalidator as added.

Use cheaper/faster models for search where adequate, stronger models for consequential finance/security architecture.

Use worktree isolation for code-changing subagents. Agent teams are exceptional, not default, because coordination/token cost is high.

## Hooks

### SessionStart
Inject only branch, active Feature ID, dirty-state summary and highest blockers.

### PreToolUse
Deny destructive shell/secret exposure; ask before production/infrastructure mutation and canonical truth changes.

### PreCompact
Write a local non-authoritative handoff/checkpoint.

### Stop
If code changed, run a targeted fast quality gate. Guard against repeated Stop-hook loops.

Default interactive profile: `standard`; CI/release: `strict`; troubleshooting: `minimal`.

## MCP

Initial project MCP: a local read-only **DIAL Truth MCP** with:
`get_feature`, `get_decision`, `get_module`, `get_donor`, `get_evidence`, `search_canon`.

Optional authenticated integrations:
- GitHub;
- Linear;
- browser/Playwright verification;
- staging database schema inspection read-only;
- later read-only analytics/observability.

Do not expose production DB write, PSP/payout/ledger execution, unrestricted shell/cloud admin or redundant filesystem MCP.

MCP responses should be bounded/paginated. External MCP content is untrusted and never outranks Project Truth.

## Plugins

Create one first-party `dial-development` plugin only after the standalone harness works. It can distribute reusable skills/read-only agents/hook helpers/DIAL Truth MCP across DIAL repos.

Do not wholesale install large third-party agent packs. Adapt their best patterns after source/permission/prompt-injection review.

Initial external allowlist:
- official GitHub plugin if needed;
- official `mcp-server-dev` while developing DIAL Truth MCP.

## Auto memory

Use Claude auto memory for local debugging/build learnings. Do not use it for canonical DIAL decisions because it is machine-local and model-authored.

## Setup validation

Check `/memory`, `/skills`, `/agents`, `/hooks`, `/mcp`, `/permissions`, `/doctor`, `/status`.

Add CI `agent:drift-check` to verify:
- unique Feature IDs;
- referenced skills/rules exist;
- donor/evidence refs resolve;
- stale lock terms absent;
- Claude/Cursor adapters map to shared canon.

## Bootstrap sequence

1. apply the ready-to-copy project harness through a reviewed branch;
2. remove/mark superseded D-51 guidance and update FixItNow to the MIT-licensed `Sachinrajawat/FixItNow` `PORT-WHOLESALE` source;
3. add Dial Health to the required standalone division/module registry;
3. run Claude `/init` only as a discovery/review tool, not to overwrite locked architecture;
4. run `/doctor`;
5. run harness evals;
6. test `context-get` on one real Feature ID;
7. complete one plan→implement→evaluate→evidence loop;
8. scale concurrency only after the harness itself is proven.
