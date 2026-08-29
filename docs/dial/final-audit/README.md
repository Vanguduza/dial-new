# DIAL Consolidated Development Pack v2.2

**Active authority.** Start here; everything else in this pack is subordinate to the
anchor index below.

## Start

1. `00_MASTER/V2_2_ANCHOR_INDEX.md` — where every contract lives
2. `00_MASTER/DIAL_V2_IMPLEMENTATION_CLOSURE_CANON.md` — the closure canon
3. `00_MASTER/DIAL_CONSOLIDATED_DEVELOPMENT_PLAN_v2_1.md` — the active plan
4. `13_PROMPTS/DIAL_MASTER_DEVELOPMENT_PROMPT_v2_1.md` — the active development prompt
5. `00_MASTER/BUILD_READINESS_SCORECARD.json` — current gate status

## What v2.2 is

v2.2 is a **reconciliation release**. It adds no product scope.

v2.1 was authored as a twelve-file overlay on v2.0 carrying four decisions — the
Shop-Ecommerce frontend donor, the frozen transition/EPC contracts, the eleven-stage
vehicle readiness gate, and the v2.1 development prompt — but it was packaged as a
replacement pack. That dropped 181 of v2.0's 199 files, including all 33 machine
registries and the ready-to-apply repository bootstrap that the closure canon names as
the mechanism for clearing CT-6.

v2.2 restores the v2.0 substrate underneath the v2.1 decisions, applies the bootstrap,
and corrects two closure tests that were green on the wrong measurement.

| | v2.0 | v2.1 | v2.2 |
|---|---:|---:|---:|
| Files in pack | 199 | 30 | 211 |
| Machine registries | 33 | 0 | 33 |
| Repository bootstrap | present | absent | applied |
| Harness executes | no | no | yes |

## Status

```text
CT-1  Concrete Feature Contracts    AMBER   re-scored on semantics
CT-2  Executable Eventualities      AMBER   re-scored on semantics
CT-3  Donor Qualification           GREEN
CT-4  NFR / Deployment              GREEN
CT-5  Activation Blockers           GREEN
CT-6  Repository Alignment          AMBER   7 of 10 tasks complete
CT-7  Contract Specificity          AMBER   new; regression-blocking
```

CT-1 and CT-2 moved from GREEN to AMBER because the metric behind them counted command
and event **names**, which embed their own aggregate name and are therefore distinct by
construction. No contract was removed or weakened. See
`20_IMPLEMENTATION_CLOSURE/14_VALIDATION/CLOSURE_TEST_REPORT.md`.

## Gates

Run from the repository root:

```text
npm run verify                      typecheck, schemas, manifest, drift, closure, tests
npm run agent:v2-closure-check      the six closure tests
npm run agent:manifest-check        manifest completeness and canon-referenced paths
npm run agent:drift-check           stale authority detection
npm run schema:check                schemas parse; generated packs conform
node agent-system/bin/contract-specificity.mjs   CT-7
```

## Superseded

`ARCHIVE/` holds the v1.6 and v2.0 entry points, anchor indexes and manifests. They are
provenance. They are not authority, and no agent should open them to decide what to build.
