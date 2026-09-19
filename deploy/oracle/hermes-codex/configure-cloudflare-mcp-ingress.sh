#!/usr/bin/env bash
set -euo pipefail
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
TARGET="$CONTROL_HOME/config/development-network.env"
mkdir -p "$CONTROL_HOME/config"
chmod 700 "$CONTROL_HOME/config"
read -r -p "Authenticated Cloudflare Access MCP ingress URL (https://...): " URL
[[ "$URL" =~ ^https://[^[:space:]]+$ ]] || { echo "A real HTTPS URL is required" >&2; exit 2; }
[[ "$URL" != *"not-configured"* && "$URL" != *"example."* && "$URL" != *"localhost"* ]] || { echo "Placeholder/local URLs are not accepted" >&2; exit 2; }
TMP="$(mktemp "$CONTROL_HOME/config/.development-network.XXXXXX")"
umask 077
printf 'DIAL_MCP_INGRESS_URL=%q
' "$URL" >"$TMP"
chmod 600 "$TMP"
mv "$TMP" "$TARGET"
echo "Cloudflare MCP ingress configuration stored at $TARGET (0600)."
echo "Bootstrap will probe the configured URL; Access authentication must still succeed."
