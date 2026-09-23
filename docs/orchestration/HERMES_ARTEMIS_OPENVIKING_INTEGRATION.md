# Hermes ARTEMIS + OpenViking Integration

## Status

Engineering integration is implemented on the DIAL control-plane integration branch. Live qualification is intentionally separate:

- **ARTEMIS engineering plane:** implemented and pinned. Live host installation requires the Netcup `dial-control` host to be online with the qualified Android host dependencies present.
- **ARTEMIS physical-device certification:** blocked until at least one Android device is explicitly admitted and connected through the governed ADB transport.
- **OpenViking engineering plane:** implemented and pinned. The installer prepares a secure local service and refuses activation until `ov.conf` contains a working embedding model and VLM configuration.
- **Project authority:** unchanged. Neither ARTEMIS nor OpenViking can advance product truth or gates by themselves.

No milestone is represented as physically verified unless live evidence exists.

## Authority model

The authority order remains:

1. canonical repository and Project Truth
2. machine registries and evidence
3. current Git/worktree
4. VEKL admitted knowledge
5. checkpoint/handoff
6. admitted SPMRF shared project memory
7. OpenViking semantic projections and harness-native/session memory

Hermes remains the control authority. OpenViking and ARTEMIS are subordinate services.

## Android testing plane

### Boundary

The upstream ARTEMIS MCP is **not** exposed to Hermes, Codex, Claude, Antigravity, VAN, or another harness. DIAL exposes only:

- `android_testing_status`
- `android_test_run`

through `agent-system/orchestration/android-testing-mcp.mjs`.

That broker owns device admission, exclusive leases, build/install constraints, evidence capture, and project-memory handoff.

### Upstream pin and hardening

ARTEMIS is pinned to:

`google/artemis@371aa6df56880643da57b30da936e9812fb0ec66`

with reviewed `uv.lock` Git blob:

`dc2d35b8c284055c92ff1cd2560c8201e648bf9f`

The upstream tree is locally patched by `DIAL_ARTEMIS_SHELL_HARDENING_V1`. The patcher:

- refuses any upstream commit other than the reviewed commit,
- validates Android package names before package-bearing shell commands,
- shell-quotes complete URL arguments,
- fails closed if the reviewed source snippets drift.

The raw ARTEMIS MCP remains disabled even after hardening.

### Deterministic run

A governed Android run can perform:

1. optional Gradle build using a validated task name,
2. APK repository-containment check,
3. APK SHA-256 binding,
4. ADB install,
5. ARTEMIS autonomous UI exercise,
6. final screenshot capture,
7. Logcat capture,
8. structured run summary,
9. SPMRF `TEST_EVIDENCE` candidate creation.

A test result is evidence, not authority. Its SPMRF entry remains `CANDIDATE` until reconciled/admitted by the existing memory authority path.

### Device admission

The default admission file is:

`/var/lib/dial-control/config/android-testing-devices.json`

The installer creates it empty. Therefore installation alone never implies a real phone is available.

Every test run requires:

- a syntactically valid device serial,
- that serial in the admission set,
- an exclusive device lease,
- an already established governed ADB transport.

The Android testing plane does not create an unrestricted internet-facing ADB listener.

## OpenViking memory plane

### Deployment boundary

OpenViking runs only on `dial-control`, behind loopback:

`127.0.0.1:1933`

The pinned image is:

`ghcr.io/volcengine/openviking@sha256:4f33751b4541d79fa2a53284d7e9e1bf6cf0a7504849f3d3a2f1629cc629e52c`

It runs as a separate AGPL service boundary with VikingBot disabled. Persistent state is held under:

`/var/lib/dial-control/openviking`

Its root API key is generated/stored outside Git under:

`/var/lib/dial-control/secrets/openviking-root-api.key`

The repository contains no API key, model credential, or user secret.

### Activation gate

On first preparation the installer creates an `ov.conf` skeleton and intentionally returns:

`OPENVIKING_ACTIVATION=PENDING_MODEL_CONFIG`

until the configuration contains:

- `embedding.dense.provider`
- `embedding.dense.model`
- `vlm.provider`
- `vlm.model`

and retains `server.root_api_key` as the environment placeholder.

The model/provider credentials are an external operational prerequisite and are never fabricated by the bootstrap.

After local health passes, the installer activates the OpenViking provider already present in the pinned Hermes build and stores the local connection settings in the protected Hermes environment.

### Shared project memory projection

OpenViking does not replace SPMRF.

Only **ADMITTED** SPMRF records are projected into:

`viking://user/<user>/memories/dial-projects/<project>/...`

Candidate records are never projected. Each projection carries its SPMRF provenance, admission authority, repository SHA and explicit non-authoritative marker.

The projection worker runs from:

`agent-system/orchestration/openviking-projector.mjs`

and maintains a monotonic local projection cursor under the control home.

### Retrieval for every harness

The existing model-neutral shared-memory MCP now exposes:

- `project_memory_semantic_search`
- `project_memory_semantic_status`

so the same semantic context layer is available to every harness that already consumes SPMRF.

This includes the local Hermes/Codex/Claude harnesses and the Trading Core harnesses that enter the SPMRF plane through their existing forced-command SSH peer. No Trading Core process needs direct OpenViking authority or the OpenViking service exposed over the estate network.

The shared context resolver federates OpenViking results into the normal context capsule. The cache identity includes the OpenViking projection cursor and availability state so a newly projected memory invalidates stale semantic context deterministically.

### Failure behavior

OpenViking is fail-open **only for semantic retrieval**. If it is down:

- Project Truth remains available.
- Git/repository evidence remains available.
- VEKL remains available.
- SPMRF admitted local memory remains available.
- the semantic OpenViking section reports degraded/unavailable.

It must never convert an outage into a fabricated empty truth state or silently overwrite SPMRF.

## Netcup convergence

`deploy/netcup/hermes-control/postboot-converge.sh --activate` now includes both subordinate planes.

OpenViking:
- prepares deterministically on every convergence,
- activates only when model configuration is complete,
- fails the activation on unexpected service/install errors,
- reports the expected model-configuration gate explicitly.

ARTEMIS:
- converges when `adb`, `scrcpy`, and `ffmpeg` are already present,
- otherwise reports the host dependency gap instead of silently auto-installing unpinned packages.

This preserves the development-system supply-chain rule: a missing external dependency is a visible qualification gap, not permission to execute an unreviewed `curl | bash` installer.

## Verification

Repository tests cover:

- admitted-only OpenViking projection,
- project-scoped semantic target URIs,
- semantic retrieval,
- OpenViking outage fallback to local SPMRF,
- Android device admission,
- Android evidence capture,
- SPMRF `TEST_EVIDENCE` candidate semantics.

Live qualification still requires:

1. `dial-control` reachable,
2. OpenViking model configuration completed and health proven,
3. the pinned ARTEMIS tree installed with hardening applied,
4. at least one explicitly admitted Android device connected,
5. one real build/install/exercise/evidence run,
6. review of the resulting evidence bundle.

Until those occur, the correct state is **engineering integrated / live qualification pending**, not production-certified.
