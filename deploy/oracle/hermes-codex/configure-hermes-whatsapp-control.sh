#!/usr/bin/env bash
set -euo pipefail
umask 077

CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
TARGET="$CONTROL_HOME/secrets/hermes-whatsapp-control.env"
mkdir -p "$CONTROL_HOME/secrets"

read -r -p "Owner WhatsApp number (international digits only, no +): " OWNER_ID
OWNER_ID="$(printf '%s' "$OWNER_ID" | tr -cd '0-9')"
[[ "$OWNER_ID" =~ ^[0-9]{8,20}$ ]] || { echo "ERROR: owner WhatsApp number must contain 8-20 digits" >&2; exit 2; }

TMP="$(mktemp "$CONTROL_HOME/secrets/.hermes-whatsapp-control.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
cat >"$TMP" <<ENV
DIAL_HERMES_WHATSAPP_MODE=bot
WHATSAPP_MODE=bot
WHATSAPP_DM_POLICY=closed
WHATSAPP_ALLOWED_USERS=${OWNER_ID}
DIAL_HERMES_WHATSAPP_OWNER_IDS=${OWNER_ID}
DIAL_HERMES_WHATSAPP_REPLY_HEADING=Dial Hermes Control
ENV
chmod 600 "$TMP"
mv "$TMP" "$TARGET"
trap - EXIT
chmod 600 "$TARGET"

echo "Dial Hermes Control WhatsApp owner allowlist stored securely at $TARGET (0600)."
echo "No Meta Cloud API credential is required for the development owner-control channel."
echo "Next: pair the dedicated Hermes WhatsApp account with:"
echo "  bash deploy/oracle/hermes-codex/pair-hermes-whatsapp.sh --foreground"
