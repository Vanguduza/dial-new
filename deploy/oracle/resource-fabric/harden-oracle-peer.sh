#!/usr/bin/env bash
# Network hardening for an Oracle estate peer (oracle-admin, vekl-worker, van-trading-core).
# Runs ON the peer as root; driven from Dial Control by harden-oracle-estate.sh.
#
#   harden-oracle-peer.sh apply <netcup-public-ip>   # stage rules + arm a 180 s automatic rollback
#   harden-oracle-peer.sh confirm                    # cancel the rollback and persist
#   harden-oracle-peer.sh rollback                   # restore the pre-hardening rules now
#   harden-oracle-peer.sh verify                     # report, change nothing (exit 1 if not hardened)
#
# Owner decision auth-20260924-owner-network-hardening-recovery-paths. Audit 2026-09-24: sshd was
# already key-only but allowed root by key, the Oracle image firewall accepted tcp/22 from any
# source, and rpcbind listened on 111. The WireGuard tunnel dials OUT to the Netcup hub, so no
# inbound port is needed for it.
#
# SSH is accepted only from: the private overlay, this VNIC's own subnet (OCI Bastion sessions
# and intra-VCN recovery), and Dial Control's public address (the direct fallback when the
# overlay is down). OCI Run Command and the serial console do not use sshd and are unaffected.
set -Eeuo pipefail

MODE="${1:-verify}"
WG_IF="${DIAL_WG_INTERFACE:-wg-dial}"
WG_NET="${DIAL_WG_NETWORK:-10.77.0.0/24}"
STATE=/var/lib/dial-hardening
SSHD_DROPIN=/etc/ssh/sshd_config.d/10-dial-hardening.conf
ROLLBACK_UNIT=dial-harden-rollback
TAG="dial-harden"

[[ "$(id -u)" == 0 ]] || { echo "HARDEN_REFUSED: run as root" >&2; exit 2; }

subnet_cidr() {
  local dev; dev="$(ip -o -4 route show default | awk '{print $5; exit}')"
  ip -o -4 route show dev "$dev" proto kernel scope link | awk '{print $1; exit}'
}

ssh_open_to_all() { iptables -S INPUT | grep -Eq -- '-p tcp .*--dport 22 .*-j ACCEPT' && iptables -S INPUT | grep -E -- '--dport 22 .*-j ACCEPT' | grep -vq -- '-s '; }

sshd_ok() {
  local t; t="$(sshd -T 2>/dev/null)" || return 1
  grep -qx 'passwordauthentication no' <<<"$t" && grep -qx 'permitrootlogin no' <<<"$t" && grep -qx 'kbdinteractiveauthentication no' <<<"$t"
}

report() {
  echo "host=$(hostname)"
  echo "sshd=$(sshd -T 2>/dev/null | grep -E '^(passwordauthentication|permitrootlogin|kbdinteractiveauthentication|maxauthtries) ' | tr '\n' ';')"
  echo "ssh_rules=$(iptables -S INPUT | grep -- '--dport 22' | tr '\n' '|')"
  echo "ssh_rules_v6=$(ip6tables -S INPUT 2>/dev/null | grep -- '--dport 22' | tr '\n' '|')"
  echo "rpcbind=$(systemctl is-active rpcbind.socket 2>/dev/null || true)/$(systemctl is-enabled rpcbind.socket 2>/dev/null || true)"
  echo "rollback_armed=$(systemctl is-active "$ROLLBACK_UNIT.timer" 2>/dev/null || true)"
  echo "authorized_keys=$(for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do [[ -f $f ]] && printf '%s:%s ' "$f" "$(grep -c . "$f")"; done)"
  if sshd_ok && ! ssh_open_to_all && ! systemctl is-active --quiet rpcbind.socket; then
    echo "ORACLE_PEER_HARDENED=YES"
  else
    echo "ORACLE_PEER_HARDENED=NO"; return 1
  fi
}

apply() {
  local netcup_ip="${1:?netcup public ip required}" subnet
  [[ "$netcup_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "HARDEN_REFUSED: bad netcup ip" >&2; exit 2; }
  subnet="$(subnet_cidr)"; [[ -n "$subnet" ]] || { echo "HARDEN_REFUSED: cannot determine VNIC subnet" >&2; exit 2; }
  install -d -m 0700 "$STATE"
  [[ -s "$STATE/rules.v4.before" ]] || iptables-save >"$STATE/rules.v4.before"
  [[ -s "$STATE/rules.v6.before" ]] || ip6tables-save >"$STATE/rules.v6.before" 2>/dev/null || true

  # Automatic rollback unless the driver confirms from a fresh SSH login within 180 s.
  systemctl stop "$ROLLBACK_UNIT.timer" "$ROLLBACK_UNIT.service" >/dev/null 2>&1 || true
  systemctl reset-failed "$ROLLBACK_UNIT.service" >/dev/null 2>&1 || true
  systemd-run --unit="$ROLLBACK_UNIT" --on-active=180 --timer-property=AccuracySec=1s \
    /bin/bash "$(readlink -f "$0")" rollback >/dev/null

  # IPv4: replace every unrestricted tcp/22 accept with source-restricted accepts at the same place.
  local spec
  while spec="$(iptables -S INPUT | grep -E -- '--dport 22( |$)' | grep -E -- '-j ACCEPT' | grep -v -- ' -s ' | head -1)"; [[ -n "$spec" ]]; do
    # shellcheck disable=SC2086
    iptables ${spec/-A INPUT/-D INPUT}
  done
  iptables -C INPUT -i "$WG_IF" -s "$WG_NET" -p tcp --dport 22 -m comment --comment "$TAG overlay" -j ACCEPT 2>/dev/null ||
    iptables -I INPUT 1 -i "$WG_IF" -s "$WG_NET" -p tcp --dport 22 -m comment --comment "$TAG overlay" -j ACCEPT
  iptables -C INPUT -s "$subnet" -p tcp --dport 22 -m comment --comment "$TAG vcn-subnet/bastion" -j ACCEPT 2>/dev/null ||
    iptables -I INPUT 2 -s "$subnet" -p tcp --dport 22 -m comment --comment "$TAG vcn-subnet/bastion" -j ACCEPT
  iptables -C INPUT -s "$netcup_ip/32" -p tcp --dport 22 -m comment --comment "$TAG netcup-direct" -j ACCEPT 2>/dev/null ||
    iptables -I INPUT 3 -s "$netcup_ip/32" -p tcp --dport 22 -m comment --comment "$TAG netcup-direct" -j ACCEPT
  # van-trading-core: Hermes on Dial Control (10.77.0.1) reaches VAN's commander (9133) over the
  # overlay as "van-trading-core", the name its certificate carries. VAN's own firewall admits only
  # VCN addresses, so the overlay source is allowed here, ahead of it.
  if [[ "$(hostname)" == van-trading-core ]]; then
    iptables -C INPUT -i "$WG_IF" -s 10.77.0.1/32 -p tcp --dport 9133 -m comment --comment "$TAG van-commander" -j ACCEPT 2>/dev/null ||
      iptables -I INPUT 4 -i "$WG_IF" -s 10.77.0.1/32 -p tcp --dport 9133 -m comment --comment "$TAG van-commander" -j ACCEPT
  fi
  # Anything else to tcp/22 falls through to the image's final REJECT; make that explicit in case it is absent.
  iptables -S INPUT | grep -q -- '-j REJECT' || iptables -A INPUT -p tcp --dport 22 -m comment --comment "$TAG ssh-default" -j REJECT
  # IPv6: no peer or fallback uses it for SSH.
  if command -v ip6tables >/dev/null; then
    ip6tables -C INPUT -p tcp --dport 22 -m comment --comment "$TAG no-v6-ssh" -j REJECT 2>/dev/null ||
      ip6tables -I INPUT 1 -p tcp --dport 22 -m comment --comment "$TAG no-v6-ssh" -j REJECT
  fi

  cat >"$SSHD_DROPIN.tmp" <<'EOF'
# Managed by deploy/oracle/resource-fabric/harden-oracle-peer.sh
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
MaxAuthTries 3
X11Forwarding no
AllowAgentForwarding no
EOF
  install -d -m 0755 /etc/ssh/sshd_config.d
  mv "$SSHD_DROPIN.tmp" "$SSHD_DROPIN"; chmod 0644 "$SSHD_DROPIN"
  sshd -t && { systemctl reload ssh 2>/dev/null || systemctl reload sshd; }

  # rpcbind serves NFS, which the estate does not use; the image leaves it listening on 111.
  systemctl disable --now rpcbind.socket rpcbind.service >/dev/null 2>&1 || true
  systemctl mask rpcbind.socket rpcbind.service >/dev/null 2>&1 || true

  echo "HARDEN_STAGED subnet=$subnet netcup=$netcup_ip rollback_in=180s"
}

confirm() {
  systemctl stop "$ROLLBACK_UNIT.timer" >/dev/null 2>&1 || true
  install -d -m 0755 /etc/iptables
  iptables-save >/etc/iptables/rules.v4
  ip6tables-save >/etc/iptables/rules.v6 2>/dev/null || true
  echo "HARDEN_CONFIRMED"
  report
}

rollback() {
  [[ -s "$STATE/rules.v4.before" ]] && iptables-restore <"$STATE/rules.v4.before"
  [[ -s "$STATE/rules.v6.before" ]] && ip6tables-restore <"$STATE/rules.v6.before" 2>/dev/null || true
  rm -f "$SSHD_DROPIN"; sshd -t && { systemctl reload ssh 2>/dev/null || systemctl reload sshd; } || true
  echo "HARDEN_ROLLED_BACK"
}

case "$MODE" in
  apply) apply "${2:-}" ;;
  confirm) confirm ;;
  rollback) rollback ;;
  verify) report ;;
  *) echo "usage: $0 apply <netcup-ip>|confirm|rollback|verify" >&2; exit 2 ;;
esac
