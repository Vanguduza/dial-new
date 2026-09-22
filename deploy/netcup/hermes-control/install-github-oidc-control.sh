#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
REPO="${DIAL_REPO_DIR:-/home/ubuntu/dial-new}"
PORT="${DIAL_GITHUB_OIDC_PORT:-9134}"
[[ "$(hostname)" == dial-control ]] || { echo "REFUSE: wrong host" >&2; exit 2; }
[[ -f "$REPO/deploy/netcup/hermes-control/github-oidc-control.mjs" ]] || { echo "controller missing" >&2; exit 2; }
command -v node >/dev/null || { echo "node missing" >&2; exit 2; }

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
ExecStart=/usr/local/bin/node /usr/local/lib/dial-control/github-oidc-control.mjs
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

systemctl daemon-reload
systemctl enable --now dial-github-oidc-control.service
ufw allow "$PORT/tcp" >/dev/null 2>&1 || true
sleep 2
systemctl is-active --quiet dial-github-oidc-control.service
printf '%s\n' "$(date -u +%FT%TZ)" >/var/lib/dial-control/github-oidc/READY
chmod 0600 /var/lib/dial-control/github-oidc/READY
echo "GITHUB_OIDC_CONTROL=GREEN"
echo "port=$PORT"
