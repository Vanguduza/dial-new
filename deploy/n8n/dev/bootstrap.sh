#!/usr/bin/env bash
set -Eeuo pipefail
set +x # Secrets must remain quiet even if a caller supplied `bash -x`.
umask 077

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
log() { printf '[dial-n8n-dev] %s\n' "$*"; }

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_DIR="$(cd -- "$SCRIPT_DIR/../../.." && pwd -P)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/dial/n8n-dev"
SYSTEMD_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
RUNTIME_ENV="$CONFIG_DIR/runtime.env"
TOPOLOGY_ENV="$CONFIG_DIR/topology.env"
WORKER_TARGET="${VEKL_WORKER_SSH_TARGET:-vekl-worker}"
EXPECTED_HOSTNAME="${VEKL_WORKER_EXPECTED_HOSTNAME:-vekl-worker}"
TUNNEL_PORT="${N8N_DEV_DB_TUNNEL_PORT:-55432}"
HTTP_PORT="${N8N_DEV_HTTP_PORT:-5678}"

[[ "$WORKER_TARGET" =~ ^[A-Za-z0-9._@:-]+$ ]] || fail 'invalid VEKL_WORKER_SSH_TARGET'
[[ "$EXPECTED_HOSTNAME" =~ ^[A-Za-z0-9._-]+$ ]] || fail 'invalid VEKL_WORKER_EXPECTED_HOSTNAME'
[[ "$TUNNEL_PORT" =~ ^[0-9]+$ ]] && ((TUNNEL_PORT >= 1024 && TUNNEL_PORT <= 65535)) || fail 'invalid tunnel port'
[[ "$HTTP_PORT" =~ ^[0-9]+$ ]] && ((HTTP_PORT >= 1024 && HTTP_PORT <= 65535)) || fail 'invalid HTTP port'
((TUNNEL_PORT != HTTP_PORT)) || fail 'tunnel and HTTP ports must differ'
[[ "$(hostname -s)" != "$EXPECTED_HOSTNAME" ]] || fail 'bootstrap must run on Hermes, not vekl-worker'

for command in curl docker grep hostname openssl psql ssh stat systemctl; do
  command -v "$command" >/dev/null || fail "required command is missing: $command"
done
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is required'
systemctl --user show-environment >/dev/null 2>&1 || fail 'a user systemd manager is required'
ssh -o BatchMode=yes -o ConnectTimeout=10 "$WORKER_TARGET" true || fail 'key-only SSH access to vekl-worker failed'
REMOTE_HOST="$(ssh -o BatchMode=yes "$WORKER_TARGET" hostname -s)"
[[ "$REMOTE_HOST" == "$EXPECTED_HOSTNAME" ]] || fail "SSH target resolved to $REMOTE_HOST, expected $EXPECTED_HOSTNAME"

install -d -m 0700 "$CONFIG_DIR" "$SYSTEMD_DIR"

if [[ -e "$RUNTIME_ENV" ]]; then
  [[ "$(stat -c '%a' "$RUNTIME_ENV")" == '600' ]] || fail "$RUNTIME_ENV must have mode 0600"
  # shellcheck disable=SC1090
  source "$RUNTIME_ENV"
fi
N8N_DEV_DB_PASSWORD="${N8N_DEV_DB_PASSWORD:-$(openssl rand -hex 48)}"
N8N_DEV_ENCRYPTION_KEY="${N8N_DEV_ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
N8N_DEV_RUNNERS_AUTH_TOKEN="${N8N_DEV_RUNNERS_AUTH_TOKEN:-$(openssl rand -hex 48)}"
[[ ${#N8N_DEV_DB_PASSWORD} -ge 64 && ${#N8N_DEV_ENCRYPTION_KEY} -ge 64 && ${#N8N_DEV_RUNNERS_AUTH_TOKEN} -ge 64 ]] \
  || fail 'existing secret material does not meet the minimum length'

RUNTIME_TMP="$(mktemp "$CONFIG_DIR/.runtime.env.XXXXXX")"
SQL_TMP="$(mktemp "$CONFIG_DIR/.provision.sql.XXXXXX")"
cleanup() { rm -f -- "$RUNTIME_TMP" "$SQL_TMP"; }
trap cleanup EXIT
printf '%s\n' \
  "N8N_DEV_DB_PASSWORD=$N8N_DEV_DB_PASSWORD" \
  "N8N_DEV_ENCRYPTION_KEY=$N8N_DEV_ENCRYPTION_KEY" \
  "N8N_DEV_RUNNERS_AUTH_TOKEN=$N8N_DEV_RUNNERS_AUTH_TOKEN" \
  "N8N_DEV_DB_TUNNEL_PORT=$TUNNEL_PORT" \
  "N8N_DEV_HTTP_PORT=$HTTP_PORT" \
  "N8N_DEV_HOST=${N8N_DEV_HOST:-127.0.0.1}" \
  "N8N_DEV_PROTOCOL=${N8N_DEV_PROTOCOL:-http}" \
  "N8N_DEV_WEBHOOK_URL=${N8N_DEV_WEBHOOK_URL:-http://127.0.0.1:$HTTP_PORT/}" \
  "N8N_DEV_EDITOR_BASE_URL=${N8N_DEV_EDITOR_BASE_URL:-http://127.0.0.1:$HTTP_PORT/}" \
  "DIAL_TIMEZONE=${DIAL_TIMEZONE:-Africa/Harare}" >"$RUNTIME_TMP"
chmod 0600 "$RUNTIME_TMP"
mv -f -- "$RUNTIME_TMP" "$RUNTIME_ENV"

printf '\\set db_password %s\n' "'$N8N_DEV_DB_PASSWORD'" >"$SQL_TMP"
cat >>"$SQL_TMP" <<'SQL'
SELECT format('CREATE ROLE dial_n8n_dev LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION', :'db_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dial_n8n_dev') \gexec
ALTER ROLE dial_n8n_dev WITH LOGIN PASSWORD :'db_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
SELECT 'CREATE DATABASE dial_n8n_dev OWNER dial_n8n_dev'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'dial_n8n_dev') \gexec
REVOKE ALL ON DATABASE dial_n8n_dev FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE dial_n8n_dev TO dial_n8n_dev;
\connect dial_n8n_dev
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO dial_n8n_dev;
SQL
log 'provisioning the isolated PostgreSQL role/database on vekl-worker'
ssh -o BatchMode=yes "$WORKER_TARGET" 'sudo -n -u postgres psql --no-psqlrc -v ON_ERROR_STOP=1 -q -f -' <"$SQL_TMP" >/dev/null

printf 'VEKL_WORKER_SSH_TARGET=%s\nVEKL_WORKER_EXPECTED_HOSTNAME=%s\n' "$WORKER_TARGET" "$EXPECTED_HOSTNAME" >"$TOPOLOGY_ENV"
chmod 0600 "$TOPOLOGY_ENV"
sed -e "s|@TUNNEL_PORT@|$TUNNEL_PORT|g" -e "s|@WORKER_TARGET@|$WORKER_TARGET|g" \
  "$SCRIPT_DIR/systemd/dial-n8n-dev-db-tunnel.service.in" >"$SYSTEMD_DIR/dial-n8n-dev-db-tunnel.service"
sed -e "s|@REPO_DIR@|$REPO_DIR|g" "$SCRIPT_DIR/systemd/dial-n8n-dev.service.in" >"$SYSTEMD_DIR/dial-n8n-dev.service"
chmod 0600 "$SYSTEMD_DIR/dial-n8n-dev"*.service
systemctl --user daemon-reload
systemctl --user enable --now dial-n8n-dev-db-tunnel.service
systemctl --user enable --now dial-n8n-dev.service
"$SCRIPT_DIR/verify.sh"
log 'bootstrap complete; secrets remain only in the protected runtime environment file'
