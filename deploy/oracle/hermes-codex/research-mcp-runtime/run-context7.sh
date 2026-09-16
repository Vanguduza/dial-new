#!/usr/bin/env bash
set -euo pipefail
RUNTIME="${DIAL_RESEARCH_MCP_RUNTIME_DIR:-$HOME/.local/lib/dial-research-mcp-runtime}"
BIN="$RUNTIME/node_modules/.bin/context7-mcp"
[[ -x "$BIN" ]] || { echo "DIAL Context7 runtime not installed; run install-research-mcp.sh" >&2; exit 78; }
if [[ "${1:-}" == "--version" ]]; then exec "$BIN" --version; fi
KEY_FILE="${DIAL_CONTEXT7_API_KEY_FILE:-/var/lib/dial-control/secrets/context7-api.key}"
if [[ -z "${CONTEXT7_API_KEY:-}" && -r "$KEY_FILE" ]]; then export CONTEXT7_API_KEY="$(cat "$KEY_FILE")"; fi
exec "$BIN" --transport stdio "$@"
