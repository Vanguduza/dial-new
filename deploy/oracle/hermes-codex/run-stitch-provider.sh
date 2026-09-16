#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${DIAL_REPO_DIR:-$(cd "$HERE/../../.." && pwd)}"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
ENV_FILE="${DIAL_STITCH_ENV_FILE:-$CONTROL_HOME/secrets/stitch.env}"
[[ -r "$ENV_FILE" ]] || { echo "Stitch credential environment is missing: $ENV_FILE" >&2; exit 77; }
# shellcheck disable=SC1090
source "$ENV_FILE"
export DIAL_STITCH_ENABLED STITCH_API_KEY STITCH_ACCESS_TOKEN GOOGLE_CLOUD_PROJECT 2>/dev/null || true
cd "$REPO_DIR"
case "${1:-}" in
  qualify)
    export DIAL_STITCH_LIVE_TESTS_ENABLED=true
    exec node agent-system/orchestration/google-capability-cli.mjs qualify stitch
    ;;
  stage|admit|accept|prove-outage-fallback)
    exec node agent-system/orchestration/stitch-design-orchestration.mjs "$@"
    ;;
  *) echo "usage: run-stitch-provider.sh qualify|stage|admit|accept|prove-outage-fallback [...]" >&2; exit 64 ;;
esac
