# Actual GitHub Repository Alignment Audit — 2026-08-29

**Repository:** `Vanguduza/dial`  
**Visibility:** private  
**Default branch:** `main`

## Verified current facts

At audit time:

- root `package.json` uses `pnpm@9.15.9`;
- Node engine is `>=20`;
- root scripts are currently limited to `typecheck`, `test`, `build`, `lint`, and `dev:gateway`;
- `pnpm-workspace.yaml` currently includes only `apps/*` and `packages/*`;
- `turbo.json` contains build/typecheck/test/lint/dev tasks;
- root `CLAUDE.md` is absent;
- the visible commit history returned by the connected repository currently shows the original 2026-08-11 foundation commit;
- `.cursor/rules/dial-agent-authority.mdc` still declares the old v4/Development-Agent-Pack/D-number hierarchy as authoritative.

Therefore:

> The repository is **not yet aligned to v2 canon**, even though the v2 planning pack is build-ready.

## Required repository canonicalization

Before broad feature implementation:

1. create a reviewed `canon-v2-bootstrap` branch/worktree;
2. add lean root `CLAUDE.md`;
3. add `agent-system/` v2 registries/scripts;
4. add `.claude/` project settings/rules/skills/agents;
5. optionally add the local `dial-development-governor` Claude Code plugin;
6. replace the stale always-on Cursor authority rule with a v2 authority pointer;
7. keep old planning documents in an archive/reference location, not active authority;
8. update workspace topology for `workers/*`, `adapters/*`, `infra/*` only when those roots actually exist;
9. add root scripts:
   - `agent:context`
   - `agent:drift-check`
   - `agent:realization-coverage`
   - `agent:security-coverage`
   - `agent:v2-closure-check`
10. map existing code paths/tests to Feature IDs;
11. set each Feature only to the highest evidence-proven implementation state;
12. run the closure/bootstrap certification;
13. merge only after the new authority hierarchy is demonstrably active.

## Authority after application

1. founder-approved v2 locked decisions;
2. v2 Implementation Closure & Build-Ready Canon;
3. domain/FRC/evidence registries;
4. specialist documents referenced by frozen integration contracts;
5. actual code/tests where they clarify implementation without contradicting canon.

Older v4/D-number documents become provenance/reference unless a v2 entry explicitly imports a decision from them.

## Do not delete historical reasoning

Archive/supersede old active instructions rather than erasing evidence. The objective is to stop stale context from becoming active instructions, not to destroy history.
