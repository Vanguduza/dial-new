#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="${DIAL_HERMES_HOST_ID:-dial-hermes-control}"
[[ "$(hostname)" == "$HOST" ]] || { echo "REFUSE: execution fabric control runtime belongs on $HOST" >&2; exit 3; }

bash "$HERE/install-host-role.sh" CONTROL_AUTHORITY

uid="$(id -u)"
current_slice="$(systemctl show "user@${uid}.service" -p Slice --value 2>/dev/null || true)"
if [[ "$current_slice" != "dial-hermes.slice" ]]; then
  bash "$HERE/phase1-install-slices.sh"
else
  sudo install -m 0644 "$HERE/slices/dial-survival.slice" /etc/systemd/system/dial-survival.slice
  sudo install -m 0644 "$HERE/slices/dial-hermes.slice" /etc/systemd/system/dial-hermes.slice
  sudo install -m 0644 "$HERE/slices/dial-dev.slice" /etc/systemd/system/dial-dev.slice
  sudo install -m 0644 "$HERE/slices/dial-commander.slice" /etc/systemd/system/dial-commander.slice
  sudo systemctl daemon-reload
fi

bash "$HERE/phase3-install-relay.sh"
bash "$HERE/phase3-bind-private-mcp.sh"
bash "$HERE/phase4-install-sandbox.sh"
bash "$HERE/phase5-install-providers.sh"

systemctl --user is-active --quiet dial-remote-mcp-relay.service
systemctl --user is-active --quiet dial-private-mcp-bind.service
systemctl --user is-active --quiet dial-venue-guard.service
echo "EXECUTION_FABRIC_CONTROL_RUNTIME=GREEN"
