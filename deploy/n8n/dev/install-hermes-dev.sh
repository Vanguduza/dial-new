#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-/home/ubuntu/work/dial-green-closure.tmp}"
WORKER="${DIAL_VEKL_WORKER_SSH:-vekl-worker}"
SECRETS_DIR="${DIAL_N8N_DEV_SECRETS_DIR:-/var/lib/dial-control/secrets/n8n-dev}"
DB_SECRET="${SECRETS_DIR}/db_password"
TUNNEL_PORT="${N8N_DEV_DB_TUNNEL_PORT:-15432}"
COMPOSE="${REPO}/deploy/n8n/dev/docker-compose.yml"
ENV_FILE="${REPO}/deploy/n8n/dev/.env.runtime"
SYSTEMD_DIR="/etc/systemd/system"
TUNNEL_UNIT="${SYSTEMD_DIR}/dial-n8n-dev-db-tunnel.service"
N8N_UNIT="${SYSTEMD_DIR}/dial-n8n-dev.service"

fail(){ echo "ERROR: $*" >&2; exit 1; }

command -v docker >/dev/null || fail "docker is required"
sudo -n docker compose version >/dev/null || fail "docker compose v2 is required"
ssh -o BatchMode=yes "$WORKER" true || fail "vekl-worker SSH unavailable"

sudo -n install -d -m 700 -o "$(id -un)" -g "$(id -gn)" "$SECRETS_DIR"
sudo -n chown -R "$(id -un):$(id -gn)" "$SECRETS_DIR"
for name in db_password encryption_key runner_auth_token; do
  if [[ ! -s "$SECRETS_DIR/$name" ]]; then
    umask 077
    openssl rand -hex 32 > "$SECRETS_DIR/$name"
  fi
  chmod 600 "$SECRETS_DIR/$name"
done

DB_PASSWORD="$(cat "$DB_SECRET")"
[[ "${#DB_PASSWORD}" -ge 32 ]] || fail "database password is too short"

# Create/update the remote role and database. The secret is never printed.
ssh -o BatchMode=yes "$WORKER" "sudo -n -u postgres psql -XAt -d postgres -c \"select 1 from pg_roles where rolname='dial_n8n_dev'\"" | grep -qx 1 ||   ssh -o BatchMode=yes "$WORKER" "sudo -n -u postgres createuser --login --no-superuser --no-createdb --no-createrole --no-inherit dial_n8n_dev"

ESCAPED_PASSWORD="${DB_PASSWORD//\'/\'\'}"
ssh -o BatchMode=yes "$WORKER" "sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d postgres -c \"ALTER ROLE dial_n8n_dev PASSWORD '${ESCAPED_PASSWORD}';\"" >/dev/null

ssh -o BatchMode=yes "$WORKER" "sudo -n -u postgres psql -XAt -d postgres -c \"select 1 from pg_database where datname='dial_n8n_dev'\"" | grep -qx 1 ||   ssh -o BatchMode=yes "$WORKER" "sudo -n -u postgres createdb -O dial_n8n_dev dial_n8n_dev"

ssh -o BatchMode=yes "$WORKER" "sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d dial_n8n_dev -c \"REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE,CREATE ON SCHEMA public TO dial_n8n_dev;\"" >/dev/null
unset DB_PASSWORD

# n8n and runner images execute as uid/gid 1000. Keep runtime secrets readable
# only by that container identity; the installer no longer needs to read them.
sudo -n chown 1000:1000 "$SECRETS_DIR/db_password" "$SECRETS_DIR/encryption_key" "$SECRETS_DIR/runner_auth_token"
sudo -n chmod 400 "$SECRETS_DIR/db_password" "$SECRETS_DIR/encryption_key" "$SECRETS_DIR/runner_auth_token"

sudo -n install -d -m 755 "$SYSTEMD_DIR"
TUNNEL_TMP="$(mktemp)"
cat > "$TUNNEL_TMP" <<UNIT
[Unit]
Description=DIAL n8n DEV database tunnel to VEKL worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
Environment=HOME=/home/ubuntu
ExecStart=/usr/bin/ssh -NT -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 127.0.0.1:${TUNNEL_PORT}:127.0.0.1:5432 ${WORKER}
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT
sudo -n install -m 644 "$TUNNEL_TMP" "$TUNNEL_UNIT"
rm -f "$TUNNEL_TMP"

cat > "$ENV_FILE" <<ENV
DIAL_N8N_DEV_SECRETS_DIR=${SECRETS_DIR}
N8N_DEV_DB_TUNNEL_PORT=${TUNNEL_PORT}
N8N_DEV_WEBHOOK_URL=http://127.0.0.1:5678/
DIAL_TIMEZONE=Africa/Harare
N8N_DEV_CONCURRENCY_LIMIT=1
N8N_DEV_RUNNER_CONCURRENCY=1
N8N_DEV_MEMORY_LIMIT=1536m
N8N_DEV_RUNNER_MEMORY_LIMIT=512m
N8N_DEV_CPU_LIMIT=0.75
N8N_DEV_RUNNER_CPU_LIMIT=0.25
ENV
chmod 600 "$ENV_FILE"

N8N_TMP="$(mktemp)"
cat > "$N8N_TMP" <<UNIT
[Unit]
Description=DIAL n8n DEV estate
After=network-online.target dial-n8n-dev-db-tunnel.service
Requires=dial-n8n-dev-db-tunnel.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${REPO}/deploy/n8n/dev
ExecStart=/usr/bin/docker compose --env-file ${ENV_FILE} up -d
ExecStop=/usr/bin/docker compose --env-file ${ENV_FILE} down
TimeoutStartSec=600
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
UNIT
sudo -n install -m 644 "$N8N_TMP" "$N8N_UNIT"
rm -f "$N8N_TMP"

systemctl --user disable --now dial-n8n-dev.service >/dev/null 2>&1 || true
systemctl --user disable --now dial-n8n-dev-db-tunnel.service >/dev/null 2>&1 || true
rm -f "$HOME/.config/systemd/user/dial-n8n-dev.service" "$HOME/.config/systemd/user/dial-n8n-dev-db-tunnel.service"
systemctl --user daemon-reload || true
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now dial-n8n-dev-db-tunnel.service

for _ in $(seq 1 20); do
  if nc -z 127.0.0.1 "$TUNNEL_PORT" >/dev/null 2>&1; then break; fi
  sleep 1
done
nc -z 127.0.0.1 "$TUNNEL_PORT" >/dev/null 2>&1 || fail "VEKL-worker PostgreSQL tunnel is not ready"

sudo -n docker compose -f "$COMPOSE" --env-file "$ENV_FILE" config >/dev/null
sudo -n systemctl enable --now dial-n8n-dev.service

for _ in $(seq 1 36); do
  if curl -fsS http://127.0.0.1:5678/healthz >/dev/null 2>&1; then break; fi
  sleep 5
done
curl -fsS http://127.0.0.1:5678/healthz >/dev/null || fail "n8n DEV health check failed"

worker_db="$(ssh -o BatchMode=yes "$WORKER" "sudo -n -u postgres psql -XAt -d postgres -c \"select datname||'|'||pg_get_userbyid(datdba) from pg_database where datname='dial_n8n_dev';\"")"
[[ "$worker_db" == "dial_n8n_dev|dial_n8n_dev" ]] || fail "worker database ownership proof failed"

if sudo -n docker ps --format '{{.Names}}' | grep -qx 'dial-n8n-dev-db'; then
  fail "forbidden local DIAL n8n PostgreSQL container detected"
fi

echo "DIAL_N8N_DEV_READY"
echo "runtime_host=dial-hermes-control"
echo "editor=http://127.0.0.1:5678"
echo "database_host=vekl-worker"
echo "database=dial_n8n_dev"
echo "database_tunnel=127.0.0.1:${TUNNEL_PORT}"
