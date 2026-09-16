#!/usr/bin/env bash
set -euo pipefail
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
TARGET="$CONTROL_HOME/secrets/exa-api.key"
mkdir -p "$CONTROL_HOME/secrets"
chmod 700 "$CONTROL_HOME/secrets"
read -r -s -p "Exa API key: " EXA_KEY; echo
[[ ${#EXA_KEY} -ge 12 ]] || { echo "Exa API key is missing or implausibly short" >&2; exit 2; }
TMP="$(mktemp "$CONTROL_HOME/secrets/.exa-api.XXXXXX")"
umask 077
printf '%s' "$EXA_KEY" >"$TMP"
chmod 600 "$TMP"
mv "$TMP" "$TARGET"
unset EXA_KEY
echo "Exa credential stored at $TARGET (0600)."
echo "Verify with: node ops/development-bootstrap/mcp/probe-exa.mjs"
