# DIAL Oracle / Hermes control recovery runbook

Material eventuality: **owner has lost access to DIAL Hermes control while the Oracle VM is still running.**

Authority: `auth-20260912-owner-oracle-control-access-recovery` (`OWNER_EXPLICIT`).
This runbook is operator guidance. It is not a gate, not certification, and running it
does not by itself make development resumable — only a valid external-orchestration gate does.

---

## 0. Diagnosis before action

Observed from the read-only Oracle mirror (`ORACLE_DIAL_RUNTIME_STATUS`, source
`PRIVATE_GIT_STATUS_BRANCH`) at `2026-09-12T02:46:55Z`:

| Signal | Value | Meaning |
|---|---|---|
| status mirror freshness | ~1 min old, continuously | `dial-operator-status-publisher.timer` is firing on the VM every 30s |
| mission `dial-development-root` | `PAUSED`, turn 0 | mission controller state is intact and persisted |
| queue | `STOPPED`, 0 queued | no work is being dispatched |
| orchestrator heartbeat | last `2026-09-11T06:32:28Z` | `dial-hermes-orchestrator.service` stopped/failed ~24m after the last commit |
| Sol (`gpt-5.6-sol`) | `AUTH_FAILED` / `AUTH_FAILED_REQUIRES_EXTERNAL_CHANGE` | Codex ChatGPT OAuth is expired or revoked |
| Sonnet (`claude-sonnet-5`) | `AUTH_FAILED` | Claude Code subscription login is expired or revoked |
| development gate | absent (`gate_present: false`) | no gate file at `state/external-orchestration-gate.json` |

**The VM is up.** A systemd user timer on the host is publishing the status mirror every
30 seconds, which proves the instance is booted, `loginctl enable-linger` is still in
effect, and at least part of the user service tree is healthy.

**A reboot is therefore not the fix and should not be the first action.** Rebooting a
healthy host to recover expired OAuth credentials adds risk (boot volume, linger, service
ordering) and changes nothing about the actual fault. Reboot only if §3 finds the instance
genuinely stopped or unreachable.

### Root cause chain

```
codex + claude OAuth expired on the VM
        ↓
Sol AUTH_FAILED, Sonnet AUTH_FAILED
        ↓
finalize-development-readiness.sh cannot pass its runtime probes
  (it requires proven Sol identity in ACCOUNT_LIMITED | RATE_LIMITED | MODEL_LIMITED;
   AUTH_FAILED is deliberately excluded — fail-closed by design)
        ↓
no gate file is ever written
        ↓
evaluateDevelopmentUnblock() sees gate === null
        ↓
DEVELOPMENT_BLOCKED with exactly the 7 reported failing checks
```

Everything downstream of the OAuth failure is correct fail-closed behaviour, not a
second bug. Fix the authentication and the chain unwinds.

---

## 1. Data-safety statement

Verified against the scripts in `deploy/oracle/hermes-codex/`:

**Safe to re-run against existing state.** `bootstrap-host.sh`, `install-control-plane.sh`
and the `install-*.sh` family contain **no** `rm`, `mv`, `truncate` or reformat operation
targeting `/var/lib/dial-control`. They only `install -d`, `mkdir -p` and `chmod`. Mission
state, checkpoints, memory, capsules, knowledge graph, evidence cache and the work queue
all survive a re-run.

**Not safe — will destroy state:**

| Action | Destroys |
|---|---|
| `pair-hermes-whatsapp.sh` | wipes the WhatsApp session directory (`find "$SESSION" -mindepth 1 -delete`). Owner must re-pair. Run only if re-pairing is the intent. |
| Terminating the OCI instance with **"delete boot volume"** ticked | `/var/lib/dial-control` and the repo checkout, permanently |
| Re-imaging / creating a replacement instance from a fresh image | same |

**Git operations on the VM checkout do not touch `/var/lib/dial-control`** — different
filesystem path, no script bridges them.

---

## 2. Preserve the unpushed commit first

The VM's repo checkout is pinned at commit `25f45f7` on branch
`feat/adaptive-execution-fabric-rev2-20260910`. **That branch does not exist on origin.**
The commit survives on origin only as an ancestor of the machine-rewritten
`oracle-runtime-status` branch.

Before touching the checkout, push it so it cannot be lost:

```bash
cd ~/dial-new
git status --porcelain --untracked-files=all   # capture anything uncommitted first
git push -u origin feat/adaptive-execution-fabric-rev2-20260910
```

---

## 3. Oracle Cloud console (owner action)

Only if §0 shows the mirror is stale and the host is unreachable.

1. OCI Console → Compute → Instances → select the DIAL instance.
2. Read **Status**:
   - **Running** → do not reboot. Go to §4.
   - **Stopped** → **Start**. Boot volume and all data are preserved.
   - **Terminated** → check Block Storage → **Boot Volumes** for a preserved volume. If one
     exists, create a new instance **from that boot volume** — do not create from a fresh
     image, which loses `/var/lib/dial-control`.
3. If a reboot is genuinely required, prefer a **graceful reboot**, not "reboot instance
   (force)". Force is a power cut and can corrupt SQLite state under `/var/lib/dial-control`.
4. Always Free ARM tenancies reclaim idle instances. If the instance was reclaimed, the boot
   volume is the only thing that preserves the data — check for it before recreating anything.

---

## 4. On the VM: verify before changing anything

```bash
# control state survived?
sudo ls -la /var/lib/dial-control | head
sudo du -sh /var/lib/dial-control

# linger + service tree
loginctl show-user "$USER" | grep -i linger
systemctl --user list-units 'dial-*' --all --no-pager

# who is alive, who is dead
systemctl --user is-active dial-operator-status-publisher.timer \
  dial-hermes-orchestrator.service dial-hermes-runtime.service \
  dial-mission-controller.service dial-chat-control.service

# why the orchestrator died
systemctl --user status dial-hermes-orchestrator.service --no-pager -l | tail -30
journalctl --user -u dial-hermes-orchestrator.service --since '2026-09-11' --no-pager | tail -50
```

Record the orchestrator's failure reason before restarting it — if it crash-looped on the
OAuth failure, §5 fixes it; if it died for another reason, that is a separate fault.

---

## 5. Re-authenticate — this is the actual repair

Do **not** set `OPENAI_API_KEY`, `CODEX_API_KEY` or `ANTHROPIC_API_KEY`. These runtimes are
subscription-OAuth only, and `install-control-plane.sh` hard-fails if it finds an API key
assignment.

```bash
codex login                       # ChatGPT subscription OAuth
codex login status                # must print: Logged in using ChatGPT
hermes auth add openai-codex
claude                            # complete Claude subscription login, then exit
claude auth status
```

Verify with the repository's own probes rather than trusting the CLI output:

```bash
cd ~/dial-new
node agent-system/orchestration/codex-app-server-probe.mjs   # expect identity_proven: true
node agent-system/orchestration/claude-code-probe.mjs        # expect state: HEALTHY
npm run agent:runtime:capacity-status
```

If Sol comes back `ACCOUNT_LIMITED` / `RATE_LIMITED` / `MODEL_LIMITED` rather than
`HEALTHY`, that is still a recoverable state — it routes to the DEC-021 fallback gate in §7.
Only `AUTH_FAILED` blocks everything.

---

## 6. Restore the control plane

```bash
cd ~/dial-new
npm run agent:orchestration:doctor      # federated DIAL + subordinate Hermes doctor
npm run agent:orchestration:status
npm run agent:mission:status

for u in dial-hermes-runtime dial-hermes-orchestrator dial-hermes-operations \
         dial-chat-control dial-mission-controller \
         dial-hermes-whatsapp-operator dial-whatsapp-cloud-operator; do
  systemctl --user restart "$u.service"
  systemctl --user is-active --quiet "$u.service" || echo "FAILED: $u"
done
systemctl --user is-active dial-engineering-research.timer dial-engineering-research.path

npm run agent:orchestration:queue-status   # heartbeat must go fresh (< 2 min old)
```

The heartbeat must be under `HEARTBEAT_MAX_AGE_MS` (2 minutes) or the gate check fails on
`external_orchestrator_heartbeat_fresh` even after a gate exists.

---

## 7. Re-issue a gate

The tree must be clean (`git status --porcelain --untracked-files=all` empty) before either
finalizer will issue evidence.

**If Sol is healthy — full production path:**

```bash
bash deploy/oracle/hermes-codex/qualify-control-plane.sh
bash deploy/oracle/hermes-codex/soak-control-plane.sh process
bash deploy/oracle/hermes-codex/soak-external-orchestrator.sh
bash deploy/oracle/hermes-codex/soak-control-plane.sh continuity
bash deploy/oracle/hermes-codex/finalize-control-plane.sh      # → PRODUCTION_GREEN
```

**If Sol is provider-limited but identity-proven — DEC-021 development-only path:**

```bash
bash deploy/oracle/hermes-codex/finalize-development-readiness.sh   # → DEVELOPMENT_READY_FALLBACK
```

`DEVELOPMENT_READY_FALLBACK` is development-only and is **not** production certification.

Confirm the gate took effect:

```bash
node agent-system/orchestration/development-unblock.mjs
# expect unblocked: true and an empty failed-checks list
```

---

## 8. Traps

1. **Do not deploy `25f45f7` as-is.** It moves `/var/lib/dial-control` to `root:root 0755`
   so the service user can no longer create top-level entries, while its bootstrap
   directory list omits six directories the runtime's `ensureControlLayout` LAYOUT requires:
   `approvals`, `chat-control`, `execution`, `missions`, `operations`, `secrets`. On a fresh
   host this throws `EACCES` on the first layout call — breaking `supervisor.mjs init`,
   the mission controller, chat-control, the operations plane and secrets. Existing hosts
   only survive because those directories predate the ownership change. Recover on `master`.

2. **Any gate issued before `25f45f7` is void regardless.** That commit changed the
   fingerprint algorithm from `sha256-git-tree-v1` to `sha256-execution-bytes-v2`, and the
   gate check compares `algorithm` for equality. There is no migration path — a new gate
   must be issued either way.

3. **The status mirror is not the control plane.** A fresh mirror proves the publisher timer
   is alive. It does not prove the orchestrator, the runtimes or the gate are healthy — read
   the mission, queue, gate and runtime fields, not the timestamp.

4. **Do not force-push `oracle-runtime-status`.** It is machine-rewritten, and it is
   currently the only origin-side reachable copy of `25f45f7` until §2 is done.

---

## 9. Escalation

If after §5 the probes still return `AUTH_FAILED`, the subscription itself is the blocker
(expired plan, revoked device authorization, or org policy), not the host. That is an owner
account action and no amount of VM work will resolve it.
