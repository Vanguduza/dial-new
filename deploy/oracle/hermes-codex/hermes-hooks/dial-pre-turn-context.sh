#!/usr/bin/env bash
set -euo pipefail

# Hermes pre_llm_call shell hook. Reads Hermes' event payload on stdin and emits
# only the directive JSON expected by Hermes on stdout.

DIAL_REPO_DIR="${DIAL_REPO_DIR:-/srv/dial/repo}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
export DIAL_REPO_DIR DIAL_CONTROL_HOME

PAYLOAD="$(mktemp)"
trap 'rm -f "$PAYLOAD"' EXIT
cat >"$PAYLOAD"

# Best-effort checkpoint refresh; never pollute hook stdout.
node "$DIAL_REPO_DIR/agent-system/orchestration/supervisor.mjs" capture \
  >/dev/null 2>>"$DIAL_CONTROL_HOME/events/pre-turn-hook.err" || true

exec node "$DIAL_REPO_DIR/agent-system/orchestration/context-broker.mjs" --hook <"$PAYLOAD"
