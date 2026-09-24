#!/usr/bin/env bash
# Netcup activation gate (owner decision auth-20260924-owner-netcup-bootstrap-latest-pins-watch:
# "install now, services off"). Every DIAL/Hermes user unit may be installed and enabled by the repo
# installers before cutover, but none may start while the old Oracle control is still authoritative:
# a second Hermes/WhatsApp/Commander session would compete with the live one.
#
#   install  write prefix drop-ins so dial-*, hermes-* and dde-* units start only once activated
#   status   report the gate and any gated unit that is running anyway
#   open     create the activation marker (postboot-converge.sh --activate does this)
set -Eeuo pipefail
umask 077

MODE="${1:-status}"
CONTROL="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
MARKER="$CONTROL/state/netcup-activated"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
PREFIXES=(dial- hermes- dde-)
KINDS=(service timer path socket)
DROPIN=10-dial-netcup-activation-gate.conf

[[ "$(id -un)" != root ]] || { echo "ACTIVATION_GATE_REFUSED: run as the service user, not root" >&2; exit 2; }

gated_running() {
  systemctl --user list-units --state=active --no-legend --plain 2>/dev/null \
    | awk '{print $1}' | grep -E '^(dial-|hermes-|dde-)' || true
}

case "$MODE" in
  install)
    for p in "${PREFIXES[@]}"; do
      for k in "${KINDS[@]}"; do
        d="$UNIT_DIR/$p.$k.d"
        install -d -m 0755 "$d"
        printf '[Unit]\n# Written by activation-gate.sh; removed only by owner decision, opened by the marker.\nConditionPathExists=%s\n' "$MARKER" >"$d/$DROPIN.tmp"
        mv "$d/$DROPIN.tmp" "$d/$DROPIN"
      done
    done
    systemctl --user daemon-reload
    echo "ACTIVATION_GATE=INSTALLED marker=$MARKER present=$([[ -e "$MARKER" ]] && echo yes || echo no)"
    ;;
  status)
    echo "ACTIVATION_GATE=$([[ -f "$UNIT_DIR/dial-.service.d/$DROPIN" ]] && echo INSTALLED || echo ABSENT) marker_present=$([[ -e "$MARKER" ]] && echo yes || echo no)"
    running="$(gated_running)"
    echo "GATED_UNITS_RUNNING=${running:+$(tr '\n' ' ' <<<"$running")}"
    ;;
  open)
    install -d -m 0700 "$CONTROL/state"
    date -u +%FT%TZ >"$MARKER"
    echo "ACTIVATION_GATE=OPEN"
    ;;
  *) echo "usage: $0 install|status|open" >&2; exit 2 ;;
esac
