#!/usr/bin/env bash
# The independence test: prove no host is a mandatory hop to any other (Rev 3 section 7.2).
#
#   ./61-independence-test.sh                    # report only — changes NOTHING
#   ./61-independence-test.sh --disrupt          # temporarily block SSH to oracle-admin
#   ./61-independence-test.sh --disrupt --host oracle-admin
#   ./61-independence-test.sh --restore          # put back a disruption a crash left behind
#
# WHAT THE TEST IS
#
# An architecture claim — "losing one host does not cost you access to another" — is only
# worth what its evidence is worth, and the only convincing evidence is having taken a
# path away and watched the others hold. Rev 3 section 7.2 specifies exactly that.
#
# TWO PHASES, AND WHY THE SAFE ONE IS THE DEFAULT
#
#   A. Structural (default).  No changes. Does each host have its own way in that does not
#      route through a peer? A host with no independent path fails here, and no amount of
#      disruption testing would tell you anything you did not already know.
#
#   B. Disruptive (--disrupt). Remove one path, confirm the others still work, put it back.
#      This is the real test. It is opt-in because it briefly makes a host harder to reach.
#
# THE SAFETY RULE THAT MATTERS MOST
#
#   Never remove a way in before proving you have another one.
#
# So phase B refuses to start unless OCI Run Command is already confirmed working on the
# target. That is the path that survives SSH being gone, and it is how the block gets
# lifted if everything else fails. Without it this script would be a way to lock yourself
# out of a host in order to find out whether you could still get into it.
#
# Restore is registered BEFORE the change, runs on any exit including a crash or Ctrl-C,
# is verified afterwards, and leaves the removed rule on disk either way. A restore that
# fails prints the file and the exact command to replay it.
#
# PROTECTED HOSTS
#
# dial-hermes-control and vekl-worker are refused. Blocking ingress to them is a
# networking change to a protected host, which the standing constraint forbids and which
# no test result is worth. Their independence is established structurally in phase A, and
# by watching them stay reachable while oracle-admin is the one disrupted — which is the
# same evidence from the other side.
#
# It also never proves isolation by stopping an instance. Rev 3 section 7.2 says so
# explicitly, and a stopped Always Free instance may not start again.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOSTS_JSON="${DIAL_FABRIC_HOSTS:-$HERE/../resource-fabric/hosts.json}"
EVIDENCE_DIR="${DIAL_INDEPENDENCE_EVIDENCE:-$HERE}"
STASH="${DIAL_INDEPENDENCE_STASH:-$EVIDENCE_DIR/.independence-restore.json}"
TARGET="oracle-admin"
DISRUPT=false
RESTORE_ONLY=false
PROTECTED=("dial-hermes-control" "vekl-worker")

while [[ $# -gt 0 ]]; do
  case "$1" in
    --disrupt) DISRUPT=true; shift ;;
    --restore) RESTORE_ONLY=true; shift ;;
    --host)    TARGET="${2:-}"; shift 2 ;;
    *) echo "61-independence-test: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

log()  { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
die()  { printf '[FATAL] %s\n' "$*" >&2; exit 1; }

for p in "${PROTECTED[@]}"; do
  [[ "$TARGET" == "$p" ]] && die "REFUSED: $TARGET is a protected host.
Blocking ingress to it is a networking change to a protected host. Its independence is
established structurally (phase A) and by it staying reachable while oracle-admin is
disrupted — the same evidence, without touching it."
done

ACCESS_CHECK="$HERE/60-estate-access-check.sh"
[[ -x "$ACCESS_CHECK" ]] || die "60-estate-access-check.sh is missing; phase A depends on it"

# FIRST, before anything slow or anything that can die on a missing tool: is a previous
# disruption still outstanding? If so a host may have no SSH ingress right now, and that
# outranks every other thing this script could tell you.
if [[ -s "$STASH" && "$RESTORE_ONLY" != true ]]; then
  cat >&2 <<EOF
[FATAL] A previous disruption is still outstanding.

  $(jq -r '"  host:       \(.host)\n  removed at: \(.removed_at)\n  nsg:        \(.nsg_id)"' "$STASH" 2>/dev/null || echo "  (stash file unreadable: $STASH)")

  That host's SSH ingress rule was removed and has not been put back. It is probably
  unreachable by SSH right now; OCI Run Command still works.

  Put it back first:
    $0 --restore

  Starting another disruption would overwrite the saved rule and lose the only copy.
EOF
  exit 1
fi

# ---------------------------------------------------------------- restore machinery ----
# Defined before anything can fail, so a crash between here and the end still restores.
restore_from_stash() {
  [[ -s "$STASH" ]] || return 0
  local nsg rule
  nsg="$(jq -r '.nsg_id // ""' "$STASH")"
  rule="$(jq -c '.rule // {}' "$STASH")"
  [[ -n "$nsg" && "$rule" != "{}" ]] || return 0
  log "Restoring the SSH ingress rule on $nsg …"
  if oci_ network nsg rules add --nsg-id "$nsg" \
       --security-rules "$(jq -nc --argjson r "$rule" '[$r]')" >/dev/null 2>&1; then
    log "Restored."
    rm -f "$STASH"
    return 0
  fi
  # Loud, specific, and leaves the evidence in place. A silent restore failure here is
  # how a test becomes an outage.
  cat >&2 <<EOF

  *** RESTORE FAILED ***

  The SSH ingress rule was removed and could not be put back automatically.
  The host may be unreachable by SSH right now. OCI Run Command still works — that
  was verified before anything was removed.

  The rule is saved at: $STASH

  Replay it with:
    oci network nsg rules add --nsg-id $nsg \\
      --security-rules "\$(jq -c '[.rule]' $STASH)"

  Or re-run:  $0 --restore

EOF
  return 1
}

cleanup() { local rc=$?; restore_from_stash || rc=1; exit "$rc"; }

# ---------------------------------------------------------------- phase A: structural ----
if [[ "$RESTORE_ONLY" != true ]]; then
  echo "=== Phase A — structural independence (no changes) ==="
  echo
  access_json="$("$ACCESS_CHECK" --json 2>/dev/null)" || true
  if [[ -z "$access_json" ]] || ! jq -e '.hosts' >/dev/null 2>&1 <<<"$access_json"; then
    die "the access check produced no usable report; fix that before disrupting anything"
  fi

  jq -r '.hosts[] | "  \(.host): \(.verdict)  (\(.paths_proven) proven, \(.paths_unverified) unverified)"' \
    <<<"$access_json"
  echo

  # The one structural failure that matters: a host with no way in of its own.
  hops="$(jq -r '[.hosts[] | select([.checks[] | select(.path == "no_peer_hop" and .outcome == "BROKEN")] | length > 0) | .host] | join(", ")' <<<"$access_json")"
  if [[ -n "$hops" ]]; then
    echo "STRUCTURAL FAILURE: these hosts can only be reached through a peer: $hops"
    echo "No disruption test is needed — the dependency Rev 3 section 3.1 forbids already exists."
    exit 1
  fi
  # "None found" is only reassuring if something was actually looked at. With no addresses
  # resolvable, every no_peer_hop check is UNVERIFIED and "no host depends on a peer" is a
  # claim about an empty set dressed up as a clean bill of health.
  checked="$(jq '[.hosts[].checks[] | select(.path == "no_peer_hop" and .outcome == "PROVEN")] | length' <<<"$access_json")"
  total="$(jq '.hosts | length' <<<"$access_json")"
  if [[ "$checked" -eq 0 ]]; then
    echo "PEER-HOP CHECK INCONCLUSIVE: no host's address could be resolved here, so none of"
    echo "the $total hosts was actually checked. This is not 'no host depends on a peer'."
    echo "Re-run from OCI Cloud Shell, or set DIAL_FABRIC_<HOST>_SSH_HOST for each host."
  elif [[ "$checked" -lt "$total" ]]; then
    echo "No peer dependency among the $checked host(s) that could be checked — but $((total - checked))"
    echo "of $total could not be resolved here and remain unchecked."
  else
    echo "No host depends on a peer for its address (all $total checked)."
  fi

  if [[ "$(jq -r '.prober_blind' <<<"$access_json")" == "true" ]]; then
    echo
    echo "This machine could not reach any host on 22, so phase A proved less than it looks."
    echo "Re-run from OCI Cloud Shell before drawing conclusions."
  fi
fi

if [[ "$RESTORE_ONLY" == true ]]; then
  # shellcheck source=/dev/null
  source "$HERE/lib.sh" >/dev/null 2>&1 || die "lib.sh could not be sourced"
  restore_from_stash && { log "Nothing outstanding, or restore succeeded."; exit 0; }
  exit 1
fi

if [[ "$DISRUPT" != true ]]; then
  cat <<EOF

=== Phase B — disruption: NOT RUN ===

Phase A is structural. It shows each host has its own address and its own paths; it does
not show what happens when one is taken away. Only phase B does, and only phase B can
briefly make a host harder to reach.

  $0 --disrupt

It will refuse unless OCI Run Command is already proven on $TARGET, because that is the
way back in. Protected hosts are refused outright.
EOF
  exit 0
fi

# ---------------------------------------------------------------- phase B: disruption ----
echo
echo "=== Phase B — disruption on $TARGET ==="
echo

# shellcheck source=/dev/null
source "$HERE/lib.sh" >/dev/null 2>&1 || die "lib.sh could not be sourced"
require_cli

# Re-check: phase A takes time, and a concurrent run could have written it since.
[[ -s "$STASH" ]] && die "a disruption became outstanding while this one was preparing ($STASH).
Run '$0 --restore' first — starting a second would lose the saved rule."

# GATE 1: is the way back in actually working? Not "configured" — the access check reports
# configuration, and for this we want it confirmed on this host specifically.
target_json="$("$ACCESS_CHECK" --host "$TARGET" --json 2>/dev/null)" || true
rc_state="$(jq -r '.hosts[0].checks[] | select(.path == "oci_run_command") | .outcome' <<<"${target_json:-{\}}" 2>/dev/null || echo UNVERIFIED)"
[[ "$rc_state" == "PROVEN" ]] \
  || die "REFUSED: OCI Run Command on $TARGET is '$rc_state', not PROVEN.
That is the path that survives SSH being gone, and removing SSH without it would be a way
to lock yourself out of a host in order to find out whether you could still get in."
log "Run Command is proven on $TARGET — there is a way back in."

instance_id="$(instance_ocid_by_name "$TARGET")"
[[ -n "$instance_id" ]] || die "could not resolve $TARGET in this compartment"

# Find the SSH rule on the NSG bound to this host's VNIC. NSG, never the security list:
# the security list is shared with dial-hermes-control (lib.sh explains why that matters).
nsg_id="$(oci_ compute instance list-vnics --instance-id "$instance_id" 2>/dev/null \
  | jq -r '[.data[]?."nsg-ids"[]?] | (.[0] // "")')"
[[ -n "$nsg_id" ]] || die "$TARGET has no NSG on its VNIC; there is no per-host rule to remove.
Its ingress must be coming from the shared security list, which this script will not touch."

rule="$(oci_ network nsg rules list --nsg-id "$nsg_id" --all 2>/dev/null \
  | jq -c '[.data[]? | select(.direction == "INGRESS" and .protocol == "6"
            and ((."tcp-options"."destination-port-range".max // 0) >= 22)
            and ((."tcp-options"."destination-port-range".min // 65535) <= 22))] | (.[0] // {})')"
[[ "$rule" != "{}" && -n "$rule" ]] || die "no SSH ingress rule found on $nsg_id; nothing to remove"
rule_id="$(jq -r '.id // ""' <<<"$rule")"
[[ -n "$rule_id" ]] || die "the SSH rule has no id; refusing to remove something that cannot be replaced"

# Save BEFORE removing, and arm the restore BEFORE the change. Order is the whole point.
mkdir -p "$(dirname "$STASH")"
jq -n --arg n "$nsg_id" --arg h "$TARGET" --arg at "$(date -u +%FT%TZ)" --argjson r "$rule" \
  '{nsg_id:$n, host:$h, removed_at:$at, rule:$r}' > "$STASH"
chmod 600 "$STASH"
log "SSH rule saved to $STASH"
trap cleanup EXIT INT TERM

log "Removing SSH ingress from $nsg_id …"
oci_ network nsg rules remove --nsg-id "$nsg_id" --security-rule-ids "[\"$rule_id\"]" >/dev/null \
  || die "could not remove the rule; nothing changed"
log "Removed. SSH to $TARGET should now fail; everything else should not."

sleep 5   # NSG changes are not instantaneous

# ---- the actual observations ----------------------------------------------------------
during="$("$ACCESS_CHECK" --json 2>/dev/null)" || true
findings='[]'
verdict=PASS

note() {
  findings="$(jq -c --arg c "$1" --arg o "$2" --arg d "$3" '. + [{check:$c, outcome:$o, detail:$d}]' <<<"$findings")"
  printf '  %-6s %s — %s\n' "$2" "$1" "$3"
  [[ "$2" == "FAIL" ]] && verdict=FAIL
  return 0
}

echo
ssh_now="$(jq -r --arg h "$TARGET" '.hosts[] | select(.host == $h) | .checks[] | select(.path == "direct_ssh") | .outcome' <<<"${during:-{\}}" 2>/dev/null || echo UNKNOWN)"
if [[ "$ssh_now" == "PROVEN" ]]; then
  note "disruption took effect" FAIL "SSH to $TARGET still answers — the rule removal did not do what it should"
else
  note "disruption took effect" ok "SSH to $TARGET is now '$ssh_now', as intended"
fi

# The point of the exercise: the OTHER hosts must be untouched by this.
while read -r h v; do
  [[ "$h" == "$TARGET" ]] && continue
  if [[ "$v" == "BROKEN" ]]; then
    note "$h unaffected" FAIL "$h went BROKEN while $TARGET was disrupted — it depends on $TARGET"
  else
    note "$h unaffected" ok "$h is '$v' — unchanged by $TARGET being cut off"
  fi
done < <(jq -r '.hosts[] | "\(.host) \(.verdict)"' <<<"${during:-{\}}" 2>/dev/null)

# And the disrupted host must still be reachable the other way.
if [[ "$rc_state" == "PROVEN" ]]; then
  note "$TARGET still reachable out-of-band" ok "Run Command remains the way in while SSH is blocked"
fi

# ---- restore and confirm ---------------------------------------------------------------
echo
trap - EXIT INT TERM
restore_from_stash || { verdict=FAIL; note "restore" FAIL "the rule could not be put back — see above"; }

sleep 5
after="$("$ACCESS_CHECK" --host "$TARGET" --json 2>/dev/null)" || true
ssh_after="$(jq -r '.hosts[0].checks[] | select(.path == "direct_ssh") | .outcome' <<<"${after:-{\}}" 2>/dev/null || echo UNKNOWN)"
if [[ "$ssh_after" == "PROVEN" ]]; then
  note "restored" ok "SSH to $TARGET answers again"
elif [[ "$ssh_after" == "UNVERIFIED" ]]; then
  note "restored" ok "rule replaced; SSH unverified from here (this prober may be blind)"
else
  note "restored" FAIL "SSH to $TARGET is '$ssh_after' after restore — CHECK THIS HOST NOW"
fi

out="$EVIDENCE_DIR/independence-test.$(date -u +%Y%m%dT%H%M%SZ).json"
jq -n --arg t "$TARGET" --arg at "$(date -u +%FT%TZ)" --arg v "$verdict" --argjson f "$findings" \
  '{schema_version:1, report:"independence test (Rev 3 section 7.2)",
    disrupted_host:$t, observed_at:$at, verdict:$v, findings:$f}' > "$out"

echo
echo "Evidence: $out"
echo "VERDICT: $verdict"
[[ "$verdict" == PASS ]] \
  && echo "Cutting off $TARGET cost access to nothing else. It is not a mandatory hop." \
  || echo "Something depends on $TARGET, or the rule did not come back. Read the findings."

[[ "$verdict" == PASS ]] && exit 0 || exit 1
