#!/usr/bin/env bash
# Network hardening for Dial Control (Netcup). Idempotent; run as root.
#
#   harden-netcup-host.sh apply    # sshd key-only + default-deny firewall, then verify
#   harden-netcup-host.sh verify   # report posture, change nothing (exit 1 if not hardened)
#
# Owner decision auth-20260924-owner-network-hardening-recovery-paths. Audit 2026-09-24 found
# ufw inactive (INPUT ACCEPT), and sshd accepting passwords (root included) on 0.0.0.0:22 with
# no authorized key installed anywhere.
#
# Nothing legitimate reaches Dial Control over public SSH: the Oracle peers are reached FROM
# here (WireGuard hub, bounded recovery keys), and administration arrives through the GitHub
# OIDC controller. Break-glass for this host is the Netcup SCP console, which is not sshd.
# So SSH is key-only and accepted only on the private overlay; the public surface is the
# WireGuard port (silent to unauthenticated packets) and the OIDC controller.
set -Eeuo pipefail

MODE="${1:-verify}"
WG_IF="${DIAL_WG_INTERFACE:-wg-dial}"
WG_NET="${DIAL_WG_NETWORK:-10.77.0.0/24}"
WG_PORT="${DIAL_WG_PORT:-51820}"
OIDC_PORT="${DIAL_GITHUB_OIDC_PORT:-9134}"
OIDC_TLS_PORT="${DIAL_GITHUB_OIDC_TLS_PORT:-9443}"
PRIVATE_MCP_PORT="${DIAL_PRIVATE_MCP_PORT:-9133}"
SSHD_DROPIN=/etc/ssh/sshd_config.d/10-dial-hardening.conf

[[ "$(id -u)" == 0 ]] || { echo "HARDEN_REFUSED: run as root" >&2; exit 2; }

sshd_ok() {
  local t; t="$(sshd -T 2>/dev/null)" || return 1
  grep -qx 'passwordauthentication no' <<<"$t" && grep -qx 'permitrootlogin no' <<<"$t" &&
    grep -qx 'kbdinteractiveauthentication no' <<<"$t" && grep -qx 'pubkeyauthentication yes' <<<"$t"
}

firewall_ok() {
  local s; s="$(ufw status verbose 2>/dev/null)" || return 1
  grep -q '^Status: active' <<<"$s" && grep -q 'Default: deny (incoming)' <<<"$s" &&
    ! grep -Eq '^(22|22/tcp|OpenSSH)( \(v6\))? +ALLOW IN +Anywhere' <<<"$s"
}

report() {
  local s; s="$(ufw status verbose 2>/dev/null || true)"
  echo "sshd=$(sshd -T 2>/dev/null | grep -E '^(passwordauthentication|permitrootlogin|kbdinteractiveauthentication|maxauthtries) ' | tr '\n' ';')"
  echo "ufw=$(head -1 <<<"$s")"
  echo "ufw_rules=$(grep -E 'ALLOW|DENY|LIMIT' <<<"$s" | sed -E 's/ +/ /g' | tr '\n' '|')"
  echo "public_listeners=$(ss -tulnH | awk '{print $1":"$5}' | grep -vE '(127\.|\[::1\]|10\.77\.)' | sort -u | tr '\n' ' ')"
  if sshd_ok && firewall_ok; then echo "NETCUP_NETWORK_HARDENED=YES"; else echo "NETCUP_NETWORK_HARDENED=NO"; return 1; fi
}

apply() {
  command -v ufw >/dev/null || { DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ufw >/dev/null; }

  # sshd: first value wins across sshd_config.d, so a 10- drop-in overrides cloud-init's 50-.
  install -d -m 0755 /etc/ssh/sshd_config.d
  cat >"$SSHD_DROPIN.tmp" <<'EOF'
# Managed by deploy/netcup/hermes-control/harden-netcup-host.sh
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
AllowAgentForwarding no
EOF
  mv "$SSHD_DROPIN.tmp" "$SSHD_DROPIN"; chmod 0644 "$SSHD_DROPIN"
  sshd -t
  systemctl reload ssh 2>/dev/null || systemctl reload sshd

  # Firewall: default deny in, allow out. Rules are added before enabling, and enabling only
  # filters NEW connections, so the controller serving this very command is not cut off.
  ufw --force default deny incoming >/dev/null
  ufw --force default allow outgoing >/dev/null
  ufw allow "$WG_PORT/udp" comment 'dial wireguard hub' >/dev/null
  ufw allow "$OIDC_PORT/tcp" comment 'dial github oidc controller' >/dev/null
  ufw allow "$OIDC_TLS_PORT/tcp" comment 'dial github oidc controller (tls)' >/dev/null
  ufw allow in on "$WG_IF" from "$WG_NET" to any port 22 proto tcp comment 'ssh over overlay only' >/dev/null
  ufw allow in on "$WG_IF" from "$WG_NET" to any port "$PRIVATE_MCP_PORT" proto tcp comment 'private mcp over overlay' >/dev/null
  # Remove public SSH allowances left by earlier bootstrap steps.
  local r
  for r in OpenSSH 22/tcp 22; do ufw --force delete allow "$r" >/dev/null 2>&1 || true; done
  ufw --force enable >/dev/null
  report
}

case "$MODE" in
  apply) apply ;;
  verify) report ;;
  *) echo "usage: $0 apply|verify" >&2; exit 2 ;;
esac
