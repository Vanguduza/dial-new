#!/usr/bin/env bash
set -euo pipefail
# Netcup pre-cutover: units install and enable, but the activation gate holds their start.
activation_gated(){ [[ -f "$HOME/.config/systemd/user/dial-.service.d/10-dial-netcup-activation-gate.conf" && ! -e "${DIAL_CONTROL_HOME:-/var/lib/dial-control}/state/netcup-activated" ]]; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="${DIAL_HERMES_HOST_ID:-dial-hermes-control}"
# hosts.json: host_id dial-hermes-control runs on Netcup as physical_hostname dial-control.
[[ "$(hostname)" == "$HOST" || "$(hostname)" == dial-control ]] || { echo "REFUSE: execution fabric control runtime belongs on $HOST (physical host dial-control)" >&2; exit 3; }

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

if activation_gated; then echo "EXECUTION_FABRIC_CONTROL_RUNTIME=INSTALLED_ACTIVATION_GATED"; exit 0; fi
systemctl --user is-active --quiet dial-remote-mcp-relay.service
systemctl --user is-active --quiet dial-private-mcp-bind.service
systemctl --user is-active --quiet dial-venue-guard.service
echo "EXECUTION_FABRIC_CONTROL_RUNTIME=GREEN"
