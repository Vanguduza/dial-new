#!/usr/bin/env bash
set -euo pipefail
umask 077

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
HERMES_DIR="${HERMES_HOME:-${HOME}/.hermes/hermes-agent}"
SESSION="${HERMES_WHATSAPP_SESSION:-${HOME}/.hermes/whatsapp/session}"
PAIR_HOME="${CONTROL_HOME}/operator-channels/whatsapp/pair-runtime"
EVENTS="${CONTROL_HOME}/operator-channels/pairing-events.jsonl"
PID_FILE="${PAIR_HOME}/pairer.pid"
LOCK_FILE="${PAIR_HOME}/pairer.lock"
PAIR_SOURCE="${DIAL_WHATSAPP_PAIR_BAILEYS_SOURCE:-github:doryani-ai/Baileys#4f263f0e365c2e74dd1b824031d1c5910f518c26}"
MODE="${1:---foreground}"

fail(){ echo "ERROR: $*" >&2; exit 1; }
log(){ printf '[dial-whatsapp-pair] %s\n' "$*"; }
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

paired(){
  node - "$SESSION/creds.json" <<'NODE' >/dev/null 2>&1
const fs=require('fs'); const p=process.argv[2];
const c=JSON.parse(fs.readFileSync(p,'utf8'));
process.exit(c?.me?.id || c?.me?.lid ? 0 : 1);
NODE
}
stop_pairers(){
  if [[ -f "$PID_FILE" ]]; then
    local pid; pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    [[ "$pid" =~ ^[0-9]+$ ]] && kill "$pid" 2>/dev/null || true
  fi
  while read -r pid; do
    [[ "$pid" == "$$" ]] || kill "$pid" 2>/dev/null || true
  done < <(pgrep -f "bridge.*--pair-only.*--session ${SESSION}" 2>/dev/null || true)
  rm -f "$PID_FILE"
}

stop_live_bridge(){
  systemctl --user stop dial-hermes-whatsapp-bridge.path dial-hermes-whatsapp-bridge.service 2>/dev/null || true
}

restart_live_bridge(){
  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user start dial-hermes-whatsapp-bridge.path 2>/dev/null || true
  if paired; then
    systemctl --user restart dial-hermes-whatsapp-bridge.service dial-hermes-whatsapp-operator.service 2>/dev/null || true
  fi
}

prepare_runtime(){
  command -v node >/dev/null || fail "node is required"
  command -v npm >/dev/null || fail "npm is required"
  [[ -f "$HERMES_DIR/scripts/whatsapp-bridge/bridge.js" ]] || fail "Hermes WhatsApp bridge missing"
  mkdir -p "$PAIR_HOME" "$SESSION"
  chmod 700 "$PAIR_HOME" "$SESSION"
  local src="$HERMES_DIR/scripts/whatsapp-bridge"
  cp "$src/bridge.js" "$PAIR_HOME/bridge.mjs"
  cp "$src/allowlist.js" "$src/bridge_helpers.js" "$src/outbound_ids.js" "$src/owner_message_gate.js" "$PAIR_HOME/"
  sed -i "s/from '@whiskeysockets\/baileys'/from 'baileys'/" "$PAIR_HOME/bridge.mjs"

  cat >"$PAIR_HOME/package.json" <<JSON
{"name":"dial-hermes-whatsapp-pair-runtime","private":true,"type":"module","dependencies":{"baileys":"${PAIR_SOURCE}","express":"^4.21.0","pino":"^9.0.0","qrcode-terminal":"^0.12.0"}}
JSON
  local marker="$PAIR_HOME/.pair-source"
  if [[ ! -d "$PAIR_HOME/node_modules/baileys" || ! -f "$marker" || "$(cat "$marker" 2>/dev/null || true)" != "$PAIR_SOURCE" ]]; then
    log "preparing isolated patched pairing runtime"
    (cd "$PAIR_HOME" && npm install --no-audit --no-fund)
    printf '%s' "$PAIR_SOURCE" >"$marker"
  fi

  grep -q 'companion_reg_refresh' "$PAIR_HOME/node_modules/baileys/lib/Socket/socket.js" || fail "pairing runtime lacks companion registration refresh support"
  node - "$PAIR_HOME/node_modules/baileys/lib/Socket/messages-recv.js" <<'NODE'
const fs=require('fs'); const p=process.argv[2]; let s=fs.readFileSync(p,'utf8');
const old='buildAckStanza(node, errorCode, authState.creds.me.id)';
if(s.includes(old)){s=s.replace(old,'buildAckStanza(node, errorCode, authState.creds.me?.id)');fs.writeFileSync(p,s);}
if(!s.includes('buildAckStanza(node, errorCode, authState.creds.me?.id)')) throw new Error('pre-login ACK compatibility patch missing');
NODE
}
status(){
  if paired; then echo '{"state":"PAIRED"}'; return 0; fi
  local running=false
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE" 2>/dev/null || echo 0)" 2>/dev/null; then running=true; fi
  node - "$EVENTS" "$running" <<'NODE'
const fs=require('fs'); const p=process.argv[2], running=process.argv[3]==='true';
let last=null; try{for(const line of fs.readFileSync(p,'utf8').split(/\n+/)){if(!line.trim())continue;try{const e=JSON.parse(line);last={event:e.event,reason:e.reason??null,ts:e.ts??null};}catch{}}}catch{}
console.log(JSON.stringify({state:running?'PAIRING':'UNPAIRED',running,last_event:last}));
NODE
}

case "$MODE" in
  --status) status; exit 0 ;;
  --stop) stop_pairers; restart_live_bridge; log "pairing stopped"; exit 0 ;;
  --background)
    mkdir -p "$PAIR_HOME"
    nohup "$0" --foreground >"$PAIR_HOME/pair-command.log" 2>&1 &
    log "pairing started in background; use $0 --status"
    exit 0
    ;;
  --foreground) ;;
  *) fail "usage: $0 [--foreground|--background|--status|--stop]" ;;
esac

prepare_runtime
if paired; then log "WhatsApp is already paired; refusing to replace valid credentials"; exit 0; fi
command -v flock >/dev/null || fail "flock is required"
exec 9>"$LOCK_FILE"
flock -n 9 || fail "another WhatsApp pairing attempt is already active"
stop_pairers
stop_live_bridge
# A failed/abandoned unpaired attempt must not seed the next QR session.
if compgen -G "$SESSION/*" >/dev/null; then
  log "clearing incomplete unpaired session state"
  find "$SESSION" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
fi
mkdir -p "$(dirname "$EVENTS")"
: >"$EVENTS"
chmod 600 "$EVENTS"
printf '%s' "$$" >"$PID_FILE"

cleanup(){
  rm -f "$PID_FILE"
  restart_live_bridge
}
trap cleanup EXIT INT TERM

log "waiting for owner pairing; QR payloads are written only to the protected event file"
set +e
WHATSAPP_MODE=self-chat node "$PAIR_HOME/bridge.mjs" \
  --pair-only --pair-json --session "$SESSION" | tee "$EVENTS"
rc=${PIPESTATUS[0]}
set -e

if paired; then
  log "pairing complete; credentials saved outside Git"
  exit 0
fi
log "pairing ended without valid credentials (exit ${rc})"
exit "${rc:-1}"
