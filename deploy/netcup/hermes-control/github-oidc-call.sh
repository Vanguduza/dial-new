#!/usr/bin/env bash
set -Eeuo pipefail

BODY="${1:?JSON body is required}"
CONTROL_URL="${DIAL_CONTROL_OIDC_URL:-http://62.83.35.103:9134/v1/action}"
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?GitHub Actions OIDC URL missing}"
: "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:?GitHub Actions OIDC request token missing}"

HASH="$(printf '%s' "$BODY" | sha256sum | awk '{print $1}')"
AUDIENCE="dial-control:$HASH"
ENCODED_AUDIENCE="$(jq -nr --arg v "$AUDIENCE" '$v|@uri')"
SEP='?'
[[ "$ACTIONS_ID_TOKEN_REQUEST_URL" == *\?* ]] && SEP='&'
TOKEN="$(
  curl --proto '=https' --tlsv1.2 -fsS     -H "Authorization: Bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN"     "${ACTIONS_ID_TOKEN_REQUEST_URL}${SEP}audience=${ENCODED_AUDIENCE}" |
  jq -er '.value'
)"
curl -fsS --retry 3 --retry-delay 2 --connect-timeout 10 --max-time 1800   -H "Authorization: Bearer $TOKEN"   -H 'Content-Type: application/json'   --data-binary "$BODY"   "$CONTROL_URL"
