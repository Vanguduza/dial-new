#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${DIAL_REPO_DIR:-/home/ubuntu/dial-new}"
WORKER="${DIAL_WORKER_HOME:-/var/lib/dial-worker}"
SAFE_PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin"
NODE="$(PATH="$SAFE_PATH" command -v node)"
PRIVATE_MCP_HEALTH="${DIAL_PRIVATE_MCP_HEALTH:-}"
if [[ -z "$PRIVATE_MCP_HEALTH" && -n "${DIAL_CONTROL_OVERLAY_IP:-}" ]]; then
  PRIVATE_MCP_HEALTH="http://${DIAL_CONTROL_OVERLAY_IP}:9133/health"
fi
[[ -n "$PRIVATE_MCP_HEALTH" ]] || { echo "DIAL_PRIVATE_MCP_HEALTH or DIAL_CONTROL_OVERLAY_IP is required for cross-cloud coordinator" >&2; exit 2; }
[[ -x "$NODE" && "$("$NODE" -p 'process.versions.node.split(".")[0]')" -ge 22 ]] || { echo "Node 22+ is required from deterministic service PATH" >&2; exit 3; }

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
Environment=DIAL_PRIVATE_MCP_HEALTH=$PRIVATE_MCP_HEALTH
Environment=PATH=$SAFE_PATH
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=$NODE $HERE/dial-background-coordinator.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadOnlyPaths=$REPO
ReadWritePaths=$WORKER
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
