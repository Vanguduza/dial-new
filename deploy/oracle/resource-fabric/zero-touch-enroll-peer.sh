#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DIAL_HOST_ID:?DIAL_HOST_ID required}"
: "${NETCUP_WG_PUBLIC_KEY:?NETCUP_WG_PUBLIC_KEY required}"
: "${NETCUP_BOOTSTRAP_SSH_PUBLIC_KEY:?NETCUP_BOOTSTRAP_SSH_PUBLIC_KEY required}"

NETCUP_PUBLIC_IP="${NETCUP_PUBLIC_IP:-62.83.35.103}"
PORT="${DIAL_WG_PORT:-51820}"
HOST_ID="$DIAL_HOST_ID"
CONF=/etc/wireguard/wg-dial.conf
KEY="/etc/wireguard/${HOST_ID}.key"
PUB="/etc/wireguard/${HOST_ID}.pub"

case "$HOST_ID" in
  oracle-admin) ADDR=10.77.0.2/32 ;;
  vekl-worker) ADDR=10.77.0.3/32 ;;
  van-trading-core) ADDR=10.77.0.4/32 ;;
  old-dial-hermes-control|dial-hermes-control) ADDR=10.77.0.5/32 ;;
  *) echo "REFUSE: unsupported host $HOST_ID" >&2; exit 2 ;;
esac

id ubuntu >/dev/null 2>&1 || { echo "REFUSE: ubuntu user missing" >&2; exit 2; }

install -d -m 0700 -o ubuntu -g ubuntu /home/ubuntu/.ssh
touch /home/ubuntu/.ssh/authorized_keys
chown ubuntu:ubuntu /home/ubuntu/.ssh/authorized_keys
chmod 0600 /home/ubuntu/.ssh/authorized_keys
grep -qxF "$NETCUP_BOOTSTRAP_SSH_PUBLIC_KEY" /home/ubuntu/.ssh/authorized_keys 2>/dev/null ||   printf '%s\n' "$NETCUP_BOOTSTRAP_SSH_PUBLIC_KEY" >>/home/ubuntu/.ssh/authorized_keys

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

cat >"$CONF" <<EOF
[Interface]
Address = $ADDR
PrivateKey = $(cat "$KEY")

[Peer]
PublicKey = $NETCUP_WG_PUBLIC_KEY
Endpoint = $NETCUP_PUBLIC_IP:$PORT
AllowedIPs = 10.77.0.1/32
PersistentKeepalive = 25
EOF
chmod 0600 "$CONF"

systemctl enable wg-quick@wg-dial >/dev/null 2>&1 || true
systemctl restart wg-quick@wg-dial
sleep 2

grep -vE '(^|[[:space:]])(dial-control|dial-hermes-control)([[:space:]]|$)' /etc/hosts >/tmp/dial-hosts.$$
echo '10.77.0.1 dial-control dial-hermes-control' >>/tmp/dial-hosts.$$
install -m 0644 /tmp/dial-hosts.$$ /etc/hosts
rm -f /tmp/dial-hosts.$$

PUBKEY="$(cat "$PUB")"
echo "ZERO_TOUCH_ORACLE_PEER=GREEN"
echo "DIAL_HOST_ID=$HOST_ID"
echo "DIAL_WG_ADDRESS=$ADDR"
echo "DIAL_WG_PUBLIC_KEY=$PUBKEY"
