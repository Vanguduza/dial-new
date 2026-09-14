# DIAL Oracle task-aware resource fabric

Implements `docs/orchestration/DIAL_ORACLE_TASK_AWARE_RESOURCE_FABRIC_RECIPROCAL_RECOVERY_ARCHITECTURE.md`.

Everything here is deliberately standalone — no imports from `agent-system/`. Section 20
requires placement and recovery to work when Hermes, the mission controller, VEKL, Codex
and Claude are all unavailable, so a dependency on any of them would defeat the design.

## Implementation status

Honest accounting. Do not enable a unit whose target file is listed as not implemented.

| File | Status | Verified by |
|---|---|---|
| `hosts.json` | **implemented** — real inventory of the three Always Free hosts | `tests/oracle-resource-fabric.test.mjs` |
| `policy.json` | **implemented** — thresholds from architecture §5, 6, 10–12, 18, 27, 28, 30 | same |
| `placement.mjs` | **implemented** — Gates A–E, pressure scoring, deterministic evidence | 23 passing tests |
| `host-agent.mjs` | **implemented** — capability envelope from `/proc`, atomic publish | manual run |
| `doctor.mjs` | **implemented** — functional health; unconfigured probes return `UNVERIFIED` | manual run |
| `systemd/*.slice` | **implemented** — control / development / recovery cgroup policy | — |
| `systemd/dial-host-agent.{service,timer}` | **implemented** | — |
| `recovery-agent.mjs` | **implemented** — leases, hysteresis, allowlisted restarts, fail-closed | `tests/oracle-resource-fabric-runtime.test.mjs` |
| `resource-scheduler.mjs` | **implemented** — deterministic decisions, dispatch envelopes, refuses command payloads | same |
| `install-host.sh`, `install-recovery-peer.sh`, `install-hermes-resource-guards.sh`, `cleanup.mjs` | **implemented** — staging only; activation stays a separate authenticated step | same |
| `role-guard.mjs` | **implemented** — host-side task separation and the R0–R3 recovery ceiling | `tests/oracle-role-guard.test.mjs` |
| `bounded-recovery-command.sh` | **implemented** — the forced command behind the control host's key into an E2 | `tests/oracle-two-way-recovery.test.mjs` |
| `install-bounded-recovery-identity.sh` | **implemented** — installs / verifies / revokes that `authorized_keys` entry | same |
| `install-bounded-recovery-peer.sh` | **implemented** — the outbound half on the control host | `tests/oracle-two-way-verification.test.mjs` |
| `seed-known-hosts.sh` | **implemented** — seeds peer host keys, optionally fingerprint-bound | same |
| `verify-two-way-recovery.sh` | **implemented** — proves the direction works *and* is still bounded | same |

## Two-way recovery (Rev 3 §5)

`dial-hermes-control` used to have `recovers: []`. If both E2 admin hosts were down at
once — the actual situation on 2026-09-12 — nothing in the estate could recover them.

It now recovers both, under a deliberate asymmetry: **bidirectional in capability,
asymmetric in privilege.**

| Field in `hosts.json` | Means |
|---|---|
| `recovery_authority_max` | the highest R-class this host may execute at all. `R1` for the control host, `R3` for the E2 pair |
| `recovery_service_allowlist` | which units it may restart on a peer. `["*"]` is honoured only for a full `RECOVERY` host |
| `BOUNDED_RECOVERY` role | may act in the recovery plane, up to its ceiling, without being a recovery peer |

R2 and above need owner authorization on the task in **either** direction, so nothing
production-affecting is ever automatic.

The control host's key into an E2 reaches `bounded-recovery-command.sh` and nothing else:
a liveness probe, a short read-only diagnostic set, and restart of that host's own
recovery units. No shell, no chaining, no substitution, no credential reads — every
attempt is audited to `/var/log/dial-bounded-recovery.log`.

`bootstrap.sh` phase 5 installs that forced command on every E2 unconditionally. It does
**not** authorize the key: that is an owner step
(`install-bounded-recovery-identity.sh <hermes.pub>`), because it grants a capability
rather than installing a restriction.

### Proving it

```bash
install-bounded-recovery-peer.sh     # on dial-hermes-control: key + ssh wiring + .pub
install-bounded-recovery-identity.sh <that.pub>   # on each E2: bind it to the forced command
verify-two-way-recovery.sh           # back on the control host
```

`verify-two-way-recovery.sh` is half refusal-testing on purpose. Trying only permitted
verbs would prove the channel is open, not that it is bounded — so it also attempts a
shell, a reboot, a non-recovery restart, command chaining, an OCI call and three
credential reads, and a refusal probe that succeeds fails the run. Credential probes keep
the exit status and discard the output, so a regressed refusal cannot write the credential
into the evidence file.

Verdicts: `PROVEN`, `PARTIAL` (bound proven, R1 repair not attempted), `UNPROVEN` (a
target could not be reached — never a pass), `FAILED`.

### known_hosts

`recovery-agent.mjs` uses `StrictHostKeyChecking=yes`, which is why
`dial-recovery-agent.service` had never started anywhere: unseeded peers fail closed.
`seed-known-hosts.sh` fixes that, and `--expect <host>=SHA256:...` makes the check binding
against the fingerprint that host's own certification recorded. Without it, keys are
accepted on first use and the tool says so.

**Not yet proven.** The mechanism and its verifier are both tested; it has never run
between two live hosts.

`tests/oracle-resource-fabric-runtime.test.mjs` existed but was absent from
`vitest.config.ts`, so it was collected by nothing and ran never. It is now in the
include list along with the provisioning suite.

Provisioning a host that runs this fabric is `deploy/oracle/provisioning/`.

## Desktop Commander

Desktop Commander has two deliberately different roles in the three-node estate.

- `oracle-admin` owns the **independent remote Commander recovery device**. It is
  supervised by `dial-commander-remote.service`, guarded as
  `RECOVERY_CONTROL_ONLY`, and exists for break-glass administration/recovery.
- `dial-hermes-control` owns a **local read-only Desktop Commander child MCP**
  under Hermes. Hermes is the authority; Codex, Claude and WhatsApp reach Hermes
  through the typed DIAL MCP and do not connect directly to Commander.
- `vekl-worker` has **no Commander authority**. It is a background coordinator
  and remains a recovery target, never a development or admin shell.

The recovery bootstrap pins
`@wonderwhy-er/desktop-commander@0.2.50` and applies an exact-version compatibility
patch that persists refresh-token rotation until upstream includes the fix. The
service unit is resource-bounded and protected below SSH and the Oracle Cloud
Agent, so Commander cannot starve the two stronger recovery paths.

The Hermes-local installer exposes only the approved inspection tools:
`read_file`, `read_multiple_files`, `list_directory`, `get_file_info`,
`start_search`, `get_more_search_results`, `list_processes`, `list_sessions`,
and `get_config`. Generic process execution and filesystem mutation remain
outside the subordinate Commander surface.

## Placement

```bash
node deploy/oracle/resource-fabric/placement.mjs task.json telemetry.json
```

Exits non-zero when no host is eligible — fail-closed routing, per §30. Stale or missing
telemetry makes a host ineligible for normal work; it never defaults to "probably fine".

## Host telemetry

```bash
node deploy/oracle/resource-fabric/host-agent.mjs --publish
node deploy/oracle/resource-fabric/doctor.mjs dial-hermes-orchestrator.service
```

## Public IP addresses

`hosts.json` carries private OCI addresses only. `docs/orchestration/IMPLEMENTATION_STATE.md`
records public IPs and account identifiers as sensitive operational detail that must not
enter the repository; operators supply them at install time.
