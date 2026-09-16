#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${DIAL_REPO_DIR:-$(cd "$HERE/../../.." && pwd)}"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
ENV_FILE="${DIAL_STITCH_ENV_FILE:-$CONTROL_HOME/secrets/stitch.env}"
[[ -r "$ENV_FILE" ]] || { echo "Stitch credential environment is missing: $ENV_FILE" >&2; exit 77; }
# shellcheck disable=SC1090
source "$ENV_FILE"
if [[ "${STITCH_AUTH_METHOD:-}" == "adc" ]]; then
  command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required for Stitch ADC mode" >&2; exit 77; }
  [[ -n "${GOOGLE_CLOUD_PROJECT:-}" ]] || { echo "GOOGLE_CLOUD_PROJECT is required for Stitch ADC mode" >&2; exit 77; }
  export CLOUDSDK_CONFIG="${CLOUDSDK_CONFIG:-$CONTROL_HOME/secrets/gcloud-stitch}"
  STITCH_ACCESS_TOKEN="$(gcloud auth application-default print-access-token 2>/dev/null)" || {
    echo "Stitch ADC is not authenticated. Run gcloud auth login --update-adc for the configured Stitch identity." >&2
    exit 77
  }
  [[ -n "$STITCH_ACCESS_TOKEN" ]] || { echo "Stitch ADC returned an empty access token" >&2; exit 77; }
  export STITCH_ACCESS_TOKEN
  unset STITCH_API_KEY || true
fi
export DIAL_STITCH_ENABLED STITCH_API_KEY STITCH_ACCESS_TOKEN GOOGLE_CLOUD_PROJECT CLOUDSDK_CONFIG 2>/dev/null || true
cd "$REPO_DIR"
case "${1:-}" in
  auth-check)
    exec node agent-system/orchestration/google-capability-cli.mjs health stitch
    ;;
  qualify)
    export DIAL_STITCH_LIVE_TESTS_ENABLED=true
    exec node agent-system/orchestration/google-capability-cli.mjs qualify stitch
    ;;
  stage|admit|accept|prove-outage-fallback)
    exec node agent-system/orchestration/stitch-design-orchestration.mjs "$@"
    ;;
  *) echo "usage: run-stitch-provider.sh auth-check|qualify|stage|admit|accept|prove-outage-fallback [...]" >&2; exit 64 ;;
esac
