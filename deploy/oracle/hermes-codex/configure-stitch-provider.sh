#!/usr/bin/env bash
set -euo pipefail
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
TARGET="$CONTROL_HOME/secrets/stitch.env"
mkdir -p "$CONTROL_HOME/secrets"
chmod 700 "$CONTROL_HOME/secrets"
printf 'Stitch authentication method [api-key/access-token]: '
read -r METHOD
case "$METHOD" in
  api-key)
    read -r -s -p "Stitch API key: " SECRET; echo
    [[ ${#SECRET} -ge 12 ]] || { echo "Stitch API key is missing or implausibly short" >&2; exit 2; }
    PROJECT=""
    KEY_NAME="STITCH_API_KEY"
    ;;
  access-token)
    read -r -s -p "Stitch OAuth/access token: " SECRET; echo
    read -r -p "Google Cloud project ID: " PROJECT
    [[ ${#SECRET} -ge 12 && -n "$PROJECT" ]] || { echo "Access token and Google Cloud project are required" >&2; exit 2; }
    KEY_NAME="STITCH_ACCESS_TOKEN"
    ;;
  *) echo "Choose api-key or access-token" >&2; exit 2 ;;
esac
TMP="$(mktemp "$CONTROL_HOME/secrets/.stitch.XXXXXX")"
umask 077
{
  printf 'DIAL_STITCH_ENABLED=true
'
  printf '%s=%q
' "$KEY_NAME" "$SECRET"
  if [[ -n "$PROJECT" ]]; then printf 'GOOGLE_CLOUD_PROJECT=%q
' "$PROJECT"; fi
} >"$TMP"
chmod 600 "$TMP"
mv "$TMP" "$TARGET"
unset SECRET
echo "Stitch credential environment stored at $TARGET (0600)."
echo "Verify with: bash deploy/oracle/hermes-codex/run-stitch-provider.sh qualify"
