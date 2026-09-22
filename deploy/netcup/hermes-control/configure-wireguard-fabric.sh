#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

NETCUP_ADDR="${NETCUP_WG_ADDRESS:-10.77.0.1/24}"
PORT="${DIAL_WG_PORT:-51820}"
ADMIN_PUB="${ORACLE_ADMIN_WG_PUBLIC_KEY:-}"
VEKL_PUB="${VEKL_WORKER_WG_PUBLIC_KEY:-}"
TRADING_PUB="${VAN_TRADING_CORE_WG_PUBLIC_KEY:-}"\nOLD_PUB="${OLD_CONTROL_WG_PUBLIC_KEY:-}"
KEY=/etc/wireguard/dial-netcup.key
CONF=/etc/wireguard/wg-dial.conf

[[ "$(hostname)" == dial-control ]] || { echo "REFUSE: wrong host" >&2; exit 2; }
[[ -s "$KEY" ]] || { echo "REFUSE: $KEY missing; image bootstrap should have created it" >&2; exit 2; }
for v in ADMIN_PUB VEKL_PUB TRADING_PUB OLD_PUB; do [[ -n "${!v}" ]] || { echo "REFUSE: $v missing" >&2; exit 2; }; done

priv="$(cat "$KEY")"
cat >"$CONF" <<EOF
[Interface]
Address = $NETCUP_ADDR
ListenPort = $PORT
PrivateKey = $priv

[Peer]
# oracle-admin
PublicKey = $ADMIN_PUB
AllowedIPs = 10.77.0.2/32

[Peer]
# vekl-worker
PublicKey = $VEKL_PUB
AllowedIPs = 10.77.0.3/32

[Peer]
# van-trading-core
PublicKey = $TRADING_PUB
AllowedIPs = 10.77.0.4/32
EOF
if [[ -n "$OLD_PUB" ]]; then
  cat >>"$CONF" <<EOF

[Peer]
# temporary old Oracle dial-hermes-control during migration
PublicKey = $OLD_PUB
AllowedIPs = 10.77.0.5/32
EOF
fi
chmod 0600 "$CONF"

ufw allow "$PORT/udp" >/dev/null 2>&1 || true
systemctl enable --now wg-quick@wg-dial
sleep 2
wg show wg-dial

grep -vE '(^|[[:space:]])(oracle-admin|vekl-worker|van-trading-core|old-dial-hermes-control)([[:space:]]|$)' /etc/hosts >/tmp/dial-hosts.$
cat >>/tmp/dial-hosts.$ <<'EOF'
10.77.0.2 oracle-admin
10.77.0.3 vekl-worker
10.77.0.4 van-trading-core
10.77.0.5 old-dial-hermes-control
EOF
install -m 0644 /tmp/dial-hosts.$$ /etc/hosts
rm -f /tmp/dial-hosts.$$

echo "DIAL_WIREGUARD_HUB=GREEN"
echo "DIAL_CONTROL_OVERLAY_IP=10.77.0.1"
echo "DIAL_PRIVATE_MCP_BIND=10.77.0.1"
