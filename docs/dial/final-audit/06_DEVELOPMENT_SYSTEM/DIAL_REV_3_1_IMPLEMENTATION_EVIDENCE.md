# Rev 3.1 — Baseline and Implementation Evidence

**Covers:** `DIAL_DEVELOPMENT_PRODUCT_INTELLIGENCE_AUTOMATION_ARCHITECTURE_REV_3_1.md` (Phases 0–12)
**Decisions:** `DEC-036`, `DEC-037`, `DEC-038` (all `PROPOSED`)
**Authorization:** `docs/project-state/authorizations/auth-20260918-owner-rev31-open-world-guided-design-n8n.json`

Every number below was derived by running the named command. Where something could
not be measured, this document says so rather than estimating.

---

## Phase 0 — Baseline

| Item | Value |
| --- | --- |
| Base commit | `fa7c655f12faf02a2b33cc15799069526bdda3a6` |
| Control-plane fingerprint | `1951e5bbd1fa42b63c15ef27d2dec4edcb9187e9e067c137853b0d7d1e36ded7` |
| `agent-system/orchestration` tree | `902baf40c7378806d99fd565cc52368871fc18f0` |
| `agent-system/engineering-knowledge` tree | `3102cdbcbebcc0c8948f604b9d8af94a48058496` |
| `deploy/oracle/hermes-codex` tree | `c0f50092b3206afc50b1c27cf7d4efba637ebe60` |
| Admitted VEKL resources / sources | 102 / 33 |
| Development Units | 309 |
| Decision records | 32, all `LOCKED`, highest `DEC-032` |
| n8n corpus check | 25/25 gates |
| Frontend component registry | 5 components |

### Baseline `npm run verify` — an instrument correction

The baseline run exits **1**, and it is important to say why, because a later
comparison against "green" would have been a comparison against something that
never happened:

```
 Test Files  43 passed (43)
      Tests  713 passed (713)
     Errors  1 error
EXIT=1
```

Every gate before `npm run test` passed (the chain is `&&`-joined, so reaching
`test` proves it). All 43 test files and all 713 tests pass. The exit code comes
from a vitest worker RPC timeout — `[vitest-worker]: Timeout calling "onTaskUpdate"` —
in this container, where `orchestration-vekl-graph-v2.test.mjs` alone takes 62s.
That is a harness artifact of the environment, not a repository failure, and it is
the baseline this work is measured against.

---

## Phase 1 — Decisions

`DEC-036`, `DEC-037`, `DEC-038` allocated after preserving the existing locked lineage. Recorded
as `PROPOSED`, not `LOCKED`: every existing decision is `LOCKED` and locking is an
owner act. `agent:decision-evolution:check` confirms no locked decision was
mutated or deleted:

```
{ "ok": true, "new_decision_ids": ["DEC-036","DEC-037","DEC-038"], "failures": [] }
```

No `DIAL-ADR-*` namespace was introduced.

---

## Phases 2–3 — VEKL discovery and sandbox qualification

`node agent-system/orchestration/discovery-architecture-check.mjs` → **28/28**.

| Acceptance criterion (§17.1) | Where proven |
| --- | --- |
| a previously unregistered resource can be discovered | `DISC-7c056c35b85bd3ad8b3c8dfc` in the candidate ledger |
| discovery does not imply trust | same candidate sits at `DISCOVERED` / `T4_COMMUNITY_SIGNAL` |
| lifecycle state is persisted | append-only `history`, `verifyAppendOnly` |
| trust tier uses existing vocabulary | `DISC-G01` compares the tier list verbatim |
| official/community distinction preserved | `DISC-G07`, `DISC-G08` |
| candidate material cannot override canon | `DISC-G17`, `DISC-G18` |
| executable content cannot activate from mutable discovery | `DISC-G14` |
| sandbox has no DIAL credentials | `DISC-G12` |
| exact-version provenance required before activation | `DISC-G14`, `DISC-G15` |
| admitted material enters the existing registry path | `projectAdmissionRows` |
| stale/superseded handled deterministically | `freshnessStateFor`, boundary tests |

### The acceptance demonstration, and its honest limit

`microsoft/playwright-mcp` is a real engineering resource absent from the admitted
corpus — `official.playwright` exists as a T1 source but carries no `MCP_SERVER`
resource. It was registered as a discovery candidate.

Its provenance could **not** be verified from this client. Outbound GitHub reads
are scoped to `Vanguduza/dial-new`, so `api.github.com/repos/microsoft/playwright-mcp`
returns a scope refusal rather than repository metadata. `official_publisher_verified`
is therefore `false`, and the fail-closed tier rules placed the candidate at
`T4_COMMUNITY_SIGNAL`:

```json
{ "id": "DISC-7c056c35b85bd3ad8b3c8dfc", "state": "DISCOVERED",
  "tier": "T4_COMMUNITY_SIGNAL",
  "why": ["adapter=GITHUB_SEARCH", "adapter_max_tier=T4_COMMUNITY_SIGNAL"] }
```

That is the correct outcome, not a gap. Verifying it and advancing it through
triage requires a discovery adapter run with outbound access, which is an Oracle
action. Executable trials remain disabled by feature flag.

---

## Phases 4–6 — Guided generative frontend

`node agent-system/orchestration/guided-design-architecture-check.mjs` → **34/34**.

### Backward compatibility, measured

The gate imports `HEAD`'s copy of each modified module and compares output:

| Module | Comparison | Result |
| --- | --- | --- |
| `design-authority-projector.mjs` | all 4 provenance modes | byte-identical, hashes included |
| `design-provider-router.mjs` | 96 input combinations | identical |
| `design-candidate-admission.mjs` | quarantine, manifest, admission, failure path | identical |

`tests/orchestration-adaptive-execution.test.mjs`, the existing consumer of these
modules, passes unchanged (14 tests).

### §17.2 acceptance

All twelve criteria are covered by `tests/orchestration-guided-design.test.mjs`.
The certification exercise runs a **real Dial a Spare Android home screen** against
the live `FEATURE_REGISTRY` (`SPARE-F001`, `SPARE-F002`) and the live
`FRONTEND_COMPONENT_REGISTRY`: three materially different EXPLORE candidates with
zero semantic drift, all seven critics passing, convergence, owner freeze,
then a faithful reconstruction passing parity and an "improved" one failing it on
`LOCKED_DIMENSION_DEVIATION:composition`, `LOCKED_DIMENSION_DEVIATION:section_order`
and `DESIGN_TOKEN_DRIFT:spacing` **while remaining functionally complete**. That
last assertion is the one §17.2 actually asks for.

**Not done:** no live Stitch call was made. Provider routing, qualification and the
outage fallback are implemented and tested; live provider qualification is gated on
`DESIGN_PROVIDER_POLICY.json` evidence that this client cannot produce.

---

## Phases 7–10 — n8n runtime fabric

`agent:n8n-dev:qualification` → **43/43**. `agent:n8n-prod:qualification` → **43/43**.

All eight §13 n8n negative cases are induced in `tests/orchestration-n8n-runtime.test.mjs`:
duplicate delivery, a dev/prod credential share, an unapproved node, an arbitrary
host, direct money-state mutation, a version change without promotion, a transient
dependency failure, and an irreversible effect retried without an idempotency key.

**Not done:** neither estate is running. `deploy/n8n/{dev,prod,shared}/` carries
pinned, isolated deployment descriptors and the contract is qualified, but a
repository check cannot observe a VM. The qualification reports the live estate as
`UNVERIFIED_FROM_REPOSITORY` rather than inferring it, and both estates ship behind
feature flags that default to `false`. Standing them up is an Oracle/owner action,
as is the §7.15 production pilot set.

---

## Phase 13 — Gates induced to fail

A gate whose failure has not been induced is not known to work. Each was broken
deliberately and restored:

| Probe | Result |
| --- | --- |
| `T0_DIAL_PROJECT.open_world_assignable` → `true` | `DISC-G02` failed |
| remove `DONOR_BRAND_AUTHORITY` from the enforced baseline | `loadDesignAntiPatterns` threw; gate failed |
| allow `CODE_EXECUTION` in the PROD estate | `N8N-RT-G04`, `N8N-RT-G05`, `N8N-RT-G07` failed |

Three further gates were observed failing naturally during implementation and then
made to pass: `DISC-G24` / `GDES-G33` / `N8N-RT-G42` before their test suites
existed, the manifest gate on four undeclared documents, and `agent:vekl:unit-check`
on a changed Development Unit hash.

That last one is worth recording as a root cause rather than a symptom. The
derived registry changed because `project_truth_hash` and
`technical_stack_fingerprint` moved — `DECISION_LOG.json` is an `AUTHORITY_PATHS`
member and `package.json` feeds the stack fingerprint. Both changed under this
authorization; `package-lock.json` did not change. The derived registry, the
manifest and the scorecard were regenerated with their own tooling, never by hand.

---

## Phase 11 — Control-plane requalification

| | Value |
| --- | --- |
| Baseline fingerprint | `1951e5bbd1fa42b63c15ef27d2dec4edcb9187e9e067c137853b0d7d1e36ded7` |
| New fingerprint | `d8a42311b67b76a92fa1b0a862148f05415f4e7fd27b1c11f5b96466f8c4e585` |
| `agent-system/orchestration` | `902baf40…` → `f7e30211e4094b5014a0552543874f33abeee741` |
| `agent-system/engineering-knowledge` | `3102cdbc…` → `331066b6a6f5572ba197b7b135f45819930a476e` |
| `deploy/oracle/hermes-codex` | unchanged (`c0f50092…`) |

The fingerprint changed, so prior external qualification is invalid until the
Oracle requalifies it. **No agent may conclude "development ready" from tests
alone while the external gate rejects the changed fingerprint (§12), and this
document does not.** The Oracle snapshot at implementation time read
`DEVELOPMENT_BLOCKED`, gate `PRODUCTION_GREEN`, failing on
`qualified_control_plane_unchanged`. Requalification is an Oracle/owner action
this client cannot perform.

---

## Provider-neutral harvest and bounded research loop

The original Union Alpha evidence and exact provider lineage remain preserved. New
execution uses `PROVIDER_NEUTRAL_CREDENTIAL_GATED`: Groq is inactive until both an
approved credential reference and credential material exist, and no key material is
returned in status or artifacts. The neutral `dial_research_harvest_*` control tools
drive the worker; the former `dial_union_alpha_research_*` names remain compatibility
aliases and do not fabricate or relabel historical results.

The autonomous analysis surface exposes only nine bounded MCP actions over one
immutable DU packet at a time. It rejects arbitrary SQL and Project Truth mutation,
requires owned unexpired leases and idempotency keys, validates citations and source
hashes before persistence, and binds its fixed-statement store to authoritative VEKL
PostgreSQL on `vekl-worker` rather than Hermes. Tool schemas reject undeclared input.

The regenerated harvest manifest contains **309 Development Units and all 18 named
research roles**. No Groq request was made because no approved credential was supplied;
this is the required fail-closed state, not evidence of a completed harvest.

---

## Verification

| Suite | Result |
| --- | --- |
| `tests/orchestration-vekl-discovery.test.mjs` | 53 passed |
| `tests/orchestration-guided-design.test.mjs` | 58 passed |
| `tests/orchestration-n8n-runtime.test.mjs` | 87 passed |
| `tests/orchestration-vekl-research-harvest.test.ts` | 10 passed |
| `tests/orchestration-vekl-research-loop.test.mjs` | 3 passed |
| **new workstream total** | **211 passed** |
| `tests/orchestration-adaptive-execution.test.mjs` (existing consumer) | 14 passed |
| `tests/orchestration-chat-control.test.mjs` (neutral tool integration) | 8 passed |

`npm run verify` reaches `npm run test` with every gate green, including the four
new ones. The suite result matches the baseline, and so does the vitest worker RPC
exit code described in Phase 0.

---

## §27 mission checklist

| Item | State |
| --- | --- |
| Repository baseline recorded | done |
| DEC records created | done, `PROPOSED` pending owner lock |
| Open-world discovery lifecycle | done |
| T0–T4 trust model preserved | done |
| Candidate/admitted graph boundary proven | done |
| Executable sandbox proven isolated | done (contract; trials flag-disabled) |
| Exact-version executable admission proven | done |
| Provenance/iteration collision eliminated | done |
| Donor checks remain green | done |
| Existing prohibited patterns preserved | done |
| Screen Quality Packet | done |
| Multi-candidate design generation | done |
| Critics | done |
| Convergence | done |
| Visual authority promotion remains governed | done |
| Real Dial a Spare home-screen certification | done against live registries; no live provider call |
| VEKL n8n corpus distinguished from runtime | done |
| DIAL_N8N_DEV running and qualified | **contract qualified; not running** |
| DIAL_N8N_PROD running and qualified | **contract qualified; not running** |
| Node/security policies reuse existing knowledge | done |
| Event contract | done |
| Idempotency proven | done |
| Retry/dead-letter behaviour proven | done |
| Dev/prod secret isolation proven | done (declaratively; no live estate) |
| Low-risk product pilots passed | **not started — requires a running estate** |
| Full npm verification green | gates green; baseline vitest exit artifact unchanged |
| Negative tests evidenced | done |
| Control-plane fingerprint requalified | **fingerprint recomputed; Oracle requalification outstanding** |
| External orchestration gate accepts new state | **outstanding — Oracle/owner action** |
| Implementation evidence committed | this document |

Rev 3.1 is complete only when every line above is done. Five are not, and each
names what it is waiting on. Passing code tests alone is insufficient (§27), and
this document does not claim otherwise.

---

## Phase 14 — Semantic merge and provider-neutral research execution

The integration with GPT-SOL research harvest preserves the original contract rather than
relabelling absent work: 309 Development Units, 17 dimensions (5,253 coverage cells), all 18
roles, the historical `stealth/union-alpha` binding and its closed-window blocking state, and
the existing `knowledge/research/union-alpha/` artifact namespace. No Union Alpha result was
created or inferred during this merge.

New execution is provider-neutral behind `research-provider-router.mjs`. Groq is selected only
when both an unexpired `APPROVED` credential-approval artifact and configured credential are
present; a key alone is insufficient and credential material is never returned in status or
evidence. The bounded research loop exposes only leased/idempotent DU actions, validates public
sources and claims before persistence, prohibits arbitrary SQL and Project Truth mutation, and
binds PostgreSQL persistence to the authoritative VEKL database on `vekl-worker`.

Focused merge verification:

| Command | Result |
| --- | --- |
| `npm run test:vekl-research` | 10 passed; includes 309/5,253/18 invariants and Groq credential gating |
| `npm run test:vekl-research-loop` | 3 passed |
| `npm run test:vekl-discovery` | 53 passed |
| `npm run test:guided-design` | 58 passed |
| `npm run test:n8n-runtime` | 87 passed |
| `npm run test:aef` | 17 passed after deterministic DU registry regeneration |
| `npm run agent:vekl:unit-check` | 309 units; expected and actual registry hashes identical |
| `npm run agent:decision-evolution:check` | locked decisions preserved; DEC-036..038 appended |

`npm run typecheck` also passes after marking the native-ESM frontend test as intentionally
untyped, consistently with the existing orchestration test convention. The focused checks do
not by themselves represent external Oracle/runtime qualification.
