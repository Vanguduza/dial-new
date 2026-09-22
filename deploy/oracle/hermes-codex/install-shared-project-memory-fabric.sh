#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
HERMES_CONFIG="${HERMES_CONFIG:-$HERMES_HOME/config.yaml}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
UNIT_DIR="$HOME/.config/systemd/user"
VAN_REPO="${VAN_REPO:-$HOME/Van}"
TRADING_WRAPPER="${DIAL_TRADING_COMMANDER_WRAPPER:-$VAN_REPO/deploy/van-trading-core/hermes/van-trading-full-commander-stdio.sh}"
START=1
[[ "${1:-}" == "--no-start" ]] && START=0

fail(){ echo "ERROR: $*" >&2; exit 1; }
[[ "$(hostname)" == "${DIAL_HERMES_HOST_ID:-dial-hermes-control}" ]] || fail "must run on dial-hermes-control"
for f in   "$REPO_DIR/agent-system/orchestration/shared-memory-mcp.mjs"   "$REPO_DIR/agent-system/orchestration/review-coordinator.mjs"   "$REPO_DIR/agent-system/registries/SHARED_PROJECT_MEMORY_FABRIC.json"; do
  [[ -f "$f" ]] || fail "missing SPMRF component: $f"
done
python3 -c 'import yaml' >/dev/null 2>&1 || fail "python3 PyYAML is required"
mkdir -p "$CONTROL_HOME/config" "$UNIT_DIR" "$HERMES_HOME" "$CODEX_HOME"
chmod 700 "$CONTROL_HOME/config" 2>/dev/null || true

cat > "$CONTROL_HOME/config/spmrf.env" <<ENV
DIAL_TRADING_COMMANDER_WRAPPER=$TRADING_WRAPPER
DIAL_REVIEW_COORDINATOR_INTERVAL_MS=15000
DIAL_REVIEW_CODEX_MODEL=gpt-5.6-sol
DIAL_REVIEW_CLAUDE_MODEL=claude-sonnet-5
ENV
chmod 600 "$CONTROL_HOME/config/spmrf.env"

python3 - "$CONTROL_HOME/config/project-repositories.json" "$REPO_DIR" "$VAN_REPO" <<'PY'
import json,os,sys
target,dial,van=sys.argv[1:4]
projects={
  'dial':{
    'path':os.path.realpath(dial),
    'origin_url':'https://github.com/Vanguduza/dial-new.git',
    'default_branch':'master',
    'authority_mode':'DIAL_PROJECT_TRUTH',
  }
}
if os.path.isdir(os.path.join(van,'.git')):
  projects['van']={
    'path':os.path.realpath(van),
    'origin_url':'https://github.com/Vanguduza/Van.git',
    'default_branch':'main',
    'authority_mode':'REPOSITORY_CANON',
  }
os.makedirs(os.path.dirname(target),exist_ok=True)
with open(target,'w',encoding='utf-8') as f:
  json.dump({'schema_version':1,'projects':projects},f,indent=2); f.write('\n')
os.chmod(target,0o600)
PY

# Register the common memory MCP with Hermes without reducing or changing the
# existing full Commander surfaces.
python3 - "$HERMES_CONFIG" "$REPO_DIR" "$CONTROL_HOME" <<'PY'
import os,sys,tempfile,yaml
path,repo,control=sys.argv[1:4]
cfg={}
if os.path.exists(path):
    with open(path,encoding='utf-8') as f: cfg=yaml.safe_load(f) or {}
servers=cfg.setdefault('mcp_servers',{})
servers['dial_shared_project_memory']={
    'command':'node',
    'args':[os.path.join(repo,'agent-system/orchestration/shared-memory-mcp.mjs')],
    'env':{
        'DIAL_REPO_DIR':repo,
        'DIAL_CONTROL_HOME':control,
        'DIAL_PROJECT_ID':'dial',
        'DIAL_HARNESS_ID':'hermes',
    },
    'enabled':True,
    'connect_timeout':20,
    'timeout':120,
    'supports_parallel_tool_calls':False,
}
os.makedirs(os.path.dirname(path),exist_ok=True)
fd,tmp=tempfile.mkstemp(prefix='.spmrf.',dir=os.path.dirname(path),text=True)
try:
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        yaml.safe_dump(cfg,f,sort_keys=False,width=1000000)
        f.flush(); os.fsync(f.fileno())
    os.chmod(tmp,0o600)
    os.replace(tmp,path)
finally:
    if os.path.exists(tmp): os.unlink(tmp)
PY

# Register the same model-neutral memory surface directly in the two local
# development harnesses. Account-native memory remains irrelevant to project truth.
if command -v codex >/dev/null 2>&1; then
  codex mcp remove dial-shared-project-memory >/dev/null 2>&1 || true
  codex mcp add dial-shared-project-memory     --env "DIAL_REPO_DIR=$REPO_DIR"     --env "DIAL_CONTROL_HOME=$CONTROL_HOME"     --env "DIAL_PROJECT_ID=dial"     --env "DIAL_HARNESS_ID=chatgpt-hermes"     -- node "$REPO_DIR/agent-system/orchestration/shared-memory-mcp.mjs" >/dev/null
fi
if command -v claude >/dev/null 2>&1; then
  claude mcp remove --scope user dial-shared-project-memory >/dev/null 2>&1 || true
  claude mcp add --scope user dial-shared-project-memory     -e "DIAL_REPO_DIR=$REPO_DIR"     -e "DIAL_CONTROL_HOME=$CONTROL_HOME"     -e "DIAL_PROJECT_ID=dial"     -e "DIAL_HARNESS_ID=claude-hermes"     -- node "$REPO_DIR/agent-system/orchestration/shared-memory-mcp.mjs" >/dev/null
fi

install -m 0644 "$REPO_DIR/deploy/oracle/hermes-codex/systemd/dial-review-coordinator.service" "$UNIT_DIR/dial-review-coordinator.service"
# Render path-sensitive unit values if the live checkout differs from the canonical path.
sed -i "s#/home/ubuntu/dial-new#$REPO_DIR#g; s#/var/lib/dial-control#$CONTROL_HOME#g" "$UNIT_DIR/dial-review-coordinator.service"

systemctl --user daemon-reload
systemctl --user enable dial-review-coordinator.service >/dev/null
if [[ "$START" == 1 ]]; then
  systemctl --user restart dial-review-coordinator.service
fi

echo "SPMRF_INSTALL=GREEN"
echo "hermes_mcp=dial_shared_project_memory"
echo "codex_mcp=dial-shared-project-memory"
echo "claude_mcp=dial-shared-project-memory"
if [[ -x "$TRADING_WRAPPER" ]]; then
  echo "trading_commander_wrapper=READY"
else
  echo "trading_commander_wrapper=PENDING:$TRADING_WRAPPER"
fi
