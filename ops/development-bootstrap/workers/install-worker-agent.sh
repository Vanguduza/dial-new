#!/usr/bin/env bash
# Installs the vekl-worker job entrypoint and a capability-envelope timer on a worker host.
# Detect-first, idempotent, user-scoped systemd. Run as the worker service user.
set -euo pipefail
umask 077
DIAL_REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
DIAL_WORKER_HOME="${DIAL_WORKER_HOME:-$HOME/.dial-worker}"
SAFE_PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin"
NODE_BIN="$(PATH="$SAFE_PATH" command -v node)"
[[ -x "$NODE_BIN" ]] || { echo "ERROR: Node is absent from deterministic service PATH." >&2; exit 3; }
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 22 ]] || { echo "ERROR: Node 22+ required, observed $("$NODE_BIN" --version)." >&2; exit 3; }
ROLE="$("$NODE_BIN" "$DIAL_REPO_DIR/ops/development-bootstrap/roles/role-guard.mjs" --resolve | python3 -c 'import json,sys;print(json.load(sys.stdin)["role"])')"
[[ "$ROLE" == "vekl-worker" ]] || { echo "ERROR: host role is $ROLE; the worker agent installs only on vekl-worker (set /etc/dial/host-role)." >&2; exit 3; }
mkdir -p "$DIAL_WORKER_HOME/receipts" "$HOME/.local/bin" "$HOME/.config/systemd/user"
cat >"$HOME/.local/bin/dial-worker-job" <<EOT
#!/usr/bin/env bash
set -euo pipefail
export DIAL_REPO_DIR="$DIAL_REPO_DIR" DIAL_WORKER_HOME="$DIAL_WORKER_HOME"
exec "$NODE_BIN" "$DIAL_REPO_DIR/ops/development-bootstrap/workers/vekl-worker-job.mjs" --stdin
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
Environment=PATH=$SAFE_PATH
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=$NODE_BIN $DIAL_REPO_DIR/ops/development-bootstrap/workers/vekl-worker-job.mjs --kind CAPABILITY_ENVELOPE
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
cat >"$HOME/.config/systemd/user/dial-structural-snapshot.service" <<EOT
[Unit]
Description=DIAL advisory structural snapshot producer
[Service]
Type=oneshot
WorkingDirectory=$DIAL_REPO_DIR
Environment=DIAL_REPO_DIR=$DIAL_REPO_DIR
Environment=DIAL_WORKER_HOME=$DIAL_WORKER_HOME
Environment=PATH=$SAFE_PATH
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=$NODE_BIN $DIAL_REPO_DIR/ops/development-bootstrap/workers/vekl-worker-job.mjs --kind STRUCTURAL_SNAPSHOT
TimeoutStartSec=2min
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$DIAL_WORKER_HOME
EOT
cat >"$HOME/.config/systemd/user/dial-structural-snapshot.timer" <<'EOT'
[Unit]
Description=DIAL bounded advisory structural snapshot timer
[Timer]
OnBootSec=5min
OnUnitActiveSec=6h
RandomizedDelaySec=10min
Persistent=true
[Install]
WantedBy=timers.target
EOT
systemctl --user daemon-reload
systemctl --user enable --now dial-worker-agent.timer dial-structural-snapshot.timer

DIAL_HOUSEKEEPING_HOST_ID=vekl-worker DIAL_SERVICE_USER="$USER" \
  bash "$DIAL_REPO_DIR/deploy/oracle/hermes-codex/install-state-aware-housekeeping.sh"

echo "worker agent installed; add to the control host's ~/.ssh/config a Host entry and on this host an authorized_keys line:"
echo "  command=\"$HOME/.local/bin/dial-worker-job\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 <control-host-public-key>"
