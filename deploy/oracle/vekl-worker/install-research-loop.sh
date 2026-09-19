#!/usr/bin/env bash
set -euo pipefail

REPO="${DIAL_REPO_DIR:-/home/ubuntu/dial-vekl-research-runtime}"
SECRET_DIR=/var/lib/dial-worker/secrets
CONTROL_HOME=/var/lib/dial-control
PG_RUNTIME=/home/ubuntu/.local/share/dial-vekl-runtime
MIGRATION="$REPO/deploy/oracle/vekl-worker/migrations/0050_research_loop.sql"
SERVICE_SRC="$REPO/deploy/oracle/vekl-worker/dial-vekl-groq-research.service"
TIMER_SRC="$REPO/deploy/oracle/vekl-worker/dial-vekl-groq-research.timer"

fail(){ echo "ERROR: $*" >&2; exit 1; }
[[ "$(hostname)" == "vekl-worker" ]] || fail "must run on vekl-worker"
[[ -s "$SECRET_DIR/groq-api.key" ]] || fail "Groq API key is required"
[[ -f "$MIGRATION" && -f "$SERVICE_SRC" && -f "$TIMER_SRC" ]] || fail "research runtime files missing"

mkdir -p "$PG_RUNTIME"
npm install --prefix "$PG_RUNTIME" pg@8.16.3 --no-audit --no-fund >/dev/null

sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d dial_vekl -f "$MIGRATION" >/dev/null
sudo -n -u postgres psql -XAt -d postgres -c "select 1 from pg_roles where rolname='dial_research_loop'" | grep -qx 1 || \
  sudo -n -u postgres createuser --login --no-superuser --no-createdb --no-createrole --no-inherit dial_research_loop
sudo -n -u postgres psql -X -v ON_ERROR_STOP=1 -d dial_vekl -c "GRANT CONNECT ON DATABASE dial_vekl TO dial_research_loop; GRANT USAGE ON SCHEMA public TO dial_research_loop; GRANT SELECT,INSERT,UPDATE ON TABLE vekl_research_missions,vekl_research_packets,vekl_research_coverage,vekl_research_idempotency,vekl_research_events,vekl_research_evidence,vekl_research_sources,vekl_research_discovery_links,vekl_research_artifact_links TO dial_research_loop; GRANT USAGE,SELECT ON SEQUENCE vekl_research_events_event_id_seq TO dial_research_loop;" >/dev/null

PG_IDENT=/etc/postgresql/16/main/pg_ident.conf
PG_HBA=/etc/postgresql/16/main/pg_hba.conf
sudo -n grep -q '^dial_research_map[[:space:]]\+ubuntu[[:space:]]\+dial_research_loop$' "$PG_IDENT" || \
  echo 'dial_research_map ubuntu dial_research_loop' | sudo -n tee -a "$PG_IDENT" >/dev/null
if ! sudo -n grep -q '^local[[:space:]]\+dial_vekl[[:space:]]\+dial_research_loop[[:space:]]\+peer map=dial_research_map$' "$PG_HBA"; then
  sudo -n sed -i "/^local[[:space:]]\+all[[:space:]]\+all[[:space:]]\+peer/i local   dial_vekl        dial_research_loop                      peer map=dial_research_map" "$PG_HBA"
fi
sudo -n systemctl reload postgresql
PGHOST=/var/run/postgresql psql -XAt -U dial_research_loop -d dial_vekl -c 'select current_user' | grep -qx dial_research_loop || fail "peer-mapped research role validation failed"

sudo -n install -m 0644 "$SERVICE_SRC" /etc/systemd/system/dial-vekl-groq-research.service
sudo -n install -m 0644 "$TIMER_SRC" /etc/systemd/system/dial-vekl-groq-research.timer
sudo -n mkdir -p "$CONTROL_HOME/knowledge/research/groq-harvest" "$CONTROL_HOME/operations/research/providers"
sudo -n chown -R ubuntu:ubuntu "$CONTROL_HOME/knowledge/research/groq-harvest" "$CONTROL_HOME/operations/research/providers"
sudo -n systemctl daemon-reload
sudo -n systemctl enable dial-vekl-groq-research.timer >/dev/null

echo DIAL_VEKL_GROQ_RESEARCH_RUNTIME_READY
echo provider=groq
echo model=openai/gpt-oss-120b
echo database=dial_vekl
echo database_host=vekl-worker
echo runtime_host=vekl-worker
