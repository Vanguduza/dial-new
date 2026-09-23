#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SOURCE_REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
ACTIVE_REPO_DIR="${DIAL_HOUSEKEEPING_ACTIVE_REPO:-$SOURCE_REPO_DIR}"
HOST_ID="${DIAL_HOUSEKEEPING_HOST_ID:-$(hostname)}"
SERVICE_USER="${DIAL_SERVICE_USER:-$USER}"
HOME_DIR="$(getent passwd "$SERVICE_USER" | cut -d: -f6)"
[[ -n "$HOME_DIR" ]] || { echo "ERROR: cannot resolve home for $SERVICE_USER" >&2; exit 2; }

SAFE_PATH="$HOME_DIR/.local/bin:$HOME_DIR/.npm-global/bin:/usr/local/bin:/usr/bin:/bin"
NODE_BIN="$(PATH="$SAFE_PATH" command -v node || true)"
[[ -x "$NODE_BIN" ]] || { echo "ERROR: Node is required for state-aware housekeeping" >&2; exit 3; }
command -v git >/dev/null 2>&1 || { echo "ERROR: git is required" >&2; exit 3; }
if ! command -v lsof >/dev/null 2>&1; then
  . /etc/os-release
  [[ "${ID:-}" == ubuntu && "${VERSION_ID:-}" == 24.04 ]] || { echo "ERROR: lsof missing and automatic install is supported only on Ubuntu 24.04" >&2; exit 3; }
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends 'lsof=4.95.0-1build3'
fi

case "$HOST_ID" in
  dial-control|dial-hermes-control)
    CONTROL_HOME="${DIAL_HOUSEKEEPING_STATE:-/var/lib/dial-control}"
    ;;
  vekl-worker|van-trading-core|oracle-admin|*)
    CONTROL_HOME="${DIAL_HOUSEKEEPING_STATE:-$HOME_DIR/.local/state/dial-housekeeping}"
    ;;
esac

SRC_ORCH="$SOURCE_REPO_DIR/agent-system/orchestration"
SRC_POLICY="$SOURCE_REPO_DIR/agent-system/registries/HOUSEKEEPING_POLICY.json"
SRC_UNITS="$SOURCE_REPO_DIR/deploy/oracle/hermes-codex/systemd"
for p in   "$SRC_ORCH/state-store.mjs"   "$SRC_ORCH/resource-lifecycle-registry.mjs"   "$SRC_ORCH/housekeeping-gc.mjs"   "$SRC_POLICY"   "$SRC_UNITS/dial-housekeeping.service"   "$SRC_UNITS/dial-housekeeping.path"   "$SRC_UNITS/dial-housekeeping.timer"; do
  [[ -f "$p" ]] || { echo "ERROR: missing housekeeping source: $p" >&2; exit 4; }
done

if [[ "$CONTROL_HOME" == /var/lib/* ]]; then
  sudo install -d -m 0700 -o "$SERVICE_USER" -g "$SERVICE_USER" "$CONTROL_HOME" "$CONTROL_HOME/housekeeping" "$CONTROL_HOME/housekeeping/receipts" "$CONTROL_HOME/housekeeping/quarantine"
else
  install -d -m 0700 "$CONTROL_HOME" "$CONTROL_HOME/housekeeping" "$CONTROL_HOME/housekeeping/receipts" "$CONTROL_HOME/housekeeping/quarantine"
fi

LIB="$HOME_DIR/.local/lib/dial-housekeeping"
ORCH="$LIB/agent-system/orchestration"
REG="$LIB/agent-system/registries"
UNIT_DIR="$HOME_DIR/.config/systemd/user"
ENV_DIR="$HOME_DIR/.config/dial"
install -d -m 0700 "$ORCH" "$REG" "$ENV_DIR"
install -d -m 0755 "$UNIT_DIR"

install -m 0600 "$SRC_ORCH/state-store.mjs" "$ORCH/state-store.mjs"
install -m 0600 "$SRC_ORCH/resource-lifecycle-registry.mjs" "$ORCH/resource-lifecycle-registry.mjs"
install -m 0600 "$SRC_ORCH/housekeeping-gc.mjs" "$ORCH/housekeeping-gc.mjs"
install -m 0600 "$SRC_POLICY" "$REG/HOUSEKEEPING_POLICY.json"

ENV_FILE="$ENV_DIR/housekeeping.env"
cat >"$ENV_FILE" <<EOF
DIAL_CONTROL_HOME=$CONTROL_HOME
DIAL_HOUSEKEEPING_POLICY=$REG/HOUSEKEEPING_POLICY.json
DIAL_HOUSEKEEPING_HOST=$HOST_ID
DIAL_REPO_DIR=$ACTIVE_REPO_DIR
PATH=$SAFE_PATH
EOF
chmod 0600 "$ENV_FILE"

render_unit() {
  local src="$1" dst="$2"
  sed     -e "s|@@SOURCE_ROOT@@|$LIB|g"     -e "s|@@ENV_FILE@@|$ENV_FILE|g"     -e "s|@@NODE_BIN@@|$NODE_BIN|g"     -e "s|@@GC_ENTRY@@|$ORCH/housekeeping-gc.mjs|g"     -e "s|@@TRIGGER_PATH@@|$CONTROL_HOME/housekeeping/trigger|g"     "$src" >"$dst"
  chmod 0644 "$dst"
}

render_unit "$SRC_UNITS/dial-housekeeping.service" "$UNIT_DIR/dial-housekeeping.service"
render_unit "$SRC_UNITS/dial-housekeeping.path" "$UNIT_DIR/dial-housekeeping.path"
render_unit "$SRC_UNITS/dial-housekeeping.timer" "$UNIT_DIR/dial-housekeeping.timer"

mkdir -p "$HOME_DIR/.local/bin"
cat >"$HOME_DIR/.local/bin/dial-housekeeping" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
set -a
. "$ENV_FILE"
set +a
exec "$NODE_BIN" "$ORCH/housekeeping-gc.mjs" "\$@"
EOF
chmod 0700 "$HOME_DIR/.local/bin/dial-housekeeping"

cat >"$HOME_DIR/.local/bin/dial-resource" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
set -a
. "$ENV_FILE"
set +a
exec "$NODE_BIN" "$ORCH/resource-lifecycle-registry.mjs" "\$@"
EOF
chmod 0700 "$HOME_DIR/.local/bin/dial-resource"

# User services remain available without an interactive login.
sudo loginctl enable-linger "$SERVICE_USER" >/dev/null 2>&1 || true
SERVICE_UID="$(id -u "$SERVICE_USER")"
sudo systemctl start "user@${SERVICE_UID}.service" >/dev/null 2>&1 || true
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$SERVICE_UID}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
systemctl --user daemon-reload
systemctl --user enable --now dial-housekeeping.path dial-housekeeping.timer

# Initial sweep only sees explicitly GC-eligible resources; it is safe on a fresh host.
"$HOME_DIR/.local/bin/dial-housekeeping" sweep >/dev/null

cat <<EOF
STATE_AWARE_HOUSEKEEPING=INSTALLED
HOST_ID=$HOST_ID
STATE=$CONTROL_HOME
ACTIVE_REPO=$ACTIVE_REPO_DIR
POLICY=DIAL_STATE_AWARE_HOUSEKEEPING_V1
EVENT_TRIGGER=dial-housekeeping.path
RECONCILIATION_TIMER=dial-housekeeping.timer
EOF
