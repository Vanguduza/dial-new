#!/usr/bin/env bash
# Measure the estate against the Always Free allowance, and refuse to guess.
#
#   ./50-free-tier-check.sh              # live check against OCI
#   ./50-free-tier-check.sh --declared   # check hosts.json only; no OCI, no credentials
#   ./50-free-tier-check.sh --json
#
# WHY THIS EXISTS
#
# Rev 3 section 2.1 asserted the estate fitted inside Always Free, using figures that were
# already wrong when they were written: Oracle halved the Ampere A1 allowance from
# 4 OCPU / 24 GB to 2 OCPU / 12 GB effective 2026-06-15 and began terminating over-limit
# instances on 2026-08-18, with no blog post and no advance notice. The lesson is not
# "update the number". It is that a capacity claim nobody measures is a capacity claim
# nobody notices going false — and the penalty for this one is instance termination,
# which is precisely how oracle-admin was lost.
#
# So the allowance is dated data (deploy/oracle/free-tier-allowance.json) with a staleness
# bound, and this compares it against what actually exists. Stale figures report
# UNVERIFIED, never WITHIN: "we last checked in March" is not the same as "we are inside".

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALLOWANCE="${DIAL_FREE_TIER_ALLOWANCE:-$HERE/../free-tier-allowance.json}"
HOSTS="${DIAL_FABRIC_HOSTS:-$HERE/../resource-fabric/hosts.json}"
MODE=live
JSON_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --declared) MODE=declared; shift ;;
    --json)     JSON_ONLY=true; shift ;;
    *) echo "50-free-tier-check: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

say() { [[ "$JSON_ONLY" == true ]] || echo "$*" >&2; }

[[ -r "$ALLOWANCE" ]] || { echo "50-free-tier-check: no allowance file at $ALLOWANCE" >&2; exit 2; }
[[ -r "$HOSTS" ]]     || { echo "50-free-tier-check: no hosts.json at $HOSTS" >&2; exit 2; }

# ---- is the allowance itself still trustworthy? -------------------------------------
confirmed="$(jq -r '.confirmed_at_utc // ""' "$ALLOWANCE")"
stale_days="$(jq -r '.stale_after_days // 90' "$ALLOWANCE")"
canonical_read="$(jq -r '.provenance.canonical_source_read // false' "$ALLOWANCE")"
age_days=-1
if [[ -n "$confirmed" ]]; then
  now_s=$(date -u +%s)
  conf_s=$(date -u -d "$confirmed" +%s 2>/dev/null || echo 0)
  [[ "$conf_s" -gt 0 ]] && age_days=$(( (now_s - conf_s) / 86400 ))
fi

allowance_state=FRESH
if [[ "$age_days" -lt 0 ]]; then
  allowance_state=UNDATED
elif [[ "$age_days" -gt "$stale_days" ]]; then
  allowance_state=STALE
fi

# ---- what exists ---------------------------------------------------------------------
# Shapes come either from the live control plane or from hosts.json. The live reading is
# the one that matters — hosts.json records what DIAL intends, and the whole failure mode
# here is intent and reality drifting apart without anyone looking.
observed='[]'
source_of_truth="$MODE"

if [[ "$MODE" == live ]]; then
  # shellcheck source=/dev/null
  if source "$HERE/lib.sh" >/dev/null 2>&1 && command -v oci >/dev/null 2>&1; then
    raw="$(oci_ compute instance list --compartment-id "$DIAL_OCI_COMPARTMENT" --all 2>/dev/null)" || raw=""
    if [[ -n "$raw" ]] && jq -e '.data' >/dev/null 2>&1 <<<"$raw"; then
      observed="$(jq -c '[.data[]
        | select(."lifecycle-state" != "TERMINATED" and ."lifecycle-state" != "TERMINATING")
        | {host: ."display-name", shape: .shape,
           ocpu: (."shape-config"."ocpus" // 0), memory_mb: ((."shape-config"."memory-in-gbs" // 0) * 1024)}]' <<<"$raw")"
    else
      say "Could not read live instances from OCI; falling back to the declared inventory."
      source_of_truth="declared (OCI unreadable)"
      MODE=declared
    fi
  else
    say "No usable OCI CLI or credentials here; falling back to the declared inventory."
    source_of_truth="declared (no OCI CLI)"
    MODE=declared
  fi
fi

if [[ "$MODE" == declared ]]; then
  observed="$(jq -c '[.hosts[] | {host: .host_id, shape: .oci_shape, ocpu: .cpu_total, memory_mb: .memory_total_mb}]' "$HOSTS")"
fi

# ---- compare --------------------------------------------------------------------------
verdict="$(jq -n --argjson o "$observed" --slurpfile a "$ALLOWANCE" '
  $a[0] as $al
  | ($o | map(select(.shape == "VM.Standard.E2.1.Micro"))) as $e2
  | ($o | map(select(.shape == "VM.Standard.A1.Flex")))    as $a1
  | ($a1 | map(.ocpu)      | add // 0) as $a1_ocpu
  | ($a1 | map(.memory_mb) | add // 0) as $a1_mem
  | [
      { resource: "VM.Standard.E2.1.Micro instances",
        used: ($e2 | length), allowed: $al.compute."VM.Standard.E2.1.Micro".max_instances },
      { resource: "A1.Flex instances",
        used: ($a1 | length), allowed: $al.compute."VM.Standard.A1.Flex".max_instances },
      { resource: "A1.Flex OCPU (total)",
        used: $a1_ocpu, allowed: $al.compute."VM.Standard.A1.Flex".max_ocpu_total },
      { resource: "A1.Flex memory MB (total)",
        used: $a1_mem, allowed: $al.compute."VM.Standard.A1.Flex".max_memory_mb_total }
    ]
  | map(. + {
      over: (.used > .allowed),
      headroom: (.allowed - .used)
    })')"

exceeds="$(jq -c '[.[] | select(.over)]' <<<"$verdict")"
n_over="$(jq 'length' <<<"$exceeds")"

if [[ "$n_over" -gt 0 ]]; then
  state=EXCEEDS
elif [[ "$allowance_state" != FRESH || "$canonical_read" != true ]]; then
  # Inside the numbers we have, but the numbers are stale or never came from the
  # canonical page. That is UNVERIFIED, and UNVERIFIED never reads as healthy.
  state=UNVERIFIED
else
  state=WITHIN
fi

report="$(jq -n \
  --arg state "$state" --arg src "$source_of_truth" --arg at "$(date -u +%FT%TZ)" \
  --arg astate "$allowance_state" --arg conf "$confirmed" --argjson age "$age_days" \
  --argjson canon "$canonical_read" --argjson rows "$verdict" --argjson obs "$observed" \
  '{schema_version:1, report:"Always Free allowance check",
    source_authority:"deploy/oracle/free-tier-allowance.json",
    observed_at:$at, inventory_source:$src, state:$state,
    allowance:{state:$astate, confirmed_at_utc:$conf, age_days:$age, canonical_source_read:$canon},
    rows:$rows, observed:$obs}')"

if [[ "$JSON_ONLY" == true ]]; then
  printf '%s\n' "$report"
else
  echo "Always Free allowance check — inventory from: $source_of_truth"
  echo "Allowance confirmed $confirmed (${age_days}d ago, $allowance_state, canonical page read: $canonical_read)"
  echo
  jq -r '.rows[] | "  \(if .over then "OVER " else "ok   " end) \(.resource): \(.used) of \(.allowed)"' <<<"$report"
  echo
  echo "STATE: $state"
  case "$state" in
    EXCEEDS)
      echo
      echo "One or more resources exceed the Always Free allowance. Oracle terminates"
      echo "over-limit instances without warning — that is how oracle-admin was lost, and"
      echo "an over-limit host with no boot-volume backup is that loss repeating."
      echo "Resize in the OCI Console, or accept the cost deliberately. Then run:"
      echo "  ./40-backup-policy.sh --apply --include-hermes" ;;
    UNVERIFIED)
      echo
      echo "Inside the figures on record, but those figures are $allowance_state and the"
      echo "canonical Oracle page has not been read from this environment. Re-confirm"
      echo "$(jq -r '.canonical_source' "$ALLOWANCE")"
      echo "and update deploy/oracle/free-tier-allowance.json before resting a decision on this." ;;
    WITHIN)
      echo "Inside the allowance, against figures confirmed ${age_days} days ago." ;;
  esac
fi

case "$state" in
  WITHIN)     exit 0 ;;
  UNVERIFIED) exit 3 ;;
  *)          exit 1 ;;
esac
