#!/usr/bin/env bash
# Host-side half of the section 24 certification report.
#
#   sudo dial-host-certify              # JSON to stdout
#
# Emits facts and a certification verdict. Every value is measured, not assumed;
# anything that cannot be measured is reported as "unverified", never as healthy.
#
# Verdict (section 24):
#   GREEN — SSH + OCI emergency access + recovery plane + Commander all functionally proven
#   AMBER — VM and SSH healthy, Commander still needs owner device authorization
#   RED   — no reliable remote recovery path
#
# The control-plane half (instance OCID, shape, image, public IP, VCN/subnet, plugin
# state, Hermes-unchanged proof) comes from 30-certify.mjs, which merges this file's
# output with OCI API facts.

set -uo pipefail

ADMIN_USER=ubuntu
REPO_DIR=/opt/dial-recovery/dial-new
FABRIC=$REPO_DIR/deploy/oracle/resource-fabric
STATE=/var/lib/dial-recovery/bootstrap-state.json
CRED=/home/$ADMIN_USER/.desktop-commander-device/device.json
UID_ADMIN="$(id -u $ADMIN_USER 2>/dev/null || echo 0)"
# Bounded: `systemctl --user` blocks when the user manager is not reachable, and a
# certification tool must never be the thing that hangs.
uctl() { timeout 10 sudo -u $ADMIN_USER XDG_RUNTIME_DIR=/run/user/$UID_ADMIN systemctl --user "$@" 2>/dev/null; }

# Build a JSON array from stdin lines. Never emits nothing, never emits twice.
#
# The previous idiom was `… | jq -R . | jq -sc . || echo '[]'`. `grep` exits 1 when
# it matches nothing; `set -o pipefail` turns that into a failed pipeline even though
# jq had already printed a perfectly good `[]`; the `|| echo '[]'` then APPENDED a
# second value. The variable held "[]\n[]", which is a valid jq *stream* but not a
# single value, so `--argjson` rejected it and the entire report failed to build,
# leaving stdout empty. The failing case was a HEALTHY host: grep matched nothing
# precisely because no stray DIAL workload was running.
to_json_array() {
  local out; out="$(jq -R . 2>/dev/null | jq -sc . 2>/dev/null)"
  if [[ -n "$out" ]]; then printf '%s' "$out"; else printf '[]'; fi
}

ssh_active=$(systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null || echo inactive)
ssh_listening=$(ss -lnt 2>/dev/null | awk '$4 ~ /:22$/ {found=1} END{print (found?"true":"false")}')
pw_auth=$(sshd -T 2>/dev/null | awk '/^passwordauthentication /{print $2}')
root_login=$(sshd -T 2>/dev/null | awk '/^permitrootlogin /{print $2}')
pubkey_auth=$(sshd -T 2>/dev/null | awk '/^pubkeyauthentication /{print $2}')
ssh_fp=$(ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub 2>/dev/null | awk '{print $2}')

# Oracle Cloud Agent has two unit names: `oracle-cloud-agent.service` on Oracle
# Linux, and a snap unit on Ubuntu images. Checking only the first reports the
# emergency recovery path as dead on a host where it is running perfectly.
OCA_UNITS=(oracle-cloud-agent.service snap.oracle-cloud-agent.oracle-cloud-agent.service)
oca=inactive; oca_unit=""
for u in "${OCA_UNITS[@]}"; do
  if [[ "$(systemctl is-active "$u" 2>/dev/null)" == "active" ]]; then oca=active; oca_unit="$u"; break; fi
done
ocarun=$(id ocarun >/dev/null 2>&1 && echo true || echo false)
plugins=$(ls /var/lib/oracle-cloud-agent/plugins 2>/dev/null | to_json_array)
# The Run Command plugin's directory is `runcommand`, not `oci-tools-plugin`.
runcmd_plugin=$(jq -e 'any(.[]; test("runcommand"; "i"))' <<<"$plugins" >/dev/null 2>&1 && echo true || echo false)

# IMDSv2 must work; IMDSv1 must not.
imds_v2=$(curl -s -m 5 -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer Oracle' \
  http://169.254.169.254/opc/v2/instance/ 2>/dev/null || echo 000)
imds_v1=$(curl -s -m 5 -o /dev/null -w '%{http_code}' http://169.254.169.254/opc/v1/instance/ 2>/dev/null || echo 000)
imds_ok=$([[ "$imds_v2" == "200" && "$imds_v1" != "200" ]] && echo true || echo false)

https_gh=$(curl -s -o /dev/null -m 10 -w '%{http_code}' https://github.com 2>/dev/null || echo 000)
https_npm=$(curl -s -o /dev/null -m 10 -w '%{http_code}' https://registry.npmjs.org 2>/dev/null || echo 000)
dns_ok=$(getent hosts registry.npmjs.org >/dev/null 2>&1 && echo true || echo false)

# Ask as the owner: git refuses a repo owned by another user ("dubious ownership"),
# so querying as root reports a healthy checkout as unverified.
repo_sha=$(sudo -u $ADMIN_USER git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || echo unverified)
repo_ref=$(sudo -u $ADMIN_USER git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unverified)

host_agent_timer=$(uctl is-active dial-host-agent.timer || echo inactive)
recovery_agent=$(uctl is-active dial-recovery-agent.service || echo inactive)
recovery_agent_enabled=$(uctl is-enabled dial-recovery-agent.service || echo disabled)
scheduler=$(uctl is-active dial-resource-scheduler.service || echo inactive)
commander_unit=$(uctl is-active dial-commander-remote.service || echo inactive)

# Does the fabric actually run here? Exercise it rather than trusting the checkout.
if [[ -f $FABRIC/recovery-agent.mjs ]]; then
  fabric_loads=$(timeout 20 node -e "import('file://$FABRIC/recovery-agent.mjs').then(()=>console.log('true')).catch(()=>console.log('false'))" 2>/dev/null || echo false)
else
  fabric_loads=false
fi
# Fail-closed check: stale telemetry must make a host ineligible, not "probably fine".
if [[ -f $FABRIC/placement.mjs ]]; then
  fail_closed=$(timeout 20 node -e "
import('file://$FABRIC/placement.mjs').then(m=>{
  const r=m.evaluatePlacement({task:{task_id:'certify',project:'dial',predicted_memory_mb:64},telemetry:{},nowMs:Date.now()});
  console.log(r.selected?'false':'true');
}).catch(()=>console.log('unverified'))" 2>/dev/null || echo unverified)
else
  fail_closed=unverified
fi

# ---- two-way recovery, inbound half (Rev 3 section 5) -------------------------------
# This host is the TARGET of the bounded direction. What it can establish locally:
# whether the restriction is installed, whether a peer key is bound to it, and — from
# its own audit log — whether that channel has ever actually been used. The last is the
# only one that is evidence in the section 7.1 sense: a log line the forced command
# wrote cannot exist unless a peer really connected and really was adjudicated.
BR_CMD=/usr/local/bin/dial-bounded-recovery
BR_LOG=/var/log/dial-bounded-recovery.log
br_installed=$([[ -x $BR_CMD ]] && echo true || echo false)
br_authorized=false; br_restricted=false
if [[ -x $FABRIC/install-bounded-recovery-identity.sh ]]; then
  br_verify="$(timeout 15 sudo -u $ADMIN_USER env DIAL_FABRIC_HOST_ID="$(hostname)" \
    bash "$FABRIC/install-bounded-recovery-identity.sh" --verify 2>&1)"
  case "$br_verify" in
    PRESENT*)  br_authorized=true; br_restricted=true ;;
    DEGRADED*) br_authorized=true; br_restricted=false ;;
  esac
else
  br_verify="installer not present on this ref"
fi
# Counting refusals matters as much as counting allows. A channel that has only ever
# been allowed has not demonstrated that it refuses anything.
# `{ grep || true; }`, never `grep || echo 0`: grep -c exits 1 on zero matches AFTER
# printing "0", so the fallback would append a second value and the count would read
# "0\n0". That is cause #7 from the 2026-09-12 outage, in miniature.
br_allows=$({ grep -c 'verdict=ALLOW' $BR_LOG 2>/dev/null || true; } | head -1)
br_refusals=$({ grep -c 'verdict=REFUSED' $BR_LOG 2>/dev/null || true; } | head -1)
br_allows=${br_allows:-0}; br_refusals=${br_refusals:-0}
br_last=$(tail -1 $BR_LOG 2>/dev/null | awk '{print $1}')
br_exercised=$([[ "${br_allows:-0}" -gt 0 ]] && echo true || echo false)

commander_paired=$([[ -f $CRED ]] && echo true || echo false)
# Read the version from package.json — never by executing the binary. There is no
# --version flag: an unrecognised argument falls through to the MCP stdio server,
# which waits on stdin forever. In a command substitution over SSH that hangs the
# whole certification, with no output and no timeout.
commander_version=$(jq -r '.version // "unverified"' \
  /opt/dial-recovery/commander/node_modules/@wonderwhy-er/desktop-commander/package.json 2>/dev/null || echo unverified)
if [[ -x /usr/local/bin/dial-commander-probe ]]; then
  commander_criteria=$(timeout 25 sudo -u $ADMIN_USER XDG_RUNTIME_DIR=/run/user/$UID_ADMIN \
      /usr/local/bin/dial-commander-probe 2>/dev/null \
    | awk -F= '/^[A-Z_]+=/{printf "%s\"%s\":\"%s\"", (n++?",":""), $1, $2} END{}' )
  commander_criteria="{${commander_criteria:-}}"
else
  commander_criteria='{}'
fi
jq -e . >/dev/null 2>&1 <<<"$commander_criteria" || commander_criteria='{}'
commander_green=$(jq -e 'to_entries | length == 5 and all(.[]; .value=="GREEN")' <<<"$commander_criteria" >/dev/null 2>&1 && echo true || echo false)

# DIAL application workload must NOT be running here (section 11).
stray=$(systemctl list-units --type=service --state=running --no-legend 2>/dev/null \
  | awk '{print $1}' | { grep -E 'dial-hermes|dial-mission|dial-chat-control' || true; } | to_json_array)

mem_total=$(free -m | awk '/^Mem:/{print $2}')
mem_avail=$(free -m | awk '/^Mem:/{print $7}')
swap_total=$(free -m | awk '/^Swap:/{print $2}')
swap_used=$(free -m | awk '/^Swap:/{print $3}')
disk_used_pct=$(df -P / | awk 'NR==2{gsub("%","",$5); print $5}')
loadavg=$(awk '{print $1}' /proc/loadavg)
ports=$(ss -lntuH 2>/dev/null | awk '{print $1" "$5}' | sort -u | to_json_array)
units=$(systemctl list-unit-files --state=enabled --no-legend 2>/dev/null | awk '{print $1}' \
  | { grep -E 'ssh|oracle-cloud-agent' || true; } | to_json_array)

# ---- verdict ---------------------------------------------------------------
ssh_ok=false
[[ "$ssh_active" == "active" && "$ssh_listening" == "true" && "$pw_auth" == "no" && "$pubkey_auth" == "yes" ]] && ssh_ok=true
oci_ok=false
[[ "$oca" == "active" && "$ocarun" == "true" && "$runcmd_plugin" == "true" ]] && oci_ok=true
recovery_ok=false
# Rev 3 section 8 makes the purpose-bound forced-command identity part of GREEN. This
# tightens GREEN only: AMBER still needs just SSH and OCI access, so an honest resting
# point stays reachable while the owner's one manual step is outstanding.
[[ "$fabric_loads" == "true" && "$fail_closed" == "true" && "$stray" == "[]" \
   && "$br_installed" == "true" && "$br_authorized" == "true" && "$br_restricted" == "true" ]] \
  && recovery_ok=true

if [[ "$ssh_ok" == "true" && "$oci_ok" == "true" && "$recovery_ok" == "true" && "$commander_green" == "true" ]]; then
  verdict=GREEN; reason="SSH, OCI emergency access, recovery plane and Commander all functionally proven"
elif [[ "$ssh_ok" == "true" && "$oci_ok" == "true" ]]; then
  verdict=AMBER; reason="Host and emergency access healthy; Commander not yet functionally proven end to end"
else
  verdict=RED;   reason="No reliable remote recovery path: SSH and/or OCI emergency access not proven"
fi

# Capture rather than stream straight out. An empty stdout is indistinguishable from
# a transport failure at the collecting end, and that ambiguity cost hours: the real
# cause (one malformed --argjson value) was invisible because jq wrote its complaint
# to stderr and produced nothing at all on stdout.
report="$(jq -n \
  --arg verdict "$verdict" --arg reason "$reason" \
  --arg hostname "$(hostname)" --arg at "$(date -u +%FT%TZ)" \
  --argjson ssh "$(jq -n --arg a "$ssh_active" --arg l "$ssh_listening" --arg p "$pw_auth" --arg r "$root_login" --arg k "$pubkey_auth" --arg f "${ssh_fp:-unverified}" --argjson ok "$ssh_ok" \
      '{service:$a, listening_22:($l=="true"), password_auth:$p, permit_root_login:$r, pubkey_auth:$k, host_key_fingerprint:$f, healthy:$ok}')" \
  --argjson oci "$(jq -n --arg a "$oca" --arg u "${oca_unit:-none}" --arg o "$ocarun" --argjson p "$plugins" --argjson rc "$runcmd_plugin" --arg v2 "$imds_v2" --arg v1 "$imds_v1" --argjson im "$imds_ok" --argjson ok "$oci_ok" \
      '{cloud_agent:$a, cloud_agent_unit:$u, ocarun_present:($o=="true"), plugins:$p, run_command_plugin:$rc, imdsv2_status:$v2, imdsv1_status:$v1, imds_hardened:$im, run_command_capable:$ok}')" \
  --argjson net "$(jq -n --arg g "$https_gh" --arg n "$https_npm" --arg d "$dns_ok" \
      '{github_https:$g, npm_https:$n, dns:($d=="true")}')" \
  --argjson recovery "$(jq -n --arg s "$repo_sha" --arg r "$repo_ref" --arg t "$host_agent_timer" --arg a "$recovery_agent" --arg e "$recovery_agent_enabled" --arg sc "$scheduler" --arg fl "$fabric_loads" --arg fc "$fail_closed" --argjson stray "$stray" --argjson ok "$recovery_ok" \
      --argjson tw "$(jq -n --argjson i "$br_installed" --argjson a "$br_authorized" --argjson r "$br_restricted" \
          --arg v "${br_verify:-unverified}" --arg al "${br_allows:-0}" --arg rf "${br_refusals:-0}" \
          --arg last "${br_last:-none}" --argjson ex "$br_exercised" \
          '{inbound_forced_command_installed:$i, peer_key_authorized:$a, entry_correctly_restricted:$r,
            verify_line:$v, audited_allows:($al|tonumber?), audited_refusals:($rf|tonumber?),
            last_audited_attempt:$last, channel_exercised:$ex,
            note:"This host is the TARGET of the bounded direction. Proof that the direction WORKS is written by verify-two-way-recovery.sh on the recovering host; channel_exercised is this host'"'"'s own corroboration."}')" \
      '{repo_sha:$s, repo_ref:$r, host_agent_timer:$t, recovery_agent:$a, recovery_agent_enabled:$e, scheduler:$sc, fabric_module_loads:($fl=="true"), stale_telemetry_fails_closed:$fc, dial_application_workload:$stray, two_way_recovery:$tw, healthy:$ok}')" \
  --argjson commander "$(jq -n --arg v "$commander_version" --arg p "$commander_paired" --arg u "$commander_unit" --argjson c "$commander_criteria" --argjson g "$commander_green" \
      '{package:"@wonderwhy-er/desktop-commander@0.2.50", version:$v, transport:"outbound persistent remote device (no inbound port)", paired:($p=="true"), unit:$u, criteria:$c, functionally_proven:$g}')" \
  --argjson resources "$(jq -n --arg mt "$mem_total" --arg ma "$mem_avail" --arg st "$swap_total" --arg su "$swap_used" --arg d "$disk_used_pct" --arg l "$loadavg" --argjson p "$ports" --argjson u "$units" \
      '{memory_total_mb:($mt|tonumber?), memory_available_mb:($ma|tonumber?), swap_total_mb:($st|tonumber?), swap_used_mb:($su|tonumber?), disk_used_pct:($d|tonumber?), load_1m:($l|tonumber?), listening_ports:$p, enabled_units:$u}')" \
  --argjson bootstrap "$(jq '{phases, rerun, started_at, completed_at}' "$STATE" 2>/dev/null || echo 'null')" \
  '{schema_version:1, report:"oracle-admin host certification", hostname:$hostname, observed_at:$at,
    certification:{state:$verdict, reason:$reason},
    ssh:$ssh, oci:$oci, network:$net, recovery_plane:$recovery, desktop_commander:$commander,
    resources:$resources, bootstrap:$bootstrap}' 2>&1)"

if [[ -n "$report" ]] && jq -e 'type == "object"' >/dev/null 2>&1 <<<"$report"; then
  printf '%s\n' "$report"
else
  # Still say something structured. A RED verdict carrying the builder's own error is
  # actionable; silence is not.
  jq -n --arg err "${report:-jq produced no output}" \
    '{schema_version:1, report:"oracle-admin host certification",
      certification:{state:"RED", reason:"host-certify could not build its report"},
      builder_error:$err}'
  exit 1
fi

[[ "$verdict" == "GREEN" ]] || exit 1
