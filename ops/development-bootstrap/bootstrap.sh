#!/usr/bin/env bash
# Thin wrapper: all logic lives in bootstrap.mjs (Node 22+, no third-party dependencies).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v node >/dev/null 2>&1 || { echo "ERROR: node is required (>= 22)"; exit 1; }
major="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$major" -ge 22 ]] || { echo "ERROR: Node 22+ required; found $(node --version)"; exit 1; }
exec node "$HERE/bootstrap.mjs" "$@"
