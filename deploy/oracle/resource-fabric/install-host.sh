#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${DIAL_REPO_DIR:-$HOME/dial-new}"
FABRIC_DIR="$REPO_DIR/deploy/oracle/resource-fabric"
STATE_DIR="${DIAL_FABRIC_STATE:-$HOME/.local/state/dial-fabric}"
HOST_ID="${DIAL_FABRIC_HOST_ID:-$(hostname)}"
[[ -f "$FABRIC_DIR/hosts.json" ]] || { echo "missing resource fabric at $FABRIC_DIR" >&2; exit 1; }
node -e 'const f=require(process.argv[1]); if(!f.hosts.some(h=>h.host_id===process.argv[2])) process.exit(2)' "$FABRIC_DIR/hosts.json" "$HOST_ID" || { echo "unknown fabric host: $HOST_ID" >&2; exit 1; }
mkdir -p -m 700 "$STATE_DIR"/{inbox,telemetry,dispatch,decisions,archive,rejected,recovery-state,recovery-evidence,recovery-leases}
node "$FABRIC_DIR/host-agent.mjs" --publish >/dev/null
cat <<EOF
Staged DIAL resource fabric state for $HOST_ID.
Systemd units are in: $FABRIC_DIR/systemd
Activation is intentionally separate from staging and must be performed by an authenticated host administrator after CI/project-truth approval.
EOF
