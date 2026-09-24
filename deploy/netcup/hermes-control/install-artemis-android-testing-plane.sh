#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
ARTEMIS_COMMIT="371aa6df56880643da57b30da936e9812fb0ec66"
ARTEMIS_LOCK_BLOB="dc2d35b8c284055c92ff1cd2560c8201e648bf9f"
ARTEMIS_ROOT="/opt/hermes-mobile-fabric/artemis"
ARTEMIS_DIR="$ARTEMIS_ROOT/$ARTEMIS_COMMIT"
UV_VERSION="0.12.18"
UV_ASSET="uv-x86_64-unknown-linux-gnu.tar.gz"
UNIT_DIR="$HOME/.config/systemd/user"
ARTEMIS_UI_PORT="${DIAL_ARTEMIS_UI_PORT:-9146}"
ARTEMIS_CONSOLE_PORT="${DIAL_ARTEMIS_CONSOLE_PORT:-9135}"
ARTEMIS_CONSOLE_TOKEN_FILE="$CONTROL_HOME/secrets/artemis-console.token"

fail(){ echo "ERROR: $*" >&2; exit 1; }
[[ "$(hostname)" == "dial-control" ]] || fail "must run on Netcup dial-control"
[[ "$(uname -m)" == "x86_64" ]] || fail "this qualified installer is x86_64 only"
for cmd in git gh python3 adb scrcpy ffmpeg node openssl curl; do command -v "$cmd" >/dev/null 2>&1 || fail "required host dependency missing: $cmd"; done
NODE_BIN="$(command -v node)"
[[ -x "$NODE_BIN" ]] || fail "resolved node binary is not executable: $NODE_BIN"
python3 -c 'import sys; assert sys.version_info >= (3,12)' || fail "Python 3.12+ required"

sudo install -d -m 0755 /opt/hermes-mobile-fabric "$ARTEMIS_ROOT"
mkdir -p "$CONTROL_HOME/config" "$CONTROL_HOME/secrets" "$CONTROL_HOME/android-testing/evidence" "$CONTROL_HOME/android-testing/leases" "$CONTROL_HOME/android-testing/tasks" "$CONTROL_HOME/android-testing/observations" "$UNIT_DIR"
chmod 700 "$CONTROL_HOME/secrets" "$CONTROL_HOME/android-testing" "$CONTROL_HOME/android-testing/evidence" "$CONTROL_HOME/android-testing/leases" "$CONTROL_HOME/android-testing/tasks" "$CONTROL_HOME/android-testing/observations" 2>/dev/null || true

install_uv(){
  if command -v uv >/dev/null 2>&1 && [[ "$(uv --version 2>/dev/null | awk '{print $2}')" == "$UV_VERSION" ]]; then return 0; fi
  local tmp; tmp="$(mktemp -d)"
  local cleanup_dir="$tmp"
  gh release download "$UV_VERSION" --repo astral-sh/uv --pattern "$UV_ASSET" --dir "$tmp"
  gh attestation verify "$tmp/$UV_ASSET" --repo astral-sh/uv >/dev/null
  tar -xzf "$tmp/$UV_ASSET" -C "$tmp"
  local bin; bin="$(find "$tmp" -type f -name uv -perm -u+x | head -1)"
  [[ -n "$bin" ]] || fail "uv binary missing from verified release"
  sudo install -m 0755 "$bin" /usr/local/bin/uv
  [[ "$(uv --version | awk '{print $2}')" == "$UV_VERSION" ]] || fail "uv version mismatch after install"
  rm -rf "$cleanup_dir"
}
install_uv

if [[ ! -d "$ARTEMIS_DIR/.git" ]]; then
  tmp="$(mktemp -d)"
  git -C "$tmp" init -q
  git -C "$tmp" remote add origin https://github.com/google/artemis.git
  git -C "$tmp" fetch --depth=1 origin "$ARTEMIS_COMMIT"
  git -C "$tmp" checkout -q --detach FETCH_HEAD
  [[ "$(git -C "$tmp" rev-parse HEAD)" == "$ARTEMIS_COMMIT" ]] || fail "ARTEMIS commit pin mismatch"
  [[ "$(git -C "$tmp" hash-object uv.lock)" == "$ARTEMIS_LOCK_BLOB" ]] || fail "ARTEMIS uv.lock blob mismatch"
  python3 "$REPO_DIR/deploy/netcup/hermes-control/artemis/harden_artemis.py" "$tmp"
  (cd "$tmp" && uv sync --frozen --no-dev)
  sudo rm -rf "$ARTEMIS_DIR"
  sudo mv "$tmp" "$ARTEMIS_DIR"
  sudo chown -R "$USER":"$(id -gn)" "$ARTEMIS_DIR"
else
  [[ "$(git -C "$ARTEMIS_DIR" rev-parse HEAD)" == "$ARTEMIS_COMMIT" ]] || fail "existing ARTEMIS checkout pin mismatch"
  [[ "$(git -C "$ARTEMIS_DIR" hash-object uv.lock)" == "$ARTEMIS_LOCK_BLOB" ]] || fail "existing ARTEMIS lock mismatch"
  python3 "$REPO_DIR/deploy/netcup/hermes-control/artemis/harden_artemis.py" "$ARTEMIS_DIR"
  (cd "$ARTEMIS_DIR" && uv sync --frozen --no-dev)
fi
sudo ln -sfn "$ARTEMIS_DIR" "$ARTEMIS_ROOT/current"

"$ARTEMIS_DIR/.venv/bin/python" -m py_compile "$REPO_DIR/deploy/netcup/hermes-control/artemis/dial_artemis_mcp_bridge.py"
node --check "$REPO_DIR/agent-system/orchestration/artemis-subordinate-client.mjs"
node --check "$REPO_DIR/agent-system/orchestration/android-testing-plane.mjs"
node --check "$REPO_DIR/agent-system/orchestration/android-testing-mcp.mjs"
node --check "$REPO_DIR/agent-system/orchestration/android-testing-supervisor.mjs"
node --check "$REPO_DIR/agent-system/orchestration/artemis-console-proxy.mjs"

if [[ ! -s "$ARTEMIS_CONSOLE_TOKEN_FILE" ]]; then
  umask 077
  openssl rand -hex 32 > "$ARTEMIS_CONSOLE_TOKEN_FILE"
fi
chmod 600 "$ARTEMIS_CONSOLE_TOKEN_FILE"

if [[ ! -s "$CONTROL_HOME/config/android-testing-devices.json" ]]; then
  cat > "$CONTROL_HOME/config/android-testing-devices.json" <<'JSON'
{
  "schema_version": 2,
  "authority": "OWNER_ADMISSION_REQUIRED",
  "devices": [],
  "avds": []
}
JSON
  chmod 600 "$CONTROL_HOME/config/android-testing-devices.json"
fi

cat > "$UNIT_DIR/dial-artemis-supervisor.service" <<UNIT
[Unit]
Description=DIAL Hermes ARTEMIS subordinate task supervisor
After=network-online.target

[Service]
Type=oneshot
Environment=DIAL_CONTROL_HOME=$CONTROL_HOME
Environment=DIAL_REPO_DIR=$REPO_DIR
Environment=DIAL_ARTEMIS_ROOT=$ARTEMIS_DIR
Environment=DIAL_ARTEMIS_BIN=$ARTEMIS_DIR/.venv/bin/artemis
Environment=DIAL_ARTEMIS_PYTHON=$ARTEMIS_DIR/.venv/bin/python
Environment=DIAL_ARTEMIS_BRIDGE=$REPO_DIR/deploy/netcup/hermes-control/artemis/dial_artemis_mcp_bridge.py
Environment=DIAL_ADB_BIN=adb
ExecStart=$NODE_BIN $REPO_DIR/agent-system/orchestration/android-testing-supervisor.mjs
UNIT

cat > "$UNIT_DIR/dial-artemis-supervisor.timer" <<UNIT
[Unit]
Description=Poll Hermes-owned ARTEMIS tasks and seal terminal evidence

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s
AccuracySec=10s
Persistent=true
Unit=dial-artemis-supervisor.service

[Install]
WantedBy=timers.target
UNIT

python3 - "$HOME/.hermes/config.yaml" "$REPO_DIR" "$CONTROL_HOME" "$ARTEMIS_DIR" <<'PY'
import os,sys,tempfile,yaml
path,repo,control,artemis=sys.argv[1:5]
cfg={}
if os.path.exists(path):
    with open(path,encoding='utf-8') as f: cfg=yaml.safe_load(f) or {}
servers=cfg.setdefault('mcp_servers',{})
servers['dial_android_testing']={
    'command':'node',
    'args':[os.path.join(repo,'agent-system/orchestration/android-testing-mcp.mjs')],
    'env':{
        'DIAL_REPO_DIR':repo,
        'DIAL_CONTROL_HOME':control,
        'DIAL_PROJECT_ID':'dial',
        'DIAL_HARNESS_ID':'hermes',
        'DIAL_ARTEMIS_BIN':os.path.join(artemis,'.venv/bin/artemis'),
        'DIAL_ARTEMIS_ROOT':artemis,
        'DIAL_ARTEMIS_PYTHON':os.path.join(artemis,'.venv/bin/python'),
        'DIAL_ARTEMIS_BRIDGE':os.path.join(repo,'deploy/netcup/hermes-control/artemis/dial_artemis_mcp_bridge.py'),
        'DIAL_ADB_BIN':'adb',
    },
    'enabled':True,
    'connect_timeout':20,
    'timeout':2700,
    'supports_parallel_tool_calls':False,
}
os.makedirs(os.path.dirname(path),exist_ok=True)
fd,tmp=tempfile.mkstemp(prefix='.android-testing.',dir=os.path.dirname(path),text=True)
try:
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        yaml.safe_dump(cfg,f,sort_keys=False,width=1000000); f.flush(); os.fsync(f.fileno())
    os.chmod(tmp,0o600); os.replace(tmp,path)
finally:
    if os.path.exists(tmp): os.unlink(tmp)
PY

CONSOLE_BIND="${DIAL_ARTEMIS_CONSOLE_BIND:-${DIAL_PRIVATE_MCP_BIND:-${DIAL_CONTROL_OVERLAY_IP:-}}}"
if [[ -z "$CONSOLE_BIND" && -s "$CONTROL_HOME/config/development-network.env" ]]; then
  # shellcheck disable=SC1090
  source "$CONTROL_HOME/config/development-network.env"
  CONSOLE_BIND="${DIAL_ARTEMIS_CONSOLE_BIND:-${DIAL_PRIVATE_MCP_BIND:-${DIAL_CONTROL_OVERLAY_IP:-}}}"
fi
CONSOLE_BIND="${CONSOLE_BIND:-127.0.0.1}"

cat > "$UNIT_DIR/dial-artemis-ui.service" <<UNIT
[Unit]
Description=ARTEMIS loopback web observation console subordinate to DIAL Hermes
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ARTEMIS_DIR
Environment=ARTEMIS_STANDALONE=1
Environment=ARTEMIS_TASK_INGRESS=dial-hermes-subordinate
Environment=ARTEMIS_SERVER_HOST=127.0.0.1
Environment=ANTIGRAVITY_SIDECAR_WEB_PORT=$ARTEMIS_UI_PORT
ExecStart=$ARTEMIS_DIR/.venv/bin/python -m apps.admin_console.server --host 127.0.0.1 --port $ARTEMIS_UI_PORT
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
UNIT

cat > "$UNIT_DIR/dial-artemis-console-proxy.service" <<UNIT
[Unit]
Description=Hermes-authenticated ARTEMIS console proxy for VAN
After=network-online.target dial-artemis-ui.service
Wants=network-online.target dial-artemis-ui.service

[Service]
Type=simple
WorkingDirectory=$REPO_DIR
Environment=DIAL_ARTEMIS_CONSOLE_BIND=$CONSOLE_BIND
Environment=DIAL_ARTEMIS_CONSOLE_PORT=$ARTEMIS_CONSOLE_PORT
Environment=DIAL_ARTEMIS_UI_UPSTREAM=http://127.0.0.1:$ARTEMIS_UI_PORT
Environment=DIAL_ARTEMIS_CONSOLE_TOKEN_FILE=$ARTEMIS_CONSOLE_TOKEN_FILE
ExecStart=$NODE_BIN $REPO_DIR/agent-system/orchestration/artemis-console-proxy.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadOnlyPaths=$REPO_DIR $ARTEMIS_DIR $ARTEMIS_CONSOLE_TOKEN_FILE
ReadWritePaths=$CONTROL_HOME

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now dial-artemis-ui.service dial-artemis-console-proxy.service dial-artemis-supervisor.timer >/dev/null

for unit in dial-artemis-ui.service dial-artemis-console-proxy.service dial-artemis-supervisor.timer; do
  systemctl --user is-active --quiet "$unit" || {
    systemctl --user --no-pager --full status "$unit" >&2 || true
    fail "$unit did not become active"
  }
done

ui_ready=0
for _ in $(seq 1 60); do
  if curl --fail --silent --show-error --max-time 2 "http://127.0.0.1:$ARTEMIS_UI_PORT/" >/dev/null 2>&1; then
    ui_ready=1
    break
  fi
  sleep 2
done
[[ "$ui_ready" == 1 ]] || {
  systemctl --user --no-pager --full status dial-artemis-ui.service >&2 || true
  fail "ARTEMIS loopback UI did not become healthy"
}

proxy_ready=0
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 2 "http://$CONSOLE_BIND:$ARTEMIS_CONSOLE_PORT/health" >/dev/null 2>&1; then
    proxy_ready=1
    break
  fi
  sleep 1
done
[[ "$proxy_ready" == 1 ]] || {
  systemctl --user --no-pager --full status dial-artemis-console-proxy.service >&2 || true
  fail "ARTEMIS VAN console proxy did not become healthy"
}
echo "ARTEMIS_CONSOLE_HEALTH=GREEN"

node "$REPO_DIR/agent-system/orchestration/android-testing-mcp.mjs" </dev/null >/dev/null 2>&1 || true
echo "ARTEMIS_INSTALL=GREEN"
echo "ARTEMIS_COMMIT=$ARTEMIS_COMMIT"
echo "ARTEMIS_LOCK_BLOB=$ARTEMIS_LOCK_BLOB"
echo "ARTEMIS_ROLE=HERMES_SUBORDINATE_ANDROID_EXECUTOR"
echo "RAW_ARTEMIS_MCP=NOT_EXPOSED"
echo "ARTEMIS_RAW_DIRECT_CONSOLE=NOT_EXPOSED"
echo "ARTEMIS_VAN_CONSOLE_PROXY=ENABLED_HERMES_GOVERNED_CONTROL"
echo "ARTEMIS_CONSOLE_BIND=$CONSOLE_BIND:$ARTEMIS_CONSOLE_PORT"
echo "ARTEMIS_CONSOLE_TOKEN_FILE=$ARTEMIS_CONSOLE_TOKEN_FILE"
echo "HERMES_MCP=dial_android_testing"
echo "ARTEMIS_SUPERVISOR_TIMER=dial-artemis-supervisor.timer"
echo "DEVICE_ADMISSION_FILE=$CONTROL_HOME/config/android-testing-devices.json"
admitted_count="$(python3 - "$CONTROL_HOME/config/android-testing-devices.json" <<'PY'
import json,sys
try:
    data=json.load(open(sys.argv[1],encoding='utf-8'))
    print(sum(1 for d in (data.get('devices') or []) if isinstance(d,dict) and d.get('enabled',True) is not False and d.get('serial')))
except Exception:
    print(0)
PY
)"
if [[ "$admitted_count" -gt 0 ]]; then
  echo "ANDROID_TESTING_LIVE=READY_FOR_CONNECTED_ADMITTED_DEVICE"
else
  echo "ANDROID_TESTING_LIVE=WAITING_FOR_ADMITTED_DEVICE"
fi
