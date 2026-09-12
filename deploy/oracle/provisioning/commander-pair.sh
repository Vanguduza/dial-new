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
# Once the credential exists, this script hands the session over to the supervised
# systemd unit so the device stays online across reboots.

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
  # Runs in the foreground so the owner can see the URL and code. It exits once the
  # credential is saved; the supervised unit takes over below.
  timeout "${DIAL_PAIR_TIMEOUT:-600}" "$BIN" remote || true
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
