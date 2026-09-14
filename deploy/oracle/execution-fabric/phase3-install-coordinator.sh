#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${DIAL_REPO_DIR:-/home/ubuntu/dial-new}"
WORKER="${DIAL_WORKER_HOME:-/var/lib/dial-worker}"
NODE="$(command -v node)"

test -f /etc/dial/host-role
grep -q 'ROLE=BACKGROUND_COORDINATOR' /etc/dial/host-role
test -f "$WORKER/secrets/private-mcp-url"

install -d -m 0700 "$WORKER/state" "$HOME/.config/systemd/user"
cat >"$HOME/.config/systemd/user/dial-background-coordinator.service" <<EOF
[Unit]
Description=DIAL vekl-worker background coordinator (MCP, no local heavy compute)
After=network-online.target
[Service]
Type=simple
WorkingDirectory=$REPO
Environment=DIAL_REPO_DIR=$REPO
Environment=DIAL_WORKER_HOME=$WORKER
Environment=DIAL_HOST_ROLE_FILE=/etc/dial/host-role
Environment=DIAL_PRIVATE_MCP_URL_FILE=$WORKER/secrets/private-mcp-url
Environment=DIAL_PRIVATE_MCP_HEALTH=http://10.0.0.184:9133/health
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=$NODE $HERE/dial-background-coordinator.mjs
Restart=on-failure
RestartSec=5
[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now dial-background-coordinator.service
sleep 2
systemctl --user is-active --quiet dial-background-coordinator.service
printf 'PHASE3_COORDINATOR_ACTIVE %s\n' "$(systemctl --user is-active dial-background-coordinator.service)"
test -f "$WORKER/state/background-coordinator.json"
python3 - <<'PY'
import json
p=json.load(open("/var/lib/dial-worker/state/background-coordinator.json"))
print("heavy_local_rejected", p.get("heavy_local_rejected"))
print("mcp_ok", (p.get("mcp") or {}).get("ok"))
print("queue", p.get("queue"))
PY
