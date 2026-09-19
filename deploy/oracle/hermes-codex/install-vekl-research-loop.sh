#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-/home/ubuntu/work/dial-green-closure.tmp}"
WORKER="${DIAL_VEKL_WORKER_SSH:-vekl-worker}"
STATE_DIR="${HOME}/.local/state/dial-control-plane/vekl-pg"
UNIT_DIR="${HOME}/.config/systemd/user"
UNIT="${UNIT_DIR}/dial-vekl-research-db-tunnel.service"

fail(){ echo "ERROR: $*" >&2; exit 1; }
ssh -o BatchMode=yes "$WORKER" true || fail "vekl-worker SSH unavailable"
test -f "$REPO/agent-system/orchestration/vekl-research-seed.mjs" || fail "research seeder missing"
mkdir -p "$STATE_DIR" "$UNIT_DIR"
chmod 700 "$STATE_DIR"

cat > "$UNIT" <<UNIT_EOF
[Unit]
Description=DIAL VEKL research PostgreSQL socket tunnel to authoritative vekl-worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStartPre=/usr/bin/mkdir -p ${STATE_DIR}
ExecStartPre=/usr/bin/rm -f ${STATE_DIR}/.s.PGSQL.5432
ExecStart=/usr/bin/ssh -NT -o BatchMode=yes -o ExitOnForwardFailure=yes -o StreamLocalBindUnlink=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L ${STATE_DIR}/.s.PGSQL.5432:/var/run/postgresql/.s.PGSQL.5432 ${WORKER}
Restart=always
RestartSec=3
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
Environment=PATH=${HOME}/.local/bin:${HOME}/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${STATE_DIR}

[Install]
WantedBy=default.target
UNIT_EOF

systemctl --user daemon-reload
systemctl --user enable --now dial-vekl-research-db-tunnel.service
for _ in $(seq 1 20); do
  [[ -S "$STATE_DIR/.s.PGSQL.5432" ]] && break
  sleep 1
done
[[ -S "$STATE_DIR/.s.PGSQL.5432" ]] || fail "VEKL research PostgreSQL socket tunnel not ready"

cd "$REPO"
COUNTS="$(PGHOST="$STATE_DIR" psql -XAt -U dial_research_loop -d dial_vekl -c "select (select count(*) from vekl_research_missions),(select count(*) from vekl_research_packets),(select count(*) from vekl_research_coverage),(select count(*) from vekl_research_evidence);")"
IFS='|' read -r MISSIONS PACKETS CELLS EVIDENCE <<<"$COUNTS"
if [[ "$MISSIONS" == "0" && "$PACKETS" == "0" && "$CELLS" == "0" ]]; then
  DIAL_VEKL_PG_SOCKET_DIR="$STATE_DIR" \
  DIAL_VEKL_DATABASE=dial_vekl \
  DIAL_VEKL_DATABASE_USER=dial_research_loop \
  DIAL_VEKL_DATABASE_HOST_ROLE=vekl-worker \
  DIAL_VEKL_DATABASE_ROLE=AUTHORITATIVE_VEKL \
  node agent-system/orchestration/vekl-research-seed.mjs
elif [[ "$MISSIONS" == "1" && "$PACKETS" == "309" && "$CELLS" == "5253" ]]; then
  echo "Existing canonical VEKL research mission preserved (evidence=$EVIDENCE)."
else
  fail "unexpected research database state: missions=$MISSIONS packets=$PACKETS cells=$CELLS evidence=$EVIDENCE"
fi

if systemctl --user cat dial-chat-control.service >/dev/null 2>&1; then
  mkdir -p "$UNIT_DIR/dial-chat-control.service.d"
  cat > "$UNIT_DIR/dial-chat-control.service.d/research-db.conf" <<DROPIN
[Unit]
After=dial-vekl-research-db-tunnel.service
Requires=dial-vekl-research-db-tunnel.service

[Service]
Environment=DIAL_VEKL_PG_SOCKET_DIR=${STATE_DIR}
Environment=DIAL_VEKL_DATABASE=dial_vekl
Environment=DIAL_VEKL_DATABASE_USER=dial_research_loop
Environment=DIAL_VEKL_DATABASE_HOST_ROLE=vekl-worker
Environment=DIAL_VEKL_DATABASE_ROLE=AUTHORITATIVE_VEKL
DROPIN
  systemctl --user daemon-reload
  systemctl --user restart dial-chat-control.service
fi

echo DIAL_VEKL_RESEARCH_LOOP_READY
echo database_host=vekl-worker
echo database=dial_vekl
echo development_units=309
echo research_dimensions=17
echo coverage_cells=5253
echo research_roles=18
