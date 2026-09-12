# DIAL Oracle Task-Aware Resource Fabric & Reciprocal Recovery Architecture

**Status:** Architecture Design  
**Scope:** DIAL, DDE, Nissan GTR, Hermes control plane, Oracle Always Free infrastructure  
**Date:** 2026-09-11

---

## 1. Purpose

This document defines the target architecture for a deterministic, task-aware Oracle execution fabric spanning the three existing Always Free virtual machines:

- `dial-hermes-control`
- `oracle-admin-v2`
- `oracle-admin`

The system is designed to:

- allocate compute resources according to the actual needs of each task rather than by project;
- protect Hermes with a generous hard resource reservation;
- preserve owner control under load;
- prevent heavy development jobs from starving administration or recovery;
- provide independent two-way recovery between the two E2.1.Micro admin nodes;
- allow both E2 nodes to recover the A1 Hermes node;
- ensure all critical services use `Restart=always`;
- make recovery independent of the component being recovered;
- record every placement decision deterministically and audibly;
- fail closed when telemetry, authority, or resource safety cannot be established.

---

## 2. Current Oracle Compute Pool

| Host | OCI Shape | Architecture | OCPU | RAM | Primary Role |
|---|---|---|---:|---:|---|
| `dial-hermes-control` | `VM.Standard.A1.Flex` | ARM64 | 4 | 24 GB | Hermes control plane + heavy shared compute |
| `oracle-admin-v2` | `VM.Standard.E2.1.Micro` | x86_64 | 1 | 1 GB | Primary administration, recovery and light x86 work |
| `oracle-admin` | `VM.Standard.E2.1.Micro` | x86_64 | 1 | 1 GB | Secondary administration, recovery and light x86 work |

Private OCI addresses currently identified:

| Host | Private IP |
|---|---|
| `oracle-admin-v2` | `10.0.0.245` |
| `oracle-admin` | `10.0.0.123` |
| `dial-hermes-control` | `10.0.0.184` |

The architecture treats all three machines as one governed execution fabric rather than as isolated project hosts.

---

## 3. Core Architectural Principle

The system must allocate **tasks**, not entire projects, to hosts.

DIAL, DDE and Nissan GTR may each execute different classes of work on different machines according to:

- architecture compatibility;
- memory requirements;
- CPU demand;
- disk I/O demand;
- network demand;
- expected duration;
- interactivity;
- authority class;
- toolchain availability;
- live host pressure;
- recovery obligations.

A project name must never be the sole reason a host is selected.

Example:

- DIAL Git operations may run on an E2 admin node.
- DIAL VEKL materialization may run on A1.
- DDE graph compilation may run on A1.
- x86-only Android tooling may run on one E2 node.
- Hermes owner steering always runs inside the protected A1 control slice.
- Recovery operations always use the admin/recovery plane.

---

## 4. Target Topology

```text
                         OWNER
                           │
                    WhatsApp / Chat
                           │
                  ┌────────▼─────────┐
                  │ DIAL HERMES      │
                  │ CONTROL          │
                  │ A1: 4c / 24 GB   │
                  └───────┬──────────┘
                          │
                   Task Scheduler
                          │
          ┌───────────────┼────────────────┐
          │               │                │
          ▼               ▼                ▼
  dial-hermes-control  oracle-admin-v2  oracle-admin
       ARM64              x86_64          x86_64
     heavy pool          admin peer      admin peer
          │               │                │
          └───────────────┴────────────────┘
                    reciprocal recovery
```

The A1 node is the main compute engine. The two E2 nodes form the resilient administration and recovery plane.

---

## 5. Hermes Protected Reservation

Hermes must receive a genuinely protected reservation, not merely a best-effort allowance.

### 5.1 Hard Reservation

Recommended Hermes/control reservation on `dial-hermes-control`:

```text
RAM reserved:        8 GB
CPU guaranteed:      1.5 OCPU
CPU burst ceiling:   4 OCPU
I/O priority:        above development workloads
OOM priority:        protected
Swap priority:       protected
```

Recommended logical A1 partition:

```text
24 GB total

8 GB    HERMES CONTROL RESERVE
├─ owner steering
├─ WhatsApp control
├─ mission controller
├─ Hermes orchestrator
├─ runtime health
├─ task scheduler
├─ recovery supervisor
├─ model routing
└─ control-plane caches/state

14 GB   NORMAL DEVELOPMENT POOL
├─ DIAL
├─ DDE
├─ Nissan GTR
├─ VEKL
├─ GraphRAG
├─ Node/Python workloads
├─ tests
├─ indexing
└─ other governed workers

2 GB    EMERGENCY HEADROOM
├─ kernel
├─ filesystem cache
├─ recovery operations
└─ short-term burst margin
```

The 2 GB emergency headroom must not be schedulable by ordinary development tasks.

### 5.2 Control Guarantee

The control plane must remain responsive even when development jobs are degraded, paused or killed.

The invariant is:

> Development workload may degrade; owner control may not.

---

## 6. Enforced Resource Isolation

Resource protection must be enforced through systemd/cgroups, not conventions.

Recommended slices:

```text
dial-control.slice
dial-development.slice
dial-recovery.slice
system.slice
```

### 6.1 `dial-control.slice`

For Hermes and owner-control services.

Example policy:

```ini
[Slice]
MemoryLow=8G
MemoryMin=6G
MemoryHigh=10G
CPUWeight=900
IOWeight=900
ManagedOOMMemoryPressure=kill
```

Critical services should use:

```ini
[Service]
Restart=always
RestartSec=5
StartLimitIntervalSec=0
OOMScoreAdjust=-900
```

### 6.2 `dial-development.slice`

For builds, tests, research, indexing and other heavy project jobs.

Example:

```ini
[Slice]
MemoryHigh=14G
MemoryMax=15G
CPUWeight=300
IOWeight=250
```

Worker services/processes should be given a positive OOM score so they are sacrificed before control-plane processes.

### 6.3 `dial-recovery.slice`

For peer-recovery agents and recovery-critical components.

Example:

```ini
[Slice]
MemoryMin=512M
CPUWeight=1000
IOWeight=1000
```

Recovery components should receive the strongest protection.

---

## 7. Task Execution Envelope

Every task must carry a deterministic resource contract.

Example:

```json
{
  "task_id": "DDE-VEKL-GRAPH-COMPILE-142",
  "project": "dde",
  "authority": "development",
  "architecture": ["arm64", "x86_64"],
  "cpu": {
    "minimum": 1,
    "preferred": 2
  },
  "memory_mb": {
    "minimum": 2048,
    "preferred": 6144,
    "maximum": 8192
  },
  "disk_io": "heavy",
  "network": "normal",
  "duration_class": "medium",
  "interactive": false,
  "preemptible": true,
  "toolchain": ["node22", "npm10"],
  "risk_class": "normal"
}
```

Recommended envelope fields:

- task ID;
- project;
- authority class;
- supported architecture;
- CPU minimum/preferred;
- memory minimum/preferred/maximum;
- disk-I/O class;
- network class;
- expected duration;
- interactive/non-interactive;
- preemptible/non-preemptible;
- required toolchains;
- risk class;
- priority;
- Project Truth revision;
- repository SHA;
- execution policy version.

Workers do not choose their own execution host.

---

## 8. Host Capability Envelope

Each host continuously publishes a live capability envelope containing:

- architecture;
- CPU count;
- RAM total;
- protected RAM;
- schedulable RAM;
- current available RAM;
- swap use;
- 1-minute and 5-minute load;
- disk I/O pressure;
- disk capacity;
- installed toolchains;
- current heavy jobs;
- service health;
- Desktop Commander health;
- recovery role;
- peer health;
- network health.

Example:

```json
{
  "host": "dial-hermes-control",
  "architecture": "arm64",
  "cpu_total": 4,
  "memory_total_mb": 24576,
  "memory_reserved_mb": 10240,
  "memory_schedulable_mb": 14336,
  "active_heavy_jobs": 1,
  "hermes_health": "GREEN",
  "recovery_health": "GREEN"
}
```

Stale telemetry makes the host ineligible for normal work.

---

## 9. Deterministic Placement Pipeline

Placement occurs in strict order.

### Gate A — Authority

Some task classes must execute only on administrative/recovery hosts:

- OCI recovery;
- SSH repair;
- Desktop Commander repair;
- host systemd repair;
- network/firewall correction;
- credential/session repair;
- recovery key rotation;
- host-level cleanup.

These are routed to the E2 recovery pair.

### Gate B — Architecture Compatibility

If a task requires x86_64:

```text
A1 excluded
→ choose eligible E2 host
```

If the task is ARM64-compatible or architecture-neutral:

```text
all compatible hosts remain candidates
```

### Gate C — Memory

Jobs expected to require more than approximately 450–500 MB working memory should not normally be admitted to an E2 node.

Examples that normally route to A1:

- `npm ci`;
- large Vitest suites;
- VEKL materialization;
- GraphRAG compilation;
- Playwright;
- large Python processing;
- indexing;
- large dependency resolution;
- resource-heavy agent work.

### Gate D — Pressure Scoring

Each host receives a normalized pressure score:

```text
host_pressure =
    memory_pressure
  + cpu_pressure
  + swap_pressure
  + io_pressure
  + concurrent_heavy_job_penalty
```

The lowest-pressure eligible host wins.

### Gate E — Recovery Preservation

The system may not saturate both E2 nodes simultaneously if doing so would eliminate reciprocal recovery capacity.

---

## 10. E2 Admission Policy

The E2.1.Micro nodes must be protected aggressively.

A normal project task is refused if any of the following are true:

```text
available RAM < 350 MB
swap use > 25%
load average > 1.5
iowait > 20%
another heavy task is active
recovery peer is degraded
Desktop Commander is unhealthy
```

Heavy jobs should normally not execute on E2.

A job should automatically classify as heavy when:

```text
predicted memory > 512 MB
OR
disk I/O class == heavy
OR
CPU-heavy duration > 2 minutes
```

Default result:

```text
ROUTE_TO_A1
```

not “try on E2 and hope”.

---

## 11. A1 Admission Policy

The A1 node must also fail closed before compromising Hermes.

A development task cannot start when:

```text
Hermes control health != GREEN
OR
recovery supervisor != GREEN
OR
available schedulable RAM < task.memory_max
OR
development pool >= 14 GB
OR
emergency headroom would fall below 2 GB
```

Hermes control health has precedence over all development workloads.

---

## 12. Heavy-Work Concurrency

Recommended limits:

### A1

```text
maximum simultaneous heavyweight jobs: 2
```

Only when their declared maximum combined memory remains safely within the 14 GB development pool.

### Each E2

```text
maximum heavyweight jobs: 0 normally
```

Exception:

```text
1 x86-only heavy job
```

only when the scheduler proves that the envelope fits without threatening recovery capacity.

---

## 13. Two-Way E2 Recovery

`oracle-admin-v2` and `oracle-admin` must become true reciprocal recovery peers.

```text
oracle-admin-v2
       ⇅
private recovery network
       ⇅
oracle-admin
```

Each node runs:

```text
dial-peer-health.service
dial-peer-recovery.service
desktop-commander.service
dial-host-doctor.service
```

### `oracle-admin-v2` can recover `oracle-admin`

It must be able to:

- verify private network reachability;
- verify SSH;
- verify Desktop Commander;
- restart Commander;
- inspect systemd state;
- restart approved runtime services;
- inspect memory/disk/swap/I/O pressure;
- clear approved temporary/cache state;
- restore repo-backed service definitions;
- perform a policy-authorized reboot as last resort.

### `oracle-admin` can recover `oracle-admin-v2`

Exactly the same capability exists in reverse.

There is no privileged host that cannot itself be repaired.

---

## 14. Both E2 Nodes Recover Hermes

Both E2 recovery peers independently monitor:

```text
dial-hermes-control
```

Either must be able to recover:

- Hermes runtime;
- owner steering;
- WhatsApp control;
- scheduler;
- mission controller;
- health daemon;
- model-routing services;
- recovery supervisor.

Topology:

```text
            ┌─────────────────────┐
            │ dial-hermes-control │
            │ 4 CPU / 24 GB       │
            └─────────▲───────────┘
                      │
             recoverable by both
                 /         \
                /           \
               ▼             ▼
        oracle-admin-v2 ⇄ oracle-admin
        recovery peer     recovery peer
```

---

## 15. `Restart=always` Requirement

Every persistent control and recovery service across all three VMs must use:

```ini
[Service]
Restart=always
RestartSec=5s
StartLimitIntervalSec=0
TimeoutStartSec=60
TimeoutStopSec=30
KillSignal=SIGTERM
```

For services supporting systemd watchdog:

```ini
WatchdogSec=30
NotifyAccess=main
```

Where native watchdog support is unavailable, a separate functional watchdog must be used.

All critical services must also be enabled at boot.

---

## 16. Functional Health, Not Process Health

`Restart=always` is not sufficient.

A process can be alive while its external service is unusable.

Every persistent service needs:

```text
PROCESS_HEALTH
FUNCTIONAL_HEALTH
```

For Desktop Commander, GREEN requires:

```text
PROCESS_UP
SESSION_VALID
REMOTE_REGISTERED
PING_RESPONDS
COMMAND_EXECUTES
```

Only then:

```text
DESKTOP_COMMANDER_GREEN
```

A process merely existing is not enough.

---

## 17. Active/Standby Desktop Commander

Both E2 machines remain connected at all times.

Desired state:

```text
oracle-admin-v2
  role = PRIMARY
  status = GREEN

oracle-admin
  role = SECONDARY
  status = GREEN
```

The secondary still:

- stays authenticated;
- stays remotely registered;
- answers heartbeats;
- accepts recovery operations.

Failover:

```text
PRIMARY misses threshold heartbeats
       ↓
SECONDARY becomes execution target
       ↓
repair PRIMARY
       ↓
PRIMARY returns GREEN
       ↓
policy decides whether/when to fail back
```

No standby should be left stale simply because the primary is healthy.

---

## 18. Anti-Flapping Policy

Recommended recovery hysteresis:

```text
probe interval:            30 s
suspect after:             2 failures
declare unhealthy after:   4 failures
automatic restart:         yes
restart cooldown:          60 s
max rapid restarts:        3
exponential delay:         2m → 5m → 15m
```

A recovered host must remain GREEN for approximately five minutes before being promoted back into normal scheduling or primary status.

---

## 19. Recovery Authority Hierarchy

Recovery should occur in this order:

```text
1. local service self-recovery
2. local host doctor
3. reciprocal E2 peer
4. E2 peer recovering A1
5. owner intervention
```

Recovery agents must acquire a lease before modifying another host.

Example:

```text
recovery_lease:
  target: oracle-admin-v2
  owner: oracle-admin
  ttl: 120s
```

Only one peer may actively remediate a target at a time.

---

## 20. Recovery Must Be Independent of Hermes

This is mandatory.

The E2 recovery daemon must not require:

- Hermes;
- DIAL mission controller;
- VEKL;
- Claude;
- Codex;
- GraphRAG;
- the failing host.

Recovery logic should be small, deterministic and based on:

- systemd;
- shell/Node/Python tooling;
- SSH;
- private-network health;
- repo-backed configuration.

If Hermes fails, the recovery plane must still work.

---

## 21. Private Recovery Network

Normal peer recovery should use private OCI networking.

```text
oracle-admin-v2      10.0.0.245
oracle-admin         10.0.0.123
dial-hermes-control  10.0.0.184
```

Public SSH should be fallback/admin access, not the primary peer-recovery path.

Recovery keys should be:

- dedicated;
- tightly scoped;
- separate from general owner SSH credentials;
- restricted to approved recovery commands.

---

## 22. Allowlisted Recovery Commands

Recovery peers should not receive unrestricted passwordless root.

Allowlisted recovery actions should include only required commands, for example:

```text
systemctl status <approved service>
systemctl restart <approved service>
journalctl -u <approved service>
free
df
vmstat
ss
approved cleanup script
approved repository recovery script
policy-authorized reboot
```

This limits blast radius.

---

## 23. Recovery State Machine

Each host follows:

```text
GREEN
  ↓ failures
SUSPECT
  ↓ confirmed
DEGRADED
  ↓ remediation
RECOVERY
  ↓
GREEN
```

Or:

```text
RECOVERY
  ↓ failure
RECOVERY_FAILED
  ↓
OWNER_ATTENTION
```

Resource pressure is treated separately:

```text
DEGRADED_RESOURCE
→ block new work
→ shed low-priority jobs
→ recover resources
```

A reboot is not the first response to resource pressure.

---

## 24. Task Priorities and Preemption

Priority classes:

```text
P0  Owner control
P1  Recovery
P2  Hermes runtime
P3  Production incident
P4  Interactive development
P5  CI / verification
P6  Research / indexing
P7  Speculative / background
```

Higher priorities may preempt lower priorities.

A P1 recovery action may pause or terminate P6/P7 work.

No build or background process may prevent:

- owner steering;
- WhatsApp acknowledgement;
- Hermes scheduling;
- recovery execution.

---

## 25. Example Placement Decisions

### DDE VEKL Graph Compile

```text
ARM-compatible
6 GB predicted RAM
heavy CPU
→ dial-hermes-control
```

### DIAL Git Fetch

```text
~50 MB RAM
light CPU
architecture-neutral
→ least-loaded eligible E2
```

### x86-only Android Tooling

```text
x86_64 required
~700 MB predicted
→ E2 only if envelope is safe
→ otherwise fail closed or use alternate compatible toolchain
```

### Playwright Browser Suite

If compatible ARM64 browser exists:

```text
→ A1
```

Otherwise:

```text
→ eligible E2 under strict admission control
```

### Owner Steer

```text
→ A1 control slice
→ never queued behind ordinary project work
```

---

## 26. Repository and Workspace Model

GitHub remains canonical source authority.

Host-local checkouts are execution caches, not project truth.

Recommended execution workspace structure:

```text
/workspaces/
  dial/
    <mission-id>/
  dde/
    <mission-id>/
  nissan-gtr/
    <mission-id>/
```

Before execution:

```text
fetch canonical
verify Project Truth
verify SHA
verify owner/authority scope
hydrate toolchain/dependencies
execute
verify
record evidence
commit/push if authorized
clean reconstructable cache
```

This reduces stale-branch and stale-project errors.

---

## 27. Automatic Cache Management

The scheduler/host doctor may clean reconstructable data when thresholds are crossed.

Eligible cleanup:

- npm caches;
- obsolete npx caches;
- old Playwright browser versions;
- node_modules in retired worktrees;
- Gradle caches;
- Python package caches;
- test scratch directories;
- expired build outputs;
- temporary VEKL test materializations;
- abandoned `/tmp` workspaces.

Never automatically delete:

- Project Truth;
- unique/uncommitted work;
- Git objects required for unreconciled branches;
- production databases;
- production VEKL evidence;
- credentials;
- secrets;
- current release artifacts;
- live runtime state.

Recommended disk policy:

```text
<60%       normal
60–75%     background cleanup
75–85%     aggressive safe-cache cleanup
>85%       block nonessential work
```

---

## 28. Memory Pressure Policy

### A1

```text
available > 8 GB       normal
5–8 GB                 stop accepting new heavy work
3–5 GB                 pause background work
<3 GB                   terminate lowest-priority workers
<2 GB                   recovery mode
```

The Hermes reservation remains protected throughout.

### E2

```text
available > 450 MB     normal light work
300–450 MB             admin only
200–300 MB             recovery only
<200 MB                 kill disposable workers
```

---

## 29. Deterministic Placement Evidence

Every placement decision must generate an immutable trace.

Example:

```json
{
  "task": "DDE-VEKL-GRAPH-COMPILE-142",
  "eligible_hosts": [
    "dial-hermes-control",
    "oracle-admin-v2",
    "oracle-admin"
  ],
  "rejected": {
    "oracle-admin-v2": "MEMORY_ENVELOPE_EXCEEDED",
    "oracle-admin": "RECOVERY_RESERVE_REQUIRED"
  },
  "selected": "dial-hermes-control",
  "reason": "LOWEST_PRESSURE_ELIGIBLE_HOST",
  "policy_version": "dial-resource-fabric-v1",
  "timestamp": "..."
}
```

Placement must be auditable and reproducible.

---

## 30. Fail Closed on Stale Telemetry

If host telemetry is stale:

```text
DO NOT PLACE NORMAL WORK
```

Only recovery probes may proceed.

The scheduler must never assume a host is safe because it was healthy previously.

---

## 31. Hermes Owns Placement

Workers never self-place.

Architecture:

```text
Owner / DIAL / DDE / Nissan mission
              ↓
      Hermes Resource Scheduler
              ↓
      Placement Decision
              ↓
           Host Lease
              ↓
       Worker Execution
```

This prevents independent workers from accidentally overloading the same machine.

---

## 32. Avoiding a New Single Point of Failure

The scheduler's only state must not live exclusively on A1.

Use:

```text
Git/repository
  → policy and canonical configuration

both E2 peers
  → minimal replicated recovery/runtime state

A1
  → active scheduler/runtime projection
```

Recovery must remain available when A1 is unavailable.

---

## 33. Recommended Repository Structure

```text
deploy/oracle/resource-fabric/
├── policy.json
├── hosts.json
├── install-host.sh
├── install-recovery-peer.sh
├── install-hermes-resource-guards.sh
├── resource-scheduler.mjs
├── host-agent.mjs
├── recovery-agent.mjs
├── doctor.mjs
├── cleanup.mjs
├── systemd/
│   ├── dial-host-agent.service
│   ├── dial-recovery-agent.service
│   ├── dial-resource-scheduler.service
│   ├── desktop-commander.service
│   └── ...
└── tests/
```

Project Truth should explicitly define:

- host identities;
- host capacities;
- protected reservations;
- recovery relationships;
- placement algorithm;
- authority boundaries;
- cleanup policy;
- failover policy;
- recovery state machine;
- telemetry freshness rules;
- evidence requirements.

---

## 34. Desired Steady State

### `dial-hermes-control`

```text
Hermes/control:         4–8 GB typical
Protected reservation: 8 GB
Development pool:       up to ~14 GB
Emergency reserve:      2 GB
```

### `oracle-admin-v2`

```text
Desktop Commander
Recovery services
Host doctor
OS/system services
Light Git/admin work only
```

### `oracle-admin`

Same.

The E2 nodes are not intended to be general heavy build servers.

---

## 35. Failure Scenarios

### `oracle-admin-v2` fails

```text
oracle-admin detects failure
→ secondary Commander becomes execution target
→ obtains recovery lease
→ attempts v2 service recovery
→ v2 returns GREEN
→ policy determines controlled failback
```

### `oracle-admin` fails

Same in reverse.

### `dial-hermes-control` fails

```text
both E2 peers detect outage
→ one acquires A1 recovery lease
→ restarts/repairs Hermes services
→ restores scheduler and control plane
→ Hermes returns GREEN
```

### One E2 plus A1 fail simultaneously

The surviving E2 still provides:

- Desktop Commander;
- SSH;
- recovery tooling;
- peer repair capability;
- owner-access recovery path.

---

## 36. Acceptance Criteria

The architecture is complete only when all of the following are true:

1. Both E2 VMs independently register and remain GREEN in Desktop Commander.
2. `oracle-admin-v2` can recover `oracle-admin`.
3. `oracle-admin` can recover `oracle-admin-v2`.
4. Either E2 can recover `dial-hermes-control`.
5. All critical services use `Restart=always`.
6. Restart-on-process-failure is supplemented by functional health probes.
7. Hermes has an enforced 8 GB protected reservation.
8. At least 2 GB A1 emergency headroom is not schedulable.
9. Development work cannot consume the Hermes reservation.
10. E2 hosts reject unsafe heavy workloads.
11. Heavy ARM-compatible workloads preferentially route to A1.
12. x86-only workloads route only to compatible hosts.
13. Placement uses live telemetry and deterministic policy.
14. Stale telemetry causes fail-closed routing.
15. Placement decisions produce immutable evidence.
16. Recovery logic works without Hermes, Codex or Claude.
17. Recovery credentials are tightly scoped.
18. Both E2s remain independently recoverable.
19. Cache cleanup preserves Project Truth, evidence, credentials and unique work.
20. No project is permanently tied to a host solely by project identity.

---

## 37. Final Architectural Principle

> **The A1 node is the compute engine, but Hermes owns a protected portion of it. The E2 pair is the resilient administrative and reciprocal-recovery plane. Tasks are placed according to declared requirements plus live capacity, not project identity. Critical services always restart, functional health is independently verified, and no VM depends on itself for recovery.**

This design preserves owner control, makes better use of the 4 OCPU / 24 GB A1 machine, avoids overloading the 1 GB E2 nodes, and creates genuine two-way recovery across the Oracle Always Free infrastructure.
