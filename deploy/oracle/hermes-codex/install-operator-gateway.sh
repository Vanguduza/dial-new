#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
USER_UNIT_DIR="${HOME}/.config/systemd/user"
HERMES_HOME="${HERMES_HOME:-${HOME}/.hermes}"
HERMES_DIR="${HERMES_AGENT_DIR:-${HERMES_HOME}/hermes-agent}"
CODEX_HOME="${CODEX_HOME:-${HOME}/.codex}"
HERMES_WA_SESSION="${HERMES_WHATSAPP_SESSION:-${HOME}/.hermes/whatsapp/session}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
START_SERVICES=1
if [[ "${1:-}" == "--no-start" ]]; then START_SERVICES=0; fi

fail(){ echo "ERROR: $*" >&2; exit 1; }
[[ -f "$REPO_DIR/agent-system/orchestration/operator-control-stdio.mjs" ]] || fail "operator-control-stdio.mjs missing"
[[ -f "$REPO_DIR/agent-system/orchestration/whatsapp-hermes-operator.mjs" ]] || fail "whatsapp-hermes-operator.mjs missing"
[[ -f "$REPO_DIR/agent-system/orchestration/owner-live-control.mjs" ]] || fail "owner-live-control.mjs missing"
[[ -f "$REPO_DIR/agent-system/orchestration/owner-steering-broker.mjs" ]] || fail "owner-steering-broker.mjs missing"
[[ -f "$REPO_DIR/agent-system/orchestration/whatsapp-owner-input.mjs" ]] || fail "whatsapp-owner-input.mjs missing"
[[ -f "$REPO_DIR/agent-system/orchestration/whatsapp-operator-adapter.mjs" ]] || fail "whatsapp-operator-adapter.mjs missing"
[[ -f "$HERMES_DIR/scripts/whatsapp-bridge/bridge.js" ]] || fail "Hermes WhatsApp bridge missing"
mkdir -p "$USER_UNIT_DIR" "$CONTROL_HOME/operator-channels/whatsapp" "$HERMES_WA_SESSION"
chmod 700 "$CONTROL_HOME/operator-channels" "$CONTROL_HOME/operator-channels/whatsapp" "$HERMES_WA_SESSION" 2>/dev/null || true

# The existing bearer-protected HTTP MCP and persistent mission controller remain
# the shared control-plane authority used by remote clients.
if [[ "$START_SERVICES" == 1 ]]; then
  bash "$REPO_DIR/deploy/oracle/hermes-codex/install-chat-control-bridge.sh"
else
  bash "$REPO_DIR/deploy/oracle/hermes-codex/install-chat-control-bridge.sh" --no-start
fi

cat >"$USER_UNIT_DIR/dial-owner-steering.service" <<UNIT
[Unit]
Description=DIAL hybrid owner steering broker
After=network-online.target dial-chat-control.service dial-hermes-orchestrator.service
Wants=network-online.target dial-chat-control.service dial-hermes-orchestrator.service

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
Environment=DIAL_REPO_DIR=${REPO_DIR}
Environment=DIAL_CONTROL_HOME=${CONTROL_HOME}
Environment=HERMES_HOME=${HERMES_HOME}
Environment=CODEX_HOME=${CODEX_HOME}
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=/usr/bin/node ${REPO_DIR}/agent-system/orchestration/owner-steering-broker.mjs daemon
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${CONTROL_HOME} ${REPO_DIR} ${HERMES_HOME} ${CODEX_HOME} -${HOME}/.claude -${HOME}/.config/claude

[Install]
WantedBy=default.target
UNIT

cat >"$USER_UNIT_DIR/dial-hermes-whatsapp-bridge.service" <<UNIT
[Unit]
Description=DIAL Hermes WhatsApp self-chat bridge
After=network-online.target
Wants=network-online.target
ConditionPathExists=${HERMES_WA_SESSION}/creds.json

[Service]
Type=simple
Environment=WHATSAPP_MODE=self-chat
Environment=WHATSAPP_DM_POLICY=closed
ExecStart=/usr/bin/node ${HERMES_DIR}/scripts/whatsapp-bridge/bridge.js --port 3011 --session ${HERMES_WA_SESSION}
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${HERMES_WA_SESSION} ${HOME}/.hermes

[Install]
WantedBy=default.target
UNIT

cat >"$USER_UNIT_DIR/dial-hermes-whatsapp-bridge.path" <<UNIT
[Unit]
Description=Start DIAL WhatsApp bridge after Hermes pairing credentials exist

[Path]
PathExists=${HERMES_WA_SESSION}/creds.json
Unit=dial-hermes-whatsapp-bridge.service

[Install]
WantedBy=default.target
UNIT

cat >"$USER_UNIT_DIR/dial-hermes-whatsapp-operator.service" <<UNIT
[Unit]
Description=DIAL owner-only WhatsApp typed operator control through Hermes self-chat
After=network-online.target dial-chat-control.service dial-owner-steering.service
Wants=network-online.target dial-chat-control.service dial-owner-steering.service

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
Environment=DIAL_REPO_DIR=${REPO_DIR}
Environment=DIAL_CONTROL_HOME=${CONTROL_HOME}
Environment=DIAL_HERMES_WHATSAPP_BRIDGE_URL=http://127.0.0.1:3011
Environment=DIAL_HERMES_WHATSAPP_CREDS=${HERMES_WA_SESSION}/creds.json
Environment=HERMES_HOME=${HERMES_HOME}
Environment=CODEX_HOME=${CODEX_HOME}
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=/usr/bin/node ${REPO_DIR}/agent-system/orchestration/whatsapp-hermes-operator.mjs daemon
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadOnlyPaths=${REPO_DIR} ${HERMES_DIR}
ReadWritePaths=${CONTROL_HOME} ${HERMES_WA_SESSION} ${HERMES_HOME} ${CODEX_HOME} -${HOME}/.claude -${HOME}/.config/claude

[Install]
WantedBy=default.target
UNIT

cat >"$USER_UNIT_DIR/dial-whatsapp-cloud-operator.service" <<UNIT
[Unit]
Description=DIAL owner-only WhatsApp Cloud API typed operator adapter
After=network-online.target dial-chat-control.service dial-owner-steering.service
Wants=network-online.target dial-chat-control.service dial-owner-steering.service

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
Environment=DIAL_REPO_DIR=${REPO_DIR}
Environment=DIAL_CONTROL_HOME=${CONTROL_HOME}
Environment=DIAL_WHATSAPP_OPERATOR_HOST=127.0.0.1
Environment=DIAL_WHATSAPP_OPERATOR_PORT=9132
Environment=HERMES_HOME=${HERMES_HOME}
Environment=CODEX_HOME=${CODEX_HOME}
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=/usr/bin/node ${REPO_DIR}/agent-system/orchestration/whatsapp-operator-adapter.mjs serve
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadOnlyPaths=${REPO_DIR}
ReadWritePaths=${CONTROL_HOME} ${HERMES_HOME} ${CODEX_HOME} -${HOME}/.claude -${HOME}/.config/claude

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable dial-owner-steering.service dial-hermes-whatsapp-bridge.path dial-hermes-whatsapp-operator.service dial-whatsapp-cloud-operator.service >/dev/null
if [[ "$START_SERVICES" == 1 ]]; then
  systemctl --user restart dial-owner-steering.service dial-hermes-whatsapp-operator.service dial-whatsapp-cloud-operator.service
  if [[ -f "$HERMES_WA_SESSION/creds.json" ]]; then systemctl --user restart dial-hermes-whatsapp-bridge.service; fi
fi

# Register a local typed mutable MCP for the two supported development clients.
# This runs under the same Unix account as the DIAL control plane and does not
# place the chat-control bearer token in either client configuration.
if command -v codex >/dev/null 2>&1; then
  codex mcp remove dial-oracle-control >/dev/null 2>&1 || true
  codex mcp add dial-oracle-control \
    --env "DIAL_OPERATOR_CHANNEL=codex" \
    --env "DIAL_OPERATOR_ACTOR=owner" \
    --env "DIAL_REPO_DIR=${REPO_DIR}" \
    --env "DIAL_CONTROL_HOME=${CONTROL_HOME}" \
    -- node "${REPO_DIR}/agent-system/orchestration/operator-control-stdio.mjs" >/dev/null
fi
if command -v claude >/dev/null 2>&1; then
  claude mcp remove --scope local dial-oracle-control >/dev/null 2>&1 || true
  claude mcp add --scope local dial-oracle-control \
    -e "DIAL_OPERATOR_CHANNEL=claude" \
    -e "DIAL_OPERATOR_ACTOR=owner" \
    -e "DIAL_REPO_DIR=${REPO_DIR}" \
    -e "DIAL_CONTROL_HOME=${CONTROL_HOME}" \
    -- node "${REPO_DIR}/agent-system/orchestration/operator-control-stdio.mjs" >/dev/null
fi

echo "DIAL operator gateway installed."
echo "- Claude local MCP: dial-oracle-control (typed DIAL controls only)"
echo "- Codex local MCP: dial-oracle-control (typed DIAL controls only)"
echo "- Hermes WhatsApp self-chat: waits safely for owner pairing; run bash ${REPO_DIR}/deploy/oracle/hermes-codex/pair-hermes-whatsapp.sh --foreground when credentials are absent"
echo "- WhatsApp Cloud API: localhost:9132, remains UNCONFIGURED/DISABLED until secure Meta credentials are supplied"
echo "- No operator channel exposes shell or arbitrary filesystem execution"
