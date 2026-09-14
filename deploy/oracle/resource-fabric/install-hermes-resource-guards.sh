#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${DIAL_REPO_DIR:-$HOME/dial-new}"
FABRIC_DIR="$REPO_DIR/deploy/oracle/resource-fabric"
HOST_ID="${DIAL_FABRIC_HOST_ID:-$(hostname)}"
[[ "$HOST_ID" == "dial-hermes-control" ]] || { echo "Hermes guards may only be staged on dial-hermes-control" >&2; exit 1; }
"$FABRIC_DIR/install-host.sh"
cat <<EOF
Hermes resource guards staged.
Required activation units/slices:
  dial-control.slice
  dial-development.slice
  dial-recovery.slice
  dial-resource-scheduler.service
  dial-host-agent.timer
Activation must follow CI/project-truth approval and live host validation.
EOF
