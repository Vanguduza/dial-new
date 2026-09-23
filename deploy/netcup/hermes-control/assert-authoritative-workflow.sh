#!/usr/bin/env bash
set -Eeuo pipefail

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_REF_NAME:?GITHUB_REF_NAME is required}"
: "${GITHUB_EVENT_NAME:?GITHUB_EVENT_NAME is required}"

[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "::error::Invalid GITHUB_SHA: $GITHUB_SHA"
  exit 86
}

case "$GITHUB_EVENT_NAME" in
  push|workflow_dispatch|schedule) ;;
  *)
    echo "::error::Unsupported convergence event: $GITHUB_EVENT_NAME"
    exit 86
    ;;
esac

LOCAL_SHA="$(git rev-parse HEAD)"
[[ "$LOCAL_SHA" == "$GITHUB_SHA" ]] || {
  echo "::error::Checkout/event mismatch: checkout=$LOCAL_SHA event=$GITHUB_SHA"
  exit 86
}

REMOTE_SHA=""
for attempt in 1 2 3 4 5; do
  REMOTE_SHA="$(git ls-remote --heads "https://github.com/${GITHUB_REPOSITORY}.git" "refs/heads/${GITHUB_REF_NAME}" | awk 'NR==1 {print $1}')"
  [[ "$REMOTE_SHA" =~ ^[0-9a-f]{40}$ ]] && break
  sleep $((attempt * 2))
done

[[ "$REMOTE_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "::error::Unable to resolve authoritative branch head for ${GITHUB_REF_NAME}"
  exit 86
}

if [[ "$REMOTE_SHA" != "$GITHUB_SHA" ]]; then
  echo "::error::STALE_CONVERGENCE_RUN: event=$GITHUB_SHA current=$REMOTE_SHA branch=$GITHUB_REF_NAME"
  exit 86
fi

echo "DIAL_CONVERGENCE_AUTHORITY=LOCKED branch=$GITHUB_REF_NAME sha=$GITHUB_SHA"
