#!/usr/bin/env bash
set -euo pipefail
umask 077

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"

DIAL_REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
SHARED_HOME="${HAIF_SHARED_HOME:-$HOME/.local/share/hermes-haif}"
SYSTEMD_DIR="$HOME/.config/systemd/user"
NODE_BIN="$(command -v node)"
REV="$(git -C "$DIAL_REPO_DIR" rev-parse HEAD)"
RUNTIME_DIR="$SHARED_HOME/releases/$REV"
TMP_DIR="$SHARED_HOME/releases/.${REV}.$$"

mkdir -p "$SHARED_HOME/releases" "$SYSTEMD_DIR"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR/agent-system/orchestration/providers"
cp "$DIAL_REPO_DIR/agent-system/orchestration/state-store.mjs" "$TMP_DIR/agent-system/orchestration/"
cp -R "$DIAL_REPO_DIR/agent-system/orchestration/auxiliary" "$TMP_DIR/agent-system/orchestration/"
cp -R "$DIAL_REPO_DIR/agent-system/orchestration/providers/xkiro" "$TMP_DIR/agent-system/orchestration/providers/"
find "$TMP_DIR" -type f -exec chmod 0444 {} +
find "$TMP_DIR" -type d -exec chmod 0555 {} +
if [[ -e "$RUNTIME_DIR" ]]; then
  rm -rf "$TMP_DIR"
else
  mv "$TMP_DIR" "$RUNTIME_DIR"
fi
ln -sfn "$RUNTIME_DIR" "$SHARED_HOME/current"

cat >"$SYSTEMD_DIR/dial-hermes-haif.service" <<EOF
[Unit]
Description=DIAL Hermes xKiro Auxiliary Intelligence Fabric tenant
After=network-online.target
Wants=network-online.target
ConditionPathExists=/var/lib/dial-control/secrets/xkiro-api.key

[Service]
Type=simple
WorkingDirectory=$SHARED_HOME/current
Environment=HAIF_PROJECT=dial
Environment=HAIF_CONTROL_ROOT=/var/lib/dial-control
Environment=HAIF_PROVIDER_ROOT=/var/lib/dial-control/operations/auxiliary/provider
Environment=HAIF_KEY_FILE=/var/lib/dial-control/secrets/xkiro-api.key
Environment=HAIF_PORT=9141
EnvironmentFile=-/var/lib/dial-control/secrets/haif-r2.env
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=$NODE_BIN $SHARED_HOME/current/agent-system/orchestration/auxiliary/haif-tenant-daemon.mjs daemon
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=read-only
ReadOnlyPaths=$SHARED_HOME/current
ReadWritePaths=/var/lib/dial-control
InaccessiblePaths=/home/ubuntu/.dde-control
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=default.target
EOF
cat >"$SYSTEMD_DIR/dde-hermes-haif.service" <<EOF
[Unit]
Description=DDE Hermes xKiro Auxiliary Intelligence Fabric tenant
After=network-online.target
Wants=network-online.target
ConditionPathExists=/home/ubuntu/.dde-control/secrets/xkiro-api.key

[Service]
Type=simple
WorkingDirectory=$SHARED_HOME/current
Environment=HAIF_PROJECT=dde
Environment=HAIF_CONTROL_ROOT=/home/ubuntu/.dde-control
Environment=HAIF_PROVIDER_ROOT=/home/ubuntu/.dde-control/operations/auxiliary/provider
Environment=HAIF_KEY_FILE=/home/ubuntu/.dde-control/secrets/xkiro-api.key
Environment=HAIF_PORT=9142
EnvironmentFile=-/home/ubuntu/.dde-control/secrets/haif-r2.env
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=$NODE_BIN $SHARED_HOME/current/agent-system/orchestration/auxiliary/haif-tenant-daemon.mjs daemon
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=read-only
ReadOnlyPaths=$SHARED_HOME/current
ReadWritePaths=/home/ubuntu/.dde-control
InaccessiblePaths=/var/lib/dial-control
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable dial-hermes-haif.service dde-hermes-haif.service

for unit in dial-hermes-haif.service dde-hermes-haif.service; do
  # Restart active tenants so they execute the newly installed immutable release.
  if systemctl --user restart "$unit"; then
    systemctl --user is-active "$unit" >/dev/null 2>&1 || true
  fi
done

echo "HAIF shared runtime installed: $RUNTIME_DIR"
echo "DIAL tenant: port 9141, /var/lib/dial-control only"
echo "DDE tenant: port 9142, /home/ubuntu/.dde-control only"
echo "A tenant remains inactive when its own xKiro key file is absent."
