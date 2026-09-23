#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
TRADING_HOST="${VAN_TRADING_COMMANDER_HOST:-van-trading-core}"
TRADING_USER="${VAN_TRADING_COMMANDER_USER:-ubuntu}"
AUTHORIZED="$HOME/.ssh/authorized_keys"
BIN_DIR="$HOME/.local/bin"

fail(){ echo "ERROR: $*" >&2; exit 1; }
[[ "$(hostname)" == "${DIAL_HERMES_HOST_ID:-dial-control}" ]] || fail "must run on dial-control"
[[ -f "$REPO_DIR/agent-system/orchestration/shared-memory-mcp.mjs" ]] || fail "shared-memory-mcp missing"
mkdir -p "$HOME/.ssh" "$BIN_DIR"
chmod 700 "$HOME/.ssh"
touch "$AUTHORIZED"; chmod 600 "$AUTHORIZED"

cat > "$BIN_DIR/dial-shared-memory-peer-chatgpt" <<WRAP
#!/usr/bin/env bash
set -euo pipefail
unset OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
export DIAL_REPO_DIR="$REPO_DIR"
export DIAL_CONTROL_HOME="$CONTROL_HOME"
export DIAL_PROJECT_ID=dial
export DIAL_HARNESS_ID=chatgpt-trading
exec node "$REPO_DIR/agent-system/orchestration/shared-memory-mcp.mjs"
WRAP
cat > "$BIN_DIR/dial-shared-memory-peer-claude" <<WRAP
#!/usr/bin/env bash
set -euo pipefail
unset OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
export DIAL_REPO_DIR="$REPO_DIR"
export DIAL_CONTROL_HOME="$CONTROL_HOME"
export DIAL_PROJECT_ID=dial
export DIAL_HARNESS_ID=claude-trading
exec node "$REPO_DIR/agent-system/orchestration/shared-memory-mcp.mjs"
WRAP
chmod 0755 "$BIN_DIR/dial-shared-memory-peer-chatgpt" "$BIN_DIR/dial-shared-memory-peer-claude"

fetch_key() {
  local kind="$1"
  ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes "$TRADING_USER@$TRADING_HOST"     "cat ~/.ssh/van-spmrf-$kind.pub"
}
chatgpt_key="$(fetch_key chatgpt)" || fail "could not retrieve Trading Core ChatGPT SPMRF public key over trusted admin SSH"
claude_key="$(fetch_key claude)" || fail "could not retrieve Trading Core Claude SPMRF public key over trusted admin SSH"
[[ "$chatgpt_key" == ssh-ed25519* ]] || fail "invalid ChatGPT SPMRF public key"
[[ "$claude_key" == ssh-ed25519* ]] || fail "invalid Claude SPMRF public key"

tmp="$(mktemp)"
grep -vE 'van-spmrf-(chatgpt|claude)([[:space:]]|$)' "$AUTHORIZED" > "$tmp" || true
printf 'restrict,command="%s" %s\n' "$BIN_DIR/dial-shared-memory-peer-chatgpt" "$chatgpt_key" >> "$tmp"
printf 'restrict,command="%s" %s\n' "$BIN_DIR/dial-shared-memory-peer-claude" "$claude_key" >> "$tmp"
install -m 0600 "$tmp" "$AUTHORIZED"
rm -f "$tmp"

echo "SPMRF_TRADING_PEER=GREEN"
echo "chatgpt_peer=forced-command shared memory MCP"
echo "claude_peer=forced-command shared memory MCP"
