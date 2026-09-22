#!/usr/bin/env bash
set -euo pipefail

# Hermes pre_tool_call blocking hook. The DIAL Hermes installation is always a
# governed session: material tool use must carry packet authority, and project
# mutation must be delegated into a Task Execution Envelope/worktree lease.

DIAL_REPO_DIR="${DIAL_REPO_DIR:-/home/ubuntu/dial-new}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
export DIAL_REPO_DIR DIAL_CONTROL_HOME
export DIAL_GOVERNED_SESSION=1

exec node "$DIAL_REPO_DIR/agent-system/hooks/pre-tool-guard.mjs"
