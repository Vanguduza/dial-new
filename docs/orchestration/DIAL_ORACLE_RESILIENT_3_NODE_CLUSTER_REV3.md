# DIAL Oracle Resilient 3-Node Control, Recovery & Desktop Commander Architecture — Rev 3

**Revision:** 3
**Date:** 2026-09-12
**Status:** Engineering architecture and implementation authority
**Supersedes:** Rev 2 (`DIAL_ORACLE_RESILIENT_3_NODE_CLUSTER_DESKTOP_COMMANDER_REV_2.md`)
**Preserves:** Rev 2 Parts I–IV and the Rev 1 laboratory baseline, by reference, unchanged

---

## 0. Revision intent

Rev 3 is an overlay on Rev 2, on the same terms Rev 2 overlaid Rev 1: **nothing is deleted,
capabilities are preserved, and where a Rev 2 mechanism is wrong for this estate the
production implementation is superseded while the capability remains.**

Rev 3 exists to settle three owner requirements:

1. the estate must stay inside Oracle Always Free;
2. every VM must be reachable directly, never through another VM;
3. recovery must be two-way.

It also corrects four defects in Rev 2 that were found by running the architecture
against live infrastructure on 2026-09-12, not by re-reading it.

### 0.1 Precedence

1. Rev 3 production safety controls and capacity limits
2. Rev 3 implementation guidance
3. Rev 2 retained guidance not contradicted here
4. Rev 1 retained implementation (LAB-ONLY where so marked)

### 0.2 What Rev 3 corrects in Rev 2

| Rev 2 | Defect | Rev 3 |
|---|---|---|
| §5.1, §7.1, §12, Part II script — Commander as an inbound agent on ports 9000–9005 | The product has no inbound agent port. Opening that range is attack surface for zero benefit, and "Commander direct target" was uncertifiable as written | §4 restates the real transport |
| §3.1 — VCN `10.20.0.0/16`, production `10.20.10.0/24`, management `10.20.20.0/24` | The estate is one VCN and one `10.0.0.0/24`. No production/management split exists. §6.4's `from="10.20.20.0/24"` would lock out every real host | §3 states the actual topology |
| §9, §12, §15.4 — assumes volume recovery is available | No section required a backup to exist, and on 2026-09-12 no host in the estate had one | §6 makes backup a certification requirement |
| §4.3 — R0–R3 action classes | A second governance vocabulary alongside `policy.json`'s `authority_class`, with no mapping between them | §5.3 maps them |

### 0.3 Core production invariant (retained from Rev 2 §0.2)

> No single failure of SSH, Desktop Commander, one recovery node, Cloudflare, Hermes,
> or an individual compute instance may remove the owner's ability to diagnose the
> remaining Oracle infrastructure.

Rev 3 adds a second invariant:

> No recovery capability may require capacity the Always Free tier does not provide.
> An architecture that only works on a paid upgrade is not a free-tier architecture.

---

## 1. The estate as it actually is

| Host | Shape | vCPU / RAM | Private IP | Roles | Recovery role |
|---|---|---|---|---|---|
| `dial-hermes-control` | A1.Flex (arm64) | 4 / 24 GB | 10.0.0.184 | HERMES_CONTROL, HEAVY_COMPUTE | Recoverable by peers; **bounded recoverer** (new in Rev 3) |
| `oracle-admin-v2` | E2.1.Micro (x86_64) | 1 / 1 GB | 10.0.0.245 | ADMIN, RECOVERY, LIGHT_X86 | PRIMARY |
| `oracle-admin` | E2.1.Micro (x86_64) | 1 / 1 GB | 10.0.0.123 | ADMIN, RECOVERY, LIGHT_X86 | SECONDARY |

All three share **one VCN and one `10.0.0.0/24` subnet**. This is the single most
consequential operational fact in the estate: the VCN, subnet, internet gateway, route
table and default security list are shared with production, so **any change to them is a
change to `dial-hermes-control`**.

Per-host ingress therefore goes on an **NSG bound to one VNIC**, never on the shared
security list. Rev 2's two-subnet design remains a valid target for a future rebuild; it
is not the current estate and must not be assumed by any script.

---

## 2. Requirement 1 — staying inside Always Free

### 2.1 The capacity envelope

Always Free provides, per tenancy:

| Resource | Allowance | Committed by this estate | Remaining |
|---|---|---|---|
| AMD compute | 2 × `VM.Standard.E2.1.Micro` | `oracle-admin` + `oracle-admin-v2` | **0** |
| Arm compute | `VM.Standard.A1.Flex`, 4 OCPU / 24 GB total, divisible across up to 4 instances | `dial-hermes-control` takes all 4 / 24 | **0 as currently allocated** |
| Block storage | 200 GB total across boot and block volumes | 3 boot volumes | see §2.3 |
| Volume backups | limited; **confirm the current figure before assigning policies** | none assigned | see §6.2 |

> Confirm every figure above against current Oracle Always Free documentation before
> relying on it. These allowances have changed before and will change again. Rev 3
> states them so the design can be reasoned about, not as a substitute for checking.

### 2.2 The consequence Rev 2 missed

**The three-node design saturates the AMD allowance exactly.** There is no spare E2.

That has a direct architectural consequence Rev 2 did not state: its class R3 action
*"promote a replacement host"* has **nowhere to promote to**. Under Always Free, losing
an E2 means repairing it or rebuilding it in place — there is no standby to cut over to.

Rev 3 accepts this rather than pretending otherwise, and compensates in two ways:

1. **In-place recovery is the primary strategy**, not failover. This is why §6's backup
   requirement is load-bearing: with a boot-volume backup, a lost host is *restored*; without
   one it is *rebuilt*, and rebuilding is what cost a full day on 2026-09-12.
2. **The Arm allowance provides the only real headroom** — see §2.4.

### 2.3 Storage

Boot volumes have a 50 GB minimum. Three hosts at the minimum is 150 GB of the 200 GB
allowance, leaving roughly 50 GB for backups and any block volume.

**Do not enlarge boot volumes without recalculating.** Growing all three to 65 GB would
consume the entire allowance and leave nothing for the backups §6 requires — trading the
ability to recover for disk nobody asked for.

### 2.4 Headroom: subdividing the Arm allowance

The A1 allowance is 4 OCPU / 24 GB **divisible across up to four instances**. It is not
obliged to be one machine.

If a standby or a third recovery node is ever needed, the only free-tier route is to
split the Arm allowance rather than to add an E2:

```
Today:     dial-hermes-control   4 OCPU / 24 GB          (whole allowance)

Option:    dial-hermes-control   3 OCPU / 18 GB
           recovery-c (arm64)    1 OCPU /  6 GB          (still free)
```

This is a **deliberate, owner-authorized change**, not an automatic one: it reduces
Hermes' development pool, and `policy.json` sizes that pool at 14336 MB. Any such split
must update `hosts.json` and `policy.json` together, or the scheduler will place work on
memory that no longer exists.

Note also that a third recovery node would be **arm64**, so `role-guard.mjs`'s
architecture gate correctly refuses x86-only work to it. That gate already exists.

### 2.5 Free-tier rules for any future change

- Never launch a shape outside the Always Free list to "temporarily" test something.
- Never let a recovery procedure's happy path require a fourth instance.
- Before any launch, confirm the allowance is not already consumed — an estate at
  exactly 100% has no room for a mistake.
- Reclaim before you allocate: terminate the old host before launching its replacement,
  and only when a backup exists.

---

## 3. Requirement 2 — every VM reachable directly

### 3.1 Rule

> Every node MUST be reachable by at least two paths that share no dependency on any
> other node. No node may be a mandatory hop to any other node.

Rev 2 §1.1 stated the intent; Rev 3 makes it a certification requirement with named
paths and a test.

### 3.2 The three independent paths, per host

| Path | Depends on | Survives |
|---|---|---|
| **Direct SSH** to the host's own public IP | its VNIC, its NSG, its sshd | any other host being down |
| **OCI Run Command** via Oracle Cloud Agent | the OCI control plane and the agent | SSH being completely broken |
| **Desktop Commander** outbound device session | the host's egress and an OAuth session | inbound network policy being wrong |

Each host holds all three **independently**. None traverses another host.

Relay through a peer remains available as an *emergency* option (Rev 2 §5.1), and the
private `10.0.0.0/24` path makes it cheap. It is never the normal path and never the
only path.

### 3.3 What this settles

A claim of the form *"I cannot reach `dial-hermes-control` because `oracle-admin-v2` is
down"* describes a **broken architecture**, not a status. Under Rev 3 it is a defect
report: v2 is a peer, not a gateway, and Hermes has its own public IP, its own Run
Command path and its own Commander registration.

On 2026-09-12 that claim was made and was false — the Oracle status mirror, published by
a timer on Hermes itself, was 3 minutes old at the time.

### 3.4 Public addressing under Always Free

Each instance carries an **ephemeral public IPv4** at no cost, which is what makes three
independent direct paths free. Ephemeral addresses change if an instance is stopped and
started, so:

- `hosts.json` records **private** addresses only; public addresses are supplied at run
  time and are treated as sensitive operational detail that must not enter the repository;
- any automation that caches a public IP must re-resolve it from the control plane rather
  than trusting a stored value;
- reserved public IPs are a limited allowance — check before assuming one is available.

### 3.5 Ingress

```
SSH 22/tcp    NSG bound to that host's VNIC only, never the shared security list
              source: the narrowest stable administrative range that does not risk
              lockout. A pinned source that goes stale is how a host becomes
              unreachable; key-only authentication is the real control.

Commander     no inbound rule at all — the session is outbound (§4)

Everything    deny
else
```

---

## 4. Desktop Commander — the real transport

Rev 2 described Commander as an inbound agent on ports 9000–9005. That is wrong, and it
matters because it produces firewall rules that open ports nothing listens on.

Verified against the pinned package `@wonderwhy-er/desktop-commander@0.2.50`:

**Two transports exist, and neither accepts an inbound connection.**

1. **MCP stdio.** The client spawns the binary per session and talks over stdin/stdout.
   No port, no daemon. Over SSH this needs no open port beyond 22 and reuses existing
   SSH authentication.
2. **Outbound remote device.** `desktop-commander remote` holds a long-lived **outbound**
   session to `https://mcp.desktopcommander.app`, authenticated by an OAuth 2.0
   device-authorization flow with PKCE, kept alive by a heartbeat. It registers under
   `os.hostname()` — which is why each host's hostname must be its canonical name.

Consequences:

- **No inbound Commander rule on any host.** Delete any 9000–9005 allowance.
- A supervised systemd unit is legitimate for the *remote* transport, because it
  supervises a genuinely long-running process. It is not legitimate for stdio, where the
  unit would sit with no stdin peer and prove nothing.
- Each host registers as its **own device**, satisfying §3.1's independence requirement
  at the Commander layer.
- `--persist-session` is an accepted no-op in this version; persistence is the default.

### 4.1 What "Commander is healthy" may mean

`policy.json` requires five criteria. Three are observable on the host — `PROCESS_UP`,
`SESSION_VALID`, `REMOTE_REGISTERED`. Two are not: `PING_RESPONDS` and
`COMMAND_EXECUTES` are properties of the *client's* ability to reach the device.

A device that registered outbound proves nothing about whether the authorized client can
reach it and run a tool. The probe therefore **omits** those two rather than inventing
them, and `doctor.mjs` reads an absent criterion as `UNVERIFIED`. They are promoted only
by evidence that a real tool call produced.

**"The package is installed" is not evidence.** Neither is "the service is active".

---

## 5. Requirement 3 — two-way recovery

### 5.1 The tension, stated plainly

Rev 2 §4.1 required recovery to be **one-way**: recovery nodes hold restricted
credentials into production; production holds nothing equivalent back. Its reasoning
(§4.2) is sound — a symmetric mesh turns compromise of any one host into compromise of
the cluster.

The owner requires two-way recovery. Today `hosts.json` gives
`dial-hermes-control` `recovers: []`, so a failed E2 can only be recovered by the other
E2 — and if both E2s are down, by nothing.

These are reconcilable, but not by ignoring either. Rev 3's resolution:

> **Recovery is bidirectional in capability and asymmetric in privilege.**

### 5.2 The two directions

| Direction | Maximum authority | Mechanism |
|---|---|---|
| E2 → `dial-hermes-control` | R0 observe, R1 safe repair of allowlisted services | existing allowlisted restart path |
| `dial-hermes-control` → E2 | R0 observe, R1 restart of allowlisted **recovery** units only | new; forced-command identity |
| Either direction, R2 or R3 | **owner authorization required** | never automatic |

Hermes gains the ability to observe an E2 and restart its recovery agent. It does **not**
gain the ability to rotate credentials, change firewall rules, alter packages, reboot,
restore a volume, or terminate an instance. The blast radius of a compromised Hermes
therefore grows by "can restart a recovery service on a 1 GB admin host", which is
acceptable; it does not grow to "owns the recovery tier".

### 5.3 Mapping the two authority vocabularies

Rev 2's R0–R3 and `policy.json`'s `authority_class` are now explicitly related. This
mapping is normative:

| Class | Meaning | `authority_class` values |
|---|---|---|
| **R0** Observe | read-only diagnostics | *(no mutation; permitted to any recovery-role host)* |
| **R1** Safe repair | bounded, reversible | `SSH_REPAIR`, `DESKTOP_COMMANDER_REPAIR`, `HOST_SYSTEMD_REPAIR`, `HOST_LEVEL_CLEANUP` |
| **R2** Elevated | production-affecting | `NETWORK_FIREWALL_CORRECTION`, `CREDENTIAL_SESSION_REPAIR`, `RECOVERY_KEY_ROTATION` |
| **R3** Critical | destructive or irreversible | `OCI_RECOVERY` where it implies reboot, volume restore, promotion or termination |

`role-guard.mjs` enforces which host may run which `authority_class`, fail-closed, on the
host itself — so the mapping binds work arriving by **any** route, not only through the
scheduler.

### 5.4 Credential rules that make the second direction safe

The direction Hermes → E2 is only safe if it cannot be turned back on itself:

1. **Distinct identities.** The Hermes→E2 key MUST NOT be the E2→Hermes key, nor derived
   from it. Reusing one key makes the mesh symmetric again by accident.
2. **Forced command.** The E2's `authorized_keys` entry for Hermes MUST carry a forced
   command restricting it to the R0/R1 verb set, plus
   `no-agent-forwarding,no-port-forwarding,no-X11-forwarding`.
3. **Source restriction.** Restrict that entry to the Hermes private address
   (`from="10.0.0.184"`), which is stable because it is an OCI private IP.
4. **No credential loop.** A compromised Hermes must not be able to read, from an E2, any
   material that grants higher privilege back into Hermes. The E2→Hermes private key
   must not be readable by the forced-command identity.
5. **Separately revocable.** Removing the Hermes→E2 capability must not disturb E2→Hermes.

### 5.5 The `hosts.json` change

As built:

```jsonc
{
  "host_id": "dial-hermes-control",
  "roles": ["HERMES_CONTROL", "HEAVY_COMPUTE", "BOUNDED_RECOVERY"],
  "recovery_role": "RECOVERABLE_BY_PEERS_AND_BOUNDED_RECOVERER",
  "recovers": ["oracle-admin", "oracle-admin-v2"],
  "recovery_authority_max": "R1",            // a ceiling, ordered: never R2/R3 outbound
  "recovery_service_allowlist": ["dial-recovery-agent.service", "dial-host-agent.timer"]
}
```

`recovery_authority_max` is a single ceiling rather than a list of permitted classes. R0–R3
are ordered by severity, so a ceiling cannot be made self-contradictory the way a list can
(`["R0", "R3"]` would be readable and meaningless), and a class added to the order later is
excluded by default instead of needing every host entry edited.

The E2 entries gain the same field with their existing broader-but-still-allowlisted
scope (`R3`, still gated on owner authorization). Both `role-guard.mjs` and
`recovery-agent.mjs` read `recovery_authority_max`; see §5.7 for what enforces what.

A third field, `recovery_service_allowlist`, bounds which units a host may restart on a
peer. `["*"]` means the full `APPROVED_SERVICES` set and is honoured only for a host
holding the full `RECOVERY` role — so a wildcard pasted into the control host's entry
grants nothing rather than silently promoting it.

### 5.6 What two-way recovery buys

| Failure | Before Rev 3 | After Rev 3 |
|---|---|---|
| One E2 down | other E2 recovers it | unchanged |
| Both E2s down | **nothing can recover them** | Hermes observes and restarts their recovery agents |
| Hermes down | either E2 recovers it | unchanged |
| Hermes + one E2 down | surviving E2 recovers both | unchanged |
| All three down | owner, via OCI control plane | unchanged — and why §6 matters |

The gap this closes is "both recovery nodes down at once", which on 2026-09-12 was the
actual situation: `oracle-admin` was terminated and `oracle-admin-v2` unavailable.

### 5.7 Implementation

Sections 5.2–5.5 are built, not only specified. What enforces what:

| File | Enforces |
|---|---|
| `resource-fabric/hosts.json` | `recovers`, `recovery_authority_max`, `recovery_service_allowlist` per host |
| `resource-fabric/policy.json` → `recovery_action_classes` | the normative R0–R3 ↔ `authority_class` mapping of §5.3 |
| `resource-fabric/role-guard.mjs` | refuses any recovery work above the host's `recovery_authority_max`, and any R2/R3 without owner authorization — on the host, whatever route the work arrived by |
| `resource-fabric/recovery-agent.mjs` | `permittedServices()` narrows what a bounded recoverer may restart on a peer; `repairTarget()` refuses before it opens SSH |
| `resource-fabric/bounded-recovery-command.sh` | the forced command: the complete verb set the Hermes key can reach on an E2 |
| `resource-fabric/install-bounded-recovery-identity.sh` | installs, verifies and revokes that `authorized_keys` entry, refusing every unsafe shape |
| `tests/oracle-two-way-recovery.test.mjs` | 36 tests; `tests/oracle-role-guard.test.mjs` carries 46 more |

The bound is enforced at three independent layers, deliberately:

1. **Scheduling** — `placement.mjs` Gate A will not route out-of-role work.
2. **Host** — `role-guard.mjs` refuses it locally however it arrived, including by hand.
3. **Channel** — the forced command refuses it at the SSH boundary, so a compromised
   Hermes with a valid key still cannot exceed R1.

Layer 3 is the one that matters for this design. Layers 1 and 2 are DIAL code running on a
host; if Hermes were compromised, an attacker would simply not use them. The forced command
runs on the *target*, under the target's authority, and is the only layer whose refusal
does not depend on the attacker's cooperation.

`role-guard.mjs` records the permitted class on every allow, so a recovery action leaves
evidence of the authority it ran under rather than only that it ran.

#### What is still a manual owner step

Two, on purpose, because each one grants a capability rather than installing a restriction:

- generating the dedicated bounded-recovery keypair on `dial-hermes-control`;
- running `install-bounded-recovery-identity.sh <hermes.pub>` on each E2.

`bootstrap.sh` phase 5 installs the forced command unconditionally and then *reports*
whether the key has been authorized. Installing the restriction before the capability is
the correct order: binding a key to a forced command that does not yet exist would grant
an unrestricted shell for the length of that window.

---

## 6. Recovering without losing data

### 6.1 Requirement

> A host with no boot-volume backup is not a recoverable host. It is a rebuildable one,
> and rebuilding is not recovery.

Rev 2 assumed volume recovery was available (§15.4) without ever requiring it. On
2026-09-12 **no host in the estate had any backup policy assigned.**

### 6.2 Policy under Always Free

Volume backups count against the free allowance, and the allowance is small. So:

- **Confirm the current backup allowance before assigning policies.** A policy that
  retains twelve monthly backups across three hosts will exceed a small allowance and
  start failing silently — a backup job that fails quietly is worse than none, because it
  looks like protection.
- Prefer the **least frequent policy that meets the recovery point you actually need**.
  These hosts hold little that changes daily (§6.3), so monthly is defensible.
- Boot volumes are the disaster-recovery mechanism. They are **not** the offsite
  evidence mechanism (§6.4).

`deploy/oracle/provisioning/40-backup-policy.sh` assigns, reports, and **exits non-zero
while any host lacks a policy**. Protected hosts require an explicit `--include-hermes`,
because assigning a policy to their boot volumes is still a modification of a protected
host — it reboots nothing and adds no compute risk, but it stays a deliberate act.

### 6.3 What is actually at risk

| Path | If lost |
|---|---|
| `/var/lib/dial-recovery/fabric/recovery-evidence` | **Not re-derivable** — audit history |
| `/var/lib/dial-recovery/fabric/decisions` | **Not re-derivable** — audit history |
| `bootstrap-state.json`, telemetry, recovery-state | re-derivable by re-running bootstrap |
| `~ubuntu/.desktop-commander-device/device.json` | re-pairable; needs owner and a browser |
| `/opt/dial-recovery/dial-new` | re-clonable |

Only the evidence and decision records are irreplaceable, and both are audit history
rather than operational state. **Nothing on an E2 is load-bearing for DIAL itself** —
these hosts recover the estate, they do not hold it. That is what makes a monthly RPO
tolerable here and would not make it tolerable on Hermes.

### 6.4 Offsite evidence

Boot-volume backups stay inside the tenancy. An offsite copy of the two irreplaceable
directories is worthwhile, with one hard constraint:

> These hosts carry live credentials — the Commander device credential, SSH material,
> Codex and Claude OAuth sessions, and at least one API key under `~/.dde-control/secrets/`.
> Any offsite copy MUST be an **allowlist** of named paths, scanned for
> credential-shaped content and refused on any match. A deny-list fails open on whatever
> nobody thought of.

Where the destination is third-party storage, the token held on the host must be scoped
to files the job itself created, never to the owner's whole account. A token on a
recovery host is a token that can be stolen from a recovery host.

---

## 7. Certification

A node is certified when its independence is **demonstrated**, not declared.

| Capability | `oracle-admin` | `oracle-admin-v2` | `dial-hermes-control` |
|---|---|---|---|
| Direct SSH to its own public IP | Required | Required | Required |
| OCI Run Command harmless probe | Required | Required | Required |
| Commander registered as its own device | Required | Required | Required |
| **No path depends on another node** | Required | Required | Required |
| Boot-volume backup policy assigned | Required | Required | Required |
| Private IP stable and matching `hosts.json` | Required | Required | Required |
| SSH key-only, password auth off | Required | Required | Required |
| Purpose-bound recovery identity, forced command | Required | Required | Required |
| Inbound Commander ports closed | Required | Required | Required |
| Recovers its peers (§5.2) | Required | Required | Required, bounded R0/R1 |
| `role-guard` refuses out-of-role work | Required | Required | Required |
| Free-tier allowance not exceeded | Required | Required | Required |
| Production service health | N/A | N/A | Required |

### 7.1 What counts as proof

Rev 2 used "proven" without defining it. Rev 3 defines it:

> A capability is proven only by evidence that **could not exist unless the capability
> worked**. Installed packages, active services and successful exit codes are not
> evidence. An empty response is not a pass.

Concretely: Run Command is proven by output returned through the control plane; Commander
is proven by a record that only a real tool call could have written; direct-access
independence is proven by §7.2.

### 7.2 Independence test (non-destructive)

1. Stop the Commander session on `oracle-admin`. Verify the other two remain reachable
   by all their own paths.
2. Block SSH to `oracle-admin-v2` at its NSG. Verify Run Command still reaches it, and
   that `dial-hermes-control` is unaffected.
3. With **both** E2s made unreachable, verify `dial-hermes-control` is still reachable
   directly, and that it can observe and restart an E2 recovery unit (§5.2).
4. Restore each change and re-verify.
5. Capture evidence for every step.

Step 3 is new in Rev 3 and is the direct test of requirements 2 and 3 together. Never
prove isolation by powering off production.

---

## 8. Acceptance criteria

Rev 3 is GREEN only when all hold:

- [ ] every node reachable by **at least two paths sharing no dependency on another node**
- [ ] no node is a mandatory hop to any other node
- [ ] recovery is bidirectional, with Hermes bounded to R0/R1 outbound
- [ ] Hermes→E2 uses a distinct, forced-command, source-restricted identity
- [ ] no credential loop: a compromised Hermes cannot escalate back into Hermes via an E2
- [ ] every host has a boot-volume backup policy assigned
- [ ] the estate is inside the Always Free allowance, with the figures re-confirmed
- [ ] no inbound Commander port is open on any host
- [ ] `role-guard` enforces separation on each host, fail-closed
- [ ] R0–R3 and `authority_class` are mapped, and only one is enforced (§5.3)
- [ ] the independence test (§7.2), including step 3, passes with evidence
- [ ] no universal cluster key exists

---

## 9. Open items

Named rather than omitted.

### 9.1 Built in this revision

1. **`hosts.json` two-way recovery.** `dial-hermes-control` now carries the
   `BOUNDED_RECOVERY` role and `recovers: ["oracle-admin", "oracle-admin-v2"]`. Every host
   in the estate now has at least two independent recoverers, and a test asserts it.
2. **`recovery_authority_max` exists and is enforced** in `hosts.json`, `policy.json`,
   `role-guard.mjs` and `recovery-agent.mjs`. §5.2's bound is enforcement, not prose.
3. **The forced-command identity exists** — `bounded-recovery-command.sh` and
   `install-bounded-recovery-identity.sh`. See §5.7.

### 9.2 Still open

These are the honest remainder. Note what §9.1 does *not* claim: the mechanism is built and
unit-tested, but it has never run between two live hosts. Per §7.1 that is not proof.

1. **Two-way recovery is unexercised end to end.** No bounded-recovery key has been
   generated or authorized, and Hermes has never restarted an E2's recovery agent. Until
   it has, this is tested code, not a proven recovery path.
2. **No backup policy has been applied.** The script is written and tested; it has never
   been run with `--apply`.
3. **`oracle-admin-v2` is down.** Two-way recovery cannot be certified until it returns.
4. **`oracle-admin`'s recovery plane is unproven** and Commander is unpaired; its
   certification stands at AMBER.
5. **The control-plane outage is unresolved** — Sol and Sonnet `AUTH_FAILED`, gate
   `DEVELOPMENT_BLOCKED`. Independent of everything above; no host recovery fixes it.
6. **Always Free allowances in §2.1 need re-confirming** against current Oracle
   documentation before any capacity decision rests on them.
7. **Rev 2's two-subnet design is not implemented** and the estate is single-subnet. If a
   production/management split is wanted it is a planned migration, not an assumption.
