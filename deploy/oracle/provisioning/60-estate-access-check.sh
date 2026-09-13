#!/usr/bin/env bash
# Can every host be reached on its own, without going through another host?
#
#   ./60-estate-access-check.sh            # all hosts in hosts.json
#   ./60-estate-access-check.sh --host dial-hermes-control
#   ./60-estate-access-check.sh --json
#
# READ-ONLY. It lists, gets and probes. It never creates, updates, deletes, reboots or
# runs a command on anything, which is why it is safe to point at the protected hosts —
# and pointing it at them is the whole reason it exists.
#
# WHY
#
# Rev 3 section 3 requires every node to be reachable by paths that share no dependency on
# any other node, and section 7 makes that a certification requirement. Nothing enforced
# it. Every tool in this directory was scoped to oracle-admin — the certification report
# has "oracle-admin host certification" written into it — and the only place the other two
# hosts appeared was in guards saying "do not touch this". So the estate had a rule about
# all three hosts and evidence about one.
#
# That is how "I cannot reach dial-hermes-control because oracle-admin-v2 is down" became
# sayable. Under Rev 3 that sentence is a defect report, not a status: v2 is a peer, not a
# gateway. But nobody could refute it from evidence, which is nearly as bad as it being
# true.
#
# THE THREE PATHS, per host (Rev 3 section 3.2)
#
#   Direct SSH          its own VNIC, its own NSG, its own sshd
#   OCI Run Command     the OCI control plane and the Oracle Cloud Agent
#   Desktop Commander   its own outbound session
#
# WHAT THIS CAN AND CANNOT SEE
#
# Path health is measured where it can be measured and reported UNVERIFIED where it
# cannot. UNVERIFIED never counts as healthy and never contributes to a pass. In
# particular Desktop Commander is an outbound session whose health is only observable ON
# the host, so from here it is UNVERIFIED unless an SSH probe can read it — and reading it
# over SSH would make the Commander result depend on the SSH path, which is exactly the
# coupling this check exists to detect. So it stays UNVERIFIED and says why.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOSTS_JSON="${DIAL_FABRIC_HOSTS:-$HERE/../resource-fabric/hosts.json}"
ONLY_HOST=""
JSON_ONLY=false
SSH_TIMEOUT="${DIAL_ACCESS_SSH_TIMEOUT:-10}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) ONLY_HOST="${2:-}"; shift 2 ;;
    --json) JSON_ONLY=true; shift ;;
    *) echo "60-estate-access-check: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

say() { [[ "$JSON_ONLY" == true ]] || echo "$*" >&2; }

[[ -r "$HOSTS_JSON" ]] || { echo "60-estate-access-check: no hosts.json at $HOSTS_JSON" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "60-estate-access-check: jq not installed" >&2; exit 2; }

# OCI is optional: without it the control-plane facts are UNVERIFIED, which is a worse
# report but an honest one. Refusing to run at all would mean no report from a machine
# that can still prove something.
OCI_OK=false
# shellcheck source=/dev/null
if source "$HERE/lib.sh" >/dev/null 2>&1 && command -v oci >/dev/null 2>&1 \
   && [[ -n "${DIAL_OCI_COMPARTMENT:-}" ]] && oci_ iam region list >/dev/null 2>&1; then
  OCI_OK=true
fi
[[ "$OCI_OK" == true ]] || say "No usable OCI access here — control-plane facts will read UNVERIFIED."

INSTANCES='{}'
if [[ "$OCI_OK" == true ]]; then
  raw="$(oci_ compute instance list --compartment-id "$DIAL_OCI_COMPARTMENT" --all 2>/dev/null)" || raw=""
  if [[ -n "$raw" ]] && jq -e '.data' >/dev/null 2>&1 <<<"$raw"; then
    INSTANCES="$(jq -c '[.data[]
      | select(."lifecycle-state" | IN("TERMINATED","TERMINATING") | not)
      | {key: ."display-name", value: {id: .id, state: ."lifecycle-state", shape: .shape,
          agent: (."agent-config" // {})}}] | from_entries' <<<"$raw")"
  fi
fi

mapfile -t HOST_IDS < <(jq -r --arg only "$ONLY_HOST" \
  '.hosts[] | select($only == "" or .host_id == $only) | .host_id' "$HOSTS_JSON")
[[ ${#HOST_IDS[@]} -gt 0 && -n "${HOST_IDS[0]:-}" ]] \
  || { echo "60-estate-access-check: no such host in hosts.json${ONLY_HOST:+: $ONLY_HOST}" >&2; exit 2; }

results='[]'
overall=PASS
ssh_answered=0
ssh_attempted=0

# Public address for a host. Env override first — the same convention recovery-agent.mjs
# uses — then the control plane. Never cached in the repository: addresses are ephemeral
# and are sensitive operational detail (Rev 3 section 3.4).
# The env var name for a host, matching recovery-agent.mjs's convention exactly:
# upper-cased with hyphens replaced. Computed in one place because printing a name that
# differs from the one actually looked up sends an operator to set a variable that can
# never resolve — the same "error naming the wrong thing" as every other bug in this repo.
ssh_host_var() { local k="DIAL_FABRIC_${1^^}_SSH_HOST"; printf '%s' "${k//-/_}"; }

public_ip_of() {
  local host="$1" id="$2" key
  key="$(ssh_host_var "$host")"
  if [[ -n "${!key:-}" ]]; then printf '%s' "${!key}"; return 0; fi
  [[ "$OCI_OK" == true && -n "$id" ]] || return 1
  oci_ compute instance list-vnics --instance-id "$id" 2>/dev/null \
    | jq -r '[.data[]?."public-ip" | select(. != null and . != "")] | (.[0] // "")'
}

for host in "${HOST_IDS[@]}"; do
  say ""
  say "=== $host ==="
  checks='[]'
  paths_proven=0
  paths_unverified=0

  add() { # path outcome detail
    checks="$(jq -c --arg p "$1" --arg o "$2" --arg d "$3" \
      '. + [{path:$p, outcome:$o, detail:$d}]' <<<"$checks")"
    local mark
    case "$2" in
      PROVEN)     mark="  ok      "; paths_proven=$((paths_proven + 1)) ;;
      UNVERIFIED) mark="  ?       "; paths_unverified=$((paths_unverified + 1)) ;;
      *)          mark="  BROKEN  " ;;
    esac
    say "$mark $1 — $3"
    return 0
  }

  id="$(jq -r --arg h "$host" '.[$h].id // ""' <<<"$INSTANCES")"
  state="$(jq -r --arg h "$host" '.[$h].state // ""' <<<"$INSTANCES")"

  if [[ "$OCI_OK" == true && -z "$id" ]]; then
    say "  instance not found in this compartment — it may be terminated, or in another one"
  fi

  # ---- Path 1: direct SSH to its own public address --------------------------------
  ip="$(public_ip_of "$host" "$id" || true)"
  if [[ -z "$ip" ]]; then
    if [[ "$OCI_OK" == true ]]; then
      # No public address at all is not a health problem — it is a DESIGN problem. Such a
      # host can only be reached through a peer, which is the dependency Rev 3 forbids.
      add direct_ssh BROKEN "no public address — this host can only be reached via a peer, which section 3.1 forbids"
    else
      add direct_ssh UNVERIFIED "no address known here; set $(ssh_host_var "$host") or run where OCI is reachable"
    fi
  elif command -v nc >/dev/null 2>&1; then
    ssh_attempted=$((ssh_attempted + 1))
    if timeout "$SSH_TIMEOUT" nc -z -w "$SSH_TIMEOUT" "$ip" 22 >/dev/null 2>&1; then
      ssh_answered=$((ssh_answered + 1))
      add direct_ssh PROVEN "port 22 answered at its own address, with no peer involved"
    else
      add direct_ssh BROKEN "its own address did not answer on 22 within ${SSH_TIMEOUT}s"
    fi
  else
    add direct_ssh UNVERIFIED "has its own address, but no probe tool (nc) here to test it"
  fi

  # ---- Path 2: OCI Run Command -----------------------------------------------------
  # This is the path that survives SSH being completely broken, which makes it the one
  # worth proving from the control plane rather than from the host.
  if [[ "$OCI_OK" != true ]]; then
    add oci_run_command UNVERIFIED "no OCI access from here"
  elif [[ -z "$id" ]]; then
    add oci_run_command UNVERIFIED "instance not visible in this compartment"
  else
    agent="$(jq -c --arg h "$host" '.[$h].agent // {}' <<<"$INSTANCES")"
    mgmt="$(jq -r '."is-management-disabled" // "unknown"' <<<"$agent")"
    plug="$(jq -r '[."plugins-config"[]? | select(.name | test("Run Command"; "i")) | .desired-state] | (.[0] // "unset")' <<<"$agent")"
    if [[ "$plug" == "ENABLED" && "$mgmt" != "true" ]]; then
      # Enabled in the control plane is necessary, not sufficient: it says the plugin is
      # meant to run, not that the agent answered. Actually running a command would be a
      # mutation of a protected host, so this stops at ENABLED and says so.
      add oci_run_command PROVEN "Run Command plugin ENABLED and agent management on (configuration only — no command was run)"
    else
      add oci_run_command BROKEN "Run Command plugin is '$plug', management-disabled='$mgmt'"
    fi
  fi

  # ---- Path 3: Desktop Commander ---------------------------------------------------
  # Deliberately not probed over SSH. Reading it that way would make this result depend on
  # the SSH path, and a check whose three "independent" paths share a dependency is not
  # measuring independence — it is assuming it.
  add desktop_commander UNVERIFIED "outbound session; observable only on the host. Run 'dial-commander-probe' there — probing it over SSH would couple this path to the SSH one"

  # ---- Structural: does any path route through another host? -----------------------
  if [[ -n "$ip" ]]; then
    others="$(jq -r --arg h "$host" '.hosts[] | select(.host_id != $h) | .private_ip' "$HOSTS_JSON")"
    if grep -qxF "$ip" <<<"$others"; then
      add no_peer_hop BROKEN "its address is another host's private address — this IS a peer hop"
    else
      add no_peer_hop PROVEN "its address belongs to no other host in the fabric"
    fi
  else
    add no_peer_hop UNVERIFIED "no address to check"
  fi

  # ---- Verdict for this host -------------------------------------------------------
  broken="$(jq '[.[] | select(.outcome == "BROKEN")] | length' <<<"$checks")"
  if [[ "$broken" -gt 0 ]]; then
    v=BROKEN; overall=FAIL
  elif [[ "$paths_proven" -ge 2 ]]; then
    # Section 3.1 asks for at least two independent paths. Two proven is the bar; the
    # third being UNVERIFIED is a gap in evidence, not a failure of the estate.
    v=INDEPENDENT
  else
    v=INSUFFICIENT_EVIDENCE
    [[ "$overall" == FAIL ]] || overall=INCOMPLETE
  fi
  say "  -> $v ($paths_proven proven, $paths_unverified unverified)"

  results="$(jq -c --arg h "$host" --arg s "$state" --arg v "$v" \
    --argjson pp "$paths_proven" --argjson pu "$paths_unverified" --argjson c "$checks" \
    '. + [{host:$h, lifecycle_state:(if $s == "" then "unknown" else $s end),
           verdict:$v, paths_proven:$pp, paths_unverified:$pu, checks:$c}]' <<<"$results")"
done

# ---- Is the PROBER blind? -------------------------------------------------------------
# If every SSH probe failed, the likeliest explanation is not that the whole estate is
# down — it is that this machine has no outbound path on 22 (a proxy, a corporate egress
# rule, a laptop on hotel wifi). Reporting BROKEN in that case is the failure this repo
# keeps hitting from the other direction: a checker confidently naming the wrong cause.
# During an outage it would send someone rebuilding hosts that were never down.
#
# One success anywhere proves the prober can open port 22, which makes every other
# failure meaningful. Zero successes proves nothing either way, so say so.
blind=false
if [[ "$ssh_attempted" -gt 0 && "$ssh_answered" -eq 0 ]]; then
  blind=true
  say ""
  say "NOTE: no host answered on 22, and this machine never proved it can reach port 22"
  say "      anywhere. That is indistinguishable from the estate being fine and this"
  say "      prober being blind, so those results are downgraded to UNVERIFIED."
  results="$(jq -c '[.[] | .checks = [.checks[]
      | if .path == "direct_ssh" and .outcome == "BROKEN"
        then .outcome = "UNVERIFIED"
           | .detail = "no answer on 22 — but this prober reached NO host, so it cannot tell a down host from its own blocked egress. Re-run from OCI Cloud Shell."
        else . end]]' <<<"$results")"
  # Recompute each verdict against the downgraded evidence rather than leaving a verdict
  # that no longer matches the checks beneath it.
  results="$(jq -c '[.[]
    | .paths_proven      = ([.checks[] | select(.outcome == "PROVEN")]     | length)
    | .paths_unverified  = ([.checks[] | select(.outcome == "UNVERIFIED")] | length)
    | .verdict = (if ([.checks[] | select(.outcome == "BROKEN")] | length) > 0 then "BROKEN"
                  elif .paths_proven >= 2 then "INDEPENDENT"
                  else "INSUFFICIENT_EVIDENCE" end)]' <<<"$results")"
  if [[ "$(jq '[.[] | select(.verdict == "BROKEN")] | length' <<<"$results")" -gt 0 ]]; then
    overall=FAIL
  elif [[ "$(jq '[.[] | select(.verdict != "INDEPENDENT")] | length' <<<"$results")" -gt 0 ]]; then
    overall=INCOMPLETE
  else
    overall=PASS
  fi
  # Reprint the verdicts. The lines above were written before the downgrade and now
  # disagree with the report — and output that contradicts its own conclusion is the
  # exact thing this tooling exists to stop doing.
  say ""
  say "Revised after the downgrade:"
  say "$(jq -r '.[] | "  \(.host): \(.verdict) (\(.paths_proven) proven, \(.paths_unverified) unverified)"' <<<"$results")"
fi

report="$(jq -n --arg at "$(date -u +%FT%TZ)" --arg v "$overall" --argjson oci "$OCI_OK" \
  --argjson blind "$blind" \
  --argjson r "$results" \
  '{schema_version:1, report:"estate direct-access check",
    source_authority:"docs/orchestration/DIAL_ORACLE_RESILIENT_3_NODE_CLUSTER_REV3.md section 3",
    observed_at:$at, read_only:true, oci_available:$oci, prober_blind:$blind,
    verdict:$v, hosts:$r}')"

if [[ "$JSON_ONLY" == true ]]; then
  printf '%s\n' "$report"
else
  say ""
  say "VERDICT: $overall"
  case "$overall" in
    PASS)
      say "Every host checked has at least two proven independent paths, and none of them"
      say "routes through a peer." ;;
    INCOMPLETE)
      say "Nothing is broken, but some hosts do not have two PROVEN paths — the evidence is"
      say "missing, not the capability. Re-run where OCI and the hosts are reachable." ;;
    FAIL)
      say "At least one path is BROKEN. A host without its own way in depends on a peer,"
      say "and a peer is not a gateway (section 3.3)." ;;
  esac
fi

case "$overall" in
  PASS)       exit 0 ;;
  INCOMPLETE) exit 3 ;;
  *)          exit 1 ;;
esac
