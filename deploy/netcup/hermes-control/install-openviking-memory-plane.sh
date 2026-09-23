#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
STATE_DIR="$CONTROL_HOME/openviking"
SECRET_DIR="$CONTROL_HOME/secrets"
SECRET_FILE="$SECRET_DIR/openviking-root-api.key"
CONFIG_FILE="$STATE_DIR/ov.conf"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
HERMES_CONFIG="${HERMES_CONFIG:-$HERMES_HOME/config.yaml}"
HERMES_ENV="$HERMES_HOME/.env"
UNIT_DIR="$HOME/.config/systemd/user"
IMAGE="ghcr.io/volcengine/openviking@sha256:4f33751b4541d79fa2a53284d7e9e1bf6cf0a7504849f3d3a2f1629cc629e52c"
START=1
[[ "${1:-}" == "--no-start" ]] && START=0

fail(){ echo "ERROR: $*" >&2; exit 1; }
[[ "$(hostname)" == "dial-control" ]] || fail "must run on Netcup dial-control"
command -v docker >/dev/null || fail "docker is required"
command -v openssl >/dev/null || fail "openssl is required"
command -v curl >/dev/null || fail "curl is required"
python3 -c 'import yaml' >/dev/null 2>&1 || fail "python3 PyYAML is required"
NODE_BIN="$(command -v node)"
[[ -n "$NODE_BIN" ]] || fail "node is required"

mkdir -p "$STATE_DIR" "$SECRET_DIR" "$UNIT_DIR" "$HERMES_HOME"
chmod 700 "$STATE_DIR" "$SECRET_DIR" "$HERMES_HOME" 2>/dev/null || true

if [[ ! -s "$SECRET_FILE" ]]; then
  openssl rand -hex 32 > "$SECRET_FILE"
fi
chmod 600 "$SECRET_FILE"

if [[ ! -s "$CONFIG_FILE" ]]; then
  cat > "$CONFIG_FILE" <<'JSON'
{
  "embedding": {},
  "vlm": {},
  "server": {
    "host": "0.0.0.0",
    "port": 1933,
    "auth_mode": "api_key",
    "root_api_key": "${OPENVIKING_ROOT_API_KEY}"
  }
}
JSON
fi
chmod 600 "$CONFIG_FILE"

CONFIG_READY="$(python3 - "$CONFIG_FILE" <<'PY'
import json,sys
p=sys.argv[1]
try:
    cfg=json.load(open(p,encoding='utf-8'))
except Exception:
    print("INVALID")
    raise SystemExit(0)
server=cfg.get('server') or {}
dense=(cfg.get('embedding') or {}).get('dense') or {}
vlm=cfg.get('vlm') or {}
ok=(
    server.get('root_api_key') == '${OPENVIKING_ROOT_API_KEY}'
    and bool(dense.get('provider'))
    and bool(dense.get('model'))
    and bool(vlm.get('provider'))
    and bool(vlm.get('model'))
)
print("READY" if ok else "PENDING")
PY
)"

install -m 0755 "$REPO_DIR/deploy/netcup/hermes-control/openviking/run-openviking.sh" "$STATE_DIR/run-openviking.sh"

cat > "$UNIT_DIR/dial-openviking.service" <<UNIT
[Unit]
Description=DIAL OpenViking subordinate context database
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=DIAL_CONTROL_HOME=$CONTROL_HOME
ExecStart=$STATE_DIR/run-openviking.sh
ExecStop=-/usr/bin/docker rm -f dial-openviking
Restart=on-failure
RestartSec=5
TimeoutStartSec=180
TimeoutStopSec=30

[Install]
WantedBy=default.target
UNIT

cat > "$UNIT_DIR/dial-openviking-projector.service" <<UNIT
[Unit]
Description=Project admitted SPMRF memory into OpenViking
After=dial-openviking.service

[Service]
Type=oneshot
Environment=DIAL_REPO_DIR=$REPO_DIR
Environment=DIAL_CONTROL_HOME=$CONTROL_HOME
Environment=DIAL_OPENVIKING_ENDPOINT=http://127.0.0.1:1933
Environment=DIAL_OPENVIKING_API_KEY_FILE=$SECRET_FILE
ExecStart=$NODE_BIN $REPO_DIR/agent-system/orchestration/openviking-projector.mjs --limit 200
UNIT

cat > "$UNIT_DIR/dial-openviking-projector.timer" <<'UNIT'
[Unit]
Description=Refresh DIAL OpenViking project-memory projection

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s
AccuracySec=10s
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl --user daemon-reload
systemctl --user enable dial-openviking.service dial-openviking-projector.timer >/dev/null

if [[ "$CONFIG_READY" != "READY" ]]; then
  echo "OPENVIKING_INSTALL=PREPARED"
  echo "OPENVIKING_ACTIVATION=PENDING_MODEL_CONFIG"
  echo "CONFIG=$CONFIG_FILE"
  echo "REQUIRED=embedding.dense.provider+model and vlm.provider+model; keep server.root_api_key as environment placeholder"
  exit 3
fi

docker pull "$IMAGE" >/dev/null
docker image inspect "$IMAGE" >/dev/null || fail "pinned OpenViking image unavailable after pull"

if [[ "$START" == 1 ]]; then
  systemctl --user restart dial-openviking.service
  ready=0
  for _ in $(seq 1 60); do
    if curl --fail --silent --show-error --max-time 2 http://127.0.0.1:1933/health >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 2
  done
  [[ "$ready" == 1 ]] || fail "OpenViking did not become healthy"
fi

# Activate the native Hermes provider only after the local service is healthy.
# Project memory still enters through SPMRF admission; native Hermes memory is lower-authority session/user memory.
python3 - "$HERMES_CONFIG" <<'PY'
import os,sys,tempfile,yaml
path=sys.argv[1]
cfg={}
if os.path.exists(path):
    with open(path,encoding='utf-8') as f: cfg=yaml.safe_load(f) or {}
memory=cfg.get('memory')
if not isinstance(memory,dict): memory={}
memory['provider']='openviking'
cfg['memory']=memory
os.makedirs(os.path.dirname(path),exist_ok=True)
fd,tmp=tempfile.mkstemp(prefix='.openviking-memory.',dir=os.path.dirname(path),text=True)
try:
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        yaml.safe_dump(cfg,f,sort_keys=False,width=1000000); f.flush(); os.fsync(f.fileno())
    os.chmod(tmp,0o600); os.replace(tmp,path)
finally:
    if os.path.exists(tmp): os.unlink(tmp)
PY

python3 - "$HERMES_ENV" "$SECRET_FILE" <<'PY'
import os,sys,tempfile
path,key_path=sys.argv[1:3]
key=open(key_path,encoding='utf-8').read().strip()
lines=[]
if os.path.exists(path):
    with open(path,encoding='utf-8') as f:
        lines=[line.rstrip('\n') for line in f]
blocked=('OPENVIKING_ENDPOINT=','OPENVIKING_API_KEY=','OPENVIKING_ACCOUNT=','OPENVIKING_USER=')
lines=[line for line in lines if not line.startswith(blocked)]
lines += [
    'OPENVIKING_ENDPOINT=http://127.0.0.1:1933',
    f'OPENVIKING_API_KEY={key}',
    'OPENVIKING_ACCOUNT=default',
    'OPENVIKING_USER=default',
]
os.makedirs(os.path.dirname(path),exist_ok=True)
fd,tmp=tempfile.mkstemp(prefix='.openviking-env.',dir=os.path.dirname(path),text=True)
try:
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        f.write('\n'.join(lines).rstrip()+'\n'); f.flush(); os.fsync(f.fileno())
    os.chmod(tmp,0o600); os.replace(tmp,path)
finally:
    if os.path.exists(tmp): os.unlink(tmp)
PY

if [[ "$START" == 1 ]]; then
  systemctl --user restart dial-openviking-projector.timer
  systemctl --user start dial-openviking-projector.service || true
fi

echo "OPENVIKING_INSTALL=GREEN"
echo "OPENVIKING_IMAGE=$IMAGE"
echo "OPENVIKING_BIND=127.0.0.1:1933"
echo "OPENVIKING_BOT=DISABLED"
echo "HERMES_MEMORY_PROVIDER=openviking"
echo "SPMRF_PROJECTION=ADMITTED_ONLY"
echo "PROJECT_AUTHORITY=UNCHANGED"
