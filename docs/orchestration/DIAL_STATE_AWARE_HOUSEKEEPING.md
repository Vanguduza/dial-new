# DIAL State-Aware Housekeeping Fabric v1

Status: **LOCKED / owner-authorized**
Authority: Hermes CONTROL_AUTHORITY under Project Truth / AEF / repository evidence
Policy: `DIAL_STATE_AWARE_HOUSEKEEPING_V1`

## 1. Purpose

DIAL housekeeping is lifecycle garbage collection, not age-based deletion.

A resource becomes deletable because its role in the project or mission has ended, its useful result has been admitted to an authoritative destination, and its reconstructability or evidence requirements are satisfied. Time-based scheduling exists only as a reconciliation mechanism for lifecycle events that were missed while a host was offline or a previous cleanup attempt failed.

The governing invariant is:

> **DELETE_BY_LIFECYCLE_STATE_NOT_BY_AGE**

Disk pressure may accelerate collection of resources that are already proven safe to delete. Disk pressure must never convert an unproven or protected resource into a deletable resource.

## 2. Authority model

Hermes remains the policy authority. The local `dial-housekeeping` executor is subordinate and cannot invent lifecycle state.

Authoritative inputs include:

- Project registry lifecycle state;
- persistent mission state;
- Project Truth and admitted evidence;
- AEF worktree leases and fencing;
- development execution receipts;
- explicit Android build/test closure evidence;
- repository remote state;
- host role;
- resource lifecycle entries.

The executor is deliberately incapable of deciding that a resource is safe merely because it is old, large, or located in a conventional cache/build directory.

## 3. Resource classes

Every tracked resource has one of the following classes:

- `FOUNDATION` — reusable universal tooling. Never automatically deleted.
- `CANONICAL` — authority/evidence/data. Never automatically deleted.
- `PERSISTENT_OPERATIONAL` — active operational state. Never automatically deleted.
- `DERIVED` — reproducible output that requires closure evidence before collection.
- `EPHEMERAL` — mission/session scratch state that may be collected after its lifecycle ends.
- `CACHE` — reconstructable cache state that may be collected after lifecycle policy permits.

Examples of FOUNDATION include Android SDK, JDK, Node, Python, Git, Docker, Hermes, Codex, Claude Code, ADB, CMake and the reusable Playwright runtime.

Examples of CANONICAL include Project Truth, admitted VEKL knowledge, Hermes state, execution receipts, owner authority records, VATI/trading ledgers, n8n/PostgreSQL authoritative state, signed release artifacts and required evidence.

## 4. Lifecycle

Resources move through:

```text
ACTIVE
  -> WAITING_ADMISSION
  -> GC_ELIGIBLE
  -> DELETED

failure/revocation/uncertainty
  -> QUARANTINED

protected or intentionally persistent
  -> RETAINED
```

`GC_ELIGIBLE` is necessary but not sufficient for deletion. The local executor re-proves safety immediately before destructive action.

## 5. Mandatory deletion gates

A deletion must satisfy all applicable gates:

1. the resource is registered or comes from an explicitly bounded discovery mechanism;
2. its class is allowed to be deleted on the current host;
3. the path is inside the declared resource;
4. the path does not cross a protected prefix;
5. no active AEF lease/fencing authority references it;
6. no active process is using it;
7. the lifecycle trigger is satisfied;
8. required evidence exists;
9. reconstructability is proven when required;
10. host-specific protected semantics do not apply.

If any proof is absent, cleanup fails closed.

## 6. Repository retirement

A local repository can be automatically retired only when the project explicitly opted into `delete_local_repo_when_complete` and the project/mission is COMPLETE.

Immediately before deletion, the executor proves:

- working tree clean;
- no stash;
- no additional Git worktrees;
- no active AEF lease;
- `origin` is GitHub;
- `git fetch --prune origin` succeeds;
- every local branch tip is reachable from at least one `origin/*` remote branch;
- the resource is not the currently active DIAL control repository;
- no process is using the path.

A repository with an untracked file, local-only commit, unpushed branch, stash, additional worktree, failed fetch or non-GitHub origin is retained.

This is a reconstructability proof, not a timeout.

## 7. AEF worktree closure

AEF worktrees are registered when their write lease is issued.

A successful worker result does not itself make the worktree disposable. It becomes GC eligible only when deterministic integration admission produces an execution receipt. Admission attaches that receipt hash to the resource. The write lease is then released.

Deletion is still blocked until:

- integration is admitted;
- the AEF lease is no longer ACTIVE;
- the worktree is clean;
- no process uses the path.

Revoked/expired worker worktrees default to QUARANTINED rather than being destroyed automatically, because they may contain useful failure evidence or unadmitted work.

## 8. Android build/test closure

Android SDKs, JDKs, Gradle wrapper tooling, signing material and universal build tools are FOUNDATION and protected.

Per-build output is DERIVED.

A build tree becomes GC eligible only when a build/test harness records:

- `build_complete=true`;
- `test_evidence_sealed=true`;
- the evidence reference;
- retained final APK/AAB reference when applicable.

The lifecycle entry is recorded through:

```text
dial-resource android-complete   --project <project>   --task <task>   --build-path <build tree>   --evidence <sealed test evidence>   --artifact <retained APK/AAB reference>
```

This marks only the declared build tree eligible. It does not remove Android SDK, JDK, Gradle wrapper or shared toolchain state.

## 9. Host policy

### dial-control

Mode: `FULL_STATE_AWARE`

May collect DERIVED, EPHEMERAL and CACHE resources after proof.

Must protect Hermes state, Project Truth, admitted shared memory, VEKL admission/capsules, owner credentials, recovery state and the active DIAL repository.

### vekl-worker

Mode: `VEKL_WORKER`

May collect DERIVED, EPHEMERAL and CACHE resources.

Raw/rejected research may be deleted only after the relevant admission/provenance state establishes that the retained canonical result is sufficient. Admitted graph/capsule/provenance state is protected.

### van-trading-core

Mode: `TRADING_CONSERVATIVE`

May collect DERIVED, EPHEMERAL and CACHE resources only.

The following semantics are absolute deny rules even if a producer misclassifies the resource:

- `VATI_LEDGER`
- `TRADING_DATABASE`
- `N8N_DATABASE`
- `ACTIVE_BROWSER_SESSION`

### oracle-admin

Mode: `RECOVERY_ONLY`

May collect only EPHEMERAL and CACHE resources.

Development repositories and development work should not exist there; the housekeeping system does not use cleanup as an excuse to normalize role drift.

## 10. Protected paths

The policy hard-protects at minimum:

- `/var/lib/dial-control/secrets`
- `/var/lib/dial-control/state`
- `/var/lib/dial-control/missions`
- `/var/lib/dial-control/approvals`
- admitted shared memory;
- execution receipts;
- VEKL admission/capsules;
- `/etc/dial`;
- `/etc/wireguard`;
- OCI recovery tooling;
- JDK installations;
- Android SDK installations;
- Gradle wrapper tooling.

Protected class and semantic rules remain binding even when a path is outside these prefixes.

## 11. Execution model

Primary execution is event-driven.

When a resource becomes `GC_ELIGIBLE`, `resource-lifecycle-registry.mjs` writes a trigger under the host-local housekeeping state. `dial-housekeeping.path` starts `dial-housekeeping.service`.

The service:

1. reads the current lifecycle registry;
2. evaluates only `GC_ELIGIBLE` entries;
3. re-proves safety;
4. deletes only safe resources;
5. emits an immutable receipt;
6. marks the resource DELETED;
7. quarantines execution failures.

A 30-minute `dial-housekeeping.timer` exists only as a reconciliation fallback. It is not the deletion policy.

## 12. Evidence and receipts

Every destructive result writes:

- resource identity;
- host;
- class/type;
- path;
- evaluation outcome;
- reasons;
- bytes reclaimed when measurable;
- timestamp;
- deletion/quarantine result.

Receipts are stored beneath the host-local housekeeping state and are append-recorded in the housekeeping event stream.

## 13. Disk pressure

Disk pressure does not decide safety.

Thresholds are operational urgency only:

- below 65%: normal lifecycle collection;
- 65–75%: routine state-aware collection;
- 75–85%: prioritize already-safe CACHE resources;
- 85–92%: prioritize all already-safe regeneratable resources;
- above 92%: emergency sweep of already-safe resources and owner attention.

Protected/unproven resources remain protected at every threshold.

## 14. Bootstrap placement

The capability is installed automatically on the final four-VM estate.

- Netcup `dial-control`: installed during `bootstrap-host.sh`, and image bootstrap fails if the CLI/path/timer are absent.
- Oracle `vekl-worker`: installed by the worker bootstrap and also distributed by GitHub zero-touch convergence for the existing VM.
- Oracle `oracle-admin`: installed by recovery provisioning and also distributed by GitHub zero-touch convergence for the existing VM.
- Oracle `van-trading-core`: distributed automatically by GitHub zero-touch convergence.

The GitHub zero-touch workflow packages the exact repository implementation and installs it through OCI Run Command, so the existing Oracle estate does not require manual housekeeping setup.

## 15. Rollback and failure behavior

Housekeeping is fail-closed.

If the lifecycle registry is unavailable, policy is invalid, process-use proof fails, GitHub reconstructability cannot be proven, AEF state is ambiguous, or a host profile is missing, destructive cleanup does not proceed.

Disabling the path/timer stops automatic collection without altering canonical state. The lifecycle ledger and receipts remain available for diagnosis.

## 16. Non-goals

This subsystem does not:

- replace Project Truth;
- replace AEF leases/fencing;
- decide project completion itself;
- delete canonical evidence;
- infer safe deletion from age;
- make oracle-admin a development host;
- prune arbitrary databases/volumes;
- treat disk pressure as authority;
- perform broad `rm -rf` scans over unregistered filesystem content.
