# DIAL DEVELOPMENT SYSTEM — FFDRM FORENSIC REBASE AUDIT

**Audit ID:** DIAL-DS-FFDRM-REBASE-20260922  
**Method:** DIAL-FFDRM-R1 / PRD-DDP-R2  
**Authority:** OWNER_EXPLICIT — `auth-20260922-owner-ffdrm-development-system-rebase`  
**Repository:** `Vanguduza/dial-new`  
**Canonical master observed:** `1405daaa4b21b9ae35374282b191475e5bcc3ff6`  
**Retained-work consolidation baseline:** `gpt/dial-all-work-consolidation-20260922@c81ed32f8b79cb89ac7e61c4cd1af73aed03616d`  
**Forensic remediation branch:** `gpt/ffdrm-development-system-rebase-20260922`  
**Current state:** `FORENSIC_BUILD_BLOCKED`  
**Green flag:** **NOT ISSUED**

## 1. Executive conclusion

The DIAL Development System is materially advanced and contains a substantial deterministic development substrate: Project Truth, a universal project registry, project-scoped Development Packs, VEKL/GraphRAG, SPMRF shared memory and review, adaptive multi-harness execution, provider-first venue routing, governed frontend/design generation, execution receipts, Netcup control-plane migration, Oracle worker/recovery roles, CI/Project Truth enforcement and state-aware repository housekeeping.

That breadth is not sufficient under FFDRM.

This forensic rebase found that several of the strongest recent additions were not yet composed into one causal authority path. The most serious defects were:

1. the FFDRM implementation existed on a branch diverged from the 291-commit retained-work consolidation;
2. one DIAL repository certificate was being used as the forensic readiness reference for every project;
3. project identity did not consistently survive into adaptive task execution;
4. the universal Development Pack did not explicitly enforce all FFDRM F0-F15 dimensions;
5. recovery certification still required Tailscale although the canonical Netcup/Oracle topology had already moved to WireGuard;
6. orchestration provenance still encoded Oracle as authority after control authority migrated to Netcup;
7. universal E2E execution and final live runtime qualification remain unproven.

Items 1-6 now have repository remediation on this branch. Item 7 remains a hard blocker. The system must not begin normal project development until the remediation lineage is integrated, repository verification passes, the exact merged SHA is deployed/requalified, the DIAL Development System's own project pack earns `FORENSIC_BUILD_READY`, and the remaining live universal/provider/recovery gates pass.

## 2. Scope separation established by this audit

The DIAL Development System and the projects it develops are different readiness subjects.

```text
DIAL DEVELOPMENT SYSTEM
  own Product/System Truth
  own Development Pack
  own FFDRM F0-F15
  own runtime / recovery / provider qualification
        |
        +---- develops ----> dial-groceries
        +---- develops ----> dial-a-spare
        +---- develops ----> VAN
        +---- develops ----> DDE
        +---- develops ----> GTR Auto
        +---- develops ----> AECI Maintenance
        +---- develops ----> future projects
```

Each target project has its own repository baseline, Product Truth, Development Units, realization contracts, forensic evidence and content-bound certificate.

Therefore:

```text
SYSTEM_FORENSIC_BUILD_READY != PROJECT_FORENSIC_BUILD_READY
PROJECT_FORENSIC_BUILD_READY != SYSTEM_RUNTIME_QUALIFIED
REPOSITORY_PROVEN != RUNTIME_QUALIFIED
RUNTIME_QUALIFIED != OWNER_ACCEPTED
```

The DIAL product CT-1 / CT-2 / CT-7 contract-specificity gaps remain real preparation gaps for affected DIAL product work. They are no longer misclassified as proof that an unrelated VAN/DDE/GTR project cannot be prepared. Conversely, a green system runtime cannot authorize a project whose own pack is stale or blocked.

## 3. Canonical causal development path after remediation

Normal material development is now intended to follow one authority path:

```text
OWNER INTENT
→ REGISTERED PROJECT
→ PROJECT REPOSITORY BASELINE
→ PROJECT-SCOPED DEVELOPMENT PACK
→ FFDRM F0-F15
→ CONTENT-BOUND FORENSIC_BUILD_READY CERTIFICATE
→ SHARED DIAL SYSTEM RUNTIME GATE
→ DEVELOPMENT UNIT + VEKL/KRT
→ PROJECT-SCOPED TASK EXECUTION ENVELOPE
→ ADAPTIVE EXECUTION / PROVIDER-FIRST ROUTING
→ WORKTREE + LEASE/FENCING
→ IMPLEMENTATION
→ VERIFICATION + ADVERSARIAL REVIEW
→ ANTI-GAP / MUTATION
→ OBSERVABLE POSTCONDITION
→ EVIDENCE RECEIPT
→ TRUTH / PACK RECONCILIATION
```

If project identity, baseline SHA, pack content, FFDRM standard, Unit/knowledge bindings or task-envelope authority changes, execution must fail closed.

## 4. FFDRM F0-F15 audit posture

The statuses below are forensic audit posture, not a machine-issued certificate. A final `PASS` may be issued only by the project-scoped pack/certificate mechanism after repository integration and runtime evidence where applicable.

| Gate | Audit posture | Evidence / reason |
|---|---|---|
| F0 Owner intent & Product Truth | REPOSITORY EVIDENCE PRESENT | Owner authorization, Project Truth and DEC-045 bind FFDRM adoption. |
| F1 Development Unit decomposition | REPOSITORY EVIDENCE PRESENT | Development Unit registry and universal pack substrate exist; final system pack must bind current hashes. |
| F2 Feature & surface coverage | PARTIAL | DIAL product graphs are extensive; universal development-system capability-to-causal-path coverage still needs final four-class E2E proof. |
| F3 Authority model | REMEDIATED — REQUALIFY | Project-scoped certificate and project identity are now threaded through plan/envelope/fabric metadata. |
| F4 State & persistence model | PARTIAL | Project packs, SPMRF, state-store and durable orchestration exist, but the development-system forensic artifact has not yet been compiled against the final SHA. |
| F5 Causal path proof | BLOCKED | Universal E2E project execution is explicitly pending; architecture alone is not causal proof. |
| F6 Research & tooling adequacy | REPOSITORY EVIDENCE PRESENT | VEKL, research qualification, build/adopt policy and governed tooling exist; per-project research remains project-scoped. |
| F7 Architectural coherence | REMEDIATED — REQUALIFY | Global certificate alias, provider-specific authority naming and stale overlay authority were corrected. |
| F8 Failure/degradation/recovery | BLOCKED RUNTIME | Repository failure/recovery machinery exists; final WireGuard reciprocal recovery drill is still required. |
| F9 Security/privacy/secrets | REPOSITORY EVIDENCE PRESENT | Least-privilege execution, secret boundaries, typed owner control and provider isolation exist; final runtime environment must be re-scanned/certified. |
| F10 Verification/evidence contract | PARTIAL | CI and mutation tests exist, but this remediation branch needs independent CI and final merged-SHA verification. |
| F11 Adversarial forensics | ACTIVE / BLOCKED | This audit found material defects and remediated them; adversarial re-run must occur after integration. |
| F12 Symbiotic loop proof | PARTIAL / MANDATORY | Development System is agentic. Architecture supports observe/context/reason/authorize/execute/reconcile/learn, but final system pack must evidence the closed loop and prove learning cannot widen privilege. |
| F13 Production reachability | BLOCKED RUNTIME | Provider execution/ingress plus live universal project path remain incomplete. |
| F14 Anti-gap/mutation | PARTIAL | New project-certificate isolation, causal-path mutation, symbiotic-loop mutation, standard-drift and WireGuard mutation guards were added; final whole-system mutation pass is still required. |
| F15 FORENSIC_BUILD_READY | BLOCKED | Prior blocked gates, exact-SHA system pack and runtime qualification prevent certification. |

## 5. Repository remediation completed in this branch

### 5.1 One Development Pack authority

The existing universal Development Pack is retained as the sole project-preparation substrate. FFDRM is implemented as additional executable F0-F15 gates in `development-pack-gates.mjs`; no second parallel project-truth/readiness store is created.

The pack now cannot report `build_ready=true` when FFDRM is blocked.

### 5.2 Project-scoped forensic certificates

`predevelopment-forensic-gate.mjs` resolves the selected project and reads:

```text
projects/<project_slug>/development-pack/pack.json
```

It verifies project identity and repository baseline and derives a content-bound certificate from:

- project ID/slug;
- target repository expected and observed SHA;
- pack ID/revision/content hash;
- FFDRM standard/version/blob;
- executable F0-F15 states;
- preparation blockers;
- explicit runtime-qualification separation.

A certificate is therefore not a reusable static DIAL file.

### 5.3 Task-envelope authority binding

Task Execution Envelopes now include:

```text
project_slug
project_id
predevelopment_standard_id
predevelopment_standard_version
predevelopment_certificate_hash
predevelopment_fingerprint
```

The envelope re-evaluates those bindings before continued execution. Certificate/standard/project drift refuses stale execution.

### 5.4 Project identity on the real execution path

Adaptive planning and reroute execution now carry `project_slug`. Execution-fabric project binding also carries forensic standard/certificate-source metadata. Long-lived project metadata remains separate from per-task certificate hashes.

### 5.5 Provider-neutral authority semantics

The logical origin is now `EXTERNAL_DIAL_ORCHESTRATOR`, not `EXTERNAL_ORACLE_ORCHESTRATOR`.

Physical placement may move between Oracle, Netcup or a future owner-authorized host without changing the semantic identity of the DIAL control authority. Qualification still binds the actual host role/fingerprint; this change removes provider identity from the authority name.

### 5.6 Recovery topology reconciliation

The canonical cross-cloud overlay is `wg-dial` WireGuard. The following now agree:

- bootstrap manifest;
- supply-chain package pin;
- Netcup image bootstrap;
- network certification probe;
- reciprocal recovery verification script;
- bootstrap tests;
- bootstrap README;
- green execution board;
- gap register.

Legacy Tailscale state is no longer a readiness authority. WireGuard configuration alone is still insufficient: final reciprocal recovery must be exercised and evidenced.

## 6. Anti-gap evidence added

Repository tests now attempt to disprove readiness by deliberately breaking guarantees:

- project A's certificate cannot satisfy project B;
- removing a proven production caller fails F5 and F15;
- breaking the system symbiotic outcome-observation leg fails F12;
- machine standard gate IDs must equal executable gate IDs;
- missing/stale project pack fails closed;
- stale task forensic fingerprint invalidates execution;
- missing WireGuard configuration/peers fails recovery-overlay qualification.

This is intentionally stronger than checking that classes or JSON files exist.

## 7. Remaining blockers before development may start

### B1 — canonical repository integration

This branch is based on the retained-work consolidation rather than old master, but it is not canonical until the remediation PR is integrated into the consolidation lineage and that consolidated lineage is merged to protected master without tree loss.

### B2 — repository verification on the integrated head

All normal verification, Project Truth, pack/manifest integrity, FFDRM mutation tests, source-map, boundary/cohesion checks and production build must pass on the integrated head.

### B3 — DIAL Development System project pack

On the deployed control plane, the `dial` / `dial-development-system` Development Pack must be seeded or rebaselined against the exact integrated SHA and populated with evidence sufficient for all applicable FFDRM gates. Only that pack may emit the system's `FORENSIC_BUILD_READY` certificate.

### B4 — universal four-class conformance

The same pipeline must be demonstrated without special-case code for:

1. a DIAL product project;
2. DDE as an independent development-system project;
3. an existing non-DIAL application;
4. a clean-slate unrelated project.

The proof must include project isolation and must demonstrate that DDE is not required for DIAL system function.

### B5 — provider-first live execution

At least one eligible governed provider execution surface must complete a real bounded project task through the provider-first route, with current auth, project binding, signed venue decision and immutable execution receipt. Required authenticated provider ingress must be proven where that surface needs access to DIAL MCPs.

### B6 — recovery qualification

The final deployed SHA must prove `wg-dial`, peer reachability and bounded reciprocal recovery between the canonical control plane and the required Oracle recovery nodes. Recovery evidence from a superseded topology/SHA is not sufficient.

### B7 — exact-SHA runtime qualification

Control services, runtime identities, VEKL, SPMRF, owner control, execution fabric and required capabilities must be requalified after deployment. Repository evidence cannot impersonate this gate.

## 8. Start-development rule

The development green flag should be issued only when:

```text
DIAL_DEVELOPMENT_SYSTEM.FORENSIC_BUILD_READY
AND DIAL_DEVELOPMENT_SYSTEM.RUNTIME_QUALIFIED
AND UNIVERSAL_E2E_CONFORMANCE_PROVEN
AND REQUIRED_RECOVERY_PROVEN
AND REQUIRED_EXECUTION_PATH_AVAILABLE
```

After that, a specific project may start normal material development only when:

```text
PROJECT.FORENSIC_BUILD_READY
AND PROJECT TASK ENVELOPE CURRENT
AND REQUIRED PROJECT RUNTIME/EXTERNAL GATES SATISFIED
```

A blocked project does not invalidate unrelated ready projects. A ready project does not override a blocked shared development system.

## 9. Required closure sequence

```text
FORENSIC REMEDIATION BRANCH
→ INTEGRATE INTO RETAINED-WORK CONSOLIDATION
→ CI / PROJECT TRUTH / MANIFEST / MUTATION GREEN
→ VERIFY NO CANONICAL TREE LOSS
→ MERGE CONSOLIDATED LINEAGE TO PROTECTED MASTER
→ DEPLOY EXACT MASTER SHA TO DIAL CONTROL
→ REBASELINE DIAL-DEVELOPMENT-SYSTEM PACK
→ RUN F0-F15 + ADVERSARIAL RE-AUDIT
→ RUN FOUR-CLASS UNIVERSAL CONFORMANCE
→ QUALIFY PROVIDER-FIRST LIVE PATH
→ QUALIFY WIREGUARD + RECIPROCAL RECOVERY
→ ISSUE SYSTEM FORENSIC CERTIFICATE
→ ISSUE RUNTIME QUALIFICATION
→ DEVELOPMENT SYSTEM GREEN
→ ADMIT/QUALIFY EACH PROJECT INDEPENDENTLY
```

## 10. Audit limitation

The repository and GitHub state were directly inspected. The authorized Remote Desktop Commander device records visible during this audit were offline, so this session could not independently run the final live host qualification. No runtime pass is inferred from repository artifacts.

## 11. Final audit disposition

**Current:** `FORENSIC_BUILD_BLOCKED / REPOSITORY_REMEDIATION_ACTIVE`.

The repository architecture is now closer to deterministic composition than it was at audit start, specifically because project preparation, shared-system readiness and runtime qualification have been separated and then rebound through explicit project identity and content fingerprints.

**Not yet authorized:** normal material project development.

The next legitimate promotion is not “complete”; it is:

```text
REPOSITORY_REMEDIATION_ACTIVE
→ REPOSITORY_PROVEN
→ SYSTEM FORENSIC_BUILD_READY
→ RUNTIME_QUALIFIED
→ DEVELOPMENT SYSTEM GREEN
```

Only then should project implementation fan out.
