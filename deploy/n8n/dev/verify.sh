#!/usr/bin/env bash
set -Eeuo pipefail

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
QUIET=false
DATABASE_ONLY=false
for arg in "$@"; do
  case "$arg" in --quiet) QUIET=true;; --database-only) DATABASE_ONLY=true;; *) fail "unknown argument: $arg";; esac
done
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/dial/n8n-dev"
RUNTIME_ENV="$CONFIG_DIR/runtime.env"
TOPOLOGY_ENV="$CONFIG_DIR/topology.env"
[[ -r "$RUNTIME_ENV" && -r "$TOPOLOGY_ENV" ]] || fail 'bootstrap configuration is missing'
# shellcheck disable=SC1090
source "$RUNTIME_ENV"
# shellcheck disable=SC1090
source "$TOPOLOGY_ENV"
[[ "$(stat -c '%a' "$RUNTIME_ENV")" == '600' ]] || fail 'runtime.env is not mode 0600'
REMOTE_HOST="$(ssh -o BatchMode=yes "$VEKL_WORKER_SSH_TARGET" hostname -s)"
[[ "$REMOTE_HOST" == "$VEKL_WORKER_EXPECTED_HOSTNAME" ]] || fail 'database SSH target is not the approved worker'
DB_PROOF="$(PGPASSWORD="$N8N_DEV_DB_PASSWORD" psql --no-psqlrc -X -A -t -h 127.0.0.1 -p "$N8N_DEV_DB_TUNNEL_PORT" -U dial_n8n_dev -d dial_n8n_dev -v ON_ERROR_STOP=1 \
  -c "SELECT current_database(), current_user, current_setting('data_directory'), inet_server_addr()::text")"
IFS='|' read -r DATABASE ROLE DATA_DIRECTORY SERVER_ADDRESS <<<"$DB_PROOF"
[[ "$DATABASE" == dial_n8n_dev && "$ROLE" == dial_n8n_dev && -n "$DATA_DIRECTORY" && -n "$SERVER_ADDRESS" ]] \
  || fail 'database identity proof failed'
if ! $QUIET; then
  printf 'PASS database: PostgreSQL database=%s role=%s is served by SSH host=%s data_directory=%s server_address=%s\n' \
    "$DATABASE" "$ROLE" "$REMOTE_HOST" "$DATA_DIRECTORY" "$SERVER_ADDRESS"
fi
$DATABASE_ONLY && exit 0
systemctl --user is-active --quiet dial-n8n-dev-db-tunnel.service || fail 'tunnel service is not active'
systemctl --user is-active --quiet dial-n8n-dev.service || fail 'n8n service is not active'
curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:${N8N_DEV_HTTP_PORT}/healthz/readiness" >/dev/null || fail 'n8n readiness endpoint failed'
docker inspect --format '{{.State.Health.Status}}' dial-n8n-dev | grep -qx healthy || fail 'n8n container is not healthy'
docker inspect --format '{{.State.Running}}' dial-n8n-dev-runner | grep -qx true || fail 'external runner is not running'
docker inspect --format '{{.Config.Image}}' dial-n8n-dev | grep -qx 'n8nio/n8n:2.39.7' || fail 'n8n version drift'
docker inspect --format '{{.Config.Image}}' dial-n8n-dev-runner | grep -qx 'n8nio/runners:2.39.7' || fail 'runner version drift'
printf 'PASS runtime: n8n and external runner 2.39.7 are healthy on Hermes; PostgreSQL proof points to %s\n' "$REMOTE_HOST"
