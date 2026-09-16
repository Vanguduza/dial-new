# DIAL Development GREEN — Live Execution Board

**Status:** ACTIVE / NOT GREEN
**Branch:** `gpt/dial-development-system-green-closure-20260915`
**Closure base:** `2e291761cd07951c6c75a2674f11e86185a1551f`
**Updated:** 2026-09-16T09:58:41Z
**Rule:** A task moves to DONE only from measured evidence. No missing evidence is converted to GREEN.

Legend: `[x] DONE` · `[~] ACTIVE/PARTIAL` · `[ ] TODO` · `[!] EXTERNAL/OWNER GATE`

## Phase 0 — Authority, isolation and live board

- [x] P0.01 Confirm `master` is the canonical protected integration branch.
- [x] P0.02 Preserve PR32 provider-first architecture and three-host role separation.
- [x] P0.03 Work only in isolated closure worktree; do not mutate dirty production checkout.
- [x] P0.04 Stop concurrent Codex/Fable writers before manual reconciliation.
- [x] P0.05 Establish this live execution board and update it as closure progresses.
- [x] P0.06 Remote `master` rechecked immediately before this closure evidence commit and remains exactly `fa7c655f12faf02a2b33cc15799069526bdda3a6`; closure history remains based on that SHA and Project Truth verify/verify-pr are GREEN.

## Phase 1 — Repository closure and deterministic dependency inventory

- [x] P1.01 Full closure diff reviewed against current canonical `master`; 149 changed/new files were re-enumerated and checked across Project Truth, security, VEKL, bootstrap, recovery, CI and governance surfaces with no unresolved static regression introduced by the closure branch.
- [x] P1.02 Add authoritative readiness classes: core development, owner control, recovery, optional, reference-only.
- [x] P1.03 Add explicit bootstrap `--auth`/`--resume` workflow; never silently authenticate.
- [x] P1.04 Add deterministic `apply`/`repair` convergence and fail-closed pin validation.
- [x] P1.05 Fix non-interactive PATH handling for Hermes/user-local tools.
- [x] P1.06 Reconcile control topology to actual 2 logical CPU / 12 GiB allocation.
- [x] P1.07 Add first-class dependency/traceability/gap registries.
- [x] P1.08 Add read-only `dial-truth` MCP.
- [x] P1.09 Add post-tool audit and before/after repository SHA receipts.
- [x] P1.10 Enforce VEKL activation for consequential material tool use.
- [x] P1.11 Enforce mission dispatch VEKL activation programmatically.
- [x] P1.12 Wire model availability discovery into routing/dispatch; performance ranks but does not define eligibility.
- [x] P1.13 Add WhatsApp per-sender rate limiting/idempotency retention GC.
- [x] P1.14 Add semantic content hash to packet/activation evidence.
- [x] P1.15 Add CODEOWNERS + protected-master policy/evidence schema without fabricating applied settings.
- [x] P1.16 Add structural snapshot worker service/timer to repository.
- [x] P1.17 Correct recovery service repo-path configuration via `DIAL_REPO_DIR`/EnvironmentFile.
- [x] P1.18 Correct bounded-recovery audit-log provision to be writable by forced-command peer.
- [x] P1.19 Correct `StartLimitIntervalSec` placement to `[Unit]`.
- [x] P1.20 Add valid `[Socket]` SSH survival drop-in; stop installing `[Service]` stanza on `ssh.socket`.
- [x] P1.21 Fix host-certifier stale-telemetry fail-closed probe.
- [x] P1.22 Static review complete across all 149 changed/new files: 36 JSON files parse, 64 JS/MJS files pass `node --check`, 28 shell files pass `bash -n`, YAML parses, `git diff --check` is clean, no conflict markers exist, and suspicious changed-line scan produced only intentional guard/docs/deprecation references. Direct systemd unit verification produced only expected host-specific missing-binary warnings on the control host, not unit syntax faults.

## Phase 2 — Supply-chain closure and exact pins

- [x] P2.01 Pin official Node 22.23.2 arm64/x64 release tarballs by SHA-256.
- [x] P2.02 Fill exact Ubuntu 24.04 APT package pins from live candidate/installed versions.
- [x] P2.03 Reconcile Docker to Ubuntu `docker.io=29.1.3-0ubuntu3~24.04.2`; digest-pinned toolbox candidate built successfully (`sha256:84379198277c...`); final merged-SHA rebuild remains Phase 9.
- [x] P2.04 Record Codex 0.153.1 exact npm integrity and deterministic install.
- [x] P2.05 Record Claude Code 2.1.270 installer SHA-256 + exact-version invocation.
- [x] P2.06 Record Hermes exact version, source commit, archive URL/SHA-256 and immutable commit-pinned install command.
- [x] P2.07 Record Desktop Commander 0.2.50 npm integrity.
- [x] P2.08 Prove no mandatory executable path uses `curl|bash`, `@latest`, mutable Git ref or unverified package; WhatsApp and Desktop Commander dynamic npm paths were converted to lockfile/integrity-bound `npm ci`.
- [x] P2.09 Mandatory pin set cross-referenced by tests: Node hashes, Hermes/Claude/Codex pins, Antigravity 1.2.0 release/script hashes, Commander lock, WhatsApp lock/vendor artifact, research MCP lock/integrities and toolbox base digest.

## Phase 3 — `vekl-worker` convergence

- [x] P3.01 Upgrade worker Node 18 -> pinned Node 22.23.2.
- [x] P3.02 Restore worker npm 10.9.8.
- [x] P3.03 Install worker ripgrep 14.1.0-1.
- [x] P3.04 Verify exact required worker Git, jq, OpenSSH, Python and ripgrep packages.
- [x] P3.05 Reinstall hardened `dial-background-coordinator.service` under Node 22 against closure staging; final merged-SHA reinstall remains Phase 9.
- [x] P3.06 Install/enable and successfully execute `dial-worker-agent.service/timer` against closure staging.
- [x] P3.07 Install/enable and successfully execute `dial-structural-snapshot.service/timer` against closure staging.
- [x] P3.08 Run capability-envelope job; Node 22.23.2/npm 10.9.8/Git 2.43/Python 3.12.3/ripgrep 14.1.0 evidenced.
- [x] P3.09 Run structural-snapshot job; immutable graph hashes emitted and authority remains `SUBORDINATE_STRUCTURAL_EVIDENCE`.
- [x] P3.10 Prove worker coordinator refuses heavy local compute (`VEKL_WORKER_REJECTS_HEAVY_LOCAL_COMPUTE`).
- [x] P3.11 Prove provider credentials are absent from worker unit configuration and live coordinator process environment.
- [x] P3.12 Produce worker role certification candidate; candidate exposed/fixed role-local certification circularity, Claude placement, and E2 logical-CPU topology semantics. Final signed same-SHA worker certificate remains Phase 9.

## Phase 4 — Recovery-plane closure

- [x] P4.01 Prove control -> worker private SSH.
- [x] P4.02 Prove `oracle-admin` SSH.
- [x] P4.03 Prove OCI Run Command agent/plugin capability.
- [x] P4.04 Prove Desktop Commander end-to-end through the registered device.
- [x] P4.05 Install dedicated bounded control -> admin recovery identity.
- [x] P4.06 Isolate bounded identity from unrestricted legacy admin SSH path for recovery verification.
- [x] P4.07 Prove R0 observation and all negative/refusal controls.
- [x] P4.08 Prove R1 recovery-agent restart; fresh `verify-two-way-recovery.sh --include-repair` verdict is `PROVEN` at 2026-09-16T12:58:48Z and is now persisted to the canonical latest-verdict path consumed by certification.
- [x] P4.09 Fix live recovery service repo path and audit-log permissions.
- [x] P4.10 Achieve individual `oracle-admin` GREEN certification.
- [ ] P4.11 Deploy final merged recovery scripts/units to `oracle-admin` and re-certify against final SHA.
- [!] P4.12 Independent secondary recovery overlay is canonically mandatory (`DIAL_PROVIDER_FIRST_EXECUTION_FABRIC_REV2.md` §12 path G). Tailscale is installed on control, worker and admin but all three report `BackendState=NeedsLogin` / offline; owner authentication or an owner-approved equivalent overlay plus reciprocal proof remains required.

## Phase 5 — MCP, auth, network and required-capability readiness

- [x] P5.01 Codex ChatGPT authentication + live canary.
- [~] P5.02 Claude subscription authentication and exact `claude-sonnet-5` identity were previously proven, but a fresh live probe at 2026-09-16T08:05:42Z returned `ACCOUNT_LIMITED` before model execution (`resolved_model=null`); current Sonnet fallback execution capacity therefore remains unproven and must recover before GREEN.
- [x] P5.03 Hermes `openai-codex` OAuth authentication + runtime canary.
- [x] P5.04 GitHub CLI authentication and repository API access.
- [x] P5.05 Legacy Hermes self-chat development-control route retired; only the dedicated Dial Hermes Control path remains, currently waiting for owner number configuration/pairing.
- [x] P5.06 xKiro FREE_ONLY authentication + live model canary.
- [x] P5.07 Generate complete MCP inventory: canonical `manifest.mcp_servers` plus live evidence `/var/lib/dial-control/operations/mcp/live-inventory.json` covers endpoint/transport/host/auth/owner/criticality/proof (10 surfaces; 9 PASS, 1 PARTIAL with Exa key-backed functional canary pending P5.15).
- [x] P5.08 Live-probe `dial-oracle-status`: stdio initialize/tools/list/tool-call PASS; `dial_oracle_status` returned non-error structured content.
- [x] P5.09 Live-probe `dial-oracle-control`: 21 typed tools over stdio; Codex enrolled and Claude local enrollment repaired/proven connected; Hermes local MCP topology qualifier GREEN.
- [x] P5.10 `dial-chat-control` loopback + bearer-authenticated JSON-RPC `tools/list` proven live: 21 typed tools, no generic shell/exec/filesystem primitive, and no token material exposed; proof persisted under control-plane MCP evidence.
- [x] P5.11 Live-probe read-only `dial-truth` MCP: initialize/tools/list PASS and `get_decision(DEC-033)` returned `found=true`; toolset is bounded read-only canon access.
- [!] P5.12 GitHub/provider-container connector is repository-ready but still lacks an admissible provider-managed execution surface: Codex Cloud reports `no cloud environments are available for this workspace`, while Claude Remote requires interactive account login before the provider-container OAuth surface is reachable. Control-host GitHub access is not substituted for the required provider-side `git ls-remote origin master` proof.
- [!] P5.13 Authenticated Cloudflare Access/public MCP is canonically mandatory (`ops/development-bootstrap/manifest.json` CORE_DEVELOPMENT_REQUIRED and fabric §11). Private VCN MCP remains healthy, but final GREEN requires a real `DIAL_MCP_INGRESS_URL` backed by authenticated Access/Tunnel and a live provider-ingress probe.
- [!] P5.14 Tailscale (or owner-approved equivalent independent of Cloudflare) is a mandatory RECOVERY_REQUIRED secondary overlay. Repository certification now probes Tailscale fail-closed; current control/worker/admin state is `NeedsLogin`, so authentication and live reciprocal overlay evidence remain an owner gate.
- [~] P5.15 Context7/Exa: exact local runtimes installed (Context7 4.1.1, Exa 3.4.1); Context7 resolve/query live canaries PASS. Duplicate user-scope remote Context7/Exa definitions were removed after backup so only the canonical project-local wrappers remain and the conflicting-scope warnings are gone. Exa has no admitted `EXA_API_KEY` on the control host, so its key-backed functional/provider-surface canary remains an owner auth gate.
- [~] P5.16 Antigravity/Stitch are required. Antigravity 1.2.0 is fully `INTEGRATED` with isolated identity, 14-model discovery, 13 healthy/1 dynamic-degraded pairing matrix, HCX selection, guard/receipt and live reroute proof. Stitch repository-side orchestration is now closed: explicit specialist selection preserves default direct routing; the provider remains non-writing/non-authoritative; task/FDEP-bound generation, quarantine, admission, AEF Unit consumption, real-screen certification, outage fallback and same-repository-SHA proof validation are deterministic and regression-tested. Live Stitch authentication/tool discovery/sandbox/real-screen execution still requires provider credentials. Pomelli remains GMPC human-operated REFERENCE_ONLY.
- [!] P5.17 Pair/live-probe the DEC-034 dedicated Dial Hermes Control WhatsApp account: closed bot mode, exactly one owner allowlist, direct owner→Hermes conversation, benign instruction round-trip and WhatsApp message-ID delivery receipt. Meta Cloud is no longer a development owner-control gate.
- [x] P5.18 Antigravity Google session authenticated under canonical isolated worker identity; all 14 live `agy models` were qualified, normal HCX selection executed a real Unit, guarded write/network denials passed, and capacity-limited fallback rerouted from Opus to Sonnet with revoked/released leases and settled compute. Latest capability state: `INTEGRATED`.
- [!] P5.19 Repository-side Stitch prerequisites are complete and targeted regression passes 19/19: the canonical qualifier can derive visual-acceptance, AEF-consumption and outage-fallback proofs and rejects stale-SHA evidence. Remaining work is genuinely external: configure supported Stitch API-key or OAuth/access-token + Google Cloud project, then run fixed-host tool discovery, synthetic sandbox generation and one real governed screen/Unit acceptance path.
- [x] P5.20 Re-audit every development capability registry entry: no operational `required=false` or `OPTIONAL_CAPABILITY` remains. Remaining `required=false` entries are explicitly GMPC-only human web, deprecated duplicate, or non-enrolled experimental API references.

## Phase 6 — Systemd/security/runtime verification

- [x] P6.01 Correct SSH socket survival drop-in is live; effective `ssh.socket` and `ssh.service` both resolve to `Slice=dial-survival.slice` with the valid `[Socket]`/`[Service]` drop-ins.
- [x] P6.02 Run `systemd-analyze verify` on every DIAL user unit: RC 0 with no DIAL-caused warnings/errors; remaining warnings are Oracle monitoring-agent vendor units.
- [x] P6.03 Inspect effective `systemctl show` for every control-host MANDATORY/REQUIRED service after candidate deployment: all expected units are loaded and active; the full `dial-recovery-agent.service` was removed from control placement because control is `BOUNDED_RECOVERY`, not a full `RECOVERY` peer, and this invariant is regression-tested.
- [x] P6.04 Verify secret/public-key/config file modes and ownerships: private control secrets inspected are `0600 ubuntu:ubuntu`; the Ed25519 public key is intentionally `0644`.
- [x] P6.05 Verify provider keys are unset from non-provider systemd units: live process environments expose no provider-key variable names and canonical units use `UnsetEnvironment` guards.
- [x] P6.06 Run tracked/generated secret scan: boundary-aware scan of tracked + untracked closure files found 5 credential-shaped candidates, all deterministic test fixtures; unclassified/live-secret candidates = 0.
- [x] P6.07 Verify resource slices/budgets against live hosts: control reports 2 CPU / 11927 MiB with `dial-hermes.slice` 5/6 GiB and 200% CPU plus `dial-dev.slice` 3/3.5 GiB and 150%; worker reports 2 CPU / 976904 KiB with `dial-node.slice` 512/640 MiB and survival slice priority preserved.
- [x] P6.08 Verify operator-status publisher remains scheduled/fresh: timer is active/waiting and triggered at `2026-09-16T02:53:32Z`; freshness will be rechecked again at final certification.

## Phase 7 — Tests, determinism and fault injection

- [x] P7.01 Development-bootstrap targeted suite: latest targeted run passed.
- [x] P7.02 VEKL structural/frontend first-class Vitest inclusion fixed and targeted suite passed.
- [x] P7.03 Adaptive/VEKL/provider-first targeted suites passed; latest post-Stitch targeted run is 2 files / 34 tests PASS, including the full non-authoritative Stitch stage -> admission -> AEF consumption -> screen-certification proof chain.
- [x] P7.04 Previously sandbox-blocked child-git/shell suites re-run on the real control host; control-plane/operations/chat/operator and closure-targeted suites execute normally outside the Codex sandbox.
- [x] P7.05 Latest closure-targeted real-control runs are green: 7 suites / 202 tests plus VEKL resource+graph 24 tests and focused bootstrap/Google/operator 54 tests on Vitest 4.1.11.
- [x] P7.06 Full `npm run verify` rerun after dedicated WhatsApp/recovery/certifier closure: PASS on real control; 46 test files / 790 tests PASS, with manifest/scorecard/boundary gates GREEN.
- [x] P7.07 Project Truth verifier and PR-authority verifier are enforced on the closure branch and were GREEN through the committed closure/evidence sequence; every repair commit is re-verified before push.
- [x] P7.08 Determinism self-test: 3/3 bounded routing/VEKL decisions produced identical decision hash `2b761b17b069c61961e45311764164fa0a1940dc0ad5684a0a723831bcd8bf3e`; zero forbidden-role leaks.
- [x] P7.09 Safe fault injection: 9/9 scenarios PASS, including primary-provider fallback, total provider loss fail-closed, alternate-model rejection, stale runtime refusal, role mismatch, unknown role, stale knowledge binding, absent development gate, and bounded network timeout.
- [x] P7.10 Structured execution receipt captured at `evidence/closure-execution-receipt-20260916.json`: 784/784 assertions PASS with per-test status/duration/file plus before SHA `fa7c655...`, after SHA `88413bc...`, verify-output hashes and gate results.

## Phase 8 — GitHub governance and closure PR

- [x] P8.01 Confirm `master` protected; admins enforced; `project-truth` strict check required.
- [x] P8.02 Capture fresh branch-protection API evidence conforming to repository schema: native `master` protection is source-payload SHA-256 bound; strict required checks now map directly to `project-truth` plus all four real GitHub verification lanes, eliminating the stale synthetic `verify` context without weakening CI coverage.
- [!] P8.03 Required-signature enforcement is now live on `master`, but PR #34 correctly becomes BLOCKED because closure commits are unsigned. The authenticated GitHub token lacks `admin:ssh_signing_key` (and `workflow`) scope, so registering a GitHub-recognised signing key/re-signing requires owner OAuth refresh. The same protected-master expectation also requires one owner CODEOWNER approval, but the repository currently has only the PR author (`Vanguduza`) as a direct collaborator, making self-review unsatisfiable without a second qualified reviewer or an owner-approved single-owner governance revision.
- [x] P8.04 Enforcement mechanism resolved without weakening controls: either native GitHub branch protection or an equivalent ruleset is acceptable when fresh API evidence matches the same committed protected-master policy; mechanism-specific evidence is regression-tested.
- [x] P8.05 Dirty `/home/ubuntu/dial-new` production checkout reconciled safely: exact conflicted index/worktree plus all three `vitest.config.ts` conflict stages were SHA-256-backed up under `~/.local/state/dial-recovery/production-reconcile-20260916T072737Z`, the pre-existing stash/patch was preserved, and the checkout was reset cleanly to unchanged canonical `origin/master` `fa7c655f12faf02a2b33cc15799069526bdda3a6`.
- [x] P8.06 Gap register, traceability and live execution board reconciled to current repository/live evidence; stale supply-chain/recovery assumptions removed and remaining external gates preserved fail-closed.
- [x] P8.07 Closure implementation committed on the authorized PR branch; Project Truth pre-commit evidence recorded and local verify/verify-pr GREEN. Signed-commit enforcement remains the separate P8.03 protected-master gate.
- [x] P8.08 Closure branch pushed to GitHub with force-with-lease only to replace the stale imported remote tip; remote head was bound to the authorized closure history.
- [x] P8.09 Closure PR #34 opened against protected `master`: `Close DIAL development-system readiness gaps`.
- [x] P8.10 Obsolete reverse audit-sync PR #33 was closed as conflicting and superseded by closure PR #34; unrelated historical/feature PRs were deliberately not closed blindly.
- [~] P8.11 PR #34 head `a4243fcf89018e9fc12dbf598ea63152d80657ec` has all five required GitHub contexts GREEN. The newer deterministic Stitch orchestration repair is locally full-verify GREEN at 46 files / 788 tests but is not yet committed/pushed, so fresh CI for that patch is still pending.
- [ ] P8.12 Merge through protected `master`; delete temporary branch after successful merge.

## Phase 9 — Deploy exact merged SHA

- [ ] P9.01 Record final merged `master` SHA and Project Truth fingerprint.
- [ ] P9.02 Deploy exact merged SHA to `dial-hermes-control`.
- [ ] P9.03 Deploy exact merged SHA/runtime subset to `vekl-worker`.
- [ ] P9.04 Deploy exact merged recovery subset to `oracle-admin` without disrupting SSH/OCI/Commander.
- [ ] P9.05 Re-run bootstrap `apply` twice to prove live idempotency.
- [ ] P9.06 Run one safe intentional drift + `repair` proof.
- [ ] P9.07 Run mandatory `--auth`/`--resume` workflow and capture opaque evidence.

## Phase 10 — Requalification and same-SHA role certificates

- [ ] P10.01 Clear obsolete `dial-development-root` BLOCKED_OWNER reason via typed/canonical control path.
- [ ] P10.02 Generate fresh control-plane fingerprint bound to final merged SHA.
- [ ] P10.03 Run official control-plane qualification.
- [ ] P10.04 Complete required stability/soak interval.
- [ ] P10.05 Run canonical finalizer.
- [ ] P10.06 Produce signed/fresh `dial-hermes-control` role report.
- [ ] P10.07 Produce signed/fresh `vekl-worker` role report.
- [ ] P10.08 Produce signed/fresh `oracle-admin` role report.
- [ ] P10.09 Produce signed/fresh provider-container role report.
- [ ] P10.10 Verify all four signatures, freshness windows and identical merged SHA.
- [ ] P10.11 Run whole-system aggregator with role-specific proofs; no arbitrary failure substitution.

## Phase 11 — Final owner-to-repository E2E

- [ ] P11.01 Send real benign owner instruction through intended WhatsApp/control channel.
- [ ] P11.02 Prove immediate Hermes acknowledgement/steering semantics.
- [ ] P11.03 Resolve current Project Truth revision.
- [ ] P11.04 Generate VEKL activation/capsule/KnowledgeResolutionTrace.
- [ ] P11.05 Exercise stale-context refusal.
- [ ] P11.06 Exercise deterministic GraphRAG bounded-neighbourhood retrieval.
- [ ] P11.07 Run live provider availability discovery and deterministic model selection.
- [ ] P11.08 Prove eligible heavy work executes provider-side.
- [ ] P11.09 Prove background/light work may execute on `vekl-worker` only within role policy.
- [ ] P11.10 Prove `oracle-admin` rejects development work.
- [ ] P11.11 Tie bounded repository mutation, tests, Git/PR/CI evidence to one correlation ID.
- [ ] P11.12 Deliver final owner notification through intended control channel.

## Phase 12 — Final audit and GREEN issuance

- [ ] P12.01 Produce `DIAL_DEVELOPMENT_SYSTEM_E2E_AUDIT_AND_GREEN_FLAG_REV2.md`.
- [ ] P12.02 Produce `DIAL_DEVELOPMENT_GREEN_FLAG.json` from measured evidence.
- [ ] P12.03 Bundle dependency versions, hashes, auth probes, MCPs, services, routes, tests, CI, network and recovery evidence.
- [ ] P12.04 Recompute gap severity/status counts; P0 blockers must equal zero.
- [ ] P12.05 Confirm no mandatory external gate remains.
- [ ] P12.06 Confirm no mandatory proof is stale or bound to an old SHA/fingerprint.
- [ ] P12.07 Only then emit exact final phrase: `DIAL DEVELOPMENT SYSTEM GREEN FLAG: DEVELOPMENT MAY COMMENCE`.

## Live closure notes — 2026-09-15T07:44:22Z

- Worker candidate services exposed and closed two additional defects: systemd argument quoting for JSON jobs and root UID remapping under hardened `ProtectSystem`/`ProtectHome`; both are fixed in the closure worktree and live-proven on `vekl-worker`.
- Latest structural candidate proof: 2,044 nodes / 2,282 edges with immutable `snapshot_hash`, `normalized_graph_hash`, `provider_graph_hash` and source manifest hash; authority is subordinate evidence only.
- Supply-chain pins now include exact Codex, Claude, Hermes, Desktop Commander, Node and Ubuntu package evidence. Temporary worker staging SHAs are test-only and must never be treated as final same-SHA certification.

## Live closure notes — 2026-09-15T08:35:24Z

- Supply-chain executable paths are now deterministic: WhatsApp pairing uses an integrity-complete lock plus a vendored Baileys runtime artifact; recovery Desktop Commander uses a complete lock and `npm ci --ignore-scripts`.
- Pinned toolbox image built successfully on the live ARM control host with Node 22.23.2/npm 10.9.8/Git 2.43/Python 3.12.3.
- Worker secret isolation is live-proven. Role-candidate certification exposed three additional bootstrap defects: Claude was incorrectly required on the worker, cross-host control/recovery gates made role reports circular, and E2 `cpu_total` used OCPU rather than host-visible logical CPUs. All three are corrected in the closure worktree.
- Worker candidate remains test-only on temporary staging SHAs. Final GREEN requires a signed report from the final merged `master` SHA; no staging candidate is accepted by the whole-system aggregator.

## Live closure notes — 2026-09-16T09:48:00Z

- Canonical Claude project MCP definitions were reconciled: duplicate user-scope remote Context7/Exa entries were backed up and removed; only the locked project-local wrappers remain. Claude account login is still required before its workspace approval UI can be reached.
- P5.12 was narrowed to a real provider-side gate: no Codex Cloud environment exists for this workspace and Claude Remote is behind interactive account authentication; control-host GitHub access is deliberately not substituted.
- Stitch repository-side closure exposed and repaired a real qualification gap. The governed non-writing provider stage now binds generation/quarantine/admission/AEF-consumption/screen-acceptance/fallback evidence to the current repository SHA, and stale-SHA proof reuse is rejected.
- Latest targeted Stitch/AEF regression: 2 files / 34 tests PASS. Latest complete real-host `npm run verify`: 46 files / 790 tests PASS; dedicated WhatsApp/recovery/certifier hardening and proof-chain tamper/SHA/coherence checks are included.

## Live closure notes — 2026-09-16T13:13:00Z

- Legacy self-chat owner control is fully retired. Only the dedicated `Dial Hermes Control` bot-mode session path remains and intentionally waits for owner number configuration/pairing.
- Control-host systemd hardening was reconverged live. The venue installer was repaired to rerun safely against its own append-only audit ledger; five previously stale units now satisfy the canonical sandbox properties.
- Reciprocal bounded recovery is freshly `PROVEN`, including the real R1 recovery-agent restart and all negative/refusal probes. The verifier now atomically persists `/var/lib/dial-control/state/two-way-recovery-verdict.json` mode 600 for deterministic certification consumption.
- VEKL Development Unit registry is deterministic at 309 units; graph rebuild is deterministic at 5,395 nodes / 16,882 edges; retrieval evaluation is 10/10 with recall=1 and precision_proxy=1.
- Fast control certification reached 127 PASS with remaining non-PASS states confined to genuine owner/external gates, final-SHA governance/requalification, and fast-mode-skipped full tests.
- Complete `npm run verify` is GREEN on the closure worktree: 46 files / 790 tests PASS.

## Current critical path

`P5 external auth gates (Stitch, Exa, Dial Hermes Control dedicated pairing, network overlays) -> P1.22 static closure review -> Phase 6 security/systemd -> Phase 7 full verification -> Phase 8 PR/CI/merge -> Phase 9 final-SHA deployment -> Phase 10 qualification/soak/certificates -> Phase 11 E2E -> Phase 12 GREEN`

## Live closure notes — 2026-09-15T11:35:42Z

- Owner instruction supersedes the prior setup-optional interpretation: `DEC-033` now requires every operational development-system capability to be installed/enrolled, configured, authenticated where applicable, live-probed and selection-ready for GREEN.
- Antigravity `agy` 1.2.0 is exact-version/SHA-256 installed on `dial-hermes-control`; its SSH Google OAuth session is currently waiting for owner authorization, after which live model discovery and HCX pairing qualification continue.
- Context7 and Exa are no longer provider-only conceptual connectors: deterministic local MCP runtimes are exact-locked. Context7 4.1.1 has passed real `resolve-library-id` and `query-docs` calls. Exa 3.4.1 is installed but requires an Exa API key for a functional local search canary.
- Operational `OPTIONAL_CAPABILITY` is now empty in the development manifest. Reference-only exclusions are explicit and non-selectable rather than being used to hide missing setup.
