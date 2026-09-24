#!/usr/bin/env bash
# recovery-trigger: control-ready-bootstrap-v2
set -Eeuo pipefail
umask 077
REPO="${DIAL_REPO_DIR:-/home/ubuntu/dial-new}"
PORT="${DIAL_GITHUB_OIDC_PORT:-9134}"
NODE_BIN="${DIAL_NODE_BIN:-/home/ubuntu/.local/bin/node}"
EXPECTED_NODE_VERSION="v22.23.3"

[[ "$(hostname)" == dial-control ]] || { echo "REFUSE: wrong host" >&2; exit 2; }
[[ -f "$REPO/deploy/netcup/hermes-control/github-oidc-control.mjs" ]] || { echo "controller missing" >&2; exit 2; }
[[ -x "$NODE_BIN" ]] || { echo "pinned node missing at $NODE_BIN" >&2; exit 2; }
[[ "$("$NODE_BIN" --version)" == "$EXPECTED_NODE_VERSION" ]] || {
  echo "unexpected node version at $NODE_BIN: $("$NODE_BIN" --version 2>/dev/null || true)" >&2
  exit 2
}

install -d -m 0755 /usr/local/lib/dial-control
install -m 0755 "$REPO/deploy/netcup/hermes-control/github-oidc-control.mjs" /usr/local/lib/dial-control/github-oidc-control.mjs
install -d -m 0700 /var/lib/dial-control/github-oidc

cat >/etc/systemd/system/dial-github-oidc-control.service <<EOF
[Unit]
Description=DIAL GitHub OIDC zero-touch control
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
Environment=DIAL_REPO_DIR=$REPO
Environment=DIAL_CONTROL_HOME=/var/lib/dial-control
Environment=DIAL_GITHUB_OIDC_PORT=$PORT
Environment=PATH=/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$NODE_BIN /usr/local/lib/dial-control/github-oidc-control.mjs
Restart=always
RestartSec=3
UMask=0077
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF

ufw allow "$PORT/tcp" >/dev/null 2>&1 || true
systemctl daemon-reload
systemctl enable --now dial-github-oidc-control.service
sleep 2

if ! systemctl is-active --quiet dial-github-oidc-control.service; then
  systemctl --no-pager --full status dial-github-oidc-control.service >&2 || true
  journalctl -u dial-github-oidc-control.service -b --no-pager -n 200 >&2 || true
  exit 3
fi
if ! timeout 3 bash -c "</dev/tcp/127.0.0.1/$PORT" >/dev/null 2>&1; then
  ss -ltnp >&2 || true
  journalctl -u dial-github-oidc-control.service -b --no-pager -n 200 >&2 || true
  echo "OIDC service is active but port $PORT is not listening" >&2
  exit 4
fi

printf '%s\n' "$(date -u +%FT%TZ)" >/var/lib/dial-control/github-oidc/READY
chmod 0600 /var/lib/dial-control/github-oidc/READY
echo "GITHUB_OIDC_CONTROL=GREEN"
echo "node=$NODE_BIN"
echo "port=$PORT"
