#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

NETCUP_ADDR="${NETCUP_WG_ADDRESS:-10.77.0.1/24}"
PORT="${DIAL_WG_PORT:-51820}"
ADMIN_PUB="${ORACLE_ADMIN_WG_PUBLIC_KEY:-}"
VEKL_PUB="${VEKL_WORKER_WG_PUBLIC_KEY:-}"
A1_PUB="${ORACLE_A1_WG_PUBLIC_KEY:-}"
KEY=/etc/wireguard/dial-netcup.key
CONF=/etc/wireguard/wg-dial.conf

[[ "$(hostname)" == dial-control ]] || { echo "REFUSE: wrong host" >&2; exit 2; }
[[ -s "$KEY" ]] || { echo "REFUSE: $KEY missing; image bootstrap should have created it" >&2; exit 2; }
for v in ADMIN_PUB VEKL_PUB A1_PUB; do
  [[ -n "${!v}" ]] || { echo "REFUSE: $v missing" >&2; exit 2; }
done

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
# Oracle A1 transition peer: old control during migration, VAN/VATI after cutover
PublicKey = $A1_PUB
AllowedIPs = 10.77.0.4/32
EOF
chmod 0600 "$CONF"

ufw allow "$PORT/udp" >/dev/null 2>&1 || true
systemctl enable wg-quick@wg-dial >/dev/null 2>&1 || systemctl restart wg-quick@wg-dial
systemctl restart wg-quick@wg-dial
sleep 2
wg show wg-dial

tmp="$(mktemp /tmp/dial-hosts.XXXXXX)"
grep -vE '(^|[[:space:]])(oracle-admin|vekl-worker|van-trading-core|old-dial-hermes-control)([[:space:]]|$)' /etc/hosts >"$tmp"
cat >>"$tmp" <<'EOF'
10.77.0.2 oracle-admin
10.77.0.3 vekl-worker
10.77.0.4 old-dial-hermes-control van-trading-core
EOF
install -m 0644 "$tmp" /etc/hosts
rm -f "$tmp"

echo "DIAL_WIREGUARD_HUB=GREEN"
echo "DIAL_CONTROL_OVERLAY_IP=10.77.0.1"
echo "DIAL_PRIVATE_MCP_BIND=10.77.0.1"
