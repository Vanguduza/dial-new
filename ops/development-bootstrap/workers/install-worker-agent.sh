#!/usr/bin/env bash
# Installs the vekl-worker job entrypoint and a capability-envelope timer on a worker host.
# Detect-first, idempotent, user-scoped systemd. Run as the worker service user.
set -euo pipefail
umask 077
DIAL_REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
DIAL_WORKER_HOME="${DIAL_WORKER_HOME:-$HOME/.dial-worker}"
ROLE="$(node "$DIAL_REPO_DIR/ops/development-bootstrap/roles/role-guard.mjs" --resolve | python3 -c 'import json,sys;print(json.load(sys.stdin)["role"])')"
[[ "$ROLE" == "vekl-worker" ]] || { echo "ERROR: host role is $ROLE; the worker agent installs only on vekl-worker (set /etc/dial/host-role)." >&2; exit 3; }
mkdir -p "$DIAL_WORKER_HOME/receipts" "$HOME/.local/bin" "$HOME/.config/systemd/user"
cat >"$HOME/.local/bin/dial-worker-job" <<EOT
#!/usr/bin/env bash
set -euo pipefail
export DIAL_REPO_DIR="$DIAL_REPO_DIR" DIAL_WORKER_HOME="$DIAL_WORKER_HOME"
exec "$(command -v node)" "$DIAL_REPO_DIR/ops/development-bootstrap/workers/vekl-worker-job.mjs" --stdin
EOT
chmod 0700 "$HOME/.local/bin/dial-worker-job"
cat >"$HOME/.config/systemd/user/dial-worker-agent.service" <<EOT
[Unit]
Description=DIAL vekl-worker capability envelope publisher
[Service]
Type=oneshot
WorkingDirectory=$DIAL_REPO_DIR
Environment=DIAL_REPO_DIR=$DIAL_REPO_DIR
Environment=DIAL_WORKER_HOME=$DIAL_WORKER_HOME
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=$(command -v node) $DIAL_REPO_DIR/ops/development-bootstrap/workers/vekl-worker-job.mjs --job {"kind":"CAPABILITY_ENVELOPE"}
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$DIAL_WORKER_HOME
EOT
cat >"$HOME/.config/systemd/user/dial-worker-agent.timer" <<'EOT'
[Unit]
Description=DIAL vekl-worker capability envelope timer
[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
Persistent=true
[Install]
WantedBy=timers.target
EOT
systemctl --user daemon-reload
systemctl --user enable --now dial-worker-agent.timer
echo "worker agent installed; add to the control host's ~/.ssh/config a Host entry and on this host an authorized_keys line:"
echo "  command=\"$HOME/.local/bin/dial-worker-job\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 <control-host-public-key>"
