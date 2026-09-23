#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
HOST="$(hostname)"
case "$HOST" in dial-hermes-control|vekl-worker|oracle-admin) ;; *) echo "REFUSE: unsupported host $HOST" >&2; exit 3;; esac
sudo install -m 0755 -o root -g root "$REPO_DIR/deploy/oracle/recovery/dial-github-recovery.sh" /usr/local/bin/dial-github-recovery
sudo /usr/local/bin/dial-github-recovery probe
echo "GITHUB_RECOVERY_INSTALL=GREEN host=$HOST"
