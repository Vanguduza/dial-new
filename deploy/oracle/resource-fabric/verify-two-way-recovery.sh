#!/usr/bin/env bash
# Prove the second recovery direction works, and prove it is still bounded.
#
#   verify-two-way-recovery.sh                    # non-destructive: reach, observe, probe refusals
#   verify-two-way-recovery.sh --include-repair   # also restart each target's recovery agent
#   verify-two-way-recovery.sh --target oracle-admin
#   verify-two-way-recovery.sh --json             # machine-readable only
#
# Rev 3 section 7.1: "proven" means observed working on the live estate, not present in
# the repository. This is what produces that observation, and its evidence is what a
# certification may cite.
#
# HALF OF THIS IS REFUSAL TESTING, ON PURPOSE
#
# A verification that only tries permitted verbs proves the channel is open. It does not
# prove the channel is bounded, and an unbounded channel from the control host into the
# recovery tier is worse than no channel at all. So every run attempts verbs that MUST be
# refused, and a refusal probe that succeeds fails the whole verification.
#
# The probes that attempt to read credential material discard their output entirely and
# keep only the exit status: if that refusal ever regressed, logging the result would
# write the credential into the evidence file.

set -uo pipefail

FABRIC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_ID="${DIAL_FABRIC_HOST_ID:-$(hostname)}"
STATE_DIR="${DIAL_FABRIC_STATE:-/var/lib/dial-fabric}"
EVIDENCE_DIR="$STATE_DIR/recovery-evidence"
SSH_TIMEOUT="${DIAL_VERIFY_SSH_TIMEOUT:-20}"
SSH_BIN="${DIAL_VERIFY_SSH:-ssh}"
INCLUDE_REPAIR=false
JSON_ONLY=false
ONLY_TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --include-repair) INCLUDE_REPAIR=true; shift ;;
    --json)           JSON_ONLY=true; shift ;;
    --target)         ONLY_TARGET="${2:-}"; shift 2 ;;
    *) echo "verify-two-way-recovery: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

say() { [[ "$JSON_ONLY" == true ]] || echo "$*" >&2; }

SELF_JSON="$(node -e '
  const f = require(process.argv[1]);
  const self = f.hosts.find((h) => h.host_id === process.argv[2]);
  if (!self) process.exit(2);
  process.stdout.write(JSON.stringify({
    roles: self.roles, max: self.recovery_authority_max ?? null,
    allow: self.recovery_service_allowlist ?? [], recovers: self.recovers,
  }));
' "$FABRIC_DIR/hosts.json" "$HOST_ID" 2>/dev/null)" \
  || { echo "verify-two-way-recovery: $HOST_ID is not a fabric host" >&2; exit 2; }

CEILING="$(jq -r '.max // "none"' <<<"$SELF_JSON")"
BOUNDED="$(jq -r 'if (.roles | index("RECOVERY")) then "false" else "true" end' <<<"$SELF_JSON")"

mapfile -t TARGETS < <(node -e '
  const f = require(process.argv[1]);
  const self = f.hosts.find((h) => h.host_id === process.argv[2]);
  const only = process.argv[3] || null;
  for (const t of self.recovers) {
    if (only && t !== only) continue;
    const key = `DIAL_FABRIC_${t.toUpperCase().replace(/-/g, "_")}_SSH_HOST`;
    const addr = process.env[key] || (f.hosts.find((h) => h.host_id === t) || {}).private_ip;
    if (addr) process.stdout.write(`${t} ${addr}\n`);
  }
' "$FABRIC_DIR/hosts.json" "$HOST_ID" "$ONLY_TARGET")

[[ ${#TARGETS[@]} -gt 0 && -n "${TARGETS[0]:-}" ]] \
  || { echo "verify-two-way-recovery: no targets for $HOST_ID${ONLY_TARGET:+ matching $ONLY_TARGET}" >&2; exit 2; }

# Every remote call is bounded. An unbounded ssh is cause #6 from the 2026-09-12 outage:
# ConnectTimeout bounds the handshake, not the remote program.
remote() { timeout "$SSH_TIMEOUT" "$SSH_BIN" -o BatchMode=yes -o ConnectTimeout=5 "$1" "$2" 2>&1; }
remote_status_only() {
  timeout "$SSH_TIMEOUT" "$SSH_BIN" -o BatchMode=yes -o ConnectTimeout=5 "$1" "$2" >/dev/null 2>&1
  echo $?
}

# Verbs that MUST be refused, as "command|why". These are the whole point of the exercise:
# they establish that the channel is bounded, not merely that it is open.
REFUSAL_PROBES=(
  'sudo reboot|reboot is R3'
  'bash -i|interactive shell'
  '/bin/sh|shell by another name'
  'systemctl --user restart dial-hermes-runtime.service|non-recovery unit'
  'systemctl --user restart sshd|the service that would lock the owner out'
  'systemctl --user restart dial-recovery-agent.service; id|command chaining'
  'oci compute instance action --action RESET|the OCI control plane is R3'
)

# Credential reads are probed separately: status only, output discarded. If one of these
# ever stopped refusing, capturing stdout would write the credential into the evidence.
CREDENTIAL_PROBES=(
  '$HOME/.ssh/id_ed25519'
  '/etc/dial-recovery/rclone.conf'
  '$HOME/.desktop-commander-device/device.json'
)

results='[]'
overall=PROVEN
any_target=false

for row in "${TARGETS[@]}"; do
  read -r target addr <<<"$row"
  any_target=true
  say ""
  say "=== $HOST_ID -> $target ($addr), ceiling $CEILING ==="
  checks='[]'
  target_verdict=PROVEN

  add() { # name expectation outcome detail
    checks="$(jq -c --arg n "$1" --arg e "$2" --arg o "$3" --arg d "$4" \
      '. + [{check:$n, expected:$e, outcome:$o, detail:$d}]' <<<"$checks")"
    local mark="  ok  "; [[ "$3" == "PASS" ]] || mark="  FAIL"
    [[ "$3" == "SKIP" ]] && mark="  --  "
    say "$mark $1 — $4"
    [[ "$3" == "FAIL" ]] && target_verdict=FAILED
    return 0
  }

  # ---- R0: can this host reach the target at all? --------------------------------
  rc="$(remote_status_only "$addr" 'true')"
  if [[ "$rc" != "0" ]]; then
    add reachable "exit 0" FAIL "no answer (exit $rc) — key not authorized, host down, or known_hosts unseeded"
    # Everything below depends on this, and guessing past it produces a report that
    # looks thorough and proves nothing.
    results="$(jq -c --arg t "$target" --arg a "$addr" --arg v UNPROVEN --argjson c "$checks" \
      '. + [{target:$t, address:$a, verdict:$v, checks:$c}]' <<<"$results")"
    [[ "$overall" == "FAILED" ]] || overall=UNPROVEN
    say "  -> UNPROVEN: cannot reach $target; nothing below could be tested"
    continue
  fi
  add reachable "exit 0" PASS "liveness probe answered"

  # ---- R0: observation ------------------------------------------------------------
  # Require an actual systemd state word. "Non-empty output" would accept
  # "Failed to connect to bus: No medium found" as an observation, which is the same
  # class of mistake as every other failure in the 2026-09-12 list: output that looked
  # like success. A diagnostic channel that cannot tell those apart is not a diagnostic.
  out="$(remote "$addr" 'systemctl --user is-active dial-recovery-agent.service')"
  state="$(printf '%s' "${out//$'\n'/ }" | tr -d '\r' | awk '{print $1}')"
  case "$state" in
    active|inactive|failed|activating|deactivating|reloading|unknown)
      add observe_recovery_agent "a systemd state word" PASS "dial-recovery-agent.service is '$state'" ;;
    "")
      add observe_recovery_agent "a systemd state word" FAIL "no output; the forced command may not permit this verb" ;;
    *)
      add observe_recovery_agent "a systemd state word" FAIL "not a state word: '${out//$'\n'/ }'" ;;
  esac

  # ---- The bound. Each of these MUST be refused (exit 3) --------------------------
  for probe in "${REFUSAL_PROBES[@]}"; do
    cmd="${probe%%|*}"; why="${probe#*|}"
    rc="$(remote_status_only "$addr" "$cmd")"
    if [[ "$rc" == "3" ]]; then
      add "refuses: $why" "exit 3" PASS "refused"
    else
      add "refuses: $why" "exit 3" FAIL "exit $rc — NOT refused. The channel is not bounded."
    fi
  done

  for secret in "${CREDENTIAL_PROBES[@]}"; do
    rc="$(remote_status_only "$addr" "cat $secret")"
    if [[ "$rc" == "3" ]]; then
      add "refuses: credential read $secret" "exit 3" PASS "refused"
    else
      add "refuses: credential read $secret" "exit 3" FAIL "exit $rc — NOT refused"
    fi
  done

  # ---- R1: the capability this direction exists for -------------------------------
  if [[ "$INCLUDE_REPAIR" == true ]]; then
    rc="$(remote_status_only "$addr" 'systemctl --user restart dial-recovery-agent.service')"
    if [[ "$rc" == "0" ]]; then
      after="$(remote "$addr" 'systemctl --user is-active dial-recovery-agent.service')"
      after="$(printf '%s' "${after//$'\n'/ }" | tr -d '\r' | awk '{print $1}')"
      if [[ "$after" == "active" ]]; then
        add r1_restart_recovery_agent "restarted and active" PASS "recovery agent is active after restart"
      else
        add r1_restart_recovery_agent "restarted and active" FAIL "restart returned 0 but the unit is '$after'"
      fi
    elif [[ "$rc" == "3" ]]; then
      add r1_restart_recovery_agent "exit 0" FAIL "refused — this host's allowlist does not include the recovery agent"
    else
      add r1_restart_recovery_agent "exit 0" FAIL "exit $rc"
    fi
  else
    add r1_restart_recovery_agent "not attempted" SKIP "non-destructive run; use --include-repair to exercise it"
    [[ "$target_verdict" == "FAILED" ]] || target_verdict=PARTIAL
  fi

  results="$(jq -c --arg t "$target" --arg a "$addr" --arg v "$target_verdict" --argjson c "$checks" \
    '. + [{target:$t, address:$a, verdict:$v, checks:$c}]' <<<"$results")"

  case "$target_verdict" in
    FAILED)  overall=FAILED ;;
    PARTIAL) [[ "$overall" == "FAILED" || "$overall" == "UNPROVEN" ]] || overall=PARTIAL ;;
  esac
  say "  -> $target_verdict"
done

[[ "$any_target" == true ]] || exit 2

report="$(jq -n \
  --arg host "$HOST_ID" --arg at "$(date -u +%FT%TZ)" --arg v "$overall" \
  --arg ceiling "$CEILING" --argjson bounded "$BOUNDED" --argjson repair "$INCLUDE_REPAIR" \
  --argjson r "$results" \
  '{schema_version:1, report:"two-way recovery verification",
    source_authority:"docs/orchestration/DIAL_ORACLE_RESILIENT_3_NODE_CLUSTER_REV3.md section 5",
    host:$host, observed_at:$at, recovery_authority_max:$ceiling, bounded_recoverer:$bounded,
    repair_attempted:$repair, verdict:$v, targets:$r}')"

if [[ "$JSON_ONLY" == true ]]; then
  printf '%s\n' "$report"
else
  mkdir -p "$EVIDENCE_DIR" 2>/dev/null || true
  out="$EVIDENCE_DIR/two-way-verification.$(date -u +%Y%m%dT%H%M%SZ).json"
  if printf '%s\n' "$report" > "$out" 2>/dev/null; then
    chmod 600 "$out" 2>/dev/null || true
    say ""
    say "Evidence: $out"
  else
    say ""
    say "(could not write evidence under $EVIDENCE_DIR; report follows on stdout)"
    printf '%s\n' "$report"
  fi
  say ""
  say "VERDICT: $overall"
  case "$overall" in
    PROVEN)   say "Two-way recovery is proven on the live estate, and still bounded at $CEILING." ;;
    PARTIAL)  say "Reachability and the bound are proven; the R1 repair was not attempted." ;;
    UNPROVEN) say "Could not reach a target. Nothing is proven — this is not a pass." ;;
    FAILED)   say "A check FAILED. Read the evidence before using this direction for anything." ;;
  esac
fi

case "$overall" in
  PROVEN|PARTIAL) exit 0 ;;
  UNPROVEN)       exit 4 ;;
  *)              exit 5 ;;
esac
