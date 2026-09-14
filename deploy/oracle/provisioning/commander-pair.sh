#!/usr/bin/env bash
# One-time Desktop Commander device authorization for oracle-admin.
#
#   sudo -u ubuntu dial-commander-pair
#
# `desktop-commander remote` uses an OAuth 2.0 device-authorization flow (RFC 8628)
# with PKCE. It prints a verification URL and a short user code; the owner approves
# it in a browser under their own Commander account. Nothing secret is ever typed
# into this host, into cloud-init, or into the repository — the host only receives
# the resulting device credential, which lands in ~/.desktop-commander-device/.
#
# The device registers under os.hostname(), which is why the instance hostname is
# `oracle-admin`: that is the name that appears in the client device list.
#
# Once the credential exists, this script stops the temporary authorization process
# and hands the session to the supervised systemd unit, which is what keeps the
# device online across reboots and across the owner closing this terminal.

set -euo pipefail

BIN=/opt/dial-recovery/commander/node_modules/.bin/desktop-commander
CRED_DIR="$HOME/.desktop-commander-device"
CRED="$CRED_DIR/device.json"
UNIT=dial-commander-remote.service
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

[[ -x $BIN ]] || { echo "Desktop Commander is not installed at $BIN (bootstrap PHASE 6 did not complete)." >&2; exit 1; }

install -d -m 700 "$CRED_DIR"

if [[ -f $CRED ]]; then
  echo "Device credential already present at $CRED"
  echo "Re-pairing? Remove it first with: $BIN remote --logout"
else
  echo "Starting device authorization. Approve the code shown below in your browser."
  echo "The session persistence default is ON, so this is a one-time step."
  echo
  # WHY THIS IS NOT A PLAIN FOREGROUND CALL
  #
  # `desktop-commander remote` does not exit once the credential is saved — it goes on
  # to serve the device session. Running it as `timeout 600 … remote` therefore left an
  # UNSUPERVISED process serving the device for ten minutes after pairing, and the
  # systemd unit was only enabled once that timeout expired. Two failures came out of
  # that: the device looked online while nothing was supervising it, and if the owner
  # closed the terminal (or the SSH session dropped) the process died with no unit
  # behind it and the host went dark again.
  #
  # So: run it detached, show its output live so the owner can still read the URL and
  # code, and take it down the moment the credential is on disk. The supervised unit
  # below is then the only thing holding the session.
  log="$(mktemp "${TMPDIR:-/tmp}/dial-commander-pair.XXXXXX")"
  "$BIN" remote >"$log" 2>&1 &
  pair_pid=$!
  tail -n +1 -f "$log" & tail_pid=$!
  # Neither helper may outlive this script, however it ends.
  # shellcheck disable=SC2064
  trap "kill $tail_pid $pair_pid 2>/dev/null || true; rm -f '$log'" EXIT INT TERM

  deadline=$(( SECONDS + ${DIAL_PAIR_TIMEOUT:-600} ))
  while (( SECONDS < deadline )); do
    if [[ -f $CRED ]]; then
      # The file appears before it is finished being written; wait for it to parse.
      for _ in 1 2 3 4 5; do
        if jq -e 'type == "object" and length > 0' "$CRED" >/dev/null 2>&1; then break; fi
        sleep 1
      done
      break
    fi
    kill -0 "$pair_pid" 2>/dev/null || break   # it gave up or failed; report below
    sleep 2
  done

  kill "$tail_pid" 2>/dev/null || true
  # Hand the session over. SIGTERM is what systemd would send it anyway.
  kill "$pair_pid" 2>/dev/null || true
  wait "$pair_pid" 2>/dev/null || true
  trap - EXIT INT TERM
  rm -f "$log"
  echo
fi

if [[ -f $CRED ]]; then
  chmod 700 "$CRED_DIR"; chmod 600 "$CRED"
  echo "Credential stored with owner-only permissions."
  systemctl --user daemon-reload || true
  systemctl --user enable --now "$UNIT"
  sleep 5
  systemctl --user is-active "$UNIT" >/dev/null && echo "$UNIT is active — device should now show as ONLINE." \
    || { echo "$UNIT did not come up; inspect: journalctl --user -u $UNIT -n 50" >&2; exit 1; }
else
  echo "No credential was saved — authorization did not complete." >&2
  echo "SSH and OCI Run Command are unaffected. Re-run this script to retry." >&2
  exit 2
fi
