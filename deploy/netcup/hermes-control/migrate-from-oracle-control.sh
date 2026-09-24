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
# PREPARE copies while the old control is live, so files vanishing mid-transfer (rsync 24, e.g.
# ~/.codex/tmp locks) are expected there; CUTOVER quiesces first and still fails on them.
tolerate_live(){
  local rc=0
  "$@" || rc=$?
  if [[ "$rc" == 24 && "$MODE" == "--prepare" ]]; then
    echo "MIGRATION_PREPARE_VANISHED_FILES_TOLERATED" >&2
    return 0
  fi
  return "$rc"
}
"${SSH[@]}" 'hostname; test -d /var/lib/dial-control; test -d "$HOME/.hermes"' >/dev/null || die "old control preflight failed"

sudo install -d -m 0700 -o "$USER" -g "$USER" "$EVIDENCE"
old_head="$("${SSH[@]}" 'cd "$HOME/dial-new" && git rev-parse HEAD 2>/dev/null || echo UNKNOWN')"
new_head="$(cd "$NEW_REPO" && git rev-parse HEAD)"
printf '{"mode":"%s","old_host":"%s","old_repo_head":"%s","new_repo_head":"%s","started_at":"%s"}\n'   "$MODE" "$OLD_HOST" "$old_head" "$new_head" "$(date -u +%FT%TZ)" >"$EVIDENCE/session.json"

copy_state(){
  # Some control state is owned by service users (n8n-dev secrets are opc:opc 0400), so the old
  # side must read under sudo as well. Assign ownership during the transfer: uids differ between
  # hosts (old ubuntu=1001 is vanforge on Netcup), and preserving numeric ids left the live control home
  # owned by vanforge when a pass stopped before the chown below (2026-09-24).
  tolerate_live sudo rsync -aH --chown="$USER:$USER" -e "$RSYNC_SSH" --rsync-path='sudo -n rsync' \
    --exclude 'github-oidc/' --exclude 'bootstrap/' --exclude '/execution/fabric-audit.jsonl' \
    "${OLD_USER}@${OLD_HOST}:/var/lib/dial-control/" "$CONTROL_HOME/"
  # The execution-fabric audit is append-only (chattr +a, phase5-install-providers.sh): root can
  # neither chown it nor rsync-replace it. Dial Control keeps its own audit trail (excluded above;
  # the old host's stays on the retained source), and only entries with the wrong owner are chowned,
  # which skips the service user's own append-only files.
  sudo find "$CONTROL_HOME" -xdev ! -user "$USER" -exec chown -h "$USER:$USER" {} +
  sudo chmod 0700 "$CONTROL_HOME"
}
copy_identity(){
  for rel in .hermes .codex .claude; do
    if "${SSH[@]}" "test -d \"\$HOME/$rel\"" >/dev/null 2>&1; then
      mkdir -p "$HOME/$rel"
      # ~/.hermes/bin (uv, uvx, tirith) and ~/.hermes/hermes-agent (source + venv with native wheels) are
      # built for the old host's CPU (aarch64 A1) and fail on Netcup x86_64 with exit 126; the pinned Hermes
      # installer rebuilds them. Everything else in ~/.hermes is portable state and is copied.
      excludes=()
      [[ "$rel" == .hermes ]] && excludes=(--exclude '/bin/' --exclude '/hermes-agent/')
      tolerate_live rsync -aH -e "$RSYNC_SSH" "${excludes[@]}" "${OLD_USER}@${OLD_HOST}:$rel/" "$HOME/$rel/"
    fi
  done
  # Keep the dedicated Netcup recovery identity if GitHub already installed it.
  # Only fall back to the old host's OCI identity when the new host has none.
  if [[ ! -s "$HOME/.oci/config" ]] && "${SSH[@]}" 'test -d "$HOME/.oci"' >/dev/null 2>&1; then
    mkdir -p "$HOME/.oci"
    tolerate_live rsync -aH -e "$RSYNC_SSH" "${OLD_USER}@${OLD_HOST}:.oci/" "$HOME/.oci/"
  fi
  # Reuse the already-authorized owner Commander device session when present so the
  # new host does not require a second manual device-code pairing.
  if "${SSH[@]}" 'test -d "$HOME/.desktop-commander-device"' >/dev/null 2>&1; then
    mkdir -p "$HOME/.desktop-commander-device"
    tolerate_live rsync -aH -e "$RSYNC_SSH" "${OLD_USER}@${OLD_HOST}:.desktop-commander-device/" "$HOME/.desktop-commander-device/"
  fi
  # GitHub CLI authentication is migrated so the new host can register its
  # repository-scoped admin runner without another owner login.
  if "${SSH[@]}" 'test -d "$HOME/.config/gh"' >/dev/null 2>&1; then
    mkdir -p "$HOME/.config/gh"
    tolerate_live rsync -aH -e "$RSYNC_SSH" "${OLD_USER}@${OLD_HOST}:.config/gh/" "$HOME/.config/gh/"
  fi
  # Stitch uses Google ADC on the existing control host. Carry the already
  # authorized ADC/config rather than requiring a new browser login.
  if "${SSH[@]}" 'test -d "$HOME/.config/gcloud"' >/dev/null 2>&1; then
    mkdir -p "$HOME/.config/gcloud"
    tolerate_live rsync -aH -e "$RSYNC_SSH" "${OLD_USER}@${OLD_HOST}:.config/gcloud/" "$HOME/.config/gcloud/"
  fi
  # Claude may store subscription state beneath XDG config as well as ~/.claude.
  if "${SSH[@]}" 'test -d "$HOME/.config/claude"' >/dev/null 2>&1; then
    mkdir -p "$HOME/.config/claude"
    tolerate_live rsync -aH -e "$RSYNC_SSH" "${OLD_USER}@${OLD_HOST}:.config/claude/" "$HOME/.config/claude/"
  fi
  chmod 0700 "$HOME/.hermes" "$HOME/.codex" "$HOME/.claude" "$HOME/.oci" "$HOME/.desktop-commander-device" "$HOME/.config/gh" "$HOME/.config/gcloud" 2>/dev/null || true
}
snapshot_repo(){
  mkdir -p "$CONTROL_HOME/migration/oracle-repo-snapshot"
  tolerate_live rsync -aH -e "$RSYNC_SSH"     --exclude node_modules --exclude '.cache'     "${OLD_USER}@${OLD_HOST}:dial-new/" "$CONTROL_HOME/migration/oracle-repo-snapshot/"
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
