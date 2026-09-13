#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
HERMES_CONFIG="${HERMES_CONFIG:-${HOME}/.hermes/config.yaml}"
fail(){ echo "QUALIFICATION RED: $*" >&2; exit 1; }
pass(){ echo "✓ $*"; }

[[ "$(hostname)" == "${DIAL_HERMES_HOST_ID:-dial-hermes-control}" ]] || fail "wrong host"
[[ -f "$HERMES_CONFIG" ]] || fail "Hermes config missing"

python3 - "$HERMES_CONFIG" <<'PY' || exit 1
import sys, yaml
cfg=yaml.safe_load(open(sys.argv[1],encoding='utf-8')) or {}
server=(cfg.get('mcp_servers') or {}).get('dial_local_commander') or {}
assert server.get('command') == 'npx', server
assert server.get('args') == ['-y','@wonderwhy-er/desktop-commander@0.2.50'], server
assert server.get('enabled') is True, server
assert server.get('supports_parallel_tool_calls') is False, server
include=set((server.get('tools') or {}).get('include') or [])
required={'read_file','read_multiple_files','list_directory','get_file_info','start_search','get_more_search_results','list_processes','list_sessions','get_config'}
forbidden={'start_process','interact_with_process','write_file','edit_block','move_file','set_config_value','kill_process','shutdown'}
assert required <= include, (required-include)
assert not (forbidden & include), (forbidden & include)
assert (server.get('tools') or {}).get('resources') is False
assert (server.get('tools') or {}).get('prompts') is False
PY
pass "Hermes owns a pinned read-only local Desktop Commander MCP surface"

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

echo '{"status":"GREEN","topology":"HERMES_LOCAL_DEVELOPMENT_PLUS_ORACLE_ADMIN_RECOVERY","commander":"HERMES_SUBORDINATE_READ_ONLY","codex":"DIAL_MCP","claude":"DIAL_MCP"}'
