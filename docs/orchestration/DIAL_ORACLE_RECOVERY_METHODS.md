# DIAL Oracle recovery methods

How to get back into the Oracle estate when something breaks, what broke on
2026-09-12 and why, and what now stops each of those failures recurring.

Companion documents:

- `DIAL_ORACLE_CONTROL_RECOVERY_RUNBOOK.md` — the control-plane (OAuth/gate) outage
- `DIAL_ORACLE_TASK_AWARE_RESOURCE_FABRIC_RECIPROCAL_RECOVERY_ARCHITECTURE.md` — design
- `deploy/oracle/provisioning/README.md` — provisioning and certification mechanics

---

## 1. The estate

| Host | Shape | Private IP | Roles | Recovers |
|---|---|---|---|---|
| `dial-hermes-control` | A1.Flex, 4 OCPU / 24 GB, arm64 | 10.0.0.184 | HERMES_CONTROL, HEAVY_COMPUTE, BOUNDED_RECOVERY | `oracle-admin`, `oracle-admin-v2` — **bounded at R1** (§7) |
| `oracle-admin-v2` | E2.1.Micro, 1 OCPU / 1 GB, x86_64 | 10.0.0.245 | ADMIN, RECOVERY, LIGHT_X86 | `oracle-admin`, `dial-hermes-control` |
| `oracle-admin` | E2.1.Micro, 1 OCPU / 1 GB, x86_64 | 10.0.0.123 | ADMIN, RECOVERY, LIGHT_X86 | `oracle-admin-v2`, `dial-hermes-control` |

All three share one VCN and one `10.0.0.0/24` subnet. **That is the single most
important operational fact in this document.** The VCN, subnet, internet gateway,
route table and default security list are shared with the production control host, so
any change to them is a change to `dial-hermes-control`. Per-host ingress therefore
goes on an NSG bound to one VNIC, never on the shared security list.

---

## 2. Access paths, in escalation order

Try these in order. Each is independent of the ones above it, which is the point.

**1. SSH.** Key-only, `ubuntu@<public-ip>`, key `ssh-key-2026-09-11`
(`SHA256:ki6JlQELwJ2wCsO8KA1gV9JlG7KJ15hHdx7vl2VEntI`). Password auth and root login
are off by policy.

**2. OCI Run Command.** Console → Instance → *Run command*. Works with SSH entirely
broken: it goes through the Oracle Cloud Agent, not the network path you are locked
out of. This is why the agent plugin policy is part of certification rather than a
nicety — it is the out-of-band path that makes an SSH mistake survivable.

**3. OCI Console serial/VNC console.** For a host that boots but has no working
network stack at all.

**4. Peer recovery.** Either E2 can repair the other and the control host, over the
private addresses in `hosts.json`, without touching the internet. Since Rev 3 the control
host can also observe either E2 and restart its recovery units — bounded at R1, so it
covers "both E2s down at once" without becoming a fourth way to own the recovery tier
(§7).

**5. Desktop Commander.** Owner host administration from an authorized client. An
outbound device session, no inbound port. Convenience, never the only way in — it
depends on an external service and an OAuth session, both of which can expire.

**6. Rebuild.** Last resort. With a backup policy assigned (§6) this restores; without
one it re-provisions, which is what cost a day.

### Verifying the key before you build anything

A public key installed without its private half produces a machine nobody can log
into. Check by fingerprint, never by filename, and never by pasting a private key
anywhere:

```bash
ssh-keygen -yf ~/oracle-admin.key | ssh-keygen -lf -
```

---

## 3. The tooling

Everything lives in `deploy/oracle/provisioning/`. `env.sh` restores the environment
after a disconnect and links `~/p` to that directory, so the whole flow is short
enough to type on a phone — which, on 2026-09-12, was the only device available.

```
source ~/p/env.sh          restore environment after any disconnect
~/p/run.sh                 run every remaining step that needs no human
~/p/run.sh status          show state, change nothing
~/p/run.sh diagnose        probe the host; show certify stdout and stderr separately
~/p/run.sh repair          re-run host bootstrap from a ref that has the tooling
~/p/run.sh pair            authorize the Desktop Commander device (needs a browser)
~/p/run.sh recheck         re-collect certification after pairing
~/p/run.sh log             last run's output
```

Steps are chosen from which artefacts exist, so re-running is always safe: completed
work is skipped and nothing runs twice or out of order.

Run it inside `tmux new -s dial`; reattach with `tmux attach -t dial`. Cloud Shell
drops on idle and returns you to `~` in a fresh shell — landing at `~` means you are
outside the session, not that it died.

### Certification states

`GREEN` needs SSH, OCI emergency access, the recovery plane and Commander all
**functionally** proven. `AMBER` means the host and out-of-band recovery are proven
and Commander is not yet. `RED` means no reliable remote recovery path.

AMBER is an honest resting point, not a failure. Two independent ways in already
exist at AMBER.

Commander's five health criteria split three/two: `PROCESS_UP`, `SESSION_VALID` and
`REMOTE_REGISTERED` are observable on the host; `PING_RESPONDS` and `COMMAND_EXECUTES`
are not. A device that registered outbound proves nothing about whether the authorized
client can reach it and run a tool, so those two are promoted only by a proof that a
real tool call writes (`dial-commander-record-proof`, which captures its own process
ancestry so an SSH shell cannot forge it). "The package is installed" is not evidence.

---

## 4. What went wrong

Two separate outages, often conflated.

### 4a. Control plane — cause known, documented

Recorded in `DIAL_ORACLE_CONTROL_RECOVERY_RUNBOOK.md`:

```
Codex and Claude OAuth expired on dial-hermes-control
  → Sol AUTH_FAILED, Sonnet AUTH_FAILED
  → finalize-development-readiness.sh cannot pass its runtime probes
  → no gate file is written
  → evaluateDevelopmentUnblock() sees gate === null
  → DEVELOPMENT_BLOCKED
```

Everything below the OAuth failure is correct fail-closed behaviour, not a second
bug. **Restoring `oracle-admin` does not fix this.** It is still open.

### 4b. Recovery plane — root cause not recoverable, systemic causes are

The original `oracle-admin` was terminated with SSH refused and Commander offline. Its
logs went with it, so the proximate cause cannot now be established, and this document
does not guess at one.

What *can* be established is why it was unrecoverable and why rebuilding took a day.
Each of these was demonstrated on live infrastructure during the rebuild:

| # | Cause | Consequence |
|---|---|---|
| 1 | **No boot-volume backup on any host** | Every failure ends in rebuild, never restore |
| 2 | **The recovery branch had no `provisioning/` directory** | Hosts built from it silently lacked `dial-host-certify` and the Commander scripts; bootstrap phases 6 and 7 installed nothing |
| 3 | **`install-host.sh` committed `100644`** but invoked directly | Recovery-peer staging failed with "Permission denied" on every host |
| 4 | **A failed install swallowed by `2>/dev/null \|\| true`** | A host ran for an hour with no certification tool and no indication why |
| 5 | **`desktop-commander --version` is not a flag** | Unrecognised arguments fall through to the stdin-waiting MCP server; certification hung indefinitely |
| 6 | **`ConnectTimeout` bounds the handshake, not the remote command** | Nothing capped a hung remote program; the client waited forever with no output |
| 7 | **`grep` + `pipefail` + `\|\| echo '[]'`** | grep matching nothing made the pipeline "fail" after jq had already emitted `[]`, so the fallback appended a second value; `--argjson` rejected the stream and the whole report came back empty. **A healthy host was the failing case** |
| 8 | **jq's exit status for empty input is version-dependent** | 1.7 exits 4, older builds exit 0; a guard written against 1.7 admitted empty bodies on Cloud Shell, and the failure surfaced three steps from its cause |

The pattern across 4–8 is one thing: **failures that produced no output, or output
that looked like success.** An empty response is indistinguishable from a transport
failure at the other end, and that ambiguity is what turned single bugs into hours.

---

## 5. Guardrails now in place

`tests/oracle-script-hardening.test.mjs` fails the build on each class above:

- no pipeline may both produce output and append a `|| echo` fallback
- a `grep` whose no-match is a normal outcome must be neutralised with `|| true`
- every `ssh` in `run.sh` is wrapped in `timeout` (the interactive pairing call is the
  one documented exception — it waits on a human)
- `desktop-commander` is never invoked with `--version`
- a file is tested with `[[ -s ]]` *before* jq is asked to validate it
- any `.sh` invoked by path must be mode `100755` in git
- `host-certify.sh` must validate its own report and fall back to a structured RED

Behavioural guardrails in the tooling itself:

- **`host-certify.sh` can never return an empty body.** If the report cannot be built
  it emits a RED verdict carrying the builder's own error.
- **`run.sh` never spins.** A step re-queued twice without producing its artefact
  aborts and points at `diagnose`.
- **Every failed attempt states why** — ssh exit code, first line of stderr, first
  line of the body. Discarding stderr is what made the original failure unreadable.
- **`20-launch-oracle-admin.sh` validates every CLI flag against `oci ... --help`
  before launching**, and refuses if a flag carrying SSH ingress, IMDSv2 hardening,
  Run Command or the pinned private IP is unsupported — so a rejected launch can never
  be "fixed" by quietly dropping the option that was blamed.
- **An existing instance is adopted, never duplicated.** A run that created the host
  and died before recording it is a real outcome; the safe response is to record what
  exists, not to build a second host on the same pinned address.
- **`00-hermes-fingerprint.sh`** snapshots the Hermes instance, VNICs, subnets, route
  tables and security lists before and after, and diffs them. "We did not touch
  production" is evidence, not an assertion.

---

## 6. Recovering without losing data

`40-backup-policy.sh` assigns an OCI boot-volume backup policy, reports what is
assigned, and **exits non-zero if any host has none** — because a host with no backup
is not a recoverable host.

```bash
./40-backup-policy.sh                    # report only
./40-backup-policy.sh --apply            # oracle-admin only
./40-backup-policy.sh --apply --policy Silver
./40-backup-policy.sh --apply --include-hermes   # deliberate, protected hosts
```

`dial-hermes-control` and `oracle-admin-v2` need `--include-hermes`: assigning a policy
to their boot volumes is still a modification of a protected host, so it stays an
explicit owner action. It adds no compute risk and reboots nothing.

Bronze is monthly, Silver adds weekly, Gold adds daily. On a Free Tier account backup
storage counts against the block-volume allowance, so Bronze is the default and a
busier host is a reason to choose Silver or Gold deliberately.

### What must survive on each host

| Path | Contents | If lost |
|---|---|---|
| `/var/lib/dial-recovery/bootstrap-state.json` | phase results, host facts | Re-derivable by re-running bootstrap |
| `/var/lib/dial-recovery/fabric/telemetry` | capability envelopes | Re-published within one timer interval |
| `/var/lib/dial-recovery/fabric/recovery-state` | hysteresis counters | Recovery restarts from a clean slate; safe, just slower |
| `/var/lib/dial-recovery/fabric/recovery-evidence` | what was repaired and when | **Not re-derivable.** Audit history |
| `/var/lib/dial-recovery/fabric/decisions` | immutable placement decisions | **Not re-derivable.** Audit history |
| `~ubuntu/.desktop-commander-device/device.json` | device credential | Re-pairable, needs the owner and a browser |
| `/opt/dial-recovery/dial-new` | the checkout | Re-clonable |

Only the evidence and decision records are genuinely irreplaceable, and both are
audit history rather than operational state. Nothing on an E2 is load-bearing for
DIAL itself, which is the intended design: these hosts recover the estate, they do not
hold it.

### Offsite copy of the irreplaceable part

A boot-volume backup restores a host. It does not help while the host is gone, and if the
instance is *terminated* — which is what happened to the original `oracle-admin` — the
volume goes with it. So the two not-re-derivable categories above also go offsite daily.

```bash
dial-evidence-bundle --verify    # build, scan, discard. Uploads nothing. Safe anywhere.
dial-evidence-bundle             # build; prints the path
dial-offsite-push --dry-run      # verify only
dial-offsite-push                # build, scan, upload, then prove it landed
```

It is an **allowlist**, not a deny-list: nothing leaves the host unless it is named in
`ALLOW` in `evidence-bundle.sh`. A deny-list is the wrong shape here — it fails open on
anything nobody thought of, and these hosts hold the Desktop Commander device credential,
SSH private material, Codex and Claude OAuth sessions and an API key under
`~/.dde-control/secrets/`.

Three checks run before a bundle is allowed to exist, and any one of them refuses it
outright rather than uploading a trimmed version:

| Check | Refuses |
|---|---|
| Allowlist entry vs deny pattern | an allowlist edit that would include a secret path |
| Path scrub | a secret-shaped path written *into* an allowed directory |
| Content scan | private keys, `access`/`refresh`/`id` tokens, Bearer headers, `sk-`, `ghp_`, `AIza`, `ya29.` |
| Symlink check | any link, which would resolve on the far side |

`tests/oracle-offsite-backup.test.mjs` plants each of those credential shapes in a place a
bundle could plausibly pick it up and asserts the build is refused and nothing is written.
A scanner that has only ever run on a clean host is an assertion, not a control.

**Transport.** rclone, configured at `/etc/dial-recovery/rclone.conf`, mode 600, outside
the git checkout. Configure the Drive remote with `scope = drive.file`, **not** the default
full scope: `drive.file` limits the token to files this job itself created, so it cannot
read, list or delete anything else in the owner's Drive. A token on a recovery host is a
token that can be stolen from a recovery host. `offsite-push.sh` warns loudly if the config
uses full `drive` scope and refuses outright if the file is group- or world-readable.

**Authorizing it is an owner step.** `bootstrap.sh` installs the tools and the timer, but
`dial-offsite-backup.service` carries `ConditionPathExists=/etc/dial-recovery/rclone.conf`,
so it stays inert until the owner runs `rclone config` once and places the result. A daily
job that fails for want of credentials just trains people to ignore it.

---

## 7. Task separation

Declared in `hosts.json` and `policy.json`; now enforced at **both** ends.

**Scheduler side** — `placement.mjs` Gates A–E refuse misplaced work before dispatch:
authority routing, architecture and toolchain, memory envelope and per-shape
admission, pressure, and recovery preservation (normal work may not consume the last
healthy recovery peer).

**Host side** — `role-guard.mjs` (`dial-role-guard`) lets a host refuse work its roles
do not permit, *however the work arrived*. The scheduler only binds work that comes
through it; anything dispatched over SSH, Desktop Commander, cron or by hand bypassed
it entirely until now.

```bash
dial-role-guard --self                       # what may this host run
dial-role-guard '<task json>'                # exit 0 allowed, 3 refused, 2 malformed
```

Enforced locally, fail-closed:

| Rule | Effect |
|---|---|
| `recovery_plane_only` authorities need the RECOVERY role | Repair work cannot drift onto the control host |
| `control_slice_only` authorities need HERMES_CONTROL | Owner-control work cannot drift onto an E2 |
| `development_pool_mb == 0` refuses development work | The E2 pair never build; they recover |
| `max_concurrent_heavy_jobs == 0` refuses heavy tasks | A 1 GB host is not a compute node |
| Unknown host, architecture mismatch, missing authority | Refused, not assumed |

The E2 pair exist to recover the estate. A recovery node busy building is not one,
however much memory happens to be free at that moment — which is why the development
refusal is by role, not by available memory.

### Two-way recovery

`dial-hermes-control` used to have `recovers: []`. If both E2 admin hosts were down at
once, nothing in the estate could recover them — and on 2026-09-12 that was the actual
situation, not a thought experiment.

It now recovers both, under a deliberate asymmetry: **bidirectional in capability,
asymmetric in privilege.** Full design in
`DIAL_ORACLE_RESILIENT_3_NODE_CLUSTER_REV3.md` §5.

| Direction | Ceiling | What it can do |
|---|---|---|
| E2 → anything | R3 | the full allowlisted recovery set; R2 and above need owner authorization |
| Hermes → E2 | **R1** | observe, and restart that E2's own recovery units. Nothing else, ever |

`role-guard.mjs` enforces the ceiling on the host. The forced command
(`/usr/local/bin/dial-bounded-recovery`) enforces it again at the SSH boundary — and that
second one is the layer that matters, because it runs on the *target* under the target's
authority. If Hermes were compromised, an attacker would simply not run the host-side
guard; they cannot avoid the forced command.

```bash
# On each E2, once, as the owner:
install-bounded-recovery-identity.sh /path/to/hermes-bounded-recovery.pub
install-bounded-recovery-identity.sh --verify     # report, change nothing
install-bounded-recovery-identity.sh --remove     # revoke; E2 -> Hermes is unaffected
```

Generate the keypair **on** `dial-hermes-control` and move only the `.pub`. It must be a
different key from the E2 → Hermes key: reusing one makes the mesh symmetric again by
accident, and a symmetric mesh turns compromise of any one host into compromise of the
cluster. The installer refuses a key that is already authorized under a different entry,
refuses a private key, refuses to run on the control host itself, and refuses to authorize
anything before the forced command exists.

The entry it writes is source-restricted to Hermes's private address and closes every
forwarding channel:

```
command="/usr/local/bin/dial-bounded-recovery",from="10.0.0.184",restrict,
no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA...
```

Every attempt, permitted or refused, is audited to `/var/log/dial-bounded-recovery.log`.

**Not yet proven.** The mechanism is unit-tested in `tests/oracle-two-way-recovery.test.mjs`
but has never run between two live hosts. Per Rev 3 §7.1 that is not proof.

---

## 8. Open items

Named rather than quietly omitted.

1. **Control-plane outage (§4a) is unresolved.** Sol and Sonnet remain `AUTH_FAILED`;
   the development gate remains `DEVELOPMENT_BLOCKED`. Separate problem, separate fix.
2. **`oracle-admin` recovery plane is not yet proven.** Certification reports it
   outstanding; the specific unmet criterion is in `host-certification.json` under
   `recovery_plane`.
3. **Commander pairing is outstanding** on `oracle-admin`. Needs an owner browser.
4. **`oracle-admin-v2` is unavailable** and untouched by this work. Reciprocal
   recovery between the two E2 hosts is therefore declared but unproven end to end.
5. **No backup policy has been applied yet** — `40-backup-policy.sh` exists and is
   tested, but until it is run with `--apply` every host is still rebuild-only.
6. **Two-way recovery is unexercised end to end.** No bounded-recovery key has been
   generated or authorized, and `dial-hermes-control` has never restarted an E2's
   recovery agent. Tested code, not a proven recovery path.
7. **Offsite backup is installed but unauthorized.** `rclone config` has not been run,
   so `/etc/dial-recovery/rclone.conf` does not exist and the timer is inert by design.
8. **SSH ingress is `0.0.0.0/0`** on `oracle-admin`, deliberately: Cloud Shell's egress
   address is unstable and a pinned CIDR is how the previous host became unreachable.
   Key-only authentication is the real control. Narrow it once a stable admin source
   exists.
