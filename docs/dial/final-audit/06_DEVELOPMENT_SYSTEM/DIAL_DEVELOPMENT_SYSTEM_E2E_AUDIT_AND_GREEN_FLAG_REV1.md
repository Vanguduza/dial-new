# DIAL Development System — End-to-End Audit and Green-Flag Certification, Rev 1

**Audited commit:** `62eb71274c042ac02e61dedeb3f62c4c60d2e479` (`master`, merge of PR #30, 2026-09-14T18:52Z)
**Audit branch:** `claude/dial-e2e-audit-green-flag-hqqlyw`
**Audit date:** 2026-09-14
**Audit client:** Claude Code Remote provider container (x86_64, 4 vCPU, 15 GB, no SSH keys, no systemd, no Codex/Hermes binaries)
**Authority of this document:** `NO_AUTHORITY` for Project Truth. It records evidence and recommendations. Every recommended canonical change is marked `OWNER_DECISION_REQUIRED`.
**Machine-readable companion:** `DIAL_DEVELOPMENT_GREEN_FLAG.json`, `DIAL_DEVELOPMENT_SYSTEM_GAP_REGISTER.json`, `DIAL_DEVELOPMENT_SYSTEM_TRACEABILITY.json`, `evidence/`.

---

## 1. Executive summary

DIAL's development system in the repository is substantially real: a locked Hermes runtime chain, a persistent external orchestrator with a fail-closed development gate, a typed multi-channel operator gateway, VEKL 2.2 with deterministic Units, GraphRAG, capsules, immutable traces and stale-context refusal, an adaptive execution fabric, governed external capabilities, and an owner-authority Project Truth guard. All 29 repository verification gates and 651 unit tests pass on the audited commit, and CI is green on it.

What is **not** proven is the live system. The Oracle status mirror is fifteen hours stale. It reports the root mission `BLOCKED_OWNER` since 2026-09-08, the development gate `DEVELOPMENT_BLOCKED` with the failed check `qualified_control_plane_unchanged`, and an Oracle checkout eighteen commits behind master. Codex, Claude and Hermes authentication on the control host could not be probed from this client. The owner's intended three-node topology (`dial-hermes-control`, `vekl-worker`, `oracle-admin`) exists only on four mutually divergent unmerged lineages; canonical master has one host and, before this branch, no host-role guard at all.

This branch delivers a deterministic bootstrap and certification system (`ops/development-bootstrap/`) that converges hosts to a declared manifest, enforces host roles fail-closed, probes authentication benignly, drives a read-only owner-instruction-to-owner-response self-test with one correlation id, proves decision determinism across runs, injects nine controlled faults, dispatches sealed worker jobs, and writes the machine-readable readiness report. It also repairs two test suites that master never executed and fixes the latent failing assertion inside one of them.

## 2. Final verdict

```text
RED — DIAL DEVELOPMENT SYSTEM NOT YET GREEN — BLOCKERS REMAIN
```

Green-flag conditions met: **25 of 35** (see §22). Four P0 blockers remain (§19), all of them live-host or owner-decision gates that cannot be closed from a provider container and were not manufactured by this audit.

## 3. Authority baseline

| Tier | Source | Finding |
|---|---|---|
| 1 Owner | Mission brief (this session) | Treated as hypotheses; reconciled below |
| 2 Project Truth | `PROJECT_CANONICAL_STATE.json` (schema 2): repository `Vanguduza/dial-new`, canonical integration branch `master`, six required ancestors, seven locked authorities; `PROJECT_TRUTH_PROTOCOL.md`; `OWNER_AUTHORITY_POLICY.json`; `agent-system/registries/DECISION_LOG.json` DEC-001…DEC-032 (all LOCKED) | Identifiable and internally consistent |
| 3 Implementation | 284 commits after unshallow; all six required ancestors are ancestors of HEAD (`git merge-base --is-ancestor`, six times rc=0) | Canonical lineage verified |
| 4 Live | `dial_oracle_status` MCP (mirror branch `oracle-runtime-status`) | Available, **not fresh** (age 967–979 min) |
| 5 History | 21 remote branches, 15 PRs | Used for discovery only |

Note: the initial clone was shallow (117 commits, single branch). The required-ancestor check reported UNVERIFIED until `git fetch --unshallow`; the bootstrap now detects shallow clones and says so instead of failing.

## 4. System architecture (as implemented on master)

```text
Owner
  ├─ Claude Code / Codex (consoles) ─ typed dial_* stdio MCP (operator-control-stdio.mjs)
  ├─ WhatsApp self-chat / Meta Cloud ─ adapters ─┐
  └─ read-only mirror: dial-oracle-status MCP    │
                                                 ▼
                    chat-control-bridge.mjs (127.0.0.1:9130, bearer 0600) — 21 dial_* tools, no shell
                                                 │
                    owner-steering-broker.mjs (safe-boundary steers) ── mission-controller.mjs (dial-development-root)
                                                 │
                    external-orchestrator.mjs — /var/lib/dial-control/work-queue — development gate (fingerprint-pinned)
                                                 │
                    hermes-runtime-executor.mjs — Codex App Server gpt-5.6-sol → Claude Code claude-sonnet-5 → fail closed
                                                 │
                    engineering-knowledge-broker.mjs (VEKL 2.2) → admission guard → Task Execution Envelope → HCX workers
                                                 │
                    DIAL repository + 29 deterministic verify gates + Project Truth guard + CI
```

Everything runs on **one Oracle Always Free Ampere host** (the prose name `dial-hermes-control`), as 15 systemd *user* units generated by heredoc installers under `deploy/oracle/hermes-codex/`. There is no Docker, no second host, and no host-role enforcement in canonical code.

## 5. Development lifecycle (owner → code → owner)

Traced boundary by boundary (bootstrap self-test, `evidence/bootstrap-self-test-20260914.json`, 12 stages, one correlation id):

1. **Owner instruction** — provenance envelope (channel, actor, SHA-256, authority class). Read-only requests are `NO_AUTHORITY`.
2. **Hermes intake** — typed packet persisted outside the worktree (`work-queue/inbox`).
3. **Project identification** — hard-bound to `dial`; `project_truth_hash` over seven authority paths.
4. **Role guard** — host must be allowed `VEKL_RESOLVE`.
5. **VEKL resolution** — real broker: Unit `DU-LIN-d4d39547e780d115fca12840`, revision, map, graph revision, route policy, determinism envelope, seven capsules, admission binding.
6. **Task classification** — deterministic regex cascade with `triage_result_hash`.
7. **Execution topology** — SOLO for a LOW read-only task.
8. **Provider selection** — locked chain over health evidence; Sol when healthy, exact Sonnet otherwise, else `NO_HERMES_RUNTIME_AVAILABLE`.
9. **Worker invocation** — the real executor contract is recorded; no model turn is spent by the self-test.
10. **Read-only repository operation** — `git rev-parse HEAD`.
11. **Evidence** — tamper-evident receipt (`receipt_hash` over all stages) plus a completed job record with `runtime_provenance`.
12. **Owner response** — one sentence naming archetype, unit, runtime, HEAD, and "no files modified".

Boundary properties (authority, contract, identity, lineage, retries, timeout, validation, auth, logging, determinism, failure, stale state, recovery) are evaluated in `DIAL_DEVELOPMENT_SYSTEM_TRACEABILITY.json`. Seams that are technically functional but systemically weak: the mission controller enforces VEKL by prompt text only; the tool-layer guard is conditional on `DIAL_PACKET_ID`; commit SHAs are not stamped on execution records (GAP-008, GAP-014).

## 6. Infrastructure topology

| Node | Canonical master | Unmerged lineages | This branch |
|---|---|---|---|
| `dial-hermes-control` | the only host; Ubuntu 24.04 ARM64; 15 user units; `/var/lib/dial-control` | PR #24 `hosts.json`: A1.Flex 4 OCPU/24 GB, 10.0.0.184; execution-fabric branch: `ROLE=CONTROL_AUTHORITY` | role `dial-hermes-control` (HERMES_CONTROL_PLANE) |
| `vekl-worker` | absent (only the string `vekl-worker-delivery-1`) | PR #24/#27 call it `oracle-admin-v2` (E2.1.Micro 1 GB, 10.0.0.245); execution-fabric branch: `vekl-worker` `BACKGROUND_COORDINATOR` 10.0.0.51 | role `vekl-worker` (BACKGROUND_ENGINEERING_WORKER): research, snapshots, indexing, docs; heavy compute and any control authority forbidden |
| `oracle-admin` | absent (a prompt example only) | PR #24/#27: RECOVERY_CONTROL_ONLY, Desktop Commander 0.2.50, 10.0.0.123; provisioning "not provisioned … RED" | role `oracle-admin` (RECOVERY_CONTROL_ONLY): every development workload forbidden |
| provider containers | not modelled | execution-fabric branch: "provider-first" (PROPOSED — NOT_IMPLEMENTED) | role `provider-container`: bounded repository development, no control authority |

Network: every canonical listener binds `127.0.0.1` (9130, 9132, 9119, 3011, 9141/9142); no installer opens a public port; TLS/tunnel is a manual owner step; no VCN, NSG or firewall statement exists in canonical code. The status publisher force-pushes a status branch every 30 s with git plumbing.

## 7. Component inventory

See `ops/development-bootstrap/DEVELOPMENT_CAPABILITY_REGISTRY.json` (23 capabilities, each with authority, host, type, install method, auth type, secret references, probe, dependencies, consumers, fallback, failure impact, owner and an evidence-backed status). Status counts: INTEGRATED 5, IMPLEMENTED_NOT_LIVE 11, DOCUMENTED_PARTIAL 1, DOCUMENTED_NOT_IMPLEMENTED 2, IMPLEMENTED_NOT_DOCUMENTED 1, UNMERGED_LINEAGE 2, NOT_REQUIRED 1.

## 8. Tooling inventory (derived from repository content)

| Tool | Required by | Host | Pinning |
|---|---|---|---|
| git ≥ 2.39, jq, ripgrep, sqlite3 (state.db backup), openssh | installers, operations plane | all / control | apt |
| Node ≥ 22.13, npm ≥ 10 | everything | control, worker, container | NodeSource curl\|sudo bash (unpinned) |
| Python 3 + PyYAML | project-truth guard, installers | control, worker, container | apt |
| Codex CLI ≥ 0.144.0 | Hermes primary runtime | control | `@openai/codex@latest` (floating) |
| Claude Code | Hermes fallback; containers | control, container | `claude.ai/install.sh \| bash` |
| Hermes agent | manager loop | control | `hermes-agent.nousresearch.com/install.sh \| bash` |
| Antigravity `agy` 1.2.0 | optional worker harness | control | SHA-256 pinned tarball (exemplary) |
| Playwright 1.56.1 (chromium) | `npm run test:e2e` | container/CI | exact |
| vitest, tsx, oxlint, typescript | verify | all | exact |
| Docker | none | — | not part of DIAL |
| Java/Gradle/Android SDK, Rust, Go | none in DIAL today (Android canon is documentation) | — | not required |

## 9. Plugin, MCP and connector inventory

| Name | Type | Status |
|---|---|---|
| `dial-oracle-status` | stdio MCP | INTEGRATED — stdio probe: `tools/list` → `dial_oracle_status`, answered (`available=true fresh=false`) |
| `dial-oracle-control` (Claude/Codex) | stdio MCP → HTTP bridge | implemented; enrolled only on the control host |
| `dial.mcp.oracle-control` HTTP bridge | localhost MCP, bearer 0600 | implemented; live unverified |
| `dial-truth` | stdio MCP | DOCUMENTED_NOT_IMPLEMENTED (contract only) |
| GitHub MCP (provider harness) | remote | INTEGRATED in containers (`get_me` → `Vanguduza`) |
| Desktop Commander 0.2.50 | stdio over SSH / remote device | UNMERGED_LINEAGE |
| Claude hooks (SessionStart, PreToolUse, PreCompact, Stop, UserPromptSubmit) | HOOK | INTEGRATED — fired in this session; the guard blocked one heredoc containing the word "secret" |
| Hermes pre/post-turn hooks | HOOK | implemented; live unverified |
| `.claude/skills` (6), `.claude/agents` (7), `.claude/rules` (9) | SKILL | present |
| `dial-development-governor` | PLUGIN | present, not installed, duplicates live hooks |
| Antigravity `dial-governed` plugin | PLUGIN | present; inert without Antigravity |
| Context7, Exa | OAUTH_CONNECTOR | policy-mandated, not configured |
| engineering/operations/product/design plugin skills | SKILL | routed by policy, not installed |
| xKiro HAIF, Cloudflare R2 mirror, Stitch, Pomelli | REMOTE_API / WEB_APPLICATION | implemented, disabled, unauthenticated |

## 10. Authentication matrix (no secrets)

| Integration | Auth type | Probe | Result from this client | Gate |
|---|---|---|---|---|
| Claude (provider container) | PROVIDER_LOGIN (managed) | session itself | PASS | — |
| Claude (control host) | PROVIDER_LOGIN | `claude auth status` | NOT CERTIFIED | AUTH-GATE-CLAUDE-001 |
| Codex (control host) | PROVIDER_LOGIN (ChatGPT OAuth) | `codex login status` contains "Logged in using ChatGPT" | NOT CERTIFIED | AUTH-GATE-CODEX-001 |
| Hermes provider binding | PROVIDER_LOGIN | config lock (openai-codex / gpt-5.6-sol / no fallback providers) | NOT CERTIFIED | — |
| GitHub (container) | OAUTH (connector) | `get_me`; `git ls-remote origin master` | PASS | — |
| GitHub (control host) | SSH_KEY / helper | `git ls-remote` | NOT CERTIFIED | — |
| chat-control bearer | NON_INTERACTIVE_SECRET | mode 600 + `/health` | NOT CERTIFIED | — |
| WhatsApp pairing | DEVICE_CODE | operator status | NOT CERTIFIED | AUTH-GATE-WHATSAPP-001 |
| xKiro | API_KEY (0600 file) | HAIF qualify | NOT CERTIFIED | AUTH-GATE-XKIRO-001 |
| Antigravity / Stitch / Pomelli | OAUTH_BROWSER / API_KEY / HUMAN | capability CLI | OWNER_ACTION_REQUIRED | AUTH-GATE-GOOGLE-* |
| Ambient API keys (`OPENAI_API_KEY`, `CODEX_API_KEY`, `ANTHROPIC_API_KEY`) | forbidden | env presence | PASS (absent in this container) | — |

Container environment holds harness-provided GitHub/AWS/Cloud tokens by name only; none was read.

## 11. VEKL assessment

Documentation vs implementation: the named canonical VEKL document is a **2.1-era** federated-resources specification. Every 2.2 concept (Units, lineage, GraphRAG, capsules, envelope, trace, stale refusal, rebuildable projections, owner-only canon) is implemented and enforced but documented only in a 20-line addendum, `PROJECT_TRUTH.md` DEC-026 and the Graphify reconciliation doc.

| Concept | Implementation | Enforced in execution path |
|---|---|---|
| Development Units, stable identity, revision lineage | `development-unit-planner.mjs` (`DU-LIN-<24hex>`; revision over truth slice, decisions, FRCs, stack fingerprint, route policy) | broker throws on registry drift (`:63-64`) — **observed live**: editing `package.json` scripts changed the stack fingerprint, every one of 309 unit revisions rolled, and the unit-check/retrieval-eval/self-test all refused until the planner regenerated the registry |
| Knowledge capsules (7) | `context-capsule-builder.mjs` | delivered; `worker_delivery_hash` checked at WORKER_START / FALLBACK_WORKER_START |
| Admission and stale refusal | `knowledge-admission-guard.mjs` (`REFUSED_STALE_KNOWLEDGE`, 10 reason codes) | dispatch, harness preflight, worker start, HCX, tool guard — **fault-injected**: mutating `project_truth_hash` in the binding produced `ok=false` with `PROJECT_TRUTH_HASH_CHANGED` |
| Immutable KnowledgeResolutionTrace | `knowledge-resolution-trace.mjs` (content-addressed) | executor throws if missing or hash-mismatched |
| Bounded retrieval / determinism envelope | `graph-retrieval-router.mjs` (hop budgets, hub rule, `visited_fraction < 0.05`), `GRAPHRAG_DETERMINISM_POLICY.json` | envelope hash bound into admission |
| Rebuildable projections | `verifyGraphRebuild`; every node carries `authority_reference` | check 25 |
| Owner-only canon | `canon-challenge-*`, `decision-evolution-guard.mjs` | `OWNER_EXPLICIT` bound to `challenge_id` + delta hash |
| Presearch / research | `engineering-presearch.mjs` (allowlist, no-redirect fetch) | advisory only; forecast id stamped |
| Polarity | n8n corpus only | — |
| Classifier / route versions | registry versions (routes rev3, edges rev5, nodes rev3) + classifier hash | no explicit version fields |

Bypass surface: unscoped packets (no Feature) get `UNSCOPED_PLANNING` with no binding; the tool guard fires only with `DIAL_PACKET_ID`; the mission controller instructs rather than calls; the qualification canary legitimately skips VEKL. Verdict: **operational and integrated, with two enforcement seams (GAP-008)**.

Determinism: three identical runs produced identical content-level decisions (project truth, unit/revision/map, graph revision and neighbourhood, route policy, envelope, capsule bodies, triage, topology, provider). Capsule hashes and activation-manifest hashes are packet-scoped (they embed `packet_id`), so cross-packet equality needs a body re-hash (GAP-020).

## 12. GraphRAG / Graphify assessment

Graphify is an **external host CLI (0.9.58), not installed anywhere, not a donor, not vendored**. The repository holds the adapter, normalization firewall, authority ranking (`GRAPHIFY_*` below `VEKL_CANONICAL_ASSERTION`), 16-gate architecture check and fail-closed qualification (`GRAPHIFY_NOT_QUALIFIED`, `GRAPHIFY_MUTATED_SOURCE_TREE`). It cannot influence resource eligibility (`graph-retrieval-router.mjs` has zero structural references). `VEKL = authoritative engineering-knowledge system` holds in code.

Findings: no DECISION_LOG entry; the snapshot producer had no production caller (always `MISSING_ADVISORY`); the test file was never collected and one assertion failed against the implementation's own `sym:`/`mod:` identity scheme. This branch adds both suites to vitest, aligns the assertion, and adds a `STRUCTURAL_SNAPSHOT` worker job that built and published a TypeScript baseline snapshot (1952 nodes, 2158 edges) locally. Graphify live execution stays disabled until the ten-point host gate is met.

## 13. Hermes assessment

Repository: the locked chain, provenance probes, checkpoint-before-fallback, supervisor, operations plane, doctor, mission controller and steering broker are implemented and tested (control-plane suite: locked policy, executor, failover, queue, readiness gates). Live: the mirror says primary and fallback HEALTHY, research READY via `gpt-5.6-sol` (forecast 2026-09-13), queue IDLE, but the mirror is stale, the mission is owner-blocked, the gate fails `qualified_control_plane_unchanged`, and the host runs `0bc356d` while master is `62eb712`. The IMPLEMENTATION_STATE record's last live evidence packet is dated 2026-09-04 against a control plane that has since changed nine times. **Hermes is IMPLEMENTED_NOT_LIVE for the audited commit.**

## 14. Provider assessment

- **Claude:** functional test performed by this session itself: received the task, resolved repository context, read Project Truth, invoked allowed tools (git, npm, MCP, GitHub), operated inside the provider container role, returned evidence. `claude-sonnet-5` is the only Hermes-executable Claude model; Opus/Fable/Haiku are worker candidates in the DEC-032 registry only.
- **Codex:** no binary in this container; cannot be certified; live qualification evidence predates the current control plane. Codex-as-operator (stdio MCP) is separate from Codex App Server as the Sol runtime; both are correctly modelled.
- **Xkiro/HAIF:** DEC-027 non-authoritative, FREE_ONLY, elite-candidate-only, DLP two-pass, separate DIAL/DDE accounts and ports; 21 allowed archetypes; denied-intent regexes; credentials unknown. Cannot become an architectural authority.
- **Astra:** no policy, no credential, no route exists anywhere; unlisted models are BLOCKED by `HARNESS_MODEL_COMPATIBILITY` (`default_when_unlisted`). The historical distinction the owner recalls is not recorded (GAP-019).
- **Google:** Antigravity (HOST_SOFTWARE+CLI, SHA-pinned, AUTH_REQUIRED), Stitch (REMOTE_API, SDK exact-pinned, disabled), Pomelli (WEB_APPLICATION, human session). Gemini/other Google AI tooling: not referenced by canon, not required.

Model routing: manager chain deterministic by construction; worker pair routing (DEC-032) deterministic by construction and tested, but **dormant** and self-contradictory in canon (GAP-009).

## 15. GitHub assessment

Canonical branch `master` (owner recalls `main`: GAP-018). Two workflows (`verify`: gates, types, unit suites, build, pack, e2e; `Project Truth Authority`: PR-native authority verification, read-only post-merge). Latest runs on `62eb712`: verify 272 success, project-truth 104 success. No CODEOWNERS, no committed branch-protection evidence, no commit signing (GAP-010). Git hooks not enabled in fresh clones (GAP-022). Open PRs: #8 (15 conflicts, superseded), #24 (1 conflict, honest partial), #29 (ledger conflicts). Merged-into-deleted-branch PRs #26/#27 carry the multi-VM control plane. Branch `work/bootstrap-reconcile-20260914` was pushed during this audit (20:02Z) with a proposed provider-first execution fabric; it is one commit ahead of master, self-declared NOT_IMPLEMENTED, and overlaps this branch only in `vitest.config.ts`.

## 16. Security assessment

Positive: no secret patterns in tracked files (`git grep`, six patterns); no tracked env/key files; every listener loopback-only; every unit `NoNewPrivileges` + `ProtectSystem=strict`; API keys unset in service environments and rejected by installers and gates; tokens 0600, printed only as fingerprints, compared timing-safely; egress DLP two-pass for HAIF; memory rejects credential-like material; receipts reject secrets and are hash-verified. Gaps: EnvironmentFile mode unasserted, two units without `UnsetEnvironment`, repo mounted RW by three units (GAP-011); supply-chain installers unpinned (GAP-007); no signing (GAP-010).

## 17. Determinism assessment

- Manager selection: two slots, fixed order, exact identity, freshness ≤ 13 h — proven by fault injection (Sol down → Sonnet; both down → fail closed; Opus identity → rejected; 20 h-old evidence → rejected).
- Worker routing: sorted pair generation, full tie-break chain, `evidence_hash` over canonical JSON (test AR-01…27).
- VEKL: identical inputs → identical unit/graph/envelope/capsule bodies (3/3 runs).
- Role guard: 34 forbidden-workload probes refused on every run.
- Bootstrap: same manifest, same host → same plan; every action detect-first.

## 18. Symbiotic coherence assessment

The components compose into one system with one authority per concern: Project Truth (owner), knowledge (VEKL), execution decision (HCX/AEF), runtime (locked chain), control (typed gateway), evidence (receipts/ledger). Incoherences found: (a) four parallel host-topology implementations across unmerged lineages; (b) DEC-032 documented as the routing law while DEC-028 cards execute; (c) canonical VEKL doc describing a superseded version; (d) VEKL enforced by prompt in the mission loop; (e) status mirror stale so consoles cannot read the truth they are told to trust. None of these is a fake integration; each is a seam.

## 19. Gap register (summary)

| ID | Sev | Title | Status |
|---|---|---|---|
| GAP-001 | P0 | Live Hermes control plane not qualified for current master (fingerprint changed, host 18 commits behind) | EXTERNAL GATE |
| GAP-002 | P0 | Codex/Claude/Hermes authentication on the control host not certifiable from this client | NOT CERTIFIED |
| GAP-003 | P0 | Oracle status mirror stale ≥ 15 h; Hermes operability cannot be established | OPEN |
| GAP-004 | P0 | Root mission BLOCKED_OWNER since 2026-09-08 (uncommitted fix awaiting owner) | OWNER DECISION |
| GAP-005 | P1 | vekl-worker / oracle-admin only on divergent unmerged lineages; four candidate role systems | OWNER DECISION |
| GAP-006 | P1 | Two test suites never collected; one failing assertion on master | RESOLVED here |
| GAP-007 | P1 | Unpinned curl\|bash installers and `@latest` | OPEN |
| GAP-008 | P1 | VEKL tool-guard conditional on packet env; mission loop enforces by prose | OPEN |
| GAP-009 | P1 | DEC-032 dormant, missing discovery module, decision text contradicts policy | OWNER DECISION |
| GAP-010 | P1 | Branch protection unevidenced; no CODEOWNERS; no signing | OWNER DECISION |
| GAP-011…017, 020, 022 | P2/P3 | sandboxing gaps, Graphify DEC, doc drift, observability, vitest RPC, absent tooling, WhatsApp GC, packet-scoped capsule hashes, hooks | see register |
| GAP-018, 019, 021 | P3 | master vs main; Astra policy absent; stale PRs | OWNER DECISION |
| GAP-023 | P2 | No host-role guard in canonical master | RESOLVED here |

Full detail with evidence commands: `DIAL_DEVELOPMENT_SYSTEM_GAP_REGISTER.json`.

## 20. Remediation (ordered)

1. **On `dial-hermes-control`**: pull master (this branch once merged); `bash deploy/oracle/hermes-codex/install-control-plane.sh`; `qualify-control-plane.sh`; `soak-control-plane.sh process`; `soak-external-orchestrator.sh`; `soak-control-plane.sh continuity`; `finalize-control-plane.sh`; then `./ops/development-bootstrap/bootstrap.sh --verify --role dial-hermes-control --out /var/lib/dial-control/bootstrap/green-flag.json`. Closes GAP-001/002/003 or names the exact failing probe.
2. **Owner**: resolve the BLOCKED_OWNER packet (land or discard), `dial_resume_mission` (GAP-004).
3. **Owner**: choose one topology lineage; declare `/etc/dial/host-role` on each node (`ROLE=…` works for both guards); run `bootstrap.sh --apply --role vekl-worker` / `--role oracle-admin`; set `DIAL_WORKER_SSH_HOST` on the control host and re-verify (GAP-005).
4. Pin installers: NodeSource apt with signed key, `@openai/codex@<qualified>`, checksum-verified Claude/Hermes installers, exact pairing-runtime deps (GAP-007).
5. Fail closed in `pre-tool-guard.mjs` when `DIAL_PACKET_ID` is absent for consequential in-repo tool use; call `ensurePacketEngineeringKnowledge` from the mission controller (GAP-008).
6. Amend DEC-032; implement `model-availability-discovery.mjs`; wire `selectExecutionPair` behind a flag; clean `MODEL_REGISTRY` text (GAP-009).
7. Export branch-protection ruleset as evidence; adopt SSH signing (GAP-010).
8. Unit hardening (GAP-011); Graphify DEC + schedule `STRUCTURAL_SNAPSHOT` (GAP-012); doc supersession marks (GAP-013); observability events (GAP-014).

## 21. Bootstrap architecture

`ops/development-bootstrap/` (Node 22 ESM, no third-party dependencies; see its README):

- **Manifest** (`manifest.json`, schema 1): roles, packages, runtimes, services, containers, mcp_servers, providers, plugins, credentials (references only), network_dependencies, health_checks, certification_gates; each entry carries version, install method, host placement, auth type, probe, remediation, criticality. Manifests with secret values fail validation.
- **Roles** (`roles/roles.json`, `roles/role-guard.mjs`): fail-closed resolution (env → `/etc/dial/host-role` bare or `ROLE=` → provider-container → hostname → UNKNOWN); allow/forbid lists per role; CLI exit codes 0/3/4.
- **Convergence** (`bootstrap.mjs --dry-run|--apply|--repair|--rollback`): detect-first actions (control home layout, Project Truth hooks, `.mcp.json` generated from the manifest, canonical installers wrapped, worker agent installer); backup-before-alter under `<control-home>/bootstrap/backups/<run-id>` with byte-for-byte rollback; JSONL event log with redaction.
- **Certification** (`--verify`): 80 checks in this role; readiness matrix; verdict law (GREEN only when every MANDATORY and REQUIRED check passes, no P0, no mandatory gate); machine-readable report; `verify/green-flag.mjs` recomputes the verdict from report + gap register + traceability and evaluates the 35 acceptance conditions.
- **Self-tests**: E2E chain, determinism (N runs), fault injection (9 scenarios), worker dispatch with sealed receipts (local and forced-command SSH).
- **Tests**: `tests/development-bootstrap.test.mjs` (14) in the vitest include list; `npm run bootstrap:*` scripts.

Dry-run plan on this container: `act.git-hooks CONVERGED` (not applicable to containers), `act.mcp-json CONVERGED` (generated fragment equals committed `.mcp.json`).

## 22. Certification results (this run)

| Item | Result | Evidence |
|---|---|---|
| `npm run verify` on `62eb712` | 29/29 gates pass; vitest 40 files, 651/651 tests pass; process exit 1 from a vitest worker RPC timeout (GAP-015); CI run 272 green | `evidence/npm-run-verify-20260914.json` |
| `npm run verify` on this branch's final state | 29/29 gates pass; vitest 43 files, 706/706 tests pass (includes the two recovered suites and the 14 bootstrap tests); same environmental worker-RPC exit-code artefact | `npm run verify` log, this session |
| `bootstrap --verify` (provider-container) | 80 checks: PASS 53, FAIL 7, UNVERIFIED 1, N/A 13, OWNER_ACTION 3, EXTERNAL_GATE 3; **RED** — mandatory check `hermes.development-gate` is an external gate | `evidence/bootstrap-verify-provider-container-20260914.json` |
| E2E self-test | PASS, 12 stages, one correlation id, no model turn, no file modified | `evidence/bootstrap-self-test-20260914.json` |
| Determinism | PASS, 3 runs identical, 0 forbidden leaks | `evidence/bootstrap-determinism-20260914.json` |
| Fault injection | PASS 9/9: primary down → Sonnet; total loss → fail closed; Opus identity rejected; stale evidence rejected; 4 role mismatches refused; unknown role refused; stale binding refused; gate absent → blocked; unreachable endpoint bounded | `evidence/bootstrap-fault-injection-20260914.json` |
| Worker contract | REPO_HEAD and STRUCTURAL_SNAPSHOT dispatched locally, receipts sealed and verified; tamper detected | bootstrap tests |
| Role guard | 34 forbidden-workload probes refused; container refuses HERMES_RUNTIME (exit 3) | verify report `role.*` |
| MCP capability probe | `dial-oracle-status` answers `tools/list` and `dial_oracle_status` over stdio | verify report `mcp.*` |
| GitHub | `get_me` → Vanguduza; `git ls-remote origin master` OK | verify report `github.*` |
| Bootstrap unit tests | 14/14 | `npm run test:bootstrap` |

Green-flag conditions: 25/35 met. Not met: 3 (Hermes operational), 12–13 (Codex auth/models), 18 (branch governance evidence), 20 (vekl-worker live), 28 (services supervised, live), 29 (recovery node live), 32 (bootstrap verification GREEN), 34 (P0 open), 35 (mandatory auth gate open on control host).

## 23. Remaining external gates

| Gate | Requirement | Verification | Expected success evidence |
|---|---|---|---|
| EXTERNAL-GATE-HERMES-REQUALIFICATION-001 | pull, install, qualify, soak, finalize on the control host | `bootstrap.sh --verify --role dial-hermes-control` | `hermes.development-gate PASS`, mirror fresh, fingerprint equal |
| AUTH-GATE-CODEX-001 | `codex login` (ChatGPT OAuth, browser) | `codex login status` | "Logged in using ChatGPT" |
| AUTH-GATE-CLAUDE-001 | Claude subscription login on the control host | `claude auth status` | exit 0 |
| EXTERNAL-GATE-VEKL-WORKER-001 | provision/declare the worker node; forced-command key; `DIAL_WORKER_SSH_HOST` | `bootstrap.sh --verify` on both hosts | `vekl-worker.live PASS` |
| EXTERNAL-GATE-ORACLE-ADMIN-001 | owner decision on the recovery lineage; declare role | `bootstrap.sh --verify --role oracle-admin` | development workloads refused; recovery path proven |
| AUTH-GATE-WHATSAPP-001, AUTH-GATE-XKIRO-001, AUTH-GATE-GOOGLE-* | optional owner pairing/keys | respective probes | non-blocking |

## 24. Green-flag checklist

`DIAL_DEVELOPMENT_GREEN_FLAG.json → green_flag_conditions` lists all 35 conditions with MET / NOT_MET and the gap each unmet condition maps to. Re-running `bootstrap.sh --verify` on the control host after the remediation above regenerates the report; `verify/green-flag.mjs` will only print `GREEN` when every mandatory check passes and no P0 gap remains open in the register.

## 25. Documentation quality findings

Contradictory: DEC-032 record vs shipped routing policy; orchestration README/IMPLEMENTATION_STATE blanket model prohibition vs worker registry. Stale: VEKL v2 doc §19 CLI names; `HERMES_XKIRO_HAIF.md` decision id; `CURRENT_STATE.json` branch. Aspirational: `MCP_ARCHITECTURE.md` dial-truth; `TOOLING_USE_POLICY.md` plugin skills and connectors; `PLUGIN_ALLOWLIST_PLAN.md`. Undocumented: structural reality decision; role guard (now this branch). Recommended consolidation: one `docs/orchestration/DIAL_DEVELOPMENT_SYSTEM_TOPOLOGY.md` carrying node roles, the role-file format and the placement law, superseding the four lineages. Historical evidence is kept; supersession is marked, nothing deleted.

## 26. Changes to canonical architecture recommended (OWNER_DECISION_REQUIRED)

1. Adopt one host-topology lineage and record a DEC naming `dial-hermes-control` / `vekl-worker` / `oracle-admin` and the role-file format.
2. Amend DEC-032 to the ruled performance-hierarchy policy and its real `enforced_by` set.
3. Record a DEC for structural reality / Graphify subordination.
4. Decide `master` vs `main`.
5. Decide whether an Astra rule is wanted; default remains "not approved infrastructure".
6. Adopt commit signing and export branch-protection evidence.

Nothing in this branch changes owner authority, the Project Truth hierarchy, payment or legal architecture, security policy, infrastructure role boundaries beyond additive fail-closed guards, or VEKL semantics.
