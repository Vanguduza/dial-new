#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Netcup Image Provision custom scripts execute in a constrained provisioning
# environment. This stage must remain network-free and package-manager-free.
# The immutable payload revision is pinned here unless explicitly overridden
# by an equally exact 40-hex revision.
DIAL_BOOTSTRAP_REF="${DIAL_BOOTSTRAP_REF:-6548a86584ba976b5562376db8cb2ec341b55282}"
[[ "$DIAL_BOOTSTRAP_REF" =~ ^[0-9a-f]{40}$ ]] || {
  echo "REFUSE: invalid DIAL_BOOTSTRAP_REF" >&2
  exit 2
}

IMAGE_BOOTSTRAP=/usr/local/sbin/dial-control-image-bootstrap.sh
RUNNER=/usr/local/sbin/dial-control-bootstrap-runner
SERVICE=/etc/systemd/system/dial-control-bootstrap.service
LOG=/var/log/dial-control-bootstrap.log
EXPECTED_IMAGE_BLOB=249e86695d841cae4eeebdced0427e1ce149d978

install -d -m 0755 /usr/local/sbin /etc/systemd/system /etc/systemd/resolved.conf.d
install -d -m 0700 /var/lib/dial-control/bootstrap

# Persist resolvers only; do not restart services in the Netcup provisioning
# environment. The first-boot runner activates these after the VM boots.
cat >/etc/systemd/resolved.conf.d/99-dial-netcup-bootstrap-dns.conf <<'DNS_EOF'
[Resolve]
DNS=1.1.1.1 1.0.0.1 2606:4700:4700::1111 2606:4700:4700::1001
FallbackDNS=8.8.8.8 8.8.4.4 2001:4860:4860::8888
DNSDefaultRoute=yes
DNS_EOF
chmod 0644 /etc/systemd/resolved.conf.d/99-dial-netcup-bootstrap-dns.conf

SENTINEL=/usr/local/sbin/dial-control-boot-sentinel
SENTINEL_SERVICE=/etc/systemd/system/dial-control-boot-sentinel.service
FAILURE_SNAPSHOT=/usr/local/sbin/dial-control-bootstrap-failure-snapshot
FAILURE_SERVICE=/etc/systemd/system/dial-control-bootstrap-failure.service

cat >"$SENTINEL" <<'SENTINEL_EOF'
#!/usr/bin/env bash
set -u
STATE=/var/lib/dial-control/bootstrap
install -d -m 0700 "$STATE"
{
  echo "captured=$(date -u +%FT%TZ)"
  echo "boot_id=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || true)"
  echo "kernel=$(uname -r 2>/dev/null || true)"
  echo "cmdline=$(cat /proc/cmdline 2>/dev/null || true)"
  echo "ssh_enabled=$(systemctl is-enabled ssh.service 2>/dev/null || true)"
  echo "ssh_active=$(systemctl is-active ssh.service 2>/dev/null || true)"
  echo "network_online=$(systemctl is-active network-online.target 2>/dev/null || true)"
  echo "resolved=$(systemctl is-active systemd-resolved.service 2>/dev/null || true)"
  echo "=== address ==="
  ip -brief address 2>&1 || true
  echo "=== route ==="
  ip route 2>&1 || true
  echo "=== netplan ==="
  cat /etc/netplan/*.yaml 2>/dev/null || true
  echo "=== fstab ==="
  cat /etc/fstab 2>/dev/null || true
  echo "=== dial environment ==="
  grep '^DIAL_' /etc/environment 2>/dev/null || true
} >"$STATE/boot-sentinel.txt" 2>&1
SENTINEL_EOF
chmod 0700 "$SENTINEL"

cat >"$FAILURE_SNAPSHOT" <<'FAIL_EOF'
#!/usr/bin/env bash
set -u
STATE=/var/lib/dial-control/bootstrap
install -d -m 0700 "$STATE"
{
  echo "captured=$(date -u +%FT%TZ)"
  echo "stage=$(cat "$STATE/stage" 2>/dev/null || true)"
  systemctl --no-pager --full status dial-control-bootstrap.service 2>&1 || true
  systemctl --no-pager --full status ssh.service 2>&1 || true
  systemctl --no-pager --full status systemd-networkd.service 2>&1 || true
  systemctl --no-pager --full status systemd-resolved.service 2>&1 || true
  journalctl -b --no-pager -n 400 2>&1 || true
  ip -brief address 2>&1 || true
  ip route 2>&1 || true
  ss -ltnp 2>&1 || true
  grep '^DIAL_' /etc/environment 2>/dev/null || true
} >"$STATE/failure-snapshot.txt" 2>&1
FAIL_EOF
chmod 0700 "$FAILURE_SNAPSHOT"

cat >"$SENTINEL_SERVICE" <<EOF
[Unit]
Description=DIAL Control early boot sentinel
After=local-fs.target
Before=dial-control-bootstrap.service
Wants=ssh.service

[Service]
Type=oneshot
ExecStart=$SENTINEL
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 "$SENTINEL_SERVICE"

cat >"$FAILURE_SERVICE" <<EOF
[Unit]
Description=DIAL Control bootstrap failure snapshot

[Service]
Type=oneshot
ExecStart=$FAILURE_SNAPSHOT
EOF
chmod 0644 "$FAILURE_SERVICE"

install -d -m 2755 /var/log/journal 2>/dev/null || true

cat >"$RUNNER" <<'RUNNER_EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

exec > >(tee -a /var/log/dial-control-bootstrap.log) 2>&1

REF="${DIAL_BOOTSTRAP_REF:?DIAL_BOOTSTRAP_REF missing from systemd unit}"
EXPECTED_IMAGE_BLOB="${EXPECTED_IMAGE_BLOB:?EXPECTED_IMAGE_BLOB missing from systemd unit}"
IMAGE_BOOTSTRAP=/usr/local/sbin/dial-control-image-bootstrap.sh
RECEIPT=/var/lib/dial-control/bootstrap/image-bootstrap.receipt

echo "=== DIAL CONTROL FIRST-BOOT CONVERGENCE ==="
echo "bootstrap_ref=$REF"
echo "started=$(date -u +%FT%TZ)"

STAGE=/var/lib/dial-control/bootstrap/stage
DIAG=/var/lib/dial-control/bootstrap/runner-diagnostics.txt
mark_stage() {
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$1" >"$STAGE"
  echo "BOOTSTRAP_STAGE=$1"
}
capture_diag() {
  {
    echo "captured=$(date -u +%FT%TZ)"
    echo "stage=$(cat "$STAGE" 2>/dev/null || true)"
    systemctl --no-pager --full status ssh.service 2>&1 || true
    systemctl --no-pager --full status systemd-resolved.service 2>&1 || true
    systemctl --no-pager --full status dial-control-bootstrap.service 2>&1 || true
    ip -brief address 2>&1 || true
    ip route 2>&1 || true
    ss -ltnp 2>&1 || true
    grep '^DIAL_' /etc/environment 2>/dev/null || true
  } >"$DIAG" 2>&1
}
runner_failed() {
  rc=$?
  mark_stage "FAILED rc=$rc"
  capture_diag
  exit "$rc"
}
trap runner_failed ERR
mark_stage RUNNER_STARTED

enable_existing_ssh() {
  if systemctl list-unit-files ssh.service >/dev/null 2>&1; then
    systemctl enable ssh.service >/dev/null 2>&1 || true
    systemctl start ssh.service >/dev/null 2>&1 || true
  fi
}
enable_existing_ssh


if [[ -s "$RECEIPT" ]] && grep -qx "bootstrap_ref=$REF" "$RECEIPT"; then
  echo "DIAL_CONTROL_BOOTSTRAP=ALREADY_COMPLETE"
  exit 0
fi

configure_dns() {
  install -d -m 0755 /etc/systemd/resolved.conf.d
  cat >/etc/systemd/resolved.conf.d/99-dial-netcup-bootstrap-dns.conf <<'DNS_EOF'
[Resolve]
DNS=1.1.1.1 1.0.0.1 2606:4700:4700::1111 2606:4700:4700::1001
FallbackDNS=8.8.8.8 8.8.4.4 2001:4860:4860::8888
DNSDefaultRoute=yes
DNS_EOF
  chmod 0644 /etc/systemd/resolved.conf.d/99-dial-netcup-bootstrap-dns.conf
  systemctl restart systemd-resolved || true
  sleep 3
}

apt_retry() {
  local attempt rc=1
  for attempt in $(seq 1 12); do
    if DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=600 "$@"; then
      return 0
    else
      rc=$?
    fi
    echo "apt attempt $attempt failed rc=$rc; retrying after lock/network backoff"
    sleep $((attempt < 6 ? attempt * 10 : 60))
  done
  return "$rc"
}

dpkg_recover() {
  local attempt rc=1
  for attempt in $(seq 1 12); do
    if dpkg --configure -a; then
      return 0
    else
      rc=$?
    fi
    echo "dpkg configure attempt $attempt failed rc=$rc; retrying"
    sleep $((attempt < 6 ? attempt * 10 : 60))
  done
  return "$rc"
}

fetch_payload() {
  local tmp hash
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN
  curl --proto '=https' --tlsv1.2 --fail --location     --retry 12 --retry-delay 5 --retry-all-errors     --connect-timeout 20 --max-time 300     "https://raw.githubusercontent.com/Vanguduza/dial-new/$REF/deploy/netcup/hermes-control/image-bootstrap.sh"     -o "$tmp"
  hash="$(git hash-object "$tmp")"
  [[ "$hash" == "$EXPECTED_IMAGE_BLOB" ]] || {
    echo "REFUSE: image-bootstrap blob mismatch expected=$EXPECTED_IMAGE_BLOB actual=$hash" >&2
    return 3
  }
  install -m 0700 "$tmp" "$IMAGE_BOOTSTRAP"
}

sanitize_legacy_environment() {
  if [[ -f /etc/environment ]]; then
    sed -i "s|^DIAL_CONTROL_DISPLAY_NAME=.*$|DIAL_CONTROL_DISPLAY_NAME='Dial Control'|" /etc/environment
  fi
  if [[ -f /home/ubuntu/.config/environment.d/10-dial-host.conf ]]; then
    sed -i "s|^DIAL_CONTROL_DISPLAY_NAME=.*$|DIAL_CONTROL_DISPLAY_NAME='Dial Control'|" /home/ubuntu/.config/environment.d/10-dial-host.conf
  fi
}

configure_dns
mark_stage DNS_CONFIGURED
sanitize_legacy_environment
/bin/sh -c '. /etc/environment'
mark_stage ENVIRONMENT_VALID
dpkg_recover
mark_stage DPKG_HEALTHY
apt_retry update
apt_retry install -y --no-install-recommends ca-certificates curl git openssh-server
enable_existing_ssh
systemctl is-enabled --quiet ssh.service || true
mark_stage SSH_RECOVERY_CHANNEL_ARMED
fetch_payload
mark_stage PAYLOAD_VERIFIED

for attempt in 1 2 3; do
  echo "=== DIAL CONTROL IMAGE BOOTSTRAP ATTEMPT $attempt ==="
  mark_stage "IMAGE_BOOTSTRAP_ATTEMPT_$attempt"
  if DIAL_BOOTSTRAP_REF="$REF" bash "$IMAGE_BOOTSTRAP"; then
    [[ -s "$RECEIPT" ]] || {
      echo "receipt missing after successful bootstrap" >&2
      exit 5
    }
    grep -qx "bootstrap_ref=$REF" "$RECEIPT"
    mark_stage CONTROL_PLANE_READY
    echo "DIAL_CONTROL_BOOTSTRAP=CONTROL_PLANE_READY"
    echo "completed=$(date -u +%FT%TZ)"
    exit 0
  else
    rc=$?
  fi
  echo "image bootstrap attempt $attempt failed rc=$rc"
  sleep $((30 * attempt))
done

echo "DIAL_CONTROL_BOOTSTRAP=FAILED"
exit 1
RUNNER_EOF
chmod 0700 "$RUNNER"

cat >"$SERVICE" <<EOF
[Unit]
Description=DIAL Control immutable first-boot convergence
Wants=network-online.target systemd-resolved.service ssh.service
After=network-online.target systemd-resolved.service ssh.service
OnFailure=dial-control-bootstrap-failure.service
StartLimitIntervalSec=0

[Service]
Type=simple
Environment=DIAL_BOOTSTRAP_REF=$DIAL_BOOTSTRAP_REF
Environment=EXPECTED_IMAGE_BLOB=$EXPECTED_IMAGE_BLOB
ExecStart=$RUNNER
Restart=on-failure
RestartSec=120
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 "$SERVICE"

mkdir -p /etc/systemd/system/multi-user.target.wants
ln -sfn "$SERVICE" /etc/systemd/system/multi-user.target.wants/dial-control-bootstrap.service
ln -sfn "$SENTINEL_SERVICE" /etc/systemd/system/multi-user.target.wants/dial-control-boot-sentinel.service
if [[ -e /usr/lib/systemd/system/ssh.service ]]; then
  ln -sfn /usr/lib/systemd/system/ssh.service /etc/systemd/system/multi-user.target.wants/ssh.service
elif [[ -e /lib/systemd/system/ssh.service ]]; then
  ln -sfn /lib/systemd/system/ssh.service /etc/systemd/system/multi-user.target.wants/ssh.service
fi

# Netcup executes Custom Script in a live installed-system boot. Enabling the
# unit alone is not enough because multi-user.target is already active by this
# point. Start it asynchronously now; if systemd is unavailable for any future
# provisioning variant, the enabled unit will still start on the next boot.
if [[ -d /run/systemd/system ]]; then
  systemctl daemon-reload
  systemctl enable --now dial-control-boot-sentinel.service >/dev/null 2>&1 || true
  systemctl enable --now ssh.service >/dev/null 2>&1 || true
  systemctl enable dial-control-bootstrap.service >/dev/null 2>&1 || true
  systemctl start --no-block dial-control-bootstrap.service
fi

cat >/root/dial-control-bootstrap-scheduled <<EOF
DIAL_BOOTSTRAP_REF=$DIAL_BOOTSTRAP_REF
IMAGE_BOOTSTRAP_BLOB=$EXPECTED_IMAGE_BLOB
FIRST_BOOT_SERVICE=dial-control-bootstrap.service
LOG=$LOG
PROVISIONING_STAGE=NETWORK_FREE
ZERO_TOUCH_POSTBOOT=GITHUB_OIDC
EOF
chmod 0600 /root/dial-control-bootstrap-scheduled

echo "DIAL_CUSTOM_SCRIPT=GREEN"
echo "First-boot convergence has been scheduled without provisioning-stage network or package-manager access."
exit 0
