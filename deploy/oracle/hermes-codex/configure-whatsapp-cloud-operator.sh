#!/usr/bin/env bash
set -euo pipefail
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
TARGET="$CONTROL_HOME/secrets/whatsapp-operator.json"
mkdir -p "$CONTROL_HOME/secrets"
chmod 700 "$CONTROL_HOME/secrets"

read -r -p "Meta Graph API version (for example vNN.N): " API_VERSION
read -r -p "WhatsApp phone number ID: " PHONE_ID
read -r -p "Owner WhatsApp ID / phone digits only: " OWNER_ID
read -r -s -p "Webhook verify token: " VERIFY_TOKEN; echo
read -r -s -p "Meta app secret: " APP_SECRET; echo
read -r -s -p "WhatsApp Cloud API access token: " ACCESS_TOKEN; echo

[[ "$API_VERSION" =~ ^v[0-9]+\.[0-9]+$ ]] || { echo "Invalid Graph API version" >&2; exit 1; }
[[ "$PHONE_ID" =~ ^[0-9]+$ ]] || { echo "Invalid phone number ID" >&2; exit 1; }
OWNER_ID="${OWNER_ID//[^0-9]/}"
[[ -n "$OWNER_ID" && -n "$VERIFY_TOKEN" && -n "$APP_SECRET" && -n "$ACCESS_TOKEN" ]] || { echo "All credentials and owner ID are required" >&2; exit 1; }

TMP="$(mktemp "$CONTROL_HOME/secrets/.whatsapp-operator.XXXXXX")"
chmod 600 "$TMP"
API_VERSION="$API_VERSION" PHONE_ID="$PHONE_ID" OWNER_ID="$OWNER_ID" VERIFY_TOKEN="$VERIFY_TOKEN" APP_SECRET="$APP_SECRET" ACCESS_TOKEN="$ACCESS_TOKEN" python3 - <<'PY' >"$TMP"
import json, os
print(json.dumps({
  "schema_version": 1,
  "enabled": True,
  "verify_token": os.environ["VERIFY_TOKEN"],
  "app_secret": os.environ["APP_SECRET"],
  "access_token": os.environ["ACCESS_TOKEN"],
  "phone_number_id": os.environ["PHONE_ID"],
  "graph_api_version": os.environ["API_VERSION"],
  "allowed_senders": [os.environ["OWNER_ID"]],
}, indent=2))
PY
mv "$TMP" "$TARGET"
chmod 600 "$TARGET"
unset VERIFY_TOKEN APP_SECRET ACCESS_TOKEN
systemctl --user restart dial-whatsapp-cloud-operator.service 2>/dev/null || true
echo "WhatsApp Cloud operator config written securely to $TARGET (0600)."
echo "Expose only /whatsapp/operator/webhook through an HTTPS tunnel; never expose port 9132 directly."
