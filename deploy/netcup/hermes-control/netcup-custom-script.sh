#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DIAL_BOOTSTRAP_REF:?DIAL_BOOTSTRAP_REF must be set to the reviewed 40-hex commit SHA}"
[[ "$DIAL_BOOTSTRAP_REF" =~ ^[0-9a-f]{40}$ ]] || { echo "REFUSE: invalid DIAL_BOOTSTRAP_REF" >&2; exit 2; }

export DEBIAN_FRONTEND=noninteractive

. /etc/os-release
[[ "${ID:-}" == ubuntu && "${VERSION_ID:-}" == 24.04 ]] || {
  echo "REFUSE: Ubuntu 24.04 required; detected ${PRETTY_NAME:-unknown}" >&2
  exit 2
}
case "$(uname -m)" in
  x86_64|amd64) ;;
  *) echo "REFUSE: x86_64/amd64 required" >&2; exit 2 ;;
esac

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl git

IMAGE_BOOTSTRAP=/usr/local/sbin/dial-control-image-bootstrap.sh
RUNNER=/usr/local/sbin/dial-control-bootstrap-runner
SERVICE=/etc/systemd/system/dial-control-bootstrap.service
LOG=/var/log/dial-control-bootstrap.log
EXPECTED_IMAGE_BLOB=57c9af6576539db1938c3e04c91b9ed992af7296

curl --proto '=https' --tlsv1.2 --fail --location   --retry 8 --retry-delay 3 --retry-all-errors --connect-timeout 20 --max-time 180   "https://raw.githubusercontent.com/Vanguduza/dial-new/$DIAL_BOOTSTRAP_REF/deploy/netcup/hermes-control/image-bootstrap.sh"   -o "$IMAGE_BOOTSTRAP"

chmod 0700 "$IMAGE_BOOTSTRAP"
[[ "$(git hash-object "$IMAGE_BOOTSTRAP")" == "$EXPECTED_IMAGE_BLOB" ]] || {
  echo "REFUSE: image-bootstrap blob mismatch" >&2
  exit 3
}

cat >"$RUNNER" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
exec > >(tee -a "$LOG") 2>&1

REF="$DIAL_BOOTSTRAP_REF"
RECEIPT=/var/lib/dial-control/bootstrap/image-bootstrap.receipt

if [[ -s "\$RECEIPT" ]] && grep -qx "bootstrap_ref=\$REF" "\$RECEIPT"; then
  echo "DIAL_CONTROL_BOOTSTRAP=ALREADY_COMPLETE"
  exit 0
fi

for attempt in 1 2 3; do
  echo "=== DIAL CONTROL BOOTSTRAP ATTEMPT \$attempt ==="
  echo "commit=\$REF"
  echo "started=\$(date -u +%FT%TZ)"
  if DIAL_BOOTSTRAP_REF="\$REF" bash "$IMAGE_BOOTSTRAP"; then
    [[ -s "\$RECEIPT" ]] || { echo "receipt missing after successful bootstrap"; exit 5; }
    grep -qx "bootstrap_ref=\$REF" "\$RECEIPT"
    echo "DIAL_CONTROL_BOOTSTRAP=GREEN"
    echo "completed=\$(date -u +%FT%TZ)"
    exit 0
  fi
  rc=\$?
  echo "attempt \$attempt failed rc=\$rc"
  sleep \$((30 * attempt))
done

echo "DIAL_CONTROL_BOOTSTRAP=FAILED"
exit 1
EOF
chmod 0700 "$RUNNER"

cat >"$SERVICE" <<EOF
[Unit]
Description=DIAL Control immutable first-boot convergence
Wants=network-online.target
After=network-online.target
ConditionPathExists=!/var/lib/dial-control/bootstrap/image-bootstrap.receipt

[Service]
Type=simple
Environment=DIAL_BOOTSTRAP_REF=$DIAL_BOOTSTRAP_REF
ExecStart=$RUNNER
Restart=on-failure
RestartSec=120
StartLimitIntervalSec=0
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
chmod 0644 "$SERVICE"

mkdir -p /etc/systemd/system/multi-user.target.wants
ln -sfn "$SERVICE" /etc/systemd/system/multi-user.target.wants/dial-control-bootstrap.service

# If the custom-script environment is already a live boot, start asynchronously.
# If it is still the installer environment, the unit starts automatically on first boot.
if [[ -d /run/systemd/system ]]; then
  systemctl daemon-reload || true
  systemctl start --no-block dial-control-bootstrap.service || true
fi

cat >/root/dial-control-bootstrap-scheduled <<EOF
DIAL_BOOTSTRAP_REF=$DIAL_BOOTSTRAP_REF
IMAGE_BOOTSTRAP_BLOB=$EXPECTED_IMAGE_BLOB
FIRST_BOOT_SERVICE=dial-control-bootstrap.service
LOG=$LOG
ZERO_TOUCH_POSTBOOT=GITHUB_OIDC
EOF
chmod 0600 /root/dial-control-bootstrap-scheduled

echo "DIAL_CUSTOM_SCRIPT=GREEN"
echo "Full bootstrap is scheduled as a resilient first-boot service."
exit 0
