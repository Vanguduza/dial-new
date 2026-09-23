#!/usr/bin/env bash
set -euo pipefail

# Hermes pre_llm_call shell hook. Reads Hermes' event payload on stdin and emits
# only the directive JSON expected by Hermes on stdout.

DIAL_REPO_DIR="${DIAL_REPO_DIR:-/home/ubuntu/dial-new}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
export DIAL_REPO_DIR DIAL_CONTROL_HOME

PAYLOAD="$(mktemp)"
trap 'rm -f "$PAYLOAD"' EXIT
cat >"$PAYLOAD"

# Best-effort checkpoint refresh; never pollute hook stdout.
node "$DIAL_REPO_DIR/agent-system/orchestration/supervisor.mjs" capture \
  >/dev/null 2>>"$DIAL_CONTROL_HOME/events/pre-turn-hook.err" || true

# Resolve the common Hermes-owned project brain. The resolver returns a full
# capsule only when required; otherwise it sends the delta from this harness'
# last valid context fingerprint.
export DIAL_HARNESS_ID="${DIAL_HARNESS_ID:-chatgpt-hermes}"
export DIAL_PROJECT_ID="${DIAL_PROJECT_ID:-dial}"
exec node "$DIAL_REPO_DIR/agent-system/orchestration/shared-context-resolver.mjs" --hook <"$PAYLOAD"
