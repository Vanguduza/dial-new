# ready_to_copy — frozen bootstrap template, NOT current authority

**This directory is a snapshot used to install the agent system into a new
repository. It is not DIAL's current truth and must never be read as such.**

Every file here has a live counterpart at the repository root or under
`agent-system/`. Where the two differ, **the live file wins, always.**

## Why this warning exists

The live files have moved on. At the time of writing, ten of the forty-six
files here differ from their live counterparts, including the most
authority-bearing ones:

| File | Template | Live |
| --- | --- | --- |
| `agent-system/registries/DECISION_LOG.json` | 0 decisions | 31 decisions |
| `agent-system/canon/PROJECT_TRUTH.md` | seed stub | current canon |
| `CLAUDE.md` | seed stub | current engineering authority |
| `.claude/settings.json` | seed hooks | current hook profile |
| `agent-system/hooks/*.mjs` | seed guards | current guards |
| `agent-system/registries/FEATURE_REGISTRY.json` | seed | 309 features |

The registries here are deliberately empty (`[]`). A new repository starts with
no decisions and no features; that is the point of a template. It is not a
record of DIAL having none.

`PROJECT_TRUTH_PROTOCOL.md` states that a stale document cannot regain authority
because an agent retrieved it first. An unlabelled second copy of the canon,
sitting inside the canonical documentation pack, is exactly the hazard that rule
describes. Hence this file.

## Reading order

- Current authority: `agent-system/canon/PROJECT_TRUTH.md`, `CLAUDE.md`,
  `AGENTS.md`, `PROJECT_CANONICAL_STATE.json`, and the registries under
  `agent-system/registries/`.
- This directory: only when installing the agent system somewhere new.

## If you are installing into a new repository

Copy this tree, then work through
`MASTER_DEVELOPMENT_ENTRY_PROMPT.md`. Do not copy the live DIAL registries into
a new project — they describe DIAL's features and decisions, not the new
project's.

## Keeping it honest

This template is intentionally *not* auto-synced from the live files: syncing it
would push DIAL's 309 features and 31 decisions into every new repository. The
drift is the design. The labelling is what was missing.
