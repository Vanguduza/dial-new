#!/usr/bin/env bash
set -euo pipefail
ROLE="${1:-CONTROL_AUTHORITY}"
HOST="$(hostname)"
sudo install -d -m 0755 /etc/dial
sudo tee /etc/dial/host-role >/dev/null <<EOF
ROLE=$ROLE
HOSTNAME=$HOST
NODE_ID=$HOST
FABRIC=PROVIDER_FIRST_EXECUTION_FABRIC
REVISION=2.0
EOF
sudo chmod 0644 /etc/dial/host-role
printf 'HOST_ROLE_OK %s\n' "$(tr '\n' ' ' </etc/dial/host-role)"
