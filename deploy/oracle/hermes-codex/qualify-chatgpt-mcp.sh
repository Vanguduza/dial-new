#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
BRIDGE="${REPO_DIR}/agent-system/orchestration/chat-control-bridge.mjs"
TEST="${REPO_DIR}/tests/chatgpt-operator-channel.test.mjs"
TOKEN_PATH="${CONTROL_HOME}/secrets/chat-control.token"

pass(){ printf 'PASS  %s\n' "$*"; }
fail(){ printf 'FAIL  %s\n' "$*" >&2; exit 1; }

[[ -f "$BRIDGE" ]] || fail "chat-control bridge exists"
node --check "$BRIDGE" >/dev/null || fail "chat-control bridge syntax"
pass "chat-control bridge syntax"

grep -q "'chatgpt'" "$BRIDGE" || fail "chatgpt operator channel registered"
grep -q "CHATGPT_MCP_PATH = '/mcp/chatgpt'" "$BRIDGE" || fail "dedicated ChatGPT path registered"
grep -q "transport: 'chatgpt_http_mcp'" "$BRIDGE" || fail "ChatGPT transport provenance bound"
pass "ChatGPT route and provenance binding"

# Reject accidental generic execution surface additions.
TOOLS_JSON="$(node "$BRIDGE" tools)"
if grep -Eqi '"name"[[:space:]]*:[[:space:]]*"(shell|exec|execute|filesystem|fs|command|terminal)' <<<"$TOOLS_JSON"; then
  fail "generic shell/filesystem tool exposed"
fi
pass "typed DIAL-only tool surface"

[[ -f "$TEST" ]] || fail "ChatGPT operator integration test exists"
if command -v npx >/dev/null 2>&1; then
  (cd "$REPO_DIR" && npx vitest run tests/chatgpt-operator-channel.test.mjs) || fail "ChatGPT operator integration test"
  pass "ChatGPT operator integration test"
else
  fail "npx unavailable; cannot execute ChatGPT operator integration test"
fi

if [[ -e "$TOKEN_PATH" ]]; then
  [[ -s "$TOKEN_PATH" ]] || fail "chat-control token is empty"
  MODE="$(stat -c '%a' "$TOKEN_PATH")"
  [[ "$MODE" == "600" ]] || fail "chat-control token mode is $MODE, expected 600"
  pass "chat-control token mode 0600"
else
  printf 'INFO  token not present in this environment; live installer must create it before deployment certification\n'
fi

if systemctl --user status dial-chat-control.service >/dev/null 2>&1; then
  systemctl --user is-active --quiet dial-chat-control.service || fail "dial-chat-control service installed but inactive"
  pass "dial-chat-control service active"
else
  printf 'INFO  dial-chat-control.service is not installed in this environment; repository qualification only\n'
fi

printf '\nChatGPT MCP repository qualification: PASS\n'
printf 'External enrollment remains separate: private HTTPS ingress + supported ChatGPT custom MCP app + live tool scan/call evidence.\n'
