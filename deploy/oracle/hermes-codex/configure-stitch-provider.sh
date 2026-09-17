#!/usr/bin/env bash
set -euo pipefail
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
TARGET="$CONTROL_HOME/secrets/stitch.env"
GCLOUD_CONFIG_DEFAULT="$CONTROL_HOME/secrets/gcloud-stitch"
mkdir -p "$CONTROL_HOME/secrets"
chmod 700 "$CONTROL_HOME/secrets"
printf 'Stitch authentication method [adc/api-key/access-token]: '
read -r METHOD
PROJECT=""
SECRET=""
KEY_NAME=""
GCLOUD_CONFIG=""
case "$METHOD" in
  adc)
    command -v gcloud >/dev/null 2>&1 || { echo "gcloud is required for Stitch ADC mode" >&2; exit 2; }
    read -r -p "Google Cloud project ID: " PROJECT
    [[ -n "$PROJECT" ]] || { echo "Google Cloud project is required" >&2; exit 2; }
    GCLOUD_CONFIG="$GCLOUD_CONFIG_DEFAULT"
    mkdir -p "$GCLOUD_CONFIG"
    chmod 700 "$GCLOUD_CONFIG"
    ;;
  api-key)
    read -r -s -p "Stitch API key: " SECRET; echo
    [[ ${#SECRET} -ge 12 ]] || { echo "Stitch API key is missing or implausibly short" >&2; exit 2; }
    KEY_NAME="STITCH_API_KEY"
    ;;
  access-token)
    read -r -s -p "Stitch OAuth/access token: " SECRET; echo
    read -r -p "Google Cloud project ID: " PROJECT
    [[ ${#SECRET} -ge 12 && -n "$PROJECT" ]] || { echo "Access token and Google Cloud project are required" >&2; exit 2; }
    KEY_NAME="STITCH_ACCESS_TOKEN"
    ;;
  *) echo "Choose adc, api-key or access-token" >&2; exit 2 ;;
esac
TMP="$(mktemp "$CONTROL_HOME/secrets/.stitch.XXXXXX")"
umask 077
{
  printf 'DIAL_STITCH_ENABLED=true\n'
  printf 'STITCH_AUTH_METHOD=%q\n' "$METHOD"
  if [[ -n "$KEY_NAME" ]]; then printf '%s=%q\n' "$KEY_NAME" "$SECRET"; fi
  if [[ -n "$PROJECT" ]]; then printf 'GOOGLE_CLOUD_PROJECT=%q\n' "$PROJECT"; fi
  if [[ -n "$GCLOUD_CONFIG" ]]; then printf 'CLOUDSDK_CONFIG=%q\n' "$GCLOUD_CONFIG"; fi
} >"$TMP"
chmod 600 "$TMP"
mv "$TMP" "$TARGET"
unset SECRET
echo "Stitch credential environment stored at $TARGET (0600)."
if [[ "$METHOD" == "adc" ]]; then
  echo "Authenticate the same Google account once with: CLOUDSDK_CONFIG=$GCLOUD_CONFIG gcloud auth login --update-adc --no-launch-browser"
fi
echo "Verify with: bash deploy/oracle/hermes-codex/run-stitch-provider.sh qualify"
