#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME="${DIAL_RESEARCH_MCP_RUNTIME_DIR:-$HOME/.local/lib/dial-research-mcp-runtime}"
BRIDGE="$HERE/exa-remote-stdio-bridge.mjs"
[[ -r "$BRIDGE" ]] || BRIDGE="$RUNTIME/exa-remote-stdio-bridge.mjs"
[[ -r "$BRIDGE" ]] || { echo "DIAL Exa remote MCP bridge missing; run install-research-mcp.sh" >&2; exit 78; }
if [[ "${1:-}" == "--version" ]]; then echo 'dial-exa-remote-bridge/1'; exit 0; fi
exec node "$BRIDGE" "$@"
