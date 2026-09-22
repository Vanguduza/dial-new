#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTROL="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
BIND="${DIAL_PRIVATE_MCP_BIND:-${DIAL_CONTROL_OVERLAY_IP:-}}"
PORT="${DIAL_PRIVATE_MCP_PORT:-9133}"
[[ -n "$BIND" ]] || { echo "DIAL_PRIVATE_MCP_BIND or DIAL_CONTROL_OVERLAY_IP is required" >&2; exit 2; }
[[ "$BIND" != "0.0.0.0" && "$BIND" != "::" ]] || { echo "REFUSE: private MCP may not bind all interfaces" >&2; exit 3; }
NODE="$(command -v node)"

install -d -m 0700 "$CONTROL/state" "$CONTROL/secrets"
test -f "$CONTROL/secrets/remote-mcp-capability"

install -d -m 0700 "$HOME/.config/systemd/user"
cat >"$HOME/.config/systemd/user/dial-private-mcp-bind.service" <<EOF
[Unit]
Description=DIAL private cross-cloud MCP bind (control <-> vekl-worker)
After=dial-remote-mcp-relay.service
Requires=dial-remote-mcp-relay.service
[Service]
Type=simple
Environment=DIAL_CONTROL_HOME=$CONTROL
Environment=DIAL_PRIVATE_MCP_BIND=$BIND
Environment=DIAL_PRIVATE_MCP_PORT=$PORT
Environment=DIAL_PRIVATE_MCP_UPSTREAM=http://127.0.0.1:9131
Environment=PATH=$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=$NODE $HERE/dial-private-mcp-bind.mjs
Restart=on-failure
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
systemctl --user enable --now dial-private-mcp-bind.service
sleep 1
systemctl --user is-active --quiet dial-private-mcp-bind.service
curl -fsS "http://${BIND}:${PORT}/health" >/tmp/private-mcp-health.json
printf 'PHASE3_PRIVATE_MCP_BOUND %s:%s health=%s\n' "$BIND" "$PORT" "$(tr '\n' ' ' </tmp/private-mcp-health.json)"
