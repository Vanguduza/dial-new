# Hermes ARTEMIS + OpenViking Integration

## Status

Engineering integration is implemented on the DIAL control-plane integration branch. Live qualification is intentionally separate:

- **ARTEMIS engineering plane:** implemented and pinned as a Hermes subordinate Android executor, not a peer control plane. Live host installation requires the Netcup `dial-control` host to be online with the qualified Android host dependencies present.
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

### Hermes subordinate boundary

ARTEMIS is a **Hermes subordinate Android executor**. The upstream ARTEMIS MCP is never registered directly with Hermes, Codex, Claude, Antigravity, VAN, or another harness. DIAL consumes the pinned upstream MCP only through an internal allowlisted bridge, and exposes a separate governed MCP: `dial_android_testing`.

Hermes now delegates to ARTEMIS for the Android capabilities ARTEMIS is specifically strong at while retaining admission, trace ownership, evidence and Project Truth authority:

| Upstream ARTEMIS capability | Hermes-governed tool | Purpose |
| --- | --- | --- |
| `mobile_run_task` | `android_task_start` | Asynchronous Flash/Pro automation, locked-app execution, optional APK install, verification presets, explorer depth, long-horizon and continuous workflows |
| `mobile_manage_task` | `android_task_manage` | Poll progress, inject guidance, gracefully release continuous loops, or stop a Hermes-owned task |
| `mobile_get_device_state` | `android_device_state` | Live screenshot or accessibility/OCR hierarchy from an admitted device |
| `mobile_inspect_trace` | `android_trace_inspect` | Trace summary/search, per-step screenshots/action overlays, and step replay/details |
| `mobile_diagnose` | `android_diagnose` | Environment/device diagnosis, credential probe, end-to-end device probe, safe self-heal and allowlisted AVD launch |

The existing `android_test_run` remains the synchronous certification-oriented path with optional Gradle build, APK binding/install, ARTEMIS doctor preflight, UI exercise, screenshot/Logcat evidence and SPMRF handoff.

The broker owns device and AVD admission, project/repository binding, Hermes task ownership, synchronous device leases, ARTEMIS asynchronous per-device locks, evidence capture, terminal evidence sealing, and project-memory handoff. ARTEMIS output remains evidence rather than Project Truth.

### Routing discipline

Hermes should use ARTEMIS instead of recreating these Android functions elsewhere:

- **Flash** for routine deterministic UI paths and fast cross-app automation.
- **Pro** for exploration, recovery, ADB/log diagnosis, checkpoint or strict verification, complex state, long-horizon workflows and continuous monitoring.
- **Device state** before guessing at the live UI.
- **Trace inspection** to verify what ARTEMIS actually saw and did.
- **Diagnosis** first when ARTEMIS, ADB, the accessibility helper, emulator, model credential or device readiness is uncertain.
- **Deterministic certification run** when build/install/evidence binding is required.

ARTEMIS may use its internal Pro ADB diagnostics, video analysis and compressed history, but DIAL exposes no arbitrary shell tool and never grants ARTEMIS Project Truth authority.

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

### Device, emulator and task admission

The default admission file is:

`/var/lib/dial-control/config/android-testing-devices.json`

It has separate `devices` and `avds` allowlists, both empty on first install. Therefore installation alone never implies a real phone or emulator is authorized.

For device interaction, the serial must be admitted. If the caller omits a serial, Hermes auto-selects only when exactly one connected admitted device is ready; with multiple ready devices the caller must choose. Synchronous certification uses the DIAL exclusive lease, while asynchronous ARTEMIS work uses ARTEMIS per-device execution locks.

Every asynchronous task is recorded under `/var/lib/dial-control/android-testing/tasks`. Status control and trace inspection are refused for trace IDs that were not created through the Hermes broker. A `dial-artemis-supervisor.timer` polls Hermes-owned tasks every 60 seconds, satisfying ARTEMIS's fallback-poll discipline even when no interactive harness is watching. When a Hermes-owned task becomes completed, failed or cancelled, the broker seals a DIAL evidence bundle and creates only an SPMRF `TEST_EVIDENCE` candidate.

`android_diagnose` can launch only explicitly allowlisted AVDs. Safe ARTEMIS self-heal actions stay behind the Hermes broker. The Android plane does not create an unrestricted internet-facing ADB listener.

The managed ARTEMIS web console is not registered at all. The installer removes/disables any prior `dial-artemis-ui.service`, so the estate has no supported parallel ARTEMIS control surface. Hermes is the supported control boundary.

## VAN embedded ARTEMIS console

The upstream ARTEMIS Showcase/Admin web surface is now prepared as a **loopback-only subordinate service** on Netcup and is reachable only through the Hermes-authenticated console proxy. The raw ARTEMIS UI is never bound to the public interface and is never exposed directly to VAN.

The console proxy binds to the DIAL private overlay on port `9135`, authenticates every browser-proxy request with a secret stored outside Git, strips browser Origin/forwarding headers before reaching ARTEMIS, and keeps the upstream server on `127.0.0.1:9146`.

The first integration mode is deliberately `OBSERVE_ONLY`: GET/HEAD/OPTIONS traffic is proxied so VAN can embed ARTEMIS live device state, task/trace views, replay material and diagnostics, while direct upstream task mutation is rejected with `hermes_governed_control_required`. Task start/stop/instruction injection/diagnosis continue through `dial_android_testing`, preserving ARTEMIS as a Hermes subordinate rather than creating a second control authority.

The VAN Android/Gateway side may mint a short-lived owner-device-bound web session and proxy this private service into an in-app WebView. The private Netcup bearer token must remain server-side; it is never sent to Android.

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
- installs the Hermes-only ARTEMIS bridge and governed MCP,
- starts the raw ARTEMIS web server on loopback only and exposes an authenticated private-overlay proxy for VAN in observe-only mode; mutation remains on the Hermes Android broker,
- otherwise reports the host dependency gap instead of silently auto-installing unpinned packages.

The Netcup image bootstrap now installs the Android host dependencies (`adb`, `scrcpy`, `ffmpeg`) and Docker required by the OpenViking container, and adds the service user to the Docker group before zero-touch postboot activation.

This preserves the development-system supply-chain rule: a missing external dependency is a visible qualification gap, not permission to execute an unreviewed `curl | bash` installer.

## Verification

Repository tests cover:

- admitted-only OpenViking projection,
- project-scoped semantic target URIs,
- semantic retrieval,
- OpenViking outage fallback to local SPMRF,
- Android device admission,
- Android evidence capture,
- SPMRF `TEST_EVIDENCE` candidate semantics,
- Hermes-owned ARTEMIS asynchronous task lifecycle,
- refusal to manage foreign ARTEMIS traces,
- governed device-state and diagnostic routing.

Live qualification still requires:

1. `dial-control` reachable,
2. OpenViking model configuration completed and health proven,
3. the pinned ARTEMIS tree installed with hardening applied,
4. at least one explicitly admitted Android device connected,
5. one real synchronous build/install/exercise/evidence run,
6. one real asynchronous Flash/Pro task lifecycle including trace inspection,
7. review of the resulting evidence bundles.

Until those occur, the correct state is **engineering integrated / live qualification pending**, not production-certified.
