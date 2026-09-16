#!/usr/bin/env bash
set -euo pipefail
RUNTIME="${DIAL_RESEARCH_MCP_RUNTIME_DIR:-$HOME/.local/lib/dial-research-mcp-runtime}"
BIN="$RUNTIME/node_modules/.bin/exa-mcp-server"
PKG="$RUNTIME/node_modules/exa-mcp-server/package.json"
[[ -x "$BIN" && -r "$PKG" ]] || { echo "DIAL Exa runtime not installed; run install-research-mcp.sh" >&2; exit 78; }
if [[ "${1:-}" == "--version" ]]; then node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).version)' "$PKG"; exit 0; fi
KEY_FILE="${DIAL_EXA_API_KEY_FILE:-/var/lib/dial-control/secrets/exa-api.key}"
if [[ -z "${EXA_API_KEY:-}" && -r "$KEY_FILE" ]]; then export EXA_API_KEY="$(cat "$KEY_FILE")"; fi
[[ -n "${EXA_API_KEY:-}" ]] || { echo "Exa API key is required for local Exa MCP; expected secure env or $KEY_FILE" >&2; exit 77; }
export ENABLED_TOOLS="${ENABLED_TOOLS:-web_search_exa,web_fetch_exa}"
exec "$BIN" "$@"
