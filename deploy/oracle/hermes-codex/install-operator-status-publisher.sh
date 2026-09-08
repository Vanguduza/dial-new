#!/usr/bin/env bash
set -euo pipefail
umask 077
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

DIAL_REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
NODE_BIN="$(command -v node)"
SYSTEMD_DIR="$HOME/.config/systemd/user"
mkdir -p "$SYSTEMD_DIR" "$DIAL_CONTROL_HOME"
chmod 700 "$DIAL_CONTROL_HOME" 2>/dev/null || true

cat >"$SYSTEMD_DIR/dial-operator-status-publisher.service" <<EOF
[Unit]
Description=DIAL sanitized Oracle operator-status mirror publisher
After=network-online.target dial-hermes-orchestrator.service
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$DIAL_REPO_DIR
Environment=DIAL_REPO_DIR=$DIAL_REPO_DIR
Environment=DIAL_CONTROL_HOME=$DIAL_CONTROL_HOME
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=$NODE_BIN $DIAL_REPO_DIR/agent-system/orchestration/operator-status-publisher.mjs
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$DIAL_CONTROL_HOME $DIAL_REPO_DIR/.git
EOF
cat >"$SYSTEMD_DIR/dial-operator-status-publisher.timer" <<'EOF'
[Unit]
Description=Refresh DIAL Oracle operator-status mirror when state changes

[Timer]
OnBootSec=20s
OnUnitActiveSec=30s
AccuracySec=5s
Persistent=true
Unit=dial-operator-status-publisher.service

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now dial-operator-status-publisher.timer
systemctl --user start dial-operator-status-publisher.service

echo "DIAL operator-status publisher installed."
echo "Private branch: oracle-runtime-status"
echo "The publisher uses Git plumbing only; it does not checkout or mutate the DIAL worktree/index."
