# DIAL Development System — E2E Audit Session Report, Rev 1

**Purpose of this file:** one complete account of the audit exercise: what was asked, what was done, what was found, what was changed, what was proven, what was not done, and what must happen next. It complements (and links to) the formal audit, the gap register, the traceability matrix, the readiness matrix and the green-flag report; it does not replace them.

**Session:** 2026-09-14, Claude Code Remote provider container (x86_64, 4 vCPU, 15 GB), no SSH to any DIAL host.
**Audited commit:** `62eb71274c042ac02e61dedeb3f62c4c60d2e479` (`master`).
**Work branch:** `claude/dial-e2e-audit-green-flag-hqqlyw` — commits `a38a5bc` (audit + bootstrap) and `16d2844` (expanded readiness matrix), both pushed; no pull request opened.
**Verdict:** `RED — DIAL DEVELOPMENT SYSTEM NOT YET GREEN — BLOCKERS REMAIN` (25 of 35 green-flag conditions met).
**Authority of this file:** `NO_AUTHORITY` for Project Truth.

---

## 1. The mission as given

The owner ordered a repository-first, host-aware, evidence-backed audit of the whole DIAL development system across 33 domains (Project Truth, Hermes, the three intended hosts, Claude/Codex/GitHub/MCP/WhatsApp integrations, VEKL, GraphRAG/Graphify, model routing, provider containers, tooling, plugins, authentication, secrets, host roles, systemd, containers, network, recovery, bootstrap, certification), a deterministic bootstrap and certification system under `ops/development-bootstrap/`, a declarative manifest, a self-test, determinism and failure-injection tests, an audit document, a machine-readable green-flag report, a gap register, a traceability matrix, and an expanded readiness matrix. A GREEN verdict was prohibited unless demonstrably earned.

Owner architectural intent to reconcile: `dial-hermes-control` as the control plane, `vekl-worker` as a second worker VM, `oracle-admin` as a recovery/admin node, provider-side containers carrying eligible compute, a strict model hierarchy, a canonical Astra rule, `main` as the historically preferred branch.

## 2. What was done, in order

### Phase 0 — authority
- Identified the canonical repository (`Vanguduza/dial-new`), branch (`master`, not `main`), commit (`62eb712`) and Project Truth (`PROJECT_CANONICAL_STATE.json`, `PROJECT_TRUTH_PROTOCOL.md`, `OWNER_AUTHORITY_POLICY.json`, `DECISION_LOG.json` DEC-001…032).
- Discovered the clone was shallow (117 commits, one branch) and unshallowed it; afterwards all six required canonical ancestors were verified as ancestors of HEAD and 21 remote branches became visible.

### Phase 1 — repository audit
- Read the orchestration canon (`IMPLEMENTATION_STATE.md`, `DIAL_HERMES_RUNTIME_BOUNDARY.md`, `DIAL_OPERATOR_GATEWAY.md`, HAIF, auxiliary operations plane), the development-system pack (VEKL v2, VEKL 2.2 addendum, adaptive execution fabric, adaptive harness/model routing, Google capabilities, MCP architecture, tooling policy, plugin allowlist, Claude native setup), the Graphify reconciliation, all 18 installers under `deploy/oracle/hermes-codex/`, both CI workflows, the Project Truth guard script and the hooks.
- Ran six read-only explorer agents in parallel covering VEKL, model routing, MCP/plugins/Google tools, Graphify, hosts/systemd/secrets/supply chain, and WhatsApp/GitHub/CI/observability. Every explorer claim used later was re-probed (one claim, that the structural-reality tests ran under `npm test`, was found false by running vitest).
- Fetched and trial-merged every open or notable PR head (#8, #24, #26, #27, #29) against master to classify unmerged work and conflicts; inspected the branch `work/bootstrap-reconcile-20260914` that was pushed during the audit.

### Phase 2 — live evidence reachable from this client
- Called the `dial-oracle-status` MCP: mirror available, 15+ hours stale; mission `BLOCKED_OWNER`; gate `DEVELOPMENT_BLOCKED`, failed check `qualified_control_plane_unchanged`; Oracle host at `0bc356d`, 18 commits behind master.
- Called GitHub MCP `get_me` (Vanguduza) and listed workflow runs: verify run 272 and project-truth run 104 green on `62eb712`.
- Ran `npm run verify` on the audited commit: all 29 gates green, 651/651 tests, with a vitest worker-RPC timeout forcing exit 1 on this container (reproduced twice; CI green; recorded as GAP-015).
- Recorded the container's toolchain (node 22.22.2, npm 10.9.7, git 2.43, python 3.11, claude 2.1.270; no codex, hermes, sudo-less systemd) and the absence of ambient API keys.

### Phase 3 — dependency inventory
- Derived required tools from repository content and installers; recorded install methods and pins (exact npm pins, SHA-pinned Antigravity, git-SHA-pinned HAIF, versus curl|bash for Node/Claude/Hermes and `@openai/codex@latest`).
- Inventoried every MCP server, hook, skill, agent, plugin, connector, Google capability and messaging channel with wired/described status.

### Phase 4 — architecture reconciliation
- Compared owner intent, canon, code and live state per domain; produced the 31-row traceability matrix (`DOCUMENTED_AND_IMPLEMENTED` … `EXTERNAL_GATE`).
- Established that canonical master runs on one host with no host-role guard; the three-node topology lives only on four divergent unmerged lineages.

### Phase 5 — gap analysis
- Produced the 23-entry gap register (4 P0, 6 P1, 9 P2, 4 P3) with evidence commands, consequences, remediation and owner-decision flags.

### Phase 6 — bootstrap implementation (`ops/development-bootstrap/`)
- `manifest.json` (schema 1): roles, packages, runtimes, services, containers, MCP servers, providers, plugins, credentials (references only), network dependencies, health checks, certification gates; validated on load; manifests carrying secret values are rejected.
- `roles/roles.json` + `roles/role-guard.mjs`: fail-closed resolution (env → `/etc/dial/host-role` bare or `ROLE=` → provider-container → hostname → UNKNOWN); per-role allow/forbid lists; CLI exit codes 0/3/4.
- `providers/` (Claude, Codex, Hermes, xKiro, Google): binary, version, ambient-key rejection, benign authentication probes.
- `mcp/inventory.mjs` + `mcp/probe-stdio.mjs`: one MCP inventory drives `.mcp.json` generation and a real JSON-RPC probe.
- `auth/gates.mjs`: `AUTH-GATE-*` records derived from probe results.
- `systemd/`, `containers/`, `network/`: supervision, container and reachability checks.
- `verify/repository.mjs` + `verify/certify.mjs`: Project Truth, VEKL/GraphRAG gates, control-plane fingerprint, Oracle mirror, secrets hygiene, supply chain, readiness matrix, verdict law, machine-readable report.
- `verify/green-flag.mjs`: composes the green-flag JSON from report + gap register + traceability and recomputes the verdict (a P0 in the register forces RED).
- `repair/`, `rollback/`, `lib/backup.mjs`: detect-first actions, backup-before-alter, byte-for-byte rollback.
- `selftest/`: E2E chain (12 stages, one correlation id, no model turn, temporary control root), determinism (N runs, content-level fingerprint), fault injection (9 scenarios).
- `workers/`: allowlisted job executor with sealed receipts, dispatcher (local and forced-command SSH), worker-agent installer for `vekl-worker`.
- `bootstrap.sh` / `bootstrap.mjs` CLI with `--dry-run|--verify|--apply|--repair|--rollback|--self-test|--determinism|--fault-injection`, `--role`, `--json`, `--out`, `--fast`.
- `DEVELOPMENT_CAPABILITY_REGISTRY.json` (23 capabilities) and `README.md`.
- 14 vitest tests in `tests/development-bootstrap.test.mjs`; npm scripts `bootstrap:*` and `test:bootstrap`.

### Phase 7 — safe remediation
- Added the two never-collected suites to the vitest include list and aligned one latent failing assertion to the implemented `sym:`/`mod:` identity scheme.
- Regenerated `DEVELOPMENT_UNIT_REGISTRY.json` with the planner after `package.json` changed the technical stack fingerprint (VEKL's stale-context refusal fired on the change, which is itself evidence the mechanism works).
- Regenerated `MANIFEST_v2_2.json` and `BUILD_READINESS_SCORECARD.json` for the new pack files; recorded the audit in `IMPLEMENTATION_STATE.md` without touching any gate.

### Phases 8–9 — certification
- `bootstrap --verify` (provider-container role): 80 checks; 53 PASS, 7 FAIL, 1 UNVERIFIED, 13 N/A, 3 OWNER_ACTION_REQUIRED, 3 EXTERNAL_GATE; verdict RED.
- E2E self-test PASS; determinism PASS (3/3 identical); fault injection PASS (9/9); worker dispatch PASS (receipts sealed, tampering detected); role guard PASS (34 forbidden-workload probes refused); MCP stdio probe PASS; GitHub reach PASS.
- Final `npm run verify` on the branch: 29/29 gates, 43 files, 706/706 tests (same environmental exit-code artefact).

### Phases 10–11 — documentation and delivery
- Wrote the audit (`…E2E_AUDIT_AND_GREEN_FLAG_REV1.md`, 27 sections), gap register, traceability, readiness matrix (42 rows, expanded on request), green-flag JSON, and bounded evidence files.
- Two append-only owner authorization records; ledger rows written by the pre-commit hook; `project_truth_local.py verify` PASS; pushed.

## 3. What was found (highest value)

1. Repository side is real and green; live side is unproven. The mirror is stale, the mission is owner-blocked, the gate fails the fingerprint check, and the Oracle checkout is 18 commits behind.
2. Control-host authentication (Codex ChatGPT OAuth, Claude subscription, Hermes binding) cannot be certified from a provider container.
3. `vekl-worker` and `oracle-admin` do not exist in canonical master; four unmerged lineages (PR #24, PR #26/#27, `work/bootstrap-reconcile-20260914`, and now this branch's role guard) each define host roles differently.
4. Two test suites never ran in CI; one contained a failing assertion (now fixed).
5. DEC-032 worker routing is implemented but dormant, its discovery module is missing, and its decision text contradicts the ruled policy.
6. Host runtimes are installed by unpinned curl|bash and `@latest`.
7. VEKL enforcement has two seams: the tool guard depends on `DIAL_PACKET_ID`; the mission controller enforces by prompt text.
8. No CODEOWNERS, no committed branch-protection evidence, no commit signing.
9. Graphify has no decision record and its snapshot producer had no scheduled caller; the `graphify` binary is installed nowhere.
10. Astra has no policy, credential or route anywhere; unlisted models are BLOCKED by default.
11. Canonical branch is `master`; the owner recalls `main`.
12. Documentation drift: VEKL v2 doc names a non-existent CLI and omits 2.2; HAIF doc cites the wrong DEC; `CURRENT_STATE.json` names a deleted branch.

## 4. What was changed in the repository

| Change | Files | Authority |
|---|---|---|
| Bootstrap system | `ops/development-bootstrap/**` (35 files) | auth-…-e2e-audit |
| Tests | `tests/development-bootstrap.test.mjs`; `vitest.config.ts` (three includes); one assertion in `tests/orchestration-vekl-structural-reality.test.mjs` | same |
| npm scripts | `package.json` (`bootstrap:*`, `test:bootstrap`) | same |
| Generated registries | `DEVELOPMENT_UNIT_REGISTRY.json`, `MANIFEST_v2_2.json`, `BUILD_READINESS_SCORECARD.json` (counts/hashes only) | same |
| Audit pack | `DIAL_DEVELOPMENT_SYSTEM_E2E_AUDIT_AND_GREEN_FLAG_REV1.md`, `DIAL_DEVELOPMENT_GREEN_FLAG.json`, `DIAL_DEVELOPMENT_SYSTEM_GAP_REGISTER.json`, `DIAL_DEVELOPMENT_SYSTEM_TRACEABILITY.json`, `DIAL_DEVELOPMENT_READINESS_MATRIX.json`, `evidence/` (6 files) | both records |
| Implementation state note | `docs/orchestration/IMPLEMENTATION_STATE.md` | auth-…-e2e-audit |

Not changed, deliberately: `agent-system/orchestration/**`, `agent-system/engineering-knowledge/**`, `deploy/oracle/hermes-codex/**` (any edit there invalidates the live control-plane fingerprint), every locked decision, the runtime policy, security policy, owner-control boundaries, product canon.

## 5. What was not done (and why)

| Not done | Reason |
|---|---|
| Any install, configuration or authentication on `dial-hermes-control`, `vekl-worker` or `oracle-admin` | No SSH keys or network path from this container; the hosts are unreachable from here |
| Codex, Hermes, Antigravity, Stitch, xKiro, WhatsApp setup anywhere | Same; plus every one of these needs an owner-interactive login or a key that only the owner holds |
| Live Hermes requalification (qualify, soaks, finalize) | Host-only scripts |
| Bootstrap `--apply` installing host runtimes / Antigravity, and an `--auth` mode driving logins | Not implemented; the current `--apply` converges control home, git hooks, `.mcp.json`, wraps the canonical control-plane installers and installs the worker agent. This is the gap the owner identified after delivery |
| Merging any of the unmerged topology lineages | Owner decision; the lineages conflict |
| Amending DEC-032, recording a Graphify DEC, renaming the branch, writing an Astra rule | Canonical changes; `OWNER_DECISION_REQUIRED` |
| A pull request | Not requested |

## 6. What must be done to reach GREEN

### 6.1 Owner decisions (cannot be made by an agent)
1. Land or discard the uncommitted fix behind `BLOCKED_OWNER` and `dial_resume_mission` (GAP-004).
2. Choose one host-topology lineage: this branch's role guard + manifest for host convergence, plus either PR #24's resource fabric, PR #27's control plane, or `work/bootstrap-reconcile-20260914`'s execution fabric for venue routing; close the others with supersession notes; record a DEC naming the three hosts and the role-file format (GAP-005).
3. Amend DEC-032 to the ruled performance-hierarchy policy and its real `enforced_by` set (GAP-009).
4. Record a DEC for structural reality / Graphify (GAP-012).
5. Confirm and export GitHub branch protection as evidence; adopt SSH commit signing (GAP-010).
6. Decide `master` vs `main` (GAP-018) and whether an Astra rule is wanted (GAP-019).

### 6.2 Control host (`dial-hermes-control`), in order
```bash
git pull origin master            # after this branch merges
bash deploy/oracle/hermes-codex/install-control-plane.sh
codex login                       # ChatGPT OAuth (browser)
claude auth login                 # Claude subscription
hermes auth add openai-codex
bash deploy/oracle/hermes-codex/qualify-control-plane.sh
bash deploy/oracle/hermes-codex/soak-control-plane.sh process
bash deploy/oracle/hermes-codex/soak-external-orchestrator.sh
bash deploy/oracle/hermes-codex/soak-control-plane.sh continuity
bash deploy/oracle/hermes-codex/finalize-control-plane.sh
systemctl --user status dial-operator-status-publisher.timer   # repair the stale mirror (GAP-003)
echo 'ROLE=dial-hermes-control' | sudo tee /etc/dial/host-role && sudo chmod 644 /etc/dial/host-role
./ops/development-bootstrap/bootstrap.sh --verify --role dial-hermes-control --out /var/lib/dial-control/bootstrap/green-flag.json
```
Optional on the same host: `install-google-antigravity.sh` then Google sign-in; `install-haif.sh` with the xKiro key on stdin; `pair-hermes-whatsapp.sh --foreground`; Stitch key into a 0600 secret file plus a unit `EnvironmentFile` (a deploy change that re-invalidates the fingerprint, so do it before qualification).

### 6.3 Worker and admin hosts
```bash
# vekl-worker
echo 'ROLE=vekl-worker' | sudo tee /etc/dial/host-role
./ops/development-bootstrap/bootstrap.sh --apply --role vekl-worker     # installs dial-worker-job + timer
# add the control host's forced-command key to ~/.ssh/authorized_keys (printed by the installer)
# oracle-admin
echo 'ROLE=oracle-admin' | sudo tee /etc/dial/host-role
./ops/development-bootstrap/bootstrap.sh --verify --role oracle-admin   # must refuse every development workload
# back on the control host
export DIAL_WORKER_SSH_HOST=<private ip>; ./ops/development-bootstrap/bootstrap.sh --verify --role dial-hermes-control
```

### 6.4 Bootstrap enhancements still owed (repository work)
1. Pinned install actions per role: apt packages; Node 22 from a signed apt source; `@openai/codex` at an exact resolved version recorded as evidence (npm currently resolves 0.154.0); Claude and Hermes installers downloaded to disk and hash-recorded rather than piped to bash; Antigravity via the existing SHA-pinned installer; `npm ci`.
2. `--auth` mode: per credential, probe → if a terminal is present run `codex login`, `claude auth login`, `hermes auth add openai-codex`, Antigravity sign-in, WhatsApp pairing, and accept Stitch/xKiro keys on stdin into 0600 files → re-probe; without a terminal, emit the exact command as an `AUTH-GATE-*`.
3. `--qualify` mode for the control host chaining the canonical qualify, soak and finalize scripts, then re-verifying.
4. Schedule the `STRUCTURAL_SNAPSHOT` worker job; add a `content_hash` to capsules (GAP-020); fail closed in the tool guard without `DIAL_PACKET_ID` and call the knowledge broker from the mission controller (GAP-008); unit hardening (GAP-011); observability events (GAP-014); documentation supersession marks (GAP-013).

### 6.5 Then
Re-run `bootstrap.sh --verify` on each host and `node ops/development-bootstrap/verify/green-flag.mjs <report> …`. The composer prints GREEN only when every mandatory check passes on the certifying host and no P0 remains open in the gap register.

## 7. Evidence index

| Artefact | Path |
|---|---|
| Formal audit (27 sections) | `docs/dial/final-audit/06_DEVELOPMENT_SYSTEM/DIAL_DEVELOPMENT_SYSTEM_E2E_AUDIT_AND_GREEN_FLAG_REV1.md` |
| Green-flag report (35 conditions, matrix, gates) | `docs/dial/final-audit/06_DEVELOPMENT_SYSTEM/DIAL_DEVELOPMENT_GREEN_FLAG.json` |
| Readiness matrix (42 rows, explicit cells) | `docs/dial/final-audit/06_DEVELOPMENT_SYSTEM/DIAL_DEVELOPMENT_READINESS_MATRIX.json` |
| Gap register (23) | `docs/dial/final-audit/06_DEVELOPMENT_SYSTEM/DIAL_DEVELOPMENT_SYSTEM_GAP_REGISTER.json` |
| Traceability (31 rows) | `docs/dial/final-audit/06_DEVELOPMENT_SYSTEM/DIAL_DEVELOPMENT_SYSTEM_TRACEABILITY.json` |
| Evidence files | `docs/dial/final-audit/06_DEVELOPMENT_SYSTEM/evidence/` |
| Bootstrap system | `ops/development-bootstrap/` (README inside) |
| Capability registry | `ops/development-bootstrap/DEVELOPMENT_CAPABILITY_REGISTRY.json` |
| Authorization records | `docs/project-state/authorizations/auth-20260914-owner-development-system-e2e-audit*.json` |

## 8. Owner statement

«DIAL DEVELOPMENT SYSTEM NOT YET GREEN — BLOCKERS REMAIN»

Blockers, exactly: live control-plane requalification for the current fingerprint (GAP-001); control-host provider authentication not certified (GAP-002); stale status mirror (GAP-003); root mission owner-blocked (GAP-004). Everything else in this report is required hardening or improvement, not a green-flag blocker, but the three hosts must each run the bootstrap before any cell marked `?` can become `Y`.
