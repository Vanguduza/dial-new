#!/usr/bin/env bash
set -uo pipefail
UNIT="dial-owner-commander-remote.service"
CRED="$HOME/.desktop-commander-device/device.json"
ok=1

if systemctl --user is-active --quiet "$UNIT"; then echo "PROCESS_UP=GREEN"; else echo "PROCESS_UP=RED"; ok=0; fi
if [[ -s "$CRED" ]] && jq -e 'type=="object" and length>0' "$CRED" >/dev/null 2>&1; then
  mode="$(stat -c '%a' "$CRED" 2>/dev/null || echo 000)"
  if [[ "$mode" == 600 || "$mode" == 400 ]]; then echo "SESSION_VALID=GREEN"; else echo "SESSION_VALID=RED"; ok=0; fi
else
  echo "SESSION_VALID=RED"; ok=0
fi

pid="$(systemctl --user show "$UNIT" -p MainPID --value 2>/dev/null || true)"
if [[ "$pid" =~ ^[1-9][0-9]*$ ]] && command -v ss >/dev/null 2>&1 && ss -H -tnp state established 2>/dev/null | grep -F "pid=$pid," | grep -qE ':443([[:space:]]|$)'; then
  echo "REMOTE_REGISTERED=GREEN"
else
  echo "REMOTE_REGISTERED=UNVERIFIED"
fi

exit $(( ok ? 0 : 1 ))
