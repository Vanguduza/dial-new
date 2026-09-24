#!/usr/bin/env bash
set -euo pipefail

EXPECTED_HOST="${DIAL_HERMES_HOST_ID:-dial-hermes-control}"
PREFIX="${DIAL_OWNER_COMMANDER_PREFIX:-$HOME/.local/share/dial/desktop-commander}"
BIN="$PREFIX/node_modules/.bin/desktop-commander"
CRED_DIR="$HOME/.desktop-commander-device"
CRED="$CRED_DIR/device.json"
UNIT="dial-owner-commander-remote.service"

[[ "$(hostname)" == "$EXPECTED_HOST" || "$(hostname)" == dial-control ]] || { echo "REFUSE: pairing belongs on $EXPECTED_HOST" >&2; exit 3; }
[[ -x "$BIN" ]] || { echo "Desktop Commander is not installed at $BIN" >&2; exit 2; }
mkdir -p "$CRED_DIR"; chmod 700 "$CRED_DIR"

if [[ -s "$CRED" ]]; then
  chmod 600 "$CRED"
  systemctl --user reset-failed "$UNIT" || true
  systemctl --user restart "$UNIT"
  echo "PAIRING_ALREADY_PRESENT"
  exit 0
fi

log="$(mktemp "${TMPDIR:-/tmp}/dial-owner-commander-pair.XXXXXX")"
"$BIN" remote >"$log" 2>&1 &
pid=$!
tail -n +1 -f "$log" &
tail_pid=$!
cleanup(){ kill "$tail_pid" "$pid" 2>/dev/null || true; rm -f "$log"; }
trap cleanup EXIT INT TERM

deadline=$((SECONDS + ${DIAL_PAIR_TIMEOUT:-600}))
while (( SECONDS < deadline )); do
  if [[ -s "$CRED" ]] && jq -e 'type=="object" and length>0' "$CRED" >/dev/null 2>&1; then break; fi
  kill -0 "$pid" 2>/dev/null || break
  sleep 2
done

[[ -s "$CRED" ]] || { echo "PAIRING_FAILED: no device credential was saved" >&2; exit 2; }
chmod 600 "$CRED"
kill "$tail_pid" "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
trap - EXIT INT TERM
rm -f "$log"

systemctl --user daemon-reload
systemctl --user reset-failed "$UNIT" || true
systemctl --user enable --now "$UNIT"
sleep 5
systemctl --user is-active --quiet "$UNIT"
echo "PAIRING_GREEN: $UNIT active"
