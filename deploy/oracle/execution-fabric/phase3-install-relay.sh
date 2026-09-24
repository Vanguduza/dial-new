#!/usr/bin/env bash
set -euo pipefail
# Netcup pre-cutover: units install and enable, but the activation gate holds their start.
activation_gated(){ [[ -f "$HOME/.config/systemd/user/dial-.service.d/10-dial-netcup-activation-gate.conf" && ! -e "${DIAL_CONTROL_HOME:-/var/lib/dial-control}/state/netcup-activated" ]]; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTROL="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
NODE="$(command -v node)"
[[ "$(hostname)" == "${DIAL_HERMES_HOST_ID:-dial-hermes-control}" || "$(hostname)" == dial-control ]] || { echo "REFUSE: control-host relay installer on $(hostname)" >&2; exit 3; }
[[ -f "$CONTROL/secrets/chat-control.token" ]] || { echo "remote MCP relay requires chat-control.token" >&2; exit 2; }
install -d -m 0700 "$CONTROL/operator-channels" "$CONTROL/secrets" "$CONTROL/state" "$HOME/.config/systemd/user"
install -m 0600 "$HERE/remote-mcp-relay.mjs" "$CONTROL/operator-channels/remote-mcp-relay.mjs"
cat >"$HOME/.config/systemd/user/dial-remote-mcp-relay.service" <<EOF
[Unit]
Description=DIAL remote MCP capability relay
After=dial-chat-control.service
Requires=dial-chat-control.service

[Service]
Type=simple
Environment=PATH=$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=$NODE $CONTROL/operator-channels/remote-mcp-relay.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$CONTROL

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now dial-remote-mcp-relay.service
sleep 1
activation_gated || systemctl --user is-active --quiet dial-remote-mcp-relay.service
activation_gated || curl -fsS http://127.0.0.1:9131/health >/dev/null
[[ -s "$CONTROL/secrets/remote-mcp-capability" ]]
echo "REMOTE_MCP_RELAY=GREEN"
