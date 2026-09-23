# DIAL Provider-First Execution Fabric

## Infrastructure policy for provider-hosted execution with Oracle as capability fallback

**Revision:** 2.0
**Supersedes:** `DIAL_HERMES_3VM_PROVIDER_FIRST_EXECUTION_ARCHITECTURE_REV1`
**Status:** `PROPOSED — NOT_IMPLEMENTED`
**Scope:** company infrastructure fabric, project-neutral

> This is a planning document. Nothing here is implemented. No claim in it is
> evidence of a deployed control, and it does not advance any project gate.

---

# 1. Purpose

DIAL operates development work across several subscription-backed execution
providers and a small Oracle Always Free VM estate. This document defines where
a unit of work runs.

It governs **execution venue only** — whose container the work executes in. It is
infrastructure policy for the whole estate and is not tied to any one project.

## 1.1 The rule

> If a provider can complete the work within the infrastructure its subscription
> allows, it runs there. Oracle receives the work only where provider
> infrastructure is inadequate for it — proved by a failed attempt, or shown by
> limits the fabric already holds.

Everything else in this document exists to make that rule enforceable, auditable,
and safe for the control plane.

## 1.2 What this document does not govern

Out of scope, and deliberately absent:

- **model selection** — which model reasons about a task, and any ordering,
  fallback chain or eligibility rule over models. That is runtime policy, owned
  elsewhere, and venue routing must never alter it;
- **any project's development policy** — gates, features, acceptance evidence,
  or readiness state;
- **project truth, knowledge layers, or task identity schemes** — these are
  per-project concerns consumed through the binding in §17.

"DIAL" throughout is the company. Infrastructure named `dial-*` is company
infrastructure serving every project on the fabric; the name carries no coupling
to any particular project's repository or lifecycle.

---

# 2. Node roles

Three Oracle VMs. Roles are fixed and enforced locally on each host (§14).

## 2.1 `dial-hermes-control` — `ROLE=CONTROL_AUTHORITY`

Oracle `VM.Standard.A1.Flex`, **2 OCPU / 12 GB RAM**, sized to remain inside the
Always Free envelope while leaving headroom against resource pressure.

Runs the persistent control plane: orchestration, provider dispatch, owner
steering, the MCP gateway, policy enforcement, persistent queues, health and
watchdog functions.

It is not a development worker. Work reaches it only through §5.

## 2.2 `vekl-worker` — `ROLE=BACKGROUND_COORDINATOR`

Oracle `VM.Standard.E2.1.Micro`. Asynchronous coordination: queue consumption,
scheduling, change observation, dispatch of work outward to providers, and
collection of provider results.

It coordinates heavy work; it does not perform it.

## 2.3 `oracle-admin` — `ROLE=RECOVERY_CONTROL_ONLY`

Oracle `VM.Standard.E2.1.Micro`. Independent recovery and administration plane:
SSH recovery into the other nodes, OCI CLI/API, OCI Run Command, network
diagnostics, emergency repair.

It never executes project work of any kind, and is never a fallback venue. This
is enforced by host-role guard, not by convention.

## 2.4 Topology

```text
                      OWNER
                        |
                 authenticated control
                        |
        +---------------+---------------+
        |               |               |
        v               v               v
    provider A      provider B      provider C ...
  (subscription-hosted execution containers)
        |               |               |
        +---------------+---------------+
                        |
              authenticated MCP ingress
                 (Cloudflare Access)
                        |
                        v
            +---------------------------+
            |   dial-hermes-control     |
            |   A1 Flex 2 OCPU / 12 GB  |
            |   control authority       |
            |   venue router            |
            |   local sandbox (Docker)  |
            +------------+--------------+
                         |
                OCI private VCN
              +----------+----------+
              |                     |
              v                     v
        vekl-worker           oracle-admin
     background coordinator   recovery only
```

---

# 3. Provider set

Providers are **registry entries, not hardcoded branches.** Rev 1 enumerated two
providers as distinct execution classes; that design required a rewrite of five
sections to add a third. It is replaced by a single class, `PROVIDER`, resolved
against a provider registry.

Each registry entry declares:

```text
provider_id
subscription_identity
execution surface (how a container is obtained)
declared infrastructure envelope (CPU, RAM, disk, wall-clock, network egress)
capability manifest (MCP capabilities this principal may hold)
credential reference and rotation lifecycle
attempt budget defaults
```

The fabric currently expects entries for Codex, Claude and Antigravity. Adding a
fourth is a registry addition and must require no change to this policy.

Where a provider offers more than one execution surface, each surface is its own
entry — surfaces differ in envelope, and the envelope is what routing reasons
about.

---

# 4. Execution flow

```text
work unit arrives
      |
      v
does a fact already in hand rule every provider out?   (§5.2, no investigation)
      |
      +-- yes --> Oracle sandbox (§8)        basis: ENVELOPE_EXCEEDED / HOST_SUBJECT
      |
      +-- no or unknown
               |
               v
      dispatch to provider container  <--------+
               |                               |
               +-- completes ----> record, done|
               |                               |
               +-- provider unavailable -------+  (§6: retry / switch / queue / fail)
               |                                  never Oracle
               |
               +-- attempted, infrastructure inadequate
                        |
                        v
                 record observed reason as evidence
                        |
                        v
                 Oracle local sandbox (§8)
                        |
                        +-- needs host privilege --> policy gate --> Commander
```

There is no pre-dispatch list of work that belongs on Oracle. The only
pre-dispatch step is a comparison against declared limits the fabric already
holds (§5.2); everything it cannot rule out in advance is attempted.

---

# 5. Insufficiency is evidence, not a gate

Rev 1 gated local execution on a closed enum of `locality_reason` values
(`SYSTEMD`, `OCI_PRIVATE_NETWORK`, `LOCAL_SECRET`, …). That enum is an allowlist:
it decides at authoring time what Oracle is for, and it hardcodes foresight the
author does not have.

**It is removed.** No list of Oracle-eligible work exists anywhere in this fabric.

The replacement distinguishes two uses of a reason:

| | reason-as-gate (removed) | reason-as-evidence (adopted) |
| --- | --- | --- |
| when | checked before dispatch | recorded after an attempt |
| vocabulary | closed enum | open string |
| effect on routing | permits or denies | none |
| purpose | pre-authorize | audit, and learn the envelope |

This concerns the failure *reason* — the string a provider returns when an
attempt fails. Nothing routes on it. It is distinct from a declared envelope
figure, which is a number the fabric already holds and which §5.2 does compare
before dispatch.

## 5.1 Three venue bases

An attempt is how the fabric learns something it does not already know. It is not
a ritual every unit performs. Where the answer is already in hand, a doomed
attempt buys nothing and spends wall-clock and subscription quota to confirm what
the registry states.

| basis | when | attempt first |
| --- | --- | --- |
| `HOST_SUBJECT` | the work's subject is a specific host — its systemd units, its local filesystem, a service on its private interface | no |
| `PROVIDER_ENVELOPE_EXCEEDED` | a fact already in hand shows the unit cannot fit any eligible provider envelope (§5.2) | no |
| `PROVIDER_ATTEMPTED_INADEQUATE` | everything else | **yes** |

`PROVIDER_ATTEMPTED_INADEQUATE` is the default and covers most units. When an
attempt fails for an infrastructure cause, the cause is recorded verbatim from
the provider — disk exhausted, egress blocked to a required host, wall-clock
exceeded, memory ceiling hit, required device absent, image lacks a toolchain,
workspace exceeds clone limits. The fabric does not branch on this string. It
records it.

`HOST_SUBJECT` is not an exception to §1.1: such work has no provider container
that could host it, so there is nothing to attempt. It is addressed to a node,
not routed to one, and enters through the privileged path in §8.3.

## 5.2 The envelope check

§3 has each registry entry declare an infrastructure envelope. Where the fabric
already holds a requirement that exceeds every eligible envelope, it routes to
Oracle directly.

This is not the allowlist returning. An allowlist names kinds of work and is
authored in advance; the envelope check is arithmetic on declared limits,
evaluated per unit, naming no categories. Two rules keep it that way and keep it
cheap:

**It never investigates.** The check reads only what the fabric already has —
registry envelopes and facts carried with the unit or previously observed. It
performs no probe, no pre-flight measurement and no extra I/O, so it adds no
latency to dispatch. If the data is not in hand, the unit is attempted.

**The requirement figure comes from the control plane, never the submitter.**
A submitter that could assert its own requirement could route itself to Oracle at
will, and the allowlist would return as a data field. Because the figure is the
control plane's, there is no inflation to police and no penalty machinery to
build.

Where a requirement is only observable by running the work — peak memory, disk
growth under dependency expansion — it is not in hand, so the unit is attempted.
That is the correct outcome, not a gap.

**When in doubt, attempt.** Ambiguity resolves toward the provider.

This must not be allowed to grow back into an allowlist. "Faster locally",
"packages already installed", "provider queue is long" and "small enough" are
not envelope facts and are not locality.

---

# 6. Outage is not insufficiency

The two failure modes are distinct and Rev 1 conflated them by having no
insufficiency concept at all.

**Provider unavailable** — outage, rate limit, quota exhaustion, authentication
failure, queue stall. The work was never attempted. The response is:

```text
retry within budget  ->  switch to another eligible provider  ->  queue  ->  fail visibly
```

Never Oracle. A busy or absent provider is not evidence that provider
infrastructure is inadequate, and allowing this path to reach Oracle is precisely
the pressure the control plane must be protected from.

**Provider attempted and was inadequate** — the container ran and could not
complete the work for an infrastructure cause. Oracle is legitimate, under §5.

The router must be able to tell these apart from provider response alone. Where a
provider's failure signal is ambiguous, it is treated as unavailable, because that
classification is the one that protects the control plane.

---

# 7. Attempt budget

Attempting before falling back has a cost, and unbounded retry is its own failure
mode. Each work unit carries a budget:

```text
max_provider_attempts        across all eligible providers
max_attempt_wall_clock       per attempt
max_total_wall_clock         before the unit fails or escalates
```

Budgets come from the provider registry and may be overridden per unit. Budget
exhaustion is a visible failure, not an implicit Oracle fallback: the decision to
spend Oracle capacity is made by §5's evidence, never by having run out of
patience with a provider.

---

# 8. Oracle-local execution

## 8.1 Sandbox is the default

Work that reaches Oracle executes in the Hermes Docker sandbox. The host shell is
exceptional.

```yaml
terminal:
  backend: docker
  docker_image: "dial/toolbox:2026.09"

  docker_run_as_host_user: false
  docker_mount_cwd_to_workspace: false
  docker_network: false            # egress is opt-in and bounded

  container_cpu: 0.75
  container_memory: 2560
  container_disk: 12288

  timeout: 300
  lifetime_seconds: 900

  docker_forward_env:
    - MCP_JOB_TOKEN               # job-scoped, nothing else

  docker_volumes:
    - "/srv/dial/workspaces/<task>:/workspace:rw"
    - "/srv/dial/reference:/reference:ro"

approvals:
  mode: smart
  deny:
    - "*--privileged*"
    - "*docker.sock*"
    - "*--network=host*"
```

Trusted recurring tooling may use a persistent container; untrusted or
concurrent work uses disposable per-session containers with
`container_persistent: false`. Containers are not shared across trust levels.

## 8.2 Sandbox lifecycle

Filesystem state and installed packages persist across control-process restarts
while the container lives. Live processes do **not** survive a host reboot or
Docker daemon restart, even though filesystem state does.

Therefore no critical service may exist only as a background process inside a
sandbox. Critical daemons belong under systemd.

## 8.3 Privileged host operations

Work whose subject is the host itself — systemd units, host packages, network
configuration, firewall, Docker daemon administration — cannot be performed from
the sandbox by design.

```text
sandbox attempt
      |
      +-- requires host privilege
               |
               v
          policy gate  (signed request, recorded decision)
               |
               v
      local Desktop Commander --> host operation
```

Commander is subordinate to the control plane. It is not a peer orchestrator and
never a default execution venue.

---

# 9. Resource model

The control VM must protect the control plane **and** leave usable capacity for
development processes. Rev 1 expressed only ceilings, which cannot do both: a
ceiling stops a slice growing but does not stop it being squeezed.

This model pairs a **protection floor** with a **ceiling** per slice. Floors are
reservations the kernel will not reclaim; ceilings bound growth.

## 9.1 Slice budget — 12 GB / 2 OCPU

| slice | MemoryMin | MemoryLow | MemoryHigh | MemoryMax | CPUWeight | CPUQuota |
| --- | --- | --- | --- | --- | --- | --- |
| `dial-survival.slice` | 384M | 384M | — | — | 10000 | none |
| `dial-hermes.slice` | **2G** | 3.5G | 5G | **6G** | 800 | **200%** |
| `dial-dev.slice` | — | — | 3G | 3.5G | 400 | 150% |
| `dial-commander.slice` | — | 256M | 512M | 768M | 200 | 50% |

```text
all slices at MemoryHigh   =  8.88 GB  ->  3.12 GB for OS and page cache
all slices at MemoryMax    = 10.63 GB  ->  1.37 GB for OS and page cache
```

Rev 1 asserted a ≥3.5 GB survival reserve in its resource philosophy while its
own configuration (`MemoryMax=7.5G` plus a 2.5 GB sandbox) left 1.0 GB. The
reserve is restated here as the figure the configuration can actually honor:
**≥3.0 GB at steady state**, with the `MemoryMax` row understood as a wall that
is never a target.

## 9.2 What each control does

- **`dial-hermes.slice` `MemoryMin=2G`** is the protection. The kernel will not
  reclaim this from the control plane regardless of what development processes
  do. It cannot be squeezed out of existence by a busy build.
- **`MemoryHigh=5G`** throttles and reclaims before the wall is reached, so
  growth degrades gracefully instead of ending in an OOM kill.
- **`MemoryMax=6G`** is the hard ceiling — the control plane cannot consume the
  machine.
- **`dial-dev.slice` has no `MemoryLow`**, so it is the first slice reclaimed
  when the host is short. Development yields to the control plane by construction.
- **`dial-survival.slice`** keeps SSH, tunnel, overlay and monitoring alive
  ahead of everything else.

## 9.3 CPU

`CPUQuota` is a ceiling, not a reservation; contention is arbitrated by
`CPUWeight`. This is what makes a 200% ceiling safe on a 2 OCPU host.

- **200%** — the control plane's hard ceiling. It may use both cores when nothing
  else wants them, which is the common case and is free performance.
- **125%** — its steady-state budget. There is no systemd primitive for this
  (`CPUHigh` does not exist), so it is enforced as an admission-control and alert
  threshold: above 125% sustained, the control plane stops dispatching new local
  sandbox work.
- **weights** — with survival at 10000, control at 800 and dev at 400, sshd
  preempts everything the moment it needs CPU, and under control/dev contention
  the split is approximately 67% / 33%.

Starting values only. Final numbers must be tuned from measured RSS and PSI under
real load, per §20.

## 9.4 Pressure response

```text
GREEN    normal
YELLOW   sustained memory pressure -> stop admitting new local sandbox work;
                                      dispatch to providers only
ORANGE   available memory below floor -> stop optional background work
RED      critical -> reclaim dev slice, then sandbox;
                     never survival, never the control-plane floor
```

Survival order, highest first: recovery networking → OCI/system control → control
authority → MCP → Commander → dev slice → sandbox.

Swap or zram exists for survivability only and is never counted as capacity.

## 9.5 Micro nodes

`vekl-worker` and `oracle-admin` are 1 GB hosts and get the same treatment rather
than being left unbudgeted as in Rev 1:

```text
survival slice        MemoryMin=192M, CPUWeight=10000
node service slice    MemoryHigh=512M, MemoryMax=640M
```

If `oracle-admin` can be pushed into OOM, the recovery plane is not independent,
which defeats its entire purpose.

---

# 10. Security posture

## 10.1 Container boundary

Denied in the sandbox, without exception:

```text
docker daemon socket mount          --privileged
--network=host                      --pid=host
--ipc=host                          host root filesystem mounts
writable host /etc, /root           host SSH key material
any mount of administrative credential material
```

Docker socket access is equivalent to host root. It is never mounted into an
execution sandbox for any reason.

Shell deny patterns (§8.1) are defense in depth and are trivially evadable
(`git push -f`, `git -C … push --force`). They are never the enforcement
boundary. OS permissions, cgroups, network policy and the host-role guards are.

## 10.2 Mounts

Task-specific workspaces, one per unit, mounted individually:

```text
/srv/dial/workspaces/<task-id>:/workspace:rw
/srv/dial/reference:/reference:ro
```

`/home`, `/root`, `/etc`, `/var/lib` and `/var/run` are not mounted. Concurrent
units never share a writable tree.

## 10.3 Identities

Separate principals, separate credentials, separate audit identity, independent
rotation. No cluster-wide bearer token.

```text
provider.<id>      per provider registry entry
node.vekl-worker
node.oracle-admin
commander.local
owner.primary
```

Capability grants are least-privilege. A provider principal holds task and
artifact capabilities; it never holds `host.request_privileged`,
`recovery.execute` or any administrative capability.

## 10.4 Credential scope

A sandbox or provider container receives **only** the job-scoped credential for
the active unit.

Administrative credential material of any kind — cloud tenancy administration,
tunnel administration, database privileged roles, provider account-level
credentials, privileged SSH material — **must not be present** in any execution
environment on the fabric.

This is a hard invariant, not a preference, and it is verified by test rather than
asserted. Provider credentials remain in the control process or provider bridge
and are never injected into execution sandboxes.

## 10.5 SSH

Purpose-specific keys, independently rotatable, host-restricted and
command-restricted where practical. Recovery, service, human and automation SSH
are separate identities. No single omnipotent key.

---

# 11. Network

All three VMs sit in the same OCI VCN. Routine east-west traffic does not
traverse the public Internet.

```text
dial-hermes-control <-> vekl-worker      private, MCP
oracle-admin         -> both nodes       private, SSH
internet             -> private MCP      DENY
internet             -> private SSH      DENY where a private path exists
```

Provider containers cannot be assumed to reach the private VCN. Provider ingress
is authenticated and brokered:

```text
provider container -> Cloudflare Access -> Cloudflare Tunnel -> MCP on control host
```

No raw public MCP port is exposed. Authentication uses short-lived task-bound
tokens with per-provider scope, nonce/replay protection and strict expiry; mTLS
where practical.

Default-deny east-west, NSGs per node, no unrestricted `0.0.0.0/0` SSH.

---

# 12. Recovery

Normal owner control no longer traverses `oracle-admin`. ChatGPT mobile reaches the
owner-facing online Commander on `dial-hermes-control`, then Hermes. Recovery is
deliberately out-of-band:

```text
A  GitHub-hosted Actions -> OCI API -> OCI Run Command
B  OCI console / Cloud Shell -> OCI Run Command
C  private SSH from the recovery plane
D  reciprocal bounded recovery SSH
E  recovery MCP
F  oracle-admin remote Desktop Commander (cold / break-glass only)
G  secondary overlay where configured
```

Path A is the normal machine recovery mechanism for Commander/Hermes outages. The
GitHub workflow has enumerated target/action inputs, no free-form shell input, a
per-target concurrency lock, and a protected `oracle-recovery` environment for
mutating actions. It therefore remains usable when Commander, Hermes or
`oracle-admin` is unavailable.

`oracle-admin` remains a recovery host but does not carry routine ChatGPT,
development, model or build load. Its Commander may be started temporarily by the
bounded recovery workflow when a break-glass interactive recovery device is required.

Recovery paths are exercised on a schedule. An untested recovery path is not a
recovery path.

---

# 13. Audit

Every unit emits a durable record. Fields are fabric-level; project-specific
identifiers arrive through the binding in §17 and are opaque here.

```json
{
  "unit_id": "<opaque>",
  "requested_by": "owner.primary",
  "provider_attempts": [
    {
      "provider_id": "provider-a",
      "outcome": "INFRASTRUCTURE_INADEQUATE",
      "observed_reason": "workspace clone exceeded container disk",
      "wall_clock_s": 214
    }
  ],
  "selected_venue": "dial-hermes-control/sandbox",
  "venue_basis": "PROVIDER_ATTEMPTED_INADEQUATE",
  "cpu_limit": 0.75,
  "memory_limit_mb": 2560,
  "network_mode": "airgapped",
  "started_at": "...",
  "ended_at": "...",
  "result": "SUCCESS"
}
```

`observed_reason` is free text recorded from the provider. Nothing branches on it.

The record is append-only and written through `audit.append` to storage the
executing principal cannot rewrite. A venue decision recorded by the same party
that made it, in a mutable store, is not an audit trail.

---

# 14. Host-role guards

Each node enforces its own identity locally, and the guard applies regardless of
how the request arrives — control plane, MCP, SSH, Commander, cron, systemd,
shell or any automation.

```text
oracle-admin          rejects all project work and any fallback venue role
vekl-worker           rejects control authority and heavy local compute
dial-hermes-control   rejects unclassified heavy work, and admits a unit only on
                      one of the three bases in §5.1 — never on
                      provider-unavailable
```

The last clause is the mechanism behind §6. It is the fabric's load-bearing
control and must be implemented as a guard that inspects the signed venue
decision, not as prose.

## 14.1 The venue decision must be signed

Everything in this fabric keys off the venue basis. If a unit can assert its own
basis, the control is decorative.

The control plane signs the venue decision; guards verify the signature before
execution. A unit arriving at Oracle without a valid signed decision is rejected.

The signed decision carries the basis and the evidence for it:

```text
HOST_SUBJECT                    the host named as the work's subject
PROVIDER_ENVELOPE_EXCEEDED      the requirement, the envelopes compared against,
                                and the dimension that exceeded
PROVIDER_ATTEMPTED_INADEQUATE   the attempt record and observed reason
```

For `PROVIDER_ENVELOPE_EXCEEDED` this makes the guard's check arithmetic rather
than trust: both the requirement and the envelopes originate with the control
plane (§5.2), so the guard re-computes the comparison and rejects a decision
whose numbers do not support its basis.

---

# 15. Observability and alerts

Per node: CPU, RSS, `memory.current`, `memory.events`, PSI memory and CPU, disk
and inode usage, container memory and PID counts, queue depth, dispatch latency.

Fabric-level: provider attempt outcomes by reason, fallback rate per provider,
rejected venue decisions, MCP authentication failures, SSH attempts, systemd
restarts, tunnel and overlay health.

High-priority alerts:

```text
control plane MemoryHigh sustained     unsigned venue decision rejected
control plane MemoryMax reached        provider-unavailable unit attempted locally
dev slice OOM                          oracle-admin received project work
control plane CPU > 125% sustained     vekl-worker attempted heavy compute
privileged container attempted         docker daemon socket mount attempted
MCP or tunnel unavailable              SSH unreachable from oracle-admin
fallback rate above baseline           provider queue stalled
disk pressure above threshold          recovery drill failed
```

A rising fallback rate is a capacity signal about a subscription, not noise. It
is the primary evidence this fabric produces.

---

# 16. Failure matrix

| condition | expected behavior |
| --- | --- |
| control process fails | systemd restart, state preserved, provider work continues or pauses safely, `oracle-admin` reachable |
| sandbox fails | control plane survives, sandbox recreated, no host damage |
| provider unavailable | retry, switch, queue, fail visibly — never Oracle |
| provider inadequate | recorded, Oracle sandbox, budget enforced |
| provider auth expired | treated as unavailable; requires external intervention; no local fallback |
| `vekl-worker` down | background work queues, control plane continues, `oracle-admin` diagnoses |
| `oracle-admin` down | other nodes continue, Commander local, OCI console remains external recovery |
| Cloudflare down | private VCN and overlay remain, recovery intact |
| SSH down | OCI Run Command, Commander, recovery MCP |
| venue decision unsigned | rejected at the guard, alerted |
| both dispatch owners active | split-brain guard: dispatch ownership is leased, single-holder |

---

# 17. Project binding

The fabric is project-neutral. Each project supplies a binding:

```text
project_id
repositories and workspace roots
MCP endpoint and capability subset
credential references (job-scoped only)
attempt budget overrides
audit sink
```

Anything a project needs beyond this — its truth model, gates, knowledge layer,
feature identity or task numbering — lives in that project and is opaque to the
fabric. Rev 1 embedded one project's concerns directly in fabric policy
(a Project Truth integration section, knowledge-layer routing, a hardcoded
repository in the audit example). Those are removed from this document and
belong in that project's binding.

## 17.1 Interface with project runtime policy

Where a project operates its own runtime policy — a locked model chain, a
development gate, a qualification fingerprint — this fabric is subordinate to it
and must not perturb it:

- venue routing never selects, orders or substitutes a model;
- a project's development gate is evaluated by that project, before a unit ever
  reaches the fabric; the fabric does not interpret it;
- where a project pins a qualification fingerprint over control-plane paths,
  implementing this fabric will change those paths and require re-qualification.
  That is the project's process to run, and it must be sequenced into any
  rollout that touches them.

---

# 18. Acceptance tests

The fabric is not certified until each passes. Tests marked **induced** must be
proven by causing the failure, not by inspecting configuration.

| # | test | expected |
| --- | --- | --- |
| A | ordinary work unit submitted | executes in a provider container; Oracle CPU impact minimal |
| B | provider blocked (outage) | retry, switch, queue or visible failure; **no** Oracle execution |
| C | provider attempt fails on infrastructure | reason recorded; Oracle sandbox; within configured limits |
| C2 | unit whose known requirement exceeds every envelope | routed to Oracle with **no** provider attempt; basis and compared figures recorded |
| C3 | unit whose requirement is not in hand | attempted in a provider; no pre-flight probe issued; dispatch latency unchanged from baseline |
| D | host-subject work (systemd change) | sandbox cannot perform it; policy gate; Commander executes |
| E | project work sent to `oracle-admin` | denied by host-role guard |
| F | heavy unit sent to `vekl-worker` | dispatched outward, not executed locally |
| G | **induced** — forged venue basis claiming inadequacy | rejected: signature invalid |
| G2 | **induced** — signed decision claiming `ENVELOPE_EXCEEDED` whose figures do not exceed | rejected: guard re-computes the comparison |
| G3 | **induced** — submitter supplies its own requirement figure | ignored; the control-plane figure is used |
| H | **induced** — unit submitted directly by cron, systemd and shell, bypassing the control plane | rejected by guard in all three cases |
| I | **induced** — guard service stopped, then unit submitted | fails closed; no execution |
| J | **induced** — memory stress in dev slice | dev reclaimed first; control plane holds its 2G floor; SSH responsive |
| K | **induced** — CPU saturation in dev slice | SSH latency stays within threshold; control plane holds steady budget |
| L | escape attempts: `--privileged`, socket mount, `--network=host` | denied |
| M | Cloudflare path disabled | private VCN and recovery intact |
| N | SSH broken on control host | Run Command or Commander path works |
| O | credential scan of a running sandbox | only the job-scoped token present |
| P | attempt budget exhausted | visible failure; **no** implicit Oracle fallback |

G through K are the tests Rev 1 lacked. It verified only that guards deny what
they are asked to deny, never that they cannot be bypassed or that they fail
closed. A gate whose failure has not been induced is not known to work.

---

# 19. Migration

Each phase ends with evidence, and no phase begins before the previous one's
evidence exists.

```text
0  baseline      inventory services, measure RSS/PSI/CPU, record ports,
                 back up control state, verify every recovery path in §12
1  protect       establish slices and the §9 budget at current size;
                 prove the control plane holds under induced dev-slice pressure
2  resize        clean shutdown, A1 -> 2 OCPU / 12 GB, verify network,
                 control plane, MCP, Commander, recovery
3  worker        stand up vekl-worker, private MCP binding, queue services,
                 move background coordination off the control host
4  sandbox       Docker/Podman, toolbox image, default air-gapped profile,
                 persistent and disposable profiles, socket and privilege denials
5  providers     provider registry, per-provider principals and credentials,
                 Cloudflare Access ingress, signed venue decisions, guards
6  recovery      separate keys, drill every channel in §12, record results
7  certify       run §18 in full, including every induced test; capture evidence
```

Phase 1 before phase 2 is deliberate: prove the control plane survives
constrained resources before actually constraining them.

Where a project pins a qualification fingerprint over control-plane paths,
phases 3–5 will invalidate it. Re-qualification is that project's step and must
be scheduled at the end of each phase that touches those paths.

---

# 20. Open decisions

Recorded rather than assumed. Each needs an owner decision or a measurement
before this document can be certified.

1. **A1 allocation.** The Always Free A1 allowance is understood to be 4 OCPU /
   24 GB in aggregate. If no second A1 instance claims the other half, a single
   VM at 4/24 is equally free, and most of the pressure this document manages
   would not exist. Confirm against the live tenancy: the answer either justifies
   2/12 or removes the constraint.
2. **Micro-node adequacy.** Whether `vekl-worker`'s coordination duties fit in
   1 GB alongside a runtime and MCP client is a measurement, not a judgment.
   Measure in phase 3. If it does not fit, it is a second A1, not a bigger micro.
3. **Provider surface envelopes.** Each registry entry's declared infrastructure
   envelope must come from the provider's documented subscription limits, not
   from recall. Unverified envelopes cause wrong routing.
4. **Resource values.** Every number in §9 is a starting point requiring
   validation against measured load before production lock.
5. **Ambiguous provider failures.** §6 defaults ambiguous signals to
   "unavailable". Confirm this is the intended bias for each provider, since it
   trades some legitimate fallback for control-plane safety.

---

# 21. Changes from Revision 1

| area | Rev 1 | Rev 2 |
| --- | --- | --- |
| Oracle eligibility | closed enum of `locality_reason` values checked before dispatch | no list; three bases (§5.1) — attempt is the default, skipped only where a fact already in hand rules every provider out |
| declared envelopes | declared in the registry but never consulted | compared before dispatch, without investigation and with no added latency (§5.2) |
| reason handling | gate | evidence (§5) |
| outage vs inadequacy | conflated; no insufficiency concept | separated, with opposite handling (§6) |
| providers | two hardcoded execution classes | registry of N entries; Antigravity included (§3) |
| retry cost | unbounded | explicit attempt budget (§7) |
| resource model | ceilings only | protection floors plus ceilings (§9) |
| control-plane memory | `High 6G / Max 7.5G`, leaving 1.0 GB | `Min 2G / Low 3.5G / High 5G / Max 6G` |
| control-plane CPU | `CPUQuota=175%` | weights plus `200%` ceiling, `125%` steady budget (§9.3) |
| micro nodes | unbudgeted | budgeted (§9.5) |
| stated reserve | ≥3.5 GB, contradicted by its own config | ≥3.0 GB steady, reconciled with config |
| venue decision | unsigned JSON | signed by control plane, verified by guards (§14.1) |
| project coupling | project truth, knowledge layer and a hardcoded repository in fabric policy | removed to a project binding (§17) |
| model selection | present as routing inputs | out of scope (§1.2) |
| acceptance tests | denial paths only | adds induced bypass, fail-closed and pressure tests (§18) |
| status | "Proposed Canonical Architecture" | `PROPOSED — NOT_IMPLEMENTED` |

---

# 22. Principle

> The Oracle estate exists to keep the fabric persistent, reachable, recoverable
> and authoritative. It is not a source of development compute.

Providers supply elastic compute. The control plane decides venue, and records
why. Oracle receives work only when a provider has tried and could not, or when
the limits already on file say it plainly could not — never because a provider
was busy, and never because a list said so.
