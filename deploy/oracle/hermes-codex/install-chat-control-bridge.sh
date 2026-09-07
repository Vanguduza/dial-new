#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
USER_UNIT_DIR="${HOME}/.config/systemd/user"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
START_SERVICES=1
if [[ "${1:-}" == "--no-start" ]]; then START_SERVICES=0; fi

mkdir -p "${USER_UNIT_DIR}"
node "${REPO_DIR}/agent-system/orchestration/chat-control-bridge.mjs" token-init >/dev/null

cat >"${USER_UNIT_DIR}/dial-chat-control.service" <<UNIT
[Unit]
Description=DIAL Claude Chat Control Bridge (DIAL-only MCP surface)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
Environment=DIAL_REPO_DIR=${REPO_DIR}
Environment=DIAL_CONTROL_HOME=${CONTROL_HOME}
Environment=DIAL_CHAT_CONTROL_HOST=127.0.0.1
Environment=DIAL_CHAT_CONTROL_PORT=9130
ExecStart=/usr/bin/node ${REPO_DIR}/agent-system/orchestration/chat-control-bridge.mjs serve
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadOnlyPaths=${REPO_DIR}
ReadWritePaths=${CONTROL_HOME}

[Install]
WantedBy=default.target
UNIT

cat >"${USER_UNIT_DIR}/dial-mission-controller.service" <<UNIT
[Unit]
Description=DIAL Persistent Development Mission Controller
After=dial-hermes-orchestrator.service
Wants=dial-hermes-orchestrator.service

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
Environment=DIAL_REPO_DIR=${REPO_DIR}
Environment=DIAL_CONTROL_HOME=${CONTROL_HOME}
ExecStart=/usr/bin/node ${REPO_DIR}/agent-system/orchestration/mission-controller.mjs daemon
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadOnlyPaths=${REPO_DIR}
ReadWritePaths=${CONTROL_HOME}

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable dial-chat-control.service dial-mission-controller.service
if [[ "${START_SERVICES}" == "1" ]]; then
  systemctl --user restart dial-chat-control.service dial-mission-controller.service
fi

echo "DIAL chat-control bridge installed."
echo "MCP endpoint (host-local): http://127.0.0.1:9130/mcp"
echo "Authentication: bearer token stored at ${CONTROL_HOME}/secrets/chat-control.token (0600); token material is not printed."
echo "Public exposure is intentionally NOT created by this installer. Use an authenticated private tunnel/Access policy before connecting a remote chat client."
