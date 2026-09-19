#!/usr/bin/env bash
set -euo pipefail
[[ $# -ge 1 ]] || { echo "usage: verify-secondary-recovery-overlay.sh <peer-hostname-or-tailscale-ip> [...]" >&2; exit 64; }
command -v tailscale >/dev/null || { echo "tailscale is not installed" >&2; exit 78; }
STATE="$(tailscale status --json)"
node -e 'const s=JSON.parse(process.argv[1]); if(s.BackendState!=="Running"||s.Self?.Online!==true) process.exit(1)' "$STATE" || { echo "local Tailscale node is not Running/Online" >&2; exit 77; }
for peer in "$@"; do
  echo "Tailscale proof -> $peer"
  tailscale ping --c 2 --timeout 8s "$peer"
done
echo "SECONDARY_RECOVERY_OVERLAY_PEERS_REACHABLE"
