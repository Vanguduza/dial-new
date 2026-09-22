#!/usr/bin/env bash
set -euo pipefail

IFACE="${DIAL_RECOVERY_OVERLAY_INTERFACE:-wg-dial}"
[[ $# -ge 1 ]] || { echo "usage: verify-secondary-recovery-overlay.sh <peer-hostname-or-wireguard-ip> [...]" >&2; exit 64; }
command -v wg >/dev/null || { echo "wireguard-tools is not installed" >&2; exit 78; }
command -v ping >/dev/null || { echo "ping is not installed" >&2; exit 78; }

DUMP="$(wg show "$IFACE" dump 2>/dev/null || true)"
[[ -n "$DUMP" ]] || { echo "WireGuard interface $IFACE is not configured/running" >&2; exit 77; }
PEERS="$(printf '%s\n' "$DUMP" | awk 'NR>1{n++} END{print n+0}')"
[[ "$PEERS" -gt 0 ]] || { echo "WireGuard interface $IFACE has no peers" >&2; exit 77; }

for peer in "$@"; do
  echo "WireGuard recovery proof -> $peer"
  ping -c 2 -W 3 "$peer" >/dev/null
  echo "peer=$peer reachable"
done

echo "SECONDARY_RECOVERY_OVERLAY=WIREGUARD"
echo "SECONDARY_RECOVERY_OVERLAY_INTERFACE=$IFACE"
echo "SECONDARY_RECOVERY_OVERLAY_PEERS=$PEERS"
echo "SECONDARY_RECOVERY_OVERLAY_PEERS_REACHABLE"
