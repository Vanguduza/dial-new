#!/usr/bin/env bash
set -euo pipefail

# DIAL Hermes + Codex Oracle host bootstrap.
# Run as the normal SSH user on Ubuntu 24.04 ARM64 with passwordless sudo.
# This script deliberately does NOT authenticate GitHub, Codex, Hermes, or Claude.
# OAuth/device login remains an operator action and no credentials are embedded here.

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "ERROR: Linux is required" >&2
  exit 1
fi

ARCH="$(uname -m)"
if [[ "$ARCH" != "aarch64" && "$ARCH" != "arm64" ]]; then
  echo "WARNING: expected Oracle Ampere ARM64; detected $ARCH" >&2
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "ERROR: sudo is required for host bootstrap" >&2
  exit 1
fi

SVC_USER="${DIAL_SERVICE_USER:-$USER}"
SVC_HOME="$(getent passwd "$SVC_USER" | cut -d: -f6)"
if [[ -z "$SVC_HOME" ]]; then
  echo "ERROR: cannot resolve home directory for $SVC_USER" >&2
  exit 1
fi

sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git gh jq sqlite3 ripgrep tmux rsync openssl \
  build-essential python3 python3-pip python3-venv python3-yaml unzip

# DIAL requires Node >=22.13. Install Node 22 only if the existing runtime is absent/older.
need_node=1
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [[ "$major" -ge 22 ]]; then need_node=0; fi
fi
if [[ "$need_node" -eq 1 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi

node --version
npm --version

# Install/update Codex CLI. Hermes' Codex App Server requires >=0.130.0;
# GPT-5.6 Sol requires >=0.144.0, which the qualification suite enforces.
sudo npm install -g @openai/codex@latest
codex --version

# Claude Code is installed for the cross-provider failover qualification plane.
# Anthropic's native Linux installer supports ARM64.
if ! command -v claude >/dev/null 2>&1; then
  curl -fsSL https://claude.ai/install.sh | bash
fi
export PATH="$SVC_HOME/.local/bin:$PATH"
claude --version || true

# Hermes CLI install/update.
if ! command -v hermes >/dev/null 2>&1; then
  curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
fi
export PATH="$SVC_HOME/.local/bin:$PATH"
hermes --version || true

# Install Hermes dashboard dependencies when the editable Hermes checkout is present.
# The DIAL context broker can use the loopback dashboard REST API for FTS session retrieval.
if command -v uv >/dev/null 2>&1 && [[ -d "$SVC_HOME/.hermes/hermes-agent" ]]; then
  (
    cd "$SVC_HOME/.hermes/hermes-agent"
    uv pip install -e '.[web,pty]' || true
  )
fi

# Persistent DIAL control-plane + expanded memory fabric.
sudo install -d -m 0750 -o "$SVC_USER" -g "$SVC_USER" /srv/dial
sudo install -d -m 0700 -o "$SVC_USER" -g "$SVC_USER" /var/lib/dial-control
for rel in \
  state checkpoints/active checkpoints/archive capsules/active capsules/archive \
  memory/hot memory/warm memory/cold memory/features \
  sessions/hermes sessions/codex sessions/claude \
  retrieval/index retrieval/cache evidence-cache runtime-health events; do
  sudo install -d -m 0700 -o "$SVC_USER" -g "$SVC_USER" "/var/lib/dial-control/$rel"
done

# Keep services alive after SSH logout when user units are installed.
sudo loginctl enable-linger "$SVC_USER" || true

cat <<EOF

Host bootstrap complete.

Persistent control-plane memory: /var/lib/dial-control
DIAL repository parent:          /srv/dial
Service user:                    $SVC_USER

REQUIRED OPERATOR AUTH STEPS (not automatable safely):
  1. Authenticate GitHub and clone Vanguduza/dial-new into /srv/dial/repo.
  2. Run: codex login
  3. Run: hermes auth add openai-codex
  4. Run Claude Code once and complete the Claude subscription login for failover qualification.
  5. From the repo, run deploy/oracle/hermes-codex/install-control-plane.sh

IMPORTANT: do not export OPENAI_API_KEY or CODEX_API_KEY into the Hermes gateway environment
when the intended Codex path is ChatGPT subscription OAuth.
EOF
