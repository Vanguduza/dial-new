#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${DIAL_REPO_DIR:-$HOME/dial-new}"
FABRIC_DIR="$REPO_DIR/deploy/oracle/resource-fabric"
HOST_ID="${DIAL_FABRIC_HOST_ID:-$(hostname)}"
node -e 'const f=require(process.argv[1]); const h=f.hosts.find(x=>x.host_id===process.argv[2]); if(!h||!h.roles.includes("RECOVERY")) process.exit(2)' "$FABRIC_DIR/hosts.json" "$HOST_ID" || { echo "$HOST_ID is not an authorized recovery peer" >&2; exit 1; }
# Invoked through bash so a checkout that lost the exec bit still works.
bash "$FABRIC_DIR/install-host.sh"
cat <<EOF
Recovery peer staged for $HOST_ID.
Required activation units:
  dial-recovery.slice
  dial-recovery-agent.service
  dial-host-agent.timer
Before activation, verify BatchMode SSH from this peer to every target in hosts.json and configure strict known_hosts entries.
EOF
