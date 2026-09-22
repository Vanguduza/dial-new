#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
START_SERVICES=1
if [[ "${1:-}" == "--no-start" ]]; then START_SERVICES=0; fi

fail(){ echo "ERROR: $*" >&2; exit 1; }
BRIDGE="${REPO_DIR}/agent-system/orchestration/chat-control-bridge.mjs"
INSTALLER="${REPO_DIR}/deploy/oracle/hermes-codex/install-chat-control-bridge.sh"
TOKEN_PATH="${CONTROL_HOME}/secrets/chat-control.token"

[[ -f "$BRIDGE" ]] || fail "chat-control-bridge.mjs missing"
[[ -f "$INSTALLER" ]] || fail "install-chat-control-bridge.sh missing"

grep -q "CHATGPT_MCP_PATH = '/mcp/chatgpt'" "$BRIDGE" || fail "dedicated ChatGPT MCP path missing"
grep -q "channel: 'chatgpt'" "$BRIDGE" || fail "ChatGPT operator provenance binding missing"

if [[ "$START_SERVICES" == 1 ]]; then
  bash "$INSTALLER"
else
  bash "$INSTALLER" --no-start
fi

# Ensure the shared DIAL operator bearer exists, but never print it.
node "$BRIDGE" token-init >/dev/null
[[ -s "$TOKEN_PATH" ]] || fail "chat-control bearer token missing"
chmod 600 "$TOKEN_PATH"
MODE="$(stat -c '%a' "$TOKEN_PATH")"
[[ "$MODE" == "600" ]] || fail "chat-control token mode is $MODE, expected 600"

if [[ "$START_SERVICES" == 1 ]]; then
  systemctl --user is-active --quiet dial-chat-control.service || fail "dial-chat-control.service is not active"
fi

echo "ChatGPT MCP adapter repository-side activation is ready."
echo "- Local MCP route: http://127.0.0.1:9130/mcp/chatgpt"
echo "- Operator identity: chatgpt / owner / chatgpt_http_mcp"
echo "- Bearer token: present at ${TOKEN_PATH} with mode 0600 (not printed)"
echo "- Port 9130 MUST remain loopback-only."
echo "- Remote ChatGPT access requires a private authenticated HTTPS ingress routing only /mcp/chatgpt."
echo "- ChatGPT product enrollment is a separate external gate; do not mark READY until the client scans and calls the route successfully."
