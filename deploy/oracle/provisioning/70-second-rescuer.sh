#!/usr/bin/env bash
# Bring up oracle-admin-v2 as the second rescuer.
#
#   ./70-second-rescuer.sh                 # set it up
#   ./70-second-rescuer.sh --check         # report only, change nothing
#
# WHY A SECOND RESCUER IS THE POINT
#
# The two E2 hosts are recovery nodes, not workers. Neither has a development pool and
# role-guard.mjs refuses work on both, deliberately: a recovery node busy building is not
# a recovery node. So bringing v2 up does not take load off oracle-admin, and it is not
# meant to. What it gives you is a SECOND machine that can repair the others.
#
# On 2026-09-12 that was the whole failure. oracle-admin was gone and v2 was down, so
# nothing in the estate could recover anything. One rescuer is a single point of failure
# wearing the word "recovery".
#
# WHAT THIS DOES NOT DO
#
# It does not move work onto v2. It does not touch dial-hermes-control. It does not pair
# Desktop Commander — that needs a browser, and the last step here tells you the command.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${DIAL_TARGET_HOST:-oracle-admin-v2}"
CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

# Targeting v2 must be deliberate, so this script names it and the guard agrees.
export DIAL_TARGET_HOST="$TARGET"
# shellcheck source=/dev/null
source "$HERE/lib.sh" || { echo "lib.sh could not be sourced" >&2; exit 1; }

set +e   # lib.sh turns on -e; this script handles its own failures and reports them.

assert_provisionable_target "$TARGET" || exit 1

# It must be a recovery peer in the fabric, with peers of its own to look after. Setting
# up a "rescuer" that the fabric does not believe is one produces a host that runs an
# agent and recovers nobody.
peers="$(node -e '
  const f = require(process.argv[1]);
  const h = f.hosts.find((x) => x.host_id === process.argv[2]);
  if (!h || !h.roles.includes("RECOVERY") || !h.recovers.length) process.exit(2);
  process.stdout.write(h.recovers.join(" "));
' "$HERE/../resource-fabric/hosts.json" "$TARGET" 2>/dev/null)" \
  || die "$TARGET is not a RECOVERY host with peers in hosts.json; nothing to set up"

echo "=== Second rescuer: $TARGET ==="
echo "It will look after: $peers"
echo

# ---- where is it? ---------------------------------------------------------------------
KEY="${DIAL_SSH_PRIVATE_KEY_FILE:-$HOME/oracle-admin.key}"
[[ -r "$KEY" ]] || die "No readable SSH key at $KEY. Set DIAL_SSH_PRIVATE_KEY_FILE."

ip="${DIAL_FABRIC_ORACLE_ADMIN_V2_SSH_HOST:-}"
if [[ -z "$ip" ]]; then
  require_cli
  id="$(instance_ocid_by_name "$TARGET")"
  [[ -n "$id" ]] || die "$TARGET is not visible in this compartment"
  ip="$(oci_ compute instance list-vnics --instance-id "$id" 2>/dev/null \
        | jq -r '[.data[]?."public-ip" | select(. != null and . != "")] | (.[0] // "")')"
fi
[[ -n "$ip" ]] || die "$TARGET has no public address.
A rescuer reachable only through its peer is not a rescuer — that is the dependency the
architecture forbids. Assign it an ephemeral public IP before continuing."
echo "address: $ip"

sshv2() { timeout "${DIAL_SSH_TIMEOUT:-300}" ssh -i "$KEY" -o BatchMode=yes \
  -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new "ubuntu@$ip" "$@"; }

sshv2 true >/dev/null 2>&1 \
  || die "cannot SSH to $TARGET at $ip with $KEY.
Check its NSG allows 22 from here, and that this key is in its authorized_keys."
echo "ssh:     OK"
echo

if [[ "$CHECK_ONLY" == true ]]; then
  echo "--- current state on $TARGET (nothing changed) ---"
  sshv2 'set +e
    printf "repo           : "; [ -d /opt/dial-recovery/dial-new ] && git -C /opt/dial-recovery/dial-new rev-parse --short HEAD 2>/dev/null || echo absent
    printf "recovery agent : "; sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/$(id -u ubuntu) systemctl --user is-active dial-recovery-agent.service 2>&1
    printf "commander      : "; [ -f /home/ubuntu/.desktop-commander-device/device.json ] && echo paired || echo "not paired"
    printf "peer host keys : "; sudo -u ubuntu dial-seed-known-hosts --verify 2>&1 | tr "\n" "; "
    echo'
  exit 0
fi

# ---- set it up ------------------------------------------------------------------------
# bootstrap.sh now derives its own identity from `hostname` and validates it against
# hosts.json, so the same script serves both admin hosts without being told which it is.
echo "--- running bootstrap on $TARGET (idempotent; safe to re-run) ---"
REF="${DIAL_REPO_REF:-claude/oracle-e2-recovery-rebuild-3yotjc}"
sshv2 "sudo DIAL_REPO_REF='$REF' bash -c '
  set -e
  if [ -x /opt/dial-recovery/bin/bootstrap.sh ]; then
    /opt/dial-recovery/bin/bootstrap.sh
  else
    install -d -m 755 /opt/dial-recovery
    if [ -d /opt/dial-recovery/dial-new/.git ]; then
      git -C /opt/dial-recovery/dial-new fetch --depth 1 origin \"\$DIAL_REPO_REF\" \
        && git -C /opt/dial-recovery/dial-new checkout -f FETCH_HEAD
    else
      git clone --depth 1 --branch \"\$DIAL_REPO_REF\" \
        https://github.com/Vanguduza/dial-new.git /opt/dial-recovery/dial-new
    fi
    bash /opt/dial-recovery/dial-new/deploy/oracle/provisioning/bootstrap.sh
  fi' 2>&1" | grep --line-buffered -E '=== \[|PHASE|FAILED|refusing|BOOTSTRAP COMPLETE'
rc="${PIPESTATUS[0]}"
echo

# ---- make the rescue links real, in both directions ------------------------------------
# A rescuer that cannot open an SSH session to its peers fails closed on every probe and
# recovers nothing. Seeding is what turns a staged recovery plane into a running one.
echo "--- seeding peer host keys on $TARGET ---"
sshv2 'sudo -u ubuntu dial-seed-known-hosts 2>&1' | sed 's/^/  /'

echo
echo "--- and on oracle-admin, so it can see $TARGET in return ---"
admin_ip="${DIAL_FABRIC_ORACLE_ADMIN_SSH_HOST:-$(jq -r '.public_ip // ""' "$HERE/instance.json" 2>/dev/null)}"
if [[ -n "$admin_ip" ]]; then
  timeout 120 ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=15 \
    -o StrictHostKeyChecking=accept-new "ubuntu@$admin_ip" \
    'sudo -u ubuntu dial-seed-known-hosts 2>&1' | sed 's/^/  /'
else
  echo "  (oracle-admin's address is not known here; run '~/p/run.sh seed' separately)"
fi

# ---- report ----------------------------------------------------------------------------
cat <<EOF

=== $TARGET is now a recovery peer ===

  looks after   : $peers
  recovered by  : the other peers, and dial-hermes-control bounded at R1

STILL NEEDS YOU — Desktop Commander, because it needs a browser:

  DIAL_FABRIC_ORACLE_ADMIN_V2_SSH_HOST=$ip ~/p/run.sh pair --host $TARGET

USE THE SAME COMMANDER ACCOUNT as oracle-admin. You do not need a second one: Commander
registers each device under its own hostname, so the two hosts appear as two separate
devices on one account. A second account would split your estate across two logins for no
benefit and make it easy to pair a host where ChatGPT cannot see it.

THEN, to confirm both rescuers are real rather than installed:

  ./60-estate-access-check.sh
  ./61-independence-test.sh

EOF
[[ "$rc" -eq 0 ]] || echo "NOTE: bootstrap returned $rc — read the phase lines above before trusting this."
exit "$rc"
