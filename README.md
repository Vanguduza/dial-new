# DIAL Main Platform

DIAL Main is the active multi-division operating platform repository.

## Source of truth

There is one top-level product/architecture authority:

**`docs/dial/canon/DIAL_SOURCE_OF_TRUTH_MASTER_PLAN_v1.2.md`**

`CLAUDE.md` and `agent-system/canon/PROJECT_TRUTH.md` are thin engineering projections. Machine registries describe dynamic implementation state. Specialist documents provide subordinate implementation detail only.

## Current implementation reality

The repository contains strong governance/registry infrastructure, a substantial Spare visual/EPC transition engine and several domain-tested Grocery Rounds packages. It does **not** yet contain complete production runtime applications for every intended DIAL surface.

Current Rounds code must be migrated from legacy weighted-vote/exit semantics to the master democratic-governance rules before inheriting higher readiness. The Oracle/Hermes draft is substantial but must enforce Sol → Sonnet and complete current-head/live qualification before production-green.

## Core verification

```text
npm ci
npm run agent:canon-coherence
npm run agent:closure-check
npm run verify
```

## Specialist visual tooling

The existing visual-transition/EPC generator remains a subordinate DIAL a Spare subsystem. Its CLI, preview and catalogue-coverage commands remain available through `package.json`. Generated visuals are navigation assets, never catalogue/fitment truth.

## Development rule

Resolve a Feature ID, retrieve bounded context, inspect code/tests, implement against the current master and feature contracts, then advance only to the gate proven by fresh evidence.
