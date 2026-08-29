# ADR-001 — Workspace package boundaries are not yet enforceable

**Status:** Accepted, deferred
**Date:** 2026-08-29
**Feature refs:** repository-wide (RBC-003, CT-6)

## Context

Fourteen packages are declared as npm workspaces but every cross-package import
is a relative path:

```ts
import { runPipeline } from '../../../packages/pipeline-core/src/index.js';
```

No package declares an entry point, so nothing prevents any module reaching into
any other's internals. The bounded-context discipline the v2 canon requires has
no mechanical backing — it is convention only.

## Decision

Defer. Do not add `main`/`exports` to the package manifests yet.

## Why the obvious fix does not work

`tsconfig.build.json` emits a single tree at the repository root, mirroring the
source layout (`dist/packages/pipeline-core/src/index.js`). A package entry point
therefore has two options, and both fail:

- point at `./src/index.ts` — Node cannot execute TypeScript, so every runtime
  import breaks;
- point at `../../dist/packages/<name>/src/index.js` — Node forbids `exports`
  escaping the package root, so the specifier is rejected outright.

Adding `paths` to `tsconfig.json` alone makes the type-checker resolve
`@dial/contracts` while the runtime still cannot, which is worse than the current
state: it type-checks green and fails when run.

## What is actually required

Per-package build output, one of:

1. **TypeScript project references** — a `tsconfig.json` per package with
   `composite: true` and `outDir: ./dist`, built with `tsc -b`. Each package then
   legitimately exports `./dist/index.js`. Touches the build, the CLI and API
   start scripts, and the vitest resolution.
2. **A bundler per package** (tsup or similar) producing `dist/` inside each
   package.

Either is a contained afternoon of work, but it changes how everything is built
and should not ride along inside an unrelated change.

## Consequences

- Relative cross-package imports remain until this is done.
- The cost grows with the codebase: this is a mechanical rename today and a
  cross-cutting refactor once features are in flight, so it should be taken
  before broad fan-out (RBC-010), not after.
- Until then, package boundaries are enforced by review, not by the compiler.

## Alternatives rejected

- **Add `exports` pointing at `src/index.ts` anyway.** Advertises a runtime
  contract that does not work. A broken module boundary is worse than an absent
  one, because it looks correct.
- **Flatten the packages into one.** Discards the bounded-context structure the
  canon requires.
