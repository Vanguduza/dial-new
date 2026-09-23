# VAN Development Control Centre — Design & Logic (finalised in DIAL)

**Spec ID:** `VAN-DEVCC-R1`
**Parent pack:** `DIAL-HERMES-ORCA-MULTI-HARNESS-DDP-R3` §6 (owner decision OD-C: design and logic finalised in DIAL, built in VAN)
**VAN reference:** `Vanguduza/van@61d86cd` (read-only survey 2026-09-23). Every VAN path below was read at that commit.
**Implementation home:** VAN repository, as `VAN-DEV-*` units in VAN's own Development Pack. VAN's Project Truth protocol, `AUTHORITY_MAP.yaml` and design gates V1–V8 apply there. This file is the contract the VAN work implements.

---

## 1. Constraints taken from VAN (not negotiable here)

| VAN rule | Source | Consequence for this design |
|---|---|---|
| 8 destinations; "Removed: the flat 17-module grid" | `docs/design/VAN_PRODUCT_DESIGN_DNA.md` §4 | Rev 1's 17 screens become **routes inside the existing IA**, mostly one hub under **Work**. No new primary destination. |
| Seven-state contract: LOADING, CONTENT, EMPTY, ERROR, DEGRADED, OFFLINE, STALE | DNA §5; `design/ScreenState.kt:16-41` | Every route renders all seven through `VanScreen<T>`, and V6 preview renders prove it. |
| Live data only; each panel declares `@DataSource(...)`; no fixture path in production | DNA §5, V5; `projects/ProjectsRoute.kt:39-46` | Every panel below names its `@DataSource`. |
| Tokens only, no inline hex, nothing under 12sp; motion 80/160/240/360 ms, reduced motion → 0 | DNA §2, V2, V4; `design/VanTokens.kt:224-250` | No new tokens. Graph edges and nodes use existing roles. |
| Status colour via role names (`monitor`, `engaged`, `cognition`, `hypothesis`, `eventRisk`, `favourable`, `deteriorating`, `critical`, `disabled`), exhaustive `when`, no `else` | `design/StatusSemantics.kt` | §4 gives the exhaustive state → role mapping. |
| Hermes profile `van` is the sole VAN agent runtime; Android and gateway form no independent agent loops | `docs/SECURITY_POLICY.md:17-20` | VAN only **displays** DIAL state and **forwards typed owner commands** to DIAL Hermes. VAN-Hermes never plans or executes DIAL work. |
| Mutations need ingress token + device token + hardware device proof | `backend/van_gateway/app.py:1195-1293`; `VanGatewayClient.postProved:1329` | Every dev action goes through `postProved`. |
| Upstream secrets never reach Android | ARTEMIS console pattern, `artemis/console.py:176-182`; `tests/contracts/test_artemis_console_boundary.py` | The DIAL projection credential lives in a VAN backend token file only; a contract test greps Android for it. |

Not reused: the ARTEMIS console's WebView reverse-proxy model (`command/artemis/ArtemisConsoleRoute.kt`). It suits embedding an existing web console. The Development Control Centre is native: typed reads, typed actions, seven-state screens.

**ARTEMIS is not a VAN component.** It is DIAL's Android app testing harness (`google/artemis` on `dial-control`, under Hermes; Rev 3 §5a). The existing `work/artemis` route is only an owner console window onto it. It stays as is and is linked from task detail when a task has Android verification.

---

## 2. Information architecture

### 2.1 Rev 1 screens → VAN routes

| Rev 1 screen | VAN placement | Route |
|---|---|---|
| Development Home | Work → Development hub | `work/dev` |
| Projects | hub project switcher + existing Projects detail gains a "Development" section | `work/dev?project={id}`, `projects/{projectId}` |
| Stage Plan | hub child | `work/dev/{projectId}/plan` |
| TODO / Dependency Graph | hub child, two tabs | `work/dev/{projectId}/tasks?view={view}`, `work/dev/{projectId}/graph` |
| Task (TODO record) | detail | `work/dev/tasks/{taskId}` |
| Active Agents | hub child | `work/dev/agents` |
| Orca Workspaces | hub child + detail | `work/dev/workspaces`, `work/dev/workspaces/{workspaceId}` |
| Research / VEKL | hub child | `work/dev/research` |
| Frontend / Design | hub child | `work/dev/design` |
| Android Testing | existing owner console onto DIAL's ARTEMIS harness (no new VAN build) | `work/artemis` (+ ARTEMIS verification rows inside task detail, from the projection) |
| Build / CI | hub child | `work/dev/ci` |
| Security | hub child | `work/dev/security` |
| Reviews | hub child | `work/dev/reviews` |
| Memory / Handoffs | hub child (not VAN's personal Memory destination) | `work/dev/memory` |
| Approvals | **Attention** destination, source `dial-dev` | `attention` (filtered) |
| Blockers | **Attention** + tasks view | `attention`, `work/dev/{projectId}/tasks?view=blocked` |
| Evidence | detail | `work/dev/evidence/{evidenceRef}` |
| Infrastructure | **Connected** destination, new "DIAL development fabric" section | `connected` |

`VanRoute.kt` gains these as constants and templates, `PARENTS` maps every `work/dev/**` to `work`, and deep links use `van://work/dev/...`. `ALL_TEMPLATES` and the nav tests (V1) cover them.

### 2.2 Why Approvals and Blockers live in Attention

VAN already has one triage surface, with severity INFO / FOLLOW_UP / BLOCKER / URGENT, deduplication and snooze (`attention/engine.py`). A second approvals list would split the owner's "needs me" view in two. DIAL owner decisions and blockers are ingested as attention items:

```text
source      = "dial-dev"
project_id  = <DIAL project id>
dedupe_key  = "dial-dev:" + <kind> + ":" + <task_id or decision_id> + ":" + <projection_revision_of_origin>
severity    = WAITING_OWNER approval → FOLLOW_UP; blocker on critical path → BLOCKER;
              security/money/health finding or lease-bypass alert → URGENT
payload     = { task_id, kind, deep_link: "van://work/dev/tasks/<id>" }
```

Resolving an approval opens the existing `ApprovalSheet` and submits a typed action (§5). The attention item closes only when the **projection** shows the decision applied, never on tap.

---

## 3. Data contract — DIAL Development Projection API v1

Served by DIAL on `dial-control`, bound to the WireGuard address only (`10.77.0.1`), read-model over Stage Graph, ActiveWorkGraph, SPMRF, lease index, review/receipt stores and the Orca adapter (HOT-DU-008). VAN's backend is the **only** client. Android never calls DIAL.

### 3.1 Envelope (every response)

```json
{
  "projection_revision": "sha256:…",
  "observed_at": "2026-09-23T16:40:00Z",
  "sources": {
    "project_truth_hash": "…", "stage_plan_revision": 12, "active_work_graph_revision": 481,
    "spmrf_cursor": "…", "lease_index_revision": 207, "orca_runtime_id": "…"
  },
  "freshness_ms": 1800,
  "degraded": [ { "subsystem": "OPENVIKING", "effect": "semantic recall unavailable", "still_works": ["tasks","workspaces","evidence"] } ],
  "data": { }
}
```

VAN mapping: `degraded[]` non-empty → `ScreenState.Degraded(rows, data)`. `freshness_ms` > the route's stale threshold (default 30 s; workspaces 10 s) → `ScreenState.Stale(ageMs, content)` with `LiveBadge`. VAN never fills gaps with local guesses (Rev 1 HOT-E2E-12).

### 3.2 Read endpoints

| Endpoint | Returns |
|---|---|
| `GET /v1/dev/projects` | admitted DIAL projects, classification, FORENSIC_BUILD_READY state, current stage |
| `GET /v1/dev/projects/{p}/home` | aggregate for `work/dev` (§6.1) |
| `GET /v1/dev/projects/{p}/stage-plan` | stages (id, applicable, state, dependencies, required evidence, owner actions, external blockers), plan fingerprint |
| `GET /v1/dev/projects/{p}/tasks?view=` | task list for a view: `now`, `next`, `in_progress`, `needs_me`, `blocked`, `review`, `failed`, `completed`, `all` (Rev 1 §16.3) |
| `GET /v1/dev/projects/{p}/graph` | nodes (task id, state, stage) and edges (dependency) for the stage plan revision |
| `GET /v1/dev/tasks/{taskId}` | full TODO record (Rev 1 §16.3) + timeline of progress events + lease + workspace + evidence refs |
| `GET /v1/dev/agents` | ActiveWorkGraph slice: actor, harness, model, host, objective, intent, owned paths, heartbeat, next action |
| `GET /v1/dev/workspaces[/{id}]` | Orca workspace list/detail: worktree, branch, lease, terminal state, test state, diff stats, last checkpoint |
| `GET /v1/dev/workspaces/{id}/diff` | unified diff, size-bounded, paths only when above the bound |
| `GET /v1/dev/workspaces/{id}/terminal-tail?lines=` | last ≤ 200 lines, **secret-screened** with the SPMRF screening patterns; read-only |
| `GET /v1/dev/reviews`, `/memory`, `/research`, `/design`, `/ci`, `/security` | per hub child (§6) |
| `GET /v1/dev/evidence/{ref}` | evidence record: kind, checkpoint SHA, command, result, admission state |
| `GET /v1/dev/infrastructure` | Hermes, manager slots, Orca (version, drift, daemon scope), SPMRF, OpenViking, VEKL, ARTEMIS, capability ladder per tool, Oracle gate |
| `GET /v1/dev/events` (SSE) | `{projection_revision, changed: ["tasks","workspaces",…]}` so VAN refetches only what changed |

### 3.3 Action endpoint

`POST /v1/dev/actions`

```json
{
  "action": "PAUSE_TASK_SAFE",
  "target": { "project_id": "dial-development-system", "task_id": "HOT-DU-021" },
  "params": {},
  "idempotency_key": "uuid",
  "expected_projection_revision": "sha256:…",
  "owner_device_proof_ref": "…"
}
```

Response `202 { action_id, state: "ACCEPTED" }`, then the action's state appears in the projection as `ACCEPTED → APPLIED | REJECTED(reason) | SUPERSEDED`.

| Action | Maps to DIAL typed control | Notes |
|---|---|---|
| `STEER_TASK` (guidance text) | `dial_owner_steer`, scoped to task | Hermes relays guidance into the worker at a safe boundary. VAN never sends raw terminal input. |
| `PAUSE_TASK_SAFE` / `RESUME_TASK` | typed pause/resume | Resume creates a new terminal on the same worktree/lease (Rev 3 §4.2) |
| `REQUEST_CHECKPOINT` | Hermes checkpoint request | |
| `REQUEST_REVIEW` | Review Fabric request | Reviewer ≠ author enforced by DIAL |
| `REVOKE_TASK` | lease revoke + terminal stop | Destructive: `ApprovalSheet` with typed confirmation |
| `DECIDE` (approve/reject + reason) | owner decision record | From Attention |
| `PAUSE_MISSION` / `RESUME_MISSION` | typed mission controls | Resume = the persistent Oracle mission, never a local loop |
| `REPRIORITISE` (owner priority) | owner steer → Stage Graph recompile | Shown as "plan recompiling" until the new revision lands |

Rules: `expected_projection_revision` mismatch → `409 STALE_VIEW`, and VAN refetches and shows the new state before the owner retries. Idempotency keys make retries safe. Nothing is marked done by VAN; the projection decides.

### 3.4 VAN backend proxy

New package `backend/van_gateway/dial_dev/` mounted in the FastAPI app factory:

- config `VAN_DIAL_DEV_ENABLED`, `VAN_DIAL_DEV_BASE_URL` (WireGuard address of `dial-control`), `VAN_DIAL_DEV_TOKEN_FILE`, `VAN_DIAL_DEV_TIMEOUT_S`;
- GET routes: owner device auth (ingress + device token); POST `/v1/dial-dev/actions`: `requires_device_proof`;
- forwards with the DIAL-scoped credential read from the token file, never returned to Android;
- attention ingestion worker: consumes `/v1/dev/events`, upserts attention items per §2.2;
- `AUTHORITY_MAP.yaml` subjects: `dial_dev.projection_proxy`, `dial_dev.action_forwarder`, `dial_dev.attention_ingest` (owner DIAL, implemented_by VAN gateway, tested_by the tests in §8).

Error mapping to Android: DIAL unreachable → 503 `dial_dev_unavailable` → `ScreenState.Error(canRetry)`. DIAL reports degraded → 200 with `degraded[]` → `Degraded`. Android offline → `Offline(queuedCount)`, where only **read refresh** is queued. Owner actions are never queued offline; they require a live projection revision.

---

## 4. State → VAN semantics (exhaustive)

| DIAL task/stage state | `MissionStatus` | Status role | Caption |
|---|---|---|---|
| `NOT_APPLICABLE` | — (hidden in lists) | `disabled` | Not applicable |
| `BLOCKED` | `WAITING` | `deteriorating` | Blocked · {first blocker} |
| `READY` | `WAITING` | `monitor` | Ready |
| `RUNNING` | `RUNNING` | `engaged` | Running · {harness}/{model} |
| `WAITING_OWNER` | `WAITING` | `eventRisk` | Needs you |
| `WAITING_EXTERNAL` | `WAITING_EXTERNAL` | `hypothesis` | Waiting · {external} |
| `VERIFYING` | `RUNNING` | `cognition` | Verifying |
| `PASS` | `DONE` | `favourable` | Passed · evidence admitted |
| `FAIL` | `FAILED` | `critical` | Failed |
| `INVALIDATED` | `FAILED` | `deteriorating` | Invalidated · plan changed |
| `SUPERSEDED` | `DONE` | `disabled` | Superseded |
| Completion candidate (agent said done, not admitted) | `RUNNING` | `cognition` | **Claimed done · verifying** (never shown as passed) |

A JVM test asserts this table (V3), with no `else` branch.

Embodiment (DNA §6): VAN's avatar reflects VAN's own state, not DIAL's. The only binding is WAITING_FOR_OWNER / CAUTION when a `dial-dev` attention item is open, which Attention already produces.

---

## 5. Interaction rules

- **No optimistic success.** After an action the row shows `ACCEPTED · pending` (`LiveBadge`) until the projection revision reflects `APPLIED`; `REJECTED` shows the reason inline with retry where valid.
- **Destructive actions** (`REVOKE_TASK`, reject decision) use `ApprovalSheet` with the consequence stated from projection data ("Revokes lease L-207; 3 uncommitted files in worktree will be quarantined").
- **Steer** opens a text sheet with the task's current intent and next action shown above the input, so the owner steers against current state.
- **Terminal tail** is read-only, monospace, bounded, and marks redacted spans. There is no input box anywhere in VAN for Orca terminals.
- **Diff** shows file list first, then per-file hunks on demand, size-bounded.
- **Graph** is navigable by list first (accessibility), with the graph canvas as an optional visual. Every node is reachable by TalkBack via the list.

---

## 6. Screen specifications

All screens use `VanScreen<T>` and the components in `docs/design/COMPONENT_CATALOGUE.md`.

### 6.1 `work/dev` — Development Home
`@DataSource("GET /v1/dial-dev/projects")`, `@DataSource("GET /v1/dial-dev/projects/{p}/home")`
- Header: project switcher; readiness chips: FORENSIC_BUILD_READY, Oracle gate, runtime slots (`StatusChip`).
- `MetricTile` row: READY, running, blocked, needs you, in review.
- "Now": in-progress tasks (≤ 5) with harness/model, heartbeat age, next action.
- "Needs you": top 3 `dial-dev` attention items → deep link.
- "Latest": last checkpoint, last CI/runtime evidence (`EvidenceRow`).
- Health strip: Hermes, Orca, SPMRF, OpenViking, VEKL (`StatusChip`, tap → `connected`).
- EMPTY: "No admitted DIAL projects yet." DEGRADED: from `degraded[]`.

### 6.2 `work/dev/{projectId}/plan` — Stage Plan
`@DataSource("GET /v1/dial-dev/projects/{p}/stage-plan")`
- `TimelineRail` of STG-00…STG-21 with state role, applicability, required-evidence count, external blockers.
- Stage detail sheet: dependencies, artifacts, evidence, owner actions.
- Plan fingerprint and revision in the footer. "Recompiling" banner while an owner reprioritisation is `ACCEPTED` but not `APPLIED`.

### 6.3 `work/dev/{projectId}/tasks?view=` and `/graph` — TODO and dependencies
`@DataSource("GET /v1/dial-dev/projects/{p}/tasks")`, `@DataSource("GET /v1/dial-dev/projects/{p}/graph")`
- Segmented views: Now · Next · In Progress · Needs Me · Blocked · Review · Failed · Completed · All.
- Row: title, DU, stage, state caption (§4), why-now line, assigned harness/model/host, heartbeat age.
- Graph tab: dependency list with expand/collapse; canvas view optional; critical path highlighted with the `engaged` role.

### 6.4 `work/dev/tasks/{taskId}` — Task detail
`@DataSource("GET /v1/dial-dev/tasks/{taskId}")`
- Every Rev 1 §16.3 field, grouped: Objective & why-now · Execution (executor, harness, model, host, Orca workspace, lease, started, heartbeat) · Plan (planned next action, expected postcondition, dependencies) · Verification (required checks, results, reviewer) · Blockers & owner action · Evidence.
- `TimelineRail` of progress events (CONTEXT_LOADED … COMPLETION_CANDIDATE).
- Actions: Steer, Pause safely, Resume, Request checkpoint, Request review, Revoke.
- Links: workspace, evidence, `work/artemis` when an Android verification exists.

### 6.5 `work/dev/agents` — Active Agents
`@DataSource("GET /v1/dial-dev/agents")`
- One card per active actor: objective, **intent** (expected paths/commands/tests), owned paths, next action, heartbeat, blockers. This is the "everyone knows what everyone is doing" view (Rev 1 §09.10).
- Overlap warnings are shown when intents' path sets approach each other; the lease system prevents actual overlap.

### 6.6 `work/dev/workspaces` and `/{workspaceId}` — Orca Workspaces
`@DataSource("GET /v1/dial-dev/workspaces")`, `…/{id}`, `…/{id}/diff`, `…/{id}/terminal-tail`
- List: workspace, task, harness/model, host, branch, status, lease, last activity, tests, diff stats, last checkpoint.
- Detail tabs: Overview · Diff · Terminal (read-only tail) · Evidence.
- Actions (§3.3): Steer, Pause safely, Resume, Checkpoint, Review, Revoke. There is no raw Orca control.

### 6.7 `work/dev/reviews`
Review jobs: checkpoint, author vs reviewer harness, blocking findings (`FindingCard`), claims verified/rejected, recommendation. The recommendation is labelled "does not advance the gate".

### 6.8 `work/dev/memory` — Memory / Handoffs
Shared-memory cursor, latest checkpoint, active handoff, OpenViking projection cursor and health, candidates awaiting admission, recent admitted decisions/failures, context freshness. Admission itself is not an owner tap here: DIAL admits. Owner decisions arrive through Attention.

### 6.9 `work/dev/research`, `/design`, `/ci`, `/security`
- Research: VEKL activations per task, forecast for next packets, research jobs, Knowledge Resolution Trace refs.
- Design: Screen Registry × Feature Graph coverage, FDEP/Stitch candidates, Visual/Experience Authority state, open design-change requests.
- CI: latest runs per branch/SHA with result and evidence link.
- Security: open findings by severity, specialist review state, mutation-suite status (Rev 1 §31 + Rev 3 §8).

### 6.10 `work/dev/evidence/{ref}` — Evidence
Kind, checkpoint SHA, exact command, result, reproduced-by, admission state and authority. Rendered with `EvidenceRow`; raw payloads stay in DIAL.

### 6.11 `connected` — DIAL development fabric section
Per capability: ladder state `INSTALLED → AUTHENTICATED → LIVE_QUALIFIED → ORCHESTRATED → INTEGRATED`, version/pin, last probe. Orca shows version, drift, daemon scope and bind. The manager chain shows each slot's qualification. The Oracle gate shows state and failed checks.

---

## 7. VAN-DEV units (for VAN's Development Pack)

| Unit | Scope | Depends on (DIAL) |
|---|---|---|
| VAN-DEV-001 | `dial_dev` backend proxy + config + authority-map subjects + boundary contract test | HOT-DU-008 |
| VAN-DEV-002 | Attention ingestion (§2.2) | 001 |
| VAN-DEV-003 | Routes, nav, deep links, `PARENTS` (§2.1) + V1 tests | — |
| VAN-DEV-004 | State mapping (§4) + JVM tests | — |
| VAN-DEV-005 | `work/dev` home + project switcher | 001, 003, 004 |
| VAN-DEV-006 | Stage Plan + Tasks + Graph + Task detail | 005 |
| VAN-DEV-007 | Active Agents + Workspaces (diff, tail) | 005 |
| VAN-DEV-008 | Reviews, Memory, Research, Design, CI, Security, Evidence | 005 |
| VAN-DEV-009 | Typed actions + ApprovalSheet flows + STALE_VIEW handling | 001, 006, 007 |
| VAN-DEV-010 | Connected: DIAL fabric section | 001 |
| VAN-DEV-011 | V6 seven-state previews for every route, V7 accessibility, V8 coherence evidence | all |

---

## 8. Verification (VAN side)

- Contract (like `test_artemis_console_boundary.py`): Android source contains no DIAL address, port or token; all dev traffic goes through `/v1/dial-dev/*`.
- Backend: GET requires owner device auth; POST requires device proof; the DIAL credential never appears in responses; `409 STALE_VIEW` is passed through unchanged.
- Attention: dedupe per §2.2; closes only on projection `APPLIED`.
- JVM: §4 mapping exhaustive; action state machine never reaches a PASS caption without projection `PASS`.
- V6: all seven states rendered per route in `visual-preview`.
- E2E (with DIAL HOT-DU-048): owner pauses a task from VAN → DIAL shows `APPLIED` → worker stops at a safe boundary → VAN reflects it without local fake status; VAN reconnect rehydrates the identical projection revision (Rev 1 HOT-E2E-12).
