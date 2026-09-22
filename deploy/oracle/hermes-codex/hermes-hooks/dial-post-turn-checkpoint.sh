#!/usr/bin/env bash
set -euo pipefail

# Hermes post_llm_call observer. Never stores raw prompt/response text here;
# Hermes owns its own session DB. DIAL records only bounded provenance and Git state.

DIAL_REPO_DIR="${DIAL_REPO_DIR:-/home/ubuntu/dial-new}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
export DIAL_REPO_DIR DIAL_CONTROL_HOME

PAYLOAD="$(mktemp)"
trap 'rm -f "$PAYLOAD"' EXIT
cat >"$PAYLOAD"

node "$DIAL_REPO_DIR/agent-system/orchestration/supervisor.mjs" capture \
  >/dev/null 2>>"$DIAL_CONTROL_HOME/events/post-turn-hook.err" || true

# Publish a cross-harness review checkpoint only when HEAD advanced and the
# worktree is clean. This prevents live-keystroke noise while keeping commit
# checkpoints effectively real-time.
DIAL_HARNESS_ID="${DIAL_HARNESS_ID:-chatgpt-hermes}" \
DIAL_PROJECT_ID="${DIAL_PROJECT_ID:-dial}" \
DIAL_CHECKPOINT_SUMMARY="Hermes post-turn checkpoint" \
node "$DIAL_REPO_DIR/agent-system/orchestration/review-fabric.mjs" publish-if-changed \
  >/dev/null 2>>"$DIAL_CONTROL_HOME/events/post-turn-review.err" || true

if command -v jq >/dev/null 2>&1; then
  jq -c '{
    event:"HERMES_POST_LLM",
    session_id:(.session_id // null),
    task_id:(.task_id // null),
    turn_id:(.turn_id // null),
    model:(.model // null),
    platform:(.platform // null),
    observed_at:(now | todateiso8601)
  }' "$PAYLOAD" >>"$DIAL_CONTROL_HOME/events/hermes-turns.jsonl" 2>/dev/null || true
fi

printf '{}\n'
