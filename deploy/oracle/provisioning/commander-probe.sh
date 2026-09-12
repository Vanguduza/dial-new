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
PROOF="${COMMANDER_PROOF:-/var/lib/dial-recovery/commander-proof.json}"
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
# The device logs "✅ Device ready:" once registerDevice() succeeds. Only count it
# since the current start of the unit, so a stale success from a previous boot
# cannot certify a session that is no longer registered.
since="$(systemctl --user show "$UNIT" -p ActiveEnterTimestamp --value 2>/dev/null || true)"
if [[ -n "$since" ]] && journalctl --user -u "$UNIT" --since "$since" --no-pager 2>/dev/null | grep -q 'Device ready:'; then
  emit REMOTE_REGISTERED GREEN
else
  emit REMOTE_REGISTERED RED
fi

# --- PING_RESPONDS / COMMAND_EXECUTES --------------------------------------
# Emitted only from a proof a real tool call wrote. Absent => UNVERIFIED.
if [[ -f $PROOF ]]; then
  age=$(( $(date +%s) - $(stat -c %Y "$PROOF" 2>/dev/null || echo 0) ))
  if jq -e '.executed_via == "desktop-commander" and (.hostname == "oracle-admin")' "$PROOF" >/dev/null 2>&1 \
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
