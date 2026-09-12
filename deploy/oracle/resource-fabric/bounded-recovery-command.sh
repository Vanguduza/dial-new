#!/usr/bin/env bash
# Forced command for the bounded-recovery identity (Rev 3 sections 5.2 and 5.4).
#
# This runs on an E2 admin host as the forced command behind the authorized_keys entry
# used by dial-hermes-control. It is the entire reason the second recovery direction is
# safe: Hermes holds a key into the recovery tier, and this script is what that key can do.
#
# The permitted verb set is R0 (observe) plus R1 restart of the target's own recovery
# units, and nothing else. It is a fixed table matched on the whole command string. There
# is no shell, no argument interpolation, no wildcard, no pass-through, and no way to add
# a verb from the calling side.
#
# Refused: anything not in the table -- reboots, package changes, firewall changes, key
# material, volume operations, file reads, sudo, and an interactive session.
#
# Exit codes: the verb's own status on success, 3 refused, 4 no command supplied.

set -uo pipefail

LOG="${DIAL_BOUNDED_RECOVERY_LOG:-/var/log/dial-bounded-recovery.log}"

audit() {
  # Every attempt is recorded, permitted or not. A refusal that leaves no trace teaches
  # nobody anything, and this is the one path into the recovery tier from outside it.
  printf '%s peer=%s verdict=%s cmd=%q\n' \
    "$(date -u +%FT%TZ)" "${SSH_CONNECTION%% *}" "$1" "${2:-}" >>"$LOG" 2>/dev/null || true
}

cmd="${SSH_ORIGINAL_COMMAND:-}"

if [[ -z "$cmd" ]]; then
  audit REFUSED_NO_COMMAND ''
  echo "dial-bounded-recovery: this identity has no interactive shell." >&2
  exit 4
fi

# Units this identity may restart. Deliberately narrower than APPROVED_SERVICES in
# recovery-agent.mjs: Hermes restarts a stuck E2's recovery plane so the E2 can resume
# recovering itself and its peer. It does not operate the E2.
RESTARTABLE=("dial-recovery-agent.service" "dial-host-agent.timer")

# Units this identity may read the state of. A superset of RESTARTABLE: observing is R0.
READABLE=("dial-recovery-agent.service" "dial-host-agent.timer" "dial-host-agent.service"
          "dial-recovery.slice" "dial-resource-scheduler.service")

in_list() {
  local needle="$1"; shift
  local item
  for item in "$@"; do [[ "$item" == "$needle" ]] && return 0; done
  return 1
}

case "$cmd" in
  # --- R0: liveness and read-only diagnostics -------------------------------------
  'true')
    audit ALLOW_R0 "$cmd"; exit 0 ;;
  'systemctl --user is-system-running --wait')
    audit ALLOW_R0 "$cmd"; exec systemctl --user is-system-running --wait ;;
  'uptime')
    audit ALLOW_R0 "$cmd"; exec uptime ;;
  'free -m')
    audit ALLOW_R0 "$cmd"; exec free -m ;;
  'df -h /')
    audit ALLOW_R0 "$cmd"; exec df -h / ;;
  'dial-role-guard --self')
    audit ALLOW_R0 "$cmd"; exec dial-role-guard --self ;;
  'systemctl --user is-active '*)
    unit="${cmd#systemctl --user is-active }"
    if in_list "$unit" "${READABLE[@]}"; then
      audit ALLOW_R0 "$cmd"; exec systemctl --user is-active -- "$unit"
    fi
    audit REFUSED_UNIT_NOT_READABLE "$cmd"; exit 3 ;;
  'systemctl --user status '*)
    unit="${cmd#systemctl --user status }"
    if in_list "$unit" "${READABLE[@]}"; then
      # --no-pager: this is a machine-to-machine channel, never a terminal.
      audit ALLOW_R0 "$cmd"; exec systemctl --user status --no-pager -- "$unit"
    fi
    audit REFUSED_UNIT_NOT_READABLE "$cmd"; exit 3 ;;

  # --- R1: restart an allowlisted recovery unit ------------------------------------
  'systemctl --user restart '*)
    unit="${cmd#systemctl --user restart }"
    if in_list "$unit" "${RESTARTABLE[@]}"; then
      audit ALLOW_R1 "$cmd"; exec systemctl --user restart -- "$unit"
    fi
    audit REFUSED_UNIT_NOT_RESTARTABLE "$cmd"; exit 3 ;;
esac

audit REFUSED_NOT_IN_VERB_SET "$cmd"
echo "dial-bounded-recovery: refused. This identity is limited to R0/R1 recovery verbs." >&2
exit 3
