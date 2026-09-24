#!/usr/bin/env bash
set -euo pipefail

# DIAL Hermes control-authority host bootstrap (provider-neutral; Netcup/Oracle compatible).
# Run as the normal service/SSH user on Ubuntu 24.04 x86_64 or ARM64 with passwordless sudo.
# This script deliberately does NOT authenticate GitHub, Codex, Hermes or Claude.

if [[ "$(uname -s)" != "Linux" ]]; then echo "ERROR: Linux is required" >&2; exit 1; fi
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64|aarch64|arm64) ;;
  *) echo "ERROR: unsupported architecture $ARCH (expected x86_64/amd64/aarch64/arm64)" >&2; exit 1 ;;
esac
if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  [[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] || { echo "ERROR: Ubuntu 24.04 is required; detected ${PRETTY_NAME:-unknown}" >&2; exit 1; }
fi
command -v sudo >/dev/null 2>&1 || { echo "ERROR: sudo is required" >&2; exit 1; }

SVC_USER="${DIAL_SERVICE_USER:-$USER}"
SVC_HOME="$(getent passwd "$SVC_USER" | cut -d: -f6)"
[[ -n "$SVC_HOME" ]] || { echo "ERROR: cannot resolve home for $SVC_USER" >&2; exit 1; }
DIAL_REPO_DIR="${DIAL_REPO_DIR:-$SVC_HOME/dial-new}"
SAFE_PATH="$SVC_HOME/.local/bin:$SVC_HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin"
export PATH="$SAFE_PATH" DIAL_REPO_DIR
[[ -f "$DIAL_REPO_DIR/ops/development-bootstrap/bootstrap.mjs" ]] || {
  echo "ERROR: clone the canonical DIAL repository at $DIAL_REPO_DIR before host convergence" >&2
  exit 1
}

# Repository-pinned installers (Antigravity, Context7 and other reviewed scripts) are
# resolved relative to the canonical repository. Fresh-image bootstrap may start from
# /root or another cwd, so enter the repository explicitly before convergence.
cd "$DIAL_REPO_DIR"

# Node is the only bootstrap interpreter. Its official release tarball is installed by the same exact
# architecture pins recorded in supply-chain/PINS.json; every other package/runtime is delegated to the
# detect-first converger. Authentication remains a separate explicit --auth owner action.
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  bash "$DIAL_REPO_DIR/deploy/oracle/hermes-codex/install-pinned-node.sh"
fi
# The canonical installers run repository code (agent-system/orchestration imports pg and friends), so
# install the repository's own dependencies from its lockfile first. Install scripts stay off: only
# esbuild/workerd/fsevents declare them and none is needed by the control host.
(cd "$DIAL_REPO_DIR" && npm ci --ignore-scripts --no-audit --no-fund)
node "$DIAL_REPO_DIR/ops/development-bootstrap/bootstrap.mjs" --apply --role dial-hermes-control --profile CORE_DEVELOPMENT --repo "$DIAL_REPO_DIR"

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

DIAL_SERVICE_USER="$SVC_USER" DIAL_HOUSEKEEPING_HOST_ID="${DIAL_HERMES_HOST_ID:-dial-control}" \
  bash "$DIAL_REPO_DIR/deploy/oracle/hermes-codex/install-state-aware-housekeeping.sh"

cat <<EOF

Host bootstrap complete.
Persistent Hermes/DIAL control state: /var/lib/dial-control
External orchestration queue:          /var/lib/dial-control/work-queue
DIAL repository:                      $SVC_HOME/dial-new
Service user:                         $SVC_USER

REQUIRED OPERATOR AUTH + INSTALL STEPS:
  1. Authenticate GitHub and clone Vanguduza/dial-new into $SVC_HOME/dial-new.
  2. Run: ./ops/development-bootstrap/bootstrap.sh --auth --role dial-hermes-control
     Complete only the owner actions it prints, then use its opaque --resume token.
  5. From the repo, run deploy/oracle/hermes-codex/install-control-plane.sh
     (this now also installs the persistent external orchestrator service).
  6. Complete the live qualification/soak/finalization sequence printed by that installer.

DEVELOPMENT MUST REMAIN BLOCKED until either finalize-control-plane.sh creates a valid
PRODUCTION_GREEN or, when exact Sol is temporarily provider-limited, finalize-development-readiness.sh creates a strict development-only DEVELOPMENT_READY_FALLBACK external-orchestration gate. After that, development enters
through dial-hermes-submit, not through an ad-hoc project-local session.

Do not export OPENAI_API_KEY, CODEX_API_KEY or ANTHROPIC_API_KEY into the subscription-runtime service environment.
EOF
