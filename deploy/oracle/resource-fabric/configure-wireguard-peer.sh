#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

HOST_ID="${DIAL_HOST_ID:-$(hostname)}"
NETCUP_PUBLIC_IP="${NETCUP_PUBLIC_IP:-62.83.35.103}"
NETCUP_PUB="${NETCUP_WG_PUBLIC_KEY:-}"
PORT="${DIAL_WG_PORT:-51820}"
CONF=/etc/wireguard/wg-dial.conf
KEY="/etc/wireguard/${HOST_ID}.key"
PUB="/etc/wireguard/${HOST_ID}.pub"

case "$HOST_ID" in
  oracle-admin) ADDR=10.77.0.2/32 ;;
  vekl-worker) ADDR=10.77.0.3/32 ;;
  van-trading-core) ADDR=10.77.0.4/32 ;;
  *) echo "REFUSE: unsupported peer $HOST_ID" >&2; exit 2 ;;
esac
[[ -n "$NETCUP_PUB" ]] || { echo "REFUSE: NETCUP_WG_PUBLIC_KEY required" >&2; exit 2; }

command -v wg >/dev/null 2>&1 || {
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y wireguard wireguard-tools
}
install -d -m 0700 /etc/wireguard
if [[ ! -s "$KEY" ]]; then
  wg genkey >"$KEY"
  chmod 0600 "$KEY"
  wg pubkey <"$KEY" >"$PUB"
  chmod 0644 "$PUB"
fi
priv="$(cat "$KEY")"

cat >"$CONF" <<EOF
[Interface]
Address = $ADDR
PrivateKey = $priv

[Peer]
PublicKey = $NETCUP_PUB
Endpoint = $NETCUP_PUBLIC_IP:$PORT
AllowedIPs = 10.77.0.1/32
PersistentKeepalive = 25
EOF
chmod 0600 "$CONF"
systemctl enable --now wg-quick@wg-dial
sleep 2

grep -vE '(^|[[:space:]])dial-hermes-control([[:space:]]|$)' /etc/hosts >/tmp/dial-hosts.$$
echo '10.77.0.1 dial-hermes-control' >>/tmp/dial-hosts.$$
install -m 0644 /tmp/dial-hosts.$$ /etc/hosts
rm -f /tmp/dial-hosts.$$

echo "DIAL_WIREGUARD_PEER=GREEN"
echo "host=$HOST_ID"
echo "address=$ADDR"
echo "public_key=$(cat "$PUB")"
echo "control=10.77.0.1"
