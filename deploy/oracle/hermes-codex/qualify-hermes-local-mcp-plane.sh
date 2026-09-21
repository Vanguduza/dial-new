#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
HERMES_CONFIG="${HERMES_CONFIG:-${HOME}/.hermes/config.yaml}"
fail(){ echo "QUALIFICATION RED: $*" >&2; exit 1; }
pass(){ echo "✓ $*"; }

[[ "$(hostname)" == "${DIAL_HERMES_HOST_ID:-dial-hermes-control}" ]] || fail "wrong host"
[[ -f "$HERMES_CONFIG" ]] || fail "Hermes config missing"

python3 - "$HERMES_CONFIG" <<'PY' || exit 1
import os, sys, yaml
cfg=yaml.safe_load(open(sys.argv[1],encoding='utf-8')) or {}
server=(cfg.get('mcp_servers') or {}).get('dial_local_commander') or {}
expected=os.path.expanduser('~/.local/bin/dial-local-commander-mcp')
assert server.get('command') == expected, server
assert server.get('args') == [], server
assert server.get('enabled') is True, server
assert server.get('supports_parallel_tool_calls') is False, server
assert server.get('timeout') == 600, server
tools=server.get('tools')
assert tools in (None, {}), 'Hermes Commander must not carry a tool allowlist/filter'
PY
pass "Hermes owns the pinned FULL local Desktop Commander MCP surface without a capability filter"

FULL_PROBE="$(node "$REPO_DIR/deploy/oracle/hermes-codex/probe-full-local-commander.mjs" 2>&1)" || { echo "$FULL_PROBE" >&2; fail "live full Commander tools/list probe failed"; }
grep -q '"status": "GREEN"' <<<"$FULL_PROBE" || { echo "$FULL_PROBE" >&2; fail "Commander did not expose the required full tool surface"; }
pass "Live Commander tools/list proves process, mutation, configuration and inspection capabilities"

GATEWAY_UNIT="$(systemctl --user list-units --type=service --all --no-legend 2>/dev/null | awk 'tolower($1) ~ /hermes.*gateway|gateway.*hermes/ {print $1; exit}')"
[[ -n "$GATEWAY_UNIT" ]] || fail "Hermes gateway unit not found"
systemctl --user is-active --quiet "$GATEWAY_UNIT" || fail "Hermes gateway inactive"
FOUND_CHILD=0
while read -r pid; do
  [[ -n "$pid" ]] || continue
  if grep -q "$GATEWAY_UNIT" "/proc/$pid/cgroup" 2>/dev/null; then FOUND_CHILD=1; break; fi
done < <(pgrep -f 'desktop-commander' || true)
[[ "$FOUND_CHILD" -eq 1 ]] || fail "no Desktop Commander child process is owned by the Hermes gateway cgroup"
pass "Hermes gateway actually spawned the subordinate Commander child"

# The owner-facing online Commander is an ingress transport into Hermes and is
# intentionally allowed to coexist with the Hermes-owned local child Commander.
if systemctl --user is-active --quiet dial-owner-commander-remote.service 2>/dev/null; then
  pass "Owner-facing remote Commander transport is active alongside the Hermes subordinate"
else
  echo "NOTE: dial-owner-commander-remote.service is not active (pairing may still be pending)." >&2
fi

CODEX_MCP="$(codex mcp get dial-oracle-control 2>&1 || true)"
grep -q 'operator-control-stdio.mjs' <<<"$CODEX_MCP" || fail "Codex DIAL MCP missing"
CLAUDE_MCP="$(claude mcp get dial-oracle-control 2>&1 || true)"
grep -q 'operator-control-stdio.mjs' <<<"$CLAUDE_MCP" || fail "Claude Code DIAL MCP missing"
pass "Codex and Claude Code share the typed local DIAL MCP"

if codex mcp list 2>&1 | grep -qi 'desktop-commander'; then fail "Codex must not connect directly to Desktop Commander"; fi
if claude mcp list 2>&1 | grep -qi 'desktop-commander'; then fail "Claude Code must not connect directly to Desktop Commander"; fi
pass "No direct Codex/Claude Commander bypass exists"

HEALTH="$(curl -fsS http://127.0.0.1:9130/health)"
jq -e '.service == "dial-chat-control" and .project == "dial" and .state == "UP"' <<<"$HEALTH" >/dev/null || fail "local DIAL HTTP MCP unhealthy"
pass "Hermes host-local DIAL MCP is healthy"

node "$REPO_DIR/agent-system/orchestration/operator-control-stdio.mjs" <<<'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' | grep -q 'dial-oracle-control' || fail "stdio DIAL MCP initialize failed"
pass "stdio DIAL MCP initializes locally"

echo '{"status":"GREEN","topology":"MOBILE_CHATGPT_TO_OWNER_COMMANDER_TO_HERMES_TO_FULL_LOCAL_COMMANDER","commander":"HERMES_SUBORDINATE_FULL","codex":"DIAL_MCP","claude":"DIAL_MCP","recovery":"GITHUB_OCI_OUT_OF_BAND"}'
