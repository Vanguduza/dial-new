#!/usr/bin/env bash
set -euo pipefail
umask 077

DIAL_REPO_DIR="${DIAL_REPO_DIR:-/srv/dial/repo}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export DIAL_REPO_DIR DIAL_CONTROL_HOME HERMES_HOME CODEX_HOME

fail(){ echo "ERROR: $*" >&2; exit 1; }

[[ -f "$DIAL_REPO_DIR/package.json" ]] || fail "DIAL repository not found at $DIAL_REPO_DIR"
[[ -f "$DIAL_REPO_DIR/agent-system/orchestration/external-orchestrator.mjs" ]] || fail "external-orchestrator.mjs is missing"
for cmd in node systemctl; do command -v "$cmd" >/dev/null || fail "$cmd is required"; done

if [[ -n "${OPENAI_API_KEY:-}" || -n "${CODEX_API_KEY:-}" || -n "${ANTHROPIC_API_KEY:-}" ]]; then
  fail "API-key environment variables must be unset for the subscription-only Hermes control plane"
fi

mkdir -p "$HOME/.local/bin" "$HOME/.config/systemd/user" "$DIAL_CONTROL_HOME"
chmod 700 "$HOME/.local/bin" "$DIAL_CONTROL_HOME" 2>/dev/null || true

NODE_BIN="$(command -v node)"

cat >"$HOME/.local/bin/dial-hermes-submit" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DIAL_REPO_DIR="${DIAL_REPO_DIR}"
export DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME}"
exec "${NODE_BIN}" "${DIAL_REPO_DIR}/agent-system/orchestration/external-orchestrator.mjs" submit "\$@"
EOF
chmod 0700 "$HOME/.local/bin/dial-hermes-submit"

cat >"$HOME/.local/bin/dial-hermes-job" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DIAL_REPO_DIR="${DIAL_REPO_DIR}"
export DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME}"
exec "${NODE_BIN}" "${DIAL_REPO_DIR}/agent-system/orchestration/external-orchestrator.mjs" status "\$@"
EOF
chmod 0700 "$HOME/.local/bin/dial-hermes-job"

cat >"$HOME/.config/systemd/user/dial-hermes-orchestrator.service" <<EOF
[Unit]
Description=DIAL external Hermes development orchestrator
After=network-online.target dial-hermes-runtime.service
Wants=network-online.target dial-hermes-runtime.service

[Service]
Type=simple
WorkingDirectory=${DIAL_REPO_DIR}
Environment=DIAL_REPO_DIR=${DIAL_REPO_DIR}
Environment=DIAL_CONTROL_HOME=${DIAL_CONTROL_HOME}
Environment=HERMES_HOME=${HERMES_HOME}
Environment=CODEX_HOME=${CODEX_HOME}
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=${NODE_BIN} ${DIAL_REPO_DIR}/agent-system/orchestration/external-orchestrator.mjs daemon
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${DIAL_CONTROL_HOME} ${DIAL_REPO_DIR} ${HERMES_HOME} ${CODEX_HOME} -${HOME}/.claude -${HOME}/.config/claude

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now dial-hermes-orchestrator.service

sleep 1
systemctl --user is-active --quiet dial-hermes-orchestrator.service || fail "dial-hermes-orchestrator.service did not start"

status="$(${NODE_BIN} "$DIAL_REPO_DIR/agent-system/orchestration/external-orchestrator.mjs" status)"
printf '%s\n' "$status"

echo
printf '%s\n' "External Hermes orchestration service installed."
printf '%s\n' "Submit work from outside the project process with:"
printf '%s\n' "  dial-hermes-submit \"<development instruction>\""
printf '%s\n' "Inspect queue/job state with:"
printf '%s\n' "  dial-hermes-job [job-id]"
