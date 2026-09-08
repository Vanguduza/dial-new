#!/usr/bin/env bash
set -euo pipefail

# DIAL Hermes external runtime host bootstrap.
# Run as the normal SSH user on Ubuntu 24.04 ARM64 with passwordless sudo.
# This script deliberately does NOT authenticate GitHub, Codex, Hermes or Claude.

if [[ "$(uname -s)" != "Linux" ]]; then echo "ERROR: Linux is required" >&2; exit 1; fi
ARCH="$(uname -m)"
if [[ "$ARCH" != "aarch64" && "$ARCH" != "arm64" ]]; then echo "WARNING: expected Oracle Ampere ARM64; detected $ARCH" >&2; fi
command -v sudo >/dev/null 2>&1 || { echo "ERROR: sudo is required" >&2; exit 1; }

SVC_USER="${DIAL_SERVICE_USER:-$USER}"
SVC_HOME="$(getent passwd "$SVC_USER" | cut -d: -f6)"
[[ -n "$SVC_HOME" ]] || { echo "ERROR: cannot resolve home for $SVC_USER" >&2; exit 1; }

sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git gh jq sqlite3 ripgrep tmux rsync openssl \
  build-essential python3 python3-pip python3-venv python3-yaml unzip

need_node=1
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [[ "$major" -ge 22 ]]; then need_node=0; fi
fi
if [[ "$need_node" -eq 1 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi
node --version; npm --version

sudo npm install -g @openai/codex@latest
codex --version

if ! command -v claude >/dev/null 2>&1; then curl -fsSL https://claude.ai/install.sh | bash; fi
export PATH="$SVC_HOME/.local/bin:$PATH"
claude --version || true

if ! command -v hermes >/dev/null 2>&1; then curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash; fi
export PATH="$SVC_HOME/.local/bin:$PATH"
hermes --version || true

if command -v uv >/dev/null 2>&1 && [[ -d "$SVC_HOME/.hermes/hermes-agent" ]]; then
  (cd "$SVC_HOME/.hermes/hermes-agent" && uv pip install -e '.[web,pty]' || true)
fi

sudo install -d -m 0700 -o "$SVC_USER" -g "$SVC_USER" /var/lib/dial-control
for rel in \
  state checkpoints/active checkpoints/archive capsules/active capsules/archive \
  memory/hot memory/warm memory/cold memory/features sessions/hermes sessions/codex sessions/claude \
  retrieval/index retrieval/cache evidence-cache evidence-cache/qualification evidence-cache/soak \
  runtime-health events knowledge/vendor knowledge/activation knowledge/activation/by-packet \
  knowledge/learned/staged knowledge/learned/approved knowledge/evidence/qualification \
  knowledge/evidence/outcomes knowledge/evidence/outcomes/latest \
  work-queue/inbox work-queue/processing work-queue/completed work-queue/failed; do
  sudo install -d -m 0700 -o "$SVC_USER" -g "$SVC_USER" "/var/lib/dial-control/$rel"
done
sudo loginctl enable-linger "$SVC_USER" || true

cat <<EOF

Host bootstrap complete.
Persistent Hermes/DIAL control state: /var/lib/dial-control
External orchestration queue:          /var/lib/dial-control/work-queue
DIAL repository:                      $SVC_HOME/dial-new
Service user:                         $SVC_USER

REQUIRED OPERATOR AUTH + INSTALL STEPS:
  1. Authenticate GitHub and clone Vanguduza/dial-new into $SVC_HOME/dial-new.
  2. Run: codex login
  3. Run: hermes auth add openai-codex
  4. Run Claude Code once and complete Claude subscription login.
  5. From the repo, run deploy/oracle/hermes-codex/install-control-plane.sh
     (this now also installs the persistent external orchestrator service).
  6. Complete the live qualification/soak/finalization sequence printed by that installer.

DEVELOPMENT MUST REMAIN BLOCKED until either finalize-control-plane.sh creates a valid
PRODUCTION_GREEN or, when exact Sol is temporarily provider-limited, finalize-development-readiness.sh creates a strict development-only DEVELOPMENT_READY_FALLBACK external-orchestration gate. After that, development enters
through dial-hermes-submit, not through an ad-hoc project-local session.

Do not export OPENAI_API_KEY, CODEX_API_KEY or ANTHROPIC_API_KEY into the subscription-runtime service environment.
EOF
