#!/usr/bin/env bash
set -euo pipefail
umask 077
DIAL_REPO_DIR="${DIAL_REPO_DIR:-/srv/dial/repo}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export DIAL_REPO_DIR DIAL_CONTROL_HOME HERMES_HOME CODEX_HOME
if [[ -S "/run/user/$(id -u)/bus" ]]; then
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
fi
fail(){ echo "ERROR: $*" >&2; exit 1; }
[[ -f "$DIAL_REPO_DIR/agent-system/orchestration/screen-factory.mjs" ]] || fail "screen-factory.mjs missing"
for cmd in node systemctl python3 npx; do command -v "$cmd" >/dev/null || fail "$cmd is required"; done
mkdir -p "$HOME/.local/bin" "$HOME/.config/systemd/user" "$DIAL_CONTROL_HOME/screen-factory" "$DIAL_CONTROL_HOME/secrets"
chmod 700 "$HOME/.local/bin" "$DIAL_CONTROL_HOME" "$DIAL_CONTROL_HOME/screen-factory" "$DIAL_CONTROL_HOME/secrets" 2>/dev/null || true
cd "$DIAL_REPO_DIR"
npx playwright install chromium >/dev/null
NODE_BIN="$(command -v node)"
cat >"$HOME/.local/bin/dial-health-screen-factory" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DIAL_REPO_DIR="$DIAL_REPO_DIR"
export DIAL_CONTROL_HOME="$DIAL_CONTROL_HOME"
exec "$NODE_BIN" "$DIAL_REPO_DIR/agent-system/orchestration/screen-factory.mjs" "\$@"
EOF
cat >"$HOME/.local/bin/dial-hermes-openrouter" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DIAL_CONTROL_HOME="$DIAL_CONTROL_HOME"
if [[ "\${1:-}" == "configure" ]]; then
  read -r -s -p "OpenRouter API key: " OPENROUTER_SECRET; echo
  printf '%s' "\$OPENROUTER_SECRET" | "$NODE_BIN" "$DIAL_REPO_DIR/agent-system/orchestration/auxiliary-openrouter.mjs" configure --api-key-stdin
  unset OPENROUTER_SECRET
else
  exec "$NODE_BIN" "$DIAL_REPO_DIR/agent-system/orchestration/auxiliary-openrouter.mjs" "\$@"
fi
EOF
chmod 0700 "$HOME/.local/bin/dial-health-screen-factory" "$HOME/.local/bin/dial-hermes-openrouter"
cat >"$HOME/.config/systemd/user/dial-health-screen-factory.service" <<EOF
[Unit]
Description=Dial Health Hermes Screen Factory worker
After=network-online.target dial-hermes-runtime.service
Wants=network-online.target dial-hermes-runtime.service
[Service]
Type=simple
WorkingDirectory=$DIAL_REPO_DIR
Environment=DIAL_REPO_DIR=$DIAL_REPO_DIR
Environment=DIAL_CONTROL_HOME=$DIAL_CONTROL_HOME
Environment=HERMES_HOME=$HERMES_HOME
Environment=CODEX_HOME=$CODEX_HOME
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY OPENROUTER_API_KEY
ExecStart=$NODE_BIN $DIAL_REPO_DIR/agent-system/orchestration/screen-factory.mjs daemon
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadOnlyPaths=$DIAL_REPO_DIR
ReadWritePaths=$DIAL_CONTROL_HOME $HERMES_HOME $CODEX_HOME -$HOME/.claude -$HOME/.config/claude
[Install]
WantedBy=default.target
EOF
cat >"$HOME/.config/systemd/user/dial-health-screen-factory-dashboard.service" <<EOF
[Unit]
Description=Dial Health Screen Factory dashboard/controller
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
WorkingDirectory=$DIAL_REPO_DIR
Environment=DIAL_REPO_DIR=$DIAL_REPO_DIR
Environment=DIAL_CONTROL_HOME=$DIAL_CONTROL_HOME
Environment=DIAL_SCREEN_FACTORY_HOST=127.0.0.1
Environment=DIAL_SCREEN_FACTORY_PORT=9121
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY OPENROUTER_API_KEY
ExecStart=$NODE_BIN $DIAL_REPO_DIR/agent-system/orchestration/screen-factory-server.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadOnlyPaths=$DIAL_REPO_DIR
ReadWritePaths=$DIAL_CONTROL_HOME
[Install]
WantedBy=default.target
EOF
"$NODE_BIN" "$DIAL_REPO_DIR/agent-system/orchestration/screen-factory.mjs" init >/dev/null
"$NODE_BIN" "$DIAL_REPO_DIR/agent-system/orchestration/auxiliary-openrouter.mjs" catalog >/dev/null || true
systemctl --user daemon-reload
systemctl --user enable --now dial-health-screen-factory.service
systemctl --user enable --now dial-health-screen-factory-dashboard.service
sleep 1
systemctl --user is-active --quiet dial-health-screen-factory.service || fail "Screen Factory worker did not start"
systemctl --user is-active --quiet dial-health-screen-factory-dashboard.service || fail "Screen Factory dashboard did not start"
cat <<'EOF'
DIAL HEALTH SCREEN FACTORY INSTALLED
Dashboard: http://127.0.0.1:9121
Manager policy remains exact GPT-5.6 Sol -> exact Claude Sonnet 5 -> fail closed.
OpenRouter is auxiliary-only and cannot become a manager or runtime fallback.
Configure the OpenRouter secret interactively with: dial-hermes-openrouter configure
Import the canonical expanded Screen Factory manifest with: dial-health-screen-factory import /path/to/generation_manifest.json
Then press Play in the dashboard or run: dial-health-screen-factory play
EOF
