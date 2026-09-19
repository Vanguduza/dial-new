#!/usr/bin/env bash
set -euo pipefail

if [[ "${DIAL_HOST_ROLE:-}" != "vekl-worker" ]]; then
  echo "refusing install: DIAL_HOST_ROLE must be vekl-worker (oracle-admin is recovery-only)" >&2
  exit 2
fi

install -d -m 0700 -o dial-worker -g dial-worker /var/lib/dial-worker/research-harvest
install -m 0644 deploy/oracle/execution-fabric/systemd/dial-vekl-research-harvest.service /etc/systemd/system/dial-vekl-research-harvest.service
install -m 0644 deploy/oracle/execution-fabric/systemd/dial-vekl-research-harvest.timer /etc/systemd/system/dial-vekl-research-harvest.timer
systemctl daemon-reload
systemctl enable dial-vekl-research-harvest.timer
echo "installed without starting; provision /etc/dial/research-harvest.env and start only when a free exact Union Alpha window is qualified"
