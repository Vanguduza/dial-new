#!/usr/bin/env bash
set -euo pipefail
umask 077
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
DIAL_REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
export DIAL_REPO_DIR DIAL_CONTROL_HOME
fail(){ echo "ERROR: $*" >&2; exit 1; }
[[ -f "$DIAL_REPO_DIR/agent-system/orchestration/operations-plane.mjs" ]] || fail "operations-plane.mjs is missing"
[[ -f "$DIAL_REPO_DIR/agent-system/orchestration/operations-api.mjs" ]] || fail "operations-api.mjs is missing"
for cmd in node systemctl; do command -v "$cmd" >/dev/null || fail "$cmd is required"; done
mkdir -p "$HOME/.local/bin" "$HOME/.config/systemd/user" "$DIAL_CONTROL_HOME/secrets"
chmod 700 "$HOME/.local/bin" "$DIAL_CONTROL_HOME" "$DIAL_CONTROL_HOME/secrets" 2>/dev/null || true
NODE_BIN="$(command -v node)"
cat >"$HOME/.local/bin/dial-hermes-ops" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DIAL_REPO_DIR="${DIAL_REPO_DIR}"
export DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME}"
exec "${NODE_BIN}" "${DIAL_REPO_DIR}/agent-system/orchestration/operations-plane.mjs" "\$@"
EOF
cat >"$HOME/.local/bin/dial-hermes-ops-config" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME}"
exec "${NODE_BIN}" "${DIAL_REPO_DIR}/agent-system/orchestration/operations-api.mjs" "\$@"
EOF
cat >"$HOME/.local/bin/dial-hermes-projects" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DIAL_REPO_DIR="${DIAL_REPO_DIR}"
export DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME}"
exec "${NODE_BIN}" "${DIAL_REPO_DIR}/agent-system/orchestration/project-registry.mjs" "\$@"
EOF
chmod 0700 "$HOME/.local/bin/dial-hermes-ops" "$HOME/.local/bin/dial-hermes-ops-config" "$HOME/.local/bin/dial-hermes-projects"
"$NODE_BIN" "$DIAL_REPO_DIR/agent-system/orchestration/operations-plane.mjs" init >/dev/null
cat >"$HOME/.config/systemd/user/dial-hermes-operations.service" <<EOF
[Unit]
Description=DIAL auxiliary Hermes operations plane (non-authoritative)
After=network-online.target dial-hermes-orchestrator.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${DIAL_REPO_DIR}
Environment=DIAL_REPO_DIR=${DIAL_REPO_DIR}
Environment=DIAL_CONTROL_HOME=${DIAL_CONTROL_HOME}
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=${NODE_BIN} ${DIAL_REPO_DIR}/agent-system/orchestration/operations-plane.mjs daemon
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${DIAL_CONTROL_HOME}
ReadOnlyPaths=${DIAL_REPO_DIR}

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now dial-hermes-operations.service
sleep 1
systemctl --user is-active --quiet dial-hermes-operations.service || fail "dial-hermes-operations.service did not start"
"$NODE_BIN" "$DIAL_REPO_DIR/agent-system/orchestration/operations-plane.mjs" status
cat <<'EOF'

Auxiliary Hermes operations plane installed.
It is NON-AUTHORITATIVE and cannot execute DIAL development or satisfy the production gate.
Configure an optional external API key without placing it on the command line:
  printf '%s' "$YOUR_KEY" | dial-hermes-ops-config configure --provider openai-compatible --base-url https://api.example.com/v1 --model MODEL_NAME --api-key-stdin
  # or: --provider anthropic --model MODEL_NAME (Anthropic base URL defaults to https://api.anthropic.com/v1)
The key is stored outside Git with mode 0600 and is never exported into the Hermes runtime environment.
EOF
