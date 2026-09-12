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
| `systemd/desktop-commander.service` | **implemented** | — |
| `recovery-agent.mjs` | **not implemented** — `dial-recovery-agent.service` references it | — |
| `resource-scheduler.mjs` | **not implemented** — `dial-resource-scheduler.service` references it | — |
| `install-host.sh`, `install-recovery-peer.sh`, `install-hermes-resource-guards.sh`, `cleanup.mjs` | **not implemented** | — |

## Desktop Commander boundary

`systemd/desktop-commander.service` runs Desktop Commander on the **E2 admin peers only**,
as owner host-administration tooling.

It is **not** the DIAL operator gateway. `CLAUDE.md` states the DIAL operator channel must
not expose a generic shell and that the bridge is DIAL-only. Desktop Commander is a general
filesystem and terminal surface, so it stays on the admin/recovery plane and must never
become a path for dispatching DIAL development work — that continues to enter through
`dial-hermes-submit` and the typed `dial_*` controls, behind a valid gate.

Architecture §22 applies: recovery peers get an allowlist, not unrestricted passwordless root.

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
