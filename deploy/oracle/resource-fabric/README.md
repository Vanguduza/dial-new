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
| `recovery-agent.mjs` | **not implemented** — `dial-recovery-agent.service` references it | — |
| `resource-scheduler.mjs` | **not implemented** — `dial-resource-scheduler.service` references it | — |
| `install-host.sh`, `install-recovery-peer.sh`, `install-hermes-resource-guards.sh`, `cleanup.mjs` | **not implemented** | — |

## Desktop Commander

`@wonderwhy-er/desktop-commander` is an **MCP stdio server** — the MCP client spawns it per
session and talks over stdin/stdout. It is not a network daemon, so there is no persistent
host-side process to run as a systemd service and nothing to "connect to" on a port. An
always-on unit for it would sit with no stdin peer and prove nothing, which is why this
directory ships no `desktop-commander.service`.

To reach an E2 peer, the client spawns it **over SSH**, which needs no open port and reuses
existing SSH authentication:

```json
{
  "mcpServers": {
    "oracle-admin-v2": {
      "command": "ssh",
      "args": ["ubuntu@<oracle-admin-v2-ip>", "npx", "-y", "@wonderwhy-er/desktop-commander@0.2.50"]
    },
    "oracle-admin": {
      "command": "ssh",
      "args": ["ubuntu@<oracle-admin-ip>", "npx", "-y", "@wonderwhy-er/desktop-commander@0.2.50"]
    }
  }
}
```

Because it is client-spawned, `PROCESS_UP` is not a `systemctl is-active` check.
`doctor.mjs` derives every criterion — `PROCESS_UP` included — from the configured
`DIAL_COMMANDER_PROBE`, and returns `UNVERIFIED` when no probe is configured.

Architecture §17 calls for an active/standby pair where the standby stays registered and
answers heartbeats. Under the stdio model there is no standing registration to keep warm,
so §17 needs either a probe the scheduler runs on a timer against both peers, or a
transport decision that gives Commander a real listening endpoint. That is an open design
question, not something this increment resolves.

### Boundary

Desktop Commander stays on the **E2 admin/recovery plane** as owner host-administration
tooling. It is **not** the DIAL operator gateway. `CLAUDE.md` states the DIAL operator channel must
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
