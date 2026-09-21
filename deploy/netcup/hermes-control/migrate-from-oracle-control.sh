#!/usr/bin/env bash
set -euo pipefail

# Two-pass transfer. PREPARE copies while the old control remains live. CUTOVER
# quiesces the old DIAL/Hermes services, takes transaction-consistent Hermes state,
# performs a final delta, then verifies the new host. This script NEVER terminates OCI.
MODE="${1:-}"
OLD_HOST="${OLD_DIAL_CONTROL_HOST:-}"
OLD_USER="${OLD_DIAL_CONTROL_USER:-ubuntu}"
NEW_REPO="${DIAL_REPO_DIR:-$HOME/dial-new}"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="$CONTROL_HOME/migration/netcup-$STAMP"

die(){ echo "MIGRATION_REFUSED: $*" >&2; exit 2; }
[[ "$MODE" == "--prepare" || "$MODE" == "--cutover" ]] || die "usage: OLD_DIAL_CONTROL_HOST=<address> $0 --prepare|--cutover"
[[ -n "$OLD_HOST" ]] || die "OLD_DIAL_CONTROL_HOST is required"
[[ "$(hostname)" == dial-control ]] || die "run on the new Dial Control host"
[[ -f /etc/dial/host-role ]] && grep -q '^ROLE=CONTROL_AUTHORITY$' /etc/dial/host-role || die "CONTROL_AUTHORITY role missing"
[[ -d "$NEW_REPO/.git" ]] || die "canonical repository missing at $NEW_REPO"
command -v rsync >/dev/null || die "rsync required"
command -v ssh >/dev/null || die "ssh required"

SSH=(ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "${OLD_USER}@${OLD_HOST}")
RSYNC_SSH="ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"
"${SSH[@]}" 'hostname; test -d /var/lib/dial-control; test -d "$HOME/.hermes"' >/dev/null || die "old control preflight failed"

sudo install -d -m 0700 -o "$USER" -g "$USER" "$EVIDENCE"
old_head="$("${SSH[@]}" 'cd "$HOME/dial-new" && git rev-parse HEAD 2>/dev/null || echo UNKNOWN')"
new_head="$(cd "$NEW_REPO" && git rev-parse HEAD)"
printf '{"mode":"%s","old_host":"%s","old_repo_head":"%s","new_repo_head":"%s","started_at":"%s"}\n'   "$MODE" "$OLD_HOST" "$old_head" "$new_head" "$(date -u +%FT%TZ)" >"$EVIDENCE/session.json"

copy_state(){
  sudo rsync -aH --numeric-ids -e "$RSYNC_SSH"     "${OLD_USER}@${OLD_HOST}:/var/lib/dial-control/" "$CONTROL_HOME/"
  sudo chown -R "$USER:$USER" "$CONTROL_HOME"
  sudo chmod 0700 "$CONTROL_HOME"
}
copy_identity(){
  for rel in .hermes .codex .claude; do
    mkdir -p "$HOME/$rel"
    rsync -aH -e "$RSYNC_SSH" "${OLD_USER}@${OLD_HOST}:$rel/" "$HOME/$rel/"
  done
  # Reuse the already-authorized owner Commander device session when present so the
  # new host does not require a second manual device-code pairing.
  if "${SSH[@]}" 'test -d "$HOME/.desktop-commander-device"' >/dev/null 2>&1; then
    mkdir -p "$HOME/.desktop-commander-device"
    rsync -aH -e "$RSYNC_SSH" "${OLD_USER}@${OLD_HOST}:.desktop-commander-device/" "$HOME/.desktop-commander-device/"
  fi
  # Claude may store subscription state beneath XDG config as well as ~/.claude.
  if "${SSH[@]}" 'test -d "$HOME/.config/claude"' >/dev/null 2>&1; then
    mkdir -p "$HOME/.config/claude"
    rsync -aH -e "$RSYNC_SSH" "${OLD_USER}@${OLD_HOST}:.config/claude/" "$HOME/.config/claude/"
  fi
  chmod 0700 "$HOME/.hermes" "$HOME/.codex" "$HOME/.claude" "$HOME/.desktop-commander-device" 2>/dev/null || true
}
snapshot_repo(){
  mkdir -p "$CONTROL_HOME/migration/oracle-repo-snapshot"
  rsync -aH -e "$RSYNC_SSH"     --exclude node_modules --exclude '.cache'     "${OLD_USER}@${OLD_HOST}:dial-new/" "$CONTROL_HOME/migration/oracle-repo-snapshot/"
}

if [[ "$MODE" == "--prepare" ]]; then
  copy_state
  copy_identity
  snapshot_repo
  find "$CONTROL_HOME" -xdev -type f -printf '%P\n' | LC_ALL=C sort | sha256sum | awk '{print $1}' >"$EVIDENCE/control-file-list.sha256"
  echo "MIGRATION_PREPARE=COMPLETE"
  echo "OLD_CONTROL_REMAINS_AUTHORITATIVE=TRUE"
  exit 0
fi

# CUTOVER: freeze writes at source before final delta.
"${SSH[@]}" 'set -e
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  for u in dial-owner-steering.service dial-mission-controller.service dial-chat-control.service dial-hermes-orchestrator.service dial-hermes-runtime.service dial-hermes-operations.service dial-private-mcp-bind.service dial-remote-mcp-relay.service; do
    systemctl --user stop "$u" >/dev/null 2>&1 || true
  done
  if command -v sqlite3 >/dev/null 2>&1 && [ -f "$HOME/.hermes/state.db" ]; then
    mkdir -p /var/lib/dial-control/sessions/hermes/backups
    sqlite3 "$HOME/.hermes/state.db" ".backup /var/lib/dial-control/sessions/hermes/backups/state.db.migration-final"
    chmod 600 /var/lib/dial-control/sessions/hermes/backups/state.db.migration-final
  fi
  printf "%s\n" "$(date -u +%FT%TZ)" >/var/lib/dial-control/state/migration-source-quiesced-at
'
copy_state
copy_identity
snapshot_repo

cd "$NEW_REPO"
./ops/development-bootstrap/bootstrap.sh --repair --role dial-hermes-control --profile CORE_DEVELOPMENT || true
./ops/development-bootstrap/bootstrap.sh --verify --role dial-hermes-control --profile CORE_DEVELOPMENT --json >"$EVIDENCE/netcup-core-verification.json" || true

python3 - "$EVIDENCE/netcup-core-verification.json" <<'PY'
import json,sys
p=sys.argv[1]
try:
    d=json.load(open(p))
except Exception as e:
    raise SystemExit("MIGRATION_BLOCKED: unreadable Netcup verification: "+str(e))
status=d.get("overall_status") or d.get("status") or d.get("verdict")
if status not in ("GREEN","PASS","VERIFIED_SUCCESS"):
    raise SystemExit("MIGRATION_BLOCKED: Netcup CORE_DEVELOPMENT is not green: "+str(status))
PY

printf '%s\n' "$(date -u +%FT%TZ)" >"$EVIDENCE/cutover-verified-at"
echo "MIGRATION_CUTOVER=VERIFIED"
echo "OLD_CONTROL_QUIESCED=TRUE"
echo "OCI_TERMINATION_ALLOWED_ONLY_AFTER_OWNER_CONTROL_RECOVERY_AND_PROVIDER_AUTH_GATES_PASS=TRUE"
