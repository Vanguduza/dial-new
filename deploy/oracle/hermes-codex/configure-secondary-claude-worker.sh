#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${DIAL_REPO_DIR:-$(cd "$HERE/../../.." && pwd)}"
CONFIG_DIR="${DIAL_CLAUDE_SECONDARY_CONFIG_DIR:-/var/lib/dial-control/secrets/claude-worker-secondary}"
CLAUDE_BIN="${DIAL_CLAUDE_BIN:-claude}"
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"
export CLAUDE_CONFIG_DIR="$CONFIG_DIR"
case "${1:-status}" in
  status)
    exec "$CLAUDE_BIN" auth status
    ;;
  login)
    exec "$CLAUDE_BIN" auth login --claudeai
    ;;
  qualify)
    cd "$REPO_DIR"
    exec node agent-system/orchestration/claude-code-probe.mjs --secondary
    ;;
  *)
    echo "usage: configure-secondary-claude-worker.sh status|login|qualify" >&2
    exit 64
    ;;
esac
