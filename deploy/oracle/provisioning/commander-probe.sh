#!/usr/bin/env bash
# DIAL_COMMANDER_PROBE implementation for oracle-admin.
#
# Contract (deploy/oracle/resource-fabric/doctor.mjs): print one
# `CRITERION=GREEN|RED` line per criterion in policy.json's
# `desktop_commander_green_requires`. A criterion whose line is ABSENT is read as
# UNVERIFIED, and doctor.mjs refuses to call the host GREEN. That is deliberate and
# is used here: this probe never emits a line it cannot actually establish.
#
#   export DIAL_COMMANDER_PROBE=/usr/local/bin/dial-commander-probe
#   node deploy/oracle/resource-fabric/doctor.mjs
#
# Host-observable criteria  : PROCESS_UP, SESSION_VALID, REMOTE_REGISTERED
# Client-observable criteria: PING_RESPONDS, COMMAND_EXECUTES
#
# The client-observable pair cannot be established from the host. A device that is
# registered outbound still proves nothing about whether the authorized client can
# reach it and run a tool. They are therefore emitted ONLY from a proof file that
# nothing but a genuine Commander tool call can produce — see
# commander-record-proof.sh. Synthesising them from local state is exactly the
# "process exists, therefore healthy" failure the recovery plane exists to avoid.

set -uo pipefail

UNIT=dial-commander-remote.service
CRED="${COMMANDER_CRED:-$HOME/.desktop-commander-device/device.json}"
# /var/lib/dial-recovery itself is root-owned, because it holds bootstrap state. The
# proof is written by the ADMIN user from inside a Commander tool call, so it lives in
# a subdirectory that user owns. It used to sit directly in the root-owned directory,
# where the write always failed and the client criteria could therefore never be
# established on any host — GREEN was unreachable by construction.
PROOF="${COMMANDER_PROOF:-/var/lib/dial-recovery/commander/proof.json}"
PROOF_MAX_AGE="${COMMANDER_PROOF_MAX_AGE:-3600}"
MCP_URL="${MCP_SERVER_URL:-https://mcp.desktopcommander.app}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

emit() { printf '%s=%s\n' "$1" "$2"; }

# --- PROCESS_UP -------------------------------------------------------------
# Meaningful here (unlike under the stdio model) because `remote` really is a
# long-running supervised process holding the outbound session.
if systemctl --user is-active --quiet "$UNIT" 2>/dev/null; then
  emit PROCESS_UP GREEN
else
  emit PROCESS_UP RED
fi

# --- SESSION_VALID ----------------------------------------------------------
if [[ -f $CRED ]] && jq -e 'type == "object" and length > 0' "$CRED" >/dev/null 2>&1; then
  perm="$(stat -c '%a' "$CRED" 2>/dev/null || echo 000)"
  # A credential readable by other local users is not a valid session posture.
  if [[ "$perm" == "600" || "$perm" == "400" ]]; then
    emit SESSION_VALID GREEN
  else
    emit SESSION_VALID RED
    echo "# credential $CRED has mode $perm; expected 600" >&2
  fi
else
  emit SESSION_VALID RED
fi

# --- REMOTE_REGISTERED ------------------------------------------------------
# Registration means the device is holding its outbound session to the Commander
# service RIGHT NOW. Two independent readings, in order of strength.
#
# The live socket is the primary one. The device logs "Device ready:" exactly once,
# when registerDevice() succeeds; the journal on a 1 GB host is size-capped, so on a
# long-lived HEALTHY service that single line eventually rotates away and a journal
# check starts reporting RED precisely because the service has been up a long time.
# That is backwards, and it was the reading being used until 2026-09-13.
#
# The journal remains as a fallback for a freshly started unit on a host without
# `ss`. If neither reading can be taken, the criterion is OMITTED rather than failed:
# doctor.mjs reads an absent criterion as UNVERIFIED, which is the honest answer to
# "I could not look". RED is reserved for "I looked, and it is not registered".

# An established outbound TLS connection owned by the unit's main process. The device
# talks to nothing else, so port 443 from that PID is the session.
registered_via_socket() {
  command -v ss >/dev/null 2>&1 || return 2
  local pid="$1" conns
  [[ -n "$pid" && "$pid" != "0" ]] || return 1
  conns="$(ss -H -tnp state established 2>/dev/null | { grep -F "pid=$pid," || true; })"
  [[ -n "$conns" ]] || return 1
  grep -qE ':443([[:space:]]|$)' <<<"$conns"
}

if ! systemctl --user is-active --quiet "$UNIT" 2>/dev/null; then
  # Not running at all: nothing is registered, and that is established, not inferred.
  emit REMOTE_REGISTERED RED
else
  main_pid="$(systemctl --user show "$UNIT" -p MainPID --value 2>/dev/null || true)"
  registered_via_socket "${main_pid:-0}"; sock=$?

  since="$(systemctl --user show "$UNIT" -p ActiveEnterTimestamp --value 2>/dev/null || true)"
  journal_said_ready=false
  if [[ -n "$since" ]] && journalctl --user -u "$UNIT" --since "$since" --no-pager 2>/dev/null \
       | grep -q 'Device ready:'; then
    journal_said_ready=true
  fi

  if [[ $sock -eq 0 || "$journal_said_ready" == true ]]; then
    emit REMOTE_REGISTERED GREEN
  elif [[ $sock -eq 2 ]]; then
    echo "# ss is not installed and the journal holds no 'Device ready:' line since $since;" >&2
    echo "# REMOTE_REGISTERED left UNVERIFIED rather than failed. Install iproute2 to resolve it." >&2
  else
    emit REMOTE_REGISTERED RED
    echo "# unit is active (PID ${main_pid:-?}) but holds no established :443 session" >&2
  fi
fi

# --- PING_RESPONDS / COMMAND_EXECUTES --------------------------------------
# Emitted only from a proof a real tool call wrote. Absent => UNVERIFIED.
if [[ -f $PROOF ]]; then
  age=$(( $(date +%s) - $(stat -c %Y "$PROOF" 2>/dev/null || echo 0) ))
  # Host-bound on purpose: a proof carried over from a peer certifies that peer, not
  # this one. Compared against the live hostname rather than a literal, so the second
  # rescuer can be certified by the same mechanism instead of always reading RED.
  if jq -e --arg h "$(hostname)" \
       '.executed_via == "desktop-commander" and .hostname == $h' "$PROOF" >/dev/null 2>&1 \
     && [[ $age -le $PROOF_MAX_AGE ]]; then
    emit PING_RESPONDS GREEN
    emit COMMAND_EXECUTES GREEN
  else
    echo "# proof present but stale (${age}s > ${PROOF_MAX_AGE}s) or malformed; leaving client criteria UNVERIFIED" >&2
  fi
else
  echo "# no Commander execution proof at $PROOF; PING_RESPONDS and COMMAND_EXECUTES stay UNVERIFIED" >&2
  echo "# have the authorized client run: dial-commander-record-proof" >&2
fi

# --- diagnostic only (not a policy criterion; doctor.mjs ignores it) --------
code="$(curl -s -o /dev/null -m 8 -w '%{http_code}' "$MCP_URL" 2>/dev/null)"; code="${code:-000}"
echo "# channel_endpoint=$MCP_URL http_status=$code" >&2
