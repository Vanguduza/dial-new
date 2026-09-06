#!/usr/bin/env bash
set -euo pipefail
umask 077
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
SF="$CONTROL_HOME/screen-factory"
RCLONE="${RCLONE_BIN:-$HOME/.local/bin/rclone}"
RCLONE_CONFIG="${DIAL_SCREEN_FACTORY_RCLONE_CONFIG:-$CONTROL_HOME/secrets/rclone.conf}"
STATUS="$SF/storage-status.json"
STORAGE_CONFIG="$SF/storage-config.json"
R2_REMOTE="${DIAL_SCREEN_FACTORY_R2_REMOTE:-dial-r2}"
DRIVE_REMOTE="${DIAL_SCREEN_FACTORY_DRIVE_REMOTE:-dial-drive}"
INTERVAL="${DIAL_SCREEN_FACTORY_STORAGE_INTERVAL_SEC:-120}"
DRIVE_ROOT_FOLDER_ID="$(python3 - "$STORAGE_CONFIG" <<'PYCFG'
import json,sys
try: print((json.load(open(sys.argv[1])) or {}).get("drive_root_folder_id") or "")
except Exception: print("")
PYCFG
)"
DRIVE_ACCOUNT_EMAIL="$(python3 - "$STORAGE_CONFIG" <<'PYCFG'
import json,sys
try: print((json.load(open(sys.argv[1])) or {}).get("drive_account_email") or "")
except Exception: print("")
PYCFG
)"
mkdir -p "$SF/outputs" "$SF/packages" "$SF/platform-packs" "$CONTROL_HOME/secrets"
chmod 700 "$CONTROL_HOME/secrets" 2>/dev/null || true

ts(){ date -u +%Y-%m-%dT%H:%M:%SZ; }
has_remote(){
  [[ -x "$RCLONE" && -f "$RCLONE_CONFIG" ]] || return 1
  "$RCLONE" listremotes --config "$RCLONE_CONFIG" 2>/dev/null | grep -qx "$1:"
}
remote_option_present(){
  local remote="$1" option="$2"
  python3 - "$RCLONE_CONFIG" "$remote" "$option" <<'PYCFG'
import configparser,sys
p,remote,opt=sys.argv[1:]
c=configparser.RawConfigParser(); c.read(p)
print('yes' if c.has_section(remote) and bool((c.get(remote,opt,fallback='') or '').strip()) else 'no')
PYCFG
}
write_status(){
  local r2_cfg="$1" r2_state="$2" gd_cfg="$3" gd_state="$4" err="${5:-}"
  python3 - "$STATUS" "$r2_cfg" "$r2_state" "$gd_cfg" "$gd_state" "$err" "$(ts)" <<'PY'
import json, os, sys
p,r2c,r2s,gdc,gds,err,now=sys.argv[1:]
os.makedirs(os.path.dirname(p),exist_ok=True)
data={"schema_version":1,"authority":"DIAL_HEALTH_SCREEN_FACTORY_STORAGE_SYNC","r2":{"configured":r2c=="true","state":r2s},"google_drive":{"configured":gdc=="true","state":gds},"last_sync_at":now if r2s=="SYNCED" else None,"last_error":err or None,"updated_at":now}
t=p+".partial"
with open(t,"w") as f: json.dump(data,f,indent=2)
os.replace(t,p)
PY
}
copy_common=(--config "$RCLONE_CONFIG" --transfers 2 --checkers 4 --retries 3 --low-level-retries 5 --checksum)
sync_once(){
  local r2_cfg=false gd_cfg=false r2_state=WAITING_AUTH gd_state=WAITING_AUTH err=""
  has_remote "$R2_REMOTE" && r2_cfg=true
  if has_remote "$DRIVE_REMOTE" && [[ "$(remote_option_present "$DRIVE_REMOTE" token)" == yes ]]; then gd_cfg=true; fi
  if [[ "$r2_cfg" == true ]]; then
    r2_state=SYNCING
    if "$RCLONE" mkdir "$R2_REMOTE:dial-health-screen-factory" --config "$RCLONE_CONFIG" \
      && "$RCLONE" copy "$SF/outputs" "$R2_REMOTE:dial-health-screen-factory/v2/live/outputs" "${copy_common[@]}" \
      && "$RCLONE" copy "$SF/packages" "$R2_REMOTE:dial-health-screen-factory/v2/platform-packs" "${copy_common[@]}"; then
      r2_state=SYNCED
    else
      r2_state=ERROR; err="R2_SYNC_FAILED"
    fi
  fi
  if [[ "$gd_cfg" == true ]]; then
    gd_state=SYNCING
    drive_args=("${copy_common[@]}")
    [[ -n "$DRIVE_ROOT_FOLDER_ID" ]] && drive_args+=(--drive-root-folder-id "$DRIVE_ROOT_FOLDER_ID")
    if "$RCLONE" copy "$SF/packages" "$DRIVE_REMOTE:Platform Packs" "${drive_args[@]}"; then
      gd_state=ARCHIVED
    else
      gd_state=ERROR; err="${err:+$err,}GOOGLE_DRIVE_ARCHIVE_FAILED"
    fi
  fi
  if [[ "$r2_state" == SYNCED ]]; then
    find "$SF/platform-packs" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} + 2>/dev/null || true
    if [[ "$gd_cfg" == false || "$gd_state" == ARCHIVED ]]; then
      find "$SF/packages" -maxdepth 1 -type f -name '*.zip' -delete 2>/dev/null || true
    fi
  fi
  write_status "$r2_cfg" "$r2_state" "$gd_cfg" "$gd_state" "$err"
}

if [[ "${1:-}" == "once" ]]; then
  sync_once
  exit 0
fi
while true; do
  sync_once || write_status false ERROR false ERROR STORAGE_SYNC_LOOP_FAILED
  sleep "$INTERVAL"
done
