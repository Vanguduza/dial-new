# DIAL Hybrid MCP + Direct SSH Multi-VM Control Plane — Rev 1

Status: implementation authority for `feat/hybrid-mcp-ssh-control-plane`.

## 1. Invariant
Transport availability never implies workload permission. Every path—MCP, direct SSH, relay SSH, Desktop Commander, OCI Run Command, Hermes or WhatsApp—must be admitted against the target host's immutable role before execution.

## 2. Node roles

- `oracle-admin`: `RECOVERY_CONTROL_ONLY`. Control-plane MCP, policy/host registry, SSH broker/transport, OCI control, policy/audit ledger, diagnostics and recovery only. It is never a DIAL development worker, build host, test host, VEKL worker or production runtime.
- `dial-hermes-control`: `DIAL_HEAVY_DEVELOPMENT`. Active DIAL development, heavy builds/tests, model workers and Hermes runtime. This revision does not modify the live host.
- `oracle-admin-v2`: `BACKGROUND_ENGINEERING`. Bounded light background work such as VEKL preparation, light indexing, documentation processing and recovery. It is not eligible for heavy development.

## 3. Client model

ChatGPT, Claude and Hermes are authenticated MCP clients/actors, not privilege classes. WhatsApp is an owner-control channel into Hermes; its messages are normalized to `OWNER_STEER` envelopes and then use the same MCP/policy plane. Owner authority can change intent and Project Truth, but cannot silently bypass host safety invariants.

## 4. Request flow

`client -> DIAL Control MCP -> workload classification -> host registry -> route selection -> transport -> host-side guard -> cgroup/execution -> audit evidence`.

Preferred transport for a non-local target is direct SSH, then relay SSH, then OCI Run Command when policy permits. Transport fallback never escalates workload permission or privilege.

## 5. Workload routing

`CONTROL` routes only to `oracle-admin`. `INTERACTIVE_DEV`, `HEAVY_BUILD`, `TEST` and `MODEL_WORKER` route to `dial-hermes-control`. `VEKL_LIGHT`, `INDEXING_LIGHT`, `DOC_PROCESSING` and background knowledge prefer `oracle-admin-v2`. Recovery can use the E2 recovery peers under existing R0-R3 authority limits.

## 6. Command boundary

`guarded-command.mjs` classifies known command signatures and refuses ambiguous requests. On `oracle-admin`, project installs, builds, tests, full verification, GraphRAG/Graphify rebuilds and VEKL rebuilds are refused. Diagnostics, OCI control, SSH brokerage and Git metadata reads remain admissible.

No generic arbitrary-shell tool is exposed by the MCP server. Semantic tools expose routing, host policy, control status and command admission. Execution transports remain internal implementation details.

## 7. Worker eligibility

`oracle-admin.worker_eligible=false` and `background_worker_eligible=false` are explicit negative capabilities. `oracle-admin-v2.worker_eligible=false` but `background_worker_eligible=true`. `dial-hermes-control.worker_eligible=true`. Discovery must never convert absence of a negative flag into eligibility.

## 8. Audit

Denied workloads emit `RECOVERY_ROLE_VIOLATION` evidence with host, source, workload class, timestamp, reason and a SHA-256 command fingerprint. The raw command is not required in the policy ledger. Allowed actions emit workload-admission evidence.

## 9. Resource defence

Semantic admission is the first defence. Existing systemd recovery/control slices, Commander bounds, OOM priority and Oracle/SSH protection are the second defence. A future watchdog may terminate misclassified non-control work under pressure, but must never replace workload admission.

## 10. Certification

`node deploy/oracle/control-plane/certify-control-plane.mjs` must prove at minimum:

- builds/tests/VEKL are rejected on `oracle-admin`;
- recovery/diagnostics remain allowed there;
- VEKL light work routes to `oracle-admin-v2`;
- heavy development routes to `dial-hermes-control`;
- ambiguous commands fail closed;
- WhatsApp owner messages normalize without bypassing host policy.

## 11. Production non-interference

This revision must not install, restart, reconfigure, write files to, or run certification workloads on `dial-hermes-control`. Its registry entry describes routing authority only. Activation on that host requires a separate owner-authorized deployment after this control plane is certified.
