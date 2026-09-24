#!/usr/bin/env bash
# Drive harden-oracle-peer.sh on each enrolled Oracle peer from Dial Control. Run as root.
#
#   harden-oracle-estate.sh apply [10.77.0.2 10.77.0.3 ...]   # default: every enrolled wg-dial peer except the migration source
#   harden-oracle-estate.sh verify [peers...]
#
# Safety: the peer arms a 180 s automatic rollback before changing anything. This driver
# confirms only after a NEW SSH login over the overlay succeeds; if it cannot log in again,
# it does not confirm and the peer restores its previous rules by itself.
set -Eeuo pipefail

MODE="${1:-verify}"; shift || true
REPO="${DIAL_REPO_DIR:-/home/ubuntu/dial-new}"
PEER_SCRIPT="$REPO/deploy/oracle/resource-fabric/harden-oracle-peer.sh"
WG_IF="${DIAL_WG_INTERFACE:-wg-dial}"
MIGRATION_SOURCE="${DIAL_MIGRATION_SOURCE_IP:-10.77.0.5}"
KEY=/home/ubuntu/.ssh/dial-oracle-admin; [[ -f "$KEY" ]] || KEY=/home/ubuntu/.ssh/dial-bootstrap-oracle

[[ "$(id -u)" == 0 ]] || { echo "HARDEN_REFUSED: run as root" >&2; exit 2; }
[[ -f "$PEER_SCRIPT" ]] || { echo "HARDEN_REFUSED: $PEER_SCRIPT missing" >&2; exit 2; }

netcup_ip="${DIAL_NETCUP_PUBLIC_IP:-$(ip -4 route get 1.1.1.1 | awk '{for(i=1;i<NF;i++) if($i=="src"){print $(i+1); exit}}')}"
[[ "$netcup_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "HARDEN_REFUSED: cannot determine Dial Control public IP" >&2; exit 2; }

sshp() { local ip="$1"; shift; runuser -u ubuntu -- timeout 40 ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes \
  -o ConnectTimeout=8 -o ControlMaster=no -o ControlPath=none ubuntu@"$ip" "$@"; }

peers=("$@")
if [[ ${#peers[@]} -eq 0 ]]; then
  mapfile -t peers < <(wg show "$WG_IF" allowed-ips | awk '{sub("/32","",$2); print $2}' | grep -vx "$MIGRATION_SOURCE" | sort)
fi
[[ ${#peers[@]} -gt 0 ]] || { echo "HARDEN_REFUSED: no peers" >&2; exit 2; }

rc=0
for ip in "${peers[@]}"; do
  echo "== peer $ip"
  if ! sshp "$ip" true; then echo "PEER_UNREACHABLE $ip"; rc=1; continue; fi
  sshp "$ip" 'cat >/tmp/dial-harden-peer.sh && sudo -n install -m 0755 /tmp/dial-harden-peer.sh /usr/local/sbin/dial-harden-peer && rm -f /tmp/dial-harden-peer.sh' <"$PEER_SCRIPT"
  if [[ "$MODE" == verify ]]; then sshp "$ip" 'sudo -n /usr/local/sbin/dial-harden-peer verify' || rc=1; continue; fi
  sshp "$ip" "sudo -n /usr/local/sbin/dial-harden-peer apply $netcup_ip" || { echo "APPLY_FAILED $ip"; rc=1; continue; }
  sleep 2
  if sshp "$ip" 'sudo -n /usr/local/sbin/dial-harden-peer confirm'; then
    echo "PEER_HARDENED $ip"
  else
    echo "RELOGIN_FAILED $ip: not confirmed; the peer rolls back automatically within 180 s"; rc=1
  fi
done
exit "$rc"
