#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Netcup Image Provision custom scripts execute in a constrained provisioning
# environment. This stage must remain network-free and package-manager-free.
# The immutable payload revision is pinned here unless explicitly overridden
# by an equally exact 40-hex revision.
DIAL_BOOTSTRAP_REF="${DIAL_BOOTSTRAP_REF:-9fb9ff03dcb693514513019ca9358c814d417a65}"
[[ "$DIAL_BOOTSTRAP_REF" =~ ^[0-9a-f]{40}$ ]] || {
  echo "REFUSE: invalid DIAL_BOOTSTRAP_REF" >&2
  exit 2
}

IMAGE_BOOTSTRAP=/usr/local/sbin/dial-control-image-bootstrap.sh
RUNNER=/usr/local/sbin/dial-control-bootstrap-runner
SERVICE=/etc/systemd/system/dial-control-bootstrap.service
LOG=/var/log/dial-control-bootstrap.log
EXPECTED_IMAGE_BLOB=57c9af6576539db1938c3e04c91b9ed992af7296

install -d -m 0755 /usr/local/sbin /etc/systemd/system /etc/systemd/resolved.conf.d
install -d -m 0700 /var/lib/dial-control/bootstrap

# Persist resolvers only; do not restart services in the Netcup provisioning
# environment. The first-boot runner activates these after the VM boots.
cat >/etc/systemd/resolved.conf.d/99-dial-netcup-bootstrap-dns.conf <<'DNS_EOF'
[Resolve]
DNS=2606:4700:4700::1111 2606:4700:4700::1001 2001:4860:4860::8888
FallbackDNS=2606:4700:4700::1111 2001:4860:4860::8888
DNSDefaultRoute=yes
DNS_EOF
chmod 0644 /etc/systemd/resolved.conf.d/99-dial-netcup-bootstrap-dns.conf

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

if [[ -s "$RECEIPT" ]] && grep -qx "bootstrap_ref=$REF" "$RECEIPT"; then
  echo "DIAL_CONTROL_BOOTSTRAP=ALREADY_COMPLETE"
  exit 0
fi

configure_dns() {
  install -d -m 0755 /etc/systemd/resolved.conf.d
  cat >/etc/systemd/resolved.conf.d/99-dial-netcup-bootstrap-dns.conf <<'DNS_EOF'
[Resolve]
DNS=2606:4700:4700::1111 2606:4700:4700::1001 2001:4860:4860::8888
FallbackDNS=2606:4700:4700::1111 2001:4860:4860::8888
DNSDefaultRoute=yes
DNS_EOF
  chmod 0644 /etc/systemd/resolved.conf.d/99-dial-netcup-bootstrap-dns.conf
  systemctl restart systemd-resolved || true
  sleep 3
}

apt_retry() {
  local attempt rc
  for attempt in $(seq 1 12); do
    if DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=600 "$@"; then
      return 0
    fi
    rc=$?
    echo "apt attempt $attempt failed rc=$rc; retrying after lock/network backoff"
    sleep $((attempt < 6 ? attempt * 10 : 60))
  done
  return "$rc"
}

dpkg_recover() {
  local attempt rc
  for attempt in $(seq 1 12); do
    if dpkg --configure -a; then
      return 0
    fi
    rc=$?
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

configure_dns
dpkg_recover || true
apt_retry update
apt_retry install -y --no-install-recommends ca-certificates curl git
fetch_payload

for attempt in 1 2 3; do
  echo "=== DIAL CONTROL IMAGE BOOTSTRAP ATTEMPT $attempt ==="
  if DIAL_BOOTSTRAP_REF="$REF" bash "$IMAGE_BOOTSTRAP"; then
    [[ -s "$RECEIPT" ]] || {
      echo "receipt missing after successful bootstrap" >&2
      exit 5
    }
    grep -qx "bootstrap_ref=$REF" "$RECEIPT"
    echo "DIAL_CONTROL_BOOTSTRAP=GREEN"
    echo "completed=$(date -u +%FT%TZ)"
    exit 0
  fi
  rc=$?
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
Wants=network-online.target systemd-resolved.service
After=network-online.target systemd-resolved.service
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

# Netcup executes Custom Script in a live installed-system boot. Enabling the
# unit alone is not enough because multi-user.target is already active by this
# point. Start it asynchronously now; if systemd is unavailable for any future
# provisioning variant, the enabled unit will still start on the next boot.
if [[ -d /run/systemd/system ]]; then
  systemctl daemon-reload
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
