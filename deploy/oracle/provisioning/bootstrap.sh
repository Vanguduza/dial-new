#!/usr/bin/env bash
# oracle-admin first-boot bootstrap — phases 0-7 (task brief section 22).
#
# Contract: a failure in PHASE 4-7 must never undo PHASE 1-2. SSH and OCI Run
# Command are the recovery floor; everything after them is best-effort and is
# recorded as FAILED rather than being allowed to abort the run. The script is
# idempotent and safe to re-run by hand:
#
#   sudo /opt/dial-recovery/bin/bootstrap.sh
#
# Never logs key material, tokens or session credentials.

set -uo pipefail

LOG=/var/log/oracle-admin-bootstrap.log
STATE_DIR=/var/lib/dial-recovery
STATE=$STATE_DIR/bootstrap-state.json
RECOVERY_ROOT=/opt/dial-recovery
REPO_DIR=$RECOVERY_ROOT/dial-new
ETC_DIR=/etc/dial-recovery
LOG_DIR=/var/log/dial-recovery
FABRIC_STATE=/var/lib/dial-recovery/fabric

DIAL_REPO_URL="${DIAL_REPO_URL:-https://github.com/Vanguduza/dial-new.git}"
# Must be a ref that carries BOTH the recovery fabric and this provisioning
# directory. claude/oracle-problem-review-rmhdse has the fabric but no
# deploy/oracle/provisioning, so phases 6 and 7 installed nothing from it and the
# host ended up without dial-host-certify or the Commander scripts. This branch is
# a superset of that one. Repoint it once the work merges.
DIAL_REPO_REF="${DIAL_REPO_REF:-claude/oracle-e2-recovery-rebuild-3yotjc}"
COMMANDER_PKG="${COMMANDER_PKG:-@wonderwhy-er/desktop-commander@0.2.50}"
NODE_MAJOR="${NODE_MAJOR:-22}"
ADMIN_USER=ubuntu
SWAP_MB="${SWAP_MB:-1024}"

mkdir -p "$STATE_DIR" "$LOG_DIR" "$ETC_DIR" "$RECOVERY_ROOT" "$FABRIC_STATE"
chmod 750 "$ETC_DIR" "$LOG_DIR"; chmod 700 "$FABRIC_STATE"
exec > >(tee -a "$LOG") 2>&1

say() { printf '\n=== [%s] %s ===\n' "$(date -u +%FT%TZ)" "$*"; }

# --- state -----------------------------------------------------------------
[[ -f $STATE ]] || echo '{"schema_version":1,"phases":{},"facts":{}}' > "$STATE"
jset() { # jset <jq-filter> [--arg k v ...]
  local filter="$1"; shift
  local tmp; tmp="$(mktemp)"
  if jq "$@" "$filter" "$STATE" > "$tmp" 2>/dev/null; then mv "$tmp" "$STATE"; else rm -f "$tmp"; fi
  chmod 644 "$STATE"
}
phase() { jset '.phases[$p] = {state:$s, at:(now|todate), detail:$d}' --arg p "$1" --arg s "$2" --arg d "${3:-}"; }
fact()  { jset '.facts[$k] = $v' --arg k "$1" --arg v "${2:-}"; }

# Run a best-effort phase: never let it kill the script or the recovery floor.
soft() { # soft <phase-name> <function>
  local name="$1" fn="$2"
  say "PHASE $name"
  if "$fn"; then phase "$name" OK; else phase "$name" FAILED "see $LOG"; say "PHASE $name FAILED (continuing — recovery floor is unaffected)"; fi
}

retry() { local n=0; until "$@"; do n=$((n+1)); [[ $n -ge 5 ]] && return 1; sleep $((n*6)); done; }
apt_i() { DEBIAN_FRONTEND=noninteractive apt-get install -y -o DPkg::Lock::Timeout=300 "$@"; }

# =========================================================== PHASE 0 baseline
say "PHASE 0 — baseline"
jset '.started_at = (now|todate) | .rerun = ((.rerun//0)+1)'
fact hostname       "$(hostname)"
fact ubuntu_release "$(. /etc/os-release; echo "$PRETTY_NAME")"
fact kernel         "$(uname -r)"
fact architecture   "$(uname -m)"
# IMDSv2: authorization header required. Never log the token.
IMDS_HDR=(-H "Authorization: Bearer Oracle" -s -m 5)
fact private_ip "$(curl "${IMDS_HDR[@]}" http://169.254.169.254/opc/v2/vnics/ 2>/dev/null | jq -r '.[0].privateIp // ""' 2>/dev/null)"
fact public_ip  "$(curl "${IMDS_HDR[@]}" http://169.254.169.254/opc/v2/vnics/ 2>/dev/null | jq -r '.[0].publicIp  // ""' 2>/dev/null)"
fact instance_ocid "$(curl "${IMDS_HDR[@]}" http://169.254.169.254/opc/v2/instance/ 2>/dev/null | jq -r '.id // ""' 2>/dev/null)"
# If v1 answers without the header, metadata is not hardened. Report it; do not
# "fix" it here — that is an instance property set at launch.
if curl -s -m 5 http://169.254.169.254/opc/v1/instance/ >/dev/null 2>&1; then
  fact imds_v1_reachable true; else fact imds_v1_reachable false; fi
phase 0 OK

# ======================================================= PHASE 1 SSH recovery
say "PHASE 1 — SSH and emergency access"
phase1() {
  retry apt-get update -o DPkg::Lock::Timeout=300 || say "apt update failed; continuing with cached lists"
  apt_i openssh-server || return 1

  install -d -m 700 -o $ADMIN_USER -g $ADMIN_USER /home/$ADMIN_USER/.ssh
  # cloud-init already placed the launch key. Never rewrite the file wholesale —
  # only guarantee permissions, so a bad merge can never orphan the operator.
  touch /home/$ADMIN_USER/.ssh/authorized_keys
  chown $ADMIN_USER:$ADMIN_USER /home/$ADMIN_USER/.ssh/authorized_keys
  chmod 600 /home/$ADMIN_USER/.ssh/authorized_keys
  fact authorized_key_count "$(grep -c '^ssh-' /home/$ADMIN_USER/.ssh/authorized_keys 2>/dev/null || echo 0)"

  # Drop-in only; /etc/ssh/sshd_config is never overwritten.
  local dropin=/etc/ssh/sshd_config.d/99-oracle-admin-recovery.conf
  local staged=$dropin.staged
  mkdir -p /etc/ssh/sshd_config.d
  cat > "$staged" <<'CONF'
# DIAL oracle-admin recovery policy. Key-only administrative access.
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
UsePAM yes
CONF
  mv "$staged" "$dropin"; chmod 644 "$dropin"

  # Validate BEFORE restarting. If the merged config is bad, drop the new file and
  # keep the previously working service rather than breaking remote access.
  if ! sshd -t 2>>"$LOG"; then
    say "sshd -t FAILED with the recovery drop-in — reverting it and leaving SSH as-is"
    rm -f "$dropin"
    fact ssh_dropin_applied false
    sshd -t || return 1
  else
    fact ssh_dropin_applied true
  fi

  systemctl enable --now ssh || systemctl enable --now sshd || return 1
  systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null || true
  sleep 2
  systemctl is-active --quiet ssh || systemctl is-active --quiet sshd || return 1
  fact ssh_service_state "$(systemctl is-active ssh 2>/dev/null || systemctl is-active sshd)"
  fact ssh_host_key_fingerprint "$(ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub 2>/dev/null | awk '{print $2}')"

  # Firewall: allow SSH BEFORE any enable/reload can take effect.
  if command -v ufw >/dev/null 2>&1; then
    ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
    fact ufw_state "$(ufw status | head -1)"
  else
    fact ufw_state "not installed"
  fi
  return 0
}
if phase1; then phase 1 OK; else phase 1 FAILED "SSH floor degraded"; fi

# ================================================ PHASE 2 Oracle Cloud Agent
say "PHASE 2 — Oracle Cloud Agent / Run Command"
phase2() {
  # Two unit names: Oracle Linux uses oracle-cloud-agent.service, Ubuntu images run
  # it as a snap unit. Try both before concluding the emergency path is down.
  local oca_unit="" u
  for u in oracle-cloud-agent.service snap.oracle-cloud-agent.oracle-cloud-agent.service; do
    if systemctl list-unit-files "$u" >/dev/null 2>&1 && systemctl status "$u" >/dev/null 2>&1; then oca_unit="$u"; break; fi
    [[ "$(systemctl is-active "$u" 2>/dev/null)" == "active" ]] && { oca_unit="$u"; break; }
  done
  [[ -n "$oca_unit" ]] || oca_unit=oracle-cloud-agent.service
  systemctl is-active --quiet "$oca_unit" || systemctl start "$oca_unit" 2>/dev/null || true
  fact oracle_cloud_agent_unit  "$oca_unit"
  fact oracle_cloud_agent_state "$(systemctl is-active "$oca_unit" 2>/dev/null || echo unknown)"
  # The Run Command plugin executes work as the `ocarun` user; its presence is the
  # observable host-side readiness signal. Plugin enablement itself is an instance
  # property set at launch and verified from the control plane.
  if id ocarun >/dev/null 2>&1; then fact ocarun_present true; else fact ocarun_present false; fi
  [[ -d /var/lib/oracle-cloud-agent/plugins ]] && \
    fact oca_plugins "$(ls /var/lib/oracle-cloud-agent/plugins 2>/dev/null | tr '\n' ',')"
  # The Run Command plugin directory is `runcommand`, not `oci-tools-plugin`.
  if ls /var/lib/oracle-cloud-agent/plugins 2>/dev/null | grep -qi runcommand; then
    fact run_command_plugin_dir true
  else
    fact run_command_plugin_dir false
  fi
  systemctl is-active --quiet "$oca_unit"
}
if phase2; then phase 2 OK; else phase 2 DEGRADED "Oracle Cloud Agent not active"; fi

# ========================================== PHASE 3 base packages, Node, limits
phase3() {
  apt_i curl ca-certificates git jq unzip rsync lsof procps iproute2 net-tools || return 1

  # Journald caps — a 1 GB host must not lose its disk to logs.
  mkdir -p /etc/systemd/journald.conf.d
  cat > /etc/systemd/journald.conf.d/10-dial-recovery.conf <<'CONF'
[Journal]
SystemMaxUse=100M
SystemMaxFileSize=20M
MaxRetentionSec=1week
CONF
  systemctl restart systemd-journald 2>/dev/null || true

  # Modest swap. policy.json treats swap use above 25% as pressure on E2.
  if [[ ! -f /swapfile ]] && [[ "$SWAP_MB" -gt 0 ]]; then
    fallocate -l "${SWAP_MB}M" /swapfile 2>/dev/null || \
      dd if=/dev/zero of=/swapfile bs=1M count="$SWAP_MB" status=none
    chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl -qw vm.swappiness=10
    echo 'vm.swappiness=10' > /etc/sysctl.d/99-dial-recovery.conf
  fi
  fact swap_total_mb "$(free -m | awk '/^Swap:/{print $2}')"

  # Node from the NodeSource apt repo with a pinned keyring — deliberately not
  # curl-piped into a shell.
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)" != "$NODE_MAJOR" ]]; then
    install -d -m 755 /usr/share/keyrings
    retry curl -fsSL -o /tmp/nodesource.key https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key || return 1
    gpg --batch --yes --dearmor -o /usr/share/keyrings/nodesource.gpg /tmp/nodesource.key
    rm -f /tmp/nodesource.key
    echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list
    retry apt-get update -o DPkg::Lock::Timeout=300 && apt_i nodejs || return 1
  fi
  fact node_version "$(node --version 2>/dev/null || echo absent)"
  fact npm_version  "$(npm  --version 2>/dev/null || echo absent)"
  fact npx_version  "$(npx  --version 2>/dev/null || echo absent)"
  fact git_version  "$(git  --version 2>/dev/null || echo absent)"
  command -v node >/dev/null 2>&1
}
soft 3 phase3

# ============================================= PHASE 4 DIAL recovery checkout
phase4() {
  install -d -m 755 -o $ADMIN_USER -g $ADMIN_USER "$RECOVERY_ROOT"
  if [[ -d $REPO_DIR/.git ]]; then
    sudo -u $ADMIN_USER git -C "$REPO_DIR" fetch --depth 1 origin "$DIAL_REPO_REF" || return 1
    sudo -u $ADMIN_USER git -C "$REPO_DIR" checkout -B "$DIAL_REPO_REF" FETCH_HEAD || return 1
  else
    retry sudo -u $ADMIN_USER git clone --depth 1 --branch "$DIAL_REPO_REF" "$DIAL_REPO_URL" "$REPO_DIR" || return 1
  fi
  fact dial_repo_ref "$DIAL_REPO_REF"
  # Run as the owner: git refuses a repo owned by another user ("dubious ownership"),
  # so asking as root silently yielded "unknown" for a perfectly good checkout.
  fact dial_repo_sha "$(sudo -u $ADMIN_USER git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
  # The recovery fabric is dependency-free by design (no imports from agent-system),
  # so no npm install is required and none is run. The full DIAL workload is never
  # installed on this host.
  fact dial_npm_install "skipped: resource fabric has no runtime dependencies"
  [[ -f $REPO_DIR/deploy/oracle/resource-fabric/hosts.json ]]
}
soft 4 phase4

# ========================================== PHASE 5 recovery plane installation
phase5() {
  local fab=$REPO_DIR/deploy/oracle/resource-fabric
  [[ -d $fab ]] || return 1
  install -d -m 700 -o $ADMIN_USER -g $ADMIN_USER "$FABRIC_STATE"

  cat > $ETC_DIR/fabric.env <<CONF
# Non-secret configuration for the DIAL recovery fabric on this host.
DIAL_FABRIC_STATE=$FABRIC_STATE
DIAL_FABRIC_HOST_ID=oracle-admin
DIAL_REPO_DIR=$REPO_DIR
DIAL_FABRIC_SSH_USER=ubuntu
CONF
  chmod 644 $ETC_DIR/fabric.env

  # Stage via the repository's own installer rather than reimplementing it.
  sudo -u $ADMIN_USER env DIAL_REPO_DIR="$REPO_DIR" DIAL_FABRIC_STATE="$FABRIC_STATE" \
       DIAL_FABRIC_HOST_ID=oracle-admin bash "$fab/install-recovery-peer.sh" || return 1

  # The fabric's units are systemd USER units (recovery-agent.mjs shells
  # `systemctl --user`). User units need lingering to run without a login session.
  loginctl enable-linger $ADMIN_USER || true

  local ud=/home/$ADMIN_USER/.config/systemd/user
  install -d -m 755 -o $ADMIN_USER -g $ADMIN_USER "$ud"
  local u
  for u in dial-recovery.slice dial-host-agent.service dial-host-agent.timer dial-recovery-agent.service; do
    [[ -f $fab/systemd/$u ]] && install -m 644 -o $ADMIN_USER -g $ADMIN_USER "$fab/systemd/$u" "$ud/$u"
  done
  local rt=/run/user/$(id -u $ADMIN_USER)
  sudo -u $ADMIN_USER XDG_RUNTIME_DIR=$rt systemctl --user daemon-reload || true

  # Telemetry publication is safe to enable immediately; it only reads /proc.
  sudo -u $ADMIN_USER XDG_RUNTIME_DIR=$rt systemctl --user enable --now dial-host-agent.timer 2>/dev/null || true

  # dial-recovery-agent.service is started below, but only after known_hosts has been
  # seeded: it SSHes into peers with StrictHostKeyChecking=yes, so starting it blind
  # fails closed and generates noise rather than recovery.
  # Host-side task separation. placement.mjs only binds work that arrives through the
  # scheduler; this lets the host refuse out-of-role work however it arrived.
  if [[ -f $fab/role-guard.mjs ]]; then
    printf '#!/usr/bin/env bash\nexec node %s "$@"\n' "$fab/role-guard.mjs" > /usr/local/bin/dial-role-guard
    chmod 755 /usr/local/bin/dial-role-guard
    fact role_guard_installed "$(sudo -u $ADMIN_USER dial-role-guard --self 2>/dev/null | jq -c '{roles,development_permitted,heavy_work_permitted}' 2>/dev/null)"
  else
    fact role_guard_installed false
  fi

  # Rev 3 section 5.2: the inbound half of two-way recovery. Installing the RESTRICTION is
  # safe and unconditional; AUTHORIZING the control host's key is a separate owner action
  # (install-bounded-recovery-identity.sh), because it grants a capability. Order matters:
  # the forced command must exist before any key is bound to it, or there is a window in
  # which that key has an unrestricted shell.
  if [[ -f $fab/bounded-recovery-command.sh ]]; then
    install -m 755 -o root -g root "$fab/bounded-recovery-command.sh" /usr/local/bin/dial-bounded-recovery
    install -m 640 -o root -g $ADMIN_USER /dev/null /var/log/dial-bounded-recovery.log
    fact bounded_recovery_command_installed true
    fact bounded_recovery_key_authorized \
      "$(sudo -u $ADMIN_USER bash "$fab/install-bounded-recovery-identity.sh" --verify >/dev/null 2>&1 \
         && echo yes || echo "no: owner must authorize the control host's public key")"
  else
    fact bounded_recovery_command_installed false
  fi

  # Recovery-plane tooling. All three are inert until invoked; installing them is what
  # makes the owner's remaining steps short enough to type on a phone during an outage.
  local t
  for t in seed-known-hosts:dial-seed-known-hosts \
           verify-two-way-recovery:dial-verify-two-way-recovery \
           install-bounded-recovery-identity:dial-authorize-bounded-recovery \
           install-bounded-recovery-peer:dial-install-bounded-recovery-peer; do
    if [[ -f $fab/${t%%:*}.sh ]]; then
      install -m 755 -o root -g root "$fab/${t%%:*}.sh" "/usr/local/bin/${t##*:}"
    fi
  done

  # Seed known_hosts and, if that produced anything, actually start the recovery agent.
  # It SSHes with StrictHostKeyChecking=yes, so an unseeded peer fails closed — which is
  # why this unit has never run. Seeding is the last thing between a staged recovery
  # plane and a running one, and a staged recovery plane recovers nothing.
  if [[ -x /usr/local/bin/dial-seed-known-hosts ]]; then
    local seed_out
    seed_out="$(sudo -u $ADMIN_USER env DIAL_FABRIC_HOST_ID=oracle-admin \
      DIAL_REPO_DIR="$REPO_DIR" bash /usr/local/bin/dial-seed-known-hosts 2>&1 | tr '\n' ' ')"
    fact known_hosts_seeding "$seed_out"
    local seeded
    seeded="$(sudo -u $ADMIN_USER env DIAL_FABRIC_HOST_ID=oracle-admin \
      bash /usr/local/bin/dial-seed-known-hosts --verify 2>&1 | { grep -c '^SEEDED' || true; } | head -1)"
    if [[ "${seeded:-0}" -gt 0 ]]; then
      sudo -u $ADMIN_USER XDG_RUNTIME_DIR=$rt systemctl --user enable --now dial-recovery-agent.service 2>/dev/null || true
      fact recovery_agent_activation \
        "started: ${seeded} peer host key(s) seeded. Host keys accepted on first use are UNVERIFIED until re-run with --expect against each peer's certified fingerprint."
    else
      fact recovery_agent_activation \
        "staged, not started: no peer host key could be seeded (peers unreachable?). Re-run dial-seed-known-hosts once a peer answers."
    fi
  else
    fact recovery_agent_activation "staged, not started: seeding tool not present on this ref"
  fi

  fact fabric_staged true
  return 0
}
soft 5 phase5

# ====================================== PHASE 6 Desktop Commander (outbound only)
phase6() {
  # Install the pinned version into a fixed prefix so the runtime never depends on
  # npx resolving a tag at start time. No inbound port is opened: `remote` is an
  # outbound device session to the Commander service.
  install -d -m 755 -o $ADMIN_USER -g $ADMIN_USER "$RECOVERY_ROOT/commander"
  if [[ ! -x $RECOVERY_ROOT/commander/node_modules/.bin/desktop-commander ]]; then
    retry sudo -u $ADMIN_USER npm --prefix "$RECOVERY_ROOT/commander" install --no-fund --no-audit "$COMMANDER_PKG" || return 1
  fi
  fact commander_package "$COMMANDER_PKG"
  fact commander_transport "outbound persistent remote device (no inbound port)"

  # Credentials live here once the owner authorizes the device. 0700 — never
  # world-readable, and never inside the git checkout.
  install -d -m 700 -o $ADMIN_USER -g $ADMIN_USER /home/$ADMIN_USER/.desktop-commander-device

  local ud=/home/$ADMIN_USER/.config/systemd/user
  install -d -m 755 -o $ADMIN_USER -g $ADMIN_USER "$ud"
  install -m 644 -o $ADMIN_USER -g $ADMIN_USER \
    "$REPO_DIR/deploy/oracle/provisioning/systemd/dial-commander-remote.service" \
    "$ud/dial-commander-remote.service" || return 1
  install -m 755 -o root -g root "$REPO_DIR/deploy/oracle/provisioning/commander-probe.sh"        /usr/local/bin/dial-commander-probe
  install -m 755 -o root -g root "$REPO_DIR/deploy/oracle/provisioning/commander-pair.sh"         /usr/local/bin/dial-commander-pair
  install -m 755 -o root -g root "$REPO_DIR/deploy/oracle/provisioning/commander-record-proof.sh" /usr/local/bin/dial-commander-record-proof

  # doctor.mjs reads this to decide whether Commander criteria can be established.
  grep -q DIAL_COMMANDER_PROBE $ETC_DIR/fabric.env 2>/dev/null || \
    echo 'DIAL_COMMANDER_PROBE=/usr/local/bin/dial-commander-probe' >> $ETC_DIR/fabric.env

  local rt=/run/user/$(id -u $ADMIN_USER)
  sudo -u $ADMIN_USER XDG_RUNTIME_DIR=$rt systemctl --user daemon-reload || true
  # Enabled, but the unit carries ConditionPathExists on the device credential, so
  # it stays inert until the owner completes the one-time device authorization.
  sudo -u $ADMIN_USER XDG_RUNTIME_DIR=$rt systemctl --user enable --now dial-commander-remote.service 2>/dev/null || true

  if [[ -f /home/$ADMIN_USER/.desktop-commander-device/device.json ]]; then
    fact commander_paired true
  else
    fact commander_paired false
    fact commander_next_action "run: sudo -u ubuntu dial-commander-pair (one-time device authorization)"
  fi
  return 0
}
soft 6 phase6

# ======================================== PHASE 7 functional certification
phase7() {
  install -d -m 755 "$RECOVERY_ROOT/bin"
  # Record whether this actually happened. Swallowing the error here is what let a
  # host run for an hour with no certification tool and no indication why.
  if install -m 755 "$REPO_DIR/deploy/oracle/provisioning/host-certify.sh" /usr/local/bin/dial-host-certify 2>>"$LOG"; then
    fact host_certify_installed true
  else
    fact host_certify_installed "false: $REPO_DIR/deploy/oracle/provisioning/host-certify.sh missing on ref $DIAL_REPO_REF"
    say "PHASE 7: dial-host-certify NOT installed — the checked-out ref has no provisioning directory"
  fi
  install -m 755 "$REPO_DIR/deploy/oracle/provisioning/bootstrap.sh" "$RECOVERY_ROOT/bin/bootstrap.sh" 2>/dev/null || true

  # Offsite evidence backup. A terminated host takes its audit history with it, and an OCI
  # volume backup restores that too slowly to be useful during an outage. Install the tools
  # and the timer; the timer's ConditionPathExists keeps it inert until the owner has
  # authorized Drive once, so it does not fail noisily every day and train people to
  # ignore it. Authorizing Drive is an owner step, never a bootstrap step.
  local prov="$REPO_DIR/deploy/oracle/provisioning"
  if [[ -f $prov/evidence-bundle.sh && -f $prov/offsite-push.sh ]]; then
    install -m 755 -o root -g root "$prov/evidence-bundle.sh" /usr/local/bin/dial-evidence-bundle
    install -m 755 -o root -g root "$prov/offsite-push.sh"    /usr/local/bin/dial-offsite-push
    # $ETC_DIR already exists and stays 755 — fabric.env inside it is read by the admin
    # user. rclone.conf is protected by its own 600 mode, which offsite-push.sh enforces
    # before it will upload anything; tightening the directory here would instead break
    # the recovery agent's ability to read its own configuration.
    local u
    for u in dial-offsite-backup.service dial-offsite-backup.timer; do
      [[ -f $prov/systemd/$u ]] && install -m 644 -o root -g root "$prov/systemd/$u" "/etc/systemd/system/$u"
    done
    systemctl daemon-reload 2>/dev/null || true
    systemctl enable --now dial-offsite-backup.timer 2>/dev/null || true
    # Prove the allowlist and the credential scan pass on this host's real content before
    # claiming the backup path works. --verify writes nothing and uploads nothing.
    fact offsite_backup_verify "$(dial-evidence-bundle --verify 2>&1 | tail -1)"
    fact offsite_drive_authorized \
      "$([[ -r /etc/dial-recovery/rclone.conf ]] && echo yes || echo "no: owner must authorize Drive once")"
  else
    fact offsite_backup_installed false
  fi
  fact outbound_https  "$(curl -s -o /dev/null -m 10 -w '%{http_code}' https://github.com 2>/dev/null || echo failed)"
  fact dns_resolution  "$(getent hosts registry.npmjs.org >/dev/null 2>&1 && echo ok || echo failed)"
  fact listening_ports "$(ss -lntu 2>/dev/null | awk 'NR>1{print $1" "$5}' | sort -u | tr '\n' ',')"
  if [[ -x /usr/local/bin/dial-host-certify ]]; then
    /usr/local/bin/dial-host-certify > "$LOG_DIR/host-certification.json" 2>>"$LOG" || true
    chmod 644 "$LOG_DIR/host-certification.json"
  fi
  return 0
}
soft 7 phase7

jset '.completed_at = (now|todate)'
say "BOOTSTRAP COMPLETE"
jq . "$STATE" || cat "$STATE"
