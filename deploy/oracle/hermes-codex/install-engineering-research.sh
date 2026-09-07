#!/usr/bin/env bash
set -euo pipefail
umask 077

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
USER_UNIT_DIR="$HOME/.config/systemd/user"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
START_SERVICES=1
if [[ "${1:-}" == "--no-start" ]]; then START_SERVICES=0; fi

[[ -f "$REPO_DIR/agent-system/orchestration/engineering-presearch.mjs" ]] || { echo "ERROR: VEKL research module missing" >&2; exit 1; }
mkdir -p "$USER_UNIT_DIR" "$CONTROL_HOME/knowledge/research"
chmod 700 "$CONTROL_HOME" "$CONTROL_HOME/knowledge" "$CONTROL_HOME/knowledge/research" 2>/dev/null || true

cat >"$USER_UNIT_DIR/dial-engineering-research.service" <<UNIT
[Unit]
Description=DIAL VEKL ahead-of-work engineering research
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$REPO_DIR
Environment=DIAL_REPO_DIR=$REPO_DIR
Environment=DIAL_CONTROL_HOME=$CONTROL_HOME
Environment=CODEX_HOME=$CODEX_HOME
Environment=DIAL_ENGINEERING_RESEARCH_TTL_HOURS=12
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=/usr/bin/node $REPO_DIR/agent-system/orchestration/engineering-presearch.mjs refresh
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadOnlyPaths=$REPO_DIR
ReadWritePaths=$CONTROL_HOME $CODEX_HOME -$HOME/.claude -$HOME/.config/claude
UNIT

cat >"$USER_UNIT_DIR/dial-engineering-research.timer" <<'UNIT'
[Unit]
Description=Refresh DIAL VEKL engineering research ahead of planned work

[Timer]
OnBootSec=10min
OnUnitActiveSec=6h
RandomizedDelaySec=15min
Persistent=true
Unit=dial-engineering-research.service

[Install]
WantedBy=timers.target
UNIT

cat >"$USER_UNIT_DIR/dial-engineering-research.path" <<UNIT
[Unit]
Description=Refresh DIAL VEKL research when project truth, plan, or mission advances

[Path]
PathChanged=$REPO_DIR/agent-system/canon/PROJECT_TRUTH.md
PathChanged=$REPO_DIR/docs/dial/final-audit/00_MASTER/DIAL_CONSOLIDATED_DEVELOPMENT_PLAN_v2_2.md
PathChanged=$CONTROL_HOME/missions/dial-development-root.json
PathChanged=$CONTROL_HOME/state/active-checkpoint.json
Unit=dial-engineering-research.service

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable dial-engineering-research.timer dial-engineering-research.path
if [[ "$START_SERVICES" == "1" ]]; then
  systemctl --user restart dial-engineering-research.timer dial-engineering-research.path
fi

echo "DIAL VEKL ahead-of-work research scheduler installed."
echo "It is read-only against the repository and writes only project-scoped research forecasts/cache under $CONTROL_HOME/knowledge/research."
echo "Exact project-aware Sol is primary; exact Sonnet is fallback. Model/quota unavailability records a degraded forecast and never fabricates research."
