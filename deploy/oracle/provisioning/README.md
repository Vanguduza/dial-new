# oracle-admin — E2 recovery/admin node provisioning

Rebuilds the secondary Always Free E2 recovery node `oracle-admin` in
`af-johannesburg-1`, from an empty compartment to a certified recovery foothold.

Companion to `deploy/oracle/resource-fabric/`, which is the recovery plane itself.
This directory is only how a host gets built and proven; it adds no second recovery
authority.

## Status of this increment

Honest accounting, in the style of the fabric README. **Nothing here has been
executed against Oracle Cloud.** The session that wrote it had neither OCI
credentials nor network reach to the OCI API (`iaas.af-johannesburg-1.oraclecloud.com:443`
is refused by the environment's egress policy). Every script is written, syntax-checked
and unit-tested; none has provisioned a real instance.

| Artefact | Status | Verified by |
|---|---|---|
| `lib.sh`, `00-hermes-fingerprint.sh` | **implemented** — protected-host guards, Hermes drift evidence | `tests/oracle-admin-provisioning.test.mjs` |
| `10-network-preflight.sh` | **implemented** — discovery-first; refuses to mutate shared objects | same |
| `20-launch-oracle-admin.sh` | **implemented** — E2 launch, NSG-scoped ingress, IMDSv2, agent plugin policy | same |
| `cloud-init.yaml.tmpl`, `render-cloud-init.sh` | **implemented** — renders to valid YAML, bootstrap round-trips byte-identically | same |
| `bootstrap.sh` | **implemented** — phases 0-7, soft-failing above the recovery floor | same |
| `commander-*.sh`, `systemd/dial-commander-remote.service` | **implemented** — outbound device transport and fail-closed probe | same |
| `host-certify.sh`, `30-certify.mjs` | **implemented** — measured facts, `unverified` never reads as healthy | same |
| **Live instance** | **not provisioned** | — |
| **SSH, Run Command, Commander proof** | **not established** | — |

Certification for the live host is therefore **RED**: no remote recovery path
exists yet, because no host exists yet.

## Two decisions this increment settles

### 1. The network is shared with Hermes, so ingress must not be

`resource-fabric/hosts.json` places `dial-hermes-control` at `10.0.0.184` and
`oracle-admin` at `10.0.0.123` — one `/24`. The VCN, subnet, internet gateway and
route table named in the brief are therefore almost certainly **existing objects
that Hermes depends on**, not things to create.

Consequences, enforced in code:

- `10-network-preflight.sh` **discovers** and verifies; it creates only what is
  genuinely absent, and records exactly what it created in `network.json`.
- SSH ingress is applied through a **new NSG bound to the `oracle-admin` VNIC
  alone**, never as a rule on the shared security list. A security-list edit would
  silently change Hermes' effective ingress policy.
- If the shared route table lacks a default route to the internet gateway, the
  script **stops** instead of adding one. Repairing it would be a Hermes change.
- The brief says the private IP should be automatic. The fabric resolves recovery
  peers by the address in `hosts.json`, so repository truth wins: `10.0.0.123` is
  pinned, and the preflight warns if it is already taken.

`00-hermes-fingerprint.sh` snapshots the Hermes instance, VNICs, subnets, route
tables and security lists before and after, and diffs them. Section 19 compliance is
then evidence, not an assertion in a report.

### 2. Desktop Commander: the stdio-only conclusion was incomplete

`deploy/oracle/resource-fabric/README.md` states that Desktop Commander is an MCP
**stdio** server with no persistent host-side process, that an always-on unit would
"sit with no stdin peer and prove nothing", and that architecture §17's
active/standby registration has no meaning. That reasoning is correct *for the stdio
transport*, and the removal of the old `desktop-commander.service` was right.

It is not the whole picture for the pinned version. `@wonderwhy-er/desktop-commander@0.2.50`
ships a `remote-device/` subsystem and a `remote` subcommand:

- `desktop-commander remote` runs a **long-lived outbound device session** to
  `https://mcp.desktopcommander.app`, and keeps it alive with a heartbeat.
- It authenticates with an **OAuth 2.0 device-authorization flow (RFC 8628) with
  PKCE** — the owner approves a short code in a browser. No secret is ever typed
  into the host, cloud-init or the repository.
- It registers under **`os.hostname()`**, which is why the instance hostname is
  `oracle-admin`: that is the name that appears in the client's device list.
- `--persist-session` is now an accepted **no-op**; persistence is the default.
  The historical invocation still works but the flag carries no meaning.

This satisfies both constraints at once: a real, reachable device that shows as
ONLINE, with **no inbound port and no generic shell service**, because the session
is outbound. It also restores meaning to `policy.json`'s `REMOTE_REGISTERED`
criterion, which was written for this model.

So `systemd/dial-commander-remote.service` is a legitimate unit — it supervises a
genuinely long-running process — and section 17's prohibition on "a bogus service
to make `systemctl is-active` green" is not engaged. The unit carries
`ConditionPathExists` on the device credential, so an unpaired host shows the
service as inactive rather than flapping.

Boundary unchanged: Commander is **owner host-administration tooling on the E2
admin/recovery plane**. It is not the DIAL operator gateway, and it must never
become a path for dispatching DIAL development work.

## What "Commander is healthy" is allowed to mean

`policy.json` requires five criteria. Three are observable on the host; two are not:

| Criterion | Established by |
|---|---|
| `PROCESS_UP` | the supervised unit is active |
| `SESSION_VALID` | device credential exists, parses, and is mode `600` |
| `REMOTE_REGISTERED` | `Device ready:` in the journal **since the current start** of the unit |
| `PING_RESPONDS` | — |
| `COMMAND_EXECUTES` | — |

A device that registered outbound proves nothing about whether the authorized
client can reach it and run a tool. `commander-probe.sh` therefore **omits** the
last two rather than inventing them; `doctor.mjs` reads an absent criterion as
`UNVERIFIED` and refuses to call the host GREEN.

They are promoted only by a proof that nothing but a real tool call can produce.
The owner asks the authorized client, with the `oracle-admin` device selected, to run:

```
dial-commander-record-proof
```

It captures its own process ancestry, so a proof written by an SSH shell is
distinguishable from one written through Commander, and collects the section 18
evidence set (ping, hostname, `uname -a`, a filesystem read, a harmless command).
Stale proofs expire. This is the difference between "the package is installed" and
"ChatGPT can actually drive this machine".

## Operator prerequisites

The OCI CLI must be installed and configured with a profile that can create compute
and network resources in the target compartment. Nothing in this directory reads,
writes, transports or prints a private key.

```bash
export DIAL_OCI_COMPARTMENT=ocid1.compartment.oc1..xxxx
export DIAL_OCI_REGION=af-johannesburg-1
export DIAL_SSH_INGRESS_CIDR=203.0.113.4/32   # strongly preferred over 0.0.0.0/0
export DIAL_SSH_PRIVATE_KEY_FILE=~/.ssh/oracle-admin   # used only to read certification back
```

## Run order

```bash
cd deploy/oracle/provisioning

./00-hermes-fingerprint.sh snapshot hermes-before.json   # section 19 baseline
./10-network-preflight.sh                                # -> network.json
./20-launch-oracle-admin.sh                              # -> instance.json
# wait for cloud-init (first boot installs Node and clones the recovery branch)
./00-hermes-fingerprint.sh snapshot hermes-after.json
./00-hermes-fingerprint.sh diff hermes-before.json hermes-after.json

ssh -i "$DIAL_SSH_PRIVATE_KEY_FILE" ubuntu@<public-ip> 'sudo dial-host-certify' > host-certification.json
./30-certify.mjs --host-report host-certification.json
```

Expect **AMBER** at this point: everything is healthy except Commander, which needs
one owner action.

```bash
ssh -i "$DIAL_SSH_PRIVATE_KEY_FILE" -t ubuntu@<public-ip> 'sudo -u ubuntu dial-commander-pair'
```

Approve the code in a browser. The session persists and the supervised unit takes
over. Then, from ChatGPT with the `oracle-admin` device selected, run
`dial-commander-record-proof`, and re-run `30-certify.mjs` for **GREEN**.

## Bootstrap phases

Phases 0-2 are the recovery floor. Phases 3-7 are soft: each records `FAILED` and
continues, and none can undo the floor. A host that fails every optional phase still
boots with key-only SSH and a working Oracle Cloud Agent.

| Phase | Does | On failure |
|---|---|---|
| 0 | Baseline facts, IMDSv2 probe, state file | continues |
| 1 | OpenSSH, key-only drop-in validated with `sshd -t`, UFW allows SSH first | recorded; existing SSH config retained |
| 2 | Oracle Cloud Agent, Run Command readiness, `ocarun` | recorded `DEGRADED` |
| 3 | Base packages, journald caps, swap, Node 22 from a pinned keyring | soft |
| 4 | Clone the recovery branch into `/opt/dial-recovery/dial-new` | soft |
| 5 | Stage the fabric via its own `install-recovery-peer.sh`, enable lingering and telemetry | soft |
| 6 | Install pinned Commander, install the unit, leave it inert until paired | soft |
| 7 | Install certification tooling, record reachability and ports | soft |

The drop-in is validated **before** any restart, and removed if the merged config
would not parse — a bad drop-in can never be the reason the operator is locked out.
`/etc/ssh/sshd_config` is never overwritten. The recovery agent is staged but **not
started**: it SSHes to peers with `StrictHostKeyChecking=yes`, so it stays off until
`known_hosts` is seeded, exactly as `install-recovery-peer.sh` requires.

## Layout on the host

```
/opt/dial-recovery/dial-new     recovery branch checkout
/opt/dial-recovery/commander    pinned Desktop Commander install
/opt/dial-recovery/bin          re-runnable bootstrap
/var/lib/dial-recovery          bootstrap state, Commander execution proof
/var/lib/dial-recovery/fabric   fabric state: telemetry, leases, decisions (0700)
/var/log/dial-recovery          recovery logs
/etc/dial-recovery              non-secret configuration
~ubuntu/.desktop-commander-device   device credential (0700/0600, outside the checkout)
```

Secrets never live under the git checkout.

## Resource posture

1 GB of RAM. No Docker, no database, no DIAL application runtime, no Hermes
workload, no build pipeline. Journald is capped at 100 MB, swap is 1 GB with
`vm.swappiness=10`, and Commander is bounded by `MemoryMax=256M` inside
`dial-recovery.slice` with a positive `OOMScoreAdjust` — under memory pressure the
kernel sacrifices Commander before it touches SSH or the Oracle agent.

## Known gaps

- **Nothing is provisioned.** Every claim above is about code, not a running host.
- `policy.json`'s `desktop_commander_green_requires` still lists `PROCESS_UP` first
  as though it were a service check. Under the remote transport it happens to be one
  again, so the list is coherent — but if the transport is ever reconsidered, that
  list and `doctor.mjs` must move together.
- Reciprocal recovery with `oracle-admin-v2` is out of scope here and deliberately
  untouched, per section 25.
