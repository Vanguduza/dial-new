#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
ARTEMIS_COMMIT="371aa6df56880643da57b30da936e9812fb0ec66"
ARTEMIS_LOCK_BLOB="dc2d35b8c284055c92ff1cd2560c8201e648bf9f"
ARTEMIS_ROOT="/opt/hermes-mobile-fabric/artemis"
ARTEMIS_DIR="$ARTEMIS_ROOT/$ARTEMIS_COMMIT"
UV_VERSION="0.12.17"
UV_ASSET="uv-x86_64-unknown-linux-gnu.tar.gz"
UNIT_DIR="$HOME/.config/systemd/user"
START=1
[[ "${1:-}" == "--no-start" ]] && START=0

fail(){ echo "ERROR: $*" >&2; exit 1; }
[[ "$(hostname)" == "dial-control" ]] || fail "must run on Netcup dial-control"
[[ "$(uname -m)" == "x86_64" ]] || fail "this qualified installer is x86_64 only"
for cmd in git gh python3 adb scrcpy ffmpeg node; do command -v "$cmd" >/dev/null 2>&1 || fail "required host dependency missing: $cmd"; done
python3 -c 'import sys; assert sys.version_info >= (3,12)' || fail "Python 3.12+ required"

sudo install -d -m 0755 /opt/hermes-mobile-fabric "$ARTEMIS_ROOT"
mkdir -p "$CONTROL_HOME/config" "$CONTROL_HOME/android-testing/evidence" "$CONTROL_HOME/android-testing/leases" "$UNIT_DIR"
chmod 700 "$CONTROL_HOME/android-testing" "$CONTROL_HOME/android-testing/evidence" "$CONTROL_HOME/android-testing/leases" 2>/dev/null || true

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

if [[ ! -s "$CONTROL_HOME/config/android-testing-devices.json" ]]; then
  cat > "$CONTROL_HOME/config/android-testing-devices.json" <<'JSON'
{
  "schema_version": 1,
  "authority": "OWNER_ADMISSION_REQUIRED",
  "devices": []
}
JSON
  chmod 600 "$CONTROL_HOME/config/android-testing-devices.json"
fi

cat > "$UNIT_DIR/dial-artemis-ui.service" <<UNIT
[Unit]
Description=DIAL hardened ARTEMIS Android test console
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$ARTEMIS_DIR
Environment=ADB_SERVER_HOST=127.0.0.1
Environment=ADB_SERVER_PORT=5037
Environment=DIAL_ARTEMIS_HARDENED=1
ExecStart=$ARTEMIS_DIR/.venv/bin/artemis ui
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
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

systemctl --user daemon-reload
systemctl --user enable dial-artemis-ui.service >/dev/null
if [[ "$START" == 1 ]]; then systemctl --user restart dial-artemis-ui.service; fi

node "$REPO_DIR/agent-system/orchestration/android-testing-mcp.mjs" </dev/null >/dev/null 2>&1 || true
echo "ARTEMIS_INSTALL=GREEN"
echo "ARTEMIS_COMMIT=$ARTEMIS_COMMIT"
echo "ARTEMIS_LOCK_BLOB=$ARTEMIS_LOCK_BLOB"
echo "RAW_ARTEMIS_MCP=NOT_EXPOSED"
echo "HERMES_MCP=dial_android_testing"
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
