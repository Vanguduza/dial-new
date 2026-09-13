#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
HERMES_HOME="${HERMES_HOME:-${HOME}/.hermes}"
HERMES_CONFIG="${HERMES_CONFIG:-${HERMES_HOME}/config.yaml}"
EXPECTED_HOST="${DIAL_HERMES_HOST_ID:-dial-hermes-control}"
COMMANDER_PKG='@wonderwhy-er/desktop-commander@0.2.50'

fail(){ echo "ERROR: $*" >&2; exit 1; }
[[ "$(hostname)" == "$EXPECTED_HOST" ]] || fail "must run on ${EXPECTED_HOST}; got $(hostname)"
command -v npx >/dev/null 2>&1 || fail "npx is required for local Desktop Commander MCP"
command -v python3 >/dev/null 2>&1 || fail "python3 is required"
[[ -f "$HERMES_CONFIG" ]] || fail "Hermes config missing: $HERMES_CONFIG"
[[ -f "$REPO_DIR/deploy/oracle/hermes-codex/install-operator-gateway.sh" ]] || fail "DIAL operator installer missing"

python3 - "$HERMES_CONFIG" "$COMMANDER_PKG" <<'PY'
import os, sys, tempfile, yaml
path, package = sys.argv[1:]
with open(path, encoding='utf-8') as f:
    cfg = yaml.safe_load(f) or {}
servers = cfg.setdefault('mcp_servers', {})
servers['dial_local_commander'] = {
    'command': 'npx',
    'args': ['-y', package],
    'enabled': True,
    'connect_timeout': 20,
    'timeout': 60,
    'supports_parallel_tool_calls': False,
    'tools': {
        'include': [
            'read_file', 'read_multiple_files', 'list_directory', 'get_file_info',
            'start_search', 'get_more_search_results', 'list_processes',
            'list_sessions', 'get_config'
        ],
        'resources': False,
        'prompts': False,
    },
}
parent = os.path.dirname(path)
fd, tmp = tempfile.mkstemp(prefix='.config.yaml.', dir=parent, text=True)
try:
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        yaml.safe_dump(cfg, f, sort_keys=False)
        f.flush(); os.fsync(f.fileno())
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)
finally:
    if os.path.exists(tmp): os.unlink(tmp)
PY

# Claude Code and Codex receive only the typed DIAL operator MCP. They do not
# receive a direct Desktop Commander registration. Hermes owns the subordinate
# local Commander toolset and therefore remains the mediation boundary.
bash "$REPO_DIR/deploy/oracle/hermes-codex/install-operator-gateway.sh"

echo 'Hermes local MCP plane installed.'
echo '- Claude Code -> dial-oracle-control (typed DIAL MCP)'
echo '- Codex       -> dial-oracle-control (typed DIAL MCP)'
echo '- Hermes      -> dial_local_commander (local read-only Desktop Commander MCP)'
echo '- oracle-admin remote Commander remains the independent recovery plane'
