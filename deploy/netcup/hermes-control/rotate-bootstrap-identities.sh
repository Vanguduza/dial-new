#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "$(hostname)" == dial-control ]] || { echo "REFUSE: wrong host" >&2; exit 2; }
BOOT=/home/ubuntu/.ssh/dial-bootstrap-oracle
PERM=/home/ubuntu/.ssh/dial-oracle-admin
BOOT_PUB_FILE=/home/ubuntu/.ssh/dial-bootstrap-oracle.pub
[[ -s "$BOOT" ]] || { echo "REFUSE: bootstrap ssh key missing" >&2; exit 2; }
install -d -m 0700 -o ubuntu -g ubuntu /home/ubuntu/.ssh

if [[ ! -s "$PERM" ]]; then
  runuser -u ubuntu -- ssh-keygen -q -t ed25519 -N '' -C 'dial-control-oracle-admin' -f "$PERM"
fi
chmod 0600 "$PERM"; chown ubuntu:ubuntu "$PERM" "$PERM.pub"
NEW_PUB="$(cat "$PERM.pub")"
BOOT_PUB="$(cat "$BOOT_PUB_FILE")"

declare -A PEERS=(
  [oracle-admin]=10.77.0.2
  [vekl-worker]=10.77.0.3
  [van-trading-core]=10.77.0.4
)
NAMES=(oracle-admin vekl-worker)
[[ -f /var/lib/dial-control/state/van-trading-core-pending-rebuild ]] || NAMES+=(van-trading-core)
# The migration source (a separate A1) is rotated only while it is still an overlay peer.
if [[ ! -f /var/lib/dial-control/state/a1-control-retired ]] &&
   grep -qE '^10\.77\.0\.5[[:space:]]+old-dial-hermes-control([[:space:]]|$)' /etc/hosts; then
  PEERS[old-dial-hermes-control]=10.77.0.5
  NAMES+=(old-dial-hermes-control)
fi
for name in "${NAMES[@]}"; do
  ip="${PEERS[$name]}"
  # Re-runnable: a peer that already accepts the permanent key has had its bootstrap key removed
  # by an earlier (interrupted) pass, so it is not asked to authorize again with that key.
  if ! runuser -u ubuntu -- ssh -i "$PERM" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new ubuntu@"$ip" true 2>/dev/null; then
    runuser -u ubuntu -- ssh -i "$BOOT" -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new ubuntu@"$ip"     "mkdir -p ~/.ssh; chmod 700 ~/.ssh; grep -qxF '$NEW_PUB' ~/.ssh/authorized_keys 2>/dev/null || printf '%s\n' '$NEW_PUB' >>~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys"
  fi
  runuser -u ubuntu -- ssh -i "$PERM" -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new ubuntu@"$ip" true
  runuser -u ubuntu -- ssh -i "$PERM" -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new ubuntu@"$ip"     "grep -vxF '$BOOT_PUB' ~/.ssh/authorized_keys >~/.ssh/authorized_keys.next || true; mv ~/.ssh/authorized_keys.next ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys"
done

cat >/home/ubuntu/.ssh/config <<'EOF'
Host oracle-admin
  HostName 10.77.0.2
  User ubuntu
  IdentityFile ~/.ssh/dial-oracle-admin
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
Host vekl-worker
  HostName 10.77.0.3
  User ubuntu
  IdentityFile ~/.ssh/dial-oracle-admin
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
Host van-trading-core
  HostName 10.77.0.4
  User ubuntu
  IdentityFile ~/.ssh/dial-oracle-admin
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF
if [[ -n "${PEERS[old-dial-hermes-control]:-}" ]]; then
  cat >>/home/ubuntu/.ssh/config <<'EOF'
Host old-dial-hermes-control
  HostName 10.77.0.5
  User ubuntu
  IdentityFile ~/.ssh/dial-oracle-admin
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF
fi
chown ubuntu:ubuntu /home/ubuntu/.ssh/config
chmod 0600 /home/ubuntu/.ssh/config

OLD_WG_PRIV="$(cat /etc/wireguard/dial-netcup.key)"
OLD_WG_PUB="$(printf '%s' "$OLD_WG_PRIV" | wg pubkey)"
NEXT_WG=/etc/wireguard/dial-netcup.key.next
wg genkey >"$NEXT_WG"
chmod 0600 "$NEXT_WG"
NEW_WG_PUB="$(wg pubkey <"$NEXT_WG")"

for name in "${NAMES[@]}"; do
  ip="${PEERS[$name]}"
  runuser -u ubuntu -- ssh -i "$PERM" -o BatchMode=yes -o ConnectTimeout=8 ubuntu@"$ip"     "sudo sed -i 's|PublicKey = $OLD_WG_PUB|PublicKey = $NEW_WG_PUB|' /etc/wireguard/wg-dial.conf; sudo sh -c 'nohup bash -lc \"sleep 1; systemctl restart wg-quick@wg-dial\" >/dev/null 2>&1 &'"
done
sleep 3
sed -i "s|^PrivateKey = .*|PrivateKey = $(cat "$NEXT_WG")|" /etc/wireguard/wg-dial.conf
wg set wg-dial private-key "$NEXT_WG"
mv "$NEXT_WG" /etc/wireguard/dial-netcup.key
printf '%s\n' "$NEW_WG_PUB" >/etc/wireguard/dial-netcup.pub
chmod 0600 /etc/wireguard/dial-netcup.key
chmod 0644 /etc/wireguard/dial-netcup.pub
sleep 8

for name in "${NAMES[@]}"; do
  ip="${PEERS[$name]}"
  ping -c 1 -W 3 "$ip" >/dev/null
  runuser -u ubuntu -- ssh -i "$PERM" -o BatchMode=yes -o ConnectTimeout=8 ubuntu@"$ip" true
done

rm -f "$BOOT" "$BOOT_PUB_FILE"
echo "BOOTSTRAP_IDENTITIES_ROTATED=TRUE"
echo "permanent_ssh=$PERM"
echo "wireguard_public_key=$NEW_WG_PUB"
