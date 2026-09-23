#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
STATE_DIR="$CONTROL_HOME/openviking"
SECRET_FILE="$CONTROL_HOME/secrets/openviking-root-api.key"
IMAGE="ghcr.io/volcengine/openviking@sha256:4f33751b4541d79fa2a53284d7e9e1bf6cf0a7504849f3d3a2f1629cc629e52c"

[[ -s "$STATE_DIR/ov.conf" ]] || { echo "OpenViking config missing" >&2; exit 2; }
[[ -s "$SECRET_FILE" ]] || { echo "OpenViking root key missing" >&2; exit 2; }
key="$(cat "$SECRET_FILE")"
[[ "$key" =~ ^[A-Za-z0-9._~+/-]{32,256}$ ]] || { echo "OpenViking root key format invalid" >&2; exit 2; }

cleanup(){ docker rm -f dial-openviking >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
cleanup

exec docker run --rm --name dial-openviking \
  --pull=never \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=512m \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  -e OPENVIKING_WITH_BOT=0 \
  -e OPENVIKING_CONFIG_FILE=/app/.openviking/ov.conf \
  -e OPENVIKING_CLI_CONFIG_FILE=/app/.openviking/ovcli.conf \
  -e OPENVIKING_ROOT_API_KEY="$key" \
  -p 127.0.0.1:1933:1933 \
  -v "$STATE_DIR:/app/.openviking:rw" \
  "$IMAGE" --without-bot
